"""Evaluate a user-exported editorial judgement file; never call an AI API.

The JSON feedback file stays local unless the user explicitly shares it. This
script produces auditable examples and simple metrics, not self-training.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from config import REPO_ROOT

ID_RE = re.compile(r"^[A-Za-z0-9_-]{12,80}$")
VALUES = {"postworthy", "not_postworthy"}


def validate_feedback(payload: dict[str, Any]) -> list[dict[str, Any]]:
    if not isinstance(payload, dict) or payload.get("schema_version") != 1 or payload.get("type") != "editorial-review-feedback":
        raise ValueError("invalid editorial review feedback format")
    entries = payload.get("ratings")
    if not isinstance(entries, list) or len(entries) > 100_000:
        raise ValueError("ratings must be a list of at most 100000 entries")
    unique: dict[str, dict[str, Any]] = {}
    for item in entries:
        if not isinstance(item, dict) or not ID_RE.fullmatch(str(item.get("id") or "")):
            raise ValueError("invalid article ID")
        if item.get("rating") not in VALUES:
            raise ValueError("invalid review value")
        ident = str(item["id"])
        unique[ident] = {
            "id": ident,
            "rating": str(item["rating"]),
            "comment": str(item.get("comment") or "")[:1000],
            "headline": str(item.get("headline") or "")[:300],
            "source": str(item.get("source") or "")[:120],
        }
    return list(unique.values())


def read_review_feeds(root: Path) -> dict[str, dict[str, Any]]:
    by_id: dict[str, dict[str, Any]] = {}
    for path in sorted(root.glob("20??-??-??.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        for article in payload.get("articles", []) or []:
            if not isinstance(article, dict):
                continue
            ident = str(article.get("id") or "")
            if not ID_RE.fullmatch(ident):
                continue
            by_id[ident] = {
                "headline": str(article.get("headline") or ""),
                "source": str(article.get("source") or ""),
                "day": str(payload.get("date") or ""),
                "ai_selected": article.get("ai_selected"),
            }
    # Add NZZ e-paper articles not seen in online/daily sources. The standalone
    # e-paper extraction does not record a comparable AI selection decision.
    for path in sorted((root / "epaper").glob("20??-??-??-*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        for article in payload.get("articles", []) or []:
            if not isinstance(article, dict):
                continue
            ident = str(article.get("id") or "")
            if ID_RE.fullmatch(ident) and ident not in by_id:
                by_id[ident] = {
                    "headline": str(article.get("headline") or ""),
                    "source": str(article.get("source") or ""),
                    "day": str(payload.get("date") or ""),
                    "ai_selected": None,
                }
    return by_id


def evaluate_feedback(items: list[dict[str, Any]], observed: dict[str, dict[str, Any]]) -> dict:
    counts = {
        "reviewed": len(items),
        "postworthy": sum(i["rating"] == "postworthy" for i in items),
        "not_postworthy": sum(i["rating"] == "not_postworthy" for i in items),
    }
    matched = [i for i in items if i["id"] in observed]
    measured = [i for i in matched if isinstance(observed[i["id"]].get("ai_selected"), bool)]
    tp = sum(i["rating"] == "postworthy" and observed[i["id"]]["ai_selected"] for i in measured)
    fp = sum(i["rating"] == "not_postworthy" and observed[i["id"]]["ai_selected"] for i in measured)
    fn = sum(i["rating"] == "postworthy" and not observed[i["id"]]["ai_selected"] for i in measured)
    tn = sum(i["rating"] == "not_postworthy" and not observed[i["id"]]["ai_selected"] for i in measured)
    result = {
        "schema_version": 1,
        "interpretation": "Only rated articles are scored; an unreviewed article is NOT negative.",
        "counts": {
            **counts,
            "matched_to_review_feeds": len(matched),
            "without_feed_record": len(items) - len(matched),
            "comparable_with_daily_shadow_selection": len(measured),
        },
        "ai_shadow_on_rated_sample": {
            "true_positive": tp, "false_positive": fp,
            "false_negative": fn, "true_negative": tn,
            "precision": round(tp / (tp + fp), 3) if tp + fp else None,
            "recall": round(tp / (tp + fn), 3) if tp + fn else None,
            "warning": "This is a judgement-sample comparison, not population precision/recall. A known unchanged article may intentionally be ineligible for AI daily selection."
        },
        "missed_user_postworthy_examples": [
            {
                "id": item["id"], "headline": item["headline"] or observed[item["id"]]["headline"],
                "reason": item["comment"], "source": item["source"] or observed[item["id"]]["source"]
            }
            for item in measured
            if item["rating"] == "postworthy" and not observed[item["id"]]["ai_selected"]
        ][:100],
    }
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--feedback", type=Path, required=True)
    parser.add_argument("--review-dir", type=Path, default=REPO_ROOT / "data/monitor/review")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    feedback = json.loads(args.feedback.read_text(encoding="utf-8"))
    validated = validate_feedback(feedback)
    result = evaluate_feedback(validated, read_review_feeds(args.review_dir))
    output = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(output + "\n", encoding="utf-8")
    else:
        print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
