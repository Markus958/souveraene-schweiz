# NGO-Netzwerk — Vorschau

Interaktive Darstellung der im NGO-Datenbestand erfassten Beziehungen zwischen
Schweizer Organisationen. Die Seite ist **nicht verlinkt** und auf
`noindex, nofollow` gesetzt.

Aufruf: **`/ngo/`** — Überblicksseite: **`/ngo/cockpit.html`**

Die alte Adresse `/netzwerk-verflechtungen-vorschau.html` leitet weiter. Die
Weiterleitung ist ein Übergang und kann entfernt werden, sobald sie niemand
mehr aufruft.

Der Zustand steht in der URL und ist teilbar, zum Beispiel
`/ngo/?ansicht=G2&cluster=27&knoten=NGO-0031`.

> **Kein Zugriffsschutz.** Die Seite liegt im Repository und ist damit
> öffentlich erreichbar. `noindex` hält nur Suchmaschinen ab; wer die Adresse
> kennt, sieht alles. Der eigentliche Schutz liegt darin, dass ausschliesslich
> die aufbereitete Fassung der Daten ausgeliefert wird (siehe Abschnitt 2).

Datengrundlage: **NGO_Claude_Code_Handoff_2026-08-25_r1**
(Masterversion `NGO-CC-2026-08-25-r1`), Stand 25.08.2026, 2852
Masterorganisationen, 6779 aktuelle Beziehungen — seit dieser Lieferung
**alle** belegt und damit alle gezeichnet —, 97 frühere Beziehungen,
3143 Personen, davon 16 nur in der Historie.

---

## 1. Dateien

**Seite und Laufzeit** (versioniert, öffentlich):

| Datei | Zweck |
|---|---|
| `ngo/index.html` | Netzwerkseite |
| `ngo/cockpit.html` | Überblicksseite mit Kennzahlen, Verteilungen und Ranglisten |
| `netzwerk-verflechtungen-vorschau.html` | Weiterleitung auf `/ngo/`, als Übergang |
| `assets/ngo/ngo-netz-daten.js` | Kanonisierung, Projektion, Filter, Suche (ohne DOM) |
| `assets/ngo/ngo-netz-ansicht.js` | Layout, Zeichnung, Zoom, Auswahl, Mobilverhalten |
| `assets/ngo/ngo-netz-seite.js` | Verdrahtung, Detailspalte, URL-Zustand, Tabellen |
| `assets/ngo/ngo-netz.css` | Styles der Netzwerkseite (selbsttragend) |
| `assets/ngo/ngo-cockpit.js` | Auszählungen und Diagramme der Überblicksseite |
| `assets/ngo/ngo-cockpit.css` | Styles der Überblicksseite |
| `ngo/cockpit-v2.html` | zweite Fassung der Überblicksseite, filterbar |
| `assets/ngo/ngo-cockpit-v2.js` | Filter, Treemap und Auszählungen der zweiten Fassung |
| `assets/ngo/ngo-cockpit-v2.css` | Styles der zweiten Fassung |
| `assets/ngo/ngo-netzwerk.json` | Datengrundlage der Seite (739 KB, gzip rund 180 KB) |
| `assets/vendor/d3-force-bundle.min.js` | Layout-Bibliothek, lokal gebündelt (17 KB) |
| `assets/netzwerk/netzwerk.css` | gemeinsames Layout der Netzseiten |
| `assets/netzwerk/tailwind-seite.min.css` | Tailwind-Produktionsbuild (7,8 KB) |
| `assets/schriften.css`, `assets/fonts/` | lokal eingebundene Schriften (113 KB) |

**Teilprojekt** (`NGO/`, siehe `NGO/README.md`):

| Datei | Zweck |
|---|---|
| `NGO/lieferung/` | Eingang für neue Lieferungen — **nicht versioniert**, nie veröffentlicht |
| `NGO/data/` | Quelldateien der Lieferung — **nicht versioniert**, nie veröffentlicht |
| `NGO/doku/CLAUDE_CODE_AUFTRAG.md` | Auftrag zu diesem Umbau |
| `NGO/build/erzeuge_netzwerk_json.py` | Build inklusive Abnahme, Nachrechnung des AP29-Berichts und Quellenauflösung |
| `NGO/build/build_alles.py` | ruft den Build auf |
| `NGO/build/uebernimm_lieferung.py` | holt die neun Pflichtdateien aus `NGO/lieferung/` nach `NGO/data/` |

**Tests:** `scripts/test_ngo_netz.js` (54), `scripts/test_ngo_netz_seite.js` (102),
`scripts/test_ngo_cockpit.js` (30), `scripts/test_ngo_cockpit_v2.js` (32).

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
NGO/data/organizations.csv               2852 Masterorganisationen, mit
                                         category_id und cluster_id
NGO/data/persons.csv                     3143 Personenknoten, 16 nur für G4
NGO/data/person_name_variants.csv        212 zweite Schreibweisen
NGO/data/edges_current.csv               6779 Beziehungen Organisation → Person
NGO/data/edge_sources.csv                Beziehung → Quelle (Belegschicht)
NGO/data/history_g4.csv                  97 frühere Beziehungen (G4)
NGO/data/history_sources.csv             Historienbeziehung → Quelle
NGO/data/source_registry.csv             1463 Quellen, 29 rekonstruiert
NGO/data/categories.csv                  17 semantische Kategorien
NGO/data/cluster_assignments.csv         Organisation → Netzwerkcluster
NGO/data/cluster_dictionary.csv          Cluster 0 bis 63 mit Bezeichnung (Kür)
        │
        ├─ NGO/build/erzeuge_netzwerk_json.py
        │     Identität, Belege, Projektion G2/G3, Abnahme
        │     (liest genau die build_inputs aus config/build_contract.json;
        │      alles unter audit/ ist laut Vertrag gesperrt)
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

