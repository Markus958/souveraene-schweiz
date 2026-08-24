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

Datengrundlage: **Claude_Code_AP31_Final_v3.7.49**, Stand 19.08.2026,
342 Masterorganisationen, 4347 aktuelle Beziehungen, 97 frühere Beziehungen,
3192 Rohpersonen.

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
| `assets/ngo/ngo-netzwerk.json` | Datengrundlage der Seite (739 KB, gzip rund 180 KB) |
| `assets/vendor/d3-force-bundle.min.js` | Layout-Bibliothek, lokal gebündelt (17 KB) |
| `assets/netzwerk/netzwerk.css` | gemeinsames Layout der Netzseiten |
| `assets/netzwerk/tailwind-seite.min.css` | Tailwind-Produktionsbuild (7,8 KB) |
| `assets/schriften.css`, `assets/fonts/` | lokal eingebundene Schriften (113 KB) |

**Teilprojekt** (`NGO/`, siehe `NGO/README.md`):

| Datei | Zweck |
|---|---|
| `NGO/data/` | Quelldateien der Lieferung — **nicht versioniert**, nie veröffentlicht |
| `NGO/doku/CLAUDE_CODE_AUFTRAG.md` | Auftrag zu diesem Umbau |
| `NGO/build/erzeuge_netzwerk_json.py` | Build inklusive Abnahme, Nachrechnung des AP29-Berichts und Quellenauflösung |
| `NGO/build/build_alles.py` | ruft den Build auf |

**Tests:** `scripts/test_ngo_netz.js` (54), `scripts/test_ngo_netz_seite.js` (105),
`scripts/test_ngo_cockpit.js` (30).

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
NGO/data/nodes_organisation.csv          342 Masterorganisationen
NGO/data/ngo_stammdaten.csv              342 Profile (Zweck, Sitz, Rechtsform …)
NGO/data/nodes_personen.csv              3192 technische Rohpersonen
NGO/data/web_edges.csv                   4347 Beziehungen Organisation → Person
NGO/data/historical_edges.csv            97 frühere Beziehungen (G4)
NGO/data/cluster_summary.csv             20 Cluster mit Label und Kennzahlen
NGO/data/cluster_export.csv              Clusterzuordnung je Organisation
NGO/data/sources.csv                     1462 Quellenangaben
NGO/data/ap31_specification.csv          Spezifikation der Lieferung
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

**Kanonisierung der Personennamen**: Unicode normalisieren, klein schreiben,
Interpunktion als Trenner, Whitespace normalisieren, Tokens sortieren,
identische Tokenlisten zusammenführen. Kein Levenshtein-, Fuzzy- oder
phonetisches Matching. Die Originalwerte `person_display` und
`target_person_id` bleiben an jeder Beziehung erhalten.

Ergebnis: 3192 Rohpersonen → 3061 kanonische Personen, 131 Variantengruppen.
Dazu kommen 15 Personen, die nur in früheren Beziehungen vorkommen.

**Cluster** liefert das Paket mit: `cluster_id` steht an jeder Organisation,
`cluster_summary.csv` gibt die Bezeichnungen. Die frühere Louvain-Nachrechnung
ist damit entfallen — der Build übernimmt die Zuordnung und prüft nur noch,
dass jede zugeordnete Kennung auch beschrieben ist. Cluster 0 sind die 117
Organisationen ohne erfasste Beziehung.

**Projektion auf Organisationen**: Über gemeinsam erfasste Personen zählt je
Person und Organisation das höchste Rollengewicht; das Kantengewicht ist
konservativ das kleinere der beiden. Direkte Master-zu-Master-Beziehungen
kommen hinzu und bleiben gekennzeichnet.

> **Abweichung zum Paket.** `cluster_export.csv` weist 710 Projektionskanten und
> 117 Organisationen ohne Projektionskante aus. Aus `web_edges.csv` lassen sich
> 663 Kanten und 126 ohne Projektionskante rechnen. Die Differenz ist nicht
> erklärbar aus der Lieferung: 55 Organisationen haben im Export einen höheren
> G2-Grad als aus den gelieferten Beziehungen entstehen kann, in neun Fällen
> einen Grad grösser null bei null gelieferten Beziehungen — eine davon,
> AvenirSocial, hat überhaupt keine Beziehungszeile. Das Paket stützt seine
> Projektionszahlen also auf Daten ausserhalb des Exports. Die Seite zeigt
> deshalb die eigene, aus den gelieferten Beziehungen nachvollziehbare Rechnung;
> der Build meldet die Abweichung bei jedem Lauf. Für den Datenlieferanten ist
> das eine offene Frage.

