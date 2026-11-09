from __future__ import annotations

import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

MONITOR_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MONITOR_DIR))

from archive import _source_statuses  # noqa: E402
from fetch import retry_failed_priority_sources  # noqa: E402
import retry_incomplete_run  # noqa: E402


def source(name: str, priority: str = "P1", **values) -> dict:
    return {"id": name, "name": name, "priority": priority, **values}


def result(name: str, status: str, *, priority: str = "P1", findings=None, http_status=None) -> dict:
    return {
        "source_id": name, "source_name": name, "priority": priority,
        "status": status, "http_status": http_status,
        "findings": [] if findings is None else findings, "error": None,
    }


class TargetedSourceRetryTests(unittest.TestCase):
    def test_retries_only_failed_p1_and_preserves_all_successful_findings(self):
        original = [
            result("parliament", "new_publication", findings=[{"fingerprint": "A"}]),
            result("eu-council", "unreachable"),
            result("nzz", "checked_no_new"),
            result("secondary", "unreachable", priority="P2"),
        ]
        calls = []

        def recover(config, *, max_findings):
            calls.append((config["id"], max_findings))
            return result("eu-council", "new_publication",
                          findings=[{"fingerprint": "B"}], http_status=200)

        updated = retry_failed_priority_sources([
            source("parliament"), source("eu-council", max_findings=250),
            source("nzz"), source("secondary", "P2"),
        ], original, fetcher=recover)

        self.assertEqual([("eu-council", 200)], calls)
        self.assertEqual([{"fingerprint": "A"}], updated[0]["findings"])
        self.assertEqual([{"fingerprint": "B"}], updated[1]["findings"])
        self.assertIs(updated[0], original[0])
        self.assertIs(updated[2], original[2])
        self.assertIs(updated[3], original[3])
        self.assertTrue(updated[1]["source_retry"]["recovered"])
        self.assertEqual("unreachable", updated[1]["source_retry"]["initial_status"])
        self.assertEqual(2, updated[1]["source_retry"]["attempts"])

    def test_failed_second_attempt_keeps_original_result_and_incomplete_status(self):
        original = result("eu-council", "unreachable")
        original["error"] = "TimeoutError"
        calls = []

        def fail(config, *, max_findings):
            calls.append(config["id"])
            raise TimeoutError("second timeout")

        output = retry_failed_priority_sources([source("eu-council")], [original], fetcher=fail)
        self.assertEqual(["eu-council"], calls)
        self.assertEqual("unreachable", output[0]["status"])
        self.assertEqual("TimeoutError", output[0]["error"])
        self.assertEqual([], output[0]["findings"])
        self.assertEqual("unreachable", output[0]["source_retry"]["retry_status"])
        self.assertFalse(output[0]["source_retry"]["recovered"])
        self.assertEqual([{"id": "eu-council", "name": "eu-council", "status": "unreachable",
                           "ok": False, "retry": output[0]["source_retry"], "diagnostics": None}],
                         _source_statuses({"news_discovery": {"source_runs": output}}))

    def test_permanent_or_lower_priority_errors_are_not_retried(self):
        statuses = [
            result("auth", "auth_failed"),
            result("invalid", "structure_changed"),
            result("stale", "stale_feed"),
            result("not-found", "unreachable", http_status=404),
            result("lower", "unreachable", priority="P2"),
        ]
        configs = [source(r["source_id"], r["priority"]) for r in statuses]

        def unexpected(*_args, **_kwargs):
            self.fail("permanent errors and P2 failures must not be retried")

        output = retry_failed_priority_sources(configs, statuses, fetcher=unexpected)
        self.assertEqual(statuses, output)
        self.assertTrue(all("source_retry" not in r for r in output))

    def test_transient_http_codes_are_retried_but_only_once(self):
        attempts = []

        def keep_failing(config, *, max_findings):
            attempts.append(config["id"])
            return result(config["id"], "unreachable", http_status=503)

        original = [result("timeout", "unreachable"),
                    result("rate-limited", "unreachable", http_status=429),
                    result("server", "unreachable", http_status=503)]
        output = retry_failed_priority_sources(
            [source(i["source_id"]) for i in original], original, fetcher=keep_failing)
        self.assertEqual(["timeout", "rate-limited", "server"], attempts)
        self.assertTrue(all(x["source_retry"]["attempts"] == 2 for x in output))
        self.assertTrue(all(x["status"] == "unreachable" for x in output))


class IncompleteRunReportingTests(unittest.TestCase):
    def test_failed_source_emits_annotation_and_github_summary_without_rerun(self):
        with tempfile.TemporaryDirectory() as tmp:
            report_dir = Path(tmp)
            date = datetime.now(retry_incomplete_run.ZURICH).date().isoformat()
            (report_dir / f"{date}.json").write_text(json.dumps({
                "run_reliability": "incomplete",
                "quality": {
                    "sources_successful": 28, "sources_attempted": 29,
                    "source_statuses": [{
                        "id": "eu-council", "ok": False,
                        "retry": {"attempts": 2, "recovered": False}
                    }],
                },
            }), encoding="utf-8")
            summary_file = report_dir / "github-summary.txt"
            captured = io.StringIO()
            with patch.object(retry_incomplete_run, "REPORT_DIR", report_dir), \
                    patch.dict(os.environ, {"GITHUB_STEP_SUMMARY": str(summary_file)}), \
                    contextlib.redirect_stdout(captured):
                self.assertEqual(0, retry_incomplete_run.main())
            self.assertIn("::warning title=Newsmonitor unvollständig", captured.getvalue())
            summary = summary_file.read_text(encoding="utf-8")
            self.assertIn("**28/29**", summary)
            self.assertIn("eu-council", summary)
            self.assertIn("**nicht ausgeführt**", summary)

    def test_recovered_retry_is_reported_as_complete(self):
        summary, incomplete = retry_incomplete_run.summarize({
            "run_reliability": "complete",
            "quality": {
                "sources_successful": 29, "sources_attempted": 29,
                "source_statuses": [{"id": "eu-council", "ok": True,
                                    "retry": {"recovered": True, "attempts": 2}}],
            },
        })
        self.assertFalse(incomplete)
        self.assertIn("**1**, davon **1** erfolgreich", summary)
        self.assertNotIn("Unvollständiger Lauf", summary)

    def test_workflow_executes_monitor_exactly_once(self):
        workflow = (MONITOR_DIR.parents[2] / "workflows" / "monitor-news.yml").read_text(encoding="utf-8")
        code = (MONITOR_DIR / "retry_incomplete_run.py").read_text(encoding="utf-8")
        self.assertEqual(1, workflow.count("run: python .github/scripts/monitor/run_monitor.py"))
        self.assertIn("retry_failed_priority_sources(sources, fetch_all(sources))",
                      (MONITOR_DIR / "run_monitor.py").read_text(encoding="utf-8"))
        self.assertNotIn("subprocess", code)
        self.assertNotIn("Retry incomplete source run once", workflow)


if __name__ == "__main__":
    unittest.main()
