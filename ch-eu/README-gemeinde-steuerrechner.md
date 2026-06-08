# Gemeinde-Steuerrechner zum Paket CH–EU

Neue, **vorerst unverlinkte** Rechner-Seite: `ch-eu/gemeinde-steuerrechner.html`
(Branch `feature/gemeinde-steuerrechner-ch-eu`, `<meta robots=noindex>`).

Sie verbindet die **heutige Steuerbelastung** einer gewählten Gemeinde mit dem **rechnerischen
CH–EU-Zusatzbetrag** und erlaubt eine **Vergleichsgemeinde**. Es ist eine **Modellrechnung**,
keine individuelle Steuerprognose.

## Angelegte / geänderte Dateien

| Datei | Art | Inhalt |
|---|---|---|
| `ch-eu/gemeinde-steuerrechner.html` | **neu** | Die Rechner-Seite (Grundgerüst, Header/Footer, Stylesheet, Komponenten der Website wiederverwendet). |
| `assets/data/steuer-multiplikatoren.json` | **neu** | Steuerfüsse natürliche Personen je Gemeinde (bfs-keyed): Einkommen + Vermögen, Kirche je Konfession. Steuerjahr 2026, Quelle ESTV. |
| `assets/data/tarife.json` | **neu** | Einkommenssteuer-Tarife (Bund + 26 Kantone), als Stufentabellen. |
| `assets/data/vermoegenssteuer.json` | **neu** | Vermögenssteuer-Tarife (26 Kantone). |

**Keine bestehende Datei wurde geändert.** Bestehende Seiten, Navigation, Header, Footer,
Startseite, Dossierstruktur, Glossarlogik, Routing, Query-/State-Mechanismen, Datumsanzeigen und
der bestehende **Kostenrechner** (`schweizer-beitrag-kostenmodul.html`) bleiben unverändert.

## Wiederverwendete Komponenten (kein neues Design)

- **Gemeindedaten/-auswahl:** dieselbe `assets/data/gemeinden-steuerkraft.json` wie der Kostenrechner
  (2&rsquo;131 Gemeinden, `meta.steuerbares_einkommen_np_schweiz`); identisches Such-Dropdown-Muster.
- **Szenario-Logik & Beträge:** dieselben drei Kostenszenarien wie der Kostenrechner
  (konservativ 2&rsquo;709&rsquo;520&rsquo;000 · mittel 4&rsquo;336&rsquo;000&rsquo;000 · hoch 7&rsquo;018&rsquo;300&rsquo;000 CHF p.&nbsp;a.).
- **Tooltips:** bestehendes `.km-tip`-System (CSS, `data-tip`). **Reihenfolge** der Tooltips folgt
  den sichtbaren Eingaben und Ergebnissen.
- **Akkordeon / Methodik:** bestehendes `.km-erklaer`-Muster.
- **Farben/Typografie:** ausschliesslich globale Variablen (`--rot`, `--blau`, …) und Schriften der Website.

## Neue Funktion

Eingaben: Gemeinde, Vergleichsgemeinde (optional), steuerbares Einkommen, steuerbares Vermögen,
Zivilstand, Konfession, Kinder, Szenario (Default **mittel**).

Ausgabe je Gemeinde in drei Blöcken (Desktop nebeneinander, Mobile untereinander):
1. **Heutige Steuerbelastung** – Bundessteuer, Kantonssteuer, Gemeindesteuer, Kirchensteuer
   (falls anwendbar), Vermögenssteuer, Total.
2. **Paket CH–EU** – Szenario, rechnerischer CH–EU-Zusatzbetrag pro Jahr, Anteil an heutiger Belastung.
3. **Vergleichsgrösse** – heutige Belastung + Zusatzbetrag = Vergleichsgrösse total.

Bei gewählter Vergleichsgemeinde zusätzlich die Differenzen (Steuerbelastung, Zusatzbetrag,
Vergleichsgrösse total). **Keine Monatswerte.** Der vorgeschriebene Methodik-Hinweis erscheint
direkt unter dem Ergebnis.

## Berechnung (Methodik)