**Quellen**: `source_ids_all` listet je Beziehung eine oder mehrere Kennungen,
**mit Pipe getrennt**. Alle 582 verwendeten Kennungen lösen in `sources.csv`
auf. 29 davon sind Reference-only-Einträge ohne Registerzeile; sie werden als
Datenlücke ausgewiesen, statt Herausgeber, Titel oder Link zu erfinden.

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

`/ngo/cockpit.html` fasst zusammen, was der Bestand hergibt: sechs Kennzahlen,
die Verteilung nach Obergruppe und nach Art der Beziehung, die zehn Personen mit
den meisten Organisationen, die zehn Organisationen mit den meisten erfassten
Personen, die Parteiangaben und eine statische Vorschau der zwanzig Cluster.
Vier Kacheln führen von dort in die Netzwerkseite.

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
denen eine Person mit dieser Angabe erfasst ist (bei der SP 73 von 342). Der
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
**Verteilungen** ginge das nicht: Ihre Summe muss den Bestand ergeben (342
Organisationen, 4347 Beziehungen), und ein Test prüft das. Dort stehen vier
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

### Drei Ebenen

Mit 342 Organisationen ist ein Gesamtnetz nicht mehr lesbar. Der Einstieg ist
deshalb die Clusterebene.

| Ebene | Knoten | Linien |
|---|---|---|
| 1 — alle Cluster | 20 | 29 |
| 2 — ein Cluster (grösster) | 36 plus 7 Anschlüsse | 92 |
| 3 — Gesamtnetz | 342 | 498 |

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

**Ebene 3** ist das bisherige Gesamtnetz, über «Gesamtnetz zeigen» erreichbar.
Es bleibt zugänglich — wer die Rohstruktur sehen will, soll das können.

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
Gesellschaft für Aussenpolitik. Im Gesamtnetz mit 342 Knoten wäre das nicht zu
erkennen: Die drei Linien sähen aus wie alle anderen.

Der Fokus ist über die Brotkrumen verlassbar und steht in der URL (`person`).
Aus der Detailspalte führt der Knopf «Nur diese Person und ihre Organisationen
zeigen» dorthin. In dünnen Ansichten wird die Schrift grösser — bei vier Knoten
ist Platz genug.

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
node scripts/test_ngo_netz_seite.js   # 105 Tests, Netzwerkseite (braucht jsdom)
node scripts/test_ngo_cockpit.js      # 30 Tests, Ueberblicksseite (braucht jsdom)
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

1. Neue Dateien nach `NGO/data/` legen — **nicht** nach `NGO/`, dort greift nur
   der Zusatzschutz der `.gitignore`. Der Build erwartet genau die neun oben
   genannten Dateinamen und bricht ab, sobald einer fehlt.
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

**Rückfragen an den Datenlieferanten**

- **Projektionszahlen**: `cluster_export.csv` nennt 710 Projektionskanten und
  117 Isolate, aus `web_edges.csv` ergeben sich 663 und 126. Neun
  Organisationen haben im Export einen G2-Grad grösser null, obwohl die
  Lieferung für sie keine oder zu wenige Beziehungen enthält. Woher stammen
  die zusätzlichen Kanten?
- **Obergruppe**: vier Organisationen ohne Wert, dazu die Einzelwerte
  «Entwicklungszusammenarbeit / Jugend» und «Menschenrechte», die nicht in das
  Schema der drei Obergruppen passen. Die Seite führt sie als «ohne Zuordnung»
  beziehungsweise als eigene Einträge im Filter.
- **29 Reference-only-Quellen** ohne Registerzeile. Die Lücke ist ausgewiesen;
  eine Ergänzung im Primärquellenregister wäre besser.
- **`person_scope` (P1–P6)** ist weiterhin nicht erläutert und wird nicht
  dargestellt. `active` ist bei allen Zeilen «Ja».
- **Zeitraum der früheren Beziehungen**: `von` und `bis` sind in
  `historical_edges.csv` weitgehend leer. Ohne sie bleibt die Historie eine
  Liste ohne zeitliche Einordnung.

**Inhaltlich / rechtlich**

- **Namensnennung**: Die Seite zeigt 3061 Personen namentlich, mit Rolle,
  Parteiangabe und Beleg. Vor einer Veröffentlichung ist zu klären, ob die
  Quellenlage je Person die öffentliche Nennung trägt.
- **Nicht übernommen**: `ngo_stammdaten.csv` enthält einen «Einflussscore» und
  einen «Abhängigkeitsscore» sowie eine Spalte «Haltung Schweiz–EU». Beides
  wird bewusst nicht angezeigt — der Auftrag verbietet, Strukturmetriken als
  Einfluss zu lesen, und eine politische Haltungszuschreibung je Organisation
  war nicht Teil des Auftrags. Falls das anders gewollt ist, braucht es eine
  ausdrückliche Entscheidung.

**Technisch**

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
