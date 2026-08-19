/*!
 * ngo-netz-daten.js — Datenschicht des NGO-Netzwerks
 * souveraene-schweiz.ch
 *
 * Liest ngo-netzwerk.json (erzeugt von NGO/build/erzeuge_netzwerk_json.py) und
 * baut daraus das Anzeigemodell.
 *
 * Drei Ebenen, streng getrennt:
 *   G3  Kernnetz N1–N3            Standardansicht
 *   G2  Kernnetz plus N4          nur auf ausdrückliche Umschaltung
 *   G4  historische Beziehungen   eigener Modus, nie über aktuelle Beziehungen gelegt
 *
 * Reine Funktionen ohne DOM-Zugriff, damit dieselbe Logik in Node getestet
 * werden kann.
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else global.NgoNetzDaten = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var G3_KLASSEN = ['N1', 'N2', 'N3'];
  var G2_KLASSEN = ['N1', 'N2', 'N3', 'N4'];

  /**
   * Kanonischer Personenschlüssel — identisch zu canonical_person_key() im
   * Build: Unicode normalisieren, klein schreiben, Interpunktion als Trenner,
   * Whitespace normalisieren, Tokens sortieren. Kein Fuzzy-Matching.
   */
  // Trennzeichenmuster: alles ausser Buchstaben, Ziffern und Leerraum gilt als
  // Trenner. Die Unicode-Eigenschaftsklassen sind noetig, damit Namen wie
  // «Vladović» oder «Şahin» nicht verstuemmelt werden; aeltere Browser fallen
  // auf eine Latin-Variante zurueck.
  var TRENNER;
  try {
    TRENNER = new RegExp('[^\\p{L}\\p{N}_\\s]|_', 'gu');
  } catch (fehler) {
    TRENNER = /[^\wÀ-ÖØ-öø-ÿ\s]|_/g;
  }

  function canonicalPersonKey(name) {
    var s = String(name || '');
    if (s.normalize) s = s.normalize('NFKC');
    s = s.toLowerCase().replace(TRENNER, ' ');
    return s.split(/\s+/).filter(Boolean).sort().join(' ');
  }

  function vergleicheText(a, b) {
    return String(a).localeCompare(String(b), 'de-CH');
  }

  /* ------------------------------------------------------------ Aufbau ---- */

  function baueModell(daten) {
    var buecher = daten.woerterbuecher || {};
    var klassen = (daten.meta && daten.meta.klassen) || G2_KLASSEN;
    var gewichte = (daten.meta && daten.meta.gewichtJeKlasse) || [4, 3, 2, 1];

    var organisationen = daten.organisationen.map(function (o, i) {
      return {
        index: i,
        id: o.id,
        name: o.name,
        kurz: o.kurz || o.name,
        obergruppe: o.obergruppe || '',
        hauptkategorie: o.hauptkategorie || '',
        organisationstyp: o.organisationstyp || '',
        sitz: o.sitz || '',
        kanton: o.kanton || '',
        website: o.website || '',
        datenstand: o.datenstand || '',
        cluster: o.cluster || 0,
        kanten: o.kanten || 0,
        kantenG3: o.kantenG3 || 0,
        personen: o.personen || 0,
        brueckenpersonen: o.brueckenpersonen || 0,
        brueckenpersonenG3: o.brueckenpersonenG3 || 0,
        historischeKanten: o.historischeKanten || 0,
        abdeckungsluecke: !!o.abdeckungsluecke,
        // Stammdaten aus ngo_stammdaten.csv, soweit vorhanden
        rechtsform: o.rechtsform || '',
        uid: o.uid || '',
        gruendung: o.gruendung || '',
        zweck: o.zweck || '',
        taetigkeit: o.taetigkeit || '',
        reichweite: o.reichweite || '',
        mitglieder: o.mitglieder || '',
        vollzeitstellen: o.vollzeitstellen || '',
        zewo: o.zewo || '',
        berichtsjahr: o.berichtsjahr || '',
        profilstatus: o.profilstatus || ''
      };
    });
    var orgNachId = {};
    organisationen.forEach(function (o) { orgNachId[o.id] = o; });

    var personen = daten.personen.map(function (p, i) {
      return {
        index: i,
        schluessel: p.k,
        name: p.n,
        varianten: p.varianten || [p.n],
        rohIds: p.rohIds || [],
        parteien: p.parteien || [],
        nurHistorie: !!p.nurHistorie,
        organisationen: [],
        kanten: []
      };
    });

    var quellen = (daten.quellen || []).map(function (q, i) {
      return {
        index: i,
        id: q.id,
        organisationId: q.orgId || '',
        herausgeber: q.herausgeber || '',
        titel: q.titel || '',
        typ: q.typ || '',
        rang: q.rang || '',
        guete: q.guete || '',
        eignung: q.eignung || '',
        dokumentNr: q.dokumentNr || '',
        datum: q.datum || '',
        jahr: q.jahr || '',
        abschnitt: q.abschnitt || '',
        url: q.url || '',
        abgerufen: q.abgerufen || '',
        archiv: q.archiv || '',
        pruefstatus: q.pruefstatus || '',
        // Kennung vorhanden, Registerzeile fehlt — die Luecke wird ausgewiesen.
        luecke: !!q.luecke
      };
    });

    /**
     * Baut eine Beziehung auf. Frühere Beziehungen laufen durch dieselbe
     * Funktion, werden aber getrennt abgelegt — sie dürfen nie in derselben
     * Liste stehen wie die aktuellen.
     */
    function baueKante(k, i, historisch) {
      var person = personen[k.p];
      var organisation = organisationen[k.o];
      var kante = {
        index: i,
        id: k.id,
        organisation: organisation,
        person: person,
        historisch: !!historisch,
        // Originalwerte des Pakets, bewusst erhalten
        rohPersonId: person.rohIds[k.pr] || person.rohIds[0] || '',
        anzeige: person.varianten[k.pa] || person.name,
        klasse: klassen[k.k],
        gewicht: gewichte[k.k],
        rolle: (buecher.rolle || [])[k.r] || '',
        quellenGuete: (buecher.guete || [])[k.qg] || '',
        quellen: (k.qs || []).map(function (n) { return quellen[n]; }),
        quellenFehlend: k.qf || [],
        status: (buecher.status || [])[k.s] || '',
        verbindungstyp: (buecher.typ || [])[k.vt] || '',
        amt: k.amt || '',
        partei: k.partei || '',
        behoerde: k.behoerde || '',
        dachverband: k.dachverband || '',
        von: k.von || '',
        bis: k.bis || '',
        bemerkung: k.bemerkung || '',
        gegenpart: k.gp !== undefined ? organisationen[k.gp] : null,
        gegenpartName: k.gp !== undefined ? organisationen[k.gp].name : (k.gpName || '')
      };
      kante.quelle = kante.quellen.map(function (q) { return q.id; }).join('; ');
      if (historisch) {
        (person.historie || (person.historie = [])).push(kante);
      } else {
        person.kanten.push(kante);
        if (person.organisationen.indexOf(organisation) === -1) {
          person.organisationen.push(organisation);
        }
      }
      return kante;
    }

    var kanten = daten.kanten.map(function (k, i) { return baueKante(k, i, false); });
    var historie = (daten.historie || []).map(function (k, i) { return baueKante(k, i, true); });

    var cluster = {};
    (daten.cluster || []).forEach(function (c) {
      cluster[c.id] = {
        id: c.id,
        label: c.label,
        groesse: c.groesse,
        interneKanten: c.interneKanten,
        internesGewicht: c.internesGewicht,
        g3Jaccard: c.g3Jaccard,
        mitglieder: (c.mitglieder || []).map(function (i) { return organisationen[i]; })
      };
    });
    cluster[0] = {
      id: 0,
      label: 'kein Cluster — keine erfasste Beziehung',
      groesse: organisationen.filter(function (o) { return !o.cluster; }).length,
      mitglieder: organisationen.filter(function (o) { return !o.cluster; })
    };

    var parteien = {};
    kanten.forEach(function (k) {
      if (k.partei) parteien[k.partei] = (parteien[k.partei] || 0) + 1;
    });

    var modell = {
      meta: daten.meta || {},
      organisationen: organisationen,
      orgNachId: orgNachId,
      personen: personen,
      kanten: kanten,
      historie: historie,
      quellen: quellen,
      cluster: cluster,
      clusterListe: (daten.cluster || []).slice(),
      obergruppen: daten.obergruppen || [],
      parteien: parteien,
      variantengruppen: daten.variantengruppen || [],
      projektionGeliefert: daten.projektion || {}
    };
    modell.kennzahlen = kennzahlen(modell);
    return modell;
  }

  function kennzahlen(modell) {
    var g3 = modell.kanten.filter(function (k) { return G3_KLASSEN.indexOf(k.klasse) !== -1; });
    var mitBeziehung = {};
    modell.kanten.forEach(function (k) { mitBeziehung[k.organisation.id] = true; });
    return {
      organisationen: modell.organisationen.length,
      kanten: modell.kanten.length,
      kantenG3: g3.length,
      // Personen, die nur in frueheren Beziehungen vorkommen, zaehlen hier nicht mit.
      personen: modell.personen.filter(function (p) { return !p.nurHistorie; }).length,
      personenNurHistorie: modell.personen.filter(function (p) { return p.nurHistorie; }).length,
      historie: modell.historie.length,
      rohpersonen: modell.personen.reduce(function (s, p) { return s + p.rohIds.length; }, 0),
      variantengruppen: modell.variantengruppen.length,
      organisationenMitBeziehung: Object.keys(mitBeziehung).length,
      abdeckungsluecken: modell.organisationen.filter(function (o) { return o.abdeckungsluecke; }).length,
      historischeBeziehungen: modell.organisationen.reduce(function (s, o) {
        return s + o.historischeKanten;
      }, 0),
      datenstand: (modell.meta || {}).datenstand || null
    };
  }

  /* ------------------------------------------------------------ Filter ---- */

  function standardFilter() {
    return {
      // Perspektive ist bewusst ein offener Wert und kein Ja/Nein: die
      // Geldflüsse der zweiten Ausbaustufe kommen als weitere Perspektive
      // dazu, ohne dass die Ansicht neu geschrieben werden muss.
      perspektive: 'organisation',                     // organisation | person
      personenSchwelle: 2,                             // ab wie vielen Organisationen
      ansicht: 'G3',                                   // G3 = Kernnetz N1–N3
      historie: false,                                 // eigener Modus, nie gemischt
      klassen: { N1: true, N2: true, N3: true, N4: false },
      obergruppe: '',
      cluster: '',
      partei: '',
      farbe: 'cluster',                                // cluster | obergruppe
      nurLuecken: false
    };
  }

  var PERSPEKTIVEN = {
    organisation: {
      schluessel: 'organisation',
      titel: 'Organisationen',
      beschreibung: 'Organisationen, verbunden über gemeinsam erfasste Personen und ' +
                    'direkt erfasste Beziehungen.'
    },
    person: {
      schluessel: 'person',
      titel: 'Personen',
      beschreibung: 'Personen mit Beziehungen zu mehreren Organisationen, mit diesen ' +
                    'Organisationen verbunden. Jede Linie ist eine erfasste Beziehung, ' +
                    'keine gerechnete Nähe zwischen Personen.'
    }
  };

  /** Beziehungsklassen, die in der gewählten Ansicht überhaupt zulässig sind. */
  function erlaubteKlassen(filter) {
    return filter.ansicht === 'G2' ? G2_KLASSEN : G3_KLASSEN;
  }

  function kanteSichtbar(kante, filter) {
    if (erlaubteKlassen(filter).indexOf(kante.klasse) === -1) return false;
    if (!filter.klassen[kante.klasse]) return false;
    if (filter.partei && kante.partei !== filter.partei) return false;
    return true;
  }

  function organisationSichtbar(organisation, filter) {
    if (filter.obergruppe && organisation.obergruppe !== filter.obergruppe) return false;
    if (filter.cluster !== '' && String(organisation.cluster) !== String(filter.cluster)) return false;
    if (filter.nurLuecken && !organisation.abdeckungsluecke) return false;
    return true;
  }

  /* -------------------------------------------------------- Projektion ---- */

  /**
   * Organisationsprojektion nach AP29.
   *
   * Über gemeinsam erfasste Personen: je Person und Organisation zählt das
   * höchste Rollengewicht, das Kantengewicht ist konservativ das kleinere der
   * beiden. Direkte Master-zu-Master-Beziehungen kommen zusätzlich hinzu und
   * bleiben als solche gekennzeichnet — beides ist visuell unterscheidbar.
   */
  function projiziere(kanten) {
    var proPerson = {};
    kanten.forEach(function (k) {
      var nachOrg = proPerson[k.person.index] || (proPerson[k.person.index] = {});
      if (!(k.organisation.index in nachOrg) || k.gewicht > nachOrg[k.organisation.index]) {
        nachOrg[k.organisation.index] = k.gewicht;
      }
    });

    var paare = {};
    function eintrag(a, b) {
      var s = a < b ? a + ':' + b : b + ':' + a;
      if (!paare[s]) {
        paare[s] = {
          id: s, a: Math.min(a, b), b: Math.max(a, b),
          gewicht: 0, personen: [], direkt: false, ueberPersonen: false
        };
      }
      return paare[s];
    }

    var bruecken = {};
    Object.keys(proPerson).forEach(function (personIndex) {
      var nachOrg = proPerson[personIndex];
      var orgs = Object.keys(nachOrg).map(Number).sort(function (x, y) { return x - y; });
      if (orgs.length > 1) {
        orgs.forEach(function (o) {
          (bruecken[o] || (bruecken[o] = {}))[personIndex] = true;
        });
      }
      for (var i = 0; i < orgs.length; i++) {
        for (var j = i + 1; j < orgs.length; j++) {
          var v = eintrag(orgs[i], orgs[j]);
          v.gewicht += Math.min(nachOrg[orgs[i]], nachOrg[orgs[j]]);
          v.ueberPersonen = true;
          if (v.personen.indexOf(Number(personIndex)) === -1) v.personen.push(Number(personIndex));
        }
      }
    });

    var direkte = {};
    kanten.forEach(function (k) {
      if (!k.gegenpart || k.gegenpart.index === k.organisation.index) return;
      var a = k.organisation.index, b = k.gegenpart.index;
      var s = a < b ? a + ':' + b : b + ':' + a;
      (direkte[s] || (direkte[s] = [])).push(k.gewicht);
    });
    Object.keys(direkte).forEach(function (s) {
      var teile = s.split(':');
      var v = eintrag(Number(teile[0]), Number(teile[1]));
      v.gewicht += direkte[s].reduce(function (a, b) { return a + b; }, 0);
      v.direkt = true;
    });

    return { paare: paare, bruecken: bruecken };
  }

  /** Einstieg der Ansicht: wählt das Netz nach der eingestellten Perspektive. */
  function baueNetz(modell, filter) {
    if (filter.historie) return baueHistoriennetz(modell, filter);
    if (filter.perspektive === 'person') return bauePersonennetz(modell, filter);
    return baueOrganisationsnetz(modell, filter);
  }

  /**
   * Personenperspektive: zweiseitiges Netz aus Personen und den Organisationen,
   * zu denen sie erfasste Beziehungen haben.
   *
   * Gezeigt werden nur Personen mit Beziehungen zu mindestens
   * `personenSchwelle` Organisationen — die übrigen wären Einzelpunkte ohne
   * Verbindung und stehen in der Personenübersicht.
   *
   * Bewusst **keine** Personen-Personen-Projektion: dieselbe Organisation
   * würde ihre Mitglieder zu einer Clique verbinden. Bei 64 erfassten Personen
   * in einem Gremium wären das allein 2016 Linien, die eine Nähe zwischen
   * Personen behaupten, die in den Daten nicht steht.
   */
  function bauePersonennetz(modell, filter) {
    var schwelle = Math.max(2, filter.personenSchwelle || 2);

    var sichtbare = modell.kanten.filter(function (k) {
      return kanteSichtbar(k, filter) && organisationSichtbar(k.organisation, filter);
    });

    var jePerson = {};
    sichtbare.forEach(function (k) {
      var eintrag = jePerson[k.person.index] ||
        (jePerson[k.person.index] = { person: k.person, organisationen: {}, kanten: [] });
      eintrag.organisationen[k.organisation.index] = k.organisation;
      eintrag.kanten.push(k);
    });

    var knoten = [];
    var kanten = [];
    var beteiligteOrgs = {};
    var brueckenJeOrg = {};

    Object.keys(jePerson).forEach(function (index) {
      var eintrag = jePerson[index];
      var orgs = Object.keys(eintrag.organisationen);
      if (orgs.length < schwelle) return;
      knoten.push({
        id: 'person:' + eintrag.person.index,
        typ: 'person',
        name: eintrag.person.name,
        vollname: eintrag.person.name,
        person: eintrag.person,
        // Zählung der Organisationen, kein Einflussmass.
        zentralitaet: orgs.length,
        organisationen: orgs.length,
        farbschluessel: 'person'
      });
      orgs.forEach(function (o) {
        var organisation = eintrag.organisationen[o];
        beteiligteOrgs[o] = organisation;
        brueckenJeOrg[o] = (brueckenJeOrg[o] || 0) + 1;
        kanten.push({
          id: 'pb:' + eintrag.person.index + ':' + o,
          quelle: 'person:' + eintrag.person.index,
          ziel: organisation.id,
          art: 'beleg',
          gewicht: eintrag.kanten.filter(function (k) {
            return k.organisation.index === organisation.index;
          }).reduce(function (hoechstes, k) { return Math.max(hoechstes, k.gewicht); }, 1),
          personen: [eintrag.person]
        });
      });
    });

    Object.keys(beteiligteOrgs).forEach(function (o) {
      var knotenDaten = baueKnoten(modell, beteiligteOrgs[o], null, filter);
      knotenDaten.zentralitaet = brueckenJeOrg[o];
      knoten.push(knotenDaten);
    });

    knoten.sort(function (a, b) { return vergleicheText(a.name, b.name); });
    return {
      knoten: knoten, kanten: kanten, bruecken: {},
      bipartit: true, schwelle: schwelle,
      personen: knoten.filter(function (k) { return k.typ === 'person'; }).length,
      organisationen: Object.keys(beteiligteOrgs).length
    };
  }

  /**
   * Baut das darzustellende Organisationsnetz.
   * Personen werden nie als Gesamtgraph gezeichnet, sondern erst beim Öffnen
   * einer Organisation eingeblendet.
   */
  function baueOrganisationsnetz(modell, filter) {
    if (filter.historie) return baueHistoriennetz(modell, filter);

    var kanten = modell.kanten.filter(function (k) {
      return kanteSichtbar(k, filter) && organisationSichtbar(k.organisation, filter);
    });
    var ergebnis = projiziere(kanten);

    var verwendet = {};
    var netzKanten = [];
    Object.keys(ergebnis.paare).forEach(function (s) {
      var v = ergebnis.paare[s];
      var a = modell.organisationen[v.a], b = modell.organisationen[v.b];
      if (!organisationSichtbar(a, filter) || !organisationSichtbar(b, filter)) return;
      verwendet[a.index] = true;
      verwendet[b.index] = true;
      netzKanten.push({
        id: v.id, quelle: a.id, ziel: b.id, gewicht: v.gewicht,
        art: v.ueberPersonen && v.direkt ? 'beides' : (v.direkt ? 'direkt' : 'personen'),
        personen: v.personen.map(function (i) { return modell.personen[i]; })
      });
    });

    // Organisationen ohne Projektionskante bleiben als Einzelknoten sichtbar.
    // Sie sind erfasst, nur nicht über eine gemeinsame Person verbunden — das
    // ist ausdrücklich kein Beleg fehlender Vernetzung.
    var einzeln = {};
    kanten.forEach(function (k) {
      if (!verwendet[k.organisation.index]) einzeln[k.organisation.index] = true;
    });
    modell.organisationen.forEach(function (o) {
      if (o.abdeckungsluecke && organisationSichtbar(o, filter)) einzeln[o.index] = true;
    });

    var knoten = [];
    Object.keys(verwendet).concat(Object.keys(einzeln)).forEach(function (index) {
      var o = modell.organisationen[index];
      if (knoten.some(function (k) { return k.id === o.id; })) return;
      knoten.push(baueKnoten(modell, o, ergebnis.bruecken[o.index], filter));
    });
    knoten.sort(function (a, b) { return vergleicheText(a.name, b.name); });

    return { knoten: knoten, kanten: netzKanten, bruecken: ergebnis.bruecken };
  }

  function baueKnoten(modell, organisation, brueckenMenge, filter) {
    var bruecken = brueckenMenge ? Object.keys(brueckenMenge).length : 0;
    return {
      id: organisation.id,
      typ: 'organisation',
      name: organisation.kurz,
      vollname: organisation.name,
      organisation: organisation,
      cluster: organisation.cluster,
      obergruppe: organisation.obergruppe,
      // Grössenmass: strukturelle Brückenfunktion im erfassten Netz.
      // Ausdrücklich keine Einflussmessung — siehe meta.hinweise.zentralitaet.
      zentralitaet: bruecken,
      abdeckungsluecke: organisation.abdeckungsluecke,
      farbschluessel: filter.farbe === 'obergruppe' ? organisation.obergruppe : String(organisation.cluster)
    };
  }

  /**
   * Historienmodus: frühere Beziehungen als zweiseitiges Netz aus
   * Organisationen und den damals erfassten Personen. Jede Linie ist eine
   * erfasste frühere Beziehung.
   *
   * Strikt getrennt von den aktuellen Beziehungen — die beiden Bestände
   * erscheinen nie im selben Netz.
   */
  function baueHistoriennetz(modell, filter) {
    var kanten = modell.historie.filter(function (k) {
      return organisationSichtbar(k.organisation, filter);
    });

    var knoten = [];
    var gesehen = {};
    var netzKanten = [];
    var jeOrg = {};

    kanten.forEach(function (k) {
      var personId = 'person:' + k.person.index;
      if (!gesehen[personId]) {
        gesehen[personId] = true;
        knoten.push({
          id: personId, typ: 'person', name: k.anzeige, vollname: k.anzeige,
          person: k.person, zentralitaet: 1, organisationen: 1,
          historisch: true, farbschluessel: 'person'
        });
      }
      jeOrg[k.organisation.index] = (jeOrg[k.organisation.index] || 0) + 1;
      netzKanten.push({
        id: 'h:' + k.id, quelle: k.organisation.id, ziel: personId,
        art: 'beleg', gewicht: k.gewicht, personen: [k.person], historisch: true
      });
    });

    Object.keys(jeOrg).forEach(function (index) {
      var organisation = modell.organisationen[index];
      var k = baueKnoten(modell, organisation, null, filter);
      k.zentralitaet = jeOrg[index];
      k.historisch = true;
      knoten.push(k);
    });

    // Zahl der Beziehungen je Person nachtragen, damit die Knotengrösse zählt.
    var jePerson = {};
    kanten.forEach(function (k) { jePerson[k.person.index] = (jePerson[k.person.index] || 0) + 1; });
    knoten.forEach(function (k) {
      if (k.typ === 'person') {
        k.organisationen = jePerson[k.person.index] || 1;
        k.zentralitaet = k.organisationen;
      }
    });

    knoten.sort(function (a, b) { return vergleicheText(a.name, b.name); });
    return {
      knoten: knoten, kanten: netzKanten, bruecken: {},
      historie: true, bipartit: true,
      personen: Object.keys(gesehen).length,
      organisationen: Object.keys(jeOrg).length,
      beziehungen: kanten.length
    };
  }

  /* ----------------------------------------------------------- Details ---- */

  /** Erfasste Personen einer Organisation, nach aktiven Filtern. */
  function personenZuOrganisation(modell, organisationId, filter) {
    var organisation = modell.orgNachId[organisationId];
    if (!organisation) return [];
    return modell.kanten.filter(function (k) {
      return k.organisation.index === organisation.index && kanteSichtbar(k, filter);
    }).sort(function (a, b) { return vergleicheText(a.anzeige, b.anzeige); });
  }

  /** Erfasste Organisationen einer Person, nach aktiven Filtern. */
  function organisationenZuPerson(modell, personIndex, filter) {
    var person = modell.personen[personIndex];
    if (!person) return [];
    return person.kanten.filter(function (k) {
      return kanteSichtbar(k, filter) && organisationSichtbar(k.organisation, filter);
    }).sort(function (a, b) { return vergleicheText(a.organisation.name, b.organisation.name); });
  }

  /**
   * Belege einer Kantenmenge, aufgelöst zu Herausgeber, Titel, Typ, Rang, Güte
   * und Datum. Die interne Kennung ist nur eine Zusatzangabe. Kennungen ohne
   * Eintrag im Quellenverzeichnis werden als fehlend zurückgegeben, statt sie
   * stillschweigend wegzulassen.
   *
   * Primärquellen und höhere Gütestufen stehen oben.
   */
  var RANG_ORDNUNG = ['Amtliche Primärquelle', 'Primärquelle',
                      'Primär-/Sekundärabgleich', 'Sekundärquelle'];

  function quellenZu(kanten) {
    var gefunden = {};
    var fehlend = {};
    kanten.forEach(function (k) {
      (k.quellen || []).forEach(function (q) {
        if (!gefunden[q.id]) gefunden[q.id] = { quelle: q, anzahl: 0 };
        gefunden[q.id].anzahl += 1;
      });
      (k.quellenFehlend || []).forEach(function (kennung) {
        fehlend[kennung] = (fehlend[kennung] || 0) + 1;
      });
    });
    var liste = Object.keys(gefunden).map(function (id) { return gefunden[id]; });
    liste.sort(function (a, b) {
      var ra = RANG_ORDNUNG.indexOf(a.quelle.rang), rb = RANG_ORDNUNG.indexOf(b.quelle.rang);
      if (ra !== rb) return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
      if (a.quelle.guete !== b.quelle.guete) return vergleicheText(a.quelle.guete, b.quelle.guete);
      return vergleicheText(a.quelle.herausgeber, b.quelle.herausgeber);
    });
    return {
      quellen: liste,
      fehlend: Object.keys(fehlend).sort().map(function (kennung) {
        return { kennung: kennung, anzahl: fehlend[kennung] };
      })
    };
  }

  /** Anzeigetext einer Quelle. Ohne Titel treten Herausgeber und Typ ein. */
  function quellenTitel(quelle) {
    if (quelle.titel) return quelle.titel;
    if (quelle.herausgeber && quelle.typ) return quelle.herausgeber + ' — ' + quelle.typ;
    if (quelle.herausgeber) return quelle.herausgeber;
    // Reference-only: die Datenlücke wird benannt, nicht die interne Kennung
    // als Titel ausgegeben.
    if (quelle.luecke) return 'Quellenangabe im Register noch nicht erfasst';
    return quelle.typ || quelle.id;
  }

  function sucheKnoten(modell, begriff) {
    var q = String(begriff || '').trim().toLowerCase();
    if (!q) return [];
    var treffer = [];
    modell.organisationen.forEach(function (o) {
      if ((o.name + ' ' + o.kurz + ' ' + o.id).toLowerCase().indexOf(q) !== -1) {
        treffer.push({ typ: 'organisation', id: o.id, name: o.name, organisation: o });
      }
    });
    var kanon = canonicalPersonKey(q);
    modell.personen.forEach(function (p) {
      var text = (p.varianten.join(' ') + ' ' + p.schluessel).toLowerCase();
      if (text.indexOf(q) !== -1 || (kanon && p.schluessel.indexOf(kanon) !== -1)) {
        treffer.push({
          typ: 'person', id: 'person:' + p.index, name: p.name, person: p,
          organisationen: p.organisationen.length
        });
      }
    });
    return treffer;
  }

  /** Personen, sortiert nach Zahl der Organisationen — für die Übersicht. */
  function personenUebersicht(modell, filter) {
    return modell.personen.map(function (person) {
      var kanten = person.kanten.filter(function (k) {
        return kanteSichtbar(k, filter) && organisationSichtbar(k.organisation, filter);
      });
      var organisationen = [];
      var rollen = [];
      kanten.forEach(function (k) {
        if (organisationen.indexOf(k.organisation) === -1) organisationen.push(k.organisation);
        if (k.rolle && rollen.indexOf(k.rolle) === -1) rollen.push(k.rolle);
      });
      return {
        person: person,
        anzahlOrganisationen: organisationen.length,
        organisationen: organisationen,
        rollen: rollen,
        kanten: kanten,
        parteien: person.parteien
      };
    }).filter(function (e) { return e.kanten.length > 0; })
      .sort(function (a, b) {
        if (b.anzahlOrganisationen !== a.anzahlOrganisationen) {
          return b.anzahlOrganisationen - a.anzahlOrganisationen;
        }
        return vergleicheText(a.person.name, b.person.name);
      });
  }

  return {
    baueModell: baueModell,
    baueNetz: baueNetz,
    bauePersonennetz: bauePersonennetz,
    personenUebersicht: personenUebersicht,
    PERSPEKTIVEN: PERSPEKTIVEN,
    baueOrganisationsnetz: baueOrganisationsnetz,
    personenZuOrganisation: personenZuOrganisation,
    organisationenZuPerson: organisationenZuPerson,
    quellenZu: quellenZu,
    quellenTitel: quellenTitel,
    sucheKnoten: sucheKnoten,
    standardFilter: standardFilter,
    erlaubteKlassen: erlaubteKlassen,
    kanteSichtbar: kanteSichtbar,
    organisationSichtbar: organisationSichtbar,
    projiziere: projiziere,
    canonicalPersonKey: canonicalPersonKey,
    G3_KLASSEN: G3_KLASSEN,
    G2_KLASSEN: G2_KLASSEN
  };
});
