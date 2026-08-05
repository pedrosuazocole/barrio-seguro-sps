// ==================== MÓDULO DENUNCIA (vecino autenticado) ====================
let map;
let marcadorSeleccion;
let ubicacionSeleccionada = null;

const DEMO_LAT = 15.501;
const DEMO_LNG = -88.028;

function showToast(message, duration = 4000) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toast.addEventListener('click', () => toast.remove());
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

document.addEventListener('DOMContentLoaded', () => {
  verificarSesion();
  initMap();
  cargarContactos();
  registerSW();
});

function verificarSesion() {
  fetch('/api/auth/me')
    .then(async res => {
      if (!res.ok) { window.location.href = '/login.html'; return; }
      const data = await res.json();
      document.getElementById('bienvenida').textContent = `Hola, ${data.nombre}`;
    })
    .catch(() => { window.location.href = '/login.html'; });
}

document.getElementById('btn-logout').addEventListener('click', () => {
  fetch('/api/auth/logout', { method: 'POST' })
    .then(() => { window.location.href = '/index.html'; });
});

function initMap() {
  map = L.map('map').setView([DEMO_LAT, DEMO_LNG], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  map.on('click', function (e) {
    seleccionarUbicacion(e.latlng.lat, e.latlng.lng);
  });
}

function seleccionarUbicacion(lat, lng) {
  ubicacionSeleccionada = { lat, lng };
  if (marcadorSeleccion) map.removeLayer(marcadorSeleccion);
  marcadorSeleccion = L.marker([lat, lng]).addTo(map);
  map.setView([lat, lng], Math.max(map.getZoom(), 16));

  const campo = document.getElementById('ubicacion-texto');
  campo.value = 'Buscando dirección...';
  buscarDireccion(lat, lng)
    .then(direccion => {
      // Si mientras tanto el vecino ya eligió otro punto, no pisar el texto nuevo
      if (!ubicacionSeleccionada || ubicacionSeleccionada.lat !== lat || ubicacionSeleccionada.lng !== lng) return;
      campo.value = direccion || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      if (marcadorSeleccion) marcadorSeleccion.bindPopup(direccion || 'Ubicación seleccionada').openPopup();
    })
    .catch(() => {
      campo.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    });
}

// Consulta la dirección/nombre del lugar. Si no hay conexión o el servicio
// falla (conectividad intermitente), se resuelve con null y se cae a coordenadas.
function buscarDireccion(lat, lng) {
  return fetch(`/api/geocoding/reverse?lat=${lat}&lng=${lng}`)
    .then(res => res.ok ? res.json() : null)
    .then(data => data ? (data.nombre || data.direccion) : null)
    .catch(() => null);
}

document.getElementById('btn-mi-ubicacion').addEventListener('click', () => {
  if (!navigator.geolocation) {
    showToast('Tu dispositivo no soporta geolocalización, usa el mapa');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => seleccionarUbicacion(pos.coords.latitude, pos.coords.longitude),
    () => showToast('No se pudo obtener tu ubicación, toca el mapa manualmente')
  );
});

document.getElementById('form-denuncia').addEventListener('submit', function (e) {
  e.preventDefault();
  const categoria = document.getElementById('categoria').value;
  const descripcion = document.getElementById('descripcion').value.trim();

  if (!categoria) return showToast('Selecciona una categoría');
  if (!ubicacionSeleccionada) return showToast('Selecciona la ubicación en el mapa');

  fetch('/api/incidentes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      categoria,
      lat: ubicacionSeleccionada.lat,
      lng: ubicacionSeleccionada.lng,
      descripcion
    })
  })
    .then(async res => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo enviar la denuncia');
      showToast('✅ Denuncia enviada al panel de monitoreo');
      this.reset();
      if (marcadorSeleccion) { map.removeLayer(marcadorSeleccion); marcadorSeleccion = null; }
      ubicacionSeleccionada = null;
      document.getElementById('ubicacion-texto').value = '';
    })
    .catch(err => showToast(err.message));
});

document.getElementById('btn-panico').addEventListener('click', () => {
  function enviar(lat, lng) {
    fetch('/api/alertas/silenciosa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng })
    })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo enviar la alerta');
        showToast(data.direccion ? `🆘 Alerta enviada — ${data.direccion}` : '🆘 Alerta silenciosa enviada');
      })
      .catch(err => showToast(err.message));
  }

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => enviar(pos.coords.latitude, pos.coords.longitude),
      () => enviar(DEMO_LAT, DEMO_LNG)
    );
  } else {
    enviar(DEMO_LAT, DEMO_LNG);
  }
});

function cargarContactos() {
  fetch('/api/contactos')
    .then(res => res.json())
    .then(data => {
      document.getElementById('lista-contactos').innerHTML = data.length
        ? data.map(c => `
          <div class="contacto-card">
            <strong>${escapeHtml(c.nombre)}</strong><br>
            Tel: ${escapeHtml(c.telefono)} | ${escapeHtml(c.relacion)}
          </div>
        `).join('')
        : '<p style="color:#888;font-size:0.9rem;">Aún no tienes contactos agregados.</p>';
    });
}

document.getElementById('form-contacto').addEventListener('submit', function (e) {
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.error('Error SW', err));
  }
}
