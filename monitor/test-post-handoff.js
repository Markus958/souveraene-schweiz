'use strict';
const assert = require('node:assert/strict');
const {buildMonitorPostHandoff} = require('./post-handoff.js');

const handoff = buildMonitorPostHandoff({
  headline: 'Bundesrat entscheidet über Vorlage',
  source_display: 'NZZ',
  status: 'Neu',
  post_potential: 8,
  summary: 'Kurze Zusammenfassung.',
  why_important: 'Bedeutung für die Schweiz.',
  post_approach: 'Einordnung der Machtfrage.',
  source: {name: 'NZZ', url: 'https://example.org/article'},
  sources: [
    {name: 'NZZ', title: 'Artikel', url: 'https://example.org/article'},
    {name: 'NZZ', title: 'Duplikat', url: 'https://example.org/article'}
  ],
  article_detail: {
    summary: 'Detaillierte Zusammenfassung.',
    topics: ['Direkte Demokratie'],
    figures: ['CHF 2 Mrd.']
  }
}, 'Ausgangs-Prompt');

assert.match(handoff, /ChatGPT-Projekt «Souveräne Schweiz»/);
assert.match(handoff, /Bundesrat entscheidet über Vorlage/);
assert.match(handoff, /Bedeutung für die Schweiz/);
assert.match(handoff, /Direkte Demokratie/);
assert.match(handoff, /CHF 2 Mrd\./);
assert.match(handoff, /https:\/\/example\.org\/article/);
assert.match(handoff, /Ausgangs-Prompt/);
const withHistory = buildMonitorPostHandoff({}, '', [
  {role: 'user', content: 'Bitte prüfe die Abstimmungsfrist.'},
  {role: 'assistant', content: 'Die Frist ist noch offen.'}
]);
assert.match(withHistory, /Bitte prüfe die Abstimmungsfrist/);
assert.match(withHistory, /Die Frist ist noch offen/);
assert.equal((handoff.match(/https:\/\/example\.org\/article/g) || []).length, 1);

assert.match(buildMonitorPostHandoff({}, ''), /\(kein Titel\)/);
console.log('post handoff tests: PASS');
