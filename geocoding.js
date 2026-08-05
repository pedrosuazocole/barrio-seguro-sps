// ==================== GEOCODIFICACIÓN INVERSA ====================
// Convierte lat/lng en una dirección o nombre de lugar legible usando
// Nominatim (OpenStreetMap), que es gratuito y no requiere API key.
//
// Nominatim exige, por política de uso: máximo ~1 solicitud por segundo y un
// User-Agent que identifique la aplicación. Por eso las peticiones se
// serializan aquí (una fila para todo el servidor) y se cachean por
// coordenada redondeada, así varias personas reportando en la misma zona no
// generan peticiones repetidas.

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'BarrioSeguroSPS/1.0 (app de seguridad comunitaria, San Pedro Sula, Honduras)';
const INTERVALO_MIN_MS = 1100; // un poco más de 1s por seguridad
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 horas
const TIMEOUT_MS = 5000;

const cache = new Map();
let ultimaLlamada = 0;
let colaActual = Promise.resolve();

function claveCache(lat, lng) {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

function limpiarCacheVencida() {
  const ahora = Date.now();
  for (const [key, val] of cache.entries()) {
    if (ahora - val.ts > CACHE_TTL_MS) cache.delete(key);
  }
}

async function esperarTurno() {
  const ahora = Date.now();
  const espera = INTERVALO_MIN_MS - (ahora - ultimaLlamada);
  if (espera > 0) await new Promise(r => setTimeout(r, espera));
  ultimaLlamada = Date.now();
}

// Arma una dirección corta y legible a partir de la respuesta de Nominatim.
function construirDireccionCorta(data) {
  const a = data.address || {};
  const partes = [];

  const via = a.road || a.pedestrian || a.footway || a.residential;
  if (via) partes.push(via);

  const sector = a.suburb || a.neighbourhood || a.quarter || a.hamlet;
  if (sector && sector !== via) partes.push(sector);

  const ciudad = a.city || a.town || a.village || a.municipality;
  if (ciudad) partes.push(ciudad);

  if (partes.length) return partes.join(', ');

  // Respaldo: primeras 3 partes del display_name completo de Nominatim
  if (data.display_name) return data.display_name.split(',').slice(0, 3).join(',').trim();

  return null;
}

async function consultarNominatim(lat, lng) {
  const url = `${NOMINATIM_URL}?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=es`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'es' },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`Nominatim respondió ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

// Devuelve { direccion, nombre, direccionCompleta } o null si no se pudo resolver.
// Nunca lanza: los llamadores no deben bloquear el guardado de una denuncia
// por un fallo del servicio de geocodificación (conectividad intermitente).
async function direccionInversa(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
    return null;
  }

  const key = claveCache(lat, lng);
  const cacheado = cache.get(key);
  if (cacheado && (Date.now() - cacheado.ts) < CACHE_TTL_MS) {
    return cacheado.data;
  }

  // Serializa todas las llamadas para respetar el límite de 1 req/seg de Nominatim,
  // incluso si llegan varias solicitudes de distintos usuarios al mismo tiempo.
  const tarea = colaActual.then(async () => {
    await esperarTurno();
    const data = await consultarNominatim(lat, lng);
    const resultado = {
      direccion: construirDireccionCorta(data),
      nombre: data.name || null,
      direccionCompleta: data.display_name || null
    };
    cache.set(key, { data: resultado, ts: Date.now() });
    if (cache.size > 500) limpiarCacheVencida();
    return resultado;
  });

  colaActual = tarea.catch(() => {}); // no propagar el error a la cadena de la cola
  try {
    return await tarea;
  } catch (err) {
    console.error('Geocodificación inversa falló:', err.message);
    return null;
  }
}

module.exports = { direccionInversa };
