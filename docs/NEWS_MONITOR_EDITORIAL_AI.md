# KI-Redaktion im Shadow Mode

Stand: 5. November 2026

## Kurzfazit

Die KI-Redaktion ist eine zusätzliche, interne Verarbeitungsschicht. Collector,
Quellenidentität, URL-Kanonisierung, Gmail-Fundwege, E-Paper und Legacy-Auswahl bleiben
bestehen. Die öffentliche Ausgabe wird nicht von der KI verändert.

## Bestandsaufnahme der vorhandenen Architektur

| Bereich | Vorhandene Komponente | Weiterverwendung |
|---|---|---|
| Quellen und Fetcher | `sources.json`, `fetch.py` | unverändert; liefert normalisierte Findings |
| Gmail/Raspberry | `gmail_newsletter.py`, sanitierter Feed, systemd-Vorlagen | Gmail bleibt Discovery Channel, OAuth bleibt auf dem Raspberry |
| NZZ E-Paper | Download-/PDF-Extraktion und `merge_epaper.py` | vorhandene Titel, Decks und Extrakte werden genutzt |
| Quellenidentität | `source_identity.py`, `url_identity.py` | tatsächlicher Herausgeber und kanonische URL bleiben führend |
| Dubletten/Events | `eventize.py`, `state.py` | technisches Zusammenführen und Novelty bleiben erhalten |
| Legacy-Relevanz | `score_finding()`, Freshness- und Quality-Guard | läuft parallel und bleibt öffentlicher Fallback |
| Archiv/Anzeige | `archive.py`, `internal_view.py` | öffentlich unverändert; intern um Vergleich ergänzt |
| Betrieb | Daily/Full Workflows | Shadow-Stufe im Daily-Job, Full Run erbt diesen Job |
| API-Vorbereitung | `monitor/CONTROL_API.md` und Raspberry-Steuerung | nicht verändert; Post-Draft bleibt getrennte Funktion |

Die Fetcher liefern je nach Quelle Titel, Untertitel/Teaser, strukturierte Fakten und
E-Paper-Auszüge, aber nicht überall Volltext. Die neue Schicht kennzeichnet deshalb
`headline_only` beziehungsweise `excerpt` und verbietet das Ergänzen fehlender Inhalte.
Es wurde kein aggressiver allgemeiner Web-Scraper ergänzt: Das würde Paywalls,
Urheberrecht, Zugriffsrechte und Stabilität unnötig riskieren. Die Architektur kann
später kontrollierte quellspezifische Anreicherungen aufnehmen.

## Datenfluss

1. `run_monitor.py` ruft und normalisiert alle Quellen wie bisher.
2. Die Legacy-Pipeline baut Ereignisse und ihre Top-10 unverändert.
3. `editorial_ai.py` erhält den breiteren normalisierten Artikelstrom vor dem
   Keyword-Mindestscore. Nur gleiche kanonische URLs werden technisch
   zusammengeführt; ähnliche Titel mit verschiedenen URLs und eigenständigen
   journalistischen Perspektiven bleiben getrennt. Alle Fundwege bleiben erhalten.
4. Stufe A analysiert noch nicht gecachte Artikel in kleinen Batches.
5. Stufe B vergleicht die verdichteten Analysen und wählt höchstens zehn Meldungen.
6. `monitor-out/editorial-ai-shadow.json` und die interne Monitoransicht stellen
   KI- und Legacy-Auswahl gegenüber. `archive.build_public_report()` bleibt unverändert.
7. `editorial_eval.py` vergleicht das Ergebnis reproduzierbar mit dem versionierten
   Referenzdatensatz und schreibt `monitor-out/editorial-ai-evaluation.json`.

## OpenAI-Anbindung

