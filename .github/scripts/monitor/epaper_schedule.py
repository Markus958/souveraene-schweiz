from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo


ZURICH = ZoneInfo("Europe/Zurich")
EVENING_START = time(21, 30)
DELAY_CUTOFF = time(6, 0)
DIRECT_EVENTS = {"workflow_dispatch", "workflow_call", "push"}


@dataclass(frozen=True)
class EpaperSchedule:
    should_run: bool
    target_date: date
    edition: str
    intended_evening: date
    reason: str
    trigger_mode: str


def intended_evening_target(now: datetime) -> tuple[date, date, str, bool]:
    """Return intended evening, target issue, reason and validity in Zurich time."""
    local_now = now.astimezone(ZURICH)
    local_time = local_now.timetz().replace(tzinfo=None)
    if local_time >= EVENING_START:
        evening = local_now.date()
        return evening, evening + timedelta(days=1), "scheduled_evening", True
    if local_time < DELAY_CUTOFF:
        evening = local_now.date() - timedelta(days=1)
        return evening, evening + timedelta(days=1), "delayed_after_midnight", True
    evening = local_now.date() - timedelta(days=1)
    return evening, evening + timedelta(days=1), "stale_outside_grace_window", False


def full_run_target(created_at: str) -> tuple[date, str]:
    """Select a single issue using the original GitHub workflow run creation time.

    The timestamp must be timezone-aware. The day changes at local midnight,
    independently of when GitHub later allocates a runner.
    """
    try:
        instant = datetime.fromisoformat(created_at.strip().replace("Z", "+00:00"))
    except (AttributeError, ValueError) as exc:
        raise ValueError("invalid GitHub run created_at") from exc
    if instant.tzinfo is None or instant.utcoffset() is None:
        raise ValueError("GitHub run created_at must include a timezone")
    local = instant.astimezone(ZURICH)
    target = local.date() + timedelta(days=1) if local.time() >= EVENING_START else local.date()
    return target, "nzzas" if target.weekday() == 6 else "nzz"


def should_process_issue(
    schedule: EpaperSchedule,
    *,
    last_successful: dict[str, Any] | None = None,
    same_issue: bool = False,
    attempt_complete: bool = False,
) -> tuple[bool, str]:
    """Skip only a confirmed complete (date, edition) identity, never a PDF/archive."""
    if not schedule.should_run:
        return False, schedule.reason
    previous = last_successful or {}
    completed_identity = (
        previous.get("issue_date") == schedule.target_date.isoformat()
        and previous.get("edition") == schedule.edition
    )
    if completed_identity or (same_issue and attempt_complete):
        return False, "already_successfully_processed"
    return True, schedule.reason


def resolve_epaper_schedule(
    now: datetime,
    *,
    event_name: str,
    requested_edition: str = "auto",
    trigger_mode: str = "manual",
    requested_target_date: str = "",
) -> EpaperSchedule:
    """Resolve the issue from the intended Zurich evening, not runner start date.

    Scheduled jobs starting after midnight and before 06:00 belong to the
    previous evening window.  A scheduled job outside the evening/grace window
    is treated as stale and must not download an ambiguous issue.
    """
    local_now = now.astimezone(ZURICH)
    requested = (requested_edition or "auto").strip().lower()
    mode = (trigger_mode or "manual").strip().lower()

    if event_name == "schedule":
        mode = "github_schedule"
        intended_evening, target, reason, should_run = intended_evening_target(local_now)
    elif event_name in {"workflow_dispatch", "workflow_call"} and mode == "full_run":
        intended_evening = local_now.date()
        reason = "website_full_run"
        try:
            target = date.fromisoformat((requested_target_date or "").strip())
        except ValueError:
            target = local_now.date()
            should_run = False
            reason = "full_run_target_missing_or_invalid"
        else:
            should_run = True
        if requested in {"nzz", "nzzas"}:
            expected = "nzzas" if target.weekday() == 6 else "nzz"
            if requested != expected:
                should_run = False
                reason = "full_run_edition_mismatch"
    elif event_name in {"workflow_dispatch", "workflow_call"} and mode == "raspberry":
        intended_evening, expected_target, reason, should_run = intended_evening_target(local_now)
        try:
            supplied_target = date.fromisoformat((requested_target_date or "").strip())
        except ValueError:
            supplied_target = None
        target = expected_target
        if supplied_target is None:
            should_run = False
            reason = "raspberry_target_missing_or_invalid"
        elif supplied_target != expected_target:
            should_run = False
            reason = "raspberry_target_mismatch"
    elif event_name in DIRECT_EVENTS:
        mode = "push" if event_name == "push" else "manual"
        try:
            target = date.fromisoformat((requested_target_date or "").strip()) if requested_target_date else local_now.date()
        except ValueError:
            target = local_now.date()
            should_run = False
            reason = "manual_target_invalid"
        else:
            should_run = True
            reason = "direct_run"
        intended_evening = target - timedelta(days=1)
    else:
        mode = "unsupported"
        intended_evening = local_now.date()
        target = intended_evening + timedelta(days=1)
        should_run = False
        reason = "unsupported_event"

    if requested in {"nzz", "nzzas"}:
        edition = requested
    else:
        edition = "nzzas" if target.weekday() == 6 else "nzz"

    return EpaperSchedule(
        should_run=should_run,
        target_date=target,
        edition=edition,
        intended_evening=intended_evening,
        reason=reason,
        trigger_mode=mode,
    )
