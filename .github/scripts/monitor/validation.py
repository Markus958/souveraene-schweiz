from __future__ import annotations

from pathlib import Path
from typing import Any


def validate_sources(sources: list[dict[str, Any]]) -> list[str]:
    errors: list[str] = []
    seen: set[str] = set()
    allowed_classes = {"A", "B", "C", "D"}
    allowed_priorities = {"P1", "P2", "M1", "M2"}

    for index, source in enumerate(sources, start=1):
        prefix = f"sources[{index}]"
        sid = str(source.get("id", "")).strip()
        if not sid:
            errors.append(f"{prefix}: missing id")
        elif sid in seen:
            errors.append(f"{prefix}: duplicate id {sid}")
        else:
            seen.add(sid)

        if source.get("class") not in allowed_classes:
            errors.append(f"{prefix}: invalid class")
        if source.get("priority") not in allowed_priorities:
            errors.append(f"{prefix}: invalid priority")
        if not str(source.get("name", "")).strip():
            errors.append(f"{prefix}: missing name")
        if not str(source.get("url", "")).startswith("http"):
            errors.append(f"{prefix}: invalid url")

    return errors


def validate_risks(risks: list[dict[str, Any]], repo_root: Path) -> tuple[list[str], list[dict[str, Any]]]:
    errors: list[str] = []
    checks: list[dict[str, Any]] = []
    seen: set[str] = set()

    for index, risk in enumerate(risks, start=1):
        prefix = f"risks[{index}]"
        rid = str(risk.get("id", "")).strip()
        if not rid:
            errors.append(f"{prefix}: missing id")
        elif rid in seen:
            errors.append(f"{prefix}: duplicate id {rid}")
        else:
            seen.add(rid)

        pages = risk.get("pages") or []
        if not pages:
            errors.append(f"{prefix}: no pages configured")
            continue

        for page in pages:
            rel = str(page).lstrip("/")
            exists = (repo_root / rel).is_file()
            checks.append({"risk_id": rid, "page": rel, "exists": exists})
            if not exists:
                errors.append(f"{prefix}: missing page {rel}")

    return errors, checks
