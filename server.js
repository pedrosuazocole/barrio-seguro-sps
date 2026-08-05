const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const { initDB, getDB } = require('./database');
const auth = require('./auth');
const { direccionInversa } = require('./geocoding');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1); // Railway/proxy reverso: necesario para cookies "secure"

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());

// Inicializar base de datos
initDB();
setInterval(() => auth.limpiarSesionesVencidas(), 1000 * 60 * 60);

// Almacenar conexiones SSE
let clients = [];

function sendEventToAll(event, data) {
  clients.forEach(client => {
    client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  });
}

// SSE endpoint
app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  res.write(':ok\n\n');
  clients.push(res);

  req.on('close', () => {
    clients = clients.filter(client => client !== res);
  });
});

// ==================== PÁGINAS PROTEGIDAS ====================
// Deben ir ANTES de express.static para poder interceptar la petición.

app.get(['/denuncia', '/denuncia.html'], auth.requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'denuncia.html'));
});

app.get(['/monitor', '/monitor.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'monitor.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

// ==================== AUTENTICACIÓN ====================

app.post('/api/auth/registro', (req, res) => {
  const { nombre, telefono, username, password } = req.body;
  if (!nombre || !username || !password) {
    return res.status(400).json({ error: 'Nombre, usuario y contraseña son obligatorios' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }
  const db = getDB();
  const existe = db.prepare('SELECT id FROM usuarios WHERE username = ?').get(username);
  if (existe) {
    return res.status(409).json({ error: 'Ese nombre de usuario ya existe' });
  }
  const hash = auth.hashPassword(password);
  const info = db.prepare('INSERT INTO usuarios (username, password_hash, nombre, telefono) VALUES (?, ?, ?, ?)')
    .run(username, hash, nombre, telefono || null);
  const token = auth.crearSesion(info.lastInsertRowid);
  res.cookie(auth.COOKIE_NAME, token, auth.cookieOptions());
  res.json({ ok: true, nombre, username });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
  }
  const db = getDB();
  const usuario = db.prepare('SELECT * FROM usuarios WHERE username = ?').get(username);
  if (!usuario || !auth.verificarPassword(password, usuario.password_hash)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  const token = auth.crearSesion(usuario.id);
  res.cookie(auth.COOKIE_NAME, token, auth.cookieOptions());
  res.json({ ok: true, nombre: usuario.nombre, username: usuario.username });
});

app.post('/api/auth/logout', (req, res) => {
  auth.eliminarSesion(req.cookies[auth.COOKIE_NAME]);
  res.clearCookie(auth.COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/auth/me', auth.attachUserIfPresent, (req, res) => {
  if (!req.usuario) return res.status(401).json({ error: 'No autenticado' });
  res.json({ nombre: req.usuario.nombre, username: req.usuario.username, telefono: req.usuario.telefono });
});

// ==================== GEOCODIFICACIÓN ====================
// Usado por el módulo de denuncia para mostrarle al vecino la dirección o
// nombre del lugar mientras selecciona la ubicación, antes de enviar el reporte.
app.get('/api/geocoding/reverse', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ error: 'Coordenadas inválidas' });
  }
  const resultado = await direccionInversa(lat, lng);
  if (!resultado) {
    return res.status(502).json({ error: 'No se pudo obtener la dirección en este momento' });
  }
  res.json(resultado);
});

// ==================== API REST ====================

// Contactos (Círculo de Confianza) — propios del vecino autenticado
app.get('/api/contactos', auth.requireAuth, (req, res) => {
  const db = getDB();
  const contacts = db.prepare('SELECT * FROM contactos WHERE usuario_id = ?').all(req.usuario.id);
  res.json(contacts);
});

app.post('/api/contactos', auth.requireAuth, (req, res) => {
  const { nombre, telefono, relacion } = req.body;
  if (!nombre || !telefono || !relacion) {
    return res.status(400).json({ error: 'Faltan campos' });
  }
  const db = getDB();
  const stmt = db.prepare('INSERT INTO contactos (usuario_id, nombre, telefono, relacion) VALUES (?, ?, ?, ?)');
  const info = stmt.run(req.usuario.id, nombre, telefono, relacion);
  res.json({ id: info.lastInsertRowid, usuario_id: req.usuario.id, nombre, telefono, relacion });
});

// Alertas silenciosas — requiere sesión (se envían desde el módulo de denuncia)
app.post('/api/alertas/silenciosa', auth.requireAuth, async (req, res) => {
  const { lat, lng } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'Ubicación inválida' });
  }
  const geo = await direccionInversa(lat, lng);
  const direccion = geo ? (geo.nombre || geo.direccion) : null;

  const db = getDB();
  const mensaje = `Alerta silenciosa de ${req.usuario.nombre}`;
  const stmt = db.prepare('INSERT INTO alertas_silenciosas (usuario_id, lat, lng, mensaje, direccion) VALUES (?, ?, ?, ?, ?)');
  const info = stmt.run(req.usuario.id, lat, lng, mensaje, direccion);
  const alerta = {
    id: info.lastInsertRowid,
    usuario_id: req.usuario.id,
    lat,
    lng,
    mensaje,
    direccion,
    timestamp: new Date().toISOString(),
    activa: 1
  };
  sendEventToAll('alerta_activada', alerta);
  res.json(alerta);
});

