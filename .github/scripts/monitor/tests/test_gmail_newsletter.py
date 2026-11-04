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
from gmail_newsletter import collect, extract_articles, load_state, message_to_findings, save_state  # noqa: E402


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
            findings, _url, status = fetch._fetch_gmail_feed_findings(source, 10)
        self.assertEqual(status, 200)
        self.assertEqual(findings[0]["source_class"], "C")
        self.assertEqual(findings[0]["source_role"], "newsletter_lead")
        self.assertNotIn("primary_source", findings[0])


if __name__ == "__main__":
    unittest.main()
