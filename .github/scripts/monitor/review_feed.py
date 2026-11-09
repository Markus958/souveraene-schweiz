"""Publish a privacy-minimised, unscored article list for manual editorial review.

Only public metadata (headline, optional subtitle, public source and URL) enters
GitHub Pages. Never include collected article bodies, newsletter message text,
user email addresses, access tokens, analysis prompts, or the evaluation labels.
"""
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlsplit, urlunsplit
from zoneinfo import ZoneInfo

from config import REPO_ROOT
from editorial_ai import _merge_candidates
from storage import write_json

ZURICH = ZoneInfo("Europe/Zurich")
REVIEW_DIR = REPO_ROOT / "data" / "monitor" / "review"
EXCLUDED_HOST_SUFFIXES = (".ts.net", ".local", ".internal", ".localhost")
SENSITIVE_QUERY_TERMS = (
    "token", "auth", "email", "user", "secret", "password", "unsubscribe",
    "signature", "recipient", "session", "apikey", "api_key", "hash",
)


def _clean(value: Any, limit: int) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def _iso_date(value: Any) -> str:
    text = _clean(value, 48)
    match = re.match(r"^(20\d\d-\d\d-\d\d)", text)
    return match.group(1) if match else ""


def _public_url(value: Any, *, page: Any = None) -> str:
    """Omit sensitive/credentialled links; discard all query parameters."""
    raw = _clean(value, 1600)
    try:
        parsed = urlsplit(raw)
    except ValueError:
        return ""
    hostname = (parsed.hostname or "").casefold()
    if (
        parsed.scheme != "https" or not hostname or parsed.username or parsed.password
        or hostname in {"localhost", "127.0.0.1"}
        or any(hostname.endswith(suffix) for suffix in EXCLUDED_HOST_SUFFIXES)
        or any(term in (parsed.path or "").casefold() for term in ("/unsubscribe", "/optout", "/email/"))
    ):
        return ""
    # Always remove URL query strings: mail click-tracking and personal tokens
    # must not be copied into publicly deployed static JSON.
    path = parsed.path or "/"
    url = urlunsplit(("https", hostname, path, "", ""))
    if hostname == "epaper.nzz.ch":
        try:
            number = int(page)
        except (TypeError, ValueError):
            number = 0
        if 1 <= number <= 1000:
            url += "#page=" + str(number)
    return url


def _source_name(article: dict[str, Any]) -> str:
    original = article.get("original_source")
    if isinstance(original, dict):
        name = _clean(original.get("name"), 120)
        if name and name.casefold() not in {"unbekannt", "unknown"}:
            return name
    sources = article.get("collector_sources") or []
    return _clean(article.get("source_name") or (sources[0] if sources else ""), 120) or "Quelle unbekannt"


def _article_records(findings: list[dict[str, Any]], ai: dict[str, Any] | None = None) -> tuple[list[dict], dict]:
    """Reuse existing technical deduplication and ad/ticker prefilter.

    The editorial relevance threshold is intentionally NOT applied.
    """
    ai = ai if isinstance(ai, dict) else {}
    candidates = _merge_candidates(findings, 0)
    selected_ids = {
        str(item.get("article_id") or "")
        for item in ai.get("selection", []) or [] if isinstance(item, dict)
    }
    by_id = {
        str(item.get("article_id") or ""): item
        for item in (ai.get("candidate_pipeline") or {}).get("articles", []) or []
        if isinstance(item, dict)
    }
    rows = []
    omitted_unsafe = 0
    for candidate in candidates:
        url = _public_url(candidate.get("original_url"))
        # E-paper URLs share a storefront, but each article's page matters.
        if candidate.get("collector_sources") and any(
            str(src) in {"nzz-epaper", "nzzas-epaper"}
            for src in candidate.get("collector_sources") or []
        ):
            raw = next(
                (f for f in findings if str(f.get("title") or "").strip() == candidate["headline"]
                 and _iso_date(f.get("published_at")) == _iso_date(candidate.get("published_at"))
                 and str(f.get("source_id") or "") in {"nzz-epaper", "nzzas-epaper"}),
                {},
            )
            page = raw.get("page")
            url = _public_url(raw.get("url") or candidate.get("original_url"), page=page)
        else:
            page = None

        if not url:
            omitted_unsafe += 1
            continue

        # The source's own subtitle is helpful when judging interviews and
        # commentaries. It is clipped, with no article body or newsletter text.
        subtitle = ""
        if any(str(src) in {"nzz-epaper", "nzzas-epaper"} for src in candidate.get("collector_sources") or []):
            subtitle = _clean(raw.get("subtitle"), 240)
        else:
            match = next(
                (f for f in findings if str(f.get("title") or "").strip() == candidate["headline"]
                 and _public_url(f.get("url")) == url),
                {},
            )
            if str(match.get("source_id") or "") != "gmail-newsletters":
                subtitle = _clean(match.get("subtitle"), 240)

        aid = _clean(candidate.get("article_id"), 80)
        if not re.fullmatch(r"[a-zA-Z0-9_-]{12,80}", aid):
            omitted_unsafe += 1
            continue
        source = _source_name(candidate)
        trace = by_id.get(aid) or {}
        row = {
            "id": aid,
            "headline": _clean(candidate.get("headline"), 300),
            "subtitle": subtitle,
            "source": source,
            "url": url,
            "published_date": _iso_date(candidate.get("published_at")),
            "discovered_date": _iso_date(candidate.get("discovered_at")),
            "known_status": _clean(trace.get("historical_novelty") or candidate.get("historical_novelty"), 50),
            "ai_selected": aid in selected_ids,
        }
        if page is not None:
            row["page"] = page
        # No full text, no private newsletter provenance, no access tokens.
        rows.append(row)
    return rows, {
        "collected_findings": len(findings),
        "deduplicated_technical_candidates": len(candidates),
        "omitted_unsafe_public_links": omitted_unsafe,
        "published_review_candidates": len(rows),
    }


