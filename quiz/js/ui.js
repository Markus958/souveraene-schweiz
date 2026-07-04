/* ui.js – zentrales DOM-Rendering. Alle DOM-Operationen liegen hier.
 * Screens: Start, Kategorien, Kategorie-Detail, Frage, Auswertung, Sitzungsende, Einstellungen.
 * Plus format-spezifische Renderer, Auswertungs-Feedback, Toast und Modal-Helfer.
 */

import { t, getSprache, setSprache, SPRACHEN } from './i18n.js';
import {
  startSession, aktuelleFrage, antworten, naechsteFrage, fortschrittInfo,
  sessionAbschliessen, statistikProDossier, getFragenPool, getPoolMeta,
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
    ? h('button', { class: 'kopf-zurueck', 'aria-label': t('allg.zurueck'), onclick: opts.zurueck }, '‹ ' + t('allg.zurueck'))
    : h('button', { class: 'kopf-titel', onclick: () => { location.hash = '#start'; } }, t('app.titel'));
  const gear = h('button', {
    class: 'kopf-gear', 'aria-label': t('einst.titel'), title: t('einst.titel'),
    onclick: () => { location.hash = '#einstellungen'; },
  }, '⚙');
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

export function renderStart() {
  const eintrag = (titelKey, textKey, onclick) =>
    h('button', { class: 'einstieg', onclick },
      h('span', { class: 'einstieg-titel' }, t(titelKey)),
      h('span', { class: 'einstieg-text' }, t(textKey)));

  const meta = getPoolMeta();
  const gd = String(meta.generated || '').split('-');
  const datum = gd.length === 3 ? `${gd[2]}.${gd[1]}.${gd[0]}` : (meta.generated || '');
  const anzahl = meta.total || getFragenPool().length;
  const version = meta.version || meta.generated || '';

  const view = h('div', {},
    kopf(),
    h('div', { class: 'hero' },
      h('h1', {}, t('start.willkommen')),
      h('p', { class: 'hero-lead' }, t('start.lead'))),
    h('div', { class: 'einstieg-liste' },
      eintrag('start.schnellstart.titel', 'start.schnellstart.text', () => starteUndZeige({ modus: getModus(), anzahl: 10 })),
      eintrag('start.kategorien.titel', 'start.kategorien.text', () => { location.hash = '#kategorien'; }),
      eintrag('start.weiterlernen.titel', 'start.weiterlernen.text', () => starteUndZeige({ modus: getModus(), anzahl: 10 }))));
  if (version || anzahl) {
    view.appendChild(h('p', { class: 'pool-info' }, t('start.poolinfo', { version, datum, n: anzahl })));
  }
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
  card.append(
    h('div', { class: 'frage-meta' },
      h('span', { class: 'frage-fortschritt' }, t('frage.fortschritt', { n: info.index, total: info.total })),
      h('span', { class: 'badge badge-' + frage.schwierigkeit }, t('schwierigkeit.' + frage.schwierigkeit))),
    h('h2', { class: 'frage-text' }, frage.frage));

  // Tooltip-Hinweis direkt unter dem Fragetext – nur wenn nicht leer (gilt für alle Formate)
  if (frage.tooltip && String(frage.tooltip).trim() !== '') {
    card.append(h('div', { class: 'tooltip-hint' },
      h('span', { class: 'tooltip-icon', 'aria-hidden': 'true' }, 'ℹ'),
      h('span', { class: 'tooltip-text' }, frage.tooltip)));
  }

  const onAnswer = async (antwort) => {
    const res = await antworten(antwort);
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
      onclick: async () => { const ant = collect(); const res = await antworten(ant); zeigeAuswertung(frage, res, ant); },
    }, t('frage.pruefen')));
  }

  card.append(h('button', {
    class: 'melden-flag', 'aria-label': t('frage.melden'), title: t('frage.melden'),
    onclick: () => oeffneMeldeModal(frage),
  }, '⚑'));

  return card;
}

/* ---------- Format-Renderer ---------- */

