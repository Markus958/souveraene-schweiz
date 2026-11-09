from __future__ import annotations

import hashlib
import html
import json
import os
import re
import ssl
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from typing import Any, Callable

from source_identity import apply_source_model, load_source_registry, resolve_original_source
from url_identity import canonical_url, merge_discovery_channels

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153 Safari/537.36"
SOURCE_REGISTRY = load_source_registry()


@dataclass
class Finding:
    source_id: str
    source_name: str
    source_class: str
    priority: str
    title: str
    url: str
    fingerprint: str
    fetched_at: str
    topics: list[str]
    published_at: str | None = None
    updated_at: str | None = None
    subtitle: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[tuple[str, str]] = []
        self._href: str | None = None
        self._parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        href = dict(attrs).get("href")
        if href:
            self._href = href
            self._parts = []

    def handle_data(self, data: str) -> None:
        if self._href is not None:
            text = re.sub(r"\s+", " ", data).strip()
            if text:
                self._parts.append(text)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "a" and self._href is not None:
            text = re.sub(r"\s+", " ", " ".join(self._parts)).strip()
            self.links.append((self._href, text))
            self._href = None
            self._parts = []


def _fingerprint(source_id: str, title: str, url: str) -> str:
    raw = f"{source_id}|{title.casefold()}|{url}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _request(url: str, headers: dict[str, str] | None = None, timeout: int = 25) -> tuple[bytes, str, int, str]:
    req = urllib.request.Request(url, headers=headers or {})
    context = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=timeout, context=context) as response:
        raw = response.read(4_000_000)
        content_type = response.headers.get_content_type() or "application/octet-stream"
        return raw, response.geturl(), int(response.status), content_type


def _browser_headers() -> dict[str, str]:
    return {
        "User-Agent": USER_AGENT,
        "Accept-Language": "de-CH,de;q=0.9,en;q=0.7",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }


def _fetch_html(source: dict[str, Any], timeout: int = 25) -> tuple[str, str, int]:
    headers = _browser_headers()
    if source.get("method") == "authenticated_html":
        secret_name = source.get("auth_secret")
        cookie = os.getenv(secret_name or "")
        if not cookie:
            raise RuntimeError(f"auth secret missing: {secret_name}")
        headers["Cookie"] = cookie

    raw, final_url, status, _content_type = _request(source["url"], headers=headers, timeout=timeout)
    text = raw.decode("utf-8", errors="replace")
    return text, final_url, status


def _is_candidate(title: str, url: str, base_host: str, source: dict[str, Any]) -> bool:
    if len(title) < 18 or len(title) > 260:
        return False
    lowered = title.casefold()
    reject = (
        "mehr erfahren", "weiterlesen", "zum inhalt", "zum hauptinhalt", "navigation", "kontakt", "impressum",
        "datenschutz", "cookie", "login", "anmelden", "newsletter", "abo", "abonnieren",
        "social media", "facebook", "instagram", "linkedin", "youtube", "x.com", "stellenangebote",
        "der bund kurz erklärt", "mitglieder nach kantonen", "mutationen nationalrat", "mutationen ständerat",
        "writeResource(".casefold(),
    )
    if any(term in lowered for term in reject):
        return False
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return False
    if base_host and not (parsed.netloc == base_host or parsed.netloc.endswith("." + base_host)):
        return False

    includes = [str(x) for x in source.get("url_include", []) if str(x)]
    if includes and not any(part in parsed.path for part in includes):
        return False
    excludes = [str(x) for x in source.get("url_exclude", []) if str(x)]
    if excludes and any(part in parsed.path for part in excludes):
        return False
    return True


