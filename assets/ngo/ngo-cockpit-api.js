/* NGO-Cockpit: gleiche Oberfläche, serverseitig begrenzte Aggregate. */
(function () {
  'use strict';
  var haupt = document.getElementById('c2');
  var api;
  var optionen;
  var basisDaten;
  var aktuell;
  var laufend;
  var seriennummer = 0;
  var filterTimer;
  var suchTimer;
  var suchLaufend;
  var KLASSEN = ['N1', 'N2', 'N3', 'N4'];
  var KERN = ['N1', 'N2', 'N3'];
  var KLASSENTEXT = {
    N1: 'N1 — Organ- oder Leitungsfunktion',
    N2: 'N2 — Mitgliedschaft oder Gremium',
    N3: 'N3 — Allianz oder Dachverband',
    N4: 'N4 — weitere erfasste Beziehung'
  };
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
    var el = document.createElement(tag);
    if (klasse) el.className = klasse;
    if (text !== undefined && text !== null) el.textContent = text;
    return el;
  }
  function zahl(wert) { return String(wert).replace(/\B(?=(\d{3})+(?!\d))/g, '’'); }
  function fehler(text) {
    var el = id('c2Fehler'); el.hidden = false; el.className = 'nv-fehler'; el.textContent = text;
  }
  function aktiveKlassen() {
    return KLASSEN.filter(function (k) {
      return zustand.klassen[k] && (!zustand.kernnetz || KERN.indexOf(k) !== -1);
    });
  }
  function filterAktiv() {
    return !!(zustand.kategorie || zustand.partei || zustand.kanton || zustand.clusterMin ||
      zustand.kernnetz || zustand.bruecken || zustand.mitPersonen ||
      KLASSEN.some(function (k) { return !zustand.klassen[k]; }));
  }
  function apiFilter() {
    return {
      kategorie: zustand.kategorie, partei: zustand.partei, kanton: zustand.kanton,
      cluster_min: zustand.clusterMin || '', klassen: aktiveKlassen().join(','),
      kernnetz: zustand.kernnetz ? 1 : '', bruecken: zustand.bruecken ? 1 : '',
      mit_personen: zustand.mitPersonen ? 1 : ''
    };
  }
  function kategorien() {
    return ((optionen && optionen.zaehler && optionen.zaehler.kategorie) || []);
  }
  function kategorieLabel(kennung) {
    var eintrag = kategorien().filter(function (x) { return x.wert === kennung; })[0];
    return eintrag ? eintrag.label : kennung;
  }

  function balkenListe(ziel, eintraege, aktuellName, beiKlick) {
    ziel.textContent = '';
    if (!eintraege.length) { ziel.appendChild(knoten('li', 'c2-leer', 'Keine Einträge unter diesem Filter.')); return; }
    var max = eintraege.reduce(function (m, e) { return Math.max(m, e.wert); }, 0) || 1;
    eintraege.forEach(function (e) {
      var zeile = document.createElement('li');
      if (e.name === aktuellName) zeile.setAttribute('aria-current', 'true');
      if (beiKlick) {
        var b = knoten('button', null, e.name); b.type = 'button';
        b.title = e.titel || ('Auf «' + e.name + '» filtern');
        b.addEventListener('click', function () { beiKlick(e); }); zeile.appendChild(b);
      } else zeile.appendChild(knoten('span', 'c2-balken-name', e.name));
      var spur = knoten('span', 'c2-spur'), fuellung = knoten('span', 'c2-fuellung');
      fuellung.style.width = Math.max(1, Math.round(e.wert * 100 / max)) + '%';
      if (e.schwach) fuellung.classList.add('c2-fuellung--schwach');
      spur.appendChild(fuellung); zeile.appendChild(spur);
      zeile.appendChild(knoten('span', 'c2-wert', zahl(e.wert))); ziel.appendChild(zeile);
    });
  }

  function zeichneKennzahlen(d) {
    var k = d.kennzahlen, ziel = id('c2Kpi'); ziel.textContent = '';
    var kacheln = [
      ['organisationen', k.organisationen, 'Organisationen', zahl(k.abdeckungsluecken) + ' ohne erfasste Beziehung', null, 'Filter zurücksetzen'],
      ['personen', k.personen, 'Personen', 'in den gezeigten Beziehungen erfasst', 'mitPersonen', 'nur Organisationen mit erfassten Personen'],
      ['beziehungen', k.beziehungen, 'Beziehungen', zahl(k.kernnetz_beziehungen) + ' davon im Kernnetz N1–N3', 'kernnetz', 'nur Kernnetz'],
      ['bruecken', k.brueckenpersonen, 'Brückenpersonen', 'bei mehreren Organisationen erfasst', 'bruecken', 'nur Brückenpersonen'],
      [null, k.brueckenpersonen ? 'Ø ' + String(k.organisationen_je_brueckenperson).replace('.', ',') : '–', 'Organisationen', 'je Brückenperson, im Schnitt']
    ];
    kacheln.forEach(function (x) {
      var el = document.createElement(x[5] ? 'button' : 'div'); el.className = 'c2-kpi-karte';
      if (x[5]) { el.type = 'button'; el.title = x[5]; if (x[4]) el.setAttribute('aria-pressed', String(zustand[x[4]])); }
      el.appendChild(knoten('b', 'c2-kpi-zahl', typeof x[1] === 'number' ? zahl(x[1]) : x[1]));
      el.appendChild(knoten('span', 'c2-kpi-name', x[2])); el.appendChild(knoten('small', 'c2-kpi-zusatz', x[3]));
      if (x[5]) {
        el.appendChild(knoten('span', 'c2-kpi-schalter', x[4] && zustand[x[4]] ? '✓ ' + x[5] : x[5]));
        el.addEventListener('click', function () { if (!x[4]) zuruecksetzen(); else { zustand[x[4]] = !zustand[x[4]]; laden(); } });
      }
      ziel.appendChild(el);
    });
  }

  function zeichneVerteilungen(d) {
    var cats = d.verteilungen.kategorie.map(function (e) {
      return { name: kategorieLabel(e.name), kennung: e.name, wert: e.wert, schwach: e.wert < 5 };
    });
    id('c2KategorieZahl').textContent = cats.length + ' Kategorien';
    var gewaehlt = cats.filter(function (e) { return e.kennung === zustand.kategorie; })[0];
    balkenListe(id('c2KategorieBalken'), cats, gewaehlt ? gewaehlt.name : '', function (e) {
      zustand.kategorie = zustand.kategorie === e.kennung ? '' : e.kennung; laden();
    });
    var gesamt = d.kennzahlen.organisationen;
    id('c2KategorieFuss').textContent = gesamt ? 'Fachliche Einordnung nach Sachgebiet, für ' + zahl(gesamt) +
      ' der ' + zahl(gesamt) + ' Organisationen. Jede trägt genau eine. Unabhängig vom Cluster: Die Kategorie sagt, worum es geht, der Cluster, mit wem eine Organisation im erfassten Netz eng verbunden ist.' : '';

    var werte = {};
    d.verteilungen.klassen.forEach(function (e) { werte[e.name] = e.wert; });
    var klassen = KLASSEN.map(function (k) { return { name: KLASSENTEXT[k], klasse: k, wert: werte[k] || 0, schwach: k === 'N4' }; });
    id('c2KlassenZahl').textContent = zahl(d.kennzahlen.beziehungen) + ' Beziehungen';
    balkenListe(id('c2KlassenBalken'), klassen, '', function (e) {
      var nur = KLASSEN.every(function (k) { return zustand.klassen[k] === (k === e.klasse); });
      KLASSEN.forEach(function (k) { zustand.klassen[k] = nur || k === e.klasse; });
      if (!nur) zustand.kernnetz = false; laden();
    });

    var parteien = d.verteilungen.parteien.slice(0, 8).map(function (e) { return { name: e.name, wert: e.personen }; });
    id('c2ParteiZahl').textContent = zahl(d.kennzahlen.personen_mit_partei) + ' von ' + zahl(d.kennzahlen.personen) + ' mit Angabe';
    balkenListe(id('c2ParteiBalken'), parteien, zustand.partei, function (e) {
      zustand.partei = zustand.partei === e.name ? '' : e.name; laden();
    });
  }

  function treemap(werte, breite, hoehe) {
    var summe = werte.reduce(function (a, b) { return a + b.wert; }, 0);
    if (!summe) return [];
    var flaeche = breite * hoehe;
    var rest = werte.map(function (w) { return { daten: w, flaeche: w.wert * flaeche / summe }; });
    var kacheln = [], raum = { x: 0, y: 0, breite: breite, hoehe: hoehe };
    function seiteVon(r) { return Math.min(r.breite, r.hoehe); }
    function schlechtestes(reihe, laenge) {
      if (!reihe.length || !laenge) return Infinity;
      var s = reihe.reduce(function (a, b) { return a + b.flaeche; }, 0);
      var max = reihe[0].flaeche, min = reihe[reihe.length - 1].flaeche;
      return Math.max((laenge * laenge * max) / (s * s), (s * s) / (laenge * laenge * min));
    }
    function legeReihe(reihe) {
      var s = reihe.reduce(function (a, b) { return a + b.flaeche; }, 0);
      var waagrecht = raum.breite >= raum.hoehe, dicke = s / seiteVon(raum), pos = 0;
      reihe.forEach(function (e) {
        var laenge = e.flaeche / dicke;
        kacheln.push(waagrecht ? { daten: e.daten, x: raum.x, y: raum.y + pos, breite: dicke, hoehe: laenge }
          : { daten: e.daten, x: raum.x + pos, y: raum.y, breite: laenge, hoehe: dicke });
        pos += laenge;
      });
      if (waagrecht) { raum.x += dicke; raum.breite -= dicke; }
      else { raum.y += dicke; raum.hoehe -= dicke; }
    }
    var reihe = [];
    while (rest.length) {
      var naechstes = rest[0], mitNeu = reihe.concat([naechstes]);
      if (!reihe.length || schlechtestes(mitNeu, seiteVon(raum)) <= schlechtestes(reihe, seiteVon(raum))) {
        reihe = mitNeu; rest.shift();
      } else { legeReihe(reihe); reihe = []; }
    }
    if (reihe.length) legeReihe(reihe);
    return kacheln;
  }

  function zeichneTreemap(d) {
    var svg = id('c2Treemap'), NS = 'http://www.w3.org/2000/svg'; svg.textContent = '';
    var alle = d.cluster.map(function (c) { return { cluster: c.id, name: c.label, wert: c.groesse_gefiltert }; });
    var isolate = alle.filter(function (e) { return Number(e.cluster) === 0; }).reduce(function (n, e) { return n + e.wert; }, 0);
    var echte = alle.filter(function (e) { return Number(e.cluster) !== 0; });
    id('c2ClusterZahl').textContent = echte.length + ' Cluster vertreten';
    if (!echte.length) { id('c2ClusterFuss').textContent = 'Unter diesem Filter bleibt kein Cluster übrig.'; return; }
    var gezeigt = echte.slice(0, 12), kacheln = treemap(gezeigt, 640, 330), groesster = gezeigt[0].wert || 1;
    kacheln.forEach(function (k) {
      var a = document.createElementNS(NS, 'a');
      a.setAttribute('href', './?fokus=' + encodeURIComponent(k.daten.cluster)); a.setAttribute('class', 'c2-tm-feld');
      var rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', k.x.toFixed(1)); rect.setAttribute('y', k.y.toFixed(1));
      rect.setAttribute('width', Math.max(0, k.breite).toFixed(1)); rect.setAttribute('height', Math.max(0, k.hoehe).toFixed(1));
      rect.setAttribute('fill', BLAU[Math.min(4, Math.round(4 * k.daten.wert / groesster))]); a.appendChild(rect);
      var title = document.createElementNS(NS, 'title'); title.textContent = k.daten.name + ': ' + k.daten.wert + ' Organisationen. Anklicken öffnet den Cluster.'; a.appendChild(title);
      if (k.breite > 62 && k.hoehe > 26) {
        var zeichen = Math.max(3, Math.floor((k.breite - 12) / 5.6));
        var name = k.daten.name.length > zeichen ? k.daten.name.slice(0, zeichen - 1).replace(/[\s,;/–-]+$/, '') + '…' : k.daten.name;
        var t1 = document.createElementNS(NS, 'text'); t1.setAttribute('class', 'c2-tm-name'); t1.setAttribute('x', (k.x + 6).toFixed(1)); t1.setAttribute('y', (k.y + 16).toFixed(1)); t1.setAttribute('fill', TREEMAP_INK); t1.textContent = name; a.appendChild(t1);
        if (k.hoehe > 40) { var t2 = document.createElementNS(NS, 'text'); t2.setAttribute('class', 'c2-tm-zahl'); t2.setAttribute('x', (k.x + 6).toFixed(1)); t2.setAttribute('y', (k.y + 30).toFixed(1)); t2.setAttribute('fill', TREEMAP_INK_LEISE); t2.textContent = k.daten.wert + ' Organisationen'; a.appendChild(t2); }
      }
      svg.appendChild(a);
    });
    var uebrig = echte.slice(12).reduce(function (n, e) { return n + e.wert; }, 0), teile = ['Die Fläche zeigt die Zahl der Organisationen.'];
    if (uebrig) teile.push('Nicht abgebildet: ' + zahl(uebrig) + ' Organisationen in ' + echte.slice(12).length + ' weiteren Clustern.');
    if (isolate) teile.push(zahl(isolate) + ' Organisationen haben keine belegte Projektion und gehören keinem Cluster an — eine Abdeckungslücke der Erhebung, kein Nachweis fehlender Vernetzung.');
    teile.push('Cluster sind rechnerische Gruppen, keine Akteure; die Bezeichnungen sind deskriptive Kurzlabels nach den enthaltenen Organisationen, keine Bewertung.');
    id('c2ClusterFuss').textContent = teile.join(' ');
    balkenListe(id('c2ClusterListe'), alle.map(function (e) { return { name: e.name, wert: e.wert, cluster: e.cluster, titel: e.name + ' im Netzwerk öffnen' }; }), '', function (e) { window.location.href = './?fokus=' + encodeURIComponent(e.cluster); });
  }

  function referenzLink(ref, typ) { return './?ref=' + encodeURIComponent(ref) + '&typ=' + typ; }
  function zeichneRanglisten(d) {
    var p = id('c2Personen'); p.textContent = '';
    id('c2PersonenZahl').textContent = zahl(d.kennzahlen.brueckenpersonen) + ' bei mehreren';
    if (!d.ranglisten.personen.length) p.appendChild(knoten('li', 'c2-leer', 'Keine Personen unter diesem Filter.'));
    d.ranglisten.personen.forEach(function (e) { var li = document.createElement('li'), a = knoten('a', null, e.name); a.href = referenzLink(e.ref, 'person'); li.appendChild(a); if (e.partei) a.appendChild(knoten('span', 'c2-rang-zusatz', e.partei)); li.appendChild(knoten('span', 'c2-wert', e.organisationen)); p.appendChild(li); });
    var o = id('c2Organisationen'); o.textContent = '';
    id('c2OrgZahl').textContent = zahl(d.kennzahlen.organisationen - d.kennzahlen.abdeckungsluecken) + ' mit Personen';
    if (!d.ranglisten.organisationen.length) o.appendChild(knoten('li', 'c2-leer', 'Keine Organisationen unter diesem Filter.'));
    d.ranglisten.organisationen.slice(0, 7).forEach(function (e) { var li = document.createElement('li'), a = knoten('a', null, e.name); a.href = referenzLink(e.ref, 'organisation'); li.appendChild(a); li.appendChild(knoten('span', 'c2-wert', e.personen)); o.appendChild(li); });
  }

  function zeichneChips() {
    var ziel = id('c2Chips'), chips = []; ziel.textContent = '';
    if (zustand.kategorie) chips.push(['Kategorie', kategorieLabel(zustand.kategorie), function () { zustand.kategorie = ''; }]);
    if (zustand.partei) chips.push(['Partei', zustand.partei, function () { zustand.partei = ''; }]);
    if (zustand.kanton) chips.push(['Sitz', zustand.kanton, function () { zustand.kanton = ''; }]);
    if (zustand.clusterMin) chips.push(['Clustergrösse', 'ab ' + zustand.clusterMin, function () { zustand.clusterMin = 0; }]);
    if (zustand.kernnetz) chips.push(['Ansicht', 'nur Kernnetz', function () { zustand.kernnetz = false; }]);
    if (zustand.bruecken) chips.push(['Personen', 'nur Brückenpersonen', function () { zustand.bruecken = false; }]);
    if (zustand.mitPersonen) chips.push(['Organisationen', 'nur mit erfassten Personen', function () { zustand.mitPersonen = false; }]);
    if (KLASSEN.some(function (k) { return !zustand.klassen[k]; })) chips.push(['Beziehungsart', aktiveKlassen().join(', ') || 'keine', function () { KLASSEN.forEach(function (k) { zustand.klassen[k] = true; }); }]);
    if (!chips.length) { ziel.appendChild(knoten('span', 'c2-chips-leer', 'Kein Filter gesetzt — gezeigt wird der ganze Bestand.')); return; }
    chips.forEach(function (c) { var b = knoten('button', 'c2-chip'); b.type = 'button'; b.title = c[0] + ' ' + c[1] + ' entfernen'; b.appendChild(knoten('b', null, c[0] + ': ')); b.appendChild(document.createTextNode(c[1])); b.appendChild(knoten('span', 'c2-chip-weg', '×')); b.onclick = function () { c[2](); laden(); }; ziel.appendChild(b); });
    var reset = knoten('button', 'c2-zuruecksetzen', 'alle zurücksetzen'); reset.type = 'button'; reset.onclick = zuruecksetzen; ziel.appendChild(reset);
  }

  function synchronisieren() {
    id('c2Kategorie').value = zustand.kategorie; id('c2Partei').value = zustand.partei; id('c2Kanton').value = zustand.kanton; id('c2ClusterMin').value = String(zustand.clusterMin);
    id('c2Kernnetz').checked = zustand.kernnetz; id('c2Bruecken').checked = zustand.bruecken;
    Array.from(document.querySelectorAll('#c2Klassen button')).forEach(function (b) { var k = b.getAttribute('data-klasse'); b.setAttribute('aria-pressed', String(zustand.klassen[k] && (!zustand.kernnetz || k !== 'N4'))); b.disabled = zustand.kernnetz && k === 'N4'; });
  }
  function zeichnen(d) {
    aktuell = d; zeichneKennzahlen(d); zeichneVerteilungen(d); zeichneTreemap(d); zeichneRanglisten(d); zeichneChips(); synchronisieren();
    var k = d.kennzahlen, b = basisDaten.kennzahlen;
    id('c2Lage').textContent = filterAktiv() ? 'Gefilterter Ausschnitt: ' + zahl(k.organisationen) + ' von ' + zahl(b.organisationen) + ' Organisationen, ' + zahl(k.beziehungen) + ' von ' + zahl(b.beziehungen) + ' Beziehungen.' : 'Ganzer Bestand. Kennzahl oder Balken anklicken filtert die Seite.';
  }
  function laden() {
    clearTimeout(filterTimer); filterTimer = setTimeout(function () {
      if (laufend) laufend.abort(); laufend = new AbortController(); var nr = ++seriennummer;
      api.cockpit(apiFilter(), laufend.signal).then(function (d) { if (nr === seriennummer) zeichnen(d); }).catch(function (e) { if (e.name !== 'AbortError') fehler('Die Daten konnten nicht geladen werden (' + e.message + ').'); });
    }, 180);
  }
  function zuruecksetzen() { zustand = { kategorie: '', partei: '', kanton: '', clusterMin: 0, klassen: { N1: true, N2: true, N3: true, N4: true }, kernnetz: false, bruecken: false, mitPersonen: false }; laden(); }

  function fuelleAuswahl() {
    var z = optionen.zaehler || {};
    (z.kategorie || []).forEach(function (e) { var o = document.createElement('option'); o.value = e.wert; o.textContent = e.label + ' (' + e.anzahl + ')'; id('c2Kategorie').appendChild(o); });
    (z.partei || []).sort(function (a, b) { return b.anzahl - a.anzahl; }).forEach(function (e) { var o = document.createElement('option'); o.value = e.wert; o.textContent = e.wert; id('c2Partei').appendChild(o); });
    (z.kanton || []).sort(function (a, b) { return b.anzahl - a.anzahl; }).forEach(function (e) { var o = document.createElement('option'); o.value = e.wert; o.textContent = e.wert + ' (' + e.anzahl + ')'; id('c2Kanton').appendChild(o); });
    id('c2Kanton').options[0].textContent = 'alle — Sitz bei ' + zahl(z.sitz_erfasst || 0) + ' von ' + zahl(z.organisationen || 0) + ' erfasst';
  }

  function suche() {
    var q = id('c2Suche').value.trim(), ziel = id('c2Treffer'); clearTimeout(suchTimer); if (suchLaufend) suchLaufend.abort();
    if (q.length < 3) { ziel.hidden = true; return; }
    suchTimer = setTimeout(function () { suchLaufend = new AbortController(); Promise.all([api.suchen('organisation', q, {}, suchLaufend.signal), api.suchen('person', q, {}, suchLaufend.signal)]).then(function (antworten) {
      ziel.textContent = ''; var liste = [];
      antworten.forEach(function (a, i) { (a.treffer || []).forEach(function (t) { liste.push({ typ: i ? 'person' : 'organisation', name: t.name, ref: t.ref }); }); });
      if (!liste.length) ziel.appendChild(knoten('p', 'c2-treffer-leer', 'Kein Treffer.'));
      liste.slice(0, 12).forEach(function (t) { var b = knoten('button', null, t.name); b.type = 'button'; b.appendChild(knoten('span', 'c2-treffer-art', t.typ === 'person' ? 'Person' : 'Organisation')); b.onclick = function () { window.location.href = referenzLink(t.ref, t.typ); }; ziel.appendChild(b); });
      ziel.hidden = false;
    }).catch(function (e) { if (e.name !== 'AbortError') fehler('Die Suche konnte nicht geladen werden (' + e.message + ').'); }); }, 260);
  }

  function verdrahte() {
    [['c2Kategorie', 'kategorie'], ['c2Partei', 'partei'], ['c2Kanton', 'kanton']].forEach(function (x) { id(x[0]).onchange = function () { zustand[x[1]] = this.value; laden(); }; });
    id('c2ClusterMin').onchange = function () { zustand.clusterMin = parseInt(this.value, 10) || 0; laden(); };
    id('c2Kernnetz').onchange = function () { zustand.kernnetz = this.checked; laden(); }; id('c2Bruecken').onchange = function () { zustand.bruecken = this.checked; laden(); };
    Array.from(document.querySelectorAll('#c2Klassen button')).forEach(function (b) { b.onclick = function () { var k = b.getAttribute('data-klasse'); zustand.klassen[k] = !zustand.klassen[k]; if (!KLASSEN.some(function (x) { return zustand.klassen[x]; })) zustand.klassen[k] = true; laden(); }; });
    id('c2FilterKnopf').onclick = function () { var offen = id('c2Filter').hidden; id('c2Filter').hidden = !offen; this.setAttribute('aria-expanded', String(offen)); };
    id('c2AlleCluster').onclick = function () { var offen = id('c2ClusterListe').hidden; id('c2ClusterListe').hidden = !offen; this.setAttribute('aria-expanded', String(offen)); this.textContent = offen ? 'Clusterliste ausblenden' : 'Alle Cluster anzeigen'; };
    id('c2Suche').oninput = suche; id('c2Suche').onfocus = suche; id('c2Suche').onblur = function () { setTimeout(function () { id('c2Treffer').hidden = true; }, 160); };
  }

  var HINWEISE = { kategorie: 'Die Kategorie ordnet eine Organisation fachlich nach Sachgebiet ein. Datenbestand und ist keine Bewertung.', cluster: 'Ein Cluster ist eine Gruppe von Organisationen, die im Netz besonders dicht untereinander verbunden sind. Cluster sind rechnerische Gruppen, keine Akteure; die Bezeichnungen sind deskriptive Kurzlabels.', partei: 'Parteiangaben gehören zu einzelnen Personen. Aus ihnen lässt sich keine Parteizugehörigkeit der Organisation ableiten.' };
  function hinweise() { Array.from(document.querySelectorAll('[data-c2-hinweis]')).forEach(function (b) { b.onclick = function () { var karte = b.closest('.c2-karte'), alt = karte.querySelector('.ck-hinweis'); if (alt) alt.remove(); else b.closest('.c2-karte-kopf').insertAdjacentElement('afterend', knoten('p', 'ck-hinweis', HINWEISE[b.getAttribute('data-c2-hinweis')])); }; }); }

  try { api = window.NgoApi({ basis: haupt.getAttribute('data-api-basis') }); }
  catch (e) { fehler('Die Daten konnten nicht geladen werden (' + e.message + ').'); return; }
  Promise.all([api.optionen(), api.cockpit({})]).then(function (werte) {
    optionen = werte[0].optionen; basisDaten = werte[1];
    var stand = String(werte[0].datenstand || '').replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3.$2.$1');
    id('c2Version').textContent = stand ? 'Datenstand ' + stand : '';
    fuelleAuswahl(); verdrahte(); hinweise(); zeichnen(basisDaten);
  }).catch(function (e) { fehler('Die Daten konnten nicht geladen werden (' + e.message + ').'); });
})();
