// sw.js — service worker for offline / installable PWA.
// Bump CACHE when you change cached files to force an update.
const CACHE = 'palmtree-v4';

// Local app files (must all cache successfully).
const LOCAL = [
  './',
  'index.html',
  'app.html',
  'manifest.json',
  'assets/favicon.svg',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'css/global.css',
  'css/app.css',
  'css/landing.css',
  'js/tooltip.js',
  'js/install.js',
  'js/storage.js',
  'js/search.js',
  'js/notes.js',
  'js/folders.js',
  'js/export.js',
  'js/landing.js',
  'js/app.js',
];

// CDN libraries (best-effort: a failure here won't block install).
const CM = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.17';
const CDN = [
  `${CM}/codemirror.min.css`,
  `${CM}/addon/lint/lint.min.css`,
  `${CM}/codemirror.min.js`,
  ...['javascript','python','htmlmixed','css','clike','php','ruby','go','rust','swift','sql','shell','yaml','xml','markdown']
      .map(m => `${CM}/mode/${m}/${m}.min.js`),
  `${CM}/addon/edit/matchbrackets.min.js`,
  `${CM}/addon/edit/closebrackets.min.js`,
  `${CM}/addon/lint/lint.min.js`,
  `${CM}/addon/lint/javascript-lint.min.js`,
  'https://cdnjs.cloudflare.com/ajax/libs/jshint/2.13.6/jshint.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.2/html2pdf.bundle.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://fonts.googleapis.com/css2?family=Quicksand:wght@300;400;500;600;700&display=swap',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(LOCAL);                                  // critical
    await Promise.allSettled(CDN.map(u => cache.add(u)));       // best-effort
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith((async () => {
    // Cache-first: instant load + works offline.
    const cached = await caches.match(req, { ignoreSearch: false });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      // Cache successful same-origin and CORS responses (e.g. fonts) for next time.
      if (res && (res.ok || res.type === 'opaque')) {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      // Offline and not cached: fall back to the app shell for navigations.
      if (req.mode === 'navigate') {
        return (await caches.match('app.html')) || (await caches.match('index.html'));
      }
      throw err;
    }
  })());
});