**Identität der Personen** ist seit dem Handoff-Paket **ID-basiert**: Schlüssel
ist `person_id`, nie der angezeigte Name. Der Vertrag verlangt das ausdrücklich
(«never merge entities solely by display name»), und es ist auch sachlich
richtig — zwei Personen können gleich heissen. Zusammengeführt wird nur, was
die Lieferung selbst als Schreibvariante ausweist: `person_name_variants.csv`
nennt 212 Personen mit einer zweiten Schreibweise. Beide Schreibweisen bleiben
über die Suche erreichbar.

Die eigene Kanonisierung (Unicode normalisieren, klein schreiben, Interpunktion
als Trenner, Tokens sortieren — kein Fuzzy-, Levenshtein- oder phonetisches
Matching) bleibt als **Prüfung** bestehen: Findet sie zwei verschiedene
`person_id` unter demselben Namensschlüssel, weist die Abnahme das aus, führt
sie aber nicht zusammen.

Ergebnis: 3143 Personen, davon 3127 mit aktueller Beziehung und 16, die das
Paket mit `person_status = historical_only_g4` nur für die Historie führt.

**Cluster** liefert das Paket mit: `cluster_id` steht an jeder Organisation und
noch einmal in `cluster_assignments.csv`; der Build vergleicht beide und bricht
ab, wenn sie auseinanderlaufen. `cluster_dictionary.csv` gibt die
Bezeichnungen. Die frühere Louvain-Nachrechnung ist entfallen. Gezählt wird die
tatsächliche Zuordnung, nicht die im Wörterbuch gemeldete Grösse — bei 3.7.51
wichen die beiden noch ab. 135 Organisationen tragen einen `cluster_status`
ungleich `assigned`; laut Vertrag ist ein leeres Cluster zulässig und kein
Fehler.

Der Vertrag trennt zwei Dinge, die vorher vermischt waren: **`category_id` ist
die semantische Anzeigegruppe** (17 Kategorien, `categories.csv`),
**`cluster_id` eine Netzwerkeigenschaft**. `SONSTIGE` ist eine gültige,
ausdrücklich manuell vergebene Kategorie und wird im Frontend nicht
umsortiert.

**Projektion auf Organisationen**: Über gemeinsam erfasste Personen zählt je
Person und Organisation das höchste Rollengewicht; das Kantengewicht ist
konservativ das kleinere der beiden. Direkte Master-zu-Master-Beziehungen
kommen hinzu und bleiben gekennzeichnet.

> **Projektion stimmt mit dem Paket überein.** Seit dem Handoff-Paket rechnet
> die Seite dieselben Zahlen wie die Lieferung: G2 22 160 Kanten und 489
> Organisationen ohne Projektionskante, G3 13 123 Kanten. Bei 3.7.49 und 3.7.51
> wich das noch ab, weil Beziehungen ohne Beleg nicht gezeichnet werden konnten.
> Jetzt löst **jede** Beziehung auf eine Registerquelle auf, und die Differenz
> ist verschwunden. Der Build vergleicht bei jedem Lauf.

**Quellen**: Der Beleg steht ausschliesslich in `edge_sources.csv`. Die Spalten
`source_id` und `source_id_original` an der Kante selbst sind Rohtext aus dem
Master und werden laut Vertrag **nicht** gelesen. Alle 594 verwendeten
Kennungen lösen in `source_registry.csv` auf — keine einzige bleibt offen. 29
Registerzeilen sind mit `registry_status = reconstructed_missing_registry`
gekennzeichnet: Für sie ist die Organisationswebsite bekannt, aber nicht die
genaue Belegstelle. Die Seite weist das aus, statt die Homepage als exakte
Fundstelle auszugeben.

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
- **Auswahl und Suchtreffer** treten hervor, statt dass nur der Rest
  zurückgenommen wird: Die betroffenen Linien werden dicker und volldeckend,
  die Nachbarknoten bekommen einen dunklen Ring, der gewählte Knoten einen
  roten. Der Farbton der Linien bleibt dabei erhalten, damit direkte und über
  Personen abgeleitete Beziehungen unterscheidbar bleiben.
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

### Das Netz zuerst, die Erklärung auf Abruf

Oberste Regel der Seite: **beim Öffnen muss ein Netz zu sehen sein.** Über der
Grafik stehen deshalb nur der knappe Kopf, die Kennzahlenzeile und die
Bedienelemente, die man zum Einstieg braucht — Suche, Perspektive, Netzumfang.
Auf 1440 × 900 beginnt die Grafik damit bei rund 490 Pixeln Höhe und ist ohne
Scrollen sichtbar.

Alles Weitere ist wegklappbar oder liegt in einem Fenster:

1. **Detailfilter** (Art der Beziehung, Ansicht, Obergruppe, Cluster, Partei,
   Schwelle, Knotenfarbe) stehen hinter dem Knopf «Filter und Darstellung»,
   eingeklappt. Daneben fasst eine Zeile zusammen, was gerade eingestellt ist —
   «Kernnetz · nur N1 · Cluster 27», damit ein aktiver Filter nie unbemerkt wirkt.
2. **Bedienung und Begriffe** liegen in einem modalen Fenster über der Ansicht,
   geöffnet über den Knopf in der Bedienzeile oder über die Infozeichen. Escape
   und ein Klick auf den Hintergrund schliessen es. Es enthält die Bedienung,
   die Bedeutung von Knoten und Linien je Perspektive und sechzehn Begriffe als
   Definitionsliste.
