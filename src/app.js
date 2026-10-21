require('dotenv').config();
require('./zod-es');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { notFound, errorHandler } = require('./middleware/error');
const pedidos = require('./routes/pedidos');

if (!process.env.JWT_SECRET) {
  console.error('Falta JWT_SECRET en las variables de entorno (.env)');
  process.exit(1);
}

// CORS_ORIGIN admite varias URLs separadas por coma (sin "/" final). Ej: https://mi-tienda.vercel.app,http://localhost:5173
const origenes = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const app = express();
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: (origin, cb) => {
      // Sin cabecera Origin (curl, health checks, apps móviles) o lista vacía en desarrollo → permitir
      if (!origin || origenes.length === 0 || origenes.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  })
);
app.use(express.json({ limit: '1mb' }));

app.get('/', (_req, res) => res.json({ servicio: 'API Tienda de Zapatos', estado: 'ok' }));
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/categorias', require('./routes/categorias'));
app.use('/api/productos', require('./routes/productos'));
app.use('/api/carrito', require('./routes/carrito'));
app.use('/api/pedidos', pedidos.cliente);
app.use('/api/admin/pedidos', pedidos.admin);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