- Responses API: `POST /v1/responses`
- Structured Outputs mit strikt validiertem JSON Schema
- Modell: `EDITORIAL_AI_MODEL`; initial empfohlen `gpt-6-luna`
- Prompt: `.github/scripts/monitor/prompts/editorial_v1.md`
- Prompt-Version: `editorial-v1`, Teil jedes Cache-Schlüssels
- Parallelität: standardmässig 2, maximal 4
- Batchgrösse: standardmässig 5
- Timeout: 60 Sekunden; zwei kontrollierte Wiederholungen mit Backoff
- Cache: `.cache/newsmonitor/editorial_ai_cache.json`, persistent über den privaten
  GitHub-Actions-Cache, nicht im Repository; enthält Analysen, keine API-Schlüssel
  und keine vollständigen E-Mails
- Cache-Aufbewahrung: `EDITORIAL_AI_CACHE_RETENTION_DAYS`, standardmässig 45 Tage
- Kandidatenlimit: unbegrenzt. Der frühere Wert `EDITORIAL_AI_MAX_CANDIDATES`
  wird nur noch als Diagnosewert ausgewiesen und nicht vor der KI erzwungen, damit
  keine relevante Meldung allein wegen ihrer Position im Quellenstrom entfällt.

Die Modellwahl folgt der offiziellen Beschreibung von GPT-6 Luna als effizientes Modell
für fokussierte Hochvolumen-Aufgaben. Das Modell unterstützt Responses und Structured
Outputs. Standardpreise am 5. November 2026: 0,10 USD pro Million Input-Tokens und
0,50 USD pro Million Output-Tokens. Preise werden trotzdem als Repository-Variablen
geführt, damit ein Modellwechsel keine falsche Kostenrechnung erzeugt:

- `EDITORIAL_AI_INPUT_USD_PER_MTOK`
- `EDITORIAL_AI_CACHED_INPUT_USD_PER_MTOK`
- `EDITORIAL_AI_OUTPUT_USD_PER_MTOK`

Quellen: [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna),
[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses),
[Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create).

## Konfiguration

GitHub Secret:

- `OPENAI_API_KEY`

GitHub Repository Variables:

- `EDITORIAL_AI_ENABLED=false` (bis zur ausdrücklichen Freigabe)
- `EDITORIAL_AI_MODEL=gpt-6-luna`
- `EDITORIAL_AI_INPUT_USD_PER_MTOK=0.10`
- `EDITORIAL_AI_CACHED_INPUT_USD_PER_MTOK=0.01`
- `EDITORIAL_AI_CACHE_WRITE_USD_PER_MTOK=0.125`
- `EDITORIAL_AI_OUTPUT_USD_PER_MTOK=0.50`
- `EDITORIAL_AI_MONTHLY_BUDGET_USD=10`

Optional:

- `EDITORIAL_AI_MAX_CANDIDATES=0`
- `EDITORIAL_AI_CACHE_RETENTION_DAYS=45`
- `EDITORIAL_AI_BATCH_SIZE=5`
- `EDITORIAL_AI_MAX_CONCURRENCY=2`
- `EDITORIAL_AI_TIMEOUT_SECONDS=60`
- `EDITORIAL_AI_RETRIES=2`

Fehlt Secret oder Modell, oder fällt die API aus, meldet die Schicht `fallback`.
Die Legacy-Auswahl und die öffentliche Ausgabe laufen weiter. Fehlerprotokolle enthalten
nur kontrollierte Meldungen beziehungsweise Exception-Typen, keine Schlüssel oder
vollständigen API-Antworten.

## Datenschutz und Prompt-Injection

Artikel- und Newslettertexte werden als nicht vertrauenswürdige Daten markiert. Der
Prompt verbietet das Befolgen darin enthaltener Anweisungen. Vollständige E-Mails,
Absenderdaten und OAuth-Tokens werden nicht in Ausgaben oder Cache geschrieben.
Paywall-/Headline-only-Zugriff wird als `content_access` an das Modell übermittelt;
fehlender Inhalt darf nicht ergänzt werden.

## Kostenkontrolle

