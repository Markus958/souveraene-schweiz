from __future__ import annotations

import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / ".github/scripts/monitor"))

import archive_runs  # noqa: E402

REPORT_DIR = ROOT / "data/monitor/reports"
PREVIOUS_REAL = REPORT_DIR / "runs/2026-11-09/2026-11-09T074858576887.json"
CURRENT_REAL = REPORT_DIR / "runs/2026-11-09/2026-11-09T105802928806.json"


def paper_item(*, qualified: bool, page: int = 23, title: str = "Die EU schafft 800 Gesetze pro Jahr") -> dict:
    source = {
        "id": "nzz-epaper", "role": "early_epaper",
        "url": f"https://epaper.nzz.ch/storefront/8#page={page}",
        "page": page, "title": title, "published_at": "2026-11-09T00:00:00+01:00",
        "priority": "M1", "class": "B",
    }
    return {
        "event_id": f"EV-{page}",
        "date": "2026-11-09", "status": "Neu",
        "headline": title, "source": source, "sources": [source],
        "post_potential": 5, "quality_qualified": qualified,
    }


def report(items: list[dict], date_time: str, *, published: list[dict] | None = None) -> dict:
    return {
        "date": date_time[:10], "generated_at": date_time,
        "run_reliability": "complete", "status": "success",
        "news_candidate_pool": items, "news_candidates": [
            item for item in items if item.get("quality_qualified") is True
        ],
        "news": published or [], "procedures": [], "risks": [],
        "quality_policy": {},
    }


class FirstQualifiedVisibilityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        runs = root / "runs"
        runs.mkdir()
        for name, value in [("RUNS_DIR", runs), ("REPORT_DIR", root)]:
            patcher = patch.object(archive_runs, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.reports_root = root

    def historical_report(self, value: dict, filename: str = "2026-11-08.json"):
        path = self.reports_root / filename
        path.write_text(json.dumps(value), encoding="utf-8")

    def test_previously_rejected_then_first_qualified_is_visible_but_not_new(self):
        previous = report([paper_item(qualified=False)], "2026-11-09T07:48:58+01:00")
        current = report([paper_item(qualified=True)], "2026-11-09T10:58:02+01:00")
        self.historical_report(previous)
        result = archive_runs._apply_delta(copy.deepcopy(current), previous)
        self.assertEqual([], result["news"])
        self.assertEqual(0, result["delta"]["news_count"])
        self.assertEqual(0, result["delta"]["hit_count"])
        self.assertEqual(1, len(result["news_candidates"]))
        self.assertEqual(
            "first_time_qualified",
            result["news_candidates"][0]["qualification_context"],
        )
        self.assertEqual("Neu", result["news_candidates"][0]["status"])
        self.assertEqual(1, result["quality_policy"]["first_time_qualified_count"])

    def test_follow_up_run_does_not_keep_first_time_label(self):
        previous = report([paper_item(qualified=False)], "2026-11-09T07:48:58+01:00")
        self.historical_report(previous)
        current = report([paper_item(qualified=True)], "2026-11-09T10:58:02+01:00")
        first_result = archive_runs._apply_delta(copy.deepcopy(current), previous)
        self.historical_report(first_result, "2026-11-09.json")
        next_run = report([paper_item(qualified=True)], "2026-11-09T11:30:02+01:00")
        result = archive_runs._apply_delta(next_run, first_result)
        self.assertEqual([], result["news"])
        self.assertNotIn("qualification_context", result["news_candidates"][0])
        self.assertEqual(0, result["quality_policy"]["first_time_qualified_count"])

    def test_older_publication_prevents_false_first_time_label(self):
        old = report([paper_item(qualified=True)], "2026-11-08T09:00:00+01:00",
                     published=[paper_item(qualified=True)])
        self.historical_report(old)
        previous = report([paper_item(qualified=False)], "2026-11-09T07:48:58+01:00")
        self.historical_report(previous, "2026-11-09.json")
        current = report([paper_item(qualified=True)], "2026-11-09T10:58:02+01:00")
        result = archive_runs._apply_delta(copy.deepcopy(current), previous)
        self.assertEqual([], result["news"])
        self.assertNotIn("qualification_context", result["news_candidates"][0])
        self.assertEqual(0, result["quality_policy"]["first_time_qualified_count"])

    def test_older_qualification_even_if_never_published_prevents_false_label(self):
        old = report([paper_item(qualified=True)], "2026-11-08T09:00:00+01:00")
        self.historical_report(old)
        previous = report([paper_item(qualified=False)], "2026-11-09T07:48:58+01:00")
        current = report([paper_item(qualified=True)], "2026-11-09T10:58:02+01:00")
        result = archive_runs._apply_delta(copy.deepcopy(current), previous)
        self.assertNotIn("qualification_context", result["news_candidates"][0])

    def test_new_article_and_distinct_epaper_page_remain_actual_news(self):
        previous = report([paper_item(qualified=False, page=23)], "2026-11-09T07:48:58+01:00")
        current = report([paper_item(qualified=True, page=24)], "2026-11-09T10:58:02+01:00")
        self.historical_report(previous)
        result = archive_runs._apply_delta(copy.deepcopy(current), previous)
        self.assertEqual(1, len(result["news"]))
        self.assertNotIn("qualification_context", result["news_candidates"][0])

    def test_new_first_observation_is_not_mislabelled_as_requalification(self):
        current = report([paper_item(qualified=True)], "2026-11-09T10:58:02+01:00")
        result = archive_runs._apply_delta(copy.deepcopy(current), None)
        self.assertEqual(1, len(result["news"]))
        self.assertEqual(0, result["quality_policy"]["first_time_qualified_count"])
        self.assertNotIn("qualification_context", result["news_candidates"][0])

    def test_same_epaper_storefront_different_title_stays_distinct(self):
        earlier = paper_item(qualified=False, page=23, title="Die EU schafft 800 Gesetze pro Jahr")
        next_article = paper_item(qualified=True, page=23, title="Ein völlig anderer politischer Bericht")
        previous = report([earlier], "2026-11-09T07:48:58+01:00")
        current = report([next_article], "2026-11-09T10:58:02+01:00")
        result = archive_runs._apply_delta(copy.deepcopy(current), previous)
        self.assertEqual(1, len(result["news"]))
        self.assertNotIn("qualification_context", result["news_candidates"][0])

    def test_unqualified_article_is_never_surfaced_by_annotation(self):
        previous = report([paper_item(qualified=False)], "2026-11-09T07:48:58+01:00")
        current = report([paper_item(qualified=False)], "2026-11-09T10:58:02+01:00")
        result = archive_runs._apply_delta(copy.deepcopy(current), previous)
        self.assertEqual([], result["news"])
        self.assertEqual([], result["news_candidates"])
        self.assertEqual(0, result["quality_policy"]["first_time_qualified_count"])

    def test_actual_november_9_reports_reproduce_first_qualification_without_republishing(self):
        previous = json.loads(PREVIOUS_REAL.read_text(encoding="utf-8"))
        current = json.loads(CURRENT_REAL.read_text(encoding="utf-8"))
        self.historical_report(previous)
        result = archive_runs._apply_delta(copy.deepcopy(current), previous)
        self.assertEqual([], result["news"])
        self.assertEqual(1, result["quality_policy"]["first_time_qualified_count"])
        article = result["news_candidates"][0]
        self.assertEqual("Die EU schafft 800 Gesetze pro Jahr", article["headline"])
        self.assertEqual("first_time_qualified", article["qualification_context"])
        self.assertEqual(1, len(result["news_candidates"]))


class ExistingMonitorViewTests(unittest.TestCase):
    def test_monitor_keeps_new_and_current_news_in_separate_sections(self):
        accordion = (ROOT / "monitor/accordion.js").read_text(encoding="utf-8")
        monitor = (ROOT / "monitor/monitor.js").read_text(encoding="utf-8")
        self.assertIn("Neue Meldungen", accordion)
        self.assertIn("Weitere aktuelle Meldungen", accordion)
        self.assertIn("firstQualified > 0", accordion)
        self.assertIn("action: totalNews > 0", accordion)
        self.assertIn("Erstmals qualifiziert", monitor)
        self.assertIn("keine neue Nachricht", monitor)
        self.assertIn("const approvedEarlier = earlierCurrentNews(report, filtered.news).length;", monitor)

    def test_html_loads_refreshed_scripts_and_ci_checks_both(self):
        html = (ROOT / "monitor/index.html").read_text(encoding="utf-8")
        workflow = (ROOT / ".github/workflows/test-gmail-newsletter.yml").read_text(encoding="utf-8")
        for name in ("monitor.js", "accordion.js"):
            self.assertIn(f'{name}?v=20261109-pr34', html)
            self.assertIn(f"node --check monitor/{name}", workflow)
            self.assertIn(f"'monitor/{name}'", workflow)


if __name__ == "__main__":
    unittest.main()
