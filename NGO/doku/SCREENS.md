# NGO-Netzwerk: was die beiden Seiten zeigen

Kurzbeschreibung zur Übergabe an ein anderes Modell. Stand: Handoff-Paket
NGO-CC-2026-08-25-r1, Datenstand 25.08.2026, Branch `NGO-Netzwerk`. Es sind
inzwischen **drei** Seiten: zwei Cockpit-Fassungen und die Netzwerkseite. Alle
drei sind interne Vorschau: `noindex, nofollow`, nicht verlinkt, ohne
Zugriffsschutz.

## Gemeinsame Grundlage

Alle Seiten laden **dieselbe** Datei `assets/ngo/ngo-netzwerk.json` über
**dieselbe** Datenschicht `assets/ngo/ngo-netz-daten.js`. Die Zahlen können
deshalb nicht auseinanderlaufen. Kein Build, kein Framework, kein npm für die
Seiten selbst; d3-force liegt lokal gebündelt bei.

Der Bestand: 2852 Schweizer Masterorganisationen, 3143 Personen (davon 3127 mit
aktueller Beziehung und 16 nur in der Historie; 212 haben eine zweite
Schreibweise), 6779 erfasste Beziehungen Person→Organisation, davon 5998 im
Kernnetz, 594 belegende Quellen, 64 Cluster, 415 Brückenpersonen, 623
Organisationen ohne jede erfasste Beziehung.

**Identität ist ID-basiert.** Schlüssel einer Person ist `person_id`, nie der
Name; gleichnamige Personen bleiben getrennt. Zusammengeführt wird nur, was die
Lieferung als Schreibvariante ausweist.

**Der Beleg ist Pflicht.** Jede sichtbare Beziehung löst über `edge_sources.csv`
auf eine Registerquelle auf. 29 Registerzeilen sind rekonstruiert: Für sie ist
die Organisationswebsite bekannt, nicht die genaue Fundstelle — die Seite gibt
sie deshalb nicht als Belegstelle aus.

**Zwei Gruppierungen, die nichts miteinander zu tun haben.** Die **Kategorie**
(`category_id`, 17 Werte, lückenlos für alle 2852 Organisationen) ist die
verbindliche fachliche Einordnung: Sie sagt, *worum* es einer Organisation geht.
Sie trägt jede Auswertung, jeden Filter und jede Farbe. Der **Cluster**
(`cluster_id`, 64 Werte) ist eine reine Netzwerkeigenschaft: Er sagt, *mit wem*
eine Organisation im erfassten Netz eng verbunden ist. Die frühere
**Obergruppe** ist Legacy — nur für 370 Organisationen erfasst, deshalb nur noch
ein Stammdatum in der Detailspalte und nirgends sonst.

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
interaktive Grafik. Kopfzeile: «Datenstand 25.08.2026, Version
NGO-CC-2026-08-25-r1».

### Kennzahlenzeile (5 Kacheln)

Zahl und Beschriftung in einer Zeile, darunter ein Zusatz von höchstens zwei
Zeilen:

| Zahl | Beschriftung | Zusatz |
|---|---|---|
| 2852 | Organisationen | untersuchter Bestand |
| 3127 | Personen | nach Zusammenführung der Schreibvarianten |
| 6779 | Beziehungen | 5998 davon im Kernnetz |
| 415 | Brückenpersonen | bei mehreren Organisationen erfasst |
| Ø 7,9 | Organisationen | je Brückenperson |

### Sechs Karten in einem Sechs-Spalten-Raster

**Reihe 1 — drei Karten zu je zwei Spalten:**

1. **Verteilung nach Kategorie** — waagrechte Balken, **alle 17 einzeln**:
   Unternehmen & Dienstleistungen 358, Politik & Staat 348, Gesundheit &
   Soziales 316, Vereine & lokale Organisationen 235, Kultur/Medien/Sport 199,
   Umwelt/Klima/Energie 191, Wirtschaft & Arbeitswelt 178 … bis «Übrige /
   Prüfung offen» 34. Diese Karte ist von der Fünf-Zeilen-Regel ausgenommen:
   Eine Sammelzeile wäre mit 1595 von 2852 grösser als alles Gezeigte zusammen.
   Jede Zeile verlinkt nach `./?kategorie=<category_id>`; der Titel trägt den
   vollen Namen, weil lange Labels im Balken abgeschnitten werden. Die Summe
   ergibt den Gesamtbestand.
