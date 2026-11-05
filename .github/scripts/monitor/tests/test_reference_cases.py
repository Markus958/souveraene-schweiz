from __future__ import annotations

import sys
import unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import archive  # noqa: E402
import eventize  # noqa: E402
import state  # noqa: E402
from selection_trace import build_selection_trace, finalise_selection_trace  # noqa: E402
from daily_trigger import should_dispatch  # noqa: E402


def finding(title: str, subtitle: str, url: str, source_id: str = "ch-bund-news") -> dict:
    return {
        "source_id": source_id,
        "source_name": "Amtliche Quelle",
        "source_class": "A",
        "priority": "P1",
        "title": title,
        "subtitle": subtitle,
        "url": url,
        "canonical_url": url,
        "fingerprint": url,
        "topics": ["schweizer-politik"],
        "discovery_channels": [{"id": "api"}],
        "discovered_at": "2026-11-05T05:00:00+00:00",
        "published_at": "2026-11-05T04:30:00+00:00",
    }


REFERENCE_FINDINGS = [
    finding(
        "Beschaffungsprüfung der Winterreserve",
        "220 Mio. Franken Sparpotenzial durch weniger Überdimensionierung der Stromreserve.",
        "https://admin.ch/de/newnsb/winterreserve",
        "ch-efk",
    ),
    finding(
        "Schweiz übernimmt EU-Label für Fahrzeuge",
        "Das bisherige Schweizer Fahrzeug-Label und die Energieetikette werden durch das EU-Label ersetzt.",
        "https://admin.ch/de/newnsb/fahrzeug-label",
        "ch-bfe",
    ),
    finding(
        "IV-Finanzierung: höhere Lohnbeiträge für Gutverdiener",
        "Die Invalidenversicherung soll über zusätzliche Versichertenbeiträge finanziert werden.",
        "https://admin.ch/de/newnsb/iv-finanzierung",
        "ch-bsv",
    ),
    finding(
        "Amaudruz fordert Kontingente und Asyl-Transitzonen",
        "Asylverfahren sollen in Transitzonen stattfinden; zusätzlich stehen Kontingente zur Diskussion.",
        "https://nzz.ch/schweiz/amaudruz-asyl",
        "nzz-schweiz",
    ),
    finding(
        "Pflegende Angehörige: strengere Regeln gegen Fehlanreize",
        "Die Regulierung soll das Kostenwachstum zulasten der OKP dämpfen.",
        "https://admin.ch/de/newnsb/pflegende-angehoerige",
        "ch-bag",
    ),
]


