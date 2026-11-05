(() => {
  'use strict';
  const root = document.getElementById('epaperStatus');
  if (!root) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const labels = {success:'erfolgreich', pending:'ausstehend', failed:'fehlgeschlagen', disabled:'deaktiviert', fallback:'fehlgeschlagen', running:'läuft'};
  const label = value => labels[String(value || 'pending')] || String(value || 'ausstehend');
  const fmt = value => value ? new Intl.DateTimeFormat('de-CH', {dateStyle:'medium', timeStyle:'short', timeZone:'Europe/Zurich'}).format(new Date(value)) : '–';
  const step = (title, status, detail) => `<div class="epaper-step"><strong>${esc(title)}</strong><div class="epaper-step-status ${esc(status)}">${esc(label(status))}</div><div class="epaper-step-detail">${esc(detail || '')}</div></div>`;
  function render(data) {
    const issue = data.issue || {}, current = data.current_attempt || {}, ai = current.editorial_ai || {};
    const overall = current.complete ? 'success' : (current.overall_status === 'failed' ? 'failed' : 'pending');
    const edition = issue.edition === 'nzzas' ? 'NZZ am Sonntag' : 'NZZ';
    const runUrl = /^https:\/\/github\.com\//.test(current.run_url || '') ? current.run_url : '';
    const previous = data.last_successful || {};
    root.innerHTML = `<div class="epaper-status-head"><div><h2>NZZ-E-Paper – Status</h2><div class="epaper-status-meta">${esc(edition)} · Ausgabe ${esc(issue.issue_date || issue.target_date || 'unbekannt')} · zuerst erkannt ${esc(fmt(issue.first_detected_at))}</div></div><span class="epaper-overall ${overall}">${esc(current.complete ? 'vollständig' : label(current.overall_status))}</span></div>
      <div class="epaper-steps">
        ${step('1. NZZ-Ausgabe heruntergeladen', current.download?.status, `PDF: ${label(current.pdf_validation?.status)} · ${current.download?.error || current.pdf_validation?.error || 'Ausgabe verfügbar'}`)}
        ${step('2. Artikel extrahiert', current.extraction?.status, `${current.articles_detected ?? 0} erkannt · ${current.new_articles ?? 0} neu${current.extraction?.error ? ` · ${current.extraction.error}` : ''}`)}
        ${step('3. KI-Redaktion abgeschlossen', ai.status, `${ai.model || 'kein Modell'} · ${ai.analysed_articles ?? 0} analysiert · ${ai.selected_articles ?? 0} ausgewählt${ai.error ? ` · ${ai.error}` : ''}`)}
      </div>
      <div class="epaper-status-foot"><span>Letzte Prüfung: ${esc(fmt(current.checked_at))}</span><span>Nächster Versuch: ${esc(fmt(current.next_attempt_at))}</span><span>Versuche: ${esc(issue.attempts ?? 0)}</span><span>Letzte erfolgreiche KI: ${esc(fmt(ai.last_successful_at))}</span>${runUrl ? `<a href="${esc(runUrl)}" target="_blank" rel="noopener">GitHub-Actions-Lauf</a>` : ''}${previous.at ? `<span>Letzter vollständiger Lauf: ${esc(fmt(previous.at))}</span>` : ''}</div>`;
  }
  fetch(`../data/monitor/status/nzz-epaper.json?ts=${Date.now()}`, {cache:'no-store'})
    .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
    .then(render)
    .catch(() => { root.querySelector('.epaper-status-meta').textContent = 'Noch keine Statusdaten vorhanden.'; });
})();