2. **Verteilung nach Art der Beziehung** — N1 4469, N2 854, N3 675, N4 781,
   Summe 6779. Nicht verlinkt.
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
5. **Parteiangaben erfasster Personen** — Kopfzeile «329 der 3127 erfassten
   Personen tragen eine Parteiangabe. Sie sind bei 151 Organisationen
   erfasst.», darunter Balken für die acht häufigsten Parteien (SP 82, SVP 61,
   Die Mitte 52, FDP 48, Grüne 47, GLP 16, FDP.Die Liberalen 5, EVP 4).
   **Der Balken zählt Personen, nicht Organisationen.** Jede Partei verlinkt
   nach `./?ebene=organisation&partei=<name>&ansicht=G2&klassen=N1,N2,N3,N4`.
   Der Interpretationshinweis steht hinter dem i-Knopf neben der Überschrift.

**Reihe 3 — eine Karte über die volle Breite:**

6. **Die Cluster** — Kopfzeile «64 Cluster mit 641 Verbindungen zwischen
   ihnen», Erklärtext, darunter die vierspaltige Liste aller Cluster mit
   Nummer, Label und Mitgliederzahl (0. G2-Isolate / keine belegte Projektion
   623, 1. Netzwerkcluster 1 – Schweizer Tierschutz STS; VPOD 244,
   2. Netzwerkcluster 2 – Schweizerischer Gewerbeverband sgv 142 …). Ein
   Clusterbild gibt es hier nicht mehr: Bei 64 Kreisen mit 641 Linien wäre es
   ein Knäuel. Jeder Listeneintrag verlinkt nach `./?fokus=<id>`.

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
  Auswahlfelder Kategorie, Cluster, Parteiangabe, Personenschwelle (in der
  Personenperspektive) und Knotenfarbe (Cluster | Kategorie).
- **Brotkrumenzeile** mit der aktuellen Ebene, rechts «Gesamtnetz zeigen».

### Drei Ebenen — die Kernnavigation

| Ebene | Was im Bild steht | Knoten / Linien |
|---|---|---|
| 1 — Einstieg, alle Cluster | die 64 Cluster als Kreise | 64 / 641 |
| 2 — ein Cluster, `?fokus=<id>` | die Organisationen dieses Clusters, Verbindungen nach aussen als Anschlussstummel | z. B. Cluster 1: 244 Organisationen |
| 3 — Gesamtnetz, `?ebene=organisation` | alle Organisationen | 2492 / 13 123 (G3) |

Auf Ebene 1 steht eine Linie für die **Zahl der verbundenen
Organisationspaare**, nicht für eine Beziehung zwischen den Clustern selbst.
Ein Klick auf einen Cluster öffnet Ebene 2.

**Knotenfarbe.** Zwei Modi: «Cluster» trägt die Clusterziffer im Knoten und hebt
nur den gewählten Cluster farbig hervor; «Kategorie» färbt nach `category_id`.
Gefärbt sind dabei **sieben** Kategorien — mehr Farbtöne lassen sich nicht für
jedes Paar sicher unterscheiden, auch nicht bei normalem Sehen. Geprüft ist
gegen Helligkeitsband, Chroma, Kontrast ≥ 3:1 und jedes Paar unter Protanopie,
Deuteranopie und Tritanopie (ΔE ≥ 8; schwächstes Paar 9,2). Die übrigen zehn
Kategorien bleiben neutral und stehen als **eine** Legendenzeile «übrige
Kategorien (10)», deren Titel alle zehn nennt.

**Liste statt Bild, wenn ein Bild nicht mehr trägt.** Seit der Bestand von 342
auf 2852 Organisationen gewachsen ist, gibt es keine Gradschwelle mehr, bei der
das Gesamtnetz lesbar bleibt — die Dichte liegt bei jedem Schnitt zwischen 5
und 11 Linien je Knoten. Die Seite entscheidet deshalb je Ansicht:

| Bedingung | Folge |
|---|---|
| Knoten ≤ 300 **und** Linien ≤ 900 **und** (Knoten ≤ 40 **oder** Linien/Knoten < 4) | Grafik |
| sonst | benannte, sortierte Liste mit denselben Klickwegen |

Aus der Liste führt jeder Klick in ein Bild: ein Cluster in seinen Inhalt, eine
Person in ihren Fokus, eine Organisation in ihren Stern.

