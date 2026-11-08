from __future__ import annotations

import json
import os
import threading
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from config import REPO_ROOT
from editorial_pricing import LONG_CONTEXT_MODEL, LONG_CONTEXT_THRESHOLD, cost_for_usage
from storage import write_json

ZURICH = ZoneInfo("Europe/Zurich")
DEFAULT_PATH = REPO_ROOT / "data" / "monitor" / "state" / "editorial_ai_usage.json"


class BudgetExceeded(RuntimeError):
    pass


class UsageLedger:
    """Thread-safe, durable accounting that is deliberately separate from the cache."""

    def __init__(self, path: Path | None = None) -> None:
        self.path = path or Path(os.getenv("EDITORIAL_AI_USAGE_PATH", str(DEFAULT_PATH)))
        self.limit = float(os.getenv("EDITORIAL_AI_MONTHLY_BUDGET_USD", "10"))
        self.lock = threading.Lock()
        self.reserved = 0.0
        self.data = self._load()
        self.run_call_ids: list[str] = []

    def _load(self) -> dict[str, Any]:
        try:
            value = json.loads(self.path.read_text(encoding="utf-8"))
            if isinstance(value, dict):
                value.setdefault("calls", {})
                return value
        except (OSError, ValueError, TypeError):
            pass
        return {"schema_version": 1, "timezone": "Europe/Zurich", "currency": "USD", "calls": {}}

    @staticmethod
    def month_key(when: datetime | None = None) -> str:
        return (when or datetime.now(ZURICH)).astimezone(ZURICH).strftime("%Y-%m")

    @staticmethod
    def _effective_call_cost(entry: dict[str, Any]) -> float:
        """Correct legacy long-context undercounts without editing history.

        Never reduce a recorded charge. Leave other models and unknown pricing
        untouched rather than speculatively repricing older ledger entries.
        """
        recorded = float(entry.get("cost_usd") or 0)
        try:
            tokens = int(entry.get("input_tokens") or 0)
        except (TypeError, ValueError):
            return recorded
        if str(entry.get("model") or "") != LONG_CONTEXT_MODEL or tokens <= LONG_CONTEXT_THRESHOLD:
            return recorded
        estimated = cost_for_usage(entry, model=LONG_CONTEXT_MODEL).get("usd")
        return max(recorded, float(estimated)) if estimated is not None else recorded

    def month_cost(self) -> float:
        month = self.month_key()
        return round(sum(self._effective_call_cost(v) for v in self.data["calls"].values()
                         if str(v.get("month")) == month), 8)

    def reserve(self, estimated_usd: float) -> None:
        with self.lock:
            spent = self.month_cost()
            if spent >= self.limit or spent + self.reserved + max(estimated_usd, 0) > self.limit:
                raise BudgetExceeded(
                    f"editorial AI monthly budget exhausted or insufficient: "
                    f"spent={spent:.6f}, reserved={self.reserved:.6f}, limit={self.limit:.2f}"
                )
            self.reserved += max(estimated_usd, 0)

    def release(self, estimated_usd: float) -> None:
        with self.lock:
            self.reserved = max(0.0, self.reserved - max(estimated_usd, 0))

    def record(self, call_id: str, *, usage: dict[str, int], cost_usd: float,
               model: str, stage: str, estimated_usd: float) -> bool:
        with self.lock:
            self.reserved = max(0.0, self.reserved - max(estimated_usd, 0))
            if call_id in self.data["calls"]:
                return False
            now = datetime.now(ZURICH)
            self.data["calls"][call_id] = {
                "recorded_at": now.isoformat(), "day": now.date().isoformat(), "month": self.month_key(now),
                "model": model, "stage": stage, "cost_usd": round(cost_usd, 8),
                **{key: int(usage.get(key) or 0) for key in
                   ("input_tokens", "cached_input_tokens", "cache_write_tokens", "output_tokens", "total_tokens")},
            }
            self.run_call_ids.append(call_id)
            write_json(self.path, self.data)
            return True

    def snapshot(self) -> dict[str, Any]:
        month = self.month_key()
        calls = [self.data["calls"][cid] for cid in self.run_call_ids if cid in self.data["calls"]]
        today = datetime.now(ZURICH).date().isoformat()
        day_calls = [c for c in self.data["calls"].values() if str(c.get("day") or str(c.get("recorded_at") or "")[:10]) == today]
        month_calls = [c for c in self.data["calls"].values() if str(c.get("month")) == month]
        spent = self.month_cost()
        pct = (spent / self.limit * 100) if self.limit > 0 else 100.0
        warnings = []
        if pct >= 100:
            warnings.append("Monatsbudget erreicht; weitere bezahlte KI-Aufrufe sind gesperrt.")
        elif pct >= 80:
            warnings.append("Mindestens 80 Prozent des Monatsbudgets sind verbraucht.")
        return {
            "timezone": "Europe/Zurich", "month": month, "monthly_budget_usd": self.limit,
            "month_cost_usd": spent, "remaining_usd": round(max(0.0, self.limit - spent), 8),
            "day": today, "day_cost_usd": round(sum(self._effective_call_cost(c) for c in day_calls), 8),
            "day_api_calls": len(day_calls), "month_api_calls": len(month_calls),
            "budget_percent": round(pct, 2), "run_cost_usd": round(sum(self._effective_call_cost(c) for c in calls), 8),
            "run_api_calls": len(calls), "run_call_ids": list(self.run_call_ids), "warnings": warnings,
            "last_successful_call_at": max((str(c.get("recorded_at") or "") for c in self.data["calls"].values()), default=None),
            "note": ("OpenAI-Rechnungen können weitere Projekte und Nutzungen enthalten. "
                     "Historische GPT-6-Luna-Langkontextkosten werden ohne Änderung der "
                     "gespeicherten Einträge rechnerisch korrigiert."),
        }
