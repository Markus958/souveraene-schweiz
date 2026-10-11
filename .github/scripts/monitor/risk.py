from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

from config import REPO_ROOT
from storage import write_json

STATE_PATH = REPO_ROOT / "data" / "monitor" / "state" / "risk_state.json"
SCHEMA_VERSION = 2

RISK_TERMS: dict[str, tuple[str, ...]] = {
    "ubs": ("ubs", "too big to fail", "too-big-to-fail", "kapitalanforder", "eigenmittel", "finma", "bankenregul"),
    "f35": ("f-35", "f35", "air2030", "kampfflugzeug", "lockheed martin"),
    "patriot": ("patriot", "bodluv", "bodengestützte luftverteidigung", "luftverteidigung"),
    "ahv13": ("13. ahv", "13 ahv", "13. rente", "13 rente", "ahv-rente", "ahv rente", "mehrwertsteuer", "mwst"),
}

RISK_EVENT_TERMS: dict[str, set[str]] = {
    "ubs": {"ubs", "finma", "snb"},
    "f35": {"f-35", "f35"},
    "patriot": {"patriot"},
    "ahv13": {"ahv", "13. ahv"},
}

RISK_SOURCE_IDS: dict[str, set[str]] = {
    "ubs": {"ch-bund-news", "ch-efd", "ch-finma", "ch-snb", "ch-parlament", "ch-efk"},
    "f35": {"ch-bund-news", "ch-vbs", "ch-armasuisse", "ch-parlament", "ch-efk"},
    "patriot": {"ch-bund-news", "ch-vbs", "ch-armasuisse", "ch-parlament", "ch-efk"},
    "ahv13": {"ch-bund-news", "ch-bsv", "ch-bk", "ch-parlament", "ch-efd"},
}


def _empty_state() -> dict[str, Any]:
    return {"schema_version": SCHEMA_VERSION, "last_run": None, "last_complete_run": None, "risks": {}}


def _load_state() -> dict[str, Any]:
    if not STATE_PATH.is_file():
        return _empty_state()
    try:
        payload = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return _empty_state()
        payload.setdefault("last_run", None)
        payload.setdefault("last_complete_run", payload.get("last_run"))
        payload.setdefault("risks", {})
        if int(payload.get("schema_version", 0) or 0) < SCHEMA_VERSION:
            for risk in payload["risks"].values():
                if isinstance(risk, dict):
                    seen = list(risk.get("seen_fingerprints", []))
                    risk.setdefault("baseline_seen_fingerprints", seen)
                    risk.setdefault("observed_fingerprints", seen)
            payload["schema_version"] = SCHEMA_VERSION
        return payload
    except Exception:
        return _empty_state()


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.casefold()).strip()


def _finding_terms(finding: dict[str, Any]) -> set[str]:
    terms = {str(v).casefold() for v in finding.get("detected_terms", []) or []}
    title = _norm(str(finding.get("title", "")))
    for risk_terms in RISK_TERMS.values():
        for term in risk_terms:
            if term in title:
                terms.add(term)
    return terms


def link_risk_signals(findings: list[dict[str, Any]], risks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    active_ids = {str(r.get("id")) for r in risks if r.get("active", True)}
    signals: list[dict[str, Any]] = []
    for finding in findings:
        terms = _finding_terms(finding)
        title = _norm(str(finding.get("title", "")))
        for risk_id in active_ids:
            event_terms = RISK_EVENT_TERMS.get(risk_id, set())
            text_terms = RISK_TERMS.get(risk_id, ())
            if terms & event_terms or any(term in title for term in text_terms) or any(term in terms for term in text_terms):
                signals.append({
                    "risk_id": risk_id,
                    "fingerprint": finding.get("fingerprint"),
                    "source_id": finding.get("source_id"),
                    "source_name": finding.get("source_name"),
                    "title": finding.get("title"),
                    "url": finding.get("url"),
                    "source_role": finding.get("source_role"),
                    "status": "Primärquelle prüfen" if finding.get("source_class") != "A" else "Primärquelle",
                })
    return signals


def _matches_primary(risk_id: str, finding: dict[str, Any]) -> bool:
    allowed = RISK_SOURCE_IDS.get(risk_id, set())
    if allowed and str(finding.get("source_id")) not in allowed:
        return False
    title = _norm(str(finding.get("title", "")))
    return any(term in title for term in RISK_TERMS.get(risk_id, ()))


def risk_links_for_event(event: dict[str, Any]) -> list[str]:
    reasons = {str(r).split(":", 1)[-1] for r in event.get("reasons", [])}
    title = _norm(str(event.get("title", "")))
    linked: list[str] = []
    for risk_id, terms in RISK_EVENT_TERMS.items():
        if reasons & terms or any(term in title for term in RISK_TERMS.get(risk_id, ())):
            linked.append(risk_id)
    return linked


def annotate_events_with_risks(events: list[dict[str, Any]]) -> None:
    for event in events:
        linked = risk_links_for_event(event)
        event["risk_dossiers"] = linked
        if linked:
            event["risk_follow_up"] = "Primärquelle prüfen"


def check_risks(
    risks: list[dict[str, Any]],
    findings: list[dict[str, Any]],
    persist: bool,
    advance_baseline: bool = True,
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
        baseline_seen = {str(v) for v in previous.get("baseline_seen_fingerprints", previous.get("seen_fingerprints", []))}
        observed = {str(v) for v in previous.get("observed_fingerprints", previous.get("seen_fingerprints", []))}
        matching = [finding for finding in findings if _matches_primary(risk_id, finding)]
        matching_fps = {str(item.get("fingerprint", "")) for item in matching if item.get("fingerprint")}
        has_baseline = bool(previous.get("baseline_created_at")) or bool(baseline_seen)

        if not has_baseline:
            new_items: list[dict[str, Any]] = []
            status = "baseline"
        else:
            new_items = [item for item in matching if str(item.get("fingerprint", "")) not in baseline_seen]
            status = "changed" if new_items else "unchanged"

        sources = [{
            "source_id": item.get("source_id"),
            "source_name": item.get("source_name"),
            "title": item.get("title"),
            "url": item.get("url"),
            "fingerprint": item.get("fingerprint"),
        } for item in new_items[:10]]

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
            "baseline_advanced": bool(persist and advance_baseline),
        }
        results.append(result)

        if persist:
            history = list(previous.get("history", []))
            history.append({
                "checked_at": checked_at,
                "status": status,
                "new_items": len(new_items),
                "sources": sources,
                "baseline_advanced": bool(advance_baseline),
            })
            observed |= matching_fps
            new_baseline = set(baseline_seen)
            baseline_created_at = previous.get("baseline_created_at")
            last_changed = previous.get("last_changed")
            if advance_baseline:
                new_baseline |= matching_fps
                baseline_created_at = baseline_created_at or checked_at
                if new_items:
                    last_changed = checked_at
            stored_risks[risk_id] = {
                "risk_id": risk_id,
                "title": title,
                "baseline_created_at": baseline_created_at,
                "last_checked": checked_at,
                "last_changed": last_changed,
                "baseline_seen_fingerprints": sorted(new_baseline),
                "observed_fingerprints": sorted(observed),
                "seen_fingerprints": sorted(observed),
                "history": history,
            }

    if persist:
        state["schema_version"] = SCHEMA_VERSION
        state["last_run"] = {"checked_at": checked_at, "risk_count": len(results), "baseline_advanced": bool(advance_baseline)}
        if advance_baseline:
            state["last_complete_run"] = {"checked_at": checked_at}
        write_json(STATE_PATH, state)

    return results, state
