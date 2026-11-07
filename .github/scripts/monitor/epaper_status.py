from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from config import REPO_ROOT
from storage import write_json

ZURICH = ZoneInfo("Europe/Zurich")
STATUS_PATH = REPO_ROOT / "data" / "monitor" / "status" / "nzz-epaper.json"


def _json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError, TypeError):
        return {}


def _stage(success: bool, attempted: bool, error: str | None = None) -> dict[str, Any]:
    return {"status": "success" if success else ("failed" if attempted else "pending"), "error": error}


def build_status(previous: dict[str, Any], *, output_dir: Path, edition: str, target_date: str,
                 run_url: str, outcomes: dict[str, str], now: datetime | None = None) -> dict[str, Any]:
    now = (now or datetime.now(ZURICH)).astimezone(ZURICH)
    meta = _json(output_dir / "epaper-download.json")
    findings = _json(output_dir / "epaper-findings.json")
    report = _json(output_dir / "monitor-epaper-evening.json")
    editorial = _json(output_dir / "editorial-ai-shadow.json")
    pdf = output_dir / "current-epaper.pdf"
    pdf_header = b""
    if pdf.is_file():
        with pdf.open("rb") as handle:
            pdf_header = handle.read(4)
    pdf_ok = pdf.is_file() and pdf.stat().st_size > 100_000 and pdf_header == b"%PDF"
    issue_date = str((findings.get("metadata") or {}).get("issue_date") or report.get("issue_date") or "")
    date_ok = issue_date == target_date
    extracted = isinstance(findings.get("findings"), list)
    article_count = len(findings.get("findings") or []) if extracted else 0
    ai_status = str(editorial.get("status") or ("disabled" if os.getenv("EDITORIAL_AI_ENABLED", "false").lower() not in {"1", "true", "yes", "on"} else "pending"))
    ai_success = ai_status in {"success", "success_with_warnings"} and not editorial.get("fallback")
    downloaded = bool(meta.get("pdf_detected")) and pdf.is_file()
    complete = downloaded and pdf_ok and date_ok and extracted and ai_success
    not_available = str(meta.get("error") or "") == "no PDF download was detected"
    technical_failure = (
        (outcomes.get("download") == "failure" and not not_available)
        or outcomes.get("validate") == "failure" or outcomes.get("analysis") == "failure"
        or (pdf.is_file() and outcomes.get("extract") == "failure")
    )
    previous_issue = previous.get("issue") if isinstance(previous.get("issue"), dict) else {}
    same_issue = previous_issue.get("edition") == edition and previous_issue.get("target_date") == target_date
    first_detected = previous_issue.get("first_detected_at") if same_issue else None
    if downloaded and date_ok and not first_detected:
        first_detected = now.isoformat()
    attempts = int(previous_issue.get("attempts") or 0) + 1 if same_issue else 1
    # Website Full Runs are manual; no automatic E-paper retry is scheduled.
    next_attempt = None
    current = {
        "checked_at": now.isoformat(), "run_url": run_url, "overall_status": "success" if complete else ("failed" if technical_failure or ai_status == "fallback" else "pending"),
        "complete": complete, "edition_available": downloaded and date_ok,
        "download": _stage(downloaded, outcomes.get("download") not in {"", "skipped"} and not not_available, None if downloaded else ("Ausgabe noch nicht verfügbar" if not_available else "PDF nicht verfügbar")),
        "pdf_validation": _stage(pdf_ok and date_ok, pdf.is_file(), None if pdf_ok and date_ok else ("Falsches Ausgabedatum" if pdf_ok and issue_date and not date_ok else "PDF nicht validiert")),
        "extraction": _stage(extracted, pdf.is_file() and outcomes.get("extract") not in {"", "skipped"}, None if extracted else "Textextraktion fehlt"),
        "editorial_ai": {
            "status": "success" if ai_success else ai_status, "model": editorial.get("model") or os.getenv("EDITORIAL_AI_MODEL") or None,
            "last_successful_at": (editorial.get("finished_at") if ai_success else (previous.get("last_successful_ai") or {}).get("at")),
            "analysed_articles": len(editorial.get("analyses") or []), "selected_articles": len(editorial.get("selection") or []),
            "error": editorial.get("fallback_reason") if not ai_success and ai_status != "disabled" else None,
        },
        "articles_detected": article_count, "new_articles": int(report.get("new_findings") or 0),
        "next_attempt_at": next_attempt, "attempt": attempts,
    }
    result = {
        "schema_version": 1, "updated_at": now.isoformat(),
        "issue": {"edition": edition, "target_date": target_date, "issue_date": issue_date or None,
                  "first_detected_at": first_detected, "attempts": attempts},
        "current_attempt": current,
        "last_successful": previous.get("last_successful"),
        "last_successful_ai": previous.get("last_successful_ai"),
    }
    if ai_success:
        result["last_successful_ai"] = {"at": editorial.get("finished_at") or now.isoformat(), "model": editorial.get("model"), "issue_date": issue_date}
    if complete:
        result["last_successful"] = {"at": now.isoformat(), "edition": edition, "issue_date": issue_date, "run_url": run_url,
                                     "articles_detected": article_count, "selected_articles": len(editorial.get("selection") or [])}
    return result



