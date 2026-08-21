# NGO-Netzwerk: was die beiden Seiten zeigen

Kurzbeschreibung zur Übergabe an ein anderes Modell. Stand: Datenpaket 3.7.49,
Datenstand 19.08.2026, Branch `NGO-Netzwerk`. Beide Seiten sind interne
Vorschau: `noindex, nofollow`, nicht verlinkt, ohne Zugriffsschutz.

## Gemeinsame Grundlage

Beide Seiten laden **dieselbe** Datei `assets/ngo/ngo-netzwerk.json` über
**dieselbe** Datenschicht `assets/ngo/ngo-netz-daten.js`. Die Zahlen können
deshalb nicht auseinanderlaufen. Kein Build, kein Framework, kein npm für die
Seiten selbst; d3-force liegt lokal gebündelt bei.

Der Bestand: 342 Schweizer Masterorganisationen, 3061 Personen (aus 3192
Roheinträgen, 131 zusammengeführte Namensvarianten), 4347 erfasste Beziehungen
Person→Organisation, davon 4114 im Kernnetz, 591 Quellen, 20 Cluster, 294
Brückenpersonen, 117 Organisationen ohne jede erfasste Beziehung.

**Vier Beziehungsklassen:** N1 Organ- oder Leitungsfunktion, N2 Gremium oder
Mitgliedschaft, N3 Allianz oder Dachverband, N4 weitere erfasste Beziehung.
«Kernnetz» (G3) = N1–N3, «erweitert» (G2) = zusätzlich N4. G4 = frühere
Beziehungen, strikt getrennt geführt.

**Was eine Linie zwischen zwei Organisationen bedeutet:** dieselbe Person ist
bei beiden in einer erfassten Beziehung aufgeführt («über gemeinsam erfasste
Personen»), oder zwischen den beiden wurde eine Beziehung direkt erfasst
(«direkt erfasste Beziehung»). Beide Fälle sind in der Darstellung
unterschieden.

**Interpretationsgrenzen**, die auf beiden Seiten im Text stehen: Alle Zahlen
sind Auszählungen des erfassten Bestands. Ein hoher Wert kann auch heissen,
dass hier gründlicher recherchiert wurde. Cluster sind rechnerische Gruppen,
keine Akteure. Parteiangaben gehören zu einzelnen Personen; aus ihnen lässt
sich keine Parteizugehörigkeit einer Organisation ableiten. Organisationen ohne
erfasste Beziehung sind eine Abdeckungslücke der Erhebung, kein Nachweis
fehlender Vernetzung. Die Knotengrösse zeigt strukturelle Brückenfunktion
(Netzwerkzentralität), nicht Einfluss oder Legitimität.

---

## Seite 1 — Cockpit: `/ngo/cockpit.html`

Titel «NGO-Netzwerk Schweiz — Überblick». Statische Auswertung, keine
interaktive Grafik. Kopfzeile: «Datenstand 19.08.2026, Version 3.7.49».

### Kennzahlenzeile (5 Kacheln)

Zahl und Beschriftung in einer Zeile, darunter ein Zusatz von höchstens zwei
Zeilen:

| Zahl | Beschriftung | Zusatz |
|---|---|---|
| 342 | Organisationen | untersuchter Bestand |
| 3061 | Personen | nach Zusammenführung der Schreibvarianten |
| 4347 | Beziehungen | 4114 davon im Kernnetz |
| 294 | Brückenpersonen | bei mehreren Organisationen erfasst |
| Ø 2,6 | Organisationen | je Brückenperson |

### Sechs Karten in einem Sechs-Spalten-Raster

**Reihe 1 — drei Karten zu je zwei Spalten:**

1. **Verteilung nach Obergruppe** — waagrechte Balken, höchstens fünf Zeilen:
   Gemeinnützige und zivilgesellschaftliche NGOs 145, Politische und
   gesellschaftliche Interessenorganisationen 96, Wirtschafts- und
   Berufsverbände 95, ohne Zuordnung 4, «Übrige Obergruppen» 2. Jede benannte
   Zeile ist ein Link nach `./?obergruppe=<name>`. Die Sammelzeile ist kein
   Link, nennt ihre Bestandteile aber im Tooltip. Die Summe ergibt immer den
   Gesamtbestand — deshalb wird gebündelt statt abgeschnitten.
2. **Verteilung nach Art der Beziehung** — N1 3247, N2 573, N3 294, N4 233,
   Summe 4347. Nicht verlinkt.
