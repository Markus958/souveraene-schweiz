/*
 * Smoke-Test der NGO-Netzwerkseite: laedt die Seite in eine DOM-Nachbildung,
 * fuehrt die Seitenskripte aus und prueft Kennzahlen, Umschalter, Filter,
 * Detailspalte, URL-Zustand, Tabellen und das Verhalten in Mobilbreite.
 *
 * Aufruf:  node scripts/test_ngo_netz_seite.js
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
    var datei = path.resolve(path.dirname(SEITE), String(pfad));
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
  test('keine externen Ressourcen geladen', function () {
    // Hyperlinks auf Quellen sind gewollt (Auftrag Abschnitt 8) und laden
    // nichts nach. Geprueft wird, was der Browser selbst anfordert.
    var geladen = 'link[href], script[src], img[src], iframe[src], source[src], video[src]';
    var extern = Array.prototype.slice.call(d.querySelectorAll(geladen)).filter(function (e) {
      return /^https?:/.test(e.getAttribute('src') || e.getAttribute('href') || '');
    });
    assert.deepStrictEqual(extern.map(function (e) {
      return e.getAttribute('src') || e.getAttribute('href');
    }), []);
  });
  test('externe Verweise zeigen nur auf Quellen und sind abgesichert', function () {
    var links = Array.prototype.slice.call(d.querySelectorAll('a[href^="http"]'));
    assert.ok(links.length > 0);
    links.forEach(function (a) {
      assert.strictEqual(a.getAttribute('rel'), 'noopener', a.getAttribute('href'));
      assert.strictEqual(a.getAttribute('target'), '_blank', a.getAttribute('href'));
    });
  });
  test('Kennzahlen sind gefuellt', function () {
    assert.strictEqual(text('kzOrganisationen'), String(Z.organisationen));
    assert.strictEqual(text('kzBeziehungen'), String(Z.kanten));
    assert.strictEqual(text('kzKern'), String(Z.kantenG3));
    assert.strictEqual(text('kzPersonen'), String(Z.personen));
    assert.strictEqual(text('kzLuecken'), String(Z.abdeckungsluecken));
    assert.strictEqual(text('kzDatenstand'), '19.08.2026');
  });
  test('Masterversion steht auf der Seite', function () {
    assert.ok(/3\.7\.49/.test(text('nnVersion')), text('nnVersion'));
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

  test('die Seite startet auf der Clusterebene', function () {
    assert.strictEqual(knotenAnzahl('.ngo-cluster'), DATEN.cluster.length,
      knotenAnzahl('.ngo-cluster') + ' Clusterknoten');
    assert.strictEqual(knotenAnzahl('.ngo-organisation'), 0,
      'auf der Clusterebene stehen keine Einzelorganisationen');
    assert.ok(knotenAnzahl('.ngo-kante--cluster') > 10,
      knotenAnzahl('.ngo-kante--cluster') + ' Clusterverbindungen');
  });
  test('Clusterknoten tragen ihre Nummer', function () {
    assert.strictEqual(knotenAnzahl('.ngo-clusterziffer--gross'), DATEN.cluster.length);
  });
  test('Statuszeile erklaert, was eine Linie zwischen Clustern bedeutet', function () {
    var s = text('nnStatus');
    assert.ok(/Organisationspaare/.test(s), s);
    assert.ok(/nicht für eine Beziehung zwischen den Clustern selbst/.test(s), s);
  });
  test('Brotkrumen zeigen die Ebene', function () {
    var leiste = text('nnBrotkrumen');
    assert.ok(/Alle Cluster/.test(leiste), leiste);
    assert.ok(/Gesamtnetz zeigen/.test(leiste), leiste);
  });
  test('Kachel weist die Organisationen ohne Beziehung aus', function () {
    assert.strictEqual(d.getElementById('nnOhneBeziehung').hidden, false);
    var s = text('nnOhneBeziehungText');
    assert.ok(s.indexOf(String(Z.abdeckungsluecken)) === 0, s);
    assert.ok(/kein Nachweis fehlender Vernetzung/.test(s), s);
  });
  test('Clusterfilter und Knotenfarbe sind auf dieser Ebene gesperrt', function () {
    assert.strictEqual(d.getElementById('fCluster').disabled, true);
    assert.strictEqual(d.getElementById('fFarbe').disabled, true);
  });
  test('Klick auf einen Cluster oeffnet ihn', function () {
    klick(d.querySelector('.ngo-cluster'));
    assert.ok(knotenAnzahl('.ngo-organisation') > 0, 'keine Organisationen im Cluster');
    assert.strictEqual(knotenAnzahl('.ngo-cluster'), 0);
    assert.ok(/fokus=/.test(fenster.location.search), fenster.location.search);
    var leiste = text('nnBrotkrumen');
    assert.ok(leiste.split('›').length >= 2, leiste);
  });
  test('Anschluesse an andere Cluster bleiben sichtbar', function () {
    assert.ok(knotenAnzahl('.ngo-stumpf') > 0, 'keine Anschlussstummel');
    assert.ok(knotenAnzahl('.ngo-kante--anschluss') > 0);
  });
  test('Brotkrume fuehrt zurueck zur Uebersicht', function () {
    klick(d.querySelector('.ngo-brotkrume'));
    assert.strictEqual(knotenAnzahl('.ngo-cluster'), DATEN.cluster.length);
    assert.strictEqual(/fokus=/.test(fenster.location.search), false);
  });

  gruppe('Gesamtnetz (Ebene Organisationen)');

  // Ab hier wird ausdruecklich auf das Gesamtnetz gewechselt.
  klick(d.querySelector('.ngo-brotkrume-wechsel'));

  test('Wechsel ins Gesamtnetz zeigt die Organisationen', function () {
    assert.ok(knotenAnzahl('.ngo-organisation') > 90,
      knotenAnzahl('.ngo-organisation') + ' Organisationen');
    assert.strictEqual(knotenAnzahl('.ngo-cluster'), 0);
    assert.ok(/ebene=organisation/.test(fenster.location.search), fenster.location.search);
  });

  test('Kernnetz ist vorgewaehlt, N4 gesperrt', function () {
    assert.strictEqual(d.getElementById('nnG3').getAttribute('aria-pressed'), 'true');
    assert.strictEqual(d.getElementById('kN4').disabled, true);
    assert.strictEqual(d.getElementById('kN4').checked, false);
  });
  test('am Desktop wird das Gesamtnetz gezeichnet, nicht eine Nachbarschaft', function () {
    assert.ok(knotenAnzahl('.ngo-organisation') > 90,
      'nur ' + knotenAnzahl('.ngo-organisation') + ' Knoten — sieht nach Nachbarschaftsmodus aus');
    assert.strictEqual(/Nachbarschaft/.test(text('nnStatus')), false, text('nnStatus'));
  });
  test('Abdeckungsluecken sind als solche gezeichnet', function () {
    assert.ok(knotenAnzahl('.ngo-luecke') >= 8);
  });
  test('direkte und personenbasierte Kanten sind unterschiedlich ausgezeichnet', function () {
    assert.ok(knotenAnzahl('.ngo-kante--personen') > 0);
    assert.ok(knotenAnzahl('.ngo-kante--direkt') + knotenAnzahl('.ngo-kante--beides') > 0);
  });
  test('Clusterziffern stehen in den Knoten', function () {
    assert.ok(knotenAnzahl('.ngo-clusterziffer') > 50);
  });
  test('Beschriftungen sind in der Uebersicht ausgeduennt', function () {
    var alle = knotenAnzahl('.ngo-organisation .ngo-beschriftung');
    var aus = knotenAnzahl('.ngo-organisation .ngo-beschriftung--aus');
    assert.ok(alle > 90, 'zu wenige Knoten: ' + alle);
    assert.ok(aus > 0, 'es wird nichts ausgeduennt');
    assert.ok(alle - aus <= 30, (alle - aus) + ' Namen stehen noch — zu dicht');
    assert.ok(alle - aus >= 10, 'nur ' + (alle - aus) + ' Namen — zu wenig Orientierung');
  });
  test('die groessten Bruecken behalten ihren Namen', function () {
    var sichtbar = Array.prototype.slice
      .call(d.querySelectorAll('.ngo-organisation .ngo-beschriftung'))
      .filter(function (t) { return !t.classList.contains('ngo-beschriftung--aus'); })
      .map(function (t) { return t.textContent; });
    // Spitze des Kernnetzes G3. VPOD steht bewusst nicht hier: seine 13
    // Brueckenpersonen stammen fast nur aus N4, im Kernnetz sind es 3.
    ['LITRA', 'sgv', 'economiesuisse', 'Inclusion Handicap'].forEach(function (name) {
      assert.ok(sichtbar.indexOf(name) !== -1, name + ' fehlt: ' + sichtbar.join(', '));
    });
  });
  test('Statuszeile erklaert die Ausduennung', function () {
    assert.ok(/Beschriftet sind die \d+ Knoten/.test(text('nnStatus')), text('nnStatus'));
  });
  test('Hineinzoomen zeigt alle Namen', function () {
    var vorher = knotenAnzahl('.ngo-beschriftung--aus');
    assert.ok(vorher > 0);
    for (var i = 0; i < 12; i++) klick(d.getElementById('nnPlus'));
    assert.strictEqual(knotenAnzahl('.ngo-beschriftung--aus'), 0,
      'nach dem Hineinzoomen sind noch Namen ausgeblendet');
    for (var j = 0; j < 12; j++) klick(d.getElementById('nnMinus'));
    assert.ok(knotenAnzahl('.ngo-beschriftung--aus') > 0, 'Ausduennung kehrt nicht zurueck');
  });
  test('Statuszeile meldet den Stand', function () {
    assert.ok(/Organisationen/.test(text('nnStatus')));
  });
  test('Legende nennt beide Verbindungsarten und die Groessenbedeutung', function () {
    var t = d.querySelector('.nv-legende').textContent;
    assert.ok(t.indexOf('gemeinsam erfasste Personen') !== -1);
    assert.ok(t.indexOf('direkt erfasste Beziehung') !== -1);
    assert.ok(t.indexOf('kein Einflussmass') !== -1);
  });
  test('Clusterlegende listet alle Cluster des Datenstands', function () {
    assert.strictEqual(d.querySelectorAll('#nnLegendeCluster .ngo-l-ziffer').length, Z.cluster);
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
  test('Filter Obergruppe wirkt auf die Zeichnung', function () {
    var vorher = knotenAnzahl('.ngo-organisation');
    var feld = d.getElementById('fObergruppe');
    feld.value = 'Wirtschafts- und Berufsverbände';
    wechsle(feld);
    assert.ok(knotenAnzahl('.ngo-organisation') < vorher);
    assert.ok(/obergruppe=/.test(fenster.location.search));
    feld.value = '';
    wechsle(feld);
  });
  test('Filter Cluster wirkt', function () {
    var cluster = DATEN.cluster[DATEN.cluster.length - 1];
    var feld = d.getElementById('fCluster');
    var vorher = knotenAnzahl('.ngo-organisation');
    feld.value = String(cluster.id);
    wechsle(feld);
    assert.ok(knotenAnzahl('.ngo-organisation') <= cluster.groesse,
      knotenAnzahl('.ngo-organisation') + ' Knoten, Cluster hat ' + cluster.groesse);
    assert.ok(knotenAnzahl('.ngo-organisation') < vorher);
    feld.value = '';
    wechsle(feld);
  });
  test('Filter Partei ist waehlbar und wirkt', function () {
    var feld = d.getElementById('fPartei');
    assert.ok(feld.querySelectorAll('option').length > 5);
    feld.value = 'SP';
    wechsle(feld);
    assert.ok(/partei=SP/.test(fenster.location.search));
    feld.value = '';
    wechsle(feld);
  });
  test('Farbwechsel auf Obergruppe blendet die Ziffern aus', function () {
    var feld = d.getElementById('fFarbe');
    feld.value = 'obergruppe';
    wechsle(feld);
    assert.strictEqual(knotenAnzahl('.ngo-clusterziffer'), 0);
    assert.strictEqual(d.getElementById('nnLegendeObergruppe').hidden, false);
    feld.value = 'cluster';
    wechsle(feld);
    assert.ok(knotenAnzahl('.ngo-clusterziffer') > 0);
  });

  gruppe('Bedienung und Begriffe');

  test('Bedienzeile steht ueber der Grafik', function () {
    var zeile = d.querySelector('.ngo-bedienzeile');
    assert.ok(zeile, 'keine Bedienzeile');
    assert.ok(/anklicken/.test(zeile.textContent));
    assert.ok(/Mausrad/.test(zeile.textContent));
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
                  'historie', 'obergruppe', 'hauptkategorie', 'cluster', 'brueckenperson',
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
    var ausserhalb = Array.prototype.slice
      .call(d.querySelectorAll('.ngo-steuerung *:not(small)'))
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
  test('Umschalten zeichnet das Personennetz', function () {
    klick(d.getElementById('nnPerspPers'));
    assert.strictEqual(d.getElementById('nnPerspPers').getAttribute('aria-pressed'), 'true');
    assert.ok(knotenAnzahl('.ngo-person') > 100, knotenAnzahl('.ngo-person') + ' Personenknoten');
    assert.ok(knotenAnzahl('.ngo-organisation') > 50);
    assert.ok(knotenAnzahl('.ngo-kante--beleg') > 200);
    assert.ok(/erfasste Beziehungen/.test(text('nnStatus')), text('nnStatus'));
  });
  test('Schwellenregler, Hinweis und Legende erscheinen', function () {
    assert.strictEqual(d.getElementById('nnSchwelleFeld').hidden, false);
    assert.strictEqual(d.getElementById('nnPersonHinweis').hidden, false);
    assert.strictEqual(d.getElementById('nnLegendePerson').hidden, false);
    assert.ok(/keine berechneten Linien zwischen Personen/
      .test(text('nnPersonHinweis')), text('nnPersonHinweis'));
  });
  test('Kennzahlenzeile wechselt mit der Perspektive', function () {
    assert.strictEqual(text('kzOrganisationen'), String(Z.personen));
    var beschriftung = d.getElementById('kzOrganisationen').parentNode
      .querySelector('span').textContent;
    assert.ok(/Personen/.test(beschriftung), beschriftung);
    assert.ok(parseInt(text('kzBeziehungen'), 10) > 0);
  });
  test('Perspektive und Schwelle stehen in der URL', function () {
    assert.ok(/perspektive=person/.test(fenster.location.search), fenster.location.search);
    var feld = d.getElementById('fSchwelle');
    feld.value = '3';
    wechsle(feld);
    assert.ok(/schwelle=3/.test(fenster.location.search), fenster.location.search);
    assert.ok(knotenAnzahl('.ngo-person') < Z.brueckenpersonen,
      knotenAnzahl('.ngo-person') + ' Personen bei Schwelle 3, '
      + Z.brueckenpersonen + ' bei Schwelle 2');
    feld.value = '2';
    wechsle(feld);
  });
  test('Klick auf eine Person zeigt das Personendetail', function () {
    klick(d.querySelector('.ngo-person'));
    var t = text('nnDetail');
    assert.ok(/Person/.test(t));
    assert.ok(/Erfasste Organisationen/.test(t), t.slice(0, 120));
  });
  test('Zurueck zur Organisationsperspektive', function () {
    klick(d.getElementById('nnPerspOrg'));
    assert.strictEqual(d.getElementById('nnSchwelleFeld').hidden, true);
    assert.strictEqual(knotenAnzahl('.ngo-kante--beleg'), 0);
    assert.strictEqual(text('kzOrganisationen'), String(Z.organisationen));
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
    assert.ok(knotenAnzahl('.ngo-kante--personen') > 0);
  });

  gruppe('Detailspalte');

  test('Detailspalte zeigt zuerst einen Hinweis', function () {
    assert.ok(/Organisation anklicken/.test(text('nnDetail')));
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
  test('Personen erscheinen erst nach dem Klick auf eine Organisation', function () {
    assert.ok(knotenAnzahl('.ngo-person') > 0);
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
  test('Personenuebersicht enthaelt alle Personen mit Beziehung', function () {
    assert.strictEqual(d.querySelectorAll('#nnTabellePersonen tbody tr').length, Z.personen);
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
    assert.ok(/3\.7\.49/.test(text('nnQuelle')), text('nnQuelle'));
  });

  gruppe('Zustand aus der URL');

  // Knoten aus dem gewaehlten Cluster nehmen, damit der Filter ihn nicht ausblendet.
  var probeCluster = DATEN.cluster[0];
  var probeOrg = DATEN.organisationen[probeCluster.mitglieder[0]];
  var geteilt = await baueSeite(1440, '?ebene=organisation&ansicht=G2&cluster=' + probeCluster.id
    + '&farbe=obergruppe&knoten=' + probeOrg.id);
  test('geteilter Link stellt Ansicht, Filter und Knoten wieder her', function () {
    var g = geteilt.d;
    assert.deepStrictEqual(geteilt.fehler, []);
    assert.strictEqual(g.getElementById('nnG2').getAttribute('aria-pressed'), 'true');
    assert.strictEqual(g.getElementById('fCluster').value, String(probeCluster.id));
    assert.strictEqual(g.getElementById('fFarbe').value, 'obergruppe');
    assert.ok(g.getElementById('nnDetail').textContent.indexOf(probeOrg.name) !== -1,
      probeOrg.name + ' fehlt im Detail');
  });

  gruppe('Auswahl, Obergruppe und verdeckte Beziehungen');

  // Eine Organisation mit mehreren Beziehungen, damit Auswahl und Nachbarschaft
  // beide vorkommen. Die Wahl kommt aus den Daten, nicht aus einer festen ID.
  var zaehlerOrg = {};
  DATEN.kanten.forEach(function (k) {
    if (k.k > 2) return;                       // Kernnetz N1 bis N3
    zaehlerOrg[k.o] = (zaehlerOrg[k.o] || 0) + 1;
  });
  var probeIndex = Object.keys(zaehlerOrg).sort(function (a, b) {
    return zaehlerOrg[b] - zaehlerOrg[a];
  })[0];
  var probeAuswahl = DATEN.organisationen[Number(probeIndex)];

  // Wie viele Organisationen sind mit der Probe ueber eine gemeinsame Person
  // verbunden? Das ist die Zahl, die nach der Auswahl im Bild bleiben muss.
  var personenDerProbe = {};
  DATEN.kanten.forEach(function (k) {
    if (k.k <= 2 && String(k.o) === String(probeIndex)) personenDerProbe[k.p] = true;
  });
  var nachbarn = {};
  DATEN.kanten.forEach(function (k) {
    if (k.k <= 2 && personenDerProbe[k.p] && String(k.o) !== String(probeIndex)) {
      nachbarn[k.o] = true;
    }
  });
  var zaehlerNachbarn = Object.keys(nachbarn).length;

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
  test('Auswahl aufheben bringt das ganze Netz zurueck', function () {
    gewaehlt.d.getElementById('nnFokusHinweisKnopf').click();
    var sichtbar = gewaehlt.d.querySelectorAll('.ngo-organisation').length;
    assert.ok(sichtbar > DATEN.organisationen.length / 2,
      'nur ' + sichtbar + ' Organisationen nach dem Aufheben');
    assert.strictEqual(gewaehlt.d.getElementById('nnFokusHinweis').hidden, true);
  });

  // Obergruppe mit mittlerer Groesse: gross genug fuer mehrere Cluster,
  // klein genug, dass nicht alle Cluster uebrig bleiben.
  var zaehlerOg = {};
  DATEN.organisationen.forEach(function (o) {
    if (o.obergruppe) zaehlerOg[o.obergruppe] = (zaehlerOg[o.obergruppe] || 0) + 1;
  });
  var probeOg = Object.keys(zaehlerOg).sort(function (a, b) {
    return zaehlerOg[b] - zaehlerOg[a];
  })[1];

  var mitOg = await baueSeite(1440, '?obergruppe=' + encodeURIComponent(probeOg));
  test('keine JavaScript-Fehler mit Obergruppenfilter', function () {
    assert.deepStrictEqual(mitOg.fehler, []);
  });
  test('die Clusterebene zeigt nur Cluster mit Mitgliedern der Obergruppe', function () {
    var sichtbar = mitOg.d.querySelectorAll('.ngo-cluster').length;
    assert.ok(sichtbar > 0, 'kein Cluster uebrig fuer ' + probeOg);
    assert.ok(sichtbar <= DATEN.cluster.length, sichtbar + ' von ' + DATEN.cluster.length);
    assert.strictEqual(mitOg.d.getElementById('fObergruppe').value, probeOg);
  });
  test('leere Cluster verschwinden, sobald die Obergruppe eng genug ist', function () {
    // Die kleinste Obergruppe kann nicht in allen Clustern vertreten sein.
    var kleinste = Object.keys(zaehlerOg).sort(function (a, b) {
      return zaehlerOg[a] - zaehlerOg[b];
    })[0];
    var besetzt = {};
    DATEN.organisationen.forEach(function (o) {
      if (o.obergruppe === kleinste) besetzt[o.cluster] = true;
    });
    assert.ok(Object.keys(besetzt).length < DATEN.cluster.length,
      'Testannahme falsch: ' + kleinste + ' steckt in allen Clustern');
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

  var kern = await baueSeite(1440, '?person=' + verdeckt.index);
  test('der Personenfokus meldet die ausgeblendeten Beziehungen', function () {
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

  var erweitert = await baueSeite(1440,
    '?person=' + verdeckt.index + '&ansicht=G2&klassen=N1,N2,N3,N4');
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

  var gesamtnetz = await baueSeite(1440, '?ebene=organisation');
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
    assert.ok(ohne.length > 20, ohne.length + ' Knoten ohne Linie gefunden');
    // Ein Raster hat wenige verschiedene Zeilen, ein Streufeld viele.
    var zeilen = {};
    ohne.forEach(function (k) { zeilen[Math.round(k.y)] = true; });
    assert.ok(Object.keys(zeilen).length < ohne.length / 3,
      Object.keys(zeilen).length + ' verschiedene Zeilen bei ' + ohne.length + ' Knoten');
  });

  gruppe('Mobilbreite (390 px)');

  var mobil = await baueSeite(390, '?ebene=organisation');
  test('keine JavaScript-Fehler', function () { assert.deepStrictEqual(mobil.fehler, []); });
  test('statt des Gesamtnetzes wird eine Nachbarschaft gezeigt', function () {
    var anzahl = mobil.d.querySelectorAll('.ngo-organisation').length;
    assert.ok(anzahl > 0 && anzahl < Z.organisationen / 3,
      anzahl + ' Knoten auf schmaler Anzeige, ' + Z.organisationen + ' Organisationen gesamt');
    assert.ok(/Nachbarschaft/.test(mobil.d.getElementById('nnStatus').textContent));
  });
  test('Kennzahlen und Tabellen bleiben vollstaendig', function () {
    assert.strictEqual(mobil.d.getElementById('kzOrganisationen').textContent.trim(),
      String(Z.organisationen));
    assert.strictEqual(mobil.d.querySelectorAll('#nnTabelleOrg tbody tr').length, Z.organisationen);
  });

  console.log('\n' + bestanden + ' Tests bestanden, ' + fehlgeschlagen + ' fehlgeschlagen.');
  process.exit(fehlgeschlagen ? 1 : 0);
})();
