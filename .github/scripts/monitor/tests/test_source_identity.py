from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import archive  # noqa: E402
import eventize  # noqa: E402
import fetch  # noqa: E402
from source_identity import apply_source_model, merge_same_article, resolve_original_source  # noqa: E402
from url_identity import canonical_url  # noqa: E402


REGISTRY = [
    {"id": "ch-bfe", "name": "BFE", "class": "A", "priority": "P1", "url": "https://www.bfe.admin.ch/de/medienmitteilungen", "method": "html"},
    {"id": "ch-seco", "name": "SECO", "class": "A", "priority": "P1", "url": "https://www.seco.admin.ch/de/news", "method": "html"},
    {"id": "nzz", "name": "NZZ", "class": "B", "priority": "M1", "url": "https://www.nzz.ch/schweiz.rss", "method": "rss"},
    {"id": "srf", "name": "SRF", "class": "C", "priority": "M2", "url": "https://www.srf.ch/news/rss", "method": "rss"},
]


class SourceResolverTests(unittest.TestCase):
    def test_same_parent_domain_distinguishes_federal_offices(self) -> None:
        bfe = resolve_original_source("https://www.bfe.admin.ch/de/neue-regel", None, REGISTRY)
        seco = resolve_original_source("https://www.seco.admin.ch/de/neue-regel", None, REGISTRY)
        self.assertEqual(bfe["id"], "ch-bfe")
        self.assertEqual(seco["id"], "ch-seco")

    def test_shared_admin_domain_without_publisher_stays_unknown(self) -> None:
        result = resolve_original_source("https://www.admin.ch/de/newnsb/example", REGISTRY[0], REGISTRY)
        self.assertEqual(result["id"], "unknown")
        self.assertEqual(result["source_confidence"]["basis"], "shared_federal_newnsb_without_publisher")

    def test_structured_publisher_resolves_shared_admin_domain(self) -> None:
        result = resolve_original_source(
            "https://www.admin.ch/de/newnsb/example", REGISTRY[0], REGISTRY,
            publisher="Bundesamt für Energie BFE",
        )
        self.assertEqual(result["id"], "ch-bfe")
        self.assertEqual(result["source_confidence"]["level"], "verified")

    def test_tracking_url_has_stable_original_url(self) -> None:
        value = canonical_url("https://www.nzz.ch/schweiz/a/?utm_source=mail&fbclid=x#part")
        self.assertEqual(value, "https://nzz.ch/schweiz/a")

    def test_federal_newnsb_mirrors_share_one_canonical_identity(self) -> None:
        generic = canonical_url("https://www.admin.ch/de/newnsb/ABC123")
        office = canonical_url("https://www.bsv.admin.ch/de/newnsb/ABC123?utm_source=mail")
        self.assertEqual(generic, "https://admin.ch/de/newnsb/ABC123")
        self.assertEqual(office, generic)
        resolved = resolve_original_source("https://www.bsv.admin.ch/de/newnsb/ABC123", REGISTRY[0], REGISTRY)
        self.assertEqual(resolved["id"], "unknown")

    def test_unknown_publisher_is_not_invented(self) -> None:
        result = resolve_original_source("https://unlisted.example/article", None, REGISTRY)
        self.assertEqual(result["name"], "Unbekannt")
        self.assertFalse(result["reliably_identified"])

    def test_federal_explanation_is_not_independent_treaty_factcheck(self) -> None:
        registry = [
            *REGISTRY,
            {"id": "ch-bund-news", "name": "Bundesrat / News Service Bund", "class": "A", "priority": "P1", "url": "https://www.newsd.admin.ch/v1/search", "method": "nsb_search"},
        ]
        result = resolve_original_source(
            "https://www.admin.ch/de/newnsb/example", registry[-1], registry,
            publisher="Bundesrat / News Service Bund",
        )
        self.assertFalse(result["source_usage"]["independent_factcheck_eligible"])
        self.assertEqual(result["source_type"], "amtliche_mitteilung")

    def test_discovery_and_publication_dates_remain_independent(self) -> None:
        finding = {
            "source_id": "nzz", "source_name": "NZZ", "source_class": "B", "priority": "M1",
            "title": "Artikel", "url": "https://www.nzz.ch/schweiz/a", "fetched_at": "2026-11-04T10:00:00+00:00",
            "published_at": "2026-11-03T07:00:00+00:00",
        }
        result = apply_source_model(finding, REGISTRY[2], REGISTRY)
        self.assertEqual(result["discovered_at"], "2026-11-04T10:00:00+00:00")
        self.assertEqual(result["published_at"], "2026-11-03T07:00:00+00:00")


