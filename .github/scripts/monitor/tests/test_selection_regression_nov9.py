from __future__ import annotations

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
REPO_ROOT = MONITOR_DIR.parents[2]

import archive  # noqa: E402
import archive_runs  # noqa: E402
import filter_report_freshness as freshness  # noqa: E402
import post_quality_guard as guard  # noqa: E402


REPORT_DATE = "2026-11-09"
PAPER_REPORT = REPO_ROOT / "data/monitor/reports/epaper/2026-11-09-nzz.json"


def candidate(headline: str, summary: str, *, url: str = "https://epaper.nzz.ch/storefront/8#page=23",
              source_id: str = "nzz-epaper", role: str = "early_epaper") -> dict:
    source = {
        "id": source_id, "name": "NZZ E-Paper", "role": role,
        "url": url, "class": "B", "title": headline, "subtitle": summary,
    }
    return {
        "event_id": "EV-FIXTURE", "headline": headline, "summary": summary,
        "status": "Neu", "date": REPORT_DATE, "source": source,
        "sources": [source], "post_potential": 8,
        "risk_dossiers": [], "article_detail": {"summary": summary, "topics": [], "figures": []},
    }


class November9SelectionRegressionTests(unittest.TestCase):
    def test_real_epaper_archive_contains_both_high_impact_swiss_topics(self) -> None:
        report = json.loads(PAPER_REPORT.read_text(encoding="utf-8"))
        self.assertEqual("2026-11-09", report["issue_date"])
        self.assertEqual(42, report["findings"])
        titles = [item["title"] for item in report["post_candidates"]]
        self.assertIn("Thomas Aeschi will Bundesrat werden", titles)
        self.assertIn("Die EU schafft 800 Gesetze pro Jahr", titles)

    def test_swiss_eu_legal_adoption_with_concrete_quantity_is_qualified(self) -> None:
        item = candidate(
            "Die EU schafft 800 Gesetze pro Jahr",
            "Die dynamische Rechtsübernahme überfordert die EWR-Staaten – das droht auch der Schweiz",
        )
        self.assertTrue(freshness._fresh(item, REPORT_DATE))
        scored = freshness._quality(item)
        self.assertGreaterEqual(scored["relevance_score"], 6)
        self.assertGreaterEqual(scored["novelty_score"], 5)
        self.assertTrue(scored["quality_qualified"])
        guarded = guard._apply(dict(scored))
        self.assertTrue(guarded["quality_qualified"])
        self.assertIn("new-figure", scored["quality_reasons"])

    def test_swiss_federal_council_succession_is_not_generic_party_news(self) -> None:
        item = candidate(
            "Thomas Aeschi will Bundesrat werden",
            "Der SVP-Fraktionschef kandidiert nach längerem Zögern für Guy Parmelins Nachfolge. "
            "Im Zentrum steht die Nachfolge im Bundesrat.",
            url="https://epaper.nzz.ch/storefront/8#page=1",
        )
        self.assertTrue(freshness._fresh(item, REPORT_DATE))
        scored = freshness._quality(item)
        self.assertTrue(scored["quality_qualified"])
        self.assertGreaterEqual(scored["relevance_score"], 6)
        self.assertTrue(guard._apply(dict(scored))["quality_qualified"])

    def test_actual_epaper_candidates_remain_distinct_and_reach_scoring(self) -> None:
        events = archive._load_epaper_candidates(REPORT_DATE, [])
        titles = [item["title"] for item in events]
        self.assertIn("Thomas Aeschi will Bundesrat werden", titles)
        self.assertIn("Die EU schafft 800 Gesetze pro Jahr", titles)
        for target in ("Thomas Aeschi will Bundesrat werden", "Die EU schafft 800 Gesetze pro Jahr"):
            event = next(e for e in events if e["title"] == target)
            item = archive._event_view(event, datetime(2026, 11, 9, 12, tzinfo=freshness.ZURICH))
            self.assertTrue(freshness._fresh(item, REPORT_DATE), target)
            scored = freshness._quality(item)
            self.assertTrue(scored["quality_qualified"], (target, scored["quality_reasons"]))
            self.assertTrue(guard._apply(dict(scored))["quality_qualified"], target)

    def test_generic_foreign_law_count_is_not_swiss_eu_relevance(self) -> None:
        item = candidate(
            "800 Gesetze pro Jahr in einem Land ohne Schweiz-Bezug",
            "Ein ausländisches Parlament debattiert allgemeine Gesetze",
            source_id="international", url="https://example.org/world/legal",
        )
        # The negative explicitly removes 'Schweiz-Bezug' from the title to
        # prevent accidental relevance through this contextual anchor.
        item["headline"] = "800 Gesetze pro Jahr in der Fremde"
        scored = freshness._quality(item)
        self.assertLess(scored["relevance_score"], 6)
        self.assertFalse(scored["quality_qualified"])

    def test_generated_swiss_label_does_not_turn_foreign_adoption_into_core_news(self) -> None:
        item = candidate(
            "Rechtsübernahme im EWR-Mitgliedstaat",
            "Das ausländische Parlament beurteilt Regeln ohne Schweiz-Bezug.",
            source_id="foreign", url="https://example.org/europe/ewr",
        )
        # A synthetic boilerplate label alone must never supply the Swiss
        # relevance anchor. The source itself does not mention Switzerland.
        item["source"]["subtitle"] = "Das ausländische Parlament beurteilt neue Regeln."
        item["sources"][0]["subtitle"] = "Das ausländische Parlament beurteilt neue Regeln."
        item["summary"] = "Das ausländische Parlament beurteilt neue Regeln."
        item["article_detail"]["summary"] = item["summary"]
        item["why_important"] = "Schweiz-Relevanz"
        item["post_approach"] = "Die Folgen für die Schweiz noch prüfen."
        self.assertLess(freshness._relevance_score(item)[0], 6)
        self.assertFalse(freshness._quality(item)["quality_qualified"])

    def test_generic_fireworks_initiative_remains_excluded_by_context_guard(self) -> None:
        item = candidate(
            "Feuerwerksinitiative: Der Nationalrat entscheidet",
            "Die Volksinitiative will persönliches Feuerwerk einschränken.",
            source_id="tagesanzeiger", url="https://example.ch/feuerwerk",
        )
        item["quality_qualified"] = True
        item["relevance_score"] = 7
        item["novelty_score"] = 7
        self.assertFalse(guard._apply(item)["quality_qualified"])
        self.assertIn("guard:direct-democracy-without-strategic-topic", item["quality_reasons"])

    def test_known_unchanged_news_is_not_republished_by_archive(self) -> None:
        news = candidate(
            "Die EU schafft 800 Gesetze pro Jahr",
            "Die dynamische Rechtsübernahme betrifft die Schweiz.",
        )
        news["quality_qualified"] = True
        baseline = archive_runs._apply_delta({
            "date": REPORT_DATE, "news": [news], "news_candidates": [news],
            "news_candidate_pool": [news], "procedures": [], "risks": [],
        }, None)
        newer = archive_runs._apply_delta({
            "date": REPORT_DATE, "news": [news], "news_candidates": [news],
            "news_candidate_pool": [news], "procedures": [], "risks": [],
        }, baseline)
        self.assertEqual([], newer["news"])
        self.assertEqual(1, len(newer["news_candidates"]))


