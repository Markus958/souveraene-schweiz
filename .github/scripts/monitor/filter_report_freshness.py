from __future__ import annotations

import json
import os
import re
import ssl
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

ZURICH = ZoneInfo("Europe/Zurich")
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153 Safari/537.36"
REPORT_DIR = Path("data/monitor/reports")

DATE_PATTERNS = (
    re.compile(r'"datePublished"\s*:\s*"([^"]+)"', re.I),
    re.compile(r'property=["\']article:published_time["\'][^>]*content=["\']([^"\']+)', re.I),
    re.compile(r'name=["\']date["\'][^>]*content=["\']([^"\']+)', re.I),
)
UPDATE_PATTERNS = (
    re.compile(r'"dateModified"\s*:\s*"([^"]+)"', re.I),
    re.compile(r'property=["\']article:modified_time["\'][^>]*content=["\']([^"\']+)', re.I),
)


def _parse_date(value: Any) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    text = text.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(text)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=ZURICH)
        return dt.astimezone(ZURICH).date().isoformat()
    except ValueError:
        match = re.search(r"\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b", text)
        if match:
            return f"{match.group(1)}-{int(match.group(2)):02d}-{int(match.group(3)):02d}"
    return None


def _request_html(url: str) -> str:
    headers = {
        "User-Agent": USER_AGENT,
        "Accept-Language": "de-CH,de;q=0.9,en;q=0.7",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    if urlparse(url).netloc.endswith("nzz.ch"):
        cookie = os.getenv("NZZ_COOKIE_HEADER", "").strip()
        if cookie:
            headers["Cookie"] = cookie
    req = urllib.request.Request(url, headers=headers)
    context = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=15, context=context) as response:
        raw = response.read(1_500_000)
    return raw.decode("utf-8", errors="replace")


def _extract_dates(url: str) -> dict[str, str | None]:
    try:
        html = _request_html(url)
    except Exception:
        return {"published_date": None, "updated_date": None}

    published = None
    updated = None
    for pattern in DATE_PATTERNS:
        match = pattern.search(html)
        if match:
            published = _parse_date(match.group(1))
            if published:
                break
    for pattern in UPDATE_PATTERNS:
        match = pattern.search(html)
        if match:
            updated = _parse_date(match.group(1))
            if updated:
                break
    return {"published_date": published, "updated_date": updated}


def _is_epaper(item: dict[str, Any], report_date: str) -> bool:
    source = item.get("source") or {}
    role = str(source.get("role") or "")
    url = str(source.get("url") or "")
    return ("early_epaper" in role or "epaper.nzz.ch" in url) and str(item.get("date") or report_date) == report_date


def _url(item: dict[str, Any]) -> str:
    source = item.get("source") or {}
    return str(source.get("url") or "").strip()


def _dedupe(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in items:
        key = str(item.get("event_id") or "") or _url(item) or str(item.get("headline") or "")
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def _fresh(item: dict[str, Any], report_date: str) -> bool:
    if _is_epaper(item, report_date):
        item["published_date"] = report_date
        item["freshness_basis"] = "epaper_today"
        return True

    published = _parse_date(item.get("published_date"))
    updated = _parse_date(item.get("updated_date"))
    if published == report_date:
        item["published_date"] = published
        item["updated_date"] = updated
        item["freshness_basis"] = "published_today"
        return True

    status = str(item.get("status") or "")
    if updated == report_date and status in {"Update", "Korrektur"}:
        item["published_date"] = published
        item["updated_date"] = updated
        item["freshness_basis"] = "material_update_today"
        return True

    item["published_date"] = published
    item["updated_date"] = updated
    item["freshness_basis"] = "excluded_old_or_unknown"
    return False


def main() -> int:
    report_date = datetime.now(ZURICH).date().isoformat()
    report_path = REPORT_DIR / f"{report_date}.json"
    if not report_path.is_file():
        raise SystemExit(f"Report not found: {report_path}")

    report = json.loads(report_path.read_text(encoding="utf-8"))
    pools = [
        report.get("news") or [],
        report.get("news_candidates") or [],
        report.get("news_candidate_pool") or [],
    ]
    all_items = _dedupe([item for pool in pools for item in pool if isinstance(item, dict)])

    urls = sorted({_url(item) for item in all_items if _url(item) and not _is_epaper(item, report_date)})
    dates_by_url: dict[str, dict[str, str | None]] = {}
    with ThreadPoolExecutor(max_workers=12) as executor:
        futures = {executor.submit(_extract_dates, url): url for url in urls}
        for future in as_completed(futures):
            url = futures[future]
            try:
                dates_by_url[url] = future.result()
            except Exception:
                dates_by_url[url] = {"published_date": None, "updated_date": None}

    for item in all_items:
        info = dates_by_url.get(_url(item))
        if info:
            item.update(info)

    by_key: dict[str, dict[str, Any]] = {}
    for item in all_items:
        key = str(item.get("event_id") or "") or _url(item) or str(item.get("headline") or "")
        by_key[key] = item

    def refresh(pool: list[dict[str, Any]]) -> list[dict[str, Any]]:
        result = []
        for original in pool:
            if not isinstance(original, dict):
                continue
            key = str(original.get("event_id") or "") or _url(original) or str(original.get("headline") or "")
            item = by_key.get(key, original)
            if _fresh(item, report_date):
                result.append(item)
        return result

    before_news = len(report.get("news") or [])
    before_candidates = len(report.get("news_candidates") or [])
    report["news"] = refresh(report.get("news") or [])
    report["news_candidates"] = refresh(report.get("news_candidates") or [])
    report["news_candidate_pool"] = refresh(report.get("news_candidate_pool") or [])
    report["freshness_policy"] = {
        "timezone": "Europe/Zurich",
        "rule": "published_today_or_material_update_today",
        "unknown_dates_visible": False,
        "report_date": report_date,
        "filtered_news": before_news - len(report["news"]),
        "filtered_candidates": before_candidates - len(report["news_candidates"]),
    }

    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"Freshness filter: news {before_news}->{len(report['news'])}; "
        f"candidates {before_candidates}->{len(report['news_candidates'])}; date={report_date}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
