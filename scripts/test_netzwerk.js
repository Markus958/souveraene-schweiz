/*
 * Tests fuer die Datenaufbereitung der Netzwerk-Vorschau.
 * Aufruf:  node scripts/test_netzwerk.js
 *
 * Ohne Test-Framework, passend zu den uebrigen Node-Skripten im Repository.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var assert = require('assert');

var N = require(path.join(__dirname, '..', 'assets', 'netzwerk', 'netzwerk-daten.js'));
var CSV_PFAD = path.join(__dirname, '..', 'assets', 'data', 'netzwerk-verflechtungen.csv');
var META_PFAD = path.join(__dirname, '..', 'assets', 'data', 'netzwerk-verflechtungen-meta.json');

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

function gruppe(titel) { console.log('\n' + titel); }

/* --------------------------------------------------------- CSV-Auswertung - */

gruppe('CSV-Auswertung');

test('Trennzeichen ; wird erkannt', function () {
  assert.strictEqual(N.erkenneTrennzeichen('Person;NGO-ID;Organisation'), ';');
});

test('Trennzeichen , wird erkannt', function () {
  assert.strictEqual(N.erkenneTrennzeichen('Person,NGO-ID,Organisation'), ',');
});

test('BOM am Dateianfang wird entfernt', function () {
  var zeilen = N.zerlegeCsv('﻿Person;NGO-ID\nA;NGO-1');
  assert.strictEqual(zeilen[0][0], 'Person');
});

test('Anfuehrungszeichen, eingebettetes Trennzeichen und CRLF', function () {
  var zeilen = N.zerlegeCsv('a;b\r\n"Muster; Anna";"NGO-1"\r\n');
  assert.deepStrictEqual(zeilen[1], ['Muster; Anna', 'NGO-1']);
});

test('verdoppelte Anfuehrungszeichen werden entwertet', function () {
  var zeilen = N.zerlegeCsv('a\n"Sie sagte ""Ja"""');
  assert.strictEqual(zeilen[1][0], 'Sie sagte "Ja"');
});

test('Leerzeilen werden uebersprungen', function () {
  var saetze = N.leseCsv('Person;NGO-ID;Organisation\n\nA;NGO-1;Alpha\n\n');
  assert.strictEqual(saetze.length, 1);
});

test('Umlaute und Sonderzeichen bleiben erhalten', function () {
  var saetze = N.leseCsv('Person;NGO-ID;Organisation\nJürg Müller-Schäfer;NGO-1;Ärzte für Zürich & Co.');
  assert.strictEqual(saetze[0].person, 'Jürg Müller-Schäfer');
  assert.strictEqual(saetze[0].organisation, 'Ärzte für Zürich & Co.');
});

test('Spaltenreihenfolge ist egal, Kopfzeile entscheidet', function () {
  var saetze = N.leseCsv('Organisation;Datenstand;NGO-ID;Person\nAlpha;09.08.2026;NGO-1;A');
  assert.strictEqual(saetze[0].person, 'A');
  assert.strictEqual(saetze[0].ngoId, 'NGO-1');
  assert.strictEqual(saetze[0].datenstand, '09.08.2026');
});

test('Originalformat: Komma, Anfuehrungszeichen, "Anzahl verbundene Organisationen"', function () {
  var saetze = N.leseCsv(
    '"Person","NGO-ID","Organisation","Anzahl verbundene Organisationen","Datenstand"\n' +
    '"Beat Imhof","NGO-0058","SAV","3","09.08.2026"'
  );
  assert.strictEqual(saetze.length, 1);
  assert.strictEqual(saetze[0].person, 'Beat Imhof');
  assert.strictEqual(saetze[0].organisation, 'SAV');
  assert.strictEqual(saetze[0].anzahl, 3);
  assert.strictEqual(saetze[0].datenstand, '09.08.2026');
});

test('abweichend formulierte Anzahl-Spalte wird ueber den Praefix erkannt', function () {
  var saetze = N.leseCsv('Person;NGO-ID;Organisation;Anzahl Organisationen\nA;NGO-1;Alpha;2');
  assert.strictEqual(saetze[0].anzahl, 2);
});

