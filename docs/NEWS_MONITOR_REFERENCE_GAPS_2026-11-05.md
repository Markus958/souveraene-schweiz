# Untersuchung fehlender Monitor-Meldungen vom 5. November 2026

## Kurzfazit

Der neueste abgeschlossene Daily Run war der manuelle Lauf
[`41996926103`](https://github.com/Markus958/souveraene-schweiz/actions/runs/41996926103),
gestartet am 5. November 2026 um 09:45 Uhr Europe/Zurich. Alle fünf
Referenzfälle wurden von mindestens einer Quelle erfasst. Vier Fälle waren im
Lauf als bereits bekannt klassifiziert; das Amaudruz-Interview war in der
vorläufigen Daily-Auswahl und im veröffentlichten Bericht.

Die Hauptursache war kein allgemeines Fetch-Problem, sondern ein Fehler beim
Persistieren der Ereignis-Cluster: `classify_events` liefert für die Diagnose
immer den ähnlichsten alten Cluster. `update_news_state` verwendete diese ID
bisher auch dann, wenn die Ähnlichkeit weit unter der eigentlichen
Zusammenführungsgrenze von 0,48 lag. So wurden sachfremde Artikel bei nur
0,09–0,13 Ähnlichkeit zusammen gespeichert und spätere Artikel künstlich als
bekannt behandelt. Zusätzlich ging das Artikel-Publikationsdatum verloren,
wenn die beste amtliche Quelle selbst kein Datum trug, ein anderer Fundweg des
gleichen Ereignisses aber schon.

## Die fünf Referenzfälle

| Fall | Original / Primärquelle | Publiziert | Erstmals technisch entdeckt | Neuester Run | Endergebnis und Ursache |
|---|---|---:|---:|---|---|
| EFK Winterreserve | [EFK-Prüfbericht](https://www.efk.admin.ch/prufung/beschaffungspruefung-der-winterreserve/), [Bund-Mitteilung](https://www.admin.ch/de/newnsb/pMuwRPRn2eWI) | 04.11.2026 | 04.11.2026 23:13 CET | gefunden, Score 11, Duplikat | Im vorangehenden späten Run neu und in der Daily-Auswahl; am 5.11. wegen Tagesaktualität/Baseline nicht erneut öffentlich. Der EFK-Bericht beziffert 220 Mio. Franken Sparpotenzial. |
| EU-Fahrzeugregeln | [BFE/Bund-Mitteilung](https://www.bfe.admin.ch/de/newnsb/tDD-BZXX7QMM) | 04.11.2026 10:38 CET | spätestens 04.11.2026 15:01 CET | gefunden, Score 11, Duplikat | API, BFE-Website und Gmail vorhanden. Ein schwacher Alt-Cluster wurde trotz Ähnlichkeit unter 0,48 persistiert; später zusätzlich Datums-/Qualitätsausschluss. |
| IV-Finanzierung | [Bund/BSV-Mitteilung](https://www.admin.ch/de/newnsb/TS29TgaPkmw5), ergänzend NZZ/TA/Watson/SRF | 04.11.2026 16:03 CET | spätestens 04.11.2026 16:29 CET | gefunden, amtlicher Score 14; Medienvarianten 5–8; Duplikat | Falsch mit einem seit 24.10. verunreinigten Alt-Cluster verbunden. Die konkrete Lohnbeitrags-/Gutverdiener-Perspektive war im öffentlichen Qualitätsfilter zu schwach repräsentiert. |
| Amaudruz | [NZZ-Interview](https://www.nzz.ch/schweiz/ich-will-endlich-die-masseneinwanderungsinitiative-umsetzen-sagt-celine-amaudruz-ld.10053113) | 05.11.2026 05:30 CET | 05.11.2026 09:46 CET | gefunden, Score 12, Neu, Daily-Auswahl | Tatsächliche Person ist Nationalrätin und SVP-Bundesratskandidatin **Céline Amaudruz**, nicht Elisabeth Baume-Schneider oder Karin Keller-Sutter. Herausgeber ist die NZZ. Der RSS-Text belegt Interviewtitel und Kandidatur; die im Politik-Brief genannten Kontingente/Transitzonen sind ohne zugänglichen Volltext nicht als wörtliches Zitat verifiziert. |
| Pflegende Angehörige | [BAG-Mitteilung](https://www.bag.admin.ch/de/newnsb/KdDW3rwxZmqN) | 04.11.2026 11:43 CET | spätestens 04.11.2026 14:34 CET | gefunden, Score 20, Duplikat | Mit einem sachfremden Alt-Cluster vom 1.11. bei nur 0,133 Ähnlichkeit verbunden; das amtliche Datum war im besten Quellenobjekt nicht verfügbar. |

Zeitangaben zur Entdeckung stammen aus den privaten Run-Artefakten bzw. dem
versionierten Monitorzustand. Wo ein früherer fehlgeschlagener Lauf kein
Artefakt hinterliess, steht deshalb bewusst „spätestens“.

## Verarbeitungskette und Ausschlussgründe

| Fall | Abruf / Extraktion | Quelle / URL | Baseline | Cluster | Relevanz | Freshness / Qualität | Veröffentlichung |
|---|---|---|---|---|---|---|---|
| Winterreserve | Bund-API, EFD/VBS-Spiegel; EFK direkt war falsch konfiguriert | kanonische Bund-URL; EFK-Original separat | am 4.11. neu, am 5.11. bekannt | korrektes Ereignis | 11 | am Folgetag alt | früherer Run ausgewählt, nicht nochmals am 5.11. |
| Fahrzeugregeln | Bund-API, BFE, Gmail, NZZ | Bund-Spiegel normalisiert | zunächst neu | durch State-Fehler schwache Alt-ID wiederverwendet | 11–18 | Publikationsdatum nicht zuverlässig auf Ereignisebene; später Qualitätsausschluss | nicht in neuestem öffentlichen Top-10 |
| IV | Bund-API, BSV, EFD/VBS, Gmail und mehrere Medien | Fundwege vorhanden | fälschlich bekannt | sachfremder, bereits verunreinigter Alt-Cluster | amtlich 14–20; konkrete Medienfassung 5–9 | konkrete Abgabenfolge erreichte öffentlich nur Relevanz 1 / Novelty 6 | in zwei Zwischenberichten sichtbar, nicht qualifiziert |
| Amaudruz | NZZ-RSS | NZZ als Herausgeber | neu | im aktuellen Lauf eigenes Event, historischer Zustand war bereits verschmutzt | 12 | am 5.11. frisch | veröffentlicht |
| Angehörigenpflege | Bund-API und Gmail; BAG-Direktquelle fehlte | Bund-URL; BAG ist Primärquelle | fälschlich bekannt | sachfremder Alt-Cluster, Ähnlichkeit 0,133 | 20 | Datum im besten Quellenobjekt unbekannt | nicht in neuestem öffentlichen Top-10 |

Damit lauten die korrekten Kategorien:

- nie gefunden: keiner der fünf Fälle;
- erst nach dem frühen Morgen veröffentlicht: IV-Finanzierung und mehrere
  dazugehörige Medienartikel am Nachmittag des 4. November;
- als Dublette/falsch bekannt behandelt: Fahrzeugregeln, IV und
  Angehörigenpflege aufgrund der Cluster-Persistenz;
- wegen Tagesaktualität ausgeschlossen: Winterreserve im Bericht vom 5. November;
- qualifiziert und veröffentlicht: Amaudruz;
- Qualitätsfilter: konkrete IV-Medienfassung trotz politisch erheblicher
  Beitragsfolge zu niedrig bewertet.

## Quellenabdeckung

- News Service Bund erfasste alle vier amtlichen Fälle und bleibt die
  strukturierte Hauptquelle.
- BFE und BSV waren direkt vorhanden.
- SEM war vorhanden; im untersuchten Lauf war kein separater SEM-Artikel der
  Amaudruz-Interviewquelle gleichzusetzen.
- ASTRA fehlte als direkte Fachamtsquelle und wurde ergänzt. Dadurch entsteht
  keine inhaltliche Doppelmeldung, weil Bund-Spiegel über die kanonische
  Sprachgruppen-ID zusammengeführt werden. Die öffentliche BAG-Liste ignorierte
  den Herausgeberfilter beim einfachen HTML-Abruf und lieferte fachfremde
  Bund-Meldungen; sie wurde deshalb bewusst nicht als scheinbar vollständige
  Direktquelle aufgenommen. Die BAG-Referenzmeldung kam vollständig über den
  strukturierten News Service Bund und Gmail.
- Die EFK-Konfiguration zeigte auf `/aktuelles/`, das auf eine
  Politikfinanzierungsseite führte. Sie zeigt nun auf `/berichte/`; für
  Medienmitteilungen bleibt News Service Bund die belastbare strukturierte Route.
- Im finalen Read-only-Dry-Run wurden 28 Quellen versucht, 27 erfolgreich, 789
  Findings und 226 relevante aktuelle Events erzeugt. Der Lauf war trotz des
  lokal erwartbar fehlenden NZZ-Cookies baseline-seitig vollständig. Der
  BAG-Direktversuch erwies sich
  dabei als nicht belastbar und wurde wieder entfernt. Die weitere Warnung war
  erwartbar: lokal fehlte das NZZ-Cookie.

## Zeitsteuerung der letzten sieben Tage

Der Workflow verwendet `timezone: Europe/Zurich`; seit der Umstellung am
25. Oktober galt in der gesamten Prüfwoche CET (UTC+1). Erwartet waren 05:07,
05:37, 11:47 und 17:47 Uhr Ortszeit. Die tatsächlich frühesten geplanten Läufe
waren:

| Datum | Frühester Schedule Europe/Zurich |
|---|---:|
| 30.10. | 11:50 |
| 31.10. | 11:19 |
| 01.11. | 12:13 |
| 02.11. | 13:16 |
| 03.11. | 12:51 |
| 04.11. | 13:01 |
| 05.11. | bis zum manuellen Lauf 09:45 kein Schedule |

Das ist eine Verzögerung der GitHub-Schedule-Erzeugung, kein Fehler der
Zeitzonenberechnung im Workflow. Wiederholungs-Crons und manuelle Läufe hielten
den Monitor funktionsfähig, erfüllten das Frühmorgen-Ziel aber nicht. Der
Gmail-Feed war im neuesten Lauf frisch (letzter erfolgreicher Abruf 09:42 CET).
Das NZZ-E-Paper vom 5. November lag vor, erfasste das Amaudruz-Interview jedoch
nicht als separaten E-Paper-Kandidaten; NZZ-RSS lieferte es später zuverlässig.

## Änderungen

1. Persistenz übernimmt eine alte Event-ID nur noch ab Ähnlichkeit 0,48.
2. Schema 3 entfernt eindeutig durch schwache Matches verunreinigte Cluster,
   behält aber die exakten Fingerprint-Baselines.
3. Ereignisberichte übernehmen Publikations-, Aktualisierungs- und
   Entdeckungszeit aus allen Fundwegen statt nur aus der besten Quelle.
4. Gezielt kombinierte Profile für staatliches Sparpotenzial,
   Sozialversicherungsfinanzierung, EU-Regelübernahme, Asylkontrollen und
   Angehörigenpflege. Keine globale Schwelle wurde gesenkt.
5. Interner `selection_trace` dokumentiert Quelle, Fundweg, Daten, Score,
   Neuigkeitsstatus, Cluster und endgültigen Ausschlussgrund auch ausserhalb der
   öffentlichen Auswahl.
6. ASTRA ergänzt und EFK-Ziel korrigiert; BAG bleibt wegen der unzuverlässig
   gefilterten HTML-Liste beim strukturierten Bund-Fundweg.
7. Raspberry-Fallback-Timer vorbereitet. Er prüft um 06:05 Uhr Europe/Zurich
   zuerst die GitHub-Runs seit 05:00 Uhr und löst nur aus, wenn weder ein
   erfolgreicher noch ein aktiver Daily Run existiert. HTTP 409 wird als sichere
   Doppelstartsperre behandelt.

## Raspberry-Fallback (vorbereitet, nicht aktiviert)

Benötigte Dateien:

- `deploy/raspberry/newsmonitor-daily-trigger.service`
- `deploy/raspberry/newsmonitor-daily-trigger.timer`
- `deploy/raspberry/newsmonitor-daily-trigger.env.example`
- `.github/scripts/monitor/daily_trigger.py`

Nach expliziter Freigabe auf dem Raspberry:

```bash
sudo install -o root -g root -m 644 deploy/raspberry/newsmonitor-daily-trigger.service /etc/systemd/system/
sudo install -o root -g root -m 644 deploy/raspberry/newsmonitor-daily-trigger.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now newsmonitor-daily-trigger.timer
systemctl list-timers newsmonitor-daily-trigger.timer --no-pager
```

`MONITOR_API_BASE=http://192.168.1.162:8765` gehört in
`/etc/newsmonitor/newsmonitor.env`. Die vorhandenen Secrets werden nur als
systemd-Umgebungsvariablen gelesen und weder ausgegeben noch ins Repository
geschrieben.

## Tests und Risiken

- 44 Unit-/Regressionstests erfolgreich.
- Alle fünf Referenzfälle erreichen bei rechtzeitigem Abruf die starke
  Kandidatenschwelle.
- Drei gleichlautende, aber unpolitische Gegenbeispiele bleiben unter der
  Ereignisschwelle.
- bekannte Artikel bleiben Dubletten; identische kanonische URLs werden
  zusammengeführt; Top 10 bleibt hart begrenzt;
- Gmail- und Quellenmodelltests bleiben grün;
- ein echter nicht persistierender Abruf erzeugte 789 Findings, 226 aktuelle
  Events und die neue
  interne Trace-Struktur ohne Schreibzugriff auf den Produktivzustand.

Offene Risiken: Die direkte EFK-Berichtsliste wird clientseitig gerendert und
kann beim einfachen HTML-Abruf wenige oder keine Einzelberichte liefern; News
Service Bund bleibt deshalb notwendig. Der NZZ-Volltext des Amaudruz-Interviews
war in der Prüfungsumgebung nicht zugänglich, weshalb die genaue Formulierung zu
Kontingenten/Transitzonen nicht als verifiziertes Zitat behandelt wird. Der
Raspberry-Timer ist nur vorbereitet und wurde nicht installiert oder aktiviert.
