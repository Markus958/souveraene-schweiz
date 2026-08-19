# Claude Code – Implementierungsauftrag

Die bestehende Netzwerkseite auf die eingefrorene Datenbasis **3.7.49 / 342 Organisationen** umstellen. Bestehendes Layout und Bedienkonzept möglichst erhalten.

## Muss
1. `nodes_organisation.csv` ist das verbindliche Organisationsuniversum.
2. Keine IDs aus Nummerierungslücken erzeugen; insbesondere kein `NGO-0172`.
3. `web_edges.csv` als aktuelle Kantenbasis verwenden.
4. Default G3 (N1–N3), G2 inkl. N4 nur nach Umschaltung.
5. `historical_edges.csv` ausschliesslich in separater Historienansicht.
6. Cluster aus `cluster_export.csv`/`cluster_summary.csv`; keine alten Clusterwerte.
7. Quellen über `source_id` bzw. `source_ids_all` auf `sources.csv` auflösen.
8. Bei Reference-only-Quellen ohne URL die Datenlücke anzeigen, keinen Link erfinden.
9. Organisationsdetails aus `ngo_stammdaten.csv`.
10. Partei = Personenmerkmal; keine Organisationspartei ableiten.
11. Strukturmetriken nicht als Einfluss/Macht/Steuerung/Korruption interpretieren.
12. `coverage_flag=Abdeckungslücke` nicht als tatsächliche Isolation formulieren.

## Abnahme
- exakt 342 Organisationsknoten
- kein NGO-0172
- alle Edge-Organisationen und Edge-Personen lösen auf
- alle Clusterzuordnungen lösen auf
- alle Edge-Quellenreferenzen lösen in `sources.csv` auf
- Defaultgraph enthält keine N4-Kanten
- keine alte 144er/301er/327er Datenbasis oder 9-Cluster-Texte
- Version 3.7.49 / Stand 19.08.2026 sichtbar
