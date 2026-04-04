# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"Souveräne Schweiz" is a static HTML/CSS website (no build system, no framework, no npm) providing political analysis on Swiss domestic issues. All pages are in German.

Two main content sections:
- `ch-eu/` — Analysis of the Switzerland–EU bilateral agreements package (11 treaties)
- `10mio/` — Analysis of Switzerland's projected population growth to 10 million

## Architecture

### Stylesheet
`style.css` at the root is the **single shared stylesheet** for the entire site. It defines:
- CSS custom properties in `:root` (colors, etc.)
- Global resets, typography, nav, breadcrumb, page-hero, footer, buttons, content layout (`.content-wrap` grid + `.sidebar`), and responsive breakpoints

Page-specific styles are written inline in `<style>` tags within each HTML file. Subdirectory pages reference the stylesheet as `../style.css`.

### Color Themes
| Context | Variable / Value |
|---|---|
| Brand red | `var(--rot)` = `#C8102E` |
| CH-EU Binnenmarkt | `#1a3f6e` (dark navy) |
| CH-EU secondary | `#7a9bb5` |
| 10 Mio section | `--gruen: #2d6a2d` (defined locally in page `<style>`) |

### Page Structure Pattern
Every page follows this structure:
1. `<nav>` — sticky top nav with `.nav-logo`, `.nav-links`, `.nav-x` (X/Twitter link), `.hamburger`
2. `.mobile-menu#mobileMenu` — hidden off-canvas mobile menu
3. `<nav class="breadcrumb">` — breadcrumb trail
4. `.page-hero` — title area with `.page-label`, `h1`, `.lead`
5. `<hr class="divider">` — horizontal rule separator
6. Main content (varies by page)
7. `<footer>` — standard footer
8. `<script>` — `toggleMenu()` function for hamburger menu (repeated on each page)

### Content Layout (article pages)
Detail pages under `ch-eu/` use the `.content-wrap` CSS grid: a main `.article-body` column and a sticky `.sidebar` with `.sidebar-nav` linking to all CH-EU topics.

Active nav links use the class `aktiv`.

### Placeholder Content
Many article pages contain `<div class="placeholder-block">` elements marking content yet to be written.

## Adding a New Page

When creating a new article page (e.g. in `ch-eu/`):
1. Copy the structure from an existing page like `ch-eu/mra.html`
2. Set `href="../style.css"` for the stylesheet
3. Mark the correct nav link with class `aktiv`
4. Add a 3-level breadcrumb (Start / Section / Page title)
5. Use `.content-wrap` grid with `.article-body` and `.sidebar`
6. Add the page to the sidebar nav list in all other `ch-eu/` article pages
7. Add the page link to `ch-eu/index.html` tile grid

## Fonts
Google Fonts: **Playfair Display** (headings/display) and **Source Sans 3** (body). Both are loaded via `<link>` in every page's `<head>`.



Änderungen sollen präzise, konservativ und nachvollziehbar umgesetzt werden. Bestehende fachliche, strukturelle und gestalterische Regeln der Website sind zu respektieren. Nichts, was den öffentlichen Auftritt, die Nutzerführung oder zentrale Produktlogik verändert, darf ohne ausdrückliche Rücksprache eigenständig angepasst werden.

Arbeits- und Commit-Regeln

Kleine, klar begrenzte und risikoarme Änderungen dürfen direkt auf `main` committed werden. Das gilt nur, wenn die Änderung leicht reversibel ist, keine neue Funktion einführt, keine Schnittstelle oder Integration betrifft, keine sichtbare Auswirkung auf die Website hat und weder Desktop-View noch Nutzerführung verändert.

Bei neuen Funktionen ist immer aktiv rückzufragen, ob dafür ein separater Branch angelegt werden soll.

Bei Änderungen an der API von X.com ist immer aktiv rückzufragen, ob dafür ein separater Branch angelegt werden soll.

Dasselbe gilt bei Änderungen an anderen Integrationen oder Schnittstellen, insbesondere externen APIs, Datenquellen, Webhooks, Formularlogik, CMS-Anbindungen oder anderen Systemkopplungen.

Wenn Umfang, Risiko oder Auswirkung nicht eindeutig klein und unkritisch sind, darf nicht stillschweigend entschieden werden. In solchen Fällen ist zuerst Rücksprache zu halten.

Geschützte Bereiche des sichtbaren Auftritts

Ohne ausdrückliche Rücksprache dürfen keine Änderungen am sichtbaren Auftritt, an der Desktop-View, an der Nutzerführung oder an der Struktur der Website vorgenommen werden. Das betrifft insbesondere:

