from __future__ import annotations

import os
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from archive import build_public_report, write_public_archive
from config import REPO_ROOT, load_procedure_watches, load_risks, load_sources
from eventize import build_events, select_top_events
from fetch import fetch_all
from procedure import check_procedure_watches
from risk import check_risks, link_risk_signals
from state import classify_events, load_news_state, save_news_state, seen_fingerprints, update_news_state
from storage import write_json
from validation import validate_risks, validate_sources


def main() -> int:
    mode = os.getenv("MONITOR_MODE", "daily-run").strip().lower()
    output_dir = Path(os.getenv("MONITOR_OUTPUT_DIR", "monitor-out"))
    persist_state = os.getenv("MONITOR_PERSIST_STATE", "0").strip().lower() in {"1", "true", "yes", "on"}
    public_archive_enabled = mode == "daily-run" and persist_state

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
    risk_results = []
    risk_signals = []
    risk_state = {}
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
        risk_results, risk_state = check_risks(risks, normalized_findings, persist=persist_state)
        risk_signals = link_risk_signals(new_findings, risks)

        signals_by_fp: dict[str, list[str]] = {}
        for signal in risk_signals:
            fp = str(signal.get("fingerprint", ""))
            if fp:
                signals_by_fp.setdefault(fp, []).append(str(signal.get("risk_id")))
        for finding in new_findings:
            fp = str(finding.get("fingerprint", ""))
            if fp in signals_by_fp:
                finding["risk_ids"] = sorted(set(signals_by_fp[fp]))

        events = build_events(new_findings, procedure_watches)
        classified_events = classify_events(events, state)
        for event in classified_events:
            event_risks = sorted({
                risk_id
                for source in event.get("sources", [])
                for risk_id in (source.get("risk_ids", []) or [])
            })
            if event_risks:
                event["risk_ids"] = event_risks
                event["risk_follow_up"] = "Primärquelle prüfen"
        classified_events.sort(key=lambda e: (e["score"], e["source_count"]), reverse=True)
        selected_events = select_top_events(classified_events, limit=5, hard_max=10)

    source_p1_problem = any(
        run.get("priority") == "P1" and run.get("status") in {"unreachable", "auth_failed", "incomplete", "structure_changed"}
        for run in source_runs
    )
    procedure_p1_problem = any(
        result.get("priority") == "P1" and result.get("status") in {"unreachable", "structure_changed"}
        for result in procedure_results
    )
    p1_problem = source_p1_problem or procedure_p1_problem

    all_warnings = source_warnings + procedure_warnings
    status = "failed" if errors else ("success_with_warnings" if all_warnings else "success")
    run_reliability = "incomplete" if p1_problem else "complete"
    finished_iso = datetime.now(timezone.utc).isoformat()

    classification_counts = Counter(str(event.get("status", "Unbekannt")) for event in classified_events)
    procedure_counts = Counter(str(item.get("status", "unknown")) for item in procedure_results)
    risk_counts = Counter(str(item.get("status", "unknown")) for item in risk_results)

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
        "schema_version": 9,
        "mode": mode,
        "started_at": started_iso,
        "finished_at": finished_iso,
        "status": status,
        "run_reliability": run_reliability,
        "writes_enabled": persist_state,
        "public_output_enabled": public_archive_enabled,
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
            "risk_state_last_run": risk_state.get("last_run") if isinstance(risk_state, dict) else None,
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
        "risk_monitoring": {
            "dossiers_checked": len(risk_results),
            "status_counts": dict(risk_counts),
            "results": risk_results,
            "news_media_signals": risk_signals,
            "news_media_signal_count": len(risk_signals),
        },
        "procedure_watches": procedure_watches,
        "risk_page_checks": risk_page_checks,
        "errors": errors,
        "next_phase": "enforce complete-baseline semantics and risk-specific P1 completeness",
    }

    output_path = output_dir / "monitor-daily-run.json"
    write_json(output_path, result)

    archive_paths = None
    if public_archive_enabled and not errors:
        public_report = build_public_report(result)
        archive_paths = write_public_archive(public_report)

    print("MONITOR - DAILY RUN")
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
    print(f"Risk dossiers checked: {len(risk_results)}")
    print(f"Risk statuses: {dict(risk_counts)}")
    print(f"Risk news/media signals: {len(risk_signals)}")
    print(f"Source warnings: {len(source_warnings)}")
    print(f"Procedure warnings: {len(procedure_warnings)}")
    print(f"NZZ secret available: {'yes' if nzz_secret_available else 'no'}")
    print(f"Persistent writes enabled: {'yes' if persist_state else 'no'}")
    print(f"Public archive enabled: {'yes' if public_archive_enabled else 'no'}")
    print(f"Artifact: {output_path}")
    if archive_paths:
        print(f"Daily archive: {archive_paths[0]}")
        print(f"Archive index: {archive_paths[1]}")

    if selected_events:
        print("Selected events:")
        for event in selected_events:
            risk_suffix = f" | Risiko: {','.join(event.get('risk_ids', []))}" if event.get("risk_ids") else ""
            print(f"- [{event['status']}] [{event['score']}] {event['title']}{risk_suffix}")
    else:
        print("Selected events: none")

    if risk_results:
        print("Risk report:")
        for item in risk_results:
            news = " | ".join(item.get("news", [])) if item.get("news") else "-"
            print(f"- {item['topic']}: {item['status']} | Änderung Website empfohlen: {item['change_recommended']} | {news}")

    if risk_signals:
        print("Risk news/media signals requiring primary-source verification:")
        for signal in risk_signals:
            print(f"- {signal['topic']}: {signal.get('title')} | {signal.get('source_name')}")

    if errors:
        print("Validation errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