test('fehlende Pflichtspalte wirft einen Fehler', function () {
  assert.throws(function () { N.leseCsv('Person;Organisation\nA;Alpha'); }, /NGO-ID|ngoId/i);
});

test('unvollstaendige Zeilen werden verworfen', function () {
  var saetze = N.leseCsv('Person;NGO-ID;Organisation\nA;;Alpha\n;NGO-2;Beta\nB;NGO-3;Gamma');
  assert.strictEqual(saetze.length, 1);
  assert.strictEqual(saetze[0].person, 'B');
});

test('doppelte Zeilen erzeugen keine doppelte Zuordnung', function () {
  var d = N.baueDatensatz(N.leseCsv('Person;NGO-ID;Organisation\nA;NGO-1;Alpha\nA;NGO-1;Alpha'));
  assert.deepStrictEqual(d.personen['A'].organisationen, ['NGO-1']);
  assert.deepStrictEqual(d.organisationen['NGO-1'].personen, ['A']);
});

test('juengster Datenstand wird uebernommen', function () {
  var d = N.baueDatensatz(N.leseCsv(
    'Person;NGO-ID;Organisation;Datenstand\nA;NGO-1;Alpha;01.01.2026\nB;NGO-2;Beta;09.08.2026'
  ));
  assert.strictEqual(d.datenstand, '09.08.2026');
});

/* ------------------------------------------------------ Verbindungsbildung - */

gruppe('Verbindungsbildung');

var MINI =
  'Person;NGO-ID;Organisation;Anzahl verbundener Organisationen;Datenstand\n' +
  'Anna;NGO-1;Alpha;2;09.08.2026\n' +
  'Anna;NGO-2;Beta;2;09.08.2026\n' +
  'Bea;NGO-1;Alpha;2;09.08.2026\n' +
  'Bea;NGO-2;Beta;2;09.08.2026\n' +
  'Cem;NGO-2;Beta;2;09.08.2026\n' +
  'Cem;NGO-3;Gamma;2;09.08.2026\n' +
  'Dan;NGO-4;Delta;2;09.08.2026\n' +
  'Dan;NGO-5;Epsilon;2;09.08.2026\n';

test('gemeinsame Person erzeugt genau eine Organisationskante', function () {
  var m = N.baueModell(MINI);
  var kante = m.organisationsnetz.kanten.filter(function (k) { return k.id === 'NGO-1|NGO-2'; });
  assert.strictEqual(kante.length, 1);
});

test('mehrere gemeinsame Personen stehen an derselben Kante', function () {
  var m = N.baueModell(MINI);
  var kante = m.organisationsnetz.kanten.filter(function (k) { return k.id === 'NGO-1|NGO-2'; })[0];
  assert.deepStrictEqual(kante.personen, ['Anna', 'Bea']);
});

test('keine Kante ohne gemeinsame Person', function () {
  var m = N.baueModell(MINI);
  var ids = m.organisationsnetz.kanten.map(function (k) { return k.id; });
  assert.strictEqual(ids.indexOf('NGO-1|NGO-3'), -1);
});

test('Person mit nur einer Organisation erzeugt keine Kante', function () {
  var m = N.baueModell('Person;NGO-ID;Organisation\nSolo;NGO-9;Neun\n');
  assert.strictEqual(m.organisationsnetz.kanten.length, 0);
});

test('bipartites Netz verbindet Person nur mit erfassten Organisationen', function () {
  var m = N.baueModell(MINI);
  var kantenVonCem = m.bipartitesNetz.kanten.filter(function (k) { return k.quelle === 'per:Cem'; });
  assert.deepStrictEqual(kantenVonCem.map(function (k) { return k.ziel; }).sort(), ['org:NGO-2', 'org:NGO-3']);
});

