/*
 * Smoke-Test der Cockpit-Seite: laedt sie in eine DOM-Nachbildung, fuehrt die
 * Seitenskripte aus und prueft, dass jede Zahl aus den Daten stammt und die
 * Interpretationsgrenzen dabeistehen.
 *
 * Aufruf:  node scripts/test_ngo_cockpit.js
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
var SEITE = path.join(WURZEL, 'ngo', 'cockpit.html');
var SKRIPTE = ['assets/ngo/ngo-netz-daten.js', 'assets/ngo/ngo-cockpit.js'];
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
  var t = String(text).replace(/[’'\s]/g, '').match(/\d+/);
  return t ? parseInt(t[0], 10) : null;
}

(async function () {
  var html = fs.readFileSync(SEITE, 'utf8');
  var dom = new JSDOM(html, {
    runScripts: 'dangerously', url: 'http://localhost/ngo/cockpit.html', pretendToBeVisual: true
  });
  var fenster = dom.window;
  var d = fenster.document;

  fenster.fetch = function (pfad) {
    var datei = path.resolve(path.dirname(SEITE), String(pfad));
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
  await warte(700);

  function text(name) { return d.getElementById(name).textContent.trim(); }

  gruppe('Seitenaufbau');

  test('keine JavaScript-Fehler', function () { assert.deepStrictEqual(fehler, []); });
  test('kein Fehlerhinweis sichtbar', function () {
    assert.strictEqual(d.getElementById('ckFehler').hidden, true);
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
  test('Version und Datenstand stehen auf der Seite', function () {
    assert.ok(/3\.7\.49/.test(text('ckVersion')), text('ckVersion'));
    assert.ok(/19\.08\.2026/.test(text('ckVersion')), text('ckVersion'));
  });

  gruppe('Kennzahlen kommen aus den Daten');

  test('sechs Kacheln, erste Zahlen stimmen mit dem Datenstand', function () {
    var kacheln = d.querySelectorAll('#ckKennzahlen .ck-kennzahl');
    assert.strictEqual(kacheln.length, 6);
    var werte = Array.prototype.slice.call(kacheln).map(function (k) {
      return zahl(k.querySelector('b').textContent);
    });
    assert.strictEqual(werte[0], Z.organisationen);
    assert.strictEqual(werte[1], Z.personen);
    assert.strictEqual(werte[2], Z.kanten);
    assert.strictEqual(werte[3], Z.brueckenpersonen);
    assert.strictEqual(werte[5], Z.abdeckungsluecken);
  });

  gruppe('Verteilungen und Ranglisten');

  test('Verteilung nach Obergruppe zaehlt alle Organisationen', function () {
    var werte = Array.prototype.slice
      .call(d.querySelectorAll('#ckObergruppen .ck-balken-wert'))
      .map(function (e) { return zahl(e.textContent); });
    assert.ok(werte.length >= 3, werte.length + ' Obergruppen');
    assert.strictEqual(werte.reduce(function (a, b) { return a + b; }, 0), Z.organisationen);
  });
  test('Verteilung nach Beziehungsart zaehlt alle Beziehungen', function () {
    var werte = Array.prototype.slice
      .call(d.querySelectorAll('#ckKlassen .ck-balken-wert'))
      .map(function (e) { return zahl(e.textContent); });
    assert.strictEqual(werte.length, 4);
    assert.strictEqual(werte.reduce(function (a, b) { return a + b; }, 0), Z.kanten);
  });
  test('Personenrangliste ist absteigend und verlinkt in den Personenfokus', function () {
    var zeilen = d.querySelectorAll('#ckPersonen li');
    assert.strictEqual(zeilen.length, 10);
    var werte = Array.prototype.slice.call(zeilen).map(function (z) {
      return zahl(z.querySelector('.ck-balken-wert').textContent);
    });
    for (var i = 1; i < werte.length; i++) {
      assert.ok(werte[i] <= werte[i - 1], 'nicht absteigend: ' + werte.join(','));
    }
    var link = zeilen[0].querySelector('a');
    assert.ok(link && /\.\/\?person=\d+/.test(link.getAttribute('href')), link && link.href);
  });
  test('Organisationsrangliste verlinkt ins Gesamtnetz', function () {
    var link = d.querySelector('#ckOrganisationen li a');
    assert.ok(link && /ebene=organisation&knoten=NGO-/.test(link.getAttribute('href')),
      link && link.getAttribute('href'));
  });
  test('Ranglisten nennen nur Zahlen aus dem Bestand', function () {
    var groesste = DATEN.organisationen.reduce(function (m, o) {
      return Math.max(m, o.personen || 0);
    }, 0);
    var erste = zahl(d.querySelector('#ckOrganisationen .ck-balken-wert').textContent);
    assert.strictEqual(erste, groesste);
  });

  test('Personenrangliste nennt die Parteiangabe der Person', function () {
    var zeilen = d.querySelectorAll('#ckPersonen li');
    var mitPartei = Array.prototype.slice.call(zeilen).filter(function (z) {
      return z.querySelector('.ck-liste-zusatz');
    });
    assert.ok(mitPartei.length > 0, 'keine einzige Parteiangabe in der Rangliste');
    var chip = mitPartei[0].querySelector('.ck-liste-zusatz');
    assert.ok(chip.textContent.trim().length > 0, 'leere Parteiangabe');
    assert.ok(/Parteiangabe der Person/.test(chip.getAttribute('title')),
      chip.getAttribute('title'));
  });
  test('der Personenlink nimmt die erweiterte Ansicht mit', function () {
    // Sonst zeigt der Personenfokus weniger Organisationen als hier gezaehlt.
    var link = d.querySelector('#ckPersonen li a').getAttribute('href');
    assert.ok(/ansicht=G2/.test(link), link);
    assert.ok(/klassen=N1,N2,N3,N4/.test(link), link);
  });
  test('Parteiangaben fuehren zu den Organisationen dieser Partei', function () {
    var links = d.querySelectorAll('#ckParteien a.ck-balken-name');
    var balken = d.querySelectorAll('#ckParteien li');
    assert.strictEqual(links.length, balken.length);
    var href = links[0].getAttribute('href');
    assert.ok(/partei=/.test(href), href);
    // Alle vier Beziehungsarten: sonst zaehlt der Balken mehr, als das Netz zeigt.
    assert.ok(/ansicht=G2/.test(href), href);
    assert.ok(/klassen=N1,N2,N3,N4/.test(href), href);
  });
  test('Obergruppen fuehren gefiltert ins Netzwerk', function () {
    var links = d.querySelectorAll('#ckObergruppen a.ck-balken-name');
    var balken = d.querySelectorAll('#ckObergruppen li');
    assert.strictEqual(links.length, balken.length);
    assert.ok(/^\.\/\?obergruppe=/.test(links[0].getAttribute('href')),
      links[0].getAttribute('href'));
  });

  gruppe('Interpretationsschutz');

  test('Parteiangaben stehen mit der Einschraenkung', function () {
    var hinweis = text('ckParteiHinweis');
    assert.ok(/keine Parteizugehörigkeit der Organisation/.test(hinweis), hinweis);
    var kopf = d.querySelector('.ck-partei-kopf').textContent;
    assert.ok(/Parteiangabe/.test(kopf), kopf);
  });
  test('Ranglisten sind als Zaehlung gekennzeichnet, nicht als Einfluss', function () {
    var t = d.querySelector('#ckPersonen').parentNode.textContent;
    assert.ok(/kein Mass für Einfluss/.test(t), t.slice(0, 120));
  });
  test('Methodikhinweis benennt die Grenzen', function () {
    var t = d.querySelector('.nv-methodik').textContent.replace(/\s+/g, ' ');
    assert.ok(t.indexOf('nicht, wie einflussreich') !== -1);
    assert.ok(t.indexOf('kein Nachweis fehlender Vernetzung') !== -1);
    assert.ok(t.indexOf('keine Parteizugehörigkeit einer Organisation ableiten') !== -1);
  });
  test('Wort «Einflussranking» kommt nicht vor', function () {
    assert.strictEqual(/Einflussranking/.test(d.body.textContent), false);
  });
  test('Cluster werden nicht als Akteure dargestellt', function () {
    var t = d.querySelector('.ck-vorschau-text').textContent;
    assert.ok(/keine Akteure/.test(t), t.slice(0, 160));
  });

  gruppe('Vorschau und Einstiege');

  test('Clustervorschau zeichnet alle Cluster', function () {
    assert.strictEqual(d.querySelectorAll('#ckVorschau .ck-vorschau-knoten').length,
      DATEN.cluster.length);
    assert.ok(d.querySelectorAll('#ckVorschau .ck-vorschau-linie').length > 10);
  });
  test('jeder Clusterknoten traegt seinen Namen als Titel', function () {
    var titel = d.querySelectorAll('#ckVorschau .ck-vorschau-knoten title');
    assert.strictEqual(titel.length, DATEN.cluster.length);
    assert.ok(/Organisationen$/.test(titel[0].textContent), titel[0].textContent);
  });
  test('vier Einstiege fuehren auf die Netzwerkseite', function () {
    var einstiege = d.querySelectorAll('.ck-einstieg');
    assert.strictEqual(einstiege.length, 4);
    einstiege.forEach(function (a) {
      assert.ok(a.getAttribute('href').indexOf('./') === 0, a.getAttribute('href'));
    });
  });
  test('die Netzwerkseite bleibt unveraendert erreichbar', function () {
    assert.ok(fs.existsSync(path.join(WURZEL, 'ngo', 'index.html')));
    // Der Rueckverweis wird in der Brotkrumenzeile erzeugt, nicht im Markup.
    var modul = fs.readFileSync(
      path.join(WURZEL, 'assets', 'ngo', 'ngo-netz-seite.js'), 'utf8');
    assert.ok(/cockpit\.html/.test(modul), 'kein Rueckverweis vom Netzwerk aufs Cockpit');
  });

  console.log('\n' + bestanden + ' Tests bestanden, ' + fehlgeschlagen + ' fehlgeschlagen.');
  process.exit(fehlgeschlagen ? 1 : 0);
})();
