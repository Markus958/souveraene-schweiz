/*
 * Tests fuer den NGO-Adapter: Datenfilter, Verbindungstypen, Belegebenen.
 * Aufruf:  node scripts/test_ngo.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var assert = require('assert');

var N = require(path.join(__dirname, '..', 'assets', 'ngo', 'ngo-daten.js'));
var WURZEL = path.join(__dirname, '..');
var FLAT = path.join(WURZEL, 'assets', 'ngo', 'ngo-fuehrungsnetz.json');
var RED = path.join(WURZEL, 'assets', 'ngo', 'ngo-redaktion.json');
var INTERN = path.join(WURZEL, 'NGO', 'daten', 'NGO_Fuehrungsnetz_Flatfile.json');

var bestanden = 0, fehlgeschlagen = 0;

function test(name, fn) {
  try { fn(); bestanden++; console.log('  ok   ' + name); }
  catch (e) { fehlgeschlagen++; console.log('  FEHL ' + name + '\n       ' + e.message); }
}
function gruppe(t) { console.log('\n' + t); }

var flat = JSON.parse(fs.readFileSync(FLAT, 'utf8'));
var redaktion = JSON.parse(fs.readFileSync(RED, 'utf8'));
var modell = N.baueModell(flat, redaktion);

/* ------------------------------------------------ Veroeffentlichung ------ */

gruppe('Veroeffentlichungsfaehige Daten');

test('interne Bereiche fehlen in der ausgelieferten JSON', function () {
  assert.strictEqual(flat.reviewLog, undefined);
  assert.strictEqual(flat.researchNotes, undefined);
});

test('Pruefbloecke enthalten nur Status und Datum', function () {
  flat.roles.forEach(function (r) {
    if (!r.review) return;
    Object.keys(r.review).forEach(function (feld) {
      assert.ok(['status', 'reviewedAt'].indexOf(feld) !== -1, 'unerwartetes Feld: ' + feld);
    });
  });
});

test('Rohtext enthaelt keine internen Marker', function () {
  var text = fs.readFileSync(FLAT, 'utf8');
  ['newEvidence', 'internalOnly', 'Prüfergebnis', 'Prüfgrund'].forEach(function (m) {
    assert.strictEqual(text.indexOf(m), -1, 'gefunden: ' + m);
  });
});

test('die ausgelieferte Datei ist kleiner als die interne', function () {
  if (!fs.existsSync(INTERN)) return;
  assert.ok(fs.statSync(FLAT).size < fs.statSync(INTERN).size);
});

/* -------------------------------------------------------- Grundmodell --- */

gruppe('Grundmodell');

test('100 Organisationen, 296 Rollen', function () {
  assert.strictEqual(modell.kennzahlen.organisationen, 100);
  assert.strictEqual(modell.kennzahlen.rollen, 296);
});

test('Datenstand 2026-08-10', function () {
  assert.strictEqual(modell.kennzahlen.datenstand, '2026-08-10');
});

test('jede Rolle traegt lesbare Texte statt Rohschluessel', function () {
  modell.rollen.forEach(function (r) {
    assert.ok(r.rollenartText && r.rollenartText !== r.rollenart || !N.ROLLENARTEN[r.rollenart]);
    assert.ok(r.zeitstatusText, 'Zeitstatus ohne Text: ' + r.id);
  });
});

test('Fuehrungsmodell und Fuehrungswechsel sind zugeordnet', function () {
  var mitModell = modell.organisationenSortiert.filter(function (id) {
    return modell.organisationen[id].fuehrungsmodell;
  });
  var mitWechsel = modell.organisationenSortiert.filter(function (id) {
    return modell.organisationen[id].fuehrungswechsel;
  });
  assert.ok(mitModell.length >= 15, 'nur ' + mitModell.length + ' Fuehrungsmodelle');
  assert.ok(mitWechsel.length >= 14, 'nur ' + mitWechsel.length + ' Fuehrungswechsel');
});

/* --------------------------------------------------------- Belegebenen -- */

gruppe('Belegebenen');

test('alle vier Ebenen kommen vor', function () {
  var ebenen = {};
  modell.verbindungen.forEach(function (v) { ebenen[v.ebene] = true; });
  ['aktuell', 'eingeschraenkt', 'altbestand', 'hinweis'].forEach(function (e) {
    assert.ok(ebenen[e], 'Ebene fehlt: ' + e);
  });
});

test('aktuelle und eingeschraenkte Ebene ergeben die 8 Bruecken der Flatfile', function () {
  var k = modell.kennzahlen;
  assert.strictEqual(k.verbindungenAktuell + k.verbindungenEingeschraenkt,
    flat.graph.organisationBridges.length);
});

