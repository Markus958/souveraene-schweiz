/*!
 * ngo-cockpit.js — Überblicksseite des NGO-Netzwerks
 * souveraene-schweiz.ch
 *
 * Zählt den Datenbestand aus und stellt ihn als Kennzahlen, Verteilungen und
 * Ranglisten dar. Gleiche Datei wie die Netzwerkseite, gleiche Datenschicht —
 * die Zahlen können deshalb nicht auseinanderlaufen.
 *
 * Alle Werte sind Auszählungen. Was sie nicht sind, steht im Methodikhinweis
 * auf der Seite und an jeder Karte.
 */
(function () {
  'use strict';

  var PFAD = (function () {
    var haupt = document.getElementById('ck');
    return (haupt && haupt.getAttribute('data-quelle')) || '../assets/ngo/ngo-netzwerk.json';
  })();

  var N = window.NgoNetzDaten;
  var modell = null;

  function id(name) { return document.getElementById(name); }

  function knoten(tag, klasse, text) {
    var k = document.createElement(tag);
    if (klasse) k.className = klasse;
    if (text !== undefined && text !== null) k.textContent = text;
    return k;
  }

  function zahlText(wert) {
    return String(wert).replace(/\B(?=(\d{3})+(?!\d))/g, '’');
  }

  function zeigeFehler(text) {
    var b = id('ckFehler');
    b.hidden = false;
    b.className = 'nv-fehler';
    b.textContent = text;
  }

  /* ------------------------------------------------------- Kennzahlen ---- */

  /**
   * Eine Kennzahl: Wert und Beschriftung in derselben Zeile, darunter höchstens
   * zwei Zeilen Erläuterung. Längere Erläuterungen werden abgeschnitten, der
   * volle Text bleibt als Titel erreichbar.
   */
  function kennzahl(wert, beschriftung, zusatz) {
    var kachel = knoten('div', 'ck-kennzahl');
    var zeile = knoten('p', 'ck-kennzahl-zeile');
    zeile.appendChild(knoten('b', null, zahlText(wert)));
    zeile.appendChild(knoten('span', null, beschriftung));
    kachel.appendChild(zeile);
    if (zusatz) {
      var klein = knoten('small', null, zusatz);
      klein.title = zusatz;
      kachel.appendChild(klein);
    }
    return kachel;
  }

  function fuelleKennzahlen() {
    var z = modell.meta.zahlen || {};
    var ziel = id('ckKennzahlen');
    var schnitt = 0;
    var bruecken = modell.personen.filter(function (p) { return p.organisationen.length > 1; });
    bruecken.forEach(function (p) { schnitt += p.organisationen.length; });
    schnitt = bruecken.length ? (schnitt / bruecken.length) : 0;

    // Fünf Kacheln. Die Abdeckungslücken stehen als eigener Abschnitt auf der
    // Netzwerkseite und brauchen hier keine eigene Kachel.
    [[z.organisationen, 'Organisationen', 'untersuchter Bestand'],
     [z.personen, 'Personen', 'nach Zusammenführung der Schreibvarianten'],
     [z.kanten, 'Beziehungen', z.kantenG3 + ' davon im Kernnetz'],
     [bruecken.length, 'Brückenpersonen', 'bei mehreren Organisationen erfasst'],
     ['Ø ' + schnitt.toFixed(1).replace('.', ','), 'Organisationen', 'je Brückenperson']
    ].forEach(function (k) {
      ziel.appendChild(kennzahl(k[0], k[1], k[2]));
    });
  }

  /* ------------------------------------------------------- Verteilungen -- */

  /**
   * Balkenliste. Ein Farbton für alle Balken: Die Kategorie steht als Text
   * daneben, eine zweite Farbcodierung trüge nichts bei.
   */
  function balken(ziel, eintraege) {
    var groesster = eintraege.reduce(function (m, e) { return Math.max(m, e.wert); }, 0) || 1;
    eintraege.forEach(function (e) {
      var zeile = document.createElement('li');
      if (e.verweis) {
        var link = document.createElement('a');
        link.className = 'ck-balken-name';
        link.href = e.verweis;
        link.textContent = e.name;
        if (e.titel) link.title = e.titel;
        zeile.appendChild(link);
      } else {
        var name = knoten('span', 'ck-balken-name', e.name);
        // Bei der Sammelzeile steht hier, was gebuendelt wurde — sonst
        // verschwaende ein Teil der Verteilung stillschweigend.
        if (e.titel) name.title = e.titel;
        zeile.appendChild(name);
      }
      var spur = knoten('span', 'ck-balken-spur');
      var fuellung = knoten('span', 'ck-balken-fuellung');
      fuellung.style.width = Math.max(1, Math.round(e.wert * 100 / groesster)) + '%';
      if (e.schwach) fuellung.classList.add('ck-balken-fuellung--schwach');
      spur.appendChild(fuellung);
      zeile.appendChild(spur);
      zeile.appendChild(knoten('span', 'ck-balken-wert', zahlText(e.wert)));
      ziel.appendChild(zeile);
    });
  }

  function fuelleObergruppen() {
    var zaehler = {};
    modell.organisationen.forEach(function (o) {
      zaehler[o.obergruppe] = (zaehler[o.obergruppe] || 0) + 1;
    });
    var eintraege = Object.keys(zaehler).sort(function (a, b) { return zaehler[b] - zaehler[a]; })
      .map(function (name) {
        return {
          name: name, wert: zaehler[name], schwach: zaehler[name] < 5,
          verweis: './?obergruppe=' + encodeURIComponent(name),
          titel: 'Cluster dieser Obergruppe im Netzwerk zeigen'
        };
      });
    balken(id('ckObergruppen'), aufFuenf(eintraege, 'Obergruppen'));

    // Die Fussnote nennt, wie viele Organisationen ueberhaupt eine Obergruppe
    // tragen. Bei 3.7.49 waren es fast alle, seit 3.7.51 die Minderheit — eine
    // feste Formulierung waere hier beim naechsten Datenstand falsch.
    var ohne = zaehler['ohne Zuordnung'] || 0;
    var gesamt = modell.organisationen.length;
    var fuss = id('ckObergruppenFuss');
    if (fuss) {
      fuss.textContent = 'Die grobe Einteilung des Datenbestands. ' +
        zahlText(gesamt - ohne) + ' der ' + zahlText(gesamt) + ' Organisationen tragen eine ' +
        'Obergruppe, ' + zahlText(ohne) + ' keine. Fehlende Zuordnung heisst nicht, dass eine ' +
        'Organisation keiner Gruppe angehört — sie ist im Bestand nicht erfasst.';
    }
  }

  /**
   * Kürzt eine Verteilung auf fünf Zeilen: vier einzeln, der Rest als
   * Sammelzeile. Einfach abschneiden ginge nicht — die Summe muss den
   * Bestand ergeben, sonst behauptet die Kachel etwas Falsches.
   */
  function aufFuenf(eintraege, was) {
    if (eintraege.length <= 5) return eintraege;
    var gezeigt = eintraege.slice(0, 4);
    var rest = eintraege.slice(4);
    var summe = rest.reduce(function (s, e) { return s + e.wert; }, 0);
    gezeigt.push({
      name: 'Übrige ' + was, wert: summe, schwach: true,
      titel: rest.map(function (e) { return e.name + ' (' + e.wert + ')'; }).join(', ')
    });
    return gezeigt;
  }

  function fuelleKlassen() {
    var text = modell.meta.klassenText || {};
    var eintraege = (modell.meta.klassen || ['N1', 'N2', 'N3', 'N4']).map(function (k) {
      return {
        name: (text[k] || k).replace(/^N\d\s*—\s*/, k + ' — '),
        wert: modell.kanten.filter(function (e) { return e.klasse === k; }).length,
        schwach: k === 'N4'
      };
    });
    balken(id('ckKlassen'), aufFuenf(eintraege, 'Beziehungsarten'));
  }

  /* --------------------------------------------------------- Ranglisten -- */

  function liste(ziel, eintraege, verweis) {
    var groesster = eintraege.reduce(function (m, e) { return Math.max(m, e.wert); }, 0) || 1;
    eintraege.forEach(function (e) {
      var zeile = document.createElement('li');
      var name = verweis ? document.createElement('a') : knoten('span', 'ck-liste-name');
      if (verweis) {
        name.className = 'ck-liste-name';
        name.href = verweis(e);
      }
      name.textContent = e.name;
      zeile.appendChild(name);
      if (e.zusatz) {
        var zusatz = knoten('span', 'ck-liste-zusatz', e.zusatz);
        zusatz.title = e.zusatzTitel || e.zusatz;
        name.appendChild(zusatz);
      }
      var spur = knoten('span', 'ck-balken-spur ck-balken-spur--schmal');
      var fuellung = knoten('span', 'ck-balken-fuellung');
      fuellung.style.width = Math.max(4, Math.round(e.wert * 100 / groesster)) + '%';
      spur.appendChild(fuellung);
      zeile.appendChild(spur);
      zeile.appendChild(knoten('span', 'ck-balken-wert', zahlText(e.wert)));
      ziel.appendChild(zeile);
    });
  }

  function fuellePersonen() {
    var filter = N.standardFilter();
    filter.ansicht = 'G2';
    filter.klassen.N4 = true;
    // Eine Rangliste, keine Verteilung: «die meisten» sagt schon, dass es
    // weitergeht. Der Verweis unter der Kachel führt zur vollen Liste.
    var eintraege = N.personenUebersicht(modell, filter).slice(0, 5).map(function (e) {
      // Parteiangaben gehoeren zur Person. Mehrere Angaben werden alle gezeigt,
      // damit nichts zu einer einzigen Zuordnung verkuerzt wird.
      var parteien = e.person.parteien.slice();
      e.kanten.forEach(function (k) {
        if (k.partei && parteien.indexOf(k.partei) === -1) parteien.push(k.partei);
      });
      return {
        name: e.person.name, wert: e.anzahlOrganisationen, index: e.person.index,
        zusatz: parteien.join(', '),
        zusatzTitel: parteien.length ? 'Parteiangabe der Person: ' + parteien.join(', ') : ''
      };
    });
    // Der Verweis nimmt die erweiterte Ansicht mit, sonst zeigt der
    // Personenfokus weniger Organisationen als die Rangliste zaehlt.
    liste(id('ckPersonen'), eintraege, function (e) {
      return './?person=' + e.index + '&ansicht=G2&klassen=N1,N2,N3,N4';
    });
  }

  function fuelleOrganisationen() {
    var eintraege = modell.organisationen.slice()
      .sort(function (a, b) { return b.personen - a.personen; })
      .slice(0, 10).map(function (o) {
        return { name: o.name, wert: o.personen, id: o.id };
      });
    liste(id('ckOrganisationen'), eintraege, function (e) {
      return './?ebene=organisation&knoten=' + e.id;
    });
  }

  /* ------------------------------------------------------- Parteiangaben - */

  function fuelleParteien() {
    var personen = {};
    var organisationen = {};
    var jePartei = {};
    modell.kanten.forEach(function (k) {
      if (!k.partei) return;
      personen[k.person.index] = true;
      organisationen[k.organisation.id] = true;
      jePartei[k.partei] = jePartei[k.partei] || {};
      jePartei[k.partei][k.person.index] = true;
    });

    var ziel = id('ckParteien');
    var kopf = knoten('p', 'ck-partei-kopf');
    kopf.appendChild(knoten('b', null, zahlText(Object.keys(personen).length)));
    kopf.appendChild(document.createTextNode(' der ' +
      zahlText(modell.kennzahlen.personen) + ' erfassten Personen tragen eine Parteiangabe. ' +
      'Sie sind bei ' + zahlText(Object.keys(organisationen).length) + ' Organisationen erfasst.'));
    ziel.appendChild(kopf);

    var eintraege = Object.keys(jePartei).map(function (p) {
      return {
        // Der Balken zaehlt Personen, nicht Organisationen.
        name: p, wert: Object.keys(jePartei[p]).length,
        // Der Verweis zeigt die Organisationen, bei denen Personen mit dieser
        // Parteiangabe erfasst sind — alle vier Beziehungsarten, damit die Zahl
        // dieselbe Grundlage hat wie der Balken.
        verweis: './?ebene=organisation&partei=' + encodeURIComponent(p) +
                 '&ansicht=G2&klassen=N1,N2,N3,N4',
        titel: 'Organisationen zeigen, bei denen Personen mit der Parteiangabe ' +
               p + ' erfasst sind'
      };
    }).sort(function (a, b) { return b.wert - a.wert; }).slice(0, 8);
    var balkenListe = knoten('ol', 'ck-balken ck-balken--klein');
    balken(balkenListe, eintraege);
    ziel.appendChild(balkenListe);

    // Der Hinweis steht nicht mehr unter der Karte, sondern hinter dem
    // i-Knopf: Er bleibt erreichbar, ohne die Karte zu verlängern.
    HINWEISE.partei = (modell.meta.hinweise || {}).partei ||
      'Parteiangaben gehören zu einzelnen Personen. Aus ihnen lässt sich keine ' +
      'Parteizugehörigkeit der Organisation ableiten.';
  }

  /* ----------------------------------------------------------- Vorschau -- */

  /**
   * Die Clusterebene stand hier als kleines Netzbild. Mit 64 Clustern und 641
   * Verbindungen zwischen ihnen waere das ein Knaeuel: Ein Bild dieser Dichte
   * behauptet Struktur, die niemand mehr ablesen kann. An seine Stelle tritt
   * die benannte Liste darunter.
   */
  function zeichneCluster() {
    var filter = N.standardFilter();
    var netz = N.baueClusternetz(modell, filter);
    if (!netz.knoten.length) return;
    var kopf = id('ckClusterKopf');
    if (kopf) {
      kopf.textContent = netz.knoten.length + ' Cluster mit ' + netz.kanten.length +
        ' Verbindungen zwischen ihnen. Ein Cluster ist eine Gruppe von Organisationen, ' +
        'die im Netz besonders dicht untereinander verbunden sind. Anklicken öffnet den ' +
        'Cluster im Netzwerk.';
    }
    zeichneClusterliste(netz);
  }

  /** Adresse der Clusterebene mit geöffnetem Cluster. */
  function clusterVerweis(knoten) {
    return './?fokus=' + encodeURIComponent(knoten.cluster);
  }

  /**
   * Benannte Liste der Cluster unter der Vorschau. Ohne sie trägt die Grafik
   * die Namen nur im Tooltip — auf Berührungsgeräten also gar nicht.
   */
  function zeichneClusterliste(netz) {
    var ziel = id('ckClusterListe');
    if (!ziel) return;
    ziel.textContent = '';
    netz.knoten.slice().sort(function (a, b) {
      return Number(a.cluster) - Number(b.cluster);
    }).forEach(function (k) {
      var zeile = document.createElement('li');
      var verweis = document.createElement('a');
      verweis.href = clusterVerweis(k);
      verweis.title = k.vollname + ' im Netzwerk öffnen';
      verweis.appendChild(knoten('span', 'ck-cl-nummer', k.cluster + '.'));
      verweis.appendChild(knoten('span', 'ck-cl-name', k.vollname));
      verweis.appendChild(knoten('span', 'ck-cl-zahl', String(k.mitglieder)));
      zeile.appendChild(verweis);
      ziel.appendChild(zeile);
    });
  }

  /* --------------------------------------------------------- Erklärungen - */

  var HINWEISE = {
    obergruppe: 'Die Obergruppe teilt den Bestand grob in gemeinnützige und ' +
      'zivilgesellschaftliche NGOs, Wirtschafts- und Berufsverbände sowie politische und ' +
      'gesellschaftliche Interessenorganisationen. Sie stammt aus dem Datenbestand und ist ' +
      'keine Bewertung.'
  };

  function verdrahteHinweise() {
    Array.prototype.slice.call(document.querySelectorAll('[data-ck-hinweis]'))
      .forEach(function (knopf) {
        knopf.addEventListener('click', function () {
          var text = HINWEISE[knopf.getAttribute('data-ck-hinweis')];
          if (!text) return;
          var vorhanden = knopf.closest('h2').nextElementSibling;
          if (vorhanden && vorhanden.classList.contains('ck-hinweis')) {
            vorhanden.remove();
            return;
          }
          var kasten = knoten('p', 'ck-hinweis', text);
          knopf.closest('h2').insertAdjacentElement('afterend', kasten);
        });
      });
  }

  /* ------------------------------------------------------------ Start ---- */

  function start(daten) {
    modell = N.baueModell(daten);
    var version = (modell.meta.masterVersion || '').split('–')[0].trim();
    var stand = (modell.meta.datenstand || '')
      .replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3.$2.$1');
    id('ckVersion').textContent = stand
      ? 'Datenstand ' + stand + (version ? ', Version ' + version : '')
      : (version ? 'Version ' + version : '');

    fuelleKennzahlen();
    fuelleObergruppen();
    fuelleKlassen();
    fuellePersonen();
    fuelleOrganisationen();
    fuelleParteien();
    zeichneCluster();
    verdrahteHinweise();
  }

  function initialisiere() {
    fetch(PFAD, { cache: 'no-cache' })
      .then(function (a) {
        if (!a.ok) throw new Error(PFAD + ' (HTTP ' + a.status + ')');
        return a.json();
      })
      .then(start)
      .catch(function (fehler) {
        zeigeFehler('Die Daten konnten nicht geladen werden: ' + fehler.message +
          ' Die Vorschau benötigt einen lokalen Webserver; ein Aufruf über file:// wird vom ' +
          'Browser blockiert.');
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialisiere);
  else initialisiere();
})();
