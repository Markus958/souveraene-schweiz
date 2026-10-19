from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from config import REPO_ROOT
from eventize import build_events
from storage import write_json

REPORT_DIR = REPO_ROOT / "data" / "monitor" / "reports"
INDEX_PATH = REPORT_DIR / "index.json"
ZURICH = ZoneInfo("Europe/Zurich")
WEEKDAYS_DE = ("Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag")

REASON_LABELS: dict[str, str] = {
    "schweiz": "Schweiz-Bezug", "switzerland": "Schweiz-Bezug", "bundesrat": "Bundesrat",
    "bundesratsnachfolge": "Bundesratsnachfolge/Bundesratswahl", "bundesratskandidatur": "Bundesratskandidatur",
    "kandidatur": "Kandidatur", "kandidieren": "Kandidatur", "nachfolge": "Nachfolge", "ticket": "Parteiticket", "fraktion": "Fraktion",
    "parlament": "Parlament", "nationalrat": "Nationalrat", "staenderat": "Ständerat", "migration": "Migration",
    "zuwanderung": "Zuwanderung", "asyl": "Asylpolitik", "personenfreizuegigkeit": "Personenfreizügigkeit",
    "stromabkommen": "Stromabkommen Schweiz–EU", "ubs": "UBS/Bankenregulierung", "finma": "FINMA/Bankenaufsicht",
    "snb": "SNB/Finanzstabilität", "f-35": "F-35/Air2030", "f35": "F-35/Air2030", "patriot": "Patriot/Bodluv",
    "ahv": "AHV", "13. ahv": "13. AHV-Rente", "eu-paket": "Vertragspaket Schweiz–EU",
    "2025/0162": "EU-Parlamentsverfahren Schweiz–EU-Paket", "afet": "AFET-Ausschuss",
    "abstimmung": "Abstimmung", "referendum": "Referendum/Volksentscheid", "initiative": "Volksinitiative",
    "volksentscheid": "Volksentscheid", "staendemehr": "Ständemehr", "stimmbuerger": "Stimmbürger",
    "souveraenitaet": "Souveränität", "mitsprache": "politische Mitsprache", "vote": "Abstimmungsentscheid",
    "roll-call": "namentliche Abstimmung/Mehrheitsverhältnisse", "roll call": "namentliche Abstimmung/Mehrheitsverhältnisse",
    "eu": "EU-Bezug", "europa": "Europapolitik", "armee": "Armee/Finanzierung", "ruestung": "Rüstung",
    "rüstung": "Rüstung", "finanzierung": "Finanzierung", "kosten": "Kosten", "milliarden": "Milliardenbelastung",
    "mwst": "Mehrwertsteuer", "mehrwertsteuer": "Mehrwertsteuer", "steuererhoehung": "Steuererhöhung",
    "steuerbelastung": "Steuerbelastung", "steuern": "Steuern", "bundeshaushalt": "Bundeshaushalt",
    "defizit": "Defizit", "schulden": "Schulden", "subvention": "Subventionen", "subventionen": "Subventionen",
    "staatsausgaben": "Staatsausgaben", "staatsfinanzen": "Staatsfinanzen",
    "verbot": "Regulierung/Verbot", "bewilligung": "Bewilligung", "regulierung": "Regulierung",
    "marktzugang": "Marktzugang", "wettbewerb": "Wettbewerb", "monopol": "Monopol",
    "autarkie": "Autarkie", "abhaengigkeit": "wirtschaftliche Abhängigkeit", "importabhaengigkeit": "Importabhängigkeit",
    "versorgungssicherheit": "Versorgungssicherheit",
    "pensionskasse": "Pensionskassen", "cyberangriff": "Cyberangriff", "cyber": "Cyberrisiko",
    "wohnungsmarkt": "Wohnungsmarkt", "wohnung": "Wohnungsmarkt", "mieten": "Mieten/Wohnungsmarkt",
    "software": "IT/Vollzug", "citysoftnet": "Citysoftnet", "it-desaster": "IT/Vollzug",
    "verwaltung": "Verwaltung/Vollzug", "vollzug": "Vollzug", "fehlsteuerung": "staatliche Fehlsteuerung",
    "polizei": "Polizei/Sicherheit", "krawall": "Sicherheit/Krawall", "sicherheit": "Sicherheit",
    "mercosur": "Mercosur/Freihandel", "freihandel": "Freihandel",
}

