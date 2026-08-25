/*
 * Smoke-Test der zweiten Cockpitfassung: laedt sie in eine DOM-Nachbildung,
 * fuehrt die Seitenskripte aus und prueft, dass jede Zahl aus den Daten
 * stammt, die Filter wirken und die Interpretationsgrenzen dabeistehen.
 *
 * Aufruf:  node scripts/test_ngo_cockpit_v2.js
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
  process.exit(0);
}

var WURZEL = path.join(__dirname, '..');
var SEITE = path.join(WURZEL, 'ngo', 'cockpit-v2.html');
var SKRIPTE = ['assets/ngo/ngo-netz-daten.js', 'assets/ngo/ngo-cockpit-v2.js'];
var DATEN = JSON.parse(fs.readFileSync(
  path.join(WURZEL, 'assets', 'ngo', 'ngo-netzwerk.json'), 'utf8'));
var Z = DATEN.meta.zahlen;

var bestanden = 0, fehlgeschlagen = 0;
function test(name, fn) {
  try { fn(); bestanden++; console.log('  ok   ' + name); }
  catch (e) { fehlgeschlagen++; console.log('  FEHL ' + name + '\n       ' + e.message); }
}
function gruppe(t) { console.log('\n' + t); }
function warte(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/** Zahl aus einem Text loesen, Tausendertrenner entfernt. */
function zahl(text) {
  var t = String(text).replace(/[’'\s]/g, '').match(/-?\d+/);
  return t ? parseInt(t[0], 10) : null;
}

(async function () {
  var html = fs.readFileSync(SEITE, 'utf8');
  var dom = new JSDOM(html, {
    runScripts: 'dangerously', url: 'http://localhost/ngo/cockpit-v2.html',
    pretendToBeVisual: true
  });
  var fenster = dom.window;
  var d = fenster.document;

  fenster.fetch = function (pfad) {
    // Der Cache-Busting-Anhang gehoert nicht zum Dateinamen.
    var datei = path.resolve(path.dirname(SEITE), String(pfad).split('?')[0]);
    var da = fs.existsSync(datei);
    return Promise.resolve({
      ok: da, status: da ? 200 : 404,
      json: function () { return Promise.resolve(JSON.parse(fs.readFileSync(datei, 'utf8'))); }
    });
  };

  var fehler = [];
  fenster.addEventListener('error', function (e) { fehler.push(String(e.message || e.error)); });

  if (d.readyState === 'loading') {
    await new Promise(function (r) { d.addEventListener('DOMContentLoaded', r); });
  }
  SKRIPTE.forEach(function (rel) {
    var s = d.createElement('script');
    s.textContent = fs.readFileSync(path.join(WURZEL, rel), 'utf8');
    d.body.appendChild(s);
  });
  await warte(900);

  function text(name) { return d.getElementById(name).textContent.trim(); }
  function klick(el) { el.dispatchEvent(new fenster.MouseEvent('click', { bubbles: true })); }
  function wechsle(el) { el.dispatchEvent(new fenster.Event('change', { bubbles: true })); }
  function kpiZahlen() {
    return Array.prototype.slice.call(d.querySelectorAll('#c2Kpi .c2-kpi-zahl'))
      .map(function (e) { return zahl(e.textContent); });
  }
  function balken(id) {
    return Array.prototype.slice.call(d.querySelectorAll('#' + id + ' .c2-wert'))
      .map(function (e) { return zahl(e.textContent); });
  }

  gruppe('Seitenaufbau');

  test('keine JavaScript-Fehler', function () { assert.deepStrictEqual(fehler, []); });
  test('kein Fehlerhinweis sichtbar', function () {
    assert.strictEqual(d.getElementById('c2Fehler').hidden, true);
  });
  test('noindex bleibt gesetzt', function () {
    assert.strictEqual(d.querySelector('meta[name="robots"]').getAttribute('content'),
      'noindex, nofollow');
  });
  test('keine externen Ressourcen geladen', function () {
    var geladen = 'link[href], script[src], img[src], iframe[src]';
    var extern = Array.prototype.slice.call(d.querySelectorAll(geladen)).filter(function (e) {
      return /^https?:/.test(e.getAttribute('src') || e.getAttribute('href') || '');
    });
    assert.deepStrictEqual(extern.map(function (e) {
      return e.getAttribute('src') || e.getAttribute('href');
    }), []);
  });
  test('die Kopfzeile nennt Datenstand und Version aus den Daten', function () {
    var version = (DATEN.meta.masterVersion || '').split('–')[0].trim();
    var kopf = text('c2Version');
    assert.ok(kopf.indexOf(version) !== -1, kopf);
    assert.ok(/\d{2}\.\d{2}\.\d{4}/.test(kopf), kopf);
  });
  test('die erste Fassung bleibt erreichbar', function () {
    var verweis = d.querySelector('.c2-fassung a[href="cockpit.html"]');
    assert.ok(verweis, 'kein Verweis auf die alte Fassung');
    assert.ok(fs.existsSync(path.join(WURZEL, 'ngo', 'cockpit.html')));
  });

  gruppe('Kennzahlen');

  test('fuenf Kacheln, Zahlen stimmen mit dem Datenstand', function () {
    var werte = kpiZahlen();
    assert.strictEqual(werte.length, 5);
    assert.strictEqual(werte[0], Z.organisationen);
    assert.strictEqual(werte[2], Z.kanten);
    assert.strictEqual(werte[3], Z.brueckenpersonen);
    // Personen: nur die mit gezeichneter Beziehung, also hoechstens der Bestand.
    assert.ok(werte[1] > 0 && werte[1] <= Z.personen, werte[1] + ' von ' + Z.personen);
  });
  test('vier Kacheln sind Knoepfe, die fuenfte nicht', function () {
    var kacheln = d.querySelectorAll('#c2Kpi .c2-kpi-karte');
    assert.strictEqual(kacheln.length, 5);
    for (var i = 0; i < 4; i++) {
      assert.strictEqual(kacheln[i].tagName, 'BUTTON', 'Kachel ' + (i + 1));
    }
    // Der Schnitt je Brueckenperson ist eine abgeleitete Groesse ohne eigenen
    // Filter und darf deshalb nicht wie ein Schalter aussehen.
    assert.strictEqual(kacheln[4].tagName, 'DIV');
  });

  gruppe('Verteilungen');

  test('Obergruppen zaehlen alle Organisationen', function () {
    var werte = balken('c2ObergruppeBalken');
    assert.ok(werte.length >= 3, werte.length + ' Obergruppen');
    assert.strictEqual(werte.reduce(function (a, b) { return a + b; }, 0), Z.organisationen);
  });
  test('Beziehungsarten zaehlen alle Beziehungen', function () {
    var werte = balken('c2KlassenBalken');
    assert.strictEqual(werte.length, 4);
    assert.strictEqual(werte.reduce(function (a, b) { return a + b; }, 0), Z.kanten);
  });
  test('Parteiangaben sind absteigend und hoechstens acht', function () {
    var werte = balken('c2ParteiBalken');
    assert.ok(werte.length > 0 && werte.length <= 8, werte.length + ' Parteien');
    for (var i = 1; i < werte.length; i++) {
      assert.ok(werte[i] <= werte[i - 1], 'nicht absteigend: ' + werte.join(','));
    }
  });

  gruppe('Treemap');

  test('die Treemap zeigt hoechstens zwoelf Cluster und verlinkt sie', function () {
    var felder = d.querySelectorAll('#c2Treemap a');
    assert.ok(felder.length > 0 && felder.length <= 12, felder.length + ' Felder');
    assert.ok(/^\.\/\?fokus=/.test(felder[0].getAttribute('href')),
      felder[0].getAttribute('href'));
  });
  test('die Isolate stehen nicht als groesstes Feld im Bild', function () {
    // Cluster 0 sammelt die Organisationen ohne belegte Projektion; als Flaeche
    // beherrschte er das Bild, ohne eine Gruppe zu sein.
    var ziele = Array.prototype.slice.call(d.querySelectorAll('#c2Treemap a'))
      .map(function (a) { return a.getAttribute('href'); });
    assert.strictEqual(ziele.indexOf('./?fokus=0'), -1, 'Cluster 0 ist abgebildet');
    assert.ok(/keine belegte Projektion/.test(text('c2ClusterFuss')), text('c2ClusterFuss'));
  });
  test('jedes Feld traegt Name und Zahl als Titel', function () {
    var titel = d.querySelectorAll('#c2Treemap title');
    assert.ok(titel.length > 0);
    assert.ok(/\d+ Organisationen/.test(titel[0].textContent), titel[0].textContent);
  });
  test('die volle Clusterliste ist erst auf Klick da', function () {
    var liste = d.getElementById('c2ClusterListe');
    assert.strictEqual(liste.hidden, true, 'Clusterliste steht schon offen');
    klick(d.getElementById('c2AlleCluster'));
    assert.strictEqual(liste.hidden, false);
    assert.ok(liste.querySelectorAll('li').length > 12, 'Liste ist nicht vollstaendig');
    klick(d.getElementById('c2AlleCluster'));
    assert.strictEqual(liste.hidden, true);
  });

  gruppe('Ranglisten');

  test('Personen: hoechstens sieben, absteigend, mit Parteiangabe', function () {
    var zeilen = d.querySelectorAll('#c2Personen li');
    assert.ok(zeilen.length > 0 && zeilen.length <= 7, zeilen.length + ' Zeilen');
    var werte = Array.prototype.slice.call(zeilen).map(function (z) {
      return zahl(z.querySelector('.c2-wert').textContent);
    });
    for (var i = 1; i < werte.length; i++) {
      assert.ok(werte[i] <= werte[i - 1], 'nicht absteigend: ' + werte.join(','));
    }
    assert.ok(d.querySelector('#c2Personen .c2-rang-zusatz'), 'keine Parteiangabe');
    assert.ok(/\.\/\?person=\d+/.test(
      d.querySelector('#c2Personen a').getAttribute('href')));
  });
  test('Organisationen: hoechstens sieben, verlinkt ins Netz', function () {
    var zeilen = d.querySelectorAll('#c2Organisationen li');
    assert.ok(zeilen.length > 0 && zeilen.length <= 7, zeilen.length + ' Zeilen');
    assert.ok(/ebene=organisation&knoten=NGO-/.test(
      d.querySelector('#c2Organisationen a').getAttribute('href')));
  });
  test('die Personenperspektive wird mit allen Beziehungsarten geoeffnet', function () {
    // Sonst zaehlt sie anders als die Rangliste, aus der man kommt.
    var ziel = d.getElementById('c2PersonenLink').getAttribute('href');
    assert.ok(/ansicht=G2/.test(ziel), ziel);
    assert.ok(/klassen=N1,N2,N3,N4/.test(ziel), ziel);
  });

  gruppe('Filter');

  test('ohne Filter sagt die Seite das ausdruecklich', function () {
    assert.ok(/Kein Filter gesetzt/.test(text('c2Chips')), text('c2Chips'));
    assert.ok(/Ganzer Bestand/.test(text('c2Lage')), text('c2Lage'));
  });
  test('ein Klick auf eine Obergruppe filtert die ganze Seite', function () {
    var vorher = kpiZahlen()[0];
    var knopf = d.querySelector('#c2ObergruppeBalken li button');
    var name = knopf.textContent;
    klick(knopf);
    var nachher = kpiZahlen()[0];
    assert.ok(nachher < vorher, nachher + ' statt weniger als ' + vorher);
    assert.ok(text('c2Chips').indexOf(name) !== -1, text('c2Chips'));
    assert.ok(/Gefilterter Ausschnitt/.test(text('c2Lage')), text('c2Lage'));
    // Auch die Beziehungen und die Ranglisten muessen mitgehen.
    var kanten = balken('c2KlassenBalken').reduce(function (a, b) { return a + b; }, 0);
    assert.ok(kanten < Z.kanten, kanten + ' Beziehungen, ungefiltert ' + Z.kanten);
  });
  test('der Chip nimmt den Filter wieder weg', function () {
    klick(d.querySelector('#c2Chips .c2-chip'));
    assert.strictEqual(kpiZahlen()[0], Z.organisationen);
    assert.ok(/Kein Filter gesetzt/.test(text('c2Chips')), text('c2Chips'));
  });
  test('«nur Kernnetz» nimmt N4 heraus und sperrt den Knopf', function () {
    var feld = d.getElementById('c2Kernnetz');
    feld.checked = true;
    wechsle(feld);
    var werte = balken('c2KlassenBalken');
    assert.strictEqual(werte[3], 0, 'N4 ist noch enthalten');
    assert.strictEqual(werte.reduce(function (a, b) { return a + b; }, 0), Z.kantenG3);
    var n4 = d.querySelector('#c2Klassen button[data-klasse="N4"]');
    assert.strictEqual(n4.disabled, true);
    feld.checked = false;
    wechsle(feld);
    assert.strictEqual(n4.disabled, false);
  });
  test('die Kennzahlkachel schaltet denselben Filter', function () {
    var kachel = d.querySelectorAll('#c2Kpi .c2-kpi-karte')[2];
    klick(kachel);
    assert.strictEqual(d.getElementById('c2Kernnetz').checked, true);
    assert.strictEqual(kpiZahlen()[2], Z.kantenG3);
    klick(d.querySelectorAll('#c2Kpi .c2-kpi-karte')[2]);
    assert.strictEqual(kpiZahlen()[2], Z.kanten);
  });
  test('«alle zuruecksetzen» stellt den ganzen Bestand wieder her', function () {
    var feld = d.getElementById('c2Kernnetz');
    feld.checked = true;
    wechsle(feld);
    d.getElementById('c2Partei').value = 'SP';
    wechsle(d.getElementById('c2Partei'));
    assert.ok(/Gefilterter Ausschnitt/.test(text('c2Lage')));
    klick(d.querySelector('#c2Chips .c2-zuruecksetzen'));
    assert.strictEqual(kpiZahlen()[0], Z.organisationen);
    assert.strictEqual(kpiZahlen()[2], Z.kanten);
    assert.strictEqual(d.getElementById('c2Kernnetz').checked, false);
    assert.strictEqual(d.getElementById('c2Partei').value, '');
  });
  test('mindestens eine Beziehungsart bleibt immer an', function () {
    var knoepfe = d.querySelectorAll('#c2Klassen button');
    knoepfe.forEach(function (b) { klick(b); });
    var an = Array.prototype.slice.call(knoepfe).filter(function (b) {
      return b.getAttribute('aria-pressed') === 'true';
    });
    assert.ok(an.length >= 1, 'alle Beziehungsarten abgeschaltet');
    klick(d.querySelector('#c2Chips .c2-zuruecksetzen'));
  });
  test('der Sitzfilter sagt, wie oft er ueberhaupt erfasst ist', function () {
    // Bei 3.7.51 tragen nur 364 von 2852 Organisationen einen Kanton.
    var erste = d.getElementById('c2Kanton').options[0].textContent;
    assert.ok(/Sitz bei .* erfasst/.test(erste), erste);
  });

  gruppe('Suche');

  test('die Suche findet Organisationen und Personen', function () {
    var feld = d.getElementById('c2Suche');
    feld.value = 'Gysi';
    feld.dispatchEvent(new fenster.Event('input', { bubbles: true }));
    var kasten = d.getElementById('c2Treffer');
    assert.strictEqual(kasten.hidden, false);
    var arten = Array.prototype.slice.call(kasten.querySelectorAll('.c2-treffer-art'))
      .map(function (e) { return e.textContent; });
    assert.ok(arten.indexOf('Person') !== -1, arten.join(', '));
  });
  test('kurze Eingaben oeffnen nichts', function () {
    var feld = d.getElementById('c2Suche');
    feld.value = 'G';
    feld.dispatchEvent(new fenster.Event('input', { bubbles: true }));
    assert.strictEqual(d.getElementById('c2Treffer').hidden, true);
  });

  gruppe('Interpretationsschutz');

  test('Wort «Einflussranking» kommt nicht vor', function () {
    assert.strictEqual(/Einflussranking/.test(d.body.textContent), false);
  });
  test('der Transparenzhinweis nennt die Grenzen und ist einklappbar', function () {
    var block = d.querySelector('.c2-transparenz');
    assert.strictEqual(block.tagName, 'DETAILS');
    assert.strictEqual(block.open, false, 'Hinweis steht offen');
    var t = block.textContent.replace(/\s+/g, ' ');
    assert.ok(t.indexOf('nicht, wie einflussreich') !== -1);
    assert.ok(t.indexOf('kein Nachweis fehlender Vernetzung') !== -1);
    assert.ok(t.indexOf('keine Parteizugehörigkeit einer Organisation ableiten') !== -1);
    assert.ok(t.indexOf('rechnerische Gruppen, keine Akteure') !== -1);
  });
  test('die Parteiangaben tragen ihre Einschraenkung hinter dem i-Knopf', function () {
    var knopf = d.querySelector('[data-c2-hinweis="partei"]');
    assert.ok(knopf, 'kein i-Knopf bei den Parteiangaben');
    klick(knopf);
    var kasten = knopf.closest('.c2-karte').querySelector('.ck-hinweis');
    assert.ok(kasten, 'Hinweis erscheint nicht');
    assert.ok(/keine Parteizugehörigkeit der Organisation/.test(kasten.textContent),
      kasten.textContent);
  });
  test('die vier Einstiege bleiben erhalten', function () {
    var einstiege = d.querySelectorAll('.ck-einstieg');
    assert.strictEqual(einstiege.length, 4);
    einstiege.forEach(function (a) {
      assert.ok(a.getAttribute('href').indexOf('./') === 0, a.getAttribute('href'));
    });
  });

  console.log('\n' + bestanden + ' Tests bestanden, ' + fehlgeschlagen + ' fehlgeschlagen.');
  process.exit(fehlgeschlagen ? 1 : 0);
})();