3. **Infozeichen** neben Perspektive, Netzumfang, Art der Beziehung, Obergruppe,
   Cluster und Abdeckungslücke öffnen das Fenster und springen zum passenden
   Begriff, heben ihn hervor und setzen den Fokus dorthin.

Über der Grafik steht nur noch eine Zeile: was Klicken, Ziehen und Mausrad tun,
dazu der Knopf «Bedienung und Begriffe».

Davor steht der wirksamere Schritt: **die Oberfläche spricht nicht mehr die
internen Kürzel.** Aus «Kernnetz G3» wurde «Kernnetz» mit «N1–N3» als Zusatz,
aus «N1» wurde «Organfunktion N1», aus «Historie (G4)» «frühere Beziehungen».
Die Arbeitskürzel G2, G3 und G4 stehen nur noch klein hinter dem verständlichen
Wort oder im Fenster — ein Test prüft, dass sie in der Steuerung nirgends allein
auftauchen.

Die Begriffe stehen bewusst auf der Seite selbst und nicht im zentralen
`glossar.html`. Eine spätere Aufnahme dort ist möglich; das Glossar steht unter
Rücksprachepflicht.

**Drei Fallstricke, die dabei sichtbar wurden:**

- Der Tailwind-Reset setzt `[hidden]` über `:where()` und damit mit Spezifität
  null. Jede Klassenregel mit `display` schlägt das — `.ngo-feld` und
  `.nv-legende` sind `flex` und blieben trotz gesetztem Attribut sichtbar.
  `ngo-netz.css` enthält deshalb `.nn [hidden] { display: none !important; }`.
- Der Seiten-Reset `* { margin: 0 }` nimmt einem modalen `<dialog>` die
  Zentrierung, die der Browser sonst über `margin: auto` herstellt. Das Fenster
  setzt `margin: auto` ausdrücklich.
- Die Mobilregeln in `netzwerk.css` gelten den alten `.nv-`Bedienelementen. Die
  Steuerung dieser Seite heisst `.ngo-` und braucht eigene Regeln; sie stehen
  jetzt in `ngo-netz.css`.

Die DOM-Nachbildung der Tests wertet keine Stylesheets aus und kann diese Klasse
von Fehlern nicht finden. Für den ersten Fall prüft ein Test die CSS-Regel
selbst; im Übrigen bleibt die visuelle Abnahme unverzichtbar.

### Die Überblicksseite

`/ngo/cockpit.html` fasst zusammen, was der Bestand hergibt: fünf Kennzahlen,
die Verteilung nach Obergruppe und nach Art der Beziehung, die fünf Personen mit
den meisten Organisationen, die zehn Organisationen mit den meisten erfassten
Personen, die Parteiangaben und die benannte Liste aller Cluster.
Vier Kacheln führen von dort in die Netzwerkseite.

Die frühere Vorschaugrafik der Clusterebene ist entfallen: Mit 64 Clustern und
641 Verbindungen zwischen ihnen wäre sie dasselbe Knäuel wie auf der
Netzwerkseite. Die Liste zeigt dieselben Cluster lesbar und anklickbar.

Die Seite lädt **dieselbe** `ngo-netzwerk.json` und benutzt **dieselbe**
Datenschicht wie das Netzwerk — die Zahlen können deshalb nicht auseinanderlaufen.
Ein Test rechnet jede angezeigte Zahl gegen die Daten nach: Die Summe der
Obergruppen muss die Zahl der Organisationen ergeben, die Summe der
Beziehungsarten die Zahl der Beziehungen.

Der Hinweis, dass sich aus Parteiangaben keine Parteizugehörigkeit der
Organisation ableiten lässt, steht hinter dem i-Knopf der Karte statt darunter.
Er kommt aus dem Datenpaket und gehört zu dessen Bedingungen; sichtbar
verlängerte er die Karte. Der Satz «kein Mass für Einfluss» unter der
Personenrangliste ist auf ausdrücklichen Wunsch entfernt — der Methodikblock
am Seitenfuss trägt die Aussage weiterhin.

In der Personenrangliste steht die **Parteiangabe** als kleiner Zusatz hinter
dem Namen — sie gehört zur Person, nicht zur Organisation, und mehrere Angaben
werden alle gezeigt statt auf eine verkürzt. Personen ohne Angabe tragen keinen
Zusatz; das heisst «nicht erfasst», nicht «parteilos».

Von der Rangliste führt der Name in den Personenfokus, und zwar mit
**erweiterter Ansicht** in der Adresse (`ansicht=G2&klassen=N1,N2,N3,N4`).
Ohne das zählte die Rangliste alle erfassten Beziehungen, der Fokus zeigte aber
nur das Kernnetz — bei Mattea Meyer sieben gegenüber zwei.

Die Balken der **Parteiangaben** sind ebenfalls anklickbar und öffnen das
Gesamtnetz mit gesetztem Parteifilter — also genau die Organisationen, bei
denen eine Person mit dieser Angabe erfasst ist. Der
Balken selbst zählt Personen, nicht Organisationen; das steht in der
Überschrift der Karte.

Damit die Antwort stimmt, tut der Parteifilter etwas Zusätzliches: Er lässt die
Organisationen **ohne jede erfasste Beziehung** weg. Früher wurden sie in jedes
Gesamtnetz mitgezeichnet, damit sie nicht stillschweigend verschwinden — unter
einem Parteifilter sähen dieselben 117 Punkte aber wie Treffer aus, obwohl sie
zu dieser Partei gar keine Beziehung haben können.

