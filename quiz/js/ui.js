/* ui.js – zentrales DOM-Rendering. Alle DOM-Operationen liegen hier.
 * Screens: Start, Kategorien, Kategorie-Detail, Frage, Auswertung, Sitzungsende, Einstellungen.
 * Plus format-spezifische Renderer, Auswertungs-Feedback, Toast und Modal-Helfer.
 */

import { t, getSprache, setSprache, SPRACHEN } from './i18n.js';
import {
  startSession, aktuelleSession, aktuelleFrage, antworten, naechsteFrage, fortschrittInfo,
  sessionAbschliessen, statistikProDossier, profilStatistik, getFragenPool,
} from './quiz.js';
import { oeffneMeldeModal } from './report.js';
import { resetAlles } from './db.js';

const LS_MODUS = 'quiz_modus';

/* ---------- kleine Helfer ---------- */

function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  kids.flat().forEach((c) => {
    if (c == null || c === false) return;
    e.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  });
  return e;
}

/* Tabler-Outline-Icon als <i>. extra = zusätzliche CSS-Klassen. */
function icon(name, extra) {
  return h('i', { class: 'ti ti-' + name + (extra ? ' ' + extra : ''), 'aria-hidden': 'true' });
}

/* Bildzeichen: abgerundetes Quadrat in Markenlila mit weissem Häkchen (SVG). */
function logoMark(size = 26) {
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs) => { const el = document.createElementNS(NS, tag); for (const k in attrs) el.setAttribute(k, attrs[k]); return el; };
  const svg = mk('svg', { width: size, height: size, viewBox: '0 0 30 30', class: 'logo-mark', 'aria-hidden': 'true' });
  svg.appendChild(mk('rect', { width: 30, height: 30, rx: 8, fill: '#534AB7' }));
  svg.appendChild(mk('path', {
    d: 'M8 15.5 L13 20.5 L22 9.5', fill: 'none', stroke: '#fff',
    'stroke-width': 2.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }));
  return svg;
}

const OPT_BUCHSTABEN = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const LS_SEEN_LANDING = 'quiz_seen_landing';

/* Sprachschalter DE/FR/IT. FR/IT sind noch nicht erfasst -> sichtbar, aber deaktiviert. */
function langSwitch(reRender) {
  const aktuell = getSprache();
  return h('div', { class: 'lang-switch', role: 'group', 'aria-label': t('einst.sprache') },
    SPRACHEN.map((code) => h('button', {
      class: 'lang-pill', type: 'button',
      'aria-pressed': code === aktuell ? 'true' : 'false',
      disabled: code !== 'de',
      title: code !== 'de' ? t('einst.sprache.geplant') : null,
      onclick: (code === 'de' && code !== aktuell)
        ? async () => { await setSprache(code); if (reRender) reRender(); }
        : null,
    }, code.toUpperCase())));
}

/* Schlichter, klickbarer Level-Chip (führt zum Profil). Gamification dezent. */
function levelChip(level) {
  return h('button', {
    class: 'level-chip', type: 'button', 'aria-label': t('profil.titel'),
    onclick: () => { location.hash = '#profil'; },
  }, icon('award'), t('start.level', { n: level }));
}

/* Lernabzeichen. erfuellt(s) prüft den aggregierten Profil-Stand.
 * Tagessieger/Bestanden bleiben gesperrt, bis Daily Challenge bzw. Prüfungsmodus existieren. */
const BADGES = [
  { key: 'erste', icon: 'walk', erfuellt: (s) => s.beantwortet >= 1 },
  { key: 'wissensdurst', icon: 'book', erfuellt: (s) => s.versuche >= 100 },
  { key: 'makellos', icon: 'target', erfuellt: (s) => s.makellos },
  { key: 'brennt', icon: 'flame', erfuellt: (s) => s.streak >= 3 },
  { key: 'tagessieger', icon: 'trophy', erfuellt: (s) => !!s.tagessieger },
  { key: 'bestanden', icon: 'school', erfuellt: (s) => !!s.bestanden },
];

