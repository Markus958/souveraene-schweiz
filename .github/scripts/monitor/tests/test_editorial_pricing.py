from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

MONITOR_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MONITOR_DIR))

import editorial_ai  # noqa: E402
from editorial_budget import BudgetExceeded, UsageLedger  # noqa: E402
from editorial_pricing import LONG_CONTEXT_THRESHOLD, cost_for_usage  # noqa: E402


RATES = {
    "EDITORIAL_AI_MODEL": "gpt-6-luna",
    "EDITORIAL_AI_INPUT_USD_PER_MTOK": "0.10",
    "EDITORIAL_AI_CACHED_INPUT_USD_PER_MTOK": "0.01",
    "EDITORIAL_AI_CACHE_WRITE_USD_PER_MTOK": "0.125",
    "EDITORIAL_AI_OUTPUT_USD_PER_MTOK": "0.50",
    "EDITORIAL_AI_MAX_OUTPUT_TOKENS": "6000",
}


class EditorialPricingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.patch = patch.dict(os.environ, RATES, clear=False)
        self.patch.start()

    def tearDown(self) -> None:
        self.patch.stop()

    @staticmethod
    def historic_usage() -> dict:
        # Actual GPT-6 Luna selection call from 7 November 2026.
        return {
            "input_tokens": 412169,
            "cached_input_tokens": 0,
            "cache_write_tokens": 412166,
            "output_tokens": 2985,
        }

    def test_actual_november_7_long_context_call_matches_invoice_estimate(self) -> None:
        price = cost_for_usage(self.historic_usage(), model="gpt-6-luna")
        self.assertTrue(price["long_context"])
        self.assertEqual(0.10528085, price["usd"])
        self.assertEqual(0.25, price["cache_write_usd_per_mtok"])
        self.assertEqual(0.75, price["output_usd_per_mtok"])

    def test_short_context_rates_are_unchanged_at_exact_threshold(self) -> None:
        tokens = LONG_CONTEXT_THRESHOLD
        base = cost_for_usage({
            "input_tokens": tokens, "cache_write_tokens": tokens,
            "output_tokens": 1000,
        }, model="gpt-6-luna")
        self.assertFalse(base["long_context"])
        self.assertEqual(0.0345, base["usd"])
        self.assertEqual(0.125, base["cache_write_usd_per_mtok"])

        above = cost_for_usage({
            "input_tokens": tokens + 1, "cache_write_tokens": tokens + 1,
            "output_tokens": 1000,
        }, model="gpt-6-luna")
        self.assertTrue(above["long_context"])
        self.assertEqual(0.06875025, above["usd"])

    def test_unknown_models_are_not_assigned_luna_tariffs(self) -> None:
        other = cost_for_usage(self.historic_usage(), model="some-other-model")
        self.assertFalse(other["long_context"])
        self.assertEqual(0.05301355, other["usd"])

    def test_missing_pricing_is_not_silently_charged_at_zero(self) -> None:
        with patch.dict(os.environ, {"EDITORIAL_AI_INPUT_USD_PER_MTOK": ""}):
            self.assertEqual("pricing_not_configured", cost_for_usage(
                {"input_tokens": 300000}, model="gpt-6-luna",
            )["reason"])

    def test_legacy_entries_are_repriced_read_only_for_monthly_budget(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "usage.json"
            historic = {
                **self.historic_usage(), "model": "gpt-6-luna",
                "month": UsageLedger.month_key(),
                "day": UsageLedger.month_key() + "-07",
                "cost_usd": 0.05301355,
                "recorded_at": "2026-11-07T10:59:36+01:00",
            }
            payload = {"schema_version": 1, "calls": {
                "historic-long": historic,
                "historic-short": {
                    "month": UsageLedger.month_key(), "cost_usd": 0.10,
                    "model": "gpt-6-luna", "input_tokens": 5000,
                },
            }}
            path.write_text(json.dumps(payload), encoding="utf-8")
            before = path.read_bytes()
            ledger = UsageLedger(path=path)
            self.assertAlmostEqual(0.20528085, ledger.month_cost())
            self.assertEqual(before, path.read_bytes())
            self.assertAlmostEqual(0.20528085, ledger.snapshot()["month_cost_usd"])
            ledger.limit = 0.20
            with self.assertRaises(BudgetExceeded):
                ledger.reserve(0.001)
            self.assertEqual(before, path.read_bytes())

    def test_highest_recorded_charge_is_not_reduced_by_repricing(self) -> None:
        entry = {
            **self.historic_usage(), "model": "gpt-6-luna", "cost_usd": 0.15,
        }
        self.assertEqual(0.15, UsageLedger._effective_call_cost(entry))

    def test_long_request_reservation_blocks_before_network_call(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ledger = UsageLedger(path=Path(tmp) / "usage.json")
            ledger.limit = 0.04
            requests = []
            def requester(payload, *_args):
                requests.append(payload)
                raise AssertionError("The API must not be called when budget is insufficient")

            with self.assertRaises(BudgetExceeded):
                editorial_ai._call_structured(
                    "gpt-6-luna", "unit-test-key", "Read the following text.",
                    "a" * 600000, "editorial_article_batch",
                    {"type": "object"}, requester, ledger,
                )
            self.assertEqual([], requests)
            self.assertEqual(0, ledger.reserved)

    def test_missing_rates_fail_closed_before_network_call(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ledger = UsageLedger(path=Path(tmp) / "usage.json")
            requests = []
            with patch.dict(os.environ, {"EDITORIAL_AI_INPUT_USD_PER_MTOK": ""}):
                with self.assertRaises(editorial_ai.EditorialError):
                    editorial_ai._call_structured(
                        "gpt-6-luna", "test-key", "instructions", "short",
                        "editorial_article_batch", {"type": "object"},
                        lambda *_: requests.append(True), ledger,
                    )
            self.assertEqual([], requests)


if __name__ == "__main__":
    unittest.main()
