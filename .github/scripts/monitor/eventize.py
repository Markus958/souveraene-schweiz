from __future__ import annotations

import hashlib
import re
from collections import defaultdict
from typing import Any

STOPWORDS = {
    "der","die","das","den","dem","des","ein","eine","einer","eines","und","oder","mit","für","von","zur","zum","bei","im","in","auf","aus","ist","sind","wird","werden","über","nach","vor","als","an","am","zu",
    "the","a","an","and","or","of","to","for","in","on","with","from","by","at","is","are","will","new",
}

HIGH_VALUE_TERMS = {
    "schweiz": 3, "switzerland": 3, "eu": 2, "europa": 2, "bundesrat": 3,
    "parlament": 2, "nationalrat": 3, "staenderat": 3, "migration": 3,
    "zuwanderung": 3, "personenfreizuegigkeit": 4, "stromabkommen": 4,
    "ubs": 4, "finma": 3, "snb": 2, "f-35": 4, "f35": 4, "patriot": 4,
    "ahv": 4, "13. ahv": 5, "eu-paket": 5, "2025/0162": 5, "afet": 4,
    "abstimmung": 3, "vote": 2, "roll-call": 4, "roll call": 4,
}

SOURCE_BONUS = {"A": 3, "B": 2, "C": 1, "D": 0}
PRIORITY_BONUS = {"P1": 2, "P2": 1, "M1": 2, "M2": 0}


def _norm(text: str) -> str:
    text = text.casefold()
    text = text.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    text = re.sub(r"[^a-z0-9\-/ ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _tokens(title: str) -> set[str]:
    return {t for t in _norm(title).split() if len(t) >= 4 and t not in STOPWORDS}


def _similarity(a: str, b: str) -> float:
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def _event_id(title: str) -> str:
    digest = hashlib.sha1(_norm(title).encode("utf-8")).hexdigest()[:12]
    return f"EV-{digest.upper()}"


def score_finding(finding: dict[str, Any], procedure_watches: list[dict[str, Any]]) -> tuple[int, list[str]]:
    title_norm = _norm(str(finding.get("title", "")))
    score = 0
    reasons: list[str] = []

    source_class = str(finding.get("source_class", ""))
    priority = str(finding.get("priority", ""))
    score += SOURCE_BONUS.get(source_class, 0)
    score += PRIORITY_BONUS.get(priority, 0)

    for term, points in HIGH_VALUE_TERMS.items():
        if _norm(term) in title_norm:
            score += points
            reasons.append(term)

    topics = set(finding.get("topics", []))
    if "schweiz-eu" in topics:
        score += 2
    if topics & {"migration", "energie", "finanzen", "wirtschaft", "ubs", "f35", "patriot", "ahv"}:
        score += 1

    for watch in procedure_watches:
        if not watch.get("active", True):
            continue
        refs = [watch.get("procedure_reference", ""), watch.get("parent_procedure_reference", ""), watch.get("committee", ""), watch.get("committee_dossier", "")]
        if any(_norm(str(ref)) and _norm(str(ref)) in title_norm for ref in refs):
            score += 6
            reasons.append(f"procedure:{watch.get('id')}")

    return min(score, 20), reasons


def build_events(findings: list[dict[str, Any]], procedure_watches: list[dict[str, Any]]) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []

    for finding in findings:
        score, reasons = score_finding(finding, procedure_watches)
        if score < 4:
            continue

        match = None
        best = 0.0
        for event in events:
            sim = _similarity(str(finding.get("title", "")), event["title"])
            if sim > best:
                best = sim
                match = event

        if match is not None and best >= 0.48:
            match["sources"].append(finding)
            match["source_count"] = len(match["sources"])
            match["score"] = min(20, max(match["score"], score) + min(2, match["source_count"] - 1))
            match["reasons"] = sorted(set(match["reasons"] + reasons))
            if finding.get("source_class") == "A" and match.get("primary_source") is None:
                match["primary_source"] = finding
            continue

        events.append({
            "event_id": _event_id(str(finding.get("title", ""))),
            "title": finding.get("title"),
            "score": score,
            "status": "Neu",
            "reasons": reasons,
            "source_count": 1,
            "primary_source": finding if finding.get("source_class") == "A" else None,
            "sources": [finding],
        })

    events.sort(key=lambda e: (e["score"], e["source_count"]), reverse=True)
    return events


def select_top_events(events: list[dict[str, Any]], limit: int = 5, hard_max: int = 10) -> list[dict[str, Any]]:
    # No filler: only events with a meaningful score enter the daily selection.
    strong = [e for e in events if e["score"] >= 7]
    if len(strong) <= limit:
        return strong
    selected = strong[:limit]
    # Keep additional exceptionally strong events, but never exceed hard_max.
    for event in strong[limit:hard_max]:
        if event["score"] >= 13:
            selected.append(event)
    return selected[:hard_max]
