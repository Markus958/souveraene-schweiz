# NGO-Netzwerk — Vorschau

Interaktive Darstellung der im NGO-Datenbestand erfassten Beziehungen zwischen
Schweizer Organisationen. Die Seite ist **nicht verlinkt** und auf
`noindex, nofollow` gesetzt.

Aufruf: **`/ngo/`**

Die alte Adresse `/netzwerk-verflechtungen-vorschau.html` leitet weiter. Die
Weiterleitung ist ein Übergang und kann entfernt werden, sobald sie niemand
mehr aufruft.

Der Zustand steht in der URL und ist teilbar, zum Beispiel
`/ngo/?ansicht=G2&cluster=27&knoten=NGO-0031`.

> **Kein Zugriffsschutz.** Die Seite liegt im Repository und ist damit
> öffentlich erreichbar. `noindex` hält nur Suchmaschinen ab; wer die Adresse
> kennt, sieht alles. Der eigentliche Schutz liegt darin, dass ausschliesslich
> die aufbereitete Fassung der Daten ausgeliefert wird (siehe Abschnitt 2).

Datengrundlage: **NGO_Datenbank_Master 3.7.1 – AP32 abgeschlossen**,
Datenstand 16.08.2026, 144 Masterorganisationen, 2628 aktuelle Beziehungen,
1852 Rohpersonen.

---

## 1. Dateien

**Seite und Laufzeit** (versioniert, öffentlich):

| Datei | Zweck |
|---|---|
| `ngo/index.html` | Vorschauseite |
| `netzwerk-verflechtungen-vorschau.html` | Weiterleitung auf `/ngo/`, als Übergang |
| `assets/ngo/ngo-netz-daten.js` | Kanonisierung, Projektion, Filter, Suche (ohne DOM) |
| `assets/ngo/ngo-netz-ansicht.js` | Layout, Zeichnung, Zoom, Auswahl, Mobilverhalten |
| `assets/ngo/ngo-netz-seite.js` | Verdrahtung, Detailspalte, URL-Zustand, Tabellen |
| `assets/ngo/ngo-netz.css` | Styles der Seite (selbsttragend, bindet `ngo.css` nicht ein) |
| `assets/ngo/ngo-netzwerk.json` | Datengrundlage der Seite (739 KB, gzip rund 180 KB) |
| `assets/vendor/d3-force-bundle.min.js` | Layout-Bibliothek, lokal gebündelt (17 KB) |
| `assets/netzwerk/netzwerk.css` | gemeinsames Layout der Netzseiten |
| `assets/netzwerk/tailwind-seite.min.css` | Tailwind-Produktionsbuild (7,8 KB) |
| `assets/schriften.css`, `assets/fonts/` | lokal eingebundene Schriften (113 KB) |

**Teilprojekt** (`NGO/`, siehe `NGO/README.md`):

| Datei | Zweck |
|---|---|
| `NGO/daten/` | interne Quelldaten — **nicht versioniert**, nie veröffentlicht |
| `NGO/doku/CLAUDE_CODE_AUFTRAG.md` | Auftrag zu diesem Umbau |
| `NGO/build/erzeuge_netzwerk_json.py` | Build inklusive Abnahme, Nachrechnung des AP29-Berichts und Quellenauflösung |
| `NGO/build/build_alles.py` | ruft den Build auf |

**Tests:** `scripts/test_ngo_netz.js` (52), `scripts/test_ngo_netz_seite.js` (61).

**Entfernt** (alles in der Git-Historie erreichbar):

- Führungsnetz mit 100 Organisationen: `assets/ngo/ngo-daten.js`,
  `ngo-ansicht.js`, `ngo-seite.js`, `ngo.css`, `ngo-fuehrungsnetz.json`,
  `ngo-redaktion.json`, `NGO/build/erzeuge_public_json.py`,
  `erzeuge_redaktion_json.py`, `verbindungstypen.json`, `scripts/test_ngo.js`,
  `scripts/test_ngo_seite.js`
- erste CSV-Grafik: `assets/netzwerk/netzwerk-daten.js`, `netzwerk-ansicht.js`,
  `netzwerk-seite.js`, `assets/data/netzwerk-verflechtungen.csv`,
  `netzwerk-verflechtungen-meta.json`, `scripts/test_netzwerk.js`

`assets/netzwerk/netzwerk.css` und `tailwind-seite.min.css` bleiben — sie
liefern weiterhin Layout und Grundstile dieser Seite.

