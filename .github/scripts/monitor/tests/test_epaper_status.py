from __future__ import annotations

import json
import os
import sys
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

MONITOR_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MONITOR_DIR))

import epaper_status  # noqa: E402


class EpaperStatusTests(unittest.TestCase):
    def setUp(self) -> None:
        self.out = Path(__file__).with_name(".epaper-status-test")
        self.out.mkdir(exist_ok=True)
        self.now = datetime(2026, 11, 5, 21, 40, tzinfo=ZoneInfo("Europe/Zurich"))

    def tearDown(self) -> None:
        for path in self.out.iterdir():
            path.unlink(missing_ok=True)
        self.out.rmdir()

    def write_json(self, name: str, value: dict) -> None:
        (self.out / name).write_text(json.dumps(value), encoding="utf-8")

    def valid_download(self, *, issue_date: str = "2026-11-06") -> None:
        (self.out / "current-epaper.pdf").write_bytes(b"%PDF" + b"x" * 100_100)
        self.write_json("epaper-download.json", {"pdf_detected": True})
        self.write_json("epaper-findings.json", {"metadata": {"issue_date": issue_date}, "findings": [{"title": "A"}, {"title": "B"}]})
        self.write_json("monitor-epaper-evening.json", {"issue_date": issue_date, "new_findings": 1})

    def build(self, outcomes: dict | None = None, previous: dict | None = None) -> dict:
        return epaper_status.build_status(previous or {}, output_dir=self.out, edition="nzz", target_date="2026-11-06",
                                           run_url="https://github.com/example/actions/runs/1", outcomes=outcomes or {}, now=self.now)

    def test_success_requires_all_three_processing_stages(self) -> None:
        self.valid_download()
        self.write_json("editorial-ai-shadow.json", {"status": "success", "fallback": False, "model": "gpt-6-luna", "finished_at": self.now.isoformat(), "analyses": [{}, {}], "selection": [{}]})
        status = self.build()
        self.assertTrue(status["current_attempt"]["complete"])
        self.assertEqual("success", status["current_attempt"]["overall_status"])
        self.assertEqual(2, status["current_attempt"]["articles_detected"])

    def test_not_available_and_download_failure_are_not_success(self) -> None:
        pending = self.build()
        failed = self.build({"download": "failure"})
        self.assertFalse(pending["current_attempt"]["complete"])
        self.assertEqual("failed", failed["current_attempt"]["download"]["status"])

    def test_not_yet_available_issue_stays_pending_with_next_attempt(self) -> None:
        self.write_json("epaper-download.json", {"pdf_detected": False, "error": "no PDF download was detected"})
        with patch.dict(os.environ, {"EDITORIAL_AI_ENABLED": "true"}):
            pending = self.build({"download": "failure"})
        self.assertEqual("pending", pending["current_attempt"]["overall_status"])
        self.assertEqual("pending", pending["current_attempt"]["download"]["status"])
        self.assertIn("noch nicht verfügbar", pending["current_attempt"]["download"]["error"])
        self.assertIsNotNone(pending["current_attempt"]["next_attempt_at"])

    def test_wrong_issue_date_is_explicit(self) -> None:
        self.valid_download(issue_date="2026-11-05")
        status = self.build()
        self.assertEqual("failed", status["current_attempt"]["pdf_validation"]["status"])
        self.assertIn("Ausgabedatum", status["current_attempt"]["pdf_validation"]["error"])

    def test_extraction_failure_is_explicit(self) -> None:
        (self.out / "current-epaper.pdf").write_bytes(b"%PDF" + b"x" * 100_100)
        self.write_json("epaper-download.json", {"pdf_detected": True})
        status = self.build({"extract": "failure"})
        self.assertEqual("failed", status["current_attempt"]["extraction"]["status"])

    def test_ai_failure_keeps_download_success_and_previous_success(self) -> None:
        self.valid_download()
        self.write_json("editorial-ai-shadow.json", {"status": "fallback", "fallback": True, "fallback_reason": "OpenAI request failed", "model": "gpt-6-luna", "analyses": [{}], "selection": []})
        previous = {"last_successful": {"at": "2026-11-04T22:00:00+01:00"}, "last_successful_ai": {"at": "2026-11-04T21:55:00+01:00"}}
        status = self.build(previous=previous)
        self.assertEqual("success", status["current_attempt"]["download"]["status"])
        self.assertEqual("fallback", status["current_attempt"]["editorial_ai"]["status"])
        self.assertEqual(previous["last_successful"], status["last_successful"])
        self.assertIsNotNone(status["current_attempt"]["next_attempt_at"])

    def test_disabled_ai_is_visible_and_never_green(self) -> None:
        self.valid_download()
        with patch.dict(os.environ, {"EDITORIAL_AI_ENABLED": "false", "EDITORIAL_AI_MODEL": "gpt-6-luna"}):
            status = self.build()
        self.assertEqual("disabled", status["current_attempt"]["editorial_ai"]["status"])
        self.assertFalse(status["current_attempt"]["complete"])


if __name__ == "__main__":
    unittest.main()
