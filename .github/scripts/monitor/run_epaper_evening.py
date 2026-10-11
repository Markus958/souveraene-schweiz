from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from config import REPO_ROOT, load_procedure_watches
from eventize import build_events, select_top_events
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
    state = load_news_state()
    seen = seen_fingerprints(state)
    new_findings = [f for f in findings if str(f.get("fingerprint", "")) not in seen]

    watches = load_procedure_watches()
    events = build_events(new_findings, watches)
    classified = classify_events(events, state)
    classified.sort(key=lambda e: (int(e.get("score", 0)), int(e.get("source_count", 0))), reverse=True)
    selected = select_top_events(classified, limit=5, hard_max=10)

    started = datetime.now(timezone.utc).isoformat()
    old_last_run = state.get("last_run")
    old_last_complete = state.get("last_complete_run")
    if findings:
        updated = update_news_state(
            state=state,
            normalized_findings=findings,
            classified_events=classified,
            run_started_at=started,
            run_finished_at=datetime.now(timezone.utc).isoformat(),
            run_reliability="complete",
        )
        # E-paper is an auxiliary early-warning source and must not redefine the full-monitor baseline.
        updated["last_run"] = old_last_run
        updated["last_complete_run"] = old_last_complete
        updated["last_epaper_run"] = {
            "edition": edition,
            "observed_at": datetime.now(timezone.utc).isoformat(),
            "findings": len(findings),
            "new_findings": len(new_findings),
            "selected_events": len(selected),
        }
        save_news_state(updated)

    zurich_now = datetime.now(ZoneInfo("Europe/Zurich"))
    report = {
        "schema_version": 1,
        "type": "epaper_early_warning",
        "edition": edition,
        "date": zurich_now.date().isoformat(),
        "generated_at": zurich_now.isoformat(),
        "source_status": epaper.get("status"),
        "pdf_metadata": epaper.get("metadata", {}),
        "findings": len(findings),
        "new_findings": len(new_findings),
        "candidate_events": len(classified),
        "selected_events": selected,
    }
    write_json(report_path, report)

    archive_dir = REPO_ROOT / "data" / "monitor" / "reports" / "epaper"
    archive_dir.mkdir(parents=True, exist_ok=True)
    archive_name = f"{zurich_now.date().isoformat()}-{edition}.json"
    write_json(archive_dir / archive_name, report)

    print(
        f"E-paper evening: edition={edition}; findings={len(findings)}; "
        f"new={len(new_findings)}; candidates={len(classified)}; selected={len(selected)}"
    )
    for event in selected:
        print(f"- [{event.get('score')}] {event.get('title')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