test('jede Verbindung der Ebene «aktuell» beruht nur auf aktuellen, verifizierten Rollen', function () {
  modell.verbindungen.filter(function (v) { return v.ebene === 'aktuell'; }).forEach(function (v) {
    v.personen.forEach(function (name) {
      var person = null;
      Object.keys(modell.personen).forEach(function (id) {
        if (modell.personen[id].name === name) person = modell.personen[id];
      });
      assert.ok(person, 'Person fehlt: ' + name);
      person.rollen.filter(function (r) {
        return r.organisationId === v.quelle || r.organisationId === v.ziel;
      }).forEach(function (r) {
        assert.ok(r.aktuell, name + ': Rolle nicht aktuell in ' + v.id);
        assert.ok(r.verifiziert, name + ': Rolle nicht verifiziert in ' + v.id);
      });
    });
  });
});

test('Hinweis-Ebene ist nie als aktuelle Doppelfunktion ausgezeichnet', function () {
  modell.verbindungen.filter(function (v) { return v.ebene === 'hinweis'; }).forEach(function (v) {
    assert.strictEqual(v.typen.indexOf('aktuelle_doppelfunktion'), -1,
      v.id + ' waere eine aktuelle Verbindung aus der Bemerkungsdatei');
  });
});

test('Hinweise nennen Beleg und Grund', function () {
  var hinweise = modell.verbindungen.filter(function (v) { return v.ebene === 'hinweis'; });
  assert.ok(hinweise.length > 0);
  hinweise.forEach(function (v) {
    assert.ok(v.belege.length > 0, v.id + ' ohne Belegzeile');
    assert.ok(v.gruende.length > 0, v.id + ' ohne Begruendung');
  });
});

test('Regel 6: eine fehlende Rolle erzeugt nie eine aktuelle Verbindung', function () {
  // Das Paar darf im Altbestand vorkommen — dann stammt es aus den Altdaten,
  // nicht aus der Bemerkungsdatei, und ist als «zu verifizieren» ausgewiesen.
  var erlaubt = ['hinweis', 'altbestand'];
  (redaktion.redaktionelleHinweise || []).forEach(function (h) {
    if (!h.organisationA || !h.organisationB) return;
    if (!/keine strukturierte Rolle/.test(h.grund || '')) return;
    var schluessel = [h.organisationA, h.organisationB].sort().join('|');
    var v = modell.verbindungen.filter(function (x) { return x.id === schluessel; })[0];
    if (!v) return;
    assert.ok(erlaubt.indexOf(v.ebene) !== -1,
      schluessel + ' ist auf Ebene «' + v.ebene + '» statt Hinweis oder Altbestand');
  });
});

test('Belegzeile eines Hinweises bleibt am Altbestand-Paar sichtbar', function () {
  var v = modell.verbindungen.filter(function (x) { return x.id === 'NGO-0003|NGO-0068'; })[0];
  if (!v) return;
  assert.strictEqual(v.ebene, 'altbestand');
  assert.ok(v.belege.length > 0, 'Belegzeile aus der Bemerkungsdatei fehlt');
});

test('Altbestand ist nicht Teil der Standardansicht', function () {
  var f = N.standardFilter();
  assert.strictEqual(f.ebenen.altbestand, false);
  assert.strictEqual(f.ebenen.hinweis, false);
  assert.strictEqual(f.ebenen.eingeschraenkt, false);
  assert.strictEqual(f.ebenen.aktuell, true);
});

/* -------------------------------------------------------- Filterlogik --- */

gruppe('Filterlogik');

test('Standardansicht zeigt nur aktuelle Verbindungen', function () {
  var netz = N.baueOrganisationsnetz(modell, N.standardFilter());
  assert.strictEqual(netz.kanten.length, modell.kennzahlen.verbindungenAktuell);
  netz.kanten.forEach(function (k) { assert.strictEqual(k.ebene, 'aktuell'); });
});

test('Standardansicht zeigt nicht alle 296 Rollen als Gesamtgraph', function () {
  var netz = N.baueOrganisationsnetz(modell, N.standardFilter());
  assert.ok(netz.knoten.length < 30, 'zu viele Knoten: ' + netz.knoten.length);
  netz.knoten.forEach(function (k) { assert.strictEqual(k.typ, 'organisation'); });
});

test('Zuschalten aller Ebenen erweitert das Netz', function () {
  var f = N.standardFilter();
  var vorher = N.baueOrganisationsnetz(modell, f).kanten.length;
  f.ebenen.eingeschraenkt = true; f.ebenen.altbestand = true; f.ebenen.hinweis = true;
  assert.ok(N.baueOrganisationsnetz(modell, f).kanten.length > vorher);
});

