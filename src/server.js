const app = require('./app');
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API tienda de zapatos escuchando en http://localhost:${port}`));
