# Data dictionary

## organizations.csv
- `org_id`: stable organization identity.
- `category_id`: semantic/thematic website grouping.
- `subcategory`: finer descriptive category where available.
- `classification_method`, `classification_confidence`, `classification_note`, `classification_override`: provenance of the semantic classification.
- `cluster_id`: network-community ID; may be blank.
- `parent_org_id`, `parent_relation_type`: formal sourced hierarchy only; blank is valid.

## persons.csv / person_name_variants.csv
- `person_id`: stable canonical person identity.
- `display_name`: canonical display form.
- `variant_count`: number of known canonical/variant forms in AP30.
- `person_name_variants.csv` supplies the previously missing alternate forms using exact token-identity reconstruction from master raw layers; no fuzzy person fusion was used.

## edges_current.csv
- `person_scope`: P1–P6.
- `relation_class`: N1–N4.
- `weight`: AP26 edge weight.
- `source_id`: first normalized atomic source for compatibility.
- `source_ids`: all normalized atomic sources joined by semicolon. For programmatic traceability prefer `edge_sources.csv`.
- `repair_status`: indicates whether an AP34 shifted-field repair was applied in this handoff.

## history_g4.csv
Historical relationships only; `active` is always `Nein`. `date_status=historical_undated` is valid where no reliable boundary date exists.

## source_registry.csv
`registry_status=original_master_registry` is an original row from the master. `reconstructed_missing_registry` is an explicitly reconstructed metadata row used to restore referential integrity without pretending to know an exact missing deep link.
