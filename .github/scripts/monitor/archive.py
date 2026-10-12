from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from config import REPO_ROOT
from storage import write_json

REPORT_DIR = REPO_ROOT / "data" / "monitor" / "reports"
INDEX_PATH = REPORT_DIR / "index.json"
ZURICH = ZoneInfo("Europe/Zurich")
WEEKDAYS_DE = ("Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag")

REASON_LABELS: dict[str, str] = {
    "schweiz": "direkter Schweiz-Bezug",
    "switzerland": "direkter Schweiz-Bezug",
    "bundesrat": "Entscheid oder Position des Bundesrats",
    "bundesratsnachfolge": "Nachfolge im Bundesrat bzw. Bundesratswahl",
    "parlament": "parlamentarische Behandlung",
    "nationalrat": "Nationalrat betroffen",
    "staenderat": "Ständerat betroffen",
    "migration": "Auswirkungen auf Migration",
    "zuwanderung": "Auswirkungen auf Zuwanderung",
    "asyl": "Asylpolitik betroffen",
    "personenfreizuegigkeit": "Personenfreizügigkeit betroffen",
    "stromabkommen": "Stromabkommen Schweiz–EU betroffen",
    "ubs": "UBS- und Bankenregulierung betroffen",
    "finma": "FINMA bzw. Bankenaufsicht betroffen",
    "snb": "SNB bzw. Finanzstabilität betroffen",
    "f-35": "F-35/Air2030 betroffen",
    "f35": "F-35/Air2030 betroffen",
    "patriot": "Patriot/Bodluv betroffen",
    "ahv": "AHV-Finanzierung oder Leistungen betroffen",
    "13. ahv": "13. AHV-Rente betroffen",
    "eu-paket": "direkter Bezug zum Vertragspaket Schweiz–EU",
    "2025/0162": "laufendes EU-Parlamentsverfahren zum Schweiz–EU-Paket",
    "afet": "Behandlung im EU-Ausschuss für auswärtige Angelegenheiten",
    "abstimmung": "Abstimmung oder Entscheid steht im Zentrum",
    "referendum": "Referendum bzw. Volksentscheid betroffen",
    "vote": "formeller Abstimmungsentscheid betroffen",
    "roll-call": "namentliche Abstimmung bzw. Mehrheitsverhältnisse relevant",
    "roll call": "namentliche Abstimmung bzw. Mehrheitsverhältnisse relevant",
    "eu": "EU-Bezug mit möglicher Bedeutung für die Schweiz",
    "europa": "europapolitischer Bezug",
}

TOPIC_GROUPS: tuple[tuple[set[str], str], ...] = (
    ({"bundesratsnachfolge"}, "die Nachfolge im Bundesrat"),
    ({"eu-paket", "2025/0162", "afet", "roll-call", "roll call"}, "das Vertragspaket Schweiz–EU"),
    ({"personenfreizuegigkeit", "migration", "zuwanderung", "asyl"}, "Migration und Personenfreizügigkeit"),
    ({"stromabkommen"}, "das Stromabkommen Schweiz–EU"),
    ({"ubs", "finma", "snb"}, "UBS, Bankenregulierung und Finanzstabilität"),
    ({"f-35", "f35"}, "F-35/Air2030"),
    ({"patriot"}, "Patriot/Bodluv"),
    ({"13. ahv", "ahv"}, "die AHV bzw. die 13. AHV-Rente"),
)


def _source_view(source: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": source.get("source_name"),
        "title": source.get("title"),
        "url": source.get("url"),
        "priority": source.get("priority"),
        "class": source.get("source_class"),
        "role": source.get("source_role"),
        "stage": source.get("source_stage"),
    }


def _readable_reasons(event: dict[str, Any]) -> list[str]:
    readable: list[str] = []
    for raw in event.get("reasons", []):
        reason = str(raw)
        if reason.startswith("context:"):
            reason = reason.split(":", 1)[1]
        if reason.startswith("procedure:"):
            label = "laufendes EU-Parlamentsverfahren zum Schweiz–EU-Paket"
        else:
            label = REASON_LABELS.get(reason)
        if label and label not in readable:
            readable.append(label)
    return readable[:4]