function renderWasStehtDrin(frage, onAnswer) {
  return h('div', { class: 'optionen' },
    (frage.options || []).map((opt, i) =>
      h('button', { class: 'option', dataset: { i }, onclick: () => onAnswer(i) }, opt)));
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
        z.status.textContent = '✓';
      } else {
        z.zeile.classList.add('zeile-falsch');
        z.status.classList.add('status-falsch');
        z.status.textContent = '✗';
        z.korrektHinweis.textContent = e.korrekteQuelle;
        z.korrektHinweis.hidden = false;
      }
    });

    if (frage.erklaerung) container.insertBefore(h('div', { class: 'erklaerung' }, h('h3', {}, t('auswertung.erklaerung')), h('p', {}, frage.erklaerung)), btn);
    if (frage.referenz) container.insertBefore(h('p', { class: 'referenz' }, t('auswertung.referenz') + ': ' + frage.referenz), btn);

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
    card.append(h('div', { class: 'banner banner-info' }, t('auswertung.aufloesung')));
    const liste = h('ul', { class: 'aufloesung-liste' },
      (frage.aussagen || []).map((a) =>
        h('li', {}, h('span', { class: 'a-aussage' }, a.text), h('span', { class: 'a-quelle' }, a.quelle))));
    card.append(liste);
  } else {
    const korrekt = res.korrekt;
    card.append(h('div', { class: 'banner ' + (korrekt ? 'banner-richtig' : 'banner-falsch') },
      h('span', { class: 'banner-icon', 'aria-hidden': 'true' }, korrekt ? '✓' : '✗'),
      h('span', {}, korrekt ? t('auswertung.richtig') : t('auswertung.falsch'))));
    card.append(aufloesungFuerFormat(frage, res, antwort));
  }

  if (frage.erklaerung) {
    card.append(h('div', { class: 'erklaerung' },
      h('h3', {}, t('auswertung.erklaerung')), h('p', {}, frage.erklaerung)));
  }
  if (frage.referenz) {
    card.append(h('p', { class: 'referenz' }, t('auswertung.referenz') + ': ' + frage.referenz));
  }
  card.append(h('button', { class: 'btn btn-primaer btn-block', onclick: weiter }, t('auswertung.weiter')));
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
            h('span', { class: e.korrekt ? 'status-richtig' : 'status-falsch', 'aria-hidden': 'true' },
              e.korrekt ? '✓ ' : '✗ '),
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
      const icon = istKorrekt ? '✓ ' : (istGewaehlt ? '✗ ' : '');
      return h('div', { class: cls }, h('span', { 'aria-hidden': 'true' }, icon), opt);
    }));
}

async function weiter() {
  const naechste = naechsteFrage();
  if (naechste) { zeigeAktuelleFrage(); return; }
  const z = await sessionAbschliessen();
  renderSessionEnde(z);
}

/* ---------- Sitzungsende ---------- */

export function renderSessionEnde(z) {
  const view = h('div', {},
    kopf(),
    h('div', { class: 'card ende-card' },
      h('h1', {}, t('ende.titel')),
      h('p', { class: 'ende-ergebnis' }, t('ende.ergebnis', { richtig: z.richtig, total: z.total })),
      z.info ? h('p', { class: 'ende-info' }, t('ende.infoformate', { n: z.info })) : null,
      h('div', { class: 'ende-aktionen' },
        h('button', { class: 'btn btn-primaer btn-block', onclick: () => starteUndZeige({ modus: getModus(), anzahl: 10 }) }, t('ende.weiterUeben')),
        h('button', { class: 'btn btn-sekundaer btn-block', onclick: () => { location.hash = '#start'; } }, t('ende.startseite')))));
  setView(view);
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

  const verlassen = h('button', {
    class: 'btn btn-sekundaer btn-block',
    onclick: () => { location.hash = '#start'; },
  }, t('einst.verlassen'));

  const view = h('div', {},
    kopf({ zurueck: () => { location.hash = '#start'; } }),
    h('div', { class: 'seiten-kopf' }, h('h1', {}, t('einst.titel'))),
    h('div', { class: 'card' }, sprachWahl, modusWahl, speichernBtn, verlassen, reset));
  setView(view);
}

/* ---------- Fehleranzeige ---------- */

export function renderFehler(nachricht) {
  setView(h('div', {}, kopf(), h('div', { class: 'card' }, h('p', {}, nachricht))));
}
