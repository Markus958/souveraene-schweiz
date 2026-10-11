from __future__ import annotations

import json
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[3]
CONFIG_ROOT = REPO_ROOT / "data" / "monitor" / "config"


def load_json(name: str) -> Any:
    path = CONFIG_ROOT / name
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_sources() -> list[dict[str, Any]]:
    data = load_json("sources.json")
    if not isinstance(data, list):
        raise ValueError("sources.json must contain a JSON array")
    return data


def load_risks() -> list[dict[str, Any]]:
    data = load_json("risks.json")
    if not isinstance(data, list):
        raise ValueError("risks.json must contain a JSON array")
    return data
