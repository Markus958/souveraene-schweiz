# Netzwerk «Personelle Verflechtungen» — Vorschau

Interaktive Darstellung der personellen Verflechtungen zwischen Schweizer
Organisationen. Die Seite ist **nicht verlinkt** und auf `noindex, nofollow`
gesetzt.

Aufruf: `/netzwerk-verflechtungen-vorschau.html`
(optional `?ansicht=personen` für den Direkteinstieg in die zweite Ansicht)

---

## 1. Neue und geänderte Dateien

**Neu:**

| Datei | Zweck |
|---|---|
| `netzwerk-verflechtungen-vorschau.html` | Vorschauseite (noindex, nicht verlinkt) |
| `assets/data/netzwerk-verflechtungen.csv` | Datengrundlage, 73 Zeilen |
| `assets/data/netzwerk-verflechtungen-meta.json` | Datenstand + Zahl der untersuchten Organisationen |
| `assets/netzwerk/netzwerk-daten.js` | CSV-Auswertung, Netzbildung, Teilnetze, Kennzahlen (ohne DOM) |
| `assets/netzwerk/netzwerk-ansicht.js` | Layout, Zeichnung, Zoom, Auswahl, Detailbereich |
| `assets/netzwerk/netzwerk-seite.js` | Verdrahtung von Daten, Ansicht und Bedienelementen |
| `assets/netzwerk/netzwerk.css` | Styles der Vorschau |
| `assets/vendor/d3-force-bundle.min.js` | lokal gebündelte Netzwerkbibliothek (17 KB) |
| `scripts/test_netzwerk.js` | Tests der Datenaufbereitung (42 Tests) |
| `scripts/test_netzwerk_seite.js` | Smoke-Test der gerenderten Seite (21 Tests) |
| `scripts/netzwerk_csv_aus_referenz.py` | einmalige Rekonstruktion der CSV aus der Referenzdatei |

**Geändert:** keine bestehende Seite, kein bestehendes Stylesheet, kein
Navigations- oder Footer-Eintrag.

---

## 2. Architektur

Das Repository hat kein Build-System und kein npm. Die Vorschau fügt sich ein:
statisches HTML, Plain-JS-Dateien unter `assets/`, seitenspezifisches CSS.

Die drei Schichten sind getrennt:

1. **Datenaufbereitung** (`netzwerk-daten.js`) — reine Funktionen, kein DOM.
   Läuft im Browser und in Node, damit dieselbe Logik getestet werden kann.
2. **Netzwerklogik** — ebenfalls in `netzwerk-daten.js`: Organisationsnetz,
   bipartites Netz, Zusammenhangskomponenten, Filter, Suche.
3. **Darstellung** (`netzwerk-ansicht.js`) — SVG, Kraftlayout, Interaktion.

Als Netzwerkbibliothek dient **d3-force** (mit `d3-dispatch`, `d3-quadtree`,
`d3-timer`), lokal gebündelt in `assets/vendor/d3-force-bundle.min.js`
(17 KB, ISC-Lizenz). Zur Laufzeit wird dafür **kein CDN** kontaktiert.
Zeichnung, Zoom, Verschieben und Auswahl sind bewusst ohne weitere
Abhängigkeit umgesetzt.

> Hinweis: Header und Footer verwenden wie alle übrigen v5-Seiten weiterhin
> das Tailwind-CDN. Das ist bestehende Website-Architektur und wurde nicht
> verändert; das Ablösen des Tailwind-CDN ist ein separates, offenes Thema.

Alle Kennzahlen ausser «100 untersuchte Organisationen» werden zur Laufzeit
aus der CSV berechnet. Es gibt keine hart codierten Personen- oder
Organisationslisten.

---

## 3. CSV aktualisieren

Die Datei `assets/data/netzwerk-verflechtungen.csv` ist die einzige
Datenquelle. Format (Trennzeichen `;`, UTF-8):

```
Person;NGO-ID;Organisation;Anzahl verbundener Organisationen;Datenstand
Beat Imhof;NGO-0058;SAV;3;09.08.2026
```

- Eine Zeile pro Zuordnung Person → Organisation.
- Schlüssel der Organisation ist die **NGO-ID**, nicht der Name.
- Spaltenreihenfolge ist beliebig, die Kopfzeile entscheidet.
  `,` und Tabulator werden als Trennzeichen ebenfalls erkannt, ebenso
  Anführungszeichen, BOM und CRLF.
- Doppelte Zeilen sind unschädlich, sie werden zusammengeführt.

Vorgehen beim Update:

1. Neue CSV nach `assets/data/netzwerk-verflechtungen.csv` kopieren.
2. `assets/data/netzwerk-verflechtungen-meta.json` anpassen
   (`datenstand`, `untersuchteOrganisationen`).
3. In `scripts/test_netzwerk.js` die erwarteten Kennzahlen im Abschnitt
   «Datengrundlage» auf die neuen Werte setzen.
4. `node scripts/test_netzwerk.js` ausführen — der Test vergleicht unter
   anderem die Spalte «Anzahl verbundener Organisationen» mit den tatsächlich
   erfassten Zuordnungen und meldet Abweichungen namentlich.

Die Kennzahlen auf der Seite und die Teilnetz-Auswahl aktualisieren sich
dadurch automatisch; an der HTML muss nichts geändert werden.

### Herkunft der aktuellen CSV

