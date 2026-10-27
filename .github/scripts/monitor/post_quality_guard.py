from __future__ import annotations

import json
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

STRONG_SWISS_TOPICS = (
    "stromabkommen", "personenfreiz", "eu-paket", "vertragspaket", "integrationsvertrag",
    "ahv", "mehrwertsteuer", "mwst", "ubs", "finma", "snb", "f-35", "f35", "patriot",
    "migration", "zuwanderung", "asyl", "referendum", "volksinitiative", "staendemehr", "ständemehr",
    "souveraen", "souverän", "bundeshaushalt", "staatsfinanzen", "versorgungssicherheit",
)

FOREIGN_PATH_MARKERS = ("/international/", "/usa/", "/ausland/", "/world/", "/international")
COMPARISON_MARKERS = (
    "ähnlich wie in der schweiz", "aehnlich wie in der schweiz", "orientiert sich an der schweiz",
    "schweiz als vorbild", "vergleichbar mit dem nationalrat", "vergleichbar mit dem ständerat",
    "vergleichbar mit dem staenderat",
)


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


def _apply(item: dict) -> dict:
    text = _text(item)
    reasons = list(item.get("quality_reasons") or [])
    relevance = int(item.get("relevance_score") or 0)
    novelty = int(item.get("novelty_score") or 0)

    # "SRG-Wahlbarometer" is election polling, not SRG/service-public policy.
    if "wahlbarometer" in text and any(str(r).startswith("core-topic:srg") for r in reasons):
        relevance = min(relevance, 5)
        reasons.append("guard:srg-wahlbarometer-not-service-public")

    foreign = _is_foreign_context(item, text)
    strong_swiss = any(term in text for term in STRONG_SWISS_TOPICS)
    if foreign and not strong_swiss:
        relevance = min(relevance, 4)
        reasons.append("guard:foreign-context-without-swiss-core-impact")

    # Generic democratic vocabulary is insufficient when it describes a foreign process.
    generic_foreign = foreign and any(term in text for term in ("abstimmung", "parlament", "nationalrat", "ständerat", "staenderat"))
    if generic_foreign and not strong_swiss:
        relevance = min(relevance, 3)
        reasons.append("guard:foreign-democracy-terms-only")

    quality = round(relevance * 0.6 + novelty * 0.4, 1)
    item["relevance_score"] = relevance
    item["quality_score"] = quality
    item["quality_reasons"] = reasons
    item["quality_qualified"] = relevance >= 6 and novelty >= 5 and quality >= 5.8
    return item


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

    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Contextual quality guard: qualified={len(news)}; date={report_date}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
