from __future__ import annotations

import unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[4]


class MonitorScheduleTests(unittest.TestCase):
    def test_daily_is_exactly_once_at_0730_zurich(self):
        workflow = (ROOT / ".github/workflows/monitor-news.yml").read_text(encoding="utf-8")
        self.assertIn("cron: '30 7 * * *'", workflow)
        self.assertEqual(1, workflow.count("cron:"))
        self.assertIn("timezone: 'Europe/Zurich'", workflow)

    def test_0730_tracks_dst(self):
        zone = ZoneInfo("Europe/Zurich")
        winter = datetime(2026, 1, 15, 7, 30, tzinfo=zone)
        summer = datetime(2026, 7, 15, 7, 30, tzinfo=zone)
        self.assertEqual(6, winter.astimezone(ZoneInfo("UTC")).hour)
        self.assertEqual(5, summer.astimezone(ZoneInfo("UTC")).hour)

    def test_epaper_has_five_minute_window_and_no_automatic_daily_dispatch(self):
        workflow = (ROOT / ".github/workflows/monitor-epaper-evening.yml").read_text(encoding="utf-8")
        self.assertIn("cron: '30/5 21 * * *'", workflow)
        self.assertIn("cron: '*/5 22-23 * * *'", workflow)
        self.assertIn("default: false", workflow)
        self.assertIn("inputs.dispatch_daily == true", workflow)
        self.assertIn("epaper-work-${{ steps.gate.outputs.edition }}-${{ steps.gate.outputs.target_date }}", workflow)
        self.assertIn("steps.epaper-work-cache.outputs.cache-hit == 'true'", workflow)
        self.assertIn("epaper_status.py", workflow)
        self.assertIn("data/monitor/status/nzz-epaper.json", workflow)

    def test_evening_and_morning_share_secret_cache_ledger_and_concurrency(self):
        evening = (ROOT / ".github/workflows/monitor-epaper-evening.yml").read_text(encoding="utf-8")
        morning = (ROOT / ".github/workflows/monitor-news.yml").read_text(encoding="utf-8")
        for workflow in (evening, morning):
            self.assertIn("group: monitor-editorial-ai", workflow)
            self.assertIn(".cache/newsmonitor/editorial_ai_cache.json", workflow)
            self.assertIn("sync_editorial_usage.py", workflow)
            self.assertIn("data/monitor/state/editorial_ai_usage.json", workflow)
        self.assertIn("OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}", evening)
        self.assertNotIn("sk-", evening)

    def test_full_run_button_remains(self):
        control = (ROOT / "monitor/control.js").read_text(encoding="utf-8")
        self.assertIn('data-run-kind="full"', control)

    def test_raspberry_timers_remain_prepared_but_not_activated_by_code(self):
        daily = (ROOT / "deploy/raspberry/newsmonitor-daily-trigger.timer").read_text(encoding="utf-8")
        epaper = (ROOT / "deploy/raspberry/newsmonitor-epaper-trigger.timer").read_text(encoding="utf-8")
        self.assertIn("07:35:00 Europe/Zurich", daily)
        self.assertIn("21:30..23:59/5:00 Europe/Zurich", epaper)
        self.assertNotIn("systemctl enable", daily + epaper)


if __name__ == "__main__":
    unittest.main()
