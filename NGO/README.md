# Teilprojekt NGO

Arbeitsordner für das Teilprojekt «NGO-Übersicht Schweiz / Führungsnetz».
Die Netzwerkgrafik ist nur eines von mehreren Ergebnissen.

## Warum hier nicht alles versioniert wird

Der Ordner liegt im Website-Repository, GitHub Pages veröffentlicht aber den
gesamten Checkout (`deploy.yml`, `path: '.'`). Alles, was committet wird, ist
im Internet abrufbar.

Deshalb sind `data/` und `ausgabe/` in der `.gitignore` des Repositorys
ausgeschlossen. Sie liegen lokal im Ordner, werden aber nie committet und
gelangen damit nie auf den Webserver. Versioniert sind nur `README.md`,
`build/` und `doku/`.

**Nicht mit `git add -f` erzwingen.** Eine einmal committete interne Datei ist
über die URL abrufbar und bleibt zusätzlich in der Git-Historie.

## Ordner

| Ordner | Inhalt |
|---|---|
| `lieferung/` | Eingang: hierhin kommt eine neue Lieferung, Struktur egal — **nicht versioniert** |
| `data/` | Quelldateien der aktuellen Lieferung, zehn CSV — **nicht versioniert** |
| `data_vorher/` | Sicherung des vorigen Stands, beim Uebernehmen angelegt — **nicht versioniert** |
| `build/` | Skripte, die aus den Quelldaten die veröffentlichungsfähigen Dateien erzeugen |
| `ausgabe/` | Ergebnis der Build-Skripte — nicht versioniert; von hier nach `assets/ngo/` kopiert |
| `doku/` | Notizen, Methodik, Entscheide |

## Datenfluss

```
data/organizations.csv          2852 Masterorganisationen, category_id, cluster_id
data/persons.csv                3143 Personen, 16 davon nur für die G4-Historie
data/person_name_variants.csv   212 zweite Schreibweisen
data/edges_current.csv          6779 aktuelle Beziehungen Organisation → Person
data/edge_sources.csv           Beziehung → Quelle, die verbindliche Belegschicht
data/history_g4.csv             97 frühere Beziehungen, strikt getrennt
data/history_sources.csv        Historienbeziehung → Quelle
data/source_registry.csv        1463 Quellen, 29 davon rekonstruiert
data/categories.csv             17 semantische Kategorien für die Anzeige
data/cluster_assignments.csv    Organisation → Netzwerkcluster
data/cluster_dictionary.csv     Cluster 0 bis 63 mit Bezeichnung (Kür)
        │
        ├─ build/erzeuge_netzwerk_json.py
        │     Identität über person_id, Belege, Projektion G2/G3, Abnahme
        ▼
ausgabe/ngo-netzwerk.json       →  assets/ngo/ngo-netzwerk.json  (committet)
```

Der Zwischenschritt ist nicht optional: Was die Seite per `fetch` lädt, kann
jede Besucherin herunterladen. Ein Filtern erst im Browser verbirgt nichts.

**Achtung, Ordnerkollision.** Auf Windows sind `NGO/` und `ngo/` derselbe
Ordner. Die interne Werkstatt und die veröffentlichte Seite liegen physisch
übereinander; Git führt sie als getrennte Pfade. Deshalb schliesst die
`.gitignore` sowohl `NGO/data/` als auch `ngo/data/` aus. Auf einem
case-sensitiven System sind es zwei Ordner — dort wäre alles, was unter `NGO/`
committet ist, unter `/NGO/` abrufbar.

**Datenlieferungen gehören nach `lieferung/`, nicht nach `NGO/`.** Der Build
liest ausschliesslich aus `data/` und erwartet dort genau die zehn
Pflichtdateien des Datenflusses oben; fehlt eine, bricht er ab. Es sind exakt
die `build_inputs` aus `config/build_contract.json` der Lieferung. Aus allem
unter `audit/` und aus dem Excel-Schnappschuss darf laut Vertrag **nicht**
gebaut werden; `uebernimm_lieferung.py` führt diese Dateien eigens als gesperrt
auf.

