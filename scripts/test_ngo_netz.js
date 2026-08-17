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

/* ------------------------------------------------------------- Abnahme --- */

gruppe('Abnahme nach Auftrag Abschnitt 7');

test('144 Organisationen', function () {
  assert.strictEqual(modell.organisationen.length, 144);
});

test('2628 aktuelle Kanten', function () {
  assert.strictEqual(modell.kanten.length, 2628);
});

test('2404 G3-Kanten (N1-N3)', function () {
  var g3 = modell.kanten.filter(function (k) { return N.G3_KLASSEN.indexOf(k.klasse) !== -1; });
  assert.strictEqual(g3.length, 2404);
});

test('Standardansicht ist G3 und enthaelt keine N4-Kante', function () {
  var filter = N.standardFilter();
  assert.strictEqual(filter.ansicht, 'G3');
  assert.strictEqual(filter.klassen.N4, false);
  var sichtbar = modell.kanten.filter(function (k) { return N.kanteSichtbar(k, filter); });
  assert.strictEqual(sichtbar.length, 2404);
  assert.strictEqual(sichtbar.filter(function (k) { return k.klasse === 'N4'; }).length, 0);
});

test('N4 bleibt auch bei angehaktem Kaestchen aus, solange G3 gewaehlt ist', function () {
  var filter = N.standardFilter();
  filter.klassen.N4 = true;
  var sichtbar = modell.kanten.filter(function (k) { return N.kanteSichtbar(k, filter); });
  assert.strictEqual(sichtbar.filter(function (k) { return k.klasse === 'N4'; }).length, 0);
});

test('G2 ergaenzt N4 auf 2628 Kanten', function () {
  var filter = N.standardFilter();
  filter.ansicht = 'G2';
  filter.klassen.N4 = true;
  var sichtbar = modell.kanten.filter(function (k) { return N.kanteSichtbar(k, filter); });
  assert.strictEqual(sichtbar.length, 2628);
  assert.strictEqual(sichtbar.filter(function (k) { return k.klasse === 'N4'; }).length, 224);
});

test('keine Kante ohne Organisation, Rohperson, Beziehungsklasse und Quelle', function () {
  var unvollstaendig = modell.kanten.filter(function (k) {
    return !k.organisation || !k.organisation.id || !k.rohPersonId || !k.klasse || !k.quelle;
  });
  assert.strictEqual(unvollstaendig.length, 0,
    unvollstaendig.length + ' unvollstaendige Kanten, erste: ' +
    (unvollstaendig[0] && unvollstaendig[0].id));
});

