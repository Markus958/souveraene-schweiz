# NGO-Netzwerk — Vorschau

Interaktive Darstellung der im NGO-Datenbestand erfassten Beziehungen zwischen
Schweizer Organisationen. Die Seite ist **nicht verlinkt** und auf
`noindex, nofollow` gesetzt.

Aufruf: `/netzwerk-verflechtungen-vorschau.html`

Der Zustand steht in der URL und ist teilbar, zum Beispiel
`?ansicht=G2&cluster=27&knoten=NGO-0031`.

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
| `netzwerk-verflechtungen-vorschau.html` | Vorschauseite |
| `assets/ngo/ngo-netz-daten.js` | Kanonisierung, Projektion, Filter, Suche (ohne DOM) |
| `assets/ngo/ngo-netz-ansicht.js` | Layout, Zeichnung, Zoom, Auswahl, Mobilverhalten |
| `assets/ngo/ngo-netz-seite.js` | Verdrahtung, Detailspalte, URL-Zustand, Tabellen |
| `assets/ngo/ngo-netz.css` | Styles der Seite (selbsttragend, bindet `ngo.css` nicht ein) |
| `assets/ngo/ngo-netzwerk.json` | Datengrundlage der Seite (602 KB, gzip rund 150 KB) |
| `assets/vendor/d3-force-bundle.min.js` | Layout-Bibliothek, lokal gebündelt (17 KB) |
| `assets/netzwerk/netzwerk.css` | gemeinsames Layout der Netzseiten |
| `assets/netzwerk/tailwind-seite.min.css` | Tailwind-Produktionsbuild (7,8 KB) |
| `assets/schriften.css`, `assets/fonts/` | lokal eingebundene Schriften (113 KB) |

**Teilprojekt** (`NGO/`, siehe `NGO/README.md`):

| Datei | Zweck |
|---|---|
| `NGO/daten/` | interne Quelldaten — **nicht versioniert**, nie veröffentlicht |
| `NGO/doku/CLAUDE_CODE_AUFTRAG.md` | Auftrag zu diesem Umbau |
| `NGO/build/erzeuge_netzwerk_json.py` | Build inklusive Abnahme und Nachrechnung des AP29-Berichts |
| `NGO/build/build_alles.py` | ruft den Build auf |

**Tests:** `scripts/test_ngo_netz.js` (32), `scripts/test_ngo_netz_seite.js` (42).

**Abgelöst, aber noch im Repo:** `assets/ngo/ngo-daten.js`, `ngo-ansicht.js`,
`ngo-seite.js`, `ngo.css`, `ngo-fuehrungsnetz.json`, `ngo-redaktion.json`,
`NGO/build/erzeuge_public_json.py`, `erzeuge_redaktion_json.py`,
`verbindungstypen.json`, `scripts/test_ngo.js`. Sie gehören zum Führungsnetz mit
100 Organisationen und werden von keiner Seite mehr geladen. Ob sie entfernt
werden, ist ein offener Punkt. `scripts/test_ngo_seite.js` wurde entfernt, weil
es die abgelöste Seite prüfte; es bleibt in der Git-Historie.

Die noch frühere CSV-Grafik bleibt als Datenstand erhalten
(`assets/data/netzwerk-verflechtungen.csv`, `assets/netzwerk/netzwerk-daten.js`,
`scripts/test_netzwerk.js`).

---

## 2. Datenfluss

```
NGO/daten/ngo_nodes_organisation.csv     144 Masterorganisationen
NGO/daten/ngo_nodes_personen_raw.csv     1852 technische Rohpersonen
NGO/daten/ngo_edges_current.csv          2628 Beziehungen Organisation → Person
NGO/daten/ngo_clusters_analysis.csv      AP29-Bericht (Sollwerte der Abnahme)
NGO/daten/network_metadata.json          Kennzahlen, Abdeckungslücken
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
Verdichtung wäre die Datei 1,3 MB statt 602 KB. Das Rollengewicht folgt
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
- **Mobil** wird nie der Gesamtgraph erzwungen: Auf schmalen Anzeigen zeigt die
  Seite die Nachbarschaft einer Organisation und sagt in der Statuszeile, welche.

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
```

Dazu die acht Abdeckungslücken namentlich und die Liste aller 80
zusammengeführten Namensvarianten.

```
node scripts/test_ngo_netz.js         # 32 Tests, Datenschicht
node scripts/test_ngo_netz_seite.js   # 42 Tests, gerenderte Seite (braucht jsdom)
npm install --no-save jsdom           # falls jsdom fehlt
```

Geprüft wird unter anderem, dass die JS-Kanonisierung dieselben Schlüssel ergibt
wie der Build, dass ähnlich klingende Namen nie zusammengeführt werden, dass die
JS-Projektion die im Build gerechnete exakt reproduziert, dass in G3 keine
N4-Kante auftaucht, dass Historie und aktuelle Beziehungen nie im selben Netz
stehen und dass ein geteilter Link Ansicht, Filter und Knoten wiederherstellt.

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
- **Quellenverzeichnis**: 338 Quellenkennungen (`Q-…`) werden angezeigt, ein
  Verzeichnis, das sie auflöst, fehlt im Paket.

**Inhaltlich / rechtlich**

- **Namensnennung**: Die Seite zeigt 1772 Personen namentlich, mit Rolle,
  Parteiangabe und Quellenkennung — ein deutlich grösserer Umfang als in der
  Vorgängerfassung (73 Zuordnungen). Vor einer Veröffentlichung ist zu klären,
  ob die Quellenlage je Person das trägt.

**Technisch**

- Visuelle Abnahme in echten Browsern (Safari/iOS, Firefox) steht aus. Geprüft
  ist bisher die DOM-Nachbildung in 1440 px und 390 px.
- Kontrast- und Screenreader-Prüfung mit einem echten Hilfsmittel steht aus.
- Bei 144 Knoten ist die Beschriftungsdichte im Gesamtnetz hoch. Ob Labels ab
  einer Zoomstufe ausgedünnt werden sollen, ist offen.
- Ob die abgelösten Führungsnetz-Dateien entfernt werden, ist zu entscheiden.

---

## 8. Spätere Veröffentlichung

1. `<meta name="robots" content="noindex, nofollow" />` entfernen.
2. Self-canonical nach `</title>` einfügen (Konvention der Website), sinnvoll
   zusammen mit einem endgültigen Dateinamen ohne «vorschau».
3. Hinweisbanner «Interne Vorschau» entfernen und das Label «Vorschau» im
   page-hero ersetzen.
4. Seite in Navigation und Footer aufnehmen, gegebenenfalls auf
   `interaktiv.html` verlinken.
5. OG-/Twitter-Metadaten und ein OG-Bild ergänzen (`assets/og/`).
6. Seite in `sitemap.xml` und in den Suchindex (`assets/search.js`) aufnehmen.
7. Datei umbenennen und die Namensänderung in dieser Dokumentation nachziehen.

---

Markus Lysser - souveraene-schweiz.ch
