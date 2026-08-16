# Teilprojekt NGO

Arbeitsordner für das Teilprojekt «NGO-Übersicht Schweiz / Führungsnetz».
Die Netzwerkgrafik ist nur eines von mehreren Ergebnissen.

## Warum hier nicht alles versioniert wird

Der Ordner liegt im Website-Repository, GitHub Pages veröffentlicht aber den
gesamten Checkout (`deploy.yml`, `path: '.'`). Alles, was committet wird, ist
im Internet abrufbar.

Deshalb sind `daten/` und `ausgabe/` in der `.gitignore` des Repositorys
ausgeschlossen. Sie liegen lokal im Ordner, werden aber nie committet und
gelangen damit nie auf den Webserver. Versioniert sind nur `README.md`,
`build/` und `doku/`.

**Nicht mit `git add -f` erzwingen.** Eine einmal committete interne Datei ist
über die URL abrufbar und bleibt zusätzlich in der Git-Historie.

## Ordner

| Ordner | Inhalt |
|---|---|
| `daten/` | interne Quelldaten (JSON, CSV, Bemerkungen, Prüfliste) — **nicht versioniert** |
| `build/` | Skripte, die aus den Quelldaten die veröffentlichungsfähigen Dateien erzeugen |
| `ausgabe/` | Ergebnis der Build-Skripte — nicht versioniert; von hier nach `assets/ngo/` kopiert |
| `doku/` | Notizen, Methodik, Entscheide |

## Datenfluss

```
daten/ngo_nodes_organisation.csv     144 Masterorganisationen
daten/ngo_nodes_personen_raw.csv     1852 technische Rohpersonen
daten/ngo_edges_current.csv          2628 Beziehungen Organisation → Person
daten/ngo_clusters_analysis.csv      AP29-Bericht (Sollwerte der Abnahme)
daten/network_metadata.json          Kennzahlen, Abdeckungslücken
        │
        ├─ build/erzeuge_netzwerk_json.py
        │     Kanonisierung, Projektion G2/G3, Louvain, Abnahme
        ▼
ausgabe/ngo-netzwerk.json            →  assets/ngo/ngo-netzwerk.json  (committet)
```

Der Zwischenschritt ist nicht optional: Was die Seite per `fetch` lädt, kann
jede Besucherin herunterladen. Ein Filtern erst im Browser verbirgt nichts.

**Datenlieferungen gehören nach `daten/`, nicht nach `NGO/`.** Die `.gitignore`
schliesst inzwischen auch `NGO/*.csv`, `NGO/*.json` und `NGO/*.xlsx` aus — das
ist ein Auffangnetz, kein Ablageort.

## Aktueller Stand

Datenpaket **NGO_Datenbank_Master 3.7.1 – AP32 abgeschlossen**, Datenstand
16.08.2026. In `daten/` liegen:

- `ngo_nodes_organisation.csv`, `ngo_nodes_personen_raw.csv`,
  `ngo_edges_current.csv`, `ngo_clusters_analysis.csv`, `network_metadata.json`,
  `QA_PACKAGE.json` — aktuelles Paket, Grundlage der Seite
- `NGO_Fuehrungsnetz_Flatfile.json`, `bemerkungen*.md`, `fuehrungspersonen.csv`,
  `NGO_Fuehrungspersonen_Pruefliste.csv`,
  `Netzwerk_personelle_Verflechtungen_Daten_rein.csv` — frühere Stände
  (Führungsnetz mit 100 Organisationen, erste CSV-Grafik)

Der Auftrag zum Umbau liegt in `doku/CLAUDE_CODE_AUFTRAG.md`.

## Build

```
python NGO/build/erzeuge_netzwerk_json.py                # bauen und schreiben
python NGO/build/erzeuge_netzwerk_json.py --nur-pruefen  # nur nachrechnen
python NGO/build/build_alles.py                          # dasselbe über den Sammelaufruf
```

Der Build rechnet die Kennzahlen des AP29-Berichts nach — Kanonisierung,
Projektion, Clusterprofile, Brückenorganisationen — und **bricht ab, ohne etwas
zu schreiben**, sobald eine Zahl abweicht. Die Konsole gibt die vollständige
Abnahme aus, dazu die acht Abdeckungslücken namentlich und alle 80
zusammengeführten Namensvarianten.

Die Skripte `erzeuge_public_json.py` und `erzeuge_redaktion_json.py` gehören zum
abgelösten Führungsnetz und werden von `build_alles.py` nicht mehr aufgerufen.

## Bezug zur Website

Veröffentlichte Bestandteile liegen im Repo `Paket-CH-EU`:

- Seite: `netzwerk-verflechtungen-vorschau.html` (noindex, unverlinkt, ohne Zugriffsschutz)
- Code: `assets/ngo/`, `assets/vendor/`, `assets/fonts/`, `assets/schriften.css`
- Daten: `assets/ngo/ngo-netzwerk.json`
- Doku: `NETZWERK-VORSCHAU.md`

Die Dateien des abgelösten Führungsnetzes (`ngo-fuehrungsnetz.json`,
`ngo-redaktion.json`, `ngo-daten.js`, `ngo-ansicht.js`, `ngo-seite.js`,
`ngo.css`) liegen noch im Repo, werden aber von keiner Seite mehr geladen.

Vorgesehen ist weiterhin, Seite und Assets nach `ngo/` beziehungsweise
`assets/ngo/` zu verschieben — das ändert die öffentliche URL und geschieht erst
nach ausdrücklicher Freigabe.

Merkhilfe: `NGO/` ist die Werkstatt (intern), `ngo/` und `assets/ngo/` sind
das Schaufenster (öffentlich).

---

Markus Lysser - souveraene-schweiz.ch
