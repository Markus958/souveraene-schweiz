const ROOT = '/data/monitor/reports/';

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

function sourceLink(source) {
  if (!source || !source.url) return '';
  const label = source.title || source.name || source.url;
  return `<a class="source" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
}

function renderMetrics(report) {
  const q = report.quality || {};
  const procedureChanges = (report.procedures || []).filter(p => p.status === 'changed').length;
  const riskChanges = (report.risks || []).filter(r => r.change_recommended === 'Ja').length;
  document.getElementById('metrics').innerHTML = `
    <div class="metric"><span>News ausgewählt</span><b>${(report.news || []).length}</b></div>
    <div class="metric"><span>EU-Verfahrensänderungen</span><b>${procedureChanges}</b></div>
    <div class="metric"><span>Risiko-Änderungen</span><b>${riskChanges}</b></div>
    <div class="metric"><span>Quellen erfolgreich</span><b>${esc(q.sources_successful ?? 0)}/${esc(q.sources_attempted ?? 0)}</b></div>`;
}

function renderNews(items) {
  const root = document.getElementById('news');
  if (!items.length) {
    root.innerHTML = '<div class="empty">Keine neuen Meldungen mit ausreichender Relevanz für den Tagesreport.</div>';
    return;
  }
  root.innerHTML = items.map(item => `
    <article class="card">
      <div class="meta"><span>${esc(item.status)}</span><span>Post-Potenzial ${esc(item.post_potential)}/20</span></div>
      <h3>${esc(item.headline)}</h3>
      ${item.why_important?.length ? `<div class="meta">Relevanzsignale: ${esc(item.why_important.join(', '))}</div>` : ''}
      ${(item.sources || []).map(sourceLink).join('')}
    </article>`).join('');
}

function renderProcedures(items) {
  const root = document.getElementById('procedures');
  if (!items.length) {
    root.innerHTML = '<div class="empty">Keine überwachten Verfahren verfügbar.</div>';
    return;
  }
  root.innerHTML = items.map(item => `
    <article class="card">
      <div class="meta"><span>${esc(item.status)}</span><span>${esc(item.page)}</span></div>
      <h3>${esc((item.references || []).join(' · ') || item.watch_id)}</h3>
      ${(item.documents || []).length ? `<div>Dokumente: ${esc(item.documents.join(', '))}</div>` : ''}
      ${item.url ? `<a class="source" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">Verfahrensseite öffnen</a>` : ''}
    </article>`).join('');
}

function renderRisks(items) {
  const root = document.getElementById('risks');
  if (!items.length) {
    root.innerHTML = '<div class="empty">Keine Risiko-Dossiers verfügbar.</div>';
    return;
  }
  root.innerHTML = items.map(item => `
    <div class="risk-row">
      <div><strong>${esc(item.topic)}</strong>${item.news?.length ? `<div class="meta">${esc(item.news.join(' · '))}</div>` : ''}</div>
      <div>${esc(item.status)}</div>
      <div>Website ändern: <span class="${item.change_recommended === 'Ja' ? 'yes' : 'no'}">${esc(item.change_recommended)}</span></div>
    </div>`).join('');
}

async function loadReport(path) {
  const response = await fetch(ROOT + path, {cache:'no-store'});
  if (!response.ok) throw new Error(`Report ${path} konnte nicht geladen werden.`);
  const report = await response.json();
  const rel = document.getElementById('reliability');
  rel.textContent = report.run_reliability === 'complete' ? 'Quellenlage vollständig' : 'Quellenlage unvollständig';
  rel.className = 'status' + (report.run_reliability === 'complete' ? '' : ' incomplete');
  renderMetrics(report);
  renderNews(report.news || []);
  renderProcedures(report.procedures || []);
  renderRisks(report.risks || []);
}

async function init() {
  const select = document.getElementById('reportSelect');
  try {
    const response = await fetch(ROOT + 'index.json', {cache:'no-store'});
    if (!response.ok) throw new Error('Archivindex konnte nicht geladen werden.');
    const index = await response.json();
    const reports = index.reports || [];
    if (!reports.length) throw new Error('Noch keine Tagesberichte im Archiv.');
    select.innerHTML = reports.map(r => `<option value="${esc(r.path)}">${esc(r.date)}</option>`).join('');
    select.addEventListener('change', () => loadReport(select.value));
    await loadReport(reports[0].path);
  } catch (error) {
    document.getElementById('news').innerHTML = `<div class="empty">${esc(error.message)}</div>`;
  }
}

init();
