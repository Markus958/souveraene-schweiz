from __future__ import annotations

import base64
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import fetch  # noqa: E402
import eventize  # noqa: E402
from gmail_newsletter import collect, extract_articles, load_state, message_to_findings, save_state, write_feed  # noqa: E402


def encoded(value: str) -> str:
    return base64.urlsafe_b64encode(value.encode()).decode().rstrip("=")


class GmailNewsletterParsingTests(unittest.TestCase):
    def test_html_extracts_articles_and_rejects_footer_links(self) -> None:
        markup = """
        <a href="https://tracker.example/click?url=https%3A%2F%2Fnews.example%2Fpolitik%2Fpaket">
          Bundesrat präsentiert neue Eckwerte zum EU-Paket
        </a>
        <a href="https://newsletter.example/unsubscribe">Newsletter abmelden</a>
        """
        articles = extract_articles([], [markup])
        self.assertEqual(len(articles), 1)
        self.assertEqual(articles[0].url, "https://news.example/politik/paket")

    def test_plain_text_uses_preceding_headline(self) -> None:
        text = "Neue Zahlen zeigen steigende Belastung der Bundeskasse\nhttps://news.example/bund/finanzen\n"
        articles = extract_articles([text], [])
        self.assertEqual([(a.title, a.url) for a in articles], [
            ("Neue Zahlen zeigen steigende Belastung der Bundeskasse", "https://news.example/bund/finanzen")
        ])

    def test_multipart_message_contains_no_mail_body_or_sender(self) -> None:
        message = {
            "id": "gmail-secret-id",
            "internalDate": "1793782800000",
            "payload": {
                "mimeType": "multipart/alternative",
                "headers": [
                    {"name": "Subject", "value": "Tagesnewsletter"},
                    {"name": "From", "value": "Person <person@example.com>"},
                ],
                "parts": [
                    {"mimeType": "text/plain", "body": {"data": encoded("Ein politischer Artikel mit klarer Schweizer Relevanz\nhttps://news.example/a")}},
                    {"mimeType": "text/html", "body": {"data": encoded('<a href="https://news.example/b">Ein zweiter ausführlicher Artikel zur Schweizer Politik</a>')}},
                ],
            },
        }
        findings = message_to_findings(message, fetched_at="2026-11-04T00:00:00+00:00")
        self.assertEqual(len(findings), 2)
        serialised = json.dumps(findings)
        self.assertNotIn("gmail-secret-id", serialised)
        self.assertNotIn("person@example.com", serialised)
        self.assertTrue(all(item["source_class"] == "C" for item in findings))
        self.assertTrue(all(item["source_role"] == "newsletter_lead" for item in findings))

    def test_multiple_articles_keep_original_sources_and_gmail_as_discovery(self) -> None:
        message = {
            "id": "m-source", "internalDate": "1793782800000",
            "payload": {"mimeType": "text/html", "headers": [{"name": "Date", "value": "Tue, 3 Nov 2026 18:00:00 +0100"}], "body": {"data": encoded(
                '<a href="https://www.nzz.ch/schweiz/a?utm_source=mail">Ein ausreichend langer Artikel der Neuen Zürcher Zeitung</a>'
                '<a href="https://unknown.invalid/story">Ein ausreichend langer Artikel eines unbekannten Herausgebers</a>'
            )}},
        }
        registry = [{"id": "nzz", "name": "NZZ", "class": "B", "priority": "P1", "url": "https://www.nzz.ch/"}]
        findings = message_to_findings(message, fetched_at="2026-11-04T10:00:00+00:00", source_registry=registry)
        self.assertEqual(len(findings), 2)
        self.assertEqual(findings[0]["original_source"]["name"], "NZZ")
        self.assertEqual(findings[0]["source_name"], "NZZ")
        self.assertEqual(findings[0]["discovery_channel"]["id"], "gmail-newsletters")
        self.assertEqual(findings[1]["original_source"]["name"], "Unbekannt")
        self.assertFalse(findings[1]["original_source"]["reliably_identified"])

    def test_old_newsletter_date_is_not_article_publication_date(self) -> None:
        message = {
            "id": "m-old", "internalDate": "1793782800000",
            "payload": {"mimeType": "text/plain", "headers": [{"name": "Date", "value": "Wed, 7 Oct 2026 08:00:00 +0200"}],
                        "body": {"data": encoded("Ein alter Artikel in einem verspäteten Newsletter\nhttps://news.example/old")}},
        }
        finding = message_to_findings(message, fetched_at="2026-11-04T10:00:00+00:00")[0]
        self.assertIsNone(finding["published_at"])
        self.assertEqual(finding["publication_date_status"], "unknown")
        self.assertTrue(finding["newsletter_sent_at"].startswith("2026-10-07"))

    def test_state_is_private_and_bounded(self) -> None:
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temp:
            path = Path(temp) / "state.json"
            save_state(path, {"history_id": "42", "processed_message_ids": [str(i) for i in range(5010)]})
            state = load_state(path)
            self.assertEqual(state["history_id"], "42")
            self.assertEqual(len(state["processed_message_ids"]), 5000)


