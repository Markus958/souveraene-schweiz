from __future__ import annotations

import urllib.parse
from typing import Any


TRACKING_QUERY_PREFIXES = ("utm_",)
TRACKING_QUERY_KEYS = {
    "fbclid", "gclid", "mc_cid", "mc_eid", "mkt_tok", "ref", "source",
    "campaign", "campaign_id", "newsletter", "s", "pk_campaign", "pk_kwd",
}


def normalise_host(value: str) -> str:
    host = (value or "").split(":", 1)[0].casefold().strip(".")
    return host[4:] if host.startswith("www.") else host


def canonical_url(value: str) -> str:
    """Return a stable article identity without fragments or tracking parameters."""
    try:
        parsed = urllib.parse.urlsplit((value or "").strip())
    except ValueError:
        return (value or "").strip()
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return (value or "").strip()
    host = normalise_host(parsed.netloc)
    query = []
    for key, item in urllib.parse.parse_qsl(parsed.query, keep_blank_values=True):
        lowered = key.casefold()
        if lowered in TRACKING_QUERY_KEYS or lowered.startswith(TRACKING_QUERY_PREFIXES):
            continue
        query.append((key, item))
    path = parsed.path or "/"
    if path != "/":
        path = path.rstrip("/")
    return urllib.parse.urlunsplit((parsed.scheme.casefold(), host, path, urllib.parse.urlencode(query, doseq=True), ""))


def discovery_key(channel: dict[str, Any]) -> str:
    return "|".join(str(channel.get(key) or "") for key in ("id", "newsletter_message_hash", "newsletter_sent_at"))


def merge_discovery_channels(*groups: Any) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()
    for group in groups:
        values = group if isinstance(group, list) else [group]
        for value in values:
            if not isinstance(value, dict):
                continue
            clean = {str(k): v for k, v in value.items() if v not in (None, "", [])}
            key = discovery_key(clean)
            if key and key not in seen:
                seen.add(key)
                merged.append(clean)
    return merged
