from __future__ import annotations

import sys
import unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

from epaper_schedule import resolve_epaper_schedule, should_process_issue  # noqa: E402


ZURICH = ZoneInfo("Europe/Zurich")


class EpaperScheduleTests(unittest.TestCase):
    def resolve(self, value: str):
        return resolve_epaper_schedule(
            datetime.fromisoformat(value).replace(tzinfo=ZURICH),
            event_name="schedule",
        )

    def test_normal_2130_start_targets_next_issue(self):
        result = self.resolve("2026-11-05T21:30:00")
        self.assertTrue(result.should_run)
        self.assertEqual("2026-11-06", result.target_date.isoformat())
        self.assertEqual("nzz", result.edition)

    def test_2355_start_still_targets_next_issue(self):
        result = self.resolve("2026-11-05T23:55:00")
        self.assertEqual("2026-11-06", result.target_date.isoformat())
        self.assertEqual("scheduled_evening", result.reason)

    def test_0130_delayed_start_uses_previous_evening(self):
        result = self.resolve("2026-11-06T01:30:00")
        self.assertEqual("2026-11-06", result.target_date.isoformat())
        self.assertEqual("delayed_after_midnight", result.reason)

    def test_saturday_evening_selects_nzz_am_sonntag(self):
        result = self.resolve("2026-11-07T21:30:00")
        self.assertEqual("2026-11-08", result.target_date.isoformat())
        self.assertEqual("nzzas", result.edition)

    def test_delayed_sunday_morning_keeps_sunday_issue(self):
        result = self.resolve("2026-11-08T01:30:00")
        self.assertEqual("2026-11-08", result.target_date.isoformat())
        self.assertEqual("nzzas", result.edition)

    def test_dst_is_resolved_in_zurich_local_time(self):
        summer = self.resolve("2026-07-04T21:30:00")
        winter = self.resolve("2026-12-05T21:30:00")
        self.assertEqual("nzzas", summer.edition)
        self.assertEqual("nzzas", winter.edition)
        self.assertEqual(2, datetime.fromisoformat("2026-07-04T21:30:00").replace(tzinfo=ZURICH).utcoffset().total_seconds() / 3600)
        self.assertEqual(1, datetime.fromisoformat("2026-12-05T21:30:00").replace(tzinfo=ZURICH).utcoffset().total_seconds() / 3600)

    def test_very_late_scheduled_start_is_rejected(self):
        result = self.resolve("2026-11-06T07:00:00")
        self.assertFalse(result.should_run)
        self.assertEqual("stale_outside_grace_window", result.reason)

    def test_direct_run_uses_current_issue_date(self):
        result = resolve_epaper_schedule(
            datetime(2026, 11, 6, 12, 0, tzinfo=ZURICH),
            event_name="workflow_dispatch",
        )
        self.assertTrue(result.should_run)
        self.assertEqual("2026-11-06", result.target_date.isoformat())

    def test_successfully_processed_issue_is_not_downloaded_again(self):
        schedule = self.resolve("2026-11-06T01:30:00")
        should_run, reason = should_process_issue(
            schedule,
            direct_run=False,
            archive_exists=True,
            retry_ai_only=False,
            attempt_complete=True,
        )
        self.assertFalse(should_run)
        self.assertEqual("already_successfully_processed", reason)

    def test_incomplete_ai_can_retry_without_changing_issue(self):
        schedule = self.resolve("2026-11-06T01:30:00")
        should_run, reason = should_process_issue(
            schedule,
            direct_run=False,
            archive_exists=True,
            retry_ai_only=True,
            attempt_complete=False,
        )
        self.assertTrue(should_run)
        self.assertEqual("retry_ai_only", reason)


if __name__ == "__main__":
    unittest.main()