Die Balken der Obergruppen sind **anklickbar** und öffnen die Clusterebene mit
gesetztem Obergruppenfilter (`?obergruppe=…`). Dort bleiben nur die Cluster
stehen, in denen die Obergruppe tatsächlich Mitglieder hat, und die
Mitgliederzahl der Knoten zählt nur diese — sonst stünden leere Gruppen im
Bild und die Zahlen widersprächen dem Filter.

**Aufbau.** Sechs Spalten als Raster: die ersten drei Karten (Obergruppe,
Beziehungsart, Personen) zu je zwei Spalten, darunter Organisationen und
Parteiangaben zu je drei, die Cluster über die volle Breite. Balken und Listen
sind auf 46 bzw. 34 rem begrenzt — metergrosse Balken sind schwerer zu
vergleichen als kurze. Die Kopfzeile nennt nur Datenstand und Version.

**Fünf Kennzahlen**, Zahl und Beschriftung in einer Zeile, der Zusatz darunter
auf zwei Zeilen begrenzt (voller Text als Titel). Ohne die Begrenzung wachsen
die Kacheln unterschiedlich hoch und die Zeile verliert ihre Linie.

**Fünf Zeilen je Karte — auf zwei verschiedene Arten.** Bei den Ranglisten
(Personen) sind es schlicht die ersten fünf; «die meisten» sagt bereits, dass
es weitergeht, und der Verweis darunter führt zur vollen Liste. Bei den
**Verteilungen** ginge das nicht: Ihre Summe muss den Bestand ergeben, und ein
Test prüft das. Dort stehen vier
Zeilen einzeln und der Rest als Sammelzeile «Übrige …», deren Titel nennt, was
gebündelt wurde. Bei bis zu fünf Einträgen bleibt alles einzeln — die
Beziehungsarten (N1–N4) sind davon nie betroffen.

**Die Cluster sind einzeln anklickbar**, sowohl über die Kreise in der Grafik
als auch über eine benannte Liste darunter (Nummer, Label, Mitgliederzahl).
Beides führt nach `/ngo/?fokus=<id>`. Die Liste ist nicht Zierde: Der
Clustername stand vorher nur im `<title>` des Kreises, also im Tooltip — auf
Berührungsgeräten damit nirgends.

**Ein Farbton für alle Balken.** Die Kategorie steht als Text daneben; eine
zweite Farbcodierung trüge nichts bei und wäre bei acht Parteien weder für
Farbsehschwächen noch für normales Farbsehen sicher unterscheidbar. Die Vorlage
färbte jeden Balken anders — das ist Dekoration, keine Information.

### Zwei Fassungen der Überblicksseite

`/ngo/cockpit-v2.html` steht neben der ersten Fassung, nicht an ihrer Stelle.
Beide laden dieselbe `ngo-netzwerk.json` über dieselbe Datenschicht; ein
Umschalter oben auf beiden Seiten wechselt zwischen ihnen. So lassen sie sich
nebeneinander beurteilen, bevor eine gewählt wird.

Was die zweite Fassung anders macht:

- **Filterbar.** Obergruppe, Parteiangabe, Sitz, Clustergrösse, Beziehungsart
  N1–N4, «nur Kernnetz», «nur Brückenpersonen». Jede Auswahl wirkt auf alle
  Auszählungen der Seite. Aktive Filter stehen als entfernbare Chips darunter,
  dazu «alle zurücksetzen».
- **Kennzahlen als Schalter.** Vier der fünf Kacheln setzen den Filter, den sie
  beschreiben — «Beziehungen» schaltet aufs Kernnetz, «Brückenpersonen» auf
  Personen mit mehreren Organisationen. Die fünfte, der Schnitt je
  Brückenperson, ist eine abgeleitete Grösse ohne eigenen Filter und deshalb
  kein Knopf, sondern eine Kachel ohne Klickfläche.
- **Treemap statt Liste.** Die zwölf grössten Cluster als Flächen, Grösse nach
  Zahl der Organisationen. Cluster 0 — die Organisationen ohne belegte
  Projektion — ist nicht abgebildet: Als Fläche beherrschte er das Bild, ohne
  eine Gruppe zu sein. Er steht mit den übrigen Clustern in der Fussnote. Die
  volle Liste erscheint erst auf Klick.
- **Suchfeld im Kopf.** Organisationen und Personen; ein Treffer führt direkt
  in die passende Ansicht der Netzwerkseite.

**Farbe der Treemap.** Ein Blauton, sequenziell — die Fläche zeigt eine Menge,
keine Kategorien. Bewusst nur die helle Hälfte des Verlaufs: Auf den mittleren
Blautönen erreicht weder weisse noch dunkle Schrift den nötigen Kontrast (auf
`#5187bd` sind es 3,75 zu Weiss und 4,3 zu Dunkelblau). Die Grösse liest man
ohnehin an der Fläche ab; die Farbe gibt nur Tiefe. Die Treemap ist
ausgeschrieben (squarified nach Bruls/Huizing/van Wijk) — für zwölf Rechtecke
lohnt keine Bibliothek, und die Seite bleibt ohne externe Abhängigkeit.

**Was der Filter nicht tut:** Er wird nicht in die Netzwerkseite übernommen.
Deren Filter hat eigene Regeln — Projektion, Ebenen, Darstellungsgrenze — und
ein halb übertragener Zustand wäre schlimmer als keiner.

Eine Zahl weicht bewusst von der ersten Fassung ab: Die Obergruppenverteilung
nennt «ohne Zuordnung» als eigene Zeile statt als Sammelposten. Die Kachel
«Personen» zählt die Personen der **gezeigten** Beziehungen; seit dem
Handoff-Paket sind das alle 3127 mit aktueller Beziehung, weil keine Beziehung
mehr wegen fehlendem Beleg entfällt.