- **Steuerjahr 2026.** Einfache Steuer = Tariffunktion auf das eingegebene steuerbare Einkommen
  bzw. Vermögen; Kantons-/Gemeinde-/Kirchensteuer = einfache Steuer × jeweiliger Steuerfuss.
- **Bund:** Die Eingabe gilt als **kantonal** steuerbares Einkommen. Das bundessteuerbare Einkommen
  wird über einen kantonsspezifischen Abzugs-Offset (aus der ESTV-Berechnung gemessen, ledig/verheiratet,
  Standardfall ohne Kinder) geschätzt; darauf wird der Bundestarif angewandt.
- **CH–EU-Zusatzbetrag** = Szenario-Total × (steuerbares Einkommen / 296&rsquo;578 Mio. CHF,
  steuerbares Einkommen aller natürlichen Personen CH, ESTV 2022).
- **Rundung:** Einkommen auf CHF 100, Vermögen auf CHF 1&rsquo;000 abgerundet; Beträge auf ganze Franken.

## Verifikation

Die Tarif-/Steuerlogik wurde gegen die **amtliche ESTV-Berechnung** (`API_calculateDetailedTaxes`,
gleiche Engine wie der offizielle ESTV-Steuerrechner) verifiziert.

- **Anker Zürich** (kantonal steuerbar 80&rsquo;000, ledig): Kantonssteuer 4&rsquo;152, Gemeindesteuer 5&rsquo;200,
  Bundessteuer 1&rsquo;473 (auf bundessteuerbarem 81&rsquo;600 = 80&rsquo;000 + Offset 1&rsquo;650).
- **Totale stimmen mit ESTV überein** (nach Offset-Bereinigung): z.&nbsp;B. ZH 17&rsquo;504, BE 26&rsquo;512,
  BS 29&rsquo;929, OW 18&rsquo;001 – Abweichung ≤ ~1 CHF (Rundung). Kantons-, Gemeinde- und Vermögenssteuer ≤ ~0.3 %.
- **VS** (formelbasiert): einfache Steuer aus der ESTV-Berechnung abgetastet (Stützwert-Tabellen,
  ledig/verheiratet, kantonale und kommunale Basis); Verheiratetenentlastung korrekt abgebildet.
- Logik-Test reproduzierbar: `node steuerdaten/raw/_node_test2.js` (Workspace, nicht Teil dieses Commits).

## Methodisch offene / datenabhängige Punkte

- **Bund-Abzugs-Offset:** Die Eingabe wird als kantonal steuerbares Einkommen interpretiert, das
  bundessteuerbare Einkommen über einen kantonsspezifischen Offset geschätzt. Der Offset ist für die
  meisten Kantone einkommensunabhängig (Bundessteuer dann exakt), für **VD, LU, ZG** und bei **Kindern**
  variiert er → Bundessteuer dort leicht approximativ.
- **Kinder / Familienermässigungen:** Eingabe ist bereits ein Wert nach Abzügen; tarifliche
  Kinderermässigungen / Abzüge vom Steuerbetrag werden **nicht** angewandt (Feld strukturell geführt).
- **Kirchensteuer:** modelliert als Fuss × einfache Steuer; in **VD/TI** nicht über den Steuerfuss
  erhoben (= 0), in **JU/UR** wegen abweichender kantonaler Systematik nicht ausgewiesen
  („kantonsspezifisch"), in **GE/FR/BS/SO** vereinfacht (mit „≈" markiert).
- **Genève:** „rabais d'impôt" nicht modelliert → GE-Werte leicht überhöht.
- **Datenstände:** Tarife/Steuerfüsse 2026; CH–EU-Verteilbasis ESTV 2022; Einwohner BFS 2024
  (wie beim bestehenden Kostenrechner).

## Datenherkunft

Die drei neuen JSON-Dateien wurden aus dem offiziellen ESTV-Steuerrechner
(`swisstaxcalculator.estv.admin.ch`, Steuerjahr 2026) erzeugt und gegen dessen Berechnung verifiziert.
Build-/Validierungsskripte liegen im Workspace `steuerdaten/` (nicht Teil dieses Commits, um den
Branch schlank zu halten).
