# Audit der News-State-Migration auf Schema 3

Stand: 5. November 2026

## Kurzfazit

Der bisherige Migrationsentwurf hätte verunreinigte Ereignis-Cluster vollständig
gelöscht und die bestätigte Baseline aus allen beobachteten Fingerprints neu aufgebaut.
Beides wurde korrigiert:

- Verunreinigte Cluster werden anhand ihrer historischen Artikelquellen und Titel
  deterministisch aufgeteilt. Keine Quelle, kanonische URL oder Fingerprint-Identität
  wird dabei entfernt.
- `baseline_seen_fingerprints` aus Schema 2 wird unverändert übernommen. Ein nur in
  einem unvollständigen Lauf oder als E-Paper-Vorabmeldung beobachteter Fingerprint
  bleibt ausserhalb der bestätigten Baseline.
- Ein später über Gmail, RSS oder einen anderen Kanal eintreffender Artikel mit neuer
  Fingerprint-ID wird weiterhin über seine erhaltene kanonische URL erkannt.

## Nicht persistierender Test mit dem produktiven Zustand

Quelle war die unveränderte Git-Version
`origin/main:data/monitor/state/news_state.json`. Das Audit las sie mit `git show`
direkt in den Prozess und rief ausschliesslich `_migrate()` auf einer tiefen Kopie auf.
`save_news_state()` wurde nicht aufgerufen und es wurde keine Zustandsdatei geschrieben.

Aufruf:

```text
python .github/scripts/monitor/audit_state_migration.py \
  --git-ref origin/main:data/monitor/state/news_state.json
```

Ergebnis:

| Messwert | Vorher | Nachher |
|---|---:|---:|
| Schema | 2 | 3 |
| Ereignisse | 233 | 1'462 |
| Beobachtete Fingerprints | 8'224 | 8'224 |
| Bestätigte Baseline-Fingerprints | 6'876 | 6'876 |
| Kanonische URLs | 1'114 | 1'114 |

- 157 verunreinigte Cluster wurden erkannt.
- Durch die konservative Aufteilung entstanden netto 1'229 eigenständige Cluster.
- Verlorene Fingerprints: 0.
- Verlorene kanonische URLs: 0.
- Nachträglich zur Baseline hinzugefügte Fingerprints: 0.
- Aus der Baseline entfernte Fingerprints: 0.
- 233 historische Artikel wechselten von `Duplikat` zu `Update`, weil ihre jeweiligen
  Fingerprints im Gegensatz zum früher gemeinsam bestätigten Mischcluster nicht in der
  bestätigten Schema-2-Baseline lagen.
- Wechsel zu `Neu`: 0.
- Mögliche fälschliche Neu-Meldungen: 0.

Die hohe Zahl zusätzlicher Cluster ist erwartbar: Die Schema-2-Fehlfunktion hatte
zahlreiche voneinander unabhängige Titel wiederholt dem jeweils nächstgelegenen
historischen Cluster zugeordnet. Die Aufteilung stellt die bereits gespeicherten
Artikelidentitäten wieder getrennt dar, ohne neue Inhalte zu erfinden.

## Regressionstests

Abgedeckt sind:

- Aufteilung eines verunreinigten Clusters bei Erhalt aller URLs und Fingerprints.
- Wiedererkennung derselben kanonischen URL mit abweichendem Kanal-Fingerprint.
- Erhalt einer bestätigten Schema-2-Baseline.
- Keine Baseline-Beförderung nach unvollständigem Lauf.
- E-Paper-Vorabmeldung bleibt unbestätigt und wird beim späteren Webfund als Update
  korreliert.
- Audit erkennt verlorene Identitäten und mögliche falsche Neu-Meldungen.

