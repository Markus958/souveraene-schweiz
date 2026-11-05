from __future__ import annotations

import copy
import hashlib
import json
from datetime import datetime
from typing import Any

from config import REPO_ROOT
from eventize import event_similarity
from storage import write_json
from url_identity import canonical_url

STATE_PATH = REPO_ROOT / "data" / "monitor" / "state" / "news_state.json"
SCHEMA_VERSION = 3
STRONG_EVENT_TERMS = {"f-35", "f35", "patriot", "ubs", "13. ahv", "stromabkommen", "personenfreizuegigkeit", "eu-paket"}


def _empty_state() -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "last_run": None,
        "last_complete_run": None,
        "seen_fingerprints": [],
        "baseline_seen_fingerprints": [],
        "events": {},
    }


def _migrate(data: dict[str, Any]) -> dict[str, Any]:
    state = _empty_state()
    state.update(copy.deepcopy(data))
    events = state.get("events") if isinstance(state.get("events"), dict) else {}
    # Schema 2 could append a new event to the nearest historical cluster even
    # when similarity was below the 0.48 merge threshold. Those clusters contain
    # unrelated titles/sources and poison canonical-URL novelty checks. Exact
    # Keep every source identity while separating demonstrably unrelated append
    # groups. Dropping a whole cluster would lose its canonical URLs and could
    # re-alert the same article when another discovery channel uses a new fingerprint.
    if int(data.get("schema_version", 0) or 0) < 3:
        clean_events: dict[str, Any] = {}
        for event_id, event in events.items():
            if not isinstance(event, dict):
                continue
            for split_id, split_event in _split_polluted_event(str(event_id), event):
                candidate_id = split_id
                suffix = 2
                while candidate_id in clean_events:
                    candidate_id = f"{split_id}-{suffix}"
                    suffix += 1
                split_event["event_id"] = candidate_id
                clean_events[candidate_id] = split_event
        events = clean_events
    state["events"] = events
    observed = {str(v) for v in state.get("seen_fingerprints", [])}
    # Schema 2 already distinguishes all observations from the last confirmed
    # complete baseline. Never promote incomplete-run or e-paper-only observations
    # merely because migration happens later.
    confirmed = {str(v) for v in state.get("baseline_seen_fingerprints", [])}
    for event in events.values():
        sources = event.get("sources", []) if isinstance(event, dict) else []
        if isinstance(event, dict):
            source_fps = {
                str(src.get("fingerprint")) for src in sources
                if isinstance(src, dict) and src.get("fingerprint")
            }
            event["baseline_confirmed"] = bool(source_fps & confirmed) if source_fps else bool(event.get("baseline_confirmed"))
            if not event["baseline_confirmed"]:
                event.pop("baseline_confirmed_at", None)

    state["seen_fingerprints"] = sorted(observed)
    state["baseline_seen_fingerprints"] = sorted(confirmed)
    state["schema_version"] = SCHEMA_VERSION
    return state


def _polluted_history(event: dict[str, Any]) -> bool:
    history = [item for item in event.get("history", []) if isinstance(item, dict)]
    titles = {str(item.get("title") or "") for item in history if item.get("title")}
    return len(titles) > 1 and any(
        item.get("match_similarity") is not None
        and float(item.get("match_similarity") or 0.0) < 0.48
        for item in history[1:]
    )


def _split_id(event_id: str, title: str, sources: list[dict[str, Any]]) -> str:
    urls = sorted(filter(None, (
        canonical_url(str(source.get("canonical_url") or source.get("url") or ""))
        for source in sources
    )))
    raw = json.dumps([event_id, title, urls], ensure_ascii=False, sort_keys=True)
    return f"{event_id}-S{hashlib.sha1(raw.encode('utf-8')).hexdigest()[:8].upper()}"


