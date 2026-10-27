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

CORE_RELEVANCE_TERMS = {
    "vertragspaket", "eu-paket", "integrationsvertrag", "schweiz–eu", "schweiz-eu",
    "stromabkommen", "personenfreizügigkeit", "personenfreizuegigkeit", "souveränität", "souveraenitaet",
    "eu-verfahren", "eu-parlament", "afet", "2025/0162",
    "ahv", "13. ahv", "mehrwertsteuer", "mwst", "staatsfinanzen", "bundeshaushalt",
    "ubs", "finma", "snb", "credit suisse", "bankenregulierung",
    "f-35", "f35", "patriot", "air2030", "bodluv", "beschaffung",
    "migration", "zuwanderung", "asyl", "abschiebung", "rückkehr", "rueckkehr",
    "referendum", "abstimmung", "volksinitiative", "ständemehr", "staendemehr",
    "regulierung", "marktzugang", "versorgungssicherheit", "importabhängigkeit", "importabhaengigkeit",
    "staatsausgaben", "steuererhöhung", "steuererhoehung", "subvention", "vollzug", "fehlsteuerung",
    "pensionskasse", "cyberangriff", "citysoftnet", "srg", "medienabgabe", "postfinance", "mercosur",
}

MEDIUM_RELEVANCE_TERMS = {
    "bundesrat", "nationalrat", "ständerat", "staenderat", "parlament", "finanzierung", "kosten",
    "milliarden", "steuern", "armee", "energie", "wettbewerb", "verwaltung", "freihandel",
    "wohnungsmarkt", "bildung", "pisa", "service public", "staatsunternehmen",
}

WEAK_ONLY_TERMS = {
    "schweiz-bezug", "schweiz", "rüstung", "ruestung", "sicherheit", "svp", "sp", "fdp",
    "die mitte", "grüne", "gruene", "glp", "partei", "politik",
}

NOVELTY_ACTION_TERMS = (
    "beschliesst", "beschloss", "beschlossen", "entscheid", "entscheidet", "entscheidet sich",
    "stimmt", "stimmte", "lehnt ab", "stellt sich gegen", "beantragt", "fordert", "verabschiedet",
    "genehmigt", "kündigt an", "kuendigt an", "tritt in kraft", "einigt sich", "vereinbart",
    "senkt", "erhöht", "erhoeht", "streicht", "kürzt", "kuerzt", "stoppt", "verschiebt",
    "legt vor", "veröffentlicht", "veroeffentlicht", "präsentiert", "praesentiert", "revidiert",
    "warnt", "bestätigt", "bestaetigt", "kandidiert", "kandidatur", "mehrheit", "knappes ja",
)

