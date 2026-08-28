/*
 * Abnahmetests des Zuwanderungsrechners (Prueffassung V2.9d).
 *
 * Geprueft wird die harte Trennung der Rechnungsebenen: Der Referenzjahrgang
 * G1-G7 und die separaten Ebenen A1 (Asylgesuche) und A2 (Schutzstatus S)
 * duerfen sich weder im Personentotal noch im Saldo beruehren.
 *
 * Aufruf:  node scripts/test_zuwanderung_rechner.js
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
var SEITE = path.join(WURZEL, 'rechnet-sich-zuwanderung.html');

var bestanden = 0, fehlgeschlagen = 0;
function test(name, fn) {
  try { fn(); bestanden++; console.log('  ok   ' + name); }
  catch (e) { fehlgeschlagen++; console.log('  FEHL ' + name + '\n       ' + e.message); }
}
function gruppe(t) { console.log('\n' + t); }

/** Zahl aus einem Text loesen: Schweizer Trenner und Komma beruecksichtigt. */
function zahl(text) {
  var t = String(text).replace(/[’'\s]/g, '').replace(',', '.');
  var m = /-?\d+(\.\d+)?/.exec(t.replace(/–/, '-'));
  return m ? parseFloat(m[0]) : null;
}

/**
 * Betrag in Mio. CHF, unabhaengig von der angezeigten Einheit. Die Seite
 * wechselt ab einer Milliarde auf «Mrd.» — ein Vergleich in Mio. muss das
 * mitnehmen, sonst prueft er die Einheit statt den Wert.
 */
function inMio(text) {
  var wert = zahl(text);
  if (wert === null) return null;
  return /Mrd\./.test(text) ? wert * 1000 : wert;
}

(async function () {
  var html = fs.readFileSync(SEITE, 'utf8');
  var dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'http://localhost/rechnet-sich-zuwanderung.html',
    pretendToBeVisual: true
  });
  var fenster = dom.window, d = fenster.document;

  var fehler = [];
  fenster.addEventListener('error', function (e) { fehler.push(String(e.message || e.error)); });
  if (d.readyState === 'loading') {
    await new Promise(function (r) { d.addEventListener('DOMContentLoaded', r); });
  }
  await new Promise(function (r) { setTimeout(r, 400); });

  function text(id) { return d.getElementById(id).textContent.trim(); }
  function zeile(gruppeName) {
    return d.querySelector('[data-group="' + gruppeName + '"]');
  }
  function schiebe(gruppeName, wert, klasse) {
    var row = zeile(gruppeName);
    var s = row.querySelector(klasse);
    s.value = String(wert);
    s.dispatchEvent(new fenster.Event('input', { bubbles: true }));
  }

  gruppe('Aufbau');

  test('keine JavaScript-Fehler', function () { assert.deepStrictEqual(fehler, []); });
  test('noindex bleibt unveraendert', function () {
    assert.strictEqual(d.querySelector('meta[name="robots"]').getAttribute('content'),
      'noindex, nofollow');
  });
  test('drei getrennte Bereiche sind vorhanden', function () {
    ['zw-rechner', 'zw-asyl', 'zw-ergebnis'].forEach(function (n) {
      assert.ok(d.getElementById(n), 'Bereich fehlt: ' + n);
    });
  });
  test('A-Zeilen liegen ausserhalb des G1-G7-Containers', function () {
    var rechner = d.getElementById('zw-rechner');
    assert.strictEqual(rechner.querySelectorAll('.zw-arow').length, 0,
      'A-Zeile steckt im Container des Referenzjahrgangs');
    assert.strictEqual(rechner.querySelectorAll('.zw-row').length, 7);
  });
  test('Meta-Beschreibungen nennen die separaten Rechnungen', function () {
    ['meta[name="description"]', 'meta[property="og:description"]',
     'meta[name="twitter:description"]'].forEach(function (sel) {
      var inhalt = d.querySelector(sel).getAttribute('content');
      assert.ok(/Asylgesuche und Schutzstatus S/.test(inhalt), sel + ': ' + inhalt);
    });
  });

  gruppe('Test 1 — Defaultwerte');

  test('G1-G7 total = 165’386', function () {
    assert.strictEqual(zahl(text('zw-pers')), 165386);
    assert.strictEqual(zahl(text('zw-e-pers')), 165386);
  });
  test('A1 = 25’781, A2 = 12’897', function () {
    assert.strictEqual(zahl(text('zw-e-a1p')), 25781);
    assert.strictEqual(zahl(text('zw-e-a2p')), 12897);
  });
  test('die Einzelgruppen tragen die Referenzwerte', function () {
    var soll = { G1: 84218, G2: 4137, G3: 42170, G4: 17579, G5: 5087, G6: 8119, G7: 4076 };
    Object.keys(soll).forEach(function (g) {
      assert.strictEqual(zahl(zeile(g).querySelector('.zw-count').textContent), soll[g], g);
    });
  });

  gruppe('Test 2 — A1 Default, Szenario zentral');

  test('A1 ergibt rund CHF –1’711,2 Mio.', function () {
    assert.ok(Math.abs(inMio(text('zw-e-a1')) + 1711.2) < 1, text('zw-e-a1'));
  });

  gruppe('Test 3 — A1 halbiert');

  test('12’900 Personen ergeben rund CHF –856 Mio.', function () {
    schiebe('A1', 12900, '.zw-aslider');
    assert.ok(Math.abs(inMio(text('zw-e-a1')) + 856.3) < 1.5, text('zw-e-a1'));
  });
  test('das G1-G7-Total bleibt dabei unveraendert', function () {
    assert.strictEqual(zahl(text('zw-e-pers')), 165386);
  });

  gruppe('Test 4 und 5 — A2');

  test('A2 Default ergibt rund CHF –404,0 Mio.', function () {
    assert.ok(Math.abs(inMio(text('zw-e-a2')) + 404.0) < 0.6, text('zw-e-a2'));
  });
  test('A2 = 0 ergibt CHF 0', function () {
    schiebe('A2', 0, '.zw-aslider');
    assert.strictEqual(text('zw-e-a2'), 'CHF 0');
    assert.strictEqual(zahl(text('zw-e-a2p')), 0);
  });

  gruppe('Test 6 — G6 wirkt nicht auf A1/A2');

  test('eine Aenderung an G6 laesst A1 und A2 unberuehrt', function () {
    var a1 = text('zw-e-a1'), a2 = text('zw-e-a2');
    var a1p = text('zw-e-a1p'), a2p = text('zw-e-a2p');
    schiebe('G6', 20000, '.zw-slider');
    assert.strictEqual(zahl(zeile('G6').querySelector('.zw-count').textContent), 20000);
    assert.strictEqual(text('zw-e-a1'), a1);
    assert.strictEqual(text('zw-e-a2'), a2);
    assert.strictEqual(text('zw-e-a1p'), a1p);
    assert.strictEqual(text('zw-e-a2p'), a2p);
  });
  test('G6 traegt selbst keinen Jahr-1-Saldo', function () {
    assert.strictEqual(zeile('G6').querySelector('.zw-contrib').textContent, 'CHF 0');
  });

  gruppe('Test 7 — Zuruecksetzen');

  test('Reset stellt alle neun Werte her', function () {
    d.getElementById('zw-reset').dispatchEvent(new fenster.MouseEvent('click', { bubbles: true }));
    var soll = { G1: 84218, G2: 4137, G3: 42170, G4: 17579, G5: 5087, G6: 8119, G7: 4076 };
    Object.keys(soll).forEach(function (g) {
      assert.strictEqual(zahl(zeile(g).querySelector('.zw-count').textContent), soll[g], g);
    });
    assert.strictEqual(zahl(zeile('A1').querySelector('.zw-count').textContent), 25781);
    assert.strictEqual(zahl(zeile('A2').querySelector('.zw-count').textContent), 12897);
    assert.strictEqual(zahl(text('zw-e-pers')), 165386);
  });

  gruppe('Test 8 — keine gemeinsame Summe');

  test('nirgends steht die Summe aus G1-G7, A1 und A2', function () {
    // 165386 + 25781 + 12897 = 204064
    var verboten = ['204064', '204’064', '204.064'];
    verboten.forEach(function (v) {
      assert.strictEqual(html.indexOf(v), -1, 'unzulaessiges Personentotal im Markup: ' + v);
    });
    var seite = d.body.textContent.replace(/\s+/g, ' ');
    verboten.forEach(function (v) {
      assert.strictEqual(seite.indexOf(v), -1, 'unzulaessiges Personentotal gerendert: ' + v);
    });
  });
  test('kein Ergebnisfeld addiert die drei Ebenen', function () {
    var g = inMio(text('zw-e-total'));
    var a1 = inMio(text('zw-e-a1'));
    var a2 = inMio(text('zw-e-a2'));
    // Der G-Saldo darf die separaten Ebenen nicht enthalten.
    assert.ok(Math.abs(g + 1455) < 20, 'G1-G7-Saldo unerwartet: ' + text('zw-e-total'));
    assert.ok(Math.abs(g - (g + a1 + a2)) > 100, 'Ebenen wurden addiert');
  });
  test('der Hinweis zur Nichtaddition steht auf der Seite', function () {
    var seite = d.body.textContent.replace(/\s+/g, ' ');
    assert.ok(/Asyl und Status S sind nicht Bestandteil des G1–G7-Personentotals/.test(seite),
      'Hinweis fehlt');
    assert.ok(/Nicht Bestandteil des G1–G7-Totals/.test(seite), 'Hinweis in Bereich B fehlt');
  });

  gruppe('Sensitivitaetsband');

  test('guenstig und kritisch aendern nur A1 und A2', function () {
    var vorher = text('zw-e-total');
    var knopf = d.querySelector('.zw-szenario[data-szenario="critical"]');
    knopf.dispatchEvent(new fenster.MouseEvent('click', { bubbles: true }));
    assert.ok(Math.abs(inMio(text('zw-e-a1')) + 2053.4) < 1, text('zw-e-a1'));
    assert.ok(Math.abs(inMio(text('zw-e-a2')) + 490.0) < 0.6, text('zw-e-a2'));
    assert.strictEqual(text('zw-e-total'), vorher, 'Szenario hat den G1-G7-Saldo veraendert');

    d.querySelector('.zw-szenario[data-szenario="favourable"]')
      .dispatchEvent(new fenster.MouseEvent('click', { bubbles: true }));
    assert.ok(Math.abs(inMio(text('zw-e-a1')) + 1369.0) < 1, text('zw-e-a1'));
    assert.ok(Math.abs(inMio(text('zw-e-a2')) + 322.0) < 0.6, text('zw-e-a2'));

    d.querySelector('.zw-szenario[data-szenario="central"]')
      .dispatchEvent(new fenster.MouseEvent('click', { bubbles: true }));
  });

  gruppe('Darstellung');

  test('Schweizer Zahlenformat mit Hochkomma', function () {
    assert.ok(/’/.test(text('zw-e-pers')), text('zw-e-pers'));
    assert.ok(/^CHF /.test(text('zw-e-a1')), text('zw-e-a1'));
  });
  test('negative Werte rot, G6 neutral grau', function () {
    assert.ok(/text-swiss/.test(d.getElementById('zw-e-a1').className),
      d.getElementById('zw-e-a1').className);
    assert.ok(/text-gray-500/.test(zeile('G6').querySelector('.zw-contrib').className),
      zeile('G6').querySelector('.zw-contrib').className);
  });
  test('Qualitaet C/D steht bei A1 und A2', function () {
    ['A1', 'A2'].forEach(function (g) {
      assert.ok(/Qualität C\/D/.test(zeile(g).textContent), g);
    });
  });
  test('A1 zaehlt Gesuche, A2 Personen', function () {
    // 25'781 ist eine Gesuchszahl, keine gemessene Zahl von Zuzuegern.
    assert.ok(/Gesuche/.test(zeile('A1').textContent), zeile('A1').textContent);
    assert.ok(!/Pers\./.test(zeile('A1').textContent), 'A1 als Personen bezeichnet');
    assert.ok(/Pers\./.test(zeile('A2').textContent), zeile('A2').textContent);
    var block = d.getElementById('zw-e-a1p').parentNode.textContent;
    assert.ok(/Gesuche/.test(block), block);
  });
  test('A1 und A2 sind als kein Vollkosten-/Nettosaldo gekennzeichnet', function () {
    var seite = d.body.textContent.replace(/\s+/g, ' ');
    assert.ok(/kein Vollkosten- oder Nettosaldo|kein Vollkosten-\/Nettosaldo/.test(seite),
      'Kennzeichnung fehlt');
  });
  test('Jahr 5 und Jahr 10 werden nicht hochgerechnet', function () {
    var seite = d.body.textContent.replace(/\s+/g, ' ');
    assert.ok(/Berechnet wird ausschliesslich Jahr 1/.test(seite), 'Einschraenkung fehlt');
  });

  console.log('\n' + bestanden + ' Tests bestanden, ' + fehlgeschlagen + ' fehlgeschlagen.');
  process.exit(fehlgeschlagen ? 1 : 0);
})();
