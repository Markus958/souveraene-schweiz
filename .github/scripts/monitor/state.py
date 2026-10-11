from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from config import REPO_ROOT
from eventize import event_similarity
from storage import write_json

STATE_PATH = REPO_ROOT / "data" / "monitor" / "state" / "news_state.json"


def _empty_state() -> dict[str, Any]:
    return {
        "schema_version": 1,
        "last_run": None,
        "last_complete_run": None,
        "seen_fingerprints": [],
        "events": {},
    }


def load_news_state() -> dict[str, Any]:
    if not STATE_PATH.is_file():
        return _empty_state()
    try:
        data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return _empty_state()
        state = _empty_state()
        state.update(data)
        if not isinstance(state.get("seen_fingerprints"), list):
            state["seen_fingerprints"] = []
        if not isinstance(state.get("events"), dict):
            state["events"] = {}
        return state
    except Exception:
        return _empty_state()


def seen_fingerprints(state: dict[str, Any]) -> set[str]:
    return {str(value) for value in state.get("seen_fingerprints", [])}


def _best_existing_match(event: dict[str, Any], stored_events: dict[str, Any]) -> tuple[str | None, float]:
    exact_id = str(event.get("event_id", ""))
    if exact_id and exact_id in stored_events:
        return exact_id, 1.0

    title = str(event.get("title", ""))
    best_id = None
    best_score = 0.0
    for event_id, stored in stored_events.items():
        stored_title = str(stored.get("current_title", stored.get("title", "")))
        similarity = event_similarity(title, stored_title)
        if similarity > best_score:
            best_id = str(event_id)
            best_score = similarity
    return best_id, best_score


def classify_events(events: list[dict[str, Any]], state: dict[str, Any]) -> list[dict[str, Any]]:
    stored_events = state.get("events", {})
    classified: list[dict[str, Any]] = []

    for event in events:
        item = dict(event)
        match_id, similarity = _best_existing_match(item, stored_events)
        item["matched_event_id"] = match_id
        item["match_similarity"] = round(similarity, 3)

        if match_id is None or similarity < 0.48:
            item["status"] = "Neu"
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
        "fingerprint": source.get("fingerprint"),
        "first_seen": observed_at,
        "last_seen": observed_at,
    }


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

    fingerprints = seen_fingerprints(updated)
    for finding in normalized_findings:
        fp = str(finding.get("fingerprint", ""))
        if fp:
            fingerprints.add(fp)

    for event in classified_events:
        status = str(event.get("status", "Neu"))
        matched_id = event.get("matched_event_id")
        event_id = str(matched_id or event.get("event_id"))
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
                "sources": [],
                "history": [],
            }

        existing["last_seen"] = run_finished_at
        existing["current_title"] = event.get("title")
        existing["current_score"] = event.get("score")
        existing["current_status"] = status

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

        history = list(existing.get("history", []))
        history.append({
            "observed_at": run_finished_at,
            "classification": status,
            "title": event.get("title"),
            "score": event.get("score"),
            "source_count": event.get("source_count"),
            "match_similarity": event.get("match_similarity"),
        })
        existing["history"] = history[-100:]
        stored_events[event_id] = existing

    updated["schema_version"] = 1
    updated["seen_fingerprints"] = sorted(fingerprints)
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
