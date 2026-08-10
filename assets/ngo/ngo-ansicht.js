/*!
 * ngo-ansicht.js — Darstellung des NGO-Fuehrungsnetzes
 * souveraene-schweiz.ch
 *
 * Zeichnet ausschliesslich Organisationsbruecken. Fuehrungspersonen werden
 * erst beim Anklicken einer Organisation eingeblendet — die 296 Rollen werden
 * nie gleichzeitig als Gesamtgraph dargestellt.
 *
 * Layout: d3-force (lokal gebuendelt). Interaktion, Zoom und Vollbild
 * uebernehmen die bewaehrte Mechanik der Verflechtungs-Vorschau.
 */
(function (global) {
  'use strict';

  var N = global.NgoDaten;
  var NS = 'http://www.w3.org/2000/svg';

  var ORG_RADIUS = 9;
  var PERSON_SEITE = 12;
  var ZOOM_MIN = 0.2;
  var ZOOM_MAX = 6;

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
    this.filter = N.standardFilter();
    this.suchbegriff = '';
    this.auswahl = null;
    this.aufgeklappt = {};          // organisationId -> true: Personen sichtbar
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

  /* ------------------------------------------------------------ Layout --- */

  Ansicht.prototype.baueGraph = function () {
    var netz = N.baueOrganisationsnetz(this.modell, this.filter);
    var self = this;

    // Aufgeklappte Organisationen um ihre Fuehrungspersonen ergaenzen.
    var knoten = netz.knoten.slice();
    var kanten = netz.kanten.slice();
    Object.keys(this.aufgeklappt).forEach(function (orgId) {
      if (!self.aufgeklappt[orgId]) return;
      if (!netz.knoten.some(function (k) { return k.id === orgId; })) return;
      N.personenZuOrganisation(self.modell, orgId, self.filter).forEach(function (rolle) {
        var id = 'rolle:' + rolle.id;
        knoten.push({
          id: id, typ: 'person', name: rolle.personName || '(nicht ermittelt)',
          rolle: rolle, gehoertZu: orgId
        });
        kanten.push({
          id: 'k:' + rolle.id, quelle: orgId, ziel: id,
          ebene: 'rolle', personen: [rolle.personName], typen: [], typenText: []
        });
      });
    });
    return { knoten: knoten, kanten: kanten };
  };

  Ansicht.prototype.berechneLayout = function (netz, breite, hoehe) {
    var mitte = { x: breite / 2, y: hoehe / 2 };
    var knoten = netz.knoten.map(function (k) {
      return {
        id: k.id, typ: k.typ, name: k.name, vollname: k.vollname, ngoId: k.ngoId,
        rolle: k.rolle, gehoertZu: k.gehoertZu,
        x: mitte.x + (hashZahl(k.id) % 400) - 200,
        y: mitte.y + (hashZahl(k.id + '#') % 400) - 200
      };
    });
    var nachId = {};
    knoten.forEach(function (k) { nachId[k.id] = k; });
    var kanten = netz.kanten.filter(function (k) {
      return nachId[k.quelle] && nachId[k.ziel];
    }).map(function (k) {
      return {
        id: k.id, source: nachId[k.quelle], target: nachId[k.ziel],
        ebene: k.ebene, personen: k.personen, typenText: k.typenText, daten: k
      };
    });

    var simulation = global.d3.forceSimulation(knoten)
      .force('kante', global.d3.forceLink(kanten).id(function (d) { return d.id; })
        .distance(function (d) { return d.ebene === 'rolle' ? 58 : 130; })
        .strength(function (d) { return d.ebene === 'rolle' ? 1 : 0.75; }))
      .force('abstossung', global.d3.forceManyBody().strength(-620).distanceMax(700))
      .force('kollision', global.d3.forceCollide().radius(38).strength(0.9))
      .force('mitteX', global.d3.forceX(mitte.x).strength(0.05))
      .force('mitteY', global.d3.forceY(mitte.y).strength(0.05))
      .stop();
    for (var i = 0; i < 340; i++) simulation.tick();

    return { knoten: knoten, kanten: kanten, nachId: nachId };
  };

  /* ---------------------------------------------------------- Zeichnen --- */

  Ansicht.prototype.zeichne = function () {
    var self = this;
    var rechteck = this.svg.getBoundingClientRect();
    var breite = Math.max(320, rechteck.width);
    var hoehe = Math.max(320, rechteck.height);
    this.svg.setAttribute('viewBox', '0 0 ' + breite + ' ' + hoehe);

    var netz = this.baueGraph();
    var layout = this.berechneLayout(netz, breite, hoehe);
    this.layout = layout;
    this.netz = netz;

    this.kantenEbene.textContent = '';
    this.knotenEbene.textContent = '';
    this.knotenElemente = {};
    this.kantenElemente = {};

    layout.kanten.forEach(function (kante) {
      var gruppe = el('g', { class: 'ngo-kante ngo-kante--' + kante.ebene });
      var linie = el('line', {
        x1: kante.source.x, y1: kante.source.y, x2: kante.target.x, y2: kante.target.y
      });
      gruppe.appendChild(linie);

      if (kante.ebene !== 'rolle' && kante.personen.length > 1) {
        var mx = (kante.source.x + kante.target.x) / 2;
        var my = (kante.source.y + kante.target.y) / 2;
        var badge = el('g', { class: 'ngo-kantenzahl' });
        badge.appendChild(el('circle', { cx: mx, cy: my, r: 9 }));
        var zahl = el('text', { x: mx, y: my + 4 });
        zahl.textContent = String(kante.personen.length);
        badge.appendChild(zahl);
        gruppe.appendChild(badge);
      }

      var titel = el('title');
      titel.textContent = kante.ebene === 'rolle'
        ? kante.personen[0]
        : kante.personen.join(', ') + (kante.typenText.length ? ' — ' + kante.typenText.join(', ') : '');
      gruppe.appendChild(titel);

      self.kantenEbene.appendChild(gruppe);
      self.kantenElemente[kante.id] = { gruppe: gruppe, linie: linie, daten: kante };
    });

    layout.knoten.forEach(function (knoten) {
      var klassen = ['ngo-knoten-gruppe', 'ngo-' + knoten.typ];
      if (knoten.typ === 'organisation' && self.aufgeklappt[knoten.id]) klassen.push('ngo-offen');
      var gruppe = el('g', {
        class: klassen.join(' '),
        tabindex: '0',
        role: 'button',
        transform: 'translate(' + knoten.x + ' ' + knoten.y + ')'
      });
      gruppe.setAttribute('aria-label', self.beschriftung(knoten));

      if (knoten.typ === 'organisation') {
        gruppe.appendChild(el('circle', { r: ORG_RADIUS, class: 'ngo-form' }));
      } else {
        gruppe.appendChild(el('rect', {
          x: -PERSON_SEITE / 2, y: -PERSON_SEITE / 2,
          width: PERSON_SEITE, height: PERSON_SEITE, rx: 2, class: 'ngo-form'
        }));
      }

      var beschriftung = el('text', { class: 'ngo-beschriftung', y: -15 });
      beschriftung.textContent = knoten.name;
      gruppe.appendChild(beschriftung);

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
    this.melde(layout.knoten.length + ' Knoten und ' + layout.kanten.length + ' Verbindungen dargestellt.');
  };

  Ansicht.prototype.beschriftung = function (knoten) {
    if (knoten.typ === 'organisation') {
      return 'Organisation ' + (knoten.vollname || knoten.name) + ' (' + knoten.ngoId + ')';
    }
    var r = knoten.rolle || {};
    return 'Person ' + knoten.name + ', ' + (r.funktion || '') + ' — ' + (r.zeitstatusText || '');
  };

  /* ------------------------------------------------- Auswahl, Aufklappen - */

  Ansicht.prototype.waehle = function (knotenId) {
    var eintrag = this.knotenElemente[knotenId];
    if (!eintrag) return;
    var knoten = eintrag.daten;

    if (knoten.typ === 'organisation') {
      // Erster Klick klappt die Fuehrungspersonen auf, erneuter Klick zu.
      this.aufgeklappt[knotenId] = !this.aufgeklappt[knotenId];
      this.auswahl = knotenId;
      this.zeichne();
      this.beiAuswahl({ typ: 'organisation', id: knotenId, aufgeklappt: !!this.aufgeklappt[knotenId] });
      this.zentriere(knotenId);
      return;
    }

    this.auswahl = knotenId;
    this.aktualisiereHervorhebung();
    this.beiAuswahl({ typ: 'rolle', id: knotenId, rolle: knoten.rolle, organisationId: knoten.gehoertZu });
  };

  Ansicht.prototype.trefferMenge = function () {
    if (!this.suchbegriff) return null;
    var q = this.suchbegriff.toLowerCase();
    var treffer = {};
    (this.layout ? this.layout.knoten : []).forEach(function (k) {
      var text = (k.name + ' ' + (k.vollname || '') + ' ' + (k.ngoId || '')).toLowerCase();
      if (text.indexOf(q) !== -1) treffer[k.id] = true;
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
    Object.keys(this.knotenElemente).forEach(function (id) {
      var g = self.knotenElemente[id].gruppe;
      var istTreffer = treffer ? !!treffer[id] : false;
      var gedaempft = (treffer && !istTreffer) || (self.auswahl && !nachbarn[id]);
      g.classList.toggle('ngo-treffer', istTreffer);
      g.classList.toggle('ngo-gewaehlt', id === self.auswahl);
      g.classList.toggle('ngo-gedaempft', !!gedaempft);
    });
    Object.keys(this.kantenElemente).forEach(function (id) {
      var eintrag = self.kantenElemente[id];
      var k = eintrag.daten;
      var beteiligt = self.auswahl && (k.source.id === self.auswahl || k.target.id === self.auswahl);
      eintrag.gruppe.classList.toggle('ngo-gedaempft', !!(self.auswahl && !beteiligt));
    });
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
      var badge = eintrag.gruppe.querySelector('.ngo-kantenzahl');
      if (badge) {
        var mx = (k.source.x + k.target.x) / 2, my = (k.source.y + k.target.y) / 2;
        badge.querySelector('circle').setAttribute('cx', mx);
        badge.querySelector('circle').setAttribute('cy', my);
        badge.querySelector('text').setAttribute('x', mx);
        badge.querySelector('text').setAttribute('y', my + 4);
      }
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
    var rand = 60;
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

  Ansicht.prototype.zentriere = function (knotenId) {
    var eintrag = this.knotenElemente[knotenId];
    if (!eintrag) return;
    var rechteck = this.svg.getBoundingClientRect();
    this.transform.s = Math.max(this.transform.s, 1);
    this.transform.x = rechteck.width / 2 - eintrag.daten.x * this.transform.s;
    this.transform.y = rechteck.height / 2 - eintrag.daten.y * this.transform.s;
    this.wendeTransformAn();
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
    this.svg.addEventListener('click', function () {
      self.auswahl = null;
      self.aktualisiereHervorhebung();
      self.beiAuswahl(null);
    });
  };

  /* ---------------------------------------------------------- Steuerung -- */

  Ansicht.prototype.setzeFilter = function (filter) {
    this.filter = filter;
    this.auswahl = null;
    this.zeichne();
  };

  Ansicht.prototype.setzeSuche = function (begriff) {
    this.suchbegriff = begriff;
    this.aktualisiereHervorhebung();
    var treffer = this.trefferMenge();
    var ids = treffer ? Object.keys(treffer) : [];
    if (begriff && ids.length) {
      this.zentriere(ids[0]);
      this.melde(ids.length + ' Treffer für „' + begriff + '“.');
    } else if (begriff) {
      this.melde('Keine Treffer für „' + begriff + '“ in der aktuellen Auswahl.');
    }
    return ids;
  };

  Ansicht.prototype.setzeZurueck = function () {
    this.filter = N.standardFilter();
    this.suchbegriff = '';
    this.auswahl = null;
    this.aufgeklappt = {};
    this.transform = { x: 0, y: 0, s: 1 };
    this.zeichne();
    this.beiAuswahl(null);
  };

  Ansicht.prototype.melde = function (text) {
    if (this.status) this.status.textContent = text;
  };

  global.NgoAnsicht = { erstelle: function (o) { return new Ansicht(o); } };
})(typeof window !== 'undefined' ? window : this);
