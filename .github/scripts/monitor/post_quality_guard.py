from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import urlparse
from datetime import datetime
from zoneinfo import ZoneInfo

REPORT_DIR = Path("data/monitor/reports")
ZURICH = ZoneInfo("Europe/Zurich")

SWISS_DOMESTIC_SOURCE_IDS = {
    "ch-bund-news", "ch-bk", "ch-parlament", "ch-fedlex", "ch-seco", "ch-sem",
    "ch-bfe", "ch-bfs", "ch-bsv", "ch-efd", "ch-finma", "ch-snb", "ch-vbs",
    "ch-armasuisse", "ch-efk", "nzz-schweiz", "srf-schweiz", "watson-schweiz",
}

STRATEGIC_SWISS_TOPICS = (
    "stromabkommen", "personenfreiz", "eu-paket", "vertragspaket", "integrationsvertrag",
    "ahv", "mehrwertsteuer", "mwst", "ubs", "finma", "snb", "f-35", "f35", "patriot",
    "migration", "zuwanderung", "asyl", "souveraen", "souverän", "bundeshaushalt",
    "staatsfinanzen", "versorgungssicherheit", "air2030", "bodluv", "bankenregulierung",
    "steuererhöhung", "steuererhoehung", "staatsausgaben", "postfinance", "srg", "medienabgabe",
)

DIRECT_DEMOCRACY_TERMS = (
    "abstimmung", "volksinitiative", "referendum", "volksentscheid", "ständemehr", "staendemehr",
)

FOREIGN_PATH_MARKERS = ("/international/", "/usa/", "/ausland/", "/world/", "/international")
COMPARISON_MARKERS = (
    "ähnlich wie in der schweiz", "aehnlich wie in der schweiz", "orientiert sich an der schweiz",
    "schweiz als vorbild", "vergleichbar mit dem nationalrat", "vergleichbar mit dem ständerat",
    "vergleichbar mit dem staenderat",
)

STORY_ANCHORS = (
    "snb", "ubs", "finma", "ahv", "f-35", "f35", "patriot", "air2030", "bodluv",
    "stromabkommen", "eu-paket", "vertragspaket", "migration", "asyl", "personenfreizügigkeit",
    "personenfreizuegigkeit", "mehrwertsteuer", "mwst", "postfinance", "srg",
)

STOPWORDS = {
    "der", "die", "das", "den", "dem", "des", "ein", "eine", "einer", "eines", "einem", "einen",
    "und", "oder", "mit", "für", "fuer", "von", "vom", "im", "in", "am", "an", "auf", "zu", "zur",
    "zum", "nach", "vor", "bei", "aus", "ist", "sind", "wird", "werden", "hat", "haben", "so", "wie",
    "mehr", "neue", "neuen", "neueste", "meldungen", "wirtschaft", "schweiz", "schweizer", "franken",
}


def _text(item: dict) -> str:
    detail = item.get("article_detail") if isinstance(item.get("article_detail"), dict) else {}
    return " ".join(
        str(v or "") for v in (
            item.get("headline"), item.get("summary"), item.get("why_important"),
            item.get("post_approach"), detail.get("summary"),
        )
    ).casefold()


def _source(item: dict) -> dict:
    return item.get("source") if isinstance(item.get("source"), dict) else {}


def _is_foreign_context(item: dict, text: str) -> bool:
    source = _source(item)
    sid = str(source.get("id") or "")
    url = str(source.get("url") or "")
    path = urlparse(url).path.casefold()
    if sid in SWISS_DOMESTIC_SOURCE_IDS:
        return False
    if any(marker in path for marker in FOREIGN_PATH_MARKERS):
        return True
    return any(marker in text for marker in COMPARISON_MARKERS)


def _replace_label(value: str) -> str:
    text = value or ""
    low = text.casefold()
    if "milliardenbelastung" in low and any(marker in low for marker in ("gewinn", "gewinn von", "ausschüttung", "ausschuettung")):
        return re.sub(r"Milliardenbelastung", "Milliardenbetrag", text, flags=re.IGNORECASE)
    return text


def _fix_context_labels(item: dict) -> None:
    item["why_important"] = _replace_label(str(item.get("why_important") or ""))
    item["post_approach"] = _replace_label(str(item.get("post_approach") or ""))
    detail = item.get("article_detail") if isinstance(item.get("article_detail"), dict) else None
    if detail:
        detail["relevance"] = _replace_label(str(detail.get("relevance") or ""))
        topics = detail.get("topics") or []
        detail["topics"] = [_replace_label(str(v)) for v in topics]
    factors = item.get("relevance_factors") or []
    item["relevance_factors"] = [_replace_label(str(v)) for v in factors]


