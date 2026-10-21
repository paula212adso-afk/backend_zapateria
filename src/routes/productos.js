const router = require('express').Router();
const { z } = require('zod');
const { pool, withTransaction } = require('../db');
const { HttpError, wrap } = require('../utils');
const { authRequired, soloAdmin } = require('../middleware/auth');

const tallaSchema = z.object({
  talla: z.coerce.number().min(15).max(55),
  stock: z.coerce.number().int().min(0),
});
const productoSchema = z.object({
  nombre: z.string().trim().min(2).max(150),
  descripcion: z.string().trim().max(5000).optional().nullable(),
  marca: z.string().trim().max(80).optional().nullable(),
  precio: z.coerce.number().min(0),
  imagen_url: z.string().trim().url().max(500).optional().nullable(),
  categoria_id: z.coerce.number().int().positive().optional().nullable(),
  tallas: z.array(tallaSchema).optional(),
});
const actualizarSchema = productoSchema.partial();

const listaSchema = z.object({
  q: z.string().trim().optional(),
  categoria_id: z.coerce.number().int().positive().optional(),
  marca: z.string().trim().optional(),
  talla: z.coerce.number().optional(),
  precio_min: z.coerce.number().min(0).optional(),
  precio_max: z.coerce.number().min(0).optional(),
  orden: z.enum(['recientes', 'precio_asc', 'precio_desc', 'nombre']).default('recientes'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(12),
});
const ORDEN = {
  recientes: 'p.created_at DESC, p.id DESC',
  precio_asc: 'p.precio ASC',
  precio_desc: 'p.precio DESC',
  nombre: 'p.nombre ASC',
};

async function adjuntarTallas(productos) {
  if (!productos.length) return productos;
  const ids = productos.map((p) => p.id);
  const [tallas] = await pool.query(
    'SELECT producto_id, talla, stock FROM producto_tallas WHERE producto_id IN (?) ORDER BY talla',
    [ids]
  );
  const mapa = {};
  tallas.forEach((t) => (mapa[t.producto_id] ||= []).push({ talla: t.talla, stock: t.stock }));
  return productos.map((p) => ({ ...p, tallas: mapa[p.id] || [] }));
}

// Cliente visualiza / busca / filtra productos
router.get('/', wrap(async (req, res) => {
  const f = listaSchema.parse(req.query);
  const where = [];
  const params = [];
  if (f.q) {
    where.push('(p.nombre LIKE ? OR p.marca LIKE ? OR p.descripcion LIKE ?)');
    const like = `%${f.q}%`;
    params.push(like, like, like);
  }
  if (f.categoria_id) { where.push('p.categoria_id = ?'); params.push(f.categoria_id); }
  if (f.marca) { where.push('p.marca = ?'); params.push(f.marca); }
  if (f.precio_min !== undefined) { where.push('p.precio >= ?'); params.push(f.precio_min); }
  if (f.precio_max !== undefined) { where.push('p.precio <= ?'); params.push(f.precio_max); }
  if (f.talla !== undefined) {
    where.push('EXISTS (SELECT 1 FROM producto_tallas t WHERE t.producto_id = p.id AND t.talla = ? AND t.stock > 0)');
    params.push(f.talla);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM productos p ${w}`, params);
  const [rows] = await pool.query(
    `SELECT p.id, p.nombre, p.marca, p.precio, p.imagen_url, p.categoria_id, c.nombre AS categoria
       FROM productos p LEFT JOIN categorias c ON c.id = p.categoria_id
       ${w} ORDER BY ${ORDEN[f.orden]} LIMIT ? OFFSET ?`,
    [...params, f.limit, (f.page - 1) * f.limit]
  );
  res.json({
    data: await adjuntarTallas(rows),
    paginacion: { page: f.page, limit: f.limit, total, paginas: Math.ceil(total / f.limit) },
  });
}));

// Cliente ve detalle del producto
router.get('/:id(\\d+)', wrap(async (req, res) => {
  const [[p]] = await pool.query(
    `SELECT p.*, c.nombre AS categoria
       FROM productos p LEFT JOIN categorias c ON c.id = p.categoria_id WHERE p.id = ?`,
    [req.params.id]
  );
  if (!p) throw new HttpError(404, 'Producto no encontrado');
  res.json((await adjuntarTallas([p]))[0]);
}));

async function guardarTallas(conn, productoId, tallas) {
  for (const t of tallas) {
    await conn.query(
      `INSERT INTO producto_tallas (producto_id, talla, stock) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE stock = VALUES(stock)`,
      [productoId, t.talla, t.stock]
    );
  }
}

async function obtener(id) {
  const [[p]] = await pool.query('SELECT * FROM productos WHERE id = ?', [id]);
  return (await adjuntarTallas([p]))[0];
}

// Admin registra productos
router.post('/', authRequired, soloAdmin, wrap(async (req, res) => {
  const d = productoSchema.parse(req.body);
  const id = await withTransaction(async (conn) => {
    const [r] = await conn.query(
      `INSERT INTO productos (categoria_id, nombre, descripcion, marca, precio, imagen_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [d.categoria_id || null, d.nombre, d.descripcion || null, d.marca || null, d.precio, d.imagen_url || null]
    );
    if (d.tallas?.length) await guardarTallas(conn, r.insertId, d.tallas);
    return r.insertId;
  });
  res.status(201).json(await obtener(id));
}));

// Admin modifica productos (campos parciales; las tallas enviadas se crean o actualizan su stock)
router.put('/:id(\\d+)', authRequired, soloAdmin, wrap(async (req, res) => {
  const d = actualizarSchema.parse(req.body);
  const { tallas, ...campos } = d;
  await withTransaction(async (conn) => {
    const [[existe]] = await conn.query('SELECT id FROM productos WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!existe) throw new HttpError(404, 'Producto no encontrado');
    const keys = Object.keys(campos);
    if (keys.length) {
      await conn.query(
        `UPDATE productos SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
        [...keys.map((k) => campos[k] ?? null), req.params.id]
      );
    }
    if (tallas?.length) await guardarTallas(conn, req.params.id, tallas);
  });
  res.json(await obtener(req.params.id));
}));

// Admin elimina una talla de un producto
router.delete('/:id(\\d+)/tallas/:talla', authRequired, soloAdmin, wrap(async (req, res) => {
  const [r] = await pool.query('DELETE FROM producto_tallas WHERE producto_id = ? AND talla = ?', [req.params.id, req.params.talla]);
  if (!r.affectedRows) throw new HttpError(404, 'Talla no encontrada');
  res.status(204).end();
}));

// Admin elimina productos (el historial de pedidos conserva nombre y precio)
router.delete('/:id(\\d+)', authRequired, soloAdmin, wrap(async (req, res) => {
  const [r] = await pool.query('DELETE FROM productos WHERE id = ?', [req.params.id]);
  if (!r.affectedRows) throw new HttpError(404, 'Producto no encontrado');
  res.status(204).end();
}));

module.exports = router;
