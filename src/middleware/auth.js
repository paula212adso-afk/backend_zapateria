const jwt = require('jsonwebtoken');
const { HttpError } = require('../utils');

function authRequired(req, _res, next) {
  const header = req.headers.authorization || '';
  const [type, token] = header.split(' ');
  if (type !== 'Bearer' || !token) return next(new HttpError(401, 'Token requerido'));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.id, rol: payload.rol };
    next();
  } catch {
    next(new HttpError(401, 'Token inválido o expirado'));
  }
}

function soloAdmin(req, _res, next) {
  if (req.user?.rol !== 'admin') return next(new HttpError(403, 'Acceso solo para administradores'));
  next();
}

module.exports = { authRequired, soloAdmin };