def _topic_label(event: dict[str, Any]) -> str:
    reasons = {str(value).split(":", 1)[-1] for value in event.get("reasons", [])}
    for keys, label in TOPIC_GROUPS:
        if reasons & keys:
            return label
    if reasons & {"bundesrat", "parlament", "nationalrat", "staenderat", "abstimmung", "referendum"}:
        return "einen politischen Entscheid in der Schweiz"
    if reasons & {"eu", "europa"}:
        return "eine EU-Entwicklung mit möglicher Bedeutung für die Schweiz"
    return "ein für die Schweiz relevantes politisches oder wirtschaftliches Thema"


def _summary(event: dict[str, Any]) -> str:
    status = str(event.get("status") or "Neu")
    topic = _topic_label(event)
    source_count = max(1, int(event.get("source_count") or len(event.get("sources", [])) or 1))
    if status == "Update":
        lead = f"Neue Entwicklung zu {topic}."
    elif status == "Korrektur":
        lead = f"Korrektur zu {topic}."
    elif status == "Unklar":
        lead = f"Noch nicht abschliessend bestätigte Entwicklung zu {topic}."
    else:
        lead = f"Neue Meldung zu {topic}."
    if source_count > 1:
        return f"{lead} Der Monitor hat dazu {source_count} getrennte Quellen erfasst."
    return lead


def _why_important(event: dict[str, Any]) -> str:
    reasons = _readable_reasons(event)
    if not reasons:
        return "Die Meldung wurde wegen ihres direkten Bezugs zu einem überwachten Schweiz-Thema ausgewählt."
    if len(reasons) == 1:
        return f"Wichtig, weil {reasons[0]}."
    return "Wichtig wegen " + ", ".join(reasons[:-1]) + " und " + reasons[-1] + "."


