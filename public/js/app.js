// ================== CONFIGURACIÓN Y ESTADO GLOBAL ==================
const ROL_KEY = 'barrioSeguro_rol';
let currentRole = localStorage.getItem(ROL_KEY) || 'vecino';
let map;
let markersLayer;
let recursosLayer;
let allIncidentes = [];
let todosRecursos = [];

const DEMO_LAT = 15.501;
const DEMO_LNG = -88.028;

function playAlarm() {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  oscillator.frequency.value = 800;
  oscillator.type = 'square';
  gainNode.gain.value = 0.1;
  oscillator.start();
  setTimeout(() => {
    oscillator.stop();
    audioCtx.close();
  }, 500);
}

function showToast(message, duration = 5000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toast.addEventListener('click', () => toast.remove());
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
  playAlarm();
}

document.addEventListener('DOMContentLoaded', () => {
  aplicarRolUI();
  initMap();
  cargarIncidentes();
  cargarRecursos();
  cargarContactos();
  setupTabs();
  setupEventListeners();
  initSSE();
  registerSW();
});

function aplicarRolUI() {
  const btnVecino = document.getElementById('btnVecino');
  const btnMonitor = document.getElementById('btnMonitor');
  const tabMonitor = document.getElementById('tabMonitor');
  const labelViolencia = document.getElementById('labelViolencia');
  const formRecurso = document.getElementById('form-recurso-container');
  
  if (currentRole === 'monitor') {
    btnVecino.classList.remove('active');
    btnMonitor.classList.add('active');
    tabMonitor.style.display = 'block';
    labelViolencia.style.display = 'inline';
    formRecurso.style.display = 'block';
    cargarAlertasActivas();
    cargarIncidentesViolencia();
  } else {
    btnVecino.classList.add('active');
    btnMonitor.classList.remove('active');
    tabMonitor.style.display = 'none';
    labelViolencia.style.display = 'none';
    formRecurso.style.display = 'none';
  }
}

function initMap() {
  map = L.map('map').setView([15.50, -88.03], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);
  recursosLayer = L.layerGroup().addTo(map);

  map.on('click', function(e) {
    if (currentRole === 'vecino' || currentRole === 'monitor') {
      mostrarFormularioIncidente(e.latlng.lat, e.latlng.lng);
    }
  });
}

function mostrarFormularioIncidente(lat, lng) {
  const categoria = prompt('Categoría:\n1. Robo/Asalto\n2. Vehículo Sospechoso\n3. Violencia Doméstica\nEscribe el número:');
  let cat;
  if (categoria === '1') cat = 'Robo/Asalto';
  else if (categoria === '2') cat = 'Vehículo Sospechoso';
  else if (categoria === '3') cat = 'Violencia Doméstica';
  else return;
  const desc = prompt('Descripción breve:') || '';
  fetch('/api/incidentes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categoria: cat, lat, lng, descripcion: desc })
  })
  .then(res => res.json())
  .then(data => {
    showToast('Incidente reportado');
    actualizarMarcadores();
  })
  .catch(err => console.error(err));
}

function actualizarMarcadores() {
  markersLayer.clearLayers();
  const filtros = Array.from(document.querySelectorAll('.filter-cat:checked')).map(cb => cb.value);
  
  allIncidentes.forEach(inc => {
    if (!filtros.includes(inc.categoria)) return;
    if (inc.categoria === 'Violencia Doméstica' && currentRole !== 'monitor') return;
    
    let color;
    switch (inc.categoria) {
      case 'Robo/Asalto': color = 'red'; break;
      case 'Vehículo Sospechoso': color = 'orange'; break;
      case 'Violencia Doméstica': color = 'purple'; break;
      default: color = 'gray';
    }
    L.circleMarker([inc.lat, inc.lng], {
      radius: 8,
      fillColor: color,
      color: '#000',
      weight: 1,
      opacity: 1,
      fillOpacity: 0.8
    }).bindPopup(`<b>${inc.categoria}</b><br>${inc.descripcion}<br><small>${inc.timestamp}</small>`).addTo(markersLayer);
  });
}

function cargarIncidentes() {
  fetch('/api/incidentes')
    .then(res => res.json())
    .then(data => {
      allIncidentes = data;
      actualizarMarcadores();
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
    }).bindPopup(`<b>${rec.nombre}</b><br>${rec.direccion}<br>Tel: ${rec.telefono}<br>Horario: ${rec.horario}`).addTo(recursosLayer);
  });
}

function mostrarRecursosEnLista() {
  document.getElementById('lista-recursos').innerHTML = todosRecursos.map(rec => `
    <div class="recurso-card">
      <strong>${rec.nombre}</strong> (${rec.tipo})<br>
      ${rec.direccion}<br>
      Tel: ${rec.telefono} | ${rec.horario}
      <button onclick="verRecursoEnMapa(${rec.lat},${rec.lng})">Ver en mapa</button>
    </div>
  `).join('');
}

function verRecursoEnMapa(lat, lng) {
  map.setView([lat, lng], 17);
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.tab[data-tab="mapa"]').classList.add('active');
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab-mapa').classList.add('active');
}

