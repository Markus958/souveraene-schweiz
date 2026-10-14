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
    const changes = list.filter(item => item.change_recommended === 'Ja').length;
    const incomplete = list.filter(item => item.source_check_complete === false).length;
    if (changes) return {text:`${changes} Websiteänderung${changes === 1 ? '' : 'en'} empfohlen`, action:true};
    if (incomplete) return {text:`${incomplete} Dossier${incomplete === 1 ? '' : 's'} mit unvollständiger Quellenlage – prüfen`, action:true};
    return {text:list.length ? 'Keine Websiteänderung empfohlen' : 'Keine Risiko-Dossiers', action:false};
  }
  return {text:'', action:false};
}

function renderMonitorSection(title, kind, items, bodyHtml) {
  const status = sectionStatus(kind, items);
  const cls = status.action ? 'section-action' : 'section-clear';
  return `<details class="monitor-section ${cls} monitor-section-${kind}">
    <summary><span class="section-title">${esc(title)}</span><span class="section-status">${esc(status.text)}</span></summary>
    <div class="section-body">${bodyHtml}</div>
  </details>`;
}

const renderSnapshotBase = renderSnapshot;
renderSnapshot = function(report, filtered = null) {
  const data = filtered || {news: newsPool(report), procedures: report.procedures || [], risks: report.risks || []};
  return [
    renderMonitorSection('News mit Post-Potenzial', 'news', data.news, renderNews(data.news)),
    renderMonitorSection('EU-Verfahren', 'eu', data.procedures, renderProcedures(data.procedures)),
    renderMonitorSection('Risiko-Dossiers', 'risks', data.risks, renderRisks(data.risks)),
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
  observer.observe(title, {childList:true, characterData:true, subtree:true});
}

keepMonitorTitleShort();
if (Array.isArray(reports) && reports.length) renderAll();