def _index() -> dict:
    path = REVIEW_DIR / "index.json"
    try:
        result = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(result, dict) and isinstance(result.get("days"), list):
            return result
    except (OSError, ValueError):
        pass
    return {"schema_version": 1, "days": []}


def _record_index(day: str, key: str, relative_path: str, count: int) -> None:
    idx = _index()
    existing = next((item for item in idx["days"] if item.get("date") == day), None)
    if existing is None:
        existing = {"date": day, "daily": None, "epaper": []}
        idx["days"].append(existing)
    if key == "daily":
        existing["daily"] = {"path": relative_path, "count": count}
    else:
        papers = [x for x in existing.get("epaper", []) if x.get("path") != relative_path]
        papers.append({"path": relative_path, "count": count})
        existing["epaper"] = sorted(papers, key=lambda x: x["path"])
    idx["days"] = sorted(idx["days"], key=lambda x: x.get("date", ""), reverse=True)[:45]
    idx["updated_at"] = datetime.now(ZURICH).isoformat()
    write_json(REVIEW_DIR / "index.json", idx)


def publish_daily(raw_report: dict) -> Path:
    started = str(raw_report.get("started_at") or "")
    day = _iso_date(started)
    # The reporting timezone, not the machine's UTC calendar date, owns the day.
    try:
        day = datetime.fromisoformat(started.replace("Z", "+00:00")).astimezone(ZURICH).date().isoformat()
    except ValueError:
        day = datetime.now(ZURICH).date().isoformat()
    runs = (raw_report.get("news_discovery") or {}).get("source_runs") or []
    findings = [f for source in runs if isinstance(source, dict)
                for f in (source.get("findings") or []) if isinstance(f, dict)]
    rows, counts = _article_records(findings, raw_report.get("editorial_ai"))
    result = {
        "schema_version": 1,
        "date": day,
        "kind": "daily",
        "generated_at": datetime.now(ZURICH).isoformat(),
        "counts": counts,
        "articles": rows,
    }
    path = REVIEW_DIR / (day + ".json")
    write_json(path, result)
    _record_index(day, "daily", path.name, len(rows))
    return path


def publish_epaper(extraction: dict, edition: str) -> Path:
    if edition not in {"nzz", "nzzas"}:
        raise ValueError("edition must be nzz or nzzas")
    metadata = extraction.get("metadata") or {}
    day = _iso_date(metadata.get("issue_date") or metadata.get("target_date"))
    if not day:
        raise ValueError("verified NZZ issue date is required")
    findings = [f for f in extraction.get("findings", []) if isinstance(f, dict)]
    if not findings or extraction.get("status") not in {"new_publication", "checked_no_new"}:
        raise ValueError("validated nonempty e-paper findings required")
    rows, counts = _article_records(findings)
    # The e-paper extractor provides the page and validated issue date.
    for row in rows:
        row["published_date"] = day
    result = {
        "schema_version": 1,
        "date": day,
        "kind": "epaper",
        "edition": edition,
        "generated_at": datetime.now(ZURICH).isoformat(),
        "counts": counts,
        "articles": rows,
    }
    relative = "epaper/" + day + "-" + edition + ".json"
    path = REVIEW_DIR / relative
    write_json(path, result)
    _record_index(day, "epaper", relative, len(rows))
    return path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("kind", choices=["daily", "epaper"])
    parser.add_argument("--input", required=True)
    parser.add_argument("--edition", choices=["nzz", "nzzas"])
    args = parser.parse_args()
    source = json.loads(Path(args.input).read_text(encoding="utf-8"))
    if args.kind == "epaper":
        if not args.edition:
            parser.error("--edition required for epaper")
        path = publish_epaper(source, args.edition)
    else:
        path = publish_daily(source)
    print("Editorial review feed:", path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
