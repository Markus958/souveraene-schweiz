/*!
 * ngo-daten.js — Adapter fuer das NGO-Fuehrungsnetz
 * souveraene-schweiz.ch
 *
 * Liest ngo-fuehrungsnetz.json (bereinigte Flatfile) und ngo-redaktion.json
 * (Fuehrungsmodelle, Fuehrungswechsel, Notizen, kuratierte Verbindungstypen)
 * und baut daraus das Anzeigemodell.
 *
 * Vier Belegebenen, streng getrennt:
 *   A aktuell        zwei strukturierte, aktuelle, verifizierte Rollen
 *   B eingeschraenkt zwei strukturierte Rollen, aber historisch, angekuendigt,
 *                    unaufgeloest oder noch zu verifizieren
 *   C altbestand     Paare der Vorgaengergrafik, vor Publikation zu pruefen
 *   D hinweis        nur redaktionell belegt — nie eine aktuelle Verbindung
 *
 * Reine Funktionen ohne DOM-Zugriff, damit dieselbe Logik getestet werden kann.
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else global.NgoDaten = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var AKTUELLE_ZEITSTATUS = ['reported_current', 'current_with_announced_change'];

  var EBENEN = {
    aktuell: { schluessel: 'aktuell', titel: 'aktuell bestätigt', standard: true },
    eingeschraenkt: { schluessel: 'eingeschraenkt', titel: 'strukturell belegt, eingeschränkt', standard: false },
    altbestand: { schluessel: 'altbestand', titel: 'Altbestand, zu verifizieren', standard: false },
    hinweis: { schluessel: 'hinweis', titel: 'nur redaktionell belegt', standard: false }
  };

  var ROLLENARTEN = {
    presidency: 'Präsidium',
    vice_presidency: 'Vizepräsidium',
    executive_leadership: 'Geschäftsleitung',
    board_or_governing_body: 'Vorstand oder Aufsichtsorgan',
    other_leadership_role: 'weitere Führungsrolle'
  };

  var ZEITSTATUS = {
    reported_current: 'aktuell gemeldet',
    current_with_announced_change: 'aktuell, Wechsel angekündigt',
    future_announced: 'angekündigt',
    historical: 'historisch'
  };

  var QUELLENARTEN = {
    organisation_or_other_source: 'Organisation oder andere Quelle',
    media_or_press_portal: 'Medien oder Presseportal',
    registry: 'Register',
    wikipedia: 'Wikipedia',
    mixed_including_wikipedia: 'gemischt, mit Wikipedia-Anteil'
  };

  var FLAGS = {
    explicit_verification_required: 'ausdrücklich zu verifizieren',
    source_from_2023_or_earlier: 'Quelle von 2023 oder älter',
    contains_wikipedia: 'Quelle enthält Wikipedia',
    partially_confirmed: 'teilweise bestätigt',
    person_not_identified: 'Person nicht ermittelt',
    role_inferred_from_source: 'Rolle aus der Quelle erschlossen'
  };

  var VERBINDUNGSTYPEN = {
    aktuelle_doppelfunktion: 'aktuelle Doppelfunktion',
    historische_funktion: 'historische Funktion',
    berufliche_verbindung: 'berufliche Verbindung',
    unterorganisation: 'Unterorganisation',
    strukturelle_allianz: 'strukturelle Allianz',
    teilweise_bestaetigt: 'teilweise bestätigte Verbindung'
  };

  function istAktuell(rolle) {
    return AKTUELLE_ZEITSTATUS.indexOf(rolle.temporalStatus) !== -1;
  }

  function hatFlag(rolle, name) {
    var flags = (rolle.source && rolle.source.flags) || [];
    return flags.indexOf(name) !== -1;
  }

  function istVerifiziert(rolle) {
    return !(rolle.source && rolle.source.verificationRequired) &&
      !hatFlag(rolle, 'explicit_verification_required') &&
      !hatFlag(rolle, 'partially_confirmed');
  }

  function vergleicheText(a, b) {
    return String(a).localeCompare(String(b), 'de-CH');
  }

  function paarSchluessel(a, b) {
    return a < b ? a + '|' + b : b + '|' + a;
  }

  /* ------------------------------------------------------------ Aufbau ---- */

  function baueModell(flat, redaktion) {
    redaktion = redaktion || {};

    var organisationen = {};
    flat.organisations.forEach(function (o) {
      organisationen[o.id] = {
        id: o.id,
        name: o.name,
        kurzname: o.shortName || o.name,
        rollen: [],
        fuehrungsmodell: (redaktion.fuehrungsmodell || {})[o.id] || null,
        fuehrungswechsel: (redaktion.fuehrungswechsel || {})[o.id] || null
      };
    });

    var personen = {};
    flat.persons.forEach(function (p) {
      personen[p.id] = {
        id: p.id,
        name: p.name,
        rollen: [],
        organisationen: [],
        notiz: (redaktion.verbindungsnotizen || {})[p.id] || null,
        imFuehrungsdatensatz: !!p.inLeadershipDataset,
        imAltbestand: !!p.inLegacyBridgeDataset
      };
    });

    var rollen = flat.roles.map(function (r) {
      var politik = r.politicalContext || {};
      var quelle = r.source || {};
      var rolle = {
        id: r.id,
        organisationId: r.organisationId,
        personId: r.personId,
        personName: r.personName,
        unaufgeloest: !!r.unresolvedPerson,
        funktion: r.function,
        rollenart: r.category,
        rollenartText: ROLLENARTEN[r.category] || r.category,
        zeitstatus: r.temporalStatus,
        zeitstatusText: ZEITSTATUS[r.temporalStatus] || r.temporalStatus,
        aktuell: istAktuell(r),
        politischesAmt: politik.raw || null,
        politischeEinstufung: politik.classification || 'none',
        parteien: politik.parties || [],
        politischesMandat: !!politik.explicitPoliticalOrParty,
        quelle: quelle.citation || null,
        quellenart: quelle.type || null,
        quellenartText: QUELLENARTEN[quelle.type] || quelle.type,
        abrufdatum: quelle.accessDate || null,
        zuVerifizieren: !!quelle.verificationRequired,
        flags: (quelle.flags || []).map(function (f) { return { schluessel: f, text: FLAGS[f] || f }; }),
        pruefstatus: r.review ? r.review.status : null,
        pruefdatum: r.review ? r.review.reviewedAt : null,
        verifiziert: istVerifiziert(r)
      };
      if (organisationen[rolle.organisationId]) organisationen[rolle.organisationId].rollen.push(rolle);
      if (personen[rolle.personId]) {
        personen[rolle.personId].rollen.push(rolle);
        if (personen[rolle.personId].organisationen.indexOf(rolle.organisationId) === -1) {
          personen[rolle.personId].organisationen.push(rolle.organisationId);
        }
      }
      return rolle;
    });

    Object.keys(organisationen).forEach(function (id) {
      organisationen[id].rollen.sort(function (a, b) {
        return vergleicheText(a.rollenartText + a.personName, b.rollenartText + b.personName);
      });
    });

    var verbindungen = baueVerbindungen(flat, redaktion, rollen, organisationen, personen);

    return {
      organisationen: organisationen,
      personen: personen,
      rollen: rollen,
      verbindungen: verbindungen,
      organisationenSortiert: Object.keys(organisationen).sort(function (a, b) {
        return vergleicheText(organisationen[a].name, organisationen[b].name);
      }),
      metadaten: flat.metadata || {},
      facetten: flat.facets || {},
      typBeschreibungen: redaktion.typBeschreibungen || {},
      ebenen: EBENEN,
      kennzahlen: kennzahlen(flat, rollen, verbindungen)
    };
  }

  /**
   * Baut die Organisationsverbindungen aller vier Ebenen.
   * Ebene A und B entstehen ausschliesslich aus strukturierten Rollen,
   * Ebene C aus dem Altbestand, Ebene D aus geprueften Redaktionshinweisen.
   */
  function baueVerbindungen(flat, redaktion, rollen, organisationen, personen) {
    var nachPaar = {};

    function eintrag(a, b, ebene) {
      var schluessel = paarSchluessel(a, b);
      if (!nachPaar[schluessel]) {
        nachPaar[schluessel] = {
          id: schluessel,
          quelle: schluessel.split('|')[0],
          ziel: schluessel.split('|')[1],
          ebene: ebene,
          personen: [],
          typen: [],
          belege: [],
          gruende: []
        };
      }
      return nachPaar[schluessel];
    }

    // --- Ebene A und B: aus strukturierten Rollen derselben Person ---
    Object.keys(personen).forEach(function (personId) {
      var person = personen[personId];
      var orgs = person.organisationen.slice().sort();
      for (var i = 0; i < orgs.length; i++) {
        for (var j = i + 1; j < orgs.length; j++) {
          var beteiligt = person.rollen.filter(function (r) {
            return r.organisationId === orgs[i] || r.organisationId === orgs[j];
          });
          var alleAktuell = beteiligt.every(function (r) { return r.aktuell; });
          var alleVerifiziert = beteiligt.every(function (r) { return r.verifiziert; });
          var unaufgeloest = beteiligt.some(function (r) { return r.unaufgeloest; });
          var ebene = (alleAktuell && alleVerifiziert && !unaufgeloest) ? 'aktuell' : 'eingeschraenkt';

          var v = eintrag(orgs[i], orgs[j], ebene);
          if (v.ebene === 'eingeschraenkt' && ebene === 'aktuell') v.ebene = 'aktuell';
          if (v.personen.indexOf(person.name) === -1) v.personen.push(person.name);
          v.rollenIds = (v.rollenIds || []).concat(beteiligt.map(function (r) { return r.id; }));

          var typ = alleAktuell && alleVerifiziert && !unaufgeloest
            ? 'aktuelle_doppelfunktion'
            : (beteiligt.some(function (r) { return r.zeitstatus === 'historical'; })
              ? 'historische_funktion' : 'teilweise_bestaetigt');
          if (v.typen.indexOf(typ) === -1) v.typen.push(typ);
        }
      }
    });

    // --- kuratierte Typen praezisieren die automatische Einstufung ---
    (redaktion.verbindungstypen || []).forEach(function (k) {
      var v = nachPaar[paarSchluessel(k.organisationA, k.organisationB)];
      if (!v) return;
      if (v.typen.indexOf(k.typ) === -1) v.typen.push(k.typ);
      if (k.beleg) v.belege.push(k.beleg);
    });

    // --- Ebene C: Altbestand ---
    ((flat.graph && flat.graph.legacyOrganisationBridges) || []).forEach(function (b) {
      var schluessel = paarSchluessel(b.organisationA, b.organisationB);
      if (nachPaar[schluessel]) {
        nachPaar[schluessel].auchImAltbestand = true;
        return;
      }
      var v = eintrag(b.organisationA, b.organisationB, 'altbestand');
      (b.personIds || []).forEach(function (pid) {
        var name = personen[pid] ? personen[pid].name : null;
        if (name && v.personen.indexOf(name) === -1) v.personen.push(name);
      });
      if (v.typen.indexOf('teilweise_bestaetigt') === -1) v.typen.push('teilweise_bestaetigt');
    });

    // --- Ebene D: redaktionelle Hinweise ---
    (redaktion.redaktionelleHinweise || []).forEach(function (h) {
      if (!h.organisationA || !h.organisationB) return;   // kein Paar -> nur Notiz
      var schluessel = paarSchluessel(h.organisationA, h.organisationB);
      if (nachPaar[schluessel]) {                          // schon strukturell belegt
        if (h.beleg) nachPaar[schluessel].belege.push(h.beleg);
        return;
      }
      var v = eintrag(h.organisationA, h.organisationB, 'hinweis');
      if (v.personen.indexOf(h.person) === -1) v.personen.push(h.person);
      if (v.typen.indexOf(h.typ) === -1) v.typen.push(h.typ);
      if (h.beleg) v.belege.push(h.beleg);
      if (h.grund) v.gruende.push(h.grund);
    });

    return Object.keys(nachPaar).sort(vergleicheText).map(function (k) {
      var v = nachPaar[k];
      v.personen.sort(vergleicheText);
      v.typenText = v.typen.map(function (t) { return VERBINDUNGSTYPEN[t] || t; });
      return v;
    });
  }

  function kennzahlen(flat, rollen, verbindungen) {
    function zaehle(ebene) {
      return verbindungen.filter(function (v) { return v.ebene === ebene; }).length;
    }
    var orgsMitAktuell = {};
    verbindungen.forEach(function (v) {
      if (v.ebene !== 'aktuell') return;
      orgsMitAktuell[v.quelle] = true;
      orgsMitAktuell[v.ziel] = true;
    });
    return {
      organisationen: flat.organisations.length,
      rollen: rollen.length,
      personen: flat.persons.length,
      aktuelleRollen: rollen.filter(function (r) { return r.aktuell; }).length,
      zuVerifizieren: rollen.filter(function (r) { return !r.verifiziert; }).length,
      politischeMandate: rollen.filter(function (r) { return r.politischesMandat; }).length,
      verbindungenAktuell: zaehle('aktuell'),
      verbindungenEingeschraenkt: zaehle('eingeschraenkt'),
      verbindungenAltbestand: zaehle('altbestand'),
      verbindungenHinweis: zaehle('hinweis'),
      organisationenMitAktuellerBruecke: Object.keys(orgsMitAktuell).length,
      datenstand: (flat.metadata || {}).dataAsOf || null
    };
  }

  /* ------------------------------------------------------------ Filter ---- */

  function standardFilter() {
    return {
      ebenen: { aktuell: true, eingeschraenkt: false, altbestand: false, hinweis: false },
      zeitstatus: { reported_current: true, current_with_announced_change: true,
                    future_announced: false, historical: false },
      nurPolitischeMandate: false,
      partei: '',
      rollenart: '',
      verbindungstyp: '',
      verifizierung: 'alle'   // alle | verifiziert | offen
    };
  }

  /** Prueft, ob eine Rolle den aktiven Filtern entspricht. */
  function rolleSichtbar(rolle, filter) {
    if (!filter.zeitstatus[rolle.zeitstatus]) return false;
    if (filter.nurPolitischeMandate && !rolle.politischesMandat) return false;
    if (filter.partei && rolle.parteien.indexOf(filter.partei) === -1) return false;
    if (filter.rollenart && rolle.rollenart !== filter.rollenart) return false;
    if (filter.verifizierung === 'verifiziert' && !rolle.verifiziert) return false;
    if (filter.verifizierung === 'offen' && rolle.verifiziert) return false;
    return true;
  }

  /**
   * Organisationsansicht: nur Organisationen mit sichtbarer Verbindung.
   * Fuehrungspersonen werden erst beim Anklicken eingeblendet — der
   * Gesamtgraph aller Rollen wird nie auf einmal gezeichnet.
   */
  function baueOrganisationsnetz(modell, filter) {
    var kanten = modell.verbindungen.filter(function (v) {
      if (!filter.ebenen[v.ebene]) return false;
      if (filter.verbindungstyp && v.typen.indexOf(filter.verbindungstyp) === -1) return false;
      if (filter.partei || filter.rollenart || filter.nurPolitischeMandate ||
          filter.verifizierung !== 'alle') {
        var passt = v.personen.some(function (name) {
          return personRollenPassen(modell, name, v, filter);
        });
        if (!passt) return false;
      }
      return true;
    });

    var beteiligt = {};
    kanten.forEach(function (k) { beteiligt[k.quelle] = true; beteiligt[k.ziel] = true; });

    var knoten = Object.keys(beteiligt).sort(vergleicheText).map(function (id) {
      var org = modell.organisationen[id];
      return {
        id: id, typ: 'organisation', name: org.kurzname, vollname: org.name, ngoId: id
      };
    });

    return { knoten: knoten, kanten: kanten.map(function (k) {
      return {
        id: k.id, quelle: k.quelle, ziel: k.ziel, ebene: k.ebene,
        personen: k.personen, typen: k.typen, typenText: k.typenText,
        belege: k.belege, gruende: k.gruende
      };
    }) };
  }

  function personRollenPassen(modell, personName, verbindung, filter) {
    var person = null;
    Object.keys(modell.personen).forEach(function (id) {
      if (modell.personen[id].name === personName) person = modell.personen[id];
    });
    if (!person) return filter.verifizierung !== 'verifiziert';
    return person.rollen.some(function (r) {
      return (r.organisationId === verbindung.quelle || r.organisationId === verbindung.ziel) &&
        rolleSichtbar(r, filter);
    });
  }

  /** Fuehrungspersonen einer Organisation, gefiltert — fuer das Aufklappen. */
  function personenZuOrganisation(modell, organisationId, filter) {
    var org = modell.organisationen[organisationId];
    if (!org) return [];
    return org.rollen.filter(function (r) { return rolleSichtbar(r, filter); });
  }

  function sucheKnoten(modell, begriff) {
    var q = String(begriff || '').trim().toLowerCase();
    if (!q) return [];
    var treffer = [];
    modell.organisationenSortiert.forEach(function (id) {
      var o = modell.organisationen[id];
      if (o.name.toLowerCase().indexOf(q) !== -1 || o.kurzname.toLowerCase().indexOf(q) !== -1 ||
          id.toLowerCase().indexOf(q) !== -1) {
        treffer.push({ id: id, typ: 'organisation', name: o.kurzname });
      }
    });
    Object.keys(modell.personen).forEach(function (id) {
      var p = modell.personen[id];
      if (p.name.toLowerCase().indexOf(q) !== -1) {
        treffer.push({ id: id, typ: 'person', name: p.name, organisationen: p.organisationen });
      }
    });
    return treffer;
  }

  return {
    baueModell: baueModell,
    baueOrganisationsnetz: baueOrganisationsnetz,
    personenZuOrganisation: personenZuOrganisation,
    rolleSichtbar: rolleSichtbar,
    standardFilter: standardFilter,
    sucheKnoten: sucheKnoten,
    ROLLENARTEN: ROLLENARTEN,
    ZEITSTATUS: ZEITSTATUS,
    QUELLENARTEN: QUELLENARTEN,
    FLAGS: FLAGS,
    VERBINDUNGSTYPEN: VERBINDUNGSTYPEN,
    EBENEN: EBENEN
  };
});
