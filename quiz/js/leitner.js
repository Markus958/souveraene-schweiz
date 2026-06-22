/* leitner.js – 5-Box-Wiederholungsalgorithmus.
 * Box 1: jede Session · Box 2: jede 2. · Box 3: jede 4. · Box 4: jede 8.
 * Box 5: «gemeistert» – erscheint nur im Experten-/Challenge-Modus.
 * Richtige Antwort: Box +1. Falsche Antwort: zurück auf Box 1. Neue Fragen: Box 1.
 */

export const MAX_BOX = 5;
const LS_SESSION = 'quiz_session_zaehler';
const BOX_KADENZ = { 1: 1, 2: 2, 3: 4, 4: 8 }; // Sessions-Intervall je Box

export function sessionZaehler() {
  return parseInt(localStorage.getItem(LS_SESSION) || '0', 10);
}
export function sessionZaehlerErhoehen() {
  const n = sessionZaehler() + 1;
  localStorage.setItem(LS_SESSION, String(n));
  return n;
}

export function naechsteBox(box, korrekt) {
  if (!korrekt) return 1;
  return Math.min(MAX_BOX, (box || 1) + 1);
}

function istFaellig(box, sessionIndex, modus) {
  if (box >= MAX_BOX) return modus === 'experte'; // gemeisterte Fragen nur im Experten-Modus
  const kad = BOX_KADENZ[box] || 1;
  return sessionIndex % kad === 0;
}

function modusErlaubt(frage, modus) {
  if (modus === 'einsteiger') return frage.schwierigkeit !== 'schwer';
  return true;
}

/**
 * Liefert die Fragen-Auswahl für eine Session, gewichtet nach Box-Fälligkeit.
 * @param {Array} alleFragen  – alle Fragen aus dem Pool
 * @param {Map} fMap          – Map<id, fortschritt-record>
 * @param {Object} opts       – { anzahl, dossier, modus }
 * @returns {Array} Auswahl an Frage-Objekten
 */
export function getFragenFuerSession(alleFragen, fMap, opts) {
  const anzahl = opts.anzahl || 10;
  const modus = opts.modus || 'standard';
  const sessionIndex = sessionZaehler() + 1; // die Session, die gerade startet

  const kandidaten = alleFragen.filter((f) => {
    if (opts.dossier && f.dossier !== opts.dossier) return false;
    return modusErlaubt(f, modus);
  });

  const bewertet = kandidaten.map((f) => {
    const rec = fMap.get(f.id);
    const box = rec ? rec.leitner_box : 1;
    const neu = !rec;
    return { frage: f, box, neu, faellig: neu || istFaellig(box, sessionIndex, modus) };
  });

  let auswahl = bewertet.filter((b) => b.faellig);

  // Zu wenige fällige Fragen? Mit nicht-fälligen auffüllen (niedrigste Box zuerst).
  if (auswahl.length < anzahl) {
    const rest = bewertet.filter((b) => !b.faellig);
    auswahl = auswahl.concat(rest);
  }

  auswahl.sort((a, b) => {
    if (a.faellig !== b.faellig) return a.faellig ? -1 : 1;
    if (a.box !== b.box) return a.box - b.box; // niedrige Box (dringender) zuerst
    return Math.random() - 0.5;               // innerhalb gleicher Box mischen
  });

  return auswahl.slice(0, anzahl).map((b) => b.frage);
}
