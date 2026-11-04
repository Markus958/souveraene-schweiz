# Einheitliches Quellenmodell des Newsmonitors

Der Newsmonitor trennt den tatsächlichen Herausgeber eines Artikels vom Weg, auf
dem der Artikel entdeckt wurde. Das Modell gilt für Website-, RSS-, API-, Gmail-
und E-Paper-Funde. Bestehende Felder wie `source_id`, `source_name`, `url` und
`fetched_at` bleiben aus Kompatibilitätsgründen erhalten.

## Felder

- `original_source`: Identität des tatsächlichen Herausgebers mit Klasse, Typ und
  nachvollziehbarer Zuordnungssicherheit.
- `original_url`: kanonische Artikel-URL ohne bekannte Trackingparameter.
- `discovery_channels`: alle Fundwege desselben Artikels samt Entdeckungszeit.
- `discovered_at`: frühester bekannter Entdeckungszeitpunkt.
- `published_at`: nachweisbares Veröffentlichungsdatum des Artikels.
- `updated_at`: letzte nachweisbare Aktualisierung.
- `source_type`: etwa `amtliche_primaerquelle`, `rechtsverbindlicher_text`,
  `medienbericht`, `fachpublikation` oder `newsletter`.
- `source_confidence`: Stufe, numerischer Wert und Begründung der Zuordnung.
- `source_usage`: Eignung als unabhängige Faktencheck- oder bevorzugte
  Rechtsquelle. Bundesratsmitteilungen sind für CH–EU-Vertragsbehauptungen nicht
  als unabhängiger Faktencheck markiert; dafür werden Vertragstexte/Fedlex
  bevorzugt.

Unbekannte Herausgeber erhalten `id: unknown`, `name: Unbekannt` und eine
Begründung. Eine gemeinsam verwendete Domain wie `admin.ch` genügt nicht zur
Zuordnung eines Bundesamtes. Dort braucht es einen eindeutigen Subdomain-Treffer
oder strukturierte Herausgeberdaten.

## Zusammenführung

Identische kanonische Artikel-URLs werden zu einem Quellenobjekt vereinigt. Alle
Fundwege bleiben erhalten; die verlässlichere Herausgeberzuordnung und vorhandene
Publikationsdaten werden übernommen. Zusätzliche Fundwege erhöhen weder die Zahl
unabhängiger Quellen noch automatisch deren Qualitätswert.

Ähnliche Meldungen mit unterschiedlichen Artikel-URLs bilden weiterhin ein
Ereignis-Cluster mit mehreren unabhängigen Quellen.

## Vergleichsdiagnose

`news_discovery.source_comparison` weist folgende Messgrössen aus:

- abgedeckte Originalquellen und unbekannte Zuordnungen,
- Artikel mit mehreren Fundwegen,
- zusätzliche Gmail-Artikel,
- Mengen nach Sammlung, Neuigkeitsprüfung, Relevanzfilter, Klassifikation und
  Auswahl.

Damit ist ein späterer Vergleich mit einem zweiten Briefing möglich, ohne bereits
ein paralleles Bewertungssystem einzuführen.
