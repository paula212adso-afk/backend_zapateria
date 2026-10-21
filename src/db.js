const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'bdtienda_zapatos',
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
  // Muchos MySQL en la nube exigen SSL: DB_SSL=true
  ...(process.env.DB_SSL === 'true' && { ssl: { rejectUnauthorized: false } }),
});

// Ejecuta `fn(conn)` dentro de una transacción (commit si todo sale bien, rollback si falla)
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, withTransaction };
