/*!
 * ngo-cockpit-v2.js — Überblicksseite des NGO-Netzwerks, zweite Fassung
 * souveraene-schweiz.ch
 *
 * Zweck: dieselben Daten wie die erste Fassung, aber filterbar und ohne die
 * lange Clusterliste auf der Startfläche. Jede Zahl bleibt eine Auszählung des
 * erfassten Bestands.
 *
 * Annahmen, die hier gelten:
 * - Datenquelle und Modell sind dieselben wie überall im Teilprojekt:
 *   assets/ngo/ngo-netzwerk.json über NgoNetzDaten.baueModell(). Es gibt keine
 *   zweite Datenhaltung und damit auch keine Zahlen, die auseinanderlaufen.
 * - Keine externe Bibliothek. Die Treemap ist unten ausgeschrieben (squarified
 *   nach Bruls/Huizing/van Wijk); für zwölf Rechtecke lohnt kein Paket.
 * - Der Filter wirkt auf die Auszählungen dieser Seite. Er wird nicht in die
 *   Netzwerkseite übernommen — deren Filter hat eigene Regeln (Projektion,
 *   Ebenen), und ein halb übertragener Zustand wäre schlimmer als keiner.
 */
(function () {
  'use strict';

  var PFAD = (function () {
    var haupt = document.getElementById('c2');
    return (haupt && haupt.getAttribute('data-quelle')) || 'assets/ngo/ngo-netzwerk.json';
  })();

  var N = window.NgoNetzDaten;
  var modell = null;

  var KLASSEN = ['N1', 'N2', 'N3', 'N4'];
  var KERN = ['N1', 'N2', 'N3'];

  // Farbabstufung der Treemap: ein Blauton, sequenziell — die Fläche zeigt eine
  // Menge, keine Kategorien. Bewusst nur die helle Hälfte des Verlaufs: Auf den
  // mittleren Blautönen erreicht weder weisse noch dunkle Schrift den nötigen
  // Kontrast (auf #5187bd sind es 3,75 zu Weiss und 4,3 zu Dunkelblau). Die
  // Grösse liest man ohnehin an der Fläche ab; die Farbe gibt nur Tiefe.
  var BLAU = ['#e7eef6', '#d3e0ee', '#bcd0e5', '#a3c0dc', '#8bafd4'];
  var TREEMAP_INK = '#0f2233';
  var TREEMAP_INK_LEISE = '#425a70';

  var zustand = {
    kategorie: '', partei: '', kanton: '', clusterMin: 0,
    klassen: { N1: true, N2: true, N3: true, N4: true },
    kernnetz: false, bruecken: false, mitPersonen: false
  };

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
    var b = id('c2Fehler');
    b.hidden = false;
    b.className = 'nv-fehler';
    b.textContent = text;
  }

  /* ------------------------------------------------------------ Filter --- */

  /** Aktive Beziehungsklassen; «nur Kernnetz» schneidet N4 zusätzlich weg. */
  function aktiveKlassen() {
    return KLASSEN.filter(function (k) {
      if (!zustand.klassen[k]) return false;
      return !zustand.kernnetz || KERN.indexOf(k) !== -1;
    });
  }

  function organisationPasst(o) {
    if (zustand.kategorie && (o.kategorie || '') !== zustand.kategorie) {
      return false;
    }
    if (zustand.kanton && (o.kanton || '') !== zustand.kanton) return false;
    if (zustand.clusterMin) {
      var c = modell.cluster[o.cluster];
      if (!c || c.groesse < zustand.clusterMin) return false;
    }
    if (zustand.mitPersonen && !o.personen) return false;
    return true;
  }

  /**
   * Kanten des aktuellen Filters. Die Organisationsbedingungen wirken über die
   * Organisation der Kante, die Parteibedingung über die Kante selbst — eine
   * Parteiangabe gehört zur Person in ihrer Rolle, nicht zur Organisation.
   */
  function gefilterteKanten() {
    var klassen = aktiveKlassen();
    var bruecken = zustand.bruecken;
    return modell.kanten.filter(function (k) {
      if (klassen.indexOf(k.klasse) === -1) return false;
      if (zustand.partei && k.partei !== zustand.partei) return false;
      if (bruecken && k.person.organisationen.length < 2) return false;
      return organisationPasst(k.organisation);
    });
  }

  function gefilterteOrganisationen() {
    return modell.organisationen.filter(organisationPasst);
  }

  /** Personen, die in den gefilterten Kanten vorkommen. */
  function personenAus(kanten) {
    var gesehen = {}, liste = [];
    kanten.forEach(function (k) {
      var i = k.person.index;
      if (gesehen[i]) return;
      gesehen[i] = true;
      liste.push(k.person);
    });
    return liste;
  }

  function filterAktiv() {
    return !!(zustand.kategorie || zustand.partei || zustand.kanton || zustand.clusterMin
      || zustand.kernnetz || zustand.bruecken || zustand.mitPersonen
      || KLASSEN.some(function (k) { return !zustand.klassen[k]; }));
  }

  /* -------------------------------------------------------- Kennzahlen --- */

  var KPI_SCHALTER = {
    organisationen: null,
    personen: 'mitPersonen',
    beziehungen: 'kernnetz',
    bruecken: 'bruecken'
  };

  function zeichneKennzahlen(daten) {
    var ziel = id('c2Kpi');
    ziel.textContent = '';

    var kacheln = [
      { schluessel: 'organisationen', wert: daten.organisationen.length,
        name: 'Organisationen',
        zusatz: daten.luecken + ' ohne erfasste Beziehung',
        aktion: 'Filter zurücksetzen' },
      { schluessel: 'personen', wert: daten.personen.length,
        name: 'Personen',
        zusatz: 'in den gezeigten Beziehungen erfasst',
        aktion: 'nur Organisationen mit erfassten Personen' },
      { schluessel: 'beziehungen', wert: daten.kanten.length,
        name: 'Beziehungen',
        zusatz: daten.kern + ' davon im Kernnetz N1–N3',
        aktion: 'nur Kernnetz' },
      { schluessel: 'bruecken', wert: daten.bruecken.length,
        name: 'Brückenpersonen',
        zusatz: 'bei mehreren Organisationen erfasst',
        aktion: 'nur Brückenpersonen' },
      { schluessel: null, wert: daten.schnitt,
        name: 'Organisationen',
        zusatz: 'je Brückenperson, im Schnitt' }
    ];

    kacheln.forEach(function (k) {
      var schalter = k.schluessel ? KPI_SCHALTER[k.schluessel] : null;
      var el = document.createElement(k.aktion ? 'button' : 'div');
      el.className = 'c2-kpi-karte';
      if (k.aktion) {
        el.type = 'button';
        if (schalter) {
          el.setAttribute('aria-pressed', zustand[schalter] ? 'true' : 'false');
        }
        el.title = k.aktion;
      }
      el.appendChild(knoten('b', 'c2-kpi-zahl',
        typeof k.wert === 'number' ? zahlText(k.wert) : k.wert));
      el.appendChild(knoten('span', 'c2-kpi-name', k.name));
      el.appendChild(knoten('small', 'c2-kpi-zusatz', k.zusatz));
      if (k.aktion) {
        el.appendChild(knoten('span', 'c2-kpi-schalter',
          schalter && zustand[schalter] ? '✓ ' + k.aktion : k.aktion));
        el.addEventListener('click', function () {
          if (!schalter) { zuruecksetzen(); return; }
          zustand[schalter] = !zustand[schalter];
          zeichneAlles();
        });
      }
      ziel.appendChild(el);
    });
  }

  /* ------------------------------------------------------------ Balken --- */

  function balkenListe(ziel, eintraege, aktuell, beiKlick) {
    ziel.textContent = '';
    if (!eintraege.length) {
      ziel.appendChild(knoten('li', 'c2-leer', 'Keine Einträge unter diesem Filter.'));
      return;
    }
    var groesster = eintraege.reduce(function (m, e) { return Math.max(m, e.wert); }, 0) || 1;
    eintraege.forEach(function (e) {
      var zeile = document.createElement('li');
      if (aktuell !== undefined && e.name === aktuell) zeile.setAttribute('aria-current', 'true');
      if (beiKlick) {
        var knopf = knoten('button', null, e.name);
        knopf.type = 'button';
        knopf.title = e.titel || ('Auf «' + e.name + '» filtern');
        knopf.addEventListener('click', function () { beiKlick(e); });
        zeile.appendChild(knopf);
      } else {
        zeile.appendChild(knoten('span', 'c2-balken-name', e.name));
      }
      var spur = knoten('span', 'c2-spur');
      var fuellung = knoten('span', 'c2-fuellung');
      fuellung.style.width = Math.max(1, Math.round(e.wert * 100 / groesster)) + '%';
      if (e.schwach) fuellung.classList.add('c2-fuellung--schwach');
      spur.appendChild(fuellung);
      zeile.appendChild(spur);
      zeile.appendChild(knoten('span', 'c2-wert', zahlText(e.wert)));
      ziel.appendChild(zeile);
    });
  }

  function zeichneKategorien(daten) {
    var zaehler = {};
    daten.organisationen.forEach(function (o) {
      zaehler[o.kategorie || ''] = (zaehler[o.kategorie || ''] || 0) + 1;
    });
    // Der Balken traegt das deutsche Label, der Zustand die category_id — so
    // bleibt der Filter stabil, auch wenn ein Label spaeter anders lautet.
    var eintraege = Object.keys(zaehler).sort(function (a, b) { return zaehler[b] - zaehler[a]; })
      .map(function (kennung) {
        var kat = kategorieVon(kennung);
        return {
          name: kat ? kat.label : (kennung || 'ohne Angabe'),
          kennung: kennung,
          wert: zaehler[kennung], schwach: zaehler[kennung] < 5
        };
      });
    var gewaehlt = eintraege.filter(function (e) { return e.kennung === zustand.kategorie; })[0];
    id('c2KategorieZahl').textContent = eintraege.length + ' Kategorien';
    balkenListe(id('c2KategorieBalken'), eintraege, gewaehlt ? gewaehlt.name : '', function (e) {
      zustand.kategorie = (zustand.kategorie === e.kennung) ? '' : e.kennung;
      zeichneAlles();
    });

    var ohne = zaehler[''] || 0;
    var gesamt = daten.organisationen.length;
    id('c2KategorieFuss').textContent = gesamt
      ? 'Fachliche Einordnung nach Sachgebiet, für ' + zahlText(gesamt - ohne) + ' der ' +
        zahlText(gesamt) + ' Organisationen. Jede trägt genau eine. Unabhängig vom Cluster: ' +
        'Die Kategorie sagt, worum es geht, der Cluster, mit wem eine Organisation im ' +
        'erfassten Netz eng verbunden ist.'
      : '';
  }

  /** Kategorieeintrag zu einer category_id, oder null. */
  function kategorieVon(kennung) {
    if (!kennung) return null;
    var liste = (modell && modell.kategorien) || [];
    for (var i = 0; i < liste.length; i++) {
      if (liste[i].id === kennung) return liste[i];
    }
    return null;
  }

  function zeichneKlassen(daten) {
    var text = modell.meta.klassenText || {};
    var eintraege = KLASSEN.map(function (k) {
      return {
        name: (text[k] || k).replace(/^N\d\s*—\s*/, k + ' — '),
        klasse: k,
        wert: daten.kanten.filter(function (e) { return e.klasse === k; }).length,
        schwach: k === 'N4'
      };
    });
    id('c2KlassenZahl').textContent = zahlText(daten.kanten.length) + ' Beziehungen';
    balkenListe(id('c2KlassenBalken'), eintraege, null, function (e) {
      // Ein Klick stellt auf genau diese Klasse; ein zweiter nimmt alle zurück.
      var nurDiese = KLASSEN.every(function (k) {
        return zustand.klassen[k] === (k === e.klasse);
      });
      KLASSEN.forEach(function (k) { zustand.klassen[k] = nurDiese || k === e.klasse; });
      if (!nurDiese) zustand.kernnetz = false;
      zeichneAlles();
    });
  }

  function zeichneParteien(daten) {
    var jePartei = {};
    daten.kanten.forEach(function (k) {
      if (!k.partei) return;
      (jePartei[k.partei] = jePartei[k.partei] || {})[k.person.index] = true;
    });
    var eintraege = Object.keys(jePartei).map(function (p) {
      return { name: p, wert: Object.keys(jePartei[p]).length };
    }).sort(function (a, b) { return b.wert - a.wert; }).slice(0, 8);

    var mitAngabe = 0;
    eintraege.forEach(function () { /* nur Anzeige */ });
    var personenMitPartei = {};
    daten.kanten.forEach(function (k) {
      if (k.partei) personenMitPartei[k.person.index] = true;
    });
    mitAngabe = Object.keys(personenMitPartei).length;

    id('c2ParteiZahl').textContent = zahlText(mitAngabe) + ' von ' +
      zahlText(daten.personen.length) + ' mit Angabe';
    balkenListe(id('c2ParteiBalken'), eintraege, zustand.partei, function (e) {
      zustand.partei = (zustand.partei === e.name) ? '' : e.name;
      zeichneAlles();
    });
  }

  /* ---------------------------------------------------------- Treemap ---- */

  /**
   * Squarified Treemap: legt die Rechtecke so, dass sie möglichst quadratisch
   * werden — lange Streifen liessen sich schlecht vergleichen.
   * Nach Bruls, Huizing, van Wijk (2000), auf das Nötige gekürzt.
   */
  function treemap(werte, breite, hoehe) {
    var summe = werte.reduce(function (a, b) { return a + b.wert; }, 0);
    if (!summe) return [];
    var flaeche = breite * hoehe;
    var rest = werte.map(function (w) {
      return { daten: w, flaeche: w.wert * flaeche / summe };
    });
    var kacheln = [];
    var raum = { x: 0, y: 0, breite: breite, hoehe: hoehe };

    function seiteVon(r) { return Math.min(r.breite, r.hoehe); }

    function schlechtestes(reihe, laenge) {
      if (!reihe.length || !laenge) return Infinity;
      var s = reihe.reduce(function (a, b) { return a + b.flaeche; }, 0);
      var max = reihe[0].flaeche, min = reihe[reihe.length - 1].flaeche;
      return Math.max((laenge * laenge * max) / (s * s), (s * s) / (laenge * laenge * min));
    }

    function legeReihe(reihe) {
      var s = reihe.reduce(function (a, b) { return a + b.flaeche; }, 0);
      var waagrecht = raum.breite >= raum.hoehe;
      var dicke = s / seiteVon(raum);
      var pos = 0;
      reihe.forEach(function (e) {
        var laenge = e.flaeche / dicke;
        kacheln.push(waagrecht
          ? { daten: e.daten, x: raum.x, y: raum.y + pos, breite: dicke, hoehe: laenge }
          : { daten: e.daten, x: raum.x + pos, y: raum.y, breite: laenge, hoehe: dicke });
        pos += laenge;
      });
      if (waagrecht) { raum.x += dicke; raum.breite -= dicke; }
      else { raum.y += dicke; raum.hoehe -= dicke; }
    }

    var reihe = [];
    while (rest.length) {
      var naechstes = rest[0];
      var mitNeu = reihe.concat([naechstes]);
      if (!reihe.length || schlechtestes(mitNeu, seiteVon(raum))
          <= schlechtestes(reihe, seiteVon(raum))) {
        reihe = mitNeu;
        rest.shift();
      } else {
        legeReihe(reihe);
        reihe = [];
      }
    }
    if (reihe.length) legeReihe(reihe);
    return kacheln;
  }

  function zeichneTreemap(daten) {
    var svg = id('c2Treemap');
    var NS = 'http://www.w3.org/2000/svg';
    svg.textContent = '';

    var groesse = {};
    daten.organisationen.forEach(function (o) {
      var c = (o.cluster === undefined || o.cluster === null) ? 0 : o.cluster;
      groesse[c] = (groesse[c] || 0) + 1;
    });
    var alle = Object.keys(groesse).map(function (c) {
      var eintrag = modell.cluster[c] || modell.cluster[Number(c)];
      return {
        cluster: c,
        name: eintrag ? eintrag.label : ('Cluster ' + c),
        wert: groesse[c]
      };
    }).sort(function (a, b) { return b.wert - a.wert; });

    // Cluster 0 sammelt die Organisationen ohne belegte Projektion. Er ist
    // kein Cluster im Sinn der Fläche und würde als grösstes Feld das Bild
    // beherrschen; er steht in der Fussnote.
    var echte = alle.filter(function (e) { return String(e.cluster) !== '0'; });
    var isolate = alle.filter(function (e) { return String(e.cluster) === '0'; })
      .reduce(function (a, b) { return a + b.wert; }, 0);

    id('c2ClusterZahl').textContent = echte.length + ' Cluster vertreten';
    if (!echte.length) {
      id('c2ClusterFuss').textContent = 'Unter diesem Filter bleibt kein Cluster übrig.';
      return;
    }

    var gezeigt = echte.slice(0, 12);
    var restCluster = echte.slice(12);
    var uebrig = restCluster.reduce(function (a, b) { return a + b.wert; }, 0);

    var BREITE = 640, HOEHE = 330;
    var kacheln = treemap(gezeigt, BREITE, HOEHE);
    var groesster = gezeigt[0].wert || 1;

    kacheln.forEach(function (k) {
      var anteil = k.daten.wert / groesster;
      var farbe = BLAU[Math.min(BLAU.length - 1, Math.round(anteil * (BLAU.length - 1)))];

      var huelle = document.createElementNS(NS, k.daten.cluster === null ? 'g' : 'a');
      if (k.daten.cluster !== null) {
        huelle.setAttribute('href', './?fokus=' + encodeURIComponent(k.daten.cluster));
      }
      huelle.setAttribute('class', 'c2-tm-feld');

      var rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', k.x.toFixed(1));
      rect.setAttribute('y', k.y.toFixed(1));
      rect.setAttribute('width', Math.max(0, k.breite).toFixed(1));
      rect.setAttribute('height', Math.max(0, k.hoehe).toFixed(1));
      rect.setAttribute('fill', farbe);
      huelle.appendChild(rect);

      var titel = document.createElementNS(NS, 'title');
      titel.textContent = k.daten.name + ': ' + k.daten.wert + ' Organisationen' +
        (k.daten.cluster === null ? '' : '. Anklicken öffnet den Cluster.');
      huelle.appendChild(titel);

      // Beschriftung nur, wo sie hineinpasst — abgeschnittene Namen wären
      // schlimmer als gar keine.
      if (k.breite > 62 && k.hoehe > 26) {
        var zeichen = Math.max(3, Math.floor((k.breite - 12) / 5.6));
        var name = k.daten.name.length > zeichen
          ? k.daten.name.slice(0, zeichen - 1).replace(/[\s,;/–-]+$/, '') + '…'
          : k.daten.name;
        var t1 = document.createElementNS(NS, 'text');
        t1.setAttribute('class', 'c2-tm-name');
        t1.setAttribute('x', (k.x + 6).toFixed(1));
        t1.setAttribute('y', (k.y + 16).toFixed(1));
        t1.setAttribute('fill', TREEMAP_INK);
        t1.textContent = name;
        huelle.appendChild(t1);

        if (k.hoehe > 40) {
          var t2 = document.createElementNS(NS, 'text');
          t2.setAttribute('class', 'c2-tm-zahl');
          t2.setAttribute('x', (k.x + 6).toFixed(1));
          t2.setAttribute('y', (k.y + 30).toFixed(1));
          t2.setAttribute('fill', TREEMAP_INK_LEISE);
          t2.textContent = k.daten.wert + ' Organisationen';
          huelle.appendChild(t2);
        }
      }
      svg.appendChild(huelle);
    });

    var teile = ['Die Fläche zeigt die Zahl der Organisationen.'];
    if (uebrig) {
      teile.push('Nicht abgebildet: ' + zahlText(uebrig) + ' Organisationen in ' +
        restCluster.length + ' weiteren Clustern.');
    }
    if (isolate) {
      teile.push(zahlText(isolate) + ' Organisationen haben keine belegte Projektion und ' +
        'gehören keinem Cluster an — eine Abdeckungslücke der Erhebung, kein Nachweis ' +
        'fehlender Vernetzung.');
    }
    teile.push('Cluster sind rechnerische Gruppen, keine Akteure; die Bezeichnungen sind ' +
      'deskriptive Kurzlabels nach den enthaltenen Organisationen, keine Bewertung.');
    id('c2ClusterFuss').textContent = teile.join(' ');

    // Die volle Liste steht bereit, wird aber erst auf Klick gezeigt.
    var liste = id('c2ClusterListe');
    balkenListe(liste, alle.map(function (e) {
      return { name: e.name, wert: e.wert, titel: e.name + ' im Netzwerk öffnen' };
    }), null, function (e) {
      var treffer = alle.filter(function (a) { return a.name === e.name; })[0];
      if (treffer) window.location.href = './?fokus=' + encodeURIComponent(treffer.cluster);
    });
  }

  /* -------------------------------------------------------- Ranglisten --- */

  function zeichneRanglisten(daten) {
    // Personen: Zahl der Organisationen innerhalb des Filters.
    var jePerson = {};
    daten.kanten.forEach(function (k) {
      var e = jePerson[k.person.index] ||
        (jePerson[k.person.index] = { person: k.person, orgs: {}, parteien: {} });
      e.orgs[k.organisation.index] = true;
      if (k.partei) e.parteien[k.partei] = true;
    });
    var personen = Object.keys(jePerson).map(function (i) { return jePerson[i]; })
      .sort(function (a, b) {
        var d = Object.keys(b.orgs).length - Object.keys(a.orgs).length;
        return d || a.person.name.localeCompare(b.person.name, 'de');
      }).slice(0, 7);

    var zielP = id('c2Personen');
    zielP.textContent = '';
    id('c2PersonenZahl').textContent = zahlText(daten.bruecken.length) + ' bei mehreren';
    if (!personen.length) {
      zielP.appendChild(knoten('li', 'c2-leer', 'Keine Personen unter diesem Filter.'));
    }
    personen.forEach(function (e) {
      var zeile = document.createElement('li');
      var link = document.createElement('a');
      link.href = './?person=' + e.person.index;
      link.textContent = e.person.name;
      zeile.appendChild(link);
      var parteien = e.person.parteien.slice();
      Object.keys(e.parteien).forEach(function (p) {
        if (parteien.indexOf(p) === -1) parteien.push(p);
      });
      if (parteien.length) {
        var marke = knoten('span', 'c2-rang-zusatz', parteien.join(', '));
        marke.title = 'Parteiangabe der Person: ' + parteien.join(', ');
        link.appendChild(marke);
      }
      zeile.appendChild(knoten('span', 'c2-wert', String(Object.keys(e.orgs).length)));
      zielP.appendChild(zeile);
    });

    // Organisationen: Zahl der erfassten Personen innerhalb des Filters.
    var jeOrg = {};
    daten.kanten.forEach(function (k) {
      var e = jeOrg[k.organisation.index] ||
        (jeOrg[k.organisation.index] = { organisation: k.organisation, personen: {} });
      e.personen[k.person.index] = true;
    });
    var orgs = Object.keys(jeOrg).map(function (i) { return jeOrg[i]; })
      .sort(function (a, b) {
        var d = Object.keys(b.personen).length - Object.keys(a.personen).length;
        return d || a.organisation.name.localeCompare(b.organisation.name, 'de');
      }).slice(0, 7);

    var zielO = id('c2Organisationen');
    zielO.textContent = '';
    id('c2OrgZahl').textContent = zahlText(Object.keys(jeOrg).length) + ' mit Personen';
    if (!orgs.length) {
      zielO.appendChild(knoten('li', 'c2-leer', 'Keine Organisationen unter diesem Filter.'));
    }
    orgs.forEach(function (e) {
      var zeile = document.createElement('li');
      var link = document.createElement('a');
      link.href = './?ebene=organisation&knoten=' + e.organisation.id;
      link.textContent = e.organisation.name;
      zeile.appendChild(link);
      zeile.appendChild(knoten('span', 'c2-wert', String(Object.keys(e.personen).length)));
      zielO.appendChild(zeile);
    });
  }

  /* -------------------------------------------------------------- Chips -- */

  function zeichneChips() {
    var ziel = id('c2Chips');
    ziel.textContent = '';
    var chips = [];

    if (zustand.kategorie) {
      var kat = kategorieVon(zustand.kategorie);
      chips.push(['Kategorie', kat ? kat.label : zustand.kategorie,
        function () { zustand.kategorie = ''; }]);
    }
    if (zustand.partei) chips.push(['Partei', zustand.partei,
      function () { zustand.partei = ''; }]);
    if (zustand.kanton) chips.push(['Sitz', zustand.kanton,
      function () { zustand.kanton = ''; }]);
    if (zustand.clusterMin) chips.push(['Clustergrösse', 'ab ' + zustand.clusterMin,
      function () { zustand.clusterMin = 0; }]);
    if (zustand.kernnetz) chips.push(['Ansicht', 'nur Kernnetz',
      function () { zustand.kernnetz = false; }]);
    if (zustand.bruecken) chips.push(['Personen', 'nur Brückenpersonen',
      function () { zustand.bruecken = false; }]);
    if (zustand.mitPersonen) chips.push(['Organisationen', 'nur mit erfassten Personen',
      function () { zustand.mitPersonen = false; }]);
    var aus = KLASSEN.filter(function (k) { return !zustand.klassen[k]; });
    if (aus.length) chips.push(['Beziehungsart',
      KLASSEN.filter(function (k) { return zustand.klassen[k]; }).join(', ') || 'keine',
      function () { KLASSEN.forEach(function (k) { zustand.klassen[k] = true; }); }]);

    if (!chips.length) {
      ziel.appendChild(knoten('span', 'c2-chips-leer',
        'Kein Filter gesetzt — gezeigt wird der ganze Bestand.'));
      return;
    }
    chips.forEach(function (c) {
      var knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.className = 'c2-chip';
      knopf.title = c[0] + ' ' + c[1] + ' entfernen';
      knopf.appendChild(knoten('b', null, c[0] + ': '));
      knopf.appendChild(document.createTextNode(c[1]));
      knopf.appendChild(knoten('span', 'c2-chip-weg', '×'));
      knopf.addEventListener('click', function () { c[2](); zeichneAlles(); });
      ziel.appendChild(knopf);
    });
    var reset = knoten('button', 'c2-zuruecksetzen', 'alle zurücksetzen');
    reset.type = 'button';
    reset.addEventListener('click', zuruecksetzen);
    ziel.appendChild(reset);
  }

  function zuruecksetzen() {
    zustand.kategorie = '';
    zustand.partei = '';
    zustand.kanton = '';
    zustand.clusterMin = 0;
    zustand.kernnetz = false;
    zustand.bruecken = false;
    zustand.mitPersonen = false;
    KLASSEN.forEach(function (k) { zustand.klassen[k] = true; });
    zeichneAlles();
  }

  /* ------------------------------------------------------------- Suche --- */

  function zeichneTreffer(begriff) {
    var kasten = id('c2Treffer');
    kasten.textContent = '';
    var q = (begriff || '').trim().toLowerCase();
    if (q.length < 2) { kasten.hidden = true; return; }

    var treffer = [];
    modell.organisationen.forEach(function (o) {
      if (treffer.length >= 40) return;
      if ((o.name + ' ' + o.kurz + ' ' + o.id).toLowerCase().indexOf(q) === -1) return;
      treffer.push({ art: 'Organisation', name: o.name,
                     ziel: './?ebene=organisation&knoten=' + o.id });
    });
    modell.personen.forEach(function (p) {
      if (treffer.length >= 60) return;
      if (p.name.toLowerCase().indexOf(q) === -1) return;
      treffer.push({ art: 'Person', name: p.name, ziel: './?person=' + p.index });
    });

    if (!treffer.length) {
      kasten.appendChild(knoten('p', 'c2-treffer-leer', 'Kein Treffer.'));
      kasten.hidden = false;
      return;
    }
    treffer.slice(0, 12).forEach(function (t) {
      var knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.appendChild(document.createTextNode(t.name));
      knopf.appendChild(knoten('span', 'c2-treffer-art', t.art));
      knopf.addEventListener('click', function () { window.location.href = t.ziel; });
      kasten.appendChild(knopf);
    });
    if (treffer.length > 12) {
      kasten.appendChild(knoten('p', 'c2-treffer-leer',
        '12 von ' + treffer.length + ' Treffern. Suchbegriff enger fassen.'));
    }
    kasten.hidden = false;
  }

  /* --------------------------------------------------------- Erklärung --- */

  var HINWEISE = {
    kategorie: 'Die Kategorie ordnet eine Organisation fachlich nach Sachgebiet ein. ' +
      'Datenbestand und ist keine Bewertung.',
    cluster: 'Ein Cluster ist eine Gruppe von Organisationen, die im Netz besonders dicht ' +
      'untereinander verbunden sind. Cluster sind rechnerische Gruppen, keine Akteure; ' +
      'die Bezeichnungen sind deskriptive Kurzlabels.',
    partei: 'Parteiangaben gehören zu einzelnen Personen. Aus ihnen lässt sich keine ' +
      'Parteizugehörigkeit der Organisation ableiten.'
  };

  function verdrahteHinweise() {
    Array.prototype.slice.call(document.querySelectorAll('[data-c2-hinweis]'))
      .forEach(function (knopf) {
        knopf.addEventListener('click', function () {
          var karte = knopf.closest('.c2-karte');
          var vorhanden = karte.querySelector('.ck-hinweis');
          if (vorhanden) { vorhanden.remove(); return; }
          var kasten = knoten('p', 'ck-hinweis', HINWEISE[knopf.getAttribute('data-c2-hinweis')]);
          knopf.closest('.c2-karte-kopf').insertAdjacentElement('afterend', kasten);
        });
      });
  }

  /* ----------------------------------------------------------- Zeichnen -- */

  function zeichneAlles() {
    var kanten = gefilterteKanten();
    var organisationen = gefilterteOrganisationen();
    var personen = personenAus(kanten);

    // Brückenpersonen im Filter: mindestens zwei verschiedene Organisationen
    // in den gezeigten Beziehungen.
    var orgsJePerson = {};
    kanten.forEach(function (k) {
      (orgsJePerson[k.person.index] = orgsJePerson[k.person.index] || {})[k.organisation.index] = true;
    });
    var bruecken = Object.keys(orgsJePerson).filter(function (i) {
      return Object.keys(orgsJePerson[i]).length > 1;
    });
    var summe = bruecken.reduce(function (a, i) {
      return a + Object.keys(orgsJePerson[i]).length;
    }, 0);

    var daten = {
      organisationen: organisationen,
      kanten: kanten,
      personen: personen,
      bruecken: bruecken,
      kern: zahlText(kanten.filter(function (k) { return KERN.indexOf(k.klasse) !== -1; }).length),
      luecken: zahlText(organisationen.filter(function (o) { return o.abdeckungsluecke; }).length),
      schnitt: bruecken.length
        ? 'Ø ' + (summe / bruecken.length).toFixed(1).replace('.', ',')
        : '–'
    };

    zeichneKennzahlen(daten);
    zeichneKategorien(daten);
    zeichneKlassen(daten);
    zeichneParteien(daten);
    zeichneTreemap(daten);
    zeichneRanglisten(daten);
    zeichneChips();
    synchronisiereBedienung();

    id('c2Lage').textContent = filterAktiv()
      ? 'Gefilterter Ausschnitt: ' + zahlText(organisationen.length) + ' von ' +
        zahlText(modell.organisationen.length) + ' Organisationen, ' +
        zahlText(kanten.length) + ' von ' + zahlText(modell.kanten.length) + ' Beziehungen.'
      : 'Ganzer Bestand. Kennzahl oder Balken anklicken filtert die Seite.';
  }

  function synchronisiereBedienung() {
    id('c2Kategorie').value = zustand.kategorie;
    id('c2Partei').value = zustand.partei;
    id('c2Kanton').value = zustand.kanton;
    id('c2ClusterMin').value = String(zustand.clusterMin);
    id('c2Kernnetz').checked = zustand.kernnetz;
    id('c2Bruecken').checked = zustand.bruecken;
    Array.prototype.slice.call(document.querySelectorAll('#c2Klassen button'))
      .forEach(function (b) {
        var k = b.getAttribute('data-klasse');
        var an = zustand.klassen[k] && (!zustand.kernnetz || KERN.indexOf(k) !== -1);
        b.setAttribute('aria-pressed', an ? 'true' : 'false');
        b.disabled = zustand.kernnetz && k === 'N4';
      });
  }

  /* ------------------------------------------------------------- Start --- */

  function fuelleAuswahl() {
    var kf = id('c2Kategorie');
    var gruppen = {};
    modell.organisationen.forEach(function (o) {
      gruppen[o.kategorie || ''] = (gruppen[o.kategorie || ''] || 0) + 1;
    });
    // Reihenfolge wie geliefert, nicht nach Groesse — so springt der Eintrag
    // beim naechsten Datenstand nicht an eine andere Stelle.
    modell.kategorien.forEach(function (k) {
      var o = document.createElement('option');
      o.value = k.id;
      o.textContent = k.label + ' (' + (gruppen[k.id] || 0) + ')';
      kf.appendChild(o);
    });

    var pa = id('c2Partei');
    var parteien = {};
    modell.kanten.forEach(function (k) {
      if (k.partei) parteien[k.partei] = (parteien[k.partei] || 0) + 1;
    });
    Object.keys(parteien).sort(function (a, b) { return parteien[b] - parteien[a]; })
      .forEach(function (name) {
        var o = document.createElement('option');
        o.value = name;
        o.textContent = name;
        pa.appendChild(o);
      });

    var ka = id('c2Kanton');
    var kantone = {};
    modell.organisationen.forEach(function (o) {
      if (o.kanton) kantone[o.kanton] = (kantone[o.kanton] || 0) + 1;
    });
    var mitKanton = Object.keys(kantone).reduce(function (a, k) { return a + kantone[k]; }, 0);
    Object.keys(kantone).sort(function (a, b) { return kantone[b] - kantone[a]; })
      .forEach(function (name) {
        var o = document.createElement('option');
        o.value = name;
        o.textContent = name + ' (' + kantone[name] + ')';
        ka.appendChild(o);
      });
    // Ehrlich beschriften: Der Sitz ist nur bei einer Minderheit erfasst.
    ka.options[0].textContent = 'alle — Sitz bei ' + zahlText(mitKanton) + ' von ' +
      zahlText(modell.organisationen.length) + ' erfasst';
  }

  function verdrahte() {
    id('c2Kategorie').addEventListener('change', function () {
      zustand.kategorie = this.value; zeichneAlles();
    });
    id('c2Partei').addEventListener('change', function () {
      zustand.partei = this.value; zeichneAlles();
    });
    id('c2Kanton').addEventListener('change', function () {
      zustand.kanton = this.value; zeichneAlles();
    });
    id('c2ClusterMin').addEventListener('change', function () {
      zustand.clusterMin = parseInt(this.value, 10) || 0; zeichneAlles();
    });
    id('c2Kernnetz').addEventListener('change', function () {
      zustand.kernnetz = this.checked; zeichneAlles();
    });
    id('c2Bruecken').addEventListener('change', function () {
      zustand.bruecken = this.checked; zeichneAlles();
    });
    Array.prototype.slice.call(document.querySelectorAll('#c2Klassen button'))
      .forEach(function (b) {
        b.addEventListener('click', function () {
          var k = b.getAttribute('data-klasse');
          zustand.klassen[k] = !zustand.klassen[k];
          // Ohne jede Klasse bliebe die Seite leer; die letzte bleibt an.
          if (!KLASSEN.some(function (x) { return zustand.klassen[x]; })) {
            zustand.klassen[k] = true;
          }
          zeichneAlles();
        });
      });

    var filterKnopf = id('c2FilterKnopf');
    filterKnopf.addEventListener('click', function () {
      var offen = id('c2Filter').hidden;
      id('c2Filter').hidden = !offen;
      filterKnopf.setAttribute('aria-expanded', offen ? 'true' : 'false');
    });

    var alleCluster = id('c2AlleCluster');
    alleCluster.addEventListener('click', function () {
      var liste = id('c2ClusterListe');
      var offen = liste.hidden;
      liste.hidden = !offen;
      alleCluster.setAttribute('aria-expanded', offen ? 'true' : 'false');
      alleCluster.textContent = offen ? 'Clusterliste ausblenden' : 'Alle Cluster anzeigen';
    });

    var suche = id('c2Suche');
    suche.addEventListener('input', function () { zeichneTreffer(this.value); });
    suche.addEventListener('blur', function () {
      window.setTimeout(function () { id('c2Treffer').hidden = true; }, 160);
    });
    suche.addEventListener('focus', function () { zeichneTreffer(this.value); });
  }

  function start(daten) {
    modell = N.baueModell(daten);
    var version = (modell.meta.masterVersion || '').split('–')[0].trim();
    var stand = (modell.meta.datenstand || '')
      .replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3.$2.$1');
    id('c2Version').textContent = (stand ? 'Datenstand ' + stand : '') +
      (version ? (stand ? ', ' : '') + 'Version ' + version : '');

    fuelleAuswahl();
    verdrahte();
    verdrahteHinweise();
    zeichneAlles();
  }

  if (!N) {
    zeigeFehler('Die Datenschicht ngo-netz-daten.js fehlt.');
    return;
  }

  fetch(PFAD)
    .then(function (antwort) {
      if (!antwort.ok) throw new Error('HTTP ' + antwort.status);
      return antwort.json();
    })
    .then(start)
    .catch(function (fehler) {
      zeigeFehler('Die Daten konnten nicht geladen werden (' + fehler.message + ').');
    });
})();
