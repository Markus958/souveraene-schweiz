/* db.js – Promise-basierter IndexedDB-Wrapper für das CH–EU Quiz.
 * Speichert Lernfortschritt, Sitzungen, Statistiken und Offline-Meldungen.
 * Nutzerdaten ausschliesslich hier (nie in localStorage).
 */

const DB_NAME = 'chedu-quiz';
const DB_VERSION = 1;

export const STORES = {
  FORTSCHRITT: 'fortschritt',
  SITZUNGEN: 'sitzungen',
  STATISTIKEN: 'statistiken',
  MELDUNGEN: 'meldungen',
};

let _dbPromise = null;

export function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORES.FORTSCHRITT)) {
        // { id, leitner_box, naechste_wiederholung, richtig_count, falsch_count, letzte_antwort }
        db.createObjectStore(STORES.FORTSCHRITT, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.SITZUNGEN)) {
        // { id(auto), datum, fragen_ids, ergebnisse, dossier, modus }
        db.createObjectStore(STORES.SITZUNGEN, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(STORES.STATISTIKEN)) {
        // { dossier, gesamt, gemeistert, falsch, unbeantwortet }
        db.createObjectStore(STORES.STATISTIKEN, { keyPath: 'dossier' });
      }
      if (!db.objectStoreNames.contains(STORES.MELDUNGEN)) {
        // { id(auto), payload, zeitstempel } – Offline-Warteschlange für Meldungen
        db.createObjectStore(STORES.MELDUNGEN, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function _req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function _store(name, mode) {
  const db = await openDB();
  return db.transaction(name, mode).objectStore(name);
}

export async function dbGet(store, key) {
  return _req((await _store(store, 'readonly')).get(key));
}
export async function dbGetAll(store) {
  return _req((await _store(store, 'readonly')).getAll());
}
export async function dbPut(store, value) {
  return _req((await _store(store, 'readwrite')).put(value));
}
export async function dbDelete(store, key) {
  return _req((await _store(store, 'readwrite')).delete(key));
}
export async function dbClear(store) {
  return _req((await _store(store, 'readwrite')).clear());
}

/** Fortschritt aller Fragen als Map id -> record. */
export async function fortschrittMap() {
  const alle = await dbGetAll(STORES.FORTSCHRITT);
  const map = new Map();
  alle.forEach((r) => map.set(r.id, r));
  return map;
}

/** Kompletter Reset aller Nutzerdaten (Lernfortschritt, Sitzungen, Statistiken). */
export async function resetAlles() {
  await Promise.all([
    dbClear(STORES.FORTSCHRITT),
    dbClear(STORES.SITZUNGEN),
    dbClear(STORES.STATISTIKEN),
  ]);
}
