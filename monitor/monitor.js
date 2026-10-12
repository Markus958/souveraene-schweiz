const ROOT = '/data/monitor/reports/';
let currentReport = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

function norm(value) {
  return String(value ?? '').toLocaleLowerCase('de-CH');
}

function epaperLabel(source) {
  const url = String(source?.url || '');
  const match = url.match(/#page=(\d+)/i);
  if (!match) return null;
  const name = String(source?.name || '').toLowerCase().includes('sonntag') ? 'NZZ am Sonntag E-Paper' : 'NZZ E-Paper';
  return `${name} – Seite ${match[1]}`;
}

function sourceLink(source, labelPrefix = '') {
  if (!source || !source.url) return '';
  const label = epaperLabel(source) || source.title || source.name || source.url;
  return `<a class="source" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(labelPrefix)}${esc(label)}</a>`;
}

function newsPool(report) {
  return Array.isArray(report.news_candidates) ? report.news_candidates : (report.news || []);
}

function renderMetrics(report) {
  const q = report.quality || {};
  const procedureChanges = (report.procedures || []).filter(p => p.status === 'changed').length;
  const riskChanges = (report.risks || []).filter(r => r.change_recommended === 'Ja').length;
  const riskIncomplete = q.risk_incomplete || 0;
  const candidates = newsPool(report);
  const selected = (report.news || []).length;
  document.getElementById('metrics').innerHTML = `
    <div class="metric"><span>News ab Post-Potenzial 5/10</span><b>${candidates.length}</b></div>
    <div class="metric"><span>Davon Tagesauswahl</span><b>${selected}</b></div>
    <div class="metric"><span>EU-Verfahrensänderungen</span><b>${procedureChanges}</b></div>
    <div class="metric"><span>Risiko-Änderungen</span><b>${riskChanges}</b></div>
    <div class="metric"><span>Risiko-Prüfung unvollständig</span><b>${riskIncomplete}</b></div>
    <div class="metric"><span>Quellen erfolgreich</span><b>${esc(q.sources_successful ?? 0)}/${esc(q.sources_attempted ?? 0)}</b></div>`;
}

function matchesSearch(parts, term) {
  if (!term) return true;
  return norm(parts.filter(Boolean).join(' ')).includes(term);
}

function filterReport(report) {
  const term = norm(document.getElementById('searchInput').value.trim());
  const status = document.getElementById('statusFilter').value;
  const dossier = document.getElementById('dossierFilter').value;
  const changesOnly = document.getElementById('changesOnly').checked;

  const news = newsPool(report).filter(item => {
    if (dossier !== 'all' && dossier !== 'news') return false;
    if (status !== 'all' && item.status !== status) return false;
    if (changesOnly && !['Neu','Update','Korrektur','Unklar'].includes(item.status)) return false;
    const sourceText = (item.sources || []).flatMap(s => [s.name, s.title]).join(' ');
    return matchesSearch([
      item.weekday, item.date, item.headline, item.summary, item.why_important,
      (item.relevance_factors || []).join(' '), item.status, item.source_stage,
      (item.risk_dossiers || []).join(' '), sourceText,
    ], term);
  });

  const procedures = (report.procedures || []).filter(item => {
    if (dossier !== 'all' && dossier !== 'eu') return false;
    if (status !== 'all' && item.status !== status) return false;
    if (changesOnly && item.status !== 'changed') return false;
    return matchesSearch([
      item.watch_id, item.page, item.status,
      (item.references || []).join(' '),
      (item.documents || []).join(' '),
      (item.dates || []).join(' '),
    ], term);
  });

  const risks = (report.risks || []).filter(item => {
    if (dossier !== 'all' && dossier !== item.topic) return false;
    if (status !== 'all' && item.status !== status) return false;
    if (changesOnly && item.change_recommended !== 'Ja') return false;
    const sourceText = (item.sources || []).flatMap(s => [s.source_name, s.title]).join(' ');
    return matchesSearch([
      item.date, item.topic, item.status, item.news_text,
      (item.news || []).join(' '), sourceText,
      (item.failed_p1_sources || []).join(' '),
      (item.missing_p1_sources || []).join(' '),
    ], term);
  });

  return {news, procedures, risks};
}

function renderNews(items) {
  const root = document.getElementById('news');
  if (!items.length) {
    root.innerHTML = '<div class="empty">Keine News-Kandidaten mit Post-Potenzial von mindestens 5/10 für diese Auswahl.</div>';
    return;
  }
  root.innerHTML = items.map(item => `
    <article class="card">
      <div class="meta"><span>${esc(item.weekday || '')}${item.date ? `, ${esc(item.date)}` : ''}</span><span>${esc(item.status)}</span>${item.source_stage ? `<span>${esc(item.source_stage)}</span>` : ''}${item.selected ? '<span><strong>Tagesauswahl</strong></span>' : ''}</div>
      <h3>${esc(item.headline)}</h3>
      <p><strong>Kurzfassung:</strong> ${esc(item.summary || '-')}</p>
      <p><strong>Warum wichtig:</strong> ${esc(item.why_important || '-')}</p>
      <p><strong>Post-Potenzial:</strong> ${esc(item.post_potential)}/10</p>
      ${item.source ? `<div><strong>Quelle:</strong> ${sourceLink(item.source)}</div>` : '<div><strong>Quelle:</strong> -</div>'}
      ${(item.risk_dossiers || []).length ? `<div class="meta">Risikodossier: ${esc(item.risk_dossiers.join(' · '))}</div>` : ''}
    </article>`).join('');
}

function renderProcedures(items) {
  const root = document.getElementById('procedures');
  if (!items.length) {
    root.innerHTML = '<div class="empty">Keine passenden EU-Verfahrenseinträge für diese Auswahl.</div>';
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
    root.innerHTML = '<div class="empty">Keine passenden Risiko-Dossiers für diese Auswahl.</div>';
    return;
  }
  root.innerHTML = items.map(item => {
    const incomplete = item.source_check_complete === false;
    const failed = [...(item.failed_p1_sources || []), ...(item.missing_p1_sources || [])];
    const source = item.primary_source;
    return `
      <article class="card">
        <h3>${esc(item.date || currentReport?.date || '')}: ${esc(item.topic)}</h3>
        <p><strong>Neuigkeit:</strong> ${esc(item.news_text || '-')}</p>
        <p><strong>Änderung Website empfohlen:</strong> <span class="${item.change_recommended === 'Ja' ? 'yes' : 'no'}">${esc(item.change_recommended)}</span></p>
        ${source ? `<div><strong>Primärquelle:</strong> ${sourceLink({name: source.source_name, title: source.title, url: source.url})}</div>` : ''}
        ${incomplete ? `<div class="meta"><strong>Quellenprüfung unvollständig:</strong> ${esc(failed.join(', ') || 'mindestens eine erforderliche P1-Quelle')}</div>` : ''}
      </article>`;
  }).join('');
}

function renderFiltered() {
  if (!currentReport) return;
  const filtered = filterReport(currentReport);
  renderNews(filtered.news);
  renderProcedures(filtered.procedures);
  renderRisks(filtered.risks);

  const visible = filtered.news.length + filtered.procedures.length + filtered.risks.length;
  const total = newsPool(currentReport).length + (currentReport.procedures || []).length + (currentReport.risks || []).length;
  document.getElementById('filterSummary').textContent = visible === total
    ? `${total} Einträge`
    : `${visible} von ${total} Einträgen angezeigt`;
}

async function loadReport(path) {
  const response = await fetch(ROOT + path, {cache:'no-store'});
  if (!response.ok) throw new Error(`Report ${path} konnte nicht geladen werden.`);
  currentReport = await response.json();
  const rel = document.getElementById('reliability');
  rel.textContent = currentReport.run_reliability === 'complete' ? 'Quellenlage vollständig' : 'Quellenlage unvollständig';
  rel.className = 'status' + (currentReport.run_reliability === 'complete' ? '' : ' incomplete');
  renderMetrics(currentReport);
  renderFiltered();
}

function bindFilters() {
  for (const id of ['searchInput','statusFilter','dossierFilter','changesOnly']) {
    const el = document.getElementById(id);
    el.addEventListener(id === 'searchInput' ? 'input' : 'change', renderFiltered);
  }
}

async function init() {
  const select = document.getElementById('reportSelect');
  bindFilters();
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
