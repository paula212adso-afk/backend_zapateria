# Tienda de Zapatos · API

API REST con **Node.js + Express + MySQL 8.0+**. Autenticación con JWT y contraseñas cifradas con bcrypt.
Se usa junto con el repositorio **tienda-zapatos-frontend**.

## Ejecutarla en tu computador

Requisitos: Node.js 18+ y MySQL 8.0.16 o superior (las restricciones `CHECK` solo se aplican desde esa versión).

1. **Crear la base y las tablas** (una de las dos opciones):
   - Opción A, todo en uno: `mysql -u root -p < database/schema.sql` (crea la base `bdtienda_zapatos`).
   - Opción B, con una base vacía ya creada (así se hace en la nube): usa `npm run db:init` (paso 3).
2. Copia las variables de entorno y complétalas:
   ```bash
   cp .env.example .env      # en Windows: copy .env.example .env
   ```
   Cambia `DB_PASSWORD` y `JWT_SECRET` (genera uno con `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`).
3. Instala y carga datos:
   ```bash
   npm install
   npm run db:init     # crea/verifica las tablas en la base indicada por DB_NAME (se puede repetir sin problema)
   npm run seed        # crea el admin y datos de ejemplo
   npm start           # http://localhost:3000/api/health
   ```

## Variables de entorno (`.env`)

| Variable | Descripción |
|---|---|
| `PORT` | Puerto (en Render/Railway lo asigna la plataforma) |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Conexión a MySQL |
| `DB_SSL` | `true` si tu MySQL en la nube exige SSL |
| `JWT_SECRET` | Clave para firmar los tokens. **Obligatoria y secreta** |
| `JWT_EXPIRES_IN` | Duración de la sesión (por defecto `8h`) |
| `CORS_ORIGIN` | URL(s) del frontend, **sin `/` al final**, separadas por coma. Ej: `https://tu-tienda.vercel.app,http://localhost:5173` |
| `ADMIN_NOMBRE`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Datos del admin que crea `npm run seed` |
| `SEED_EJEMPLOS` | `false` para no crear categorías/productos de ejemplo |

> `.env` está en `.gitignore`: **no se sube al repositorio**. Solo se sube `.env.example` (sin secretos).

## Cómo se conecta con el frontend

1. El frontend llama a esta API usando su variable `VITE_API_URL`.
2. El navegador solo permite esas llamadas si la API lo autoriza: por eso `CORS_ORIGIN` debe tener la URL del frontend.
3. Si el frontend muestra "No hay conexión con el servidor", revisa: que la API esté encendida, que `VITE_API_URL` sea correcta (sin `/` final) y que `CORS_ORIGIN` incluya la URL exacta del frontend (con `https://`).

## Subir a GitHub

```bash
git init
git add .
git commit -m "API tienda de zapatos"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/tienda-zapatos-api.git
git push -u origin main
```

Antes de subir, comprueba con `git status` que **no aparezca `.env`**. Si subes arrastrando archivos en la web de GitHub, **no subas** `node_modules` ni `.env` (la web no respeta `.gitignore`).

## Desplegar (orden recomendado)

### 1. Base de datos MySQL en la nube
Crea una instancia MySQL en el proveedor que prefieras (por ejemplo Railway o Aiven; revisa sus planes y límites vigentes) y anota **host, puerto, usuario, contraseña y nombre de la base**. Si el proveedor exige SSL, usarás `DB_SSL=true`.

### 2. Crear las tablas y el admin en esa base (desde tu computador)
Pon los datos de la nube en tu `.env` local y ejecuta:
```bash
npm install
npm run db:init
npm run seed        # antes, en .env: ADMIN_PASSWORD propia y SEED_EJEMPLOS=false si no quieres datos de ejemplo
```
Cambia `ADMIN_PASSWORD`: la de ejemplo es pública.

