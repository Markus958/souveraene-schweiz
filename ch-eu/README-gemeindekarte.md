# CH–EU-Gemeindekarte

Neue, **vorerst unverlinkte** Analyse-Seite: `ch-eu/gemeindekarte.html`
(Branch `feature/gemeinde-steuerrechner-ch-eu`, `<meta robots=noindex>`).

Sie zeigt für alle Schweizer Gemeinden den **rechnerischen CH–EU-Gemeindeanteil pro Einwohner**
als Choropleth, je Szenario. **Modellrechnung**, keine individuelle Steuerprognose.

## Angelegte / geänderte Dateien

| Datei | Art | Inhalt |
|---|---|---|
| `ch-eu/gemeindekarte.html` | **neu** | Die Kartenseite (Inline-SVG-Choropleth, Site-Grundgerüst). |
| `assets/data/gemeinden-geo.json` | **neu** | Vereinfachte Gemeinde-Geometrie (SVG-Pfade je BFS-Nr.), lokal eingebettet. ~800 KB. |
| `ch-eu/gemeinde-steuerrechner.html` | **geändert** | Liest neu `?gemeinde`/`?szenario` (Vorauswahl) und zeigt einen Rücklink zur Karte. Rechenlogik unverändert. |

**Keine bestehende Seite ersetzt.** Navigation, Header, Footer, Startseite, Dossier, Glossar,
Routing, Kostenrechner und Datumsanzeigen bleiben unverändert. Die bestehende Kantonskarte
(`karten/schweiz.html`) wurde **nicht** verändert.

## Bestehende Karte geprüft (wie verlangt)

`karten/schweiz.html` ist eine **Kantons**-Karte auf Basis von **Leaflet (CDN)**, **topojson-client
(CDN)**, **CARTO-Kartenkacheln** und externer Kantons-Geometrie. Für eine **Gemeinde-Choropleth**
ungeeignet (falsche Aggregationsebene) und mit externen Abhängigkeiten/Tile-API, die der
Site-Philosophie (kein Framework, keine externen Libs) widersprechen.
**Entscheid (mit Nutzer abgestimmt):** self-contained Inline-SVG mit lokal eingebetteter,
vereinfachter Gemeinde-Geometrie — keine externen Runtime-Abhängigkeiten. Die bestehende Karte
bleibt unangetastet.

## Funktion

- **Inline-SVG-Choropleth** (2369 Gemeindeflächen), eingefärbt nach **CH–EU-Anteil pro Einwohner**.
- **Szenario-Umschalter** (konservativ / mittel / hoch), Default **mittel** — aktualisiert Werte und Legende.
- **5 Farbstufen** als **Quintile** (je ~20 % der Gemeinden), je Szenario berechnet. Palette: Grau→Rot der Website.
- **Hover-Tooltip**: Gemeinde + Kanton, Anteil pro Einwohner, Gemeindeanteil total, steuerbares Einkommen privat, Einwohner.
- **Klick → Detailpanel**: Gemeinde/Kanton, Szenario, Einwohner, steuerbares Einkommen (total & pro Einwohner),
  Gemeindeanteil total, Anteil pro Einwohner, Modellrechnungs-Hinweis, Button **„Im Gemeinde-Steuerrechner verwenden"**.
- **Methodik-Hinweis** sichtbar; **Methodik-und-Grenzen-Akkordeon**; **km-tip**-Tooltips in definierter Reihenfolge.
- **Mobile/Touch:** SVG skaliert (viewBox), Detailpanel unter der Karte; Tap = Auswahl → Detailpanel (Hover-Infos auch ohne Maus zugänglich).

## Berechnung (keine Steuerrechnung)

- `rechnerischer CH–EU-Gemeindeanteil total` = Szenario-Total × (steuerbares Einkommen privat der Gemeinde / 296'578 Mio. CHF CH-Total). Gleiche Verteilungslogik wie der Kostenrechner.
- `CH–EU-Anteil pro Einwohner` = Gemeindeanteil total / Einwohnerzahl.
- **Quintile pro Szenario.** Da der Anteil pro Einwohner proportional zum steuerbaren Einkommen pro Einwohner ist, bleibt die **Gruppen-Einteilung über die Szenarien gleich**; nur die absoluten Frankenwerte (Legende/Tooltip/Detail) ändern sich.

## Verlinkung Karte ↔ Gemeinde-Steuerrechner

- **Karte → Rechner:** Button im Detailpanel öffnet `gemeinde-steuerrechner.html?gemeinde=<bfs_nr>&szenario=<konservativ|mittel|hoch>`.
- **Rechner liest** `?gemeinde=<bfs_nr>` (Vorauswahl der Gemeinde via stabile BFS-Nummer) und `?szenario` (setzt den Szenario-Tab).
- **Rechner → Karte:** Rücklink „Gemeinde auf der CH–EU-Karte anzeigen" → `gemeindekarte.html?gemeinde=<bfs_nr>` (Karte selektiert die Gemeinde, öffnet Detailpanel).
- **URL-Parameter:** `gemeinde` = **BFS-Nummer** (stabile ID, kein Name), `szenario` = `konservativ|mittel|hoch`.

## Tests (durchgeführt)

- Node-Logiktest (`steuerdaten/raw/_node_test_karte.js`, Workspace, nicht committet): Quintil-Verteilung
  [427,426,426,426,426] (je ~20 %), 5 Stufen, 3 Szenarien, Zürich 563 CHF/Einw. plausibel,
  Klassen szenario-invariant (erwartet), 98,1 % Geometrie-Abdeckung. JS-Syntax beider Seiten 0 Fehler.
- Link-Formate beider Richtungen geprüft; Steuerrechner-Logiktest weiterhin „ALLE TESTS BESTANDEN".

## Methodisch / datenmässig / performance offen

- **Geometrie-Abdeckung 98,1 %:** 40 Daten-Gemeinden (~2,5 % der Bevölkerung) ohne deckungsgleiche
  Geometrie (jüngere Fusionen) → bleiben ohne Einfärbung (Legende „keine Daten"). 278 alte Flächen
  ohne Daten (vor Fusion) ebenfalls neutral.
- **Performance:** ~2369 SVG-Pfade; Geometrie ~800 KB (gzip ~220 KB), einmalig lokal geladen,
  keine externen Abhängigkeiten/Tiles. Auf sehr alten Geräten könnte die SVG-Interaktion träge sein.
- **Quintil-Invarianz:** Einfärbung ändert sich beim Szenariowechsel bewusst nicht (nur Werte) —
  mathematisch korrekt, in der Methodik erläutert.

## Datenquellen

ESTV (Verteilbasis: direkte Bundessteuer NP, Steuerperiode 2022), BFS STATPOP (Einwohner 2024),
Gemeinde-Geometrie mikpan/ch-maps (vereinfacht, lokal eingebettet). Build-Schritt:
`steuerdaten/raw/_build_geo.py` (Workspace, nicht committet).
