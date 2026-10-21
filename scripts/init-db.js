// Crea las tablas en la base indicada por DB_NAME (sirve para MySQL local o en la nube).
// Uso: npm run db:init
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  const sql = fs
    .readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8')
    .replace(/^\s*CREATE DATABASE[\s\S]*?;/im, '') // en la nube la base ya existe
    .replace(/^\s*USE\s+\w+;/im, '');

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'bdtienda_zapatos',
    multipleStatements: true,
    ...(process.env.DB_SSL === 'true' && { ssl: { rejectUnauthorized: false } }),
  });
  await conn.query(sql);
  await conn.end();
  console.log(`Tablas creadas/verificadas en la base "${process.env.DB_NAME || 'bdtienda_zapatos'}".`);
})().catch((e) => { console.error('No se pudo crear el esquema:', e.message); process.exit(1); });