TOPIC_GROUPS: tuple[tuple[set[str], str], ...] = (
    ({"bundesratsnachfolge", "bundesratskandidatur", "kandidatur", "kandidieren", "nachfolge", "ticket"}, "die Nachfolge im Bundesrat"),
    ({"mwst", "mehrwertsteuer", "steuererhoehung", "steuerbelastung", "steuern", "bundeshaushalt", "defizit", "schulden", "staatsausgaben", "staatsfinanzen"}, "Steuern und Staatsfinanzen"),
    ({"initiative", "volksentscheid", "staendemehr", "stimmbuerger", "souveraenitaet", "mitsprache"}, "direkte Demokratie und politische Mitsprache"),
    ({"verbot", "bewilligung", "regulierung", "marktzugang", "wettbewerb", "monopol"}, "Regulierung und wirtschaftliche Freiheit"),
    ({"autarkie", "abhaengigkeit", "importabhaengigkeit", "versorgungssicherheit"}, "wirtschaftliche Souveränität und Versorgungssicherheit"),
    ({"eu-paket", "2025/0162", "afet", "roll-call", "roll call"}, "das Vertragspaket Schweiz–EU"),
    ({"personenfreizuegigkeit", "migration", "zuwanderung", "asyl"}, "Migration und Personenfreizügigkeit"),
    ({"stromabkommen"}, "das Stromabkommen Schweiz–EU"),
    ({"ubs", "finma", "snb"}, "UBS, Bankenregulierung und Finanzstabilität"),
    ({"f-35", "f35"}, "F-35/Air2030"), ({"patriot"}, "Patriot/Bodluv"),
    ({"13. ahv", "ahv"}, "die AHV bzw. die 13. AHV-Rente"),
    ({"armee", "ruestung", "rüstung", "finanzierung"}, "Armee, Finanzierung und Staatsfinanzen"),
    ({"wohnungsmarkt", "wohnung", "mieten"}, "Wohnungsmarkt und Infrastrukturfolgen"),
    ({"software", "citysoftnet", "it-desaster", "verwaltung", "vollzug", "fehlsteuerung"}, "staatlichen Vollzug und Verantwortlichkeit"),
    ({"pensionskasse", "cyberangriff", "cyber"}, "Cyber- und Pensionskassenrisiken"),
    ({"polizei", "krawall", "sicherheit"}, "Sicherheit und staatliche Handlungsfähigkeit"),
    ({"mercosur", "freihandel"}, "Mercosur und Freihandel"),
)


def _source_view(source: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": source.get("source_id"), "name": source.get("source_name"), "title": source.get("title"),
        "subtitle": source.get("subtitle"), "url": source.get("url"), "priority": source.get("priority"),
        "class": source.get("source_class"), "role": source.get("source_role"), "stage": source.get("source_stage"),
        "page": source.get("page"), "article_facts": source.get("article_facts") or {},
    }


def _readable_reasons(event: dict[str, Any]) -> list[str]:
    readable: list[str] = []
    for raw in event.get("reasons", []):
        reason = str(raw)
        if reason.startswith("context:"):
            reason = reason.split(":", 1)[1]
        if reason.startswith("procedure:"):
            label = "EU-Parlamentsverfahren Schweiz–EU-Paket"
        elif reason.startswith("strategic:") or reason.startswith("profile:") or reason.startswith("cap:"):
            continue
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


