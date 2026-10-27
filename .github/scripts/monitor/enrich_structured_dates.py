from __future__ import annotations

import json
import ssl
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

ZURICH = ZoneInfo("Europe/Zurich")
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153 Safari/537.36"
SOURCES_PATH = Path("data/monitor/config/sources.json")
REPORT_DIR = Path("data/monitor/reports")


def _request(url: str, accept: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": accept})
    with urllib.request.urlopen(req, timeout=20, context=ssl.create_default_context()) as response:
        return response.read(4_000_000)


def _iso(value: Any) -> str | None:
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
    try:
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except ValueError:
        return None


def _norm_url(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    parsed = urllib.parse.urlsplit(text)
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    query = [(k, v) for k, v in query if k.casefold() not in {"utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"}]
    path = parsed.path.rstrip("/") or "/"
    return urllib.parse.urlunsplit((parsed.scheme.casefold(), parsed.netloc.casefold(), path, urllib.parse.urlencode(query), ""))


def _child_text(node: ET.Element, names: set[str]) -> str | None:
    for child in list(node):
        local = child.tag.rsplit("}", 1)[-1].casefold()
        if local in names and child.text and child.text.strip():
            return child.text.strip()
    return None


def _rss_map(source: dict[str, Any]) -> dict[str, dict[str, str | None]]:
    raw = _request(source["url"], "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9,*/*;q=0.5")
    root = ET.fromstring(raw)
    result: dict[str, dict[str, str | None]] = {}

    items = root.findall(".//item")
    if items:
        for item in items:
            link = (item.findtext("link") or "").strip()
            if not link:
                continue
            published = _child_text(item, {"pubdate", "date", "published", "issued"})
            updated = _child_text(item, {"updated", "modified", "lastmodified"})
            result[_norm_url(link)] = {"published_at": _iso(published), "updated_at": _iso(updated)}
        return result

    ns = {"atom": "http://www.w3.org/2005/Atom"}
    for entry in root.findall(".//atom:entry", ns):
        link = ""
        for link_el in entry.findall("atom:link", ns):
            href = (link_el.get("href") or "").strip()
            rel = (link_el.get("rel") or "alternate").casefold()
            if href and rel in {"alternate", ""}:
                link = href
                break
            if href and not link:
                link = href
        if not link:
            continue
        published = entry.findtext("atom:published", default="", namespaces=ns)
        updated = entry.findtext("atom:updated", default="", namespaces=ns)
        result[_norm_url(link)] = {"published_at": _iso(published), "updated_at": _iso(updated)}
    return result


def _first(record: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        value = record.get(key)
        if value not in (None, ""):
            return value
    return None


def _nsb_map(source: dict[str, Any]) -> dict[str, dict[str, str | None]]:
    now = datetime.now(timezone.utc)
    params = {
        "languages": "de",
        "limit": "50",
        "offset": "0",
        "newsCategoryIDs": "medienmitteilung",
        "start_date": (now - timedelta(days=3)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "end_date": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    raw = _request(source["url"] + "?" + urllib.parse.urlencode(params), "application/json")
    payload = json.loads(raw.decode("utf-8", errors="replace"))
    records: list[dict[str, Any]] = []
    if isinstance(payload, list):
        records = [r for r in payload if isinstance(r, dict)]
    elif isinstance(payload, dict):
        for key in ("items", "results", "news", "content"):
            value = payload.get(key)
            if isinstance(value, list):
                records = [r for r in value if isinstance(r, dict)]
                break

    result: dict[str, dict[str, str | None]] = {}
    for record in records:
        url = str(record.get("url") or record.get("webUrl") or record.get("link") or "").strip()
        if not url:
            lang_group = record.get("languageGroupId") or record.get("langGroupId")
            rid = record.get("id")
            if lang_group:
                url = f"https://www.admin.ch/de/newnsb/{lang_group}"
            elif rid:
                url = f"https://www.newsd.admin.ch/v1/{rid}"
        if not url:
            continue
        published = _first(record, ("publicationDate", "publishedAt", "published_at", "date", "newsDate", "releaseDate", "createdAt", "created_at"))
        updated = _first(record, ("modifiedAt", "modified_at", "updatedAt", "updated_at", "lastModified", "lastModifiedAt"))
        result[_norm_url(url)] = {"published_at": _iso(published), "updated_at": _iso(updated)}
    return result


def _date_only(value: Any) -> str | None:
    iso = _iso(value)
    if not iso:
        return None
    return datetime.fromisoformat(iso).astimezone(ZURICH).date().isoformat()


def _item_sources(item: dict[str, Any]) -> list[dict[str, Any]]:
    sources: list[dict[str, Any]] = []
    primary = item.get("source")
    if isinstance(primary, dict):
        sources.append(primary)
    for source in item.get("sources") or []:
        if isinstance(source, dict):
            sources.append(source)
    return sources


def main() -> int:
    report_date = datetime.now(ZURICH).date().isoformat()
    report_path = REPORT_DIR / f"{report_date}.json"
    if not report_path.is_file():
        raise SystemExit(f"Report not found: {report_path}")

    sources = json.loads(SOURCES_PATH.read_text(encoding="utf-8"))
    structured: dict[str, dict[str, dict[str, str | None]]] = {}
    errors: list[str] = []
    for source in sources:
        if not isinstance(source, dict) or source.get("enabled", True) is False:
            continue
        method = str(source.get("method") or "")
        source_id = str(source.get("id") or "")
        if method not in {"rss", "nsb_search"}:
            continue
        try:
            structured[source_id] = _rss_map(source) if method == "rss" else _nsb_map(source)
        except Exception as exc:
            errors.append(f"{source_id}: {type(exc).__name__}: {exc}")

    report = json.loads(report_path.read_text(encoding="utf-8"))
    enriched = 0
    for pool_name in ("news", "news_candidates", "news_candidate_pool"):
        for item in report.get(pool_name) or []:
            if not isinstance(item, dict):
                continue
            matches: list[dict[str, str | None]] = []
            for source in _item_sources(item):
                source_id = str(source.get("id") or "")
                url = _norm_url(source.get("url"))
                info = structured.get(source_id, {}).get(url)
                if info:
                    matches.append(info)
            if not matches:
                continue
            published_dates = [_date_only(m.get("published_at")) for m in matches]
            updated_dates = [_date_only(m.get("updated_at")) for m in matches]
            published_dates = [d for d in published_dates if d]
            updated_dates = [d for d in updated_dates if d]
            if published_dates:
                item["published_date"] = max(published_dates)
            if updated_dates:
                item["updated_date"] = max(updated_dates)
            item["date_source"] = "structured_feed_or_api"
            enriched += 1

    report["structured_date_enrichment"] = {
        "report_date": report_date,
        "sources_checked": len(structured),
        "items_enriched": enriched,
        "errors": errors[:10],
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Structured date enrichment: sources={len(structured)} items={enriched} errors={len(errors)}")
    for error in errors[:10]:
        print(f"- {error}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
