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
    // Beides kommt aus den Daten, nicht aus dem Markup.
    var version = (DATEN.meta.masterVersion || '').split('–')[0].trim();
    assert.ok(text('ckVersion').indexOf(version) !== -1, text('ckVersion'));
    assert.ok(/\d{2}\.\d{2}\.\d{4}/.test(text('ckVersion')), text('ckVersion'));
  });

  gruppe('Kennzahlen kommen aus den Daten');

  test('fuenf Kacheln, Zahlen stimmen mit dem Datenstand', function () {
    var kacheln = d.querySelectorAll('#ckKennzahlen .ck-kennzahl');
    assert.strictEqual(kacheln.length, 5);
    var werte = Array.prototype.slice.call(kacheln).map(function (k) {
      return zahl(k.querySelector('b').textContent);
    });
    assert.strictEqual(werte[0], Z.organisationen);
    assert.strictEqual(werte[1], Z.personen);
    assert.strictEqual(werte[2], Z.kanten);
    assert.strictEqual(werte[3], Z.brueckenpersonen);
  });
  test('Zahl und Beschriftung stehen in einer Zeile, der Zusatz darunter', function () {
    var kacheln = d.querySelectorAll('#ckKennzahlen .ck-kennzahl');
    Array.prototype.slice.call(kacheln).forEach(function (k, i) {
      var zeile = k.querySelector('.ck-kennzahl-zeile');
      assert.ok(zeile, 'Kachel ' + (i + 1) + ' ohne gemeinsame Zeile');
      assert.ok(zeile.querySelector('b') && zeile.querySelector('span'),
        'Kachel ' + (i + 1) + ': Zahl und Beschriftung nicht in derselben Zeile');
      var klein = k.querySelector('small');
      // Der volle Text bleibt als Titel erreichbar, auch wenn er abgeschnitten wird.
      if (klein) assert.strictEqual(klein.getAttribute('title'), klein.textContent);
    });
    var css = fs.readFileSync(
      path.join(WURZEL, 'assets', 'ngo', 'ngo-cockpit.css'), 'utf8');
    assert.ok(/-webkit-line-clamp:\s*2/.test(css), 'Zusatz ist nicht auf zwei Zeilen begrenzt');
  });
  test('die Kopfzeile nennt nur Datenstand und Version', function () {
    var kopf = text('ckVersion');
    assert.ok(/^Datenstand \d{2}\.\d{2}\.\d{4}, Version [\w.\-]+$/.test(kopf), kopf);
    var lead = d.querySelector('.page-hero .lead').textContent.trim();
    assert.strictEqual(lead, kopf, lead);
  });

  gruppe('Verteilungen und Ranglisten');

  test('Verteilung nach Kategorie zaehlt alle Organisationen', function () {
    var werte = Array.prototype.slice
      .call(d.querySelectorAll('#ckKategorien .ck-balken-wert'))
      .map(function (e) { return zahl(e.textContent); });
    // Alle Kategorien einzeln: bei 17 waere eine Sammelzeile groesser als
    // alles Gezeigte zusammen.
    assert.strictEqual(werte.length, DATEN.meta.kategorien.length,
      werte.length + ' Zeilen fuer ' + DATEN.meta.kategorien.length + ' Kategorien');
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
    assert.strictEqual(zeilen.length, 5);
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
  test('Kategorien fuehren gefiltert ins Netzwerk', function () {
    var links = d.querySelectorAll('#ckKategorien a.ck-balken-name');
    var balken = d.querySelectorAll('#ckKategorien li');
    // Jede Kategorie ist einzeln benannt und verlinkt — es gibt hier keine
    // Sammelzeile.
    assert.strictEqual(links.length, balken.length);
    assert.ok(/^\.\/\?kategorie=/.test(links[0].getAttribute('href')),
      links[0].getAttribute('href'));
  });
  test('Verteilungen zeigen hoechstens fuenf Zeilen', function () {
    ['ckKlassen', 'ckPersonen'].forEach(function (name) {
      var zeilen = d.querySelectorAll('#' + name + ' li').length;
      assert.ok(zeilen > 0 && zeilen <= 5, name + ': ' + zeilen + ' Zeilen');
    });
  });
  test('die Kategorienverteilung ergibt den Gesamtbestand', function () {
    // Jede Kategorie steht einzeln. Die Summe muss den Bestand ergeben —
    // sonst waere unterwegs etwas abgeschnitten worden.
    var zeilen = d.querySelectorAll('#ckKategorien li');
    var alle = {};
    DATEN.organisationen.forEach(function (o) {
      alle[o.kategorie] = (alle[o.kategorie] || 0) + 1;
    });
    assert.strictEqual(zeilen.length, Object.keys(alle).length);
    var summe = Array.prototype.slice
      .call(d.querySelectorAll('#ckKategorien .ck-balken-wert'))
      .reduce(function (a, e) { return a + zahl(e.textContent); }, 0);
    assert.strictEqual(summe, Z.organisationen);
  });

  test('die Fussnote trennt Kategorie und Cluster', function () {
    var fuss = text('ckKategorienFuss');
    assert.ok(/Kategorie/.test(fuss) && /Cluster/.test(fuss), fuss);
    assert.ok(/unabhängig/i.test(fuss), fuss);
  });

  gruppe('Interpretationsschutz');

  test('die Einschraenkung zu den Parteiangaben bleibt erreichbar', function () {
    // Sie steht nicht mehr unter der Karte, sondern hinter dem i-Knopf.
    var knopf = d.querySelector('[data-ck-hinweis="partei"]');
    assert.ok(knopf, 'kein i-Knopf bei den Parteiangaben');
    knopf.click();
    var kasten = d.querySelector('.ck-hinweis');
    assert.ok(kasten, 'Hinweis erscheint nicht');
    assert.ok(/keine Parteizugehörigkeit der Organisation/.test(kasten.textContent),
      kasten.textContent);
    var kopf = d.querySelector('.ck-partei-kopf').textContent;
    assert.ok(/Parteiangabe/.test(kopf), kopf);
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
    var t = d.getElementById('ckClusterListe').parentNode.textContent;
    assert.ok(/keine Akteure/.test(t), t.slice(0, 200));
  });

  gruppe('Vorschau und Einstiege');

  test('statt eines Clusterbilds steht die benannte Liste', function () {
    // Mit 64 Clustern und ueber 600 Verbindungen zwischen ihnen waere ein
    // Netzbild ein Knaeuel. Die Liste zeigt dieselben Cluster lesbar.
    assert.strictEqual(d.getElementById('ckVorschau'), null, 'Vorschaugrafik noch vorhanden');
    assert.strictEqual(d.querySelectorAll('#ckClusterListe li').length, DATEN.cluster.length);
  });
  test('die Kopfzeile der Cluster nennt Zahl und Verbindungen', function () {
    var kopf = text('ckClusterKopf');
    assert.ok(kopf.indexOf(String(DATEN.cluster.length)) === 0, kopf);
    assert.ok(/Verbindungen zwischen ihnen/.test(kopf), kopf);
  });
  test('die Cluster sind einzeln anklickbar', function () {
    var zeilen = d.querySelectorAll('#ckClusterListe li a');
    assert.ok(/^\.\/\?fokus=/.test(zeilen[0].getAttribute('href')),
      zeilen[0].getAttribute('href'));
    assert.strictEqual(zeilen.length, DATEN.cluster.length);
    assert.ok(zeilen[0].textContent.length > 4, zeilen[0].textContent);
    var ziele = {};
    Array.prototype.slice.call(zeilen).forEach(function (a) {
      ziele[a.getAttribute('href')] = true;
    });
    assert.strictEqual(Object.keys(ziele).length, DATEN.cluster.length,
      'zwei Cluster fuehren an dieselbe Stelle');
  });
  test('die Clusterliste nennt Nummer, Name und Mitgliederzahl', function () {
    var erste = d.querySelector('#ckClusterListe li a');
    assert.ok(erste.querySelector('.ck-cl-nummer'), 'keine Nummer');
    assert.ok(erste.querySelector('.ck-cl-name'), 'kein Name');
    var zahl = parseInt(erste.querySelector('.ck-cl-zahl').textContent, 10);
    var summe = 0;
    Array.prototype.slice.call(d.querySelectorAll('#ckClusterListe .ck-cl-zahl'))
      .forEach(function (e) { summe += parseInt(e.textContent, 10); });
    assert.ok(zahl > 0, 'Mitgliederzahl fehlt');
    assert.ok(summe > 0 && summe <= DATEN.organisationen.length,
      summe + ' Mitglieder bei ' + DATEN.organisationen.length + ' Organisationen');
  });
  test('die ersten drei Kacheln stehen nebeneinander, die uebrigen darunter', function () {
    var karten = d.querySelectorAll('.ck-raster > .ck-karte');
    assert.strictEqual(karten.length, 6);
    for (var i = 0; i < 3; i++) {
      assert.strictEqual(karten[i].classList.contains('ck-karte--breit'), false,
        'Kachel ' + (i + 1) + ' ist breit statt in der Dreierreihe');
    }
    // Kachel 4 und 5 stehen nebeneinander, Kachel 6 in voller Breite.
    ['ck-karte--halb', 'ck-karte--halb', 'ck-karte--breit'].forEach(function (klasse, k) {
      assert.strictEqual(karten[3 + k].classList.contains(klasse), true,
        'Kachel ' + (4 + k) + ' traegt nicht ' + klasse);
    });
    var css = fs.readFileSync(
      path.join(WURZEL, 'assets', 'ngo', 'ngo-cockpit.css'), 'utf8');
    // Sechs Spalten: drei Kacheln zu zwei, zwei zu drei, eine ueber alles.
    assert.ok(/\.ck-raster \{[^}]*repeat\(6,/.test(css), 'Raster ist nicht sechsspaltig');
    assert.ok(/\.ck-raster > \.ck-karte \{[^}]*span 2/.test(css), 'Dreierreihe fehlt');
    assert.ok(/\.ck-raster > \.ck-karte--halb \{[^}]*span 3/.test(css), 'Halbe Karten fehlen');
  });
  test('vier Einstiege fuehren auf die Netzwerkseite', function () {
    var einstiege = d.querySelectorAll('.ck-einstieg');
    assert.strictEqual(einstiege.length, 4);
    einstiege.forEach(function (a) {
      assert.ok(a.getAttribute('href').indexOf('./') === 0, a.getAttribute('href'));
    });
  });
  test('die Netzwerkseite bleibt unveraendert erreichbar', function () {
    var seite = fs.readFileSync(path.join(WURZEL, 'ngo', 'index.html'), 'utf8');
    // Der Rueckverweis steht im Kopfbereich der Netzwerkseite.
    assert.ok(/class="ngo-zurueck" href="cockpit\.html"/.test(seite),
      'kein Rueckverweis vom Netzwerk aufs Cockpit');
  });

  console.log('\n' + bestanden + ' Tests bestanden, ' + fehlgeschlagen + ' fehlgeschlagen.');
  process.exit(fehlgeschlagen ? 1 : 0);
})();
