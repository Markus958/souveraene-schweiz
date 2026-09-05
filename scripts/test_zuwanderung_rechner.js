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
  // Die Seite laedt ihre Zahlen aus assets/zuwanderung-modell.js. jsdom holt
  // externe Skripte nicht; die Datei wird deshalb vor dem Parsen in das
  // Fenster gelegt — genau so, wie der Browser sie vorfindet.
  var MODELLDATEI = fs.readFileSync(
    path.join(WURZEL, 'assets', 'zuwanderung-modell.js'), 'utf8');
  var dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'http://localhost/rechnet-sich-zuwanderung.html',
    pretendToBeVisual: true,
    beforeParse: function (fenster) { fenster.eval(MODELLDATEI); }
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
  test('G5 und G7 tragen ihren Modellwert, nicht null', function () {
    // Frueher standen beide auf CHF 0 — ein Platzhalter, keine Aussage ueber
    // Kostenneutralitaet. Der Regler muss die Referenzwerte exakt treffen.
    d.getElementById('zw-reset').dispatchEvent(new fenster.MouseEvent('click', { bubbles: true }));
    var g5 = zeile('G5').querySelector('.zw-contrib').textContent;
    var g7 = zeile('G7').querySelector('.zw-contrib').textContent;
    assert.ok(/–15,7 Mio\./.test(g5), 'G5: ' + g5);
    assert.ok(/–49,8 Mio\./.test(g7), 'G7: ' + g7);
  });
  test('G6 traegt seinen Fortschreibungswert, nicht null', function () {
    // G6 ist eine Statusfortschreibung — das heisst nicht CHF 0. Der frueher
    // angesetzte Nullwert widersprach dem Dossier.
    var g6 = zeile('G6').querySelector('.zw-contrib').textContent;
    assert.ok(/–115,8 Mio\./.test(g6), 'G6: ' + g6);
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

  gruppe('Konsistenz mit dem Dossier V2.9e');

  // Der Dossierstand, fest verdrahtet. Weicht die Modelldatei spaeter davon ab,
  // faellt dieser Test — genau das ist seine Aufgabe.
  var DOSSIER = {
    G1: { pers: 84218, mio: -300.2 },
    G2: { pers:  4137, mio:  -10.6 },
    G3: { pers: 42170, mio: -1008.8 },
    G4: { pers: 17579, mio: -535.0 },
    G5: { pers:  5087, mio:  -15.7 },
    G6: { pers:  8119, mio: -115.8 },
    G7: { pers:  4076, mio:  -49.8 }
  };

  test('die Modelldatei traegt die sieben Dossierwerte', function () {
    var M = fenster.ZW_MODELL;
    assert.ok(M, 'zuwanderung-modell.js nicht geladen');
    assert.strictEqual(M.version, '2.9e');
    assert.strictEqual(M.saldoDefinition, 'Jahr-1-Arbeitswert vor SV-Nettosaldo');
    Object.keys(DOSSIER).forEach(function (g) {
      var e = M.gruppe(g);
      assert.ok(e, 'Gruppe fehlt: ' + g);
      assert.strictEqual(e.pers, DOSSIER[g].pers, g + ' Personen');
      assert.strictEqual(e.mio, DOSSIER[g].mio, g + ' Saldo');
    });
  });
  test('Referenzpersonen G1-G7 ergeben 165’386', function () {
    var M = fenster.ZW_MODELL;
    var s = M.gruppen.reduce(function (a, g) { return a + g.pers; }, 0);
    assert.strictEqual(s, 165386);
    assert.strictEqual(M.total.pers, 165386);
  });
  test('Referenz-Gesamtsaldo ergibt rund –2,036 Mrd.', function () {
    var M = fenster.ZW_MODELL;
    var s = M.gruppen.reduce(function (a, g) { return a + g.mio; }, 0);
    assert.ok(Math.abs(s + 2035.9) < 0.05, 'Summe ' + s);
    // Publizierter Wert; die Rundungsdifferenz von 0,1 Mio. ist zulaessig.
    assert.ok(Math.abs(M.total.mio + 2036.0) < 0.05, 'Total ' + M.total.mio);
    assert.strictEqual(M.mrdText(M.total.mio), '–2,036 Mrd.');
  });
  test('kein Sozialversicherungs-Proxy im zentralen Jahr-1-Saldo', function () {
    // Ein SV-Proxy wuerde G1 und G2 ins Positive drehen. Kein Gruppenwert
    // darf positiv sein.
    fenster.ZW_MODELL.gruppen.forEach(function (g) {
      assert.ok(g.mio < 0, g.id + ' ist nicht negativ: ' + g.mio);
    });
  });
  test('die Seite nennt keine ueberholten Werte mehr', function () {
    var verboten = ['–1,521 Mrd.', '1,455 Mrd.', '+78,7 Mio.', '+10,1 Mio.', '2.9d'];
    var seite = d.body.textContent.replace(/\s+/g, ' ');
    verboten.forEach(function (v) {
      assert.strictEqual(seite.indexOf(v), -1, 'ueberholter Wert auf der Seite: ' + v);
      assert.strictEqual(html.indexOf(v), -1, 'ueberholter Wert im Markup: ' + v);
    });
  });
  test('G6 wird nicht mehr mit CHF 0 gefuehrt', function () {
    var seite = d.body.textContent.replace(/\s+/g, ' ');
    assert.strictEqual(fenster.ZW_MODELL.gruppe('G6').mio, -115.8);
    assert.ok(!/G6[^.]*CHF 0/.test(seite), 'G6 wird noch mit CHF 0 genannt');
    assert.ok(!/keinen neuen Jahr-1-Saldo/.test(seite), 'alte G6-Formulierung steht noch');
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
    // Summe der sieben Gruppenwerte des Dossiers: -2035,9 Mio.
    assert.ok(Math.abs(g + 2035.9) < 5, 'G1-G7-Saldo unerwartet: ' + text('zw-e-total'));
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
  test('alle sieben Gruppen sind negativ und rot', function () {
    assert.ok(/text-swiss/.test(d.getElementById('zw-e-a1').className),
      d.getElementById('zw-e-a1').className);
    ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'].forEach(function (g) {
      var c = zeile(g).querySelector('.zw-contrib');
      assert.ok(/text-swiss/.test(c.className), g + ': ' + c.className);
      assert.ok(/^–/.test(c.textContent.trim()), g + ': ' + c.textContent);
    });
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
