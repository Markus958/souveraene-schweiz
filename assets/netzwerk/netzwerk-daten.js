/*!
 * netzwerk-daten.js — Datenaufbereitung fuer die Netzwerk-Vorschau
 * souveraene-schweiz.ch
 *
 * Reine Funktionen ohne DOM-Zugriff: CSV einlesen, Organisationsnetz und
 * bipartites Netz ableiten, Teilnetze (Zusammenhangskomponenten) bestimmen,
 * Kennzahlen berechnen. Laeuft im Browser (globals) und in Node (require),
 * damit dieselbe Logik getestet werden kann.
 *
 * Es werden ausschliesslich die in der CSV erfassten Angaben verwendet.
 * Keine Ergaenzung personenbezogener Daten, keine Bewertung, keine Rangfolge.
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else global.NetzwerkDaten = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SPALTEN = {
    person: ['person'],
    ngoId: ['ngo-id', 'ngoid', 'ngo id'],
    organisation: ['organisation'],
    anzahl: ['anzahl verbundener organisationen', 'anzahl'],
    datenstand: ['datenstand']
  };

  /* ---------------------------------------------------------------- CSV --- */

  /** Ermittelt das Trennzeichen anhand der Kopfzeile. */
  function erkenneTrennzeichen(kopfzeile) {
    var kandidaten = [';', ',', '\t'];
    var bestes = ';';
    var maxTreffer = -1;
    for (var i = 0; i < kandidaten.length; i++) {
      var treffer = kopfzeile.split(kandidaten[i]).length - 1;
      if (treffer > maxTreffer) {
        maxTreffer = treffer;
        bestes = kandidaten[i];
      }
    }
    return bestes;
  }

  /**
   * Zerlegt CSV-Text in Zeilen aus Feldern. Beruecksichtigt Anfuehrungszeichen
   * (inkl. verdoppelter Anfuehrungszeichen und Zeilenumbruechen im Feld),
   * BOM sowie CRLF. Umlaute bleiben unveraendert (UTF-8).
   */
  function zerlegeCsv(text, trennzeichen) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM entfernen
    if (!trennzeichen) trennzeichen = erkenneTrennzeichen(text.split(/\r?\n/)[0] || '');

    var zeilen = [];
    var feld = '';
    var zeile = [];
    var inAnfuehrung = false;

    for (var i = 0; i < text.length; i++) {
      var z = text[i];
      if (inAnfuehrung) {
        if (z === '"') {
          if (text[i + 1] === '"') { feld += '"'; i++; }
          else inAnfuehrung = false;
        } else {
          feld += z;
        }
        continue;
      }
      if (z === '"') { inAnfuehrung = true; continue; }
      if (z === trennzeichen) { zeile.push(feld); feld = ''; continue; }
      if (z === '\r') continue;
      if (z === '\n') { zeile.push(feld); zeilen.push(zeile); zeile = []; feld = ''; continue; }
      feld += z;
    }
    zeile.push(feld);
    zeilen.push(zeile);

    return zeilen.filter(function (z) {
      return z.some(function (f) { return f.trim() !== ''; });
    });
  }

  function findeSpalte(kopf, aliase) {
    for (var i = 0; i < kopf.length; i++) {
      var name = kopf[i].trim().toLowerCase();
      if (aliase.indexOf(name) !== -1) return i;
    }
    return -1;
  }

  /**
   * Liest die CSV in Datensaetze {person, ngoId, organisation, anzahl, datenstand}.
   * Wirft bei fehlenden Pflichtspalten, damit ein Datenfehler sichtbar wird
   * statt still zu einem falschen Netz zu fuehren.
   */
  function leseCsv(text) {
    var zeilen = zerlegeCsv(text);
    if (!zeilen.length) throw new Error('CSV ist leer.');

    var kopf = zeilen[0];
    var idx = {};
    Object.keys(SPALTEN).forEach(function (schluessel) {
      idx[schluessel] = findeSpalte(kopf, SPALTEN[schluessel]);
    });
    ['person', 'ngoId', 'organisation'].forEach(function (pflicht) {
      if (idx[pflicht] === -1) {
        throw new Error('Pflichtspalte fehlt in der CSV: ' + pflicht);
      }
    });

    var saetze = [];
    for (var i = 1; i < zeilen.length; i++) {
      var z = zeilen[i];
      var person = (z[idx.person] || '').trim();
      var ngoId = (z[idx.ngoId] || '').trim();
      var organisation = (z[idx.organisation] || '').trim();
      if (!person || !ngoId || !organisation) continue; // unvollstaendige Zeile
      saetze.push({
        person: person,
        ngoId: ngoId,
        organisation: organisation,
        anzahl: idx.anzahl === -1 ? null : parseInt((z[idx.anzahl] || '').trim(), 10),
        datenstand: idx.datenstand === -1 ? '' : (z[idx.datenstand] || '').trim()
      });
    }
    return saetze;
  }

  /* ------------------------------------------------------------ Datensatz - */

  function datumSchluessel(datenstand) {
    var t = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(datenstand || '');
    return t ? t[3] + t[2] + t[1] : '';
  }

  /**
   * Fasst die Datensaetze zu Personen und Organisationen zusammen.
   * Doppelte Zeilen (gleiche Person, gleiche NGO-ID) werden zusammengefuehrt.
   */
  function baueDatensatz(saetze) {
    var organisationen = {};
    var personen = {};
    var datenstaende = {};

    saetze.forEach(function (s) {
      if (!organisationen[s.ngoId]) {
        organisationen[s.ngoId] = { id: s.ngoId, name: s.organisation, personen: [] };
      }
      var org = organisationen[s.ngoId];
      if (!personen[s.person]) {
        personen[s.person] = { name: s.person, organisationen: [], anzahlLautCsv: s.anzahl };
      }
      var person = personen[s.person];
      if (person.organisationen.indexOf(s.ngoId) === -1) {
        person.organisationen.push(s.ngoId);
        org.personen.push(s.person);
      }
      if (s.datenstand) datenstaende[s.datenstand] = (datenstaende[s.datenstand] || 0) + 1;
    });

    // Deterministische Reihenfolge: unabhaengig von der Zeilenreihenfolge der CSV.
    Object.keys(organisationen).forEach(function (id) {
      organisationen[id].personen.sort(vergleicheText);
    });
    Object.keys(personen).forEach(function (name) {
      personen[name].organisationen.sort(vergleicheText);
    });

    var datenstand = Object.keys(datenstaende).sort(function (a, b) {
      return datumSchluessel(a) < datumSchluessel(b) ? 1 : -1;
    })[0] || '';

    return {
      organisationen: organisationen,
      personen: personen,
      datenstand: datenstand,
      organisationenSortiert: Object.keys(organisationen).sort(vergleicheText),
      personenSortiert: Object.keys(personen).sort(vergleicheText)
    };
  }

  function vergleicheText(a, b) {
    return String(a).localeCompare(String(b), 'de-CH');
  }

  function paarSchluessel(a, b) {
    return a < b ? a + '|' + b : b + '|' + a;
  }

  /* --------------------------------------------------------------- Netze -- */

  /**
   * Organisationsansicht: Knoten sind Organisationen. Eine Kante entsteht,
   * wenn mindestens eine identische Person bei beiden Organisationen erfasst
   * ist. Die Kante traegt die Namen aller verbindenden Personen.
   */
  function baueOrganisationsnetz(datensatz) {
    var kantenIndex = {};
    datensatz.personenSortiert.forEach(function (name) {
      var orgs = datensatz.personen[name].organisationen;
      for (var i = 0; i < orgs.length; i++) {
        for (var j = i + 1; j < orgs.length; j++) {
          var schluessel = paarSchluessel(orgs[i], orgs[j]);
          if (!kantenIndex[schluessel]) {
            kantenIndex[schluessel] = {
              id: schluessel,
              quelle: schluessel.split('|')[0],
              ziel: schluessel.split('|')[1],
              personen: []
            };
          }
          if (kantenIndex[schluessel].personen.indexOf(name) === -1) {
            kantenIndex[schluessel].personen.push(name);
          }
        }
      }
    });

    var knoten = datensatz.organisationenSortiert.map(function (id) {
      return {
        id: id,
        typ: 'organisation',
        name: datensatz.organisationen[id].name,
        ngoId: id
      };
    });
    var kanten = Object.keys(kantenIndex).sort(vergleicheText).map(function (k) {
      kantenIndex[k].personen.sort(vergleicheText);
      return kantenIndex[k];
    });

    return { knoten: knoten, kanten: kanten };
  }

  /**
   * Personen–Organisationen-Ansicht: zwei Knotentypen, Kante nur dort, wo die
   * Person in der CSV bei der Organisation aufgefuehrt ist.
   */
  function baueBipartitesNetz(datensatz) {
    var knoten = datensatz.organisationenSortiert.map(function (id) {
      return { id: 'org:' + id, typ: 'organisation', name: datensatz.organisationen[id].name, ngoId: id };
    });
    datensatz.personenSortiert.forEach(function (name) {
      knoten.push({ id: 'per:' + name, typ: 'person', name: name, ngoId: null });
    });

    var kanten = [];
    datensatz.personenSortiert.forEach(function (name) {
      datensatz.personen[name].organisationen.forEach(function (id) {
        kanten.push({
          id: 'per:' + name + '|org:' + id,
          quelle: 'per:' + name,
          ziel: 'org:' + id,
          personen: [name]
        });
      });
    });

    return { knoten: knoten, kanten: kanten };
  }

  /* ----------------------------------------------------------- Teilnetze -- */

  /**
   * Zusammenhangskomponenten des Organisationsnetzes. Die Nummerierung ist
   * reproduzierbar: absteigend nach Groesse, bei Gleichstand nach der
   * kleinsten NGO-ID.
   */
  function berechneTeilnetze(datensatz, organisationsnetz) {
    var eltern = {};
    datensatz.organisationenSortiert.forEach(function (id) { eltern[id] = id; });

    function finde(x) {
      while (eltern[x] !== x) { eltern[x] = eltern[eltern[x]]; x = eltern[x]; }
      return x;
    }
    organisationsnetz.kanten.forEach(function (k) { eltern[finde(k.quelle)] = finde(k.ziel); });

    var gruppen = {};
    datensatz.organisationenSortiert.forEach(function (id) {
      var wurzel = finde(id);
      (gruppen[wurzel] = gruppen[wurzel] || []).push(id);
    });

    var listen = Object.keys(gruppen).map(function (w) { return gruppen[w].slice().sort(vergleicheText); });
    listen.sort(function (a, b) {
      if (b.length !== a.length) return b.length - a.length;
      return vergleicheText(a[0], b[0]);
    });

    var zuTeilnetz = {};
    var teilnetze = listen.map(function (liste, i) {
      liste.forEach(function (id) { zuTeilnetz[id] = i + 1; });
      return { nummer: i + 1, organisationen: liste, groesse: liste.length };
    });

    return { teilnetze: teilnetze, zuTeilnetz: zuTeilnetz };
  }

  /** Teilnetz-Nummer eines Knotens in beiden Ansichten. */
  function teilnetzVonKnoten(knoten, datensatz, zuTeilnetz) {
    if (knoten.typ === 'organisation') return zuTeilnetz[knoten.ngoId] || null;
    var orgs = datensatz.personen[knoten.name].organisationen;
    return orgs.length ? (zuTeilnetz[orgs[0]] || null) : null;
  }

  /* ---------------------------------------------------------- Kennzahlen -- */

  /**
   * Kennzahlen ausschliesslich aus der CSV. "untersuchteOrganisationen" ist
   * nicht ableitbar (Organisationen ohne Personenbruecke stehen nicht in der
   * CSV) und wird aus der Meta-Angabe uebernommen.
   */
  function kennzahlen(datensatz, organisationsnetz, teilnetzInfo) {
    return {
      organisationenMitBruecke: datensatz.organisationenSortiert.length,
      brueckenpersonen: datensatz.personenSortiert.length,
      organisationspaare: organisationsnetz.kanten.length,
      teilnetze: teilnetzInfo.teilnetze.length,
      datenstand: datensatz.datenstand
    };
  }

  /* ------------------------------------------------------------- Filter --- */

  /** Filtert ein Netz auf ein Teilnetz. teilnetz === 0 bedeutet "alle". */
  function filtereNachTeilnetz(netz, datensatz, zuTeilnetz, teilnetz) {
    if (!teilnetz) return { knoten: netz.knoten.slice(), kanten: netz.kanten.slice() };
    var erlaubt = {};
    var knoten = netz.knoten.filter(function (k) {
      var t = teilnetzVonKnoten(k, datensatz, zuTeilnetz);
      if (t === teilnetz) { erlaubt[k.id] = true; return true; }
      return false;
    });
    var kanten = netz.kanten.filter(function (k) { return erlaubt[k.quelle] && erlaubt[k.ziel]; });
    return { knoten: knoten, kanten: kanten };
  }

  /** Sucht in Personen- und Organisationsnamen (inkl. NGO-ID), ohne Gross-/Kleinschreibung. */
  function sucheKnoten(netz, suchbegriff) {
    var q = String(suchbegriff || '').trim().toLowerCase();
    if (!q) return [];
    return netz.knoten.filter(function (k) {
      return k.name.toLowerCase().indexOf(q) !== -1 ||
        (k.ngoId && k.ngoId.toLowerCase().indexOf(q) !== -1);
    });
  }

  /** Direkte Nachbarn eines Knotens, alphabetisch. */
  function nachbarn(netz, knotenId) {
    var treffer = [];
    netz.kanten.forEach(function (k) {
      if (k.quelle === knotenId) treffer.push({ id: k.ziel, kante: k });
      else if (k.ziel === knotenId) treffer.push({ id: k.quelle, kante: k });
    });
    var nachId = {};
    netz.knoten.forEach(function (k) { nachId[k.id] = k; });
    return treffer
      .map(function (t) { return { knoten: nachId[t.id], kante: t.kante }; })
      .filter(function (t) { return !!t.knoten; })
      .sort(function (a, b) { return vergleicheText(a.knoten.name, b.knoten.name); });
  }

  /** Ein Aufruf: von CSV-Text zum vollstaendigen Modell. */
  function baueModell(csvText) {
    var datensatz = baueDatensatz(leseCsv(csvText));
    var organisationsnetz = baueOrganisationsnetz(datensatz);
    var bipartitesNetz = baueBipartitesNetz(datensatz);
    var teilnetzInfo = berechneTeilnetze(datensatz, organisationsnetz);
    return {
      datensatz: datensatz,
      organisationsnetz: organisationsnetz,
      bipartitesNetz: bipartitesNetz,
      teilnetze: teilnetzInfo.teilnetze,
      zuTeilnetz: teilnetzInfo.zuTeilnetz,
      kennzahlen: kennzahlen(datensatz, organisationsnetz, teilnetzInfo)
    };
  }

  return {
    zerlegeCsv: zerlegeCsv,
    erkenneTrennzeichen: erkenneTrennzeichen,
    leseCsv: leseCsv,
    baueDatensatz: baueDatensatz,
    baueOrganisationsnetz: baueOrganisationsnetz,
    baueBipartitesNetz: baueBipartitesNetz,
    berechneTeilnetze: berechneTeilnetze,
    teilnetzVonKnoten: teilnetzVonKnoten,
    kennzahlen: kennzahlen,
    filtereNachTeilnetz: filtereNachTeilnetz,
    sucheKnoten: sucheKnoten,
    nachbarn: nachbarn,
    baueModell: baueModell
  };
});