test('acht Abdeckungsluecken bleiben als Organisation erhalten', function () {
  var luecken = modell.organisationen.filter(function (o) { return o.abdeckungsluecke; });
  assert.strictEqual(luecken.length, 8);
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

test('Liste der zusammengefuehrten Namensvarianten liegt bei (80 Gruppen)', function () {
  assert.strictEqual(modell.variantengruppen.length, 80);
  modell.variantengruppen.forEach(function (g) {
    assert.ok(g.varianten.length > 1, 'Gruppe ohne Variante: ' + g.schluessel);
  });
});

/* -------------------------------------------------------- Kanonisierung -- */

gruppe('Kanonisierung der Personennamen');

test('1852 Rohpersonen werden zu 1772 kanonischen Personen', function () {
  assert.strictEqual(modell.kennzahlen.rohpersonen, 1852);
  assert.strictEqual(modell.personen.length, 1772);
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
  assert.strictEqual(mitVarianten.length, 80);
});

/* ----------------------------------------------------------- Projektion -- */

gruppe('Projektion G2 und G3');

function projektionAus(filter) {
  var kanten = modell.kanten.filter(function (k) { return N.kanteSichtbar(k, filter); });
  return N.projiziere(kanten).paare;
}

test('G2 ergibt 286 Projektionskanten mit Gesamtgewicht 1074 (AP29)', function () {
  var filter = N.standardFilter();
  filter.ansicht = 'G2';
  filter.klassen.N4 = true;
  var paare = projektionAus(filter);
  var schluessel = Object.keys(paare);
  assert.strictEqual(schluessel.length, 286);
  var gewicht = schluessel.reduce(function (s, k) { return s + paare[k].gewicht; }, 0);
  assert.strictEqual(gewicht, 1074);
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

test('Brueckenpersonen des AP29-Berichts werden reproduziert', function () {
  var filter = N.standardFilter();
  filter.ansicht = 'G2';
  filter.klassen.N4 = true;
  var netz = N.baueOrganisationsnetz(modell, filter);
  var soll = { 'LITRA': 16, 'Schweizerischer Gewerbeverband sgv': 16, 'VPOD': 13,
               'Schweizer Tierschutz STS': 10, 'IG Freiheit': 7 };
  Object.keys(soll).forEach(function (name) {
    var knoten = netz.knoten.filter(function (k) { return k.vollname === name; })[0];
    assert.ok(knoten, name + ' fehlt im Netz');
    assert.strictEqual(knoten.zentralitaet, soll[name], name + ': Brueckenpersonen');
  });
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

test('Filter Cluster wirkt und kennt neun Hauptcluster', function () {
  assert.strictEqual(modell.clusterListe.length, 9);
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
  assert.strictEqual(sichtbar.length, 1558);
});

test('Historienmodus ist getrennt und mischt nie aktuelle Beziehungen dazu', function () {
  var filter = N.standardFilter();
  filter.historie = true;
  var netz = N.baueOrganisationsnetz(modell, filter);
  assert.strictEqual(netz.historie, true);
  assert.strictEqual(netz.kanten.length, 0);
  assert.ok(netz.knoten.length > 0);
  netz.knoten.forEach(function (k) {
    assert.ok(k.historisch === true);
    assert.ok(k.organisation.historischeKanten > 0);
  });
  var summe = netz.knoten.reduce(function (s, k) { return s + k.organisation.historischeKanten; }, 0);
  assert.strictEqual(summe, 59);
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
  var treffer = N.sucheKnoten(modell, 'Masshardt Nadine')
    .filter(function (t) { return t.typ === 'person'; })[0];
  var kanten = N.organisationenZuPerson(modell, treffer.person.index, filter);
  var orgs = {};
  kanten.forEach(function (k) { orgs[k.organisation.id] = true; });
  assert.strictEqual(Object.keys(orgs).length, 6, 'AP29 nennt 6 Masterorganisationen');
});

/* ---------------------------------------------------------- Quellen ------ */

gruppe('Quellenanzeige nach Auftrag Abschnitt 8');

test('Quellenverzeichnis ist vollstaendig geladen', function () {
  assert.strictEqual(modell.quellen.length, 327);
});

test('jede Kante hat mindestens einen aufgeloesten Beleg', function () {
  var ohne = modell.kanten.filter(function (k) { return !k.quellen.length; });
  assert.strictEqual(ohne.length, 0, ohne.length + ' Kanten ohne Beleg');
});

test('keine Kante mit unaufloesbarer Quellenkennung', function () {
  var fehlend = modell.kanten.filter(function (k) { return k.quellenFehlend.length; });
  assert.strictEqual(fehlend.length, 0);
});

test('mehrfach angegebene Quellen werden einzeln aufgeloest', function () {
  var mehrere = modell.kanten.filter(function (k) { return k.quellen.length > 1; });
  assert.ok(mehrere.length > 0, 'keine Kante mit mehreren Quellen gefunden');
  mehrere.forEach(function (k) {
    assert.strictEqual(k.quelle.split(';').length, k.quellen.length + k.quellenFehlend.length,
      'Kante ' + k.id + ': Rohangabe und aufgeloeste Belege passen nicht zusammen');
  });
});

test('jeder Beleg traegt Herausgeber und Titel, nicht nur die Kennung', function () {
  modell.quellen.forEach(function (q) {
    assert.ok(q.herausgeber || q.titel, 'Quelle ohne Herausgeber und Titel: ' + q.id);
    assert.notStrictEqual(N.quellenTitel(q), q.id,
      'Quelle ' + q.id + ' hat nur die interne Kennung als Anzeige');
  });
});

test('Anzeigetitel faellt ohne Titel auf Herausgeber und Quellentyp zurueck', function () {
  assert.strictEqual(N.quellenTitel({ id: 'Q-X', titel: '', herausgeber: 'Bund', typ: 'Register' }),
    'Bund — Register');
  assert.strictEqual(N.quellenTitel({ id: 'Q-X', titel: 'Jahresbericht', herausgeber: 'Bund' }),
    'Jahresbericht');
});

test('kein Link wird erfunden, wenn keine URL vorliegt', function () {
  var ohneUrl = modell.quellen.filter(function (q) { return !q.url; });
  assert.strictEqual(ohneUrl.length, 5);
  ohneUrl.forEach(function (q) {
    assert.strictEqual(q.url, '');
    assert.ok(q.herausgeber || q.titel, 'bibliografische Angabe fehlt bei ' + q.id);
  });
});

test('URLs sind echte Web-Adressen', function () {
  modell.quellen.forEach(function (q) {
    if (q.url) assert.ok(/^https?:\/\//.test(q.url), 'unbrauchbare URL bei ' + q.id + ': ' + q.url);
  });
});

test('Belege einer Organisation sind nach Rang und Guete sortiert', function () {
  var kanten = N.personenZuOrganisation(modell, 'NGO-0021', N.standardFilter());
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
    assert.ok(q.herausgeber.length > 2, stufe + ': kein Herausgeber');
    assert.ok(N.quellenTitel(q).length > 3, stufe + ': kein Titel');
    assert.ok(q.typ.length > 2, stufe + ': kein Quellentyp');
    assert.ok(q.rang.length > 2, stufe + ': kein Rang');
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

test('Personennetz ist zweiseitig: 133 Personen, 100 Organisationen, 298 Kanten', function () {
  var netz = N.baueNetz(modell, personenFilter());
  assert.strictEqual(netz.bipartit, true);
  assert.strictEqual(netz.personen, 133);
  assert.strictEqual(netz.organisationen, 100);
  assert.strictEqual(netz.kanten.length, 298);
  assert.strictEqual(netz.knoten.length, 233);
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
  assert.strictEqual(N.baueNetz(modell, personenFilter(2)).personen, 133);
  assert.strictEqual(N.baueNetz(modell, personenFilter(3)).personen, 27);
  assert.strictEqual(N.baueNetz(modell, personenFilter(4)).personen, 4);
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
  var netz = N.baueNetz(modell, f);
  assert.strictEqual(netz.personen, 157);
});

test('Historie hat Vorrang vor der Perspektive', function () {
  var f = personenFilter();
  f.historie = true;
  var netz = N.baueNetz(modell, f);
  assert.strictEqual(netz.historie, true);
  assert.strictEqual(netz.bipartit, undefined);
});

test('Personenuebersicht enthaelt auch die Personen mit einer Organisation', function () {
  var f = N.standardFilter();
  f.ansicht = 'G2';
  f.klassen.N4 = true;
  var liste = N.personenUebersicht(modell, f);
  assert.strictEqual(liste.length, 1772);
  assert.strictEqual(liste[0].anzahlOrganisationen, 6, 'nicht nach Organisationszahl sortiert');
  assert.ok(liste.filter(function (e) { return e.anzahlOrganisationen === 1; }).length > 1500);
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
