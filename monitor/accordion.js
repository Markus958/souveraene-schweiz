function sectionStatus(kind, items) {
  const list = Array.isArray(items) ? items : [];
  if (kind === 'news') {
    return list.length
      ? {text:`${list.length} Artikel mit Post-Potenzial`, action:true}
      : {text:'Keine relevanten News', action:false};
  }
  if (kind === 'eu') {
    const changed = list.filter(item => item.status === 'changed').length;
    const unclear = list.filter(item => !['changed','unchanged','baseline'].includes(String(item.status || ''))).length;
    if (changed) return {text:`${changed} Änderung${changed === 1 ? '' : 'en'} – prüfen`, action:true};
    if (unclear) return {text:`${unclear} unklarer Verfahrensstand – prüfen`, action:true};
    return {text:list.length ? 'Keine Änderung' : 'Keine EU-Verfahrenseinträge', action:false};
  }
  if (kind === 'risks') {
    const mediaHints = list.filter(item => item.media_hint === true).length;
    const changes = list.filter(item => item.change_recommended === 'Ja').length;
    const incomplete = list.filter(item => item.source_check_complete === false).length;
    if (changes) return {text:`${changes} Websiteänderung${changes === 1 ? '' : 'en'} empfohlen`, action:true};
    if (mediaHints) return {text:`${mediaHints} Medienhinweis${mediaHints === 1 ? '' : 'e'} – prüfen`, action:true};
    if (incomplete) return {text:`${incomplete} Dossier${incomplete === 1 ? '' : 's'} mit unvollständiger Quellenlage – prüfen`, action:true};
    return {text:list.length ? 'Keine Websiteänderung empfohlen' : 'Keine Risiko-Dossiers', action:false};
  }
  return {text:'', action:false};
}

function renderMonitorSection(title, kind, items, bodyHtml, statusOverride = null) {
  const status = statusOverride || sectionStatus(kind, items);
  const cls = status.action ? 'section-action' : 'section-clear';
  return `<details class="monitor-section ${cls} monitor-section-${kind}">
    <summary><span class="section-title">${esc(title)}</span><span class="section-status">${esc(status.text)}</span></summary>
    <div class="section-body">${bodyHtml}</div>
  </details>`;
}

const RISK_TOPIC_LABELS = {
  f35: 'F-35 / Air2030',
  patriot: 'Patriot / Bodluv GR',
  ubs: 'UBS',
  ahv13: '13. AHV-Rente',
  ahv: '13. AHV-Rente',
};

function riskMediaHints(report) {
  const pool = Array.isArray(report.news) ? report.news : [];
  const hints = [];
  const seen = new Set();
  const filters = typeof currentFilters === 'function' ? currentFilters() : {term:'',status:'all',dossier:'all'};

  for (const item of pool) {
    const dossiers = Array.isArray(item.risk_dossiers) ? item.risk_dossiers : [];
    for (const rawId of dossiers) {
      const id = String(rawId || '').trim();
      if (!id) continue;
      const topic = RISK_TOPIC_LABELS[id] || id;
      const key = `${id}|${item.event_id || item.headline || ''}`;
      if (seen.has(key)) continue;
      if (filters.dossier !== 'all' && filters.dossier !== topic) continue;
      if (filters.status !== 'all' && filters.status !== 'Unklar' && filters.status !== 'Neu') continue;
      if (filters.term && !matchesSearch([topic,item.headline,item.summary,item.why_important], filters.term)) continue;
      seen.add(key);
      hints.push({
        date: item.date,
        topic,
        status: 'Medienhinweis',
        news: [item.headline || item.summary || 'Neue Meldung zum Dossier'],
        news_text: `Medienhinweis: ${item.headline || item.summary || 'Neue Meldung zum Dossier'}. Primärquelle prüfen.`,
        change_recommended: 'Offen',
        source_check_complete: true,
        media_hint: true,
        source: item.source || null,
      });
    }
  }
  return hints;
}

