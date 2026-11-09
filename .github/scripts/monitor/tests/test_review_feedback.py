from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / ".github/scripts/monitor"))

import review_feedback  # noqa: E402


def judgement(id="AR-0123456789ABCDEF", rating="postworthy", comment="Neue politische Aussage"):
    return {"id": id, "rating": rating, "comment": comment,
            "headline": "Die EU schafft 800 Gesetze pro Jahr", "source": "NZZ E-Paper"}


class EditorialFeedbackTests(unittest.TestCase):
    def test_only_two_valid_rating_values(self):
        base = {"schema_version": 1, "type": "editorial-review-feedback"}
        for rating in ("postworthy", "not_postworthy"):
            self.assertEqual(rating, review_feedback.validate_feedback({**base, "ratings":[judgement(rating=rating)]})[0]["rating"])
        for rating in ("observe", "maybe", "", None, True):
            with self.assertRaises(ValueError):
                review_feedback.validate_feedback({**base, "ratings":[judgement(rating=rating)]})

    def test_unrated_does_not_count_as_negative(self):
        rows = [judgement()]
        comparison = {
            "AR-0123456789ABCDEF": {"ai_selected": False},
            "AR-AAAAAAAAAAAAAAAA": {"ai_selected": True},
        }
        result = review_feedback.evaluate_feedback(rows, comparison)
        self.assertEqual(1, result["counts"]["reviewed"])
        self.assertEqual(1, result["counts"]["postworthy"])
        self.assertEqual(0, result["counts"]["not_postworthy"])
        self.assertEqual(1, result["ai_shadow_on_rated_sample"]["false_negative"])
        self.assertEqual(0, result["ai_shadow_on_rated_sample"]["false_positive"])

    def test_computes_precision_and_recall_only_on_rated_sample(self):
        ratings = [
            judgement("AR-0000000000000001", "postworthy"),
            judgement("AR-0000000000000002", "postworthy"),
            judgement("AR-0000000000000003", "not_postworthy"),
            judgement("AR-0000000000000004", "not_postworthy"),
        ]
        by_id = {
            ratings[0]["id"]: {"ai_selected": True, "headline": "one"},
            ratings[1]["id"]: {"ai_selected": False, "headline": "two"},
            ratings[2]["id"]: {"ai_selected": True, "headline": "three"},
            ratings[3]["id"]: {"ai_selected": False, "headline": "four"},
        }
        actual = review_feedback.evaluate_feedback(ratings, by_id)
        self.assertEqual(0.5, actual["ai_shadow_on_rated_sample"]["precision"])
        self.assertEqual(0.5, actual["ai_shadow_on_rated_sample"]["recall"])
        self.assertEqual(1, actual["ai_shadow_on_rated_sample"]["true_negative"])

    def test_unavailable_epaper_ai_comparison_is_not_counted_as_false_negative(self):
        rows = [judgement()]
        by_id = {rows[0]["id"]: {"ai_selected": None}}
        result = review_feedback.evaluate_feedback(rows, by_id)
        self.assertEqual(0, result["counts"]["comparable_with_daily_shadow_selection"])
        self.assertEqual([], result["missed_user_postworthy_examples"])

    def test_feedback_rejects_unknown_ids_and_wrong_format(self):
        payload = {"schema_version": 1, "type":"editorial-review-feedback"}
        with self.assertRaises(ValueError):
            review_feedback.validate_feedback({**payload, "ratings":[judgement("bad id")]})
        with self.assertRaises(ValueError):
            review_feedback.validate_feedback({**payload, "ratings": "not a list"})
        with self.assertRaises(ValueError):
            review_feedback.validate_feedback({**payload, "type":"other", "ratings":[]})

    def test_reading_review_feeds_prefers_daily_ai_comparison(self):
        with tempfile.TemporaryDirectory() as dirname:
            root = Path(dirname)
            (root / "epaper").mkdir()
            record = {"id":"AR-0123456789ABCDEF","headline":"Die EU schafft 800 Gesetze pro Jahr","source":"NZZ", "ai_selected":True}
            (root / "2026-11-09.json").write_text(
                json.dumps({"date":"2026-11-09", "articles":[record]}), encoding="utf-8")
            (root / "epaper/2026-11-09-nzz.json").write_text(
                json.dumps({"date":"2026-11-09", "articles":[{**record, "ai_selected":None}]}), encoding="utf-8")
            result = review_feedback.read_review_feeds(root)
            self.assertTrue(result[record["id"]]["ai_selected"])


if __name__ == "__main__":
    unittest.main()
