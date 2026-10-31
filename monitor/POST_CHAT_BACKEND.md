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

## Redaktioneller Rahmen

Der API-Systemprompt soll die bereits verwendeten Monitor-Regeln beibehalten: Schweizer Hochdeutsch mit ss statt ß, starker Einstieg, klare These, konkreter Beleg, Einordnung für die Schweiz und prägnanter Schluss. Keine erfundenen Angaben oder Zitate, Unsicherheiten markieren, keine Polemik, keine Wahlempfehlung, keine Floskeln und keine Konstruktion «Nicht X, sondern Y».

EU-kritische Einordnung und die Hashtags #PaketCHEU, #Integrationsvertrag und #Souveränitätsverlust gelten nur, wenn die Meldung tatsächlich einen Schweiz–EU-Bezug hat. Für andere Themen werden thematisch passende Hashtags verwendet. Strukturierte Kurzfassung, Themen und Zahlen aus article_detail werden an den Prompt übergeben.

## Zugriffsschutz und Kostenlimits

«noindex» ist kein Zugriffsschutz. Der API-Endpunkt darf nicht offen und anonym nutzbar sein. Vor einem echten API-Aufruf muss die Zugriffsregel des Monitors geklärt und serverseitig durchgesetzt werden. Zusätzlich braucht es ein serverseitiges Limit für Request-Grösse, Verlaufslänge, Ausgabetokens sowie Anfragen pro Nutzer und Zeitraum. Ein API-Kostenlimit im OpenAI-Konto ersetzt die Zugangskontrolle nicht.

Als vorläufige Obergrenze für den Chatentwurf sind höchstens 12 Verlaufseinträge und maximal 6'000 Zeichen je Nachricht vorgesehen. Modell- und Tokenlimits werden anhand des gewählten Modells und der tatsächlichen API-Preise festgelegt. Lange Abklärungen sollen an den ChatGPT-Projektchat übergeben werden.
