# NGO-Übersicht Schweiz – Claude Code Übergabepaket

**Version:** 3.7.49 – AP28–AP30 Rerun nach AP34 Freeze  
**Stand:** 19.08.2026  
**Universum:** 342 nationale Masterorganisationen  
**Wichtig:** NGO-0172 existiert nicht und darf nicht erzeugt werden.

## Dateien

- `data/nodes_organisation.csv` – 342 Organisationsknoten
- `data/nodes_personen.csv` – 3192 aktuelle Personenknoten
- `data/web_edges.csv` – 4347 aktuelle quellennahe Edge-Zeilen
- `data/cluster_export.csv` – vollständige Clusterzuordnung
- `data/cluster_summary.csv` – 20 nichttriviale Louvain-Cluster
- `data/historical_edges.csv` – G4-Historie separat
- `data/sources.csv` – Quellen-Lookup
- `data/ngo_stammdaten.csv` – vollständige Organisationsprofile
- `data/ap31_specification.csv` – Kernvorgaben
- `CLAUDE_CODE_HANDOFF.md`
- `VALIDATION.md`
- `manifest.json`

## Graphlogik

- **G3 Default:** N1–N3.
- **G2 erweitert:** N1–N4, Gewichte 4/3/2/1.
- **G4 historisch:** strikt separat.
- Cluster sind deskriptive Netzwerkgruppen.
- Zentralität, Betweenness und PageRank sind Strukturmetriken, keine Einfluss- oder Machtwerte.
- Cluster 0 / Abdeckungslücke bedeutet nur fehlende belegte Projektionskante.

## Clusteranalyse

- 20 nichttriviale Cluster plus Cluster 0
- Louvain Seed 29
- G2/G3-NMI 0.826
- 117 G2-Isolate
- 710 G2-Projektionskanten

## Exportbereinigung für AP31

Vier verwaiste Legacy-Edge-Zeilen mit `NGO-0172` wurden aus dem Übergabeexport entfernt, da diese NGO-ID im eingefrorenen Master nicht existiert.  
Ältere Schema-Verschiebungen bei Quellenfeldern wurden **nur im Übergabeexport** normalisiert. Quellen-IDs wurden aus den bestehenden Edge-/Netzwerkzeilen extrahiert; es wurden keine Belege erfunden.

Für 29 bestehende Source-IDs fehlt im Blatt `Quellen` eine eigene Registerzeile. `sources.csv` enthält dafür transparente `Reference-only`-Einträge ohne erfundene URL. Damit bleibt jede Edge-Referenz technisch auflösbar und die Datenlücke sichtbar.
