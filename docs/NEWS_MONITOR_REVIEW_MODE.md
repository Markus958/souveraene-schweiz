# Newsmonitor – Redaktioneller Prüfmodus (Pilot)

## Ziel
In einer zunächst vierwöchigen Testphase werden **alle technisch validierten,
deduplizierten Treffer** vor dem fachlichen Relevanz- und Qualitätsfilter sichtbar
gemacht, einschliesslich aller als Artikel erkannten Titel der NZZ-E-Paper-Ausgabe.
Eine journalistische Meinung ist grundsätzlich bewertbar; die Quelle, ihr Autor
und die konkrete Aussage zählen bei der manuellen Prüfung.

Die Bewertung hat genau **zwei Werte**:
- **Postwürdig**
- **Nicht postwürdig**

Ein Kommentar zur Begründung ist freiwillig. Ein unbeurteilter Artikel gilt
ausdrücklich **nicht** als negativ bewertet.

## Erweiterung: EU-Verfahren, Risiko-Dossiers und Quellenkontrolle

Der Prüfmodus zeigt jetzt **drei getrennte Kategorien**. Die vorhandenen zwei
Bewertungen und der freiwillige Kommentar gelten für jede Kategorie:

- **Nachrichten / Meinungsbeiträge:** technisch bereinigte und entdoppelte
  Artikel aller tatsächlich abgefragten, zugelassenen Nachrichtenquellen.
- **EU-Verfahren:** jede überwachte Verfahrensseite als eigener Eintrag mit
  verifiziertem Abrufstatus, Dokumentreferenzen soweit strukturiert vorhanden
  und Direktlink zur Originalseite. Auch `unchanged` oder fehlgeschlagene
  Prüfungen bleiben erkennbar; sie sind **keine neue Nachricht**.
- **Risiko-Dossiers:** jeder aktive Dossier-Prüfstand als eigener Eintrag,
  einschliesslich des Quellenvollständigkeitsstatus und dokumentierter neuer
  Hinweise. Ein reiner `unchanged`-Stand wird nicht als Änderung dargestellt.

Die Eintragskennungen für EU-Verfahrens- und Risikoprüfstände hängen vom
Prüfdatum und dem Quellsignal ab. Damit überschreibt eine neue Entwicklung
nicht unbemerkt die menschliche Bewertung eines älteren Sachstands.

Die **Quellenkontrolle** kann auf der Prüfseite separat aufgeklappt werden.
Sie zeigt pro konfigurierte Nachrichtenquelle:

- aktiviert/deaktiviert, erfolgreich geprüft, nicht geprüft oder Fehlerstatus
- Anzahl der vom Quellabruf gelieferten Roh-Treffer
- Anzahl der verschiedenen zur manuellen Prüfung freigegebenen Artikel,
  soweit sie dieser Quelle zugeordnet werden können

Eine erfolgreich abgefragte Quelle mit 0 Treffern ist von einer nicht
abgefragten Quelle ausdrücklich zu unterscheiden. Die separat verarbeiteten
NZZ-E-Paper-Ausgaben werden zusätzlich aufgeführt. EU-Verfahrens- und
Risiko-Prüfstände erhalten eigene Vollständigkeitsangaben.

Es gibt **keine neuen Netzwerkaufrufe**, Quellenaktivierungen oder geänderte
Risiko-/EU-Regeln: Die neue Aufbereitung liest ausschliesslich Ergebnisse
bereits laufender Prüfungen. Die Prüfansicht bleibt eine vom produktiven
Newsmonitor getrennte Seite. Sie wird beim nächsten regulären, **manuell**
gestarteten Full/Daily Run mit den neuen Angaben befüllt.

## Abgrenzung zu produktiven Monitor-Meldungen
- Der bisherige Monitor unter /monitor/ arbeitet unverändert.
- Die eigentliche Tagesauswahl bleibt bei maximal 10 Meldungen und bisherigen
  Aktualitäts-, Qualitäts-, Dubletten- und Delta-Regeln.
- Die redaktionelle KI bleibt im Shadow Mode; es gibt keine automatische
  Änderung des Prompts, der Modellparameter oder der Auswahlregeln.
- Die Review-Daten sind **nicht** als inhaltliche Empfehlung zu verstehen.
  E-Paper-Titel und Untertitel sind nur maschinell extrahierte Anhaltspunkte.
- Keine neuen API-Aufrufe an OpenAI; die Feeds werden aus ohnehin erfassten
  Daten während des normalen Full/Daily Runs generiert.

## Datenquellen und Speicherung
- /data/monitor/review/YYYY-MM-DD.json: täglich technisch bereinigte,
  deduplizierte Kandidaten vor fachlichen Filtern
