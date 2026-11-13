'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  filterDay,
  earlierCurrentNews,
  dayHasVisibleItems,
} = require('./monitor.js');

const all = {term:'', status:'all', dossier:'all'};
const news = {term:'', status:'all', dossier:'news'};

function item(overrides = {}) {
  return {
    event_id: 'EV-1',
    headline: 'Bekannte aktuelle Meldung',
    status: 'Neu',
    quality_qualified: true,
    source: {url:'https://example.test/article'},
    ...overrides,
  };
}

function report({newItems = [], candidates = [], procedures = [], risks = []} = {}) {
  return {news:newItems, news_candidates:candidates, procedures, risks};
}

function visible(value, filters) {
  const filtered = filterDay(value, filters);
  return dayHasVisibleItems(value, filtered, filters);
}

const known = item();
assert.equal(visible(report({candidates:[known]}), news), true,
  'news filter must retain a day with an earlier current candidate');

assert.equal(visible(report({candidates:[known]}), {...news, term:'bekannte aktuelle'}), true,
  'search must find an earlier current candidate');
assert.equal(visible(report({candidates:[known]}), {...news, term:'nicht vorhanden'}), false,
  'a non-matching search must hide the day');

assert.equal(visible(report({candidates:[known]}), {...news, status:'Neu'}), true,
  'status filter must find an earlier current candidate');
assert.equal(visible(report({candidates:[known]}), {...news, status:'Verworfen'}), false,
  'a non-matching status must hide the day');

const sameNew = item();
assert.equal(earlierCurrentNews(report({newItems:[sameNew], candidates:[sameNew]}), [sameNew], 10, news).length, 0,
  'a new item must not be duplicated as earlier current news');

const firstQualified = item({qualification_context:'first_time_qualified'});
assert.equal(visible(report({candidates:[firstQualified]}), news), true,
  'a first-qualified candidate must remain visible without becoming new');
assert.equal(report({candidates:[firstQualified]}).news.length, 0,
  'a first-qualified candidate must not be counted as new');

assert.equal(visible(report(), news), false,
  'a news-filtered day without matching items must be hidden');
assert.equal(visible(report(), all), true,
  'the unfiltered all view must retain the existing day behaviour');

const reportsDir = path.join(__dirname, '..', 'data', 'monitor', 'reports');
for (const date of ['2026-11-08', '2026-11-09', '2026-11-10']) {
  const value = JSON.parse(fs.readFileSync(path.join(reportsDir, `${date}.json`), 'utf8'));
  assert.equal(visible(value, news), true, `${date} must remain visible under the news filter`);
}

console.log('Current-news visibility regression tests passed.');
