from __future__ import annotations

from dataclasses import dataclass
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


def should_process_issue(
    schedule: EpaperSchedule,
    *,
    direct_run: bool,
    archive_exists: bool,
    retry_ai_only: bool,
    attempt_complete: bool,
) -> tuple[bool, str]:
    if not schedule.should_run:
        return False, schedule.reason
    if not direct_run and archive_exists and (not retry_ai_only or attempt_complete):
        return False, "already_successfully_processed"
    return True, "retry_ai_only" if retry_ai_only else schedule.reason


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