def _best_source(sources: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not sources:
        return None
    priority_rank = {"P1": 0, "P2": 1, "M1": 2, "M2": 3}
    class_rank = {"A": 0, "B": 1, "C": 2, "D": 3}
    return min(sources, key=lambda src: (priority_rank.get(str(src.get("priority")), 9), class_rank.get(str(src.get("source_class")), 9)))


def _summary(event: dict[str, Any]) -> str:
    sources = list(event.get("sources", []))
    best = _best_source(sources)
    subtitle = str((best or {}).get("subtitle") or "").strip()
    reasons = {str(value).split(":", 1)[-1] for value in event.get("reasons", [])}
    parts: list[str] = []
    if subtitle:
        parts.append(subtitle.rstrip(".?!") + ".")
    if reasons & {"bundesratsnachfolge", "bundesratskandidatur", "kandidatur", "kandidieren", "nachfolge"}:
        parts.append("Im Zentrum steht die Nachfolge im Bundesrat.")
    elif not parts:
        topic = _topic_label(event)
        status = str(event.get("status") or "Neu")
        if status == "Korrektur":
            parts.append(f"Korrektur zu {topic}.")
        elif status == "Unklar":
            parts.append(f"Noch nicht abschliessend bestätigte Entwicklung zu {topic}.")
        elif status == "Duplikat":
            parts.append(f"Aktuelle Meldung zu {topic}; bereits früher erfasst.")
        else:
            parts.append(f"Neue Entwicklung zu {topic}.")
    source_count = max(1, int(event.get("source_count") or len(sources) or 1))
    if source_count > 1 and len(parts) < 3:
        parts.append(f"Der Monitor erfasst dazu {source_count} getrennte Quellen.")
    return " ".join(parts[:3])


def _why_important(event: dict[str, Any]) -> str:
    reasons = _readable_reasons(event)
    return " · ".join(reasons[:3]) if reasons else "Schweiz-Relevanz"


def _has_concrete_signal(event: dict[str, Any]) -> bool:
    strong_terms = {
        "personenfreizuegigkeit", "stromabkommen", "eu-paket", "2025/0162", "afet", "roll-call", "roll call",
        "migration", "zuwanderung", "asyl", "syrer", "syrien", "rueckkehr", "abschiebung",
        "ubs", "finma", "snb", "f-35", "f35", "patriot", "ahv", "13. ahv",
        "pisa", "schule", "schueler", "bildung", "srg", "service public", "post", "postreform", "postfinance",
        "referendum", "abstimmung", "initiative", "volksentscheid", "bundesratskandidatur", "kandidatur", "nachfolge",
        "mwst", "mehrwertsteuer", "steuererhoehung", "steuerbelastung", "defizit", "schulden", "subvention", "subventionen",
        "autarkie", "abhaengigkeit", "importabhaengigkeit", "versorgungssicherheit", "verbot", "regulierung",
        "kosten", "finanzierung", "milliarden", "stellenabbau",
    }
    reasons = {str(value).split(":", 1)[-1] for value in event.get("reasons", [])}
    text = " ".join(
        str(src.get("title") or "") + " " + str(src.get("subtitle") or "")
        for src in event.get("sources", []) if isinstance(src, dict)
    ).casefold()
    facts = [src.get("article_facts") or {} for src in event.get("sources", []) if isinstance(src, dict)]
    has_figures = any((fact.get("figures") or []) for fact in facts)
    has_number = bool(re.search(r"\b\d+(?:[.,]\d+)?\s*(?:mrd|milliard|mio|million|franken|prozent|%|stellen|plätze|tage|jahre)?\b", text))
    action_words = ("beschliesst", "beschlossen", "entscheid", "stimmt", "abstimmung", "referendum", "kürzt", "kuerzt", "senkt", "erhöht", "erhoeht", "streicht", "baut", "kündigt", "kuendigt", "tritt in kraft", "verabschiedet", "kandidiert", "kandidatur", "prüft", "prueft", "verbot")
    has_action = any(word in text for word in action_words)
    return has_figures or has_number or has_action or bool(reasons & strong_terms)


def _post_potential(event: dict[str, Any]) -> int:
    internal_score = int(event.get("score") or 0)
    potential = max(1, min(10, (internal_score + 1) // 2)) if internal_score else 1
    text = " ".join(str(src.get("title") or "") for src in event.get("sources", []) if isinstance(src, dict)).casefold()
    analysis_only = any(marker in text for marker in (" analyse ", "kommentar", "strassenumfrage", "was beschäftigt", "was beschaeftigt"))
    if potential >= 9 and not _has_concrete_signal(event):
        potential = 8
    if analysis_only and not _has_concrete_signal(event):
        potential = min(potential, 7)
    return potential


def _post_approach(event: dict[str, Any]) -> str:
    summary = _summary(event)
    reasons = _readable_reasons(event)
    focus = " · ".join(reasons[:2]) if reasons else "politische Relevanz für die Schweiz"
    return f"{summary} Den Post auf {focus} zuspitzen und den konkreten politischen Konflikt bzw. die Folge für die Schweiz herausarbeiten." if summary else f"Den Post auf {focus} zuspitzen und mit der konkreten neuen Entwicklung beginnen."


def _source_display(source: dict[str, Any] | None) -> str:
    if not source:
        return "-"
    source_id = str(source.get("source_id") or "")
    name = str(source.get("source_name") or "")
    if source_id == "nzz-epaper":
        return "NZZ E-Paper"
    if source_id.startswith("nzz") or "NZZ" in name or "Neue Zuercher Zeitung" in name:
        return "NZZ"
    if source_id == "srf" or name.startswith("SRF"):
        return "SRF"
    return name or "-"


def _article_detail(event: dict[str, Any], best: dict[str, Any] | None) -> dict[str, Any]:
    facts = (best or {}).get("article_facts") or {}
    terms = [REASON_LABELS.get(str(term), str(term)) for term in facts.get("terms", []) if str(term)]
    topics: list[str] = []
    for label in [*_readable_reasons(event), *terms]:
        if label and label not in topics:
            topics.append(label)
    return {
        "summary": _summary(event),
        "topics": topics[:6],
        "figures": [str(v) for v in facts.get("figures", []) if str(v).strip()][:6],
        "relevance": _why_important(event),
        "basis": facts.get("basis") or "Titel, Untertitel und strukturierte Monitorsignale",
    }


def _event_view(event: dict[str, Any], report_date: datetime, selected_ids: set[str] | None = None) -> dict[str, Any]:
    raw_sources = list(event.get("sources", []))[:6]
    sources = [_source_view(src) for src in raw_sources]
    best = _best_source(raw_sources)
    event_id = str(event.get("event_id") or "")
    return {
        "event_id": event.get("event_id"), "weekday": WEEKDAYS_DE[report_date.weekday()], "date": report_date.date().isoformat(),
        "status": event.get("status"), "source_stage": event.get("source_stage"), "headline": event.get("title"),
        "summary": _summary(event), "why_important": _why_important(event), "post_approach": _post_approach(event),
        "source_display": _source_display(best), "page": (best or {}).get("page"), "relevance_factors": _readable_reasons(event),
        "post_potential": _post_potential(event), "selected": event_id in (selected_ids or set()),
        "source": _source_view(best) if best else None, "sources": sources,
        "risk_dossiers": event.get("risk_dossiers") or event.get("risk_ids") or [],
        "article_detail": _article_detail(event, best),
    }


def _rescore_epaper_event(event: dict[str, Any], procedure_watches: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sources = [src for src in (event.get("sources") or []) if isinstance(src, dict)]
    if not sources:
        return [event] if _post_potential(event) >= 5 else []
    rescored = build_events(sources, procedure_watches)
    if not rescored:
        return []
    for current in rescored:
        current["status"] = event.get("status") or "Duplikat"
        current["source_stage"] = event.get("source_stage") or "Vorab E-Paper"
        current["risk_dossiers"] = event.get("risk_dossiers") or event.get("risk_ids") or []
    return rescored


def _load_epaper_candidates(report_date: str, procedure_watches: list[dict[str, Any]]) -> list[dict[str, Any]]:
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
            if not isinstance(event, dict):
                continue
            for rescored in _rescore_epaper_event(event, procedure_watches):
                if _post_potential(rescored) >= 5:
                    candidates.append(rescored)
    return candidates


def _norm_candidate_title(value: Any) -> str:
    text = str(value or "").casefold()
    text = re.sub(r"^(?:kommentar|analyse|pro artikel)\s+(?:von\s+)?(?:[a-zäöüéèêàçß-]+\s+){0,4}", "", text)
    text = re.sub(r"[^a-z0-9äöüß ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _same_candidate(a: dict[str, Any], b: dict[str, Any]) -> bool:
    aid = str(a.get("event_id") or "").strip()
    bid = str(b.get("event_id") or "").strip()
    if aid and bid and aid == bid:
        return True
    at = _norm_candidate_title(a.get("title"))
    bt = _norm_candidate_title(b.get("title"))
    if not at or not bt:
        return False
    if min(len(at), len(bt)) >= 24 and (at in bt or bt in at):
        return True
    aset = {t for t in at.split() if len(t) >= 4}
    bset = {t for t in bt.split() if len(t) >= 4}
    if not aset or not bset:
        return False
    return len(aset & bset) / len(aset | bset) >= 0.60


def _merge_candidates(web_candidates: list[dict[str, Any]], epaper_candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    for event in [*web_candidates, *epaper_candidates]:
        duplicate = next((existing for existing in merged if _same_candidate(existing, event)), None)
        if duplicate is None:
            merged.append(dict(event))
            continue
        duplicate["score"] = max(int(duplicate.get("score") or 0), int(event.get("score") or 0))
        existing_sources = list(duplicate.get("sources", []) or [])
        known = {str(src.get("fingerprint") or src.get("url") or "") for src in existing_sources if isinstance(src, dict)}
        for src in event.get("sources", []) or []:
            if not isinstance(src, dict):
                continue
            key = str(src.get("fingerprint") or src.get("url") or "")
            if key and key not in known:
                existing_sources.append(src)
                known.add(key)
        duplicate["sources"] = existing_sources
        duplicate["source_count"] = len(existing_sources)
        duplicate["risk_dossiers"] = sorted(set((duplicate.get("risk_dossiers") or []) + (event.get("risk_dossiers") or [])))
        if duplicate.get("source_stage") == "Vorab E-Paper" and any(src.get("source_role") != "early_epaper" for src in existing_sources if isinstance(src, dict)):
            duplicate["source_stage"] = "Web bestätigt"
        if str(event.get("status") or "") in {"Neu", "Update", "Korrektur", "Unklar"}:
            duplicate["status"] = event.get("status")
    merged.sort(key=lambda event: (_post_potential(event), int(event.get("score") or 0), int(event.get("source_count") or 0)), reverse=True)
    return merged


def _select_public_news(candidate_events: list[dict[str, Any]], limit: int = 10) -> list[dict[str, Any]]:
    # This is the current working list, not the alert delta. Known/duplicate items
    # stay eligible so a scoring-rule change can immediately re-rank today's news.
    eligible = [event for event in candidate_events if _post_potential(event) >= 5]
    return eligible[:limit]


def _procedure_view(item: dict[str, Any]) -> dict[str, Any]:
    signal = item.get("signal") if isinstance(item.get("signal"), dict) else {}
    status = str(item.get("status") or "")
    if status == "changed": description = "Verfahrensstand hat sich gegenüber der letzten vollständigen Prüfung geändert."
    elif status == "baseline": description = "Ausgangsstand für die weitere Überwachung erfasst."
    elif status == "unchanged": description = "Keine Änderung gegenüber dem letzten vollständigen Stand."
    else: description = "Verfahrensstand konnte nicht abschliessend beurteilt werden."
    return {
        "watch_id": item.get("watch_id"), "page": item.get("page"), "status": status, "url": item.get("url"),
        "references": signal.get("expected_references_found", []), "documents": signal.get("known_documents_found", []),
        "dates": signal.get("dates", []), "description": description,
        "relevance_ch": "Betrifft das parlamentarische EU-Verfahren zum Schweiz–EU-Paket und damit den institutionellen Fortgang der Abkommen.",
    }


def _risk_view(item: dict[str, Any]) -> dict[str, Any]:
    news_items = [str(v) for v in item.get("news", []) if str(v).strip()]
    complete = bool(item.get("source_check_complete", True))
    if not complete: news_text = "Quellenprüfung unvollständig; keine belastbare Aussage 'keine Neuigkeit' möglich."
    elif news_items: news_text = " | ".join(news_items[:3])
    else: news_text = "-"
    primary_source = item.get("sources", [None])[0] if item.get("sources") else None
    return {
        "date": item.get("date"), "topic": item.get("topic"), "status": item.get("status"), "news": news_items,
        "news_text": news_text, "change_recommended": item.get("change_recommended"), "primary_source": primary_source,
        "sources": item.get("sources", []), "source_check_complete": complete,
        "failed_p1_sources": list(item.get("failed_p1_sources", [])), "missing_p1_sources": list(item.get("missing_p1_sources", [])),
    }


def _source_statuses(result: dict[str, Any]) -> list[dict[str, Any]]:
    runs = result.get("news_discovery", {}).get("source_runs", []) or []
    good = {"new_publication", "checked_no_new"}
    return [{"id": run.get("source_id"), "name": run.get("source_name") or run.get("source_id"), "status": run.get("status"), "ok": run.get("status") in good} for run in runs]


def build_public_report(result: dict[str, Any]) -> dict[str, Any]:
    local_now = datetime.now(ZURICH)
    report_date = local_now.date().isoformat()
    event_analysis = result.get("event_analysis", {})
    current_events = event_analysis.get("current_events") or event_analysis.get("events", [])
    web_candidates = [event for event in current_events if _post_potential(event) >= 5]
    procedure_watches = result.get("procedure_watches", []) or []
    epaper_candidates = _load_epaper_candidates(report_date, procedure_watches)
    candidate_events = _merge_candidates(web_candidates, epaper_candidates)
    selection = _select_public_news(candidate_events)
    selected_ids = {str(event.get("event_id") or "") for event in selection}
    procedures = result.get("procedure_monitoring", {}).get("results", [])
    risks = result.get("risk_monitoring", {}).get("results", [])
    source_statuses = _source_statuses(result)
    return {
        "schema_version": 9, "date": report_date, "weekday": WEEKDAYS_DE[local_now.weekday()], "generated_at": local_now.isoformat(),
        "status": result.get("status"), "run_reliability": result.get("run_reliability"),
        "news": [_event_view(event, local_now, selected_ids) for event in selection],
        "news_candidates": [_event_view(event, local_now, selected_ids) for event in candidate_events],
        "candidate_sources": {"web": len(web_candidates), "epaper": len(epaper_candidates), "rescored": True},
        "procedures": [_procedure_view(item) for item in procedures], "risks": [_risk_view(item) for item in risks],
        "quality": {
            "source_warnings": len(result.get("news_discovery", {}).get("warnings", [])),
            "procedure_warnings": len(result.get("procedure_monitoring", {}).get("warnings", [])),
            "sources_attempted": result.get("news_discovery", {}).get("sources_attempted", 0),
            "sources_successful": result.get("news_discovery", {}).get("sources_successful", 0),
            "source_statuses": source_statuses,
            "risk_incomplete": sum(1 for r in risks if not r.get("source_check_complete", True)),
        },
    }


def _load_index() -> dict[str, Any]:
    if not INDEX_PATH.is_file(): return {"schema_version": 1, "reports": []}
    try:
        data = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("reports"), list): return data
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
        "date": report_date, "path": f"{report_date}.json", "status": report.get("status"),
        "run_reliability": report.get("run_reliability"), "news_count": len(report.get("news", [])),
        "news_candidates_count": len(report.get("news_candidates", [])),
        "risk_changes": sum(1 for r in report.get("risks", []) if r.get("change_recommended") == "Ja"),
        "risk_incomplete": sum(1 for r in report.get("risks", []) if not r.get("source_check_complete", True)),
        "procedure_changes": sum(1 for p in report.get("procedures", []) if p.get("status") == "changed"),
    })
    entries.sort(key=lambda item: str(item.get("date") or ""), reverse=True)
    index["schema_version"] = 1
    index["updated_at"] = datetime.now(ZURICH).isoformat()
    index["reports"] = entries
    write_json(INDEX_PATH, index)
    return report_path, INDEX_PATH