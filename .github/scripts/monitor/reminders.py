from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from config import REPO_ROOT
from storage import write_json

REMINDER_PATH = REPO_ROOT / "data" / "monitor" / "state" / "reminders.json"
RUN_HISTORY_PATH = REPO_ROOT / "data" / "monitor" / "state" / "run_history.json"
SCHEMA_VERSION = 1


def _load(path, default):
    if not path.is_file():
        return default
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else default
    except Exception:
        return default


def _reminder_state() -> dict[str, Any]:
    data = _load(REMINDER_PATH, {"schema_version": SCHEMA_VERSION, "items": {}})
    data.setdefault("schema_version", SCHEMA_VERSION)
    data.setdefault("items", {})
    return data


def _upsert(items: dict[str, Any], reminder_id: str, payload: dict[str, Any], now: str) -> None:
    previous = items.get(reminder_id, {}) if isinstance(items.get(reminder_id), dict) else {}
    history = list(previous.get("history", []))
    previous_status = previous.get("status")
    current = dict(previous)
    current.update(payload)
    current["reminder_id"] = reminder_id
    current.setdefault("created_at", now)
    current["updated_at"] = now
    current["status"] = "open"
    if previous_status != "open":
        history.append({"at": now, "action": "opened" if not previous_status else "reopened"})
        current.pop("resolved_at", None)
        current.pop("resolution", None)
    current["history"] = history
    items[reminder_id] = current


def _resolve(items: dict[str, Any], reminder_id: str, now: str, reason: str) -> None:
    current = items.get(reminder_id)
    if not isinstance(current, dict) or current.get("status") != "open":
        return
    history = list(current.get("history", []))
    history.append({"at": now, "action": "resolved", "reason": reason})
    current["status"] = "resolved"
    current["updated_at"] = now
    current["resolved_at"] = now
    current["resolution"] = reason
    current["history"] = history


def update_reminders(
    classified_events: list[dict[str, Any]],
    risk_results: list[dict[str, Any]],
    procedure_results: list[dict[str, Any]],
    persist: bool,
    run_reliability: str = "complete",
) -> dict[str, Any]:
    state = _reminder_state()
    items = state.setdefault("items", {})
    now = datetime.now(timezone.utc).isoformat()

    active_source_checks: set[str] = set()
    active_primary_checks: set[str] = set()

    for risk in risk_results:
        risk_id = str(risk.get("risk_id", ""))
        if not risk_id:
            continue
        source_id = f"risk:{risk_id}:source-check"
        if not risk.get("source_check_complete", True):
            active_source_checks.add(source_id)
            _upsert(items, source_id, {
                "type": "source-check",
                "scope": "risk",
                "risk_id": risk_id,
                "title": f"P1-Quellenprüfung {risk.get('topic', risk_id)}",
                "reason": "Mindestens eine erforderliche P1-Quelle konnte nicht vollständig geprüft werden.",
                "failed_sources": risk.get("failed_p1_sources", []),
                "missing_sources": risk.get("missing_p1_sources", []),
                "auto_resolve": True,
            }, now)
        elif source_id in items:
            _resolve(items, source_id, now, "P1-Quellenprüfung wieder vollständig")

        if risk.get("change_recommended") == "Ja":
            reminder_id = f"risk:{risk_id}:website-review"
            _upsert(items, reminder_id, {
                "type": "website-review",
                "scope": "risk",
                "risk_id": risk_id,
                "title": f"Website-Änderung prüfen: {risk.get('topic', risk_id)}",
                "reason": "Neue bestätigte Primärquelleninformation im Risikodossier.",
                "sources": risk.get("sources", []),
                "auto_resolve": False,
            }, now)

    for event in classified_events:
        risk_ids = list(event.get("risk_dossiers") or event.get("risk_ids") or [])
        if not risk_ids:
            continue
        has_primary = any(str(src.get("source_class")) == "A" for src in event.get("sources", []))
        event_id = str(event.get("matched_event_id") or event.get("event_id") or "")
        if not event_id:
            continue
        reminder_id = f"event:{event_id}:primary-source"
        if not has_primary:
            active_primary_checks.add(reminder_id)
            _upsert(items, reminder_id, {
                "type": "primary-source",
                "scope": "event",
                "event_id": event_id,
                "title": str(event.get("title", "Primärquelle prüfen")),
                "reason": "Risikorelevantes Ereignis bislang ohne amtliche Primärquelle.",
                "risk_ids": risk_ids,
                "auto_resolve": True,
            }, now)
        elif reminder_id in items:
            _resolve(items, reminder_id, now, "Amtliche Primärquelle vorhanden")

    if run_reliability == "complete":
        for reminder_id, item in list(items.items()):
            if not isinstance(item, dict) or item.get("status") != "open" or not item.get("auto_resolve"):
                continue
            if item.get("type") == "primary-source" and reminder_id not in active_primary_checks:
                _resolve(items, reminder_id, now, "Ereignis im aktuellen vollständigen Lauf nicht mehr aktiv")
            elif item.get("type") == "source-check" and reminder_id not in active_source_checks:
                _resolve(items, reminder_id, now, "P1-Quellenprüfung im aktuellen vollständigen Lauf wieder vollständig")

    for item in procedure_results:
        if item.get("status") != "changed":
            continue
        key = str(item.get("state_key") or f"{item.get('watch_id')}:{item.get('page')}")
        reminder_id = f"procedure:{key}:review"
        _upsert(items, reminder_id, {
            "type": "procedure-review",
            "scope": "procedure",
            "watch_id": item.get("watch_id"),
            "page": item.get("page"),
            "title": f"EU-Verfahrensänderung prüfen: {item.get('watch_id')}",
            "reason": "Die überwachte Verfahrensseite hat sich gegenüber der vollständigen Baseline geändert.",
            "url": item.get("url"),
            "auto_resolve": False,
        }, now)

    state["schema_version"] = SCHEMA_VERSION
    state["updated_at"] = now
    state["open_count"] = sum(1 for item in items.values() if isinstance(item, dict) and item.get("status") == "open")
    if persist:
        write_json(REMINDER_PATH, state)
    return state


def append_run_history(summary: dict[str, Any], persist: bool) -> dict[str, Any]:
    state = _load(RUN_HISTORY_PATH, {"schema_version": SCHEMA_VERSION, "runs": []})
    state.setdefault("schema_version", SCHEMA_VERSION)
    runs = state.setdefault("runs", [])
    runs.append(summary)
    state["updated_at"] = datetime.now(timezone.utc).isoformat()
    if persist:
        write_json(RUN_HISTORY_PATH, state)
    return state
