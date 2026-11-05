# Vergleichs- und Evaluationsbericht: KI-Redaktion

## Ausgangslage

Datengrundlage ist der reale Daily Run `41996926103` vom 5. November 2026 sowie die
bereits nachvollzogenen Originalquellen. Alle fünf Referenzmeldungen waren technisch
verfügbar und vom Collector gefunden. Der frühere Ausschluss entstand nicht durch
fehlende Quellenabdeckung, sondern durch Legacy-Score/Clusterzustand. Die dazugehörige
Korrektur liegt im vorgelagerten PR #24.

## Referenzvergleich

| Fall | Collector | Inhalt für KI | Erwartete redaktionelle Beurteilung | Mehrwert gegenüber altem Filter |
|---|---|---|---|---|
| EFK Winterreserve | gefunden | Titel, amtliche Quelle, Sparbetrag/Mechanismus | prüfen; hohe Staatsfinanz- und Energie-Relevanz | versteht belegtes Sparpotenzial statt einzelner Keywords |
| EU-Fahrzeugregeln | gefunden | amtliche Meldung, Regel-/Etikettenänderung | prüfen; konkrete Rechtsübernahme und Marktwirkung | bewertet den Mechanismus der Regelübernahme |
| IV-Finanzierung | gefunden | amtliche Meldung plus Medienwinkel | prüfen; Verteilung und Sozialversicherungsfinanzierung | trennt Primärquelle und journalistischen Gutverdiener-Winkel |
| Amaudruz/MEI | gefunden | NZZ-Titel, Untertitel/Anriss; Paywall kenntlich | prüfen; Bundesratskandidatur und Umsetzung eines Volksentscheids | erkennt politische Bedeutung ohne Spezial-Keywordregel |
| Pflegende Angehörige | gefunden | BAG-Mitteilung und konkrete Regulierungsfrage | prüfen; Kosten, Fehlanreize und Familienwirkung | verbindet Regulierung, OKP und Vollzugsfolgen |

Diese Fälle sind keine Pflichtauswahl. Die endgültige Stufe B muss sie gegen alle
Tagesmeldungen vergleichen und darf weniger als zehn wählen.

## Reproduzierbare Evaluation

Die versionierte Datei `data/monitor/evaluation/editorial_reference_cases.json` enthält
die fünf realen Referenzen sowie Negativfälle. Für jeden Shadow-Lauf sind zu ermitteln:

- Präzision: relevante ausgewählte Meldungen / alle KI-Auswahlen
- Referenz-Recall: ausgewählte relevante Referenzen / verfügbare relevante Referenzen
- Fehlalarme: als `exclude` markierte Fälle in der Auswahl
- Vielfalt: Anzahl unterschiedlicher `editorial_category` in der Auswahl
- Faktentreue: manuelle Prüfung von Summary, Hook und Beleglage gegen Originalquelle
- Begründungsqualität: konkret, nachvollziehbar, keine Titelwiederholung
- Kosten pro Daily Run: `cost.usd` aus gemessenen API-Tokens und konfigurierten Preisen

## Bisher gemessen

- Automatisierte Tests: 55 bestanden, davon 11 für die neue KI-Schicht.
- Struktur, Fallback, Cache, Deduplikation, Datumsfelder, Headline-only,
  Prompt-Injection und fehlende Preiskonfiguration sind abgedeckt.
- Test-Tokenwerte stammen aus einem simulierten API-Transport und sind **keine** reale
  Verbrauchs- oder Kostenschätzung.
- Ein echter OpenAI-Vergleichslauf wurde lokal nicht ausgeführt, weil in der
  Arbeitsumgebung kein `OPENAI_API_KEY` vorhanden ist und Shadow Mode nicht ohne
  Freigabe produktiv aktiviert werden darf. Tatsächliche Token- und Kostenwerte werden
  daher bewusst noch nicht behauptet.

## Offener Erfolgstest

Nach Freigabe des reinen Shadow Modes: einen Daily Run mit `gpt-6-luna` ausführen,
Artefakt `editorial-ai-shadow.json` sichern und die fünf Referenzen sowie mindestens
zehn Negativ-/Duplikatfälle manuell gegen die Originalquellen bewerten. Erst diese
Messung erlaubt eine belastbare Aussage, ob die redaktionelle Auswahl tatsächlich
besser ist als die Legacy-Auswahl.
