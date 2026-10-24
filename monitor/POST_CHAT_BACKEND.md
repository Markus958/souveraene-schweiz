# Monitor: API-Postchat und ChatGPT-Projektübergabe

## Aktueller Stand

Der Monitor wird als statische GitHub-Pages-Seite ausgeliefert. Der API-Schlüssel darf deshalb nicht in HTML, JavaScript oder Browser-Speicher abgelegt werden. Für echte KI-Aufrufe braucht es einen kleinen serverseitigen Proxy.

Die Artikeldaten enthalten bereits Titel, Kurzfassung, Relevanz, Ansatz, strukturierte Artikeldetails und Quellenlinks. Der neue Projekt-Übergabetext nutzt diese Daten plus den bearbeitbaren Prompt.

Ein ChatGPT-Projektchat kann durch die Monitorseite nicht automatisch erzeugt oder befüllt werden. Die Übergabe erfolgt manuell: Übergabetext im Monitor kopieren und in einem neuen Chat im ChatGPT-Projekt einfügen.

## Vorläufiger API-Vertrag

Der Browser sendet eine HTTPS-POST-Anfrage an einen gleichursprünglichen Endpunkt, zum Beispiel `/api/monitor/post-chat`. Der genaue Pfad hängt von der Serverumgebung ab.

Beispiel für die erste Anfrage:

```json
{
  "mode": "draft",
  "article": {
    "headline": "…",
    "summary": "…",
    "why_important": "…",
    "post_approach": "…",
    "article_detail": {
      "summary": "…",
      "topics": [],
      "figures": []
    },
    "sources": []
  },
  "messages": []
}
```

Für Überarbeitungen wird `mode` auf `revise` gesetzt. `messages` enthält die bisherige Unterhaltung in der richtigen Reihenfolge als `{ "role": "user" | "assistant", "content": "…" }`. Die Antwort des Servers hat zunächst das Format `{ "text": "…" }`.

## Anforderungen an den Server

- API-Schlüssel nur als Server-Secret, nie im Frontend, in Git oder im Browser-Speicher.
- Modell, maximale Eingabegrösse und maximale Ausgabetokens serverseitig begrenzen.
- Nur nötige Monitor-Metadaten senden; den vollständigen Artikeltext nicht ohne ausdrückliche Entscheidung abrufen oder übertragen.
- Request-Grösse und Verlaufslänge beschränken.
- Einfache Missbrauchs- und Kostenbegrenzung einrichten.
- Fehlerantworten dürfen weder den API-Schlüssel noch interne Serverdetails enthalten.
- Falls Frontend und API unterschiedliche Origins verwenden, CORS auf die tatsächliche Monitor-Origin beschränken.
- ChatGPT-Projektübergaben bleiben Copy/Paste und verursachen keine API-Anfragen.

## Vor dem Serverzugang erledigbar

- Artikelkontext und Übergabetext im Frontend vorbereiten.
- Den API-Vertrag und Mock-Tests definieren.
- Die API-Anbindung gegen simulierte Antworten testen; keine echten kostenpflichtigen Aufrufe auslösen.
- Erreichbare Serverlaufzeit, HTTPS/Domain und Secret-Konfiguration prüfen, sobald der Serverzugang vorliegt.

## Noch offen

Serverbetriebssystem und Laufzeit, API-Origin/Pfad, HTTPS/DNS, konkrete Secret-Verwaltung und gewünschtes Modell. Diese Entscheidungen werden anhand des tatsächlich erreichbaren Servers getroffen.
