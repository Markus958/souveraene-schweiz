/*
 * Prueft die Hubseite zuwanderung.html: Sie ist der Einstieg in den
 * Themenbereich und darf keine zweite Kurzfassung der Analyse sein. Alle
 * Modellzahlen gehoeren auf rechnet-sich-zuwanderung.html.
 *
 * Aufruf:  node scripts/test_zuwanderung_hub.js
 * Benoetigt jsdom:  npm install --no-save jsdom
 */
'use strict';

var fs = require('fs');
var path = require('path');
var assert = require('assert');

var JSDOM;
try { JSDOM = require('jsdom').JSDOM; }
catch (e) {
  console.log('jsdom nicht installiert — Abnahme uebersprungen.');
  process.exit(0);
}

var WURZEL = path.join(__dirname, '..');
var SEITE = path.join(WURZEL, 'zuwanderung.html');

var bestanden = 0, fehlgeschlagen = 0;
function test(name, fn) {
  try { fn(); bestanden++; console.log('  ok   ' + name); }
  catch (e) { fehlgeschlagen++; console.log('  FEHL ' + name + '\n       ' + e.message); }
}
function gruppe(t) { console.log('\n' + t); }

(async function () {
  var html = fs.readFileSync(SEITE, 'utf8');
  var dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'http://localhost/zuwanderung.html',
    pretendToBeVisual: true
  });
  var fenster = dom.window, d = fenster.document;
  var fehler = [];
  fenster.addEventListener('error', function (e) { fehler.push(String(e.message || e.error)); });
  if (d.readyState === 'loading') {
    await new Promise(function (r) { d.addEventListener('DOMContentLoaded', r); });
  }
  await new Promise(function (r) { setTimeout(r, 300); });
  var seite = d.body.textContent.replace(/\s+/g, ' ');

  gruppe('Aufbau');

  test('keine JavaScript-Fehler', function () { assert.deepStrictEqual(fehler, []); });
  test('Titel und Description beschreiben den Hub', function () {
    assert.strictEqual(d.title, 'Zuwanderung – Analysen und Dossiers | Souveräne Schweiz');
    var b = d.querySelector('meta[name="description"]').getAttribute('content');
    assert.ok(/Analysen und Modellrechnungen/.test(b), b);
    ['2,036', '4,151', '165', 'G1'].forEach(function (v) {
      assert.strictEqual(b.indexOf(v), -1, 'Kennzahl in der Description: ' + v);
    });
  });
  test('Canonical bleibt auf der Hubseite', function () {
    assert.strictEqual(d.querySelector('link[rel="canonical"]').getAttribute('href'),
      'https://www.souveraene-schweiz.ch/zuwanderung.html');
  });
  test('Navigation, Suche und Footer sind vollstaendig', function () {
    assert.ok(d.querySelector('header nav[aria-label="Hauptnavigation"]'), 'Hauptnavigation fehlt');
    assert.ok(d.querySelector('footer nav[aria-label="Footer"]'), 'Footer fehlt');
    var aktiv = d.querySelector('header nav[aria-label="Hauptnavigation"] a[href="zuwanderung.html"]');
    assert.ok(/text-swiss/.test(aktiv.className), 'Bereich nicht als aktiv markiert');
    assert.ok(d.getElementById('searchOverlay'), 'Suche fehlt');
  });

  gruppe('Inhalt des Hubs');

  test('eine Dossierkarte, die auf die Analyse fuehrt', function () {
    var karten = d.querySelectorAll('main a[href="rechnet-sich-zuwanderung.html"]');
    assert.strictEqual(karten.length, 1, karten.length + ' Verweise');
    assert.ok(fs.existsSync(path.join(WURZEL, 'rechnet-sich-zuwanderung.html')), 'Ziel fehlt');
    assert.strictEqual(karten[0].querySelector('h3').textContent.trim(),
      'Rechnet sich Zuwanderung für die Schweiz?');
  });
  test('der Teaser nennt Asylgesuche und Schutzstatus S', function () {
    var karte = d.querySelector('main a[href="rechnet-sich-zuwanderung.html"]').textContent;
    assert.ok(/Asylgesuche/.test(karte), 'Asylgesuche fehlen');
    assert.ok(/Schutzstatus S/.test(karte), 'Schutzstatus S fehlt');
    assert.ok(/interaktivem Rechner/.test(karte), 'Hinweis auf den Rechner fehlt');
  });
  test('keine Platzhalterkarten fuer kuenftige Themen', function () {
    assert.ok(!/folgt|in Vorbereitung|demnächst/i.test(seite), 'Platzhalter im Text');
    assert.strictEqual(d.querySelectorAll('main section').length, 2,
      'mehr als Intro und Analysen');
  });

  gruppe('Keine zweite Kurzfassung der Analyse');

  test('keine Modellzahlen im Markup', function () {
    ['2,036', '4,151', '1,711', '165’386', '42’170', '84’218',
     '25’781', '12’897', '413’320', '2,294', '1,659'].forEach(function (v) {
      assert.strictEqual(html.indexOf(v), -1, 'Kennzahl auf dem Hub: ' + v);
    });
  });
  test('keine Gruppencodes und keine Detailkapitel', function () {
    assert.ok(!/\bG[1-7]\b/.test(seite), 'Gruppencode im Text');
    ['Auf einen Blick', 'Sensitivitätsband', 'Lebenszyklus', 'Grenzgänger',
     'Familiennachzug', 'Sozialversicherungen', 'Postserie',
     'Was die Rechnung nicht behauptet'].forEach(function (k) {
      assert.strictEqual(seite.indexOf(k), -1, 'Detailkapitel auf dem Hub: ' + k);
    });
  });
  test('keine Modelldaten und keine Datenbindung mehr geladen', function () {
    assert.strictEqual(d.querySelector('script[src*="zuwanderung-modell"]'), null);
    assert.strictEqual(d.querySelectorAll('[data-zw]').length, 0);
    assert.strictEqual(html.indexOf('bar-row'), -1, 'Balken-CSS steht noch da');
  });

  console.log('\n' + bestanden + ' Tests bestanden, ' + fehlgeschlagen + ' fehlgeschlagen.');
  process.exit(fehlgeschlagen ? 1 : 0);
})();
