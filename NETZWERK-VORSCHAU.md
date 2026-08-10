# NGO-Führungsnetz — Vorschau

Interaktive Darstellung der Führungspersonen und personellen Verflechtungen
Schweizer Organisationen. Die Seite ist **nicht verlinkt** und auf
`noindex, nofollow` gesetzt.

Aufruf: `/netzwerk-verflechtungen-vorschau.html`

> **Kein Zugriffsschutz.** Die Seite liegt auf `main` und ist damit öffentlich
> erreichbar. `noindex` hält nur Suchmaschinen ab; wer die Adresse kennt, sieht
> alles. Der eigentliche Schutz liegt darin, dass ausschliesslich die bereinigte
> Fassung der Daten ausgeliefert wird (siehe Abschnitt 3).

---

## 1. Dateien

**Seite und Laufzeit** (versioniert, öffentlich):

| Datei | Zweck |
|---|---|
| `netzwerk-verflechtungen-vorschau.html` | Vorschauseite |
| `assets/ngo/ngo-daten.js` | Adapter: JSON → Anzeigemodell, Belegebenen, Filter (ohne DOM) |
| `assets/ngo/ngo-ansicht.js` | Zeichnung, Zoom, Aufklappen der Führungspersonen |
| `assets/ngo/ngo-seite.js` | Verdrahtung, Detailspalte, Tabellen |
| `assets/ngo/ngo.css` | Styles der vier Belegebenen und der Detailspalte |
| `assets/ngo/ngo-fuehrungsnetz.json` | bereinigte Daten (Build-Ergebnis) |
| `assets/ngo/ngo-redaktion.json` | Führungsmodelle, Wechsel, Notizen, Verbindungstypen |
| `assets/vendor/d3-force-bundle.min.js` | Layout-Bibliothek, lokal gebündelt (17 KB) |
| `assets/netzwerk/tailwind-seite.min.css` | Tailwind-Produktionsbuild (7,8 KB) |
| `assets/schriften.css`, `assets/fonts/` | lokal eingebundene Schriften (113 KB) |

**Teilprojekt** (`NGO/`, siehe `NGO/README.md`):

| Datei | Zweck |
|---|---|
| `NGO/daten/` | interne Quelldaten — **nicht versioniert**, nie veröffentlicht |
| `NGO/build/erzeuge_public_json.py` | entfernt interne Bereiche aus der Flatfile |
| `NGO/build/erzeuge_redaktion_json.py` | wertet die Bemerkungsdatei aus, setzt Regel 6 durch |
| `NGO/build/verbindungstypen.json` | kuratierte Verbindungstypen mit Belegstelle |
| `NGO/build/build_alles.py` | führt beide Schritte aus und kopiert nach `assets/ngo/` |

**Tests:** `scripts/test_ngo.js` (29), `scripts/test_ngo_seite.js` (28).

Die frühere CSV-Grafik bleibt als Datenstand erhalten
(`assets/data/netzwerk-verflechtungen.csv`, `assets/netzwerk/netzwerk-daten.js`,
`scripts/test_netzwerk.js`, 44 Tests). Sie wird von der Seite nicht mehr
geladen; `assets/netzwerk/netzwerk.css` liefert weiterhin das gemeinsame Layout.

---

## 2. Was die Seite zeigt

Standardmässig sichtbar sind **nur aktuell bestätigte Führungsrollen und
aktuelle direkte Personalunionen**. Die Organisationsansicht zeigt
ausschliesslich Organisationsbrücken; die 296 Rollen werden nie gleichzeitig
als Gesamtgraph dargestellt. Führungspersonen erscheinen erst beim Anklicken
einer Organisation und verschwinden beim erneuten Klick.

### Vier Belegebenen

| Ebene | Grundlage | Anzahl | Standard |
|---|---|---|---|
| aktuell bestätigt | zwei strukturierte, aktuelle, verifizierte Rollen derselben Person | 6 | an |
| strukturell belegt, eingeschränkt | zwei strukturierte Rollen, aber historisch, angekündigt, unaufgelöst oder zu verifizieren | 2 | aus |
| Altbestand | Paare der Vorgängergrafik, laut Flatfile vor Publikation zu verifizieren | 33 | aus |
| nur redaktionell belegt | in den Bemerkungen beschrieben, ohne zweite strukturierte Rolle | 4 | aus |

Die ersten beiden Ebenen ergeben zusammen die acht `organisationBridges` der
Flatfile — die Seite trennt sie nur nach Belegstärke.

### Filter

Belegebene · aktuelle, angekündigte und historische Funktionen · nur mit
politischem Mandat · Partei · Rollenart · Verbindungstyp · Verifizierungsstatus.
Dazu Suche über Personen und Organisationen, Zoom, Verschieben, Vollbild und
Zurücksetzen.

### Detailspalte

Führungsmodell · Führungspersonen und Funktionen · politische Ämter ·
Führungswechsel · Verbindungen mit Verbindungstyp und Belegebene · Notizen aus
der Recherche · Quelle mit Quellenart · Daten- und Prüfstatus.

---

## 3. Datenfluss und Regel 6

```
NGO/daten/NGO_Fuehrungsnetz_Flatfile.json   intern, vollständig
NGO/daten/bemerkungen_aktualisiert.md       intern, redaktionell
        │
        │  python NGO/build/build_alles.py
        ▼
NGO/ausgabe/*.json          →   assets/ngo/*.json        öffentlich
```

