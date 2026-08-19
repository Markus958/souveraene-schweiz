/*
 * Tests der Datenschicht des NGO-Netzwerks (Datenstand 3.7.1).
 *
 * Geprueft werden die Abnahmepunkte aus dem Auftrag, die Kanonisierung der
 * Personennamen und die Nachrechnung der AP29-Projektion.
 *
 * Aufruf:  node scripts/test_ngo_netz.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var assert = require('assert');

var WURZEL = path.join(__dirname, '..');
var N = require(path.join(WURZEL, 'assets', 'ngo', 'ngo-netz-daten.js'));
var DATEI = path.join(WURZEL, 'assets', 'ngo', 'ngo-netzwerk.json');

var bestanden = 0, fehlgeschlagen = 0;

function test(name, fn) {
  try { fn(); bestanden++; console.log('  ok   ' + name); }
  catch (e) { fehlgeschlagen++; console.log('  FEHL ' + name + '\n       ' + e.message); }
}
function gruppe(t) { console.log('\n' + t); }

var daten = JSON.parse(fs.readFileSync(DATEI, 'utf8'));
var modell = N.baueModell(daten);
// Erwartungen aus den Daten. Fest verdrahtet bleiben nur die Werte, die der
// Auftrag CLAUDE_CODE_HANDOFF.md als Abnahme vorgibt.
var Z = daten.meta.zahlen;
// Erwartungen aus den Daten. Fest verdrahtet bleiben nur die Werte, die der
// Auftrag CLAUDE_CODE_HANDOFF.md als Abnahme vorgibt.
var Z = daten.meta.zahlen;

/* ------------------------------------------------------------- Abnahme --- */

gruppe('Abnahme nach Auftrag Abschnitt 7');

test('342 Organisationen (Abnahme)', function () {
  assert.strictEqual(modell.organisationen.length, 342);
});

test('die gesperrte Kennung NGO-0172 kommt nirgends vor', function () {
  assert.ok(!modell.orgNachId['NGO-0172'], 'NGO-0172 als Organisation vorhanden');
  modell.kanten.concat(modell.historie).forEach(function (k) {
    assert.notStrictEqual(k.organisation.id, 'NGO-0172', k.id);
    if (k.gegenpart) assert.notStrictEqual(k.gegenpart.id, 'NGO-0172', k.id);
  });
});

test('4347 aktuelle Beziehungen (Abnahme)', function () {
  assert.strictEqual(modell.kanten.length, 4347);
});

test('97 fruehere Beziehungen, getrennt gefuehrt (Abnahme)', function () {
  assert.strictEqual(modell.historie.length, 97);
  modell.historie.forEach(function (k) { assert.strictEqual(k.historisch, true); });
  modell.kanten.forEach(function (k) { assert.strictEqual(k.historisch, false); });
});

test('G3-Beziehungen entsprechen dem Datenstand', function () {
  var g3 = modell.kanten.filter(function (k) { return N.G3_KLASSEN.indexOf(k.klasse) !== -1; });
  assert.strictEqual(g3.length, Z.kantenG3);
});

test('Standardansicht ist G3 und enthaelt keine N4-Kante', function () {
  var filter = N.standardFilter();
  assert.strictEqual(filter.ansicht, 'G3');
  assert.strictEqual(filter.klassen.N4, false);
  var sichtbar = modell.kanten.filter(function (k) { return N.kanteSichtbar(k, filter); });
  assert.strictEqual(sichtbar.length, Z.kantenG3);
  assert.strictEqual(sichtbar.filter(function (k) { return k.klasse === 'N4'; }).length, 0);
});

test('N4 bleibt auch bei angehaktem Kaestchen aus, solange G3 gewaehlt ist', function () {
  var filter = N.standardFilter();
  filter.klassen.N4 = true;
  var sichtbar = modell.kanten.filter(function (k) { return N.kanteSichtbar(k, filter); });
  assert.strictEqual(sichtbar.filter(function (k) { return k.klasse === 'N4'; }).length, 0);
});