### Liste, wo ein Bild nicht mehr trägt

Mit Paket 3.7.51 war der Bestand von 342 auf 2852 Organisationen gewachsen, die
Projektion von 498 auf 13 122 Linien. Damit ist die Frage nicht mehr, wie man
das Gesamtnetz zeichnet, sondern ob überhaupt. Die Messung: Bei **jeder**
Gradschwelle bleibt die Dichte zwischen 5 und 11 Linien je Knoten — bei 3.7.49
waren es 1,5. Es gibt keinen Schnitt, der ein lesbares Bild ergibt.

Deshalb entscheidet die Seite je Ansicht, ob sie zeichnet oder auflistet:

| Bedingung | Folge |
|---|---|
| mehr als 300 Knoten | Liste |
| mehr als 900 Linien | Liste |
| höchstens 40 Knoten | immer Bild |
| sonst ab 4 Linien je Knoten | Liste |

Die Ausnahme für kleine Netze ist wichtig: Bei einem Dutzend Knoten lässt sich
auch mit vielen Linien noch ablesen, wer mit wem verbunden ist. Genau so sehen
Nachbarschaften in diesem Bestand aus — die Nachbarn einer Organisation sind
meist auch untereinander verbunden.

Die Liste ist kein Notbehelf, sondern zeigt dieselben Knoten, nach Grösse oder
Zahl der Verbindungen sortiert, mit Kennzeichnung der Abdeckungslücken. Was sie
nicht behauptet: dass man die Verbindungen ablesen könne. Ein Kopftext sagt in
jeder Ansicht, warum kein Bild steht. Ein Klick auf einen Eintrag führt eine
Ebene tiefer, wo wieder gezeichnet wird.

Damit ergibt sich von selbst: Clusterebene (64 Knoten, 641 Linien), alle
Organisationen (2491 / 13 122) und die Personenperspektive (2767 Knoten) stehen
als Liste, ein einzelner Cluster und die Nachbarschaft einer gewählten
Organisation als Bild.

**Die Personenperspektive listet Personen, nicht beides.** Ihr Netz enthält
Personen *und* Organisationen. Eine Liste beider Arten wäre irreführend: Das
Schweizerische Rote Kreuz hat mit 50 Verbindungen mehr als jede Person und
stünde zuoberst, obwohl die Perspektive nach Personen fragt. Gelistet sind
deshalb nur Personen, mit Zahl der Organisationen und Parteiangabe, sortiert
wie die Rangliste im Cockpit. Ein Klick öffnet den Personenfokus.

Damit die Zahlen zusammenpassen, führen die Personenlinks des Cockpits mit
`ansicht=G2&klassen=N1,N2,N3,N4` in die Perspektive. Im Kernnetz zählte sie
anders als die Rangliste, aus der man kommt — bei Fabio Regazzi 30 statt 31.

### Drei Ebenen

Der Einstieg ist die Clusterebene.

| Ebene | Knoten | Linien | Darstellung |
|---|---|---|---|
| 1 — alle Cluster | 64 | 641 | Liste |
| 2 — ein Cluster | 2 bis 669 | bis 1105 | Bild, bei den grössten Liste |
| 3 — alle Organisationen | 2491 | 13 122 | Liste |
| Auswahl — eine Organisation und ihre Nachbarn | meist unter 40 | | Bild |

47 der 64 Cluster haben höchstens 60 Mitglieder; sie sind der Arbeitsbereich.

**Ebene 1** zeigt die Cluster als Knoten, Grösse nach Mitgliederzahl. Eine
Linie steht für die **Zahl der verbundenen Organisationspaare**, nicht für eine
Beziehung zwischen den Clustern selbst — Cluster sind rechnerische Gruppen,
keine Akteure. Die Statuszeile sagt das ausdrücklich, weil hier sonst die
naheliegendste Fehlinterpretation entsteht.

**Ebene 2** zeigt die Organisationen eines Clusters mit ihren internen
Verbindungen. Verbindungen nach aussen bleiben als Anschlussstummel sichtbar,
je Zielcluster einer, sonst wirkte ein Cluster abgeschlossen. Mehrere
Verbindungen derselben Organisation in denselben Cluster werden zu einer Linie
gebündelt.

Die Stummel tragen im Bild nur die Clusternummer. Die Labels der Lieferung sind
seit 3.7.51 lang («Netzwerkcluster 9 – alliance F; Zürcher Komitee …») und
überdeckten bei zwei Dutzend Anschlüssen genau die Organisationen, um die es in
dieser Ansicht geht. Der volle Name steht im Titel des Knotens. Aus demselben
Grund zählen die Stummel nicht mehr in die Schwelle, ab der ein Name gezeigt
wird — sonst verdrängten sie mit ihren hohen Werten jede Organisation.

**Ebene 3** listet alle Organisationen, über «Alle Organisationen» erreichbar,
sortiert nach Zahl der Verbindungen. Ein Klick auf einen Eintrag zeigt die
Organisation mit ihren Verbindungen als Bild. Das frühere Gesamtnetz als
Zeichnung gibt es nicht mehr: 2491 Knoten mit 13 122 Linien sind kein Bild,
sondern eine Fläche.

Am Seitenkopf steht ein **Rücksprung aufs Cockpit** («← Zurück zum Cockpit»).
Er ersetzt den bisherigen «Überblick» rechts in der Brotkrumenzeile: Die
Brotkrumen führen innerhalb des Netzes, dieser Verweis verlässt es — zwei
Wege an dieselbe Stelle in derselben Zeile waren einer zu viel.