### 3. Publicar la API en Render
1. https://render.com → **New → Web Service** → conecta el repositorio de la API (o usa **Blueprint**, ya incluye `render.yaml`).
2. Build Command: `npm install` · Start Command: `npm start` · Health check: `/api/health`.
3. En **Environment** agrega: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN` (por ahora puede ser `http://localhost:5173`).
4. Despliega y prueba `https://TU-API.onrender.com/api/health` → debe responder `{"ok":true}`.

> En algunos planes gratuitos el servicio se "duerme" por inactividad y la primera petición tarda unos segundos.

### 4. Publicar el frontend
Sigue la guía del repositorio del frontend (Vercel) usando como `VITE_API_URL` la URL de Render del paso anterior.

### 5. Autorizar al frontend (CORS)
En Render → Environment → `CORS_ORIGIN` = URL del frontend (ej. `https://tu-tienda.vercel.app`, sin `/` final) → guardar (se reinicia solo). Con eso queda todo conectado.

## Endpoints

| Requisito | Método y ruta | Acceso |
|---|---|---|
| Cliente crea su cuenta | `POST /api/auth/registro` | público |
| Cliente inicia sesión | `POST /api/auth/login` | público |
| Admin inicia sesión | `POST /api/auth/admin/login` | público |
| Perfil | `GET /api/auth/me` | autenticado |
| Cliente visualiza / busca / filtra productos | `GET /api/productos?q=&categoria_id=&marca=&talla=&precio_min=&precio_max=&orden=&page=&limit=` | público |
| Cliente ve detalle del producto | `GET /api/productos/:id` | público |
| Cliente consulta categorías | `GET /api/categorias` | público |
| Admin registra / modifica / elimina productos | `POST /api/productos`, `PUT` y `DELETE /api/productos/:id` | admin |
| (apoyo) Admin elimina una talla | `DELETE /api/productos/:id/tallas/:talla` | admin |
| (apoyo) Admin gestiona categorías | `POST/PUT/DELETE /api/categorias[/:id]` | admin |
| Cliente ve su carrito | `GET /api/carrito` | cliente |
| Cliente agrega producto al carrito | `POST /api/carrito/items` | cliente |
| Cliente gestiona cantidades | `PATCH /api/carrito/items/:id` | cliente |
| Cliente elimina ítem / vacía el carrito | `DELETE /api/carrito/items/:id`, `DELETE /api/carrito` | cliente |
| Cliente realiza pedido | `POST /api/pedidos` | cliente |
| Cliente consulta sus pedidos / detalle | `GET /api/pedidos`, `GET /api/pedidos/:id` | cliente (solo los suyos) |
| Admin ve todos los pedidos / detalle | `GET /api/admin/pedidos[?estado=&page=&limit=]`, `GET /api/admin/pedidos/:id` | admin |
| Admin actualiza estado de pedido | `PATCH /api/admin/pedidos/:id/estado` | admin |

Las rutas protegidas usan la cabecera `Authorization: Bearer <token>`.

## Reglas de negocio

- El registro público siempre crea usuarios con rol `cliente`; el admin se crea con `npm run seed`.
- Las **tallas** llevan su propio stock; el carrito y los pedidos trabajan por producto + talla.
- Al hacer el pedido (transacción): se valida stock, se crea el pedido con el detalle (nombre y precio de ese momento), se descuenta el stock y se vacía el carrito.
- Estados: `pendiente → pagado → enviado → entregado`; se puede cancelar desde `pendiente` o `pagado` (el stock se devuelve). Otras transiciones responden 409.
- Eliminar un producto no borra el historial: los pedidos conservan nombre, talla y precio.

## Estructura

```
database/schema.sql      Tablas: usuarios, categorias, productos, producto_tallas,
                         carrito_items, pedidos, pedido_items
scripts/init-db.js       Crea las tablas en cualquier MySQL (local o nube)
scripts/seed.js          Admin + datos de ejemplo
src/app.js, server.js    Express (CORS, seguridad) y arranque
src/db.js                Pool de conexiones y transacciones
src/middleware/          auth (JWT / rol admin) y manejo de errores
src/routes/              auth, categorias, productos, carrito, pedidos
render.yaml              Blueprint opcional para Render
```
