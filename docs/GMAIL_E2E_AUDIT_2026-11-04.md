# End-to-End-Prüfung Gmail-Quellenzusammenführung vom 4. November 2026

Geprüft wurde GitHub-Actions-Lauf `41883553140` gegen den unmittelbar davor
gültigen Monitorzustand. Verwendet wurden das private Laufartefakt, der
persistierte Zustand und der veröffentlichte Tagesbericht. Es wurden keine
Mailtexte, OAuth-Daten oder Secrets übernommen.

## Reales Beispiel

Der Artikel **«IV-Integrationsreform: berufliche Integration stärken und
finanzielle Situation stabilisieren»** wurde über die Bund-API und Gmail
gefunden.

- kanonische URL: `https://admin.ch/de/newnsb/TS29TgaPkmw5`
- produktiv gespeicherte Fundwege am API-Quellenobjekt: `api`,
  `gmail-newsletters`
- weitere Spiegel im Ereignis: BSV-, EFD- und VBS-Website
- Veröffentlichungszeit laut strukturierter API: `2026-11-04T15:03:09Z`
- erstmalige Entdeckung: `2026-11-04T18:05:57Z` über die API
- Ereignis: `EV-53888738DACA`
- Bewertung: Score 20, Status `Duplikat`, bestehendes Ereignis erkannt
- endgültiger Verbleib: nicht in der öffentlichen Tagesauswahl

Der tatsächliche Herausgeber war aus den gespeicherten Produktivdaten nicht
zuverlässig belegbar und blieb deshalb `Unbekannt`. Die BSV-Spiegelseite allein
ist kein ausreichender Herausgebernachweis. Es wird keine Quelle erfunden.

Die Zusammenführung von API und Gmail funktionierte bei dieser URL bereits. Die
BSV-/EFD-/VBS-Spiegel wurden jedoch wegen unterschiedlicher Subdomains noch als
separate Quellen gezählt. Die Korrektur normalisiert News-Service-Bund-Spiegel
mit derselben Sprachgruppen-ID nun auf eine Identität. Ein read-only Wiederholungstest
mit allen 911 Findings des Laufes ergab für dieses Beispiel genau ein
Quellenobjekt mit den Fundwegen `api`, `website` und `gmail-newsletters`. Der
Score sank von künstlich erhöhten 20 auf 14 und blieb damit klar relevant.

## Einordnung der Kennzahlen

Der Lauf enthielt 133 Gmail-Artikelhinweise:

| Stufe | Anzahl |
|---|---:|
| gegenüber der vorherigen Baseline unbekannte Hinweise | 111 |
| bereits bekannte Hinweise | 22 |
| exakte Überschneidungen mit einem anderen Kanal im selben Lauf | 17 |
| Relevanzschwelle nicht erreicht | 87 |
| Relevanzschwelle erreicht | 46 |
| direkt oder über identische URL in einem Event-Cluster | 62 |
| betroffene Event-Cluster | 27 |
| Hinweise in der vorläufigen Auswahl | 28 |
| betroffene vorläufig ausgewählte Events | 3 |
| Hinweise in der endgültigen öffentlichen Auswahl | 0 |

Die bisherige Zahl `111 additional_previously_unknown_articles` bezeichnete
Baseline-neue **Hinweise**, nicht 111 veröffentlichte Meldungen. Die Zahl
`9 qualified_gmail_items` bezeichnete Events mit Score mindestens 8 und
Gmail-Beteiligung, nicht neun zusätzliche Gmail-Artikel. Beide alten Felder
bleiben kompatibel, erhalten aber eine maschinenlesbare Erklärung und werden
durch eindeutige Stufenzähler ersetzt.

## Gefundene Ursachen

1. Der Raspberry-Feed enthielt noch Legacy-Daten ohne belastbare
   `original_source`-Angabe. Alle 133 Gmail-Funde wurden deshalb als unbekannt
   abgebildet.
2. Legacy-Feeds verwendeten das Maildatum als `published_at`. Der GitHub-Importer
   verwirft dieses Datum künftig ausdrücklich.
3. Pfadbasierte Consilium-Trackinglinks wurden nicht auf das Originalziel
   aufgelöst. Dadurch konnten sie nicht mit RSS-Artikeln übereinstimmen.
4. News-Service-Bund-Spiegel unter verschiedenen `*.admin.ch`-Subdomains wurden
   als verschiedene Artikel behandelt.
5. Die Diagnose endete vor Freshness- und Qualitätsfiltern und konnte den
   endgültigen Verbleib eines Gmail-Hinweises nicht erklären.

## Korrekturen

- interne Trace-ID je kanonischer URL;
- artikelweise Baseline-, Dubletten-, Relevanz-, Cluster-, Vorauswahl- und
  Endauswahlzustände;
- abschliessende Trace-Aktualisierung nach Freshness- und Qualitätsprüfung;
- klare Zähler für Hinweise, Events und endgültig ausgewählte Meldungen;
- Legacy-Maildaten werden nicht mehr als Artikelpublikation akzeptiert;
- fehlende Legacy-Herausgeber werden anhand des zentralen Resolvers nachgezogen;
- sichere, begrenzte Auflösung bekannter Consilium-Trackinglinks;
- einheitliche Identität für News-Service-Bund-Spiegel;
- Trace-Daten nur im privaten Laufartefakt und in der internen Monitoransicht.

Die öffentliche Darstellung bleibt unverändert.
