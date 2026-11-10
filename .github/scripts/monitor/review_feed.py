"""Publish a privacy-minimised, unscored article list for manual editorial review.

Only public metadata (headline, optional subtitle, public source and URL) enters
GitHub Pages. Never include collected article bodies, newsletter message text,
user email addresses, access tokens, analysis prompts, or the evaluation labels.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, quote, urlsplit, urlunsplit
from zoneinfo import ZoneInfo

from config import REPO_ROOT, load_procedure_watches, load_risks, load_sources
from fetch import source_enabled
from editorial_ai import _merge_candidates
from storage import write_json

ZURICH = ZoneInfo("Europe/Zurich")
REVIEW_DIR = REPO_ROOT / "data" / "monitor" / "review"
EXCLUDED_HOST_SUFFIXES = (".ts.net", ".local", ".internal", ".localhost")
# A public GitHub Pages feed must not relay personalised links from mail
# newsletters, click trackers or arbitrary private hosts.
PUBLIC_DOMAIN_ROOTS = (
    "admin.ch", "parlament.ch", "snb.ch", "finma.ch", "nzz.ch", "srf.ch",
    "watson.ch", "tagesanzeiger.ch", "20min.ch", "reuters.com",
    "europa.eu", "consilium.europa.eu", "europarl.europa.eu",
    "swissinfo.ch", "ch.ch",
)


def _clean(value: Any, limit: int) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def _iso_date(value: Any) -> str:
    text = _clean(value, 48)
    match = re.match(r"^(20\d\d-\d\d-\d\d)", text)
    return match.group(1) if match else ""


def _public_url(value: Any, *, page: Any = None) -> str:
    """Omit sensitive/credentialled links; discard all query parameters."""
    raw = _clean(value, 1600)
    try:
        parsed = urlsplit(raw)
    except ValueError:
        return ""
    hostname = (parsed.hostname or "").casefold()
    if hostname.startswith("www."):
        hostname = hostname[4:]
    if (
        parsed.scheme != "https" or not hostname or parsed.username or parsed.password
        or hostname in {"localhost", "127.0.0.1"}
        or any(hostname.endswith(suffix) for suffix in EXCLUDED_HOST_SUFFIXES)
        or not any(hostname == domain or hostname.endswith("." + domain) for domain in PUBLIC_DOMAIN_ROOTS)
        or any(term in (parsed.path or "").casefold() for term in ("/unsubscribe", "/optout", "/email/"))
    ):
        return ""
    # Always remove URL query strings: mail click-tracking and personal tokens
    # must not be copied into publicly deployed static JSON.
    path = parsed.path or "/"
    url = urlunsplit(("https", hostname, path, "", ""))
    if hostname == "epaper.nzz.ch":
        try:
            number = int(page)
        except (TypeError, ValueError):
            number = 0
        if 1 <= number <= 1000:
            url += "#page=" + str(number)
    return url


def _source_name(article: dict[str, Any]) -> str:
    original = article.get("original_source")
    if isinstance(original, dict):
        name = _clean(original.get("name"), 120)
        if name and name.casefold() not in {"unbekannt", "unknown"}:
            return name
    elif isinstance(original, str):
        name = _clean(original, 120)
        if name and name.casefold() not in {"unbekannt", "unknown"}:
            return name
    sources = article.get("collector_sources") or []
    return _clean(article.get("source_name") or (sources[0] if sources else ""), 120) or "Quelle unbekannt"


def _article_records(findings: list[dict[str, Any]], ai: dict[str, Any] | None = None) -> tuple[list[dict], dict]:
    """Reuse existing technical deduplication and ad/ticker prefilter.

    The editorial relevance threshold is intentionally NOT applied.
    """
    ai = ai if isinstance(ai, dict) else {}
    candidates = _merge_candidates(findings, 0)
    selected_ids = {
        str(item.get("article_id") or "")
        for item in ai.get("selection", []) or [] if isinstance(item, dict)
    }
    by_id = {
        str(item.get("article_id") or ""): item
        for item in (ai.get("candidate_pipeline") or {}).get("articles", []) or []
        if isinstance(item, dict)
    }
    rows = []
    omitted_unsafe = 0
    for candidate in candidates:
        url = _public_url(candidate.get("original_url"))
        # E-paper URLs share a storefront, but each article's page matters.
        if candidate.get("collector_sources") and any(
            str(src) in {"nzz-epaper", "nzzas-epaper"}
            for src in candidate.get("collector_sources") or []
        ):
            raw = next(
                (f for f in findings if str(f.get("title") or "").strip() == candidate["headline"]
                 and _iso_date(f.get("published_at")) == _iso_date(candidate.get("published_at"))
                 and str(f.get("source_id") or "") in {"nzz-epaper", "nzzas-epaper"}),
                {},
            )
            page = raw.get("page")
            url = _public_url(raw.get("url") or candidate.get("original_url"), page=page)
        else:
            page = None

        if not url:
            omitted_unsafe += 1
            continue

        # The source's own subtitle is helpful when judging interviews and
        # commentaries. It is clipped, with no article body or newsletter text.
        subtitle = ""
        if any(str(src) in {"nzz-epaper", "nzzas-epaper"} for src in candidate.get("collector_sources") or []):
            subtitle = _clean(raw.get("subtitle"), 240)
        else:
            match = next(
                (f for f in findings if str(f.get("title") or "").strip() == candidate["headline"]
                 and _public_url(f.get("url")) == url),
                {},
            )
            if str(match.get("source_id") or "") != "gmail-newsletters":
                subtitle = _clean(match.get("subtitle"), 240)

        aid = _clean(candidate.get("article_id"), 80)
        if not re.fullmatch(r"[a-zA-Z0-9_-]{12,80}", aid):
            omitted_unsafe += 1
            continue
        source = _source_name(candidate)
        trace = by_id.get(aid) or {}
        row = {
            "id": aid,
            "headline": _clean(candidate.get("headline"), 300),
            "subtitle": subtitle,
            "source": source,
            "url": url,
            "published_date": _iso_date(candidate.get("published_at")),
            "discovered_date": _iso_date(candidate.get("discovered_at")),
            "known_status": _clean(trace.get("historical_novelty") or candidate.get("historical_novelty"), 50),
            "ai_selected": (aid in selected_ids) if ai else None,
            "source_ids": sorted({str(src)[:80] for src in (candidate.get("collector_sources") or []) if src}),
        }
        if page is not None:
            row["page"] = page
        # No full text, no private newsletter provenance, no access tokens.
        rows.append(row)
    return rows, {
        "collected_findings": len(findings),
        "deduplicated_technical_candidates": len(candidates),
        "omitted_unsafe_public_links": omitted_unsafe,
        "published_review_candidates": len(rows),
    }


def _index() -> dict:
    path = REVIEW_DIR / "index.json"
    try:
        result = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(result, dict) and isinstance(result.get("days"), list):
            return result
    except (OSError, ValueError):
        pass
    return {"schema_version": 1, "days": []}


def _record_index(day: str, key: str, relative_path: str, count: int) -> None:
    idx = _index()
    existing = next((item for item in idx["days"] if item.get("date") == day), None)
    if existing is None:
        existing = {"date": day, "daily": None, "epaper": []}
        idx["days"].append(existing)
    if key == "daily":
        existing["daily"] = {"path": relative_path, "count": count}
    else:
        papers = [x for x in existing.get("epaper", []) if x.get("path") != relative_path]
        papers.append({"path": relative_path, "count": count})
        existing["epaper"] = sorted(papers, key=lambda x: x["path"])
    idx["days"] = sorted(idx["days"], key=lambda x: x.get("date", ""), reverse=True)[:45]
    idx["updated_at"] = datetime.now(ZURICH).isoformat()
    write_json(REVIEW_DIR / "index.json", idx)




# Review-only views of pre-existing procedure/risk checks: no network calls,
# no alteration of the underlying monitor's baseline or editorial decisions.
PROCEDURE_STATUS_TEXT = {
    "changed": "Verfahrensstand hat sich gegenüber der letzten Prüfung geändert.",
    "unchanged": "Keine Änderung gegenüber der letzten vollständigen Prüfung.",
    "baseline": "Ausgangsstand der Überwachung erfasst.",
    "unreachable": "Quellenprüfung fehlgeschlagen; Verfahrensstand unklar.",
    "structure_changed": "Quellenstruktur verändert; Verfahrensstand nicht gesichert.",
}
RISK_STATUS_TEXT = {
    "changed": "Neue Hinweise im Risiko-Dossier erkannt; fachliche Prüfung erforderlich.",
    "unchanged": "Keine neue Entwicklung aus den geprüften Primärquellen.",
    "baseline": "Ausgangsstand der Risikoüberwachung erfasst.",
    "incomplete": "Quellenprüfung unvollständig; keine Entwarnung möglich.",
}
HEALTHY_SOURCE_STATUSES = {"new_publication", "checked_no_new"}


def _review_id(prefix: str, identity: str) -> str:
    """Stable inside a calendar day, changed source signals get a new ID."""
    digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()[:20].upper()
    return f"RV-{prefix}-{digest}"


def _public_procedure_url(value: Any) -> str:
    """Preserve the official OEIL procedure reference, never tracking queries."""
    raw = _clean(value, 1600)
    try:
        parts = urlsplit(raw)
    except ValueError:
        return ""
    url = _public_url(raw)
    if not url:
        return ""
    # OEIL's procedure-file links need the 'reference' query parameter.
    if parts.hostname and parts.hostname.casefold() == "oeil.europarl.europa.eu" and parts.path == "/oeil/en/procedure-file":
        refs = parse_qs(parts.query, keep_blank_values=False).get("reference", [])
        if len(refs) == 1 and re.fullmatch(r"20\d{2}/[0-9]{3,5}R?\([A-Z]+\)", refs[0]):
            return url + "?reference=" + quote(refs[0], safe="")
    return url


def _procedure_records(raw_report: dict[str, Any], day: str) -> list[dict[str, Any]]:
    watches = {
        str(item.get("id") or ""): item
        for item in (raw_report.get("procedure_watches") or load_procedure_watches())
        if isinstance(item, dict)
    }
    results = (raw_report.get("procedure_monitoring") or {}).get("results") or []
    rows: list[dict[str, Any]] = []
    for item in results:
        if not isinstance(item, dict):
            continue
        watch_id = _clean(item.get("watch_id"), 150)
        page = _clean(item.get("page"), 80)
        status = _clean(item.get("status"), 40)
        if not watch_id or not page:
            continue
        url = _public_procedure_url(item.get("url"))
        if not url:
            continue
        watch = watches.get(watch_id) or {}
        title = _clean(watch.get("title") or "EU-Verfahren", 180)
        signal = item.get("signal") if isinstance(item.get("signal"), dict) else {}
        refs = [_clean(v, 60) for v in (signal.get("expected_references_found") or []) if _clean(v, 60)][:4]
        documents = [_clean(v, 60) for v in (signal.get("known_documents_found") or []) if _clean(v, 60)][:4]
        # Never publish unbounded source 'contexts', raw HTML or an exception.
        details = []
        if refs:
            details.append("Referenzen: " + ", ".join(refs))
        if documents:
            details.append("Dokumente: " + ", ".join(documents))
        description = PROCEDURE_STATUS_TEXT.get(status, "Verfahrensprüfung ohne gesicherten Status.")
        if details:
            description += " " + " · ".join(details)
        fingerprint = _clean(item.get("fingerprint"), 128)
        rows.append({
            "id": _review_id("EU", f"{day}|{watch_id}|{page}|{status}|{fingerprint}"),
            "headline": title + " – " + page.replace("_", " "),
            "subtitle": description[:480],
            "source": "Europäisches Parlament – OEIL",
            "url": url,
            "published_date": day,
            "discovered_date": day,
            "status": status,
            "kind": "procedure",
            "watch_id": watch_id,
            "ai_selected": None,
        })
    return rows


def _risk_records(raw_report: dict[str, Any], day: str) -> list[dict[str, Any]]:
    configs = {str(r.get("id") or ""): r for r in load_risks() if isinstance(r, dict)}
    results = (raw_report.get("risk_monitoring") or {}).get("results") or []
    rows: list[dict[str, Any]] = []
    for item in results:
        if not isinstance(item, dict):
            continue
        risk_id = _clean(item.get("risk_id"), 80)
        status = _clean(item.get("status"), 40)
        if not risk_id:
            continue
        config = configs.get(risk_id, {})
        topic = _clean(item.get("topic") or config.get("title") or risk_id, 160)
        sources = [s for s in (item.get("sources") or []) if isinstance(s, dict)]
        news = [_clean(title, 180) for title in (item.get("news") or []) if _clean(title, 180)]
        source_url = next((_public_url(s.get("url")) for s in sources if _public_url(s.get("url"))), "")
        # Fall back to the existing public dossier only if a verified source
        # link is unavailable. No outgoing call or new integration is needed.
        pages = config.get("pages") or []
        public_dossier = "https://www.souveraene-schweiz.ch/" + pages[0] if pages and re.fullmatch(r"[a-z0-9-]+\.html", str(pages[0])) else ""
        url = source_url or public_dossier
        if not url:
            continue
        complete = item.get("source_check_complete") is True
        summary = RISK_STATUS_TEXT.get(status, "Risiko-Dossier geprüft.")
        if news:
            summary += " Hinweise: " + " | ".join(news[:3])
        if not complete:
            failed = [_clean(v, 40) for v in (item.get("failed_p1_sources") or [])][:8]
            missing = [_clean(v, 40) for v in (item.get("missing_p1_sources") or [])][:8]
            if failed or missing:
                summary += " Quellen unvollständig: " + ", ".join(failed + missing)
        fingerprints = sorted(_clean(s.get("fingerprint"), 128) for s in sources if s.get("fingerprint"))
        rows.append({
            "id": _review_id("RISK", f"{day}|{risk_id}|{status}|{'|'.join(fingerprints)}"),
            "headline": topic + " – Risiko-Dossier",
            "subtitle": summary[:480],
            "source": "Risikoüberwachung – Primärquellen",
            "url": url,
            "published_date": day,
            "discovered_date": day,
            "status": status,
            "kind": "risk",
            "risk_id": risk_id,
            "source_check_complete": complete,
            "new_items": max(0, int(item.get("new_items") or 0)),
            "ai_selected": None,
        })
    return rows


def _source_overview(
    raw_report: dict[str, Any], article_rows: list[dict[str, Any]]
) -> dict[str, Any]:
    """Distinguish actual fetch results, configured-but-disabled, and missing.

    'raw_findings' means fetched entries, NOT published articles. 'review_entries'
    counts distinct review rows with a matching discovery collector.
    """
    runs = (raw_report.get("news_discovery") or {}).get("source_runs") or []
    by_id = {str(run.get("source_id") or ""): run for run in runs if isinstance(run, dict)}
    review_counts: dict[str, int] = {}
    for row in article_rows:
        for source_id in row.get("source_ids", []):
            review_counts[source_id] = review_counts.get(source_id, 0) + 1
    rows = []
    for source in load_sources():
        if not isinstance(source, dict):
            continue
        source_id = _clean(source.get("id"), 80)
        if not source_id:
            continue
        enabled = source_enabled(source)
        run = by_id.get(source_id)
        if not enabled:
            status = "disabled"
        elif not run:
            status = "not_checked"
        else:
            status = _clean(run.get("status"), 60) or "unknown"
        rows.append({
            "id": source_id,
            "name": _clean(source.get("name") or source_id, 120),
            "priority": _clean(source.get("priority"), 10),
            "enabled": enabled,
            "status": status,
            "raw_findings": len(run.get("findings") or []) if run else 0,
            "review_entries": review_counts.get(source_id, 0),
        })
    observed = {r["id"] for r in rows}
    # Fetch results for a source not present in the current registry should
    # remain visible; never infer successful coverage from a configured URL.
    for sid, run in by_id.items():
        if sid not in observed:
            rows.append({
                "id": _clean(sid, 80), "name": _clean(run.get("source_name") or sid, 120),
                "priority": "", "enabled": True,
                "status": _clean(run.get("status"), 60),
                "raw_findings": len(run.get("findings") or []),
                "review_entries": review_counts.get(sid, 0),
            })
    procedure_checks = (raw_report.get("procedure_monitoring") or {}).get("results") or []
    risk_checks = (raw_report.get("risk_monitoring") or {}).get("results") or []
    return {
        "sources": rows,
        "summary": {
            "configured": len(rows),
            "enabled": sum(r["enabled"] for r in rows),
            "checked": sum(r["status"] not in {"disabled", "not_checked"} for r in rows),
            "successful": sum(r["status"] in HEALTHY_SOURCE_STATUSES for r in rows),
            "failed": sum(r["status"] not in HEALTHY_SOURCE_STATUSES | {"disabled", "not_checked"} for r in rows),
            "procedures_checked": len(procedure_checks),
            "procedures_with_warning": sum(
                isinstance(p, dict) and p.get("status") not in {"baseline", "unchanged", "changed"}
                for p in procedure_checks
            ),
            "risks_checked": len(risk_checks),
            "risks_with_incomplete_sources": sum(
                isinstance(p, dict) and p.get("source_check_complete") is not True
                for p in risk_checks
            ),
        },
    }

def publish_daily(raw_report: dict) -> Path:
    started = str(raw_report.get("started_at") or "")
    day = _iso_date(started)
    # The reporting timezone, not the machine's UTC calendar date, owns the day.
    try:
        day = datetime.fromisoformat(started.replace("Z", "+00:00")).astimezone(ZURICH).date().isoformat()
    except ValueError:
        day = datetime.now(ZURICH).date().isoformat()
    runs = (raw_report.get("news_discovery") or {}).get("source_runs") or []
    findings = [f for source in runs if isinstance(source, dict)
                for f in (source.get("findings") or []) if isinstance(f, dict)]
    rows, counts = _article_records(findings, raw_report.get("editorial_ai"))
    procedures = _procedure_records(raw_report, day)
    risks = _risk_records(raw_report, day)
    sources = _source_overview(raw_report, rows)
    result = {
        "schema_version": 1,
        "date": day,
        "kind": "daily",
        "generated_at": datetime.now(ZURICH).isoformat(),
        "counts": counts,
        "articles": rows,
        "procedures": procedures,
        "risks": risks,
        "source_overview": sources,
    }
    path = REVIEW_DIR / (day + ".json")
    write_json(path, result)
    _record_index(day, "daily", path.name, len(rows))
    return path


def publish_epaper(extraction: dict, edition: str) -> Path:
    if edition not in {"nzz", "nzzas"}:
        raise ValueError("edition must be nzz or nzzas")
    metadata = extraction.get("metadata") or {}
    day = _iso_date(metadata.get("issue_date") or metadata.get("target_date"))
    if not day:
        raise ValueError("verified NZZ issue date is required")
    findings = [f for f in extraction.get("findings", []) if isinstance(f, dict)]
    if not findings or extraction.get("status") not in {"new_publication", "checked_no_new"}:
        raise ValueError("validated nonempty e-paper findings required")
    rows, counts = _article_records(findings)
    # The e-paper extractor provides the page and validated issue date.
    for row in rows:
        row["published_date"] = day
    result = {
        "schema_version": 1,
        "date": day,
        "kind": "epaper",
        "edition": edition,
        "generated_at": datetime.now(ZURICH).isoformat(),
        "counts": counts,
        "articles": rows,
    }
    relative = "epaper/" + day + "-" + edition + ".json"
    path = REVIEW_DIR / relative
    write_json(path, result)
    _record_index(day, "epaper", relative, len(rows))
    return path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("kind", choices=["daily", "epaper"])
    parser.add_argument("--input", required=True)
    parser.add_argument("--edition", choices=["nzz", "nzzas"])
    args = parser.parse_args()
    source = json.loads(Path(args.input).read_text(encoding="utf-8"))
    if args.kind == "epaper":
        if not args.edition:
            parser.error("--edition required for epaper")
        path = publish_epaper(source, args.edition)
    else:
        path = publish_daily(source)
    print("Editorial review feed:", path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