- Ein Cache-Schlüssel umfasst Modell, Prompt-Version und unveränderten Artikelinhalt.
- Nur Cache-Misses werden erneut in Stufe A bezahlt.
- Auch Stufe B wird wiederverwendet, wenn der gesamte Analysebestand unverändert ist.
- Tokenzahlen stammen direkt aus `response.usage`.
- Ein USD-Wert wird nur berechnet, wenn beide Preisvariablen gesetzt sind.
- Ohne echten API-Lauf gibt es keine als gemessen ausgegebene Kostenzahl.
- Jeder erfolgreiche API-Aufruf wird anhand der Response-ID genau einmal in
  `data/monitor/state/editorial_ai_usage.json` verbucht. Diese Bilanz ist vom
  löschbaren Analysecache getrennt und enthält keine Prompts oder Secrets.
- Vor jedem bezahlten Aufruf wird das verbleibende Monatsbudget in der Zeitzone
  `Europe/Zurich` geprüft. Bei 80 Prozent erscheint eine Warnung; ab 100 Prozent
  stoppt nur die KI-Schicht, während der Legacy-Monitor weiterläuft.
- Die interne Ansicht zeigt Lauf-, Tages-/Monatswerte, Tokenarten, Cachetreffer,
  Modell und letzten erfolgreichen KI-Aufruf. Die OpenAI-Rechnung kann zusätzliche
  Nutzung aus anderen Projekten enthalten.

## Betrieb und Zeitsteuerung – manuelle Qualitätsphase

- Der Daily Run um 07:30 Uhr `Europe/Zurich` bleibt als eigenständiger
  GitHub-Zeitplan unverändert. Der tägliche manuelle Start ist ebenfalls möglich.
- Der NZZ/E-Paper-Workflow hat keine eigenen `schedule`-, `push`- oder
  `workflow_dispatch`-Trigger mehr. Er ist ausschliesslich über
  `workflow_call` aus `monitor-full-run.yml` erreichbar. Die vorbereiteten
  Raspberry-E-Paper-Timer und separaten E-Paper-Dispatch-Skripte werden nicht benutzt
  und dürfen nicht aktiviert werden.
- Operativ wird der Full Run ausschliesslich über die bestehende Website-Schaltfläche
  unter `/monitor/` ausgelöst. Die Raspberry-Control-API übermittelt wie zuvor
  nur den Workflow-Dispatch, ohne Ausgabedatum oder Ausgabeart. Die API und der
  Website-Button bleiben unverändert.
- `monitor-full-run.yml` liest den originalen `created_at`-Zeitstempel des
  GitHub-Actions-Laufs über die GitHub-API und legt die Zielausgabe einmal fest.
  Alle Zeiten werden nach `Europe/Zurich` umgerechnet: vor 21:30 Uhr aktueller
  Kalendertag, ab 21:30 Uhr Folgetag; um 00:00 Uhr wieder aktueller Tag.
  Sonntag ergibt `nzzas`, alle anderen Tage `nzz`.
- Datum und Ausgabeart werden ausdrücklich an den wiederverwendbaren E-Paper-Workflow
  übergeben; der spätere Start eines Runners ändert das Ziel nicht.
  **Grenze:** `created_at` ist die Erzeugungszeit des GitHub-Laufs, nicht der
  exakte Browser-Klickzeitpunkt. Sollte die Raspberry-Control-API einen Dispatch
  erst nach der 21:30-Uhr-Grenze verzögert senden, kann dies ohne Änderung dieser
  API nicht verlässlich erkannt werden. Ein Runner-Queue-Verzug nach Erzeugung
  des GitHub-Laufs führt dagegen nicht zu einer Datumsverschiebung.
- Der Full Run führt anschliessend den Daily Run mit allen anderen Quellen aus,
  auch bei einem E-Paper-Fehler oder wenn die Ausgabe noch nicht verfügbar ist.
