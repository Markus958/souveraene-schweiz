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

    def test_epaper_has_no_scheduled_push_or_manual_trigger(self):
        workflow = (ROOT / ".github/workflows/monitor-epaper-evening.yml").read_text(encoding="utf-8")
        self.assertIn("  workflow_call:", workflow)
        self.assertNotIn("  schedule:", workflow)
        self.assertNotIn("  workflow_dispatch:", workflow)
        self.assertNotIn("  push:", workflow)
        self.assertNotIn("cron:", workflow)
        self.assertNotIn("inputs.dispatch_daily", workflow)
        self.assertIn("epaper_status.py", workflow)
        self.assertIn("data/monitor/status/nzz-epaper.json", workflow)

    def test_cached_pdf_survives_extraction_or_ai_failure(self):
        workflow = (ROOT / ".github/workflows/monitor-epaper-evening.yml").read_text(encoding="utf-8")
        self.assertIn("actions/cache/restore@v4", workflow)
        self.assertIn("actions/cache/save@v4", workflow)
        self.assertIn("epaper-pdf-", workflow)
        self.assertIn("cache-matched-key", workflow)
        self.assertIn("Save PDF for future incomplete-run continuation", workflow)
        self.assertIn("Preserve validated e-paper for targeted retries", workflow)
        self.assertIn("Falsches Ausgabedatum", workflow)

    def test_full_run_dates_from_original_github_timestamp_and_always_does_daily(self):
        workflow = (ROOT / ".github/workflows/monitor-full-run.yml").read_text(encoding="utf-8")
        self.assertIn("actions/runs/${GITHUB_RUN_ID}", workflow)
        self.assertIn("full_run_target(created_at)", workflow)
        self.assertIn("target_date: ${{ needs.resolve-issue.outputs.target_date }}", workflow)
        self.assertIn("edition: ${{ needs.resolve-issue.outputs.edition }}", workflow)
        self.assertIn("trigger_mode: full_run", workflow)
        self.assertIn("needs: [resolve-issue, epaper]", workflow)
        self.assertIn("if: ${{ always() }}", workflow)
        self.assertIn("uses: ./.github/workflows/monitor-news.yml", workflow)

    def test_full_run_accepts_legacy_edition_without_changing_automatic_target(self):
        workflow = (ROOT / ".github/workflows/monitor-full-run.yml").read_text(encoding="utf-8")
        dispatch = workflow.split("  workflow_dispatch:\n", 1)[1].split("\npermissions:", 1)[0]
        self.assertIn("    inputs:\n      edition:", dispatch)
        self.assertIn("        required: false", dispatch)
        self.assertIn("        default: 'auto'", dispatch)
        self.assertIn("        type: string", dispatch)
        # The Raspberry's legacy field is accepted, but never overrides the
        # issue date and edition derived from the GitHub run timestamp.
        self.assertNotIn("inputs.edition", workflow)
        self.assertIn("full_run_target(created_at)", workflow)
        self.assertIn("edition: ${{ needs.resolve-issue.outputs.edition }}", workflow)

    def test_ci_runs_complete_monitor_suite(self):
        workflow = (ROOT / ".github/workflows/test-gmail-newsletter.yml").read_text(encoding="utf-8")
        self.assertIn("Test news monitor", workflow)
        self.assertIn("python -m unittest discover -s .github/scripts/monitor/tests -v", workflow)

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

    def test_editorial_cache_has_separate_immutable_snapshots_per_full_run_stage(self):
        """The 8 Nov Full Run lost its daily cache due to the shared run-ID key."""
        evening = (ROOT / ".github/workflows/monitor-epaper-evening.yml").read_text(encoding="utf-8")
        daily = (ROOT / ".github/workflows/monitor-news.yml").read_text(encoding="utf-8")

        def cache_keys(workflow: str) -> tuple[str, str]:
            step = workflow.split("uses: actions/cache@v4", 1)[1].split("      - name:", 1)[0]
            self.assertIn("path: .cache/newsmonitor/editorial_ai_cache.json", step)
            key = next(line.strip().removeprefix("key: ") for line in step.splitlines()
                       if line.strip().startswith("key: editorial-ai-"))
            restore = next(line.strip() for line in step.splitlines()
                           if line.strip().startswith("editorial-ai-"))
            return key, restore

        evening_key, evening_restore = cache_keys(evening)
        daily_key, daily_restore = cache_keys(daily)

        # jobs in one Full Run share run_id, so their complete save keys must
        # differ; GitHub Actions cannot overwrite an existing cache key.
        self.assertTrue(evening_key.endswith("-epaper"))
        self.assertTrue(daily_key.endswith("-daily"))
        self.assertNotEqual(evening_key, daily_key)
        self.assertEqual(evening_restore, daily_restore)
        self.assertTrue(evening_key.startswith(evening_restore))
        self.assertTrue(daily_key.startswith(daily_restore))
        self.assertEqual(
            evening_key.removesuffix("-epaper"),
            daily_key.removesuffix("-daily"),
        )
        self.assertIn("${{ github.run_id }}", evening_key)
        self.assertIn("${{ github.run_id }}", daily_key)
        for workflow in (evening, daily):
            self.assertIn("uses: actions/cache@v4", workflow)
            self.assertIn("restore-keys:", workflow)
            self.assertNotIn("EDITORIAL_AI_MAX_CANDIDATES: 20", workflow)

    def test_cost_optimisation_restores_compatible_previous_ai_cache(self):
        # PR31 changes editorial_ai.py, which changes GitHub's cache namespace.
        # Do not discard the already saved 8-Nov Daily snapshot at the next run.
        previous_hash = "78c97a197929b086a3ead14cf475c7204bda9bbedd673248416fe49f2560ef56"
        for name in ("monitor-news.yml", "monitor-epaper-evening.yml"):
            workflow = (ROOT / ".github/workflows" / name).read_text(encoding="utf-8")
            self.assertIn("editorial-ai-${{ runner.os }}-" + previous_hash + "-", workflow)
            self.assertIn("restore-keys:", workflow)
            self.assertIn("hashFiles('.github/scripts/monitor/editorial_ai.py'", workflow)

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