Navigation über eine Brotkrumenzeile: **Alle Cluster › Verkehr / Umwelt /
Energie**. Der Zustand steht in der URL (`ebene`, `fokus`) und ist teilbar.

Auf der Clusterebene sind der Clusterfilter und die Knotenfarbe gesperrt — der
Filter *ist* dort die Navigation. Die Personenperspektive und der Historienmodus
haben Vorrang vor der Ebene.

Die **Kennzahlenzeile** und die **Aufzählung aller Cluster** stehen nur im
Cockpit. Auf der Netzwerkseite wiederholten sie dieselben Werte über bzw.
unter jeder Ansicht. Version und Datenstand bleiben in der Zeile unter dem
Titel, die Obergruppenlegende bleibt — sie erklärt eine Farbcodierung.

**Die 117 Organisationen ohne erfasste Beziehung** können in keinem Netz
erscheinen. Sie stehen als eigener aufklappbarer Abschnitt bei den übrigen
Tabellen, mit derselben Auszeichnung — über der Grafik verdrängte der Hinweis
das Netz, obwohl er eine Randbedingung des Bestands beschreibt und keine
Bedienhilfe ist. 63 % der Verbindungen verlaufen innerhalb eines Clusters (316 von 498),
was die Aggregation trägt.

### Eine Person im Fokus

Wer aus der Suche eine Person wählt, sieht sie mit ihren Organisationen allein —
bei Sibel Arslan drei Linien zu SWISSAID, Helvetas und der Schweizerischen
Gesellschaft für Aussenpolitik. In der Liste aller Organisationen wäre das
nicht zu erkennen; im früheren Gesamtnetz sähen die drei Linien aus wie alle
anderen.

Der Fokus ist über die Brotkrumen verlassbar und steht in der URL (`person`).
Aus der Detailspalte führt der Knopf «Nur diese Person und ihre Organisationen
zeigen» dorthin. In dünnen Ansichten wird die Schrift grösser — bei vier Knoten
ist Platz genug.

**Der Fokus zeigt von sich aus alles.** Beim Eintritt in einen Personenfokus
schaltet die Seite auf «erweitert» mit allen vier Beziehungsarten. Im Kernnetz
verbärge sie sonst einen Grossteil der Mandate — bei Barbara Gysi 26 von 37 —
und man müsste jedes Mal erst umschalten. Gibt die Adresse ausdrücklich eine
Ansicht oder Klassen vor, bleibt diese stehen.

**Zwei Spalten statt Kraftlayout.** Der Fokus ist ein Stern: eine Person, ihre
Organisationen, sonst nichts. Ein Kraftlayout verteilt die Speichen ungleich
und schiebt die Namen übereinander; auf einem Ring liegen die Punkte oben und
unten fast auf gleicher Höhe und ihre Namen decken sich. Deshalb stehen die
Organisationen alphabetisch in zwei Spalten links und rechts der Person, die
Namen nach aussen ausgerichtet — eine Zeile je Organisation, unabhängig von
der Zahl. Namen über 30 Zeichen werden im Bild gekürzt; der volle Name steht
im Titel des Knotens und in der Detailspalte.

**Eine Organisation im Fokus anklicken öffnet sie.** Vorher passierte sichtbar
nichts: Das Netz zeigt dort nur die eine Person, und Aufklappen gibt es nicht.
Der Klick verlässt den Fokus und zeigt die Organisation mit ihren Verbindungen.
Weil der Zustand per `replaceState` in der Adresse steht und die Zurücktaste
des Browsers deshalb nicht hilft, merkt sich die Seite die Herkunft und bietet
in der Brotkrumenzeile «↩ zurück zu …» an. Dieselben Wege führen auch aus der
Detailspalte: die Verweise dort öffnen die Organisation, statt sie nur
auszuwählen.

**Was der Filter verdeckt, wird gesagt.** Der Fokus zeigt nur Beziehungen der
gewählten Art. Liegen weitere ausserhalb, steht über der Grafik eine Kachel
(«5 von 7 erfassten Organisationen sind durch die gewählte Beziehungsart
ausgeblendet») mit dem Knopf «alle Beziehungen zeigen», der auf die erweiterte
Ansicht und alle vier Beziehungsarten umschaltet. Dieselbe Angabe geht über die
Statuszeile an Screenreader.

Die Kachel muss sichtbar sein: `.nv-status` ist bewusst nur für Screenreader
gesetzt, eine Meldung allein dort sieht niemand. Ohne den Hinweis entstünde der
Eindruck, eine Person sei mit weniger Organisationen erfasst als tatsächlich —
Mattea Meyer erschien mit zwei Organisationen, obwohl sieben erfasst sind, weil
fünf davon N4 sind.

### Die Auswahl färbt den Knoten und räumt das Bild frei

Ein roter Rand allein geht in einem dichten Netz unter. Die gewählte
Organisation wird deshalb **eingefärbt** (`#c8102e`), ihre direkten Nachbarn
in einem dunkleren Blau (`#3c5f86`).

Wichtiger noch: **alles, was nicht mit ihr verbunden ist, verschwindet.** Bei
LITRA bleiben 31 verbundene Organisationen stehen, 308 sind ausgeblendet. Eine
Kachel über der Grafik nennt beide Zahlen und trägt den Knopf «Auswahl
aufheben»; ein Klick auf die freie Fläche tut dasselbe. Der Weg gilt gleich,
ob die Auswahl aus einem Klick oder aus der Adresse (`knoten=`) kommt.

Nicht angewendet auf der Clusterebene — dort *ist* der Klick die Navigation —
und nicht, wenn die Auswahl gar keine Verbindung hat: eine Organisation allein
auf leerer Fläche sähe nach «unvernetzt» aus und wäre eine Fehlaussage.