app.get('/api/alertas/activas', (req, res) => {
  const db = getDB();
  const alertas = db.prepare('SELECT * FROM alertas_silenciosas WHERE activa = 1 ORDER BY timestamp DESC LIMIT 10').all();
  res.json(alertas);
});

// Incidentes (Denuncias) — crear requiere sesión; leer es público (para el monitor)
app.post('/api/incidentes', auth.requireAuth, async (req, res) => {
  const { categoria, lat, lng, descripcion } = req.body;
  if (!categoria || typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'Categoría y ubicación son obligatorias' });
  }
  const CATEGORIAS_VALIDAS = ['Robo/Asalto', 'Vehículo Sospechoso', 'Violencia Doméstica'];
  if (!CATEGORIAS_VALIDAS.includes(categoria)) {
    return res.status(400).json({ error: 'Categoría no válida' });
  }

  // Se resuelve la dirección aquí (servidor), no se confía en texto enviado por el
  // cliente, para que quede consistente sin importar si el navegador pudo geocodificar.
  const geo = await direccionInversa(lat, lng);
  const direccion = geo ? (geo.nombre || geo.direccion) : null;

  const db = getDB();
  const stmt = db.prepare('INSERT INTO incidentes (categoria, lat, lng, descripcion, usuario_id, direccion) VALUES (?, ?, ?, ?, ?, ?)');
  const info = stmt.run(categoria, lat, lng, descripcion || '', req.usuario.id, direccion);
  const incidente = {
    id: info.lastInsertRowid,
    categoria,
    lat,
    lng,
    descripcion: descripcion || '',
    direccion,
    timestamp: new Date().toISOString()
  };
  sendEventToAll('nuevo_incidente', incidente);
  res.json(incidente);
});

app.get('/api/incidentes', (req, res) => {
  const { categoria } = req.query;
  const db = getDB();
  let incidentes;
  if (categoria) {
    incidentes = db.prepare('SELECT * FROM incidentes WHERE categoria = ? ORDER BY timestamp DESC').all(categoria);
  } else {
    incidentes = db.prepare('SELECT * FROM incidentes ORDER BY timestamp DESC').all();
  }
  res.json(incidentes);
});

// Recursos (directorio de policía, hospitales, refugios)
app.post('/api/recursos', (req, res) => {
  const { nombre, tipo, lat, lng, direccion, telefono, horario } = req.body;
  if (!nombre || !tipo || !lat || !lng) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  const db = getDB();
  const stmt = db.prepare('INSERT INTO recursos (nombre, tipo, lat, lng, direccion, telefono, horario) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const info = stmt.run(nombre, tipo, lat, lng, direccion, telefono, horario);
  const recurso = { id: info.lastInsertRowid, nombre, tipo, lat, lng, direccion, telefono, horario };
  sendEventToAll('recurso_actualizado', recurso);
  res.json(recurso);
});

app.get('/api/recursos', (req, res) => {
  const db = getDB();
  const recursos = db.prepare('SELECT * FROM recursos').all();
  res.json(recursos);
});

// Servir la SPA para cualquier otra ruta
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor Barrio Seguro SPS corriendo en http://localhost:${PORT}`);
});
