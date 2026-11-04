from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from url_identity import canonical_url, merge_discovery_channels, normalise_host


CONFIDENCE_SCORES = {"unknown": 0, "low": 25, "medium": 60, "high": 90, "verified": 100}


def load_source_registry(path: Path | None = None) -> list[dict[str, Any]]:
    path = path or Path(__file__).resolve().parents[3] / "data" / "monitor" / "config" / "sources.json"
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return []
    return [item for item in payload if isinstance(item, dict) and item.get("id") != "gmail-newsletters"]


def source_type(source: dict[str, Any]) -> str:
    explicit = str(source.get("source_type") or "").strip()
    if explicit:
        return explicit
    source_id = str(source.get("id") or "")
    method = str(source.get("method") or "")
    if method == "gmail_feed":
        return "newsletter"
    if source_id in {"ch-fedlex"}:
        return "rechtsverbindlicher_text"
    if source_id == "ch-bund-news":
        return "amtliche_mitteilung"
    if str(source.get("class") or "") == "A":
        return "amtliche_primaerquelle"
    if "epaper" in source_id or source_id.startswith(("nzz", "srf", "watson", "tagesanzeiger", "reuters")):
        return "medienbericht"
    return "fachpublikation"


def _publisher_match(publisher: str, registry: list[dict[str, Any]]) -> dict[str, Any] | None:
    value = publisher.casefold().strip()
    if not value:
        return None
    matches: list[dict[str, Any]] = []
    for source in registry:
        terms = [str(source.get("name") or ""), str(source.get("id") or "").removeprefix("ch-")]
        if any(len(term.strip()) >= 3 and re.search(rf"(?<!\w){re.escape(term.casefold().strip())}(?!\w)", value) for term in terms):
            matches.append(source)
    return matches[0] if len(matches) == 1 else None


def _domain_candidates(url: str, registry: list[dict[str, Any]]) -> list[dict[str, Any]]:
    host = normalise_host(urlsplit(url).netloc)
    matches: list[dict[str, Any]] = []
    for source in registry:
        domains = [urlsplit(str(source.get("url") or "")).netloc, *(source.get("domains") or [])]
        if any(host == normalise_host(str(domain)) or host.endswith("." + normalise_host(str(domain))) for domain in domains if domain):
            matches.append(source)
    return matches


def _identity(source: dict[str, Any], domain: str | None, level: str, basis: str) -> dict[str, Any]:
    source_id = source.get("id") or "unknown"
    return {
        "id": source_id,
        "name": source.get("name") or "Unbekannt",
        "domain": domain,
        "class": source.get("class"),
        "priority": source.get("priority"),
        "source_type": source_type(source),
        "reliably_identified": level in {"high", "verified"},
        "source_confidence": {"level": level, "score": CONFIDENCE_SCORES[level], "basis": basis},
        "source_usage": {
            "independent_factcheck_eligible": source_id not in {"ch-bund-news", "unknown"},
            "legal_claim_preferred": source_id == "ch-fedlex",
            "note": "Vertragstexte sind für rechtliche CH–EU-Tatsachen massgebend" if source_id == "ch-bund-news" else None,
        },
    }


def resolve_original_source(
    url: str,
    configured_source: dict[str, Any] | None,
    registry: list[dict[str, Any]],
    *,
    publisher: str | None = None,
) -> dict[str, Any]:
    original_url = canonical_url(url)
    domain = normalise_host(urlsplit(original_url).netloc) or None
    publisher_source = _publisher_match(str(publisher or ""), registry)
    if publisher_source:
        return _identity(publisher_source, domain, "verified", "structured_publisher")

    matches = _domain_candidates(original_url, registry)
    if len(matches) == 1:
        return _identity(matches[0], domain, "high", "unique_configured_domain")

    configured = configured_source or {}
    configured_id = str(configured.get("id") or "")
    exact = [source for source in matches if str(source.get("id") or "") == configured_id]
    if len(exact) == 1 and domain not in {"admin.ch", "www.admin.ch", "newsd.admin.ch"}:
        return _identity(exact[0], domain, "high", "configured_source_and_domain")

    # Generic admin.ch/newsd.admin.ch URLs can represent many offices. Without
    # structured publisher evidence, assigning an office would be speculation.
    if domain in {"admin.ch", "www.admin.ch", "newsd.admin.ch"}:
        return _identity({}, domain, "unknown", "shared_federal_domain_without_publisher")

    if configured_id and str(configured.get("method") or "") != "gmail_feed":
        return _identity(configured, domain, "high", "configured_collector_context")

    return _identity({}, domain, "unknown", "no_unambiguous_evidence")


def discovery_channel(source: dict[str, Any], discovered_at: str) -> dict[str, Any]:
    method = str(source.get("method") or "html")
    channel_id = {
        "gmail_feed": "gmail-newsletters", "rss": "rss", "nsb_search": "api",
        "html": "website", "authenticated_html": "website", "epaper": "epaper",
    }.get(method, method or "website")
    return {"id": channel_id, "source_id": source.get("id"), "discovered_at": discovered_at}


def apply_source_model(
    finding: dict[str, Any], source: dict[str, Any], registry: list[dict[str, Any]],
    *, publisher: str | None = None, channel: dict[str, Any] | None = None,
) -> dict[str, Any]:
    result = dict(finding)
    original_url = canonical_url(str(result.get("canonical_url") or result.get("url") or ""))
    original = resolve_original_source(original_url, source, registry, publisher=publisher)
    discovered_at = str(result.get("discovered_at") or result.get("fetched_at") or "")
    discovery = channel or discovery_channel(source, discovered_at)
    result.update({
        "original_source": original,
        "original_url": original_url,
        "canonical_url": original_url,
        "discovery_channel": discovery,
        "discovery_channels": merge_discovery_channels(result.get("discovery_channels"), discovery),
        "discovered_at": discovered_at,
        "source_type": original.get("source_type"),
        "source_confidence": original.get("source_confidence"),
        "source_usage": original.get("source_usage"),
        "publication_date_status": "known" if result.get("published_at") else result.get("publication_date_status") or "unknown",
    })
    if original.get("reliably_identified"):
        result.update({
            "source_id": original["id"], "source_name": original["name"],
            "source_class": original.get("class") or result.get("source_class"),
            "priority": original.get("priority") or result.get("priority"),
        })
    return result


def confidence_score(value: Any) -> int:
    if isinstance(value, dict):
        try:
            return int(value.get("score") or 0)
        except (TypeError, ValueError):
            return 0
    return 0


def merge_same_article(existing: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    merged = dict(existing)
    merged["discovery_channels"] = merge_discovery_channels(
        existing.get("discovery_channels"), existing.get("discovery_channel"),
        incoming.get("discovery_channels"), incoming.get("discovery_channel"),
    )
    dates = [str(value) for value in (existing.get("discovered_at"), incoming.get("discovered_at")) if value]
    if dates:
        merged["discovered_at"] = min(dates)
    if confidence_score(incoming.get("source_confidence")) > confidence_score(existing.get("source_confidence")):
        for key in ("original_source", "source_id", "source_name", "source_class", "priority", "source_type", "source_confidence", "source_usage"):
            merged[key] = incoming.get(key)
    if not merged.get("published_at") and incoming.get("published_at"):
        merged["published_at"] = incoming["published_at"]
        merged["publication_date_status"] = "known"
    if incoming.get("updated_at") and str(incoming["updated_at"]) > str(merged.get("updated_at") or ""):
        merged["updated_at"] = incoming["updated_at"]
    return merged