---

## 2. Datenfluss

```
NGO/daten/ngo_nodes_organisation.csv     144 Masterorganisationen
NGO/daten/ngo_nodes_personen_raw.csv     1852 technische Rohpersonen
NGO/daten/ngo_edges_current.csv          2628 Beziehungen Organisation → Person
NGO/daten/ngo_clusters_analysis.csv      AP29-Bericht (Sollwerte der Abnahme)
NGO/daten/network_metadata.json          Kennzahlen, Abdeckungslücken
NGO/daten/ngo_edge_sources.csv           2807 Zuordnungen Beziehung → Quelle
NGO/daten/ngo_sources_web.csv            327 Quellen mit Herausgeber, Titel, URL
        │
        ├─ NGO/build/erzeuge_netzwerk_json.py
        │     Kanonisierung, Projektion G2/G3, Louvain, Abnahme
        ▼
NGO/ausgabe/ngo-netzwerk.json  →  assets/ngo/ngo-netzwerk.json  (committet)
```

Der Zwischenschritt ist nicht optional: Was die Seite per `fetch` lädt, kann
jede Besucherin herunterladen. Ein Filtern erst im Browser verbirgt nichts.

```
python NGO/build/erzeuge_netzwerk_json.py                # bauen und schreiben
python NGO/build/erzeuge_netzwerk_json.py --nur-pruefen  # nur nachrechnen
```

Die JSON ist verdichtet: wiederkehrende Texte (Rolle, Quelle, Güte, Status)
liegen einmal in `woerterbuecher`, die Kanten verweisen mit Indizes darauf;
Organisationen und Personen werden über ihre Position referenziert. Ohne diese
Verdichtung wäre die Datei über 1,4 MB statt 739 KB. Das Rollengewicht folgt
eindeutig aus der Beziehungsklasse (N1=4 … N4=1); der Build prüft das und bricht
ab, falls die Annahme einmal nicht mehr gilt.

---

## 3. Was die Seite aus den Daten rechnet

**Kanonisierung der Personennamen** (Auftrag Abschnitt 3): Unicode
normalisieren, klein schreiben, Interpunktion als Trenner, Whitespace
normalisieren, Tokens sortieren, identische Tokenlisten zusammenführen. Kein
Levenshtein-, Fuzzy- oder phonetisches Matching. Die Originalwerte
`person_display` und `target_person_id` bleiben an jeder Beziehung erhalten und
stehen in der Detailspalte.

Ergebnis: 1852 Rohpersonen → **1772 kanonische Personen, 80 Variantengruppen** —
genau die Zahl, die der Master unter `safe_variant_groups_found_in_AP29`
ausweist. Die Gruppen stehen als eigene Tabelle auf der Seite.

**Projektion auf Organisationen** (AP29): Über gemeinsam erfasste Personen zählt
je Person und Organisation das höchste Rollengewicht; das Kantengewicht ist
konservativ das kleinere der beiden. Direkte Master-zu-Master-Beziehungen kommen
zusätzlich hinzu und bleiben als solche gekennzeichnet.

Ergebnis G2: **286 Projektionskanten, Gesamtgewicht 1074** — deckungsgleich mit
dem AP29-Bericht, einschliesslich aller sechs Obergruppen-Paare und aller
Brückenorganisationen der Berichtstabelle.

**Cluster:** Das Datenpaket enthält *keine* Clusterzuordnung je Organisation,
sondern nur den AP29-Bericht mit neun Clusterprofilen. Der Build rechnet die
Louvain-Clusterung deshalb mit festem Startwert (`LOUVAIN_SEED = 5`) nach und
ordnet die Gemeinden den neun Clustern des Berichts zu. Stimmen Grösse,
Zusammensetzung, interne Kanten und internes Gewicht nicht exakt mit dem
Bericht überein, **bricht der Build ab und schreibt nichts**. Damit kann nie eine
stillschweigend andere Clusterung veröffentlicht werden als die dokumentierte.

Geprüft: alle neun Cluster exakt, alle 36 im Bericht genannten zentralen
Organisationen im erwarteten Cluster. Sieben Organisationen liegen in drei
Kleingemeinden, die der Bericht nicht als Hauptcluster führt; sie erscheinen als
«kein Hauptcluster».

---

## 4. Darstellung und Interpretationsschutz

- **Standardansicht** ist das Kernnetz G3 (N1–N3). N4 lässt sich nur über den
  Umschalter auf G2 zuschalten; in G3 bleibt das Kästchen gesperrt, auch wenn es
  vorher angehakt war.
