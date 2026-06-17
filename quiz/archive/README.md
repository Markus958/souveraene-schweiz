# Archiv – Altbestand quiz_fragen.json

Dieser Ordner enthält archivierte Fragendateien, die **nicht mehr aktiv** sind.

## Warum archiviert?

Der Bestand R6–R19 (1301 Fragen) wurde archiviert, weil er methodisch nicht den
aktuellen Anforderungen entspricht. Die Methode wurde umgestellt: Fragen sollen
Inhaltsverständnis testen, nicht Artikelnummern oder Gesetzestext-Auswendiglernerei.
Zielpublikum sind normale Stimmbürger, keine Juristen.

## Bekannte Probleme im Altbestand

- **Satzfragmente** als Antwortoptionen (zusammenhanglos, ohne Kontext)
- **Artikelnummer-Logik**: Fragen testen, ob man Artikelnummern kennt – nicht ob
  man den Inhalt versteht
- **Zusammenhanglose Optionen**: Antworten beziehen sich auf verschiedene Abkommen
  ohne inhaltliche Logik
- **Encoding-Probleme**: UTF-8-Sonderzeichen teils defekt (Ä, ö, ü als Artefakte)
- **Falsches Schema**: Flaches Array statt Objekt mit `questions`-Wrapper; Felder
  `korrekte_option`/`optionen`/`fragetyp` statt `correct_option`/`options`/`format`

## Verwendung

**NICHT aus diesem Ordner laden.** Die App liest ausschliesslich `quiz/quiz_fragen.json`.

Dieser Bestand darf als **Rohmaterial** für eine methodenkonforme Neufassung
konsultiert werden. Status der Altfragen: «überarbeiten» (nicht «verwerfen»).

## Enthaltene Dateien

| Datei | Inhalt | Zeitraum |
|---|---|---|
| `quiz_fragen_R6_R19_DEPRECATED_2026-06-17.json` | 1301 Fragen, Releases R6–R19 | 2026 (Altbestand) |
