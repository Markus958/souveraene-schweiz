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
daten/NGO_Fuehrungsnetz_Flatfile.json   (intern, mit reviewLog + researchNotes)
        │
        ├─ build/erzeuge_public_json.py  ← entfernt interne Felder und offene Datensätze
        ▼
ausgabe/ngo-fuehrungsnetz.json          (öffentlich unbedenklich)
        │
        ▼
assets/ngo/ngo-fuehrungsnetz.json       → committet, wird von der Seite geladen
```

Der Zwischenschritt ist nicht optional: Was die Seite per `fetch` lädt, kann
jede Besucherin herunterladen. Ein Filtern erst im Browser verbirgt nichts.

## Aktueller Stand

In `daten/` liegen bereits:

- `bemerkungen.md` — redaktionelle Ergänzungen (Stand aus Downloads)
- `fuehrungspersonen.csv` — Rollenliste
- `NGO_Fuehrungspersonen_Pruefliste.csv` — offene Prüfpunkte
- `Netzwerk_personelle_Verflechtungen_Daten_rein.csv` — Datenbasis der ersten Grafik

- `NGO_Fuehrungsnetz_Flatfile.json` — Datengrundlage der Grafik (100 Organisationen, 302 Personen, 296 Rollen)
- `bemerkungen_aktualisiert.md` — redaktionelle Ergänzung

## Build

```
python NGO/build/build_alles.py [--nur-verifiziert]
```

Erzeugt `ausgabe/ngo-fuehrungsnetz.json` und `ausgabe/ngo-redaktion.json` und
kopiert beide nach `assets/ngo/`. Die Konsole meldet namentlich, welche
Organisationen nicht zugeordnet und welche Verbindungen nach Regel 6
zurückgewiesen wurden.

## Bezug zur Website

Veröffentlichte Bestandteile liegen im Repo `Paket-CH-EU`:

- Seite: `netzwerk-verflechtungen-vorschau.html` (noindex, unverlinkt, ohne Zugriffsschutz)
- Code: `assets/ngo/`, `assets/vendor/`, `assets/fonts/`, `assets/schriften.css`
- Daten: `assets/ngo/ngo-fuehrungsnetz.json`, `assets/ngo/ngo-redaktion.json`
- Doku: `NETZWERK-VORSCHAU.md`

Beim Umbau auf das Führungsnetz ist vorgesehen, Seite und Assets nach
`ngo/` beziehungsweise `assets/ngo/` zu verschieben — das ändert die
öffentliche URL und geschieht erst nach ausdrücklicher Freigabe.

Merkhilfe: `NGO/` ist die Werkstatt (intern), `ngo/` und `assets/ngo/` sind
das Schaufenster (öffentlich).

---

Markus Lysser - souveraene-schweiz.ch
