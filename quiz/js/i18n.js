/* i18n.js – einfacher Lade- und Übersetzungs-Helfer.
 * Lädt locales/{sprache}.json und stellt t(key, params) bereit.
 * Sprache aus localStorage, sonst navigator.language, Fallback 'de'.
 * Kein Interface-Text ist im Code hartcodiert – alles kommt aus den Locale-Dateien.
 */

export const SPRACHEN = ['de', 'fr', 'it'];
const LS_KEY = 'quiz_sprache';
const FALLBACK = 'de';

let _strings = {};
let _fallback = {};
let _sprache = FALLBACK;

function ermittleSprache() {
  const gespeichert = localStorage.getItem(LS_KEY);
  if (gespeichert && SPRACHEN.includes(gespeichert)) return gespeichert;
  const nav = (navigator.language || 'de').slice(0, 2).toLowerCase();
  return SPRACHEN.includes(nav) ? nav : FALLBACK;
}

async function ladeStrings(code) {
  const res = await fetch(`locales/${code}.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error('locale ' + code + ' nicht ladbar');
  return res.json();
}

export async function initI18n() {
  _sprache = ermittleSprache();
  try { _fallback = await ladeStrings(FALLBACK); } catch (e) { _fallback = {}; }
  if (_sprache === FALLBACK) {
    _strings = _fallback;
  } else {
    try {
      _strings = await ladeStrings(_sprache);
    } catch (e) {
      _strings = _fallback;
      _sprache = FALLBACK;
    }
  }
  document.documentElement.lang = _sprache;
  return _sprache;
}

/** Übersetzt key; {platzhalter} werden aus params ersetzt. Fällt auf Deutsch, dann auf den key zurück. */
export function t(key, params) {
  let s = (_strings && _strings[key] != null) ? _strings[key]
        : (_fallback && _fallback[key] != null) ? _fallback[key]
        : key;
  if (params) {
    Object.keys(params).forEach((k) => {
      s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), String(params[k]));
    });
  }
  return s;
}

export function getSprache() { return _sprache; }

export async function setSprache(code) {
  if (!SPRACHEN.includes(code)) return;
  localStorage.setItem(LS_KEY, code);
  await initI18n();
}
