// ==================== MÓDULO MONITOR (recepción de denuncias) ====================
let map;
let marcadoresLayer;
let recursosLayer;
let allIncidentes = [];
let todosRecursos = [];

const DEMO_LAT = 15.501;
const DEMO_LNG = -88.028;

const EMOJI_POR_CATEGORIA = {
  'Robo/Asalto': '🚨',
  'Vehículo Sospechoso': '🚗',
  'Violencia Doméstica': '🆘'
};

const CLASE_POR_CATEGORIA = {
  'Robo/Asalto': 'cat-robo',
  'Vehículo Sospechoso': 'cat-vehiculo',
  'Violencia Doméstica': 'cat-violencia'
};

let filtroReporteActual = 'todas';

function playAlarm() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.frequency.value = 800;
    oscillator.type = 'square';
    gainNode.gain.value = 0.1;
    oscillator.start();
    setTimeout(() => { oscillator.stop(); audioCtx.close(); }, 500);
  } catch (e) { /* audio no disponible */ }
}

function showToast(message, duration = 5000, sonar = true) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toast.addEventListener('click', () => toast.remove());
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
  if (sonar) playAlarm();
}

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  cargarIncidentes();
  cargarRecursos();
  cargarAlertasActivas();
  cargarIncidentesViolencia();
  setupTabs();
  setupFiltrosReportes();
  initSSE();
});

function initMap() {
  map = L.map('map').setView([15.50, -88.03], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  marcadoresLayer = L.layerGroup().addTo(map);
  recursosLayer = L.layerGroup().addTo(map);
}

// Dirección/nombre del lugar si se pudo resolver; si no, coordenadas como respaldo.
function lugarLegible(item) {
  if (item.direccion) return item.direccion;
  return `${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}`;
}

function iconoEmoji(categoria) {
  const emoji = EMOJI_POR_CATEGORIA[categoria] || '📍';
  return L.divIcon({
    html: `<div class="emoji-marker">${emoji}</div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
}

function actualizarMarcadores() {
  marcadoresLayer.clearLayers();
  const filtros = Array.from(document.querySelectorAll('.filter-cat:checked')).map(cb => cb.value);

  // allIncidentes viene del servidor con el más reciente primero (ORDER BY timestamp DESC).
  // Se dibuja en orden INVERSO (más viejo primero) para que el marcador más reciente quede
  // pintado al final y por lo tanto visible ENCIMA si coincide con uno viejo en el mismo lugar
  // — si no, un reporte nuevo puede quedar oculto debajo de uno anterior en la misma ubicación.
  [...allIncidentes].reverse().forEach(inc => {
    if (!filtros.includes(inc.categoria)) return;

    const esConfidencial = inc.categoria === 'Violencia Doméstica';
    const lugar = escapeHtml(lugarLegible(inc));
    const popup = esConfidencial
      ? `<b>🆘 Reporte confidencial</b><br>📍 ${lugar}<br><small>${new Date(inc.timestamp).toLocaleString('es-HN')}</small>`
      : `<b>${EMOJI_POR_CATEGORIA[inc.categoria] || ''} ${inc.categoria}</b><br>📍 ${lugar}<br>${escapeHtml(inc.descripcion || '')}<br><small>${new Date(inc.timestamp).toLocaleString('es-HN')}</small>`;

    L.marker([inc.lat, inc.lng], { icon: iconoEmoji(inc.categoria) })
      .bindPopup(popup)
      .addTo(marcadoresLayer);
  });
}

function cargarIncidentes() {
  fetch('/api/incidentes')
    .then(res => res.json())
    .then(data => {
      allIncidentes = data;
      actualizarMarcadores();
      renderizarReportes();
    });
}

// "Hace X min/h/d" — asume que quien mira la pantalla está en Honduras (igual que
// el resto del panel), ver la nota de zona horaria en server.js/database.js.
function tiempoRelativo(timestampStr) {
  const entonces = new Date(timestampStr).getTime();
  const diffSeg = Math.max(0, Math.floor((Date.now() - entonces) / 1000));
  if (diffSeg < 60) return 'Justo ahora';
  const diffMin = Math.floor(diffSeg / 60);
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHoras = Math.floor(diffMin / 60);
  if (diffHoras < 24) return `Hace ${diffHoras} h`;
  const diffDias = Math.floor(diffHoras / 24);
  return `Hace ${diffDias} d`;
}

function renderizarReportes() {
  const contenedor = document.getElementById('lista-reportes');
  const conteo = document.getElementById('conteo-reportes');
  if (!contenedor) return;

  const items = allIncidentes.filter(inc => filtroReporteActual === 'todas' || inc.categoria === filtroReporteActual);
  if (conteo) conteo.textContent = items.length;

  if (!items.length) {
    contenedor.innerHTML = '<div class="reportes-vacio">Todavía no hay denuncias en esta categoría.</div>';
    return;
  }

  contenedor.innerHTML = items.map(inc => {
    const claseCat = CLASE_POR_CATEGORIA[inc.categoria] || '';
    const esConfidencial = inc.categoria === 'Violencia Doméstica';
    const emoji = EMOJI_POR_CATEGORIA[inc.categoria] || '📍';
    const lugar = escapeHtml(lugarLegible(inc));
    const horaExacta = escapeHtml(new Date(inc.timestamp).toLocaleString('es-HN'));
    const relativo = tiempoRelativo(inc.timestamp);

    const cuerpo = esConfidencial
      ? '<span class="reporte-confidencial-tag">🔒 Detalles confidenciales</span>'
      : (inc.descripcion ? `<div class="reporte-desc">${escapeHtml(inc.descripcion)}</div>` : '');

    return `
      <div class="reporte-card ${claseCat}">
        <div class="reporte-icono">${emoji}</div>
        <div class="reporte-cuerpo">
          <div class="reporte-top">
            <span class="reporte-categoria">${esConfidencial ? 'Reporte confidencial' : escapeHtml(inc.categoria)}</span>
            <span class="reporte-tiempo" title="${horaExacta}">${relativo}</span>
          </div>
          <div class="reporte-lugar">${lugar}</div>
          ${cuerpo}
          <div class="reporte-acciones">
            <button class="reporte-ver-mapa" onclick="verReporteEnMapa(${inc.lat}, ${inc.lng})">Ver en el mapa</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function verReporteEnMapa(lat, lng) {
  cambiarTab('mapa');
  map.setView([lat, lng], 17);
}

function setupFiltrosReportes() {
  document.querySelectorAll('.pill-filtro').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pill-filtro').forEach(b => b.classList.remove('activo'));
      btn.classList.add('activo');
      filtroReporteActual = btn.getAttribute('data-filtro');
      renderizarReportes();
    });
  });
}

