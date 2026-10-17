from __future__ import annotations

import json
import re
import shutil
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit
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


def _norm_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().casefold())


def _norm_url(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    try:
        parts = urlsplit(raw)
        path = re.sub(r"/+", "/", parts.path or "/").rstrip("/") or "/"
        return urlunsplit((parts.scheme.casefold(), parts.netloc.casefold(), path, "", ""))
    except Exception:
        return raw.split("#", 1)[0].split("?", 1)[0]


def _news_ids(item: dict[str, Any]) -> set[str]:
    ids: set[str] = set()
    event_id = str(item.get("event_id") or "").strip()
    if event_id:
        ids.add(f"event:{event_id}")
    headline = _norm_text(item.get("headline") or item.get("title"))
    if headline:
        ids.add(f"title:{headline}")
    source = item.get("source") if isinstance(item.get("source"), dict) else {}
    url = _norm_url(source.get("url"))
    if url:
        ids.add(f"url:{url}")
    for src in item.get("sources", []) or []:
        if not isinstance(src, dict):
            continue
        src_url = _norm_url(src.get("url"))
        if src_url:
            ids.add(f"url:{src_url}")
    return ids


def _news_pool(report: dict[str, Any]) -> list[dict[str, Any]]:
    pool = report.get("news_candidates")
    if not isinstance(pool, list):
        pool = report.get("news") or []
    return [item for item in pool if isinstance(item, dict)]


def _procedure_pool(report: dict[str, Any]) -> list[dict[str, Any]]:
    pool = report.get("procedure_snapshot")
    if not isinstance(pool, list):
        pool = report.get("procedures") or []
    return [item for item in pool if isinstance(item, dict)]


def _risk_pool(report: dict[str, Any]) -> list[dict[str, Any]]:
    pool = report.get("risk_snapshot")
    if not isinstance(pool, list):
        pool = report.get("risks") or []
    return [item for item in pool if isinstance(item, dict)]


def _latest_complete_baseline(current: dict[str, Any]) -> dict[str, Any] | None:
    current_time = _generated_at(current)
    candidates: list[tuple[datetime, dict[str, Any]]] = []
    paths = list(RUNS_DIR.glob("*/*.json")) if RUNS_DIR.is_dir() else []
    paths.extend(REPORT_DIR.glob("????-??-??.json"))
    seen: set[str] = set()
    for path in paths:
        key = str(path.resolve())
        if key in seen:
            continue
        seen.add(key)
        report = _load_json(path)
        if not report or report.get("run_reliability") != "complete":
            continue
        generated = _generated_at(report)
        if generated >= current_time:
            continue
        candidates.append((generated, report))
    if not candidates:
        return None
    candidates.sort(key=lambda pair: pair[0], reverse=True)
    return candidates[0][1]


def _news_signature(item: dict[str, Any]) -> dict[str, Any]:
    try:
        potential = int(item.get("post_potential") or 0)
    except (TypeError, ValueError):
        potential = 0
    detail = item.get("article_detail") if isinstance(item.get("article_detail"), dict) else {}
    source = item.get("source") if isinstance(item.get("source"), dict) else {}
    return {
        "post_potential": potential,
        "risk_dossiers": sorted(str(v) for v in (item.get("risk_dossiers") or []) if str(v)),
        "figures": sorted(_norm_text(v) for v in (detail.get("figures") or []) if _norm_text(v)),
        "source_priority": str(source.get("priority") or ""),
        "source_class": str(source.get("class") or ""),
    }


def _material_news_change(current: dict[str, Any], previous: dict[str, Any]) -> bool:
    now = _news_signature(current)
    before = _news_signature(previous)
    if abs(now["post_potential"] - before["post_potential"]) >= 2:
        return True
    if now["risk_dossiers"] != before["risk_dossiers"]:
        return True
    if now["figures"] and now["figures"] != before["figures"]:
        return True
    priority_rank = {"P1": 0, "P2": 1, "M1": 2, "M2": 3, "": 9}
    class_rank = {"A": 0, "B": 1, "C": 2, "D": 3, "": 9}
    if priority_rank.get(now["source_priority"], 9) < priority_rank.get(before["source_priority"], 9):
        return True
    if class_rank.get(now["source_class"], 9) < class_rank.get(before["source_class"], 9):
        return True
    return False


def _select_new_news(current: dict[str, Any], baseline: dict[str, Any] | None) -> list[dict[str, Any]]:
    previous_items = _news_pool(baseline or {})
    previous_by_id: dict[str, dict[str, Any]] = {}
    for previous in previous_items:
        for identity in _news_ids(previous):
            previous_by_id.setdefault(identity, previous)

    fresh: list[dict[str, Any]] = []
    seen_current: set[str] = set()
    for item in _news_pool(current):
        try:
            potential = int(item.get("post_potential") or 0)
        except (TypeError, ValueError):
            potential = 0
        if potential < 5:
            continue
        ids = _news_ids(item)
        if ids & seen_current:
            continue

        previous = next((previous_by_id[identity] for identity in ids if identity in previous_by_id), None)
        if previous is not None and not _material_news_change(item, previous):
            continue

        fresh.append(item)
        seen_current.update(ids)

    return fresh[:10]


def _procedure_key(item: dict[str, Any]) -> str:
    return str(item.get("watch_id") or item.get("page") or item.get("url") or "")


def _procedure_signature(item: dict[str, Any]) -> str:
    payload = {
        "page": item.get("page"),
        "references": sorted(str(v) for v in (item.get("references") or []) if str(v)),
        "documents": sorted(str(v) for v in (item.get("documents") or []) if str(v)),
        "dates": sorted(str(v) for v in (item.get("dates") or []) if str(v)),
    }
    return json.dumps(payload, ensure_ascii=False, sort_keys=True)


def _select_new_procedures(current_pool: list[dict[str, Any]], baseline: dict[str, Any] | None) -> list[dict[str, Any]]:
    previous = {_procedure_key(item): _procedure_signature(item) for item in _procedure_pool(baseline or {}) if _procedure_key(item)}
    selected: list[dict[str, Any]] = []
    for item in current_pool:
        key = _procedure_key(item)
        if not baseline:
            if str(item.get("status") or "") == "changed":
                selected.append(item)
            continue
        if not key or key not in previous or previous[key] != _procedure_signature(item):
            selected.append(item)
    return selected


def _risk_key(item: dict[str, Any]) -> str:
    return str(item.get("topic") or "")


def _risk_signature(item: dict[str, Any]) -> str:
    payload = {
        "news": sorted(_norm_text(v) for v in (item.get("news") or []) if _norm_text(v)),
        "change_recommended": str(item.get("change_recommended") or ""),
        "status": str(item.get("status") or ""),
        "complete": bool(item.get("source_check_complete", True)),
    }
    return json.dumps(payload, ensure_ascii=False, sort_keys=True)


def _risk_has_signal(item: dict[str, Any]) -> bool:
    return bool(item.get("news")) or item.get("change_recommended") == "Ja" or not item.get("source_check_complete", True)


def _select_new_risks(current_pool: list[dict[str, Any]], baseline: dict[str, Any] | None) -> list[dict[str, Any]]:
    previous = {_risk_key(item): _risk_signature(item) for item in _risk_pool(baseline or {}) if _risk_key(item)}
    selected: list[dict[str, Any]] = []
    for item in current_pool:
        key = _risk_key(item)
        if not baseline:
            if _risk_has_signal(item):
                selected.append(item)
            continue
        if key not in previous:
            if _risk_has_signal(item):
                selected.append(item)
        elif previous[key] != _risk_signature(item):
            selected.append(item)
    return selected


def _apply_delta(current: dict[str, Any], baseline: dict[str, Any] | None) -> dict[str, Any]:
    full_procedures = [item for item in current.get("procedures", []) or [] if isinstance(item, dict)]
    full_risks = [item for item in current.get("risks", []) or [] if isinstance(item, dict)]

    current["procedure_snapshot"] = full_procedures
    current["risk_snapshot"] = full_risks
    current["news"] = _select_new_news(current, baseline)
    current["procedures"] = _select_new_procedures(full_procedures, baseline)
    current["risks"] = _select_new_risks(full_risks, baseline)
    current["schema_version"] = max(8, int(current.get("schema_version") or 0))
    current["delta"] = {
        "mode": "new_or_materially_changed_since_last_complete_run",
        "baseline_generated_at": _generated_at(baseline).isoformat() if baseline else None,
        "news_count": len(current["news"]),
        "procedure_count": len(current["procedures"]),
        "risk_count": len(current["risks"]),
        "hit_count": len(current["news"]) + len(current["procedures"]) + len(current["risks"]),
    }
    return current


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
        news_count = len(report.get("news", []) or [])
        procedure_count = len(report.get("procedures", []) or [])
        risk_count = len(report.get("risks", []) or [])
        entries.append({
            "generated_at": generated.isoformat(),
            "path": path.relative_to(REPORT_DIR).as_posix(),
            "status": report.get("status"),
            "run_reliability": report.get("run_reliability"),
            "news_count": news_count,
            "procedure_count": procedure_count,
            "risk_count": risk_count,
            "hit_count": news_count + procedure_count + risk_count,
            "news_candidates_count": len(report.get("news_candidates", []) or []),
        })
    entries.sort(key=lambda item: str(item.get("generated_at") or ""), reverse=True)
    return entries


def _update_index(current: dict[str, Any]) -> None:
    index = _load_json(INDEX_PATH) or {"schema_version": 1, "reports": []}
    reports = list(index.get("reports", []) or [])
    report_date = str(current.get("date") or "")
    generated = _generated_at(current).isoformat()
    news_count = len(current.get("news", []) or [])
    procedure_count = len(current.get("procedures", []) or [])
    risk_count = len(current.get("risks", []) or [])

    found = False
    for entry in reports:
        if str(entry.get("date") or "") == report_date:
            entry.update({
                "path": f"{report_date}.json",
                "status": current.get("status"),
                "run_reliability": current.get("run_reliability"),
                "generated_at": generated,
                "news_count": news_count,
                "procedure_count": procedure_count,
                "risk_count": risk_count,
                "hit_count": news_count + procedure_count + risk_count,
                "runs": _run_entries(report_date),
            })
            found = True
            break
    if not found:
        reports.append({
            "date": report_date,
            "path": f"{report_date}.json",
            "status": current.get("status"),
            "run_reliability": current.get("run_reliability"),
            "generated_at": generated,
            "news_count": news_count,
            "procedure_count": procedure_count,
            "risk_count": risk_count,
            "hit_count": news_count + procedure_count + risk_count,
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
    index["schema_version"] = 3
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

    baseline = _latest_complete_baseline(current)
    current = _apply_delta(current, baseline)
    write_json(current_path, current)
    _snapshot(current)
    _cleanup(now)
    _update_index(current)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())