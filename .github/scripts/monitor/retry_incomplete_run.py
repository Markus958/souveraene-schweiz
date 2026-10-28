from __future__ import annotations

import json
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ZURICH = ZoneInfo("Europe/Zurich")
REPORT_DIR = Path("data/monitor/reports")


def main() -> int:
    report_date = datetime.now(ZURICH).date().isoformat()
    report_path = REPORT_DIR / f"{report_date}.json"
    if not report_path.is_file():
        print(f"Retry gate: no report found at {report_path}; no retry.")
        return 0

    report = json.loads(report_path.read_text(encoding="utf-8"))
    reliability = str(report.get("run_reliability") or "")
    quality = report.get("quality") if isinstance(report.get("quality"), dict) else {}
    statuses = quality.get("source_statuses") if isinstance(quality.get("source_statuses"), list) else []
    failed = [
        str(item.get("id") or item.get("name") or "unknown")
        for item in statuses
        if isinstance(item, dict) and item.get("ok") is False
    ]

    if reliability != "incomplete" or not failed:
        print(f"Retry gate: reliability={reliability or 'unknown'}; failed_sources={len(failed)}; no retry.")
        return 0

    print("Retry gate: incomplete run caused by failed sources: " + ", ".join(failed))
    print("Retry gate: waiting 5 seconds and retrying the complete monitor once.")
    time.sleep(5)
    completed = subprocess.run([sys.executable, ".github/scripts/monitor/run_monitor.py"], check=False)
    if completed.returncode != 0:
        print(f"Retry gate: retry process exited with {completed.returncode}; keeping original warning state.")
        return 0

    if report_path.is_file():
        retried = json.loads(report_path.read_text(encoding="utf-8"))
        new_quality = retried.get("quality") if isinstance(retried.get("quality"), dict) else {}
        new_statuses = new_quality.get("source_statuses") if isinstance(new_quality.get("source_statuses"), list) else []
        still_failed = [
            str(item.get("id") or item.get("name") or "unknown")
            for item in new_statuses
            if isinstance(item, dict) and item.get("ok") is False
        ]
        print(
            "Retry gate: second attempt reliability="
            f"{retried.get('run_reliability') or 'unknown'}; failed_sources="
            f"{', '.join(still_failed) if still_failed else 'none'}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