**Entfernt werden:** die internen Prüfprotokolle, die Recherchenotizen, der
Freitext im Prüfblock jeder Rolle (es bleiben Status und Prüfdatum) sowie die
interne Schreibweise der Personennamen. Ein Sicherheitsnetz prüft die Ausgabe
strukturell und per Textmarker und bricht ab, statt still durchzulassen.
`--nur-verifiziert` liefert zusätzlich die harte Variante ohne offene und
historische Datensätze (254 statt 296 Rollen).

**Regel 6** — aus der Bemerkungsdatei entsteht keine aktuelle Verbindung — ist
maschinell durchgesetzt, nicht bloss zugesichert: Jeder kuratierte Eintrag in
`verbindungstypen.json` wird gegen die strukturierten Rollen geprüft. Fehlt auf
einer Seite die Rolle, wird kein Verbindungstyp erzeugt; der Fall landet als
redaktioneller Hinweis (Ebene D) mit Belegzeile und Begründung in der Ausgabe.
Von zehn Kandidaten haben zwei bestanden.

Zwei Fälle wären es wert, in den Daten ergänzt zu werden, statt Fussnote zu
bleiben:

- **Hasan Candan** — laut Bemerkung hauptberuflich Projektleiter bei Pro Natura.
  Als Rolle erfasst, würde daraus eine echte berufliche Verbindung.
- **Regula Rytz** — Vorstand der **VCS-Sektion Bern**, nicht des VCS Schweiz.
  Die Sektion als eigener Eintrag mit Verweis auf den Dachverband ergäbe den
  ersten belegten Fall des Typs «Unterorganisation».

Solange das nicht geschieht, zeigen die Filter für «berufliche Verbindung» und
«Unterorganisation» null Treffer.

---

## 4. CSV, JSON und Bemerkungen aktualisieren

1. Neue `NGO_Fuehrungsnetz_Flatfile.json` und `bemerkungen_aktualisiert.md`
   nach `NGO/daten/` legen.
2. `python NGO/build/build_alles.py`
3. Ausgabe der Konsole lesen: nicht zugeordnete Organisationen und
   zurückgewiesene Verbindungen werden namentlich gemeldet.
4. `node scripts/test_ngo.js` und `node scripts/test_ngo_seite.js`

Kennzahlen, Filterauswahl und Tabellen aktualisieren sich automatisch; an der
HTML muss nichts geändert werden.

---

## 5. Lokal starten

```
cd Paket-CH-EU
python -m http.server 8000
```

Dann `http://localhost:8000/netzwerk-verflechtungen-vorschau.html` öffnen.
Ein Aufruf über `file://` wird vom Browser blockiert; die Seite zeigt dann
einen erklärenden Hinweis statt einer leeren Fläche.

---

## 6. Tests

```
node scripts/test_ngo.js         # 29 Tests: Adapter, Belegebenen, Filter, Regel 6
node scripts/test_ngo_seite.js   # 28 Tests: gerenderte Seite, Desktop und Mobil
node scripts/test_netzwerk.js    # 44 Tests: CSV-Auswertung der Vorgängergrafik
```

`test_ngo_seite.js` benötigt `jsdom`. Das Repository hat bewusst kein
`package.json`; fehlt jsdom, überspringt sich der Test:
`npm install --no-save jsdom`.

Geprüft werden unter anderem: dass die ausgelieferte JSON keine internen
Bereiche enthält, dass jede Verbindung der Ebene «aktuell» ausschliesslich auf
aktuellen und verifizierten Rollen beruht, dass die Standardansicht nie den
Gesamtgraph zeigt, dass jeder Filter greift, dass die Detailspalte alle
geforderten Abschnitte füllt und keine internen Prüfinhalte ausgibt — und dass
die Seite in 1440 px und in 390 px fehlerfrei aufbaut.

---

## 7. Vor einer Veröffentlichung noch zu klären

**Inhaltlich**

- 32 Prüffälle sind laut Datenbestand offen, 4 teilweise bestätigt.
  Diese Rollen sind standardmässig sichtbar, sofern aktuell und nicht
  ausdrücklich als zu verifizieren markiert. Zu entscheiden ist, ob offene
  Fälle vor der Publikation ganz entfallen sollen (`--nur-verifiziert`).
- Die Flatfile enthält keine Quellen-URLs, nur Zitatangaben
  (`qualityNotes.directSourceUrlsAvailable = false`).
- Das Feld für politische Angaben ist laut Datenbestand semantisch gemischt
  (`politicalFieldIsSemanticallyMixed = true`); die Seite zeigt es getrennt
  nach ausgewiesenem Mandat und Partei, kann die Mischung aber nicht auflösen.
- Freigabe der Namensnennung für 302 Personen.

**Technisch**

- Abnahme in Safari und Firefox steht aus; geprüft ist Chrome in 1440 px und
  in mobiler Emulation mit 390 px.
- Screenreader-Prüfung mit einem echten Hilfsmittel steht aus. Umgesetzt sind
  fokussierbare Knoten mit `aria-label`, Statusmeldungen über `aria-live`,
  Detailspalte statt reiner Hover-Tooltips, zwei Datentabellen und
  Berücksichtigung von `prefers-reduced-motion`.
- Die vier Belegebenen unterscheiden sich zusätzlich über die Linienform,
  nicht allein über die Farbe.

**Bei einer Veröffentlichung zu tun**

1. `noindex, nofollow` entfernen und Self-Canonical ergänzen.
2. Vorschau-Banner und das Label «Vorschau» ersetzen.
3. Seite in Navigation, Footer, `sitemap.xml` und Suchindex aufnehmen.
4. OG-Metadaten und OG-Bild ergänzen.
5. Datei umbenennen (`ngo/`), Dokumentation nachziehen.

---

Markus Lysser - souveraene-schweiz.ch