Die Ausnahme «Knoten ≤ 40» gibt es, weil die Nachbarschaft eines Hubs fast
immer eine Clique ist (14 Knoten, 76 Linien) und dort ein Bild trotz hoher
Dichte noch lesbar ist. Aus der Liste heraus funktionieren Auswahl und
Detailspalte genauso wie aus der Grafik.

### Zwei Perspektiven und zwei Sonderansichten

- **Organisationen** (Standard): Knoten = Organisationen, Linien = Projektionen
  über gemeinsame Personen oder direkt erfasste Beziehungen. Knotengrösse =
  strukturelle Brückenfunktion, **kein Einflussmass**.
- **Personen**: zweiseitiges Netz aus Personen und ihren Organisationen. Nur
  Personen ab der eingestellten Schwelle (Standard: mindestens 2
  Organisationen). Es gibt bewusst keine berechneten Linien zwischen Personen.
- **Organisationsfokus** (`?org=<NGO-ID>`): eine Organisation in der Mitte, darum
  ihre direkten Verbindungen. Gezeichnet sind **nur** die Linien, die an ihr
  hängen — die Verbindungen der Nachbarn untereinander bleiben weg, sonst gäbe
  es wieder kein Bild (Gewerbeverband: 268 Knoten / 2784 Linien gegenüber 267
  als Stern). Das steht als Hinweis über der Grafik, zusammen mit dem Rückweg.
  Ein Klick auf einen Listeneintrag öffnet diesen Fokus; der Knopf oben in der
  Detailspalte ebenso.
- **Personenfokus** (`?person=<index>`): eine Person mit ihren Organisationen
  allein. Blendet der Filter weitere aus, steht das über der Grafik mit Zahl,
  Gesamtzahl und Knopf «alle Beziehungen zeigen».
- **Historie** (`?historie=1`): ausschliesslich frühere Beziehungen (97), nie
  zusammen mit den aktuellen. 16 Personen kommen **nur** dort vor; die
  Lieferung kennzeichnet sie mit `person_status = historical_only_g4`.

### Verhalten bei Auswahl

Ein Klick auf eine Organisation **räumt das Bild frei**: Nur sie und die mit
ihr verbundenen Organisationen bleiben stehen, alle übrigen werden
ausgeblendet. Die Auswahl wird rot gefüllt (`#c8102e`), ihre Nachbarn
dunkelblau (`#3c5f86`). Eine Kachel über der Grafik nennt beide Zahlen und
trägt «Auswahl aufheben»; ein Klick auf die freie Fläche tut dasselbe. Nicht
angewendet auf der Clusterebene (dort ist der Klick Navigation) und nicht bei
einer Auswahl ohne Verbindung.

Knoten ohne gezeichnete Linie nehmen nicht an der Kraftsimulation teil; sie
stehen alphabetisch in einem Raster unter dem Netz.

### Detailspalte rechts

Bei gewählter Organisation: Stammdaten, Cluster, Kennzahlen, Historie (G4),
erfasste Personen, Verbindungen zu anderen Organisationen, Parteiangaben
erfasster Personen, Quellen. **Die ausführlichen Profilfelder (Zweck,
Rechtsform, Gründungsjahr, Mitgliederzahl, ZEWO) fehlen seit dem Handoff-Paket**
— die frühere `ngo_stammdaten.csv` liegt ihm nicht mehr bei, und ein Profil aus
einer älteren Lieferung wäre eine Angabe ohne Beleg. Bei gewählter Person: erfasste Schreibvarianten,
technische Kennungen, Parteiangaben, erfasste Organisationen, Quellen.

### Unter der Grafik

Statuszeile (nur für Screenreader), Legenden (Linienarten, je nach Ansicht
Cluster- oder Personenlegende, Kategorienfarben), Methodikblock, dann sechs
aufklappbare Tabellen:

1. Organisationen (2852 Zeilen) — Name, Kategorie, Cluster, Beziehungen,
   Personen, Brückenpersonen, Hinweis
2. Alle erfassten Beziehungen (6779) — Organisation, Person, Rolle, Klasse,
   Partei, Beleg, Güte
3. Quellenverzeichnis (594) — Herausgeber/Autor, Titel, Quellentyp, Rang,
   Güte, Datum, Abgerufen, Kennung
