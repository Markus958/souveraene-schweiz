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
from html.parser import HTMLParser
from typing import Any

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153 Safari/537.36"


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


def _finding(source: dict[str, Any], title: str, url: str, fetched_at: str) -> dict[str, Any]:
    title = html.unescape(re.sub(r"\s+", " ", title)).strip()
    return Finding(
        source_id=source["id"],
        source_name=source["name"],
        source_class=source["class"],
        priority=source["priority"],
        title=title,
        url=url,
        fingerprint=_fingerprint(source["id"], title, url),
        fetched_at=fetched_at,
        topics=list(source.get("topics", [])),
    ).to_dict()


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
            if title and link:
                findings.append(_finding(source, title, link, fetched_at))
        return findings, final_url, status

    ns = {"atom": "http://www.w3.org/2005/Atom"}
    for entry in root.findall(".//atom:entry", ns)[:max_findings]:
        title = (entry.findtext("atom:title", default="", namespaces=ns) or "").strip()
        link_el = entry.find("atom:link", ns)
        link = (link_el.get("href") if link_el is not None else "") or ""
        if title and link:
            findings.append(_finding(source, title, link.strip(), fetched_at))
    return findings, final_url, status


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
        if title and detail_url:
            findings.append(_finding(source, title, detail_url, fetched_at))
    return findings, final_url, status


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
        else:
            findings, final_url, status = _fetch_html_findings(source, max_findings)

        result["http_status"] = status
        result["final_url"] = final_url
        result["findings"] = findings
        result["status"] = "new_publication" if findings else "checked_no_new"
        if status != 200:
            result["status"] = "unreachable"
        return result
    except Exception as exc:
        message = f"{type(exc).__name__}: {exc}"
        result["error"] = message[:500]
        result["status"] = "auth_failed" if "auth secret missing" in message else "unreachable"
        return result


def fetch_all(sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    results = []
    for source in sources:
        if source.get("enabled", True) is False:
            continue
        results.append(fetch_source(source))
    return results
