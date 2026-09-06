/* Service worker mínimo: solo existe para que el navegador pueda instalar la
   app en el teléfono. Cachea el "shell" estático (html/css/js/logo) para que
   abra rápido, pero NUNCA cachea /api/* — los datos siempre tienen que venir
   en vivo del servidor, si no la app deja de estar sincronizada. */

const CACHE = 'visagista-shell-v5';
const SHELL = [
  '/', '/style.css', '/logo.png',
  '/api.js', '/scanner.js', '/realtime.js', '/login.js',
  '/calendario.js', '/clientes.js', '/catalogo.js', '/stock.js', '/comandas.js',
  '/mis-turnos.js', '/comisiones.js',
  '/facturacion.js', '/egresos.js', '/dashboard.js', '/reportes.js',
  '/marketing.js', '/usuarios.js', '/permisos-roles.js', '/app.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) return; // nunca cachear datos

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
