/*
 * zuwanderung-modell.js — die einzige Zahlenquelle der Seite
 * «Rechnet sich Zuwanderung für die Schweiz?».
 *
 * Fachlich führend ist der Schlussbericht V2.9e (Prüffassung). Diese Datei ist
 * ausschliesslich dessen technische Spiegelung. Website-Text und Rechner lesen
 * beide von hier; keine Zahl darf daneben noch einmal im HTML oder im
 * Rechnerskript stehen. Genau das hatte die Fassungen auseinanderlaufen lassen.
 *
 * Saldo-Definition: Jahr-1-Arbeitswert VOR SV-Nettosaldo. Beiträge an
 * Sozialversicherungen sind eine eigene Rechnungsebene und werden hier nicht
 * hineingerechnet. Ein SV-Proxy darf den Gruppenwert nicht ins Positive drehen.
 *
 * Einheit der Salden: Mio. CHF für die jeweils angegebene Referenzmenge.
 */
(function (global) {
  'use strict';

  var MODELL = {
    version: '2.9e',
    referenzjahr: 2025,
    saldoDefinition: 'Jahr-1-Arbeitswert vor SV-Nettosaldo',

    // Reihenfolge = Anzeigereihenfolge auf der Seite.
    gruppen: [
      { id: 'G1', name: 'EU/EFTA – Erwerbstätigkeit',        pers: 84218, mio:  -300.2, band: [-360.0,  -240.0], qualitaet: 'C' },
      { id: 'G2', name: 'Drittstaaten – Erwerbstätigkeit',   pers:  4137, mio:   -10.6, band: [ -12.8,    -8.5], qualitaet: 'C' },
      { id: 'G3', name: 'Familiennachzug',                   pers: 42170, mio: -1008.8, band: [-1030.5, -981.4], qualitaet: 'C/D' },
      { id: 'G4', name: 'Aus- und Weiterbildung',            pers: 17579, mio:  -535.0, band: [-644.0,  -316.0], qualitaet: 'C/D' },
      { id: 'G5', name: 'Aufenthalt ohne Erwerbstätigkeit',  pers:  5087, mio:   -15.7, band: [ -29.0,    +3.1], qualitaet: 'D' },
      { id: 'G6', name: 'Übertritte aus dem Asylbereich',    pers:  8119, mio:  -115.8, band: [-142.5,   -90.7], qualitaet: 'C/D' },
      { id: 'G7', name: 'Übrige Zugänge',                    pers:  4076, mio:   -49.8, band: [ -74.6,   -24.9], qualitaet: 'D' }
    ],

    // Eigene Rechnungsebenen. Sie gehoeren NICHT ins G1-G7-Total: andere
    // Personen-, Bestands- oder Zeitbasen. Die Bandschluessel heissen wie im
    // Rechner, damit der Szenarioschalter unveraendert bleibt.
    separat: [
      { id: 'A1', name: 'Asylgesuche', bezug: 'Gesuche', pers: 25781,
        band: { favourable: -1369.0, central: -1711.2, critical: -2053.4 }, qualitaet: 'C/D' },
      { id: 'A2', name: 'Schutzstatus S', bezug: 'Personen', pers: 12897,
        band: { favourable: -322.0, central: -404.0, critical: -490.0 }, qualitaet: 'C/D' }
    ],

    // Publizierter Gesamtwert. Die Summe der einzeln gerundeten Gruppenwerte
    // ergibt -2035,9 Mio.; publiziert wird der gerundete Wert des Dossiers.
    // Die Differenz von 0,1 Mio. ist eine Rundungsdifferenz, kein Fehler.
    // Das Gesamtband stammt unveraendert aus dem Dossier. Es wird NICHT aus
    // den Gruppenbaendern gerechnet: Die Unsicherheiten sind nicht unabhaengig,
    // eine Addition waere Scheingenauigkeit. Es ist eine Sensitivitaetsangabe
    // zum Referenzmodell, kein statistisches Konfidenzintervall.
    total: { pers: 165386, mio: -2036.0, band: [-2294.0, -1659.0], qualitaet: 'C/D' }
  };

  /** Separate Ebene nach Kennung, oder null. */
  MODELL.ebene = function (id) {
    for (var i = 0; i < MODELL.separat.length; i++) {
      if (MODELL.separat[i].id === id) return MODELL.separat[i];
    }
    return null;
  };

  /**
   * Arithmetische Gesamtuebersicht G1-G7 + A1 + A2 in Mio. CHF.
   * Ausdruecklich KEINE einheitliche Kohortenbilanz — die drei Ebenen
   * beruhen auf verschiedenen statistischen Zugaengen.
   */
  MODELL.uebersichtMio = function () {
    return MODELL.total.mio + MODELL.separat.reduce(function (a, e) {
      return a + e.band.central;
    }, 0);
  };

  /** Gruppe nach Kennung, oder null. */
  MODELL.gruppe = function (id) {
    for (var i = 0; i < MODELL.gruppen.length; i++) {
      if (MODELL.gruppen[i].id === id) return MODELL.gruppen[i];
    }
    return null;
  };

  /* ---------------------------------------------------------- Formate --- */

  /** 165386 -> «165’386» */
  MODELL.zahl = function (n) {
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '’');
  };

  /**
   * Ein Betrag in Mio. CHF, ohne Wechsel auf Milliarden. Nachkommastelle nur,
   * wenn der Wert eine hat oder wenn sie ausdrücklich verlangt wird — in
   * Bandgrenzen wie «–29,0 bis +3,1» gehört sie auf beide Seiten.
   */
  MODELL.mioText = function (v, mitStelle) {
    var r = Math.round(v * 10) / 10;
    var zeichen = r < 0 ? '–' : '+';
    var wert = Math.abs(r);
    var ganz = Math.floor(wert);
    var rest = Math.round((wert - ganz) * 10);
    var text = MODELL.zahl(ganz) + (rest || mitStelle ? ',' + rest : '');
    return zeichen + text;
  };

  /** Gruppenwert wie im Dossier: «–300,2 Mio.», «–1’008,8 Mio.». */
  MODELL.gruppenText = function (mio) {
    return MODELL.mioText(mio, true) + ' Mio.';
  };

  /** Grosse Summe: «–2,036 Mrd.». */
  MODELL.mrdText = function (mio) {
    var r = Math.round(mio) / 1000;
    return (r < 0 ? '–' : '+') + Math.abs(r).toFixed(3).replace('.', ',') + ' Mrd.';
  };

  /**
   * «–360 bis –240 Mio.» — immer vom tieferen zum höheren Wert. Hat eine der
   * beiden Grenzen eine Nachkommastelle, tragen sie beide eine.
   */
  MODELL.bandText = function (band) {
    if (!band) return '–';
    var a = Math.min(band[0], band[1]), b = Math.max(band[0], band[1]);
    var stelle = (Math.round(a * 10) % 10 !== 0) || (Math.round(b * 10) % 10 !== 0);
    return MODELL.mioText(a, stelle) + ' bis ' + MODELL.mioText(b, stelle) + ' Mio.';
  };

  /** «–2,294 bis –1,659 Mrd.» — fuer Baender in Milliardenhoehe. */
  MODELL.bandMrdText = function (band) {
    if (!band) return '–';
    var a = Math.min(band[0], band[1]), b = Math.max(band[0], band[1]);
    return MODELL.mrdText(a) + ' bis ' + MODELL.mrdText(b);
  };

  /**
   * Alle Werte, die im Markup ueber data-zw eingesetzt werden — an einer
   * Stelle. Beide Seiten und der Test lesen dieselbe Zuordnung; sonst haetten
   * wir die Doppelfuehrung nur verschoben.
   */
  MODELL.textwerte = function () {
    var w = {
      'version': MODELL.version,
      'saldodefinition': MODELL.saldoDefinition,
      'total.pers': MODELL.zahl(MODELL.total.pers),
      'total.mrd': MODELL.mrdText(MODELL.total.mio),
      'total.band': MODELL.bandMrdText(MODELL.total.band),
      'total.qualitaet': MODELL.total.qualitaet,
      'uebersicht.mrd': MODELL.mrdText(MODELL.uebersichtMio())
    };
    MODELL.gruppen.forEach(function (g) {
      w[g.id + '.pers'] = MODELL.zahl(g.pers);
      w[g.id + '.wert'] = MODELL.gruppenText(g.mio);
      w[g.id + '.band'] = MODELL.bandText(g.band);
    });
    MODELL.separat.forEach(function (e) {
      w[e.id + '.pers'] = MODELL.zahl(e.pers);
      w[e.id + '.wert'] = Math.abs(e.band.central) >= 1000
        ? MODELL.mrdText(e.band.central)
        : MODELL.mioText(e.band.central, false) + ' Mio.';
    });
    return w;
  };

  /** Setzt alle data-zw-Platzhalter im Dokument. */
  MODELL.fuelle = function (dokument) {
    var w = MODELL.textwerte();
    Array.prototype.forEach.call(dokument.querySelectorAll('[data-zw]'), function (el) {
      var v = w[el.getAttribute('data-zw')];
      if (v !== undefined) el.textContent = v;
    });
  };

  global.ZW_MODELL = MODELL;
})(typeof window !== 'undefined' ? window : globalThis);
