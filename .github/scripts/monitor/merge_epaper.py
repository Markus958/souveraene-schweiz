from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from archive import build_public_report, write_public_archive
from config import load_procedure_watches
from eventize import build_events, select_top_events
from state import classify_events, load_news_state, save_news_state, seen_fingerprints, update_news_state
from storage import write_json


def _load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    output_dir = Path(os.getenv("MONITOR_OUTPUT_DIR", "monitor-out"))
    epaper_path = Path(os.getenv("NZZAS_EPAPER_OUTPUT", output_dir / "nzzas-epaper.json"))
    report_path = output_dir / "monitor-daily-run.json"

    if not report_path.is_file():
        print("NZZaS merge: daily monitor report missing; skipped")
        return 0

    result = _load(report_path)
    discovery = result.setdefault("news_discovery", {})
    source_runs = discovery.setdefault("source_runs", [])
    warnings = discovery.setdefault("warnings", [])

    if not epaper_path.is_file():
        source_runs.append({
            "source_id": "nzzas-epaper",
            "source_name": "NZZ am Sonntag E-Paper",
            "priority": "M1",
            "status": "unreachable",
            "findings": [],
            "error": "collector output missing",
        })
        warnings.append({"source_id": "nzzas-epaper", "status": "unreachable", "error": "collector output missing"})
        discovery["sources_attempted"] = int(discovery.get("sources_attempted", 0)) + 1
        write_json(report_path, result)
        if result.get("public_output_enabled"):
            write_public_archive(build_public_report(result))
        print("NZZaS merge: collector output missing; warning recorded")
        return 0

    epaper = _load(epaper_path)
    source_runs.append(epaper)
    discovery["sources_attempted"] = int(discovery.get("sources_attempted", 0)) + 1
    if epaper.get("status") in {"new_publication", "checked_no_new"}:
        discovery["sources_successful"] = int(discovery.get("sources_successful", 0)) + 1
    else:
        warnings.append({
            "source_id": epaper.get("source_id", "nzzas-epaper"),
            "status": epaper.get("status", "unreachable"),
            "error": epaper.get("error"),
        })
        if result.get("status") == "success":
            result["status"] = "success_with_warnings"

    findings = list(epaper.get("findings", []))
    state = load_news_state()
    seen = seen_fingerprints(state)
    new_findings = [f for f in findings if str(f.get("fingerprint", "")) not in seen]

    discovery["normalized_findings"] = int(discovery.get("normalized_findings", 0)) + len(findings)
    discovery["new_findings"] = int(discovery.get("new_findings", 0)) + len(new_findings)

    if new_findings:
        watches = load_procedure_watches()
        events = build_events(new_findings, watches)
        classified = classify_events(events, state)

        analysis = result.setdefault("event_analysis", {})
        combined = list(analysis.get("events", [])) + classified
        combined.sort(key=lambda e: (int(e.get("score", 0)), int(e.get("source_count", 0))), reverse=True)
        selected = select_top_events(combined, limit=5, hard_max=10)

        analysis["events"] = combined
        analysis["candidate_events"] = int(analysis.get("candidate_events", 0)) + len(events)
        analysis["classified_events"] = int(analysis.get("classified_events", 0)) + len(classified)
        analysis["daily_selection"] = selected
        analysis["selected_events"] = len(selected)

        counts: dict[str, int] = {}
        for event in combined:
            status = str(event.get("status", "Unbekannt"))
            counts[status] = counts.get(status, 0) + 1
        analysis["classification_counts"] = counts

        state = update_news_state(
            state=state,
            normalized_findings=findings,
            classified_events=classified,
            run_started_at=str(result.get("started_at")),
            run_finished_at=str(result.get("finished_at")),
            run_reliability=str(result.get("run_reliability", "complete")),
        )
        save_news_state(state)
    elif findings:
        state = update_news_state(
            state=state,
            normalized_findings=findings,
            classified_events=[],
            run_started_at=str(result.get("started_at")),
            run_finished_at=str(result.get("finished_at")),
            run_reliability=str(result.get("run_reliability", "complete")),
        )
        save_news_state(state)

    result.setdefault("configuration", {})["nzzas_epaper_enabled"] = True
    result["configuration"]["nzzas_epaper_status"] = epaper.get("status")
    write_json(report_path, result)
    if result.get("public_output_enabled"):
        write_public_archive(build_public_report(result))

    print(
        "NZZaS merge: "
        f"status={epaper.get('status')}; findings={len(findings)}; "
        f"new={len(new_findings)}; selected={len(result.get('event_analysis', {}).get('daily_selection', []))}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