test('bipartites Netz hat beide Knotentypen', function () {
  var m = N.baueModell(MINI);
  var typen = {};
  m.bipartitesNetz.knoten.forEach(function (k) { typen[k.typ] = (typen[k.typ] || 0) + 1; });
  assert.strictEqual(typen.organisation, 5);
  assert.strictEqual(typen.person, 4);
});

test('Ergebnis ist unabhaengig von der Zeilenreihenfolge', function () {
  var zeilen = MINI.trim().split('\n');
  var kopf = zeilen.shift();
  var gedreht = kopf + '\n' + zeilen.reverse().join('\n') + '\n';
  var a = N.baueModell(MINI);
  var b = N.baueModell(gedreht);
  assert.deepStrictEqual(
    a.organisationsnetz.kanten.map(function (k) { return k.id + ':' + k.personen.join(','); }),
    b.organisationsnetz.kanten.map(function (k) { return k.id + ':' + k.personen.join(','); })
  );
});

/* ---------------------------------------------------------- Teilnetze ----- */

gruppe('Teilnetze und Filterlogik');

test('getrennte Gruppen ergeben getrennte Teilnetze', function () {
  var m = N.baueModell(MINI);
  assert.strictEqual(m.teilnetze.length, 2);
});

test('Teilnetze sind absteigend nach Groesse nummeriert', function () {
  var m = N.baueModell(MINI);
  assert.strictEqual(m.teilnetze[0].groesse, 3);
  assert.strictEqual(m.teilnetze[1].groesse, 2);
});

test('Filter liefert nur Knoten des gewaehlten Teilnetzes', function () {
  var m = N.baueModell(MINI);
  var g = N.filtereNachTeilnetz(m.organisationsnetz, m.datensatz, m.zuTeilnetz, 2);
  assert.deepStrictEqual(g.knoten.map(function (k) { return k.id; }), ['NGO-4', 'NGO-5']);
  assert.strictEqual(g.kanten.length, 1);
});

test('Filter 0 liefert das vollstaendige Netz', function () {
  var m = N.baueModell(MINI);
  var g = N.filtereNachTeilnetz(m.organisationsnetz, m.datensatz, m.zuTeilnetz, 0);
  assert.strictEqual(g.knoten.length, m.organisationsnetz.knoten.length);
  assert.strictEqual(g.kanten.length, m.organisationsnetz.kanten.length);
});

test('Filter schneidet im bipartiten Netz keine Kante ab', function () {
  var m = N.baueModell(MINI);
  var g = N.filtereNachTeilnetz(m.bipartitesNetz, m.datensatz, m.zuTeilnetz, 1);
  var vorhanden = {};
  g.knoten.forEach(function (k) { vorhanden[k.id] = true; });
  g.kanten.forEach(function (k) {
    assert.ok(vorhanden[k.quelle] && vorhanden[k.ziel], 'Kante zeigt aus dem Teilnetz heraus: ' + k.id);
  });
  assert.strictEqual(g.knoten.length, 6); // 3 Organisationen + 3 Personen
});

test('Personen werden dem Teilnetz ihrer Organisationen zugeordnet', function () {
  var m = N.baueModell(MINI);
  var dan = m.bipartitesNetz.knoten.filter(function (k) { return k.id === 'per:Dan'; })[0];
  assert.strictEqual(N.teilnetzVonKnoten(dan, m.datensatz, m.zuTeilnetz), 2);
});

test('Suche findet Person und Organisation, unabhaengig von Gross-/Kleinschreibung', function () {
  var m = N.baueModell(MINI);
  assert.strictEqual(N.sucheKnoten(m.bipartitesNetz, 'anna').length, 1);
  assert.strictEqual(N.sucheKnoten(m.organisationsnetz, 'BETA').length, 1);
});

test('Suche findet ueber die NGO-ID', function () {
  var m = N.baueModell(MINI);
  assert.strictEqual(N.sucheKnoten(m.organisationsnetz, 'ngo-3').length, 1);
});

test('leere Suche liefert keine Treffer', function () {
  var m = N.baueModell(MINI);
  assert.strictEqual(N.sucheKnoten(m.organisationsnetz, '   ').length, 0);
});

