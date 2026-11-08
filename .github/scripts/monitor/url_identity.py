from __future__ import annotations

import hashlib
import re
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
    # News Service Bund articles are mirrored under several department
    # subdomains. The stable language-group id identifies the same publication;
    # the mirror hostname is a discovery route, not a separate article.
    if host.endswith("admin.ch") and re.match(r"^/(?:[a-z]{2}/)?newnsb/[^/]+$", path, re.I):
        host = "admin.ch"
    return urllib.parse.urlunsplit((parsed.scheme.casefold(), host, path, urllib.parse.urlencode(query, doseq=True), ""))



def is_nzz_epaper_source(source: dict[str, Any]) -> bool:
    """Recognise NZZ PDF findings, not web articles that mention the e-paper."""
    source_id = str(source.get("source_id") or source.get("id") or "").casefold()
    if source_id in {"nzz-epaper", "nzzas-epaper"}:
        return True
    url = str(source.get("url") or "")
    return urllib.parse.urlsplit(url).netloc.casefold() == "epaper.nzz.ch" and str(source.get("source_role") or source.get("role") or "") == "early_epaper"


def article_identity(source: dict[str, Any]) -> str:
    """Deduplication identity; never replace the article's navigable canonical URL.

    NZZ e-paper pages all share the storefront canonical URL. They must not
    collapse into one article, even when the fragment (#page=N) is stripped.
    Preserve the normal canonical URL rules for web/RSS/Gmail/federal sources.
    """
    url = canonical_url(str(source.get("canonical_url") or source.get("url") or ""))
    if not is_nzz_epaper_source(source):
        return url

    source_id = str(source.get("source_id") or source.get("id") or "nzz-epaper").casefold()
    issue_date = ""
    for field in ("issue_date", "publication_date", "published_at"):
        match = re.match(r"^(20\d{2}-\d{2}-\d{2})(?:T|$)", str(source.get(field) or ""))
        if match:
            issue_date = match.group(1)
            break

    page = str(source.get("page") or "").strip()
    if not page:
        fragment = urllib.parse.urlsplit(str(source.get("url") or "")).fragment
        page = (urllib.parse.parse_qs(fragment).get("page") or [""])[0]
    if page.isdigit():
        page = str(int(page))

    title = re.sub(r"\W+", " ", str(source.get("title") or "").casefold()).strip()
    if not title:
        title = str(source.get("fingerprint") or "")
    if not title:
        # An incomplete e-paper record must never be grouped just by storefront.
        return ""
    token = hashlib.sha256(title.encode("utf-8")).hexdigest()[:24]
    return f"nzz-epaper:{source_id}:{issue_date or 'undated'}:{page or 'unknown'}:{token}"


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
