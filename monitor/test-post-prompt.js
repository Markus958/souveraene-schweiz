'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, 'accordion.js'), 'utf8');
const start = source.indexOf('function buildPostPrompt(item) {');
const end = source.indexOf('\nfunction ensurePostDraftDialog()', start);
assert.ok(start >= 0 && end > start, 'buildPostPrompt boundaries are present');
const buildPostPrompt = new Function('sourceDisplay', source.slice(start, end) + '\nreturn buildPostPrompt;')(() => 'NZZ');

const general = buildPostPrompt({
  headline: 'Bundesrat prüft neue AHV-Finanzierung',
  summary: 'Die Finanzierung wird erneut diskutiert.',
  source: {name: 'NZZ', url: 'https://example.org/ahv'},
  article_detail: {summary: 'Zusatzdetails zur Finanzierung.', topics: ['AHV'], figures: ['CHF 2 Mrd.']}
});
assert.match(general, /Zusatzdetails zur Finanzierung/);
assert.match(general, /CHF 2 Mrd\./);
assert.match(general, /https:\/\/example\.org\/ahv/);
assert.doesNotMatch(general, /#PaketCHEU|#Integrationsvertrag|#Souveränitätsverlust/);
assert.match(general, /Hashtags bilden den Abschluss des Posts/);

const eu = buildPostPrompt({
  headline: 'Das Schweiz-EU-Abkommen wird im Parlament beraten',
  summary: 'Die Vorlage betrifft den Binnenmarkt.',
  source: {name: 'NZZ', url: 'https://example.org/eu'}
});
assert.match(eu, /#PaketCHEU #Integrationsvertrag #Souveränitätsverlust/);
console.log('post prompt tests: PASS');