- /data/monitor/review/epaper/YYYY-MM-DD-{nzz,nzzas}.json: NZZ-E-Paper,
  inklusive nicht ausgewählter Artikeltitel und Seitenzahlen
- /data/monitor/review/index.json: verfügbares Datum und Dateipfade
- /monitor/pruefmodus.html: mobile und Desktop nutzbare Prüfliste

**Wichtig:** Github Pages ist statisch. Bewertungen werden deshalb ausschliesslich
im localStorage des gerade verwendeten Browsers gespeichert.
Sie sind **nicht geräteübergreifend synchronisiert** und werden nicht automatisch
ins Repository oder in ein Modell geschrieben. Dies würde eine zusätzliche
authentifizierte Schreib-API benötigen. Eine solche Schnittstelle ist
ausdrücklich nicht Bestandteil dieses PR.

Die Buttons **Export** und **Import** erlauben eine JSON-Sicherung und den
Wechsel zwischen Browsern. Export enthält nur ausdrücklich bewertete Artikel.
Die Exportdatei kann später in diesen Chat hochgeladen werden, um die
redaktionellen Entscheidungen als Stichprobe zu analysieren und **vor einer
Änderung** der produktiven Prompts oder Filter zu testen. Es gibt kein
automatisches Selbsttraining.

### Datenschutz und Urheberrecht
- Die veröffentlichten Review-Feeds enthalten öffentliche Titel, bis zu
  240 Zeichen Untertitel, Quelle, Datum, URL, allenfalls E-Paper-Seite und
  technisch stabile Artikel-ID; keine Artikelvolltexte und keine PDFs.
- Keine Gmail-Postfachinhalte, privaten Newsletter-Empfänger, Zugangsdaten,
  Prompts oder privaten API-Schlüssel werden in die JSON-Feeds kopiert.
- Personalisierte URL-Queries werden aus den öffentlichen Links entfernt.
- Die Prüfansicht selbst speichert Kommentare nur lokal. Wer eine Exportdatei
  mit Kommentar teilt, teilt damit bewusst auch diesen Kommentar.
- Alle Eingaben werden auf Dateiformat, Länge und Bewertungswerte geprüft.

## Pilot-Auswertung
1. Vier Wochen lang per Full Run / E-Paper-Verarbeitung die Prüfdaten auffüllen.
2. Bei Zeitknappheit zuerst **Noch nicht bewertet** und die relevantesten
   Ressorts/Quellen durchgehen.
3. Exportierte Bewertungen regelmässig sichern.
4. Nach einer ausreichenden Stichprobe **Recall** (manuell postwürdige Beiträge,
   die die KI auswählt), **Precision** (KI-Auswahl, die manuell postwürdig ist)
   und übersehene Themen auswerten. Dabei die Bewertungsgrundlage des
   jeweiligen Tages beachten: bekannte unveränderte Artikel sind für die
   neue Tagesauswahl nicht erneut geeignet.
5. Typische Gründe aus Kommentaren extrahieren und Verbesserungsvorschläge
   mit Regressionstests belegen. Erst nach Freigabe produktiv ändern.

Die exportierten Bewertungen können lokal und ohne OpenAI-Aufruf ausgewertet
werden (niemals automatisch auf dem öffentlichen Server):

```sh
python .github/scripts/monitor/review_feedback.py \
  --feedback /pfad/zur/newsmonitor-bewertungen-YYYY-MM-DD.json \
  --review-dir data/monitor/review \
  --output /pfad/zum/auswertungsbericht.json
```

Der Bericht enthält nur Metriken für **tatsächlich bewertete** Artikel und
bezeichnet sie ausdrücklich als Stichprobe. Ein NZZ-E-Paper-Titel, dessen
ursprüngliche KI-Auswahlentscheidung nicht dokumentiert ist, wird **nicht**
künstlich als von der KI abgelehnt bewertet.

### Archivierter Pilotstart

Die NZZ-Ausgabe vom 9. November 2026 wurde aus dem bereits bestehenden
E-Paper-Workflow-Artefakt für den Pilot vorbefüllt (41 Artikeltitel, eine
erkennbare Anzeigenzeile nicht übernommen). Online-/Behörden-Treffer werden
mit dem nächsten regulären Full/Daily Run hinzugefügt; dafür wurde kein
zusätzlicher kostenpflichtiger Lauf gestartet.

## Invarianten
Keine Änderungen an Glossar, Abkommens-Kontextübergabe, Index-/Hub-Kachel-
Datumsanzeige, Desktop-Layout der bisherigen Seiten, öffentlichen Filtern,
News-Deltalogik, X.com oder externen Integrationen.
