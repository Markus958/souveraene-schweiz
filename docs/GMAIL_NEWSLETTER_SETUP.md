# Gmail als Newsmonitor-Quelle einrichten

## Überblick

Gmail wird bewusst in zwei Sicherheitszonen verarbeitet:

1. Der Raspberry liest `markuslutz99@gmail.com` mit OAuth 2.0 und ausschliesslich dem Scope `gmail.readonly`.
2. Mailtexte, Absender und OAuth-Daten bleiben auf dem Raspberry.
3. Der Collector extrahiert nur Artikelüberschriften, Ziel-URLs, Zeitstempel und nicht rückrechenbare Nachrichten-Hashes.
4. Ein kleiner, API-Key-geschützter Feed liefert diese bereinigten Hinweise an den bestehenden GitHub-Monitor.
5. Der Monitor bewertet sie mit denselben Regeln für Relevanz, Neuigkeit, Dubletten, Quellenqualität und Postpotential wie andere Quellen.

Newsletter werden als Quelle der Klasse **C** und Rolle `newsletter_lead` eingestuft. Sie können einen Artikel zur Prüfung melden, werden aber nie automatisch als Primärquelle gesetzt. Findet die bestehende Pipeline denselben Originalartikel bei einer Klasse-A-Quelle, wird diese bevorzugt.

Die Integration ist nach einem Merge weiterhin deaktiviert, solange `GMAIL_SOURCE_ENABLED` nicht als GitHub-Secret gesetzt wird.

## 1. Google Cloud vorbereiten

