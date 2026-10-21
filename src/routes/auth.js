const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { pool } = require('../db');
const { HttpError, wrap } = require('../utils');
const { authRequired } = require('../middleware/auth');

const registroSchema = z.object({
  nombre: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(150),
  password: z.string().min(8, 'Mínimo 8 caracteres').max(72),
  telefono: z.string().trim().max(30).optional(),
});
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const firmar = (u) =>
  jwt.sign({ id: u.id, rol: u.rol }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });

const publico = (u) => ({ id: u.id, nombre: u.nombre, email: u.email, telefono: u.telefono, rol: u.rol });

// Cliente crea su cuenta (el rol siempre es "cliente")
router.post('/registro', wrap(async (req, res) => {
  const d = registroSchema.parse(req.body);
  const [[existe]] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [d.email]);
  if (existe) throw new HttpError(409, 'Ya existe una cuenta con ese correo');
  const hash = await bcrypt.hash(d.password, 10);
  const [r] = await pool.query(
    'INSERT INTO usuarios (nombre, email, password_hash, telefono, rol) VALUES (?, ?, ?, ?, "cliente")',
    [d.nombre, d.email, hash, d.telefono || null]
  );
  const user = { id: r.insertId, nombre: d.nombre, email: d.email, telefono: d.telefono || null, rol: 'cliente' };
  res.status(201).json({ usuario: publico(user), token: firmar(user) });
}));

async function login(req, res, rolEsperado) {
  const d = loginSchema.parse(req.body);
  const [[u]] = await pool.query('SELECT * FROM usuarios WHERE email = ?', [d.email]);
  const ok = u && (await bcrypt.compare(d.password, u.password_hash));
  if (!ok || (rolEsperado && u.rol !== rolEsperado)) throw new HttpError(401, 'Correo o contraseña incorrectos');
  res.json({ usuario: publico(u), token: firmar(u) });
}

// Cliente inicia sesión
router.post('/login', wrap((req, res) => login(req, res, 'cliente')));
// Admin inicia sesión
router.post('/admin/login', wrap((req, res) => login(req, res, 'admin')));

router.get('/me', authRequired, wrap(async (req, res) => {
  const [[u]] = await pool.query('SELECT id, nombre, email, telefono, rol FROM usuarios WHERE id = ?', [req.user.id]);
  if (!u) throw new HttpError(404, 'Usuario no encontrado');
  res.json(u);
}));

module.exports = router;