Die Farbe ist nicht die einzige Kennzeichnung: Rand, Strichstärke der Linien
und die Detailspalte tragen dieselbe Information weiter.

### Aus der Tabelle in die Grafik

Die Organisationsnamen in den Tabellen sind anklickbar und wählen die
Organisation in der Grafik an. Steht sie dort nicht — auf der Clusterebene
oder im Personenfokus —, wechselt der Klick zuerst aufs Gesamtnetz, sonst
ginge er ins Leere. Danach rollt die Seite zur Grafik.

### Wo Knoten ohne Linie stehen

Ein Kraftlayout treibt Knoten ohne Kante an den Rand: Sie werden abgestossen
und nichts zieht sie zurück. Das Bild wird gross, der verbundene Teil klein und
zum Knäuel gedrückt. Solche Knoten nehmen deshalb **nicht an der Simulation
teil**; sie stehen alphabetisch in einem Raster unter dem Netz. Sie
verschwinden nicht — sie stehen nur an einer erkennbaren Stelle.

Dazu drei statt zwei Grössenstufen für die Kräfte: Netze mittlerer Grösse
(46–120 Knoten, ein grosser Cluster oder ein Parteifilter) liefen bisher im
dichten Modus und ballten sich zusammen.

Ein Schalter **«nur Organisationen mit Verbindung»** (URL `verbunden=1`) nimmt
sie ganz aus dem Bild. Er ist aus, solange niemand ihn setzt, und die Kachel
über der Grafik sagt, wie viele er wegnimmt und dass das nicht «unvernetzt»
heisst.

### Verbunden oder nicht verbunden

Ein enger Filter lässt viele Organisationen ohne Linie stehen. In der Ansicht
«Allianz / Dachverband» sind es 173 von 207 Knoten bei 21 Linien. Solche Knoten
treten jetzt zurück — klein und blass —, während die verbundenen ihre volle
Grösse und Beschriftung behalten. Sie verschwinden aber nicht, und die
Statuszeile hält fest, dass «keine Beziehung der gewählten Art» etwas anderes
ist als eine Abdeckungslücke und erst recht nicht «unvernetzt» heisst.

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
node scripts/test_ngo_netz.js         # 54 Tests, Datenschicht
node scripts/test_ngo_netz_seite.js   # 102 Tests, Netzwerkseite (braucht jsdom)
node scripts/test_ngo_cockpit.js      # 30 Tests, Ueberblicksseite (braucht jsdom)
node scripts/test_ngo_cockpit_v2.js   # 32 Tests, zweite Fassung (braucht jsdom)
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

### Befunde zur Lieferung vom 25.08.2026

Das Handoff-Paket beantwortet **alle** Befunde, die beim Vorgängerpaket 3.7.51
an den Lieferanten zurückgingen:

| Befund bei 3.7.51 | Stand jetzt |
|---|---|
| 11 Kanten ohne jede Quellenangabe | 0 — jede Beziehung löst auf |
| 37 Quellenkennungen ohne Registereintrag (182 Kanten) | 0 offen; 29 Registerzeilen sind als `reconstructed_missing_registry` gekennzeichnet |
| keine Namensvarianten geliefert | 212 Varianten in `person_name_variants.csv` |
| Cluster 0: 623 laut Zuordnung, 489 laut Zusammenfassung | eine Zahl, aus der Zuordnung gezählt |
| Projektion wich um eine Kante ab | G2 22 160 / 489 und G3 13 123 — identisch mit dem Paket |

Was der Build weiterhin bei jedem Lauf ausweist, ohne dass es ein Fehler wäre:

- **29 rekonstruierte Registereinträge.** Für sie ist die Organisationswebsite
  bekannt, nicht die genaue Belegstelle. Das Paket verlangt ausdrücklich, die
  Homepage **nicht** als exakte Fundstelle auszugeben; die Seite hält sich
  daran.
- **135 Organisationen ohne Netzwerkcluster.** Laut Vertrag ist ein leeres
  `cluster_id` «unbekannt / nicht behauptet», kein Fehler und kein Waisenkind.
- **Gleichnamige Personen mit eigener Kennung** werden gemeldet, aber nicht
  zusammengeführt — Identität ist ID-basiert.

**Offen aus der Lieferung**

- **2482 der 2852 Organisationen tragen keine Obergruppe** — unverändert. Das
  Paket liefert dafür neu `category_id`: **17 semantische Kategorien, lückenlos
  für alle 2852 Organisationen**, von `UNTERNEHMEN_DIENSTLEISTUNGEN` (358) bis
  `SONSTIGE` (34). Die Cockpits zeigen bislang weiter die alte Obergruppe und
  damit zu 87 % «ohne Zuordnung». Die Umstellung auf `category_id` ist die
  nächste sinnvolle Änderung an der Darstellung — sie betrifft beide Cockpits,
  den Filter der Netzwerkseite und die Farblegende und ist deshalb bewusst
  nicht Teil der Datenübernahme.
- **`ngo_stammdaten.csv` liegt dem Paket nicht mehr bei.** Damit fehlen in der
  Detailspalte die Profilfelder Zweck, Rechtsform, Gründungsjahr,
  Mitgliederzahl, Vollzeitstellen, ZEWO-Zertifikat und Berichtsjahr. Der ältere
  Bestand wird **nicht** dazugemischt: Der Vertrag lässt nur die `build_inputs`
  zu, und ein Profil aus einer anderen Lieferung wäre eine Angabe ohne Beleg.
  `organizations.csv` bringt dafür Profilstatus, Kategorie, Unterkategorie,
  Klassifikationsart und -güte sowie die formale Mutterorganisation mit.

