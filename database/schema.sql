-- ============================================================
--  Base de datos: Tienda de zapatos (MySQL 8.0+)
-- ============================================================
CREATE DATABASE IF NOT EXISTS bdtienda_zapatos
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE bdtienda_zapatos;

-- Usuarios: clientes y administradores
CREATE TABLE IF NOT EXISTS usuarios (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre         VARCHAR(100) NOT NULL,
  email          VARCHAR(150) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  telefono       VARCHAR(30)  NULL,
  rol            ENUM('cliente','admin') NOT NULL DEFAULT 'cliente',
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS categorias (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre       VARCHAR(80) NOT NULL UNIQUE,
  descripcion  VARCHAR(255) NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS productos (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  categoria_id  INT UNSIGNED NULL,
  nombre        VARCHAR(150) NOT NULL,
  descripcion   TEXT NULL,
  marca         VARCHAR(80) NULL,
  precio        DECIMAL(12,2) NOT NULL CHECK (precio >= 0),
  imagen_url    VARCHAR(500) NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_prod_cat FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL,
  INDEX idx_prod_nombre (nombre),
  INDEX idx_prod_marca (marca),
  INDEX idx_prod_precio (precio)
) ENGINE=InnoDB;

-- Tallas y stock por producto (inventario)
CREATE TABLE IF NOT EXISTS producto_tallas (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  producto_id  INT UNSIGNED NOT NULL,
  talla        DECIMAL(4,1) NOT NULL,
  stock        INT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uq_producto_talla (producto_id, talla),
  CONSTRAINT fk_talla_prod FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Carrito (un ítem = una talla de un producto para un usuario)
CREATE TABLE IF NOT EXISTS carrito_items (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id         INT UNSIGNED NOT NULL,
  producto_talla_id  INT UNSIGNED NOT NULL,
  cantidad           INT UNSIGNED NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_carrito (usuario_id, producto_talla_id),
  CONSTRAINT fk_car_user  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  CONSTRAINT fk_car_talla FOREIGN KEY (producto_talla_id) REFERENCES producto_tallas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pedidos (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id       INT UNSIGNED NOT NULL,
  estado           ENUM('pendiente','pagado','enviado','entregado','cancelado') NOT NULL DEFAULT 'pendiente',
  total            DECIMAL(12,2) NOT NULL,
  direccion_envio  VARCHAR(255) NOT NULL,
  telefono         VARCHAR(30) NOT NULL,
  notas            VARCHAR(500) NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ped_user FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  INDEX idx_ped_estado (estado)
) ENGINE=InnoDB;

-- Detalle del pedido: guarda una "foto" del nombre/precio/talla al momento de la compra
CREATE TABLE IF NOT EXISTS pedido_items (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  pedido_id          INT UNSIGNED NOT NULL,
  producto_id        INT UNSIGNED NULL,
  producto_talla_id  INT UNSIGNED NULL,
  nombre_producto    VARCHAR(150) NOT NULL,
  talla              DECIMAL(4,1) NOT NULL,
  precio_unitario    DECIMAL(12,2) NOT NULL,
  cantidad           INT UNSIGNED NOT NULL,
  subtotal           DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_pi_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
  CONSTRAINT fk_pi_prod   FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE SET NULL,
  CONSTRAINT fk_pi_talla  FOREIGN KEY (producto_talla_id) REFERENCES producto_tallas(id) ON DELETE SET NULL
) ENGINE=InnoDB;
