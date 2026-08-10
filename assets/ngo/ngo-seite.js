/*!
 * ngo-seite.js — Verdrahtung der NGO-Vorschauseite
 * souveraene-schweiz.ch
 */
(function () {
  'use strict';

  var PFAD_NETZ = 'assets/ngo/ngo-fuehrungsnetz.json';
  var PFAD_REDAKTION = 'assets/ngo/ngo-redaktion.json';

  var N = window.NgoDaten;
  var modell = null;
  var ansicht = null;

  function id(name) { return document.getElementById(name); }

  function knoten(tag, klasse, text) {
    var k = document.createElement(tag);
    if (klasse) k.className = klasse;
    if (text !== undefined && text !== null) k.textContent = text;
    return k;
  }

  function zeigeFehler(text) {
    var b = id('ngoFehler');
    b.hidden = false;
    b.className = 'nv-fehler';
    b.textContent = text;
  }

  function lade(pfad) {
    return fetch(pfad, { cache: 'no-cache' }).then(function (a) {
      if (!a.ok) throw new Error(pfad + ' (HTTP ' + a.status + ')');
      return a.json();
    });
  }

  /* ------------------------------------------------------- Kennzahlen ---- */

  function fuelleKennzahlen() {
    var k = modell.kennzahlen;
    id('kzOrganisationen').textContent = k.organisationen;
    id('kzRollen').textContent = k.rollen;
    id('kzVerbindungen').textContent = k.verbindungenAktuell;
    id('kzOrgsVerbunden').textContent = k.organisationenMitAktuellerBruecke;
    id('kzMandate').textContent = k.politischeMandate;
    id('kzDatenstand').textContent = formatiereDatum(k.datenstand);

    id('cntAktuell').textContent = '(' + k.verbindungenAktuell + ')';
    id('cntEingeschraenkt').textContent = '(' + k.verbindungenEingeschraenkt + ')';
    id('cntAltbestand').textContent = '(' + k.verbindungenAltbestand + ')';
    id('cntHinweis').textContent = '(' + k.verbindungenHinweis + ')';
  }

  function formatiereDatum(iso) {
    if (!iso) return '–';
    var t = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return t ? t[3] + '.' + t[2] + '.' + t[1] : iso;
  }

  /* ---------------------------------------------------------- Auswahl ---- */

  function fuelleAuswahlfelder() {
    var parteien = Object.keys(modell.facetten.parties || {}).sort();
    parteien.forEach(function (p) {
      var o = document.createElement('option');
      o.value = p; o.textContent = p + ' (' + modell.facetten.parties[p] + ')';
      id('fPartei').appendChild(o);
    });

    Object.keys(N.ROLLENARTEN).forEach(function (schluessel) {
      var anzahl = (modell.facetten.roleCategories || {})[schluessel];
      if (anzahl === undefined) return;
      var o = document.createElement('option');
      o.value = schluessel; o.textContent = N.ROLLENARTEN[schluessel] + ' (' + anzahl + ')';
      id('fRollenart').appendChild(o);
    });

    var vorhandene = {};
    modell.verbindungen.forEach(function (v) {
      v.typen.forEach(function (t) { vorhandene[t] = (vorhandene[t] || 0) + 1; });
    });
    Object.keys(N.VERBINDUNGSTYPEN).forEach(function (schluessel) {
      var o = document.createElement('option');
      o.value = schluessel;
      o.textContent = N.VERBINDUNGSTYPEN[schluessel] + ' (' + (vorhandene[schluessel] || 0) + ')';
      if (!vorhandene[schluessel]) o.disabled = true;
      id('fTyp').appendChild(o);
    });
  }

  function aktuellerFilter() {
    return {
      ebenen: {
        aktuell: id('ebAktuell').checked,
        eingeschraenkt: id('ebEingeschraenkt').checked,
        altbestand: id('ebAltbestand').checked,
        hinweis: id('ebHinweis').checked
      },
      zeitstatus: {
        reported_current: id('zsAktuell').checked,
        current_with_announced_change: id('zsAktuell').checked,
        future_announced: id('zsAngekuendigt').checked,
        historical: id('zsHistorisch').checked
      },
      nurPolitischeMandate: id('nurMandate').checked,
      partei: id('fPartei').value,
      rollenart: id('fRollenart').value,
      verbindungstyp: id('fTyp').value,
      verifizierung: id('fVerifizierung').value
    };
  }

  function filterGeaendert() {
    ansicht.setzeFilter(aktuellerFilter());
    zeigeDetail(null);
    if (id('ngoSuche').value) ansicht.setzeSuche(id('ngoSuche').value);
  }

  /* ------------------------------------------------------ Detailspalte --- */

  function abschnitt(ziel, titel, inhalt) {
    if (!inhalt) return;
    ziel.appendChild(knoten('p', 'ngo-detail-titel', titel));
    if (typeof inhalt === 'string') ziel.appendChild(knoten('p', 'ngo-detail-text', inhalt));
    else ziel.appendChild(inhalt);
  }

  function rollenListe(rollen) {
    var liste = knoten('ul', 'ngo-rollen');
    rollen.forEach(function (r) {
      var eintrag = document.createElement('li');
      eintrag.appendChild(knoten('span', 'ngo-rolle-person', r.personName || '(nicht ermittelt)'));
      eintrag.appendChild(knoten('span', 'ngo-rolle-funktion', r.funktion));
      var marken = knoten('span', 'ngo-marken');
      marken.appendChild(knoten('span', 'ngo-marke', r.rollenartText));
      marken.appendChild(knoten('span', 'ngo-marke ngo-marke--zeit', r.zeitstatusText));
      if (!r.verifiziert) marken.appendChild(knoten('span', 'ngo-marke ngo-marke--offen', 'zu prüfen'));
      eintrag.appendChild(marken);
      liste.appendChild(eintrag);
    });
    return liste;
  }

  function politischeListe(rollen) {
    var mit = rollen.filter(function (r) { return r.politischesAmt; });
    if (!mit.length) return null;
    var liste = knoten('ul', 'ngo-rollen');
    mit.forEach(function (r) {
      var eintrag = document.createElement('li');
      eintrag.appendChild(knoten('span', 'ngo-rolle-person', r.personName));
      eintrag.appendChild(knoten('span', 'ngo-rolle-funktion', r.politischesAmt));
      if (r.parteien.length) {
        var marken = knoten('span', 'ngo-marken');
        r.parteien.forEach(function (p) { marken.appendChild(knoten('span', 'ngo-marke ngo-marke--partei', p)); });
        eintrag.appendChild(marken);
      }
      liste.appendChild(eintrag);
    });
    return liste;
  }

  function quellenListe(rollen) {
    var quellen = {};
    rollen.forEach(function (r) { if (r.quelle) quellen[r.quelle] = r.quellenartText; });
    var namen = Object.keys(quellen);
    if (!namen.length) return null;
    var liste = knoten('ul', 'ngo-quellen');
    namen.sort().forEach(function (q) {
      var eintrag = document.createElement('li');
      eintrag.appendChild(knoten('span', 'ngo-quelle-text', q));
      eintrag.appendChild(knoten('span', 'ngo-marke', quellen[q]));
      liste.appendChild(eintrag);
    });
    return liste;
  }

  function pruefstatusBlock(rollen) {
    var offen = rollen.filter(function (r) { return !r.verifiziert; });
    var flags = {};
    rollen.forEach(function (r) {
      r.flags.forEach(function (f) { flags[f.text] = (flags[f.text] || 0) + 1; });
    });
    var stati = {};
    rollen.forEach(function (r) { if (r.pruefstatus) stati[r.pruefstatus] = (stati[r.pruefstatus] || 0) + 1; });

    var block = knoten('div', 'ngo-pruefung');
    block.appendChild(knoten('p', 'ngo-detail-text',
      rollen.length + ' erfasste Rolle' + (rollen.length === 1 ? '' : 'n') + ', davon ' +
      offen.length + ' noch zu prüfen.'));
    Object.keys(stati).forEach(function (s) {
      block.appendChild(knoten('span', 'ngo-marke', 'Prüfung ' + s + ': ' + stati[s]));
    });
    Object.keys(flags).forEach(function (f) {
      block.appendChild(knoten('span', 'ngo-marke ngo-marke--offen', f + ' (' + flags[f] + ')'));
    });
    return block;
  }

  function verbindungenZuOrganisation(orgId) {
    var filter = aktuellerFilter();
    return modell.verbindungen.filter(function (v) {
      return (v.quelle === orgId || v.ziel === orgId) && filter.ebenen[v.ebene];
    });
  }

  function verbindungsBlock(orgId) {
    var verbindungen = verbindungenZuOrganisation(orgId);
    if (!verbindungen.length) return null;
    var liste = knoten('ul', 'ngo-verbindungen');
    verbindungen.forEach(function (v) {
      var anderer = v.quelle === orgId ? v.ziel : v.quelle;
      var org = modell.organisationen[anderer];
      var eintrag = document.createElement('li');
      var knopf = knoten('button', 'nv-detail-link', org ? org.name : anderer);
      knopf.type = 'button';
      knopf.addEventListener('click', function () { ansicht.waehle(anderer); });
      eintrag.appendChild(knopf);
      eintrag.appendChild(knoten('span', 'ngo-detail-via', 'über ' + v.personen.join(', ')));
      var marken = knoten('span', 'ngo-marken');
      v.typenText.forEach(function (t) { marken.appendChild(knoten('span', 'ngo-marke ngo-marke--typ', t)); });
      marken.appendChild(knoten('span', 'ngo-marke ngo-marke--ebene-' + v.ebene,
        modell.ebenen[v.ebene] ? modell.ebenen[v.ebene].titel : v.ebene));
      eintrag.appendChild(marken);
      (v.belege || []).forEach(function (b) {
        eintrag.appendChild(knoten('span', 'ngo-beleg', '«' + b + '»'));
      });
      (v.gruende || []).forEach(function (g) {
        eintrag.appendChild(knoten('span', 'ngo-beleg ngo-beleg--grund', 'Nicht als aktuelle Verbindung gewertet: ' + g));
      });
      liste.appendChild(eintrag);
    });
    return liste;
  }

  function zeigeDetail(auswahl) {
    var ziel = id('ngoDetail');
    ziel.textContent = '';

    if (!auswahl) {
      ziel.appendChild(knoten('p', 'nv-detail-leer',
        'Organisation anklicken oder mit der Tabulatortaste anwählen. Dann erscheinen hier Führungsmodell, Führungspersonen, politische Ämter, Wechsel, Verbindungen, Quellen und Prüfstatus.'));
      return;
    }

    if (auswahl.typ === 'rolle') {
      var r = auswahl.rolle;
      ziel.appendChild(knoten('p', 'nv-detail-typ', 'Führungsperson'));
      ziel.appendChild(knoten('h3', 'nv-detail-name', r.personName || '(nicht ermittelt)'));
      var org = modell.organisationen[r.organisationId];
      if (org) ziel.appendChild(knoten('p', 'nv-detail-id', org.name));
      abschnitt(ziel, 'Funktion', r.funktion);
      abschnitt(ziel, 'Rollenart', r.rollenartText);
      abschnitt(ziel, 'Zeitstatus', r.zeitstatusText);
      if (r.politischesAmt) abschnitt(ziel, 'Politisches Amt', r.politischesAmt);
      if (r.parteien.length) abschnitt(ziel, 'Partei', r.parteien.join(', '));
      abschnitt(ziel, 'Quelle', r.quelle || 'nicht angegeben');
      if (r.quellenartText) abschnitt(ziel, 'Quellenart', r.quellenartText);
      if (r.abrufdatum) abschnitt(ziel, 'Abrufdatum', formatiereDatum(r.abrufdatum));
      abschnitt(ziel, 'Daten- und Prüfstatus', pruefstatusBlock([r]));
      var person = modell.personen[r.personId];
      if (person && person.notiz) abschnitt(ziel, 'Notiz aus der Recherche', person.notiz);
      return;
    }

    var organisation = modell.organisationen[auswahl.id];
    if (!organisation) return;
    var rollen = N.personenZuOrganisation(modell, auswahl.id, aktuellerFilter());

    ziel.appendChild(knoten('p', 'nv-detail-typ', 'Organisation'));
    ziel.appendChild(knoten('h3', 'nv-detail-name', organisation.name));
    ziel.appendChild(knoten('p', 'nv-detail-id', organisation.id));

    abschnitt(ziel, 'Führungsmodell', organisation.fuehrungsmodell ||
      'keine Besonderheit erfasst — klassische Führungsstruktur');
    abschnitt(ziel, 'Führungspersonen und Funktionen',
      rollen.length ? rollenListe(rollen) : 'keine Rolle entspricht den aktiven Filtern');
    abschnitt(ziel, 'Politische Ämter', politischeListe(rollen) || 'keine erfasst');
    if (organisation.fuehrungswechsel) abschnitt(ziel, 'Führungswechsel', organisation.fuehrungswechsel);
    abschnitt(ziel, 'Verbindungen und Verbindungstyp',
      verbindungsBlock(auswahl.id) || 'keine Verbindung in den aktiven Ebenen');

    var notizen = [];
    rollen.forEach(function (r) {
      var p = modell.personen[r.personId];
      if (p && p.notiz && notizen.indexOf(p.name + ': ' + p.notiz) === -1) {
        notizen.push(p.name + ': ' + p.notiz);
      }
    });
    if (notizen.length) {
      var liste = knoten('ul', 'ngo-quellen');
      notizen.forEach(function (n) { liste.appendChild(knoten('li', null, n)); });
      abschnitt(ziel, 'Notizen aus der Recherche', liste);
    }

    abschnitt(ziel, 'Quelle', quellenListe(rollen) || 'nicht angegeben');
    abschnitt(ziel, 'Daten- und Prüfstatus', pruefstatusBlock(rollen));
  }

  /* ---------------------------------------------------------- Tabellen --- */

  function fuelleTabellen() {
    var koerper = id('ngoTabelleVerbindungen').querySelector('tbody');
    var teil = document.createDocumentFragment();
    modell.verbindungen.forEach(function (v) {
      var a = modell.organisationen[v.quelle], b = modell.organisationen[v.ziel];
      var zeile = document.createElement('tr');
      zeile.appendChild(knoten('td', null, (a ? a.name : v.quelle) + ' ↔ ' + (b ? b.name : v.ziel)));
      zeile.appendChild(knoten('td', null, v.personen.join(', ')));
      zeile.appendChild(knoten('td', null, v.typenText.join(', ')));
      zeile.appendChild(knoten('td', null, modell.ebenen[v.ebene] ? modell.ebenen[v.ebene].titel : v.ebene));
      teil.appendChild(zeile);
    });
    koerper.appendChild(teil);

    var rollenKoerper = id('ngoTabelleRollen').querySelector('tbody');
    var teil2 = document.createDocumentFragment();
    modell.rollen.slice().sort(function (x, y) {
      var ox = modell.organisationen[x.organisationId], oy = modell.organisationen[y.organisationId];
      return String(ox ? ox.name : '').localeCompare(String(oy ? oy.name : ''), 'de-CH');
    }).forEach(function (r) {
      var org = modell.organisationen[r.organisationId];
      var zeile = document.createElement('tr');
      zeile.appendChild(knoten('td', null, org ? org.name : r.organisationId));
      zeile.appendChild(knoten('td', null, r.personName || '(nicht ermittelt)'));
      zeile.appendChild(knoten('td', null, r.funktion));
      zeile.appendChild(knoten('td', null, r.zeitstatusText));
      zeile.appendChild(knoten('td', null, r.verifiziert ? 'verifiziert' : 'zu prüfen'));
      teil2.appendChild(zeile);
    });
    rollenKoerper.appendChild(teil2);

    id('ngoQuelle').textContent = 'Quelle: ' + PFAD_NETZ + ' und ' + PFAD_REDAKTION +
      ' — erzeugt aus dem internen Datenbestand, ohne interne Prüfprotokolle und Recherchenotizen.';
  }

  /* ------------------------------------------------------------ Start ---- */

  function start(flat, redaktion) {
    modell = N.baueModell(flat, redaktion);
    fuelleKennzahlen();
    fuelleAuswahlfelder();
    fuelleTabellen();

    ansicht = window.NgoAnsicht.erstelle({
      modell: modell,
      svg: id('ngoSvg'),
      status: id('ngoStatus'),
      beiAuswahl: zeigeDetail
    });
    ansicht.setzeFilter(aktuellerFilter());
    zeigeDetail(null);

    ['ebAktuell', 'ebEingeschraenkt', 'ebAltbestand', 'ebHinweis',
     'zsAktuell', 'zsAngekuendigt', 'zsHistorisch', 'nurMandate',
     'fPartei', 'fRollenart', 'fTyp', 'fVerifizierung'].forEach(function (feld) {
      id(feld).addEventListener('change', filterGeaendert);
    });

    var suchTimer = null;
    id('ngoSuche').addEventListener('input', function (e) {
      var wert = e.target.value;
      clearTimeout(suchTimer);
      suchTimer = setTimeout(function () { ansicht.setzeSuche(wert); }, 160);
    });

    id('ngoReset').addEventListener('click', function () {
      id('ngoSuche').value = '';
      ['ebEingeschraenkt', 'ebAltbestand', 'ebHinweis', 'zsAngekuendigt', 'zsHistorisch', 'nurMandate']
        .forEach(function (f) { id(f).checked = false; });
      ['ebAktuell', 'zsAktuell'].forEach(function (f) { id(f).checked = true; });
      ['fPartei', 'fRollenart', 'fTyp'].forEach(function (f) { id(f).value = ''; });
      id('fVerifizierung').value = 'alle';
      ansicht.setzeZurueck();
    });

    id('ngoPlus').addEventListener('click', function () { ansicht.zoome(1.25); });
    id('ngoMinus').addEventListener('click', function () { ansicht.zoome(1 / 1.25); });

    var buehne = id('ngoBuehne');
    var vollbild = id('ngoVollbild');
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
    Promise.all([lade(PFAD_NETZ), lade(PFAD_REDAKTION)])
      .then(function (e) { start(e[0], e[1]); })
      .catch(function (fehler) {
        zeigeFehler('Die Daten konnten nicht geladen werden: ' + fehler.message +
          ' Die Vorschau benötigt einen lokalen Webserver; ein Aufruf über file:// wird vom Browser blockiert. ' +
          'Beispiel: python -m http.server 8000 im Projektordner starten.');
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialisiere);
  else initialisiere();
})();
