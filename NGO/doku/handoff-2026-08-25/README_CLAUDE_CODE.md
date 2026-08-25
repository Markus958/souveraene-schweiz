# NGO-Übersicht Schweiz – Claude Code Handoff

Release: `NGO-CC-2026-08-25-r1`  
Source of truth: `NGO_Datenbank_Master`, snapshot 25.08.2026.

## Start here

1. Read `config/build_contract.json`.
2. Use **only** the files listed under `build_inputs` for production.
3. Read `docs/QA_REPORT.md` before changing data assumptions.
4. Identity is ID-based (`org_id`, `person_id`, `edge_id`), never name-based.

## Production data

- `data/organizations.csv` – 2852 organization nodes, including semantic `category_id`, network `cluster_id`, classification provenance and formal hierarchy fields.
- `data/persons.csv` – 3143 person nodes, including 16 explicitly marked historical-only G4 nodes added for referential integrity.
- `data/person_name_variants.csv` – all 212 persons with `variant_count=2` now have an explicit safe variant mapping.
- `data/edges_current.csv` – 6779 current, normalized organization-person edges.
- `data/edge_sources.csv` – atomic many-to-many edge/source mapping. This is the authoritative traceability layer.
- `data/history_g4.csv` – 97 historical G4 relationships, explicitly inactive.
- `data/history_sources.csv` – atomic history/source mapping.
- `data/source_registry.csv` – 1463 source records; includes 29 explicitly marked reconstructed registry metadata rows.
- `data/categories.csv` – stable semantic category dictionary for UI grouping.
- `data/cluster_assignments.csv` – network-cluster assignment/status for every organization.
- `data/manual_review_organizations.csv` – 34 remaining `SONSTIGE` cases; valid explicit state, not a build error.

## Three concepts that must never be mixed

- `category_id`: semantic/thematic grouping for the website and drill-down navigation.
- `cluster_id`: Louvain/network-community information from AP30; structural, not thematic, and nullable for 135 nodes in this snapshot.
- `parent_org_id`: formal organizational hierarchy only. Blank means no sourced parent relation is asserted.

## Source rule

A current edge is publishable only through `edge_sources.csv`. Every `source_id` in that file resolves to `source_registry.csv`. Do not use raw composite source strings from the audit snapshot.

`registry_status=reconstructed_missing_registry` means the identifier existed in master relationship data but its bibliographic registry row was missing. These rows are included to keep referential integrity and are transparently marked. Their URL is an organization-level URL from the master and must **not** be presented as an exact deep-link citation.

## Lobbywatch

Lobbywatch-derived relationships remain source-attributed through their `Q-LW-*` source records. The package contains derived relationship data, not copied Lobbywatch editorial text. Preserve source attribution in any source/details UI.

## Audit files

Files under `audit/` document repairs and raw inputs. They are **not build inputs**. This prevents the previously observed source-less or shifted rows from re-entering the production graph.

## QA

The release passes all build-blocking checks in `docs/QA_REPORT.md` with **0 blockers**.