def _split_polluted_event(event_id: str, event: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    if not _polluted_history(event):
        return [(event_id, event)]

    groups: list[dict[str, Any]] = []
    url_groups: dict[str, dict[str, Any]] = {}
    title_groups: dict[str, dict[str, Any]] = {}
    for source in [item for item in event.get("sources", []) if isinstance(item, dict)]:
        title = str(source.get("title") or "")
        title_key = " ".join(title.casefold().split())
        url = canonical_url(str(source.get("canonical_url") or source.get("url") or ""))
        early_epaper = source.get("source_role") == "early_epaper"
        # E-paper articles can all share one storefront/container URL; it is not
        # an article identity and must not glue unrelated titles back together.
        match = None if early_epaper else (url_groups.get(url) if url else None)
        if match is None and title_key:
            match = title_groups.get(title_key)
        if match is None:
            match = {"title": title, "urls": set(), "sources": [], "history": []}
            groups.append(match)
        match["sources"].append(source)
        if url and not early_epaper:
            match["urls"].add(url)
            url_groups[url] = match
        if not match["title"] and title:
            match["title"] = title
        if title_key:
            title_groups[title_key] = match

    history = [item for item in event.get("history", []) if isinstance(item, dict)]
    for item in history:
        title = str(item.get("title") or "")
        title_key = " ".join(title.casefold().split())
        best = title_groups.get(title_key) if title_key else None
        if best is None:
            best = {"title": title, "urls": set(), "sources": [], "history": []}
            groups.append(best)
            if title_key:
                title_groups[title_key] = best
        best["history"].append(item)

    if not groups:
        return [(event_id, event)]

    anchor_title = str((history[0] if history else {}).get("title") or event.get("current_title") or "")
    anchor_key = " ".join(anchor_title.casefold().split())
    anchor_group = title_groups.get(anchor_key) if anchor_key else groups[0]
    anchor_index = groups.index(anchor_group) if anchor_group in groups else 0
    results: list[tuple[str, dict[str, Any]]] = []
    for index, group in enumerate(groups):
        split = copy.deepcopy(event)
        split["sources"] = group["sources"]
        split["history"] = group["history"]
        if not group["sources"]:
            split["baseline_confirmed"] = any(
                item.get("baseline_advanced") is True or item.get("run_reliability") == "complete"
                for item in group["history"]
            )
        latest = group["history"][-1] if group["history"] else {}
        split["current_title"] = latest.get("title") or group["title"] or event.get("current_title")
        if latest:
            split["current_status"] = latest.get("classification") or split.get("current_status")
            split["current_score"] = latest.get("score") if latest.get("score") is not None else split.get("current_score")
            split["current_reasons"] = latest.get("reasons") or split.get("current_reasons", [])
        first_values = [str(src.get("first_seen")) for src in group["sources"] if src.get("first_seen")]
        first_values += [str(item.get("observed_at")) for item in group["history"] if item.get("observed_at")]
        last_values = [str(src.get("last_seen")) for src in group["sources"] if src.get("last_seen")]
        last_values += [str(item.get("observed_at")) for item in group["history"] if item.get("observed_at")]
        if first_values:
            split["first_seen"] = min(first_values)
        if last_values:
            split["last_seen"] = max(last_values)
        new_id = event_id if index == anchor_index else _split_id(event_id, str(split.get("current_title") or ""), group["sources"])
        results.append((new_id, split))
    return results


def load_news_state() -> dict[str, Any]:
    if not STATE_PATH.is_file():
        return _empty_state()
    try:
        data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return _empty_state()
        if int(data.get("schema_version", 0) or 0) < SCHEMA_VERSION:
            return _migrate(data)
        state = _empty_state()
        state.update(data)
        if not isinstance(state.get("seen_fingerprints"), list):
            state["seen_fingerprints"] = []
        if not isinstance(state.get("baseline_seen_fingerprints"), list):
            state["baseline_seen_fingerprints"] = []
        if not isinstance(state.get("events"), dict):
            state["events"] = {}
        return state
    except Exception:
        return _empty_state()


def seen_fingerprints(state: dict[str, Any], baseline: bool = False) -> set[str]:
    key = "baseline_seen_fingerprints" if baseline else "seen_fingerprints"
    return {str(value) for value in state.get(key, [])}


def seen_canonical_urls(state: dict[str, Any]) -> set[str]:
    values: set[str] = set()
    for event in (state.get("events") or {}).values():
        if not isinstance(event, dict):
            continue
        for source in event.get("sources") or []:
            if isinstance(source, dict):
                value = canonical_url(str(source.get("canonical_url") or source.get("url") or ""))
                if value:
                    values.add(value)
    return values


def _reason_terms(reasons: list[Any]) -> set[str]:
    terms: set[str] = set()
    for reason in reasons or []:
        value = str(reason)
        if value.startswith("context:"):
            value = value.split(":", 1)[1]
        if value in STRONG_EVENT_TERMS:
            terms.add(value)
    return terms


def _recent(stored: dict[str, Any], days: int = 2) -> bool:
    raw = stored.get("last_seen") or stored.get("first_seen")
    if not raw:
        return False
    try:
        observed = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        now = datetime.now(observed.tzinfo) if observed.tzinfo else datetime.now()
        return (now - observed).total_seconds() <= days * 86400
    except Exception:
        return False


def _best_existing_match(event: dict[str, Any], stored_events: dict[str, Any]) -> tuple[str | None, float, bool]:
    exact_id = str(event.get("event_id", ""))
    if exact_id and exact_id in stored_events:
        stored = stored_events[exact_id]
        return exact_id, 1.0, bool(stored.get("baseline_confirmed"))

    title = str(event.get("title", ""))
    event_urls = {
        canonical_url(str(source.get("canonical_url") or source.get("url") or ""))
        for source in event.get("sources", []) if isinstance(source, dict)
    }
    event_terms = _reason_terms(list(event.get("reasons", [])))
    best_id = None
    best_score = 0.0
    best_confirmed = False
    for event_id, stored in stored_events.items():
        stored_urls = {
            canonical_url(str(source.get("canonical_url") or source.get("url") or ""))
            for source in stored.get("sources", []) if isinstance(source, dict)
        }
        if event_urls & stored_urls:
            return str(event_id), 1.0, bool(stored.get("baseline_confirmed"))
        stored_title = str(stored.get("current_title", stored.get("title", "")))
        similarity = event_similarity(title, stored_title)
        confirmed = bool(stored.get("baseline_confirmed"))
        if similarity > best_score:
            best_id, best_score, best_confirmed = str(event_id), similarity, confirmed

        # Allow a recent e-paper preview to correlate with a later web headline.
        stored_terms = _reason_terms(list(stored.get("current_reasons", [])))
        shared = event_terms & stored_terms
        has_early_epaper = any(src.get("source_role") == "early_epaper" for src in stored.get("sources", []))
        if shared and has_early_epaper and _recent(stored):
            semantic_score = 0.65 + min(0.15, 0.05 * len(shared))
            if semantic_score > best_score:
                best_id, best_score, best_confirmed = str(event_id), semantic_score, confirmed
    return best_id, best_score, best_confirmed


def classify_events(events: list[dict[str, Any]], state: dict[str, Any]) -> list[dict[str, Any]]:
    stored_events = state.get("events", {})
    classified: list[dict[str, Any]] = []

    for event in events:
        item = dict(event)
        match_id, similarity, baseline_confirmed = _best_existing_match(item, stored_events)
        item["matched_event_id"] = match_id
        item["match_similarity"] = round(similarity, 3)
        item["matched_baseline_confirmed"] = baseline_confirmed

        if match_id is None or similarity < 0.48:
            item["status"] = "Neu"
        elif not baseline_confirmed:
            # An observation from an incomplete/early-warning run must not suppress
            # a finding in the next complete run. It can still be correlated.
            item["status"] = "Update" if similarity >= 0.48 else "Neu"
        elif similarity >= 0.80:
            item["status"] = "Duplikat"
        else:
            item["status"] = "Update"
        classified.append(item)

    return classified


def _source_snapshot(source: dict[str, Any], observed_at: str) -> dict[str, Any]:
    return {
        "source_id": source.get("source_id"),
        "source_name": source.get("source_name"),
        "source_class": source.get("source_class"),
        "priority": source.get("priority"),
        "title": source.get("title"),
        "url": source.get("url"),
        "canonical_url": source.get("canonical_url") or canonical_url(str(source.get("url") or "")),
        "fingerprint": source.get("fingerprint"),
        "source_role": source.get("source_role"),
        "source_stage": source.get("source_stage"),
        "original_source": source.get("original_source"),
        "original_url": source.get("original_url") or source.get("canonical_url") or source.get("url"),
        "discovery_channels": source.get("discovery_channels") or [],
        "discovered_at": source.get("discovered_at") or source.get("fetched_at") or observed_at,
        "published_at": source.get("published_at"),
        "updated_at": source.get("updated_at"),
        "source_type": source.get("source_type"),
        "source_confidence": source.get("source_confidence"),
        "source_usage": source.get("source_usage") or (source.get("original_source") or {}).get("source_usage"),
        "newsletter_sent_at": source.get("newsletter_sent_at"),
        "received_at": source.get("received_at"),
        "publication_date_status": source.get("publication_date_status"),
        "page": source.get("page"),
        "detected_terms": source.get("detected_terms", []),
        "first_seen": observed_at,
        "last_seen": observed_at,
    }


def _event_source_stage(sources: list[dict[str, Any]]) -> str:
    has_epaper = any(src.get("source_role") == "early_epaper" for src in sources)
    has_later_source = any(src.get("source_role") != "early_epaper" for src in sources)
    if has_epaper and has_later_source:
        return "Web bestätigt"
    if has_epaper:
        return "Vorab E-Paper"
    return "Web"


def update_news_state(
    state: dict[str, Any],
    normalized_findings: list[dict[str, Any]],
    classified_events: list[dict[str, Any]],
    run_started_at: str,
    run_finished_at: str,
    run_reliability: str,
) -> dict[str, Any]:
    updated = dict(state)
    stored_events: dict[str, Any] = dict(updated.get("events", {}))

    observed_fps = seen_fingerprints(updated, baseline=False)
    baseline_fps = seen_fingerprints(updated, baseline=True)
    for finding in normalized_findings:
        fp = str(finding.get("fingerprint", ""))
        if fp:
            observed_fps.add(fp)
            if run_reliability == "complete":
                baseline_fps.add(fp)

    for event in classified_events:
        status = str(event.get("status", "Neu"))
        matched_id = event.get("matched_event_id")
        # classify_events always reports the nearest historical event for
        # diagnostics, even when similarity is far below the 0.48 merge gate.
        # Reusing that weak match here polluted unrelated clusters and made later
        # articles look known. Persist under the historical ID only for a real
        # Update/Duplikat match.
        similarity = float(event.get("match_similarity") or 0.0)
        event_id = str(matched_id if matched_id and similarity >= 0.48 else event.get("event_id"))
        if not event_id:
            continue

        existing = dict(stored_events.get(event_id, {}))
        if not existing:
            existing = {
                "event_id": event_id,
                "first_seen": run_started_at,
                "current_title": event.get("title"),
                "current_score": event.get("score"),
                "current_status": status,
                "current_reasons": event.get("reasons", []),
                "current_source_stage": event.get("source_stage"),
                "baseline_confirmed": False,
                "sources": [],
                "history": [],
            }

        existing["last_seen"] = run_finished_at
        existing["current_title"] = event.get("title")
        existing["current_score"] = event.get("score")
        existing["current_status"] = status
        existing["current_reasons"] = event.get("reasons", [])
        if run_reliability == "complete":
            existing["baseline_confirmed"] = True
            existing["baseline_confirmed_at"] = run_finished_at

        source_map = {
            str(src.get("fingerprint")): src
            for src in existing.get("sources", [])
            if src.get("fingerprint")
        }
        for source in event.get("sources", []):
            fp = str(source.get("fingerprint", ""))
            if not fp:
                continue
            if fp in source_map:
                source_map[fp]["last_seen"] = run_finished_at
            else:
                source_map[fp] = _source_snapshot(source, run_finished_at)
        existing["sources"] = list(source_map.values())
        existing["current_source_stage"] = _event_source_stage(existing["sources"])

        history = list(existing.get("history", []))
        history.append({
            "observed_at": run_finished_at,
            "classification": status,
            "title": event.get("title"),
            "score": event.get("score"),
            "reasons": event.get("reasons", []),
            "source_count": event.get("source_count"),
            "source_stage": existing["current_source_stage"],
            "run_reliability": run_reliability,
            "baseline_advanced": run_reliability == "complete",
            "match_similarity": event.get("match_similarity"),
            "matched_event_id": matched_id if similarity >= 0.48 else None,
        })
        existing["history"] = history
        stored_events[event_id] = existing

    updated["schema_version"] = SCHEMA_VERSION
    updated["seen_fingerprints"] = sorted(observed_fps)
    updated["baseline_seen_fingerprints"] = sorted(baseline_fps)
    updated["events"] = stored_events
    updated["last_run"] = {
        "started_at": run_started_at,
        "finished_at": run_finished_at,
        "reliability": run_reliability,
    }
    if run_reliability == "complete":
        updated["last_complete_run"] = {
            "started_at": run_started_at,
            "finished_at": run_finished_at,
        }
    return updated


def save_news_state(state: dict[str, Any]) -> None:
    write_json(STATE_PATH, state)
