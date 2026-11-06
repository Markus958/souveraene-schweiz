from __future__ import annotations

import base64
import json
import os
import sys
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

import epaper_trigger  # noqa: E402
from epaper_trigger import completed_target_from_contents, raspberry_dispatch_inputs  # noqa: E402


ZURICH = ZoneInfo("Europe/Zurich")


class EpaperTriggerTests(unittest.TestCase):
    def inputs(self, value: str) -> dict[str, str]:
        now = datetime.fromisoformat(value).replace(tzinfo=ZURICH)
        return raspberry_dispatch_inputs(now)

    def test_raspberry_2130_requests_next_day(self):
        self.assertEqual("2026-11-06", self.inputs("2026-11-05T21:30:00")["target_date"])

    def test_raspberry_2355_requests_next_day(self):
        self.assertEqual("2026-11-06", self.inputs("2026-11-05T23:55:00")["target_date"])

    def test_raspberry_after_midnight_keeps_previous_evening_target(self):
        self.assertEqual("2026-11-06", self.inputs("2026-11-06T01:30:00")["target_date"])

    def test_saturday_evening_target_is_sunday(self):
        self.assertEqual("2026-11-08", self.inputs("2026-11-07T21:30:00")["target_date"])

    def test_completed_status_prevents_duplicate_dispatch(self):
        status = {"issue": {"target_date": "2026-11-06"}, "current_attempt": {"complete": True}}
        encoded = base64.b64encode(json.dumps(status).encode()).decode()
        payload = {"content": "\n".join(encoded[index:index + 60] for index in range(0, len(encoded), 60))}
        self.assertEqual("2026-11-06", completed_target_from_contents(payload))

    def test_incomplete_status_does_not_block_retry(self):
        status = {"issue": {"target_date": "2026-11-06"}, "current_attempt": {"complete": False}}
        payload = {"content": base64.b64encode(json.dumps(status).encode()).decode()}
        self.assertIsNone(completed_target_from_contents(payload))

    def test_active_workflow_is_not_dispatched_again(self):
        with patch.dict(os.environ, {"GITHUB_TOKEN": "test-token"}), patch(
            "epaper_trigger.request",
            return_value=(200, {"workflow_runs": [{"status": "in_progress"}]}),
        ) as mocked_request:
            self.assertEqual(0, epaper_trigger.main())
        self.assertEqual(1, mocked_request.call_count)

    def test_completed_target_is_not_dispatched_again(self):
        status = {"issue": {"target_date": "2026-11-06"}, "current_attempt": {"complete": True}}
        payload = {"content": base64.b64encode(json.dumps(status).encode()).decode()}
        with patch.dict(os.environ, {"GITHUB_TOKEN": "test-token"}), patch(
            "epaper_trigger.raspberry_dispatch_inputs",
            return_value={"edition": "auto", "trigger_mode": "raspberry", "target_date": "2026-11-06"},
        ), patch(
            "epaper_trigger.request",
            side_effect=[(200, {"workflow_runs": []}), (200, payload)],
        ) as mocked_request:
            self.assertEqual(0, epaper_trigger.main())
        self.assertEqual(2, mocked_request.call_count)


if __name__ == "__main__":
    unittest.main()
