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

REASON_LABELS: dict[str, str] = {
    "schweiz": "direkter Schweiz-Bezug",
    "switzerland": "direkter Schweiz-Bezug",
    "bundesrat": "Entscheid oder Position des Bundesrats",
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
    }


def _readable_reasons(event: dict[str, Any]) -> list[str]:
    readable: list[str] = []
    for raw in event.get("reasons", []):
        reason = str(raw)
        if reason.startswith("procedure:"):
            label = "laufendes EU-Parlamentsverfahren zum Schweiz–EU-Paket"
        else:
            label = REASON_LABELS.get(reason)
        if label and label not in readable:
            readable.append(label)
    return readable[:4]


def _topic_label(event: dict[str, Any]) -> str:
    reasons = {str(value) for value in event.get("reasons", [])}
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
        return f"{lead} Der Monitor hat dazu {source_count} voneinander getrennte Quellen erfasst."
    return lead


def _why_important(event: dict[str, Any]) -> str:
    reasons = _readable_reasons(event)
    if not reasons:
        return "Die Meldung wurde wegen ihres direkten Bezugs zu einem überwachten Schweiz-Thema ausgewählt."
    if len(reasons) == 1:
        return f"Wichtig, weil {reasons[0]}."
    return "Wichtig wegen " + ", ".join(reasons[:-1]) + " und " + reasons[-1] + "."


def _event_view(event: dict[str, Any]) -> dict[str, Any]:
    sources = [_source_view(src) for src in event.get("sources", [])[:6]]
    internal_score = int(event.get("score") or 0)
    post_potential = max(1, min(10, round(internal_score / 2))) if internal_score else 1
    return {
        "event_id": event.get("event_id"),
        "status": event.get("status"),
        "headline": event.get("title"),
        "summary": _summary(event),
        "why_important": _why_important(event),
        "relevance_factors": _readable_reasons(event),
        "post_potential": post_potential,
        "sources": sources,
    }


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
    return {
        "topic": item.get("topic"),
        "status": item.get("status"),
        "news": item.get("news", []),
        "change_recommended": item.get("change_recommended"),
        "sources": item.get("sources", []),
    }


def build_public_report(result: dict[str, Any]) -> dict[str, Any]:
    local_now = datetime.now(ZURICH)
    selection = result.get("event_analysis", {}).get("daily_selection", [])
    procedures = result.get("procedure_monitoring", {}).get("results", [])
    risks = result.get("risk_monitoring", {}).get("results", [])

    return {
        "schema_version": 2,
        "date": local_now.date().isoformat(),
        "generated_at": local_now.isoformat(),
        "status": result.get("status"),
        "run_reliability": result.get("run_reliability"),
        "news": [_event_view(event) for event in selection],
        "procedures": [_procedure_view(item) for item in procedures],
        "risks": [_risk_view(item) for item in risks],
        "quality": {
            "source_warnings": len(result.get("news_discovery", {}).get("warnings", [])),
            "procedure_warnings": len(result.get("procedure_monitoring", {}).get("warnings", [])),
            "sources_attempted": result.get("news_discovery", {}).get("sources_attempted", 0),
            "sources_successful": result.get("news_discovery", {}).get("sources_successful", 0),
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
        "risk_changes": sum(1 for r in report.get("risks", []) if r.get("change_recommended") == "Ja"),
        "procedure_changes": sum(1 for p in report.get("procedures", []) if p.get("status") == "changed"),
    })
    entries.sort(key=lambda item: str(item.get("date", "")), reverse=True)
    index = {"schema_version": 1, "reports": entries[:730]}
    write_json(INDEX_PATH, index)
    return report_path, INDEX_PATH
