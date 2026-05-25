# Technische Dokumentation – souveraene-schweiz.ch

## Überblick

Statische HTML/CSS-Website, kein CMS, kein Framework. Alle Seiten liegen als fertige `.html`-Dateien im Repository. GitHub Actions übernimmt den Betrieb: bauen, deployen und automatische Aufgaben. Gehostet via **GitHub Pages**.

---

## Wie wird die Seite veröffentlicht?

Jede Änderung, die auf den Branch `main` gepusht wird, löst automatisch den **Deploy-Workflow** aus. Dieser führt folgende Schritte durch:

1. Letzte Änderungsdaten in alle Seiten einsetzen (`<!--LASTMOD-->` → echtes Datum)
2. GoatCounter-Besuchsstatistiken abrufen
3. Glossar-Querverweise generieren
4. **Suchindex neu bauen** (`data/search-index.json`)
5. Statistikseite mit Passwort-Hash versehen
6. Alles auf GitHub Pages hochladen → Seite ist live

**Dauer:** ca. 1–2 Minuten nach dem Push.

---

## Automatische Jobs (Cron)

Alle Zeiten als Schweizer Sommerzeit (CEST = UTC+2).

| Job | Wann | Was passiert |
|-----|------|--------------|
| **Deploy** | tägl. 07:00–20:00, jede volle Stunde | Seite neu bauen und deployen (damit Badges, Daten und Datumsanzeigen aktuell bleiben, auch ohne Code-Änderung) |
| **GoatCounter Stats** | tägl. 07:21–20:21, stündlich (je :21) | Besuchszahlen von GoatCounter abrufen, in `assets/stats.json` speichern (erscheint auf statistik.html) |
| **X-Post aktualisieren** | tägl. 07:17–11:17 und 14:17–16:17 und 18:17–21:17, stündlich | Neuesten Post von @mllw58 via X API abrufen, in `data/latest-post.json` speichern; bei Änderung Deploy antriggern |
| **Wartungsprüfung** | tägl. einmal um 05:30 | Prüft ob alle Sitemap-Einträge als Dateien existieren, OG-Images vorhanden sind und interne Links stimmen |

---

## Ereignisgesteuerte Jobs (bei Push)

| Job | Auslöser | Was passiert |
|-----|----------|--------------|
| **Deploy** | Jeder Push auf `main` | Seite vollständig neu bauen und veröffentlichen |
| **GoatCounter Stats** | Jeder Push auf `main` | Stats einmalig abrufen |
| **Sitemap synchronisieren** | Push auf `main`, wenn eine `.html`-Datei geändert wurde | `sitemap.xml` mit aktuellen Änderungsdaten (`lastmod`) aktualisieren |

---

## Manuell auslösbare Aktionen

Können im GitHub-Interface unter «Actions» per Knopfdruck gestartet werden:

| Aktion | Wofür |
|--------|-------|
| **Deploy** | Seite manuell neu bauen (z.B. nach Datenproblem) |
| **X-Post manuell aktualisieren** | Tweet-URL und Text eingeben → wird sofort in `data/latest-post.json` geschrieben und Deploy angestossen |
| **GoatCounter Stats** | Stats einmalig manuell abrufen |
| **Wartungsprüfung** | Integrität manuell prüfen |

---

## Wichtige Dateien und Ordner

| Pfad | Bedeutung |
|------|-----------|
| `style.css` | Einziges globales Stylesheet der ganzen Site |
| `data/search-index.json` | Suchindex, wird bei jedem Deploy neu gebaut |
| `data/latest-post.json` | Letzter X-Post von @mllw58 (für Seiteneinbindung) |
| `assets/stats.json` | GoatCounter-Besuchsstatistiken |
| `assets/data/gemeinden-steuerkraft.json` | Steuerdaten aller Schweizer Gemeinden (ESTV 2022) |
| `.github/workflows/` | Alle automatischen Jobs (YAML-Dateien) |
| `.github/scripts/` | Python/JS-Skripte der Jobs |
| `scripts/` | Hilfsskripte für lokale Arbeiten |
| `CLAUDE.md` | Regeln und Vorgaben für die KI-Zusammenarbeit |

---

## Secrets und Zugangsdaten

Werden im GitHub-Repository unter «Settings → Secrets» verwaltet. Nie im Code gespeichert.

| Secret | Wozu |
|--------|------|
| `GOATCOUNTER_TOKEN` | Zugriff auf GoatCounter-API (Besuchsstatistiken) |
| `X_BEARER_TOKEN` | Zugriff auf X API v2 (Post abrufen) |
| `PW_FUER_STATISTIK_SEITE` | Passwort für die Statistikseite |

---

## Suchfunktion

Die Suche auf der Website läuft **vollständig im Browser** (kein Server). Bei Seitenaufruf lädt `assets/search.js` den Index `data/search-index.json`. Der Index enthält Titel, Teaser-Text und URL aller indizierten Seiten und wird bei jedem Deploy neu generiert.

---

## Hosting-Kosten

GitHub Pages ist kostenlos für öffentliche Repositories. GoatCounter hat einen kostenlosen Plan (bis 100'000 Seitenaufrufe/Monat). Die X-API (Post abrufen) nutzt den kostenlosen Basic-Tier.