## 6. Datenpaket aktualisieren

1. Lieferung nach `NGO/lieferung/` kopieren oder entpacken — **nicht** nach
   `NGO/`, dort greift der Zusatzschutz der `.gitignore`. Die Struktur ist egal.
2. `python NGO/build/uebernimm_lieferung.py` — meldet, welche der zehn
   Pflichtdateien gefunden wurden, welche fehlen und wie sich die Zeilenzahlen
   gegenüber dem aktuellen Stand ändern. Dateien, aus denen der Vertrag zu
   bauen verbietet (alles unter `audit/`, der Excel-Schnappschuss), werden
   eigens als gesperrt aufgeführt. Schreibt nichts.
3. `python NGO/build/uebernimm_lieferung.py --uebernehmen` — sichert `NGO/data/`
   nach `NGO/data_vorher/` und kopiert die Pflichtdateien unter dem erwarteten
   Namen hinüber. Dateien einer früheren Lieferung, die das neue Paket nicht
   mehr kennt, bleiben liegen und müssen von Hand aus `NGO/data/` entfernt
   werden — der Build würde sie ohnehin nicht lesen, aber sie täuschen einen
   Bestand vor, den es nicht mehr gibt.
4. `python NGO/build/erzeuge_netzwerk_json.py --nur-pruefen` — meldet jede
   Abweichung von den Sollwerten.
5. Sollwerte im `SOLL`-Block von `erzeuge_netzwerk_json.py` anpassen, wo sich
   der Datenstand bewusst geändert hat. Sie stehen im `README_CLAUDE_CODE.md`
   der Lieferung, nicht in den CSV.
6. `python NGO/build/erzeuge_netzwerk_json.py` — schreibt und kopiert.
7. Alle vier Testreihen laufen lassen: `scripts/test_ngo_netz.js`,
   `scripts/test_ngo_netz_seite.js`, `scripts/test_ngo_cockpit.js`,
   `scripts/test_ngo_cockpit_v2.js`. Die erwarteten Zahlen kommen aus
   `meta.zahlen` der erzeugten Datei; fest verdrahtet ist nur, was der Vertrag
   als Abnahme vorgibt.

---

## 7. Offene Punkte

**Rückfragen an den Datenlieferanten**

- **Obergruppe**: 2482 der 2852 Organisationen tragen keinen Wert; dazu die
  Einzelwerte «Entwicklungszusammenarbeit / Jugend» und «Menschenrechte» mit je
  einer Organisation, die nicht in das Schema passen. Mit `category_id` liegt
  jetzt eine lückenlose Klassierung vor — soll die Obergruppe noch gepflegt
  werden oder ersetzt die Kategorie sie?
- **`person_scope` (P1–P6)** ist weiterhin nicht erläutert und wird nicht
  dargestellt. `active` ist bei allen Zeilen «Ja».
- **Zeitraum der früheren Beziehungen**: In `history_g4.csv` ist `von` bei
  2 von 97 Zeilen gefüllt, `bis` bei 19. Ohne sie bleibt die Historie eine
  Liste ohne zeitliche Einordnung.
- **29 rekonstruierte Registereinträge**: Die Lücke ist sauber gekennzeichnet;
  eine echte Belegstelle im Primärquellenregister wäre trotzdem besser.
- **Profilfelder**: `ngo_stammdaten.csv` ist im Handoff-Paket nicht mehr
  enthalten. Sollen Zweck, Rechtsform, Gründungsjahr, Mitgliederzahl und
  ZEWO-Zertifikat wieder mitgeliefert werden? Bis dahin bleibt die
  Detailspalte ohne Profil.

**Inhaltlich / rechtlich**

- **Namensnennung**: Die Seite zeigt 3127 Personen namentlich, mit Rolle,
  Parteiangabe und Beleg. Vor einer Veröffentlichung ist zu klären, ob die
  Quellenlage je Person die öffentliche Nennung trägt.
- **Nicht übernommen**: Die frühere `ngo_stammdaten.csv` enthielt einen
  «Einflussscore» und einen «Abhängigkeitsscore» sowie eine Spalte «Haltung
  Schweiz–EU». Beides wurde bewusst nie angezeigt — der Auftrag verbietet,
  Strukturmetriken als Einfluss zu lesen, und eine politische
  Haltungszuschreibung je Organisation war nicht Teil des Auftrags. Kommt die
  Datei zurück, gilt das weiter, bis anders entschieden wird.

**Technisch**

- **Darstellung auf `category_id` umstellen.** Die neue Klassierung deckt alle
  2852 Organisationen ab, die gezeigte Obergruppe nur 370. Betroffen sind beide
  Cockpits, der Filter und die Farblegende der Netzwerkseite und das Glossar —
  deshalb als eigener Schritt geführt.
- Visuelle Abnahme in Safari/iOS und Firefox steht aus. Geprüft ist Chrome in
  1440 × 900 und in der schmalsten Breite, die der Kopflos-Modus hergibt
  (504 px). Eine echte Telefonbreite ist **nicht** geprüft.
- Kontrast- und Screenreader-Prüfung mit einem echten Hilfsmittel steht aus.
- **Dichte**: Auf Ebene 2 überlappen sich in den grossen Clustern noch
  Beschriftungen, und die Namen der Anschlussstummel sind lang. Erträglich,
  aber verbesserungsfähig.
- Die Geldflüsse der zweiten Ausbaustufe sind als dritte Perspektive
  vorgesehen. Die Umschaltung ist vorbereitet, die Datenstruktur noch nicht.

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