- NZZ und Daily verwenden dieselbe Concurrency-Gruppe und den gemeinsamen privaten
  Editorial-AI-Cache. Kostenbilanz und Cache-Synchronisierung bleiben erhalten.
- `known_unchanged` und `older_background` bleiben `background`
  (`is_new_daily=false`); `materially_updated` wird als Aktualisierung markiert.
## Aktivierungsplan

1. PR #26 mit vollständigen Monitor-Tests prüfen; erst nach separater Freigabe mergen.
2. Secret und drei Modell-/Preisvariablen konfigurieren.
3. `EDITORIAL_AI_ENABLED=true` setzen; dies aktiviert nur Shadow Mode.
4. Mindestens sieben Daily Runs anhand der internen Artefakte auswerten.
5. Präzision, Referenz-Recall, Fehlalarme, Vielfalt, Faktentreue und Kosten prüfen.
6. Erst nach separater Freigabe eine produktive Umschaltung in einem eigenen PR planen.

## NZZ-Status und gezielte Wiederholung

- `data/monitor/status/nzz-epaper.json` speichert die **letzte vollständig
  ausgewertete Ausgabe** (`last_successful`) unabhängig von Ziel und Status
  des aktuellen Versuchs (`issue`, `current_attempt`).
- Die eindeutige Ausgabenidentität ist immer `(issue_date, edition)`.
  Ein neuer Full Run überspringt Download, Extraktion und KI-Auswertung nur,
  wenn für genau diese Kombination ein vollständiger Erfolg dokumentiert ist.
  Der Übersprung wird im NZZ-Statusbereich ausdrücklich angezeigt.
- Ein heruntergeladenes PDF ist kein abgeschlossener Durchlauf. Ein gültiges PDF
  und Download-Metadaten werden nach erfolgreichem Download in einem privaten
  Actions-Cache gesichert, auch wenn die anschliessende Extraktion oder KI
  scheitert. Bei erneutem Website-Full-Run werden vorhandene Stufen wiederverwendet
  und fehlende Stufen nachgeholt. Eine erkannte falsche PDF-Ausgabe erzwingt einen
  neuen Download.
- Liegen bereits validierte Extraktionsergebnisse vor, nutzt der E-Paper-Workflow
  weiterhin den bestehenden vollständigen Work-Cache und wiederholt nur die
  noch ausstehende Auswertung. Unvollständige Resultate dürfen den letzten
  erfolgreichen Ausgabenstand nie überschreiben.
- Ist die Ausgabe nicht verfügbar, bleibt der E-Paper-Status `pending`;
  bei technischen Fehlern wird `failed` erfasst. Der Daily Run startet trotzdem.
- Die private Cache-Aufbewahrung hängt von GitHub Actions ab: Cache-Einträge
  können verfallen oder bereinigt werden. In diesem Fall ist ein erneuter
  Download trotz vorherigem unvollständigem Versuch möglich.

Die bisherige Concurrency-Gruppe verhindert reguläre Überschneidungen zwischen
Daily und E-Paper. Die OpenAI-Kostenbilanz ist erst nach einem erfolgreichen
Commit dauerhaft gesichert; API-Nutzung ausserhalb des Repositorys gehört
nicht zur lokalen Budgetgrenze.


## Raspberry Pi – nicht aktiver E-Paper-Auslöser

Die vorbereiteten Dateien `deploy/raspberry/newsmonitor-epaper-trigger.*`
und `epaper_trigger.py` bleiben historisch im Repository, werden während
dieser Qualitätsphase aber nicht verwendet. Bestehende externe systemd-Timer
lassen sich durch einen GitHub-PR weder abfragen noch abschalten; ihr tatsächlicher
Zustand auf dem Raspberry muss separat kontrolliert werden.

Keine Timer-Aktivierung, kein paralleler Raspberry-E-Paper-Dispatch, kein
produktiver NZZ-Test und kein Merge sind Bestandteil dieses PR.
