from __future__ import annotations

import sys
import unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

from epaper_schedule import full_run_target, resolve_epaper_schedule, should_process_issue  # noqa: E402


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

    def test_raspberry_target_is_independently_validated(self):
        result = resolve_epaper_schedule(
            datetime(2026, 11, 5, 21, 30, tzinfo=ZURICH),
            event_name="workflow_dispatch",
            trigger_mode="raspberry",
            requested_target_date="2026-11-06",
        )
        self.assertTrue(result.should_run)
        self.assertEqual("2026-11-06", result.target_date.isoformat())
        self.assertEqual("raspberry", result.trigger_mode)

    def test_raspberry_wrong_target_is_rejected(self):
        result = resolve_epaper_schedule(
            datetime(2026, 11, 5, 21, 30, tzinfo=ZURICH),
            event_name="workflow_dispatch",
            trigger_mode="raspberry",
            requested_target_date="2026-11-05",
        )
        self.assertFalse(result.should_run)
        self.assertEqual("raspberry_target_mismatch", result.reason)

    def test_raspberry_saturday_selects_nzz_am_sonntag(self):
        result = resolve_epaper_schedule(
            datetime(2026, 11, 7, 21, 30, tzinfo=ZURICH),
            event_name="workflow_dispatch",
            trigger_mode="raspberry",
            requested_target_date="2026-11-08",
        )
        self.assertTrue(result.should_run)
        self.assertEqual("nzzas", result.edition)

    def test_full_run_created_before_2130_uses_same_day(self):
        date, edition = full_run_target("2026-11-05T20:29:59Z")  # 21:29:59 Zurich
        self.assertEqual(("2026-11-05", "nzz"), (date.isoformat(), edition))

    def test_full_run_created_exactly_at_2130_uses_following_day(self):
        date, edition = full_run_target("2026-11-05T20:30:00Z")
        self.assertEqual(("2026-11-06", "nzz"), (date.isoformat(), edition))

    def test_full_run_created_at_2359_uses_following_day(self):
        date, _ = full_run_target("2026-11-05T22:59:59Z")
        self.assertEqual("2026-11-06", date.isoformat())

    def test_full_run_created_at_midnight_uses_current_day(self):
        date, _ = full_run_target("2026-11-05T23:00:00Z")
        self.assertEqual("2026-11-06", date.isoformat())

    def test_full_run_saturday_evening_targets_sunday_edition(self):
        date, edition = full_run_target("2026-11-07T20:30:00Z")
        self.assertEqual(("2026-11-08", "nzzas"), (date.isoformat(), edition))

    def test_full_run_sunday_daytime_targets_sunday_edition(self):
        date, edition = full_run_target("2026-11-08T12:00:00Z")
        self.assertEqual(("2026-11-08", "nzzas"), (date.isoformat(), edition))

    def test_full_run_must_use_timezone_aware_creation_time(self):
        with self.assertRaises(ValueError):
            full_run_target("2026-11-05T20:30:00")

    def test_full_run_summer_time_boundary(self):
        date, edition = full_run_target("2026-07-04T19:30:00Z")
        self.assertEqual(("2026-07-05", "nzzas"), (date.isoformat(), edition))

    def test_full_run_reusable_workflow_rejects_missing_issue(self):
        result = resolve_epaper_schedule(datetime(2026, 11, 6, 12, 0, tzinfo=ZURICH),
            event_name="workflow_dispatch", trigger_mode="full_run", requested_target_date="")
        self.assertFalse(result.should_run)
        self.assertEqual("full_run_target_missing_or_invalid", result.reason)

    def test_full_run_reusable_workflow_keeps_precomputed_issue(self):
        result = resolve_epaper_schedule(datetime(2026, 11, 6, 23, 50, tzinfo=ZURICH),
            event_name="workflow_dispatch", trigger_mode="full_run",
            requested_target_date="2026-11-06", requested_edition="nzz")
        self.assertTrue(result.should_run)
        self.assertEqual("2026-11-06", result.target_date.isoformat())

    def test_full_run_reusable_workflow_rejects_wrong_edition(self):
        result = resolve_epaper_schedule(datetime(2026, 11, 8, 2, 0, tzinfo=ZURICH),
            event_name="workflow_call", trigger_mode="full_run",
            requested_target_date="2026-11-08", requested_edition="nzz")
        self.assertFalse(result.should_run)
        self.assertEqual("full_run_edition_mismatch", result.reason)

    def test_complete_identity_is_skipped_even_in_direct_run(self):
        schedule = self.resolve("2026-11-06T01:30:00")
        should_run, reason = should_process_issue(schedule,
            last_successful={"issue_date": "2026-11-06", "edition": "nzz"})
        self.assertFalse(should_run)
        self.assertEqual("already_successfully_processed", reason)

    def test_same_date_different_edition_does_not_skip(self):
        schedule = self.resolve("2026-11-06T01:30:00")
        should_run, _ = should_process_issue(schedule,
            last_successful={"issue_date": "2026-11-06", "edition": "nzzas"})
        self.assertTrue(should_run)

    def test_pdf_archive_alone_does_not_skip_incomplete_issue(self):
        schedule = self.resolve("2026-11-06T01:30:00")
        should_run, _ = should_process_issue(schedule, last_successful=None,
            same_issue=True, attempt_complete=False)
        self.assertTrue(should_run)

    def test_same_current_attempt_completed_is_skipped(self):
        schedule = self.resolve("2026-11-06T01:30:00")
        should_run, reason = should_process_issue(schedule, same_issue=True, attempt_complete=True)
        self.assertFalse(should_run)
        self.assertEqual("already_successfully_processed", reason)


if __name__ == "__main__":
    unittest.main()
