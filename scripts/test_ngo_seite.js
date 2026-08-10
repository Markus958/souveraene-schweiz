/*
 * Smoke-Test der NGO-Vorschauseite: laedt die Seite in eine DOM-Nachbildung,
 * fuehrt die Seitenskripte aus und prueft Kennzahlen, Filter, Detailspalte,
 * Tabellen sowie das Verhalten in Desktop- und Mobilbreite.
 *
 * Aufruf:  node scripts/test_ngo_seite.js
 * Benoetigt jsdom:  npm install --no-save jsdom
 */
'use strict';

var fs = require('fs');
var path = require('path');
var assert = require('assert');

var JSDOM;
try { JSDOM = require('jsdom').JSDOM; }
catch (e) {
  console.log('jsdom nicht installiert — Smoke-Test uebersprungen.');
  console.log('Installation: npm install --no-save jsdom');
  process.exit(0);
}

var WURZEL = path.join(__dirname, '..');
var SEITE = path.join(WURZEL, 'netzwerk-verflechtungen-vorschau.html');

var bestanden = 0, fehlgeschlagen = 0;
function test(name, fn) {
  try { fn(); bestanden++; console.log('  ok   ' + name); }
  catch (e) { fehlgeschlagen++; console.log('  FEHL ' + name + '\n       ' + e.message); }
}
function gruppe(t) { console.log('\n' + t); }
function warte(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function baueSeite(breite) {
  var html = fs.readFileSync(SEITE, 'utf8');
  var dom = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/', pretendToBeVisual: true });
  var fenster = dom.window;

  fenster.fetch = function (pfad) {
    var datei = path.join(WURZEL, String(pfad));
    var da = fs.existsSync(datei);
    return Promise.resolve({
      ok: da, status: da ? 200 : 404,
      json: function () { return Promise.resolve(JSON.parse(fs.readFileSync(datei, 'utf8'))); }
    });
  };
  fenster.SVGElement.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: breite, height: 600, right: breite, bottom: 600 };
  };
  Object.defineProperty(fenster, 'innerWidth', { value: breite, configurable: true });

  var fehler = [];
  fenster.addEventListener('error', function (e) { fehler.push(String(e.message || e.error)); });

  if (fenster.document.readyState === 'loading') {
    await new Promise(function (r) { fenster.document.addEventListener('DOMContentLoaded', r); });
  }
  ['assets/vendor/d3-force-bundle.min.js', 'assets/ngo/ngo-daten.js',
   'assets/ngo/ngo-ansicht.js', 'assets/ngo/ngo-seite.js'].forEach(function (rel) {
    var s = fenster.document.createElement('script');
    s.textContent = fs.readFileSync(path.join(WURZEL, rel), 'utf8');
    fenster.document.body.appendChild(s);
  });
  await warte(600);
  return { dom: dom, fenster: fenster, d: fenster.document, fehler: fehler };
}

