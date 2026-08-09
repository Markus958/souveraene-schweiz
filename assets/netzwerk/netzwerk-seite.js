/*!
 * netzwerk-seite.js — Verdrahtung der Vorschauseite
 * souveraene-schweiz.ch
 *
 * Laedt CSV und Meta-Angaben, erzeugt das Modell (netzwerk-daten.js) und
 * verbindet die Bedienelemente mit der Ansicht (netzwerk-ansicht.js).
 */
(function () {
  'use strict';

  var CSV_PFAD = 'assets/data/netzwerk-verflechtungen.csv';
  var META_PFAD = 'assets/data/netzwerk-verflechtungen-meta.json';

  function id(name) { return document.getElementById(name); }

  function zeigeFehler(text) {
    var behaelter = id('nvFehler');
    behaelter.hidden = false;
    behaelter.className = 'nv-fehler';
    behaelter.textContent = text;
  }

  function ladeText(pfad) {
    return fetch(pfad, { cache: 'no-cache' }).then(function (antwort) {
      if (!antwort.ok) throw new Error(pfad + ' konnte nicht geladen werden (HTTP ' + antwort.status + ').');
      return antwort.text();
    });
  }

  function fuelleKennzahlen(kennzahlen, meta) {
    id('kzUntersucht').textContent = meta && meta.untersuchteOrganisationen != null
      ? meta.untersuchteOrganisationen : '–';
    id('kzMitBruecke').textContent = kennzahlen.organisationenMitBruecke;
    id('kzPersonen').textContent = kennzahlen.brueckenpersonen;
    id('kzPaare').textContent = kennzahlen.organisationspaare;
    id('kzTeilnetze').textContent = kennzahlen.teilnetze;
    id('kzDatenstand').textContent = kennzahlen.datenstand || (meta && meta.datenstand) || '–';
  }

  function fuelleTeilnetzAuswahl(modell) {
    var auswahl = id('nvTeilnetz');
    modell.teilnetze.forEach(function (t) {
      var option = document.createElement('option');
      option.value = String(t.nummer);
      option.textContent = 'Teilnetz ' + t.nummer + ' (' + t.groesse + ' Organisationen)';
      auswahl.appendChild(option);
    });
  }

  function fuelleTabelle(modell) {
    var koerper = id('nvTabelle').querySelector('tbody');
    var bruchstuecke = document.createDocumentFragment();
    modell.datensatz.personenSortiert.forEach(function (name) {
      var person = modell.datensatz.personen[name];
      var zeile = document.createElement('tr');

      var zellePerson = document.createElement('td');
      zellePerson.textContent = name;
      zeile.appendChild(zellePerson);

      var zelleOrgs = document.createElement('td');
      zelleOrgs.textContent = person.organisationen.map(function (ngoId) {
        return modell.datensatz.organisationen[ngoId].name + ' (' + ngoId + ')';
      }).join(' · ');
      zeile.appendChild(zelleOrgs);

      var zelleAnzahl = document.createElement('td');
      zelleAnzahl.textContent = person.organisationen.length;
      zeile.appendChild(zelleAnzahl);

      bruchstuecke.appendChild(zeile);
    });
    koerper.appendChild(bruchstuecke);
  }

  function start(csvText, meta) {
    var modell = window.NetzwerkDaten.baueModell(csvText);

    fuelleKennzahlen(modell.kennzahlen, meta);
    fuelleTeilnetzAuswahl(modell);
    fuelleTabelle(modell);
    id('nvQuelle').textContent = 'Quelle: ' + CSV_PFAD +
      (meta && meta.quelle ? ' — ' + meta.quelle : '') + '.';

    var ansicht = window.NetzwerkAnsicht.erstelle({
      modell: modell,
      svg: id('nvSvg'),
      buehne: id('nvBuehne'),
      detail: id('nvDetail'),
      status: id('nvStatus')
    });
    ansicht.zeichne();
    ansicht.zeigeDetail(null);

    /* --- Umschalter --- */
    function setzeAnsicht(welche) {
      ansicht.setzeAnsicht(welche);
      id('btnOrg').setAttribute('aria-pressed', String(welche === 'organisation'));
      id('btnBi').setAttribute('aria-pressed', String(welche === 'bipartit'));
      id('legPerson').hidden = welche !== 'bipartit';
      id('legMehrfach').hidden = welche !== 'organisation';
      if (id('nvSuche').value) ansicht.setzeSuche(id('nvSuche').value);
    }
    id('btnOrg').addEventListener('click', function () { setzeAnsicht('organisation'); });
    id('btnBi').addEventListener('click', function () { setzeAnsicht('bipartit'); });

    // Optionaler Direkteinstieg: ?ansicht=personen
    var parameter = new URLSearchParams(window.location.search);
    if ((parameter.get('ansicht') || '').toLowerCase() === 'personen') setzeAnsicht('bipartit');

    /* --- Suche --- */
    var suchTimer = null;
    id('nvSuche').addEventListener('input', function (e) {
      var wert = e.target.value;
      clearTimeout(suchTimer);
      suchTimer = setTimeout(function () { ansicht.setzeSuche(wert); }, 160);
    });
    id('nvSuche').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var treffer = ansicht.setzeSuche(e.target.value);
        if (treffer.length) ansicht.waehle(treffer[0].id);
      }
    });

    /* --- Teilnetz-Filter --- */
    id('nvTeilnetz').addEventListener('change', function (e) {
      ansicht.setzeTeilnetz(parseInt(e.target.value, 10) || 0);
      if (id('nvSuche').value) ansicht.setzeSuche(id('nvSuche').value);
    });

    /* --- Zuruecksetzen --- */
    id('nvReset').addEventListener('click', function () {
      id('nvSuche').value = '';
      id('nvTeilnetz').value = '0';
      ansicht.setzeAllesZurueck();
    });

    /* --- Zoom --- */
    id('nvPlus').addEventListener('click', function () { ansicht.zoome(1.25); });
    id('nvMinus').addEventListener('click', function () { ansicht.zoome(1 / 1.25); });

    /* --- Vollbild (optional, nur wenn unterstuetzt) --- */
    var buehne = id('nvBuehne');
    var vollbildKnopf = id('nvVollbild');
    if (!buehne.requestFullscreen) {
      vollbildKnopf.hidden = true;
    } else {
      vollbildKnopf.addEventListener('click', function () {
        if (document.fullscreenElement) document.exitFullscreen();
        else buehne.requestFullscreen();
      });
      document.addEventListener('fullscreenchange', function () {
        vollbildKnopf.textContent = document.fullscreenElement ? 'Vollbild beenden' : 'Vollbild';
        setTimeout(function () { ansicht.zeichne(); }, 60);
      });
    }

    /* --- Groessenaenderung --- */
    var breiteVorher = window.innerWidth;
    var groessenTimer = null;
    window.addEventListener('resize', function () {
      if (Math.abs(window.innerWidth - breiteVorher) < 40) return;
      breiteVorher = window.innerWidth;
      clearTimeout(groessenTimer);
      groessenTimer = setTimeout(function () { ansicht.zeichne(); }, 220);
    });
  }

  var bereitsGestartet = false;

  function initialisiere() {
    if (bereitsGestartet) return; // doppelte Ausloesung verhindern
    bereitsGestartet = true;

    if (!window.d3 || !window.d3.forceSimulation) {
      zeigeFehler('Die lokale Netzwerkbibliothek (assets/vendor/d3-force-bundle.min.js) wurde nicht geladen.');
      return;
    }
    Promise.all([
      ladeText(CSV_PFAD),
      ladeText(META_PFAD).then(JSON.parse).catch(function () { return null; })
    ]).then(function (ergebnisse) {
      start(ergebnisse[0], ergebnisse[1]);
    }).catch(function (fehler) {
      zeigeFehler(
        'Die Datengrundlage konnte nicht geladen werden: ' + fehler.message +
        ' Die Vorschau benötigt einen lokalen Webserver, ein direkter Aufruf über file:// wird vom Browser blockiert. ' +
        'Beispiel: python -m http.server 8000 im Projektordner starten und http://localhost:8000/netzwerk-verflechtungen-vorschau.html öffnen.'
      );
    });
  }

  // Auch dann starten, wenn das Skript erst nach dem Laden eingebunden wird.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialisiere);
  } else {
    initialisiere();
  }
})();
