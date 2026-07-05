/* Service Worker – CH–EU Quiz
 * App-Shell offline-fähig; App-Assets werden per stale-while-revalidate aktuell gehalten
 * (Updates greifen automatisch beim nächsten Laden), der grosse Fragenpool cache-first.
 * Domain-Platzhalter: Scope ergibt sich aus dem Registrierungspfad (/quiz/).
 */

const VERSION = 'v10';
const CACHE = 'chedu-quiz-' + VERSION;

// Fragenpool – exakter Dateiname/Pfad (case-sensitiv auf dem Live-Server!)
const FRAGEN_URL = 'data/quiz_fragen_komplett_v22_final_merged.json';

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/db.js',
  'js/i18n.js',
  'js/leitner.js',
  'js/quiz.js',
  'js/ui.js',
  'js/report.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'locales/de.json',
  'locales/fr.json',
  'locales/it.json',
  FRAGEN_URL,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        ASSETS.map(async (url) => {
          try { await cache.add(new Request(url, { cache: 'reload' })); } catch (e) { /* überspringen */ }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

function istPool(url) { return url.pathname.endsWith(FRAGEN_URL.replace('data/', '/data/')) || url.pathname.endsWith('/' + FRAGEN_URL); }

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // SPA-Navigation: Netz zuerst, sonst gecachte index.html
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try { return await fetch(req); }
      catch (e) { return (await caches.match('index.html')) || Response.error(); }
    })());
    return;
  }

  // Grosser Fragenpool: cache-first (Update läuft über den App-eigenen Versions-Check)
  if (istPool(url)) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const net = await fetch(req);
        if (net && net.ok && net.type === 'basic') { (await caches.open(CACHE)).put(req, net.clone()); }
        return net;
      } catch (e) { return cached || Response.error(); }
    })());
    return;
  }

  // Übrige App-Assets (JS/CSS/Locales/Icons): stale-while-revalidate
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const netP = fetch(req).then((net) => {
      if (net && net.ok && net.type === 'basic') { caches.open(CACHE).then((c) => c.put(req, net.clone())); }
      return net;
    }).catch(() => null);
    return cached || (await netP) || Response.error();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