- **Historie (G4)** ist ein eigener Modus. Das Datenpaket enthält historische
  Beziehungen nur als Zahl je Organisation (59 insgesamt), nicht als einzelne
  Beziehungen. Der Modus zeigt deshalb die Organisationen und ihre Zahl und legt
  nie etwas über die aktuellen Beziehungen.
- **Knotengrösse** ist die strukturelle Brückenfunktion (Zahl der Personen, die
  zu anderen Masterorganisationen führen), auf der Seite ausdrücklich als
  Netzwerkzentralität bezeichnet und nie als Einfluss. Das Wort
  «Einflussranking» kommt weder im Code noch auf der Seite vor; ein Test prüft das.
- **Verbindungsarten** sind unterscheidbar: über gemeinsam erfasste Personen
  durchgezogen, direkt erfasst gestrichelt.
- **Abdeckungslücken**: Die acht Organisationen ohne erfasste aktuelle Beziehung
  bleiben als Knoten sichtbar, rot gestrichelt und mit Hinweistext. Der Begriff
  «nicht vernetzt» wird nirgends verwendet.
- **Parteiangaben** gehören zu Personen. In der Organisationsansicht stehen sie
  unter «Parteiangaben erfasster Personen» mit dem Hinweis, dass daraus keine
  Parteizugehörigkeit der Organisation folgt.
- **Quellen** erscheinen als Karte mit Herausgeber, Titel, Quellentyp, Rang,
  Güte und Datum, dazu «Quelle öffnen», wenn eine URL vorliegt. Die interne
  Kennung steht nur im aufklappbaren Auditbereich und ist nie die einzige
  sichtbare Angabe. Ohne URL wird kein Link erfunden; eine nicht auffindbare
  Kennung erscheint als «Quellenangabe im Datenexport nicht gefunden».
- **Personen einer Organisation** werden nach Person gruppiert. Das Paket führt
  je Rolle und Quelle eine eigene Zeile; ungruppiert stünde dieselbe Person
  mehrfach untereinander. Die Zahl der Beziehungen steht als Fussnote darunter.
- **Mobil** wird nie der Gesamtgraph erzwungen: Auf schmalen Anzeigen zeigt die
  Seite die Nachbarschaft einer Organisation und sagt in der Statuszeile, welche.

### Zwei Perspektiven

Die Seite kennt zwei Perspektiven, umschaltbar über der Grafik. Die Umschaltung
ist bewusst ein offener Wert und kein Ja/Nein — die Geldflüsse der zweiten
Ausbaustufe kommen als weitere Perspektive dazu, ohne dass die Ansicht neu
geschrieben werden muss.

**Organisationen** (Standard): Organisationen als Knoten, verbunden über
gemeinsam erfasste Personen und direkt erfasste Beziehungen. Personen erscheinen
erst beim Öffnen einer Organisation.

**Personen**: zweiseitiges Netz aus Personen und den Organisationen, zu denen sie
erfasste Beziehungen haben. Gezeigt werden nur Personen mit Beziehungen zu
mindestens *n* Organisationen; *n* ist über einen Regler einstellbar. Im Kernnetz
G3 bei n = 2 sind das 133 Personen, 100 Organisationen und 298 Beziehungen.

| Schwelle | Personen im Netz (G3) |
|---|---|
| ≥ 2 Organisationen | 133 |
| ≥ 3 Organisationen | 27 |
| ≥ 4 Organisationen | 4 |

Personen mit nur einer Organisation stehen nicht im Netz — sie wären Punkte ohne
Verbindung — sondern in der Personenübersicht unter der Grafik, die alle 1772
Personen führt und über die Spaltenköpfe sortierbar ist.

**Bewusst keine Personen-Personen-Projektion.** Eine Linie zwischen zwei
Personen, die in derselben Organisation sitzen, wäre naheliegend, aber falsch:
Jedes Gremium würde seine Mitglieder zu einer Clique verbinden. Der grösste
erfasste Personenkreis einer Organisation hat 64 Leute — allein das wären 2016
Linien, insgesamt über 20 000. Das behauptet eine Nähe zwischen Personen, die in
den Daten nicht steht, und es wird mit besseren Daten schlimmer statt besser:
Die Kantenzahl wächst quadratisch mit der Zahl der erfassten Personen je
Organisation, die zweiseitige Darstellung dagegen linear.

