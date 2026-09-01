/*
 * Smoke-Test der NGO-Netzwerkseite: laedt die Seite in eine DOM-Nachbildung,
 * fuehrt die Seitenskripte aus und prueft Kennzahlen, Umschalter, Filter,
 * Detailspalte, URL-Zustand, Tabellen und das Verhalten in Mobilbreite.
 *
 * Aufruf:  node scripts/test_ngo_netz_seite.js
 * Benoetigt jsdom:  npm install --no-save jsdom
 */
'use strict';

// Der Test baut ein Dutzend vollstaendige Seiten in jsdom auf. Seit Paket
// 3.7.51 traegt jede davon 2852 Organisationen und 13122 Projektionskanten;
// der Standardheap von Node reicht dafuer nicht. Statt den Aufruf zu
// verkomplizieren, startet sich das Skript einmal mit groesserem Heap neu.
if (!process.env.NGO_TEST_HEAP) {
  var kind = require('child_process').spawnSync(
    process.execPath,
    ['--max-old-space-size=8192', __filename].concat(process.argv.slice(2)),
    { stdio: 'inherit', env: Object.assign({}, process.env, { NGO_TEST_HEAP: '1' }) });
  process.exit(kind.status === null ? 1 : kind.status);
}

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
var SEITE = path.join(WURZEL, 'ngo', 'index.html');
// Die Erwartungen kommen aus den Daten, nicht aus fest verdrahteten Zahlen —
// sonst muss bei jedem Datenstand die halbe Testdatei nachgezogen werden.
var DATEN = JSON.parse(fs.readFileSync(
  path.join(WURZEL, 'assets', 'ngo', 'ngo-netzwerk.json'), 'utf8'));
var Z = DATEN.meta.zahlen;
var SKRIPTE = ['assets/vendor/d3-force-bundle.min.js', 'assets/ngo/ngo-netz-daten.js',
               'assets/ngo/ngo-netz-ansicht.js', 'assets/ngo/ngo-netz-seite.js'];

var bestanden = 0, fehlgeschlagen = 0;
function test(name, fn) {
  try { fn(); bestanden++; console.log('  ok   ' + name); }
  catch (e) { fehlgeschlagen++; console.log('  FEHL ' + name + '\n       ' + e.message); }
}
function gruppe(t) { console.log('\n' + t); }
function warte(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function baueSeite(breite, suche, svgBreite) {
  // Am Desktop ist die Zeichenflaeche schmaler als das Fenster, weil rechts die
  // Detailspalte steht. Der Test bildet das nach, sonst bleibt eine falsche
  // Mobilerkennung unentdeckt.
  if (svgBreite === undefined) svgBreite = breite > 960 ? breite - 790 : breite;
  var html = fs.readFileSync(SEITE, 'utf8');
  var dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'http://localhost/ngo/index.html' + (suche || ''),
    pretendToBeVisual: true
  });
  var fenster = dom.window;

  fenster.fetch = function (pfad) {
    // Der Datenpfad der Seite ist relativ zu ihrem Verzeichnis, nicht zur Wurzel.
    // Der Cache-Busting-Anhang gehoert nicht zum Dateinamen.
    var datei = path.resolve(path.dirname(SEITE), String(pfad).split('?')[0]);
    var da = fs.existsSync(datei);
    return Promise.resolve({
      ok: da, status: da ? 200 : 404,
      json: function () { return Promise.resolve(JSON.parse(fs.readFileSync(datei, 'utf8'))); }
    });
  };
  fenster.SVGElement.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: svgBreite, height: 600, right: svgBreite, bottom: 600 };
  };
  Object.defineProperty(fenster, 'innerWidth', { value: breite, configurable: true });

  var fehler = [];
  fenster.addEventListener('error', function (e) { fehler.push(String(e.message || e.error)); });

  if (fenster.document.readyState === 'loading') {
    await new Promise(function (r) { fenster.document.addEventListener('DOMContentLoaded', r); });
  }
  SKRIPTE.forEach(function (rel) {
    var s = fenster.document.createElement('script');
    s.textContent = fs.readFileSync(path.join(WURZEL, rel), 'utf8');
    fenster.document.body.appendChild(s);
  });
  await warte(900);
  return { dom: dom, fenster: fenster, d: fenster.document, fehler: fehler };
}