LOW_NOVELTY_MARKERS = (
    "kommentar", "analyse", "meinung", "gastkommentar", "rückblick", "rueckblick", "porträt", "portraet",
    "was sie wissen müssen", "was sie wissen muessen", "erklärt", "erklaert", "interview",
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


def _key(item: dict[str, Any]) -> str:
    return str(item.get("event_id") or "") or _url(item) or str(item.get("headline") or "")


def _dedupe(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in items:
        key = _key(item)
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


def _text(item: dict[str, Any]) -> str:
    detail = item.get("article_detail") if isinstance(item.get("article_detail"), dict) else {}
    parts = [
        item.get("headline"), item.get("summary"), item.get("why_important"), item.get("post_approach"),
        " ".join(str(v) for v in (item.get("relevance_factors") or [])),
        detail.get("summary"), " ".join(str(v) for v in (detail.get("topics") or [])),
        " ".join(str(v) for v in (detail.get("figures") or [])),
    ]
    return " ".join(str(v or "") for v in parts).casefold()


def _relevance_score(item: dict[str, Any]) -> tuple[int, list[str]]:
    text = _text(item)
    core_hits = sorted(term for term in CORE_RELEVANCE_TERMS if term in text)
    medium_hits = sorted(term for term in MEDIUM_RELEVANCE_TERMS if term in text)
    weak_hits = sorted(term for term in WEAK_ONLY_TERMS if term in text)
    risk_dossiers = [str(v) for v in (item.get("risk_dossiers") or []) if str(v)]

    score = 0
    reasons: list[str] = []
    if core_hits:
        score += 6
        score += min(3, len(core_hits) - 1)
        reasons.append("core-topic:" + ",".join(core_hits[:3]))
    if medium_hits:
        score += min(3, len(medium_hits))
        reasons.append("supporting-topic:" + ",".join(medium_hits[:3]))
    if risk_dossiers:
        score += 2
        reasons.append("risk-dossier:" + ",".join(risk_dossiers[:2]))

    source = item.get("source") or {}
    source_class = str(source.get("class") or "")
    if source_class == "A" and (core_hits or risk_dossiers):
        score += 1
        reasons.append("primary-source")

    if not core_hits and not risk_dossiers:
        if medium_hits:
            score = min(score, 5)
        elif weak_hits:
            score = min(max(score, 2), 3)
            reasons.append("generic-only")
        else:
            score = 1
            reasons.append("no-core-relevance")

    if not core_hits and not risk_dossiers and "schweiz" not in text:
        score = min(score, 3)
        reasons.append("no-swiss-core-anchor")

    return max(0, min(10, score)), reasons


def _novelty_score(item: dict[str, Any]) -> tuple[int, list[str]]:
    text = _text(item)
    detail = item.get("article_detail") if isinstance(item.get("article_detail"), dict) else {}
    figures = [str(v) for v in (detail.get("figures") or []) if str(v).strip()]
    status = str(item.get("status") or "")
    source_count = len(item.get("sources") or [])

    score = 3
    reasons: list[str] = []

    action_hits = [term for term in NOVELTY_ACTION_TERMS if term in text]
    if action_hits:
        score += 3
        reasons.append("new-action:" + ",".join(action_hits[:2]))

    if figures or re.search(r"\b\d+(?:[.,]\d+)?\s*(?:mrd|milliard|mio|million|franken|prozent|%|stellen|tage|jahre)\b", text):
        score += 2
        reasons.append("new-figure")

    if item.get("freshness_basis") == "material_update_today":
        score += 2
        reasons.append("material-update-today")
    elif item.get("freshness_basis") in {"published_today", "epaper_today"}:
        score += 1
        reasons.append("published-today")

    if source_count >= 2:
        score += 1
        reasons.append("multi-source")

    if status == "Korrektur":
        score += 1
        reasons.append("correction")

    if any(marker in text for marker in LOW_NOVELTY_MARKERS) and not action_hits and not figures:
        score -= 2
        reasons.append("analysis-without-new-fact")

    if status == "Duplikat" and not action_hits and not figures and item.get("freshness_basis") != "material_update_today":
        score -= 1
        reasons.append("seen-before-no-new-signal")

    return max(0, min(10, score)), reasons


def _quality(item: dict[str, Any]) -> dict[str, Any]:
    relevance, relevance_reasons = _relevance_score(item)
    novelty, novelty_reasons = _novelty_score(item)
    quality = round(relevance * 0.6 + novelty * 0.4, 1)

    item["relevance_score"] = relevance
    item["novelty_score"] = novelty
    item["quality_score"] = quality
    item["quality_reasons"] = relevance_reasons + novelty_reasons
    item["quality_qualified"] = relevance >= 6 and novelty >= 5 and quality >= 5.8
    return item


def _rank(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        items,
        key=lambda item: (
            float(item.get("quality_score") or 0),
            int(item.get("novelty_score") or 0),
            int(item.get("relevance_score") or 0),
            int(item.get("post_potential") or 0),
        ),
        reverse=True,
    )


def main() -> int:
    report_date = datetime.now(ZURICH).date().isoformat()
    report_path = REPORT_DIR / f"{report_date}.json"
    if not report_path.is_file():
        raise SystemExit(f"Report not found: {report_path}")

    report = json.loads(report_path.read_text(encoding="utf-8"))
    original_news = report.get("news") or []
    original_candidates = report.get("news_candidates") or []
    original_pool = report.get("news_candidate_pool") or []

    pools = [original_news, original_candidates, original_pool]
    all_items = _dedupe([item for pool in pools for item in pool if isinstance(item, dict)])

    # Structured RSS/API dates, added by enrich_structured_dates.py, always win.
    # Only items without any usable structured date fall back to article-page metadata.
    fallback_items = [
        item for item in all_items
        if not _is_epaper(item, report_date)
        and not _parse_date(item.get("published_date"))
        and not _parse_date(item.get("updated_date"))
        and _url(item)
    ]
    urls = sorted({_url(item) for item in fallback_items})
    dates_by_url: dict[str, dict[str, str | None]] = {}
    with ThreadPoolExecutor(max_workers=12) as executor:
        futures = {executor.submit(_extract_dates, url): url for url in urls}
        for future in as_completed(futures):
            url = futures[future]
            try:
                dates_by_url[url] = future.result()
            except Exception:
                dates_by_url[url] = {"published_date": None, "updated_date": None}

    for item in fallback_items:
        info = dates_by_url.get(_url(item)) or {}
        if info.get("published_date") and not _parse_date(item.get("published_date")):
            item["published_date"] = info["published_date"]
            item["date_source"] = "article_metadata_fallback"
        if info.get("updated_date") and not _parse_date(item.get("updated_date")):
            item["updated_date"] = info["updated_date"]
            item.setdefault("date_source", "article_metadata_fallback")

    by_key = {_key(item): item for item in all_items}

    def refresh(pool: list[dict[str, Any]]) -> list[dict[str, Any]]:
        result = []
        for original in pool:
            if not isinstance(original, dict):
                continue
            item = by_key.get(_key(original), original)
            if _fresh(item, report_date):
                result.append(_quality(item))
        return _dedupe(result)

    fresh_delta = refresh(original_news)
    fresh_candidates = refresh(original_candidates)
    fresh_pool = refresh(original_pool)

    qualified = _rank(_dedupe([*fresh_candidates, *fresh_pool]))
    public_today = [item for item in qualified if item.get("quality_qualified")][:10]
    selected_ids = {_key(item) for item in public_today}

    for item in fresh_pool:
        item["selected"] = _key(item) in selected_ids
    for item in public_today:
        item["selected"] = True

    report["news_delta"] = _rank(fresh_delta)
    report["news"] = public_today
    report["news_candidates"] = public_today
    report["news_candidate_pool"] = _rank(fresh_pool)
    report["freshness_policy"] = {
        "timezone": "Europe/Zurich",
        "rule": "published_today_or_material_update_today",
        "unknown_dates_visible": False,
        "report_date": report_date,
        "public_list_semantics": "fresh_today_and_quality_qualified",
        "structured_dates_preferred": True,
        "html_date_fallback_items": len(fallback_items),
        "fresh_delta_count": len(fresh_delta),
        "fresh_pool_count": len(fresh_pool),
        "public_news_count": len(public_today),
        "filtered_candidates": len(original_candidates) - len(fresh_candidates),
    }
    report["quality_policy"] = {
        "max_items": 10,
        "fill_target": False,
        "relevance_min": 6,
        "novelty_min": 5,
        "quality_min": 5.8,
        "quality_formula": "0.6*relevance + 0.4*novelty",
        "qualified_count": len(public_today),
    }

    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"Freshness+quality filter: delta={len(fresh_delta)}; pool={len(fresh_pool)}; "
        f"qualified={len(public_today)}; fallback_dates={len(fallback_items)}; date={report_date}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
