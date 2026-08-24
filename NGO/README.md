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
| `data/` | Quelldateien der aktuellen Lieferung, neun CSV — **nicht versioniert** |
| `build/` | Skripte, die aus den Quelldaten die veröffentlichungsfähigen Dateien erzeugen |
| `ausgabe/` | Ergebnis der Build-Skripte — nicht versioniert; von hier nach `assets/ngo/` kopiert |
| `doku/` | Notizen, Methodik, Entscheide |

## Datenfluss

```
data/nodes_organisation.csv     342 Masterorganisationen, mit cluster_id
data/nodes_personen.csv         3192 technische Rohpersonen
data/web_edges.csv              4347 aktuelle Beziehungen Organisation → Person
data/historical_edges.csv       97 frühere Beziehungen, strikt getrennt
data/cluster_export.csv         Clusterzuordnung und Kennzahlen des Pakets
data/cluster_summary.csv        20 Cluster mit Bezeichnung
data/sources.csv                Quellenregister, 1462 Zeilen
data/ngo_stammdaten.csv         vollständige Organisationsprofile
        │
        ├─ build/erzeuge_netzwerk_json.py
        │     Kanonisierung, Projektion G2/G3, Abnahme
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

**Datenlieferungen gehören nach `data/`, nicht nach `NGO/`.** Der Build liest
ausschliesslich aus `data/` und erwartet dort genau die neun Dateinamen des
Datenflusses oben; fehlt einer, bricht er ab.

## Aktueller Stand

Übergabepaket **Claude_Code_AP31_Final_v3.7.49**, Stand 19.08.2026,
342 Masterorganisationen. Die Paketdokumentation (README, VALIDATION,
CLAUDE_CODE_HANDOFF, manifest.json) liegt in `doku/paket-3.7.49/`.

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
