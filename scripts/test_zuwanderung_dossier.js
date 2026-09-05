/*
 * Prueft, dass die Dossierseite zuwanderung.html ihre Modellzahlen
 * ausschliesslich aus assets/zuwanderung-modell.js bezieht und nirgends eine
 * zweite, eigene Fassung derselben Werte stehen laesst.
 *
 * Aufruf:  node scripts/test_zuwanderung_dossier.js
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
var MODELLDATEI = fs.readFileSync(
  path.join(WURZEL, 'assets', 'zuwanderung-modell.js'), 'utf8');

var bestanden = 0, fehlgeschlagen = 0;
function test(name, fn) {
  try { fn(); bestanden++; console.log('  ok   ' + name); }
  catch (e) { fehlgeschlagen++; console.log('  FEHL ' + name + '\n       ' + e.message); }
}
function gruppe(t) { console.log('\n' + t); }

function zahl(s) {
  var t = String(s).replace(/[’'\s]/g, '').replace('–', '-').replace(',', '.');
  var m = /-?\d+(\.\d+)?/.exec(t);
  if (!m) return null;
  return /Mrd\./.test(s) ? parseFloat(m[0]) * 1000 : parseFloat(m[0]);
}

(async function () {
  var html = fs.readFileSync(SEITE, 'utf8');
  var dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'http://localhost/zuwanderung.html',
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
  var M = fenster.ZW_MODELL;

  gruppe('Aufbau');

  test('keine JavaScript-Fehler', function () { assert.deepStrictEqual(fehler, []); });
  test('die Modelldatei ist eingebunden', function () {
    var s = d.querySelector('script[src*="zuwanderung-modell.js"]');
    assert.ok(s, 'Skript-Tag fehlt');
    assert.ok(M, 'ZW_MODELL nicht verfuegbar');
  });
  test('kein Platzhalter bleibt leer', function () {
    var leer = Array.prototype.slice.call(d.querySelectorAll('[data-zw]'))
      .filter(function (e) { return !e.textContent.trim(); })
      .map(function (e) { return e.getAttribute('data-zw'); });
    assert.deepStrictEqual(leer, []);
  });

  gruppe('Zahlen stammen aus dem Modell');

  test('die Gruppentabelle zeigt Personen und Total aus dem Modell', function () {
    var zeilen = d.querySelectorAll('#zwDossierGruppen tr');
    assert.strictEqual(zeilen.length, M.gruppen.length + 1, zeilen.length + ' Zeilen');
    M.gruppen.forEach(function (g, i) {
      var td = zeilen[i].querySelectorAll('td');
      assert.strictEqual(td[0].textContent.trim(), g.id);
      assert.strictEqual(zahl(td[2].textContent), g.pers, g.id);
    });
    var letzte = zeilen[zeilen.length - 1].querySelectorAll('td');
    assert.strictEqual(zahl(letzte[2].textContent), M.total.pers);
  });

  test('die Balkengrafik zeigt alle sieben Jahr-1-Werte', function () {
    var reihen = d.querySelectorAll('#zwDossierBalken .bar-row');
    assert.strictEqual(reihen.length, M.gruppen.length);
    M.gruppen.forEach(function (g, i) {
      var wert = zahl(reihen[i].querySelector('.r-neg').textContent);
      assert.ok(Math.abs(wert - g.mio) < 0.05, g.id + ': ' + wert + ' statt ' + g.mio);
    });
  });

  test('Gesamtsaldo, A1 und A2 stimmen mit dem Modell', function () {
    var seite = d.body.textContent.replace(/\s+/g, ' ');
    assert.ok(seite.indexOf(M.mrdText(M.total.mio)) !== -1, 'Total fehlt');
    assert.ok(seite.indexOf(M.zahl(M.ebene('A1').pers)) !== -1, 'A1-Personen fehlen');
    assert.ok(seite.indexOf(M.zahl(M.ebene('A2').pers)) !== -1, 'A2-Personen fehlen');
  });

  test('die Gesamtuebersicht ist die Summe der drei Ebenen', function () {
    var seite = d.body.textContent.replace(/\s+/g, ' ');
    var erwartet = M.mrdText(M.uebersichtMio());
    assert.ok(seite.indexOf(erwartet) !== -1, 'erwartet ' + erwartet);
    // Sie darf nur als arithmetische Uebersicht auftreten.
    assert.ok(/keine einheitliche Kohortenbilanz/.test(seite), 'Vorbehalt fehlt');
  });

  gruppe('Keine zweite Zahlenfassung');

  test('jeder Rueckfalltext im Markup stimmt mit dem Modell ueberein', function () {
    // Die Platzhalter behalten ihren Text im Markup, damit bei einem
    // Skriptfehler keine leeren Felder stehen. Dieser Rueckfalltext darf aber
    // nicht stillschweigend veralten — deshalb wird er gegen das Modell
    // geprueft. Gelesen wird die Datei ohne laufende Skripte.
    var roh = new JSDOM(html).window.document;
    var werte = {
      'version': M.version,
      'total.pers': M.zahl(M.total.pers),
      'total.mrd': M.mrdText(M.total.mio),
      'uebersicht.mrd': M.mrdText(M.uebersichtMio())
    };
    M.gruppen.forEach(function (g) {
      werte[g.id + '.pers'] = M.zahl(g.pers);
      werte[g.id + '.wert'] = M.gruppenText(g.mio);
    });
    M.separat.forEach(function (e) {
      werte[e.id + '.pers'] = M.zahl(e.pers);
      werte[e.id + '.wert'] = Math.abs(e.band.central) >= 1000
        ? M.mrdText(e.band.central) : M.mioText(e.band.central, false) + ' Mio.';
    });
    var abweichend = [];
    Array.prototype.forEach.call(roh.querySelectorAll('[data-zw]'), function (el) {
      var schluessel = el.getAttribute('data-zw');
      var soll = werte[schluessel];
      if (soll === undefined) { abweichend.push(schluessel + ' (unbekannt)'); return; }
      if (el.textContent.trim() !== String(soll)) {
        abweichend.push(schluessel + ': «' + el.textContent.trim() + '» statt «' + soll + '»');
      }
    });
    assert.deepStrictEqual(abweichend, []);
  });

  test('die Seite nennt keine ueberholten Werte', function () {
    var verboten = ['–1,521 Mrd.', '–1,455 Mrd.', '+78,7', '+10,1'];
    var seite = d.body.textContent.replace(/\s+/g, ' ');
    verboten.forEach(function (v) {
      assert.strictEqual(seite.indexOf(v), -1, 'ueberholter Wert: ' + v);
    });
  });

  console.log('\n' + bestanden + ' Tests bestanden, ' + fehlgeschlagen + ' fehlgeschlagen.');
  process.exit(fehlgeschlagen ? 1 : 0);
})();
