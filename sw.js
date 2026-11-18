// Service Worker — guarda una copia de la app en el celular para que funcione sin señal.
// Al cambiar cualquier archivo de la lista, subir CACHE (y VERSION en js/app.js).
const CACHE = 'colecta-semillas-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './js/app.js',
  './js/catalog.js',
  './js/catalogos-datos.js',
  './js/combobox.js',
  './js/db.js',
  './js/recolectores-datos.js',
  './js/sync.js',
  './js/export.js',
  './js/utm.js',
  './js/xlsx-mini.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/logo-guayacanes.jpg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Red primero: con internet baja la última versión y refresca la copia guardada;
// sin señal (terreno) usa lo último guardado.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith(self.location.origin)) return;

  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return resp;
      })
      .catch(() => caches.match(e.request).then((cached) => cached || caches.match('./index.html')))
  );
});
