# Source and publication policy

## Hard publication rule
Every visible current edge must have at least one row in `edge_sources.csv`, and every linked `source_id` must resolve to `source_registry.csv`.

## Atomic sources
Do not treat semicolon-separated or range-like raw values as a source ID. `edge_sources.csv` and `history_sources.csv` are already normalized to one source ID per row.

## Reconstructed registry rows
Rows with `registry_status=reconstructed_missing_registry` repair a referential-integrity defect in the master: the source identifier existed in relationship data but not in the central registry. The supplement uses only organization-level metadata from the master and clearly marks that the exact deep-link metadata was not retained. Do not label the homepage URL as the exact evidence page.

## Lobbywatch
Keep Lobbywatch attribution for `Q-LW-*` records. Display derived relationships and source attribution; do not reproduce protected editorial descriptions or bulk site content.

## No source = no edge
The production files have no source-less current edge. If future imports introduce one, quarantine it rather than rendering it.