def _apply(item: dict) -> dict:
    _fix_context_labels(item)
    text = _text(item)
    reasons = list(item.get("quality_reasons") or [])
    relevance = int(item.get("relevance_score") or 0)
    novelty = int(item.get("novelty_score") or 0)

    # "SRG-Wahlbarometer" is election polling, not SRG/service-public policy.
    if "wahlbarometer" in text and any(str(r).startswith("core-topic:srg") for r in reasons):
        relevance = min(relevance, 5)
        reasons.append("guard:srg-wahlbarometer-not-service-public")

    strategic = any(term in text for term in STRATEGIC_SWISS_TOPICS)
    direct_democracy = any(term in text for term in DIRECT_DEMOCRACY_TERMS)

    # A referendum/initiative/abstimmung is not by itself a strategic monitor topic.
    if direct_democracy and not strategic:
        relevance = min(relevance, 4)
        reasons.append("guard:direct-democracy-without-strategic-topic")

    foreign = _is_foreign_context(item, text)
    if foreign and not strategic:
        relevance = min(relevance, 4)
        reasons.append("guard:foreign-context-without-swiss-core-impact")

    generic_foreign = foreign and any(term in text for term in ("abstimmung", "parlament", "nationalrat", "ständerat", "staenderat"))
    if generic_foreign and not strategic:
        relevance = min(relevance, 3)
        reasons.append("guard:foreign-democracy-terms-only")

    quality = round(relevance * 0.6 + novelty * 0.4, 1)
    item["relevance_score"] = relevance
    item["quality_score"] = quality
    item["quality_reasons"] = reasons
    item["quality_qualified"] = relevance >= 6 and novelty >= 5 and quality >= 5.8
    return item


def _tokens(item: dict) -> set[str]:
    text = " ".join((str(item.get("headline") or ""), str(item.get("summary") or ""))).casefold()
    words = re.findall(r"[a-zäöü0-9][a-zäöü0-9-]{2,}", text)
    return {w for w in words if w not in STOPWORDS and not w.isdigit()}


def _numbers(item: dict) -> set[str]:
    text = " ".join((str(item.get("headline") or ""), str(item.get("summary") or ""))).casefold()
    nums = set()
    for raw in re.findall(r"\b\d+(?:[.,]\d+)?\b", text):
        nums.add(raw.replace(",", "."))
    return nums


def _anchors(item: dict) -> set[str]:
    text = _text(item)
    return {anchor for anchor in STORY_ANCHORS if anchor in text}


def _same_story(a: dict, b: dict) -> bool:
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return False
    overlap = len(ta & tb) / max(1, len(ta | tb))
    if overlap >= 0.55:
        return True

    aa, ab = _anchors(a), _anchors(b)
    na, nb = _numbers(a), _numbers(b)
    if aa & ab and na & nb and overlap >= 0.18:
        return True
    return False


def _merge_sources(target: dict, other: dict) -> None:
    combined = []
    seen = set()
    for src in list(target.get("sources") or []) + list(other.get("sources") or []):
        if not isinstance(src, dict):
            continue
        key = str(src.get("url") or "") or f"{src.get('id')}|{src.get('title')}"
        if key in seen:
            continue
        seen.add(key)
        combined.append(src)
    target["sources"] = combined
    target["source_count"] = len(combined)
    merged_ids = [str(v) for v in (target.get("merged_event_ids") or []) if str(v)]
    for event_id in (target.get("event_id"), other.get("event_id")):
        event_id = str(event_id or "")
        if event_id and event_id not in merged_ids:
            merged_ids.append(event_id)
    target["merged_event_ids"] = merged_ids
    reasons = list(target.get("quality_reasons") or [])
    if "guard:semantic-duplicate-cluster" not in reasons:
        reasons.append("guard:semantic-duplicate-cluster")
    target["quality_reasons"] = reasons


def _cluster(items: list[dict]) -> list[dict]:
    ordered = _rank(items)
    clusters: list[dict] = []
    for item in ordered:
        match = next((existing for existing in clusters if _same_story(existing, item)), None)
        if match is None:
            clusters.append(item)
            continue
        _merge_sources(match, item)
    return clusters


def _rank(items: list[dict]) -> list[dict]:
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
    path = REPORT_DIR / f"{report_date}.json"
    if not path.is_file():
        raise SystemExit(f"Report not found: {path}")

    report = json.loads(path.read_text(encoding="utf-8"))
    pool = [_apply(dict(item)) for item in (report.get("news_candidate_pool") or []) if isinstance(item, dict)]
    pool = _cluster(pool)
    pool = _rank(pool)
    news = [item for item in pool if item.get("quality_qualified")][:10]
    selected = {str(item.get("event_id") or "") for item in news}
    for item in pool:
        item["selected"] = str(item.get("event_id") or "") in selected
    for item in news:
        item["selected"] = True

    report["news"] = news
    report["news_candidates"] = news
    report["news_candidate_pool"] = pool
    qp = report.setdefault("quality_policy", {})
    qp["contextual_guard"] = True
    qp["qualified_count"] = len(news)
    qp["foreign_comparison_is_not_swiss_relevance"] = True
    qp["srg_wahlbarometer_exception"] = True
    qp["generic_direct_democracy_not_core"] = True
    qp["semantic_duplicate_clustering"] = True
    qp["context_label_normalization"] = True

    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Contextual quality guard: qualified={len(news)}; clustered={len(pool)}; date={report_date}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