test('G2 ergaenzt N4 auf den vollen Bestand', function () {
  var filter = N.standardFilter();
  filter.ansicht = 'G2';
  filter.klassen.N4 = true;
  var sichtbar = modell.kanten.filter(function (k) { return N.kanteSichtbar(k, filter); });
  assert.strictEqual(sichtbar.length, Z.kanten);
  assert.strictEqual(sichtbar.filter(function (k) { return k.klasse === 'N4'; }).length,
    Z.kanten - Z.kantenG3);
});

test('keine Kante ohne Organisation, Rohperson, Beziehungsklasse und Quelle', function () {
  var unvollstaendig = modell.kanten.filter(function (k) {
    return !k.organisation || !k.organisation.id || !k.rohPersonId || !k.klasse || !k.quelle;
  });
  assert.strictEqual(unvollstaendig.length, 0,
    unvollstaendig.length + ' unvollstaendige Kanten, erste: ' +
    (unvollstaendig[0] && unvollstaendig[0].id));
});

test('Abdeckungsluecken bleiben als Organisation erhalten', function () {
  var luecken = modell.organisationen.filter(function (o) { return o.abdeckungsluecke; });
  assert.strictEqual(luecken.length, Z.abdeckungsluecken);
});

test('Abdeckungsluecken sind in der Standardansicht als Knoten sichtbar', function () {
  var netz = N.baueOrganisationsnetz(modell, N.standardFilter());
  var ids = {};
  netz.knoten.forEach(function (k) { ids[k.id] = true; });
  modell.organisationen.forEach(function (o) {
    if (o.abdeckungsluecke) assert.ok(ids[o.id], o.name + ' fehlt in der Ansicht');
  });
});

test('Abdeckungsluecken sind als solche markiert, nicht als unvernetzt', function () {
  var netz = N.baueOrganisationsnetz(modell, N.standardFilter());
  var luecken = netz.knoten.filter(function (k) { return k.abdeckungsluecke; });
  assert.ok(luecken.length >= 8);
  assert.ok(/Abdeckungslücke/.test(modell.meta.hinweise.abdeckungsluecke));
  assert.ok(/kein Nachweis fehlender Vernetzung/.test(modell.meta.hinweise.abdeckungsluecke));
});

test('Liste der zusammengefuehrten Namensvarianten liegt bei', function () {
  assert.strictEqual(modell.variantengruppen.length, Z.variantengruppen);
  modell.variantengruppen.forEach(function (g) {
    assert.ok(g.varianten.length > 1, 'Gruppe ohne Variante: ' + g.schluessel);
  });
});

/* -------------------------------------------------------- Kanonisierung -- */

gruppe('Kanonisierung der Personennamen');

test('3192 Rohpersonen werden kanonisiert (Abnahme)', function () {
  assert.strictEqual(modell.kennzahlen.rohpersonen, 3192);
  assert.strictEqual(modell.kennzahlen.personen, Z.personen);
  assert.ok(modell.kennzahlen.personen < modell.kennzahlen.rohpersonen);
});

test('Reihenfolge und Interpunktion spielen keine Rolle', function () {
  var a = N.canonicalPersonKey('Masshardt Nadine');
  assert.strictEqual(a, N.canonicalPersonKey('Nadine Masshardt'));
  assert.strictEqual(a, N.canonicalPersonKey('  masshardt,  nadine '));
  assert.strictEqual(N.canonicalPersonKey('Jean-Pierre Muster'),
                     N.canonicalPersonKey('Muster Jean Pierre'));
});

test('kein Fuzzy-Matching: aehnliche Namen bleiben getrennt', function () {
  assert.notStrictEqual(N.canonicalPersonKey('Meier Hans'), N.canonicalPersonKey('Meyer Hans'));
  assert.notStrictEqual(N.canonicalPersonKey('Müller Anna'), N.canonicalPersonKey('Mueller Anna'));
  assert.notStrictEqual(N.canonicalPersonKey('Marti Beat'), N.canonicalPersonKey('Marty Beat'));
});

