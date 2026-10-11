from __future__ import annotations

import os
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from config import REPO_ROOT, load_procedure_watches, load_risks, load_sources
from eventize import build_events, select_top_events
from fetch import fetch_all
from procedure import check_procedure_watches
from state import classify_events, load_news_state, save_news_state, seen_fingerprints, update_news_state
from storage import write_json
from validation import validate_risks, validate_sources


def main() -> int:
    mode = os.getenv("MONITOR_MODE", "news-state-test").strip().lower()
    output_dir = Path(os.getenv("MONITOR_OUTPUT_DIR", "monitor-out"))
    persist_state = os.getenv("MONITOR_PERSIST_STATE", "0").strip().lower() in {"1", "true", "yes", "on"}

    started = datetime.now(timezone.utc)
    started_iso = started.isoformat()
    sources = load_sources()
    risks = load_risks()
    procedure_watches = load_procedure_watches()
    state = load_news_state()
    seen = seen_fingerprints(state)

    source_errors = validate_sources(sources)
    risk_errors, risk_page_checks = validate_risks(risks, REPO_ROOT)
    errors = source_errors + risk_errors

    nzz_configured = any(source.get("id") == "nzz" for source in sources)
    nzz_secret_available = bool(os.getenv("NZZ_COOKIE_HEADER"))

    source_runs = []
    normalized_findings = []
    new_findings = []
    source_warnings = []
    procedure_results = []
    procedure_warnings = []
    events = []
    classified_events = []
    selected_events = []

    if not errors:
        source_runs = fetch_all(sources)
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

        procedure_results, procedure_warnings = check_procedure_watches(procedure_watches, persist=persist_state)

        events = build_events(new_findings, procedure_watches)
        classified_events = classify_events(events, state)
        classified_events.sort(key=lambda e: (e["score"], e["source_count"]), reverse=True)
        selected_events = select_top_events(classified_events, limit=5, hard_max=10)

    source_p1_problem = any(
        run.get("priority") == "P1" and run.get("status") in {"unreachable", "auth_failed", "incomplete", "structure_changed"}
        for run in source_runs
    )
    procedure_p1_problem = any(
        result.get("priority") == "P1" and result.get("status") == "unreachable"
        for result in procedure_results
    )
    p1_problem = source_p1_problem or procedure_p1_problem

    all_warnings = source_warnings + procedure_warnings
    status = "failed" if errors else ("success_with_warnings" if all_warnings else "success")
    run_reliability = "incomplete" if p1_problem else "complete"
    finished_iso = datetime.now(timezone.utc).isoformat()

    classification_counts = Counter(str(event.get("status", "Unbekannt")) for event in classified_events)
    procedure_counts = Counter(str(item.get("status", "unknown")) for item in procedure_results)

    if persist_state and not errors:
        state = update_news_state(
            state=state,
            normalized_findings=normalized_findings,
            classified_events=classified_events,
            run_started_at=started_iso,
            run_finished_at=finished_iso,
            run_reliability=run_reliability,
        )
        save_news_state(state)

    result = {
        "schema_version": 5,
        "mode": mode,
        "started_at": started_iso,
        "finished_at": finished_iso,
        "status": status,
        "run_reliability": run_reliability,
        "writes_enabled": persist_state,
        "public_output_enabled": False,
        "configuration": {
            "source_count": len(sources),
            "enabled_source_count": sum(1 for s in sources if s.get("enabled", True)),
            "risk_dossier_count": len(risks),
            "procedure_watch_count": len(procedure_watches),
            "nzz_configured": nzz_configured,
            "nzz_secret_available": nzz_secret_available,
        },
        "state": {
            "seen_fingerprints_before": len(seen),
            "seen_fingerprints_after": len(state.get("seen_fingerprints", [])) if persist_state else len(seen),
            "stored_events_after": len(state.get("events", {})),
            "last_complete_run": state.get("last_complete_run"),
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
            "candidate_events": len(events),
            "classified_events": len(classified_events),
            "classification_counts": dict(classification_counts),
            "selected_events": len(selected_events),
            "selection_target": 5,
            "selection_hard_max": 10,
            "events": classified_events,
            "daily_selection": selected_events,
        },
        "procedure_monitoring": {
            "pages_checked": len(procedure_results),
            "status_counts": dict(procedure_counts),
            "results": procedure_results,
            "warnings": procedure_warnings,
        },
        "procedure_watches": procedure_watches,
        "risk_page_checks": risk_page_checks,
        "errors": errors,
        "next_phase": "validate procedure monitoring, then promote workflow to Monitor – Daily Run and add risk source checking",
    }

    output_path = output_dir / "monitor-news-state-test.json"
    write_json(output_path, result)

    print("MONITOR - DAILY NEWS STATE TEST")
    print(f"Status: {result['status']}")
    print(f"Run reliability: {result['run_reliability']}")
    print(f"Sources configured: {len(sources)}")
    print(f"Sources attempted: {len(source_runs)}")
    print(f"Sources successful: {result['news_discovery']['sources_successful']}")
    print(f"Normalized findings: {len(normalized_findings)}")
    print(f"Previously seen fingerprints: {len(seen)}")
    print(f"New findings: {len(new_findings)}")
    print(f"Candidate events: {len(events)}")
    print(f"Event classifications: {dict(classification_counts)}")
    print(f"Daily selection: {len(selected_events)}")
    print(f"Procedure watches: {len(procedure_watches)}")
    print(f"Procedure pages checked: {len(procedure_results)}")
    print(f"Procedure statuses: {dict(procedure_counts)}")
    print(f"Source warnings: {len(source_warnings)}")
    print(f"Procedure warnings: {len(procedure_warnings)}")
    print(f"NZZ secret available: {'yes' if nzz_secret_available else 'no'}")
    print(f"Persistent writes enabled: {'yes' if persist_state else 'no'}")
    print("Public output enabled: no")
    print(f"Artifact: {output_path}")

    if selected_events:
        print("Selected events:")
        for event in selected_events:
            print(f"- [{event['status']}] [{event['score']}] {event['title']}")
    else:
        print("Selected events: none")

    if errors:
        print("Validation errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