* Farben, Farbwerte, Farbsystem und gestalterisch relevante Kontraste
* Typografie, Schriftgrössen, visuelle Hierarchie, Layout und Abstände
* Header, Navigation und Footer
* Seitenstruktur und Informationsarchitektur
* Aufbau, Struktur, Reihenfolge und Darstellung des Glossars
* zentrale Texte, Headlines, Claims, CTAs und strategisch oder politisch relevante Formulierungen
* Startseite, Hero-Bereich und sonstige prägende Seitenelemente
* URL-Struktur, Slugs und SEO-Grundstruktur mit inhaltlicher Wirkung
* sichtbares Frontend-Verhalten und Nutzerführung
* responsives Verhalten, sofern es die sichtbare Darstellung oder die Desktop-Ansicht verändert

Geschützte fachliche Verhaltenslogik

Ohne ausdrückliche Rücksprache dürfen keine Änderungen an bestehender fachlicher Nutzerlogik oder Interaktionslogik vorgenommen werden. Das betrifft insbesondere:

* Kontextübergaben zwischen Seiten
* automatisch gesetzte Filter oder Vorbelegungen
* bestehende Such-, Filter- und Sortierlogik
* Routing-, Sprung- und Weiterleitungsverhalten
* URL-Parameter, Query-Parameter, State-Handling oder andere Mechanismen, die fachliches Verhalten steuern
* bestehende Verknüpfungen zwischen Abkommens-Seiten und Glossar-Inhalten

Spezifische Glossar-Regel

Wenn von einer Abkommens-Seite auf die Glossar-Seite gewechselt wird, muss das zugehörige Glossar weiterhin automatisch gefiltert oder vorausgewählt sein. Dieses Verhalten ist fachlich gewollt und darf ohne Rücksprache weder entfernt noch verändert noch neu interpretiert werden.

Änderungen an Routing, Filtern, Query-Parametern, State-Logik oder Datenfluss, die dieses Verhalten beeinflussen könnten, sind vor einer Umsetzung ausdrücklich zu benennen.

Spezifische Datumsanzeige-Regel

Auf der Hauptseite `index.html` sowie auf den Hub-Seiten `https://www.souveraene-schweiz.ch/ch-eu/index.html` und `https://www.souveraene-schweiz.ch/10mio/index.html` wird auf den Kacheln jeweils das letzte Änderungsdatum angezeigt. Diese Anzeige ist fachlich gewollt und darf ohne ausdrückliche Rücksprache weder entfernt noch umgebaut noch in ihrer Logik verändert werden.

Falls Änderungen Inhalte, Rendering, Datenquelle, Template-Struktur oder Seitengenerierung betreffen, ist mitzudenken, dass diese Datumsanzeige erhalten bleiben muss.

Mobile-Prinzip

Die mobile Nutzung der Website ist ausdrücklich mitzuberücksichtigen. Mobile Kompatibilität, Lesbarkeit, Navigation, Tap-Ziele, Inhaltszugang und Glossar-Nutzbarkeit müssen bei Änderungen mitgedacht werden.

Die Berücksichtigung mobiler Nutzung ist jedoch kein Auftrag, die Desktop-View oder das bestehende Layout eigenständig zu verändern.

Ohne ausdrückliche Rücksprache dürfen keine Anpassungen vorgenommen werden, die das responsive Verhalten, die sichtbare Darstellung oder die Desktop-Ansicht verändern.

Wenn eine mobile Verbesserung nur durch sichtbare UI-, Layout-, Struktur- oder Verhaltensänderungen möglich wäre, ist dies zuerst zu benennen und freizugeben.

Erlaubte Änderungen ohne Rücksprache

Ohne Rücksprache erlaubt sind nur klar begrenzte Änderungen wie:

* kleine technische Bugfixes ohne sichtbare Auswirkung
* Refactorings ohne Veränderung von Erscheinungsbild, Nutzerführung oder Funktionsumfang
* kleine Stabilitäts-, Wartbarkeits- oder Performance-Verbesserungen ohne sichtbare Änderung
* offensichtliche Fehlerkorrekturen, sofern keine strategische, politische, strukturelle oder gestalterische Aussage verändert wird

Nicht erlaubt ohne Rücksprache

Nicht eigenständig erlaubt sind insbesondere:

* selbständige Modernisierung des Designs
* Umstrukturierung der Navigation
* Änderung des Glossar-Aufbaus
* neue Funktionen ohne Rücksprache zum Arbeitsmodus
* Änderungen an der API von X.com ohne Rücksprache zum Arbeitsmodus
* eigenständige Änderungen anderer Integrationen oder Schnittstellen
* neue gestalterische Muster oder UI-Konzepte
* inhaltliche oder politische Umformulierung zentraler Aussagen
* mobile Optimierungen, die die Desktop-View oder sichtbare Darstellung verändern
* Änderungen an bestehender Verhaltenslogik, auch wenn sie technisch klein erscheinen
* Änderungen, die bekannte Produktregeln versehentlich aufheben könnten

