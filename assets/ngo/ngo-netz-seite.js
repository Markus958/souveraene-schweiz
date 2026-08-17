/*!
 * ngo-netz-seite.js — Verdrahtung der NGO-Netzwerkseite
 * souveraene-schweiz.ch
 *
 * Verbindet Daten, Ansicht und Bedienelemente und hält den Zustand in der URL,
 * damit ein Knoten samt Filter verlinkt werden kann.
 */
(function () {
  'use strict';

  var PFAD = 'assets/ngo/ngo-netzwerk.json';

  var N = window.NgoNetzDaten;
  var modell = null;
  var ansicht = null;
  var zustandSetzenLaeuft = false;

  function id(name) { return document.getElementById(name); }

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

  function fuelleKennzahlen() {
    var k = modell.kennzahlen;
    id('kzOrganisationen').textContent = k.organisationen;
    id('kzBeziehungen').textContent = k.kanten;
    id('kzKern').textContent = k.kantenG3;
    id('kzPersonen').textContent = k.personen;
    id('kzLuecken').textContent = k.abdeckungsluecken;
    id('kzDatenstand').textContent = formatiereDatum(k.datenstand);
    id('nnVersion').textContent = modell.meta.masterVersion || '';
  }

  /* ------------------------------------------------------ Bedienelemente - */

  function fuelleAuswahlfelder() {
    modell.obergruppen.forEach(function (o) {
      var e = document.createElement('option');
      e.value = o;
      e.textContent = o;
      id('fObergruppe').appendChild(e);
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
      ansicht: ansichtWert,
      historie: historie,
      klassen: {
        N1: id('kN1').checked, N2: id('kN2').checked,
        N3: id('kN3').checked, N4: id('kN4').checked
      },
      obergruppe: id('fObergruppe').value,
      cluster: id('fCluster').value,
      partei: id('fPartei').value,
      farbe: id('fFarbe').value,
      nurLuecken: id('nnLuecken').checked
    };
  }

  /** N4 ist nur in G2 zulässig — das Kästchen bleibt in G3 gesperrt. */
  function synchronisiereBedienung() {
    var g2 = id('nnG2').getAttribute('aria-pressed') === 'true';
    var historie = id('nnHistorie').checked;
    id('kN4').disabled = !g2 || historie;
    if (!g2) id('kN4').checked = false;
    ['kN1', 'kN2', 'kN3', 'fPartei'].forEach(function (f) { id(f).disabled = historie; });
    id('nnHistorieHinweis').hidden = !historie;
    id('nnLegendeCluster').hidden = id('fFarbe').value !== 'cluster';
    id('nnLegendeObergruppe').hidden = id('fFarbe').value !== 'obergruppe';
  }

  function filterGeaendert() {
    synchronisiereBedienung();
    ansicht.setzeFilter(aktuellerFilter());
    zeigeDetail(null);
    if (id('nnSuche').value) ansicht.setzeSuche(id('nnSuche').value);
    schreibeZustand();
  }

  /* ------------------------------------------------------------- URL ----- */

  function schreibeZustand() {
    if (zustandSetzenLaeuft || !window.history || !window.history.replaceState) return;
    var f = aktuellerFilter();
    var p = new URLSearchParams();
    if (f.ansicht !== 'G3') p.set('ansicht', f.ansicht);
    if (f.historie) p.set('historie', '1');
    if (f.obergruppe) p.set('obergruppe', f.obergruppe);
    if (f.cluster !== '') p.set('cluster', f.cluster);
    if (f.partei) p.set('partei', f.partei);
    if (f.farbe !== 'cluster') p.set('farbe', f.farbe);
    if (f.nurLuecken) p.set('luecken', '1');
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
    if (p.get('ansicht') === 'G2') setzeAnsicht('G2');
    if (p.get('historie') === '1') id('nnHistorie').checked = true;
    if (p.get('luecken') === '1') id('nnLuecken').checked = true;
    if (p.get('obergruppe')) id('fObergruppe').value = p.get('obergruppe');
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
      knopf.addEventListener('click', function () { ansicht.springeZu(andereId); });
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
      knopf.addEventListener('click', function () { ansicht.springeZu(k.organisation.id); });
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
        'Organisation anklicken oder mit der Tabulatortaste anwählen. Dann erscheinen hier ' +
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
    [['Obergruppe', organisation.obergruppe],
     ['Hauptkategorie', organisation.hauptkategorie],
     ['Organisationstyp', organisation.organisationstyp],
     ['Sitz', [organisation.sitz, organisation.kanton].filter(Boolean).join(', ')],
     ['Datenstand', organisation.datenstand]].forEach(function (paar) {
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

  function fuelleTabellen() {
    var koerper = id('nnTabelleOrg').querySelector('tbody');
    var teil = document.createDocumentFragment();
    modell.organisationen.slice().sort(function (a, b) {
      return a.name.localeCompare(b.name, 'de-CH');
    }).forEach(function (o) {
      var cluster = modell.cluster[o.cluster];
      var zeile = document.createElement('tr');
      [o.name, o.obergruppe, cluster ? (o.cluster ? o.cluster + ' — ' + cluster.label : cluster.label) : '',
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
    var clusterListe = id('nnLegendeCluster');
    modell.clusterListe.forEach(function (c) {
      var eintrag = knoten('span');
      eintrag.appendChild(knoten('i', 'ngo-l-ziffer', String(c.id)));
      eintrag.appendChild(document.createTextNode(c.label + ' (' + c.groesse + ')'));
      clusterListe.appendChild(eintrag);
    });

    var og = id('nnLegendeObergruppe');
    modell.obergruppen.forEach(function (o) {
      var eintrag = knoten('span');
      var punkt = knoten('i', 'ngo-l-punkt');
      punkt.style.background = window.NgoNetzAnsicht.OBERGRUPPEN_FARBE[o] ||
        window.NgoNetzAnsicht.NEUTRAL;
      eintrag.appendChild(punkt);
      eintrag.appendChild(document.createTextNode(o));
      og.appendChild(eintrag);
    });
  }

  /* --------------------------------------------------------- Trefferbox -- */

  function zeigeTreffer(begriff) {
    var box = id('nnTreffer');
    box.textContent = '';
    var treffer = N.sucheKnoten(modell, begriff).slice(0, 12);
    if (!begriff || !treffer.length) { box.hidden = true; return; }
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
        if (t.typ === 'organisation') ansicht.springeZu(t.id);
        else zeigePerson(t.person, null);
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
    fuelleAuswahlfelder();
    fuelleLegende();
    fuelleTabellen();

    var knotenAusUrl = lieseZustand();
    synchronisiereBedienung();

    ansicht = window.NgoNetzAnsicht.erstelle({
      modell: modell,
      svg: id('nnSvg'),
      status: id('nnStatus'),
      beiAuswahl: zeigeDetail,
      beiZustand: schreibeZustand
    });
    ansicht.setzeFilter(aktuellerFilter());
    zeigeDetail(null);

    if (knotenAusUrl) ansicht.springeZu(knotenAusUrl);
    if (id('nnSuche').value) ansicht.setzeSuche(id('nnSuche').value);

    ['kN1', 'kN2', 'kN3', 'kN4', 'fObergruppe', 'fCluster', 'fPartei', 'fFarbe',
     'nnHistorie', 'nnLuecken'].forEach(function (feld) {
      id(feld).addEventListener('change', filterGeaendert);
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
      setzeAnsicht('G3');
      ['kN1', 'kN2', 'kN3'].forEach(function (f) { id(f).checked = true; });
      id('kN4').checked = false;
      id('nnHistorie').checked = false;
      id('nnLuecken').checked = false;
      ['fObergruppe', 'fCluster', 'fPartei'].forEach(function (f) { id(f).value = ''; });
      id('fFarbe').value = 'cluster';
      synchronisiereBedienung();
      ansicht.setzeZurueck();
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
