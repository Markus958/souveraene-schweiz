from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from config import REPO_ROOT
from eventize import event_similarity
from storage import write_json
from url_identity import canonical_url

DATASET = REPO_ROOT / "data" / "monitor" / "evaluation" / "editorial_reference_cases.json"
ZURICH = ZoneInfo("Europe/Zurich")


def _load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _match(case: dict[str, Any], analysis: dict[str, Any]) -> bool:
    expected_url = canonical_url(str(case.get("original_url") or ""))
    actual_url = canonical_url(str(analysis.get("original_url") or ""))
    if expected_url and actual_url and expected_url == actual_url:
        return True
    return event_similarity(str(case.get("headline") or ""), str(analysis.get("headline") or "")) >= 0.55


def evaluate(shadow: dict[str, Any], dataset: dict[str, Any]) -> dict[str, Any]:
    analyses = [item for item in shadow.get("analyses", []) if isinstance(item, dict)]
    selected = [item for item in shadow.get("selection", []) if isinstance(item, dict)]
    cases = [case for case in dataset.get("cases", []) if isinstance(case, dict)]
    rows = []
    for case in cases:
        analysed = next((item for item in analyses if _match(case, item)), None)
        chosen = next((item for item in selected if _match(case, item)), None)
        rows.append({
            "id": case.get("id"), "kind": case.get("kind"), "expected": case.get("expected"),
            "analysed": bool(analysed), "selected": bool(chosen),
            "editorial_priority": (analysed or {}).get("editorial_priority"),
            "selection_reason": (analysed or {}).get("selection_reason"),
        })
    references = [row for row in rows if row["expected"] == "consider"]
    negatives = [row for row in rows if row["expected"] == "exclude"]
    reference_analysed = sum(row["analysed"] for row in references)
    reference_selected = sum(row["selected"] for row in references)
    negative_selected = sum(row["selected"] for row in negatives)
    evaluated_selected = reference_selected + negative_selected
    categories = {str(item.get("editorial_category")) for item in selected if item.get("editorial_category")}
    return {
        "schema_version": 1, "dataset_date": dataset.get("date"), "shadow_status": shadow.get("status"),
        "model": shadow.get("model"), "prompt_version": shadow.get("prompt_version"),
        "metrics": {
            "reference_cases": len(references), "reference_analysed": reference_analysed,
            "reference_selected": reference_selected,
            "reference_recall": round(reference_selected / len(references), 3) if references else None,
            "missed_available_references": sum(row["analysed"] and not row["selected"] for row in references),
            "negative_cases": len(negatives), "false_positives": negative_selected,
            "evaluated_precision": round(reference_selected / evaluated_selected, 3) if evaluated_selected else None,
            "selected_count": len(selected), "category_diversity": len(categories),
            "fact_fidelity": "manual_review_required",
            "reason_quality": "manual_review_required",
        },
        "usage": shadow.get("usage"), "cost": shadow.get("cost"), "cases": rows,
    }


def compare_with_legacy(shadow: dict[str, Any], public_report: dict[str, Any]) -> dict[str, Any]:
    legacy_urls = []
    for event in public_report.get("news_candidates", []) or []:
        source = event.get("source") if isinstance(event.get("source"), dict) else {}
        identity = canonical_url(str(source.get("original_url") or source.get("url") or ""))
        if identity and identity not in legacy_urls:
            legacy_urls.append(identity)
    ai_urls = []
    for item in shadow.get("selection", []) or []:
        identity = canonical_url(str(item.get("original_url") or ""))
        if identity and identity not in ai_urls:
            ai_urls.append(identity)
    return {
        "both_urls": [url for url in ai_urls if url in legacy_urls],
        "legacy_only_urls": [url for url in legacy_urls if url not in ai_urls],
        "ai_only_urls": [url for url in ai_urls if url not in legacy_urls],
        "priority_deviations": [
            {"url": url, "legacy_rank": legacy_urls.index(url) + 1, "ai_rank": ai_urls.index(url) + 1}
            for url in ai_urls if url in legacy_urls and legacy_urls.index(url) != ai_urls.index(url)
        ],
    }


def main() -> int:
    output_dir = Path(os.getenv("MONITOR_OUTPUT_DIR", "monitor-out"))
    shadow_path = output_dir / "editorial-ai-shadow.json"
    shadow = _load(shadow_path) if shadow_path.is_file() else {"status": "missing", "analyses": [], "selection": []}
    report_path = REPO_ROOT / "data" / "monitor" / "reports" / f"{datetime.now(ZURICH).date().isoformat()}.json"
    if report_path.is_file():
        shadow["comparison"] = compare_with_legacy(shadow, _load(report_path))
        write_json(shadow_path, shadow)
        raw_path = output_dir / "monitor-daily-run.json"
        if raw_path.is_file():
            raw = _load(raw_path)
            raw["editorial_ai"] = shadow
            write_json(raw_path, raw)
    result = evaluate(shadow, _load(DATASET))
    path = output_dir / "editorial-ai-evaluation.json"
    write_json(path, result)
    print(f"Editorial evaluation: references={result['metrics']['reference_selected']}/{result['metrics']['reference_cases']}; artifact={path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