test('die Schluessel der Datei stimmen mit der JS-Kanonisierung ueberein', function () {
  modell.personen.forEach(function (p) {
    p.varianten.forEach(function (v) {
      assert.strictEqual(N.canonicalPersonKey(v), p.schluessel,
        'Variante «' + v + '» ergibt nicht ' + p.schluessel);
    });
  });
});

test('Originalwerte bleiben erhalten', function () {
  modell.kanten.forEach(function (k) {
    assert.ok(k.rohPersonId.indexOf('PERS:') === 0, 'keine Roh-ID: ' + k.id);
    assert.ok(k.anzeige.length > 0, 'kein person_display: ' + k.id);
  });
  var mitVarianten = modell.personen.filter(function (p) { return p.varianten.length > 1; });
  assert.strictEqual(mitVarianten.length, Z.variantengruppen);
});

/* ----------------------------------------------------------- Projektion -- */

gruppe('Projektion G2 und G3');

function projektionAus(filter) {
  var kanten = modell.kanten.filter(function (k) { return N.kanteSichtbar(k, filter); });
  return N.projiziere(kanten).paare;
}

test('G2-Projektion entspricht der im Build gerechneten', function () {
  var filter = N.standardFilter();
  filter.ansicht = 'G2';
  filter.klassen.N4 = true;
  var paare = projektionAus(filter);
  assert.strictEqual(Object.keys(paare).length, Z.projektionG2);
});

test('JS-Projektion stimmt mit der im Build gerechneten ueberein', function () {
  [['g3', N.standardFilter()], ['g2', (function () {
    var f = N.standardFilter(); f.ansicht = 'G2'; f.klassen.N4 = true; return f;
  })()]].forEach(function (fall) {
    var paare = projektionAus(fall[1]);
    var geliefert = modell.projektionGeliefert[fall[0]];
    assert.strictEqual(Object.keys(paare).length, geliefert.length, fall[0] + ': Kantenzahl');
    geliefert.forEach(function (g) {
      var eigen = paare[g.a + ':' + g.b] || paare[g.b + ':' + g.a];
      assert.ok(eigen, fall[0] + ': Kante ' + g.a + '/' + g.b + ' fehlt');
      assert.strictEqual(eigen.gewicht, g.gewicht, fall[0] + ': Gewicht ' + g.a + '/' + g.b);
      assert.strictEqual(eigen.direkt, g.direkt, fall[0] + ': Art ' + g.a + '/' + g.b);
      assert.strictEqual(eigen.personen.length, g.personen.length,
        fall[0] + ': Personenzahl ' + g.a + '/' + g.b);
    });
  });
});

test('direkte und ueber Personen abgeleitete Kanten sind unterscheidbar', function () {
  var netz = N.baueOrganisationsnetz(modell, N.standardFilter());
  var arten = {};
  netz.kanten.forEach(function (k) { arten[k.art] = (arten[k.art] || 0) + 1; });
  assert.ok(arten.direkt > 0, 'keine direkte Kante gefunden');
  assert.ok(arten.personen > 0, 'keine ueber Personen abgeleitete Kante gefunden');
  netz.kanten.forEach(function (k) {
    assert.ok(['direkt', 'personen', 'beides'].indexOf(k.art) !== -1, 'unbekannte Art ' + k.art);
  });
});

test('Brueckenfunktion stimmt mit der im Build gerechneten ueberein', function () {
  var filter = N.standardFilter();
  filter.ansicht = 'G2';
  filter.klassen.N4 = true;
  var netz = N.baueOrganisationsnetz(modell, filter);
  var geprueft = 0;
  netz.knoten.forEach(function (k) {
    if (!k.organisation) return;
    assert.strictEqual(k.zentralitaet, k.organisation.brueckenpersonen,
      k.vollname + ': Ansicht ' + k.zentralitaet + ', Build ' + k.organisation.brueckenpersonen);
    geprueft += 1;
  });
  assert.ok(geprueft > 100, 'nur ' + geprueft + ' Knoten geprueft');
});

/* --------------------------------------------------------------- Filter -- */

gruppe('Filter, Historie und Suche');

