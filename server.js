const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { initDB, getDB } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Inicializar base de datos
initDB();

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

// ==================== API REST ====================

// Contactos
app.get('/api/contactos', (req, res) => {
  const db = getDB();
  const contacts = db.prepare('SELECT * FROM contactos WHERE usuario_id = 1').all();
  res.json(contacts);
});

app.post('/api/contactos', (req, res) => {
  const { nombre, telefono, relacion } = req.body;
  if (!nombre || !telefono || !relacion) {
    return res.status(400).json({ error: 'Faltan campos' });
  }
  const db = getDB();
  const stmt = db.prepare('INSERT INTO contactos (usuario_id, nombre, telefono, relacion) VALUES (1, ?, ?, ?)');
  const info = stmt.run(nombre, telefono, relacion);
  res.json({ id: info.lastInsertRowid, usuario_id: 1, nombre, telefono, relacion });
});

// Alertas silenciosas
app.post('/api/alertas/silenciosa', (req, res) => {
  const { lat, lng } = req.body;
  const db = getDB();
  const mensaje = 'Alerta silenciosa activada desde ubicación';
  const stmt = db.prepare('INSERT INTO alertas_silenciosas (usuario_id, lat, lng, mensaje) VALUES (1, ?, ?, ?)');
  const info = stmt.run(lat, lng, mensaje);
  const alerta = {
    id: info.lastInsertRowid,
    usuario_id: 1,
    lat,
    lng,
    mensaje,
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

// Incidentes
app.post('/api/incidentes', (req, res) => {
  const { categoria, lat, lng, descripcion } = req.body;
  if (!categoria || !lat || !lng) {
    return res.status(400).json({ error: 'Categoría y ubicación requeridos' });
  }
  const db = getDB();
  const stmt = db.prepare('INSERT INTO incidentes (categoria, lat, lng, descripcion) VALUES (?, ?, ?, ?)');
  const info = stmt.run(categoria, lat, lng, descripcion);
  const incidente = {
    id: info.lastInsertRowid,
    categoria,
    lat,
    lng,
    descripcion,
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

// Recursos
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