Dass die Datenlage wächst, ist belegt: Zwischen dem 13.08. und dem 16.08.2026
stiegen die erfassten Personen um das 2,6-Fache, die Personen mit mehreren
Organisationen aber um das 3,6-Fache (44 → 157). Wer heute nur mit einem Mandat
erfasst ist, wird durch die nächste Recherche zur Brücke. Der Schwellenregler ist
die Antwort darauf: Wird die Grafik zu dicht, wird die Schwelle erhöht, ohne dass
Daten verschwinden.

### Warum Cluster nicht über neun Farben laufen

Neun gleichzeitige Farbtöne bestehen die Farbprüfung nicht: Der schlechteste
Wert liegt bei normalem Farbsehen bei ΔE 7,1 (Rot gegen Orange) und bei
Farbsehschwäche bei 3,2 — beides deutlich unter den Grenzwerten 15 und 8. In
einem Netzgraph kann jedes Paar nebeneinander liegen, deshalb gilt die strengere
Prüfung über alle Paare.

Umgesetzt ist deshalb:

- **Farbe nach Obergruppe**: drei geprüfte Farbtöne (Blau `#2a78d6`,
  Orange `#eb6834`, Aqua `#1baf7a`), alle Paare bestanden.
- **Farbe nach Cluster**: die Clusternummer steht im Knoten, die Legende führt
  Nummer und Bezeichnung. Wird im Filter ein Cluster gewählt, wird er farblich
  hervorgehoben. Die Clusteridentität hängt damit nie an der Farbe allein und
  bleibt in Graustufen und bei Farbsehschwäche lesbar.

---

## 5. Abnahme und Tests

Der Build gibt die Abnahme nach Auftrag Abschnitt 7 aus und bricht bei
Abweichung ab:

```
Organisationen                                   144    ok
aktuelle Kanten (Organisation -> Person)         2628   ok
G3-Kanten (N1-N3)                                2404   ok
N4-Kanten in der Standardansicht G3              0      ok
Kanten ohne org/person/relation_class/source_id  0      ok
Abdeckungsluecken                                8      ok
kanonische Personen                              1772   ok
sichere Variantengruppen                         80     ok
G2-Projektionskanten                             286    ok
G2-Projektionsgewicht                            1074   ok
Hauptcluster                                     9      ok
Brueckenorganisationen des Berichts              0 Abweichungen
Obergruppen-Paare des Berichts                   0 Abweichungen

Quellenanzeige
in Kanten verwendete Quellenkennungen            327    ok
davon ohne Eintrag in ngo_sources_web.csv        0      ok
Kanten ohne aufgeloeste Quelle                   0      ok
fehlende Source-Joins in der Bruecke             0      ok
327 Quellen, 2807 Zuordnungen Kante -> Quelle
Stichprobe Q1 und Q2 mit vollstaendiger Quellenkarte
```

Dazu die acht Abdeckungslücken namentlich und die Liste aller 80
zusammengeführten Namensvarianten.

```
node scripts/test_ngo_netz.js         # 52 Tests, Datenschicht
node scripts/test_ngo_netz_seite.js   # 61 Tests, gerenderte Seite (braucht jsdom)
npm install --no-save jsdom           # falls jsdom fehlt
```

Geprüft wird unter anderem, dass die JS-Kanonisierung dieselben Schlüssel ergibt
wie der Build, dass ähnlich klingende Namen nie zusammengeführt werden, dass die
JS-Projektion die im Build gerechnete exakt reproduziert, dass in G3 keine
N4-Kante auftaucht, dass Historie und aktuelle Beziehungen nie im selben Netz
stehen und dass ein geteilter Link Ansicht, Filter und Knoten wiederherstellt.
Für die Quellen wird geprüft, dass jede Beziehung einen aufgelösten Beleg hat,
dass kein Beleg nur aus der internen Kennung besteht, dass die Kennung
ausserhalb des Auditbereichs nicht auftaucht, dass ohne URL kein Link entsteht
und dass keine Excel-Serienzahl als Datum durchrutscht.

---

## 6. Datenpaket aktualisieren

1. Neue Dateien nach `NGO/daten/` legen — **nicht** nach `NGO/`, dort greift nur
   der Zusatzschutz der `.gitignore`.
2. `python NGO/build/erzeuge_netzwerk_json.py --nur-pruefen` — meldet jede
   Abweichung von den Sollwerten.