/* Lokaler Datums-Key (YYYY-MM-DD) für das Tagesquiz. */
function heuteKey() {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ---------- Prüfungs-Timer (sessionübergreifend, ein Intervall) ---------- */
const PRUEF_DAUER_MS = 10 * 60 * 1000; // 10 Minuten
let _pruefEnde = 0;
let _pruefTimer = null;

function startPruefungsTimer() {
  _pruefEnde = Date.now() + PRUEF_DAUER_MS;
  stopPruefungsTimer();
  _pruefTimer = setInterval(pruefTick, 1000);
  pruefTick();
}
function stopPruefungsTimer() {
  if (_pruefTimer) { clearInterval(_pruefTimer); _pruefTimer = null; }
}
async function pruefTick() {
  const s = aktuelleSession();
  if (!s || s.spielmodus !== 'pruefung') { stopPruefungsTimer(); return; }
  const rest = Math.max(0, _pruefEnde - Date.now());
  const el = document.getElementById('pruef-timer-text');
  if (el) {
    const sek = Math.round(rest / 1000);
    el.textContent = `${Math.floor(sek / 60)}:${String(sek % 60).padStart(2, '0')}`;
  }
  if (rest <= 0) { stopPruefungsTimer(); const z = await sessionAbschliessen(); renderSessionEnde(z); }
}

function setView(node) {
  const app = document.getElementById('app');
  app.innerHTML = '';
  node.classList.add('view');
  app.appendChild(node);
  window.scrollTo(0, 0);
  // Fokus auf die Überschrift für Screenreader/Tastatur
  const titel = node.querySelector('h1, h2');
  if (titel) { titel.setAttribute('tabindex', '-1'); titel.focus({ preventScroll: true }); }
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function getModus() {
  const m = localStorage.getItem(LS_MODUS);
  return ['einsteiger', 'standard', 'experte'].includes(m) ? m : 'standard';
}
function setModus(m) { localStorage.setItem(LS_MODUS, m); }

/* ---------- Kopfzeile ---------- */

function kopf(opts = {}) {
  const links = opts.zurueck
    ? h('button', { class: 'kopf-zurueck', onclick: opts.zurueck }, icon('arrow-left'), t('allg.zurueck'))
    : h('button', { class: 'kopf-titel', 'aria-label': 'Bilateralis', onclick: () => { location.hash = '#start'; } },
        h('span', { class: 'logo' }, logoMark(26), h('span', { class: 'wordmark' }, 'Bilateralis')));
  const gear = h('button', {
    class: 'kopf-gear', 'aria-label': t('einst.titel'), title: t('einst.titel'),
    onclick: () => { location.hash = '#einstellungen'; },
  }, icon('settings'));
  return h('header', { class: 'kopf' }, links, gear);
}

/* ---------- Toast & Modal (auch von report.js genutzt) ---------- */

export function toast(nachricht, typ = 'info') {
  const c = document.getElementById('toast-container');
  const el = h('div', { class: 'toast toast-' + typ, role: 'status' }, nachricht);
  c.appendChild(el);
  setTimeout(() => { el.classList.add('weg'); setTimeout(() => el.remove(), 300); }, 3500);
}

export function toastAktion(nachricht, jaText, onJa, neinText) {
  const c = document.getElementById('toast-container');
  const el = h('div', { class: 'toast toast-aktion', role: 'alert' },
    h('span', { class: 'toast-text' }, nachricht),
    h('div', { class: 'toast-buttons' },
      h('button', { class: 'btn btn-mini btn-primaer', onclick: () => { el.remove(); if (onJa) onJa(); } }, jaText),
      h('button', { class: 'btn btn-mini btn-sekundaer', onclick: () => el.remove() }, neinText || t('update.nein'))));
  c.appendChild(el);
}

export function oeffneModal(inhalt) {
  const root = document.getElementById('modal-root');
  root.innerHTML = '';
  const backdrop = h('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === backdrop) schliesseModal(); } }, inhalt);
  root.appendChild(backdrop);
  document.addEventListener('keydown', _escSchliessen);
  const fokus = inhalt.querySelector('input, textarea, button');
  if (fokus) fokus.focus();
}
export function schliesseModal() {
  document.getElementById('modal-root').innerHTML = '';
  document.removeEventListener('keydown', _escSchliessen);
}
function _escSchliessen(e) { if (e.key === 'Escape') schliesseModal(); }

/* ---------- Start ---------- */

/* ---------- Landingpage (Domain-Einstieg) ---------- */

export function renderLanding() {
  const view = h('div', { class: 'landing' },
    h('span', { class: 'logo' }, logoMark(34), h('span', { class: 'wordmark' }, 'Bilateralis')),
    h('h1', { class: 'landing-hero' }, t('landing.titel')),
    h('p', { class: 'landing-lead' }, t('landing.lead')),
    h('button', {
      class: 'btn btn-primaer btn-block',
      onclick: () => { try { localStorage.setItem(LS_SEEN_LANDING, '1'); } catch (e) { /* Storage evtl. blockiert */ } location.hash = '#start'; },
    }, t('landing.cta'), icon('arrow-right')),
    h('div', { class: 'vertrauen' },
      h('div', { class: 'vertrauen-punkt' }, icon('file-check'), t('landing.p1')),
      h('div', { class: 'vertrauen-punkt' }, icon('scale'), t('landing.p2')),
      h('div', { class: 'vertrauen-punkt' }, icon('language'), t('landing.p3'))),
    langSwitch(renderLanding));
  setView(view);
}

/* ---------- Start ---------- */

export async function renderStart() {
  stopPruefungsTimer(); // evtl. laufenden Prüfungs-Timer beenden
  // Level + Fortschritt zum nächsten Level aus profilStatistik (eine Quelle, konsistent mit dem Profil).
  let level = 1, pct = 0;
  try {
    const s = await profilStatistik();
    level = s.level;
    pct = s.zumNaechsten / 20 * 100;
  } catch (e) { /* DB evtl. noch nicht bereit */ }

  const dailyErledigt = (() => { try { return localStorage.getItem('quiz_daily_done') === heuteKey(); } catch (e) { return false; } })();

  const modusKachel = (iconName, titelKey, textKey, onclick, hinweis) =>
    h('button', { class: 'modus-kachel', onclick },
      h('span', { class: 'einstieg-icon' }, icon(iconName)),
      h('span', { class: 'modus-kachel-titel' }, t(titelKey)),
      h('span', { class: 'modus-kachel-text' }, hinweis || t(textKey)));

  const view = h('div', {},
    h('div', { class: 'start-topbar' },
      h('span', { class: 'logo' }, logoMark(26), h('span', { class: 'wordmark' }, 'Bilateralis')),
      h('div', { class: 'start-topbar-rechts' },
        levelChip(level),
        h('button', { class: 'kopf-gear', 'aria-label': t('einst.titel'), title: t('einst.titel'), onclick: () => { location.hash = '#einstellungen'; } }, icon('settings')))),
    h('div', { class: 'start-progress progress', 'aria-hidden': 'true' }, h('span', { style: `width:${pct.toFixed(1)}%` })),
    h('div', { class: 'hero' },
      h('h1', {}, t('start.willkommen')),
      h('p', { class: 'hero-lead' }, t('start.lead'))),
    h('button', { class: 'btn btn-primaer btn-block', onclick: () => starteUndZeige({ modus: getModus(), anzahl: 10 }) }, icon('cards'), t('start.starten')),
    h('div', { class: 'modus-grid' },
      modusKachel('calendar-event', 'start.daily.titel', 'start.daily.text',
        () => starteUndZeige({ spielmodus: 'daily', datumKey: heuteKey(), anzahl: 10 }),
        dailyErledigt ? t('start.daily.erledigt') : null),
      modusKachel('clock-hour-4', 'start.pruefung.titel', 'start.pruefung.text',
        () => starteUndZeige({ spielmodus: 'pruefung' })),
      modusKachel('target-arrow', 'start.kategorien.titel', 'start.kategorien.text', () => { location.hash = '#kategorien'; }),
      modusKachel('refresh', 'start.weiterlernen.titel', 'start.weiterlernen.text', () => starteUndZeige({ modus: getModus(), anzahl: 10 }))),
    h('p', { class: 'methode' }, icon('file-check'), t('start.methode')),
    langSwitch(renderStart));
  setView(view);
}

/* ---------- Profil & Fortschritt ---------- */

export async function renderProfil() {
  let s = { beantwortet: 0, versuche: 0, quote: 0, gemeistert: 0, level: 1, zumNaechsten: 0, streak: 0, makellos: false };
  try { s = await profilStatistik(); } catch (e) { /* DB evtl. nicht bereit */ }

  const levelKopf = h('div', { class: 'card profil-level' },
    h('span', { class: 'profil-level-icon' }, icon('award')),
    h('div', { class: 'profil-level-text' },
      h('div', { class: 'profil-level-num' }, t('start.level', { n: s.level })),
      h('div', { class: 'profil-level-sub' }, t('profil.zumNaechsten', { n: 20 - s.zumNaechsten })),
      h('div', { class: 'progress', 'aria-hidden': 'true' }, h('span', { style: `width:${(s.zumNaechsten / 20 * 100).toFixed(1)}%` }))));

  const metrik = (num, labelKey) => h('div', { class: 'metric' },
    h('div', { class: 'metric-num' }, String(num)),
    h('div', { class: 'metric-label' }, t(labelKey)));

  const kennzahlen = h('div', { class: 'kennzahl-raster' },
    metrik(s.beantwortet, 'profil.beantwortet'),
    metrik(s.quote + '%', 'profil.quote'),
    metrik(s.gemeistert, 'profil.gemeistert'));

  const badges = h('div', { class: 'badge-raster' },
    BADGES.map((b) => {
      const errungen = b.erfuellt(s);
      return h('div', { class: 'badge-kachel ' + (errungen ? 'errungen' : 'gesperrt') },
        icon(b.icon, 'badge-kachel-icon'),
        h('div', { class: 'badge-kachel-text-wrap' },
          h('div', { class: 'badge-kachel-titel' }, t('badge.' + b.key + '.titel')),
          h('div', { class: 'badge-kachel-text' }, t('badge.' + b.key + '.text'))));
    }));

  const view = h('div', {},
    kopf({ zurueck: () => { location.hash = '#start'; } }),
    h('div', { class: 'seiten-kopf' }, h('h1', {}, t('profil.titel'))),
    levelKopf,
    h('h2', { class: 'profil-abschnitt' }, t('profil.kennzahlen')),
    kennzahlen,
    h('h2', { class: 'profil-abschnitt' }, t('profil.badges')),
    badges);
  setView(view);
}

/* ---------- Kategorien ---------- */

export async function renderKategorien() {
  const stats = await statistikProDossier();
  const liste = h('div', { class: 'kat-liste' });
  stats.forEach((s) => {
    liste.appendChild(katKachel(s));
  });
  const view = h('div', {},
    kopf({ zurueck: () => { location.hash = '#start'; } }),
    h('div', { class: 'seiten-kopf' },
      h('h1', {}, t('kategorien.titel')),
      h('p', { class: 'hero-lead' }, t('kategorien.lead'))),
    liste);
  setView(view);
}

function katKachel(s) {
  const offen = Math.max(0, s.gesamt - s.gemeistert - s.falsch);
  const pct = (n) => (s.gesamt ? (n / s.gesamt * 100).toFixed(1) : 0);
  const balken = h('div', {
    class: 'balken', role: 'img',
    'aria-label': t('a11y.fortschrittsbalken', { gemeistert: s.gemeistert, falsch: s.falsch, offen }),
  },
    h('span', { class: 'balken-gemeistert', style: `width:${pct(s.gemeistert)}%` }),
    h('span', { class: 'balken-falsch', style: `width:${pct(s.falsch)}%` }),
    h('span', { class: 'balken-offen', style: `width:${pct(offen)}%` }));

  return h('button', {
    class: 'kat-kachel',
    onclick: () => { location.hash = '#kategorie/' + encodeURIComponent(s.dossier); },
  },
    h('span', { class: 'kat-name' }, s.dossier),
    h('span', { class: 'kat-anzahl' }, t('kategorie.fragenAnzahl', { n: s.gesamt })),
    balken,
    h('span', { class: 'kat-legende' },
      h('span', { class: 'leg leg-gemeistert' }, `${s.gemeistert} ${t('kategorie.gemeistert')}`),
      h('span', { class: 'leg leg-falsch' }, `${s.falsch} ${t('kategorie.falsch')}`),
      h('span', { class: 'leg leg-offen' }, `${offen} ${t('kategorie.offen')}`)));
}

export async function renderKategorieDetail(dossier) {
  const stats = await statistikProDossier();
  const s = stats.find((x) => x.dossier === dossier) || { dossier, gesamt: 0, gemeistert: 0, falsch: 0 };
  const offen = Math.max(0, s.gesamt - s.gemeistert - s.falsch);
  const view = h('div', {},
    kopf({ zurueck: () => { location.hash = '#kategorien'; } }),
    h('div', { class: 'seiten-kopf' }, h('h1', {}, dossier)),
    h('div', { class: 'card' },
      h('p', {}, t('kategorie.fragenAnzahl', { n: s.gesamt })),
      h('ul', { class: 'detail-stats' },
        h('li', { class: 'leg-gemeistert' }, `${s.gemeistert} ${t('kategorie.gemeistert')}`),
        h('li', { class: 'leg-falsch' }, `${s.falsch} ${t('kategorie.falsch')}`),
        h('li', { class: 'leg-offen' }, `${offen} ${t('kategorie.offen')}`)),
      h('button', { class: 'btn btn-primaer btn-block', onclick: () => starteUndZeige({ dossier, modus: getModus(), anzahl: 10 }) }, t('kategorie.ueben'))));
  setView(view);
}

/* ---------- Quiz-Fluss ---------- */

async function starteUndZeige(opts) {
  await startSession(opts);
  if (opts.spielmodus === 'pruefung') startPruefungsTimer(); else stopPruefungsTimer();
  history.replaceState(null, '', '#quiz');
  zeigeAktuelleFrage();
}

export function zeigeAktuelleFrage() {
  const frage = aktuelleFrage();
  if (!frage) { location.hash = '#start'; return; }
  setView(renderFrage(frage));
}

function renderFrage(frage) {
  const info = fortschrittInfo();

  const card = h('div', { class: 'card frage-card' });

  const session = aktuelleSession();
  const istPruefung = !!(session && session.spielmodus === 'pruefung');
  if (istPruefung) {
    const restSek = Math.max(0, Math.round((_pruefEnde - Date.now()) / 1000));
    const initialZeit = `${Math.floor(restSek / 60)}:${String(restSek % 60).padStart(2, '0')}`;
    card.append(h('div', { class: 'pruef-timer' },
      icon('clock-hour-4'), h('span', { id: 'pruef-timer-text' }, initialZeit)));
  }

  card.append(
    h('div', { class: 'frage-meta' },
      h('span', { class: 'frage-fortschritt' }, t('frage.fortschritt', { n: info.index, total: info.total })),
      frage.dossier ? h('span', { class: 'tag tag-dossier' }, frage.dossier) : null,
      h('span', { class: 'tag tag-' + frage.schwierigkeit }, t('schwierigkeit.' + frage.schwierigkeit))),
    h('h2', { class: 'frage-text' }, frage.frage));

  // Tooltip-Hinweis direkt unter dem Fragetext – nur wenn nicht leer (gilt für alle Formate)
  if (frage.tooltip && String(frage.tooltip).trim() !== '') {
    card.append(h('div', { class: 'tooltip-hint' },
      h('span', { class: 'tooltip-icon' }, icon('info-circle')),
      h('span', { class: 'tooltip-text' }, frage.tooltip)));
  }

  const onAnswer = async (antwort) => {
    const res = await antworten(antwort);
    if (istPruefung) { weiter(); return; } // Prüfung: kein Zwischen-Feedback, direkt weiter
    zeigeAuswertung(frage, res, antwort);
  };

  let body, collect = null;
  switch (frage.format) {
    case 'mythos_oder_fakt': body = renderMythosFakt(frage, onAnswer); break;
    case 'schaetzfrage': body = renderSchaetzfrage(frage, onAnswer); break;
    case 'zuordnung': ({ el: body, collect } = renderZuordnung(frage)); break;
    // vergleiche_positionen ist eigenständig: eigener Prüfen/Weiter-Button + Inline-Auswertung
    case 'vergleiche_positionen': body = renderVergleiche(frage); break;
    default: body = renderWasStehtDrin(frage, onAnswer);
  }
  card.append(body);

  if (frage.format === 'zuordnung') {
    card.append(h('button', {
      class: 'btn btn-primaer btn-block',
      onclick: async () => {
        const ant = collect(); const res = await antworten(ant);
        if (istPruefung) { weiter(); return; }
        zeigeAuswertung(frage, res, ant);
      },
    }, t('frage.pruefen')));
  }

  card.append(h('button', {
    class: 'melden-flag', 'aria-label': t('frage.melden'), title: t('frage.melden'),
    onclick: () => oeffneMeldeModal(frage),
  }, icon('flag')));

  return card;
}

/* ---------- Format-Renderer ---------- */

function renderWasStehtDrin(frage, onAnswer) {
  return h('div', { class: 'optionen' },
    (frage.options || []).map((opt, i) =>
      h('button', { class: 'option', dataset: { i }, onclick: () => onAnswer(i) },
        h('span', { class: 'opt-letter' }, OPT_BUCHSTABEN[i] || String(i + 1)), opt)));
}

function renderMythosFakt(frage, onAnswer) {
  return h('div', { class: 'optionen optionen-zwei' },
    (frage.options || []).map((opt, i) =>
      h('button', { class: 'option option-gross', dataset: { i }, onclick: () => onAnswer(i) }, opt)));
}

function renderSchaetzfrage(frage, onAnswer) {
  return h('div', { class: 'optionen optionen-zahl' },
    (frage.options || []).map((opt, i) =>
      h('button', { class: 'option option-zahl', dataset: { i }, onclick: () => onAnswer(i) }, opt)));
}

function renderZuordnung(frage) {
  const pairs = frage.pairs || [];
  const rechts = shuffle(pairs.map((p, j) => ({ text: p.right, orig: j })));
  const selects = [];
  const el = h('div', { class: 'zuordnung' },
    h('p', { class: 'format-hinweis' }, t('frage.zuordnung.hinweis')),
    pairs.map((p, i) => {
      const sel = h('select', { class: 'zuordnung-select', 'aria-label': p.left },
        h('option', { value: '' }, t('frage.zuordnung.platzhalter')),
        rechts.map((r) => h('option', { value: String(r.orig) }, r.text)));
      selects[i] = sel;
      return h('div', { class: 'zuordnung-zeile' },
        h('span', { class: 'zuordnung-links' }, p.left), sel);
    }));
  const collect = () => selects.map((s) => (s.value === '' ? -1 : parseInt(s.value, 10)));
  return { el, collect };
}

// vergleiche_positionen: Info-Format mit Inline-Auswertung direkt auf der Karte (kein Screenwechsel).
function renderVergleiche(frage) {
  const aussagen = frage.aussagen || [];
  const quellen = shuffle(Array.from(new Set(aussagen.map((a) => a.quelle))));
  const container = h('div', { class: 'vergleiche' }, h('p', { class: 'format-hinweis' }, t('frage.vergleiche.hinweis')));
  const zeilen = [];

  aussagen.forEach((a) => {
    const sel = h('select', { class: 'zuordnung-select', 'aria-label': a.text },
      h('option', { value: '' }, t('frage.vergleiche.quelleWaehlen')),
      quellen.map((q) => h('option', { value: q }, q)));
    const status = h('span', { class: 'zeile-status', 'aria-hidden': 'true', hidden: true });
    const fehler = h('p', { class: 'feld-fehler', role: 'alert', hidden: true }, t('frage.bitteQuelle'));
    const korrektHinweis = h('div', { class: 'korrekt-hinweis', hidden: true });
    const zeile = h('div', { class: 'vergleiche-zeile' },
      h('span', { class: 'vergleiche-aussage' }, a.text),
      h('div', { class: 'vergleiche-eingabe' }, sel, status),
      fehler, korrektHinweis);
    sel.addEventListener('change', () => { fehler.hidden = true; zeile.classList.remove('zeile-fehler'); });
    zeilen.push({ zeile, sel, status, fehler, korrektHinweis });
    container.appendChild(zeile);
  });

  const btn = h('button', { class: 'btn btn-primaer btn-block' }, t('frage.pruefen'));
  let geprueft = false;
  btn.addEventListener('click', async () => {
    if (geprueft) { weiter(); return; }

    // Validierung: jedes leere Dropdown inline markieren – kein Alert, kein Toast
    let alleOk = true;
    zeilen.forEach((z) => {
      if (z.sel.value === '') { z.fehler.hidden = false; z.zeile.classList.add('zeile-fehler'); alleOk = false; }
    });
    if (!alleOk) return;

    const antwort = zeilen.map((z) => z.sel.value);
    const res = await antworten(antwort);
    (res.ergebnisJeAussage || []).forEach((e, i) => {
      const z = zeilen[i];
      z.sel.disabled = true;
      z.fehler.hidden = true;
      z.status.hidden = false;
      if (e.korrekt) {
        z.zeile.classList.add('zeile-richtig');
        z.status.classList.add('status-richtig');
        z.status.appendChild(icon('check'));
      } else {
        z.zeile.classList.add('zeile-falsch');
        z.status.classList.add('status-falsch');
        z.status.appendChild(icon('x'));
        z.korrektHinweis.append(icon('check'), document.createTextNode(e.korrekteQuelle));
        z.korrektHinweis.hidden = false;
      }
    });

    if (frage.erklaerung) container.insertBefore(h('div', { class: 'erklaerung' }, h('h3', {}, t('auswertung.erklaerung')), h('p', {}, frage.erklaerung)), btn);
    if (frage.referenz) container.insertBefore(h('p', { class: 'referenz' }, icon('file-check'), t('auswertung.referenz') + ': ' + frage.referenz), btn);

    btn.textContent = t('auswertung.weiter');
    geprueft = true;
  });
  container.appendChild(btn);
  return container;
}

/* ---------- Auswertung ---------- */

function zeigeAuswertung(frage, res, antwort) {
  const card = h('div', { class: 'card auswertung-card' });

  // Fragetext zuoberst – damit auf dem Auswertungsscreen klar ist, worum es ging (alle Formate)
  card.append(h('div', { class: 'auswertung-frage' }, frage.frage));

  if (res.info) {
    // Info-Format (vergleiche_positionen): keine Wertung, nur Auflösung
    card.append(h('div', { class: 'banner banner-info' },
      h('span', { class: 'banner-icon' }, icon('info-circle')),
      h('span', {}, t('auswertung.aufloesung'))));
    const liste = h('ul', { class: 'aufloesung-liste' },
      (frage.aussagen || []).map((a) =>
        h('li', {}, h('span', { class: 'a-aussage' }, a.text), h('span', { class: 'a-quelle' }, a.quelle))));
    card.append(liste);
  } else {
    const korrekt = res.korrekt;
    card.append(h('div', { class: 'banner ' + (korrekt ? 'banner-richtig' : 'banner-falsch') },
      h('span', { class: 'banner-icon' }, icon(korrekt ? 'check' : 'x')),
      h('span', {}, korrekt ? t('auswertung.richtig') : t('auswertung.falsch'))));
    card.append(aufloesungFuerFormat(frage, res, antwort));
  }

  if (frage.erklaerung) {
    card.append(h('div', { class: 'erklaerung' },
      h('h3', {}, t('auswertung.erklaerung')), h('p', {}, frage.erklaerung)));
  }
  if (frage.referenz) {
    card.append(h('p', { class: 'referenz' }, icon('file-check'), t('auswertung.referenz') + ': ' + frage.referenz));
  }
  card.append(h('button', { class: 'btn btn-primaer btn-block', onclick: weiter }, t('auswertung.weiter'), icon('arrow-right')));
  setView(card);
}

function aufloesungFuerFormat(frage, res, antwort) {
  if (frage.format === 'zuordnung') {
    const pairs = frage.pairs || [];
    // Pro Zeile grün/rot anhand der Nutzer-Zuordnung. Fallback (z. B. fehlendes
    // ergebnisJePair): alle als richtig anzeigen, damit die Auflösung trotzdem rendert.
    const ergebnisse = res.ergebnisJePair
      || pairs.map((p) => ({ left: p.left, sollText: p.right, gewaehltText: p.right, korrekt: true }));
    return h('ul', { class: 'aufloesung-liste' },
      ergebnisse.map((e) => {
        const kinder = [
          h('span', { class: 'a-aussage' },
            icon(e.korrekt ? 'check' : 'x', e.korrekt ? 'status-richtig' : 'status-falsch'),
            e.left),
          h('span', { class: 'a-quelle' }, e.sollText),
        ];
        if (!e.korrekt) {
          kinder.push(h('span', { class: 'a-quelle a-quelle-falsch' },
            t('auswertung.deineAntwort') + ': ' + (e.gewaehltText || '–')));
        }
        return h('li', { class: e.korrekt ? 'zeile-richtig' : 'zeile-falsch' }, kinder);
      }));
  }
  // Optionsformate: Optionen mit richtig/falsch markieren
  const opts = frage.options || [];
  return h('div', { class: 'optionen optionen-aufloesung' },
    opts.map((opt, i) => {
      const istKorrekt = i === res.loesung;
      const istGewaehlt = i === antwort;
      let cls = 'option';
      if (istKorrekt) cls += ' option-richtig';
      else if (istGewaehlt) cls += ' option-falsch';
      const marker = istKorrekt ? icon('check', 'opt-icon') : (istGewaehlt ? icon('x', 'opt-icon') : null);
      return h('div', { class: cls },
        h('span', { class: 'opt-letter' }, OPT_BUCHSTABEN[i] || String(i + 1)), opt, marker);
    }));
}

async function weiter() {
  const naechste = naechsteFrage();
  if (naechste) { zeigeAktuelleFrage(); return; }
  const z = await sessionAbschliessen();
  renderSessionEnde(z);
}

/* ---------- Sitzungsende ---------- */

/* Ergebnis-Ring: Anteil richtig als Kreis-Fortschritt mit Prozentzahl in der Mitte. */
function resultRing(richtig, total) {
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs) => { const el = document.createElementNS(NS, tag); for (const k in attrs) el.setAttribute(k, attrs[k]); return el; };
  const pct = total > 0 ? Math.round(richtig / total * 100) : 0;
  const r = 52, c = 2 * Math.PI * r;
  const svg = mk('svg', { class: 'result-ring', width: 140, height: 140, viewBox: '0 0 140 140', role: 'img', 'aria-label': t('ende.ergebnis', { richtig, total }) });
  svg.appendChild(mk('circle', { cx: 70, cy: 70, r, fill: 'none', stroke: 'var(--c-surface-2)', 'stroke-width': 8 }));
  svg.appendChild(mk('circle', {
    cx: 70, cy: 70, r, fill: 'none', stroke: 'var(--c-brand)', 'stroke-width': 8, 'stroke-linecap': 'round',
    'stroke-dasharray': c.toFixed(1), 'stroke-dashoffset': (c * (1 - pct / 100)).toFixed(1), transform: 'rotate(-90 70 70)',
  }));
  const num = mk('text', { x: 70, y: 67, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'result-ring-num' });
  num.textContent = pct + '%';
  const lbl = mk('text', { x: 70, y: 90, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'result-ring-label' });
  lbl.textContent = t('ende.richtigAnteil');
  svg.appendChild(num); svg.appendChild(lbl);
  return svg;
}

export function renderSessionEnde(z) {
  stopPruefungsTimer(); // falls aus der Prüfung kommend
  z = z || { richtig: 0, total: 0, info: 0 };
  // Tagesquiz als heute erledigt merken (für die Tile-Anzeige)
  if (z.spielmodus === 'daily') { try { localStorage.setItem('quiz_daily_done', heuteKey()); } catch (e) { /* ok */ } }

  const card = h('div', { class: 'card ende-card' }, h('h1', {}, t('ende.titel')));

  // Prüfungs-Verdikt: bestanden/nicht bestanden (Korrektheits-Ergebnis -> grün/rot zulässig)
  if (z.spielmodus === 'pruefung') {
    const ok = !!z.bestanden;
    card.append(h('div', { class: 'banner ' + (ok ? 'banner-richtig' : 'banner-falsch') },
      h('span', { class: 'banner-icon' }, icon(ok ? 'school' : 'x')),
      h('span', {}, ok ? t('ende.bestanden') : t('ende.nichtBestanden'))));
  }

  card.append(
    resultRing(z.richtig, z.total),
    h('div', { class: 'ende-metriken' },
      h('div', { class: 'metric' },
        h('div', { class: 'metric-num' }, String(z.richtig)),
        h('div', { class: 'metric-label' }, t('auswertung.richtig'))),
      h('div', { class: 'metric' },
        h('div', { class: 'metric-num' }, String(z.total)),
        h('div', { class: 'metric-label' }, t('ende.fragen')))));
  if (z.info) card.append(h('p', { class: 'ende-info' }, t('ende.infoformate', { n: z.info })));
  card.append(h('div', { class: 'ende-aktionen' },
    h('button', { class: 'btn btn-primaer btn-block', onclick: () => starteUndZeige({ modus: getModus(), anzahl: 10 }) }, t('ende.weiterUeben'), icon('arrow-right')),
    h('button', { class: 'btn btn-sekundaer btn-block', onclick: () => { location.hash = '#start'; } }, t('ende.startseite'))));

  setView(h('div', {}, kopf(), card));
}

/* ---------- Einstellungen ---------- */

export function renderEinstellungen() {
  // Änderungen werden zwischengespeichert (staged) und erst über den Speichern-Button übernommen.
  let stagedSprache = getSprache();
  let stagedModus = getModus();

  const speichernBtn = h('button', {
    id: 'btn-einstellungen-speichern', class: 'btn btn-primaer btn-speichern', disabled: true,
  }, t('einst.speichern'));

  const markiereGeaendert = () => {
    speichernBtn.disabled = (stagedSprache === getSprache() && stagedModus === getModus());
  };

  const sprachWahl = h('div', { class: 'einst-gruppe' },
    h('label', { class: 'einst-label', for: 'sprach-select' }, t('einst.sprache')),
    h('select', {
      id: 'sprach-select', class: 'einst-select',
      onchange: (e) => { stagedSprache = e.target.value; markiereGeaendert(); },
    }, SPRACHEN.map((code) =>
      // FR/IT sind noch nicht erfasst -> vorerst nicht wählbar (als „in Vorbereitung" sichtbar)
      h('option', {
        value: code, selected: code === getSprache(), disabled: code !== 'de',
      }, t('einst.sprache.' + code) + (code === 'de' ? '' : ' (' + t('einst.sprache.geplant') + ')')))));

  const modusWahl = h('fieldset', { class: 'einst-gruppe' },
    h('legend', { class: 'einst-label' }, t('einst.modus')),
    ['einsteiger', 'standard', 'experte'].map((m) =>
      h('label', { class: 'einst-radio' },
        h('input', {
          type: 'radio', name: 'modus', value: m, checked: m === stagedModus,
          onchange: () => { stagedModus = m; markiereGeaendert(); },
        }),
        h('span', {}, h('strong', {}, t('einst.modus.' + m)), h('small', {}, t('einst.modus.' + m + '.text'))))));

  speichernBtn.addEventListener('click', async () => {
    setModus(stagedModus);
    if (stagedSprache !== getSprache()) await setSprache(stagedSprache);
    speichernBtn.disabled = true;
    speichernBtn.textContent = t('einst.gespeichert');
    setTimeout(() => { location.hash = '#start'; }, 1500);
  });

  const reset = h('button', {
    class: 'btn btn-gefahr btn-block',
    onclick: async () => {
      if (confirm(t('einst.reset.bestaetigen'))) { await resetAlles(); toast(t('einst.reset.erfolg'), 'erfolg'); }
    },
  }, t('einst.reset'));

  const view = h('div', {},
    kopf({ zurueck: () => { location.hash = '#start'; } }),
    h('div', { class: 'seiten-kopf' }, h('h1', {}, t('einst.titel'))),
    h('div', { class: 'card' }, sprachWahl, modusWahl, speichernBtn, reset));
  setView(view);
}

/* ---------- Fehleranzeige ---------- */

export function renderFehler(nachricht) {
  setView(h('div', {}, kopf(), h('div', { class: 'card' }, h('p', {}, nachricht))));
}
