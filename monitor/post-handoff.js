(function(root){
  'use strict';
  function clean(value){return String(value==null?'':value).trim();}
  function list(value){return Array.isArray(value)?value.map(clean).filter(Boolean):[];}
  function buildMonitorPostHandoff(item,workingPrompt,messages){
    item=item&&typeof item==='object'?item:{};
    var detail=item.article_detail&&typeof item.article_detail==='object'?item.article_detail:{};
    var sources=Array.isArray(item.sources)&&item.sources.length?item.sources:(item.source?[item.source]:[]);
    var seen=new Set();
    sources=sources.filter(function(source){if(!source||(!source.title&&!source.url))return false;var key=clean(source.url)||clean(source.title);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,8);
    var sourceText=sources.map(function(source){var label=clean(source.name)||clean(item.source_display)||'Quelle';var title=clean(source.title)||clean(item.headline)||'Artikel';var url=clean(source.url);return '- '+label+': '+title+(url?' — '+url:'');}).join('\n');
    var turns=Array.isArray(messages)?messages.slice(-12).filter(function(message){return message&&['user','assistant'].includes(message.role)&&clean(message.content);}).map(function(message){var content=clean(message.content);return message.role.toUpperCase()+': '+content.slice(0,6000)+(content.length>6000?' [gekürzt]':'');}):[];
    var conversation=turns.length?turns.join('\n\n'):'(Noch kein API-Chatverlauf vorhanden.)';
    return [
      'Ich arbeite im ChatGPT-Projekt «Souveräne Schweiz» an einem Post zu dieser Meldung.',
      'Bitte verwende die Projektanweisungen und passende Projektdateien. Prüfe bei zusätzlichen Abklärungen aktuelle, belastbare Quellen. Erfinde keine Fakten oder Zitate; markiere offene Punkte.',
      '', 'ARTIKEL', 'Titel: '+(clean(item.headline)||'(kein Titel)'),
      'Quelle: '+(clean(item.source_display)||clean(item.source&&item.source.name)||'(nicht angegeben)'),
      'Status: '+(clean(item.status)||'(nicht angegeben)'),
      'Potenzial: '+(item.post_potential==null?'(nicht angegeben)':String(item.post_potential)+'/10'),
      'Kurzfassung: '+(clean(detail.summary)||clean(item.summary)||'(nicht vorhanden)'),
      'Politische Relevanz: '+(clean(detail.relevance)||clean(item.why_important)||list(item.relevance_factors).join(', ')||'(nicht angegeben)'),
      'Ansatz: '+(clean(item.post_approach)||'(nicht angegeben)'),
      'Kernpunkte: '+(list(detail.topics).join(' · ')||'(nicht angegeben)'),
      'Zahlen und Grössen: '+(list(detail.figures).join(' · ')||'(nicht angegeben)'),
      'Quellen:',sourceText||'- Keine Quellenlinks im Monitoreintrag','',
      'BISHERIGER CHATVERLAUF',conversation,'',
      'AKTUELLER ARBEITSSTAND AUS DEM MONITOR',clean(workingPrompt)||'(kein Prompt übermittelt)','',
      'Führe die Arbeit im Projektchat weiter. Nutze den Chatverlauf als Kontext, prüfe zuerst allfällige Fakten- oder Quellenlücken und übernimm keine unbelegten Aussagen.'
    ].join('\n');
  }
  root.buildMonitorPostHandoff=buildMonitorPostHandoff;
  if(typeof module!=='undefined'&&module.exports)module.exports={buildMonitorPostHandoff:buildMonitorPostHandoff};
})(typeof window!=='undefined'?window:globalThis);
