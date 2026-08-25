# QA Report – Claude Code handoff

Release: `NGO-CC-2026-08-25-r1`  
Generated: 2026-08-25  
Source snapshot: `NGO_Datenbank_Master`

## Summary

- Organizations: **2852**
- Persons: **3143** (16 historical-only G4 nodes added in handoff)
- Current edges: **6779**
- Current edge-source links: **6992**
- G4 historical edges: **97**
- Source registry: **1463** (1434 original + 29 reconstructed metadata rows)
- Name variants reconstructed: **212/212**
- `SONSTIGE` manual review: **34**
- Cluster IDs blank in master snapshot: **135**
- Build-blocking QA failures: **0**

## Machine checks

| Check | Status | Level | Detail |
|---|---|---|---|
| `organizations_unique_id` | PASS | BLOCKER | 2852 rows / 2852 unique |
| `organization_id_format` | PASS | BLOCKER | invalid=0 |
| `persons_unique_id` | PASS | BLOCKER | 3143 rows / 3143 unique |
| `person_id_format` | PASS | BLOCKER | invalid=0 |
| `edges_unique_id` | PASS | BLOCKER | 6779 rows / 6779 unique |
| `edge_org_fk` | PASS | BLOCKER | bad=0 |
| `edge_person_fk` | PASS | BLOCKER | bad=0 |
| `edge_source_nonblank` | PASS | BLOCKER | unresolved_edges=0 |
| `edge_source_registry_fk` | PASS | BLOCKER | bad_links=0 |
| `source_registry_unique_id` | PASS | BLOCKER | rows=1463 unique=1463 |
| `source_id_format` | PASS | BLOCKER | invalid=0 |
| `no_formula_error_tokens_in_build_data` | PASS | BLOCKER | errors=0 |
| `edge_scope_enum` | PASS | BLOCKER | bad=0 |
| `edge_relation_enum` | PASS | BLOCKER | bad=0 |
| `edge_active_current` | PASS | BLOCKER | non_current=0 |
| `categories_complete` | PASS | BLOCKER | blank=0; SONSTIGE=34 |
| `name_variants_complete` | PASS | BLOCKER | expected=212 reconstructed=212 |
| `history_person_fk` | PASS | BLOCKER | unmapped=0 |
| `history_source_registry_fk` | PASS | BLOCKER | unresolved=0 |
| `history_not_active` | PASS | BLOCKER | active_history=0 |
| `cluster_column_delivered` | PASS | INFO | assigned=2717; unassigned=135 |
| `formal_parent_not_inferred` | PASS | INFO | parent_nonblank=0 |
| `source_supplements_explicit` | PASS | INFO | reconstructed_source_rows=29 |

## Repairs applied only in the handoff export

- 204 edge rows had source fields normalized and/or shifted AP34 fields repaired. Original values remain in `audit/edge_repair_log.csv`.
- The known 11 source-empty AP30 rows are repaired only where the master itself contains the registered source identifier in the adjacent shifted field or underlying `Personen & Netzwerke` row.
- Composite source strings are normalized into atomic references in `edge_sources.csv`; ranges such as `...0020 bis ...0023` are expanded.
- Missing central registry metadata is not silently invented: reconstructed rows are marked `reconstructed_missing_registry` and use only organization-level metadata already present in the master.

## Non-blocking open data states

- 34 organizations remain deliberately `SONSTIGE`; see `data/manual_review_organizations.csv`.
- 135 organizations have no `cluster_id` in the current AP30 cluster snapshot. This is explicit in `cluster_status`; semantic UI grouping uses `category_id`.
- `parent_org_id` remains empty unless a formal hierarchy is sourced. Do not infer hierarchy from names, umbrella terms or network clusters.

## Verdict

**PASS FOR BUILD**
