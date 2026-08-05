const Database = require('better-sqlite3');
const path = require('path');

let db;

function getDB() {
  if (!db) {
    const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'barrio_seguro.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    console.log(`Base de datos conectada en: ${dbPath}`);
  }
  return db;
}

function initDB() {
  const db = getDB();

  db.exec(`
    CREATE TABLE IF NOT EXISTS contactos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      nombre TEXT NOT NULL,
      telefono TEXT NOT NULL,
      relacion TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alertas_silenciosas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      mensaje TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      activa INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS incidentes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      categoria TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      descripcion TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS recursos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      tipo TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      direccion TEXT,
      telefono TEXT,
      horario TEXT
    );
  `);

  // Insertar datos demo solo si la tabla contactos está vacía
  const contactCount = db.prepare('SELECT COUNT(*) as count FROM contactos').get().count;
  if (contactCount === 0) {
    db.prepare('INSERT INTO contactos (usuario_id, nombre, telefono, relacion) VALUES (1, ?, ?, ?)').run('Carlos Pérez', '9999-0001', 'Vecino');
    db.prepare('INSERT INTO contactos (usuario_id, nombre, telefono, relacion) VALUES (1, ?, ?, ?)').run('María López', '9999-0002', 'Hermana');
    db.prepare('INSERT INTO contactos (usuario_id, nombre, telefono, relacion) VALUES (1, ?, ?, ?)').run('Don Ramón', '9999-0003', 'Tendero');

    db.prepare('INSERT INTO incidentes (categoria, lat, lng, descripcion) VALUES (?, ?, ?, ?)').run('Robo/Asalto', 15.501, -88.028, 'Robo en la Plaza Central');
    db.prepare('INSERT INTO incidentes (categoria, lat, lng, descripcion) VALUES (?, ?, ?, ?)').run('Vehículo Sospechoso', 15.503, -88.030, 'Vehículo sin placas rondando');
    db.prepare('INSERT INTO incidentes (categoria, lat, lng, descripcion) VALUES (?, ?, ?, ?)').run('Violencia Doméstica', 15.502, -88.029, 'Reporte confidencial');
    db.prepare('INSERT INTO incidentes (categoria, lat, lng, descripcion) VALUES (?, ?, ?, ?)').run('Robo/Asalto', 15.500, -88.027, 'Asalto en parqueo del mercado');

    db.prepare('INSERT INTO recursos (nombre, tipo, lat, lng, direccion, telefono, horario) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      'Estación de Policía Col. Ideal', 'policia', 15.499, -88.025, 'Calle Principal, Col. Ideal', '911', '24 horas'
    );
    db.prepare('INSERT INTO recursos (nombre, tipo, lat, lng, direccion, telefono, horario) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      'Hospital Mario Catarino Rivas', 'hospital', 15.504, -88.035, 'Bulevar del Norte, SPS', '2550-0000', '24 horas'
    );
    db.prepare('INSERT INTO recursos (nombre, tipo, lat, lng, direccion, telefono, horario) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      'Casa Refugio de la Mujer', 'refugio', 15.506, -88.031, 'Dirección confidencial', '2550-1111', '8:00 - 17:00'
    );

    db.prepare('INSERT INTO alertas_silenciosas (usuario_id, lat, lng, mensaje) VALUES (1, 15.501, -88.028, "Alerta de prueba")').run();
  }
}

module.exports = { getDB, initDB };