function cargarRecursos() {
  fetch('/api/recursos')
    .then(res => res.json())
    .then(data => {
      todosRecursos = data;
      mostrarRecursosEnLista();
      mostrarRecursosEnMapa();
    });
}

function mostrarRecursosEnMapa() {
  recursosLayer.clearLayers();
  todosRecursos.forEach(rec => {
    let iconUrl;
    if (rec.tipo === 'policia') iconUrl = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png';
    else if (rec.tipo === 'hospital') iconUrl = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png';
    else iconUrl = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png';
    L.marker([rec.lat, rec.lng], {
      icon: L.icon({
        iconUrl,
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
      })
    }).bindPopup(`<b>${escapeHtml(rec.nombre)}</b><br>${escapeHtml(rec.direccion || '')}<br>Tel: ${escapeHtml(rec.telefono || '')}<br>Horario: ${escapeHtml(rec.horario || '')}`).addTo(recursosLayer);
  });
}

function mostrarRecursosEnLista() {
  document.getElementById('lista-recursos').innerHTML = todosRecursos.map(rec => `
    <div class="recurso-card">
      <strong>${escapeHtml(rec.nombre)}</strong> (${escapeHtml(rec.tipo)})<br>
      ${escapeHtml(rec.direccion || '')}<br>
      Tel: ${escapeHtml(rec.telefono || '')} | ${escapeHtml(rec.horario || '')}
      <button onclick="verRecursoEnMapa(${rec.lat},${rec.lng})">Ver en mapa</button>
    </div>
  `).join('');
}

