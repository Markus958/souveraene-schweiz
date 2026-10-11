from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from config import REPO_ROOT, load_procedure_watches, load_risks, load_sources
from eventize import build_events, select_top_events
from fetch import fetch_all
from storage import write_json
from validation import validate_risks, validate_sources


def _load_seen() -> set[str]:
    path = REPO_ROOT / "data" / "monitor" / "state" / "news_seen.json"
    if not path.is_file():
        return set()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        values = data.get("fingerprints", []) if isinstance(data, dict) else data
        return {str(x) for x in values}
    except Exception:
        return set()


def main() -> int:
    mode = os.getenv("MONITOR_MODE", "news-dry-run").strip().lower()
    output_dir = Path(os.getenv("MONITOR_OUTPUT_DIR", "monitor-out"))

    started = datetime.now(timezone.utc)
    sources = load_sources()
    risks = load_risks()
    procedure_watches = load_procedure_watches()

    source_errors = validate_sources(sources)
    risk_errors, risk_page_checks = validate_risks(risks, REPO_ROOT)
    errors = source_errors + risk_errors

    nzz_configured = any(source.get("id") == "nzz" for source in sources)
    nzz_secret_available = bool(os.getenv("NZZ_COOKIE_HEADER"))

    source_runs = []
    normalized_findings = []
    new_findings = []
    source_warnings = []
    events = []
    selected_events = []

    if not errors:
        source_runs = fetch_all(sources)
        seen = _load_seen()
        for source_run in source_runs:
            if source_run["status"] in {"unreachable", "auth_failed", "incomplete", "structure_changed"}:
                source_warnings.append({
                    "source_id": source_run["source_id"],
                    "status": source_run["status"],
                    "error": source_run.get("error"),
                })
            for finding in source_run.get("findings", []):
                normalized_findings.append(finding)
                if finding["fingerprint"] not in seen:
                    new_findings.append(finding)

        events = build_events(new_findings, procedure_watches)
        selected_events = select_top_events(events, limit=5, hard_max=10)

    p1_problem = any(
        run.get("priority") == "P1" and run.get("status") in {"unreachable", "auth_failed", "incomplete", "structure_changed"}
        for run in source_runs
    )

    status = "failed" if errors else ("success_with_warnings" if source_warnings else "success")
    result = {
        "schema_version": 3,
        "mode": mode,
        "started_at": started.isoformat(),
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "run_reliability": "incomplete" if p1_problem else "complete",
        "writes_enabled": False,
        "public_output_enabled": False,
        "configuration": {
            "source_count": len(sources),
            "enabled_source_count": sum(1 for s in sources if s.get("enabled", True)),
            "risk_dossier_count": len(risks),
            "procedure_watch_count": len(procedure_watches),
            "nzz_configured": nzz_configured,
            "nzz_secret_available": nzz_secret_available,
        },
        "news_discovery": {
            "sources_attempted": len(source_runs),
            "sources_successful": sum(1 for r in source_runs if r["status"] in {"new_publication", "checked_no_new"}),
            "normalized_findings": len(normalized_findings),
            "new_findings": len(new_findings),
            "source_runs": source_runs,
            "warnings": source_warnings,
        },
        "event_analysis": {
            "relevant_events": len(events),
            "selected_events": len(selected_events),
            "selection_target": 5,
            "selection_hard_max": 10,
            "events": events,
            "daily_selection": selected_events,
        },
        "procedure_watches": procedure_watches,
        "risk_page_checks": risk_page_checks,
        "errors": errors,
        "next_phase": "persistent event state, update classification and dedicated procedure-watch fetching",
    }

    output_path = output_dir / "monitor-news-dry-run.json"
    write_json(output_path, result)

    print("MONITOR - DAILY NEWS DRY RUN")
    print(f"Status: {result['status']}")
    print(f"Run reliability: {result['run_reliability']}")
    print(f"Sources configured: {len(sources)}")
    print(f"Sources attempted: {len(source_runs)}")
    print(f"Sources successful: {result['news_discovery']['sources_successful']}")
    print(f"Normalized findings: {len(normalized_findings)}")
    print(f"New findings: {len(new_findings)}")
    print(f"Relevant events: {len(events)}")
    print(f"Daily selection: {len(selected_events)}")
    print(f"Procedure watches: {len(procedure_watches)}")
    print(f"Source warnings: {len(source_warnings)}")
    print(f"NZZ secret available: {'yes' if nzz_secret_available else 'no'}")
    print("Persistent writes enabled: no")
    print("Public output enabled: no")
    print(f"Artifact: {output_path}")

    if selected_events:
        print("Selected events:")
        for event in selected_events:
            print(f"- [{event['score']}] {event['title']}")

    if errors:
        print("Validation errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
