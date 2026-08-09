/*
 * Smoke-Test der Vorschauseite: laedt netzwerk-verflechtungen-vorschau.html in
 * eine DOM-Nachbildung, fuehrt die Seitenskripte aus und prueft die gerenderte
 * Ausgabe (Kennzahlen, Knoten- und Kantenzahl, Ansichtswechsel, Filter, Suche,
 * Detailbereich).
 *
 * Aufruf:  node scripts/test_netzwerk_seite.js
 *
 * Benoetigt jsdom. Das Repository hat bewusst kein package.json; ist jsdom
 * nicht vorhanden, wird der Test uebersprungen statt zu scheitern:
 *   npm install --no-save jsdom      (oder global installieren)
 */
'use strict';

var fs = require('fs');
var path = require('path');
var assert = require('assert');

var JSDOM;
try {
  JSDOM = require('jsdom').JSDOM;
} catch (e) {
  console.log('jsdom nicht installiert — Smoke-Test uebersprungen.');
  console.log('Installation: npm install --no-save jsdom');
  process.exit(0);
}

var WURZEL = path.join(__dirname, '..');
var SEITE = path.join(WURZEL, 'netzwerk-verflechtungen-vorschau.html');

var bestanden = 0;
var fehlgeschlagen = 0;

function test(name, fn) {
  try {
    fn();
    bestanden++;
    console.log('  ok   ' + name);
  } catch (e) {
    fehlgeschlagen++;
    console.log('  FEHL ' + name + '\n       ' + e.message);
  }
}

