// sw.js — service worker for offline / installable PWA.
// Strategy: network-first for our own files (edits show on a normal reload when
// online, cache used offline). Libraries are now self-hosted under lib/, so they
// are first-party too. Bump CACHE only if you add/remove cached files.
const CACHE = 'palmtree-v9';

const CM = 'lib/cm';
const MODES = ['javascript','python','htmlmixed','css','clike','php','ruby','go','rust','swift','sql','shell','yaml','xml','markdown'];

// All local files (app + self-hosted libraries). Best-effort: a single failure
// won't block install.
const LOCAL = [
  './',
  'index.html',
  'app.html',
  'manifest.json',
  'assets/favicon.svg',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon-maskable.png',
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
  // self-hosted libraries
  `${CM}/codemirror.min.css`,
  `${CM}/addon/lint/lint.min.css`,
  `${CM}/codemirror.min.js`,
  `${CM}/addon/mode/simple.min.js`,
  ...MODES.map(m => `${CM}/mode/${m}/${m}.min.js`),
  `${CM}/addon/edit/matchbrackets.min.js`,
  `${CM}/addon/edit/closebrackets.min.js`,
  `${CM}/addon/lint/lint.min.js`,
  `${CM}/addon/lint/javascript-lint.min.js`,
  'lib/jshint.min.js',
  'lib/html2pdf.bundle.min.js',
  'lib/jszip.min.js',
];

// Only third party left: the Google Font (best-effort).
const CDN = [
  'https://fonts.googleapis.com/css2?family=Quicksand:wght@300;400;500;600;700&display=swap',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(LOCAL.map(u => cache.add(u)));     // app + libs
    await Promise.allSettled(CDN.map(u => cache.add(u)));       // font (best-effort)
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