class ReferenceCaseScoringTests(unittest.TestCase):
    def test_all_five_reference_cases_are_strong_candidates(self) -> None:
        for item in REFERENCE_FINDINGS:
            with self.subTest(title=item["title"]):
                score, reasons = eventize.score_finding(item, [])
                self.assertGreaterEqual(score, 8, reasons)

    def test_low_signal_counterexamples_stay_excluded(self) -> None:
        weak = [
            finding("Neue Energieetikette im privaten Onlineshop", "Tipps für den Kauf eines Kühlschranks.", "https://example.test/shop", "example"),
            finding("Pflegende Angehörige treffen sich zum Quartierfest", "Ein lokaler Begegnungsnachmittag.", "https://example.test/fest", "example"),
            finding("Winterreserve im Vereinslager", "Materialkontrolle ohne politischen Bezug.", "https://example.test/verein", "example"),
        ]
        for item in weak:
            item["source_class"] = "D"
            item["priority"] = "M2"
            with self.subTest(title=item["title"]):
                score, _ = eventize.score_finding(item, [])
                self.assertLess(score, 5)

    def test_known_article_is_not_new_again(self) -> None:
        event = eventize.build_events([REFERENCE_FINDINGS[0]], [])[0]
        baseline = {
            "events": {
                event["event_id"]: {
                    "event_id": event["event_id"],
                    "current_title": event["title"],
                    "baseline_confirmed": True,
                    "sources": event["sources"],
                }
            }
        }
        classified = state.classify_events([event], baseline)
        self.assertEqual(classified[0]["status"], "Duplikat")

    def test_weak_nearest_match_does_not_pollute_unrelated_state_event(self) -> None:
        old_event = {
            "event_id": "EV-OLD",
            "current_title": "24 Opfer fordern Zwangsverwaltung von Crans-Montana",
            "baseline_confirmed": True,
            "sources": [],
        }
        baseline = {"events": {"EV-OLD": old_event}, "seen_fingerprints": [], "baseline_seen_fingerprints": []}
        new_event = eventize.build_events([REFERENCE_FINDINGS[4]], [])[0]
        classified = state.classify_events([new_event], baseline)
        self.assertEqual(classified[0]["status"], "Neu")
        self.assertLess(classified[0]["match_similarity"], 0.48)
        updated = state.update_news_state(
            baseline, [REFERENCE_FINDINGS[4]], classified,
            "2026-11-05T05:00:00+00:00", "2026-11-05T05:01:00+00:00", "complete",
        )
        self.assertIn(new_event["event_id"], updated["events"])
        self.assertEqual(updated["events"]["EV-OLD"]["current_title"], old_event["current_title"])

    def test_schema_migration_drops_only_demonstrably_polluted_cluster(self) -> None:
        legacy = {
            "schema_version": 2,
            "seen_fingerprints": ["old", "new"],
            "baseline_seen_fingerprints": ["old", "new"],
            "events": {
                "EV-POLLUTED": {
                    "sources": [],
                    "history": [
                        {"title": "Unrelated old title", "match_similarity": 0.0},
                        {"title": "Pflegende Angehörige", "match_similarity": 0.13},
                    ],
                },
                "EV-CLEAN": {
                    "sources": [],
                    "history": [
                        {"title": "IV-Reform", "match_similarity": 0.0},
                        {"title": "IV-Reform aktualisiert", "match_similarity": 0.75},
                    ],
                },
            },
        }
        migrated = state._migrate(legacy)
        self.assertNotIn("EV-POLLUTED", migrated["events"])
        self.assertIn("EV-CLEAN", migrated["events"])
        self.assertEqual(set(migrated["baseline_seen_fingerprints"]), {"old", "new"})

    def test_same_canonical_article_is_one_event(self) -> None:
        first = REFERENCE_FINDINGS[1]
        mirror = dict(first, source_id="gmail-newsletters", fingerprint="mail", discovery_channels=[{"id": "gmail-newsletters"}])
        events = eventize.build_events([first, mirror], [])
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["source_count"], 1)

    def test_top_ten_limit_is_preserved(self) -> None:
        events = []
        for index in range(12):
            events.append({"event_id": f"EV-{index}", "title": f"Fall {index}", "score": 12, "status": "Neu", "sources": []})
        self.assertEqual(len(eventize.select_top_events(events)), 10)


class TraceAndDateTests(unittest.TestCase):
    def test_event_date_uses_any_source_not_only_best_source(self) -> None:
        official = dict(REFERENCE_FINDINGS[0], published_at=None)
        media = dict(REFERENCE_FINDINGS[0], source_id="nzz-schweiz", source_class="B", priority="M1", published_at="2026-11-05T04:30:00+00:00")
        event = {"event_id": "EV-DATE", "title": official["title"], "status": "Neu", "score": 12, "sources": [official, media], "reasons": ["winterreserve"]}
        view = archive._event_view(event, datetime(2026, 11, 5, tzinfo=ZoneInfo("Europe/Zurich")))
        self.assertEqual(view["published_at"], "2026-11-05T04:30:00+00:00")

    def test_trace_explains_quality_and_top_ten_exclusions(self) -> None:
        events = [
            {"event_id": "EV-A", "title": "A", "score": 12, "status": "Neu", "sources": []},
            {"event_id": "EV-B", "title": "B", "score": 12, "status": "Neu", "sources": []},
        ]
        trace = build_selection_trace(events, events, events)
        pool = [
            {"event_id": "EV-A", "quality_qualified": False, "quality_score": 4.0},
            {"event_id": "EV-B", "quality_qualified": True, "quality_score": 8.0},
        ]
        counts = finalise_selection_trace(trace, [], pool)
        self.assertEqual(counts["excluded_quality"], 1)
        self.assertEqual(counts["qualified_outside_top_10"], 1)

    def test_raspberry_fallback_does_not_duplicate_successful_daily_run(self) -> None:
        cutoff = datetime.fromisoformat("2026-11-05T04:00:00+00:00")
        runs = [{"id": 42, "created_at": "2026-11-05T04:37:00Z", "status": "completed", "conclusion": "success"}]
        dispatch, _ = should_dispatch(runs, cutoff)
        self.assertFalse(dispatch)

    def test_raspberry_fallback_dispatches_when_schedules_are_late(self) -> None:
        cutoff = datetime.fromisoformat("2026-11-05T04:00:00+00:00")
        runs = [{"id": 41, "created_at": "2026-11-04T22:12:00Z", "status": "completed", "conclusion": "success"}]
        dispatch, _ = should_dispatch(runs, cutoff)
        self.assertTrue(dispatch)


if __name__ == "__main__":
    unittest.main()