def _best_source(sources: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not sources:
        return None
    priority_rank = {"P1": 0, "P2": 1, "M1": 2, "M2": 3}
    class_rank = {"A": 0, "B": 1, "C": 2, "D": 3}
    return min(
        sources,
        key=lambda src: (
            priority_rank.get(str(src.get("priority")), 9),
            class_rank.get(str(src.get("source_class")), 9),
        ),
    )


def _post_potential(event: dict[str, Any]) -> int:
    internal_score = int(event.get("score") or 0)
    return max(1, min(10, (internal_score + 1) // 2)) if internal_score else 1


def _event_view(event: dict[str, Any], report_date: datetime, selected_ids: set[str] | None = None) -> dict[str, Any]:
    raw_sources = list(event.get("sources", []))[:6]
    sources = [_source_view(src) for src in raw_sources]
    best = _best_source(raw_sources)
    event_id = str(event.get("event_id") or "")
    return {
        "event_id": event.get("event_id"),
        "weekday": WEEKDAYS_DE[report_date.weekday()],
        "date": report_date.date().isoformat(),
        "status": event.get("status"),
        "source_stage": event.get("source_stage"),
        "headline": event.get("title"),
        "summary": _summary(event),
        "why_important": _why_important(event),
        "relevance_factors": _readable_reasons(event),
        "post_potential": _post_potential(event),
        "selected": event_id in (selected_ids or set()),
        "source": _source_view(best) if best else None,
        "sources": sources,
        "risk_dossiers": event.get("risk_dossiers") or event.get("risk_ids") or [],
    }


def _load_epaper_candidates(report_date: str) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    archive_dir = REPORT_DIR / "epaper"
    for edition in ("nzz", "nzzas"):
        path = archive_dir / f"{report_date}-{edition}.json"
        if not path.is_file():
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if str(payload.get("date") or "") != report_date:
            continue
        for event in payload.get("post_candidates", []) or []:
            if isinstance(event, dict) and _post_potential(event) >= 5:
                candidates.append(event)
    return candidates


def _merge_candidates(web_candidates: list[dict[str, Any]], epaper_candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()
    for event in [*web_candidates, *epaper_candidates]:
        event_id = str(event.get("event_id") or "").strip()
        title = " ".join(str(event.get("title") or "").lower().split())
        key = event_id or title
        if not key or key in seen:
            continue
        seen.add(key)
        merged.append(event)
    merged.sort(key=lambda event: (int(event.get("score") or 0), int(event.get("source_count") or 0)), reverse=True)
    return merged


def _procedure_view(item: dict[str, Any]) -> dict[str, Any]:
    signal = item.get("signal") if isinstance(item.get("signal"), dict) else {}
    return {
        "watch_id": item.get("watch_id"),
        "page": item.get("page"),
        "status": item.get("status"),
        "url": item.get("url"),
        "references": signal.get("expected_references_found", []),
        "documents": signal.get("known_documents_found", []),
        "dates": signal.get("dates", []),
    }


def _risk_view(item: dict[str, Any]) -> dict[str, Any]:
    news_items = [str(v) for v in item.get("news", []) if str(v).strip()]
    complete = bool(item.get("source_check_complete", True))
    failed = list(item.get("failed_p1_sources", []))
    missing = list(item.get("missing_p1_sources", []))
    if not complete:
        news_text = "Quellenprüfung unvollständig; keine belastbare Aussage 'keine Neuigkeit' möglich."
    elif news_items:
        news_text = " | ".join(news_items[:3])
    else:
        news_text = "-"

    primary_source = item.get("sources", [None])[0] if item.get("sources") else None
    return {
        "date": item.get("date"),
        "topic": item.get("topic"),
        "status": item.get("status"),
        "news": news_items,
        "news_text": news_text,
        "change_recommended": item.get("change_recommended"),
        "primary_source": primary_source,
        "sources": item.get("sources", []),
        "source_check_complete": complete,
        "failed_p1_sources": failed,
        "missing_p1_sources": missing,
    }


def build_public_report(result: dict[str, Any]) -> dict[str, Any]:
    local_now = datetime.now(ZURICH)
    report_date = local_now.date().isoformat()
    event_analysis = result.get("event_analysis", {})
    selection = event_analysis.get("daily_selection", [])
    classified = event_analysis.get("events", [])
    selected_ids = {str(event.get("event_id") or "") for event in selection}
    web_candidates = [event for event in classified if _post_potential(event) >= 5]
    epaper_candidates = _load_epaper_candidates(report_date)
    candidate_events = _merge_candidates(web_candidates, epaper_candidates)
    procedures = result.get("procedure_monitoring", {}).get("results", [])
    risks = result.get("risk_monitoring", {}).get("results", [])

    return {
        "schema_version": 5,
        "date": report_date,
        "weekday": WEEKDAYS_DE[local_now.weekday()],
        "generated_at": local_now.isoformat(),
        "status": result.get("status"),
        "run_reliability": result.get("run_reliability"),
        "news": [_event_view(event, local_now, selected_ids) for event in selection],
        "news_candidates": [_event_view(event, local_now, selected_ids) for event in candidate_events],
        "candidate_sources": {
            "web": len(web_candidates),
            "epaper": len(epaper_candidates),
        },
        "procedures": [_procedure_view(item) for item in procedures],
        "risks": [_risk_view(item) for item in risks],
        "quality": {
            "source_warnings": len(result.get("news_discovery", {}).get("warnings", [])),
            "procedure_warnings": len(result.get("procedure_monitoring", {}).get("warnings", [])),
            "sources_attempted": result.get("news_discovery", {}).get("sources_attempted", 0),
            "sources_successful": result.get("news_discovery", {}).get("sources_successful", 0),
            "risk_incomplete": sum(1 for r in risks if not r.get("source_check_complete", True)),
        },
    }


def _load_index() -> dict[str, Any]:
    if not INDEX_PATH.is_file():
        return {"schema_version": 1, "reports": []}
    try:
        data = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("reports"), list):
            return data
    except Exception:
        pass
    return {"schema_version": 1, "reports": []}


def write_public_archive(report: dict[str, Any]) -> tuple[Path, Path]:
    report_date = str(report["date"])
    report_path = REPORT_DIR / f"{report_date}.json"
    write_json(report_path, report)

    index = _load_index()
    entries = [entry for entry in index.get("reports", []) if entry.get("date") != report_date]
    entries.append({
        "date": report_date,
        "path": f"{report_date}.json",
        "status": report.get("status"),
        "run_reliability": report.get("run_reliability"),
        "news_count": len(report.get("news", [])),
        "news_candidates_count": len(report.get("news_candidates", [])),
        "risk_changes": sum(1 for r in report.get("risks", []) if r.get("change_recommended") == "Ja"),
        "risk_incomplete": sum(1 for r in report.get("risks", []) if not r.get("source_check_complete", True)),
        "procedure_changes": sum(1 for p in report.get("procedures", []) if p.get("status") == "changed"),
    })
    entries.sort(key=lambda item: str(item.get("date", "")), reverse=True)
    # The archive is part of the permanent monitor history. Do not truncate it.
    index = {"schema_version": 3, "reports": entries}
    write_json(INDEX_PATH, index)
    return report_path, INDEX_PATH