Die Originaldatei `Netzwerk_personelle_Verflechtungen_Daten.csv` lag nicht im
Repository. Die Datengrundlage wurde deshalb mit
`scripts/netzwerk_csv_aus_referenz.py` verlustfrei aus der Personen-Tabelle
der Referenzdatei
`assets/Projektarbeit NGO-Übersicht Schweiz_files/saved_resource.html`
erzeugt. Alle Kennzahlen aus dem Auftrag werden daraus exakt reproduziert
(46 / 35 / 38 / 11). Sobald die Original-CSV vorliegt, kann sie die erzeugte
Datei ersetzen; das Skript wird dann nicht mehr benötigt.

---

## 4. Lokal starten

Die Seite lädt die CSV per `fetch`. Ein direkter Aufruf über `file://` wird vom
Browser blockiert, deshalb braucht es einen lokalen Webserver:

```
cd Paket-CH-EU
python -m http.server 8000
```

Dann `http://localhost:8000/netzwerk-verflechtungen-vorschau.html` öffnen.
Fehlt der Server, zeigt die Seite einen erklärenden Hinweis statt einer leeren
Fläche.

---

## 5. Tests

```
node scripts/test_netzwerk.js         # 42 Tests, Datenaufbereitung
node scripts/test_netzwerk_seite.js   # 21 Tests, gerenderte Seite (braucht jsdom)
```

Der zweite Test benötigt `jsdom`. Das Repository hat bewusst kein
`package.json`; ist jsdom nicht installiert, überspringt sich der Test:

```
npm install --no-save jsdom
```

Abgedeckt sind CSV-Auswertung (Trennzeichen, Anführungszeichen, BOM, CRLF,
Umlaute, fehlende Spalten, doppelte Zeilen), Verbindungsbildung
(Kanten nur bei gemeinsamer Person, mehrere Personen an einer Kante,
Reihenfolge-Unabhängigkeit), Teilnetze und Filterlogik, Suche sowie der
gerenderte Zustand der Seite inklusive Kennzahlen, Ansichtswechsel, Filter,
Zurücksetzen und Detailbereich.

---

## 6. Spätere Veröffentlichung

Die Seite ist erreichbar, aber weder verlinkt noch indexierbar. Für eine
bewusste Veröffentlichung sind nötig:

1. `<meta name="robots" content="noindex, nofollow" />` entfernen.
2. Self-canonical nach `</title>` einfügen (Konvention der Website):
   `<link rel="canonical" href="https://www.souveraene-schweiz.ch/netzwerk-verflechtungen-vorschau.html" />`
   — sinnvollerweise zusammen mit einem endgültigen Dateinamen ohne «vorschau».
3. Hinweisbanner «Interne Vorschau» aus der HTML entfernen und das
   Label «Vorschau» im page-hero ersetzen.
4. Seite in Navigation und Footer aufnehmen (Haupt- und Mobile-Navigation,
   Footer-Liste) sowie gegebenenfalls auf `interaktiv.html` verlinken.
5. OG-/Twitter-Metadaten und ein OG-Bild ergänzen (`assets/og/`).
6. Seite in `sitemap.xml` und in den Suchindex (`assets/search.js`) aufnehmen.
7. Datei umbenennen und die Namensänderung in dieser Dokumentation nachziehen.

---

## 7. Vor einer Veröffentlichung noch zu klären

**Inhaltlich / rechtlich**

- Freigabe der Namensnennung: Die Personen sind namentlich sichtbar. Zu
  klären ist, ob die Quellenlage je Person die öffentliche Darstellung trägt.
- Belegführung: Derzeit enthält die CSV keine Quellenangabe je Zuordnung.
  Für eine Veröffentlichung ist eine belegbare Quelle je Person-Organisation-
  Paar empfehlenswert (zusätzliche Spalte, im Detailbereich anzeigbar).
- Zeitliche Einordnung: Die CSV unterscheidet nicht zwischen aktuellen und
  früheren Funktionen. Wird diese Unterscheidung später ergänzt, darf sie
  nicht vermischt dargestellt werden — dafür wäre eine zusätzliche Spalte
  (z. B. `Status`) und eine getrennte Darstellung nötig.
- Funktionsbezeichnungen: Die CSV nennt keine Funktion (Vorstand,
  Geschäftsleitung, Beirat). Ohne diese Angabe bleibt die Aussage bewusst
  allgemein.
- Die 54 Organisationen ohne erfasste Personenbrücke sind nicht Teil der
  Daten. Ob sie genannt werden sollen, ist offen.

**Technisch**

- Visuelle Abnahme in echten Browsern (Safari/iOS, Firefox) steht aus; geprüft
  wurde bisher Chrome (Desktop 1440 px und mobile Emulation 390 px).
- Kontrast- und Screenreader-Prüfung mit einem echten Hilfsmittel steht aus.
  Umgesetzt sind: fokussierbare Knoten mit `aria-label`, Statusmeldungen über
  `aria-live`, Detailbereich statt reiner Hover-Tooltips, Tabellenfassung der
  Daten, Berücksichtigung von `prefers-reduced-motion`.
- Bei deutlich grösseren Datenmengen (mehrere hundert Knoten) sollte die
  Beschriftungsdichte überprüft werden; heute werden alle Namen dauerhaft
  angezeigt.

---

Markus Lysser - souveraene-schweiz.ch