Verhalten bei Unsicherheit

Wenn unklar ist, ob eine Änderung den sichtbaren Auftritt, die Desktop-View, die mobile Nutzbarkeit, die Informationsarchitektur, die Nutzerführung, eine Schnittstelle, eine bestehende fachliche Regel oder die inhaltliche Positionierung beeinflusst, darf die Änderung nicht eigenständig umgesetzt werden.

In solchen Fällen sind zuerst die betroffenen Dateien, die vermutete Auswirkung, mögliche Risiken, der Zielkonflikt und der empfohlene Arbeitsweg zu benennen. Danach ist Rücksprache einzuholen.

Im Zweifel ist immer konservativ zu handeln.

Umgang mit unvollständig dokumentierten Regeln

Es ist möglich, dass nicht alle fachlichen Regeln der Website bereits ausdrücklich dokumentiert sind. Deshalb ist bei Änderungen an Routing, Filtern, Seitengenerierung, Templates, Kacheln, Datumslogik, Inhaltsverknüpfungen, Glossar-Mechanik, Navigation oder anderen zentralen Seitenelementen besondere Vorsicht geboten.

Wenn eine Änderung einen Bereich betrifft, in dem weitere implizite Produktregeln vermutet werden können, ist dies ausdrücklich zu benennen und vor der Umsetzung Rücksprache zu halten.

Arbeitsweise

Vor Änderungen sind zuerst die relevanten Dateien und die betroffenen fachlichen Regeln zu identifizieren.

Vor der Umsetzung ist kurz einzuordnen, ob die geplante Änderung rein technisch, funktional, integrationsbezogen, strukturell oder sichtbar ist.

Bei neuen Funktionen ist aktiv zu fragen, ob ein Branch angelegt werden soll.

Bei Änderungen an der API von X.com oder anderen Schnittstellen ist aktiv zu fragen, ob ein Branch angelegt werden soll.

Änderungen sind möglichst klein, nachvollziehbar und thematisch sauber zu halten.

Nach Änderungen ist exakt aufzulisten, welche Dateien geändert wurden, was fachlich geändert wurde und ob sichtbare Auswirkungen bestehen.

Quellenprüfung-Kachel-Regel

Die Kachel „Quellenprüfung / Faktenchecks" auf `ch-eu/index.html` (`.dql-card[data-track="cheu/ql/faktenchecks"]`) muss inhaltlich immer identisch mit der entsprechenden Kachel auf `index.html` sein. Bei jeder Aktualisierung der Faktenchecks-Kachel auf der Hauptseite ist dieselbe Änderung (Beschreibungstext, Datum via `data-updated`) auch auf `ch-eu/index.html` nachzuführen.

Neu-Badge-Regel

Wenn auf `index.html` oder `ch-eu/index.html` eine Kachel mit neuem Text befüllt wird, ist sie mit „Neu" zu markieren. Es darf immer nur eine einzige Kachel das Badge tragen; ein vorhandenes „Neu" auf einer anderen Kachel ist dabei zu entfernen.

**Mechanismus je Kacheltyp:**

- `.lead-heute` (Hauptseite): manuelles `<span class="badge-neu">Neu</span>` im `.lead-heute-label`. CSS-Klasse `badge-neu` in `style.css` (roter Hintergrund `var(--rot)`, weisse Schrift).
- `.fokus-kachel` und `.t-kachel` und `.dql-card` (Dossier-Seiten): Das Badge wird **automatisch per JS** erzeugt, wenn `data-updated` auf das Kachel-Element gesetzt ist und das Datum ≤ 30 Tage zurückliegt. Das Badge erscheint als `.update-badge` (roter Hintergrund, **oben links** positioniert). Um das Badge zu steuern, genügt es, `data-updated` auf das aktuelle Datum zu setzen bzw. auf einem älteren Eintrag zu belassen.
- Es darf **kein manuelles `badge-neu`** auf Kacheln gesetzt werden, die bereits durch den JS-Mechanismus ein `update-badge` erhalten.

**Reihenfolge der „Im Fokus"-Kacheln:**
- Die neueste Kachel steht immer an erster Stelle.
- Kacheln werden absteigend nach `data-updated` sortiert.

Das Badge darf nach zwei Wochen ohne gesonderten Auftrag im Rahmen einer anderen Änderung entfernt werden (bei `.lead-heute`: Badge-Span entfernen; bei Dossier-Kacheln: `data-updated` auf ein Datum >30 Tage zurück setzen oder Attribut entfernen).

Fortschreibbarkeit der Regeln

Dieses Regelwerk ist nicht abgeschlossen. Wenn später weitere fachliche, visuelle oder strukturelle Invarianten genannt werden, sind sie als verbindliche Projektregeln zu behandeln und in gleicher Priorität zu berücksichtigen.