class _Request:
    def __init__(self, value):
        self.value = value

    def execute(self):
        return self.value


class _Messages:
    def __init__(self, messages):
        self.messages = messages

    def list(self, **_kwargs):
        return _Request({"messages": [{"id": key} for key in self.messages]})

    def list_next(self, _request, _response):
        return None

    def get(self, **kwargs):
        return _Request(self.messages[kwargs["id"]])


class _History:
    def list(self, **_kwargs):
        return _Request({"historyId": "102", "history": [{"messagesAdded": [{"message": {"id": "m2"}}]}]})

    def list_next(self, _request, _response):
        return None


class _Users:
    def __init__(self, messages):
        self._messages = _Messages(messages)
        self._history = _History()

    def messages(self):
        return self._messages

    def history(self):
        return self._history

    def getProfile(self, **_kwargs):
        return _Request({"historyId": "103"})


class _Service:
    def __init__(self, messages):
        self._users = _Users(messages)

    def users(self):
        return self._users


class GmailIncrementalTests(unittest.TestCase):
    def setUp(self) -> None:
        self.messages = {
            "m1": {"id": "m1", "payload": {"mimeType": "text/plain", "body": {"data": encoded("Ein ausreichend langer erster Artikelname\nhttps://news.example/one")}}},
            "m2": {"id": "m2", "payload": {"mimeType": "text/plain", "body": {"data": encoded("Ein ausreichend langer zweiter Artikelname\nhttps://news.example/two")}}},
        }

    def test_initial_fetch_then_history_fetch_without_reprocessing(self) -> None:
        findings, state = collect(_Service(self.messages), {"schema_version": 1, "history_id": None, "processed_message_ids": []})
        self.assertEqual(len(findings), 2)
        self.assertEqual(state["history_id"], "103")
        second, state2 = collect(_Service(self.messages), state)
        self.assertEqual(second, [])
        self.assertEqual(state2["history_id"], "103")


