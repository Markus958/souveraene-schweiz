/* quiz.js – Zustand und Logik einer laufenden Quiz-Session.
 * Hält den geladenen Fragenpool und die aktuelle Session im Speicher,
 * wertet Antworten je Format aus und schreibt Fortschritt/Sitzungen/Statistiken.
 */

import { STORES, dbGet, dbPut, fortschrittMap } from './db.js';
import { getFragenFuerSession, naechsteBox, sessionZaehlerErhoehen, MAX_BOX } from './leitner.js';

let _pool = [];
let _session = null;

export function setFragenPool(arr) { _pool = Array.isArray(arr) ? arr : []; }
export function getFragenPool() { return _pool; }
export function findeFrage(id) { return _pool.find((f) => f.id === id); }

export function aktuelleSession() { return _session; }
export function aktuelleFrage() { return _session ? _session.fragen[_session.index] : null; }

export function fortschrittInfo() {
  if (!_session) return { index: 0, total: 0 };
  return { index: _session.index + 1, total: _session.fragen.length };
}
export function istLetzteFrage() {
  return _session ? _session.index >= _session.fragen.length - 1 : true;
}

export async function startSession(opts = {}) {
  const fMap = await fortschrittMap();
  const fragen = getFragenFuerSession(_pool, fMap, {
    anzahl: opts.anzahl || 10,
    dossier: opts.dossier || null,
    modus: opts.modus || 'standard',
  });
  sessionZaehlerErhoehen();
  _session = {
    fragen,
    index: 0,
    modus: opts.modus || 'standard',
    dossier: opts.dossier || null,
    ergebnisse: [],
    startDatum: new Date().toISOString(),
  };
  return _session;
}

function istInfoFormat(frage) { return frage.format === 'vergleiche_positionen'; }

/** Bewertet eine Antwort je Format. korrekt=null bei Info-Format (vergleiche_positionen). */
function bewerte(frage, antwort) {
  switch (frage.format) {
    case 'was_steht_wirklich_drin':
    case 'mythos_oder_fakt':
    case 'schaetzfrage':
      return { korrekt: antwort === frage.correct_option, loesung: frage.correct_option };
    case 'zuordnung': {
      // antwort[i] = Original-Index des für links i gewählten rechten Eintrags
      const n = (frage.pairs || []).length;
      const ok = Array.isArray(antwort) && antwort.length === n && antwort.every((v, i) => v === i);
      return { korrekt: ok, loesung: frage.pairs };
    }
    case 'vergleiche_positionen':
      return { korrekt: null, loesung: (frage.aussagen || []).map((a) => a.quelle) };
    default:
      return { korrekt: false, loesung: null };
  }
}

async function aktualisiereFortschritt(frage, korrekt) {
  const rec = (await dbGet(STORES.FORTSCHRITT, frage.id)) || {
    id: frage.id, leitner_box: 1, naechste_wiederholung: null,
    richtig_count: 0, falsch_count: 0, letzte_antwort: null,
  };
  if (korrekt === null) {
    rec.letzte_antwort = Date.now(); // Info-Format: nur als gesehen markieren, Box unverändert
    await dbPut(STORES.FORTSCHRITT, rec);
    return;
  }
  rec.leitner_box = naechsteBox(rec.leitner_box, korrekt);
  if (korrekt) rec.richtig_count += 1; else rec.falsch_count += 1;
  rec.letzte_antwort = Date.now();
  await dbPut(STORES.FORTSCHRITT, rec);
}

export async function antworten(antwort) {
  const frage = aktuelleFrage();
  if (!frage) return null;
  const { korrekt, loesung } = bewerte(frage, antwort);
  await aktualisiereFortschritt(frage, korrekt);
  _session.ergebnisse.push({ id: frage.id, format: frage.format, korrekt, antwort });
  return {
    korrekt,
    loesung,
    info: istInfoFormat(frage),
    erklaerung: frage.erklaerung || '',
    referenz: frage.referenz || '',
  };
}

export function naechsteFrage() {
  if (!_session) return null;
  if (_session.index < _session.fragen.length - 1) {
    _session.index += 1;
    return aktuelleFrage();
  }
  return null;
}

export async function sessionAbschliessen() {
  if (!_session) return null;
  const sitzung = {
    datum: _session.startDatum,
    fragen_ids: _session.fragen.map((f) => f.id),
    ergebnisse: _session.ergebnisse,
    dossier: _session.dossier,
    modus: _session.modus,
  };
  try { await dbPut(STORES.SITZUNGEN, sitzung); } catch (e) { /* nicht kritisch */ }
  try {
    const stats = await statistikProDossier();
    await Promise.all(stats.map((s) => dbPut(STORES.STATISTIKEN, s)));
  } catch (e) { /* nicht kritisch */ }

  const gewertet = _session.ergebnisse.filter((e) => e.korrekt !== null);
  const richtig = gewertet.filter((e) => e.korrekt).length;
  const info = _session.ergebnisse.filter((e) => e.korrekt === null).length;
  const zusammenfassung = {
    total: gewertet.length,
    richtig,
    falsch: gewertet.length - richtig,
    info,
    ergebnisse: _session.ergebnisse,
  };
  _session = null;
  return zusammenfassung;
}

/** Live-Statistik je Dossier aus Pool + Fortschritt (gemeistert/zu wiederholen/offen). */
export async function statistikProDossier() {
  const fMap = await fortschrittMap();
  const proDossier = new Map();
  _pool.forEach((f) => {
    if (!proDossier.has(f.dossier)) {
      proDossier.set(f.dossier, { dossier: f.dossier, gesamt: 0, gemeistert: 0, falsch: 0, unbeantwortet: 0 });
    }
    const s = proDossier.get(f.dossier);
    s.gesamt += 1;
    const rec = fMap.get(f.id);
    if (!rec) s.unbeantwortet += 1;
    else if (rec.leitner_box >= MAX_BOX) s.gemeistert += 1;
    else s.falsch += 1;
  });
  return Array.from(proDossier.values()).sort((a, b) => a.dossier.localeCompare(b.dossier, 'de'));
}
