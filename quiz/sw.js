/* Service Worker – CH–EU Quiz
 * Cache-first für die App-Shell, vollständige Offline-Fähigkeit nach erstem Besuch.
 * Domain-Platzhalter: Scope ergibt sich aus dem Registrierungspfad (/quiz/) –
 * anpassen wenn eigene Domain vergeben.
 */

const CACHE = 'chedu-quiz-v1';

// Fragenpool – exakter Dateiname/Pfad (case-sensitiv auf dem Live-Server!)
const FRAGEN_URL = 'data/quiz_fragen_komplett_v22_balanced.json';

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

// Install: alle Assets einzeln cachen; noch nicht vorhandene Dateien werden
// übersprungen (robuster Precache während des Aufbaus und im Betrieb).
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        ASSETS.map(async (url) => {
          try {
            await cache.add(new Request(url, { cache: 'reload' }));
          } catch (e) {
            /* Datei (noch) nicht vorhanden – überspringen */
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

// Activate: alte Cache-Versionen aufräumen und sofort übernehmen.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// Fetch: SPA-Navigation -> index.html; sonst cache-first mit Netz-Fallback.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // nur eigene Assets bedienen

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch (e) {
          return (await caches.match('index.html')) || Response.error();
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const net = await fetch(req);
        if (net && net.ok && net.type === 'basic') {
          const cache = await caches.open(CACHE);
          cache.put(req, net.clone());
        }
        return net;
      } catch (e) {
        return cached || Response.error();
      }
    })()
  );
});

// Nachricht vom Client: sofort aktivieren (für Update-Mechanismus, Schritt 10).
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
