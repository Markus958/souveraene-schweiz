from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from config import REPO_ROOT
from storage import write_json

REPORT_DIR = REPO_ROOT / "data" / "monitor" / "reports"
INDEX_PATH = REPORT_DIR / "index.json"
ZURICH = ZoneInfo("Europe/Zurich")


def _source_view(source: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": source.get("source_name"),
        "title": source.get("title"),
        "url": source.get("url"),
        "priority": source.get("priority"),
        "class": source.get("source_class"),
    }


def _event_view(event: dict[str, Any]) -> dict[str, Any]:
    sources = [_source_view(src) for src in event.get("sources", [])[:6]]
    return {
        "event_id": event.get("event_id"),
        "status": event.get("status"),
        "headline": event.get("title"),
        "post_potential": event.get("score"),
        "why_important": list(event.get("reasons", [])),
        "sources": sources,
    }


def _procedure_view(item: dict[str, Any]) -> dict[str, Any]:
    signal = item.get("signal") if isinstance(item.get("signal"), dict) else {}
    return {
        "watch_id": item.get("watch_id"),
        "page": item.get("page"),
        "status": item.get("status"),
        "url": item.get("url"),
        "references": signal.get("expected_references_found", []),
        "documents": signal.get("known_documents_found", []),
        "dates": signal.get("dates", []),
    }


def _risk_view(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "topic": item.get("topic"),
        "status": item.get("status"),
        "news": item.get("news", []),
        "change_recommended": item.get("change_recommended"),
        "sources": item.get("sources", []),
    }


def build_public_report(result: dict[str, Any]) -> dict[str, Any]:
    local_now = datetime.now(ZURICH)
    selection = result.get("event_analysis", {}).get("daily_selection", [])
    procedures = result.get("procedure_monitoring", {}).get("results", [])
    risks = result.get("risk_monitoring", {}).get("results", [])

    return {
        "schema_version": 1,
        "date": local_now.date().isoformat(),
        "generated_at": local_now.isoformat(),
        "status": result.get("status"),
        "run_reliability": result.get("run_reliability"),
        "news": [_event_view(event) for event in selection],
        "procedures": [_procedure_view(item) for item in procedures],
        "risks": [_risk_view(item) for item in risks],
        "quality": {
            "source_warnings": len(result.get("news_discovery", {}).get("warnings", [])),
            "procedure_warnings": len(result.get("procedure_monitoring", {}).get("warnings", [])),
            "sources_attempted": result.get("news_discovery", {}).get("sources_attempted", 0),
            "sources_successful": result.get("news_discovery", {}).get("sources_successful", 0),
        },
    }


def _load_index() -> dict[str, Any]:
    if not INDEX_PATH.is_file():
        return {"schema_version": 1, "reports": []}
    try:
        data = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("reports"), list):
            return data
    except Exception:
        pass
    return {"schema_version": 1, "reports": []}


def write_public_archive(report: dict[str, Any]) -> tuple[Path, Path]:
    report_date = str(report["date"])
    report_path = REPORT_DIR / f"{report_date}.json"
    write_json(report_path, report)

    index = _load_index()
    entries = [entry for entry in index.get("reports", []) if entry.get("date") != report_date]
    entries.append({
        "date": report_date,
        "path": f"{report_date}.json",
        "status": report.get("status"),
        "run_reliability": report.get("run_reliability"),
        "news_count": len(report.get("news", [])),
        "risk_changes": sum(1 for r in report.get("risks", []) if r.get("change_recommended") == "Ja"),
        "procedure_changes": sum(1 for p in report.get("procedures", []) if p.get("status") == "changed"),
    })
    entries.sort(key=lambda item: str(item.get("date", "")), reverse=True)
    index = {"schema_version": 1, "reports": entries[:730]}
    write_json(INDEX_PATH, index)
    return report_path, INDEX_PATH
