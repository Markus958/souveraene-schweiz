/* Übergangs-/Aufräum-Worker.
 * Die frühere Quiz-App hatte unter diesem Namen einen Service Worker registriert,
 * der bei manchen Nutzern weiterhin die ALTE App ausliefert. Dieser Ersatz meldet
 * den alten Worker ab, leert dessen Caches und lädt offene Fenster neu – danach
 * übernimmt die neue PWA (sw.js). Datei kann entfernt werden, sobald keine alten
 * Registrierungen mehr im Umlauf sind.
 * Domain-Platzhalter: Scope /quiz/.
 */

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (e) { /* ignorieren */ }
      try { await self.registration.unregister(); } catch (e) { /* ignorieren */ }
      try {
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach((c) => c.navigate(c.url));
      } catch (e) { /* ignorieren */ }
    })()
  );
});
