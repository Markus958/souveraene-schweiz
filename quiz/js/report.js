/* report.js – Melde-Formular für fehlerhafte/unklare Fragen.
 * Sendet an Formspree; bei fehlendem Netz wird die Meldung in IndexedDB
 * zwischengespeichert und beim nächsten Online-Besuch automatisch gesendet.
 */

import { t, getSprache } from './i18n.js';
import { STORES, dbPut, dbGetAll, dbDelete } from './db.js';
import { toast, oeffneModal, schliesseModal } from './ui.js';

// Ersetze PLATZHALTER mit deiner Formspree-Formular-ID nach Registrierung auf formspree.io
const FORMSPREE_ENDPOINT = 'https://formspree.io/f/PLATZHALTER';

export function oeffneMeldeModal(frage) {
  const card = document.createElement('div');
  card.className = 'modal-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-label', t('melden.titel'));
  card.innerHTML = `
    <h2 class="modal-titel">${t('melden.titel')}</h2>
    <fieldset class="melden-gruende">
      <legend>${t('melden.frage')}</legend>
      <label class="check"><input type="checkbox" name="grund" value="antwort_falsch" /> <span>${t('melden.antwortFalsch')}</span></label>
      <label class="check"><input type="checkbox" name="grund" value="unklar" /> <span>${t('melden.unklar')}</span></label>
      <label class="check"><input type="checkbox" name="grund" value="anderes" /> <span>${t('melden.anderes')}</span></label>
    </fieldset>
    <label class="melden-feld">${t('melden.details')}
      <textarea name="details" rows="3"></textarea>
    </label>
    <label class="melden-feld">${t('melden.email')}
      <input type="email" name="email" autocomplete="email" inputmode="email" />
      <small class="hinweis">${t('melden.emailHinweis')}</small>
    </label>
    <p class="melden-fehler" role="alert" hidden></p>
    <div class="modal-aktionen">
      <button type="button" class="btn btn-sekundaer" data-action="abbrechen">${t('allg.abbrechen')}</button>
      <button type="button" class="btn btn-primaer" data-action="senden">${t('melden.senden')}</button>
    </div>`;

  card.querySelector('[data-action="abbrechen"]').addEventListener('click', schliesseModal);
  card.querySelector('[data-action="senden"]').addEventListener('click', () => absenden(frage, card));
  oeffneModal(card);
}

function sammleGruende(card) {
  return Array.from(card.querySelectorAll('input[name="grund"]:checked')).map((c) => c.value);
}

async function absenden(frage, card) {
  const fehlerEl = card.querySelector('.melden-fehler');
  const gruende = sammleGruende(card);
  if (gruende.length === 0) {
    fehlerEl.textContent = t('melden.bitteAuswahl');
    fehlerEl.hidden = false;
    return;
  }
  const payload = {
    fragen_id: frage.id,
    dossier: frage.dossier,
    sprache: getSprache(),
    zeitstempel: new Date().toISOString(),
    gruende,
    details: (card.querySelector('textarea[name="details"]').value || '').trim(),
    email: (card.querySelector('input[name="email"]').value || '').trim(),
  };
  schliesseModal();
  const ok = await sendePayload(payload);
  if (ok) {
    toast(t('melden.erfolg'), 'erfolg');
  } else {
    try { await dbPut(STORES.MELDUNGEN, { payload, zeitstempel: payload.zeitstempel }); } catch (e) {}
    toast(t('melden.offline'), 'info');
  }
}

async function sendePayload(payload) {
  // Endpoint noch nicht konfiguriert -> lokal puffern (kein echter Versand)
  if (FORMSPREE_ENDPOINT.includes('PLATZHALTER')) return false;
  if (!navigator.onLine) return false;
  try {
    const res = await fetch(FORMSPREE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

/** Gepufferte Meldungen senden, sobald wieder online (von app.js aufgerufen). */
export async function sendeOfflineMeldungen() {
  if (!navigator.onLine) return;
  let offen;
  try { offen = await dbGetAll(STORES.MELDUNGEN); } catch (e) { return; }
  for (const eintrag of offen) {
    const ok = await sendePayload(eintrag.payload);
    if (ok) { try { await dbDelete(STORES.MELDUNGEN, eintrag.id); } catch (e) {} }
  }
}
