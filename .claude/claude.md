Projektkontext

Dieses Projekt arbeitet ausschliesslich im Repository `Markus958/souveraene-schweiz`. Andere Repositories dürfen in diesem Projekt weder analysiert noch verändert werden.

Ziel der Zusammenarbeit

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

Akkordeon-Regel (botschaft-bundesrat.html)

Auf der Seite ch-eu/botschaft-bundesrat.html werden in den aufklappbaren Akkordeon-Tabs ausschliesslich die Titel angezeigt (analog den anderen Abkommens-Seiten wie binnenmarkt.html). Es dürfen keine Teaser-Texte (Elemente mit class="accordion-teaser") unterhalb der h3-Überschriften eingefügt werden. Diese Regel gilt auch beim Hinzufügen neuer Abschnitte oder beim Ersetzen des Seiteninhalts.

Grafik-Regel (botschaft-bundesrat.html)

Alle Grafiken auf ch-eu/botschaft-bundesrat.html verwenden die Klasse br-figure mit img width:100% height:auto. Neue Grafiken müssen dieselbe CSS-Klasse und denselben Wrapper verwenden, damit alle Bilder einheitlich skaliert werden.

Fortschreibbarkeit der Regeln

Dieses Regelwerk ist nicht abgeschlossen. Wenn später weitere fachliche, visuelle oder strukturelle Invarianten genannt werden, sind sie als verbindliche Projektregeln zu behandeln und in gleicher Priorität zu berücksichtigen.
