/*!
 * netzwerk-ansicht.js — Darstellung und Bedienung der Netzwerk-Vorschau
 * souveraene-schweiz.ch
 *
 * Zustaendig ausschliesslich fuer Layout, Zeichnung und Interaktion.
 * Die Ableitung der Netze steht in netzwerk-daten.js, die Kraftsimulation
 * kommt aus dem lokal gebuendelten d3-force (assets/vendor/).
 */
(function (global) {
  'use strict';

  var N = global.NetzwerkDaten;
  var NS = 'http://www.w3.org/2000/svg';

  var ORG_RADIUS = 8;
  var PERSON_SEITE = 13;
  var ZOOM_MIN = 0.2;
  var ZOOM_MAX = 6;

  function el(name, attrs) {
    var k = document.createElementNS(NS, name);
    if (attrs) Object.keys(attrs).forEach(function (a) { k.setAttribute(a, attrs[a]); });
    return k;
  }

  function sparsameAnimation() {
    return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function Ansicht(optionen) {
    this.modell = optionen.modell;
    this.svg = optionen.svg;
    this.buehne = optionen.buehne;          // Container fuer Vollbild
    this.detail = optionen.detail;          // Detailbereich
    this.statusfeld = optionen.status;      // Kurzmeldung (aria-live)
    this.ansicht = 'organisation';
    this.teilnetz = 0;
    this.suchbegriff = '';
    this.auswahl = null;
    this.transform = { x: 0, y: 0, s: 1 };
    this.knotenElemente = {};
    this.kantenElemente = {};

    this.viewport = el('g', { class: 'nv-viewport' });
    this.kantenEbene = el('g', { class: 'nv-kanten' });
    this.knotenEbene = el('g', { class: 'nv-knoten' });
    this.viewport.appendChild(this.kantenEbene);
    this.viewport.appendChild(this.knotenEbene);
    this.svg.appendChild(this.viewport);

    this.bindeNavigation();
  }

  /* ------------------------------------------------------------- Layout --- */

  /** Ankerpunkte je Teilnetz, damit getrennte Teilnetze nicht auseinanderdriften. */
  Ansicht.prototype.ankerpunkte = function (breite, hoehe, anzahl) {
    var spalten = Math.ceil(Math.sqrt(anzahl));
    var zeilen = Math.ceil(anzahl / spalten);
    var anker = {};
    for (var i = 0; i < anzahl; i++) {
      var sp = i % spalten;
      var ze = Math.floor(i / spalten);
      anker[i + 1] = {
        x: breite * (sp + 0.5) / spalten,
        y: hoehe * (ze + 0.5) / zeilen
      };
    }
    return anker;
  };

  Ansicht.prototype.aktuellesNetz = function () {
    var basis = this.ansicht === 'organisation'
      ? this.modell.organisationsnetz
      : this.modell.bipartitesNetz;
    return N.filtereNachTeilnetz(basis, this.modell.datensatz, this.modell.zuTeilnetz, this.teilnetz);
  };

  /** Berechnet Positionen mit d3-force. Ergebnis ist statisch; keine Dauer-Animation. */
  Ansicht.prototype.berechneLayout = function (netz, breite, hoehe) {
    var self = this;
    var teilnetzAnzahl = this.teilnetz ? 1 : this.modell.teilnetze.length;
    var anker = this.ankerpunkte(breite, hoehe, teilnetzAnzahl);

    var knoten = netz.knoten.map(function (k) {
      var t = N.teilnetzVonKnoten(k, self.modell.datensatz, self.modell.zuTeilnetz) || 1;
      var a = anker[self.teilnetz ? 1 : t] || { x: breite / 2, y: hoehe / 2 };
      return {
        id: k.id, typ: k.typ, name: k.name, ngoId: k.ngoId, teilnetz: t,
        x: a.x + (hashZahl(k.id) % 60) - 30,
        y: a.y + (hashZahl(k.id + '#') % 60) - 30,
        ankerX: a.x, ankerY: a.y
      };
    });
    var nachId = {};
    knoten.forEach(function (k) { nachId[k.id] = k; });
    var kanten = netz.kanten.map(function (k) {
      return { id: k.id, source: nachId[k.quelle], target: nachId[k.ziel], personen: k.personen };
    });

    var streuung = this.ansicht === 'organisation' ? 1 : 0.75;
    var simulation = global.d3.forceSimulation(knoten)
      .force('kante', global.d3.forceLink(kanten).id(function (d) { return d.id; })
        .distance(this.ansicht === 'organisation' ? 90 : 70).strength(0.9))
      .force('abstossung', global.d3.forceManyBody().strength(-420 * streuung).distanceMax(520))
      .force('kollision', global.d3.forceCollide().radius(34).strength(0.9))
      .force('ankerX', global.d3.forceX(function (d) { return d.ankerX; }).strength(0.14))
      .force('ankerY', global.d3.forceY(function (d) { return d.ankerY; }).strength(0.14))
      .stop();

    for (var i = 0; i < 320; i++) simulation.tick();

    return { knoten: knoten, kanten: kanten, nachId: nachId };
  };

  function hashZahl(text) {
    var h = 0;
    for (var i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
    return h;
  }

  /* ------------------------------------------------------------ Zeichnen -- */

  Ansicht.prototype.zeichne = function () {
    var self = this;
    var rechteck = this.svg.getBoundingClientRect();
    var breite = Math.max(320, rechteck.width);
    var hoehe = Math.max(320, rechteck.height);
    this.svg.setAttribute('viewBox', '0 0 ' + breite + ' ' + hoehe);

    var netz = this.aktuellesNetz();
    var layout = this.berechneLayout(netz, breite, hoehe);
    this.layout = layout;
    this.netz = netz;

    this.kantenEbene.textContent = '';
    this.knotenEbene.textContent = '';
    this.knotenElemente = {};
    this.kantenElemente = {};

    layout.kanten.forEach(function (kante) {
      var gruppe = el('g', { class: 'nv-kante' + (kante.personen.length > 1 ? ' nv-kante--mehrfach' : '') });
      var linie = el('line', {
        x1: kante.source.x, y1: kante.source.y, x2: kante.target.x, y2: kante.target.y
      });
      gruppe.appendChild(linie);

      // Anzahl nur sichtbar machen, wenn mehrere Personen verbinden.
      if (self.ansicht === 'organisation' && kante.personen.length > 1) {
        var mx = (kante.source.x + kante.target.x) / 2;
        var my = (kante.source.y + kante.target.y) / 2;
        var badge = el('g', { class: 'nv-kantenzahl' });
        badge.appendChild(el('circle', { cx: mx, cy: my, r: 9 }));
        var zahl = el('text', { x: mx, y: my + 4 });
        zahl.textContent = String(kante.personen.length);
        badge.appendChild(zahl);
        gruppe.appendChild(badge);
      }

      var titel = el('title');
      titel.textContent = kante.personen.length === 1
        ? 'Verbindende Person: ' + kante.personen[0]
        : 'Verbindende Personen (' + kante.personen.length + '): ' + kante.personen.join(', ');
      gruppe.appendChild(titel);

      self.kantenEbene.appendChild(gruppe);
      self.kantenElemente[kante.id] = { gruppe: gruppe, linie: linie, daten: kante };
    });

    layout.knoten.forEach(function (knoten) {
      var gruppe = el('g', {
        class: 'nv-knoten-gruppe nv-' + knoten.typ,
        tabindex: '0',
        role: 'button',
        transform: 'translate(' + knoten.x + ' ' + knoten.y + ')'
      });
      gruppe.setAttribute('aria-label', self.knotenBeschriftung(knoten));

      if (knoten.typ === 'organisation') {
        gruppe.appendChild(el('circle', { r: ORG_RADIUS, class: 'nv-form' }));
      } else {
        gruppe.appendChild(el('rect', {
          x: -PERSON_SEITE / 2, y: -PERSON_SEITE / 2,
          width: PERSON_SEITE, height: PERSON_SEITE, rx: 2, class: 'nv-form'
        }));
      }

      var beschriftung = el('text', { class: 'nv-beschriftung', y: -14 });
      beschriftung.textContent = knoten.name;
      gruppe.appendChild(beschriftung);

      var titel = el('title');
      titel.textContent = self.knotenBeschriftung(knoten);
      gruppe.appendChild(titel);

      gruppe.addEventListener('click', function (e) { e.stopPropagation(); self.waehle(knoten.id); });
      gruppe.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self.waehle(knoten.id); }
      });
      gruppe.addEventListener('focus', function () { self.zeigeDetail(knoten.id, false); });
      self.macheZiehbar(gruppe, knoten);

      self.knotenEbene.appendChild(gruppe);
      self.knotenElemente[knoten.id] = { gruppe: gruppe, daten: knoten };
    });

    this.aktualisiereHervorhebung();
    this.passeEin();
    this.meldeStatus(
      netz.knoten.length + ' Knoten und ' + netz.kanten.length + ' Verbindungen dargestellt.'
    );
  };

  Ansicht.prototype.knotenBeschriftung = function (knoten) {
    if (knoten.typ === 'organisation') {
      return 'Organisation ' + knoten.name + ' (' + knoten.ngoId + ')';
    }
    return 'Person ' + knoten.name;
  };

  /* ------------------------------------------------- Ziehen, Zoom, Pan ---- */

  Ansicht.prototype.macheZiehbar = function (gruppe, knoten) {
    var self = this;
    var zieht = false;
    var start = null;

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
      var badge = eintrag.gruppe.querySelector('.nv-kantenzahl');
      if (badge) {
        var mx = (k.source.x + k.target.x) / 2;
        var my = (k.source.y + k.target.y) / 2;
        badge.querySelector('circle').setAttribute('cx', mx);
        badge.querySelector('circle').setAttribute('cy', my);
        badge.querySelector('text').setAttribute('x', mx);
        badge.querySelector('text').setAttribute('y', my + 4);
      }
    });
  };

  /**
   * Passt Massstab und Verschiebung so an, dass das gesamte Netz sichtbar ist.
   * Der Rand haelt Platz fuer die Beschriftungen frei.
   */
  Ansicht.prototype.passeEin = function () {
    if (!this.layout || !this.layout.knoten.length) return;
    var rechteck = this.svg.getBoundingClientRect();
    var breite = Math.max(320, rechteck.width);
    var hoehe = Math.max(320, rechteck.height);
    var rand = 56;

    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    this.layout.knoten.forEach(function (k) {
      if (k.x < minX) minX = k.x;
      if (k.x > maxX) maxX = k.x;
      if (k.y < minY) minY = k.y;
      if (k.y > maxY) maxY = k.y;
    });

    var inhaltBreite = Math.max(1, maxX - minX);
    var inhaltHoehe = Math.max(1, maxY - minY);
    var massstab = Math.min(
      (breite - 2 * rand) / inhaltBreite,
      (hoehe - 2 * rand) / inhaltHoehe,
      1.6
    );
    massstab = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, massstab));

    this.transform.s = massstab;
    this.transform.x = breite / 2 - ((minX + maxX) / 2) * massstab;
    this.transform.y = hoehe / 2 - ((minY + maxY) / 2) * massstab;
    this.wendeTransformAn();
  };

  Ansicht.prototype.wendeTransformAn = function () {
    this.viewport.setAttribute(
      'transform',
      'translate(' + this.transform.x + ' ' + this.transform.y + ') scale(' + this.transform.s + ')'
    );
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
  };

  Ansicht.prototype.bindeNavigation = function () {
    var self = this;
    var zieht = false;
    var start = null;
    var zeiger = {};

    this.svg.addEventListener('pointerdown', function (e) {
      zeiger[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (Object.keys(zeiger).length > 1) { zieht = false; return; }
      zieht = true;
      start = { x: e.clientX - self.transform.x, y: e.clientY - self.transform.y };
      self.svg.classList.add('nv-zieht');
      self.svg.setPointerCapture(e.pointerId);
    });

    this.svg.addEventListener('pointermove', function (e) {
      if (!zeiger[e.pointerId]) return;
      var vorher = zeiger[e.pointerId];
      zeiger[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(zeiger);

      if (ids.length >= 2) { // Pinch-Zoom
        var a = zeiger[ids[0]], b = zeiger[ids[1]];
        var abstand = Math.hypot(a.x - b.x, a.y - b.y);
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
      void vorher;
    });

    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (typ) {
      self.svg.addEventListener(typ, function (e) {
        delete zeiger[e.pointerId];
        if (Object.keys(zeiger).length < 2) self.letzterAbstand = null;
        zieht = false;
        self.svg.classList.remove('nv-zieht');
      });
    });

    this.svg.addEventListener('wheel', function (e) {
      e.preventDefault();
      self.zoome(e.deltaY < 0 ? 1.15 : 1 / 1.15, { x: e.clientX, y: e.clientY });
    }, { passive: false });

    this.svg.addEventListener('click', function () { self.waehle(null); });
  };

  /** Zentriert einen Knoten im sichtbaren Bereich. */
  Ansicht.prototype.zentriere = function (knotenId) {
    var eintrag = this.knotenElemente[knotenId];
    if (!eintrag) return;
    var rechteck = this.svg.getBoundingClientRect();
    this.transform.s = Math.max(this.transform.s, 1.1);
    this.transform.x = rechteck.width / 2 - eintrag.daten.x * this.transform.s;
    this.transform.y = rechteck.height / 2 - eintrag.daten.y * this.transform.s;
    this.wendeTransformAn();
  };

  /* ----------------------------------------------- Auswahl und Detailteil - */

  Ansicht.prototype.waehle = function (knotenId) {
    this.auswahl = knotenId;
    this.aktualisiereHervorhebung();
    this.zeigeDetail(knotenId, true);
    if (knotenId) this.zentriere(knotenId);
  };

  Ansicht.prototype.trefferMenge = function () {
    if (!this.suchbegriff) return null;
    var treffer = {};
    N.sucheKnoten(this.netz, this.suchbegriff).forEach(function (k) { treffer[k.id] = true; });
    return treffer;
  };

  Ansicht.prototype.aktualisiereHervorhebung = function () {
    var self = this;
    var treffer = this.trefferMenge();
    var nachbarIds = {};
    if (this.auswahl) {
      nachbarIds[this.auswahl] = true;
      N.nachbarn(this.netz, this.auswahl).forEach(function (n) { nachbarIds[n.knoten.id] = true; });
    }

    Object.keys(this.knotenElemente).forEach(function (id) {
      var g = self.knotenElemente[id].gruppe;
      var istTreffer = treffer ? !!treffer[id] : false;
      var gedaempft = (treffer && !istTreffer) || (self.auswahl && !nachbarIds[id]);
      g.classList.toggle('nv-treffer', istTreffer);
      g.classList.toggle('nv-gewaehlt', id === self.auswahl);
      g.classList.toggle('nv-nachbar', !!(self.auswahl && nachbarIds[id] && id !== self.auswahl));
      g.classList.toggle('nv-gedaempft', !!gedaempft);
    });

    Object.keys(this.kantenElemente).forEach(function (id) {
      var eintrag = self.kantenElemente[id];
      var k = eintrag.daten;
      var beteiligt = self.auswahl && (k.source.id === self.auswahl || k.target.id === self.auswahl);
      eintrag.gruppe.classList.toggle('nv-kante-aktiv', !!beteiligt);
      eintrag.gruppe.classList.toggle('nv-gedaempft', !!(self.auswahl && !beteiligt));
    });
  };

  function textKnoten(tag, klasse, text) {
    var k = document.createElement(tag);
    if (klasse) k.className = klasse;
    if (text !== undefined) k.textContent = text;
    return k;
  }

  Ansicht.prototype.zeigeDetail = function (knotenId, auchZentrieren) {
    void auchZentrieren;
    var self = this;
    this.detail.textContent = '';

    if (!knotenId || !this.knotenElemente[knotenId]) {
      this.detail.appendChild(textKnoten('p', 'nv-detail-leer',
        'Knoten anklicken oder mit der Tabulatortaste anwählen, um Details zu sehen.'));
      return;
    }

    var knoten = this.knotenElemente[knotenId].daten;
    var verbindungen = N.nachbarn(this.netz, knotenId);

    this.detail.appendChild(textKnoten('p', 'nv-detail-typ',
      knoten.typ === 'organisation' ? 'Organisation' : 'Person'));
    var titel = textKnoten('h3', 'nv-detail-name', knoten.name);
    this.detail.appendChild(titel);
    if (knoten.ngoId) this.detail.appendChild(textKnoten('p', 'nv-detail-id', knoten.ngoId));

    this.detail.appendChild(textKnoten('p', 'nv-detail-zahl',
      verbindungen.length === 1 ? '1 direkte Verbindung' : verbindungen.length + ' direkte Verbindungen'));
    this.detail.appendChild(textKnoten('p', 'nv-detail-zahl', 'Teilnetz ' + knoten.teilnetz));

    var liste = document.createElement('ul');
    liste.className = 'nv-detail-liste';
    verbindungen.forEach(function (v) {
      var eintrag = document.createElement('li');
      var knopf = textKnoten('button', 'nv-detail-link', v.knoten.name);
      knopf.type = 'button';
      knopf.addEventListener('click', function () { self.waehle(v.knoten.id); });
      eintrag.appendChild(knopf);
      if (self.ansicht === 'organisation') {
        eintrag.appendChild(textKnoten('span', 'nv-detail-via',
          v.kante.personen.length === 1
            ? 'über ' + v.kante.personen[0]
            : 'über ' + v.kante.personen.length + ' Personen: ' + v.kante.personen.join(', ')));
      }
      liste.appendChild(eintrag);
    });
    this.detail.appendChild(liste);
  };

  Ansicht.prototype.meldeStatus = function (text) {
    if (this.statusfeld) this.statusfeld.textContent = text;
  };

  /* ------------------------------------------------------- Steuerung ------ */

  Ansicht.prototype.setzeAnsicht = function (ansicht) {
    if (this.ansicht === ansicht) return;
    this.ansicht = ansicht;
    this.auswahl = null;
    this.setzeTransformZurueck();
    this.zeichne();
    this.zeigeDetail(null);
  };

  Ansicht.prototype.setzeTeilnetz = function (nummer) {
    this.teilnetz = nummer;
    this.auswahl = null;
    this.setzeTransformZurueck();
    this.zeichne();
    this.zeigeDetail(null);
  };

  Ansicht.prototype.setzeSuche = function (begriff) {
    this.suchbegriff = begriff;
    this.aktualisiereHervorhebung();
    var treffer = N.sucheKnoten(this.netz, begriff);
    if (begriff && treffer.length) {
      this.zentriere(treffer[0].id);
      this.meldeStatus(treffer.length + ' Treffer für „' + begriff + '“. Erster Treffer: ' + treffer[0].name + '.');
    } else if (begriff) {
      this.meldeStatus('Keine Treffer für „' + begriff + '“.');
    }
    return treffer;
  };

  Ansicht.prototype.setzeTransformZurueck = function () {
    this.transform = { x: 0, y: 0, s: 1 };
    if (this.layout) this.passeEin();
    else this.wendeTransformAn();
  };

  Ansicht.prototype.setzeAllesZurueck = function () {
    this.teilnetz = 0;
    this.suchbegriff = '';
    this.auswahl = null;
    this.setzeTransformZurueck();
    this.zeichne();
    this.zeigeDetail(null);
  };

  global.NetzwerkAnsicht = { erstelle: function (o) { return new Ansicht(o); }, sparsameAnimation: sparsameAnimation };
})(typeof window !== 'undefined' ? window : this);