3. **Personen mit den meisten Organisationen** — Rangliste der ersten fünf, mit
   Parteiangabe als Chip hinter dem Namen (mehrere Angaben werden alle
   gezeigt; kein Chip heisst «nicht erfasst», nicht «parteilos»). Jeder Name
   verlinkt nach `./?person=<index>&ansicht=G2&klassen=N1,N2,N3,N4` — die
   erweiterte Ansicht muss mit, sonst zeigt der Personenfokus weniger
   Organisationen, als die Rangliste zählt. Darunter «Personenperspektive
   öffnen →».

**Reihe 2 — zwei Karten zu je drei Spalten:**

4. **Organisationen mit den meisten erfassten Personen** — Rangliste der ersten
   zehn (SRK 75, Proviande 64, LITRA 49, Herzstiftung 44, Avenir Suisse 42 …).
   Jeder Name verlinkt nach `./?ebene=organisation&knoten=<NGO-ID>`.
5. **Parteiangaben erfasster Personen** — Kopfzeile «328 der 3061 erfassten
   Personen tragen eine Parteiangabe. Sie sind bei 148 Organisationen
   erfasst.», darunter Balken für die acht häufigsten Parteien (SP 82, SVP 60,
   Die Mitte 52, FDP 48, Grüne 47, GLP 16, FDP.Die Liberalen 5, EVP 4).
   **Der Balken zählt Personen, nicht Organisationen.** Jede Partei verlinkt
   nach `./?ebene=organisation&partei=<name>&ansicht=G2&klassen=N1,N2,N3,N4`.
   Der Interpretationshinweis steht hinter dem i-Knopf neben der Überschrift.

**Reihe 3 — eine Karte über die volle Breite:**

6. **Die zwanzig Cluster** — statische SVG-Vorschau (Kreise im Ring, Grösse
   nach Mitgliederzahl, Linienstärke nach Zahl der verbundenen
   Organisationspaare), daneben Erklärtext, darunter eine vierspaltige Liste
   aller zwanzig Cluster mit Nummer, Label und Mitgliederzahl (1. Verkehr /
   Umwelt / Energie 36, 2. Umwelt / Arbeit / gesellschaftliche Grossnetzwerke
   35, 3. Wirtschaft / KMU / Sicherheit / Eigentum 30 …). Kreise **und**
   Listeneinträge verlinken nach `./?fokus=<id>`.

### Fuss

Vier Einstiegskacheln: «Interaktives Netzwerk» (`./`), «Personen und
Mehrfachmandate» (`./?perspektive=person`), «Frühere Beziehungen»
(`./?ebene=organisation&historie=1`), «Abdeckungslücken»
(`./?ebene=organisation&luecken=1`). Darunter ein Methodikblock «Was diese
Seite zeigt und was nicht».

---

## Seite 2 — Netzwerk: `/ngo/`

Titel «Netzwerk erfasster Organisationsbeziehungen». Interaktive Kraftgrafik.
Ganz oben ein Rückweg «← Zurück zum Cockpit». Keine Kennzahlenzeile — die steht
nur im Cockpit.

### Bedienleiste (immer sichtbar)

- **Suchfeld** für Organisation oder Person mit Trefferliste («12 von N
  Treffern»). Ein Treffer auf eine Person öffnet den Personenfokus.
- **Perspektive**: Organisationen | Personen
- **Netzumfang**: Kernnetz N1–N3 | Erweitert mit N4
- **Zurücksetzen**, **Vollbild**
- Aufklappbarer Block **«Filter und Darstellung»**: Beziehungsart (vier
  Kästchen N1–N4, N4 nur in G2 aktiv), «frühere Beziehungen getrennt zeigen
  (G4)», «nur Abdeckungslücken», «nur Organisationen mit Verbindung», dazu
  Auswahlfelder Obergruppe, Cluster, Parteiangabe, Personenschwelle (in der
  Personenperspektive) und Knotenfarbe (Cluster | Obergruppe).
- **Brotkrumenzeile** mit der aktuellen Ebene, rechts «Gesamtnetz zeigen».

### Drei Ebenen — die Kernnavigation

| Ebene | Was im Bild steht | Knoten / Linien |
|---|---|---|
| 1 — Einstieg, alle Cluster | die 20 Cluster als Kreise | 20 / 29 |
| 2 — ein Cluster, `?fokus=<id>` | die Organisationen dieses Clusters, Verbindungen nach aussen als Anschlussstummel | z. B. 36 + 7 / 92 |
| 3 — Gesamtnetz, `?ebene=organisation` | alle Organisationen | 342 / 498 |

Auf Ebene 1 steht eine Linie für die **Zahl der verbundenen
Organisationspaare**, nicht für eine Beziehung zwischen den Clustern selbst.
Ein Klick auf einen Cluster öffnet Ebene 2.

### Zwei Perspektiven und zwei Sonderansichten