1. In der [Google Cloud Console](https://console.cloud.google.com/) ein eigenes Projekt anlegen oder auswählen.
2. Unter **APIs & Services → Library** die **Gmail API** aktivieren.
3. Unter **OAuth consent screen** eine externe App konfigurieren.
4. Solange die App im Testmodus ist, `markuslutz99@gmail.com` als Testnutzer hinzufügen.
5. Unter **Credentials → Create credentials → OAuth client ID** den Typ **Desktop app** wählen.
6. Die Client-Konfiguration als JSON herunterladen.

Keine Service-Account-Schlüssel verwenden: Ein normales Gmail-Postfach benötigt eine Nutzer-Autorisierung. Der Code fordert ausschliesslich folgenden Scope an:

```text
https://www.googleapis.com/auth/gmail.readonly
```

## 2. Raspberry-Verzeichnisse und Abhängigkeiten

Beispiele gehen vom vorhandenen Benutzer `mllw58`, dem Repository unter `/srv/souveraene-schweiz` und der vorhandenen Python-Umgebung `/srv/newsmonitor/venv` aus.

```bash
sudo install -d -o mllw58 -g mllw58 -m 700 /var/lib/newsmonitor/gmail
sudo install -d -o root -g mllw58 -m 750 /etc/newsmonitor
sudo -u mllw58 /srv/newsmonitor/venv/bin/pip install -r /srv/souveraene-schweiz/requirements-gmail.txt
```

Die heruntergeladene Google-Datei lokal auf den Raspberry übertragen und dort schützen:

```bash
sudo install -o mllw58 -g mllw58 -m 600 CLIENT_DATEI.json /var/lib/newsmonitor/gmail/client_secret.json
```

Sie darf niemals in das Repository kopiert werden.

## 3. Lokale Konfiguration

```bash
sudo install -o root -g mllw58 -m 640 \
  /srv/souveraene-schweiz/deploy/raspberry/gmail-newsmonitor.env.example \
  /etc/newsmonitor/gmail-newsmonitor.env
sudo nano /etc/newsmonitor/gmail-newsmonitor.env
```

Für `GMAIL_FEED_API_KEY` einen unabhängigen Zufallswert verwenden:

```bash
openssl rand -hex 32
```

Der Key ist **nicht** der Gmail-OAuth-Token und nicht `MONITOR_API_KEY`.

`GMAIL_INITIAL_QUERY=newer_than:7d` betrifft nur die erste Synchronisierung. Danach verwendet der Collector Gmail `historyId` und verarbeitet jede neu hinzugekommene Nachricht inkrementell. Wer beim ersten Lauf einen anderen Zeitraum benötigt, kann beispielsweise `newer_than:30d` setzen.

## 4. Einmalige OAuth-Autorisierung

Die Autorisierung muss interaktiv einmalig gestartet werden. Auf dem eigenen Rechner zuerst einen SSH-Tunnel öffnen:

```bash
ssh -L 8766:127.0.0.1:8766 reto@raspireto.local
```

In dieser SSH-Sitzung danach ausführen:

```bash
sudo -u mllw58 bash -c 'set -a; source /etc/newsmonitor/gmail-newsmonitor.env; set +a; /srv/newsmonitor/venv/bin/python /srv/souveraene-schweiz/.github/scripts/monitor/gmail_newsletter.py --client-secret "$GMAIL_CLIENT_SECRET_PATH" --token "$GMAIL_TOKEN_PATH" --state "$GMAIL_STATE_PATH" --feed "$GMAIL_FEED_PATH" --initial-query "$GMAIL_INITIAL_QUERY"'
```

Das Programm zeigt eine Google-URL. Diese auf demselben Rechner im Browser öffnen, als `markuslutz99@gmail.com` anmelden und den reinen Lesezugriff bestätigen. Der OAuth-Rückruf läuft durch den SSH-Tunnel auf `127.0.0.1:8766`; es wird kein Raspberry-Port öffentlich geöffnet. Der Refresh-Token wird danach mit Dateimodus `0600` gespeichert und automatisch erneuert.

Kontrolle:

```bash
sudo -u mllw58 test -s /var/lib/newsmonitor/gmail/token.json
sudo stat -c '%a %U:%G %n' /var/lib/newsmonitor/gmail/*.json
```

Erwartet wird `600 mllw58:mllw58`. Die Dateien nicht mit `cat` ausgeben.

## 5. systemd installieren

```bash
sudo install -o root -g root -m 644 deploy/raspberry/gmail-newsmonitor.service /etc/systemd/system/
sudo install -o root -g root -m 644 deploy/raspberry/gmail-newsmonitor.timer /etc/systemd/system/
sudo install -o root -g root -m 644 deploy/raspberry/gmail-feed.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gmail-newsmonitor.timer gmail-feed.service
```

Prüfen:

```bash
systemctl status gmail-newsmonitor.timer gmail-feed.service --no-pager
sudo journalctl -u gmail-newsmonitor.service -u gmail-feed.service -n 50 --no-pager
```

Logs enthalten nur Zähler, Status und Pfad; keine Mailtexte, Header, OAuth-Tokens oder API-Keys.

## 6. Sicheren HTTPS-Pfad bereitstellen

Der Feed-Server lauscht nur auf `127.0.0.1:8770`. Keine Router-Portweiterleitung einrichten. Den vorhandenen sicheren HTTPS-Tunnel des Raspberry so ergänzen, dass beispielsweise

```text
https://raspireto.tail0f8191.ts.net/gmail-feed
```

auf `http://127.0.0.1:8770/gmail-feed` zeigt. Der Endpunkt bleibt zusätzlich mit `X-API-Key` geschützt. Vor einer Änderung die bestehende Tailscale-Serve/Funnel-Konfiguration sichern und den neuen Pfad ergänzen; vorhandene `/newsmonitor`-Routen dürfen nicht überschrieben werden.

Lokaler Test ohne Ausgabe des Keys:

```bash
sudo bash -c 'set -a; source /etc/newsmonitor/gmail-newsmonitor.env; curl --fail --silent --show-error -H "X-API-Key: $GMAIL_FEED_API_KEY" http://127.0.0.1:8770/gmail-feed >/dev/null'
```

## 7. GitHub-Secrets – erst nach ausdrücklicher Freigabe

Nach erfolgreichem lokalen Test und erst nach Freigabe in `Settings → Secrets and variables → Actions` setzen:

| Secret | Wert |
|---|---|
| `GMAIL_SOURCE_ENABLED` | `true` |
| `GMAIL_FEED_URL` | öffentliche HTTPS-Feed-URL |
| `GMAIL_FEED_API_KEY` | derselbe unabhängige Feed-Key vom Raspberry |

OAuth-Clientdatei und Gmail-Token gehören **nicht** in GitHub-Secrets. Die Branch und der Pull Request aktivieren die Quelle nicht produktiv.

## 8. Inkrementelle Verarbeitung und Fehlerfälle

- Der Collector speichert `history_id` und höchstens 5000 bereits verarbeitete Gmail-Nachrichten-IDs lokal.
- Der Zustand wird erst nach erfolgreichem Schreiben des bereinigten Feeds atomar ersetzt.
- Derselbe Originalartikel erhält anhand Titel und Ziel-URL denselben Monitor-Fingerprint.
- Multipart-Mails werden rekursiv gelesen; `text/html` und `text/plain` werden unterstützt.
- Tracking-Weiterleitungen werden bei bekannten URL-Parametern auf das Originalziel reduziert.
- Abmelde-, Social-, Browseransichts- und Verwaltungslinks werden verworfen.
- Wenn Gmail die gespeicherte `historyId` nicht mehr akzeptiert, den Collector stoppen, `state.json` sichern und entfernen und einen begrenzten Resync mit `GMAIL_INITIAL_QUERY` ausführen. Der Monitor dedupliziert bereits bekannte Artikel weiterhin über Fingerprints.
- Ein Feed- oder OAuth-Fehler erzeugt eine Source-Warnung. Weil Gmail P2 ist, macht er den gesamten Monitorlauf nicht unzuverlässig.

## 9. Tests

Ohne Gmail-Zugangsdaten:

```bash
python -m unittest discover -s .github/scripts/monitor/tests -v
python -m json.tool data/monitor/config/sources.json >/dev/null
```

Die Tests verwenden synthetische Newsletter und Fake-Gmail-Antworten. Es werden keine realen Nachrichten oder Tokens benötigt.
