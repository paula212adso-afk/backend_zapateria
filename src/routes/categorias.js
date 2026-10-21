const router = require('express').Router();
const { z } = require('zod');
const { pool } = require('../db');
const { HttpError, wrap } = require('../utils');
const { authRequired, soloAdmin } = require('../middleware/auth');

const schema = z.object({
  nombre: z.string().trim().min(2).max(80),
  descripcion: z.string().trim().max(255).optional().nullable(),
});

// Cliente consulta categorías
router.get('/', wrap(async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT c.id, c.nombre, c.descripcion, COUNT(p.id) AS total_productos
       FROM categorias c LEFT JOIN productos p ON p.categoria_id = c.id
      GROUP BY c.id ORDER BY c.nombre`
  );
  res.json(rows);
}));

// Administración de categorías (apoyo para registrar productos)
router.post('/', authRequired, soloAdmin, wrap(async (req, res) => {
  const d = schema.parse(req.body);
  const [r] = await pool.query('INSERT INTO categorias (nombre, descripcion) VALUES (?, ?)', [d.nombre, d.descripcion || null]);
  res.status(201).json({ id: r.insertId, ...d });
}));

router.put('/:id', authRequired, soloAdmin, wrap(async (req, res) => {
  const d = schema.parse(req.body);
  const [r] = await pool.query('UPDATE categorias SET nombre = ?, descripcion = ? WHERE id = ?', [d.nombre, d.descripcion || null, req.params.id]);
  if (!r.affectedRows) throw new HttpError(404, 'Categoría no encontrada');
  res.json({ id: Number(req.params.id), ...d });
}));

router.delete('/:id', authRequired, soloAdmin, wrap(async (req, res) => {
  const [r] = await pool.query('DELETE FROM categorias WHERE id = ?', [req.params.id]);
  if (!r.affectedRows) throw new HttpError(404, 'Categoría no encontrada');
  res.status(204).end();
}));

module.exports = router;