class MonitorFeedTests(unittest.TestCase):
    def test_gmail_source_is_opt_in(self) -> None:
        source = {"enabled": False, "enabled_env": "GMAIL_SOURCE_ENABLED"}
        with patch.dict("os.environ", {}, clear=True):
            self.assertFalse(fetch.source_enabled(source))
        with patch.dict("os.environ", {"GMAIL_SOURCE_ENABLED": "true"}, clear=True):
            self.assertTrue(fetch.source_enabled(source))

    def test_sanitised_feed_maps_to_existing_finding_model(self) -> None:
        payload = json.dumps({
            "schema_version": 1,
            "findings": [{
                "title": "Neue Schweizer Vorlage mit erheblichen finanziellen Folgen",
                "url": "https://original.example/article",
                "published_at": "2026-11-04T08:00:00Z",
                "newsletter_message_hash": "abcdef",
            }],
        }).encode()
        source = {
            "id": "gmail-newsletters", "name": "Gmail Newsletter", "class": "C", "priority": "P2",
            "topics": [], "url": "https://raspberry.example/gmail-feed", "method": "gmail_feed",
        }
        with patch.dict("os.environ", {"GMAIL_FEED_API_KEY": "test-key", "GMAIL_FEED_URL": source["url"]}), \
             patch.object(fetch, "_request", return_value=(payload, source["url"], 200, "application/json")):
            findings, _url, status, diagnostics = fetch._fetch_gmail_feed_findings(source, 10)
        self.assertEqual(status, 200)
        self.assertEqual(findings[0]["source_class"], "C")
        self.assertEqual(findings[0]["source_role"], "newsletter_lead")
        self.assertNotIn("primary_source", findings[0])
        self.assertTrue(diagnostics["feed_stale"])

    def test_identical_gmail_and_rss_urls_merge_discovery_paths(self) -> None:
        common = "https://news.example/article"
        gmail = {
            "source_id": "publisher", "source_name": "Publisher", "source_class": "B", "priority": "P2",
            "title": "Bundesrat beschliesst eine neue Vorlage für die Schweiz", "url": common + "?utm_source=mail",
            "canonical_url": common, "fingerprint": "g", "topics": [],
            "discovery_channels": [{"id": "gmail-newsletters"}],
        }
        rss = dict(gmail, fingerprint="r", url=common, discovery_channels=[{"id": "rss"}])
        events = eventize.build_events([gmail, rss], [])
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["source_count"], 1)
        channels = events[0]["sources"][0]["discovery_channels"]
        self.assertEqual({item["id"] for item in channels}, {"gmail-newsletters", "rss"})

    def test_feed_write_counts_duplicates_and_new_articles(self) -> None:
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as temp:
            path = Path(temp) / "feed.json"
            findings = [
                {"title": "A", "url": "https://example.org/a?utm_source=x", "canonical_url": "https://example.org/a", "fetched_at": "2026-11-04T10:00:00+00:00", "fingerprint": "1", "discovery_channels": [{"id": "gmail-newsletters", "newsletter_message_hash": "1"}]},
                {"title": "A again", "url": "https://example.org/a", "canonical_url": "https://example.org/a", "fetched_at": "2026-11-04T10:01:00+00:00", "fingerprint": "2", "discovery_channels": [{"id": "gmail-newsletters", "newsletter_message_hash": "2"}]},
            ]
            metrics = write_feed(path, findings, messages_processed=1)
            payload = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(len(payload["findings"]), 1)
            self.assertEqual(metrics["duplicates"], 1)
            self.assertEqual(metrics["additional_unknown_articles"], 1)
            self.assertEqual(payload["diagnostics"]["messages_processed"], 1)

    def test_recent_and_stale_feed_are_distinguished(self) -> None:
        base = {"schema_version": 2, "findings": [], "diagnostics": {"messages_processed": 0}}
        source = {"id": "gmail-newsletters", "name": "Gmail Newsletter", "class": "C", "priority": "P2", "topics": [], "url": "https://feed.example/gmail-feed", "method": "gmail_feed"}
        recent = dict(base, generated_at="2099-01-01T00:00:00+00:00", last_successful_gmail_fetch_at="2099-01-01T00:00:00+00:00")
        stale = dict(base, generated_at="2020-01-01T00:00:00+00:00", last_successful_gmail_fetch_at="2020-01-01T00:00:00+00:00")
        with patch.dict("os.environ", {"GMAIL_FEED_API_KEY": "x", "GMAIL_FEED_URL": source["url"]}), patch.object(fetch, "_request", return_value=(json.dumps(recent).encode(), source["url"], 200, "application/json")):
            self.assertFalse(fetch._fetch_gmail_feed_findings(source, 10)[3]["feed_stale"])
        with patch.dict("os.environ", {"GMAIL_FEED_API_KEY": "x", "GMAIL_FEED_URL": source["url"]}), patch.object(fetch, "_request", return_value=(json.dumps(stale).encode(), source["url"], 200, "application/json")):
            self.assertTrue(fetch._fetch_gmail_feed_findings(source, 10)[3]["feed_stale"])

    def test_failed_collector_is_visible_despite_reachable_feed_endpoint(self) -> None:
        payload = {
            "schema_version": 2,
            "generated_at": "2020-01-01T00:00:00+00:00",
            "last_successful_gmail_fetch_at": "2020-01-01T00:00:00+00:00",
            "diagnostics": {"messages_processed": 0},
            "findings": [],
        }
        source = {
            "id": "gmail-newsletters", "name": "Gmail Newsletter", "class": "C", "priority": "P2",
            "topics": [], "url": "https://feed.example/gmail-feed", "method": "gmail_feed",
        }
        with patch.dict("os.environ", {"GMAIL_FEED_API_KEY": "x", "GMAIL_FEED_URL": source["url"]}), \
             patch.object(fetch, "_request", return_value=(json.dumps(payload).encode(), source["url"], 200, "application/json")):
            result = fetch.fetch_source(source)
        self.assertEqual(result["http_status"], 200)
        self.assertEqual(result["status"], "stale_feed")
        self.assertTrue(result["diagnostics"]["feed_stale"])
        self.assertIn("stale", result["error"])


if __name__ == "__main__":
    unittest.main()
