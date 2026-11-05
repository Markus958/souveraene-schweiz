from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

from config import REPO_ROOT
from storage import write_json

PATH = REPO_ROOT / "data" / "monitor" / "state" / "editorial_ai_usage.json"


def _load_text(text: str) -> dict[str, Any]:
    try:
        value = json.loads(text)
        return value if isinstance(value, dict) else {}
    except (TypeError, ValueError):
        return {}


def _remote() -> dict[str, Any]:
    result = subprocess.run(
        ["git", "show", "origin/main:data/monitor/state/editorial_ai_usage.json"],
        cwd=REPO_ROOT, capture_output=True, text=True, encoding="utf-8", check=False,
    )
    return _load_text(result.stdout) if result.returncode == 0 else {}


def merge_usage(local: dict[str, Any], remote: dict[str, Any]) -> dict[str, Any]:
    merged = {
        "schema_version": max(int(local.get("schema_version") or 1), int(remote.get("schema_version") or 1)),
        "timezone": "Europe/Zurich", "currency": "USD", "calls": {},
    }
    for source in (remote, local):
        for call_id, record in (source.get("calls", {}) or {}).items():
            if call_id in merged["calls"] and merged["calls"][call_id] != record:
                raise RuntimeError(f"conflicting accounting record for call {call_id}")
            if isinstance(record, dict):
                merged["calls"][str(call_id)] = record
    return merged


def main() -> int:
    local = _load_text(PATH.read_text(encoding="utf-8")) if PATH.is_file() else {}
    merged = merge_usage(local, _remote())
    if merged.get("calls") or PATH.is_file():
        write_json(PATH, merged)
    print(f"Editorial usage synced: calls={len(merged['calls'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
