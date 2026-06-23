/* app.js – Einstiegspunkt: Initialisierung, Hash-Routing, Update-Mechanismus.
 * Lädt DB, Sprache und Fragenpool, verdrahtet die Navigation.
 */

import { initI18n, t } from './i18n.js';
import { openDB } from './db.js';
import { setFragenPool } from './quiz.js';
import {
  renderStart, renderKategorien, renderKategorieDetail, renderEinstellungen,
  zeigeAktuelleFrage, renderFehler, toast, toastAktion,
} from './ui.js';
import { sendeOfflineMeldungen } from './report.js';

const FRAGEN_URL = 'data/quiz_fragen_komplett_v22_tooltips.json';
const CACHE = 'chedu-quiz-v1';
const LS_POOL_VERSION = 'quiz_pool_version';

function poolVersion(data) { return data.generated || data.version || ''; }

async function ladePool() {
  // Mit aktivem Service-Worker wird hier cache-first ausgeliefert (offline-fähig).
  const res = await fetch(FRAGEN_URL);
  if (!res.ok) throw new Error('Pool nicht ladbar');
  return res.json();
}

function route() {
  const hash = location.hash || '#start';
  if (hash.startsWith('#kategorie/')) {
    renderKategorieDetail(decodeURIComponent(hash.slice('#kategorie/'.length)));
  } else if (hash === '#kategorien') {
    renderKategorien();
  } else if (hash === '#einstellungen') {
    renderEinstellungen();
  } else if (hash === '#quiz') {
    zeigeAktuelleFrage();
  } else {
    renderStart();
  }
}

/* Schritt 10: Update-Mechanismus – prüft im Hintergrund auf eine neue Pool-Version.
 * Cache-Bust-Query umgeht den Service-Worker-Cache, damit das Netz wirklich befragt wird. */
async function pruefeUpdate(aktuelleVersion) {
  try {
    const res = await fetch(FRAGEN_URL + '?_=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    const neu = poolVersion(data);
    if (!neu || neu === aktuelleVersion) return;
    toastAktion(t('update.verfuegbar'), t('update.ja'), async () => {
      setFragenPool(data.questions || []);
      localStorage.setItem(LS_POOL_VERSION, neu);
      try {
        const c = await caches.open(CACHE);
        await c.put(FRAGEN_URL, new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }));
      } catch (e) { /* Cache-Update optional */ }
      toast(t('update.aktualisiert'), 'erfolg');
      route();
    }, t('update.nein'));
  } catch (e) { /* offline o. Ä. – ignorieren */ }
}

async function init() {
  await initI18n();
  try { await openDB(); } catch (e) { /* DB optional beim ersten Render */ }

  let data;
  try {
    data = await ladePool();
  } catch (e) {
    renderFehler(t('fehler.laden'));
    return;
  }
  setFragenPool(Array.isArray(data) ? data : (data.questions || []));
  const version = poolVersion(data);
  if (version) localStorage.setItem(LS_POOL_VERSION, version);

  window.addEventListener('hashchange', route);
  route();

  // Offline gepufferte Meldungen senden, sobald wieder online
  window.addEventListener('online', () => { sendeOfflineMeldungen(); });
  sendeOfflineMeldungen();

  // Update-Check verzögert, um den Start nicht zu blockieren
  if (navigator.onLine) setTimeout(() => pruefeUpdate(version), 2500);
}

init();
