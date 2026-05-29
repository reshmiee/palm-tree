// sw.js — service worker for offline / installable PWA.
// Strategy: network-first for our own files (edits show on a normal reload when
// online, cache used offline); cache-first for the version-pinned CDN libraries.
// You no longer need to bump CACHE for your own file edits — only bump it if you
// change the CDN library list below.
const CACHE = 'palmtree-v6';

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
  'js/backup.js',
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

  const sameOrigin = new URL(req.url).origin === self.location.origin;

  if (sameOrigin) {
    // ── Our own files: network-first ──
    // When online, always load the freshest version (so edits show on a normal
    // reload, no hard-refresh needed) and refresh the cache. Offline → cache.
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const cache = await caches.open(CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch (err) {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === 'navigate') {
          return (await caches.match('app.html')) || (await caches.match('index.html'));
        }
        throw err;
      }
    })());
  } else {
    // ── CDN libraries (version-pinned, immutable): cache-first ──
    // Instant load + offline; no need to re-fetch unchanging files.
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    })());
  }
});