test('Nachbarn werden alphabetisch und vollstaendig geliefert', function () {
  var m = N.baueModell(MINI);
  var n = N.nachbarn(m.organisationsnetz, 'NGO-2');
  assert.deepStrictEqual(n.map(function (t) { return t.knoten.name; }), ['Alpha', 'Gamma']);
});

/* ------------------------------------------------ Echte Datengrundlage ---- */

gruppe('Datengrundlage assets/data/netzwerk-verflechtungen.csv');

var csvText = fs.readFileSync(CSV_PFAD, 'utf8');
var meta = JSON.parse(fs.readFileSync(META_PFAD, 'utf8'));
var modell = N.baueModell(csvText);
var k = modell.kennzahlen;

test('46 Organisationen mit mindestens einer Personenbruecke', function () {
  assert.strictEqual(k.organisationenMitBruecke, 46);
});

test('35 Brueckenpersonen', function () {
  assert.strictEqual(k.brueckenpersonen, 35);
});

test('38 direkt verbundene Organisationspaare', function () {
  assert.strictEqual(k.organisationspaare, 38);
});

test('11 getrennte Teilnetze', function () {
  assert.strictEqual(k.teilnetze, 11);
});

test('Datenstand 09.08.2026', function () {
  assert.strictEqual(k.datenstand, '09.08.2026');
});

test('Meta-Angabe: 100 untersuchte Organisationen', function () {
  assert.strictEqual(meta.untersuchteOrganisationen, 100);
});

test('Meta-Datenstand stimmt mit der CSV ueberein', function () {
  assert.strictEqual(meta.datenstand, k.datenstand);
});

test('Spalte "Anzahl verbundener Organisationen" deckt sich mit den Daten', function () {
  modell.datensatz.personenSortiert.forEach(function (name) {
    var p = modell.datensatz.personen[name];
    if (p.anzahlLautCsv !== null && !isNaN(p.anzahlLautCsv)) {
      assert.strictEqual(
        p.organisationen.length, p.anzahlLautCsv,
        name + ': ' + p.organisationen.length + ' erfasst, ' + p.anzahlLautCsv + ' laut CSV'
      );
    }
  });
});

test('jede Organisation traegt einen nicht leeren Namen', function () {
  modell.datensatz.organisationenSortiert.forEach(function (id) {
    assert.ok(modell.datensatz.organisationen[id].name.length > 0, id + ' ohne Namen');
  });
});

test('jede NGO-ID hat genau einen Organisationsnamen', function () {
  var saetze = N.leseCsv(csvText);
  var namen = {};
  saetze.forEach(function (s) {
    (namen[s.ngoId] = namen[s.ngoId] || {})[s.organisation] = true;
  });
  Object.keys(namen).forEach(function (id) {
    assert.strictEqual(Object.keys(namen[id]).length, 1, id + ' hat mehrere Namen');
  });
});

test('Summe der Teilnetz-Groessen entspricht der Organisationszahl', function () {
  var summe = modell.teilnetze.reduce(function (a, t) { return a + t.groesse; }, 0);
  assert.strictEqual(summe, k.organisationenMitBruecke);
});

test('jede Organisationskante hat mindestens eine verbindende Person', function () {
  modell.organisationsnetz.kanten.forEach(function (kante) {
    assert.ok(kante.personen.length >= 1, kante.id + ' ohne Person');
  });
});

test('bipartite Kantenzahl entspricht der Zahl der CSV-Zuordnungen', function () {
  var saetze = N.leseCsv(csvText);
  var eindeutig = {};
  saetze.forEach(function (s) { eindeutig[s.person + '|' + s.ngoId] = true; });
  assert.strictEqual(modell.bipartitesNetz.kanten.length, Object.keys(eindeutig).length);
});

console.log('\n' + bestanden + ' bestanden, ' + fehlgeschlagen + ' fehlgeschlagen');
process.exit(fehlgeschlagen ? 1 : 0);