4. Alle erfassten Personen (3143, sortierbar) — inklusive der Personen mit nur
   einer Organisation, die in der Grafik nicht erscheinen
5. Zusammengeführte Namensvarianten (212 Gruppen)
6. «623 Organisationen ohne erfasste Beziehung» — Name, Kategorie,
   Unterkategorie, Sitz

**Organisationsnamen in Tabelle 1 und 6 sind anklickbar** und wählen die
Organisation in der Grafik an; steht sie dort nicht (Clusterebene,
Personenfokus), wechselt der Klick zuerst aufs Gesamtnetz.

### Erklärfenster

Der Knopf «Bedienung und Begriffe» öffnet ein Dialogfenster mit 16 Begriffen:
Perspektive, Masterorganisation, Kernnetz, Beziehungsklasse, Historie,
Kategorie, Unterkategorie, Obergruppe (Legacy), Cluster, Brückenperson, Brückenfunktion,
Abdeckungslücke, Kanonisierung, direkt erfasst, Beleg, Quellenrang, Güte.

### URL-Zustand

Der komplette Zustand ist teilbar: `ebene`, `fokus`, `person`, `perspektive`,
`schwelle`, `ansicht`, `klassen`, `obergruppe`, `cluster`, `partei`, `farbe`,
`luecken`, `verbunden`, `knoten`, `suche`.

---

## Seite 3 — Cockpit v2: `/ngo/cockpit-v2.html`

Zweite, aufgeräumte Fassung desselben Cockpits. Sie ersetzt Seite 1 **nicht**:
Beide liegen nebeneinander, damit sich vergleichen lässt, welche Fassung
trägt. Ein Umschalter oben führt von der einen zur anderen. Dieselben Daten,
dieselbe Datenschicht — die Zahlen sind identisch.

Was sie anders macht:

- **Kopf mit Suche und Filterknopf.** Suchfeld für Organisation oder Person mit
  Trefferliste; die Treffer führen in die passende Ansicht der Netzwerkseite.
- **Fünf KPI-Karten**, vier davon sind Schalter: Ein Klick setzt den passenden
  Filter, statt nur eine Zahl zu zeigen.
- **Filterleiste** mit Kategorie, Partei der Person, Sitz (Kanton),
  Clustergrösse, Art der Beziehung (N1–N4), «nur Kernnetz» und «nur
  Brückenpersonen». Gesetzte Filter erscheinen als **abwählbare Chips**; jede
  Karte rechnet sich neu und nennt ihre Grundgesamtheit in der Kopfzeile
  («6779 Beziehungen», «329 von 3127 mit Angabe»).
- **Zwei Spalten 40/60** statt eines Sechs-Spalten-Rasters.
- **Treemap statt Ringgrafik** für die Cluster: Fläche = Mitgliederzahl,
  squarified nach Bruls/Huizing/van Wijk, eigen ausgeschrieben — für ein
  Dutzend Rechtecke lohnt keine Bibliothek. Ein Knopf klappt die vollständige
  Clusterliste auf.
- **Ranglisten mit sieben statt fünf Einträgen**, Parteiangabe als Chip.
- **Transparenzhinweis einklappbar** am Fuss, dazu dieselben vier
  Einstiegskacheln in die Netzwerkseite.

Die Filter der Fassung v2 werden **nicht** in die Netzwerkseite übernommen:
Deren Filter hat eigene Regeln (Projektion, Ebenen, Darstellungsgrenze), und
ein halb übertragener Zustand wäre schlimmer als keiner.

---

## Was die Seiten voneinander trennt

Das Cockpit beantwortet «was steckt im Bestand» in Zahlen und Ranglisten und
ist der Einstieg. Die Netzwerkseite beantwortet «wer hängt mit wem zusammen»
und ist das Werkzeug. Jede Rangliste im Cockpit verlinkt in die passende
Ansicht der Netzwerkseite; die Netzwerkseite hat oben einen Rückweg. Was auf
mehreren Seiten stünde, steht bewusst nur auf einer: Kennzahlenzeile und
Clusteraufzählung nur im Cockpit, die Tabellen und der
Abdeckungslücken-Abschnitt nur auf der Netzwerkseite.

Cockpit v1 und v2 zeigen denselben Inhalt in zwei Anordnungen. v1 ist statisch
und vollständig, v2 filterbar und knapper. Welche bleibt, ist noch offen.