(async function () {
  var desktop = await baueSeite(1440);
  var d = desktop.d, fenster = desktop.fenster;
  function text(id) { return d.getElementById(id).textContent.trim(); }
  function klick(el) { el.dispatchEvent(new fenster.MouseEvent('click', { bubbles: true })); }
  function knotenAnzahl(sel) { return d.querySelectorAll(sel).length; }

  gruppe('Seitenaufbau (Desktop 1440 px)');

  test('keine JavaScript-Fehler', function () { assert.deepStrictEqual(desktop.fehler, []); });
  test('kein Fehlerhinweis sichtbar', function () {
    assert.strictEqual(d.getElementById('ngoFehler').hidden, true);
  });
  test('noindex bleibt gesetzt', function () {
    assert.strictEqual(d.querySelector('meta[name="robots"]').getAttribute('content'), 'noindex, nofollow');
  });
  test('Hinweis auf den fehlenden Zugriffsschutz steht auf der Seite', function () {
    assert.ok(/keinen Zugriffsschutz/.test(d.querySelector('.vorschau-banner').textContent));
  });
  test('keine externen Ressourcen eingebunden', function () {
    var extern = Array.prototype.slice.call(d.querySelectorAll('[src],[href]')).filter(function (e) {
      var wert = e.getAttribute('src') || e.getAttribute('href') || '';
      return /^https?:/.test(wert);
    });
    assert.deepStrictEqual(extern.map(function (e) { return e.getAttribute('src') || e.getAttribute('href'); }), []);
  });
  test('Kennzahlen sind gefuellt', function () {
    assert.strictEqual(text('kzOrganisationen'), '100');
    assert.strictEqual(text('kzRollen'), '296');
    assert.strictEqual(text('kzDatenstand'), '10.08.2026');
    assert.ok(parseInt(text('kzVerbindungen'), 10) > 0);
  });
  test('methodischer Hinweis steht vollstaendig auf der Seite', function () {
    var t = d.querySelector('.nv-methodik').textContent.replace(/\s+/g, ' ');
    assert.ok(t.indexOf('Das Fehlen einer Verbindung beweist nicht, dass keine weiteren Beziehungen bestehen.') !== -1);
    assert.ok(t.indexOf('belegt weder Koordination, Einflussnahme, Abhängigkeit noch einen Interessenkonflikt') !== -1);
  });
  test('Schlusszeile steht zuunterst', function () {
    var p = Array.prototype.slice.call(d.querySelectorAll('footer p'));
    assert.strictEqual(p[p.length - 1].textContent.trim(), 'Markus Lysser - souveraene-schweiz.ch');
  });

  gruppe('Standardansicht');

  test('nur Organisationsknoten, keine Personen', function () {
    assert.ok(knotenAnzahl('.ngo-organisation') > 0);
    assert.strictEqual(knotenAnzahl('.ngo-person'), 0);
  });
  test('nicht alle 296 Rollen als Gesamtgraph', function () {
    assert.ok(knotenAnzahl('.ngo-knoten-gruppe') < 30, knotenAnzahl('.ngo-knoten-gruppe') + ' Knoten');
  });
  test('nur Kanten der Ebene «aktuell»', function () {
    assert.ok(knotenAnzahl('.ngo-kante--aktuell') > 0);
    ['eingeschraenkt', 'altbestand', 'hinweis'].forEach(function (e) {
      assert.strictEqual(knotenAnzahl('.ngo-kante--' + e), 0, 'Ebene sichtbar: ' + e);
    });
  });

  gruppe('Filter');

  test('Altbestand zuschalten erweitert das Netz', function () {
    var vorher = knotenAnzahl('.ngo-kante');
    d.getElementById('ebAltbestand').checked = true;
    d.getElementById('ebAltbestand').dispatchEvent(new fenster.Event('change', { bubbles: true }));
    assert.ok(knotenAnzahl('.ngo-kante') > vorher);
    assert.ok(knotenAnzahl('.ngo-kante--altbestand') > 0);
  });
  test('Hinweisebene zeigt gestrichelte Verbindungen', function () {
    d.getElementById('ebHinweis').checked = true;
    d.getElementById('ebHinweis').dispatchEvent(new fenster.Event('change', { bubbles: true }));
    assert.ok(knotenAnzahl('.ngo-kante--hinweis') > 0);
  });
  test('Verbindungstyp-Auswahl kennt alle sechs Typen', function () {
    var werte = Array.prototype.slice.call(d.getElementById('fTyp').options)
      .map(function (o) { return o.value; }).filter(Boolean);
    ['aktuelle_doppelfunktion', 'historische_funktion', 'berufliche_verbindung',
     'unterorganisation', 'strukturelle_allianz', 'teilweise_bestaetigt'].forEach(function (t) {
      assert.ok(werte.indexOf(t) !== -1, 'Typ fehlt: ' + t);
    });
  });
  test('Zuruecksetzen stellt die Standardansicht wieder her', function () {
    klick(d.getElementById('ngoReset'));
    assert.strictEqual(d.getElementById('ebAltbestand').checked, false);
    assert.strictEqual(knotenAnzahl('.ngo-kante--altbestand'), 0);
    assert.ok(knotenAnzahl('.ngo-kante--aktuell') > 0);
  });

  gruppe('Detailspalte');

  test('Klick auf eine Organisation blendet Fuehrungspersonen ein', function () {
    klick(d.querySelector('.ngo-organisation'));
    assert.ok(knotenAnzahl('.ngo-person') > 0, 'keine Personen eingeblendet');
  });
  test('alle geforderten Abschnitte erscheinen', function () {
    var titel = Array.prototype.slice.call(d.querySelectorAll('.ngo-detail-titel'))
      .map(function (e) { return e.textContent; });
    ['Führungsmodell', 'Führungspersonen und Funktionen', 'Politische Ämter',
     'Verbindungen und Verbindungstyp', 'Quelle', 'Daten- und Prüfstatus'].forEach(function (t) {
      assert.ok(titel.indexOf(t) !== -1, 'Abschnitt fehlt: ' + t + ' (vorhanden: ' + titel.join(', ') + ')');
    });
  });
  test('erneuter Klick klappt die Personen wieder zu', function () {
    klick(d.querySelector('.ngo-organisation.ngo-offen') || d.querySelector('.ngo-organisation'));
    assert.strictEqual(knotenAnzahl('.ngo-person'), 0);
  });
  test('Detailspalte nennt keine internen Pruefinhalte', function () {
    klick(d.querySelector('.ngo-organisation'));
    var t = d.getElementById('ngoDetail').textContent;
    ['Prüfergebnis', 'Prüfgrund', 'Empfohlene Prüfung', 'newEvidence'].forEach(function (m) {
      assert.strictEqual(t.indexOf(m), -1, 'interner Inhalt sichtbar: ' + m);
    });
  });

  gruppe('Tabellen und Suche');

  test('Verbindungstabelle listet alle Verbindungen', function () {
    assert.ok(d.querySelectorAll('#ngoTabelleVerbindungen tbody tr').length >= 40);
  });
  test('Rollentabelle listet alle 296 Rollen', function () {
    assert.strictEqual(d.querySelectorAll('#ngoTabelleRollen tbody tr').length, 296);
  });

  var suche = d.getElementById('ngoSuche');
  suche.value = 'Alliance';
  suche.dispatchEvent(new fenster.Event('input', { bubbles: true }));
  await warte(300);

  test('Suche markiert Treffer', function () {
    assert.ok(knotenAnzahl('.ngo-treffer') >= 1, 'kein Treffer markiert');
  });
  test('Statusmeldung nennt die Trefferzahl', function () {
    assert.ok(/Treffer/.test(text('ngoStatus')), text('ngoStatus'));
  });

  desktop.dom.window.close();

  gruppe('Mobilansicht (390 px)');

  var mobil = await baueSeite(390);
  test('Seite baut sich auch in Mobilbreite fehlerfrei auf', function () {
    assert.deepStrictEqual(mobil.fehler, []);
    assert.strictEqual(mobil.d.getElementById('ngoFehler').hidden, true);
  });
  test('Graph wird auch schmal gezeichnet', function () {
    assert.ok(mobil.d.querySelectorAll('.ngo-organisation').length > 0);
  });
  test('Bedienelemente sind vorhanden', function () {
    ['ngoSuche', 'ebAktuell', 'fPartei', 'fRollenart', 'fTyp', 'fVerifizierung', 'ngoReset']
      .forEach(function (feld) { assert.ok(mobil.d.getElementById(feld), 'fehlt: ' + feld); });
  });
  test('Kennzahlen auch mobil gefuellt', function () {
    assert.strictEqual(mobil.d.getElementById('kzOrganisationen').textContent.trim(), '100');
  });
  test('Detailspalte funktioniert auch mobil', function () {
    var org = mobil.d.querySelector('.ngo-organisation');
    org.dispatchEvent(new mobil.fenster.MouseEvent('click', { bubbles: true }));
    assert.ok(mobil.d.querySelectorAll('.ngo-detail-titel').length >= 5);
  });
  mobil.dom.window.close();

  console.log('\n' + bestanden + ' bestanden, ' + fehlgeschlagen + ' fehlgeschlagen');
  process.exit(fehlgeschlagen ? 1 : 0);
})();
