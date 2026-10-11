from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

from config import REPO_ROOT
from storage import write_json

STATE_PATH = REPO_ROOT / "data" / "monitor" / "state" / "risk_state.json"

RISK_TERMS: dict[str, tuple[str, ...]] = {
    "ubs": ("ubs", "too big to fail", "too-big-to-fail", "kapitalanforder", "eigenmittel", "finma", "bankenregul"),
    "f35": ("f-35", "f35", "air2030", "kampfflugzeug", "lockheed martin"),
    "patriot": ("patriot", "bodluv", "bodengestützte luftverteidigung", "luftverteidigung"),
    "ahv13": ("13. ahv", "13 ahv", "13. rente", "13 rente", "ahv-rente", "ahv rente", "mehrwertsteuer", "mwst"),
}

RISK_SOURCE_IDS: dict[str, set[str]] = {
    "ubs": {"ch-bund-news", "ch-efd", "ch-finma", "ch-snb", "ch-parlament", "ch-efk"},
    "f35": {"ch-bund-news", "ch-vbs", "ch-armasuisse", "ch-parlament", "ch-efk"},
    "patriot": {"ch-bund-news", "ch-vbs", "ch-armasuisse", "ch-parlament", "ch-efk"},
    "ahv13": {"ch-bund-news", "ch-bsv", "ch-bk", "ch-parlament", "ch-efd"},
}


def _empty_state() -> dict[str, Any]:
    return {"schema_version": 1, "last_run": None, "risks": {}}


def _load_state() -> dict[str, Any]:
    if not STATE_PATH.is_file():
        return _empty_state()
    try:
        payload = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return _empty_state()
        payload.setdefault("schema_version", 1)
        payload.setdefault("last_run", None)
        payload.setdefault("risks", {})
        return payload
    except Exception:
        return _empty_state()


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.casefold()).strip()


def _matches(risk_id: str, finding: dict[str, Any]) -> bool:
    allowed = RISK_SOURCE_IDS.get(risk_id, set())
    if allowed and str(finding.get("source_id")) not in allowed:
        return False
    title = _norm(str(finding.get("title", "")))
    return any(term in title for term in RISK_TERMS.get(risk_id, ()))


def check_risks(
    risks: list[dict[str, Any]],
    findings: list[dict[str, Any]],
    persist: bool,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    state = _load_state()
    stored_risks = state.setdefault("risks", {})
    now = datetime.now(timezone.utc)
    checked_at = now.isoformat()
    report_date = now.date().isoformat()
    results: list[dict[str, Any]] = []

    for risk in risks:
        if not risk.get("active", True):
            continue
        risk_id = str(risk.get("id", ""))
        title = str(risk.get("title", risk_id))
        previous = stored_risks.get(risk_id, {}) if isinstance(stored_risks.get(risk_id, {}), dict) else {}
        seen = {str(value) for value in previous.get("seen_fingerprints", [])}
        matching = [finding for finding in findings if _matches(risk_id, finding)]
        matching_fps = {str(item.get("fingerprint", "")) for item in matching if item.get("fingerprint")}
        has_baseline = bool(previous.get("baseline_created_at"))

        if not has_baseline:
            new_items: list[dict[str, Any]] = []
            status = "baseline"
        else:
            new_items = [item for item in matching if str(item.get("fingerprint", "")) not in seen]
            status = "changed" if new_items else "unchanged"

        sources = [
            {
                "source_id": item.get("source_id"),
                "source_name": item.get("source_name"),
                "title": item.get("title"),
                "url": item.get("url"),
                "fingerprint": item.get("fingerprint"),
            }
            for item in new_items[:10]
        ]
        result = {
            "date": report_date,
            "risk_id": risk_id,
            "topic": title,
            "status": status,
            "news": [str(item.get("title", "")) for item in new_items[:3]],
            "change_recommended": "Ja" if new_items else "Nein",
            "sources": sources,
            "matched_current_items": len(matching),
            "new_items": len(new_items),
        }
        results.append(result)

        if persist:
            history = list(previous.get("history", []))
            history.append({
                "checked_at": checked_at,
                "status": status,
                "new_items": len(new_items),
                "sources": sources,
            })
            stored_risks[risk_id] = {
                "risk_id": risk_id,
                "title": title,
                "baseline_created_at": previous.get("baseline_created_at") or checked_at,
                "last_checked": checked_at,
                "last_changed": checked_at if new_items else previous.get("last_changed"),
                "seen_fingerprints": sorted(seen | matching_fps),
                "history": history[-365:],
            }

    if persist:
        state["schema_version"] = 1
        state["last_run"] = {"checked_at": checked_at, "risk_count": len(results)}
        write_json(STATE_PATH, state)

    return results, state
