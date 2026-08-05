const CACHE_NAME = 'barrio-seguro-v2';
const ASSETS_TO_CACHE = [
  'css/style.css',
  'js/login.js',
  'js/registro.js',
  'js/denuncia.js',
  'js/monitor.js',
  'manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Navegación (HTML) y llamadas a /api/: siempre red primero, caché como respaldo offline.
  if (req.mode === 'navigate' || url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (req.method === 'GET' && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Estáticos (css/js/manifest): caché primero, red como respaldo.
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req))
  );
});