test('Filter Obergruppe wirkt', function () {
  var filter = N.standardFilter();
  filter.obergruppe = 'Wirtschafts- und Berufsverbände';
  var netz = N.baueOrganisationsnetz(modell, filter);
  assert.ok(netz.knoten.length > 0);
  netz.knoten.forEach(function (k) {
    assert.strictEqual(k.organisation.obergruppe, 'Wirtschafts- und Berufsverbände');
  });
});

test('Filter Cluster wirkt und kennt alle Cluster des Stands', function () {
  assert.strictEqual(modell.clusterListe.length, Z.cluster);
  var filter = N.standardFilter();
  filter.cluster = modell.clusterListe[0].id;
  var netz = N.baueOrganisationsnetz(modell, filter);
  assert.ok(netz.knoten.length > 0);
  netz.knoten.forEach(function (k) {
    assert.strictEqual(String(k.organisation.cluster), String(filter.cluster));
  });
});

test('Filter Partei wirkt auf Personen, nicht auf Organisationen', function () {
  var filter = N.standardFilter();
  filter.partei = 'SP';
  var sichtbar = modell.kanten.filter(function (k) { return N.kanteSichtbar(k, filter); });
  assert.ok(sichtbar.length > 0);
  sichtbar.forEach(function (k) { assert.strictEqual(k.partei, 'SP'); });
  // Organisationen tragen selbst keine Partei
  modell.organisationen.forEach(function (o) {
    assert.strictEqual(o.partei, undefined);
  });
  assert.ok(/keine Parteizugehörigkeit der Organisation/.test(modell.meta.hinweise.partei));
});

test('Filter N1-N4 wirkt einzeln', function () {
  var filter = N.standardFilter();
  filter.klassen = { N1: true, N2: false, N3: false, N4: false };
  var sichtbar = modell.kanten.filter(function (k) { return N.kanteSichtbar(k, filter); });
  var n1 = modell.kanten.filter(function (k) { return k.klasse === 'N1'; }).length;
  assert.strictEqual(sichtbar.length, n1);
  assert.ok(n1 > 0 && n1 < modell.kanten.length);
});

test('Historienmodus ist getrennt und mischt nie aktuelle Beziehungen dazu', function () {
  var filter = N.standardFilter();
  filter.historie = true;
  var netz = N.baueNetz(modell, filter);
  assert.strictEqual(netz.historie, true);
  assert.strictEqual(netz.beziehungen, Z.historie);
  assert.strictEqual(netz.kanten.length, Z.historie);
  netz.knoten.forEach(function (k) { assert.strictEqual(k.historisch, true); });
  // Keine gezeichnete Linie darf aus dem aktuellen Bestand stammen.
  var aktuelle = {};
  modell.kanten.forEach(function (k) { aktuelle['h:' + k.id] = true; });
  netz.kanten.forEach(function (k) {
    assert.ok(!aktuelle[k.id], 'aktuelle Beziehung im Historiennetz: ' + k.id);
    assert.strictEqual(k.historisch, true);
  });
});

test('Suche findet Organisation und Person', function () {
  var treffer = N.sucheKnoten(modell, 'LITRA');
  assert.ok(treffer.some(function (t) { return t.typ === 'organisation'; }));
  var person = N.sucheKnoten(modell, 'Masshardt');
  assert.ok(person.some(function (t) { return t.typ === 'person'; }));
});

test('Suche findet auch die umgedrehte Namensreihenfolge', function () {
  var a = N.sucheKnoten(modell, 'Nadine Masshardt').filter(function (t) { return t.typ === 'person'; });
  var b = N.sucheKnoten(modell, 'Masshardt Nadine').filter(function (t) { return t.typ === 'person'; });
  assert.ok(a.length > 0 && b.length > 0);
  assert.strictEqual(a[0].person.schluessel, b[0].person.schluessel);
});

