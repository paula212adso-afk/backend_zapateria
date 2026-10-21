const router = require('express').Router();
const { z } = require('zod');
const { pool } = require('../db');
const { HttpError, wrap, round2 } = require('../utils');
const { authRequired } = require('../middleware/auth');

router.use(authRequired);

const agregarSchema = z.object({
  producto_id: z.coerce.number().int().positive(),
  talla: z.coerce.number(),
  cantidad: z.coerce.number().int().min(1).default(1),
});
const cantidadSchema = z.object({ cantidad: z.coerce.number().int().min(1) });

async function leerCarrito(usuarioId) {
  const [items] = await pool.query(
    `SELECT ci.id, p.id AS producto_id, p.nombre, p.marca, p.imagen_url, p.precio,
            pt.talla, pt.stock AS stock_disponible, ci.cantidad,
            ROUND(p.precio * ci.cantidad, 2) AS subtotal
       FROM carrito_items ci
       JOIN producto_tallas pt ON pt.id = ci.producto_talla_id
       JOIN productos p ON p.id = pt.producto_id
      WHERE ci.usuario_id = ? ORDER BY ci.id`,
    [usuarioId]
  );
  return {
    items,
    cantidad_total: items.reduce((s, i) => s + i.cantidad, 0),
    total: round2(items.reduce((s, i) => s + i.subtotal, 0)),
  };
}

// Cliente ve su carrito
router.get('/', wrap(async (req, res) => res.json(await leerCarrito(req.user.id))));

// Cliente agrega producto al carrito (si ya existe esa talla, suma la cantidad)
router.post('/items', wrap(async (req, res) => {
  const d = agregarSchema.parse(req.body);
  const [[pt]] = await pool.query(
    'SELECT id, stock FROM producto_tallas WHERE producto_id = ? AND talla = ?',
    [d.producto_id, d.talla]
  );
  if (!pt) throw new HttpError(404, 'Producto o talla no encontrados');
  const [[actual]] = await pool.query(
    'SELECT cantidad FROM carrito_items WHERE usuario_id = ? AND producto_talla_id = ?',
    [req.user.id, pt.id]
  );
  const nueva = (actual?.cantidad || 0) + d.cantidad;
  if (nueva > pt.stock) throw new HttpError(409, `Stock insuficiente (disponible: ${pt.stock})`);
  await pool.query(
    `INSERT INTO carrito_items (usuario_id, producto_talla_id, cantidad) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE cantidad = VALUES(cantidad)`,
    [req.user.id, pt.id, nueva]
  );
  res.status(201).json(await leerCarrito(req.user.id));
}));

// Cliente gestiona cantidades
router.patch('/items/:id', wrap(async (req, res) => {
  const { cantidad } = cantidadSchema.parse(req.body);
  const [[item]] = await pool.query(
    `SELECT ci.id, pt.stock FROM carrito_items ci
       JOIN producto_tallas pt ON pt.id = ci.producto_talla_id
      WHERE ci.id = ? AND ci.usuario_id = ?`,
    [req.params.id, req.user.id]
  );
  if (!item) throw new HttpError(404, 'Ítem no encontrado en tu carrito');
  if (cantidad > item.stock) throw new HttpError(409, `Stock insuficiente (disponible: ${item.stock})`);
  await pool.query('UPDATE carrito_items SET cantidad = ? WHERE id = ?', [cantidad, item.id]);
  res.json(await leerCarrito(req.user.id));
}));

// Cliente elimina ítem del carrito
router.delete('/items/:id', wrap(async (req, res) => {
  const [r] = await pool.query('DELETE FROM carrito_items WHERE id = ? AND usuario_id = ?', [req.params.id, req.user.id]);
  if (!r.affectedRows) throw new HttpError(404, 'Ítem no encontrado en tu carrito');
  res.json(await leerCarrito(req.user.id));
}));

// Cliente vacía su carrito
router.delete('/', wrap(async (req, res) => {
  await pool.query('DELETE FROM carrito_items WHERE usuario_id = ?', [req.user.id]);
  res.json(await leerCarrito(req.user.id));
}));

module.exports = router;