(async function () {
  var desktop = await baueSeite(1440);
  var d = desktop.d, fenster = desktop.fenster;
  function text(id) { return d.getElementById(id).textContent.trim(); }
  function klick(el) { el.dispatchEvent(new fenster.MouseEvent('click', { bubbles: true })); }
  function wechsle(el) { el.dispatchEvent(new fenster.Event('change', { bubbles: true })); }
  function knotenAnzahl(sel) { return d.querySelectorAll(sel).length; }
  function listeAnzahl() { return d.querySelectorAll('#nnListe .ngo-liste-knopf').length; }
  function stehtListe() { return d.getElementById('nnListe').hidden === false; }
  /** Auf einen kleinen Cluster stellen: dort steht ein Netzbild. */
  function insNetzbild() {
    var feld = d.getElementById('fCluster');
    feld.value = String(kleinerCluster.id);
    wechsle(feld);
  }
  function ausNetzbild() {
    var feld = d.getElementById('fCluster');
    feld.value = '';
    wechsle(feld);
  }
  function gezeigt() {
    return stehtListe() ? listeAnzahl() : knotenAnzahl('.ngo-organisation');
  }
  function listeNamen() {
    return Array.prototype.slice.call(d.querySelectorAll('#nnListe .ngo-liste-name'))
      .map(function (e) { return e.textContent; });
  }

  // Ein Cluster, der klein genug fuer ein Netzbild ist. Er wird gebraucht,
  // wo die Zeichnung selbst geprueft wird — Clusterebene und Gesamtnetz
  // stehen seit Paket 3.7.51 als Liste.
  var kleinerCluster = DATEN.cluster.slice().filter(function (c) {
    return c.groesse >= 8 && c.groesse <= 40;
  }).sort(function (a, b) { return b.groesse - a.groesse; })[0];

  gruppe('Seitenaufbau (Desktop 1440 px)');

  test('keine JavaScript-Fehler', function () { assert.deepStrictEqual(desktop.fehler, []); });
  test('kein Fehlerhinweis sichtbar', function () {
    assert.strictEqual(d.getElementById('nnFehler').hidden, true);
  });
  test('noindex bleibt gesetzt', function () {
    assert.strictEqual(d.querySelector('meta[name="robots"]').getAttribute('content'), 'noindex, nofollow');
  });
  test('Hinweis auf den fehlenden Zugriffsschutz steht auf der Seite', function () {
    assert.ok(/ohne Zugriffsschutz/.test(d.querySelector('.vorschau-banner').textContent));
  });
  test('von aussen kommt nur die Besuchszaehlung', function () {
    // Hyperlinks auf Quellen sind gewollt (Auftrag Abschnitt 8) und laden
    // nichts nach. Geprueft wird, was der Browser selbst anfordert — auch
    // protokollrelativ, sonst rutscht //host/datei.js durch.
    var geladen = 'link[href], script[src], img[src], iframe[src], source[src], video[src]';
    var extern = Array.prototype.slice.call(d.querySelectorAll(geladen))
      .map(function (e) { return e.getAttribute('src') || e.getAttribute('href') || ''; })
      .filter(function (a) { return /^(https?:)?\/\//.test(a); });
    assert.deepStrictEqual(extern, ['//gc.zgo.at/count.js'],
      'unerwartete Ressource von aussen: ' + extern.join(', '));
  });
  test('externe Verweise zeigen nur auf Quellen und sind abgesichert', function () {
    var links = Array.prototype.slice.call(d.querySelectorAll('a[href^="http"]'));
    assert.ok(links.length > 0);
    links.forEach(function (a) {
      assert.strictEqual(a.getAttribute('rel'), 'noopener', a.getAttribute('href'));
      assert.strictEqual(a.getAttribute('target'), '_blank', a.getAttribute('href'));
    });
  });
  test('die Kennzahlenzeile steht nur im Cockpit, nicht hier', function () {
    // Sie wiederholte dieselben Werte ueber jeder Ansicht.
    assert.strictEqual(d.querySelector('.nv-kennzahlen'), null);
    ['kzOrganisationen', 'kzBeziehungen', 'kzKern', 'kzPersonen', 'kzLuecken',
     'kzDatenstand'].forEach(function (name) {
      assert.strictEqual(d.getElementById(name), null, name + ' steht noch im Markup');
    });
    // Der Datenstand bleibt erreichbar, nur an einer Stelle statt an zweien.
    var teile = String(DATEN.meta.datenstand || '').split('-');
    var stand = teile.length === 3 ? teile[2] + '.' + teile[1] + '.' + teile[0] : '';
    assert.ok(stand && text('nnVersion').indexOf(stand) !== -1, text('nnVersion'));
  });
  test('Masterversion steht auf der Seite', function () {
    var version = (DATEN.meta.masterVersion || '').split('–')[0].trim();
    assert.ok(text('nnVersion').indexOf(version) !== -1, text('nnVersion'));
  });
  test('methodischer Hinweis nennt die Interpretationsgrenzen', function () {
    var t = d.querySelector('.nv-methodik').textContent.replace(/\s+/g, ' ');
    assert.ok(t.indexOf('weder ein Einfluss- noch ein Legitimitätswert') !== -1);
    assert.ok(t.indexOf('kein Nachweis fehlender Vernetzung') !== -1);
    assert.ok(t.indexOf('keine Parteizugehörigkeit einer Organisation ableiten') !== -1);
    assert.ok(t.indexOf('keine politische Bewertung') !== -1);
  });
  test('Wort «Einflussranking» kommt auf der Seite nicht vor', function () {
    assert.strictEqual(/Einflussranking/.test(d.body.textContent), false);
  });
  test('Schlusszeile steht zuunterst', function () {
    var p = Array.prototype.slice.call(d.querySelectorAll('footer p'));
    assert.strictEqual(p[p.length - 1].textContent.trim(), 'Markus Lysser - souveraene-schweiz.ch');
  });

  gruppe('Ebene Cluster (Einstieg)');

  test('die Seite startet auf der Clusterebene, als Liste', function () {
    // Mit 64 Clustern und ueber 600 Verbindungen zwischen ihnen waere ein
    // Netzbild ein Knaeuel. Deshalb steht hier eine Liste.
    assert.strictEqual(stehtListe(), true, 'es wird ein Netzbild gezeichnet');
    assert.strictEqual(listeAnzahl(), DATEN.cluster.length);
    assert.strictEqual(knotenAnzahl('.ngo-organisation'), 0);
  });
  test('die Clusterliste nennt Groesse und Verbindungen', function () {
    var erste = d.querySelector('#nnListe .ngo-liste-knopf');
    var werte = erste.querySelectorAll('.ngo-liste-wert');
    assert.strictEqual(werte.length, 2, erste.textContent);
    assert.ok(/\d+ Organisationen/.test(werte[0].textContent), werte[0].textContent);
    assert.ok(/\d+ Verbindungen/.test(werte[1].textContent), werte[1].textContent);
    // Der groesste Cluster steht oben.
    var zahlen = Array.prototype.slice
      .call(d.querySelectorAll('#nnListe .ngo-liste-knopf .ngo-liste-wert:first-of-type'))
      .map(function (e) { return parseInt(e.textContent, 10); });
    for (var i = 1; i < zahlen.length; i++) {
      assert.ok(zahlen[i] <= zahlen[i - 1], 'nicht nach Groesse sortiert');
    }
  });
  test('der Kopf der Liste sagt, warum kein Netzbild steht', function () {
    var kopf = d.getElementById('nnListeKopf').textContent;
    assert.ok(/Knäuel/.test(kopf), kopf);
    assert.ok(/rechnerische Gruppe, kein Akteur/.test(kopf), kopf);
  });
  test('Statuszeile meldet Cluster und Verbindungen', function () {
    var s = text('nnStatus');
    assert.ok(/Cluster mit \d+ Verbindungen zwischen ihnen/.test(s), s);
    assert.ok(/nicht mehr lesbar/.test(s), s);
  });
  test('die Bedienhilfe passt zur Liste', function () {
    assert.strictEqual(text('nnBedienText'), 'Eintrag anklicken öffnet ihn als Netzbild.');
  });
  test('Brotkrumen zeigen die Ebene', function () {
    var leiste = text('nnBrotkrumen');
    assert.ok(/Alle Cluster/.test(leiste), leiste);
    assert.ok(/Alle Organisationen/.test(leiste), leiste);
  });
  test('Organisationen ohne Beziehung stehen aufklappbar bei den Tabellen', function () {
    var abschnitt = d.getElementById('nnOhneBeziehung');
    assert.strictEqual(abschnitt.hidden, false);
    assert.strictEqual(abschnitt.tagName, 'DETAILS');
    assert.strictEqual(abschnitt.open, false, 'Abschnitt steht offen und verdraengt das Netz');
    // Er steht unten bei den Tabellen, nicht mehr ueber der Grafik.
    var buehne = d.getElementById('nnBuehne');
    assert.strictEqual(
      buehne.compareDocumentPosition(abschnitt) & 4 /* DOCUMENT_POSITION_FOLLOWING */, 4,
      'Abschnitt steht vor der Grafik');
    var s = text('nnOhneBeziehungText');
    assert.ok(s.indexOf(String(Z.abdeckungsluecken)) === 0, s);
    assert.ok(/kein Nachweis fehlender Vernetzung/.test(s), s);
    assert.ok(/^\d+ Organisationen ohne erfasste Beziehung anzeigen$/
      .test(text('nnOhneBeziehungTitel')), text('nnOhneBeziehungTitel'));
    assert.strictEqual(
      d.querySelectorAll('#nnTabelleLuecken tbody tr').length, Z.abdeckungsluecken);
  });
  test('Organisationsnamen in den Tabellen sind anklickbar', function () {
    var erste = d.querySelector('#nnTabelleOrg tbody tr td .ngo-org-verweis');
    assert.ok(erste, 'kein anklickbarer Name in der Organisationstabelle');
    assert.strictEqual(
      d.querySelectorAll('#nnTabelleOrg tbody .ngo-org-verweis').length, Z.organisationen);
    assert.ok(d.querySelector('#nnTabelleLuecken tbody .ngo-org-verweis'),
      'kein anklickbarer Name in der Lueckentabelle');
  });
  test('ein Rueckweg aufs Cockpit steht am Seitenkopf', function () {
    var zurueck = d.querySelector('.ngo-zurueck');
    assert.ok(zurueck, 'kein Rueckverweis im Kopfbereich');
    assert.strictEqual(zurueck.getAttribute('href'), 'cockpit.html');
    assert.ok(/Cockpit/.test(zurueck.textContent), zurueck.textContent);
  });
  test('die Netzumfang-Knoepfe sind so hoch wie die uebrigen Bedienelemente', function () {
    // Ein Zusatz als eigener Block macht sie zweizeilig. Die Pruefung faellt
    // auf die Regel zurueck, weil jsdom keine Hoehen rechnet.
    var css = fs.readFileSync(
      path.join(WURZEL, 'assets', 'ngo', 'ngo-netz.css'), 'utf8');
    var regel = /\.ngo-umschalter button small \{[^}]*\}/.exec(css);
    assert.ok(regel, 'keine Regel fuer den Zusatz');
    assert.strictEqual(/display:\s*block/.test(regel[0]), false, regel[0]);
    assert.ok(/\.ngo-umschalter \{[^}]*min-height:\s*40px/.test(css),
      'keine gemeinsame Mindesthoehe');
  });
  test('Clusterfilter und Knotenfarbe sind auf dieser Ebene gesperrt', function () {
    assert.strictEqual(d.getElementById('fCluster').disabled, true);
    assert.strictEqual(d.getElementById('fFarbe').disabled, true);
  });
  test('Klick in der Liste oeffnet den Cluster', function () {
    // Ein kleiner Cluster: dort steht wieder ein Netzbild.
    var eintraege = Array.prototype.slice.call(d.querySelectorAll('#nnListe .ngo-liste-knopf'));
    var klein = eintraege[eintraege.length - 4];
    klick(klein);
    assert.ok(/fokus=/.test(fenster.location.search), fenster.location.search);
    var leiste = text('nnBrotkrumen');
    assert.ok(leiste.split('›').length >= 2, leiste);
    assert.ok(knotenAnzahl('.ngo-organisation') > 0 || stehtListe(),
      'weder Netzbild noch Liste');
  });
  test('Brotkrume fuehrt zurueck zur Uebersicht', function () {
    klick(d.querySelector('.ngo-brotkrume'));
    assert.strictEqual(listeAnzahl(), DATEN.cluster.length);
    assert.strictEqual(/fokus=/.test(fenster.location.search), false);
  });

  gruppe('Alle Organisationen (Ebene Organisationen)');

  // Ab hier wird ausdruecklich auf die Organisationsebene gewechselt.
  klick(d.querySelector('.ngo-brotkrume-wechsel'));

  test('alle Organisationen stehen als Liste, nicht als Knaeuel', function () {
    // 2491 Knoten mit 13122 Linien sind kein Bild mehr.
    assert.strictEqual(stehtListe(), true, 'es wird ein Netzbild gezeichnet');
    assert.ok(listeAnzahl() > 1000, listeAnzahl() + ' Eintraege');
    assert.ok(/ebene=organisation/.test(fenster.location.search), fenster.location.search);
  });
  test('die Liste ist nach Zahl der Verbindungen sortiert', function () {
    var zahlen = Array.prototype.slice
      .call(d.querySelectorAll('#nnListe .ngo-liste-knopf .ngo-liste-wert:first-of-type'))
      .map(function (e) { return parseInt(e.textContent, 10) || 0; })
      .slice(0, 40);
    for (var i = 1; i < zahlen.length; i++) {
      assert.ok(zahlen[i] <= zahlen[i - 1], 'nicht nach Verbindungen sortiert');
    }
  });
  test('Abdeckungsluecken sind in der Liste gekennzeichnet', function () {
    var marken = d.querySelectorAll('#nnListe .ngo-liste-marke');
    assert.ok(marken.length > 100, marken.length + ' gekennzeichnete Luecken');
    assert.strictEqual(marken[0].textContent, 'Abdeckungslücke');
  });
  test('Statuszeile meldet den Stand', function () {
    var s = text('nnStatus');
    assert.ok(/Organisationen mit \d+ Verbindungen/.test(s), s);
  });

  test('Kernnetz ist vorgewaehlt, N4 gesperrt', function () {
    assert.strictEqual(d.getElementById('nnG3').getAttribute('aria-pressed'), 'true');
    assert.strictEqual(d.getElementById('kN4').disabled, true);
    assert.strictEqual(d.getElementById('kN4').checked, false);
  });
  test('Legende nennt beide Verbindungsarten und die Groessenbedeutung', function () {
    var t = d.querySelector('.nv-legende').textContent;
    assert.ok(t.indexOf('gemeinsam erfasste Personen') !== -1);
    assert.ok(t.indexOf('direkt erfasste Beziehung') !== -1);
    assert.ok(t.indexOf('kein Einflussmass') !== -1);
  });
  test('die Aufzaehlung der Cluster steht nur im Cockpit', function () {
    assert.strictEqual(d.getElementById('nnLegendeCluster'), null);
    // Die Kategorienlegende bleibt: sie erklaert eine Farbcodierung.
    assert.ok(d.getElementById('nnLegendeKategorie'), 'Kategorienlegende fehlt');
  });

  gruppe('Umschalter und Filter');

  test('Umschalten auf G2 haengt N4 an', function () {
    klick(d.getElementById('nnG2'));
    assert.strictEqual(d.getElementById('kN4').disabled, false);
    assert.strictEqual(d.getElementById('kN4').checked, true);
    assert.ok(/ansicht=G2/.test(fenster.location.search));
  });
  test('Zurueck auf G3 nimmt N4 wieder heraus', function () {
    klick(d.getElementById('nnG3'));
    assert.strictEqual(d.getElementById('kN4').checked, false);
    assert.strictEqual(d.getElementById('kN4').disabled, true);
  });
  test('Filter Kategorie wirkt auf die Darstellung', function () {
    var vorher = gezeigt();
    var feld = d.getElementById('fKategorie');
    feld.value = 'WIRTSCHAFT_ARBEIT';
    wechsle(feld);
    var nachher = gezeigt();
    // Aufraeumen vor den Zusicherungen: sonst bleibt der Filter stehen, wenn
    // eine davon fehlschlaegt, und alle folgenden Tests laufen gefiltert.
    var lage = fenster.location.search;
    feld.value = '';
    wechsle(feld);
    assert.ok(nachher < vorher, nachher + ' statt weniger als ' + vorher);
    assert.ok(/kategorie=/.test(lage), lage);
  });
  test('Filter Cluster wirkt', function () {
    var cluster = DATEN.cluster[DATEN.cluster.length - 1];
    var feld = d.getElementById('fCluster');
    var vorher = gezeigt();
    feld.value = String(cluster.id);
    wechsle(feld);
    var nachher = gezeigt();
    feld.value = '';
    wechsle(feld);
    assert.ok(nachher <= cluster.groesse,
      nachher + ' gezeigt, Cluster hat ' + cluster.groesse);
    assert.ok(nachher < vorher, nachher + ' statt weniger als ' + vorher);
  });
  test('Filter Partei ist waehlbar und wirkt', function () {
    var feld = d.getElementById('fPartei');
    assert.ok(feld.querySelectorAll('option').length > 5);
    feld.value = 'SP';
    wechsle(feld);
    var lage = fenster.location.search;
    feld.value = '';
    wechsle(feld);
    assert.ok(/partei=SP/.test(lage), lage);
  });
  test('Farbwechsel auf Kategorie blendet die Ziffern aus', function () {
    // Der Farbwechsel betrifft die Zeichnung; geprueft wird er deshalb an
    // einem Cluster, der als Netzbild steht.
    var feld = d.getElementById('fFarbe');
    var cluster = d.getElementById('fCluster');
    cluster.value = String(kleinerCluster.id);
    wechsle(cluster);
    feld.value = 'kategorie';
    wechsle(feld);
    var ziffernAus = knotenAnzahl('.ngo-clusterziffer');
    var legende = d.getElementById('nnLegendeKategorie').hidden;
    feld.value = 'cluster';
    wechsle(feld);
    var ziffernAn = knotenAnzahl('.ngo-clusterziffer');
    cluster.value = '';
    wechsle(cluster);
    assert.strictEqual(ziffernAus, 0);
    assert.strictEqual(legende, false);
    assert.ok(ziffernAn > 0, 'keine Clusterziffern im Netzbild');
  });

  gruppe('Bedienung und Begriffe');

  test('Bedienzeile steht ueber der Grafik', function () {
    var zeile = d.querySelector('.ngo-bedienzeile');
    assert.ok(zeile, 'keine Bedienzeile');
    assert.ok(/anklicken/.test(zeile.textContent), zeile.textContent);
    var buehne = d.getElementById('nnBuehne');
    assert.strictEqual(
      zeile.compareDocumentPosition(buehne) & 4 /* DOCUMENT_POSITION_FOLLOWING */, 4,
      'Bedienzeile steht nicht vor der Grafik');
  });
  test('das hidden-Attribut wird nicht von Klassenregeln ausgehebelt', function () {
    // Der Tailwind-Reset setzt [hidden] mit :where() und damit Spezifitaet null;
    // .ngo-feld und .nv-legende sind flex und blieben sonst sichtbar. Die DOM-
    // Nachbildung wertet keine Stylesheets aus, deshalb wird die Regel selbst
    // geprueft.
    var css = fs.readFileSync(path.join(WURZEL, 'assets', 'ngo', 'ngo-netz.css'), 'utf8');
    assert.ok(/\.nn \[hidden\]\s*\{\s*display:\s*none\s*!important/.test(css),
      'Regel «.nn [hidden] { display: none !important }» fehlt');
  });
  test('Erklaerungen liegen in einem Fenster, das zuerst geschlossen ist', function () {
    var fenster = d.getElementById('nnHilfeFenster');
    assert.ok(fenster, 'kein Erklaerungsfenster');
    assert.strictEqual(fenster.tagName.toLowerCase(), 'dialog');
    assert.strictEqual(fenster.open, false, 'Fenster ist offen — es verdeckt die Ansicht');
  });
  test('das Netz steht ohne Scrollen im Blick', function () {
    // Strukturmass statt Pixel: zwischen Seitenanfang und Grafik duerfen nur
    // wenige flache Bloecke liegen, und die Detailfilter sind eingeklappt.
    assert.strictEqual(d.getElementById('nnFilter').hidden, true,
      'Detailfilter stehen offen und schieben die Grafik nach unten');
    assert.strictEqual(d.getElementById('nnFilterKnopf').getAttribute('aria-expanded'), 'false');
    var vorDerGrafik = [];
    var buehne = d.getElementById('nnBuehne');
    for (var e = buehne.previousElementSibling; e; e = e.previousElementSibling) {
      // Verborgene Bloecke schieben nichts nach unten und zaehlen deshalb nicht.
      if (!e.hidden) vorDerGrafik.push(e);
    }
    assert.ok(vorDerGrafik.length <= 6,
      vorDerGrafik.length + ' Bloecke zwischen Kennzahlen und Grafik');
    assert.ok(d.querySelector('.page-hero--knapp'), 'Kopfbereich ist nicht der knappe');
  });
  test('alle erklaerungsbeduerftigen Begriffe sind definiert', function () {
    var noetig = ['perspektive', 'masterorganisation', 'kernnetz', 'beziehungsklasse',
                  'historie', 'kategorie', 'unterkategorie', 'obergruppe', 'fokus', 'cluster',
                  'brueckenperson',
                  'brueckenfunktion', 'abdeckungsluecke', 'kanonisierung', 'direkt',
                  'beleg', 'quellenrang', 'guete'];
    noetig.forEach(function (schluessel) {
      var eintrag = d.getElementById('begriff-' + schluessel);
      assert.ok(eintrag, 'Begriff fehlt: ' + schluessel);
      assert.ok(eintrag.nextElementSibling &&
        eintrag.nextElementSibling.textContent.length > 40, 'Erklaerung zu duenn: ' + schluessel);
    });
  });
  test('jedes Infozeichen zeigt auf einen vorhandenen Begriff', function () {
    var zeichen = Array.prototype.slice.call(d.querySelectorAll('.ngo-info'));
    assert.ok(zeichen.length >= 5, 'nur ' + zeichen.length + ' Infozeichen');
    zeichen.forEach(function (k) {
      var schluessel = k.getAttribute('data-begriff');
      assert.ok(d.getElementById('begriff-' + schluessel), 'kein Begriff zu ' + schluessel);
      assert.ok(k.getAttribute('aria-label'), 'Infozeichen ohne aria-label: ' + schluessel);
    });
  });
  test('Infozeichen oeffnet das Fenster und hebt den Begriff hervor', function () {
    klick(d.querySelector('.ngo-info[data-begriff="cluster"]'));
    assert.strictEqual(d.getElementById('nnHilfeFenster').open, true);
    assert.ok(d.getElementById('begriff-cluster').classList.contains('ngo-begriff-hervor'));
    klick(d.getElementById('nnHilfeZu'));
    assert.strictEqual(d.getElementById('nnHilfeFenster').open, false);
    assert.strictEqual(
      d.getElementById('begriff-cluster').classList.contains('ngo-begriff-hervor'), false,
      'Hervorhebung bleibt nach dem Schliessen stehen');
  });
  test('Infozeichen im Kaestchen schaltet den Filter nicht um', function () {
    var kaestchen = d.getElementById('nnLuecken');
    var vorher = kaestchen.checked;
    klick(d.querySelector('.ngo-info[data-begriff="abdeckungsluecke"]'));
    assert.strictEqual(kaestchen.checked, vorher, 'Filter wurde mitgeschaltet');
  });
  test('Knopf in der Bedienzeile oeffnet das Fenster, Schliessknopf schliesst es', function () {
    var fenster = d.getElementById('nnHilfeFenster');
    klick(d.getElementById('nnHilfeKnopf'));
    assert.strictEqual(fenster.open, true);
    klick(d.getElementById('nnHilfeZu'));
    assert.strictEqual(fenster.open, false);
  });
  test('Filterleiste laesst sich aufklappen und fasst die Einstellung zusammen', function () {
    var knopf = d.getElementById('nnFilterKnopf');
    assert.ok(/Kernnetz/.test(text('nnFilterLage')), text('nnFilterLage'));
    klick(knopf);
    assert.strictEqual(d.getElementById('nnFilter').hidden, false);
    assert.strictEqual(knopf.getAttribute('aria-expanded'), 'true');
    klick(knopf);
    assert.strictEqual(d.getElementById('nnFilter').hidden, true);
  });
  test('Bedienelemente tragen sprechende Bezeichnungen, Kuerzel nur als Zusatz', function () {
    var g3 = d.getElementById('nnG3');
    assert.ok(/Kernnetz/.test(g3.textContent), g3.textContent);
    assert.strictEqual(/G3/.test(g3.textContent), false, 'internes Kuerzel G3 steht vorn');
    assert.ok(/N1.{0,3}N3/.test(g3.querySelector('small').textContent));
    var n1 = d.querySelector('label input#kN1').parentNode;
    assert.ok(/Organfunktion/.test(n1.textContent), n1.textContent);
    assert.ok(/N1/.test(n1.querySelector('small').textContent));
    var historie = d.querySelector('label input#nnHistorie').parentNode;
    assert.ok(/frühere Beziehungen/.test(historie.textContent), historie.textContent);
  });
  test('die Arbeitskuerzel G2, G3 und G4 stehen nur noch als Zusatz oder im Panel', function () {
    // Auswahlfelder tragen Werte aus der Lieferung — ein Clusterlabel wie
    // «G2-Isolate» ist Inhalt, keine Bedienbeschriftung.
    var ausserhalb = Array.prototype.slice
      .call(d.querySelectorAll('.ngo-steuerung *:not(small):not(option)'))
      .filter(function (e) {
        return e.children.length === 0 && /\bG[234]\b/.test(e.textContent);
      });
    assert.deepStrictEqual(ausserhalb.map(function (e) { return e.textContent.trim(); }), []);
  });

  gruppe('Perspektive Personen');

  test('Organisationsperspektive ist vorgewaehlt, Schwelle verborgen', function () {
    assert.strictEqual(d.getElementById('nnPerspOrg').getAttribute('aria-pressed'), 'true');
    assert.strictEqual(d.getElementById('nnSchwelleFeld').hidden, true);
    assert.strictEqual(d.getElementById('nnPersonHinweis').hidden, true);
  });
  test('Umschalten zeigt das Personennetz', function () {
    klick(d.getElementById('nnPerspPers'));
    assert.strictEqual(d.getElementById('nnPerspPers').getAttribute('aria-pressed'), 'true');
    // Bei Schwelle 2 sind es ueber 2000 Knoten — dafuer steht die Liste.
    assert.strictEqual(stehtListe(), true, 'Personennetz wird als Bild gezeichnet');
    // Die Liste zeigt Personen, nicht das ganze bipartite Netz: Sonst stuende
    // das Schweizerische Rote Kreuz mit 50 Verbindungen zuoberst, obwohl die
    // Perspektive nach Personen fragt.
    // Im Kernnetz sind es etwas weniger als die 414 Brueckenpersonen des
    // erweiterten Netzes; entscheidend ist, dass nur Personen gelistet sind.
    assert.ok(listeAnzahl() > Z.brueckenpersonen * 0.8
      && listeAnzahl() <= Z.brueckenpersonen,
      listeAnzahl() + ' Eintraege, erwartet hoechstens ' + Z.brueckenpersonen);
    var erste = d.querySelector('#nnListe .ngo-liste-wert');
    assert.ok(/Organisationen$/.test(erste.textContent), erste.textContent);
  });
  var personenBild = await baueSeite(1440, '?perspektive=person&schwelle=20');
  test('eine hohe Schwelle macht daraus wieder ein Bild', function () {
    var pd = personenBild.d;
    assert.strictEqual(pd.getElementById('nnListe').hidden, true, 'auch bei Schwelle 20 nur eine Liste');
    // Bei Schwelle 20 bleiben wenige Personen, aber viele Organisationen.
    assert.ok(pd.querySelectorAll('.ngo-person').length >= 5,
      pd.querySelectorAll('.ngo-person').length + ' Personenknoten');
    assert.ok(pd.querySelectorAll('.ngo-organisation').length > 50);
    assert.ok(pd.querySelectorAll('.ngo-kante--beleg').length > 100);
    assert.ok(/erfasste Beziehungen/.test(pd.getElementById('nnStatus').textContent),
      pd.getElementById('nnStatus').textContent);
  });
  test('Schwellenregler, Hinweis und Legende erscheinen', function () {
    assert.strictEqual(d.getElementById('nnSchwelleFeld').hidden, false);
    assert.strictEqual(d.getElementById('nnPersonHinweis').hidden, false);
    assert.strictEqual(d.getElementById('nnLegendePerson').hidden, false);
    assert.ok(/keine berechneten Linien zwischen Personen/
      .test(text('nnPersonHinweis')), text('nnPersonHinweis'));
  });
  test('Perspektive und Schwelle stehen in der URL', function () {
    assert.ok(/perspektive=person/.test(fenster.location.search), fenster.location.search);
    var feld = d.getElementById('fSchwelle');
    var vorher = gezeigt();
    feld.value = '10';
    wechsle(feld);
    assert.ok(/schwelle=10/.test(fenster.location.search), fenster.location.search);
    assert.ok(gezeigt() <= vorher, 'eine hoehere Schwelle zeigt nicht weniger Personen');
    feld.value = '2';
    wechsle(feld);
  });
  test('Klick auf eine Person zeigt das Personendetail', function () {
    var pd = personenBild.d;
    pd.querySelector('.ngo-person').dispatchEvent(
      new personenBild.fenster.MouseEvent('click', { bubbles: true }));
    var t = pd.getElementById('nnDetail').textContent.trim();
    assert.ok(/Person/.test(t));
    assert.ok(/Erfasste Organisationen/.test(t), t.slice(0, 120));
  });
  test('Zurueck zur Organisationsperspektive', function () {
    klick(d.getElementById('nnPerspOrg'));
    assert.strictEqual(d.getElementById('nnSchwelleFeld').hidden, true);
    assert.strictEqual(knotenAnzahl('.ngo-kante--beleg'), 0);
    assert.strictEqual(/perspektive=/.test(fenster.location.search), false);
  });

  gruppe('Historienmodus');

  test('Historie zeigt echte fruehere Beziehungen, getrennt von den aktuellen', function () {
    var feld = d.getElementById('nnHistorie');
    feld.checked = true;
    wechsle(feld);
    assert.strictEqual(d.getElementById('nnHistorieHinweis').hidden, false);
    assert.ok(knotenAnzahl('.ngo-historisch') > 0);
    // Keine Kante der aktuellen Bestaende darf im Historienmodus stehen.
    assert.strictEqual(knotenAnzahl('.ngo-kante--personen'), 0);
    assert.strictEqual(knotenAnzahl('.ngo-kante--direkt'), 0);
    assert.strictEqual(knotenAnzahl('.ngo-kante--beleg'), Z.historie);
    assert.ok(/frühere Beziehungen/.test(text('nnStatus')), text('nnStatus'));
    assert.ok(/Getrennt von den aktuellen/.test(text('nnStatus')));
  });
  test('Historie laesst sich wieder abschalten', function () {
    var feld = d.getElementById('nnHistorie');
    feld.checked = false;
    wechsle(feld);
    assert.strictEqual(knotenAnzahl('.ngo-historisch'), 0);
    assert.ok(gezeigt() > 0, 'nach dem Abschalten steht nichts mehr');
  });

  gruppe('Detailspalte');

  // Ab hier wird die Zeichnung selbst geprueft. Clusterebene und Gesamtnetz
  // stehen als Liste; ein kleiner Cluster liefert das noetige Netzbild.
  insNetzbild();

  test('Detailspalte zeigt zuerst einen Hinweis', function () {
    assert.ok(/Eintrag anklicken/.test(text('nnDetail')), text('nnDetail'));
  });
  test('Klick auf eine Organisation fuellt die Detailspalte', function () {
    var knoten = d.querySelector('.ngo-organisation');
    klick(knoten);
    var t = text('nnDetail');
    assert.ok(/Organisation/.test(t));
    assert.ok(/Stammdaten/.test(t));
    assert.ok(/Cluster/.test(t));
    assert.ok(/Kennzahlen/.test(t));
    assert.ok(/Brückenfunktion/.test(t));
  });
  test('Detailspalte zeigt Quellenkarten statt kryptischer Kennungen', function () {
    var karten = d.querySelectorAll('#nnDetail .ngo-quelle');
    assert.ok(karten.length > 0, 'keine Quellenkarte gefunden');
    var erste = karten[0];
    var titel = erste.querySelector('.ngo-quelle-titel');
    assert.ok(titel && titel.textContent.trim().length > 3, 'Quellenkarte ohne Titel');
    assert.strictEqual(/^Q-[A-Z0-9-]+$/.test(titel.textContent.trim()), false,
      'Titel ist nur die interne Kennung: ' + titel.textContent);
    var meta = erste.querySelector('.ngo-quelle-meta');
    assert.ok(meta && meta.textContent.indexOf('·') !== -1, 'Quellentyp/Rang/Güte fehlen');
  });
  test('interne Kennung steht nur im Auditbereich', function () {
    var karte = d.querySelector('#nnDetail .ngo-quelle');
    var audit = karte.querySelector('.ngo-quelle-audit');
    assert.ok(audit, 'kein Auditbereich');
    assert.ok(/Q-[A-Z0-9]/.test(audit.textContent), 'Kennung fehlt im Auditbereich');
    var sichtbar = karte.cloneNode(true);
    sichtbar.removeChild(sichtbar.querySelector('.ngo-quelle-audit'));
    assert.strictEqual(/Q-[A-Z]+\d*-\d+/.test(sichtbar.textContent), false,
      'interne Kennung steht ausserhalb des Auditbereichs: ' + sichtbar.textContent);
  });
  test('Quellenkarte verlinkt die Quelle, wenn eine URL vorliegt', function () {
    var link = d.querySelector('#nnDetail .ngo-quelle-link');
    assert.ok(link, 'kein Link «Quelle öffnen»');
    assert.strictEqual(link.textContent.trim(), 'Quelle öffnen');
    assert.ok(/^https?:\/\//.test(link.getAttribute('href')), link.getAttribute('href'));
    assert.strictEqual(link.getAttribute('target'), '_blank');
    assert.strictEqual(link.getAttribute('rel'), 'noopener');
  });
  test('Detailspalte weist auf die Grenze der Parteiangaben hin', function () {
    var t = text('nnDetail');
    if (/Parteiangaben erfasster Personen/.test(t)) {
      assert.ok(/keine Parteizugehörigkeit der Organisation/.test(t));
    }
  });
  test('gewaehlter Knoten steht in der URL', function () {
    assert.ok(/knoten=NGO-/.test(fenster.location.search), fenster.location.search);
  });
  var mitPersonen = await baueSeite(1440, '?fokus=' + kleinerCluster.id);
  test('Personen erscheinen erst nach dem Klick auf eine Organisation', function () {
    var pd = mitPersonen.d;
    assert.strictEqual(pd.querySelectorAll('.ngo-person').length, 0,
      'Personen stehen schon vor dem Klick im Bild');
    var org = pd.querySelector('.ngo-organisation');
    assert.ok(org, 'kein Netzbild, in dem sich eine Organisation anklicken laesst');
    org.dispatchEvent(new mitPersonen.fenster.MouseEvent('click', { bubbles: true }));
    assert.ok(pd.querySelectorAll('.ngo-person').length > 0, 'keine Personen nach dem Klick');
  });

  gruppe('Suche');

  var suchfeld = d.getElementById('nnSuche');
  suchfeld.value = 'Masshardt';
  suchfeld.dispatchEvent(new fenster.Event('input', { bubbles: true }));
  await warte(400);
  test('Personensuche liefert eine Trefferliste', function () {
    assert.strictEqual(d.getElementById('nnTreffer').hidden, false);
    assert.ok(d.querySelectorAll('#nnTreffer .ngo-treffer-eintrag').length > 0);
  });
  test('Klick auf einen Personentreffer zeigt das Personendetail', function () {
    klick(d.querySelector('#nnTreffer .ngo-treffer-eintrag'));
    var t = text('nnDetail');
    assert.ok(/Person/.test(t));
    assert.ok(/Erfasste Organisationen/.test(t));
    assert.ok(/PERS:/.test(t), 'technische Kennung fehlt');
  });

  suchfeld.value = 'e';
  suchfeld.dispatchEvent(new fenster.Event('input', { bubbles: true }));
  await warte(400);
  test('gekappte Trefferliste sagt, wie viele Treffer es gibt', function () {
    var zahl = d.querySelector('#nnTreffer .ngo-treffer-zahl');
    assert.ok(zahl, 'keine Angabe zur Trefferzahl');
    assert.ok(/^12 von \d{2,} Treffern/.test(zahl.textContent), zahl.textContent);
    assert.strictEqual(d.querySelectorAll('#nnTreffer .ngo-treffer-eintrag').length, 12);
  });
  suchfeld.value = '';
  suchfeld.dispatchEvent(new fenster.Event('input', { bubbles: true }));
  await warte(300);

  gruppe('Tabellen');

  test('Organisationstabelle enthaelt alle Organisationen', function () {
    assert.strictEqual(d.querySelectorAll('#nnTabelleOrg tbody tr').length, Z.organisationen);
  });
  test('Beziehungstabelle enthaelt alle aktuellen Beziehungen', function () {
    assert.strictEqual(d.querySelectorAll('#nnTabelleKanten tbody tr').length, Z.kanten);
  });
  test('Variantentabelle enthaelt alle zusammengefuehrten Gruppen', function () {
    assert.strictEqual(d.querySelectorAll('#nnTabelleVarianten tbody tr').length,
      Z.variantengruppen);
  });
  test('Personenuebersicht enthaelt alle Personen mit gezeichneter Beziehung', function () {
    // Kanten ohne jede Quellenangabe werden nicht gezeichnet; Personen, deren
    // einzige Beziehung so entfaellt, stehen deshalb nicht in der Uebersicht.
    var zeilen = d.querySelectorAll('#nnTabellePersonen tbody tr').length;
    assert.ok(zeilen > 0 && zeilen <= Z.personen, zeilen + ' von ' + Z.personen);
    assert.ok(Z.personen - zeilen < Z.personen / 100,
      (Z.personen - zeilen) + ' Personen fehlen — zu viele');
  });
  test('Personenuebersicht startet nach Zahl der Organisationen sortiert', function () {
    var werte = Array.prototype.slice
      .call(d.querySelectorAll('#nnTabellePersonen tbody tr td:nth-child(2)'))
      .slice(0, 20).map(function (z) { return parseInt(z.textContent, 10); });
    for (var i = 1; i < werte.length; i++) {
      assert.ok(werte[i] <= werte[i - 1], 'nicht absteigend: ' + werte.join(','));
    }
    assert.ok(werte[0] >= 3, 'Spitzenwert ' + werte[0]);
  });
  test('Spaltenkopf sortiert die Personenuebersicht um', function () {
    var kopf = d.querySelectorAll('#nnTabellePersonen thead th')[0];
    klick(kopf);
    assert.ok(kopf.getAttribute('aria-sort'), 'keine Sortierrichtung gesetzt');
    var namen = Array.prototype.slice
      .call(d.querySelectorAll('#nnTabellePersonen tbody tr td:first-child'))
      .slice(0, 3).map(function (z) { return z.textContent; });
    var sortiert = namen.slice().sort(function (a, b) { return b.localeCompare(a, 'de-CH'); });
    assert.deepStrictEqual(namen, sortiert, namen.join(' | '));
  });
  test('Quellenverzeichnis enthaelt alle belegten Quellen mit Titel und Link', function () {
    var zeilen = d.querySelectorAll('#nnTabelleQuellen tbody tr');
    assert.strictEqual(zeilen.length, Z.quellen);
    assert.ok(d.querySelectorAll('#nnTabelleQuellen tbody a[href^="http"]').length
      >= Z.quellen - Z.quellenOhneUrl - 5);
  });
  test('Beziehungstabelle nennt den Beleg, nicht die interne Kennung', function () {
    var zelle = d.querySelector('#nnTabelleKanten tbody tr td:nth-child(6)');
    assert.ok(zelle.textContent.trim().length > 5);
    assert.strictEqual(/^Q-[A-Z0-9-]+$/.test(zelle.textContent.trim()), false,
      zelle.textContent);
  });
  test('Quellenzeile nennt Datei und Version', function () {
    assert.ok(/ngo-netzwerk\.json/.test(text('nnQuelle')));
    var version = (DATEN.meta.masterVersion || '').split('–')[0].trim();
    assert.ok(text('nnQuelle').indexOf(version) !== -1, text('nnQuelle'));
  });

  gruppe('Zustand aus der URL');

  // Knoten aus dem gewaehlten Cluster nehmen, damit der Filter ihn nicht ausblendet.
  var probeCluster = DATEN.cluster[0];
  var probeOrg = DATEN.organisationen[probeCluster.mitglieder[0]];
  var geteilt = await baueSeite(1440, '?ebene=organisation&ansicht=G2&cluster=' + probeCluster.id
    + '&farbe=kategorie&knoten=' + probeOrg.id);
  test('geteilter Link stellt Ansicht, Filter und Knoten wieder her', function () {
    var g = geteilt.d;
    assert.deepStrictEqual(geteilt.fehler, []);
    assert.strictEqual(g.getElementById('nnG2').getAttribute('aria-pressed'), 'true');
    assert.strictEqual(g.getElementById('fCluster').value, String(probeCluster.id));
    assert.strictEqual(g.getElementById('fFarbe').value, 'kategorie');
    assert.ok(g.getElementById('nnDetail').textContent.indexOf(probeOrg.name) !== -1,
      probeOrg.name + ' fehlt im Detail');
  });

  var ausTabelle = await baueSeite(1440);
  test('ein Klick auf den Namen waehlt die Organisation in der Grafik', function () {
    var verweis = ausTabelle.d.querySelector('#nnTabelleOrg tbody .ngo-org-verweis');
    var name = verweis.textContent;
    verweis.click();
    // Der Einstieg ist die Clusterebene — der Klick muss zuerst dorthin
    // wechseln, wo die Organisation ueberhaupt vorkommt.
    assert.ok(/ebene=organisation/.test(ausTabelle.fenster.location.search),
      ausTabelle.fenster.location.search);
    var detail = ausTabelle.d.getElementById('nnDetail').textContent;
    assert.ok(detail.indexOf(name) !== -1,
      name + ' fehlt in der Detailspalte: ' + detail.slice(0, 120));
  });

  gruppe('Namen und Zeigezustand');

  var dicht = await baueSeite(1440, '?fokus=21');
  test('nicht jeder Knoten traegt einen Namen', function () {
    assert.deepStrictEqual(dicht.fehler, []);
    var knoten = dicht.d.querySelectorAll('.ngo-knoten-gruppe').length;
    var namen = dicht.d.querySelectorAll('.ngo-beschriftung:not(.ngo-beschriftung--aus)').length;
    assert.ok(knoten > 40, 'Testansicht zu klein: ' + knoten + ' Knoten');
    assert.ok(namen < knoten / 2, namen + ' Namen bei ' + knoten + ' Knoten');
  });
  test('Anschlussstummel bekommen nur ein knappes Kontingent', function () {
    var stummel = Array.prototype.slice
      .call(dicht.d.querySelectorAll('.ngo-stumpf .ngo-beschriftung'))
      .filter(function (e) { return !e.classList.contains('ngo-beschriftung--aus'); });
    assert.ok(stummel.length <= 4, stummel.length + ' Stummelnamen');
  });
  test('jeder Knoten bleibt anklickbar und traegt seinen Namen als aria-label', function () {
    var alle = dicht.d.querySelectorAll('.ngo-knoten-gruppe');
    Array.prototype.slice.call(alle).forEach(function (g) {
      assert.strictEqual(g.getAttribute('role'), 'button');
      assert.ok((g.getAttribute('aria-label') || '').length > 0, 'ohne aria-label');
    });
    // Kein <title>: sonst laege der native Tooltip ueber dem eigenen.
    assert.strictEqual(alle[0].querySelector('title'), null);
  });
  test('Zeigen auf einen Knoten nennt Name und Kennzahl', function () {
    var g = dicht.d.querySelector('.ngo-organisation');
    g.dispatchEvent(new dicht.fenster.MouseEvent('mouseenter', { bubbles: false }));
    var kasten = dicht.d.querySelector('.ngo-zeigehinweis');
    assert.ok(kasten && !kasten.hidden, 'kein Kurzhinweis');
    assert.ok(/Brückenfunktion|frühere Beziehungen/.test(kasten.textContent), kasten.textContent);
    assert.ok(g.classList.contains('ngo-zeigt'), 'kein Zeigezustand am Knoten');
    g.dispatchEvent(new dicht.fenster.MouseEvent('mouseleave', { bubbles: false }));
    assert.strictEqual(kasten.hidden, true, 'Kurzhinweis bleibt stehen');
    assert.ok(!g.classList.contains('ngo-zeigt'), 'Zeigezustand bleibt haengen');
  });

  gruppe('Fokus auf eine Organisation');

  // Das Gesamtnetz steht als Liste. Ein Klick darin muss zu einem Bild
  // fuehren — vorher waehlte er nur aus, und sichtbar passierte nichts.
  var ausListe = await baueSeite(1440, '?ebene=organisation');
  test('das Gesamtnetz steht als Liste', function () {
    assert.deepStrictEqual(ausListe.fehler, []);
    assert.strictEqual(ausListe.d.getElementById('nnListe').hidden, false);
    assert.strictEqual(ausListe.d.querySelectorAll('.ngo-knoten-gruppe').length, 0);
  });
  test('ein Klick in der Liste oeffnet die Organisation als Netzbild', function () {
    var knopf = ausListe.d.querySelector('#nnListe .ngo-liste-knopf');
    assert.ok(knopf, 'kein Listeneintrag');
    knopf.dispatchEvent(new ausListe.fenster.MouseEvent('click', { bubbles: true }));
    assert.strictEqual(ausListe.d.getElementById('nnListe').hidden, true, 'Liste steht noch');
    assert.ok(ausListe.d.querySelectorAll('.ngo-knoten-gruppe').length > 1,
      'kein Netzbild nach dem Klick');
    assert.ok(ausListe.d.querySelector('#nnDetail .nv-detail-name'),
      'Detailspalte bleibt leer');
  });
  test('der Stern zeichnet nur die Verbindungen der Mitte', function () {
    var knoten = ausListe.d.querySelectorAll('.ngo-knoten-gruppe').length;
    var linien = ausListe.d.querySelectorAll('.ngo-kante').length;
    assert.strictEqual(linien, knoten - 1, knoten + ' Knoten, ' + linien + ' Linien');
  });
  test('der Hinweis nennt die Einschraenkung und den Rueckweg', function () {
    var kachel = ausListe.d.getElementById('nnFokusHinweis');
    assert.strictEqual(kachel.hidden, false);
    var text = ausListe.d.getElementById('nnFokusHinweisText').textContent;
    assert.ok(/ausgeblendet/.test(text), text);
    assert.ok(/Verbindungen der Nachbarn untereinander/.test(text), text);
    assert.ok(/zurück zum ganzen Netz/.test(
      ausListe.d.getElementById('nnFokusHinweisKnopf').textContent));
  });
  test('die Brotkrume traegt den Namen und den Rueckweg', function () {
    var stufen = ausListe.d.querySelectorAll('#nnBrotkrumen .ngo-brotkrume');
    var letzte = stufen[stufen.length - 1];
    assert.ok(letzte.classList.contains('ngo-brotkrume--hier'), letzte.textContent);
    var zurueck = ausListe.d.querySelectorAll('#nnBrotkrumen button.ngo-brotkrume');
    assert.ok(zurueck.length >= 2, zurueck.length + ' anklickbare Stufen');
  });
  test('der Rueckweg fuehrt wieder ins Gesamtnetz', function () {
    ausListe.d.getElementById('nnFokusHinweisKnopf')
      .dispatchEvent(new ausListe.fenster.MouseEvent('click', { bubbles: true }));
    assert.strictEqual(ausListe.d.getElementById('nnListe').hidden, false);
    assert.ok(!/org=/.test(ausListe.fenster.location.search), ausListe.fenster.location.search);
  });

  var perUrl = await baueSeite(1440, '?ebene=organisation&org=' + DATEN.organisationen[0].id);
  test('ein geteilter Link auf den Fokus stellt Bild und Detail her', function () {
    assert.deepStrictEqual(perUrl.fehler, []);
    assert.ok(perUrl.d.querySelectorAll('.ngo-knoten-gruppe').length > 0, 'kein Netzbild');
    assert.strictEqual(perUrl.d.querySelector('#nnDetail .nv-detail-name').textContent,
      DATEN.organisationen[0].name);
  });
  test('die Detailspalte fuehrt in den Fokus und wieder heraus', function () {
    var aktion = perUrl.d.querySelector('#nnDetail .nv-detail-aktion');
    assert.ok(aktion, 'kein Knopf in der Detailspalte');
    assert.ok(/zurück zum ganzen Netz/.test(aktion.textContent), aktion.textContent);
  });

  gruppe('Auswahl, Obergruppe und verdeckte Beziehungen');

  // Eine Organisation, deren Nachbarschaft im Kernnetz noch ein Bild ergibt:
  // gross genug fuer mehrere Nachbarn, klein genug, dass die Zeichnung nicht
  // in die Liste kippt. Die Wahl kommt aus den Daten, nicht aus einer festen ID.
  var nachbarschaft = {};
  DATEN.projektion.g3.forEach(function (k) {
    (nachbarschaft[k.a] = nachbarschaft[k.a] || {})[k.b] = true;
    (nachbarschaft[k.b] = nachbarschaft[k.b] || {})[k.a] = true;
  });
  var probeIndex = null, zaehlerNachbarn = 0;
  Object.keys(nachbarschaft).some(function (i) {
    var menge = {};
    menge[i] = true;
    Object.keys(nachbarschaft[i]).forEach(function (x) { menge[x] = true; });
    var knoten = Object.keys(menge).length;
    if (knoten < 6 || knoten > 40) return false;
    var kanten = DATEN.projektion.g3.filter(function (k) {
      return menge[k.a] && menge[k.b];
    }).length;
    if (kanten / knoten >= 4 || kanten > 900) return false;
    probeIndex = i;
    zaehlerNachbarn = knoten - 1;
    return true;
  });
  assert.ok(probeIndex !== null, 'keine Organisation mit zeichenbarer Nachbarschaft gefunden');
  var probeAuswahl = DATEN.organisationen[Number(probeIndex)];

  var gewaehlt = await baueSeite(1440, '?ebene=organisation&knoten=' + probeAuswahl.id);
  test('keine JavaScript-Fehler bei gesetzter Auswahl', function () {
    assert.deepStrictEqual(gewaehlt.fehler, []);
  });
  test('die gewaehlte Organisation ist eingefaerbt, nicht nur umrandet', function () {
    var rot = gewaehlt.d.querySelectorAll('.ngo-organisation .ngo-form[fill="#c8102e"]');
    assert.strictEqual(rot.length, 1, rot.length + ' rot gefuellte Knoten');
    var nachbarn = gewaehlt.d.querySelectorAll('.ngo-organisation .ngo-form[fill="#3c5f86"]');
    assert.ok(nachbarn.length > 0, 'keine eingefaerbte Nachbarschaft');
  });
  test('nicht verbundene Organisationen sind ausgeblendet', function () {
    // Uebrig bleiben genau die Auswahl und ihre direkten Nachbarn.
    var sichtbar = gewaehlt.d.querySelectorAll('.ngo-organisation').length;
    var neutral = gewaehlt.d.querySelectorAll('.ngo-organisation .ngo-form[fill="#72818f"]');
    assert.strictEqual(neutral.length, 0, neutral.length + ' unbeteiligte Knoten im Bild');
    assert.ok(sichtbar < DATEN.organisationen.length / 2,
      sichtbar + ' von ' + DATEN.organisationen.length + ' Organisationen noch im Bild');
    assert.strictEqual(sichtbar, 1 + zaehlerNachbarn);
  });
  test('die Kachel nennt die ausgeblendeten Organisationen und den Rueckweg', function () {
    var kachel = gewaehlt.d.getElementById('nnFokusHinweis');
    assert.strictEqual(kachel.hidden, false);
    assert.ok(/ausgeblendet/.test(kachel.textContent), kachel.textContent);
    assert.strictEqual(gewaehlt.d.getElementById('nnFokusHinweisKnopf').textContent,
      'Auswahl aufheben');
  });
  test('Auswahl aufheben bringt den ganzen Bestand zurueck', function () {
    gewaehlt.d.getElementById('nnFokusHinweisKnopf').click();
    // Ohne Auswahl steht wieder die Liste aller Organisationen.
    var eintraege = gewaehlt.d.querySelectorAll('#nnListe .ngo-liste-knopf').length;
    assert.ok(eintraege > DATEN.organisationen.length / 2,
      'nur ' + eintraege + ' Eintraege nach dem Aufheben');
    assert.strictEqual(gewaehlt.d.getElementById('nnFokusHinweis').hidden, true);
  });

  // Kategorie mit mittlerer Groesse: gross genug fuer mehrere Cluster,
  // klein genug, dass nicht alle Cluster uebrig bleiben.
  var zaehlerKat = {};
  DATEN.organisationen.forEach(function (o) {
    if (o.kategorie) zaehlerKat[o.kategorie] = (zaehlerKat[o.kategorie] || 0) + 1;
  });
  var probeKat = Object.keys(zaehlerKat).sort(function (a, b) {
    return zaehlerKat[b] - zaehlerKat[a];
  })[1];

  var mitKat = await baueSeite(1440, '?kategorie=' + encodeURIComponent(probeKat));
  test('keine JavaScript-Fehler mit Kategorienfilter', function () {
    assert.deepStrictEqual(mitKat.fehler, []);
  });
  test('die Clusterebene zeigt nur Cluster mit Mitgliedern der Kategorie', function () {
    var sichtbar = mitKat.d.querySelectorAll('.ngo-cluster').length;
    assert.ok(sichtbar > 0, 'kein Cluster uebrig fuer ' + probeKat);
    assert.ok(sichtbar <= DATEN.cluster.length, sichtbar + ' von ' + DATEN.cluster.length);
    assert.strictEqual(mitKat.d.getElementById('fKategorie').value, probeKat);
  });
  test('leere Cluster verschwinden, sobald die Kategorie eng genug ist', function () {
    // Die kleinste Kategorie kann nicht in allen Clustern vertreten sein.
    var kleinste = Object.keys(zaehlerKat).sort(function (a, b) {
      return zaehlerKat[a] - zaehlerKat[b];
    })[0];
    var besetzt = {};
    DATEN.organisationen.forEach(function (o) {
      if (o.kategorie === kleinste) besetzt[o.cluster] = true;
    });
    assert.ok(Object.keys(besetzt).length < DATEN.cluster.length,
      'Testannahme falsch: ' + kleinste + ' steckt in allen Clustern');
  });

  test('jede Kategorie steht im Filter, jede mit ihrer category_id', function () {
    var werte = Array.prototype.slice
      .call(d.getElementById('fKategorie').querySelectorAll('option'))
      .map(function (o) { return o.value; }).filter(Boolean);
    assert.deepStrictEqual(werte, DATEN.meta.kategorien.map(function (k) { return k.id; }));
  });
  test('die Farblegende faerbt sieben Kategorien und sammelt den Rest', function () {
    var eintraege = d.getElementById('nnLegendeKategorie').querySelectorAll('span');
    // Ein span traegt die Ueberschrift, danach je Kategorie einer.
    var farbig = Object.keys(fenster.NgoNetzAnsicht.KATEGORIE_FARBE).length;
    assert.strictEqual(eintraege.length, 1 + farbig + 1,
      eintraege.length + ' Legendeneintraege');
    var letzte = eintraege[eintraege.length - 1];
    assert.ok(/^übrige Kategorien \(\d+\)$/.test(letzte.textContent.trim()),
      letzte.textContent);
    assert.ok((letzte.getAttribute('title') || '').length > 0,
      'Sammelzeile nennt ihre Bestandteile nicht');
  });

  // Eine Person, deren Beziehungen teils ausserhalb des Kernnetzes liegen.
  var proPerson = {};
  DATEN.kanten.forEach(function (k) {
    var e = proPerson[k.p] || (proPerson[k.p] = { alle: {}, kern: {} });
    e.alle[k.o] = true;
    if (k.k <= 2) e.kern[k.o] = true;
  });
  var verdeckt = Object.keys(proPerson).map(function (i) {
    return { index: Number(i),
             alle: Object.keys(proPerson[i].alle).length,
             kern: Object.keys(proPerson[i].kern).length };
  }).filter(function (e) { return e.alle > e.kern; })
    .sort(function (a, b) { return (b.alle - b.kern) - (a.alle - a.kern); })[0];

  var offen = await baueSeite(1440, '?person=' + verdeckt.index);
  test('der Personenfokus zeigt von sich aus alle Beziehungsarten', function () {
    // Im Fokus einer Person geht es um ihre Mandate. Das Kernnetz verbaerge
    // einen Teil davon; wer eine Person aufruft, soll nicht erst umschalten.
    assert.strictEqual(offen.d.getElementById('nnG2').getAttribute('aria-pressed'), 'true');
    assert.strictEqual(offen.d.getElementById('kN4').checked, true);
    assert.strictEqual(offen.d.querySelectorAll('.ngo-organisation').length, verdeckt.alle);
    assert.strictEqual(offen.d.getElementById('nnFokusHinweis').hidden, true);
  });

  // Gibt die Adresse eine engere Ansicht vor, bleibt sie stehen — und der
  // Hinweis sagt, was dadurch fehlt.
  var kern = await baueSeite(1440, '?person=' + verdeckt.index + '&klassen=N1,N2,N3');
  test('eine vorgegebene enge Ansicht meldet die ausgeblendeten Beziehungen', function () {
    var status = kern.d.getElementById('nnStatus').textContent;
    assert.ok(/ausgeblendet/.test(status), status);
    assert.ok(status.indexOf(String(verdeckt.alle)) !== -1,
      'Gesamtzahl ' + verdeckt.alle + ' fehlt: ' + status);
    assert.strictEqual(kern.d.querySelectorAll('.ngo-organisation').length, verdeckt.kern);
  });

  test('die Meldung steht auch sichtbar ueber der Grafik, nicht nur fuer Screenreader', function () {
    // nnStatus ist visuell verborgen — ohne Kachel saehe niemand, dass Knoten fehlen.
    var kachel = kern.d.getElementById('nnFokusHinweis');
    assert.strictEqual(kachel.hidden, false, 'Kachel bleibt versteckt');
    var text = kern.d.getElementById('nnFokusHinweisText').textContent;
    assert.ok(text.indexOf(String(verdeckt.alle - verdeckt.kern)) !== -1, text);
    assert.ok(text.indexOf(String(verdeckt.alle)) !== -1, text);
    assert.ok(kern.d.getElementById('nnFokusHinweisKnopf'), 'kein Weg zur vollen Ansicht');
  });

  var erweitert = offen;
  test('in der erweiterten Ansicht erscheinen alle erfassten Organisationen', function () {
    assert.strictEqual(erweitert.d.querySelectorAll('.ngo-organisation').length, verdeckt.alle);
    var status = erweitert.d.getElementById('nnStatus').textContent;
    assert.strictEqual(/ausgeblendet/.test(status), false, status);
    assert.strictEqual(erweitert.d.getElementById('nnFokusHinweis').hidden, true);
  });
  test('der Knopf schaltet auf die volle Ansicht um', function () {
    kern.d.getElementById('nnFokusHinweisKnopf').click();
    assert.strictEqual(kern.d.querySelectorAll('.ngo-organisation').length, verdeckt.alle);
    assert.strictEqual(kern.d.getElementById('nnFokusHinweis').hidden, true);
    assert.strictEqual(kern.d.getElementById('nnG2').getAttribute('aria-pressed'), 'true');
    assert.strictEqual(kern.d.getElementById('kN4').checked, true);
  });

  // Haeufigste Parteiangabe aus den Daten.
  var jePartei = {};
  DATEN.kanten.forEach(function (k) {
    if (k.partei) jePartei[k.partei] = (jePartei[k.partei] || 0) + 1;
  });
  var probePartei = Object.keys(jePartei).sort(function (a, b) {
    return jePartei[b] - jePartei[a];
  })[0];

  // Genau die Organisationen, bei denen eine Person dieser Partei erfasst ist.
  var orgsDerPartei = {};
  DATEN.kanten.forEach(function (k) { if (k.partei === probePartei) orgsDerPartei[k.o] = true; });
  var erwartetePartei = Object.keys(orgsDerPartei).length;

  var parteiNetz = await baueSeite(1440, '?ebene=organisation&partei=' +
    encodeURIComponent(probePartei) + '&ansicht=G2&klassen=N1,N2,N3,N4');
  test('keine JavaScript-Fehler mit Parteifilter', function () {
    assert.deepStrictEqual(parteiNetz.fehler, []);
  });
  test('der Parteiweg zeigt genau die Organisationen dieser Partei', function () {
    assert.strictEqual(parteiNetz.d.getElementById('fPartei').value, probePartei);
    var sichtbar = parteiNetz.d.querySelectorAll('.ngo-organisation').length;
    assert.strictEqual(sichtbar, erwartetePartei,
      sichtbar + ' Knoten, erwartet ' + erwartetePartei + ' fuer ' + probePartei);
  });
  test('Abdeckungsluecken werden nicht pauschal dazugezeichnet', function () {
    // Frueher kamen alle Organisationen ohne erfasste Beziehung dazu — unter
    // einem Parteifilter sahen sie aus wie Treffer. Uebrig bleiben nur die,
    // die tatsaechlich eine Beziehung dieser Partei tragen. (Dass es solche
    // ueberhaupt gibt, ist ein Widerspruch in der Lieferung: die Kennzeichnung
    // als Abdeckungsluecke passt dort nicht zu den gelieferten Beziehungen.)
    var erwartet = DATEN.organisationen.filter(function (o, i) {
      return o.abdeckungsluecke && orgsDerPartei[i];
    }).length;
    var luecken = parteiNetz.d.querySelectorAll('.ngo-organisation.ngo-luecke').length;
    assert.strictEqual(luecken, erwartet, luecken + ' statt ' + erwartet);
    assert.ok(erwartet < Z.abdeckungsluecken / 4,
      erwartet + ' von ' + Z.abdeckungsluecken + ' Abdeckungsluecken im Parteinetz');
  });

  var nurVerbunden = await baueSeite(1440, '?ebene=organisation&partei=' +
    encodeURIComponent(probePartei) + '&verbunden=1&ansicht=G2&klassen=N1,N2,N3,N4');
  test('der Schalter «nur mit Verbindung» blendet Einzelknoten aus', function () {
    assert.strictEqual(nurVerbunden.d.getElementById('nnNurVerbunden').checked, true);
    var ohne = nurVerbunden.d.querySelectorAll('.ngo-organisation.ngo-ohne-verbindung').length;
    assert.strictEqual(ohne, 0, ohne + ' Organisationen ohne Verbindung im Bild');
    assert.ok(nurVerbunden.d.querySelectorAll('.ngo-organisation').length < erwartetePartei);
    assert.ok(/verbunden=1/.test(nurVerbunden.fenster.location.search),
      nurVerbunden.fenster.location.search);
  });
  test('der Schalter bleibt umkehrbar und sagt, was er wegnimmt', function () {
    var kachel = nurVerbunden.d.getElementById('nnFokusHinweis');
    assert.strictEqual(kachel.hidden, false);
    assert.ok(/nicht, dass sie unvernetzt/.test(kachel.textContent), kachel.textContent);
    nurVerbunden.d.getElementById('nnFokusHinweisKnopf').click();
    assert.strictEqual(nurVerbunden.d.getElementById('nnNurVerbunden').checked, false);
    assert.strictEqual(nurVerbunden.d.querySelectorAll('.ngo-organisation').length,
      erwartetePartei);
  });

  var gesamtnetz = await baueSeite(1440,
    '?ebene=organisation&cluster=' + kleinerCluster.id);
  test('Knoten ohne Linie stehen geordnet unter dem Netz, nicht verstreut', function () {
    // Sonst treibt die Abstossung sie an den Rand: das Bild wird gross, der
    // verbundene Teil klein.
    var ohne = [];
    var alle = Array.prototype.slice.call(
      gesamtnetz.d.querySelectorAll('.ngo-organisation'));
    alle.forEach(function (g) {
      if (g.classList.contains('ngo-ohne-verbindung') || g.classList.contains('ngo-luecke')) {
        var m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(g.getAttribute('transform') || '');
        if (m) ohne.push({ x: parseFloat(m[1]), y: parseFloat(m[2]) });
      }
    });
    assert.ok(ohne.length >= 3, ohne.length + ' Knoten ohne Linie gefunden');
    // Ein Raster hat wenige verschiedene Zeilen, ein Streufeld viele.
    var zeilen = {};
    ohne.forEach(function (k) { zeilen[Math.round(k.y)] = true; });
    assert.ok(Object.keys(zeilen).length <= Math.max(2, ohne.length / 2),
      Object.keys(zeilen).length + ' verschiedene Zeilen bei ' + ohne.length + ' Knoten');
  });

  gruppe('Mobilbreite (390 px)');

  var mobil = await baueSeite(390, '?ebene=organisation');
  test('keine JavaScript-Fehler', function () { assert.deepStrictEqual(mobil.fehler, []); });
  test('auf schmaler Anzeige steht die Liste statt eines Knaeuels', function () {
    // Die Nachbarschaftsbegrenzung greift erst, wo ueberhaupt gezeichnet wird.
    // Bei 2491 Knoten ist auch am Handy die Liste die Antwort.
    // Auf schmaler Anzeige wird zuerst auf eine Nachbarschaft begrenzt; ist
    // auch die noch zu dicht, bleibt die Liste.
    assert.strictEqual(mobil.d.getElementById('nnListe').hidden, false);
    var eintraege = mobil.d.querySelectorAll('#nnListe .ngo-liste-knopf').length;
    assert.ok(eintraege > 20 && eintraege < Z.organisationen,
      eintraege + ' Eintraege auf schmaler Anzeige');
    assert.strictEqual(mobil.d.querySelectorAll('.ngo-organisation').length, 0);
  });
  test('Tabellen bleiben vollstaendig', function () {
    assert.strictEqual(mobil.d.querySelectorAll('#nnTabelleOrg tbody tr').length, Z.organisationen);
    assert.strictEqual(
      mobil.d.querySelectorAll('#nnTabelleLuecken tbody tr').length, Z.abdeckungsluecken);
  });

  console.log('\n' + bestanden + ' Tests bestanden, ' + fehlgeschlagen + ' fehlgeschlagen.');
  process.exit(fehlgeschlagen ? 1 : 0);
})();