test('historische Funktionen sind standardmaessig ausgeblendet', function () {
  var f = N.standardFilter();
  var historisch = modell.rollen.filter(function (r) { return r.zeitstatus === 'historical'; });
  assert.ok(historisch.length > 0);
  historisch.forEach(function (r) { assert.strictEqual(N.rolleSichtbar(r, f), false); });
});

test('angekuendigte Funktionen erst nach Zuschalten sichtbar', function () {
  var f = N.standardFilter();
  var angekuendigt = modell.rollen.filter(function (r) { return r.zeitstatus === 'future_announced'; });
  assert.ok(angekuendigt.length > 0);
  assert.strictEqual(N.rolleSichtbar(angekuendigt[0], f), false);
  f.zeitstatus.future_announced = true;
  assert.strictEqual(N.rolleSichtbar(angekuendigt[0], f), true);
});

test('Filter «nur politische Mandate»', function () {
  var f = N.standardFilter();
  f.nurPolitischeMandate = true;
  var ohne = modell.rollen.filter(function (r) { return !r.politischesMandat && r.aktuell; })[0];
  var mit = modell.rollen.filter(function (r) { return r.politischesMandat && r.aktuell; })[0];
  assert.strictEqual(N.rolleSichtbar(ohne, f), false);
  assert.strictEqual(N.rolleSichtbar(mit, f), true);
});

test('Parteifilter greift', function () {
  var f = N.standardFilter();
  f.partei = 'SP';
  var sp = modell.rollen.filter(function (r) { return r.parteien.indexOf('SP') !== -1 && r.aktuell; });
  assert.ok(sp.length > 0);
  assert.strictEqual(N.rolleSichtbar(sp[0], f), true);
  var andere = modell.rollen.filter(function (r) { return r.parteien.indexOf('SP') === -1 && r.aktuell; })[0];
  assert.strictEqual(N.rolleSichtbar(andere, f), false);
});

test('Rollenartfilter greift', function () {
  var f = N.standardFilter();
  f.rollenart = 'presidency';
  var praesidium = modell.rollen.filter(function (r) { return r.rollenart === 'presidency' && r.aktuell; })[0];
  var andere = modell.rollen.filter(function (r) { return r.rollenart !== 'presidency' && r.aktuell; })[0];
  assert.strictEqual(N.rolleSichtbar(praesidium, f), true);
  assert.strictEqual(N.rolleSichtbar(andere, f), false);
});

test('Verifizierungsfilter trennt offene von verifizierten Rollen', function () {
  var f = N.standardFilter();
  f.verifizierung = 'offen';
  var offen = modell.rollen.filter(function (r) { return !r.verifiziert && r.aktuell; })[0];
  var fest = modell.rollen.filter(function (r) { return r.verifiziert && r.aktuell; })[0];
  assert.strictEqual(N.rolleSichtbar(offen, f), true);
  assert.strictEqual(N.rolleSichtbar(fest, f), false);
  f.verifizierung = 'verifiziert';
  assert.strictEqual(N.rolleSichtbar(offen, f), false);
  assert.strictEqual(N.rolleSichtbar(fest, f), true);
});

test('Verbindungstypfilter greift', function () {
  var f = N.standardFilter();
  f.ebenen.hinweis = true;
  f.verbindungstyp = 'strukturelle_allianz';
  var netz = N.baueOrganisationsnetz(modell, f);
  netz.kanten.forEach(function (k) {
    assert.ok(k.typen.indexOf('strukturelle_allianz') !== -1, k.id);
  });
});

/* --------------------------------------------------- Personen aufklappen */

gruppe('Fuehrungspersonen einer Organisation');

test('Personen einer Organisation werden gefiltert geliefert', function () {
  var f = N.standardFilter();
  var netz = N.baueOrganisationsnetz(modell, f);
  var orgId = netz.knoten[0].id;
  var rollen = N.personenZuOrganisation(modell, orgId, f);
  assert.ok(rollen.length > 0);
  rollen.forEach(function (r) {
    assert.strictEqual(r.organisationId, orgId);
    assert.ok(r.aktuell);
  });
});

test('unbekannte Organisation liefert eine leere Liste', function () {
  assert.deepStrictEqual(N.personenZuOrganisation(modell, 'NGO-9999', N.standardFilter()), []);
});

test('Suche findet Organisationen und Personen', function () {
  assert.ok(N.sucheKnoten(modell, 'Alliance').length >= 1);
  assert.ok(N.sucheKnoten(modell, 'gnehm').length >= 1);
  assert.strictEqual(N.sucheKnoten(modell, '   ').length, 0);
});

console.log('\n' + bestanden + ' bestanden, ' + fehlgeschlagen + ' fehlgeschlagen');
process.exit(fehlgeschlagen ? 1 : 0);