class SelectionAuditTests(unittest.TestCase):
    def test_stage_counts_explain_exclusion_without_disabling_context_guard(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            report_date = datetime.now(freshness.ZURICH).date().isoformat()
            eu = candidate("Die EU schafft 800 Gesetze pro Jahr",
                           "Die dynamische Rechtsübernahme betrifft die Schweiz.")
            firework = candidate("Feuerwerksinitiative: Parlament entscheidet",
                                 "Die Volksinitiative betrifft Feuerwerk.",
                                 source_id="tagesanzeiger", url="https://example.ch/fireworks")
            eu.update({"relevance_score": 8, "novelty_score": 7, "quality_qualified": True})
            firework.update({"relevance_score": 8, "novelty_score": 7, "quality_qualified": True})
            path = root / f"{report_date}.json"
            path.write_text(json.dumps({
                "date": report_date, "news_candidate_pool": [eu, firework],
                "quality_policy": {"qualified_count": 2}
            }), encoding="utf-8")
            with patch.object(guard, "REPORT_DIR", root), \
                    patch.dict(os.environ, {"MONITOR_OUTPUT_DIR": str(root / "no-artifact")}):
                self.assertEqual(0, guard.main())
            result = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(1, len(result["news_candidates"]))
            self.assertIn("EU schafft", result["news_candidates"][0]["headline"])
            stages = result["quality_policy"]["stage_counts"]
            self.assertEqual(2, stages["fresh_pool"])
            self.assertEqual(2, stages["qualified_before_context_guard"])
            self.assertEqual(1, stages["qualified_after_context_guard"])
            self.assertEqual(1, stages["published_candidates"])

    def test_index_recomputes_stale_candidate_count_on_every_run(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "index.json"
            path.write_text(json.dumps({
                "schema_version": 3,
                "reports": [{"date": REPORT_DATE, "news_candidates_count": 10, "news_count": 0}],
            }), encoding="utf-8")
            with patch.object(archive_runs, "INDEX_PATH", path), \
                    patch.object(archive_runs, "_run_entries", return_value=[]):
                report = {
                    "date": REPORT_DATE, "generated_at": "2026-11-09T08:00:00+01:00",
                    "news": [], "news_candidates": [{"headline": "Nur ein Kandidat"}],
                    "procedures": [], "risks": [], "status": "success",
                    "run_reliability": "complete",
                }
                archive_runs._update_index(report)
                updated = json.loads(path.read_text(encoding="utf-8"))
                self.assertEqual(1, updated["reports"][0]["news_candidates_count"])
                report["news_candidates"] = []
                archive_runs._update_index(report)
                updated = json.loads(path.read_text(encoding="utf-8"))
                self.assertEqual(0, updated["reports"][0]["news_candidates_count"])


if __name__ == "__main__":
    unittest.main()