function cargarContactos() {
  fetch('/api/contactos')
    .then(res => res.json())
    .then(data => {
      document.getElementById('lista-contactos').innerHTML = data.map(c => `
        <div class="contacto-card">
          <strong>${c.nombre}</strong><br>
          Tel: ${c.telefono} | ${c.relacion}
        </div>
      `).join('');
    });
}

function enviarAlertaSilenciosa(lat, lng) {
  fetch('/api/alertas/silenciosa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng })
  }).then(res => res.json()).catch(err => console.error(err));
}

document.getElementById('weather-widget').addEventListener('click', function(e) {
  e.preventDefault();
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      enviarAlertaSilenciosa(pos.coords.latitude, pos.coords.longitude);
    }, () => {
      enviarAlertaSilenciosa(DEMO_LAT, DEMO_LNG);
    });
  } else {
    enviarAlertaSilenciosa(DEMO_LAT, DEMO_LNG);
  }
  showToast('Datos del clima actualizados', 2000);
});

document.getElementById('btn-simular-alerta').addEventListener('click', () => {
  enviarAlertaSilenciosa(DEMO_LAT, DEMO_LNG);
});

function initSSE() {
  const evtSource = new EventSource('/api/stream');
  evtSource.addEventListener('alerta_activada', function(e) {
    const data = JSON.parse(e.data);
    showToast(`🚨 Alerta de ${currentRole === 'monitor' ? 'Vecino' : 'tu círculo'} - Ubicación: ${data.lat.toFixed(3)}, ${data.lng.toFixed(3)}`);
    if (currentRole === 'monitor') cargarAlertasActivas();
  });
  evtSource.addEventListener('nuevo_incidente', function(e) {
    showToast(`Nuevo incidente: ${JSON.parse(e.data).categoria}`);
    cargarIncidentes();
  });
  evtSource.addEventListener('recurso_actualizado', function(e) {
    showToast('Recurso agregado');
    cargarRecursos();
  });
  evtSource.onerror = () => console.log('SSE error, reconectando...');
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.getElementById(`tab-${target}`).classList.add('active');
      if (target === 'monitor') {
        cargarAlertasActivas();
        cargarIncidentesViolencia();
      }
    });
  });
}

document.getElementById('btnVecino').addEventListener('click', () => {
  currentRole = 'vecino';
  localStorage.setItem(ROL_KEY, 'vecino');
  aplicarRolUI();
  actualizarMarcadores();
});

document.getElementById('btnMonitor').addEventListener('click', () => {
  currentRole = 'monitor';
  localStorage.setItem(ROL_KEY, 'monitor');
  aplicarRolUI();
  actualizarMarcadores();
  cargarAlertasActivas();
  cargarIncidentesViolencia();
});

function cargarAlertasActivas() {
  fetch('/api/alertas/activas')
    .then(res => res.json())
    .then(data => {
      document.getElementById('alertas-activas').innerHTML = data.length
        ? data.map(a => `<p>📍 Alerta #${a.id} desde (${a.lat.toFixed(4)}, ${a.lng.toFixed(4)}) - ${a.timestamp}</p>`).join('')
        : '<p>No hay alertas activas.</p>';
    });
}

function cargarIncidentesViolencia() {
  fetch('/api/incidentes?categoria=Violencia Doméstica')
    .then(res => res.json())
    .then(data => {
      document.getElementById('incidentes-violencia').innerHTML = data.length
        ? data.map(i => `<p>⚠️ Incidente confidencial - ${i.timestamp}</p>`).join('')
        : '<p>Sin reportes.</p>';
    });
}

document.querySelectorAll('.filter-cat').forEach(cb => cb.addEventListener('change', actualizarMarcadores));
document.getElementById('btn-reportar-incidente').addEventListener('click', () => mostrarFormularioIncidente(DEMO_LAT, DEMO_LNG));

document.getElementById('form-contacto').addEventListener('submit', function(e) {
  e.preventDefault();
  const nombre = document.getElementById('contacto-nombre').value;
  const telefono = document.getElementById('contacto-telefono').value;
  const relacion = document.getElementById('contacto-relacion').value;
  fetch('/api/contactos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, telefono, relacion })
  })
  .then(res => res.json())
  .then(() => {
    showToast('Contacto agregado');
    cargarContactos();
    this.reset();
  });
});

document.getElementById('form-recurso').addEventListener('submit', function(e) {
  e.preventDefault();
  if (currentRole !== 'monitor') return alert('Solo un monitor puede agregar recursos.');
  const nombre = document.getElementById('recurso-nombre').value;
  const tipo = document.getElementById('recurso-tipo').value;
  const direccion = document.getElementById('recurso-direccion').value;
  const telefono = document.getElementById('recurso-telefono').value;
  const horario = document.getElementById('recurso-horario').value;
  fetch('/api/recursos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, tipo, lat: DEMO_LAT + Math.random() * 0.01, lng: DEMO_LNG + Math.random() * 0.01, direccion, telefono, horario })
  })
  .then(res => res.json())
  .then(() => {
    showToast('Recurso agregado');
    cargarRecursos();
    this.reset();
  });
});

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('Service Worker registrado', reg.scope))
      .catch(err => console.error('Error SW', err));
  }
}
