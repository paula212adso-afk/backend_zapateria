// Crea el usuario admin y datos de ejemplo (categorías y productos). Es seguro ejecutarlo varias veces.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');

(async () => {
  const { ADMIN_NOMBRE = 'Administrador', ADMIN_EMAIL = 'admin@tienda.com', ADMIN_PASSWORD = 'Admin12345' } = process.env;
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await pool.query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, 'admin')
     ON DUPLICATE KEY UPDATE rol = 'admin'`,
    [ADMIN_NOMBRE, ADMIN_EMAIL.toLowerCase(), hash]
  );

  const conEjemplos = process.env.SEED_EJEMPLOS !== 'false';
  for (const [nombre, descripcion] of conEjemplos ? [
    ['Deportivos', 'Tenis para correr y entrenar'],
    ['Casuales', 'Calzado para el día a día'],
    ['Formales', 'Zapatos de vestir'],
    ['Sandalias', 'Calzado abierto para clima cálido'],
  ] : []) {
    await pool.query('INSERT IGNORE INTO categorias (nombre, descripcion) VALUES (?, ?)', [nombre, descripcion]);
  }

  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM productos');
  if (n === 0 && conEjemplos) {
    const [cats] = await pool.query('SELECT id, nombre FROM categorias');
    const cat = Object.fromEntries(cats.map((c) => [c.nombre, c.id]));
    const ejemplos = [
      ['Runner Pro 2', 'Tenis livianos con amortiguación para running.', 'Sprint', 289900, 'Deportivos'],
      ['Urban Classic', 'Tenis casuales de cuero sintético.', 'Urbano', 219900, 'Casuales'],
      ['Oxford Elegance', 'Zapato formal de cuero con suela antideslizante.', 'Gala', 349900, 'Formales'],
      ['Playa Soft', 'Sandalia ergonómica con plantilla acolchada.', 'Sol', 89900, 'Sandalias'],
    ];
    for (const [nombre, descripcion, marca, precio, categoria] of ejemplos) {
      const [r] = await pool.query(
        'INSERT INTO productos (categoria_id, nombre, descripcion, marca, precio) VALUES (?, ?, ?, ?, ?)',
        [cat[categoria], nombre, descripcion, marca, precio]
      );
      for (const talla of [37, 38, 39, 40, 41, 42, 43]) {
        await pool.query('INSERT INTO producto_tallas (producto_id, talla, stock) VALUES (?, ?, ?)', [r.insertId, talla, 10]);
      }
    }
  }
  console.log(`Seed listo. Admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