def build_skipped_status(previous: dict[str, Any], *, edition: str, target_date: str,
                         run_url: str, now: datetime | None = None) -> dict[str, Any]:
    """Record a no-op Full Run without replacing the last complete NZZ issue."""
    now = (now or datetime.now(ZURICH)).astimezone(ZURICH)
    prior_issue = previous.get("issue") or {}
    same_issue = prior_issue.get("edition") == edition and prior_issue.get("target_date") == target_date
    last_complete = previous.get("last_successful") or {}
    attempts = int(prior_issue.get("attempts") or 0) + 1 if same_issue else 1
    return {
        "schema_version": 1,
        "updated_at": now.isoformat(),
        "issue": {
            "edition": edition,
            "target_date": target_date,
            "issue_date": target_date,
            "first_detected_at": prior_issue.get("first_detected_at") if same_issue else None,
            "attempts": attempts,
        },
        "current_attempt": {
            "checked_at": now.isoformat(),
            "run_url": run_url,
            "overall_status": "success",
            "complete": True,
            "skipped": True,
            "skip_reason": "Diese Ausgabe wurde bereits vollständig ausgewertet.",
            "edition_available": True,
            "download": {"status": "skipped", "error": None},
            "pdf_validation": {"status": "skipped", "error": None},
            "extraction": {"status": "skipped", "error": None},
            "editorial_ai": {
                "status": "skipped",
                "model": (previous.get("current_attempt") or {}).get("editorial_ai", {}).get("model"),
                "last_successful_at": (previous.get("last_successful_ai") or {}).get("at"),
                "analysed_articles": 0,
                "selected_articles": last_complete.get("selected_articles", 0),
                "error": None,
            },
            "articles_detected": last_complete.get("articles_detected", 0),
            "new_articles": 0,
            "next_attempt_at": None,
            "attempt": attempts,
        },
        "last_successful": previous.get("last_successful"),
        "last_successful_ai": previous.get("last_successful_ai"),
    }


def main() -> int:
    previous = _json(STATUS_PATH)
    outcomes = {name: os.getenv(f"{name.upper()}_OUTCOME", "") for name in ("download", "extract", "validate", "analysis")}
    if os.getenv("NZZ_EPAPER_ALREADY_COMPLETE", "false").lower() == "true":
        value = build_skipped_status(
            previous, edition=os.getenv("NZZ_EPAPER_EDITION", "nzz"),
            target_date=os.getenv("NZZ_EPAPER_TARGET_DATE", ""),
            run_url=os.getenv("GITHUB_RUN_URL", ""),
        )
    else:
        value = build_status(previous, output_dir=Path(os.getenv("MONITOR_OUTPUT_DIR", "monitor-out")),
                             edition=os.getenv("NZZ_EPAPER_EDITION", "nzz"), target_date=os.getenv("NZZ_EPAPER_TARGET_DATE", ""),
                             run_url=os.getenv("GITHUB_RUN_URL", ""), outcomes=outcomes)
    write_json(STATUS_PATH, value)
    print(f"E-paper status: overall={value['current_attempt']['overall_status']}; complete={value['current_attempt']['complete']}; attempt={value['issue']['attempts']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
