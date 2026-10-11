from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from config import REPO_ROOT, load_procedure_watches, load_risks
from eventize import build_events, select_top_events
from reminders import update_reminders
from risk import link_risk_signals
from state import classify_events, load_news_state, save_news_state, seen_fingerprints, update_news_state
from storage import write_json


def main() -> int:
    edition = os.getenv("NZZ_EPAPER_EDITION", "nzz").strip().lower()
    output_dir = Path(os.getenv("MONITOR_OUTPUT_DIR", "monitor-out"))
    input_path = Path(os.getenv("NZZ_EPAPER_OUTPUT", output_dir / f"{edition}-epaper.json"))
    report_path = output_dir / "monitor-epaper-evening.json"

    if not input_path.is_file():
        print(f"E-paper evening: missing input {input_path}")
        return 2

    epaper = json.loads(input_path.read_text(encoding="utf-8"))
    findings = list(epaper.get("findings", []))
    for finding in findings:
        finding.setdefault("source_role", "early_epaper")
        finding.setdefault("source_stage", "Vorab E-Paper")

    state = load_news_state()
    seen = seen_fingerprints(state, baseline=False)
    new_findings = [f for f in findings if str(f.get("fingerprint", "")) not in seen]

    watches = load_procedure_watches()
    risks = load_risks()
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

    events = build_events(new_findings, watches)
    classified = classify_events(events, state)
    for event in classified:
        event["source_stage"] = "Vorab E-Paper"
        event["early_warning"] = True
        event_risks = sorted({
            risk_id
            for source in event.get("sources", [])
            for risk_id in (source.get("risk_ids", []) or [])
        })
        if event_risks:
            event["risk_ids"] = event_risks
            event["risk_follow_up"] = "Primärquelle prüfen"

    classified.sort(key=lambda e: (int(e.get("score", 0)), int(e.get("source_count", 0))), reverse=True)
    selected = select_top_events(classified, limit=5, hard_max=10)

    started = datetime.now(timezone.utc).isoformat()
    if findings:
        updated = update_news_state(
            state=state,
            normalized_findings=findings,
            classified_events=classified,
            run_started_at=started,
            run_finished_at=datetime.now(timezone.utc).isoformat(),
            run_reliability="early_warning",
        )
        updated["last_epaper_run"] = {
            "edition": edition,
            "observed_at": datetime.now(timezone.utc).isoformat(),
            "findings": len(findings),
            "new_findings": len(new_findings),
            "selected_events": len(selected),
            "risk_signals": len(risk_signals),
            "baseline_advanced": False,
        }
        save_news_state(updated)

    reminder_state = update_reminders(
        classified_events=classified,
        risk_results=[],
        procedure_results=[],
        persist=True,
    )

    zurich_now = datetime.now(ZoneInfo("Europe/Zurich"))
    report = {
        "schema_version": 4,
        "type": "epaper_early_warning",
        "source_stage": "Vorab E-Paper",
        "baseline_advanced": False,
        "edition": edition,
        "date": zurich_now.date().isoformat(),
        "generated_at": zurich_now.isoformat(),
        "source_status": epaper.get("status"),
        "pdf_metadata": epaper.get("metadata", {}),
        "findings": len(findings),
        "new_findings": len(new_findings),
        "candidate_events": len(classified),
        "selected_events": selected,
        "risk_signals": risk_signals,
        "open_reminders": reminder_state.get("open_count", 0),
    }
    write_json(report_path, report)

    archive_dir = REPO_ROOT / "data" / "monitor" / "reports" / "epaper"
    archive_dir.mkdir(parents=True, exist_ok=True)
    archive_name = f"{zurich_now.date().isoformat()}-{edition}.json"
    write_json(archive_dir / archive_name, report)

    print(
        f"E-paper evening: edition={edition}; findings={len(findings)}; "
        f"new={len(new_findings)}; candidates={len(classified)}; selected={len(selected)}; "
        f"risk_signals={len(risk_signals)}; reminders={reminder_state.get('open_count', 0)}; "
        f"baseline_advanced=false"
    )
    for event in selected:
        suffix = f" risks={','.join(event.get('risk_ids', []))}" if event.get("risk_ids") else ""
        print(f"- [{event.get('score')}] {event.get('title')} [Vorab E-Paper]{suffix}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
