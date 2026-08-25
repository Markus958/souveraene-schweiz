/*!
 * ngo-netz-seite.js — Verdrahtung der NGO-Netzwerkseite
 * souveraene-schweiz.ch
 *
 * Verbindet Daten, Ansicht und Bedienelemente und hält den Zustand in der URL,
 * damit ein Knoten samt Filter verlinkt werden kann.
 */
(function () {
  'use strict';

  // Der Datenpfad steht am Hauptelement (data-quelle), damit die Seite
  // verschoben werden kann, ohne das Modul anzufassen.
  var PFAD = (function () {
    var haupt = document.getElementById('nn');
    return (haupt && haupt.getAttribute('data-quelle')) || 'assets/ngo/ngo-netzwerk.json';
  })();

  var N = window.NgoNetzDaten;
  var modell = null;
  var ansicht = null;
  var zustandSetzenLaeuft = false;

  function id(name) { return document.getElementById(name); }

  // Ebene der Darstellung. «cluster» ohne Fokus ist der Einstieg, ein gesetzter
  // Fokus zeigt einen Cluster, «organisation» das Gesamtnetz.
  var ebeneZustand = { ebene: 'cluster', cluster: null, person: null };

  // Wer aus einem Personenfokus heraus eine Organisation oeffnet, verlaesst
  // den Fokus. Ohne gemerkte Herkunft gaebe es keinen Weg zurueck: Der
  // Zustand steht per replaceState in der Adresse, die Zuruecktaste des
  // Browsers hilft also nicht.
  var herkunftPerson = null;

  function setzeEbene(ebene, cluster, person) {
    // Ein neuer Personenfokus loescht die gemerkte Herkunft: Sie zeigte sonst
    // auf eine Person, die man gerade verlassen hat.
    var neuerFokus = person !== undefined && person !== null && person !== '';
    if (neuerFokus) {
      herkunftPerson = null;
      // Im Fokus einer Person geht es um ihre Mandate, nicht um die Projektion
      // zwischen Organisationen. Das Kernnetz verbirgt hier bloss einen Teil
      // davon — bei Barbara Gysi 26 von 37. Deshalb sind beim Eintritt alle
      // Beziehungsarten an; einschraenken laesst es sich weiterhin.
      setzeAnsicht('G2');
      ['kN1', 'kN2', 'kN3', 'kN4'].forEach(function (k) { id(k).checked = true; });
    }
    ebeneZustand.ebene = ebene;
    ebeneZustand.cluster = (cluster === undefined || cluster === '') ? null : cluster;
    ebeneZustand.person = (person === undefined || person === '') ? null : person;
    if (ansicht) {
      ansicht.fokus = null;
      ansicht.setzeFilter(aktuellerFilter());
      zeigeDetail(null);
    }
    zeichneBrotkrumen();
    synchronisiereBedienung();
    schreibeZustand();
  }

  /**
   * Brotkrumen: zeigt die Ebene und ist der Rückweg. Jeder Teil ausser dem
   * letzten ist anklickbar.
   */
  function zeichneBrotkrumen() {
    var leiste = id('nnBrotkrumen');
    leiste.textContent = '';
    if (!modell) return;

    var stufen = [];
    if (ebeneZustand.ebene === 'organisation') {
      stufen.push({ text: 'Alle Cluster', ziel: function () { setzeEbene('cluster', null); } });
      stufen.push({ text: 'Alle Organisationen', ziel: null });
    } else {
      stufen.push({
        text: 'Alle Cluster',
        ziel: ebeneZustand.cluster === null ? null
          : function () { setzeEbene('cluster', null); }
      });
      if (ebeneZustand.cluster !== null) {
        var c = modell.cluster[ebeneZustand.cluster];
        stufen.push({ text: c ? c.id + ' — ' + c.label : 'Cluster ' + ebeneZustand.cluster,
                      ziel: ebeneZustand.person === null ? null : (function (id) {
                        return function () { setzeEbene('cluster', id, null); };
                      })(ebeneZustand.cluster) });
      }
    }
    if (ebeneZustand.person !== null) {
      var person = modell.personen[Number(ebeneZustand.person)];
      stufen.push({ text: person ? person.name : 'Person', ziel: null });
    }

    stufen.forEach(function (stufe, i) {
      if (i > 0) leiste.appendChild(knoten('span', 'ngo-brotkrume-trenner', '›'));
      if (stufe.ziel) {
        var knopf = knoten('button', 'ngo-brotkrume', stufe.text);
        knopf.type = 'button';
        knopf.addEventListener('click', stufe.ziel);
        leiste.appendChild(knopf);
      } else {
        leiste.appendChild(knoten('span', 'ngo-brotkrume ngo-brotkrume--hier', stufe.text));
      }
    });

    var rechts = knoten('span', 'ngo-brotkrume-rechts');
    if (herkunftPerson !== null && ebeneZustand.person === null) {
      var herkunft = modell.personen[Number(herkunftPerson)];
      var zurueck = knoten('button', 'ngo-brotkrume-wechsel',
        '↩ zurück zu ' + (herkunft ? herkunft.name : 'der Person'));
      zurueck.type = 'button';
      zurueck.addEventListener('click', function () {
        var index = herkunftPerson;
        setzeEbene(ebeneZustand.ebene, ebeneZustand.cluster, index);
      });
      rechts.appendChild(zurueck);
    }
    if (ebeneZustand.ebene !== 'organisation') {
      var wechsel = knoten('button', 'ngo-brotkrume-wechsel', 'Alle Organisationen');
      wechsel.type = 'button';
      wechsel.addEventListener('click', function () { setzeEbene('organisation', null); });
      rechts.appendChild(wechsel);
    }
    leiste.appendChild(rechts);
  }

  /**
   * Abschnitt für die Organisationen, die in keinem Netz erscheinen können.
   * Er steht bei den übrigen Tabellen und ist wie sie aufklappbar — über der
   * Grafik verdrängte er das Netz, obwohl er eine Randbedingung beschreibt
   * und keine Bedienhilfe ist.
   */
  function zeigeOhneBeziehung() {
    var zahl = (modell.meta.zahlen || {}).abdeckungsluecken || 0;
    var abschnitt = id('nnOhneBeziehung');
    if (!zahl) { abschnitt.hidden = true; return; }
    abschnitt.hidden = false;
    id('nnOhneBeziehungTitel').textContent =
      zahl + ' Organisationen ohne erfasste Beziehung anzeigen';
    id('nnOhneBeziehungText').textContent = zahl + ' Organisationen haben keine erfasste ' +
      'Beziehung und erscheinen deshalb in keinem Netz — das ist eine Abdeckungslücke der ' +
      'Erhebung, kein Nachweis fehlender Vernetzung.';

    var koerper = id('nnTabelleLuecken').querySelector('tbody');
    koerper.textContent = '';
    var teil = document.createDocumentFragment();
    modell.organisationen.filter(function (o) { return o.abdeckungsluecke; })
      .slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'de-CH'); })
      .forEach(function (o) {
        var zeile = document.createElement('tr');
        zeile.appendChild(organisationsZelle(o));
        [o.kategorieLabel, o.unterkategorie, o.sitz].forEach(function (wert) {
          zeile.appendChild(knoten('td', null, wert || ''));
        });
        teil.appendChild(zeile);
      });
    koerper.appendChild(teil);
  }

  /**
   * Tabellenzelle mit anklickbarem Organisationsnamen: der Klick wählt die
   * Organisation in der Grafik an und rollt dorthin.
   */
  function organisationsZelle(organisation) {
    var zelle = document.createElement('td');
    var knopf = knoten('button', 'ngo-org-verweis', organisation.name);
    knopf.type = 'button';
    knopf.title = organisation.name + ' in der Grafik zeigen';
    knopf.addEventListener('click', function () { zeigeInGrafik(organisation); });
    zelle.appendChild(knopf);
    return zelle;
  }

  /**
   * Organisation in der Grafik anwählen und sichtbar machen. Auf der
   * Clusterebene und im Personenfokus steht sie gar nicht im Bild — dann wird
   * zuerst aufs Gesamtnetz gewechselt, sonst ginge der Klick ins Leere.
   */
  function zeigeInGrafik(organisation) {
    if (ebeneZustand.ebene !== 'organisation' || ebeneZustand.person !== null) {
      var herkunft = ebeneZustand.person;
      setzeEbene('organisation', null, null);
      if (herkunft !== null) herkunftPerson = herkunft;
    }
    ansicht.springeZu(organisation.id);
    var buehne = id('nnBuehne');
    if (buehne && buehne.scrollIntoView) {
      buehne.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  /**
   * Kachel über der Grafik, wenn etwas nicht im Bild steht. Die Statuszeile
   * sagt es Screenreadern; sichtbar muss es ebenso stehen, sonst wirkt eine
   * Person mit weniger Organisationen erfasst, als sie ist, oder ein
   * begrenztes Netz wie das ganze.
   */
  var hinweisAktion = null;

  /**
   * Die Bedienhilfe gilt nur, solange ein Netzbild steht. Bei einer Liste
   * wuerde sie zu etwas anleiten, das es dort nicht gibt.
   */
  function setzeBedienText(netz) {
    var feld = id('nnBedienText');
    if (!feld) return;
    feld.textContent = (netz && netz.alsListe)
      ? 'Eintrag anklicken öffnet ihn.'
      : 'Organisation anklicken zeigt Details. Ziehen verschiebt, Mausrad zoomt.';
  }

  function zeigeNetzHinweis(netz) {
    setzeBedienText(netz);
    var kachel = id('nnFokusHinweis');
    var text = id('nnFokusHinweisText');
    var knopf = id('nnFokusHinweisKnopf');

    if (netz && netz.ebene === 'personfokus' && netz.ausgeblendet) {
      hinweisAktion = 'erweitern';
      kachel.hidden = false;
      text.textContent = netz.ausgeblendet + ' von ' + netz.erfasst +
        ' erfassten Organisationen sind durch die gewählte Beziehungsart ' +
        'ausgeblendet und stehen nicht im Bild.';
      knopf.textContent = 'alle Beziehungen zeigen';
      return;
    }

    if (netz && netz.aufAuswahl && netz.auswahlAusgeblendet) {
      var gewaehlt = null;
      netz.knoten.forEach(function (k) { if (k.id === netz.aufAuswahl) gewaehlt = k; });
      hinweisAktion = 'auswahlLoesen';
      kachel.hidden = false;
      text.textContent = 'Gezeigt werden ' + (netz.knoten.length - 1) + ' mit ' +
        (gewaehlt ? gewaehlt.name : 'der Auswahl') + ' verbundene Organisationen. ' +
        netz.auswahlAusgeblendet + ' Organisationen ohne Verbindung dazu sind ausgeblendet.';
      knopf.textContent = 'Auswahl aufheben';
      return;
    }

    if (netz && netz.unverbundenAusgeblendet) {
      hinweisAktion = 'alleZeigen';
      kachel.hidden = false;
      text.textContent = netz.unverbundenAusgeblendet + ' Organisationen haben unter ' +
        'diesem Filter keine Verbindung und sind ausgeblendet — das heisst nicht, ' +
        'dass sie unvernetzt wären.';
      knopf.textContent = 'auch sie zeigen';
      return;
    }

    hinweisAktion = null;
    kachel.hidden = true;
  }

  function knoten(tag, klasse, text) {
    var k = document.createElement(tag);
    if (klasse) k.className = klasse;
    if (text !== undefined && text !== null) k.textContent = text;
    return k;
  }

  function zeigeFehler(text) {
    var b = id('nnFehler');
    b.hidden = false;
    b.className = 'nv-fehler';
    b.textContent = text;
  }

  function formatiereDatum(wert) {
    if (!wert) return '–';
    var t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(wert);
    return t ? t[3] + '.' + t[2] + '.' + t[1] : wert;
  }

  /* ------------------------------------------------------- Kennzahlen ---- */

  /**
   * Die Zahlen in den Erklärungstexten kommen aus den Daten, nicht aus dem
   * Markup — sonst veralten sie beim nächsten Datenstand unbemerkt.
   */
  function fuelleZahlen() {
    var zahlen = (modell.meta && modell.meta.zahlen) || {};
    Array.prototype.slice.call(document.querySelectorAll('[data-zahl]')).forEach(function (e) {
      var wert = zahlen[e.getAttribute('data-zahl')];
      if (wert !== undefined && wert !== null) e.textContent = wert;
    });
  }

  /**
   * Die Kennzahlenzeile steht nur noch im Cockpit — auf dieser Seite
   * wiederholte sie dieselben sechs Werte über jeder Ansicht.
   */
  function fuelleKennzahlen() {
    var k = modell.kennzahlen;
    // Kurzform: Version und Stand, wie der Auftrag es verlangt. Die lange
    // Bezeichnung des Pakets steht im Erklaerungsfenster und in der Quellenzeile.
    var version = (modell.meta.masterVersion || '').split('–')[0].trim();
    id('nnVersion').textContent = version
      ? 'Version ' + version + ' · Stand ' + formatiereDatum(k.datenstand)
      : '';
  }

  /* ------------------------------------------------------ Bedienelemente - */

  function fuelleAuswahlfelder() {
    // Kategorien in gelieferter Reihenfolge; der Wert ist die category_id,
    // angezeigt wird das deutsche Label.
    modell.kategorien.forEach(function (k) {
      var e = document.createElement('option');
      e.value = k.id;
      e.textContent = k.label;
      id('fKategorie').appendChild(e);
    });

    modell.clusterListe.forEach(function (c) {
      var e = document.createElement('option');
      e.value = c.id;
      e.textContent = c.id + ' — ' + c.label + ' (' + c.groesse + ')';
      id('fCluster').appendChild(e);
    });
    var rest = document.createElement('option');
    rest.value = '0';
    rest.textContent = '0 — kein Hauptcluster (' + modell.cluster[0].groesse + ')';
    id('fCluster').appendChild(rest);

    Object.keys(modell.parteien).sort().forEach(function (p) {
      var e = document.createElement('option');
      e.value = p;
      e.textContent = p + ' (' + modell.parteien[p] + ')';
      id('fPartei').appendChild(e);
    });
  }

  function aktuellerFilter() {
    var historie = id('nnHistorie').checked;
    var ansichtWert = id('nnG2').getAttribute('aria-pressed') === 'true' ? 'G2' : 'G3';
    return {
      perspektive: id('nnPerspPers').getAttribute('aria-pressed') === 'true'
        ? 'person' : 'organisation',
      ebene: ebeneZustand.ebene,
      clusterFokus: ebeneZustand.cluster,
      personFokus: ebeneZustand.person,
      personenSchwelle: parseInt(id('fSchwelle').value, 10) || 2,
      ansicht: ansichtWert,
      historie: historie,
      klassen: {
        N1: id('kN1').checked, N2: id('kN2').checked,
        N3: id('kN3').checked, N4: id('kN4').checked
      },
      kategorie: id('fKategorie').value,
      cluster: id('fCluster').value,
      partei: id('fPartei').value,
      farbe: id('fFarbe').value,
      nurLuecken: id('nnLuecken').checked,
      nurVerbunden: id('nnNurVerbunden').checked
    };
  }

  /** N4 ist nur in G2 zulässig — das Kästchen bleibt in G3 gesperrt. */
  function synchronisiereBedienung() {
    var g2 = id('nnG2').getAttribute('aria-pressed') === 'true';
    var historie = id('nnHistorie').checked;
    var person = id('nnPerspPers').getAttribute('aria-pressed') === 'true';

    // Die Historie hat kein Personennetz: das Paket enthaelt dazu nur Zahlen.
    id('nnPerspOrg').disabled = historie;
    id('nnPerspPers').disabled = historie;
    id('nnSchwelleFeld').hidden = !person || historie;
    id('nnPersonHinweis').hidden = !person || historie;
    id('nnLegendePerson').hidden = !person || historie;
    id('kN4').disabled = !g2 || historie;
    if (!g2) id('kN4').checked = false;
    ['kN1', 'kN2', 'kN3', 'fPartei'].forEach(function (f) { id(f).disabled = historie; });
    id('nnHistorieHinweis').hidden = !historie;
    var imPersonenfokus = ebeneZustand.person !== null;
    var aufClusterebene = ebeneZustand.ebene === 'cluster' && ebeneZustand.cluster === null
      && !historie && !person && !imPersonenfokus;
    id('nnLegendeEbene').hidden = !aufClusterebene;
    // Auf der Clusterebene ist der Clusterfilter die Navigation selbst.
    id('fCluster').disabled = aufClusterebene;
    id('fFarbe').disabled = aufClusterebene;
    id('nnLegendeKategorie').hidden = aufClusterebene || id('fFarbe').value !== 'kategorie';
    if (id('nnFilterLage')) beschreibeFilter();
  }

  function filterGeaendert() {
    synchronisiereBedienung();
    ansicht.setzeFilter(aktuellerFilter());
    zeichneBrotkrumen();
    zeigeDetail(null);
    if (id('nnSuche').value) ansicht.setzeSuche(id('nnSuche').value);
    schreibeZustand();
  }

  /* ------------------------------------------------------------- URL ----- */

  function schreibeZustand() {
    if (zustandSetzenLaeuft || !window.history || !window.history.replaceState) return;
    var f = aktuellerFilter();
    var p = new URLSearchParams();
    if (ebeneZustand.ebene !== 'cluster') p.set('ebene', ebeneZustand.ebene);
    if (ebeneZustand.cluster !== null) p.set('fokus', String(ebeneZustand.cluster));
    if (ebeneZustand.person !== null) p.set('person', String(ebeneZustand.person));
    if (f.perspektive !== 'organisation') p.set('perspektive', f.perspektive);
    if (f.personenSchwelle !== 2) p.set('schwelle', String(f.personenSchwelle));
    if (f.ansicht !== 'G3') p.set('ansicht', f.ansicht);
    if (f.historie) p.set('historie', '1');
    if (f.kategorie) p.set('kategorie', f.kategorie);
    if (f.cluster !== '') p.set('cluster', f.cluster);
    if (f.partei) p.set('partei', f.partei);
    if (f.farbe !== 'cluster') p.set('farbe', f.farbe);
    if (f.nurLuecken) p.set('luecken', '1');
    if (f.nurVerbunden) p.set('verbunden', '1');
    var klassen = ['N1', 'N2', 'N3', 'N4'].filter(function (k) { return f.klassen[k]; });
    if (klassen.join(',') !== 'N1,N2,N3') p.set('klassen', klassen.join(','));
    if (ansicht && ansicht.auswahl && ansicht.auswahl.indexOf('kante:') !== 0) {
      p.set('knoten', ansicht.auswahl);
    }
    if (id('nnSuche').value) p.set('suche', id('nnSuche').value);
    var text = p.toString();
    window.history.replaceState(null, '', text ? '?' + text : window.location.pathname);
  }

  function lieseZustand() {
    var p = new URLSearchParams(window.location.search);
    zustandSetzenLaeuft = true;
    if (p.get('ebene') === 'organisation') ebeneZustand.ebene = 'organisation';
    if (p.get('fokus')) ebeneZustand.cluster = p.get('fokus');
    if (p.get('person')) {
      ebeneZustand.person = p.get('person');
      // Wie beim Klick: Im Personenfokus geht es um die Mandate einer Person,
      // nicht um die Projektion. Nennt die Adresse keine eigene Einstellung,
      // stehen alle Beziehungsarten offen — sonst verbirgt das Kernnetz einen
      // Grossteil davon.
      if (p.get('ansicht') === null && p.get('klassen') === null) {
        setzeAnsicht('G2');
        ['kN1', 'kN2', 'kN3', 'kN4'].forEach(function (k) { id(k).checked = true; });
      }
    }
    if (p.get('perspektive') === 'person') setzePerspektive('person');
    if (p.get('schwelle')) id('fSchwelle').value = p.get('schwelle');
    if (p.get('ansicht') === 'G2') setzeAnsicht('G2');
    if (p.get('historie') === '1') id('nnHistorie').checked = true;
    if (p.get('luecken') === '1') id('nnLuecken').checked = true;
    if (p.get('verbunden') === '1') id('nnNurVerbunden').checked = true;
    if (p.get('kategorie')) id('fKategorie').value = p.get('kategorie');
    if (p.get('cluster') !== null) id('fCluster').value = p.get('cluster');
    if (p.get('partei')) id('fPartei').value = p.get('partei');
    if (p.get('farbe')) id('fFarbe').value = p.get('farbe');
    if (p.get('suche')) id('nnSuche').value = p.get('suche');
    if (p.get('klassen') !== null) {
      var gewaehlt = p.get('klassen').split(',');
      ['N1', 'N2', 'N3', 'N4'].forEach(function (k) {
        id('k' + k).checked = gewaehlt.indexOf(k) !== -1;
      });
    }
    zustandSetzenLaeuft = false;
    return p.get('knoten');
  }

  function setzePerspektive(wert) {
    id('nnPerspOrg').setAttribute('aria-pressed', wert === 'organisation' ? 'true' : 'false');
    id('nnPerspPers').setAttribute('aria-pressed', wert === 'person' ? 'true' : 'false');
  }

  function setzeAnsicht(wert) {
    id('nnG3').setAttribute('aria-pressed', wert === 'G3' ? 'true' : 'false');
    id('nnG2').setAttribute('aria-pressed', wert === 'G2' ? 'true' : 'false');
  }

  /* ------------------------------------------------------ Detailspalte --- */

  function abschnitt(ziel, titel, inhalt) {
    if (!inhalt) return;
    ziel.appendChild(knoten('p', 'ngo-detail-titel', titel));
    if (typeof inhalt === 'string') ziel.appendChild(knoten('p', 'ngo-detail-text', inhalt));
    else ziel.appendChild(inhalt);
  }

  function marke(text, art) {
    return knoten('span', 'ngo-marke' + (art ? ' ngo-marke--' + art : ''), text);
  }

  /**
   * Personen einer Organisation, nach Person gruppiert. Das Datenpaket enthält
   * je Rolle und Quelle eine eigene Zeile und teilweise vollständig doppelte
   * Zeilen; ungruppiert stünde dieselbe Person mehrfach untereinander.
   */
  function personenListe(kanten) {
    var nachPerson = [];
    var index = {};
    kanten.forEach(function (k) {
      var eintrag = index[k.person.index];
      if (!eintrag) {
        eintrag = index[k.person.index] = {
          person: k.person, anzeige: k.anzeige, kanten: [], rollen: [], parteien: []
        };
        nachPerson.push(eintrag);
      }
      eintrag.kanten.push(k);
      var rolle = (k.rolle || '') + '|' + k.klasse;
      if (eintrag.rollen.every(function (r) { return r.schluessel !== rolle; })) {
        eintrag.rollen.push({ schluessel: rolle, text: k.rolle, klasse: k.klasse });
      }
      if (k.partei && eintrag.parteien.indexOf(k.partei) === -1) eintrag.parteien.push(k.partei);
    });

    var liste = knoten('ul', 'ngo-rollen');
    nachPerson.forEach(function (eintragDaten) {
      var eintrag = document.createElement('li');
      var knopf = knoten('button', 'nv-detail-link', eintragDaten.anzeige);
      knopf.type = 'button';
      knopf.addEventListener('click', function () {
        zeigePerson(eintragDaten.person, eintragDaten.kanten[0]);
      });
      eintrag.appendChild(knopf);
      eintragDaten.rollen.forEach(function (r) {
        if (r.text) eintrag.appendChild(knoten('span', 'ngo-rolle-funktion', r.text));
      });
      var marken = knoten('span', 'ngo-marken');
      var klassen = [];
      eintragDaten.rollen.forEach(function (r) {
        if (klassen.indexOf(r.klasse) === -1) klassen.push(r.klasse);
      });
      klassen.sort().forEach(function (k) { marken.appendChild(marke(k, 'zeit')); });
      eintragDaten.parteien.forEach(function (p) { marken.appendChild(marke(p, 'partei')); });
      var quellen = N.quellenZu(eintragDaten.kanten).quellen;
      if (quellen.length) marke_quelle(marken, quellen[0].quelle, quellen.length);
      eintrag.appendChild(marken);
      liste.appendChild(eintrag);
    });
    return liste;
  }

  function verbindungsListe(organisationId) {
    if (!ansicht.netz || ansicht.netz.historie) return null;
    var kanten = ansicht.netz.kanten.filter(function (k) {
      return k.art !== 'rolle' && (k.quelle === organisationId || k.ziel === organisationId);
    });
    if (!kanten.length) return null;
    var liste = knoten('ul', 'ngo-verbindungen');
    kanten.sort(function (a, b) { return b.gewicht - a.gewicht; }).forEach(function (v) {
      var andereId = v.quelle === organisationId ? v.ziel : v.quelle;
      var andere = modell.orgNachId[andereId];
      var eintrag = document.createElement('li');
      var knopf = knoten('button', 'nv-detail-link', andere ? andere.name : andereId);
      knopf.type = 'button';
      knopf.addEventListener('click', function () {
        if (andere) zeigeInGrafik(andere); else ansicht.springeZu(andereId);
      });
      eintrag.appendChild(knopf);
      var art = v.art === 'direkt' ? 'direkt erfasste Beziehung'
        : (v.art === 'beides' ? 'direkt erfasst und über gemeinsame Personen'
          : 'über gemeinsam erfasste Personen');
      eintrag.appendChild(knoten('span', 'ngo-detail-via', art));
      if (v.personen.length) {
        eintrag.appendChild(knoten('span', 'ngo-detail-via',
          v.personen.map(function (p) { return p.name; }).join(', ')));
      }
      var marken = knoten('span', 'ngo-marken');
      marken.appendChild(marke('Gewicht ' + v.gewicht, 'typ'));
      eintrag.appendChild(marken);
      liste.appendChild(eintrag);
    });
    return liste;
  }

  /**
   * Quellenkarte: sichtbar sind Herausgeber, Titel, Quellentyp, Rang, Güte und
   * Datum. Die interne Kennung steht nur im aufklappbaren Auditbereich und ist
   * nie die einzige Angabe. Ohne URL wird kein Link erfunden.
   */
  function quellenKarte(eintrag) {
    var q = eintrag.quelle;
    var karte = knoten('li', 'ngo-quelle');

    if (q.herausgeber) karte.appendChild(knoten('span', 'ngo-quelle-herausgeber', q.herausgeber));
    karte.appendChild(knoten('span', 'ngo-quelle-titel', N.quellenTitel(q)));

    var meta = [q.typ, q.rang, q.guete, q.datum || q.jahr].filter(Boolean);
    if (eintrag.anzahl > 1) meta.push(eintrag.anzahl + ' Belege');
    karte.appendChild(knoten('span', 'ngo-quelle-meta', meta.join(' · ')));

    if (q.url) {
      var link = document.createElement('a');
      link.className = 'ngo-quelle-link';
      link.href = q.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Quelle öffnen';
      karte.appendChild(link);
    } else {
      karte.appendChild(knoten('span', 'ngo-quelle-ohnelink', 'ohne Online-Fassung'));
    }

    var audit = document.createElement('details');
    audit.className = 'ngo-quelle-audit';
    var titel = document.createElement('summary');
    titel.textContent = 'Interne Referenz';
    audit.appendChild(titel);
    var zeilen = [['Quellenkennung', q.id], ['Organisation', q.organisationId],
                  ['Dokumentnummer', q.dokumentNr], ['Abschnitt', q.abschnitt],
                  ['Berichtsjahr', q.jahr], ['Abgerufen', q.abgerufen],
                  ['Eignung', q.eignung], ['Archiv', q.archiv]];
    var liste = knoten('ul', 'ngo-quelle-auditliste');
    zeilen.forEach(function (paar) {
      if (!paar[1]) return;
      var zeile = document.createElement('li');
      zeile.appendChild(knoten('span', 'ngo-quelle-auditfeld', paar[0]));
      zeile.appendChild(document.createTextNode(paar[1]));
      liste.appendChild(zeile);
    });
    audit.appendChild(liste);
    karte.appendChild(audit);
    return karte;
  }

  function quellenListe(kanten) {
    var ergebnis = N.quellenZu(kanten);
    if (!ergebnis.quellen.length && !ergebnis.fehlend.length) return null;
    var liste = knoten('ul', 'ngo-quellen');
    ergebnis.quellen.forEach(function (eintrag) {
      liste.appendChild(quellenKarte(eintrag));
    });
    ergebnis.fehlend.forEach(function (eintrag) {
      var karte = knoten('li', 'ngo-quelle ngo-quelle--fehlt');
      karte.appendChild(knoten('span', 'ngo-quelle-titel',
        modell.meta.hinweise.quelleFehlt || 'Quellenangabe im Datenexport nicht gefunden'));
      karte.appendChild(knoten('span', 'ngo-quelle-meta', 'Kennung ' + eintrag.kennung));
      liste.appendChild(karte);
    });
    return liste;
  }

  function parteienBlock(kanten) {
    var zaehler = {};
    kanten.forEach(function (k) { if (k.partei) zaehler[k.partei] = (zaehler[k.partei] || 0) + 1; });
    var namen = Object.keys(zaehler).sort();
    if (!namen.length) return null;
    var block = knoten('div');
    var marken = knoten('span', 'ngo-marken');
    namen.forEach(function (p) { marken.appendChild(marke(p + ' (' + zaehler[p] + ')', 'partei')); });
    block.appendChild(marken);
    block.appendChild(knoten('p', 'ngo-detail-fussnote', modell.meta.hinweise.partei));
    return block;
  }

  function klassenBlock(kanten) {
    var zaehler = { N1: 0, N2: 0, N3: 0, N4: 0 };
    kanten.forEach(function (k) { zaehler[k.klasse] = (zaehler[k.klasse] || 0) + 1; });
    var block = knoten('div');
    var marken = knoten('span', 'ngo-marken');
    ['N1', 'N2', 'N3', 'N4'].forEach(function (k) {
      if (!zaehler[k]) return;
      var m = marke(k + ': ' + zaehler[k], 'zeit');
      m.title = modell.meta.klassenText[k] || k;
      marken.appendChild(m);
    });
    block.appendChild(marken);
    return block;
  }

  function zeigePerson(person, kante) {
    var ziel = id('nnDetail');
    ziel.textContent = '';
    var filter = aktuellerFilter();
    var kanten = N.organisationenZuPerson(modell, person.index, filter);

    ziel.appendChild(knoten('p', 'nv-detail-typ', 'Person'));
    ziel.appendChild(knoten('h3', 'nv-detail-name', kante ? kante.anzeige : person.name));

    if (ebeneZustand.person === null || Number(ebeneZustand.person) !== person.index) {
      var fokusKnopf = knoten('button', 'nv-detail-link ngo-fokus-knopf',
        'Nur diese Person und ihre Organisationen zeigen');
      fokusKnopf.type = 'button';
      fokusKnopf.addEventListener('click', function () {
        setzeEbene(ebeneZustand.ebene, ebeneZustand.cluster, person.index);
        zeigePerson(person, null);
      });
      ziel.appendChild(fokusKnopf);
    }

    if (person.varianten.length > 1) {
      abschnitt(ziel, 'Erfasste Schreibvarianten', person.varianten.join(' · '));
      ziel.appendChild(knoten('p', 'ngo-detail-fussnote',
        'Diese Schreibvarianten wurden zusammengeführt, weil sie exakt dieselben ' +
        'Namensbestandteile enthalten. Ähnlich klingende Namen werden nie zusammengeführt.'));
    }
    abschnitt(ziel, 'Technische Kennungen', person.rohIds.join(' · '));
    if (person.parteien.length) {
      var marken = knoten('span', 'ngo-marken');
      person.parteien.forEach(function (p) { marken.appendChild(marke(p, 'partei')); });
      abschnitt(ziel, 'Parteiangaben zur Person', marken);
    }
    abschnitt(ziel, 'Erfasste Organisationen (' + kanten.length + ')',
      kanten.length ? organisationsListe(kanten) : 'keine in den aktiven Filtern');
    abschnitt(ziel, 'Quellen', quellenListe(kanten) || 'nicht angegeben');
  }

  function organisationsListe(kanten) {
    var liste = knoten('ul', 'ngo-rollen');
    kanten.forEach(function (k) {
      var eintrag = document.createElement('li');
      var knopf = knoten('button', 'nv-detail-link', k.organisation.name);
      knopf.type = 'button';
      knopf.addEventListener('click', function () { zeigeInGrafik(k.organisation); });
      eintrag.appendChild(knopf);
      if (k.rolle) eintrag.appendChild(knoten('span', 'ngo-rolle-funktion', k.rolle));
      var marken = knoten('span', 'ngo-marken');
      marken.appendChild(marke(k.klasse, 'zeit'));
      // Belegt durch: Herausgeber statt interner Kennung.
      var erste = (k.quellen || [])[0];
      if (erste) marke_quelle(marken, erste, (k.quellen || []).length);
      eintrag.appendChild(marken);
      liste.appendChild(eintrag);
    });
    return liste;
  }

  function marke_quelle(marken, quelle, anzahl) {
    var text = quelle.herausgeber || quelle.typ || N.quellenTitel(quelle);
    if (anzahl > 1) text += ' +' + (anzahl - 1);
    var m = marke(text);
    m.title = N.quellenTitel(quelle) + (quelle.rang ? ' · ' + quelle.rang : '');
    marken.appendChild(m);
  }

  function zeigeDetail(auswahl) {
    var ziel = id('nnDetail');
    ziel.textContent = '';

    if (!auswahl) {
      ziel.appendChild(knoten('p', 'nv-detail-leer',
        // «Eintrag» statt «Organisation»: In der Personenperspektive und in
        // den Listen stehen hier auch Personen und Cluster.
        'Einen Eintrag anklicken oder mit der Tabulatortaste anwählen. Dann erscheinen hier ' +
        'Stammdaten, Cluster, erfasste Personen, Verbindungen, Parteiangaben und Quellen.'));
      return;
    }

    if (auswahl.typ === 'person') {
      zeigePerson(auswahl.person, auswahl.kante);
      return;
    }

    var organisation = auswahl.organisation;
    if (!organisation) return;
    var filter = aktuellerFilter();
    var kanten = N.personenZuOrganisation(modell, organisation.id, filter);

    ziel.appendChild(knoten('p', 'nv-detail-typ', 'Organisation'));
    ziel.appendChild(knoten('h3', 'nv-detail-name', organisation.name));
    ziel.appendChild(knoten('p', 'nv-detail-id', organisation.id));

    if (organisation.abdeckungsluecke) {
      var hinweis = knoten('p', 'ngo-hinweisbox', modell.meta.hinweise.abdeckungsluecke);
      ziel.appendChild(hinweis);
    }

    var stamm = knoten('ul', 'ngo-quellen');
    [['Kategorie', organisation.kategorieLabel],
     ['Unterkategorie', organisation.unterkategorie],
     ['Organisationstyp', organisation.organisationstyp],
     ['Sitz', [organisation.sitz, organisation.kanton].filter(Boolean).join(', ')],
     ['Datenstand', organisation.datenstand],
     // Legacy: nur noch als Stammdatum, nicht mehr Grundlage von Auswertung,
     // Filter oder Farbe.
     ['Obergruppe (alt)', organisation.obergruppe]].forEach(function (paar) {
      if (!paar[1]) return;
      var eintrag = document.createElement('li');
      eintrag.appendChild(knoten('span', 'ngo-quelle-text', paar[0]));
      eintrag.appendChild(knoten('span', null, paar[1]));
      stamm.appendChild(eintrag);
    });
    if (organisation.website) {
      var eintragWeb = document.createElement('li');
      eintragWeb.appendChild(knoten('span', 'ngo-quelle-text', 'Website'));
      var link = document.createElement('a');
      link.href = organisation.website;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = organisation.website.replace(/^https?:\/\//, '');
      eintragWeb.appendChild(link);
      stamm.appendChild(eintragWeb);
    }
    abschnitt(ziel, 'Stammdaten', stamm);

    var cluster = modell.cluster[organisation.cluster];
    if (cluster) {
      var clusterBlock = knoten('div');
      clusterBlock.appendChild(knoten('p', 'ngo-detail-text',
        organisation.cluster ? cluster.id + ' — ' + cluster.label : cluster.label));
      clusterBlock.appendChild(knoten('p', 'ngo-detail-fussnote', modell.meta.hinweise.cluster));
      abschnitt(ziel, 'Cluster', clusterBlock);
    }

    var kennzahlen = knoten('div');
    kennzahlen.appendChild(knoten('p', 'ngo-detail-text',
      organisation.kanten + ' erfasste Beziehungen, davon ' + organisation.kantenG3 +
      ' im Kernnetz N1–N3; ' + organisation.personen + ' erfasste Personen.'));
    kennzahlen.appendChild(klassenBlock(
      modell.kanten.filter(function (k) { return k.organisation.id === organisation.id; })));
    kennzahlen.appendChild(knoten('p', 'ngo-detail-text',
      'Strukturelle Brückenfunktion: ' + organisation.brueckenpersonen +
      ' Personen führen zu anderen Masterorganisationen (Kernnetz: ' +
      organisation.brueckenpersonenG3 + ').'));
    kennzahlen.appendChild(knoten('p', 'ngo-detail-fussnote', modell.meta.hinweise.zentralitaet));
    abschnitt(ziel, 'Kennzahlen', kennzahlen);

    if (organisation.historischeKanten) {
      var hist = knoten('div');
      hist.appendChild(knoten('p', 'ngo-detail-text',
        organisation.historischeKanten + ' historische Beziehungen erfasst.'));
      hist.appendChild(knoten('p', 'ngo-detail-fussnote', modell.meta.hinweise.historie));
      abschnitt(ziel, 'Historie (G4)', hist);
    }

    var verschiedene = {};
    kanten.forEach(function (k) { verschiedene[k.person.index] = true; });
    var anzahlPersonen = Object.keys(verschiedene).length;
    abschnitt(ziel, 'Erfasste Personen (' + anzahlPersonen + ')',
      kanten.length ? personenListe(kanten) : 'keine Person entspricht den aktiven Filtern');
    if (kanten.length > anzahlPersonen) {
      ziel.appendChild(knoten('p', 'ngo-detail-fussnote',
        kanten.length + ' erfasste Beziehungen zu diesen ' + anzahlPersonen +
        ' Personen — je Rolle und Quelle eine eigene Zeile.'));
    }
    abschnitt(ziel, 'Verbindungen zu anderen Organisationen',
      verbindungsListe(organisation.id) || 'keine Verbindung in der aktiven Ansicht');
    abschnitt(ziel, 'Parteiangaben erfasster Personen', parteienBlock(kanten));
    abschnitt(ziel, 'Quellen', quellenListe(kanten) || 'nicht angegeben');
  }

  /* ---------------------------------------------------------- Tabellen --- */

  /**
   * Die Tabellen zeigen den vollständigen Bestand, unabhängig von den Filtern
   * der Grafik. Für die Personenübersicht heisst das: alle Beziehungsklassen.
   */
  function alleKlassenFilter() {
    var filter = N.standardFilter();
    filter.ansicht = 'G2';
    filter.klassen = { N1: true, N2: true, N3: true, N4: true };
    return filter;
  }

  /** Klickbare Spaltenköpfe: sortiert auf- und absteigend, Zahlen numerisch. */
  function macheSortierbar(tabelle) {
    var koepfe = Array.prototype.slice.call(tabelle.querySelectorAll('th[data-sortieren]'));
    koepfe.forEach(function (kopf, spalte) {
      kopf.tabIndex = 0;
      kopf.setAttribute('role', 'button');
      function sortiere() {
        var absteigend = kopf.getAttribute('aria-sort') !== 'descending';
        var zahl = kopf.getAttribute('data-sortieren') === 'zahl';
        var koerper = tabelle.querySelector('tbody');
        var zeilen = Array.prototype.slice.call(koerper.querySelectorAll('tr'));
        zeilen.sort(function (a, b) {
          var za = a.children[spalte], zb = b.children[spalte];
          if (zahl) {
            var wa = parseFloat(za.getAttribute('data-wert') || za.textContent) || 0;
            var wb = parseFloat(zb.getAttribute('data-wert') || zb.textContent) || 0;
            return absteigend ? wb - wa : wa - wb;
          }
          var va = za.textContent, vb = zb.textContent;
          return absteigend ? vb.localeCompare(va, 'de-CH') : va.localeCompare(vb, 'de-CH');
        });
        koepfe.forEach(function (k) { k.removeAttribute('aria-sort'); });
        kopf.setAttribute('aria-sort', absteigend ? 'descending' : 'ascending');
        var teil = document.createDocumentFragment();
        zeilen.forEach(function (z) { teil.appendChild(z); });
        koerper.appendChild(teil);
      }
      kopf.addEventListener('click', sortiere);
      kopf.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sortiere(); }
      });
    });
  }

  function fuelleTabellen() {
    var koerper = id('nnTabelleOrg').querySelector('tbody');
    var teil = document.createDocumentFragment();
    modell.organisationen.slice().sort(function (a, b) {
      return a.name.localeCompare(b.name, 'de-CH');
    }).forEach(function (o) {
      var cluster = modell.cluster[o.cluster];
      var zeile = document.createElement('tr');
      zeile.appendChild(organisationsZelle(o));
      [o.kategorieLabel, cluster ? (o.cluster ? o.cluster + ' — ' + cluster.label : cluster.label) : '',
       String(o.kanten), String(o.personen), String(o.brueckenpersonen),
       o.abdeckungsluecke ? 'Abdeckungslücke' : ''].forEach(function (wert) {
        zeile.appendChild(knoten('td', null, wert));
      });
      teil.appendChild(zeile);
    });
    koerper.appendChild(teil);

    var kantenKoerper = id('nnTabelleKanten').querySelector('tbody');
    var teil2 = document.createDocumentFragment();
    modell.kanten.slice().sort(function (a, b) {
      return a.organisation.name.localeCompare(b.organisation.name, 'de-CH');
    }).forEach(function (k) {
      var zeile = document.createElement('tr');
      var belege = (k.quellen || []).map(function (q) {
        return (q.herausgeber ? q.herausgeber + ' – ' : '') + N.quellenTitel(q);
      }).concat(k.quellenFehlend || []);
      [k.organisation.name, k.anzeige, k.rolle, k.klasse, k.partei,
       belege.join(' | '), k.quellenGuete]
        .forEach(function (wert) { zeile.appendChild(knoten('td', null, wert || '')); });
      zeile.title = 'Interne Kennungen: ' + k.quelle;
      teil2.appendChild(zeile);
    });
    kantenKoerper.appendChild(teil2);

    var quellenKoerper = id('nnTabelleQuellen').querySelector('tbody');
    var teil4 = document.createDocumentFragment();
    modell.quellen.slice().sort(function (a, b) {
      return a.herausgeber.localeCompare(b.herausgeber, 'de-CH');
    }).forEach(function (q) {
      var zeile = document.createElement('tr');
      zeile.appendChild(knoten('td', null, q.herausgeber));
      var titelZelle = document.createElement('td');
      if (q.url) {
        var link = document.createElement('a');
        link.href = q.url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = N.quellenTitel(q);
        titelZelle.appendChild(link);
      } else {
        titelZelle.textContent = N.quellenTitel(q);
      }
      zeile.appendChild(titelZelle);
      [q.typ, q.rang, q.guete, q.datum || q.jahr, q.abgerufen, q.id].forEach(function (wert) {
        zeile.appendChild(knoten('td', null, wert || ''));
      });
      teil4.appendChild(zeile);
    });
    quellenKoerper.appendChild(teil4);

    // Personenübersicht: enthält bewusst auch die Personen mit nur einer
    // Organisation, die im Netz nicht erscheinen.
    var personenKoerper = id('nnTabellePersonen').querySelector('tbody');
    var teilP = document.createDocumentFragment();
    N.personenUebersicht(modell, alleKlassenFilter()).forEach(function (e) {
      var zeile = document.createElement('tr');
      var belege = N.quellenZu(e.kanten).quellen.map(function (q) {
        return q.quelle.herausgeber || N.quellenTitel(q.quelle);
      });
      [e.person.name, String(e.anzahlOrganisationen),
       e.organisationen.map(function (o) { return o.name; }).join(', '),
       e.rollen.join(', '), e.parteien.join(', '),
       belege.join(', ')].forEach(function (wert, i) {
        var zelle = knoten('td', null, wert || '');
        if (i === 1) zelle.setAttribute('data-wert', e.anzahlOrganisationen);
        zeile.appendChild(zelle);
      });
      teilP.appendChild(zeile);
    });
    personenKoerper.appendChild(teilP);
    macheSortierbar(id('nnTabellePersonen'));

    var variantenKoerper = id('nnTabelleVarianten').querySelector('tbody');
    var teil3 = document.createDocumentFragment();
    modell.variantengruppen.forEach(function (g) {
      var zeile = document.createElement('tr');
      zeile.appendChild(knoten('td', null, g.varianten[0]));
      zeile.appendChild(knoten('td', null, g.varianten.join(' · ')));
      zeile.appendChild(knoten('td', null, g.rohIds.join(' · ')));
      teil3.appendChild(zeile);
    });
    variantenKoerper.appendChild(teil3);

    id('nnQuelle').textContent = 'Quelle: ' + PFAD + ' — erzeugt aus ' +
      (modell.meta.quelle || 'dem internen Datenbestand') + ', Version ' +
      (modell.meta.masterVersion || '—') + '. Interne Prüfprotokolle und Recherchenotizen ' +
      'sind nicht enthalten.';
  }

  function fuelleLegende() {
    // Die Aufzählung aller Cluster steht im Cockpit und dort
    // anklickbar; hier wiederholte sie nur dieselbe Liste. Die Zuordnung
    // Ziffer zu Cluster trägt weiterhin der Titel jedes Knotens.
    // Farbige Kategorien zuerst, danach eine Sammelzeile. Sieben Farbtoene
    // sind die Grenze, bei der sich noch alle Paare sicher unterscheiden
    // lassen — die uebrigen Kategorien bleiben deshalb neutral und werden
    // gezaehlt statt einzeln aufgefuehrt.
    var kl = id('nnLegendeKategorie');
    var farben = window.NgoNetzAnsicht.KATEGORIE_FARBE;
    var neutral = window.NgoNetzAnsicht.NEUTRAL;
    var ohneFarbe = [];
    modell.kategorien.forEach(function (k) {
      if (!farben[k.id]) { ohneFarbe.push(k.label); return; }
      var eintrag = knoten('span');
      var punkt = knoten('i', 'ngo-l-punkt');
      punkt.style.background = farben[k.id];
      eintrag.appendChild(punkt);
      eintrag.appendChild(document.createTextNode(k.label));
      kl.appendChild(eintrag);
    });
    if (ohneFarbe.length) {
      var rest = knoten('span');
      var restPunkt = knoten('i', 'ngo-l-punkt');
      restPunkt.style.background = neutral;
      rest.appendChild(restPunkt);
      rest.appendChild(document.createTextNode(
        'übrige Kategorien (' + ohneFarbe.length + ')'));
      rest.title = ohneFarbe.join(', ');
      kl.appendChild(rest);
    }
  }

  /* ------------------------------------------------------------- Hilfe --- */

  /**
   * Erklärungen stehen in einem aufgeklappten Panel, nicht dauerhaft auf der
   * Seite. Die Infozeichen an den Bedienelementen öffnen es und springen zum
   * passenden Begriff — Erklärung dort und dann, wo sie gebraucht wird.
   */
  function verdrahteHilfe() {
    var fenster = id('nnHilfeFenster');
    var hervorgehoben = null;

    function oeffne() {
      if (fenster.open) return;
      if (fenster.showModal) fenster.showModal();
      else fenster.setAttribute('open', '');   // ältere Browser: einfache Anzeige
    }

    function schliesse() {
      if (fenster.close) fenster.close();
      else fenster.removeAttribute('open');
      if (hervorgehoben) {
        hervorgehoben.classList.remove('ngo-begriff-hervor');
        hervorgehoben = null;
      }
    }

    function zeigeBegriff(schluessel) {
      oeffne();
      var ziel = id('begriff-' + schluessel);
      if (!ziel) return;
      if (hervorgehoben) hervorgehoben.classList.remove('ngo-begriff-hervor');
      ziel.classList.add('ngo-begriff-hervor');
      hervorgehoben = ziel;
      ziel.setAttribute('tabindex', '-1');
      if (ziel.scrollIntoView) ziel.scrollIntoView({ block: 'center' });
      ziel.focus({ preventScroll: true });
    }

    Array.prototype.slice.call(document.querySelectorAll('.ngo-info')).forEach(function (knopf) {
      knopf.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();      // sonst schaltet das umgebende Label mit
        zeigeBegriff(knopf.getAttribute('data-begriff'));
      });
    });

    id('nnHilfeKnopf').addEventListener('click', oeffne);
    id('nnHilfeZu').addEventListener('click', schliesse);
    fenster.addEventListener('close', function () {
      if (hervorgehoben) {
        hervorgehoben.classList.remove('ngo-begriff-hervor');
        hervorgehoben = null;
      }
    });
    // Klick auf den Hintergrund schliesst; Escape erledigt <dialog> selbst.
    fenster.addEventListener('click', function (e) {
      if (e.target === fenster) schliesse();
    });
  }

  /**
   * Die Detailfilter stehen eingeklappt, damit das Netz ohne Scrollen sichtbar
   * ist. Eingeklappt fasst eine Zeile zusammen, was gerade eingestellt ist.
   */
  function verdrahteFilterleiste() {
    var knopf = id('nnFilterKnopf');
    var block = id('nnFilter');
    knopf.addEventListener('click', function () {
      var offen = knopf.getAttribute('aria-expanded') === 'true';
      knopf.setAttribute('aria-expanded', offen ? 'false' : 'true');
      block.hidden = offen;
    });
  }

  /** Zusammenfassung der aktiven Filter für die eingeklappte Leiste. */
  function beschreibeFilter() {
    var f = aktuellerFilter();
    var teile = [];
    if (f.historie) teile.push('frühere Beziehungen');
    else teile.push(f.ansicht === 'G2' ? 'erweitertes Netz' : 'Kernnetz');
    var klassen = ['N1', 'N2', 'N3', 'N4'].filter(function (k) { return f.klassen[k]; });
    var alleKlassen = f.ansicht === 'G2' ? 4 : 3;
    if (!f.historie && klassen.length < alleKlassen) teile.push('nur ' + klassen.join(', '));
    if (f.kategorie) {
      var kat = modell.kategorien.filter(function (k) { return k.id === f.kategorie; })[0];
      teile.push(kat ? kat.label.split(',')[0].split(' &')[0] + '…' : f.kategorie);
    }
    if (f.cluster !== '') {
      var c = modell.cluster[f.cluster];
      teile.push('Cluster ' + (c && c.id ? c.id : f.cluster));
    }
    if (f.partei) teile.push('Partei ' + f.partei);
    if (f.nurLuecken) teile.push('nur Abdeckungslücken');
    if (f.nurVerbunden) teile.push('nur mit Verbindung');
    if (f.perspektive === 'person') teile.push('ab ' + f.personenSchwelle + ' Organisationen');
    id('nnFilterLage').innerHTML = '';
    id('nnFilterLage').appendChild(document.createTextNode(teile.join(' · ')));
  }

  /* --------------------------------------------------------- Trefferbox -- */

  var TREFFER_MAX = 12;

  function zeigeTreffer(begriff) {
    var box = id('nnTreffer');
    box.textContent = '';
    var alle = N.sucheKnoten(modell, begriff);
    var treffer = alle.slice(0, TREFFER_MAX);
    if (!begriff || !treffer.length) { box.hidden = true; return; }
    // Die Liste ist gekappt. Das wird gesagt, statt es zu verschweigen.
    if (alle.length > treffer.length) {
      box.appendChild(knoten('p', 'ngo-treffer-zahl',
        treffer.length + ' von ' + alle.length + ' Treffern — Suche verfeinern'));
    }
    treffer.forEach(function (t) {
      var knopf = knoten('button', 'ngo-treffer-eintrag');
      knopf.type = 'button';
      knopf.appendChild(knoten('span', 'ngo-treffer-typ', t.typ === 'person' ? 'Person' : 'Organisation'));
      knopf.appendChild(knoten('span', 'ngo-treffer-name', t.name));
      if (t.typ === 'person') {
        knopf.appendChild(knoten('span', 'ngo-treffer-zusatz',
          t.organisationen + ' Organisation' + (t.organisationen === 1 ? '' : 'en')));
      }
      knopf.addEventListener('click', function () {
        if (t.typ === 'organisation') {
          // Eine Organisation kann im Gesamtnetz gesucht werden; die Ebene
          // wechselt dafuer auf die Organisationen.
          if (ebeneZustand.ebene !== 'organisation' || ebeneZustand.person !== null) {
            setzeEbene('organisation', null, null);
          }
          ansicht.springeZu(t.id);
        } else {
          // Eine Person zeigt ihre eigene Nachbarschaft — im Gesamtnetz ginge
          // sie zwischen hunderten Knoten unter.
          setzeEbene(ebeneZustand.ebene, ebeneZustand.cluster, t.person.index);
          zeigePerson(t.person, null);
        }
        box.hidden = true;
      });
      box.appendChild(knopf);
    });
    box.hidden = false;
  }

  /* ------------------------------------------------------------ Start ---- */

  function start(daten) {
    modell = N.baueModell(daten);
    fuelleKennzahlen();
    fuelleZahlen();
    zeigeOhneBeziehung();
    fuelleAuswahlfelder();
    fuelleLegende();
    fuelleTabellen();

    var knotenAusUrl = lieseZustand();
    synchronisiereBedienung();
    verdrahteHilfe();
    verdrahteFilterleiste();

    ansicht = window.NgoNetzAnsicht.erstelle({
      modell: modell,
      svg: id('nnSvg'),
      status: id('nnStatus'),
      beiAuswahl: zeigeDetail,
      beiZustand: schreibeZustand,
      beiEbene: function (ziel) { setzeEbene(ziel.ebene, ziel.cluster); },
      beiNetz: zeigeNetzHinweis,
      beiOrganisation: function (ziel) { zeigeInGrafik(ziel.organisation); },
      beiPerson: function (ziel) {
        setzeEbene(ebeneZustand.ebene, ebeneZustand.cluster, ziel.person.index);
      },
      liste: id('nnListe'),
      zoomknoepfe: id('nnZoom')
    });
    ansicht.setzeFilter(aktuellerFilter());
    zeichneBrotkrumen();
    zeigeDetail(null);

    if (knotenAusUrl) ansicht.springeZu(knotenAusUrl);
    if (id('nnSuche').value) ansicht.setzeSuche(id('nnSuche').value);

    ['kN1', 'kN2', 'kN3', 'kN4', 'fKategorie', 'fCluster', 'fPartei', 'fFarbe',
     'fSchwelle', 'nnHistorie', 'nnLuecken', 'nnNurVerbunden'].forEach(function (feld) {
      id(feld).addEventListener('change', filterGeaendert);
    });

    id('nnPerspOrg').addEventListener('click', function () {
      setzePerspektive('organisation'); filterGeaendert();
    });
    id('nnPerspPers').addEventListener('click', function () {
      setzePerspektive('person'); filterGeaendert();
    });

    id('nnG3').addEventListener('click', function () { setzeAnsicht('G3'); filterGeaendert(); });
    id('nnG2').addEventListener('click', function () {
      setzeAnsicht('G2');
      id('kN4').checked = true;
      filterGeaendert();
    });

    var suchTimer = null;
    id('nnSuche').addEventListener('input', function (e) {
      var wert = e.target.value;
      clearTimeout(suchTimer);
      suchTimer = setTimeout(function () {
        ansicht.setzeSuche(wert);
        zeigeTreffer(wert);
        schreibeZustand();
      }, 160);
    });

    id('nnReset').addEventListener('click', function () {
      id('nnSuche').value = '';
      id('nnTreffer').hidden = true;
      setzePerspektive('organisation');
      ebeneZustand.ebene = 'cluster';
      ebeneZustand.cluster = null;
      ebeneZustand.person = null;
      zeichneBrotkrumen();
      id('fSchwelle').value = '2';
      setzeAnsicht('G3');
      ['kN1', 'kN2', 'kN3'].forEach(function (f) { id(f).checked = true; });
      id('kN4').checked = false;
      id('nnHistorie').checked = false;
      id('nnLuecken').checked = false;
      id('nnNurVerbunden').checked = false;
      ['fKategorie', 'fCluster', 'fPartei'].forEach(function (f) { id(f).value = ''; });
      id('fFarbe').value = 'cluster';
      synchronisiereBedienung();
      ansicht.setzeZurueck();
    });

    id('nnFokusHinweisKnopf').addEventListener('click', function () {
      if (hinweisAktion === 'auswahlLoesen') { ansicht.loeseAuswahl(); return; }
      if (hinweisAktion === 'alleZeigen') {
        id('nnNurVerbunden').checked = false;
        filterGeaendert();
        return;
      }
      // Erweiterte Ansicht plus alle vier Beziehungsarten — nur so ist die Zahl
      // aus der Rangliste im Bild vollstaendig.
      setzeAnsicht('G2');
      synchronisiereBedienung();
      ['kN1', 'kN2', 'kN3', 'kN4'].forEach(function (k) { id(k).checked = true; });
      filterGeaendert();
    });

    id('nnPlus').addEventListener('click', function () { ansicht.zoome(1.25); });
    id('nnMinus').addEventListener('click', function () { ansicht.zoome(1 / 1.25); });

    var buehne = id('nnBuehne');
    var vollbild = id('nnVollbild');
    if (!buehne.requestFullscreen) {
      vollbild.hidden = true;
    } else {
      vollbild.addEventListener('click', function () {
        if (document.fullscreenElement) document.exitFullscreen();
        else buehne.requestFullscreen();
      });
      document.addEventListener('fullscreenchange', function () {
        vollbild.textContent = document.fullscreenElement ? 'Vollbild beenden' : 'Vollbild';
        setTimeout(function () { ansicht.zeichne(); }, 60);
      });
    }

    var breiteVorher = window.innerWidth, groessenTimer = null;
    window.addEventListener('resize', function () {
      if (Math.abs(window.innerWidth - breiteVorher) < 40) return;
      breiteVorher = window.innerWidth;
      clearTimeout(groessenTimer);
      groessenTimer = setTimeout(function () { ansicht.zeichne(); }, 220);
    });
  }

  var gestartet = false;
  function initialisiere() {
    if (gestartet) return;
    gestartet = true;
    if (!window.d3 || !window.d3.forceSimulation) {
      zeigeFehler('Die lokale Netzwerkbibliothek wurde nicht geladen.');
      return;
    }
    fetch(PFAD, { cache: 'no-cache' })
      .then(function (a) {
        if (!a.ok) throw new Error(PFAD + ' (HTTP ' + a.status + ')');
        return a.json();
      })
      .then(start)
      .catch(function (fehler) {
        zeigeFehler('Die Daten konnten nicht geladen werden: ' + fehler.message +
          ' Die Vorschau benötigt einen lokalen Webserver; ein Aufruf über file:// wird vom ' +
          'Browser blockiert. Beispiel: python -m http.server 8000 im Projektordner starten.');
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialisiere);
  else initialisiere();
})();
