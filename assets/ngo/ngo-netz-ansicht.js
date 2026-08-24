/*!
 * ngo-netz-ansicht.js — Darstellung des NGO-Netzwerks
 * souveraene-schweiz.ch
 *
 * Gezeichnet werden Organisationen. Erfasste Personen erscheinen erst beim
 * Öffnen einer Organisation — die 2628 Beziehungen werden nie gleichzeitig als
 * Gesamtgraph dargestellt.
 *
 * Farbe: nach Obergruppe drei geprüfte Farbtöne; nach Cluster eine Ziffer im
 * Knoten plus Hervorhebung des gewählten Clusters. Neun gleichzeitige Farbtöne
 * wären für Farbsehschwächen und auch für normales Farbsehen nicht sicher
 * unterscheidbar, deshalb trägt im Clustermodus die Ziffer die Identität.
 *
 * Knotengrösse: strukturelle Brückenfunktion (Netzwerkzentralität), niemals als
 * Einflussmass zu lesen.
 *
 * Layout: d3-force, lokal gebündelt. Zoom, Verschieben und Auswahl wie in der
 * bestehenden Vorschau.
 */
(function (global) {
  'use strict';

  var N = global.NgoNetzDaten;
  var NS = 'http://www.w3.org/2000/svg';

  var ZOOM_MIN = 0.15;
  var ZOOM_MAX = 6;
  var PERSON_SEITE = 11;
  var MOBIL_BREITE = 720;

  // Beschriftung: bis zu dieser Knotenzahl tragen alle Knoten ihren Namen.
  // Darüber bleiben nur die Knoten mit der grössten Brückenfunktion beschriftet,
  // bis hineingezoomt wird. Ausgewählte, benachbarte und gesuchte Knoten sind
  // immer beschriftet.
  var ALLE_NAMEN_BIS = 40;
  var NAMEN_AB_ZOOM = 1.25;
  var NAMEN_IN_UEBERSICHT = 18;
  var GRUNDSCHRIFT = 10.5;   // Schriftgroesse der Namen auf dem Bildschirm

  // Geprüfte Farbtöne (Validator: alle Paare, heller Untergrund).
  // Zuordnung fest an der Obergruppe, nicht an der Reihenfolge im Filter.
  var OBERGRUPPEN_FARBE = {
    'Gemeinnützige und zivilgesellschaftliche NGOs': '#2a78d6',
    'Wirtschafts- und Berufsverbände': '#eb6834',
    'Politische und gesellschaftliche Interessenorganisationen': '#1baf7a'
  };
  // Muss mit --nn-neutral in ngo-netz.css uebereinstimmen: die Knotenfuellung
  // wird hier gesetzt, die Legende nimmt den CSS-Wert.
  // Ab wann ein Netzbild nicht mehr lesbar ist. Massgebend ist die Dichte,
  // nicht die Menge: 244 Knoten mit 306 Linien ergeben ein Bild, 64 Knoten mit
  // 641 Linien ein Knaeuel. Die Messung des Stands 3.7.51 trennt sauber — die
  // dichteste Clusteransicht liegt bei 2,99 Linien je Knoten, die Clusterebene
  // bei 10,0 und das Gesamtnetz bei 6,7.
  var MAX_KNOTEN = 300;
  var MAX_KANTEN = 900;
  var MAX_DICHTE = 4;
  // Unterhalb dieser Knotenzahl bleibt es bei einem Bild, auch wenn es dicht
  // ist: Bei einem Dutzend Knoten laesst sich auch mit vielen Linien noch
  // ablesen, wer mit wem verbunden ist. Genau so sehen Nachbarschaften in
  // diesem Bestand aus — die Nachbarn einer Organisation sind meist auch
  // untereinander verbunden.
  var IMMER_BILD = 40;
  // Zeichen, ab denen ein Name im Bild gekuerzt wird.
  var NAME_MAX = 30;

  var NEUTRAL = '#72818f';
  // Fuellfarben der Auswahl und ihrer Nachbarschaft.
  var AUSWAHL = '#c8102e';
  var NACHBAR = '#3c5f86';
  var AKZENT = '#2a78d6';

  function el(name, attrs) {
    var k = document.createElementNS(NS, name);
    if (attrs) Object.keys(attrs).forEach(function (a) { k.setAttribute(a, attrs[a]); });
    return k;
  }

  function hashZahl(text) {
    var h = 0;
    for (var i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
    return h;
  }

  function Ansicht(optionen) {
    this.modell = optionen.modell;
    this.svg = optionen.svg;
    this.status = optionen.status;
    this.beiAuswahl = optionen.beiAuswahl || function () {};
    this.beiZustand = optionen.beiZustand || function () {};
    this.beiEbene = optionen.beiEbene || function () {};
    // Meldet nach jedem Zeichnen, was gerade im Bild steht — die Seite haengt
    // daran ihre sichtbaren Hinweise.
    this.beiNetz = optionen.beiNetz || function () {};
    // Wird gerufen, wenn eine Organisation nicht nur gewaehlt, sondern
    // geoeffnet werden soll — etwa aus dem Personenfokus heraus.
    this.beiOrganisation = optionen.beiOrganisation || function () {};
    // Wird gerufen, wenn eine Person geoeffnet werden soll — etwa aus der
    // Liste der Personenperspektive.
    this.beiPerson = optionen.beiPerson || function () {};
    this.liste = optionen.liste || null;
    this.zoomknoepfe = optionen.zoomknoepfe || null;
    this.filter = N.standardFilter();
    this.suchbegriff = '';
    this.auswahl = null;
    this.aufgeklappt = {};
    this.fokus = null;              // Organisation, auf deren Nachbarschaft begrenzt wird
    this.transform = { x: 0, y: 0, s: 1 };
    this.knotenElemente = {};
    this.kantenElemente = {};

    this.viewport = el('g', { class: 'ngo-viewport' });
    this.kantenEbene = el('g', { class: 'ngo-kanten' });
    this.knotenEbene = el('g', { class: 'ngo-knoten' });
    this.viewport.appendChild(this.kantenEbene);
    this.viewport.appendChild(this.knotenEbene);
    this.svg.appendChild(this.viewport);

    this.bindeNavigation();
  }

  Ansicht.prototype.istMobil = function () {
    // Massgebend ist die Fensterbreite, nicht die Breite der Zeichenflaeche:
    // am Desktop ist das SVG wegen der Detailspalte nur rund 650 px breit und
    // waere sonst faelschlich als schmale Anzeige behandelt worden.
    if (typeof window !== 'undefined' && window.innerWidth) {
      return window.innerWidth <= MOBIL_BREITE;
    }
    var rechteck = this.svg.getBoundingClientRect();
    return Math.max(rechteck.width, 0) <= MOBIL_BREITE;
  };

  /* ------------------------------------------------------------ Aufbau ---- */

  /**
   * Auf schmalen Anzeigen wird nie der Gesamtgraph erzwungen: dargestellt wird
   * die Nachbarschaft einer Organisation. Ohne Auswahl ist das die Organisation
   * mit der grössten Brückenfunktion, damit ein sinnvoller Einstieg entsteht.
   */
  Ansicht.prototype.begrenzeAufNachbarschaft = function (netz) {
    var mitte = this.fokus;
    if (!mitte) {
      var sortiert = netz.knoten.slice().sort(function (a, b) {
        return b.zentralitaet - a.zentralitaet;
      });
      mitte = sortiert.length ? sortiert[0].id : null;
    }
    if (!mitte) return netz;

    var behalten = {};
    behalten[mitte] = true;
    netz.kanten.forEach(function (k) {
      if (k.quelle === mitte) behalten[k.ziel] = true;
      if (k.ziel === mitte) behalten[k.quelle] = true;
    });
    return {
      knoten: netz.knoten.filter(function (k) { return behalten[k.id]; }),
      kanten: netz.kanten.filter(function (k) { return behalten[k.quelle] && behalten[k.ziel]; }),
      nachbarschaftVon: mitte,
      begrenzt: true
    };
  };

  /**
   * Ist eine Organisation gewaehlt, bleiben nur sie und die mit ihr
   * verbundenen Organisationen im Bild. In einem Netz mit dreihundert Knoten
   * ist eine Hervorhebung allein zu wenig — was nicht dazugehoert, muss weg.
   *
   * Nicht angewendet auf die Clusterebene (dort ist ein Klick Navigation) und
   * nicht auf Netze, die ohnehin schon um eine Mitte gebaut sind.
   */
  Ansicht.prototype.begrenzeAufAuswahl = function (netz) {
    var mitte = this.auswahl;
    if (!mitte || netz.ebene === 'cluster' || netz.ebene === 'personfokus') return netz;
    if (!netz.knoten.some(function (k) { return k.id === mitte; })) return netz;

    var behalten = {};
    behalten[mitte] = true;
    netz.kanten.forEach(function (k) {
      if (k.quelle === mitte) behalten[k.ziel] = true;
      if (k.ziel === mitte) behalten[k.quelle] = true;
    });
    // Eine Organisation ohne Verbindung stuende sonst allein auf leerer
    // Flaeche — das saehe nach «unvernetzt» aus und waere eine Fehlaussage.
    if (Object.keys(behalten).length < 2) return netz;

    var begrenzt = {};
    Object.keys(netz).forEach(function (s) { begrenzt[s] = netz[s]; });
    begrenzt.knoten = netz.knoten.filter(function (k) { return behalten[k.id]; });
    begrenzt.kanten = netz.kanten.filter(function (k) {
      return behalten[k.quelle] && behalten[k.ziel];
    });
    begrenzt.aufAuswahl = mitte;
    begrenzt.auswahlAusgeblendet = netz.knoten.length - begrenzt.knoten.length;
    begrenzt.auswahlGesamt = netz.knoten.length;
    return begrenzt;
  };

  Ansicht.prototype.baueGraph = function () {
    var netz = N.baueNetz(this.modell, this.filter);
    var self = this;

    // Die Clusterebene ist mit rund 20 Knoten auch auf schmalen Anzeigen lesbar.
    if (this.istMobil() && !netz.historie && netz.ebene !== 'cluster') {
      netz = this.begrenzeAufNachbarschaft(netz);
    }
    netz = this.begrenzeAufAuswahl(netz);

    var knoten = netz.knoten.slice();
    var kanten = netz.kanten.slice();

    // Aufklappen gehoert zur Organisationsperspektive: dort sind Personen die
    // Ergaenzung. In der Personenperspektive stehen sie ohnehin im Netz.
    if (netz.bipartit) { netz.knoten = knoten; netz.kanten = kanten; return netz; }

    Object.keys(this.aufgeklappt).forEach(function (orgId) {
      if (!self.aufgeklappt[orgId]) return;
      if (!netz.knoten.some(function (k) { return k.id === orgId; })) return;
      N.personenZuOrganisation(self.modell, orgId, self.filter).forEach(function (kante) {
        var id = 'kante:' + kante.id;
        knoten.push({
          id: id, typ: 'person', name: kante.anzeige,
          kante: kante, gehoertZu: orgId, zentralitaet: 0
        });
        kanten.push({
          id: 'v:' + kante.id, quelle: orgId, ziel: id, art: 'rolle', gewicht: kante.gewicht
        });
      });
    });
    netz.knoten = knoten;
    netz.kanten = kanten;
    return netz;
  };

  /**
   * Lange Namen im Bild kuerzen. Der volle Name steht im Titel des Knotens und
   * in der Detailspalte; im Bild draengt er sonst die Nachbarn weg oder laeuft
   * ueber den Rand. Erst seit 3.7.51 relevant: Der Bestand enthaelt Namen wie
   * «Sozialversicherungsanstalt des Kantons St. Gallen».
   */
  function kuerzeName(name) {
    var text = String(name || '');
    if (text.length <= NAME_MAX) return text;
    return text.slice(0, NAME_MAX - 1).replace(/[\s,;/–-]+$/, '') + '…';
  }

  Ansicht.prototype.radius = function (knoten) {
    // Ein Cluster steht fuer viele Organisationen und darf entsprechend
    // groesser sein; die Groesse zaehlt Mitglieder, nichts weiter.
    if (knoten.typ === 'cluster') return 11 + Math.min(16, Math.sqrt(knoten.mitglieder) * 2.6);
    if (knoten.typ === 'stumpf') return 7;
    if (knoten.typ === 'person') {
      // Aufgeklappte Rollenknoten bleiben klein; im Personennetz waechst der
      // Knoten mit der Zahl der Organisationen (eine Zaehlung, kein Mass).
      if (!knoten.organisationen) return PERSON_SEITE / 2;
      return 6 + Math.min(11, Math.sqrt(knoten.organisationen) * 3.4);
    }
    if (knoten.verbunden === false) return 4.5;
    return 7 + Math.min(14, Math.sqrt(knoten.zentralitaet || 0) * 3.2);
  };

  Ansicht.prototype.berechneLayout = function (netz, breite, hoehe) {
    var self = this;
    var mitte = { x: breite / 2, y: hoehe / 2 };
    var knoten = netz.knoten.map(function (k) {
      return {
        id: k.id, typ: k.typ, name: k.name, vollname: k.vollname,
        organisation: k.organisation, kante: k.kante, gehoertZu: k.gehoertZu,
        person: k.person, organisationen: k.organisationen, verbunden: k.verbunden,
        mitglieder: k.mitglieder, clusterDaten: k.clusterDaten,
        interneVerbindungen: k.interneVerbindungen,
        cluster: k.cluster, obergruppe: k.obergruppe, zentralitaet: k.zentralitaet,
        abdeckungsluecke: k.abdeckungsluecke, historisch: k.historisch,
        x: mitte.x + (hashZahl(k.id) % 500) - 250,
        y: mitte.y + (hashZahl(k.id + '#') % 500) - 250
      };
    });
    var nachId = {};
    knoten.forEach(function (k) { nachId[k.id] = k; });
    var kanten = netz.kanten.filter(function (k) {
      return nachId[k.quelle] && nachId[k.ziel];
    }).map(function (k) {
      return {
        id: k.id, source: nachId[k.quelle], target: nachId[k.ziel],
        art: k.art, gewicht: k.gewicht, personen: k.personen || [], daten: k
      };
    });

    // Der Personenfokus ist ein Stern: eine Person, ihre Organisationen, sonst
    // nichts. Ein Kraftlayout verteilt die Speichen ungleich und schiebt die
    // Namen uebereinander. Ein fester Ring ist bei jedem Aufruf gleich, nutzt
    // den Platz und laesst den Beschriftungen Raum nach aussen.
    if (netz.ebene === 'personfokus') {
      var mittelpunkt = knoten.filter(function (k) { return k.typ === 'person'; });
      var aussen = knoten.filter(function (k) { return k.typ !== 'person'; });
      aussen.sort(function (a, b) {
        return String(a.name).localeCompare(String(b.name), 'de');
      });
      mittelpunkt.forEach(function (k) { k.x = mitte.x; k.y = mitte.y; });

      // Zwei Spalten statt eines Kreises: Auf einem Ring liegen die Punkte
      // oben und unten fast auf gleicher Hoehe, ihre Namen decken sich dort.
      // In zwei Spalten hat jeder Name seine eigene Zeile — bei 37
      // Organisationen rund 20 Pixel Abstand, unabhaengig von der Zahl.
      var rx = breite * 0.20;
      var haelfte = Math.ceil(aussen.length / 2);
      var abstand = Math.min(34, (hoehe - 80) / Math.max(1, haelfte));
      aussen.forEach(function (k, i) {
        var links = i < haelfte;
        var stelle = links ? i : i - haelfte;
        var anzahl = links ? haelfte : aussen.length - haelfte;
        k.x = mitte.x + (links ? -rx : rx);
        k.y = mitte.y + (stelle - (anzahl - 1) / 2) * abstand;
        k.textAnker = links ? 'end' : 'start';
      });
      return { knoten: knoten, kanten: kanten, nachId: nachId };
    }

    if (netz.historie) {
      // Ohne Kanten: ruhiges Raster statt Kraftlayout.
      var spalten = Math.max(1, Math.ceil(Math.sqrt(knoten.length * (breite / Math.max(1, hoehe)))));
      knoten.forEach(function (k, i) {
        k.x = mitte.x + ((i % spalten) - (spalten - 1) / 2) * 130;
        k.y = mitte.y + (Math.floor(i / spalten) - Math.floor(knoten.length / spalten) / 2) * 90;
      });
      return { knoten: knoten, kanten: kanten, nachId: nachId };
    }

    // Wenige, grosse Knoten brauchen mehr Abstand und einen staerkeren Zug zur
    // Mitte, damit unverbundene Knoten nicht wegdriften und die Beschriftungen
    // nicht uebereinanderliegen.
    // Drei Stufen statt zweier: Netze mittlerer Groesse — ein grosser Cluster,
    // ein Filter auf eine Parteiangabe — liefen sonst im dichten Modus und
    // ballten sich zu einem Knaeuel, waehrend unverbundene Knoten wegdrifteten.
    var wenige = netz.ebene === 'cluster' || knoten.length <= 45;
    var mittel = !wenige && knoten.length <= 120;
    var abstand = wenige ? 240 : (mittel ? 170 : 120);
    var abstossung = wenige ? -2600 : (mittel ? -1300 : -560);
    var mitteZug = wenige ? 0.14 : (mittel ? 0.085 : 0.045);
    var platz = wenige ? 62 : (mittel ? 38 : 22);

    // Knoten ohne gezeichnete Linie nehmen nicht an der Simulation teil. Im
    // Kraftlayout treibt sie die Abstossung an den Rand, wo sie das Bild
    // aufblaehen und den verbundenen Teil zu einem Knaeuel zusammendruecken.
    // Sie bekommen stattdessen ein eigenes, ruhiges Feld darunter.
    var grad = {};
    kanten.forEach(function (k) {
      grad[k.source.id || k.source] = true;
      grad[k.target.id || k.target] = true;
    });
    var imNetz = knoten.filter(function (k) { return grad[k.id]; });
    var einzelne = knoten.filter(function (k) { return !grad[k.id]; });
    if (!imNetz.length) { imNetz = knoten; einzelne = []; }

    var simulation = global.d3.forceSimulation(imNetz)
      .force('kante', global.d3.forceLink(kanten).id(function (d) { return d.id; })
        .distance(function (d) { return d.art === 'rolle' ? 52 : abstand; })
        .strength(function (d) { return d.art === 'rolle' ? 1 : 0.6; }))
      .force('abstossung', global.d3.forceManyBody().strength(abstossung).distanceMax(1400))
      .force('kollision', global.d3.forceCollide().radius(function (d) {
        return self.radius(d) + platz;
      }).strength(0.95))
      .force('mitteX', global.d3.forceX(mitte.x).strength(mitteZug))
      .force('mitteY', global.d3.forceY(mitte.y).strength(mitteZug))
      .stop();
    var schritte = imNetz.length > 90 ? 420 : 320;
    for (var i = 0; i < schritte; i++) simulation.tick();

    if (einzelne.length) this.legeEinzelneAb(imNetz, einzelne);

    return { knoten: knoten, kanten: kanten, nachId: nachId, einzelne: einzelne.length };
  };

  /**
   * Ordnet die Knoten ohne gezeichnete Linie in einem Raster unter dem Netz an.
   * Sie verschwinden nicht — sie stehen nur an einer erkennbaren Stelle statt
   * verstreut am Rand. «Keine Linie» heisst hier: unter diesem Filter keine,
   * nicht «unvernetzt».
   */
  Ansicht.prototype.legeEinzelneAb = function (imNetz, einzelne) {
    var self = this;
    var links = Infinity, rechts = -Infinity, unten = -Infinity;
    imNetz.forEach(function (k) {
      links = Math.min(links, k.x); rechts = Math.max(rechts, k.x);
      unten = Math.max(unten, k.y);
    });
    if (!isFinite(links)) { links = 0; rechts = 600; unten = 0; }

    var schritt = einzelne.reduce(function (m, k) {
      return Math.max(m, self.radius(k) * 2 + 16);
    }, 26);
    var nutzbar = Math.max(rechts - links, schritt * 6);
    var spalten = Math.max(6, Math.round(nutzbar / schritt));
    var zeilen = Math.ceil(einzelne.length / spalten);
    var breiteRaster = (spalten - 1) * schritt;
    var startX = (links + rechts) / 2 - breiteRaster / 2;
    var startY = unten + schritt * 2.2;

    einzelne.sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name), 'de');
    });
    einzelne.forEach(function (k, i) {
      k.x = startX + (i % spalten) * schritt;
      k.y = startY + Math.floor(i / spalten) * schritt;
    });
    return { spalten: spalten, zeilen: zeilen };
  };

  /* ---------------------------------------------------------- Zeichnen --- */

  /**
   * Ist dieses Netz als Bild noch lesbar? Massgebend ist nicht die Zahl der
   * Knoten allein, sondern die der Linien: 244 Knoten mit 306 Linien sind ein
   * Bild, 64 Knoten mit 641 Linien sind ein Knaeuel.
   */
  Ansicht.prototype.zuDicht = function (netz) {
    if (netz.ebene === 'personfokus' || netz.historie) return false;
    var knoten = netz.knoten.length;
    var kanten = netz.kanten.length;
    if (!knoten) return false;
    if (knoten > MAX_KNOTEN || kanten > MAX_KANTEN) return true;
    if (knoten <= IMMER_BILD) return false;
    return kanten / knoten >= MAX_DICHTE;
  };

  Ansicht.prototype.zeigeLeinwand = function () {
    if (this.liste) this.liste.hidden = true;
    this.svg.hidden = false;
    if (this.zoomknoepfe) this.zoomknoepfe.hidden = false;
  };

  /**
   * Dieselben Knoten als Liste. Sie zeigt, was im Bestand steht, ohne die
   * Verbindungen zu behaupten — dafuer ist die naechste Ebene da.
   */
  Ansicht.prototype.zeigeListe = function (netz) {
    var self = this;
    if (!this.liste) return;
    this.svg.hidden = true;
    if (this.zoomknoepfe) this.zoomknoepfe.hidden = true;
    this.liste.hidden = false;

    var kopf = this.liste.querySelector('.ngo-liste-kopf');
    var ziel = this.liste.querySelector('.ngo-liste-eintraege');
    ziel.textContent = '';

    var istCluster = netz.ebene === 'cluster';
    // In der Personenperspektive stehen Personen und Organisationen im selben
    // Netz. Eine Liste beider Arten waere irrefuehrend: Das Schweizerische
    // Rote Kreuz hat mehr Verbindungen als jede Person und stuende zuoberst,
    // obwohl die Perspektive nach Personen fragt.
    var istPersonen = !!netz.bipartit && !netz.person;

    // Anschlussstummel sind ein Mittel der Zeichnung, kein Bestand. In einer
    // Liste stuenden sie als Cluster zwischen den Organisationen und liessen
    // die Liste falsch aussehen.
    var eintraege = netz.knoten.filter(function (k) {
      if (istPersonen) return k.typ === 'person';
      return k.typ !== 'stumpf';
    });
    var stummel = netz.knoten.length - eintraege.length;

    // Grad im gezeigten Netz: die Zahl, die im Bild die Linien waeren.
    var grad = {};
    netz.kanten.forEach(function (k) {
      grad[k.quelle] = (grad[k.quelle] || 0) + 1;
      grad[k.ziel] = (grad[k.ziel] || 0) + 1;
    });

    kopf.textContent = self.listenKopf(netz, eintraege.length, stummel, istPersonen);

    var sortiert = eintraege.slice().sort(function (a, b) {
      var wa = istCluster ? a.mitglieder
        : (istPersonen ? (a.organisationen || 0) : (grad[a.id] || 0));
      var wb = istCluster ? b.mitglieder
        : (istPersonen ? (b.organisationen || 0) : (grad[b.id] || 0));
      if (wb !== wa) return wb - wa;
      return String(a.name).localeCompare(String(b.name), 'de');
    });

    var teil = document.createDocumentFragment();
    sortiert.forEach(function (knoten, i) {
      var zeile = document.createElement('li');
      var knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.className = 'ngo-liste-knopf';
      knopf.title = self.beschriftung(knoten);

      var nummer = knoten_span('ngo-liste-nummer',
        istCluster ? knoten.cluster + '.' : String(i + 1) + '.');
      knopf.appendChild(nummer);
      knopf.appendChild(knoten_span('ngo-liste-name', knoten.vollname || knoten.name));

      if (istCluster) {
        knopf.appendChild(knoten_span('ngo-liste-wert',
          knoten.mitglieder + ' Organisationen'));
        knopf.appendChild(knoten_span('ngo-liste-wert',
          knoten.interneVerbindungen + ' Verbindungen'));
      } else if (istPersonen) {
        var orgs = knoten.organisationen || 0;
        knopf.appendChild(knoten_span('ngo-liste-wert',
          orgs === 1 ? '1 Organisation' : orgs + ' Organisationen'));
        var parteien = (knoten.person && knoten.person.parteien) || [];
        knopf.appendChild(parteien.length
          ? knoten_span('ngo-liste-wert', parteien.join(', '))
          : knoten_span('ngo-liste-wert', ''));
      } else {
        var zahl = grad[knoten.id] || 0;
        knopf.appendChild(knoten_span('ngo-liste-wert',
          zahl === 1 ? '1 Verbindung' : zahl + ' Verbindungen'));
        knopf.appendChild(knoten.abdeckungsluecke
          ? knoten_span('ngo-liste-marke', 'Abdeckungslücke')
          : knoten_span('ngo-liste-wert', ''));
      }

      knopf.addEventListener('click', function () { self.waehleAusListe(knoten); });
      zeile.appendChild(knopf);
      teil.appendChild(zeile);
    });
    ziel.appendChild(teil);
    this.liste.scrollTop = 0;

    function knoten_span(klasse, text) {
      var e = document.createElement('span');
      e.className = klasse;
      e.textContent = text;
      return e;
    }
  };

  /** Einleitung ueber der Liste, je nach Ebene. */
  Ansicht.prototype.listenKopf = function (netz, anzahl, stummel, istPersonen) {
    if (istPersonen) {
      return anzahl + ' Personen mit Beziehungen zu mehreren Organisationen. Als ' +
        'Netzbild wären es ' + netz.knoten.length + ' Knoten und damit ein Knäuel. ' +
        'Eine Person anklicken zeigt sie mit ihren Organisationen. Die Zahl ist eine ' +
        'Zählung erfasster Beziehungen.';
    }
    if (netz.ebene === 'cluster') {
      return anzahl + ' Cluster. Ein Cluster ist eine Gruppe von Organisationen, die im ' +
        'Netz besonders dicht untereinander verbunden sind — eine rechnerische Gruppe, ' +
        'kein Akteur. Als Netzbild wären es ' + netz.kanten.length + ' Linien zwischen ' +
        anzahl + ' Kreisen und damit ein Knäuel. Anklicken öffnet den Cluster.';
    }
    if (netz.ebene === 'clusterinhalt') {
      return anzahl + ' Organisationen in diesem Cluster, ' + netz.kanten.length +
        ' Verbindungen' + (stummel ? ', dazu ' + stummel + ' Anschlüsse an andere Cluster' : '') +
        '. Für ein Netzbild ist das zu dicht. Anklicken zeigt eine Organisation mit ' +
        'ihren Verbindungen.';
    }
    return anzahl + ' Organisationen mit ' + netz.kanten.length + ' Verbindungen. Als ' +
      'Netzbild wäre das ein Knäuel, in dem jede Linie ein Dutzend andere kreuzt. ' +
      'Anklicken zeigt eine Organisation mit ihren Verbindungen.';
  };

  /** Klick in der Liste: Cluster oeffnen oder Organisation in den Fokus. */
  Ansicht.prototype.waehleAusListe = function (knoten) {
    if (knoten.typ === 'cluster') {
      this.beiEbene({ ebene: 'clusterinhalt', cluster: knoten.cluster });
      return;
    }
    if (knoten.typ === 'person' && knoten.person) {
      this.beiPerson({ person: knoten.person });
      return;
    }
    this.auswahl = knoten.id;
    this.fokus = knoten.id;
    this.zeichne();
    this.beiAuswahl({ typ: 'organisation', id: knoten.id, organisation: knoten.organisation });
    this.beiZustand();
  };

  Ansicht.prototype.farbe = function (knoten) {
    // Die Auswahl faerbt den Knoten selbst, nicht nur seinen Rand — ein Ring
    // allein geht in einem dichten Netz unter.
    if (knoten.id === this.auswahl) return AUSWAHL;
    if (this.nachbarn && this.nachbarn[knoten.id]) return NACHBAR;
    // Zuruecktreten ueber eine helle Fuellung, nicht ueber Transparenz:
    // viele halbdurchsichtige Formen uebereinander ergeben einen Schleier.
    if (knoten.typ === 'organisation' && knoten.verbunden === false) return '#c9d2da';
    if (knoten.typ === 'cluster') {
      return (this.filter.cluster !== '' && String(knoten.cluster) === String(this.filter.cluster))
        ? AKZENT : '#5b7085';
    }
    if (knoten.typ === 'stumpf') return '#c3ccd3';
    if (knoten.typ === 'person') return '#fbf1e2';
    if (this.filter.farbe === 'obergruppe') {
      return OBERGRUPPEN_FARBE[knoten.obergruppe] || NEUTRAL;
    }
    // Clustermodus: Identität trägt die Ziffer, Farbe hebt den gewählten
    // Cluster hervor. Neun gleichzeitige Farbtöne wären nicht sicher lesbar.
    if (this.filter.cluster !== '' && String(knoten.cluster) === String(this.filter.cluster)) {
      return AKZENT;
    }
    return NEUTRAL;
  };

  Ansicht.prototype.zeichne = function () {
    var self = this;
    var rechteck = this.svg.getBoundingClientRect();
    var breite = Math.max(320, rechteck.width);
    var hoehe = Math.max(320, rechteck.height);
    this.svg.setAttribute('viewBox', '0 0 ' + breite + ' ' + hoehe);

    var netz = this.baueGraph();
    if (this.zuDicht(netz)) {
      netz.alsListe = true;
      this.netz = netz;
      this.layout = { knoten: [], kanten: [], nachId: {} };
      this.knotenElemente = {};
      this.kantenElemente = {};
      this.beschriftungen = {};
      this.kantenEbene.textContent = '';
      this.knotenEbene.textContent = '';
      this.zeigeListe(netz);
      this.meldeStand(netz, this.layout);
      this.beiNetz(netz);
      return;
    }
    netz.alsListe = false;
    this.zeigeLeinwand();
    var layout = this.berechneLayout(netz, breite, hoehe);
    this.layout = layout;
    this.netz = netz;

    this.kantenEbene.textContent = '';
    this.knotenEbene.textContent = '';
    this.knotenElemente = {};
    this.kantenElemente = {};
    this.beschriftungen = {};
    this.namensSchwellen = this.berechneNamensSchwellen(netz.knoten);

    layout.kanten.forEach(function (kante) {
      var gruppe = el('g', { class: 'ngo-kante ngo-kante--' + kante.art });
      var linie = el('line', {
        x1: kante.source.x, y1: kante.source.y, x2: kante.target.x, y2: kante.target.y
      });
      linie.dataset.staerke = self.strichbreite(kante);
      gruppe.appendChild(linie);

      var titel = el('title');
      titel.textContent = kante.art === 'rolle'
        ? kante.target.name
        : self.kantenText(kante);
      gruppe.appendChild(titel);

      self.kantenEbene.appendChild(gruppe);
      self.kantenElemente[kante.id] = { gruppe: gruppe, linie: linie, daten: kante };
    });

    layout.knoten.forEach(function (knoten) {
      var klassen = ['ngo-knoten-gruppe', 'ngo-' + knoten.typ];
      if (knoten.typ === 'cluster' || knoten.typ === 'stumpf') klassen.push('ngo-navigierbar');
      if (knoten.typ === 'organisation' && self.aufgeklappt[knoten.id]) klassen.push('ngo-offen');
      if (knoten.abdeckungsluecke) klassen.push('ngo-luecke');
      if (knoten.typ === 'organisation' && knoten.verbunden === false) {
        klassen.push('ngo-ohne-verbindung');
      }
      if (knoten.historisch) klassen.push('ngo-historisch');

      var gruppe = el('g', {
        class: klassen.join(' '), tabindex: '0', role: 'button',
        transform: 'translate(' + knoten.x + ' ' + knoten.y + ')'
      });
      gruppe.setAttribute('aria-label', self.beschriftung(knoten));

      if (knoten.typ === 'cluster') {
        gruppe.appendChild(el('circle', {
          r: self.radius(knoten), class: 'ngo-form', fill: self.farbe(knoten)
        }));
        var clusterZiffer = el('text', { class: 'ngo-clusterziffer ngo-clusterziffer--gross', y: 4.5 });
        clusterZiffer.textContent = String(knoten.cluster);
        gruppe.appendChild(clusterZiffer);
      } else if (knoten.typ === 'stumpf') {
        var seite = self.radius(knoten) * 1.6;
        gruppe.appendChild(el('rect', {
          x: -seite / 2, y: -seite / 2, width: seite, height: seite, rx: 3,
          class: 'ngo-form', fill: self.farbe(knoten),
          transform: 'rotate(45)'
        }));
      } else if (knoten.typ === 'organisation') {
        var r = self.radius(knoten);
        gruppe.appendChild(el('circle', { r: r, class: 'ngo-form', fill: self.farbe(knoten) }));
        if (self.filter.farbe === 'cluster' && knoten.cluster) {
          var ziffer = el('text', { class: 'ngo-clusterziffer', y: 3.6 });
          ziffer.textContent = String(knoten.cluster);
          gruppe.appendChild(ziffer);
        }
      } else {
        var seite = self.radius(knoten) * 1.7;
        gruppe.appendChild(el('rect', {
          x: -seite / 2, y: -seite / 2,
          width: seite, height: seite, rx: 2, class: 'ngo-form'
        }));
      }

      var beschriftung = el('text', {
        class: 'ngo-beschriftung', y: -(self.radius(knoten) + 6)
      });
      if (knoten.textAnker) {
        beschriftung.setAttribute('text-anchor', knoten.textAnker);
        // Am Rand steht der Name neben dem Knoten, nicht darueber.
        if (knoten.textAnker !== 'middle') {
          beschriftung.setAttribute('x',
            (knoten.textAnker === 'start' ? 1 : -1) * (self.radius(knoten) + 7));
          beschriftung.setAttribute('y', 4);
        }
      }
      beschriftung.textContent = kuerzeName(knoten.name);
      gruppe.appendChild(beschriftung);
      self.beschriftungen[knoten.id] = beschriftung;

      var titel = el('title');
      titel.textContent = self.beschriftung(knoten);
      gruppe.appendChild(titel);

      gruppe.addEventListener('click', function (e) { e.stopPropagation(); self.waehle(knoten.id); });
      gruppe.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self.waehle(knoten.id); }
      });
      self.macheZiehbar(gruppe, knoten);

      self.knotenEbene.appendChild(gruppe);
      self.knotenElemente[knoten.id] = { gruppe: gruppe, daten: knoten };
    });

    this.aktualisiereHervorhebung();
    this.passeEin();
    this.meldeStand(netz, layout);
    this.beiNetz(netz);
  };

  /**
   * Schwellen, ab denen ein Knoten in der Übersicht seinen Namen behält —
   * je Knotenart eine eigene. In der Personenperspektive liegen Personen und
   * Organisationen auf verschiedenen Skalen; eine gemeinsame Schwelle würde
   * die Personen verdrängen.
   */
  Ansicht.prototype.berechneNamensSchwellen = function (knoten) {
    var netzknoten = knoten.filter(function (k) {
      return k.typ === 'organisation' || (k.organisationen && k.typ !== 'stumpf');
    });
    if (netzknoten.length <= ALLE_NAMEN_BIS) {
      return { organisation: 0, person: 0, stumpf: 0 };
    }

    var arten = { organisation: [], person: [] };
    netzknoten.forEach(function (k) {
      arten[k.typ === 'person' ? 'person' : 'organisation'].push(k.zentralitaet || 0);
    });

    // Anschlussstummel zaehlen nicht mit: Sie tragen hohe Werte und wuerden
    // die Schwelle so hoch treiben, dass keine Organisation mehr beschriftet
    // wird — dabei geht es in dieser Ansicht gerade um die Organisationen.
    var stummel = knoten.filter(function (k) { return k.typ === 'stumpf'; })
      .map(function (k) { return k.zentralitaet || 0; })
      .sort(function (a, b) { return b - a; });
    var stumpfSchwelle = stummel.length <= 10 ? 0
      : Math.max(1, stummel[Math.min(10, stummel.length) - 1]);

    var schwellen = {};
    var arten_namen = Object.keys(arten).filter(function (a) { return arten[a].length; });
    var jeArt = Math.max(6, Math.round(NAMEN_IN_UEBERSICHT / arten_namen.length));
    arten_namen.forEach(function (art) {
      var werte = arten[art].sort(function (a, b) { return b - a; });
      schwellen[art] = Math.max(1, werte[Math.min(jeArt, werte.length) - 1]);
    });
    return {
      organisation: schwellen.organisation || 0,
      person: schwellen.person || 0,
      stumpf: stumpfSchwelle
    };
  };

  /**
   * Blendet Namen ein und aus. Immer sichtbar sind der gewählte Knoten, seine
   * Nachbarschaft, Suchtreffer und aufgeklappte Personen; ab NAMEN_AB_ZOOM
   * werden alle Namen gezeigt.
   */
  /**
   * Breite einer Linie **auf dem Bildschirm**, in Pixeln. Bewusst ein enger
   * Bereich: Ein Netz liest sich mit feinen, aber deckenden Linien besser als
   * mit dicken. Die Abstufung soll das Gewicht zeigen, nicht dominieren.
   */
  Ansicht.prototype.strichbreite = function (kante) {
    if (kante.art === 'cluster') {
      // Aggregierte Linie: die Zahl der verbundenen Organisationspaare.
      return 1 + Math.min(1.8, (kante.daten && kante.daten.organisationspaare || 1) * 0.055);
    }
    if (kante.art === 'anschluss') return 1;
    if (kante.art === 'rolle') return 1;
    if (kante.art === 'beleg') return 1.4;
    return 0.85 + Math.min(0.85, (kante.gewicht || 1) * 0.21);
  };

  /**
   * Alles, was auf dem Bildschirm gleich gross bleiben soll, gegen den
   * Massstab rechnen: Linien und Knotenränder. Ohne das werden Linien beim
   * Einpassen auf unter einen Pixel gestaucht und vom Kantenglätten zu einem
   * grauen Schleier verwaschen.
   */
  Ansicht.prototype.aktualisiereStrichstaerken = function () {
    var faktor = 1 / Math.max(0.25, this.transform.s);
    var self = this;
    Object.keys(this.kantenElemente).forEach(function (id) {
      var eintrag = self.kantenElemente[id];
      var ziel = parseFloat(eintrag.linie.dataset.staerke) || 1.2;
      if (eintrag.gruppe.classList.contains('ngo-hervor')) ziel = Math.max(ziel * 2.2, 2.6);
      eintrag.linie.style.strokeWidth = (ziel * faktor).toFixed(2) + 'px';
    });
    Object.keys(this.knotenElemente).forEach(function (id) {
      var form = self.knotenElemente[id].gruppe.querySelector('.ngo-form');
      if (!form) return;
      // Der weisse Trennring bleibt schmal: er soll ueberlappende Knoten
      // trennen, nicht die Flaeche auffressen.
      var daten = self.knotenElemente[id].daten;
      var gruppe = self.knotenElemente[id].gruppe;
      var ziel = daten.typ === 'cluster' ? 1.4 : 0.9;
      // Auswahl und Nachbarschaft brauchen einen kraeftigen Rand, der beim
      // Einpassen nicht verschwindet — deshalb auch hier gegen den Massstab.
      if (gruppe.classList.contains('ngo-gewaehlt') ||
          gruppe.classList.contains('ngo-treffer')) ziel = 3.2;
      else if (gruppe.classList.contains('ngo-nachbar')) ziel = 2.4;
      form.style.strokeWidth = (ziel * faktor).toFixed(2) + 'px';
    });
  };

  Ansicht.prototype.aktualisiereBeschriftungen = function () {
    if (!this.layout) return;
    this.aktualisiereStrichstaerken();
    var self = this;
    var schwellen = this.namensSchwellen || { organisation: 0, person: 0, stumpf: 0 };
    var alle = this.transform.s >= NAMEN_AB_ZOOM ||
      (!schwellen.organisation && !schwellen.person);
    var treffer = this.trefferMenge() || {};
    var nah = {};
    if (this.auswahl) {
      nah[this.auswahl] = true;
      this.layout.kanten.forEach(function (k) {
        if (k.source.id === self.auswahl) nah[k.target.id] = true;
        if (k.target.id === self.auswahl) nah[k.source.id] = true;
      });
    }
    // Die Beschriftung liegt im gezoomten Viewport und wuerde sonst mit dem
    // Massstab schrumpfen. Sie wird gegengerechnet, damit der Name in der
    // eingepassten Uebersicht gleich gross bleibt wie beim Hineinzoomen.
    // In sehr duennen Ansichten — etwa dem Personenfokus mit vier Knoten —
    // darf die Schrift groesser sein; Platz ist dort reichlich.
    var grund = this.layout.knoten.length <= 12 ? 13.5 : GRUNDSCHRIFT;
    var schrift = Math.min(30, grund / Math.max(0.2, this.transform.s));

    var gezeigt = 0;
    this.layout.knoten.forEach(function (knoten) {
      var text = self.beschriftungen[knoten.id];
      if (!text) return;
      // Aufgeklappte Rollenknoten tragen ihren Namen immer — sie erscheinen
      // nur wenige auf einmal. Personen im Personennetz werden wie
      // Organisationen ausgeduennt.
      var rollenknoten = knoten.typ === 'person' && !knoten.organisationen;
      var schwelle = knoten.typ === 'person' ? schwellen.person
        : (knoten.typ === 'stumpf' ? schwellen.stumpf : schwellen.organisation);
      var sichtbar = alle || rollenknoten || treffer[knoten.id] || nah[knoten.id] ||
        (knoten.zentralitaet || 0) >= schwelle;
      text.classList.toggle('ngo-beschriftung--aus', !sichtbar);
      if (sichtbar) {
        gezeigt += 1;
        // Als Inline-Stil, nicht als Attribut: das Stylesheet setzt font-size
        // und stroke-width und wuerde ein Praesentationsattribut schlagen.
        text.style.fontSize = schrift.toFixed(1) + 'px';
        // Die weisse Kontur trennt die Schrift vom Netz. Sie darf nicht mit
        // der Schriftgroesse mitwachsen — sonst legt sie sich bei kleinem
        // Massstab als weisser Schleier ueber die ganze Grafik.
        text.style.strokeWidth = Math.min(2.6, schrift * 0.13).toFixed(1) + 'px';
        if (knoten.textAnker && knoten.textAnker !== 'middle') {
          text.setAttribute('y', (schrift * 0.34).toFixed(1));
          text.setAttribute('x', ((knoten.textAnker === 'start' ? 1 : -1) *
            (self.radius(knoten) + schrift * 0.8)).toFixed(1));
        } else {
          text.setAttribute('y', (-(self.radius(knoten) + schrift * 0.45)).toFixed(1));
        }
      }
    });
    this.gezeigteNamen = gezeigt;
  };

  Ansicht.prototype.kantenText = function (kante) {
    var art = kante.art === 'direkt' ? 'direkt erfasste Beziehung'
      : (kante.art === 'beides' ? 'direkt erfasst und über gemeinsame Personen'
        : 'über gemeinsam erfasste Personen');
    var namen = kante.personen.map(function (p) { return p.name; });
    return kante.source.name + ' ↔ ' + kante.target.name + ' — ' + art +
      (namen.length ? ': ' + namen.slice(0, 6).join(', ') +
        (namen.length > 6 ? ' und ' + (namen.length - 6) + ' weitere' : '') : '');
  };

  Ansicht.prototype.meldeStand = function (netz, layout) {
    var teile = [];
    // Steht eine Liste, gibt es kein Layout: Die Meldung beschreibt dann den
    // Bestand, nicht das Bild.
    if (netz.alsListe) {
      var eintraege = netz.knoten.filter(function (k) { return k.typ !== 'stumpf'; }).length;
      teile.push(netz.ebene === 'cluster'
        ? eintraege + ' Cluster mit ' + netz.kanten.length + ' Verbindungen zwischen ihnen.'
        : eintraege + ' Organisationen mit ' + netz.kanten.length + ' Verbindungen.');
      teile.push('Als Netzbild wäre das nicht mehr lesbar, deshalb steht hier eine Liste. ' +
        'Ein Eintrag anklicken öffnet ihn.');
      this.melde(teile.join(' '));
      return;
    }
    if (netz.historie) {
      teile.push(netz.beziehungen + ' frühere Beziehungen zwischen ' + netz.organisationen +
        ' Organisationen und ' + netz.personen + ' Personen. Getrennt von den aktuellen.');
    } else if (netz.aufAuswahl && netz.auswahlAusgeblendet) {
      var gewaehlt = null;
      netz.knoten.forEach(function (k) { if (k.id === netz.aufAuswahl) gewaehlt = k; });
      teile.push((gewaehlt ? gewaehlt.name : 'Die Auswahl') + ' und ' +
        (netz.knoten.length - 1) + ' damit verbundene Organisationen. ' +
        netz.auswahlAusgeblendet + ' Organisationen ohne Verbindung dazu sind ' +
        'ausgeblendet; die Auswahl aufheben zeigt wieder alle.');
    } else if (netz.ebene === 'personfokus') {
      teile.push(netz.person.name + ': ' + netz.beziehungen + ' erfasste Beziehungen zu ' +
        netz.organisationen + ' Organisationen.');
      if (netz.ausgeblendet > 0) {
        teile.push(netz.ausgeblendet + ' weitere Organisationen sind durch die gewählte ' +
          'Beziehungsart ausgeblendet — insgesamt sind ' + netz.erfasst + ' erfasst. ' +
          'Auf «erweitert» umschalten zeigt alle.');
      }
    } else if (netz.ebene === 'cluster') {
      teile.push(layout.knoten.length + ' Cluster, ' + netz.kanten.length +
        ' Verbindungen zwischen ihnen. Eine Linie steht für die Zahl der ' +
        'verbundenen Organisationspaare, nicht für eine Beziehung zwischen den ' +
        'Clustern selbst. Cluster anklicken öffnet ihn.');
    } else if (netz.ebene === 'clusterinhalt') {
      teile.push('Cluster ' + (netz.cluster ? netz.cluster.id + ' — ' + netz.cluster.label : '') +
        ': ' + netz.mitglieder + ' Organisationen, ' + netz.anschluesse +
        ' Anschlüsse an andere Cluster.');
    } else if (netz.bipartit) {
      teile.push(netz.personen + ' Personen mit Beziehungen zu mindestens ' + netz.schwelle +
        ' Organisationen, verbunden mit ' + netz.organisationen + ' Organisationen über ' +
        layout.kanten.length + ' erfasste Beziehungen.');
    } else {
      var linien = layout.kanten.filter(function (k) { return k.art !== 'rolle'; }).length;
      if (netz.ohneVerbindung) {
        teile.push(netz.verbundene + ' von ' + layout.knoten.length +
          ' Organisationen haben in dieser Auswahl eine Verbindung (' + linien +
          ' Linien). Die übrigen stehen klein und blass — sie haben keine Beziehung ' +
          'der gewählten Art, was nicht heisst, dass sie unvernetzt wären.');
      } else {
        teile.push(layout.knoten.length + ' Organisationen und ' + linien + ' Verbindungen.');
      }
    }
    if (this.gezeigteNamen !== undefined && this.gezeigteNamen < layout.knoten.length) {
      teile.push('Beschriftet sind die ' + this.gezeigteNamen + ' Knoten mit der grössten ' +
        'Brückenfunktion; hineinzoomen oder anwählen zeigt die übrigen Namen.');
    }
    if (netz.begrenzt) {
      var mitte = this.modell.orgNachId[netz.nachbarschaftVon];
      teile.push('Auf schmalen Anzeigen wird die Nachbarschaft von ' +
        (mitte ? mitte.name : netz.nachbarschaftVon) + ' gezeigt, nicht das Gesamtnetz.');
    }
    this.melde(teile.join(' '));
  };

  Ansicht.prototype.beschriftung = function (knoten) {
    if (knoten.typ === 'cluster') {
      return 'Cluster ' + knoten.cluster + ': ' + knoten.name + ', ' + knoten.mitglieder +
        ' Organisationen, ' + knoten.interneVerbindungen +
        ' Verbindungen innerhalb. Anklicken öffnet den Cluster.';
    }
    if (knoten.typ === 'stumpf') {
      return 'Anschluss an Cluster ' + knoten.cluster + ': ' +
        (knoten.vollname || knoten.name) + ', ' + knoten.organisationen.length +
        ' Organisationen. Anklicken wechselt dorthin.';
    }
    if (knoten.typ === 'organisation') {
      var o = knoten.organisation;
      var teile = ['Organisation ' + o.name + ' (' + o.id + ')'];
      if (this.netz && this.netz.ebene === 'personfokus') {
        teile.push('Anklicken zeigt diese Organisation mit ihren Verbindungen');
      }
      if (knoten.historisch) {
        teile.push(o.historischeKanten + ' historische Beziehungen');
      } else {
        teile.push('Brückenfunktion ' + knoten.zentralitaet);
      }
      if (o.abdeckungsluecke) teile.push('Abdeckungslücke der Erhebung');
      return teile.join(', ');
    }
    if (knoten.person && knoten.organisationen) {
      return 'Person ' + knoten.name + ', erfasst bei ' + knoten.organisationen +
        ' Organisationen';
    }
    var k = knoten.kante || {};
    return 'Person ' + knoten.name + ', ' + (k.rolle || '') + ' — ' + (k.klasse || '');
  };

  /* ------------------------------------------------- Auswahl, Aufklappen - */

  Ansicht.prototype.waehle = function (knotenId, ohneZeichnen) {
    var eintrag = this.knotenElemente[knotenId];
    if (!eintrag) return;
    var knoten = eintrag.daten;

    if (knoten.typ === 'cluster') {
      this.beiEbene({ ebene: 'clusterinhalt', cluster: knoten.cluster });
      return;
    }
    if (knoten.typ === 'stumpf') {
      this.beiEbene({ ebene: 'clusterinhalt', cluster: knoten.cluster });
      return;
    }
    if (knoten.typ === 'organisation') {
      // Im Personenfokus ist eine Organisation kein Ziel, sondern ein Weg.
      // Ohne diesen Zweig passiert beim Klick sichtbar nichts: Das Netz zeigt
      // dort nur die eine Person, und Aufklappen gibt es nicht.
      if (this.netz && this.netz.ebene === 'personfokus') {
        this.beiOrganisation({ id: knotenId, organisation: knoten.organisation });
        return;
      }
      this.aufgeklappt[knotenId] = !this.aufgeklappt[knotenId];
      this.auswahl = knotenId;
      if (!ohneZeichnen) this.zeichne();
      this.beiAuswahl({ typ: 'organisation', id: knotenId, organisation: knoten.organisation });
      this.zentriere(knotenId);
      this.beiZustand();
      return;
    }

    this.auswahl = knotenId;
    this.aktualisiereHervorhebung();
    this.beiAuswahl({
      typ: 'person', id: knotenId, kante: knoten.kante,
      person: knoten.person || (knoten.kante ? knoten.kante.person : null)
    });
    this.beiZustand();
  };

  /** Springt zu einer Organisation, auch wenn sie gerade nicht gezeichnet ist. */
  Ansicht.prototype.springeZu = function (organisationId) {
    // Steht eine Liste, gibt es keinen Knoten zum Anspringen. Dann gilt
    // dasselbe wie beim Klick in der Liste: die Organisation wird gewaehlt,
    // und das Bild zeigt sie mit ihren Verbindungen.
    if (this.netz && this.netz.alsListe) {
      var vorhanden = this.netz.knoten.some(function (k) { return k.id === organisationId; });
      if (vorhanden) {
        this.auswahl = organisationId;
        this.fokus = organisationId;
        this.zeichne();
      }
    }
    if (!this.knotenElemente[organisationId]) {
      this.fokus = organisationId;
      this.zeichne();
    }
    // Auch wenn die Nachbarschaft zu dicht fuer ein Bild bleibt, gehoert die
    // Organisation in die Detailspalte — sonst fuehrt ein geteilter Link ins
    // Leere.
    if (!this.knotenElemente[organisationId] && this.netz && this.netz.alsListe) {
      var eintrag = null;
      this.netz.knoten.forEach(function (k) { if (k.id === organisationId) eintrag = k; });
      if (eintrag) {
        this.beiAuswahl({ typ: 'organisation', id: organisationId,
                          organisation: eintrag.organisation });
        this.beiZustand();
        return;
      }
    }
    if (this.knotenElemente[organisationId]) {
      this.auswahl = organisationId;
      // Neu zeichnen, damit die Begrenzung auf die Auswahl auch greift, wenn
      // die Auswahl aus der Adresse kommt — sonst haengt das Bild davon ab,
      // auf welchem Weg man hereingekommen ist.
      this.zeichne();
      this.zentriere(organisationId);
      var organisation = this.modell.orgNachId[organisationId];
      this.beiAuswahl({ typ: 'organisation', id: organisationId, organisation: organisation });
      this.beiZustand();
    }
  };

  Ansicht.prototype.trefferMenge = function () {
    if (!this.suchbegriff) return null;
    var q = this.suchbegriff.toLowerCase();
    var kanon = N.canonicalPersonKey(this.suchbegriff);
    var treffer = {};
    (this.layout ? this.layout.knoten : []).forEach(function (k) {
      var text = (k.name + ' ' + (k.vollname || '') +
        ' ' + (k.organisation ? k.organisation.id : '')).toLowerCase();
      var personTreffer = k.kante && k.kante.person &&
        (kanon && k.kante.person.schluessel.indexOf(kanon) !== -1);
      if (text.indexOf(q) !== -1 || personTreffer) treffer[k.id] = true;
    });
    return treffer;
  };

  Ansicht.prototype.aktualisiereHervorhebung = function () {
    var self = this;
    var treffer = this.trefferMenge();
    var nachbarn = {};
    if (this.auswahl) {
      nachbarn[this.auswahl] = true;
      (this.layout ? this.layout.kanten : []).forEach(function (k) {
        if (k.source.id === self.auswahl) nachbarn[k.target.id] = true;
        if (k.target.id === self.auswahl) nachbarn[k.source.id] = true;
      });
    }
    this.nachbarn = nachbarn;
    Object.keys(this.knotenElemente).forEach(function (id) {
      var g = self.knotenElemente[id].gruppe;
      var form = g.querySelector('.ngo-form');
      if (form && self.knotenElemente[id].daten.typ !== 'person') {
        form.setAttribute('fill', self.farbe(self.knotenElemente[id].daten));
      }
      var istTreffer = treffer ? !!treffer[id] : false;
      var gedaempft = (treffer && !istTreffer) || (self.auswahl && !nachbarn[id]);
      g.classList.toggle('ngo-treffer', istTreffer);
      g.classList.toggle('ngo-gewaehlt', id === self.auswahl);
      // Nachbarn werden mitgezeichnet, nicht nur der Rest gedaempft: sonst
      // bleibt die Auswahl in einem blassen Netz schwer zu erkennen.
      g.classList.toggle('ngo-nachbar', !!(self.auswahl && nachbarn[id] && id !== self.auswahl));
      g.classList.toggle('ngo-gedaempft', !!gedaempft);
    });
    Object.keys(this.kantenElemente).forEach(function (id) {
      var eintrag = self.kantenElemente[id];
      var k = eintrag.daten;
      var beteiligt = self.auswahl && (k.source.id === self.auswahl || k.target.id === self.auswahl);
      var trefferkante = treffer && (treffer[k.source.id] || treffer[k.target.id]);
      eintrag.gruppe.classList.toggle('ngo-hervor', !!(beteiligt || trefferkante));
      eintrag.gruppe.classList.toggle('ngo-gedaempft',
        !!((self.auswahl && !beteiligt) || (treffer && !trefferkante)));
    });
    // Erst nach dem Setzen der Klassen: die Staerken haengen davon ab.
    this.aktualisiereBeschriftungen();
    // Ausgewaehlte Knoten nach vorn, damit ihre Beschriftung obenauf liegt.
    if (this.auswahl && this.knotenElemente[this.auswahl]) {
      var gewaehlt = this.knotenElemente[this.auswahl].gruppe;
      if (gewaehlt.parentNode) gewaehlt.parentNode.appendChild(gewaehlt);
    }
  };

  /* ------------------------------------------------- Ziehen, Zoom, Pan --- */

  Ansicht.prototype.macheZiehbar = function (gruppe, knoten) {
    var self = this;
    var zieht = false, start = null;
    gruppe.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      zieht = true;
      start = { x: e.clientX, y: e.clientY, kx: knoten.x, ky: knoten.y };
      gruppe.setPointerCapture(e.pointerId);
      e.stopPropagation();
    });
    gruppe.addEventListener('pointermove', function (e) {
      if (!zieht) return;
      knoten.x = start.kx + (e.clientX - start.x) / self.transform.s;
      knoten.y = start.ky + (e.clientY - start.y) / self.transform.s;
      gruppe.setAttribute('transform', 'translate(' + knoten.x + ' ' + knoten.y + ')');
      self.aktualisiereKanten(knoten.id);
      e.preventDefault();
    });
    ['pointerup', 'pointercancel'].forEach(function (typ) {
      gruppe.addEventListener(typ, function (e) {
        if (!zieht) return;
        zieht = false;
        try { gruppe.releasePointerCapture(e.pointerId); } catch (fehler) { /* egal */ }
      });
    });
  };

  Ansicht.prototype.aktualisiereKanten = function (knotenId) {
    var self = this;
    Object.keys(this.kantenElemente).forEach(function (id) {
      var eintrag = self.kantenElemente[id];
      var k = eintrag.daten;
      if (k.source.id !== knotenId && k.target.id !== knotenId) return;
      eintrag.linie.setAttribute('x1', k.source.x);
      eintrag.linie.setAttribute('y1', k.source.y);
      eintrag.linie.setAttribute('x2', k.target.x);
      eintrag.linie.setAttribute('y2', k.target.y);
    });
  };

  Ansicht.prototype.wendeTransformAn = function () {
    this.viewport.setAttribute('transform',
      'translate(' + this.transform.x + ' ' + this.transform.y + ') scale(' + this.transform.s + ')');
  };

  Ansicht.prototype.passeEin = function () {
    if (!this.layout || !this.layout.knoten.length) return;
    var rechteck = this.svg.getBoundingClientRect();
    var breite = Math.max(320, rechteck.width), hoehe = Math.max(320, rechteck.height);
    // Beschriftungen stehen ueber den Knoten und ragen seitlich hinaus. Ohne
    // zusaetzlichen Rand werden sie am Bildrand abgeschnitten — bei wenigen,
    // weit auseinanderliegenden Knoten faellt das besonders auf. Im Ring des
    // Personenfokus ist der Platz schon in den Halbmessern eingerechnet.
    var imRing = this.netz && this.netz.ebene === 'personfokus';
    var rand = imRing ? 24 : (this.layout.knoten.length <= 40 ? 130 : 56);
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    this.layout.knoten.forEach(function (k) {
      minX = Math.min(minX, k.x); maxX = Math.max(maxX, k.x);
      minY = Math.min(minY, k.y); maxY = Math.max(maxY, k.y);
    });
    var massstab = Math.min((breite - 2 * rand) / Math.max(1, maxX - minX),
                            (hoehe - 2 * rand) / Math.max(1, maxY - minY), 1.6);
    massstab = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, massstab));
    this.transform.s = massstab;
    this.transform.x = breite / 2 - ((minX + maxX) / 2) * massstab;
    this.transform.y = hoehe / 2 - ((minY + maxY) / 2) * massstab;
    this.wendeTransformAn();
    this.aktualisiereBeschriftungen();
  };

  Ansicht.prototype.zoome = function (faktor, mittelpunkt) {
    var alt = this.transform.s;
    var neu = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, alt * faktor));
    if (neu === alt) return;
    var rechteck = this.svg.getBoundingClientRect();
    var px = mittelpunkt ? mittelpunkt.x - rechteck.left : rechteck.width / 2;
    var py = mittelpunkt ? mittelpunkt.y - rechteck.top : rechteck.height / 2;
    this.transform.x = px - (px - this.transform.x) * (neu / alt);
    this.transform.y = py - (py - this.transform.y) * (neu / alt);
    this.transform.s = neu;
    this.wendeTransformAn();
    this.aktualisiereBeschriftungen();
  };

  Ansicht.prototype.zentriere = function (knotenId) {
    var eintrag = this.knotenElemente[knotenId];
    if (!eintrag) return;
    var rechteck = this.svg.getBoundingClientRect();
    this.transform.s = Math.max(this.transform.s, 0.9);
    this.transform.x = rechteck.width / 2 - eintrag.daten.x * this.transform.s;
    this.transform.y = rechteck.height / 2 - eintrag.daten.y * this.transform.s;
    this.wendeTransformAn();
    this.aktualisiereBeschriftungen();
  };

  Ansicht.prototype.bindeNavigation = function () {
    var self = this, zieht = false, start = null, zeiger = {};

    this.svg.addEventListener('pointerdown', function (e) {
      zeiger[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (Object.keys(zeiger).length > 1) { zieht = false; return; }
      zieht = true;
      start = { x: e.clientX - self.transform.x, y: e.clientY - self.transform.y };
      self.svg.classList.add('ngo-zieht');
      self.svg.setPointerCapture(e.pointerId);
    });
    this.svg.addEventListener('pointermove', function (e) {
      if (!zeiger[e.pointerId]) return;
      zeiger[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(zeiger);
      if (ids.length >= 2) {
        var a = zeiger[ids[0]], b = zeiger[ids[1]];
        var abstand = Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
        if (self.letzterAbstand) {
          self.zoome(abstand / self.letzterAbstand, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        }
        self.letzterAbstand = abstand;
        e.preventDefault();
        return;
      }
      if (!zieht) return;
      self.transform.x = e.clientX - start.x;
      self.transform.y = e.clientY - start.y;
      self.wendeTransformAn();
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (typ) {
      self.svg.addEventListener(typ, function (e) {
        delete zeiger[e.pointerId];
        if (Object.keys(zeiger).length < 2) self.letzterAbstand = null;
        zieht = false;
        self.svg.classList.remove('ngo-zieht');
      });
    });
    this.svg.addEventListener('wheel', function (e) {
      e.preventDefault();
      self.zoome(e.deltaY < 0 ? 1.15 : 1 / 1.15, { x: e.clientX, y: e.clientY });
    }, { passive: false });
    this.svg.addEventListener('click', function () { self.loeseAuswahl(); });
  };

  /* ---------------------------------------------------------- Steuerung -- */

  /**
   * Auswahl aufheben. War das Bild auf die Auswahl begrenzt, muss neu
   * gezeichnet werden — sonst blieben die ausgeblendeten Organisationen weg.
   */
  Ansicht.prototype.loeseAuswahl = function () {
    var warBegrenzt = !!(this.netz && this.netz.aufAuswahl);
    this.auswahl = null;
    if (warBegrenzt) this.zeichne(); else this.aktualisiereHervorhebung();
    this.beiAuswahl(null);
    this.beiZustand();
  };

  Ansicht.prototype.setzeFilter = function (filter) {
    this.filter = filter;
    this.auswahl = null;
    this.aufgeklappt = {};
    this.zeichne();
  };

  Ansicht.prototype.setzeSuche = function (begriff) {
    this.suchbegriff = begriff;
    this.aktualisiereHervorhebung();
    var treffer = this.trefferMenge();
    var ids = treffer ? Object.keys(treffer) : [];
    if (begriff && ids.length) {
      this.zentriere(ids[0]);
      this.melde(ids.length + ' Treffer für „' + begriff + '“ in der aktuellen Ansicht.');
    } else if (begriff) {
      this.melde('Keine Treffer für „' + begriff + '“ in der aktuellen Ansicht.');
    }
    return ids;
  };

  Ansicht.prototype.setzeZurueck = function () {
    this.filter = N.standardFilter();
    this.suchbegriff = '';
    this.auswahl = null;
    this.aufgeklappt = {};
    this.fokus = null;
    this.transform = { x: 0, y: 0, s: 1 };
    this.zeichne();
    this.beiAuswahl(null);
    this.beiZustand();
  };

  Ansicht.prototype.melde = function (text) {
    if (this.status) this.status.textContent = text;
  };

  global.NgoNetzAnsicht = {
    erstelle: function (o) { return new Ansicht(o); },
    OBERGRUPPEN_FARBE: OBERGRUPPEN_FARBE,
    NEUTRAL: NEUTRAL,
    AKZENT: AKZENT
  };
})(typeof window !== 'undefined' ? window : this);