function renderRiskItems(items) {
  if (!items.length) return '<div class="empty">Keine neue Entwicklung in den Risiko-Dossiers in diesem Lauf.</div>';
  return `<div class="table-wrap"><table class="risk-table">
    <thead><tr><th class="c-dossier">Dossier</th><th class="c-news">Neuigkeit</th><th class="c-change">Websiteänderung</th></tr></thead>
    <tbody>${items.map(item => `<tr>
      <td><strong>${esc(item.topic || '-')}</strong>${item.media_hint ? '<div class="small">Medienhinweis</div>' : ''}</td>
      <td>${esc(item.news_text || '-')}</td>
      <td>${item.media_hint ? '<span class="yes">Primärquelle prüfen</span>' : `<span class="${item.change_recommended === 'Ja' ? 'yes' : 'no'}">${esc(item.change_recommended || '-')}</span>`}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function newsItemKey(item) {
  const eventId = String(item?.event_id || '').trim();
  if (eventId) return `event:${eventId}`;
  const url = String(item?.source?.url || '').split('#', 1)[0].split('?', 1)[0].trim();
  if (url) return `url:${url}`;
  return `title:${norm(item?.headline || item?.title || '')}`;
}

function filterNewsList(items) {
  const {term,status,dossier} = currentFilters();
  return (Array.isArray(items) ? items : []).filter(item => {
    if (dossier !== 'all' && dossier !== 'news') return false;
    if (status !== 'all' && item.status !== status) return false;
    const detail = item.article_detail || {};
    return matchesSearch([
      item.headline,item.summary,item.post_approach,item.why_important,item.status,item.source_stage,
      sourceDisplay(item),(item.relevance_factors || []).join(' '),(item.risk_dossiers || []).join(' '),
      detail.summary,(detail.topics || []).join(' '),(detail.figures || []).join(' ')
    ], term);
  });
}

function earlierCurrentNews(report, newItems, maxTotal = 10) {
  const candidates = Array.isArray(report.news_candidates) ? report.news_candidates : [];
  const selected = candidates.filter(item => item && item.selected === true);
  const pool = selected.length ? selected : candidates.slice(0, maxTotal);
  const newKeys = new Set((Array.isArray(newItems) ? newItems : []).map(newsItemKey));
  const earlier = [];
  const seen = new Set();
  for (const item of pool) {
    const key = newsItemKey(item);
    if (!key || newKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    earlier.push(item);
  }
  const filtered = filterNewsList(earlier);
  return filtered.slice(0, Math.max(0, maxTotal - (Array.isArray(newItems) ? newItems.length : 0)));
}

function renderNewsGroups(report, newItems) {
  const earlier = earlierCurrentNews(report, newItems, 10);
  const newCount = Array.isArray(newItems) ? newItems.length : 0;
  const parts = [];
  parts.push(`<div class="news-group-title">Neue Meldungen <span>${newCount}</span></div>`);
  parts.push(newCount ? renderNews(newItems) : '<div class="empty">Keine neuen Meldungen seit dem letzten vollständigen Lauf.</div>');
  if (earlier.length) {
    parts.push(`<div class="news-group-title news-group-earlier">Weitere aktuelle Meldungen <span>${earlier.length}</span><small>bereits früher erfasst</small></div>`);
    parts.push(renderNews(earlier));
  }
  return {html:parts.join(''), earlier};
}

const renderSnapshotBase = renderSnapshot;
renderSnapshot = function(report, filtered = null) {
  const data = filtered || {news: newsPool(report), procedures: report.procedures || [], risks: report.risks || []};
  const hints = riskMediaHints(report);
  const risks = [...data.risks, ...hints];
  const newsGroups = renderNewsGroups(report, data.news);
  const totalNews = data.news.length + newsGroups.earlier.length;
  const newsStatus = {
    text: data.news.length
      ? `${data.news.length} neu · ${newsGroups.earlier.length} früher erfasst`
      : `${newsGroups.earlier.length} aktuell · nichts neu`,
    action: data.news.length > 0,
  };
  return [
    renderMonitorSection('News mit Post-Potenzial', 'news', new Array(totalNews), newsGroups.html, newsStatus),
    renderMonitorSection('EU-Verfahren', 'eu', data.procedures, renderProcedures(data.procedures)),
    renderMonitorSection('Risiko-Dossiers', 'risks', risks, renderRiskItems(risks)),
  ].join('');
};

function keepMonitorTitleShort() {
  const title = document.getElementById('pageTitle');
  if (!title) return;
  const wanted = 'News-, EU- und Risikomonitor';
  if (title.textContent !== wanted) title.textContent = wanted;
  const observer = new MutationObserver(() => {
    if (title.textContent !== wanted) title.textContent = wanted;
  });
  observer.observe(title, {childList:true,characterData:true,subtree:true});
}

keepMonitorTitleShort();
if (Array.isArray(reports) && reports.length) renderAll();
