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
) -> EpaperSchedule:
    """Resolve the issue from the intended Zurich evening, not runner start date.

    Scheduled jobs starting after midnight and before 06:00 belong to the
    previous evening window.  A scheduled job outside the evening/grace window
    is treated as stale and must not download an ambiguous issue.
    """
    local_now = now.astimezone(ZURICH)
    requested = (requested_edition or "auto").strip().lower()

    if event_name in DIRECT_EVENTS:
        target = local_now.date()
        intended_evening = target - timedelta(days=1)
        should_run = True
        reason = "direct_run"
    elif event_name == "schedule":
        if local_now.timetz().replace(tzinfo=None) >= EVENING_START:
            intended_evening = local_now.date()
            should_run = True
            reason = "scheduled_evening"
        elif local_now.timetz().replace(tzinfo=None) < DELAY_CUTOFF:
            intended_evening = local_now.date() - timedelta(days=1)
            should_run = True
            reason = "delayed_after_midnight"
        else:
            intended_evening = local_now.date() - timedelta(days=1)
            should_run = False
            reason = "stale_outside_grace_window"
        target = intended_evening + timedelta(days=1)
    else:
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
    )