test('Personendetail listet die Organisationen der kanonischen Person', function () {
  var filter = N.standardFilter();
  filter.ansicht = 'G2';
  filter.klassen.N4 = true;
  // Person mit den meisten Organisationen nehmen, unabhaengig vom Datenstand.
  var spitze = N.personenUebersicht(modell, filter)[0];
  var kanten = N.organisationenZuPerson(modell, spitze.person.index, filter);
  var orgs = {};
  kanten.forEach(function (k) { orgs[k.organisation.id] = true; });
  assert.strictEqual(Object.keys(orgs).length, spitze.anzahlOrganisationen);
  assert.ok(spitze.anzahlOrganisationen >= 3);
});

/* ---------------------------------------------------------- Quellen ------ */

gruppe('Quellenanzeige nach Auftrag Abschnitt 8');

test('Quellenverzeichnis enthaelt alle belegten Quellen', function () {
  assert.strictEqual(modell.quellen.length, Z.quellen);
});

test('jede Beziehung hat mindestens einen aufgeloesten Beleg', function () {
  var ohne = modell.kanten.filter(function (k) { return !k.quellen.length; });
  assert.strictEqual(ohne.length, 0, ohne.length + ' Kanten ohne Beleg');
});

test('keine Kante mit unaufloesbarer Quellenkennung', function () {
  var fehlend = modell.kanten.filter(function (k) { return k.quellenFehlend.length; });
  assert.strictEqual(fehlend.length, 0);
});

test('mehrfach angegebene Quellen werden einzeln aufgeloest', function () {
  var mehrere = modell.kanten.filter(function (k) { return k.quellen.length > 1; });
  assert.ok(mehrere.length > 100, mehrere.length + ' Kanten mit mehreren Quellen');
  mehrere.forEach(function (k) {
    assert.strictEqual(k.quelle.split(';').length, k.quellen.length,
      'Kante ' + k.id + ': Rohangabe und aufgeloeste Belege passen nicht zusammen');
  });
});

test('kein Beleg zeigt nur die interne Kennung', function () {
  var luecken = 0;
  modell.quellen.forEach(function (q) {
    assert.notStrictEqual(N.quellenTitel(q), q.id,
      'Quelle ' + q.id + ' hat nur die interne Kennung als Anzeige');
    if (q.luecke) {
      luecken += 1;
      // Reference-only: die Luecke wird benannt, nicht kaschiert.
      assert.ok(/noch nicht erfasst/.test(N.quellenTitel(q)), N.quellenTitel(q));
      assert.strictEqual(q.url, '', 'ausgewiesene Luecke mit URL: ' + q.id);
    } else {
      assert.ok(q.herausgeber || q.titel, 'Quelle ohne Herausgeber und Titel: ' + q.id);
    }
  });
  assert.ok(luecken > 0, 'keine Reference-only-Quelle erkannt');
});

test('Anzeigetitel faellt ohne Titel auf Herausgeber und Quellentyp zurueck', function () {
  assert.strictEqual(N.quellenTitel({ id: 'Q-X', titel: '', herausgeber: 'Bund', typ: 'Register' }),
    'Bund — Register');
  assert.strictEqual(N.quellenTitel({ id: 'Q-X', titel: 'Jahresbericht', herausgeber: 'Bund' }),
    'Jahresbericht');
});

test('kein Link wird erfunden, wenn keine URL vorliegt', function () {
  var ohneUrl = modell.quellen.filter(function (q) { return !q.url; });
  assert.strictEqual(ohneUrl.length, Z.quellenOhneUrl);
  ohneUrl.forEach(function (q) {
    assert.strictEqual(q.url, '');
    assert.ok(q.herausgeber || q.titel || q.luecke,
      'weder bibliografische Angabe noch ausgewiesene Luecke bei ' + q.id);
  });
});

