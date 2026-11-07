from __future__ import annotations

import sys
import unittest
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import archive  # noqa: E402
import archive_runs  # noqa: E402
import eventize  # noqa: E402
import state  # noqa: E402
import post_quality_guard  # noqa: E402
import audit_state_migration  # noqa: E402
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

    def test_schema_migration_splits_polluted_cluster_and_preserves_identities(self) -> None:
        legacy = {
            "schema_version": 2,
            "seen_fingerprints": ["old", "new", "incomplete"],
            "baseline_seen_fingerprints": ["old", "new"],
            "events": {
                "EV-POLLUTED": {
                    "sources": [
                        {"title": "Unrelated old title", "url": "https://example.ch/old", "fingerprint": "old", "source_role": "web"},
                        {"title": "Pflegende Angehörige", "url": "https://example.ch/care", "fingerprint": "new", "source_role": "web"},
                    ],
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
        self.assertIn("EV-POLLUTED", migrated["events"])
        self.assertIn("EV-CLEAN", migrated["events"])
        split_ids = [event_id for event_id in migrated["events"] if event_id.startswith("EV-POLLUTED-S")]
        self.assertEqual(1, len(split_ids))
        self.assertEqual(
            state.seen_canonical_urls(migrated),
            {"https://example.ch/old", "https://example.ch/care"},
        )
        self.assertEqual(set(migrated["seen_fingerprints"]), {"old", "new", "incomplete"})
        self.assertEqual(set(migrated["baseline_seen_fingerprints"]), {"old", "new"})

        # A different discovery fingerprint for the same canonical article must
        # still correlate with the retained source identity.
        repeated = eventize.build_events([dict(REFERENCE_FINDINGS[4], url="https://example.ch/care", canonical_url="https://example.ch/care", fingerprint="other-channel")], [])[0]
        classified = state.classify_events([repeated], migrated)
        self.assertNotEqual("Neu", classified[0]["status"])

    def test_migration_preserves_confirmed_schema2_baseline(self) -> None:
        legacy = {
            "schema_version": 2,
            "seen_fingerprints": ["complete", "incomplete-only"],
            "baseline_seen_fingerprints": ["complete"],
            "events": {
                "EV-COMPLETE": {"sources": [{"title": "Bestätigt", "url": "https://example.ch/complete", "fingerprint": "complete", "source_role": "web"}], "history": []},
                "EV-INCOMPLETE": {"sources": [{"title": "Nur beobachtet", "url": "https://example.ch/incomplete", "fingerprint": "incomplete-only", "source_role": "web"}], "history": []},
            },
        }
        migrated = state._migrate(legacy)
        self.assertEqual(["complete"], migrated["baseline_seen_fingerprints"])
        self.assertTrue(migrated["events"]["EV-COMPLETE"]["baseline_confirmed"])
        self.assertFalse(migrated["events"]["EV-INCOMPLETE"]["baseline_confirmed"])

    def test_migration_does_not_promote_epaper_preview(self) -> None:
        legacy = {
            "schema_version": 2,
            "seen_fingerprints": ["epaper-preview"],
            "baseline_seen_fingerprints": [],
            "events": {
                "EV-EPAPER": {
                    "current_title": "Vorabmeldung aus dem E-Paper",
                    "sources": [{"title": "Vorabmeldung aus dem E-Paper", "url": "https://nzz.example/preview", "fingerprint": "epaper-preview", "source_role": "early_epaper"}],
                    "history": [],
                },
            },
        }
        migrated = state._migrate(legacy)
        self.assertEqual([], migrated["baseline_seen_fingerprints"])
        self.assertFalse(migrated["events"]["EV-EPAPER"]["baseline_confirmed"])
        later = eventize.build_events([dict(REFERENCE_FINDINGS[3], url="https://nzz.example/preview", canonical_url="https://nzz.example/preview", fingerprint="web-later")], [])[0]
        classified = state.classify_events([later], migrated)
        self.assertEqual("Update", classified[0]["status"])

    def test_polluted_epaper_cluster_splits_shared_storefront_url_by_title(self) -> None:
        legacy = {
            "schema_version": 2,
            "seen_fingerprints": ["paper-a", "paper-b"],
            "baseline_seen_fingerprints": [],
            "events": {
                "EV-PAPER": {
                    "baseline_confirmed": True,
                    "sources": [
                        {"title": "AHV-Finanzierung", "url": "https://epaper.example/storefront/8", "fingerprint": "paper-a", "source_role": "early_epaper"},
                        {"title": "F-35-Kosten", "url": "https://epaper.example/storefront/8", "fingerprint": "paper-b", "source_role": "early_epaper"},
                    ],
                    "history": [
                        {"title": "AHV-Finanzierung", "match_similarity": 1.0},
                        {"title": "F-35-Kosten", "match_similarity": 0.0},
                    ],
                }
            },
        }
        migrated = state._migrate(legacy)
        self.assertEqual(2, len(migrated["events"]))
        self.assertTrue(all(len(event["sources"]) == 1 for event in migrated["events"].values()))
        self.assertTrue(all(not event["baseline_confirmed"] for event in migrated["events"].values()))

    def test_complete_and_incomplete_runs_advance_only_the_confirmed_baseline(self) -> None:
        empty = state._empty_state()
        complete_finding = dict(REFERENCE_FINDINGS[0], fingerprint="complete-fp")
        complete_event = eventize.build_events([complete_finding], [])[0]
        complete_classified = state.classify_events([complete_event], empty)
        after_complete = state.update_news_state(
            empty, [complete_finding], complete_classified,
            "2026-11-05T05:00:00+00:00", "2026-11-05T05:01:00+00:00", "complete",
        )
        incomplete_finding = dict(REFERENCE_FINDINGS[1], fingerprint="incomplete-fp")
        incomplete_event = eventize.build_events([incomplete_finding], [])[0]
        incomplete_classified = state.classify_events([incomplete_event], after_complete)
        after_incomplete = state.update_news_state(
            after_complete, [incomplete_finding], incomplete_classified,
            "2026-11-05T06:00:00+00:00", "2026-11-05T06:01:00+00:00", "incomplete",
        )
        self.assertEqual({"complete-fp", "incomplete-fp"}, state.seen_fingerprints(after_incomplete))
        self.assertEqual({"complete-fp"}, state.seen_fingerprints(after_incomplete, baseline=True))

    def test_migration_audit_reports_no_lost_identity(self) -> None:
        legacy = {
            "schema_version": 2,
            "seen_fingerprints": ["old", "new"],
            "baseline_seen_fingerprints": ["old"],
            "events": {
                "EV-MIXED": {
                    "baseline_confirmed": True,
                    "sources": [
                        {"title": "Alte Meldung", "url": "https://example.ch/old", "fingerprint": "old"},
                        {"title": "Neue andere Meldung", "url": "https://example.ch/new", "fingerprint": "new"},
                    ],
                    "history": [
                        {"title": "Alte Meldung", "match_similarity": 1.0},
                        {"title": "Neue andere Meldung", "match_similarity": 0.1},
                    ],
                }
            },
        }
        report = audit_state_migration.audit(legacy)
        self.assertEqual([], report["fingerprints_lost"])
        self.assertEqual([], report["canonical_urls_lost"])
        self.assertEqual([], report["baseline_added"])
        self.assertEqual(0, report["possible_false_new_count"])

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



class PublicArchiveQualityTests(unittest.TestCase):
    @staticmethod
    def news_item(title: str, *, approved: bool, potential: int = 10) -> dict:
        return {
            "event_id": "EV-" + title[:16],
            "headline": title, "quality_qualified": approved,
            "post_potential": potential, "status": "Neu",
            "source": {"id": "nzz-schweiz", "url": "https://nzz.ch/schweiz/" + title[:8]},
            "sources": [],
        }

    @staticmethod
    def paper_item(title: str, page: int) -> dict:
        source = {
            "source_id": "nzz-epaper", "source_role": "early_epaper",
            "title": title, "page": page, "published_at": "2026-11-07T00:00:00+01:00",
            "url": f"https://epaper.nzz.ch/storefront/8#page={page}",
        }
        return {
            "event_id": f"EV-PAPER-{page}", "title": title, "headline": title,
            "score": 12, "status": "Neu", "sources": [source],
            "source": {**source, "id": source["source_id"], "role": source["source_role"]},
            "summary": "Die Finanzierung der AHV wird neu beurteilt.",
        }

    def test_november_7_rejected_articles_do_not_reappear_after_archiving(self) -> None:
        # Real headlines / qualification outcome from Full Run 42361184080.
        rejected = [
            self.news_item("Abstimmung vom 29. November: Die 13. AHV-Rente muss finanziert werden – und zwar jetzt", approved=False),
            self.news_item("Ihr habt uns eure Prüfungen geschickt – Zeit für eine Besprechung", approved=False, potential=6),
        ]
        report = {
            "date": "2026-11-07", "news": rejected, "news_candidates": [],
            "news_candidate_pool": rejected, "procedures": [], "risks": [],
        }
        final = archive_runs._apply_delta(report, None)
        self.assertEqual([], final["news"])
        self.assertEqual([], final["news_candidates"])
        self.assertEqual(0, final["delta"]["news_count"])
        self.assertEqual(0, final["delta"]["hit_count"])

    def test_only_explicitly_qualified_items_enter_public_delta(self) -> None:
        approved = self.news_item("Bilaterale III: Nationalrat genehmigt Finanzierung", approved=True)
        rejected = self.news_item("Unterhaltung ohne politische Relevanz", approved=False)
        current = {
            "date": "2026-11-07",
            "news": [approved, rejected], "news_candidates": [approved, rejected],
            "news_candidate_pool": [approved, rejected],
            "procedures": [], "risks": [],
        }
        final = archive_runs._apply_delta(current, None)
        self.assertEqual([approved["headline"]], [item["headline"] for item in final["news"]])
        self.assertEqual(1, final["delta"]["news_count"])
        # A later run with no new substantive change should not repeat it.
        next_run = {
            "date": "2026-11-07", "news": [approved],
            "news_candidates": [approved], "news_candidate_pool": [approved],
            "procedures": [], "risks": [],
        }
        self.assertEqual([], archive_runs._apply_delta(next_run, final)["news"])

    def test_different_nzz_pages_are_not_merged_in_archive_or_quality_guard(self) -> None:
        title = "Bundesrat entscheidet über die Finanzierung der AHV"
        first = self.paper_item(title, 2)
        second = self.paper_item(title, 12)
        self.assertFalse(archive._same_candidate(first, second))
        self.assertEqual(2, len(archive._merge_candidates([], [first, second])))
        self.assertFalse(post_quality_guard._same_story(first, second))
        self.assertFalse(archive_runs._news_ids(first) & archive_runs._news_ids(second))
        self.assertTrue(archive_runs._news_ids(first) & archive_runs._news_ids(dict(first)))



if __name__ == "__main__":
    unittest.main()
