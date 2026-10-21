class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// Envuelve handlers async para que los errores lleguen al middleware de errores
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const round2 = (n) => Math.round(n * 100) / 100;

module.exports = { HttpError, wrap, round2 };