3. Sollwerte in `erzeuge_netzwerk_json.py` anpassen, wo sich der Datenstand
   bewusst geändert hat (`CLUSTER_SOLL`, `OBERGRUPPEN_SOLL`, `BRUECKEN_SOLL`,
   die Zahlen in `abnahme()`).
4. `python NGO/build/erzeuge_netzwerk_json.py` — schreibt und kopiert.
5. Erwartete Zahlen in `scripts/test_ngo_netz.js` und
   `scripts/test_ngo_netz_seite.js` nachziehen, beide Tests laufen lassen.

Ändert sich die Datenlage so, dass die Louvain-Clusterung die neun Cluster des
Berichts nicht mehr trifft, bricht Schritt 2 ab. Dann braucht es entweder einen
neuen Startwert oder — besser — eine mitgelieferte Clusterzuordnung.

---

## 7. Offene Punkte

**Daten**

- **Clusterzuordnung** fehlt im Paket; sauberer wäre eine Spalte `cluster_id` in
  `ngo_nodes_organisation.csv`. Solange sie fehlt, hängt die Reproduktion am
  festen Startwert.
- **Historische Beziehungen (G4)** liegen nur als Zahl je Organisation vor. Für
  einen echten Historienmodus braucht es die 59 Einzelbeziehungen mit Zeitbezug.
- **Unstimmigkeiten im Paket**: `ngo_nodes_organisation.csv` weist für Proviande
  78 Kanten aus, tatsächlich sind es 80. Die Spalten `g1_current_edges`,
  `g3_core_edges` und `bridge_persons` stammen aus der Zeit *vor* der
  Kanonisierung und weichen bei 38 Organisationen von den Werten des
  AP29-Berichts ab. Die Seite rechnet deshalb selbst und nutzt diese Spalten nicht.
- **`person_scope` (P1–P6)** ist im Paket nicht erläutert und wird nicht
  dargestellt. `active` ist bei allen 2628 Zeilen «Ja» und entfällt.
- **Doppelte Zeilen**: 72 Zeilen sind bis auf die `edge_id` vollständig doppelt
  (40 Gruppen in 21 Organisationen) — gleiche Organisation, Person, Rolle,
  Beziehungsklasse und Quelle. Sie werden nicht zusammengefasst; die Seite zählt
  Personen und Beziehungen getrennt aus und gruppiert die Personenliste. Der
  Build meldet die Zahl.

**Inhaltlich / rechtlich**

- **Namensnennung**: Die Seite zeigt 1772 Personen namentlich, mit Rolle,
  Parteiangabe und Beleg — ein deutlich grösserer Umfang als in der
  Vorgängerfassung (73 Zuordnungen). Der Beleg ist seit dem Quellenpaket je
  Beziehung nachvollziehbar; zu klären bleibt, ob die Quellenlage je Person die
  öffentliche Nennung trägt.

**Technisch**

- Visuelle Abnahme in echten Browsern (Safari/iOS, Firefox) steht aus. Geprüft
  ist bisher die DOM-Nachbildung in 1440 px und 390 px.
- Kontrast- und Screenreader-Prüfung mit einem echten Hilfsmittel steht aus.
- Bei 144 Knoten bleibt die Übersicht dicht, auch mit ausgedünnten Namen. Für
  die zweite Ausbaustufe ist eine mehrstufige Darstellung vorgesehen: zuerst
  nur die Cluster, dann in einen Cluster hineinzoomen.
- Die Geldflüsse der zweiten Ausbaustufe sind als dritte Perspektive vorgesehen.
  Die Umschaltung ist dafür vorbereitet, die Datenstruktur noch nicht.

---

## 8. Spätere Veröffentlichung

1. `<meta name="robots" content="noindex, nofollow" />` entfernen.
2. Self-canonical nach `</title>` einfügen (Konvention der Website):
   `<link rel="canonical" href="https://www.souveraene-schweiz.ch/ngo/" />`
3. Hinweisbanner «Interne Vorschau» entfernen und das Label «Vorschau» im
   page-hero ersetzen.
4. Seite in Navigation und Footer aufnehmen, gegebenenfalls auf
   `interaktiv.html` verlinken.
5. OG-/Twitter-Metadaten und ein OG-Bild ergänzen (`assets/og/`).
6. Seite in `sitemap.xml` und in den Suchindex (`assets/search.js`) aufnehmen.
7. Weiterleitung `netzwerk-verflechtungen-vorschau.html` entfernen.

---

Markus Lysser - souveraene-schweiz.ch
