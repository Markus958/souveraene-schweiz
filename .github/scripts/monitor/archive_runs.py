from __future__ import annotations

import json
import shutil
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from config import REPO_ROOT
from storage import write_json

REPORT_DIR = REPO_ROOT / "data" / "monitor" / "reports"
RUNS_DIR = REPORT_DIR / "runs"
INDEX_PATH = REPORT_DIR / "index.json"
ZURICH = ZoneInfo("Europe/Zurich")
RETENTION_DAYS = 30


def _load_json(path: Path) -> dict[str, Any] | None:
    if not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    return payload if isinstance(payload, dict) else None


def _generated_at(report: dict[str, Any]) -> datetime:
    raw = str(report.get("generated_at") or "").strip()
    if raw:
        try:
            value = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            if value.tzinfo is None:
                value = value.replace(tzinfo=ZURICH)
            return value.astimezone(ZURICH)
        except ValueError:
            pass
    return datetime.now(ZURICH)


def _snapshot_path(report: dict[str, Any]) -> Path:
    generated = _generated_at(report)
    report_date = str(report.get("date") or generated.date().isoformat())
    stamp = generated.strftime("%Y-%m-%dT%H%M%S%f")
    return RUNS_DIR / report_date / f"{stamp}.json"


def _snapshot(report: dict[str, Any]) -> Path:
    path = _snapshot_path(report)
    if not path.exists():
        write_json(path, report)
    return path


def _cleanup(now: datetime) -> None:
    if not RUNS_DIR.is_dir():
        return
    cutoff = now.date() - timedelta(days=RETENTION_DAYS)
    for child in RUNS_DIR.iterdir():
        if not child.is_dir():
            continue
        try:
            day = datetime.strptime(child.name, "%Y-%m-%d").date()
        except ValueError:
            continue
        if day < cutoff:
            shutil.rmtree(child)


def _run_entries(report_date: str) -> list[dict[str, Any]]:
    day_dir = RUNS_DIR / report_date
    if not day_dir.is_dir():
        return []
    entries: list[dict[str, Any]] = []
    for path in day_dir.glob("*.json"):
        report = _load_json(path)
        if not report:
            continue
        generated = _generated_at(report)
        entries.append({
            "generated_at": generated.isoformat(),
            "path": path.relative_to(REPORT_DIR).as_posix(),
            "status": report.get("status"),
            "run_reliability": report.get("run_reliability"),
            "news_count": len(report.get("news", []) or []),
            "news_candidates_count": len(report.get("news_candidates", []) or []),
        })
    entries.sort(key=lambda item: str(item.get("generated_at") or ""), reverse=True)
    return entries


def _update_index(current: dict[str, Any]) -> None:
    index = _load_json(INDEX_PATH) or {"schema_version": 1, "reports": []}
    reports = list(index.get("reports", []) or [])
    report_date = str(current.get("date") or "")
    generated = _generated_at(current).isoformat()

    found = False
    for entry in reports:
        if str(entry.get("date") or "") == report_date:
            entry["generated_at"] = generated
            entry["runs"] = _run_entries(report_date)
            found = True
            break
    if not found:
        reports.append({
            "date": report_date,
            "path": f"{report_date}.json",
            "status": current.get("status"),
            "run_reliability": current.get("run_reliability"),
            "generated_at": generated,
            "runs": _run_entries(report_date),
        })

    cutoff = datetime.now(ZURICH).date() - timedelta(days=RETENTION_DAYS)
    for entry in reports:
        date_raw = str(entry.get("date") or "")
        try:
            day = datetime.strptime(date_raw, "%Y-%m-%d").date()
        except ValueError:
            continue
        if day < cutoff:
            entry.pop("runs", None)
        elif day != datetime.strptime(report_date, "%Y-%m-%d").date():
            runs = _run_entries(date_raw)
            if runs:
                entry["runs"] = runs

    reports.sort(key=lambda item: str(item.get("date") or ""), reverse=True)
    index["schema_version"] = 2
    index["updated_at"] = datetime.now(ZURICH).isoformat()
    index["reports"] = reports
    write_json(INDEX_PATH, index)


def main() -> int:
    phase = (sys.argv[1] if len(sys.argv) > 1 else "after").strip().lower()
    now = datetime.now(ZURICH)
    report_date = now.date().isoformat()
    current_path = REPORT_DIR / f"{report_date}.json"

    if phase == "before":
        current = _load_json(current_path)
        if current and str(current.get("date") or "") == report_date:
            _snapshot(current)
        return 0

    if phase != "after":
        raise SystemExit("usage: archive_runs.py [before|after]")

    current = _load_json(current_path)
    if not current or str(current.get("date") or "") != report_date:
        print(f"No current report for {report_date}; run archive unchanged.")
        return 0

    _snapshot(current)
    _cleanup(now)
    _update_index(current)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
