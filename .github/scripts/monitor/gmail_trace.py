from __future__ import annotations

import hashlib
from collections import defaultdict
from typing import Any

from eventize import score_finding
from url_identity import canonical_url


def _channels(finding: dict[str, Any]) -> set[str]:
    return {
        str(channel.get("id") or "")
        for channel in finding.get("discovery_channels", [])
        if isinstance(channel, dict)
    }


def is_gmail_finding(finding: dict[str, Any]) -> bool:
    return "gmail-newsletters" in _channels(finding)


def _identity(finding: dict[str, Any]) -> str:
    return canonical_url(str(finding.get("canonical_url") or finding.get("original_url") or finding.get("url") or ""))


def build_gmail_trace(
    findings: list[dict[str, Any]],
    new_findings: list[dict[str, Any]],
    current_events: list[dict[str, Any]],
    selected_events: list[dict[str, Any]],
    procedure_watches: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    gmail = [finding for finding in findings if is_gmail_finding(finding)]
    new_object_ids = {id(finding) for finding in new_findings}
    non_gmail_urls = {_identity(finding) for finding in findings if not is_gmail_finding(finding)}
    event_ids_by_url: dict[str, set[str]] = defaultdict(set)
    for event in current_events:
        event_id = str(event.get("event_id") or "")
        for source in event.get("sources", []) or []:
            if isinstance(source, dict) and _identity(source):
                event_ids_by_url[_identity(source)].add(event_id)
    selected_ids = {str(event.get("event_id") or "") for event in selected_events}

    records: list[dict[str, Any]] = []
    for finding in gmail:
        identity = _identity(finding)
        score, reasons = score_finding(finding, procedure_watches)
        event_ids = sorted(event_ids_by_url.get(identity, set()))
        baseline_new = id(finding) in new_object_ids
        cross_channel_duplicate = bool(identity and identity in non_gmail_urls)
        pre_filter_selected = bool(set(event_ids) & selected_ids)
        records.append({
            "trace_id": "GM-" + hashlib.sha256(identity.encode("utf-8")).hexdigest()[:16].upper(),
            "title": finding.get("title"),
            "canonical_url": identity,
            "original_source": finding.get("original_source") or {"id": "unknown", "name": "Unbekannt"},
            "discovery_channels": finding.get("discovery_channels") or [],
            "published_at": finding.get("published_at"),
            "publication_date_status": finding.get("publication_date_status") or ("known" if finding.get("published_at") else "unknown"),
            "discovered_at": finding.get("discovered_at") or finding.get("fetched_at"),
            "baseline_status": "new" if baseline_new else "already_known",
            "cross_channel_duplicate": cross_channel_duplicate,
            "relevance_score": score,
            "relevance_reasons": reasons,
            "relevance_qualified": score >= 5,
            "event_ids": event_ids,
            "event_clustered": bool(event_ids),
            "pre_filter_selected": pre_filter_selected,
            "final_selected": None,
            "final_outcome": "pending_post_filters" if pre_filter_selected else (
                "clustered_not_selected" if event_ids else ("low_relevance" if score < 5 else "not_clustered")
            ),
        })

    counters = {
        "article_hints_total": len(gmail),
        "unique_canonical_articles": len({record["canonical_url"] for record in records if record["canonical_url"]}),
        "baseline_new_article_hints": sum(record["baseline_status"] == "new" for record in records),
        "already_known_article_hints": sum(record["baseline_status"] == "already_known" for record in records),
        "cross_channel_duplicate_hints": sum(record["cross_channel_duplicate"] for record in records),
        "low_relevance_article_hints": sum(not record["relevance_qualified"] for record in records),
        "relevance_qualified_article_hints": sum(record["relevance_qualified"] for record in records),
        "event_clustered_article_hints": sum(record["event_clustered"] for record in records),
        "event_clusters_with_gmail": len({event_id for record in records for event_id in record["event_ids"]}),
        "pre_filter_selected_article_hints": sum(record["pre_filter_selected"] for record in records),
        "pre_filter_selected_events": len({event_id for record in records if record["pre_filter_selected"] for event_id in record["event_ids"] if event_id in selected_ids}),
    }
    return records, counters


def finalise_gmail_trace(
    trace: list[dict[str, Any]],
    public_news: list[dict[str, Any]],
    candidate_pool: list[dict[str, Any]],
) -> dict[str, int]:
    final_ids = {
        str(event_id)
        for item in public_news
        for event_id in [item.get("event_id"), *(item.get("merged_event_ids") or [])]
        if event_id
    }
    pool_ids = {
        str(event_id)
        for item in candidate_pool
        for event_id in [item.get("event_id"), *(item.get("merged_event_ids") or [])]
        if event_id
    }
    for record in trace:
        event_ids = set(record.get("event_ids") or [])
        record["final_selected"] = bool(event_ids & final_ids)
        if record["final_selected"]:
            record["final_outcome"] = "selected"
        elif record.get("pre_filter_selected") and not event_ids & pool_ids:
            record["final_outcome"] = "excluded_freshness_or_unknown_date"
        elif record.get("pre_filter_selected"):
            record["final_outcome"] = "excluded_quality"
    return {
        "final_selected_article_hints": sum(bool(record.get("final_selected")) for record in trace),
        "final_selected_events": len({event_id for record in trace if record.get("final_selected") for event_id in record.get("event_ids", []) if event_id in final_ids}),
        "freshness_excluded_article_hints": sum(record.get("final_outcome") == "excluded_freshness_or_unknown_date" for record in trace),
        "quality_excluded_article_hints": sum(record.get("final_outcome") == "excluded_quality" for record in trace),
    }