function warte(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

(async function () {
  var html = fs.readFileSync(SEITE, 'utf8');

  // Externe Ressourcen (Tailwind, Google Fonts) fuer den Test entfernen:
  // geprueft wird die Netzwerkfunktion, nicht das CDN.
  html = html.replace(/<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>/, '')
             .replace(/<script>\s*tailwind\.config[\s\S]*?<\/script>/, '')
             .replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/, '');

  var dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: undefined,
    url: 'http://localhost/',
    pretendToBeVisual: true
  });
  var fenster = dom.window;

  // fetch auf das Dateisystem umlenken.
  fenster.fetch = function (pfad) {
    var datei = path.join(WURZEL, String(pfad));
    return Promise.resolve({
      ok: fs.existsSync(datei),
      status: fs.existsSync(datei) ? 200 : 404,
      text: function () { return Promise.resolve(fs.readFileSync(datei, 'utf8')); }
    });
  };

  // Groesse der Zeichenflaeche nachbilden (jsdom kennt kein Layout).
  fenster.SVGElement.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: 900, height: 600, right: 900, bottom: 600 };
  };

  var fehlerImSkript = [];
  fenster.addEventListener('error', function (e) { fehlerImSkript.push(String(e.message || e.error)); });

  // Erst das Parsen abwarten, damit DOMContentLoaded nicht doppelt ausgeloest wird.
  if (fenster.document.readyState === 'loading') {
    await new Promise(function (r) { fenster.document.addEventListener('DOMContentLoaded', r); });
  }

  // Skripte der Seite in der Reihenfolge der HTML ausfuehren.
  [
    'assets/vendor/d3-force-bundle.min.js',
    'assets/netzwerk/netzwerk-daten.js',
    'assets/netzwerk/netzwerk-ansicht.js',
    'assets/netzwerk/netzwerk-seite.js'
  ].forEach(function (rel) {
    var skript = fenster.document.createElement('script');
    skript.textContent = fs.readFileSync(path.join(WURZEL, rel), 'utf8');
    fenster.document.body.appendChild(skript);
  });

  await warte(400);

  var d = fenster.document;
  function text(id) { return d.getElementById(id).textContent.trim(); }
  function knotenAnzahl() { return d.querySelectorAll('.nv-knoten-gruppe').length; }
  function kantenAnzahl() { return d.querySelectorAll('.nv-kante').length; }

  console.log('\nSeitenaufbau');

  test('keine JavaScript-Fehler beim Laden', function () {
    assert.deepStrictEqual(fehlerImSkript, []);
  });

  test('kein Fehlerhinweis sichtbar', function () {
    assert.strictEqual(d.getElementById('nvFehler').hidden, true);
  });

  test('Kennzahlen sind aus der CSV gefuellt', function () {
    assert.strictEqual(text('kzUntersucht'), '100');
    assert.strictEqual(text('kzMitBruecke'), '46');
    assert.strictEqual(text('kzPersonen'), '35');
    assert.strictEqual(text('kzPaare'), '38');
    assert.strictEqual(text('kzTeilnetze'), '11');
    assert.strictEqual(text('kzDatenstand'), '09.08.2026');
  });

  test('Methodischer Hinweis steht vollstaendig auf der Seite', function () {
    var hinweis = d.querySelector('.nv-methodik').textContent.replace(/\s+/g, ' ');
    [
      'Dargestellt sind ausschliesslich direkte Personenbrücken, die im geprüften Datenbestand öffentlich belegt sind.',
      'Eine Verbindung zeigt, dass dieselbe Person bei mindestens zwei Organisationen in einer erfassten Funktion aufgeführt ist.',
      'Das Fehlen einer Verbindung beweist nicht, dass keine weiteren Beziehungen bestehen.',
      'Die Darstellung belegt weder Koordination, Einflussnahme, Abhängigkeit noch einen Interessenkonflikt.'
    ].forEach(function (satz) {
      assert.ok(hinweis.indexOf(satz) !== -1, 'fehlt: ' + satz);
    });
  });

  test('Schlusszeile steht zuunterst auf der Seite', function () {
    var absaetze = Array.prototype.slice.call(d.querySelectorAll('footer p'));
    assert.strictEqual(absaetze[absaetze.length - 1].textContent.trim(), 'Markus Lysser - souveraene-schweiz.ch');
  });

  test('Seite ist auf noindex gesetzt', function () {
    assert.strictEqual(d.querySelector('meta[name="robots"]').getAttribute('content'), 'noindex, nofollow');
  });

  test('Teilnetz-Auswahl enthaelt alle 11 Teilnetze', function () {
    assert.strictEqual(d.getElementById('nvTeilnetz').options.length, 12); // 11 + "alle"
  });

  test('Datentabelle listet alle 35 Personen', function () {
    assert.strictEqual(d.querySelectorAll('#nvTabelle tbody tr').length, 35);
  });

  console.log('\nOrganisationsansicht');

  test('46 Organisationsknoten gezeichnet', function () {
    assert.strictEqual(knotenAnzahl(), 46);
  });

  test('38 Kanten gezeichnet', function () {
    assert.strictEqual(kantenAnzahl(), 38);
  });

  test('Kanten mit mehreren Personen tragen eine sichtbare Anzahl', function () {
    var mehrfach = d.querySelectorAll('.nv-kante--mehrfach');
    assert.strictEqual(mehrfach.length, 3);
    mehrfach.forEach(function (k) {
      var zahl = k.querySelector('.nv-kantenzahl text');
      assert.ok(zahl && parseInt(zahl.textContent, 10) > 1, 'Kantenzahl fehlt oder ist nicht groesser als 1');
    });
  });

  test('Kanten nennen die verbindenden Personen im Titel', function () {
    var titel = d.querySelector('.nv-kante title').textContent;
    assert.ok(/Verbindende Person/.test(titel), titel);
  });

  test('Knoten sind per Tastatur erreichbar und beschriftet', function () {
    var erster = d.querySelector('.nv-knoten-gruppe');
    assert.strictEqual(erster.getAttribute('tabindex'), '0');
    assert.ok(/^Organisation .+ \(NGO-\d+\)$/.test(erster.getAttribute('aria-label')));
  });

  console.log('\nBedienung');

  test('Klick auf einen Knoten fuellt den Detailbereich', function () {
    var knoten = d.querySelector('.nv-knoten-gruppe');
    knoten.dispatchEvent(new fenster.MouseEvent('click', { bubbles: true }));
    var detail = d.getElementById('nvDetail').textContent;
    assert.ok(/Organisation/.test(detail), detail.slice(0, 120));
    assert.ok(/direkte Verbindung/.test(detail), detail.slice(0, 200));
    assert.ok(/Teilnetz \d+/.test(detail), detail.slice(0, 200));
  });

  test('Detailbereich verlinkt die direkten Verbindungen', function () {
    assert.ok(d.querySelectorAll('#nvDetail .nv-detail-link').length >= 1);
  });

  test('Umschalten auf Personen–Organisationen zeigt beide Knotentypen', function () {
    d.getElementById('btnBi').dispatchEvent(new fenster.MouseEvent('click', { bubbles: true }));
    assert.strictEqual(d.querySelectorAll('.nv-organisation').length, 46);
    assert.strictEqual(d.querySelectorAll('.nv-person').length, 35);
    assert.strictEqual(kantenAnzahl(), 73);
  });

  test('Legende blendet den Personen-Eintrag passend zur Ansicht ein', function () {
    assert.strictEqual(d.getElementById('legPerson').hidden, false);
    d.getElementById('btnOrg').dispatchEvent(new fenster.MouseEvent('click', { bubbles: true }));
    assert.strictEqual(d.getElementById('legPerson').hidden, true);
  });

  test('Teilnetz-Filter reduziert die Darstellung', function () {
    var auswahl = d.getElementById('nvTeilnetz');
    auswahl.value = '2';
    auswahl.dispatchEvent(new fenster.Event('change', { bubbles: true }));
    var sichtbar = knotenAnzahl();
    assert.ok(sichtbar > 0 && sichtbar < 46, 'gefiltert wurden ' + sichtbar + ' Knoten');
    d.querySelectorAll('.nv-knoten-gruppe').forEach(function (k) {
      assert.ok(k.getAttribute('aria-label').length > 0);
    });
  });

  test('Zuruecksetzen stellt das vollstaendige Netz wieder her', function () {
    d.getElementById('nvReset').dispatchEvent(new fenster.MouseEvent('click', { bubbles: true }));
    assert.strictEqual(knotenAnzahl(), 46);
    assert.strictEqual(d.getElementById('nvTeilnetz').value, '0');
    assert.strictEqual(d.getElementById('nvSuche').value, '');
  });

  var suchfeld = d.getElementById('nvSuche');
  suchfeld.value = 'SAV';
  suchfeld.dispatchEvent(new fenster.Event('input', { bubbles: true }));
  await warte(260);

  test('Suchtreffer sind markiert', function () {
    assert.ok(d.querySelectorAll('.nv-treffer').length >= 1, 'kein Treffer markiert');
    assert.ok(d.querySelectorAll('.nv-gedaempft').length >= 1, 'nichts gedaempft');
  });

  test('Statusmeldung nennt die Trefferzahl', function () {
    assert.ok(/Treffer/.test(text('nvStatus')), text('nvStatus'));
  });

  console.log('\n' + bestanden + ' bestanden, ' + fehlgeschlagen + ' fehlgeschlagen');
  dom.window.close();
  process.exit(fehlgeschlagen ? 1 : 0);
})();