Weil Lieferungen als ZIP, mit Unterordnern oder mit Zusatzdateien kommen, gibt
es dazwischen einen Schritt:

```
python NGO/build/uebernimm_lieferung.py                 # nur berichten
python NGO/build/uebernimm_lieferung.py --uebernehmen   # nach data/ kopieren
```

Das Skript sucht die zehn Pflichtdateien irgendwo unter `lieferung/`, meldet
Fehlende und zeigt, wie sich die Zeilenzahlen gegenüber dem aktuellen Stand
ändern. Es bricht ab, wenn ein Dateiname mehrfach vorkommt — welche Fassung
gilt, muss die Lieferung entscheiden. Beim Übernehmen wird der bisherige Stand
nach `data_vorher/` gesichert.

## Aktueller Stand

Übergabepaket **NGO_Claude_Code_Handoff_2026-08-25_r1**
(Masterversion `NGO-CC-2026-08-25-r1`), Stand 25.08.2026, 2852
Masterorganisationen, 6779 aktuelle Beziehungen, 3143 Personen. Die
Paketdokumentation (`README_CLAUDE_CODE.md`, `config/build_contract.json`,
`docs/`, `schema/`, `manifest.json`) liegt versioniert in
`doku/handoff-2026-08-25/`.

Gegenüber 3.7.51 neu: Identität ist ID-basiert (`person_id`, nie der Name), der
Beleg steht ausschliesslich in `edge_sources.csv`, und `category_id` trennt die
semantische Anzeigegruppe von der Netzwerkeigenschaft `cluster_id`. Alle
Beziehungen lösen jetzt auf eine Registerquelle auf; die Projektion (G2
22 160 / 489, G3 13 123) stimmt mit dem Paket überein.

Nicht mehr im Paket: `ngo_stammdaten.csv`. Die Profilfelder (Zweck,
Rechtsform, Gründungsjahr, Mitgliederzahl, ZEWO) fehlen deshalb in der
Detailspalte; ältere Stände werden nicht dazugemischt.

`NGO-0172` existiert im eingefrorenen Master nicht und darf nicht erzeugt
werden; der Build prüft das.

Frühere Stände (Führungsnetz 100 Organisationen, Paket 3.7.1 mit 144
Organisationen) sind am 24.08.2026 gelöscht worden. Sie waren nicht
versioniert und sind damit nicht mehr wiederherstellbar; der Build hat sie
seit der Umstellung auf 3.7.49 nicht mehr gelesen.

## Build

```
python NGO/build/erzeuge_netzwerk_json.py                # bauen und schreiben
python NGO/build/erzeuge_netzwerk_json.py --nur-pruefen  # nur nachrechnen
```

Der Build prüft die Abnahmepunkte aus `doku/paket-3.7.49/CLAUDE_CODE_HANDOFF.md`
und **bricht ab, ohne etwas zu schreiben**, sobald einer verletzt ist. Er meldet
zusätzlich, wo die Projektionszahlen des Pakets von der eigenen Rechnung
abweichen.

## Bezug zur Website

Veröffentlichte Bestandteile liegen im Repo `Paket-CH-EU`:

- Seite: `ngo/index.html`, aufrufbar unter `/ngo/` (noindex, unverlinkt, ohne Zugriffsschutz)
- Weiterleitung: `netzwerk-verflechtungen-vorschau.html` → `/ngo/`, als Übergang
- Code: `assets/ngo/`, `assets/vendor/`, `assets/fonts/`, `assets/schriften.css`
- Daten: `assets/ngo/ngo-netzwerk.json`
- Doku: `NETZWERK-VORSCHAU.md`

Die Dateien des abgelösten Führungsnetzes und der ersten CSV-Grafik sind
entfernt; sie bleiben über die Git-Historie erreichbar.

Der Umzug nach `ngo/` ist erfolgt.

Merkhilfe: `NGO/` ist die Werkstatt (intern), `ngo/` und `assets/ngo/` sind
das Schaufenster (öffentlich).

---

Markus Lysser - souveraene-schweiz.ch
