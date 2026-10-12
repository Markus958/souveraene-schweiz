const ROOT = '/data/monitor/reports/';
let reports = [];

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
  if (source.url && !isEpaper(source)) {
    return `<a class="article-link" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(item.headline || '-')}</a>`;
  }
  return `<span class="article-link">${esc(item.headline || '-')}</span>`;
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
  return Array.isArray(report.news_candidates) ? report.news_candidates : (report.news || []);
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
    changesOnly: document.getElementById('changesOnly').checked,
  };
}

function filterDay(report) {
  const {term,status,dossier,changesOnly} = currentFilters();
  const news = newsPool(report).filter(item => {
    if (dossier !== 'all' && dossier !== 'news') return false;
    if (status !== 'all' && item.status !== status) return false;
    if (changesOnly && !['Neu','Update','Korrektur','Unklar'].includes(item.status)) return false;
    return matchesSearch([
      item.headline,item.summary,item.post_approach,item.why_important,item.status,item.source_stage,
      sourceDisplay(item),(item.relevance_factors || []).join(' '),(item.risk_dossiers || []).join(' ')
    ], term);
  });

  const procedures = (report.procedures || []).filter(item => {
    if (dossier !== 'all' && dossier !== 'eu') return false;
    if (status !== 'all' && item.status !== status) return false;
    if (changesOnly && item.status !== 'changed') return false;
    return matchesSearch([
      item.watch_id,item.page,item.status,item.description,item.relevance_ch,
      (item.references || []).join(' '),(item.documents || []).join(' ')
    ], term);
  });

  const risks = (report.risks || []).filter(item => {
    if (dossier !== 'all' && dossier !== item.topic) return false;
    if (status !== 'all' && item.status !== status) return false;
    if (changesOnly && item.change_recommended !== 'Ja') return false;
    return matchesSearch([item.topic,item.status,item.news_text,(item.news || []).join(' ')], term);
  });

  return {news,procedures,risks};
}

function renderNews(items) {
  if (!items.length) return '<div class="empty">Keine News mit Post-Potenzial für diese Auswahl.</div>';
  return `<div class="table-wrap"><table class="news-table">
    <thead><tr><th class="c-nr">Nr.</th><th class="c-artikel">Artikel</th><th class="c-ressort">Ressort / Quelle</th><th class="c-page">Seite</th><th class="c-pot">Potenzial</th><th class="c-approach">Ansatz</th></tr></thead>
    <tbody>${items.map((item,i) => `<tr>
      <td>${i+1}</td>
      <td>${articleTitle(item)}${item.status ? `<div class="small">${esc(item.status)}</div>` : ''}</td>
      <td>${esc(sourceDisplay(item))}</td>
      <td>${esc(pageDisplay(item))}</td>
      <td class="pot">${esc(item.post_potential ?? '-')}/10</td>
      <td>${esc(item.post_approach || item.summary || '-')}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function procedureLinks(items) {
  const links = items.filter(i => i.url).map(i => ({label:(i.references || []).join(' · ') || i.page || 'EU-Verfahren',url:i.url}));
  if (!links.length) return '';
  return `<span class="eu-links" tabindex="0">ⓘ<span class="tooltip">${links.map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)}</a>`).join('')}</span></span>`;
}

function renderProcedures(items) {
  if (!items.length) return '<div class="empty">Keine passenden EU-Verfahrenseinträge.</div>';
  const links = procedureLinks(items);
  return `<div class="table-wrap"><table class="eu-table">
    <thead><tr><th class="c-change">Änderung ${links}</th><th class="c-desc">Kurze Beschreibung</th><th class="c-rel">Relevanz für CH</th></tr></thead>
    <tbody>${items.map(item => `<tr>
      <td><strong>${esc(item.status === 'changed' ? 'Ja' : item.status === 'unchanged' ? 'Nein' : item.status || '-')}</strong><div class="small">${esc((item.references || []).join(' · ') || item.page || '')}</div></td>
      <td>${esc(item.description || (item.status === 'changed' ? 'Verfahrensstand geändert.' : 'Keine Änderung gegenüber dem letzten Stand.'))}</td>
      <td>${esc(item.relevance_ch || 'Betrifft das EU-Verfahren zum Schweiz–EU-Paket.')}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function renderRisks(items) {
  if (!items.length) return '<div class="empty">Keine passenden Risiko-Dossiers.</div>';
  return `<div class="table-wrap"><table class="risk-table">
    <thead><tr><th class="c-dossier">Dossier</th><th class="c-news">Neuigkeit</th><th class="c-change">Websiteänderung</th></tr></thead>
    <tbody>${items.map(item => `<tr>
      <td><strong>${esc(item.topic || '-')}</strong></td>
      <td>${esc(item.news_text || '-')}</td>
      <td><span class="${item.change_recommended === 'Ja' ? 'yes' : 'no'}">${esc(item.change_recommended || '-')}</span></td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function renderDay(report) {
  const filtered = filterDay(report);
  const visible = filtered.news.length + filtered.procedures.length + filtered.risks.length;
  if (!visible && currentFilters().dossier !== 'all') return '';
  return `<section class="day" id="day-${esc(report.date)}">
    <div class="day-head"><h2>${esc(report.weekday || '')}, ${esc(fmtDate(report.date))}</h2><span class="meta">${esc(report.run_reliability === 'complete' ? 'vollständiger Lauf' : 'unvollständige Quellenlage')}</span></div>
    <h3>News mit Post-Potenzial</h3>${renderNews(filtered.news)}
    <h3>EU-Verfahren</h3>${renderProcedures(filtered.procedures)}
    <h3>Risiko-Dossiers</h3>${renderRisks(filtered.risks)}
  </section>`;
}

function renderAll() {
  const root = document.getElementById('reports');
  if (!reports.length) {
    root.innerHTML = '<div class="empty">Noch keine Tagesberichte seit dem Neustart der Monitor-Historie.</div>';
    return;
  }
  root.innerHTML = reports.map(renderDay).join('') || '<div class="empty">Keine Einträge entsprechen den gewählten Filtern.</div>';
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
  for (const id of ['searchInput','statusFilter','dossierFilter','changesOnly']) {
    const el = document.getElementById(id);
    el.addEventListener(id === 'searchInput' ? 'input' : 'change', renderAll);
  }
  document.getElementById('reportSelect').addEventListener('change', event => {
    const target = document.getElementById(`day-${event.target.value}`);
    if (target) target.scrollIntoView({behavior:'smooth',block:'start'});
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
      return r.json();
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
