# Auftrag an Claude Code – NGO-Netzwerk

Bitte aktualisiere die bestehende Netzwerkseite des Projekts anhand dieses Datenpakets.

## 1. Datenbasis
Nutze ausschließlich:
- `ngo_nodes_organisation.csv`
- `ngo_nodes_personen_raw.csv`
- `ngo_edges_current.csv`
- `ngo_clusters_analysis.csv`
- `network_metadata.json`

Die Dateien stammen aus `NGO_Datenbank_Master`, Version **3.7.1 – AP32 abgeschlossen**, Datenstand 16.08.2026.

## 2. Standardansicht
- Start im **G3-Kernnetz (N1–N3)**.
- Umschalter auf G2 darf N4 ergänzen.
- G4-Historie als eigener Modus/Toggle, niemals automatisch über aktuelle Beziehungen legen.

## 3. Personen kanonisieren
Vor Aufbau des UI-Graphen einen `canonical_person_key` erzeugen:
1. Unicode-Normalisierung,
2. lowercase,
3. Interpunktion als Trenner behandeln,
4. Whitespace normalisieren,
5. Tokens sortieren,
6. identische Tokenlisten zusammenführen.

Kein Levenshtein-/Fuzzy-/phonetisches Matching. Originalwerte `person_display` und `target_person_id` behalten.

## 4. UI
Implementiere:
- Suche Organisation/Person
- Filter Obergruppe
- Filter Cluster
- Filter Partei
- Filter N1–N4
- G2/G3-Umschalter
- getrennten Historienmodus
- Detailpanel für Organisation und Person
- Quellenanzeige über `source_id`
- URL-State für gewählten Knoten und wichtige Filter, soweit im bestehenden Stack sinnvoll

## 5. Darstellung
- Node-Farbe wahlweise Cluster oder Obergruppe.
- Node-Größe darf strukturelle Kennzahlen verwenden, muss aber als „Netzwerkzentralität“/„strukturelle Brückenfunktion“ bezeichnet sein.
- Direkte und aus gemeinsam erfassten Personen abgeleitete Organisationsbeziehungen visuell unterscheidbar machen, falls eine Organisationsprojektion angeboten wird.
- Mobile: fokussierte Nachbarschaft statt erzwungenem Gesamtgraph.

## 6. Verbote / Interpretationsschutz
Nicht verwenden:
- „Einflussranking“, wenn nur Netzwerkzentralität gemeint ist;
- Parteizugehörigkeit einer Organisation aus Personen ableiten;
- „nicht vernetzt“ für die acht Abdeckungslücken;
- historische und aktuelle Rollen ohne Kennzeichnung mischen;
- Fuzzy-Matching bei Personennamen.

## 7. Abnahme
Vor Abschluss bitte automatisch prüfen und ausgeben:
- Organisationszahl = 144
- aktuelle Edge-Zahl = 2’628
- G3-Edge-Zahl = 2’404
- keine N4-Kante in Default G3
- keine Edge ohne `source_org_id`, `target_person_id`, `relation_class` und `source_id`
- Liste der durch sichere Kanonisierung zusammengeführten Namensvarianten
- die acht Abdeckungslücken bleiben sichtbar

Erstelle danach eine kurze Änderungsübersicht mit den betroffenen Dateien und offenen Punkten.

## 8. Quellenanzeige korrigieren

Die bisher sichtbare Anzeige kryptischer IDs wie `Q-AP11-0032` ist zu ersetzen.

Lade `ngo_edge_sources.csv` und `ngo_sources_web.csv`. Joine `edge_id` → `ngo_edge_sources.edge_id` und anschliessend `source_id` → `ngo_sources_web.source_id`. Eine Edge kann mehrere Quellen haben.

**Primär sichtbar:**
- `publisher_author` – `title`
- darunter: `source_type` · `source_rank` · `quality` · Datum/Jahr
- falls `url` vorhanden: Button/Link **„Quelle öffnen“**

**Nur sekundär/optional:**
- `source_id` als interne Referenz in einem aufklappbaren Detail-/Auditbereich.

Die interne ID darf niemals die einzige sichtbare Quellenangabe sein.

Fallback:
- kein Titel → Publisher/Autor + Quellentyp anzeigen;
- keine URL → bibliografische Quelle anzeigen, aber keinen Link erfinden;
- fehlende Source-ID-Zuordnung → sichtbar als „Quellenangabe im Datenexport nicht gefunden“ markieren und in der QA ausgeben.

Zusätzliche Abnahme:
- 100 % der in `ngo_edges_current.csv` verwendeten `source_id` gegen `ngo_sources_web.csv` prüfen;
- Anzahl fehlender Source-Joins ausgeben;
- Stichprobe der Quellenkarten mit mindestens Q1 und Q2 testen.
