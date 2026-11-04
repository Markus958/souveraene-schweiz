from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from gmail_trace import build_gmail_trace, finalise_gmail_trace  # noqa: E402


def finding(url: str, channel: str, fingerprint: str, title: str | None = None) -> dict:
    return {
        "source_id": "publisher", "source_name": "Publisher", "source_class": "B", "priority": "M1",
        "title": title or "Bundesrat entscheidet über ein wichtiges Schweizer Energievorhaben",
        "url": url, "canonical_url": url, "fingerprint": fingerprint,
        "topics": ["energie", "schweizer-politik"], "fetched_at": "2026-11-04T10:00:00+00:00",
        "discovered_at": "2026-11-04T10:00:00+00:00",
        "discovery_channels": [{"id": channel}],
        "original_source": {"id": "publisher", "name": "Publisher"},
    }


class GmailTraceTests(unittest.TestCase):
    def test_complete_trace_from_channel_to_final_report(self) -> None:
        url = "https://publisher.example/article"
        gmail = finding(url, "gmail-newsletters", "g")
        rss = finding(url, "rss", "r")
        event = {"event_id": "EV-1", "score": 10, "sources": [gmail]}
        trace, counters = build_gmail_trace([gmail, rss], [gmail], [event], [event], [])
        self.assertEqual(counters["cross_channel_duplicate_hints"], 1)
        self.assertEqual(counters["baseline_new_article_hints"], 1)
        self.assertTrue(trace[0]["event_clustered"])
        final = finalise_gmail_trace(trace, [{"event_id": "EV-1"}], [{"event_id": "EV-1"}])
        self.assertEqual(final["final_selected_article_hints"], 1)
        self.assertEqual(trace[0]["final_outcome"], "selected")

    def test_known_newsletter_article_is_not_new_again(self) -> None:
        gmail = finding("https://publisher.example/known", "gmail-newsletters", "known")
        trace, counters = build_gmail_trace([gmail], [], [], [], [])
        self.assertEqual(counters["already_known_article_hints"], 1)
        self.assertEqual(trace[0]["baseline_status"], "already_known")

    def test_new_article_from_known_publisher_remains_new(self) -> None:
        old = finding("https://publisher.example/old", "gmail-newsletters", "old")
        new = finding("https://publisher.example/new", "gmail-newsletters", "new")
        trace, counters = build_gmail_trace([old, new], [new], [], [], [])
        self.assertEqual(counters["baseline_new_article_hints"], 1)
        statuses = {record["canonical_url"]: record["baseline_status"] for record in trace}
        self.assertEqual(statuses[new["url"]], "new")
        self.assertEqual(statuses[old["url"]], "already_known")

    def test_preselected_item_excluded_by_freshness_is_explicit(self) -> None:
        gmail = finding("https://publisher.example/old", "gmail-newsletters", "g")
        event = {"event_id": "EV-OLD", "score": 9, "sources": [gmail]}
        trace, _ = build_gmail_trace([gmail], [gmail], [event], [event], [])
        counts = finalise_gmail_trace(trace, [], [])
        self.assertEqual(counts["freshness_excluded_article_hints"], 1)
        self.assertEqual(trace[0]["final_outcome"], "excluded_freshness_or_unknown_date")


if __name__ == "__main__":
    unittest.main()
