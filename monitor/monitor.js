const ROOT = '/data/monitor/reports/';
const DAILY_WORKFLOW_URL = 'https://github.com/Markus958/souveraene-schweiz/actions/workflows/monitor-news.yml';
let reports = [];
const historyCache = new Map();

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

function norm(value) {
  return String(value ?? '').toLocaleLowerCase('de-CH');
}

function fmtDate(value) {
  if (!value) return '';
  const [y,m,d] = String(value).split('-');
  return y && m && d ? `${d}.${m}.${y}` : String(value);
}

function fmtTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('de-CH', {
    timeZone:'Europe/Zurich', hour:'2-digit', minute:'2-digit', hour12:false
  }).format(date);
}

function epaperPage(source) {
  if (source?.page) return source.page;
  const match = String(source?.url || '').match(/#page=(\d+)/i);
  return match ? match[1] : '';
}

function isEpaper(source) {
  return String(source?.role || '').includes('early_epaper') || /epaper\.nzz\.ch/i.test(String(source?.url || ''));
}

function articleTitle(item) {
  const source = item.source || {};
  const title = esc(item.headline || '-');
  const info = `<button class="article-info-toggle" type="button" aria-expanded="false" title="Kurzinhalt anzeigen">ⓘ</button>`;
  if (source.url && !isEpaper(source)) {
    return `<a class="article-link" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${title}</a>${info}`;
  }
  return `<span class="article-link">${title}</span>${info}`;
}

function sourceDisplay(item) {
  if (item.source_display) return item.source_display;
  const source = item.source || {};
  const name = String(source.name || '');
  if (isEpaper(source) || /NZZ/i.test(name)) return 'NZZ';
  return name || '-';
}

function pageDisplay(item) {
  return item.page || epaperPage(item.source) || '-';
}

function newsPool(report) {
  return Array.isArray(report.news) ? report.news : [];
}

function hitCount(report) {
  return newsPool(report).length + (report.procedures || []).length + (report.risks || []).length;
}

function matchesSearch(parts, term) {
  if (!term) return true;
  return norm(parts.filter(Boolean).join(' ')).includes(term);
}

function currentFilters() {
  return {
    term: norm(document.getElementById('searchInput').value.trim()),
    status: document.getElementById('statusFilter').value,
    dossier: document.getElementById('dossierFilter').value,
  };
}

function filterDay(report) {
  const {term,status,dossier} = currentFilters();
  const news = newsPool(report).filter(item => {
    if (dossier !== 'all' && dossier !== 'news') return false;
    if (status !== 'all' && item.status !== status) return false;
    const detail = item.article_detail || {};
    return matchesSearch([
      item.headline,item.summary,item.post_approach,item.why_important,item.status,item.source_stage,
      sourceDisplay(item),(item.relevance_factors || []).join(' '),(item.risk_dossiers || []).join(' '),
      detail.summary,(detail.topics || []).join(' '),(detail.figures || []).join(' ')
    ], term);
  });

  const procedures = (report.procedures || []).filter(item => {
    if (dossier !== 'all' && dossier !== 'eu') return false;
    if (status !== 'all' && item.status !== status) return false;
    return matchesSearch([
      item.watch_id,item.page,item.status,item.description,item.relevance_ch,
      (item.references || []).join(' '),(item.documents || []).join(' ')
    ], term);
  });

  const risks = (report.risks || []).filter(item => {
    if (dossier !== 'all' && dossier !== item.topic) return false;
    if (status !== 'all' && item.status !== status) return false;
    return matchesSearch([item.topic,item.status,item.news_text,(item.news || []).join(' ')], term);
  });

  return {news,procedures,risks};
}

function articleDetailHtml(item) {
  const detail = item.article_detail || {};
  const source = item.source || {};
  const summary = detail.summary || item.summary || '-';
  const topics = Array.isArray(detail.topics) ? detail.topics.filter(Boolean) : [];
  const figures = Array.isArray(detail.figures) ? detail.figures.filter(Boolean) : [];
  const sourceText = `${sourceDisplay(item)}${pageDisplay(item) !== '-' ? `, S. ${pageDisplay(item)}` : ''}`;
  const sourceLink = source.url
    ? `<a class="detail-source-link" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">Quelle öffnen</a>`
    : '';
  return `<div class="article-detail-card">
    <div class="detail-grid">
      <div><strong>Kurzfassung</strong><p>${esc(summary)}</p></div>
      ${topics.length ? `<div><strong>Kernpunkte</strong><p>${esc(topics.join(' · '))}</p></div>` : ''}
      ${figures.length ? `<div><strong>Zahlen / Grössen</strong><p>${esc(figures.join(' · '))}</p></div>` : ''}
      <div><strong>Relevanz</strong><p>${esc(detail.relevance || item.why_important || '-')}</p></div>
      <div class="detail-meta"><strong>Quelle</strong><p>${esc(sourceText)} ${sourceLink}</p></div>
    </div>
    <div class="detail-note">Automatisch verdichtet; gespeichert werden kein Artikelvolltext, sondern nur Kurzfassung und strukturierte Signale.</div>
  </div>`;
}

function renderNews(items) {
  if (!items.length) return '<div class="empty">Keine neuen News mit Post-Potenzial in diesem Lauf.</div>';
  return `<div class="table-wrap"><table class="news-table">
    <thead><tr><th class="c-nr">Nr.</th><th class="c-artikel">Artikel</th><th class="c-ressort">Ressort / Quelle</th><th class="c-page">Seite</th><th class="c-pot">Potenzial</th><th class="c-approach">Ansatz</th></tr></thead>
    <tbody>${items.map((item,i) => `<tr class="news-row">
      <td>${i+1}</td>
      <td>${articleTitle(item)}${item.status ? `<div class="small">${esc(item.status)}</div>` : ''}
        <button class="post-draft-button" type="button" data-post-item="${esc(JSON.stringify(item))}">Postvorschlag vorbereiten</button>
      </td>
      <td>${esc(sourceDisplay(item))}</td>
      <td>${esc(pageDisplay(item))}</td>
      <td class="pot">${esc(item.post_potential ?? '-')}/10</td>
      <td>${esc(item.post_approach || item.summary || '-')}</td>
    </tr><tr class="article-detail-row" hidden><td colspan="6">${articleDetailHtml(item)}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

function procedureLinks(items) {
  const links = items.filter(i => i.url).map(i => ({label:(i.references || []).join(' · ') || i.page || 'EU-Verfahren',url:i.url}));
  if (!links.length) return '';
  return `<span class="eu-links" tabindex="0">ⓘ<span class="tooltip">${links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a>`).join('')}</span></span>`;
}

function renderProcedures(items) {
  if (!items.length) return '<div class="empty">Keine neue Änderung im EU-Verfahren in diesem Lauf.</div>';
  const links = procedureLinks(items);
  return `<div class="table-wrap"><table class="eu-table">
    <thead><tr><th class="c-change">Änderung ${links}</th><th class="c-desc">Kurze Beschreibung</th><th class="c-rel">Relevanz für CH</th></tr></thead>
    <tbody>${items.map(item => `<tr>
      <td><strong>${esc(item.status === 'changed' ? 'Ja' : item.status === 'unchanged' ? 'Nein' : item.status || '-')}</strong><div class="small">${esc((item.references || []).join(' · ') || item.page || '')}</div></td>
      <td>${esc(item.description || 'Verfahrensstand gegenüber dem vorherigen vollständigen Lauf verändert.')}</td>
      <td>${esc(item.relevance_ch || 'Betrifft das EU-Verfahren zum Schweiz–EU-Paket.')}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function renderRisks(items) {
  if (!items.length) return '<div class="empty">Keine neue Entwicklung in den Risiko-Dossiers in diesem Lauf.</div>';
  return `<div class="table-wrap"><table class="risk-table">
    <thead><tr><th class="c-dossier">Dossier</th><th class="c-news">Neuigkeit</th><th class="c-change">Websiteänderung</th></tr></thead>
    <tbody>${items.map(item => `<tr>
      <td><strong>${esc(item.topic || '-')}</strong></td>
      <td>${esc(item.news_text || '-')}</td>
      <td><span class="${item.change_recommended === 'Ja' ? 'yes' : 'no'}">${esc(item.change_recommended || '-')}</span></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function renderSnapshot(report, filtered = null) {
  const data = filtered || {news: newsPool(report), procedures: report.procedures || [], risks: report.risks || []};
  return `<h3>News mit Post-Potenzial <span class="section-count">${data.news.length}</span></h3>${renderNews(data.news)}
    <h3>EU-Verfahren <span class="section-count">${data.procedures.length}</span></h3>${renderProcedures(data.procedures)}
    <h3>Risiko-Dossiers <span class="section-count">${data.risks.length}</span></h3>${renderRisks(data.risks)}`;
}

function previousRunDescriptors(report) {
  const runs = Array.isArray(report._runs) ? report._runs : [];
  return runs.filter(run => String(run.generated_at || '') !== String(report.generated_at || ''));
}

function descriptorHits(run) {
  if (Number.isFinite(Number(run.hit_count))) return Number(run.hit_count);
  return Number(run.news_count || 0) + Number(run.procedure_count || 0) + Number(run.risk_count || 0);
}

function renderHistoryShell(report) {
  const previous = previousRunDescriptors(report);
  if (!previous.length) return '';
  const totalHits = previous.reduce((sum, run) => sum + descriptorHits(run), 0);
  return `<details class="history" data-date="${esc(report.date)}">
    <summary>Frühere Auswertungen dieses Tages <span class="history-count">${previous.length} Läufe · ${totalHits} Treffer</span></summary>
    <div class="history-body"><div class="empty">Wird beim Öffnen geladen.</div></div>
  </details>`;
}

function renderDay(report) {
  const filtered = filterDay(report);
  const visible = filtered.news.length + filtered.procedures.length + filtered.risks.length;
  if (!visible && currentFilters().dossier !== 'all') return '';
  const runTime = fmtTime(report.generated_at);
  const runLabel = runTime ? `letzter Lauf: ${runTime} Uhr` : 'letzter Lauf';
  const isCurrentDay = reports[0] && String(report.date) === String(reports[0].date);
  const runButton = isCurrentDay
    ? `<a class="run-button" href="${DAILY_WORKFLOW_URL}" target="_blank" rel="noopener noreferrer">Daily Run starten</a>`
    : '';
  return `<section class="day" id="day-${esc(report.date)}">
    <div class="day-head">
      <div class="day-title"><h2>${esc(report.weekday || '')}, ${esc(fmtDate(report.date))}</h2><span class="meta">${esc(runLabel)} · ${esc(report.run_reliability === 'complete' ? 'vollständiger Lauf' : 'unvollständige Quellenlage')}</span></div>
      ${runButton}
    </div>
    ${renderSnapshot(report, filtered)}
    ${renderHistoryShell(report)}
  </section>`;
}

function renderAll() {
  const root = document.getElementById('reports');
  if (!reports.length) {
    root.innerHTML = '<div class="empty">Noch keine Tagesberichte seit dem Neustart der Monitor-Historie.</div>';
    return;
  }
  root.innerHTML = reports.map(renderDay).join('') || '<div class="empty">Keine Einträge entsprechen den gewählten Filtern.</div>';
  bindHistoryAccordions();
}

async function fetchHistoryRuns(report) {
  const date = String(report.date || '');
  if (historyCache.has(date)) return historyCache.get(date);
  const descriptors = previousRunDescriptors(report);
  const loaded = await Promise.all(descriptors.map(async descriptor => {
    try {
      const response = await fetch(ROOT + descriptor.path, {cache:'no-store'});
      if (!response.ok) return null;
      const item = await response.json();
      item._descriptor = descriptor;
      return item;
    } catch (_) { return null; }
  }));
  const result = loaded.filter(Boolean).sort((a,b) => String(b.generated_at || '').localeCompare(String(a.generated_at || '')));
  historyCache.set(date, result);
  return result;
}

function renderHistoryRuns(items) {
  if (!items.length) return '<div class="empty">Keine frühere Auswertung verfügbar.</div>';
  return items.map(item => {
    const time = fmtTime(item.generated_at) || 'Zeit unbekannt';
    const reliability = item.run_reliability === 'complete' ? 'vollständiger Lauf' : 'unvollständige Quellenlage';
    const hits = descriptorHits(item._descriptor || {}) || hitCount(item);
    return `<details class="history-run">
      <summary>${esc(time)} Uhr · ${hits} Treffer <span class="small">${esc(reliability)}</span></summary>
      <div class="history-snapshot">${renderSnapshot(item)}</div>
    </details>`;
  }).join('');
}

function bindHistoryAccordions() {
  document.querySelectorAll('details.history').forEach(details => {
    if (details.dataset.bound === '1') return;
    details.dataset.bound = '1';
    details.addEventListener('toggle', async () => {
      if (!details.open || details.dataset.loaded === '1') return;
      const report = reports.find(item => String(item.date) === String(details.dataset.date));
      if (!report) return;
      const body = details.querySelector('.history-body');
      body.innerHTML = '<div class="empty">Frühere Auswertungen werden geladen …</div>';
      const items = await fetchHistoryRuns(report);
      body.innerHTML = renderHistoryRuns(items);
      details.dataset.loaded = '1';
    });
  });
}

function renderSourceStatus(report) {
  const root = document.getElementById('sourceStatus');
  const q = report?.quality || {};
  const ok = Number(q.sources_successful || 0);
  const total = Number(q.sources_attempted || 0);
  const statuses = Array.isArray(q.source_statuses) ? q.source_statuses : [];
  root.className = 'source-status' + (ok === total && total > 0 ? '' : ' incomplete');
  let detail = '';
  if (statuses.length) {
    detail = `<span class="tooltip">${statuses.map(s => `<span class="source-line"><span>${esc(s.name || s.id || '-')}</span><span>${s.ok ? '✓' : '⚠'}</span></span>`).join('')}</span>`;
  } else {
    detail = `<span class="tooltip">Einzelliste wird ab dem nächsten Tageslauf gespeichert.</span>`;
  }
  root.innerHTML = `Quellen ${ok}/${total}${detail}`;
}

function bindFilters() {
  for (const id of ['searchInput','statusFilter','dossierFilter']) {
    const el = document.getElementById(id);
    el.addEventListener(id === 'searchInput' ? 'input' : 'change', renderAll);
  }
  document.getElementById('reportSelect').addEventListener('change', event => {
    const target = document.getElementById(`day-${event.target.value}`);
    if (target) target.scrollIntoView({behavior:'smooth',block:'start'});
  });
  document.getElementById('reports').addEventListener('click', event => {
    const button = event.target.closest('.article-info-toggle');
    if (!button) return;
    const row = button.closest('tr.news-row');
    const detailRow = row?.nextElementSibling;
    if (!detailRow?.classList.contains('article-detail-row')) return;
    const open = detailRow.hidden;
    detailRow.hidden = !open;
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    button.textContent = open ? '⊖' : 'ⓘ';
  });
}

async function init() {
  bindFilters();
  const root = document.getElementById('reports');
  try {
    const response = await fetch(ROOT + 'index.json', {cache:'no-store'});
    if (!response.ok) throw new Error('Archivindex konnte nicht geladen werden.');
    const index = await response.json();
    const entries = index.reports || [];
    if (!entries.length) {
      root.innerHTML = '<div class="empty">Noch keine Tagesberichte seit dem Neustart der Monitor-Historie.</div>';
      document.getElementById('reportSelect').innerHTML = '<option>–</option>';
      return;
    }
    const loaded = await Promise.all(entries.map(async entry => {
      const r = await fetch(ROOT + entry.path, {cache:'no-store'});
      if (!r.ok) return null;
      const report = await r.json();
      report._runs = Array.isArray(entry.runs) ? entry.runs : [];
      if (!report.generated_at && entry.generated_at) report.generated_at = entry.generated_at;
      return report;
    }));
    reports = loaded.filter(Boolean).sort((a,b) => String(b.date).localeCompare(String(a.date)));
    const select = document.getElementById('reportSelect');
    select.innerHTML = reports.map(r => `<option value="${esc(r.date)}">${esc(fmtDate(r.date))}</option>`).join('');
    const oldest = reports[reports.length - 1]?.date;
    document.getElementById('pageTitle').textContent = `News-, EU- und Risikomonitor ab ${fmtDate(oldest)}`;
    renderSourceStatus(reports[0]);
    renderAll();
  } catch (error) {
    root.innerHTML = `<div class="empty">${esc(error.message)}</div>`;
  }
}

init();
