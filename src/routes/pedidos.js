const express = require('express');
const { z } = require('zod');
const { pool, withTransaction } = require('../db');
const { HttpError, wrap, round2 } = require('../utils');
const { authRequired, soloAdmin } = require('../middleware/auth');

const ESTADOS = ['pendiente', 'pagado', 'enviado', 'entregado', 'cancelado'];
// Flujo permitido de estados
const TRANSICIONES = {
  pendiente: ['pagado', 'cancelado'],
  pagado: ['enviado', 'cancelado'],
  enviado: ['entregado'],
  entregado: [],
  cancelado: [],
};

const crearSchema = z.object({
  direccion_envio: z.string().trim().min(5).max(255),
  telefono: z.string().trim().min(5).max(30),
  notas: z.string().trim().max(500).optional().nullable(),
});
const estadoSchema = z.object({ estado: z.enum(ESTADOS) });
const paginacionSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  estado: z.enum(ESTADOS).optional(),
});

async function detallePedido(id, usuarioId) {
  const [[pedido]] = await pool.query(
    `SELECT p.*, u.nombre AS cliente_nombre, u.email AS cliente_email
       FROM pedidos p JOIN usuarios u ON u.id = p.usuario_id
      WHERE p.id = ? ${usuarioId ? 'AND p.usuario_id = ?' : ''}`,
    usuarioId ? [id, usuarioId] : [id]
  );
  if (!pedido) throw new HttpError(404, 'Pedido no encontrado');
  const [items] = await pool.query(
    `SELECT id, producto_id, nombre_producto, talla, precio_unitario, cantidad, subtotal
       FROM pedido_items WHERE pedido_id = ? ORDER BY id`,
    [id]
  );
  return { ...pedido, items };
}

async function listar(req, res, usuarioId) {
  const f = paginacionSchema.parse(req.query);
  const where = [];
  const params = [];
  if (usuarioId) { where.push('p.usuario_id = ?'); params.push(usuarioId); }
  if (f.estado) { where.push('p.estado = ?'); params.push(f.estado); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM pedidos p ${w}`, params);
  const [rows] = await pool.query(
    `SELECT p.id, p.estado, p.total, p.created_at, p.usuario_id, u.nombre AS cliente_nombre,
            (SELECT COALESCE(SUM(cantidad), 0) FROM pedido_items WHERE pedido_id = p.id) AS unidades
       FROM pedidos p JOIN usuarios u ON u.id = p.usuario_id
       ${w} ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?`,
    [...params, f.limit, (f.page - 1) * f.limit]
  );
  res.json({ data: rows, paginacion: { page: f.page, limit: f.limit, total, paginas: Math.ceil(total / f.limit) } });
}

/* ------------------------- Rutas del cliente ------------------------- */
const cliente = express.Router();
cliente.use(authRequired);

// Cliente realiza pedido (convierte el carrito en pedido, descuenta stock y vacía el carrito)
cliente.post('/', wrap(async (req, res) => {
  const d = crearSchema.parse(req.body);
  const pedidoId = await withTransaction(async (conn) => {
    const [items] = await conn.query(
      `SELECT ci.cantidad, pt.id AS pt_id, pt.talla, pt.stock, p.id AS producto_id, p.nombre, p.precio
         FROM carrito_items ci
         JOIN producto_tallas pt ON pt.id = ci.producto_talla_id
         JOIN productos p ON p.id = pt.producto_id
        WHERE ci.usuario_id = ? ORDER BY ci.id FOR UPDATE`,
      [req.user.id]
    );
    if (!items.length) throw new HttpError(400, 'Tu carrito está vacío');

    const sinStock = items.filter((i) => i.cantidad > i.stock);
    if (sinStock.length) {
      throw new HttpError(409, 'Algunos productos no tienen stock suficiente', sinStock.map((i) => ({
        producto: i.nombre, talla: i.talla, solicitado: i.cantidad, disponible: i.stock,
      })));
    }

    const total = round2(items.reduce((s, i) => s + i.precio * i.cantidad, 0));
    const [r] = await conn.query(
      'INSERT INTO pedidos (usuario_id, total, direccion_envio, telefono, notas) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, total, d.direccion_envio, d.telefono, d.notas || null]
    );
    for (const i of items) {
      await conn.query(
        `INSERT INTO pedido_items (pedido_id, producto_id, producto_talla_id, nombre_producto, talla, precio_unitario, cantidad, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [r.insertId, i.producto_id, i.pt_id, i.nombre, i.talla, i.precio, i.cantidad, round2(i.precio * i.cantidad)]
      );
      await conn.query('UPDATE producto_tallas SET stock = stock - ? WHERE id = ?', [i.cantidad, i.pt_id]);
    }
    await conn.query('DELETE FROM carrito_items WHERE usuario_id = ?', [req.user.id]);
    return r.insertId;
  });
  res.status(201).json(await detallePedido(pedidoId, req.user.id));
}));

// Cliente consulta sus pedidos
cliente.get('/', wrap((req, res) => listar(req, res, req.user.id)));

// Cliente ve detalle de un pedido (solo los suyos)
cliente.get('/:id(\\d+)', wrap(async (req, res) => res.json(await detallePedido(req.params.id, req.user.id))));

/* ------------------------- Rutas del admin ------------------------- */
const admin = express.Router();
admin.use(authRequired, soloAdmin);

// Admin ve todos los pedidos (filtro opcional ?estado=pendiente)
admin.get('/', wrap((req, res) => listar(req, res, null)));

admin.get('/:id(\\d+)', wrap(async (req, res) => res.json(await detallePedido(req.params.id, null))));

// Admin actualiza estado de pedido (si se cancela, el stock se devuelve)
admin.patch('/:id(\\d+)/estado', wrap(async (req, res) => {
  const { estado } = estadoSchema.parse(req.body);
  await withTransaction(async (conn) => {
    const [[pedido]] = await conn.query('SELECT id, estado FROM pedidos WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!pedido) throw new HttpError(404, 'Pedido no encontrado');
    if (!TRANSICIONES[pedido.estado].includes(estado)) {
      throw new HttpError(409, `No se puede pasar de "${pedido.estado}" a "${estado}"`, {
        permitidos: TRANSICIONES[pedido.estado],
      });
    }
    if (estado === 'cancelado') {
      const [items] = await conn.query(
        'SELECT producto_talla_id, cantidad FROM pedido_items WHERE pedido_id = ? AND producto_talla_id IS NOT NULL',
        [pedido.id]
      );
      for (const i of items) {
        await conn.query('UPDATE producto_tallas SET stock = stock + ? WHERE id = ?', [i.cantidad, i.producto_talla_id]);
      }
    }
    await conn.query('UPDATE pedidos SET estado = ? WHERE id = ?', [estado, pedido.id]);
  });
  res.json(await detallePedido(req.params.id, null));
}));

module.exports = { cliente, admin };
