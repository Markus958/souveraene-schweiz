from __future__ import annotations

from typing import Any


def _best_source(event: dict[str, Any]) -> dict[str, Any]:
    sources = [source for source in event.get("sources", []) or [] if isinstance(source, dict)]
    if not sources:
        return {}
    priority = {"P1": 0, "P2": 1, "M1": 2, "M2": 3}
    source_class = {"A": 0, "B": 1, "C": 2, "D": 3}
    return min(sources, key=lambda source: (
        priority.get(str(source.get("priority") or ""), 9),
        source_class.get(str(source.get("source_class") or ""), 9),
    ))


def build_selection_trace(
    current_events: list[dict[str, Any]],
    delta_events: list[dict[str, Any]],
    selected_events: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Record every relevant event even when it never reaches the public list."""
    delta_ids = {str(event.get("event_id") or "") for event in delta_events}
    selected_ids = {str(event.get("event_id") or "") for event in selected_events}
    trace: list[dict[str, Any]] = []
    for event in current_events:
        event_id = str(event.get("event_id") or "")
        best = _best_source(event)
        sources = [source for source in event.get("sources", []) or [] if isinstance(source, dict)]
        channels = sorted({
            str(channel.get("id") or "")
            for source in sources
            for channel in source.get("discovery_channels", []) or []
            if isinstance(channel, dict) and channel.get("id")
        })
        published = sorted(str(source.get("published_at")) for source in sources if source.get("published_at"))
        discovered = sorted(str(source.get("discovered_at") or source.get("fetched_at")) for source in sources if source.get("discovered_at") or source.get("fetched_at"))
        trace.append({
            "event_id": event_id,
            "title": event.get("title"),
            "original_source": best.get("original_source") or {"id": best.get("source_id"), "name": best.get("source_name")},
            "url": best.get("original_url") or best.get("canonical_url") or best.get("url"),
            "discovery_channels": channels,
            "published_at": published[0] if published else None,
            "discovered_at": discovered[0] if discovered else None,
            "relevance_score": event.get("score"),
            "relevance_reasons": event.get("reasons") or [],
            "novelty_status": event.get("status"),
            "matched_event_id": event.get("matched_event_id"),
            "match_similarity": event.get("match_similarity"),
            "delta_candidate": event_id in delta_ids,
            "pre_filter_selected": event_id in selected_ids,
            "final_selected": False,
            "exclusion_reason": "pending_freshness_and_quality",
            "final_outcome": "pending",
        })
    return trace


def finalise_selection_trace(
    trace: list[dict[str, Any]],
    final_news: list[dict[str, Any]],
    final_pool: list[dict[str, Any]],
) -> dict[str, int]:
    final_ids = {str(item.get("event_id") or "") for item in final_news}
    pool_by_id = {str(item.get("event_id") or ""): item for item in final_pool}
    counts = {"selected": 0, "excluded_freshness_or_post_potential": 0, "excluded_quality": 0, "qualified_outside_top_10": 0}
    for record in trace:
        event_id = str(record.get("event_id") or "")
        item = pool_by_id.get(event_id)
        if event_id in final_ids:
            record["final_selected"] = True
            record["exclusion_reason"] = None
            record["final_outcome"] = "selected"
            counts["selected"] += 1
        elif item is None:
            record["exclusion_reason"] = "freshness_unknown_or_not_today_or_post_potential_below_5"
            record["final_outcome"] = "excluded_freshness_or_post_potential"
            counts["excluded_freshness_or_post_potential"] += 1
        elif not item.get("quality_qualified"):
            record["quality_score"] = item.get("quality_score")
            record["novelty_score"] = item.get("novelty_score")
            record["public_relevance_score"] = item.get("relevance_score")
            record["quality_reasons"] = item.get("quality_reasons") or []
            record["exclusion_reason"] = "public_quality_threshold"
            record["final_outcome"] = "excluded_quality"
            counts["excluded_quality"] += 1
        else:
            record["quality_score"] = item.get("quality_score")
            record["novelty_score"] = item.get("novelty_score")
            record["public_relevance_score"] = item.get("relevance_score")
            record["exclusion_reason"] = "qualified_but_outside_top_10"
            record["final_outcome"] = "qualified_outside_top_10"
            counts["qualified_outside_top_10"] += 1
    return counts
