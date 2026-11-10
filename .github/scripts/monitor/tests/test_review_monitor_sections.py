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

import review_feed  # noqa: E402


DAY = "2026-11-10"


def example_report():
    return {
        "started_at": "2026-11-10T08:45:00+01:00",
        "news_discovery": {"source_runs": [
            {"source_id": "ch-bund-news", "source_name": "Bundesrat",
             "status": "new_publication", "findings": [{
                 "source_id": "ch-bund-news", "source_name": "Bundesrat",
                 "source_class": "A",
                 "title": "Relevante Mitteilung zur Schweiz",
                 "url": "https://www.admin.ch/de/neuigkeit?utm_medium=mail",
                 "published_at": "2026-11-10T08:00:00+01:00",
                 "discovery_channels": [{"id": "ch-bund-news"}],
             }]},
            {"source_id": "ch-parlament", "source_name": "Parlament",
             "status": "auth_failed", "findings": [], "error": "SECRET INTERNAL TOKEN"},
        ]},
        "procedure_watches": [
            {"id": "eu-ch-package", "title": "EU-Schweiz Paket – parlamentarisches Verfahren"}
        ],
        "procedure_monitoring": {"results": [
            {"watch_id": "eu-ch-package", "page": "oeil_interim", "status": "changed",
             "fingerprint": "aa111", "url": "https://oeil.europarl.europa.eu/oeil/en/procedure-file?reference=2025%2F0162R%28NLE%29&email=somebody%40example.com",
             "signal": {"expected_references_found": ["2025/0162R(NLE)"],
                        "known_documents_found": ["A10-0235/2026"],
                        "contexts": ["SECRET CONTEXT FROM PARLIAMENT API"]}},
            {"watch_id": "eu-ch-package", "page": "oeil_consent", "status": "unchanged",
             "fingerprint": "bb222", "url": "https://oeil.europarl.europa.eu/oeil/en/procedure-file?reference=2025%2F0162%28NLE%29",
             "signal": {"expected_references_found": ["2025/0162(NLE)"]}},
        ]},
        "risk_monitoring": {"results": [
            {"risk_id": "ubs", "topic": "UBS", "status": "changed",
             "change_recommended": "Ja", "news": ["FINMA fordert Änderung der UBS-Kapitalunterlegung"],
             "sources": [{"url": "https://www.finma.ch/de/news/kapital?recipient=secret",
                          "fingerprint": "f123", "title": "Offizielle Meldung"}],
             "new_items": 1, "source_check_complete": True},
            {"risk_id": "f35", "topic": "F-35 / Air2030", "status": "incomplete",
             "change_recommended": "Nein", "news": [],
             "sources": [], "new_items": 0, "source_check_complete": False,
             "failed_p1_sources": ["ch-vbs"]},
        ]},
        "editorial_ai": {},
    }


def sources():
    return [
        {"id": "ch-bund-news", "name": "Bundesrat", "enabled": True, "priority": "P1"},
        {"id": "ch-parlament", "name": "Parlament", "enabled": True, "priority": "P1"},
        {"id": "nzz-schweiz", "name": "NZZ – Schweiz", "enabled": True, "priority": "M1"},
        {"id": "reuters", "name": "Reuters", "enabled": False, "priority": "M2"},
    ]


def risks():
    return [
        {"id": "ubs", "title": "UBS", "pages": ["ubs.html"]},
        {"id": "f35", "title": "F-35 / Air2030", "pages": ["f35.html"]},
    ]


class ReviewProcedureRiskSourceTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.root = Path(self.tempdir.name)
        for target, value in [
            ("REVIEW_DIR", self.root),
            ("load_sources", lambda: sources()),
            ("load_risks", lambda: risks()),
        ]:
            mock = patch.object(review_feed, target, value)
            mock.start()
            self.addCleanup(mock.stop)

    def test_daily_review_adds_two_procedures_and_two_risks_but_preserves_raw(self):
        original = example_report()
        copy_before = copy.deepcopy(original)
        path = review_feed.publish_daily(original)
        self.assertEqual(original, copy_before)
        data = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(1, len(data["articles"]))
        self.assertEqual(2, len(data["procedures"]))
        self.assertEqual(2, len(data["risks"]))
        self.assertEqual("2026-11-10", data["date"])
        self.assertEqual("daily", data["kind"])
        self.assertTrue(all(x["id"].startswith("RV-EU-") for x in data["procedures"]))
        self.assertTrue(all(x["id"].startswith("RV-RISK-") for x in data["risks"]))

    def test_eu_procedure_keeps_reference_but_removes_email_tracking(self):
        rows = review_feed._procedure_records(example_report(), DAY)
        self.assertEqual(2, len(rows))
        url = next(x["url"] for x in rows if x["status"] == "changed")
        self.assertIn("?reference=2025%2F0162R%28NLE%29", url)
        self.assertNotIn("email=", url)
        self.assertIn("A10-0235/2026", rows[0]["subtitle"])

    def test_eu_description_never_exposes_raw_context_or_error(self):
        rows = review_feed._procedure_records(example_report(), DAY)
        dumped = json.dumps(rows, ensure_ascii=False)
        self.assertNotIn("SECRET CONTEXT", dumped)
        self.assertNotIn("somebody@", dumped)
        self.assertNotIn("error", dumped.lower())

    def test_procedure_revision_creates_new_identity_but_same_page_keeps_identity(self):
        raw = example_report()
        first = review_feed._procedure_records(raw, DAY)[0]["id"]
        second = review_feed._procedure_records(raw, DAY)[0]["id"]
        self.assertEqual(first, second)
        raw["procedure_monitoring"]["results"][0]["fingerprint"] = "different"
        self.assertNotEqual(first, review_feed._procedure_records(raw, DAY)[0]["id"])

    def test_risk_changed_is_separate_from_incomplete_source_status(self):
        rows = review_feed._risk_records(example_report(), DAY)
        ubs = next(x for x in rows if x["risk_id"] == "ubs")
        f35 = next(x for x in rows if x["risk_id"] == "f35")
        self.assertEqual("changed", ubs["status"])
        self.assertEqual("https://finma.ch/de/news/kapital", ubs["url"])
        self.assertIn("FINMA fordert Änderung", ubs["subtitle"])
        self.assertEqual("incomplete", f35["status"])
        self.assertFalse(f35["source_check_complete"])
        self.assertIn("Quellenprüfung unvollständig", f35["subtitle"])
        self.assertEqual("https://www.souveraene-schweiz.ch/f35.html", f35["url"])

    def test_risk_identification_changes_on_new_source_fingerprints(self):
        original = example_report()
        first = review_feed._risk_records(original, DAY)[0]["id"]
        original["risk_monitoring"]["results"][0]["sources"][0]["fingerprint"] = "another"
        changed = review_feed._risk_records(original, DAY)[0]["id"]
        self.assertNotEqual(first, changed)

    def test_source_audit_distinguishes_success_failure_missing_disabled(self):
        source_rows = [{"source_ids": ["ch-bund-news"]}]
        audit = review_feed._source_overview(example_report(), source_rows)
        by_id = {x["id"]: x for x in audit["sources"]}
        self.assertEqual("new_publication", by_id["ch-bund-news"]["status"])
        self.assertEqual(1, by_id["ch-bund-news"]["raw_findings"])
        self.assertEqual(1, by_id["ch-bund-news"]["review_entries"])
        self.assertEqual("auth_failed", by_id["ch-parlament"]["status"])
        self.assertEqual("not_checked", by_id["nzz-schweiz"]["status"])
        self.assertEqual("disabled", by_id["reuters"]["status"])
        summary = audit["summary"]
        self.assertEqual(3, summary["enabled"])
        self.assertEqual(2, summary["checked"])
        self.assertEqual(1, summary["successful"])
        self.assertEqual(1, summary["failed"])
        self.assertEqual(2, summary["procedures_checked"])
        self.assertEqual(2, summary["risks_checked"])
        self.assertEqual(1, summary["risks_with_incomplete_sources"])

    def test_source_audit_contains_no_raw_error_or_private_credentials(self):
        audit = review_feed._source_overview(example_report(), [])
        text = json.dumps(audit)
        self.assertNotIn("SECRET INTERNAL TOKEN", text)
        self.assertNotIn("recipient=", text)

    def test_same_day_review_index_maintains_epaper_and_daily(self):
        sample = example_report()
        review_feed.publish_daily(sample)
        idx = json.loads((self.root / "index.json").read_text(encoding="utf-8"))
        self.assertEqual("2026-11-10.json", idx["days"][0]["daily"]["path"])
        self.assertEqual(1, idx["days"][0]["daily"]["count"])
        path = self.root / "2026-11-10.json"
        rows = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(2, len(rows["procedures"]))
        self.assertEqual(2, len(rows["risks"]))

    def test_static_review_ui_has_separate_categories_and_preserves_binary_feedback(self):
        html = (ROOT / "monitor/pruefmodus.html").read_text(encoding="utf-8")
        js = (ROOT / "monitor/review.js").read_text(encoding="utf-8")
        for expected in ("typeFilter", "sourceAudit", "sourceAuditBody", "procedure", "risk"):
            self.assertIn(expected, html + js)
        self.assertIn("source_overview", js)
        self.assertIn("review_kind: 'procedure'", js)
        self.assertIn("review_kind: 'risk'", js)
        self.assertIn("VALUES = new Set(['postworthy', 'not_postworthy'])", js)
        self.assertNotIn("'observe'", js)
        self.assertIn("aria-pressed", js)


if __name__ == "__main__":
    unittest.main()
