from __future__ import annotations

import hashlib
import html
import os
import re
import ssl
import urllib.parse
import urllib.request
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
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
        attrs_dict = dict(attrs)
        href = attrs_dict.get("href")
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


def _fetch_html(source: dict[str, Any], timeout: int = 25) -> tuple[str, str, int]:
    headers = {
        "User-Agent": USER_AGENT,
        "Accept-Language": "de-CH,de;q=0.9,en;q=0.7",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    if source.get("method") == "authenticated_html":
        secret_name = source.get("auth_secret")
        cookie = os.getenv(secret_name or "")
        if not cookie:
            raise RuntimeError(f"auth secret missing: {secret_name}")
        headers["Cookie"] = cookie

    req = urllib.request.Request(source["url"], headers=headers)
    context = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=timeout, context=context) as response:
        raw = response.read(3_000_000)
        charset = response.headers.get_content_charset() or "utf-8"
        text = raw.decode(charset, errors="replace")
        return text, response.geturl(), int(response.status)


def _is_candidate(title: str, url: str, base_host: str) -> bool:
    if len(title) < 18 or len(title) > 260:
        return False
    lowered = title.casefold()
    reject = (
        "mehr erfahren", "weiterlesen", "zum inhalt", "navigation", "kontakt", "impressum",
        "datenschutz", "cookie", "login", "anmelden", "newsletter", "abo", "abonnieren",
        "social media", "facebook", "instagram", "linkedin", "youtube", "x.com",
    )
    if any(term in lowered for term in reject):
        return False
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return False
    if not parsed.netloc:
        return False
    # Prefer same-site editorial/publication links; external links are usually navigation/noise.
    if base_host and not (parsed.netloc == base_host or parsed.netloc.endswith("." + base_host)):
        return False
    return True


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
        page, final_url, status = _fetch_html(source)
        result["http_status"] = status
        result["final_url"] = final_url
        if status != 200:
            result["status"] = "unreachable"
            return result

        parser = LinkParser()
        parser.feed(page)
        base_host = urllib.parse.urlparse(final_url).netloc.lower()
        dedup: set[tuple[str, str]] = set()
        findings: list[Finding] = []
        fetched_at = datetime.now(timezone.utc).isoformat()

        for href, raw_title in parser.links:
            title = html.unescape(re.sub(r"\s+", " ", raw_title)).strip()
            absolute = urllib.parse.urljoin(final_url, href)
            absolute, _frag = urllib.parse.urldefrag(absolute)
            key = (title.casefold(), absolute)
            if key in dedup or not _is_candidate(title, absolute, base_host):
                continue
            dedup.add(key)
            findings.append(
                Finding(
                    source_id=source["id"],
                    source_name=source["name"],
                    source_class=source["class"],
                    priority=source["priority"],
                    title=title,
                    url=absolute,
                    fingerprint=_fingerprint(source["id"], title, absolute),
                    fetched_at=fetched_at,
                    topics=list(source.get("topics", [])),
                )
            )
            if len(findings) >= max_findings:
                break

        result["findings"] = [f.to_dict() for f in findings]
        result["status"] = "new_publication" if findings else "checked_no_new"
        return result
    except Exception as exc:
        message = f"{type(exc).__name__}: {exc}"
        result["error"] = message[:500]
        if "auth secret missing" in message:
            result["status"] = "auth_failed"
        else:
            result["status"] = "unreachable"
        return result


def fetch_all(sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    results = []
    for source in sources:
        if source.get("enabled", True) is False:
            continue
        results.append(fetch_source(source))
    return results