- **Organisationen** (Standard): Knoten = Organisationen, Linien = Projektionen
  über gemeinsame Personen oder direkt erfasste Beziehungen. Knotengrösse =
  strukturelle Brückenfunktion, **kein Einflussmass**.
- **Personen**: zweiseitiges Netz aus Personen und ihren Organisationen. Nur
  Personen ab der eingestellten Schwelle (Standard: mindestens 2
  Organisationen). Es gibt bewusst keine berechneten Linien zwischen Personen.
- **Personenfokus** (`?person=<index>`): eine Person mit ihren Organisationen
  allein. Blendet der Filter weitere aus, steht das über der Grafik mit Zahl,
  Gesamtzahl und Knopf «alle Beziehungen zeigen».
- **Historie** (`?historie=1`): ausschliesslich frühere Beziehungen (97), nie
  zusammen mit den aktuellen.

### Verhalten bei Auswahl

Ein Klick auf eine Organisation **räumt das Bild frei**: Nur sie und die mit
ihr verbundenen Organisationen bleiben stehen (bei LITRA 31 von 342, 308
ausgeblendet). Die Auswahl wird rot gefüllt (`#c8102e`), ihre Nachbarn
dunkelblau (`#3c5f86`). Eine Kachel über der Grafik nennt beide Zahlen und
trägt «Auswahl aufheben»; ein Klick auf die freie Fläche tut dasselbe. Nicht
angewendet auf der Clusterebene (dort ist der Klick Navigation) und nicht bei
einer Auswahl ohne Verbindung.

Knoten ohne gezeichnete Linie nehmen nicht an der Kraftsimulation teil; sie
stehen alphabetisch in einem Raster unter dem Netz.

### Detailspalte rechts

Bei gewählter Organisation: Stammdaten, Cluster, Kennzahlen, Historie (G4),
erfasste Personen, Verbindungen zu anderen Organisationen, Parteiangaben
erfasster Personen, Quellen. Bei gewählter Person: erfasste Schreibvarianten,
technische Kennungen, Parteiangaben, erfasste Organisationen, Quellen.

### Unter der Grafik

Statuszeile (nur für Screenreader), Legenden (Linienarten, je nach Ansicht
Cluster- oder Personenlegende, Obergruppenfarben), Methodikblock, dann sechs
aufklappbare Tabellen:

1. Organisationen (342 Zeilen) — Name, Obergruppe, Cluster, Beziehungen,
   Personen, Brückenpersonen, Hinweis
2. Alle erfassten Beziehungen (4347) — Organisation, Person, Rolle, Klasse,
   Partei, Beleg, Güte
3. Quellenverzeichnis (591) — Herausgeber/Autor, Titel, Quellentyp, Rang,
   Güte, Datum, Abgerufen, Kennung
4. Alle erfassten Personen (3061, sortierbar) — inklusive der Personen mit nur
   einer Organisation, die in der Grafik nicht erscheinen
5. Zusammengeführte Namensvarianten (131 Gruppen)
6. «117 Organisationen ohne erfasste Beziehung» — Name, Obergruppe,
   Hauptkategorie, Sitz

**Organisationsnamen in Tabelle 1 und 6 sind anklickbar** und wählen die
Organisation in der Grafik an; steht sie dort nicht (Clusterebene,
Personenfokus), wechselt der Klick zuerst aufs Gesamtnetz.

### Erklärfenster

Der Knopf «Bedienung und Begriffe» öffnet ein Dialogfenster mit 16 Begriffen:
Perspektive, Masterorganisation, Kernnetz, Beziehungsklasse, Historie,
Obergruppe, Hauptkategorie, Cluster, Brückenperson, Brückenfunktion,
Abdeckungslücke, Kanonisierung, direkt erfasst, Beleg, Quellenrang, Güte.

### URL-Zustand

Der komplette Zustand ist teilbar: `ebene`, `fokus`, `person`, `perspektive`,
`schwelle`, `ansicht`, `klassen`, `obergruppe`, `cluster`, `partei`, `farbe`,
`luecken`, `verbunden`, `knoten`, `suche`.

---

## Was die beiden Seiten voneinander trennt

Das Cockpit beantwortet «was steckt im Bestand» in Zahlen und Ranglisten und
ist der Einstieg. Die Netzwerkseite beantwortet «wer hängt mit wem zusammen»
und ist das Werkzeug. Jede Rangliste im Cockpit verlinkt in die passende
Ansicht der Netzwerkseite; die Netzwerkseite hat oben einen Rückweg. Was auf
beiden Seiten stünde, steht bewusst nur auf einer: Kennzahlenzeile und
Clusteraufzählung nur im Cockpit, die Tabellen und der
Abdeckungslücken-Abschnitt nur auf der Netzwerkseite.