def _normalize_datetime(value: Any) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        dt = parsedate_to_datetime(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except (TypeError, ValueError, OverflowError):
        pass
    candidate = text.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(candidate)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except ValueError:
        return None


def _strip_markup(value: Any) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(re.sub(r"\s+", " ", text)).strip()
    return text[:600] or None


def _finding(
    source: dict[str, Any],
    title: str,
    url: str,
    fetched_at: str,
    *,
    published_at: Any = None,
    updated_at: Any = None,
    subtitle: Any = None,
    publisher: Any = None,
) -> dict[str, Any]:
    title = html.unescape(re.sub(r"\s+", " ", title)).strip()
    finding = Finding(
        source_id=source["id"],
        source_name=source["name"],
        source_class=source["class"],
        priority=source["priority"],
        title=title,
        url=url,
        fingerprint=_fingerprint(source["id"], title, url),
        fetched_at=fetched_at,
        topics=list(source.get("topics", [])),
        published_at=_normalize_datetime(published_at),
        updated_at=_normalize_datetime(updated_at),
        subtitle=_strip_markup(subtitle),
    ).to_dict()
    return apply_source_model(finding, source, SOURCE_REGISTRY, publisher=str(publisher or "") or None)


def _fetch_html_findings(source: dict[str, Any], max_findings: int) -> tuple[list[dict[str, Any]], str, int]:
    page, final_url, status = _fetch_html(source)
    if status != 200:
        return [], final_url, status

    parser = LinkParser()
    parser.feed(page)
    base_host = urllib.parse.urlparse(final_url).netloc.lower()
    dedup: set[tuple[str, str]] = set()
    findings: list[dict[str, Any]] = []
    fetched_at = datetime.now(timezone.utc).isoformat()

    for href, raw_title in parser.links:
        title = html.unescape(re.sub(r"\s+", " ", raw_title)).strip()
        absolute = urllib.parse.urljoin(final_url, href)
        absolute, _frag = urllib.parse.urldefrag(absolute)
        key = (title.casefold(), absolute)
        if key in dedup or not _is_candidate(title, absolute, base_host, source):
            continue
        dedup.add(key)
        findings.append(_finding(source, title, absolute, fetched_at))
        if len(findings) >= max_findings:
            break
    return findings, final_url, status


def _xml_text(node: ET.Element, names: tuple[str, ...]) -> str | None:
    for name in names:
        value = node.findtext(name)
        if value and value.strip():
            return value.strip()
    for child in list(node):
        local = child.tag.rsplit("}", 1)[-1].casefold()
        if local in {name.casefold() for name in names} and child.text and child.text.strip():
            return child.text.strip()
    return None


def _fetch_rss_findings(source: dict[str, Any], max_findings: int) -> tuple[list[dict[str, Any]], str, int]:
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9,*/*;q=0.5",
    }
    raw, final_url, status, _content_type = _request(source["url"], headers=headers)
    if status != 200:
        return [], final_url, status

    root = ET.fromstring(raw)
    findings: list[dict[str, Any]] = []
    fetched_at = datetime.now(timezone.utc).isoformat()

    items = root.findall(".//item")
    if items:
        for item in items[:max_findings]:
            title = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            published = _xml_text(item, ("pubDate", "date", "published"))
            updated = _xml_text(item, ("updated", "modified", "lastBuildDate"))
            description = _xml_text(item, ("description", "summary", "content"))
            if title and link:
                findings.append(_finding(
                    source, title, link, fetched_at,
                    published_at=published, updated_at=updated, subtitle=description,
                ))
        return findings, final_url, status

    ns = {"atom": "http://www.w3.org/2005/Atom"}
    for entry in root.findall(".//atom:entry", ns)[:max_findings]:
        title = (entry.findtext("atom:title", default="", namespaces=ns) or "").strip()
        link = ""
        for link_el in entry.findall("atom:link", ns):
            rel = (link_el.get("rel") or "alternate").casefold()
            href = (link_el.get("href") or "").strip()
            if href and rel in {"alternate", ""}:
                link = href
                break
            if href and not link:
                link = href
        published = entry.findtext("atom:published", default="", namespaces=ns)
        updated = entry.findtext("atom:updated", default="", namespaces=ns)
        summary = entry.findtext("atom:summary", default="", namespaces=ns) or entry.findtext("atom:content", default="", namespaces=ns)
        if title and link:
            findings.append(_finding(
                source, title, link, fetched_at,
                published_at=published, updated_at=updated, subtitle=summary,
            ))
    return findings, final_url, status


def _first_record_value(record: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        value = record.get(key)
        if value not in (None, ""):
            return value
    return None


def _fetch_nsb_findings(source: dict[str, Any], max_findings: int) -> tuple[list[dict[str, Any]], str, int]:
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=3)
    params = {
        "languages": "de",
        "limit": str(min(max_findings, 50)),
        "offset": "0",
        "newsCategoryIDs": "medienmitteilung",
        "start_date": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "end_date": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    url = source["url"] + "?" + urllib.parse.urlencode(params)
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    raw, final_url, status, _content_type = _request(url, headers=headers)
    if status != 200:
        return [], final_url, status

    payload = json.loads(raw.decode("utf-8", errors="replace"))
    records: list[dict[str, Any]] = []
    if isinstance(payload, list):
        records = payload
    elif isinstance(payload, dict):
        for key in ("items", "results", "news", "content"):
            value = payload.get(key)
            if isinstance(value, list):
                records = value
                break

    findings: list[dict[str, Any]] = []
    fetched_at = now.isoformat()
    for record in records[:max_findings]:
        if not isinstance(record, dict):
            continue
        title = str(record.get("title") or record.get("headline") or record.get("label") or "").strip()
        detail_url = str(record.get("url") or record.get("webUrl") or record.get("link") or "").strip()
        if not detail_url:
            lang_group = record.get("languageGroupId") or record.get("langGroupId")
            rid = record.get("id")
            if lang_group:
                detail_url = f"https://www.admin.ch/de/newnsb/{lang_group}"
            elif rid:
                detail_url = f"https://www.newsd.admin.ch/v1/{rid}"
        published = _first_record_value(record, (
            "publicationDate", "publishedAt", "published_at", "date", "newsDate", "releaseDate", "createdAt", "created_at",
        ))
        updated = _first_record_value(record, (
            "modifiedAt", "modified_at", "updatedAt", "updated_at", "lastModified", "lastModifiedAt",
        ))
        subtitle = _first_record_value(record, ("lead", "subtitle", "description", "summary", "abstract"))
        publisher = _first_record_value(record, ("publisher", "organization", "organisation", "office", "department", "author"))
        if title and detail_url:
            findings.append(_finding(
                source, title, detail_url, fetched_at,
                published_at=published, updated_at=updated, subtitle=subtitle, publisher=publisher,
            ))
    return findings, final_url, status


def _parse_feed_time(value: Any) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value or "").replace("Z", "+00:00"))
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def _fetch_gmail_feed_findings(
    source: dict[str, Any], max_findings: int,
) -> tuple[list[dict[str, Any]], str, int, dict[str, Any]]:
    url = os.getenv("GMAIL_FEED_URL", "").strip() or str(source.get("url") or "")
    api_key = os.getenv("GMAIL_FEED_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("auth secret missing: GMAIL_FEED_API_KEY")
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
        "X-API-Key": api_key,
    }
    raw, final_url, status, _content_type = _request(url, headers=headers)
    if status != 200:
        return [], final_url, status, {
            "last_successful_gmail_fetch_at": None,
            "feed_age_seconds": None,
            "feed_stale": True,
            "stale_after_seconds": int(os.getenv("GMAIL_FEED_STALE_AFTER_SECONDS", "2700")),
        }
    payload = json.loads(raw.decode("utf-8", errors="replace"))
    schema_version = int(payload.get("schema_version", 0) or 0) if isinstance(payload, dict) else 0
    if not isinstance(payload, dict) or schema_version not in {1, 2}:
        raise ValueError("unsupported Gmail feed schema")
    records = payload.get("findings")
    if not isinstance(records, list):
        raise ValueError("Gmail feed findings must be an array")

    generated = _parse_feed_time(payload.get("last_successful_gmail_fetch_at") or payload.get("generated_at"))
    age_seconds = int((datetime.now(timezone.utc) - generated).total_seconds()) if generated else None
    stale_after = int(os.getenv("GMAIL_FEED_STALE_AFTER_SECONDS", "2700"))
    diagnostics = dict(payload.get("diagnostics") or {})
    diagnostics.update({
        "last_successful_gmail_fetch_at": generated.isoformat() if generated else None,
        "feed_age_seconds": age_seconds,
        "feed_stale": age_seconds is None or age_seconds > stale_after,
        "stale_after_seconds": stale_after,
    })

    findings: list[dict[str, Any]] = []
    fetched_at = datetime.now(timezone.utc).isoformat()
    for record in records[:max_findings]:
        if not isinstance(record, dict):
            continue
        title = str(record.get("title") or "").strip()
        article_url = canonical_url(str(record.get("canonical_url") or record.get("url") or "").strip())
        if not title or not article_url.startswith(("https://", "http://")):
            continue
        original = record.get("original_source") if isinstance(record.get("original_source"), dict) else {}
        original_source = dict(original) if original else resolve_original_source(article_url, None, SOURCE_REGISTRY)
        mapped_source = dict(source)
        mapped_source.update({
            "id": original_source["id"], "name": original_source["name"],
            "class": original_source.get("class") or source.get("class"),
            "priority": original_source.get("priority") or source.get("priority"),
        })
        item = _finding(
            mapped_source,
            title,
            article_url,
            fetched_at,
            # Schema 1 used the email timestamp as the article publication date.
            # It is not reliable evidence and must not pass the freshness gate.
            published_at=record.get("published_at") if schema_version >= 2 else None,
            updated_at=record.get("updated_at"),
            subtitle=record.get("subtitle"),
        )
        item.update({
            "source_role": "newsletter_lead",
            "source_stage": "Newsletter-Hinweis",
            # A newsletter is a discovery lead, never an automatic primary source.
            "newsletter_message_hash": str(record.get("newsletter_message_hash") or "")[:64],
            "canonical_url": article_url,
            "original_source": original_source,
            "source_type": original_source.get("source_type") or item.get("source_type"),
            "source_confidence": original_source.get("source_confidence") or item.get("source_confidence"),
            "source_usage": original_source.get("source_usage") or item.get("source_usage"),
            "discovery_channel": record.get("discovery_channel") or {"id": "gmail-newsletters", "name": "Gmail Newsletter"},
            "discovery_channels": merge_discovery_channels(
                record.get("discovery_channels"), record.get("discovery_channel") or {"id": "gmail-newsletters", "name": "Gmail Newsletter"}
            ),
            "newsletter_sent_at": record.get("newsletter_sent_at"),
            "received_at": record.get("received_at"),
            "publication_date_status": (
                record.get("publication_date_status") or ("known" if record.get("published_at") else "unknown")
            ) if schema_version >= 2 else "unknown_legacy_email_date",
            "gmail_feed_stale": diagnostics["feed_stale"],
        })
        findings.append(item)
    return findings, final_url, status, diagnostics


def fetch_source(source: dict[str, Any], max_findings: int = 30) -> dict[str, Any]:
    started = datetime.now(timezone.utc)
    result: dict[str, Any] = {
        "source_id": source.get("id"),
        "source_name": source.get("name"),
        "priority": source.get("priority"),
        "status": "unreachable",
        "http_status": None,
        "final_url": None,
        "attempted_at": started.isoformat(),
        "findings": [],
        "error": None,
    }

    try:
        method = source.get("method", "html")
        if method == "rss":
            findings, final_url, status = _fetch_rss_findings(source, max_findings)
        elif method == "nsb_search":
            findings, final_url, status = _fetch_nsb_findings(source, max_findings)
        elif method == "gmail_feed":
            findings, final_url, status, diagnostics = _fetch_gmail_feed_findings(source, max_findings)
            result["diagnostics"] = diagnostics
        else:
            findings, final_url, status = _fetch_html_findings(source, max_findings)

        result["http_status"] = status
        result["final_url"] = final_url
        result["findings"] = findings
        result["status"] = "new_publication" if findings else "checked_no_new"
        if method == "gmail_feed" and result.get("diagnostics", {}).get("feed_stale"):
            result["status"] = "stale_feed"
            result["error"] = "Gmail feed is stale; last successful collector run exceeds threshold"
        if status != 200:
            result["status"] = "unreachable"
        return result
    except Exception as exc:
        message = f"{type(exc).__name__}: {exc}"
        result["error"] = message[:500]
        result["status"] = "auth_failed" if "auth secret missing" in message else "unreachable"
        return result


def source_enabled(source: dict[str, Any]) -> bool:
    enabled = source.get("enabled", True) is not False
    enabled_env = str(source.get("enabled_env") or "").strip()
    if enabled_env:
        enabled = os.getenv(enabled_env, "").strip().casefold() in {"1", "true", "yes", "on"}
    return enabled


def fetch_all(sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    results = []
    for source in sources:
        if not source_enabled(source):
            continue
        try:
            max_findings = int(source.get("max_findings", 30))
        except (TypeError, ValueError):
            max_findings = 30
        max_findings = max(1, min(max_findings, 200))
        results.append(fetch_source(source, max_findings=max_findings))
    return results


def retry_failed_priority_sources(
    sources: list[dict[str, Any]],
    results: list[dict[str, Any]],
    *,
    fetcher: Callable[..., dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Retry only transiently unreachable P1 sources, before any evaluation.

    A full monitor rerun would repeat all source requests, the AI shadow
    analysis, state processing, and public report generation. Preserve every
    successful first-attempt result, retry each eligible failed source once,
    and leave the run explicitly incomplete if that retry also fails.
    Permanent authentication, structure and stale-feed errors are not retried.
    """
    retry_fetch = fetcher if fetcher is not None else fetch_source
    enabled = {
        str(source.get("id") or ""): source
        for source in sources if source_enabled(source)
    }
    combined: list[dict[str, Any]] = []
    for original in results:
        source = enabled.get(str(original.get("source_id") or ""))
        if not source or original.get("priority") != "P1" or original.get("status") != "unreachable":
            combined.append(original)
            continue
        # Authentication/configuration 4xx errors are not transient. A timeout
        # (no HTTP status), HTTP 408/429 or a server failure may be retried.
        http_status = original.get("http_status")
        if isinstance(http_status, int) and 400 <= http_status < 500 and http_status not in {408, 429}:
            combined.append(original)
            continue

        try:
            max_findings = int(source.get("max_findings", 30))
        except (TypeError, ValueError):
            max_findings = 30
        max_findings = max(1, min(max_findings, 200))
        try:
            retried = retry_fetch(source, max_findings=max_findings)
        except Exception as exc:
            # Keep the original source result, including any partial findings.
            retried = {"status": "unreachable", "error": type(exc).__name__}

        retry_status = str(retried.get("status") or "unreachable") if isinstance(retried, dict) else "unreachable"
        recovered = retry_status in {"new_publication", "checked_no_new"}
        final = dict(retried if recovered else original)
        final["source_retry"] = {
            "attempts": 2,
            "initial_status": original.get("status"),
            "retry_status": retry_status,
            "recovered": recovered,
        }
        combined.append(final)
    return combined
