// ==================== AUTENTICACIÓN ====================
// Sesiones guardadas en SQLite (tabla `sesiones`) en vez de memoria, para que
// sobrevivan reinicios/despliegues si la BD está en un volumen persistente.
// bcryptjs es JS puro: no requiere compilación nativa, ideal para hosting
// compartido o VPS económicos.

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getDB } = require('./database');

const COOKIE_NAME = 'bs_session';
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7; // 7 días

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verificarPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function crearSesion(usuarioId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expira = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  getDB().prepare('INSERT INTO sesiones (token, usuario_id, expira) VALUES (?, ?, ?)').run(token, usuarioId, expira);
  return token;
}

function obtenerSesion(token) {
  if (!token) return null;
  const db = getDB();
  const row = db.prepare(`
    SELECT s.token, s.usuario_id, s.expira, u.username, u.nombre, u.telefono
    FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.token = ?
  `).get(token);
  if (!row) return null;
  if (new Date(row.expira).getTime() < Date.now()) {
    eliminarSesion(token);
    return null;
  }
  return row;
}

function eliminarSesion(token) {
  if (!token) return;
  getDB().prepare('DELETE FROM sesiones WHERE token = ?').run(token);
}

// Limpieza periódica de sesiones vencidas (cada hora)
function limpiarSesionesVencidas() {
  getDB().prepare('DELETE FROM sesiones WHERE expira < ?').run(new Date().toISOString());
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DURATION_MS,
    path: '/'
  };
}

// Middleware: exige sesión válida. Si es petición de página, redirige a login.
function requireAuth(req, res, next) {
  const token = req.cookies ? req.cookies[COOKIE_NAME] : null;
  const sesion = obtenerSesion(token);
  if (!sesion) {
    if (req.path.endsWith('.html') || req.headers.accept?.includes('text/html')) {
      return res.redirect('/login.html');
    }
    return res.status(401).json({ error: 'Debes iniciar sesión' });
  }
  req.usuario = {
    id: sesion.usuario_id,
    username: sesion.username,
    nombre: sesion.nombre,
    telefono: sesion.telefono
  };
  next();
}

// Middleware opcional: si hay sesión la adjunta, si no continúa igual.
function attachUserIfPresent(req, res, next) {
  const token = req.cookies ? req.cookies[COOKIE_NAME] : null;
  const sesion = obtenerSesion(token);
  if (sesion) {
    req.usuario = { id: sesion.usuario_id, username: sesion.username, nombre: sesion.nombre, telefono: sesion.telefono };
  }
  next();
}

module.exports = {
  COOKIE_NAME,
  hashPassword,
  verificarPassword,
  crearSesion,
  obtenerSesion,
  eliminarSesion,
  limpiarSesionesVencidas,
  cookieOptions,
  requireAuth,
  attachUserIfPresent
};
