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

## Betrieb und Zeitsteuerung

- Der reguläre Daily Run ist auf einmal täglich 07:30 Uhr `Europe/Zurich`
  reduziert. Manuelle Daily- und Full-Runs bleiben möglich; der Full-Button bleibt
  sichtbar.
- Der E-Paper-Workflow prüft zwischen 21:30 und 23:55 Uhr alle fünf Minuten die
  erwartete Ausgabe des Folgetags. Sobald deren datiertes Archiv vorliegt, werden
  weitere Läufe übersprungen. Am Samstag wird die Sonntagsausgabe erwartet.
- Abend- und Morgenworkflow verwenden dieselbe Repository-weite Concurrency-Gruppe.
  Dadurch überlappen Download, API-Aufrufe, Budgetreservierungen und Git-Persistenz
  nicht. Vor jedem KI-Lauf und vor jedem Commit wird die Kostenbilanz mit
  `origin/main` vereinigt; gleiche Response-IDs werden nur einmal übernommen und
  widersprüchliche Einträge führen zu einem Fehler statt zu einer Überschreibung.
- Beide Workflows verwenden denselben privaten Actions-Cache-Schlüsselraum. Eine
  unveränderte, am Abend analysierte kanonische URL wird am Morgen aus dem Cache
  gelesen. Playwrights npm- und Browser-Downloads werden ebenfalls gecacht.
- E-Paper-Ergebnisse können unmittelbar durch dieselbe interne KI-Schicht laufen;
  sie bleiben Shadow-Daten und lösen standardmässig keinen öffentlichen Daily Run aus.
- Die interne Ansicht liest das abendliche Shadow-Artefakt direkt und zeigt Ausgabe,
  Ausgabedatum, Auswertungszeit, Modell, KI-Status und Auswahl auch ohne Daily-Datei.
- `known_unchanged` und `older_background` erhalten in der KI-Auswahl ausdrücklich
  die Rolle `background` und `is_new_daily=false`; `materially_updated` wird als
  Aktualisierung gekennzeichnet. So bleibt ein wichtiger Vorabend-Inhalt verfügbar,
  ohne am Morgen als neue Entdeckung ausgegeben zu werden.
- `deploy/raspberry/newsmonitor-epaper-trigger.*` ist nur als Ersatztrigger
  vorbereitet. Er wird durch diesen PR weder installiert noch aktiviert.

## Aktivierungsplan

1. PR #24 zuerst mergen und diesen gestapelten PR danach auf `main` ausrichten.
2. Secret und drei Modell-/Preisvariablen konfigurieren.
3. `EDITORIAL_AI_ENABLED=true` setzen; dies aktiviert nur Shadow Mode.
4. Mindestens sieben Daily Runs anhand der internen Artefakte auswerten.
5. Präzision, Referenz-Recall, Fehlalarme, Vielfalt, Faktentreue und Kosten prüfen.
6. Erst nach separater Freigabe eine produktive Umschaltung in einem eigenen PR planen.

## NZZ-Status und gezielte Wiederholung

`data/monitor/status/nzz-epaper.json` ist der persistente, öffentlich lesbare
Betriebsstatus. Er enthält keine Artikeltexte oder Secrets. Download, PDF-Prüfung,
Textextraktion und KI-Auswertung werden getrennt ausgewiesen. Der letzte vollständige
Erfolg und der letzte KI-Erfolg bleiben erhalten, wenn ein neuer Versuch scheitert.
Ein grüner Gesamtstatus setzt voraus, dass alle vier Schritte erfolgreich waren.

Eine validierte PDF, Download-Metadaten und extrahierte Findings werden privat unter
dem aus Ausgabe und Datum gebildeten GitHub-Actions-Cache-Schlüssel abgelegt. Scheitert
nur die KI-Auswertung, stellt der nächste Fünf-Minuten-Lauf dieses Material wieder her
und überspringt Playwright, Download und Extraktion. Bereits erfolgreiche Artikel-
analysen werden zusätzlich aus dem gemeinsamen redaktionellen Cache übernommen.

Technische Grenze: Ein hart abgebrochener GitHub-Runner kann lokale Daten verlieren,
bevor Post-Actions oder der Git-Commit ausgeführt werden. API-Antworten werden zwar
sofort lokal verbucht, vollständig dauerhaft ist die Bilanz aber erst nach dem
anschliessenden Commit. Die gemeinsame Concurrency-Gruppe verhindert reguläre
Abend-/Morgen-Überschneidungen; fremde OpenAI-Nutzung ausserhalb dieses Repositorys
ist in der lokalen 10-USD-Grenze nicht enthalten.

## Raspberry-Pi-Aktivierungsplan (noch nicht ausführen)

1. Repository auf dem Raspberry aktualisieren und die vorbereiteten Unit-Dateien
   `newsmonitor-epaper-trigger.service/.timer` sowie den Daily-Timer prüfen.
2. Mit `systemd-analyze calendar` verifizieren, dass NZZ ab 21:30 Uhr ungefähr alle
   fünf Minuten läuft. Während der Parallel-Abnahme startet der Raspberry-Daily-
   Fallback um 07:35 Uhr, fünf Minuten nach GitHub; den Samstag-/Sonntagwechsel
   gesondert testen.
3. Services zunächst manuell mit Testzugang starten und Doppelstart, GitHub-409,
   fehlgeschlagene Runs sowie die Wiederverwendung erfolgreicher Stufen kontrollieren.
4. Erst nach erfolgreicher Abnahme `systemctl enable --now` für die beiden Timer
   ausführen. Bestehende GitHub-Zeitpläne zu diesem Zeitpunkt noch aktiv lassen.
5. Mindestens sieben Tage beide Trigger vergleichen. Erst nach stabiler Raspberry-
   Ausführung und separater Freigabe die entsprechenden GitHub-`schedule`-Einträge
   entfernen und den Raspberry-Daily-Timer von 07:35 auf 07:30 Uhr umstellen.
   Manuelle Daily-/Full-Auslösung und der Full-Workflow bleiben erhalten.