test('URLs sind echte Web-Adressen', function () {
  modell.quellen.forEach(function (q) {
    if (q.url) assert.ok(/^https?:\/\//.test(q.url), 'unbrauchbare URL bei ' + q.id + ': ' + q.url);
  });
});

test('Belege einer Organisation sind nach Rang und Guete sortiert', function () {
  var mitKanten = modell.organisationen.filter(function (o) { return o.kanten > 3; })[0];
  var kanten = N.personenZuOrganisation(modell, mitKanten.id, N.standardFilter());
  var ergebnis = N.quellenZu(kanten);
  assert.ok(ergebnis.quellen.length > 0);
  var raenge = ergebnis.quellen.map(function (e) { return e.quelle.rang; });
  var ordnung = ['Amtliche Primärquelle', 'Primärquelle', 'Primär-/Sekundärabgleich', 'Sekundärquelle'];
  var werte = raenge.map(function (r) { var i = ordnung.indexOf(r); return i === -1 ? 99 : i; });
  for (var i = 1; i < werte.length; i++) {
    assert.ok(werte[i] >= werte[i - 1], 'Reihenfolge der Quellenraenge stimmt nicht');
  }
});

test('unaufloesbare Kennungen werden gemeldet statt verschwiegen', function () {
  var ergebnis = N.quellenZu([{ quellen: [], quellenFehlend: ['Q-GIBTSNICHT'] }]);
  assert.strictEqual(ergebnis.quellen.length, 0);
  assert.deepStrictEqual(ergebnis.fehlend, [{ kennung: 'Q-GIBTSNICHT', anzahl: 1 }]);
  assert.ok(/nicht gefunden/.test(modell.meta.hinweise.quelleFehlt));
});

test('Stichprobe je Guetestufe traegt eine lesbare Quellenangabe', function () {
  ['Q1', 'Q2'].forEach(function (stufe) {
    var q = modell.quellen.filter(function (x) { return x.guete === stufe; })[0];
    assert.ok(q, 'keine Quelle der Stufe ' + stufe);
    assert.ok(N.quellenTitel(q).length > 3, stufe + ': kein Titel');
    assert.ok(q.typ.length > 2, stufe + ': kein Quellentyp');
  });
});

test('Datumsangaben sind lesbar aufbereitet, keine Excel-Serienzahlen', function () {
  modell.quellen.forEach(function (q) {
    [q.datum, q.jahr, q.abgerufen].forEach(function (wert) {
      if (!wert) return;
      assert.strictEqual(/^\d{5}(\.\d+)?$/.test(wert), false,
        'unaufbereitete Serienzahl bei ' + q.id + ': ' + wert);
      assert.strictEqual(/\.0$/.test(wert), false, 'Nachkommastelle bei ' + q.id + ': ' + wert);
    });
  });
});

/* ------------------------------------------------------- Perspektiven ---- */

gruppe('Perspektive Personen');

function personenFilter(schwelle) {
  var f = N.standardFilter();
  f.perspektive = 'person';
  if (schwelle) f.personenSchwelle = schwelle;
  return f;
}

test('Standard ist die Organisationsperspektive', function () {
  assert.strictEqual(N.standardFilter().perspektive, 'organisation');
  assert.strictEqual(N.standardFilter().personenSchwelle, 2);
  assert.strictEqual(N.baueNetz(modell, N.standardFilter()).bipartit, undefined);
});

test('Personennetz ist zweiseitig und in sich stimmig', function () {
  var netz = N.baueNetz(modell, personenFilter());
  assert.strictEqual(netz.bipartit, true);
  assert.ok(netz.personen > 50, netz.personen + ' Personen');
  assert.ok(netz.organisationen > 50, netz.organisationen + ' Organisationen');
  assert.strictEqual(netz.knoten.length, netz.personen + netz.organisationen);
  assert.ok(netz.kanten.length >= netz.personen * 2);
});

test('keine Kante verbindet zwei Personen', function () {
  var netz = N.baueNetz(modell, personenFilter());
  var typ = {};
  netz.knoten.forEach(function (k) { typ[k.id] = k.typ; });
  netz.kanten.forEach(function (k) {
    var a = typ[k.quelle], b = typ[k.ziel];
    assert.ok((a === 'person' && b === 'organisation') || (a === 'organisation' && b === 'person'),
      'Kante ' + k.id + ' verbindet ' + a + ' mit ' + b);
  });
});

test('jede Kante entspricht einer erfassten Beziehung', function () {
  var netz = N.baueNetz(modell, personenFilter());
  var vorhanden = {};
  modell.kanten.forEach(function (k) {
    vorhanden[k.person.index + '|' + k.organisation.id] = true;
  });
  netz.kanten.forEach(function (k) {
    var person = k.quelle.indexOf('person:') === 0 ? k.quelle : k.ziel;
    var org = k.quelle.indexOf('person:') === 0 ? k.ziel : k.quelle;
    assert.ok(vorhanden[person.slice(7) + '|' + org], 'erfundene Kante: ' + k.id);
  });
});

test('die Schwelle wirkt und laesst sich anheben', function () {
  var zwei = N.baueNetz(modell, personenFilter(2)).personen;
  var drei = N.baueNetz(modell, personenFilter(3)).personen;
  var vier = N.baueNetz(modell, personenFilter(4)).personen;
  assert.ok(zwei > drei && drei > vier, [zwei, drei, vier].join(' > '));
  assert.ok(vier > 0);
});

test('unter der Schwelle liegende Personen sind nicht im Netz', function () {
  var netz = N.baueNetz(modell, personenFilter());
  netz.knoten.filter(function (k) { return k.typ === 'person'; }).forEach(function (k) {
    assert.ok(k.organisationen >= 2, k.name + ' hat nur ' + k.organisationen + ' Organisation');
  });
});

test('G2 nimmt die N4-Personen dazu', function () {
  var f = personenFilter();
  f.ansicht = 'G2';
  f.klassen.N4 = true;
  assert.ok(N.baueNetz(modell, f).personen >= N.baueNetz(modell, personenFilter()).personen);
});

test('Historie hat Vorrang vor der Perspektive', function () {
  var f = personenFilter();
  f.historie = true;
  var netz = N.baueNetz(modell, f);
  assert.strictEqual(netz.historie, true);
  assert.strictEqual(netz.beziehungen, Z.historie);
});

test('Personenuebersicht enthaelt auch die Personen mit einer Organisation', function () {
  var f = N.standardFilter();
  f.ansicht = 'G2';
  f.klassen.N4 = true;
  var liste = N.personenUebersicht(modell, f);
  assert.strictEqual(liste.length, Z.personen);
  assert.ok(liste[0].anzahlOrganisationen >= liste[1].anzahlOrganisationen,
    'nicht nach Organisationszahl sortiert');
  assert.ok(liste.filter(function (e) { return e.anzahlOrganisationen === 1; }).length
    > liste.length / 2);
});

test('Perspektiven sind benannt und beschrieben', function () {
  assert.strictEqual(N.PERSPEKTIVEN.organisation.titel, 'Organisationen');
  assert.strictEqual(N.PERSPEKTIVEN.person.titel, 'Personen');
  assert.ok(/keine gerechnete Nähe/.test(N.PERSPEKTIVEN.person.beschreibung));
});

/* -------------------------------------------------- Interpretationsschutz - */

gruppe('Interpretationsschutz nach Auftrag Abschnitt 6');

test('Knotengroesse ist als Netzwerkzentralitaet bezeichnet, nicht als Einfluss', function () {
  var hinweis = modell.meta.hinweise.zentralitaet;
  assert.ok(/Netzwerkzentralität|Brückenfunktion/.test(hinweis));
  assert.ok(/kein Einflussmass/.test(hinweis));
  var quelle = fs.readFileSync(path.join(WURZEL, 'assets', 'ngo', 'ngo-netz-daten.js'), 'utf8');
  assert.strictEqual(/Einflussranking/.test(quelle), false);
});

test('historische und aktuelle Angaben werden nie im selben Netz gefuehrt', function () {
  var aktuell = N.baueOrganisationsnetz(modell, N.standardFilter());
  assert.ok(!aktuell.historie);
  assert.ok(aktuell.knoten.every(function (k) { return !k.historisch; }));
});

console.log('\n' + bestanden + ' Tests bestanden, ' + fehlgeschlagen + ' fehlgeschlagen.');
process.exit(fehlgeschlagen ? 1 : 0);