class CrossChannelTests(unittest.TestCase):
    def test_gmail_and_rss_same_article_merge_without_quality_inflation(self) -> None:
        common = {
            "source_id": "nzz", "source_name": "NZZ", "source_class": "B", "priority": "M1",
            "title": "Bundesrat entscheidet über ein wichtiges Schweizer Energievorhaben",
            "url": "https://nzz.ch/schweiz/a", "canonical_url": "https://nzz.ch/schweiz/a",
            "topics": ["energie", "schweizer-politik"], "fingerprint": "x",
            "original_source": {"id": "nzz", "name": "NZZ"},
            "source_confidence": {"score": 90},
        }
        gmail = dict(common, discovery_channels=[{"id": "gmail-newsletters"}], discovered_at="2026-11-04T09:00:00+00:00")
        rss = dict(common, fingerprint="y", discovery_channels=[{"id": "rss"}], discovered_at="2026-11-04T08:00:00+00:00", published_at="2026-11-04T07:00:00+00:00")
        events = eventize.build_events([gmail, rss], [])
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["source_count"], 1)
        source = events[0]["sources"][0]
        self.assertEqual({channel["id"] for channel in source["discovery_channels"]}, {"gmail-newsletters", "rss"})
        self.assertEqual(source["published_at"], "2026-11-04T07:00:00+00:00")
        self.assertEqual(source["discovered_at"], "2026-11-04T08:00:00+00:00")

    def test_federal_api_website_and_gmail_mirrors_merge_as_one_article(self) -> None:
        base = {
            "source_id": "unknown", "source_name": "Unbekannt", "source_class": "A", "priority": "P1",
            "title": "IV-Integrationsreform stärkt die berufliche Integration in der Schweiz",
            "fingerprint": "x", "topics": ["schweizer-politik", "finanzen"],
        }
        api = dict(base, url="https://www.admin.ch/de/newnsb/ABC123", discovery_channels=[{"id": "api"}])
        website = dict(base, fingerprint="y", url="https://www.bsv.admin.ch/de/newnsb/ABC123", discovery_channels=[{"id": "website"}])
        gmail = dict(base, fingerprint="z", url="https://www.admin.ch/de/newnsb/ABC123?utm_source=mail", discovery_channels=[{"id": "gmail-newsletters"}])
        events = eventize.build_events([api, website, gmail], [])
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["source_count"], 1)
        channels = events[0]["sources"][0]["discovery_channels"]
        self.assertEqual({channel["id"] for channel in channels}, {"api", "website", "gmail-newsletters"})

    def test_independent_media_reports_remain_separate_sources_in_one_event(self) -> None:
        title = "Bundesrat entscheidet über ein wichtiges Schweizer Energievorhaben"
        one = {"source_id": "nzz", "source_name": "NZZ", "source_class": "B", "priority": "M1", "title": title, "url": "https://nzz.ch/a", "fingerprint": "1", "topics": ["energie"]}
        two = {"source_id": "srf", "source_name": "SRF", "source_class": "B", "priority": "M1", "title": title, "url": "https://srf.ch/b", "fingerprint": "2", "topics": ["energie"]}
        events = eventize.build_events([one, two], [])
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["source_count"], 2)

    def test_legacy_archive_source_remains_readable(self) -> None:
        legacy = {"source_id": "legacy", "source_name": "Legacy", "url": "https://example.org/a"}
        view = archive._source_view(legacy)
        self.assertEqual(view["name"], "Legacy")
        self.assertEqual(view["original_url"], "https://example.org/a")

    def test_higher_confidence_source_wins_without_losing_channels(self) -> None:
        low = {"source_id": "unknown", "source_name": "Unbekannt", "source_confidence": {"score": 0}, "discovery_channels": [{"id": "gmail-newsletters"}]}
        high = {"source_id": "ch-bfe", "source_name": "BFE", "source_confidence": {"score": 100}, "discovery_channels": [{"id": "api"}]}
        result = merge_same_article(low, high)
        self.assertEqual(result["source_id"], "ch-bfe")
        self.assertEqual({item["id"] for item in result["discovery_channels"]}, {"gmail-newsletters", "api"})


if __name__ == "__main__":
    unittest.main()