function verRecursoEnMapa(lat, lng) {
  cambiarTab('mapa');
  map.setView([lat, lng], 17);
}

function cargarAlertasActivas() {
  fetch('/api/alertas/activas')
    .then(res => res.json())
    .then(data => {
      document.getElementById('conteo-alertas').textContent = data.length;
      document.getElementById('alertas-activas').innerHTML = data.length
        ? data.map(a => `
          <div class="alerta-item">
            📍 Alerta #${a.id} — ${escapeHtml(a.mensaje || '')}<br>
            <strong>${escapeHtml(lugarLegible(a))}</strong><br>
            <small>${new Date(a.timestamp).toLocaleString('es-HN')}</small>
          </div>
        `).join('')
        : '<p style="color:#888;">No hay alertas activas.</p>';
    });
}

function cargarIncidentesViolencia() {
  fetch('/api/incidentes?categoria=' + encodeURIComponent('Violencia Doméstica'))
    .then(res => res.json())
    .then(data => {
      document.getElementById('incidentes-violencia').innerHTML = data.length
        ? data.map(i => `
          <div class="alerta-item confidencial">
            ⚠️ Incidente confidencial<br>
            <strong>${escapeHtml(lugarLegible(i))}</strong><br>
            <small>${new Date(i.timestamp).toLocaleString('es-HN')}</small>
          </div>
        `).join('')
        : '<p style="color:#888;">Sin reportes.</p>';
    });
}

function initSSE() {
  const evtSource = new EventSource('/api/stream');

  evtSource.addEventListener('nuevo_incidente', function (e) {
    const data = JSON.parse(e.data);
    const etiqueta = data.categoria === 'Violencia Doméstica' ? 'reporte confidencial' : data.categoria;
    showToast(`${EMOJI_POR_CATEGORIA[data.categoria] || '📍'} Nueva denuncia: ${etiqueta} — ${lugarLegible(data)}`);
    cargarIncidentes();
    if (data.categoria === 'Violencia Doméstica') cargarIncidentesViolencia();
  });

  evtSource.addEventListener('alerta_activada', function (e) {
    const data = JSON.parse(e.data);
    showToast(`🆘 Alerta silenciosa — ${lugarLegible(data)}`);
    cargarAlertasActivas();
  });

  evtSource.addEventListener('recurso_actualizado', function () {
    showToast('Recurso actualizado', 3000, false);
    cargarRecursos();
  });

  evtSource.onerror = () => console.log('SSE desconectado, reintentando...');
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => cambiarTab(tab.getAttribute('data-tab')));
  });
}

function cambiarTab(nombre) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${nombre}"]`).classList.add('active');
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(`tab-${nombre}`).classList.add('active');
  if (nombre === 'alertas') { cargarAlertasActivas(); cargarIncidentesViolencia(); }
  if (nombre === 'reportes') renderizarReportes();
  if (nombre === 'mapa') setTimeout(() => map.invalidateSize(), 100);
}

// Refresca los "hace X min" del feed de denuncias cada minuto, sin re-pedir datos al servidor.
setInterval(() => {
  if (document.getElementById('lista-reportes')) renderizarReportes();
}, 60000);

document.querySelectorAll('.filter-cat').forEach(cb => cb.addEventListener('change', actualizarMarcadores));

document.getElementById('form-recurso').addEventListener('submit', function (e) {
  e.preventDefault();
  const nombre = document.getElementById('recurso-nombre').value;
  const tipo = document.getElementById('recurso-tipo').value;
  const direccion = document.getElementById('recurso-direccion').value;
  const telefono = document.getElementById('recurso-telefono').value;
  const horario = document.getElementById('recurso-horario').value;
  fetch('/api/recursos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, tipo, lat: DEMO_LAT + (Math.random() - 0.5) * 0.02, lng: DEMO_LNG + (Math.random() - 0.5) * 0.02, direccion, telefono, horario })
  })
    .then(res => res.json())
    .then(() => {
      showToast('Recurso agregado', 3000, false);
      cargarRecursos();
      this.reset();
    });
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
