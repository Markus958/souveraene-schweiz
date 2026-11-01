# Newsmonitor – Raspberry Control API

Stand: 2026-11-01

Die öffentliche Monitor-Oberfläche unter `/monitor/` bleibt auf GitHub Pages. Steuerbefehle und OpenAI-Aufrufe laufen über den Raspberry Pi. Secrets dürfen nie in GitHub oder im ausgelieferten JavaScript stehen.

## Browser-Konfiguration

`monitor/control.js` speichert auf dem jeweiligen Endgerät lokal:

- API-Basis-URL (`ss-monitor-api-base`)
- API-Schlüssel (`ss-monitor-api-key`)

Der API-Schlüssel wird als Header gesendet:

`X-API-Key: <secret>`

Für Zugriffe von unterwegs muss die API über HTTPS erreichbar sein. Private HTTP-Adressen werden nur für Tests im lokalen Netz akzeptiert.

## Erforderliche Endpunkte

### GET /health

Erfolg:

```json
{"status":"ok"}
```

### GET /monitor/status

Einheitliche Antwort, zum Beispiel:

```json
{
  "status":"running",
  "kind":"full",
  "run_id":41295838578,
  "started_at":"2026-11-01T10:04:32Z"
}
```

`status` sollte einen dieser Werte verwenden:

- `queued`
- `running`
- `success`
- `failure`
- `cancelled`
- `idle`

`kind` ist `daily` oder `full`.

### POST /monitor/daily-run

Startet ausschließlich `.github/workflows/monitor-news.yml` über `workflow_dispatch`.

Vor dem Dispatch prüfen, ob ein Daily- oder Full-Run bereits in einem konfliktträchtigen Zustand (`queued`, `in_progress`) läuft. Einen Doppelstart mit HTTP 409 ablehnen.

Erfolg, zum Beispiel:

```json
{"status":"queued","kind":"daily","run_id":123456789}
```

### POST /monitor/full-run

Startet ausschließlich `.github/workflows/monitor-full-run.yml` über `workflow_dispatch`.

Vor dem Dispatch prüfen, ob bereits ein Full-Run läuft. Einen Doppelstart mit HTTP 409 ablehnen. Da GitHub für den Full Run derzeit `cancel-in-progress: true` verwendet, muss die Sperre vor dem Dispatch zuverlässig greifen.

Erfolg, zum Beispiel:

```json
{"status":"queued","kind":"full","run_id":123456789}
```

### POST /monitor/post-draft

Request:

```json
{
  "mode":"x",
  "article":{
    "headline":"...",
    "status":"Neu",
    "summary":"...",
    "post_approach":"...",
    "why_important":"...",
    "post_potential":8,
    "source_display":"NZZ",
    "source":{"name":"NZZ","url":"https://...","role":"","page":""},
    "page":"",
    "relevance_factors":[],
    "risk_dossiers":[],
    "article_detail":{
      "summary":"...",
      "relevance":"...",
      "topics":[],
      "figures":[]
    }
  }
}
```

Der Raspberry erstellt aus den gelieferten Monitor-Daten und dem festen Redaktionsprompt einen X-Premium-Post über die OpenAI Responses API.

Erwartete Antwort:

```json
{
  "draft":"Posttext ...",
  "handoff_id":"NM-20261101-0042",
  "model":"<OPENAI_MODEL>",
  "usage":{
    "input_tokens":1234,
    "output_tokens":456,
    "total_tokens":1690
  }
}
```

Der `handoff_id` soll eindeutig und protokollierbar sein.

## Redaktionsprompt

Der Server-Prompt liegt nur auf dem Raspberry bzw. in einer nicht öffentlichen Konfiguration. Er enthält mindestens:

- Schweizer Hochdeutsch
- X-Premium, ausführlich aber fokussiert
- Einstieg mit Konflikt, Machtfrage, Bruch, Gegensatz oder Pointe
- These in 1–2 Sätzen
- konkreter Beleg: Zahl, Mechanismus, Beispiel oder Textstelle
- politische Einordnung aus Schweizer Perspektive
- starke Schlussformel
- keine erfundenen Fakten oder Zitate
- Unsicherheiten klar kennzeichnen
- bei CH–EU-Themen sachlich EU-kritische Schweizer Perspektive ohne Wahlempfehlung
- keine Konstruktionen nach dem Muster „Nicht X, sondern Y“
- keine moralisierenden oder diplomatischen Floskeln
- aktuelle CTA-/Hashtag-Regeln des Projekts

Der Post muss sich auf die übergebenen Monitor-Daten stützen. Wenn diese für eine konkrete Behauptung nicht ausreichen, darf die API diese Behauptung nicht erfinden.

## ChatGPT-Handoff

Der Browser erzeugt aus Artikeldaten, Monitor-Zusammenfassung und aktuellem Postentwurf ein Übergabepaket, kopiert es in die Zwischenablage und öffnet `https://chatgpt.com/`.

Es werden keine OpenAI-API-Conversation-IDs als ChatGPT-Chats behandelt. API-Konversationen und normale ChatGPT-Unterhaltungen bleiben getrennt.

## CORS

Die Raspberry-API muss mindestens diese Origin erlauben:

`https://www.souveraene-schweiz.ch`

Optional zusätzlich die kanonische Domain ohne `www`, falls diese den Monitor ebenfalls ausliefert.

Erlaubte Methoden:

- GET
- POST
- OPTIONS

Erlaubte Header:

- Content-Type
- X-API-Key

Keine Wildcard-Origin verwenden.

## Secrets / Environment

Beispiel `/etc/newsmonitor/newsmonitor.env`:

```text
GITHUB_TOKEN=...
GITHUB_REPOSITORY=Markus958/souveraene-schweiz
MONITOR_API_KEY=...
OPENAI_API_KEY=...
OPENAI_MODEL=...
```

Datei nicht ins Repository übernehmen und nicht in Logs ausgeben.

## Logging

Mindestens protokollieren:

- Zeitpunkt
- Aktion (`daily-run`, `full-run`, `post-draft`)
- GitHub Run-ID bzw. Handoff-ID
- HTTP-Ergebnis / Fehlerklasse
- OpenAI-Modell
- Tokenzahlen

Keine API-Schlüssel, GitHub-Tokens oder kompletten Authorization-Header protokollieren.

## Öffentlicher Zugriff

Keine Router-Portweiterleitung auf Port 8765. Für den Zugriff von unterwegs einen stabilen HTTPS-Tunnel bzw. Reverse-Proxy-Zugang mit TLS verwenden. Uvicorn kann weiterhin ausschließlich auf der privaten Raspberry-Adresse lauschen; der Tunnel leitet nur auf die Newsmonitor-API weiter.
