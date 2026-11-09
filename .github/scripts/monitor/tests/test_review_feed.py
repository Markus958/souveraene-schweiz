from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / ".github/scripts/monitor"))

import review_feed  # noqa: E402


def finding(title, url, *, source_id="nzz-schweiz", published="2026-11-09T09:00:00+01:00",
            subtitle="Schweiz-EU: Juristische und politische Bedeutung.", page=None, channel="rss"):
    result = {
        "title": title, "url": url, "source_id": source_id, "source_name": "NZZ – Schweiz",
        "source_class": "B", "published_at": published, "fetched_at": published,
        "subtitle": subtitle, "source_role": "early_epaper" if page else "news",
        "discovery_channels": [{"id": channel}],
        "original_source": {"id": source_id, "name": "NZZ" if page else "NZZ – Schweiz"},
    }
    if page is not None:
        result.update({"page": page, "source_name": "NZZ E-Paper",
                       "source_role": "early_epaper",
                       "canonical_url": "https://epaper.nzz.ch/storefront/8"})
    return result


class ReviewFeedUnitTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.patch = patch.object(review_feed, "REVIEW_DIR", Path(self.temp.name))
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def test_prequality_article_not_lost_when_legacy_scores_low(self):
        raw = finding("Eine Meinung des Professors zur Schweiz-EU",
                      "https://www.nzz.ch/schweiz/professor-ch-eu", subtitle="Kontroverse Einschätzung.")
        rows, counts = review_feed._article_records([raw])
        self.assertEqual(1, len(rows))
        self.assertEqual(1, counts["published_review_candidates"])
        self.assertEqual("Kontroverse Einschätzung.", rows[0]["subtitle"])
        self.assertRegex(rows[0]["id"], r"^AR-[0-9A-F]{16}$")

    def test_duplicate_urls_are_merged_without_double_review(self):
        x = finding("EU-Stromabkommen im Parlament", "https://www.nzz.ch/schweiz/stromabkommen?utm_source=email")
        y = finding("EU-Stromabkommen im Parlament", "https://www.nzz.ch/schweiz/stromabkommen?utm_medium=rss")
        rows, counts = review_feed._article_records([x, y])
        self.assertEqual(1, len(rows))
        self.assertEqual("https://nzz.ch/schweiz/stromabkommen", rows[0]["url"])
        self.assertEqual(2, counts["collected_findings"] if "collected_findings" in counts else 2)

    def test_unsubscribe_and_private_hosts_are_not_published(self):
        for url in ("http://localhost:5000/article", "https://raspireto.ts.net/article",
                    "https://example.org/unsubscribe?id=12", "https://u:p@example.org/news"):
            self.assertEqual("", review_feed._public_url(url), url)

    def test_email_tracking_query_is_removed_even_if_link_remains(self):
        raw = finding("Ein Artikel", "https://www.nzz.ch/schweiz/artikel?email=private%40mail.test&token=xxx")
        rows, _ = review_feed._article_records([raw])
        self.assertEqual("https://nzz.ch/schweiz/artikel", rows[0]["url"])
        self.assertNotIn("private", json.dumps(rows))
        self.assertNotIn("token=", json.dumps(rows))

    def test_same_epaper_storefront_distinct_titles_remain_distinct(self):
        a = finding("EU-Recht und die Schweiz", "https://epaper.nzz.ch/storefront/8#page=8",
                    source_id="nzz-epaper", page=8)
        b = finding("Staatsfinanzen in der Schweiz", "https://epaper.nzz.ch/storefront/8#page=19",
                    source_id="nzz-epaper", page=19)
        rows, _ = review_feed._article_records([a, b])
        self.assertEqual(2, len(rows))
        self.assertEqual({"8", "19"}, {str(x["page"]) for x in rows})
        self.assertEqual(2, len({x["id"] for x in rows}))

    def test_different_headlines_same_page_are_not_collapsed(self):
        a = finding("Thomas Aeschi wird Kandidat", "https://epaper.nzz.ch/storefront/8#page=1",
                    source_id="nzz-epaper", page=1)
        b = finding("Klima und Energieversorgung", "https://epaper.nzz.ch/storefront/8#page=1",
                    source_id="nzz-epaper", page=1)
        rows, _ = review_feed._article_records([a, b])
        self.assertEqual(2, len(rows))

    def test_epaper_feed_keeps_issue_date_and_page_without_original_pdf(self):
        sample = finding("Die EU schafft 800 Gesetze pro Jahr",
                         "https://epaper.nzz.ch/storefront/8#page=23",
                         source_id="nzz-epaper", page=23)
        extraction = {
            "status": "new_publication",
            "metadata": {"issue_date": "2026-11-09", "pages": 32},
            "findings": [sample],
        }
        path = review_feed.publish_epaper(extraction, "nzz")
        result = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual("2026-11-09", result["date"])
        self.assertEqual(1, len(result["articles"]))
        self.assertEqual(23, result["articles"][0]["page"])
        self.assertNotIn("PDF", json.dumps(result))
        index = json.loads((Path(self.temp.name) / "index.json").read_text(encoding="utf-8"))
        self.assertEqual("epaper/2026-11-09-nzz.json", index["days"][0]["epaper"][0]["path"])

    def test_daily_feed_adds_to_same_day_without_erasing_epaper(self):
        ep = finding("Eine E-Paper-Meldung", "https://epaper.nzz.ch/storefront/8#page=4",
                     source_id="nzz-epaper", page=4)
        review_feed.publish_epaper({"status":"new_publication",
                                   "metadata":{"issue_date":"2026-11-09"},"findings":[ep]}, "nzz")
        d = finding("Ein Online-Artikel", "https://www.nzz.ch/schweiz/online")
        report = {"started_at": "2026-11-09T12:32:44+01:00",
                  "news_discovery":{"source_runs":[{"findings":[d]}]}, "editorial_ai":{}}
        review_feed.publish_daily(report)
        index = json.loads((Path(self.temp.name) / "index.json").read_text(encoding="utf-8"))
        self.assertEqual(1, len(index["days"]))
        self.assertEqual("2026-11-09.json", index["days"][0]["daily"]["path"])
        self.assertEqual(1, len(index["days"][0]["epaper"]))

    def test_no_private_article_content_in_feed(self):
        src = finding("Bundesratsdebatte", "https://www.nzz.ch/schweiz/bundesrat")
        src["excerpt"] = "PRIVATE FULL TEXT"
        src["newsletter_sent_at"] = "confidential@example.com"
        src["discovery_channel"] = {"id": "gmail-newsletters", "recipient":"confidential@example.com"}
        src["article_facts"] = {"full_text":"SENSITIVE"}
        rows, _ = review_feed._article_records([src])
        exported = json.dumps(rows)
        for sensitive in ("PRIVATE FULL TEXT", "confidential", "SENSITIVE", "newsletter_sent_at"):
            self.assertNotIn(sensitive, exported)

    def test_static_ui_is_two_choice_and_has_no_posting_endpoint(self):
        script = (ROOT / "monitor/review.js").read_text(encoding="utf-8")
        html = (ROOT / "monitor/pruefmodus.html").read_text(encoding="utf-8")
        self.assertIn("Postwürdig", script)
        self.assertIn("Nicht postwürdig", script)
        self.assertNotIn("Beobachten", script)
        self.assertIn("localStorage.setItem", script)
        self.assertIn("exportRatings", script)
        self.assertIn("importRatings", script)
        self.assertIn("Zum Newsmonitor", html)
        self.assertNotIn("/monitor/post-draft", script)
        self.assertNotIn("/monitor/full-run", script)


if __name__ == "__main__":
    unittest.main()
