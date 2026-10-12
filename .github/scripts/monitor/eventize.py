from __future__ import annotations

import hashlib
import re
from typing import Any
from urllib.parse import urlparse

STOPWORDS = {
    "der","die","das","den","dem","des","ein","eine","einer","eines","und","oder","mit","für","von","zur","zum","bei","im","in","auf","aus","ist","sind","wird","werden","über","nach","vor","als","an","am","zu",
    "the","a","an","and","or","of","to","for","in","on","with","from","by","at","is","are","will","new",
}

HIGH_VALUE_TERMS = {
    "schweiz": 2, "switzerland": 2, "bundesrat": 2, "bundesratsnachfolge": 6,
    "parlament": 2, "nationalrat": 3, "staenderat": 3,
    "migration": 3, "zuwanderung": 4, "asyl": 3,
    "personenfreizuegigkeit": 5, "stromabkommen": 5,
    "ubs": 5, "finma": 4, "snb": 3,
    "f-35": 5, "f35": 5, "patriot": 5,
    "ahv": 4, "13. ahv": 6,
    "eu-paket": 6, "2025/0162": 7, "afet": 6,
    "abstimmung": 3, "referendum": 4, "vote": 2,
    "roll-call": 6, "roll call": 6,
    "eu": 2, "europa": 1,
}

SOURCE_BONUS = {"A": 2, "B": 2, "C": 1, "D": 0}
PRIORITY_BONUS = {"P1": 1, "P2": 0, "M1": 1, "M2": 0}

GENERIC_TITLES = {
    "sem staatssekretariat fuer migration",
    "staatssekretariat fuer migration sem",
    "staatssekretariat fuer migration",
    "personenfreizuegigkeit schweiz eu/efta",
    "schweizerische migrationsaussenpolitik",
    "research at the snb",
    "asyl / schutz vor verfolgung",
}

LOW_SIGNAL_PHRASES = (
    "vertritt die schweiz an der",
    "setzt sich am geneva peace forum",
    "trainieren erfolgreich die bewaeltigung",
)


def _norm(text: str) -> str:
    text = text.casefold()
    text = text.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    text = re.sub(r"[^a-z0-9\-/ ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _clean_title(title: str) -> str:
    title = re.sub(r"^\s*Mehr über\s*[«\"]\s*", "", title, flags=re.IGNORECASE)
    title = re.sub(r"\s*[»\"]\s*$", "", title)
    return re.sub(r"\s+", " ", title).strip()


def _tokens(title: str) -> set[str]:
    return {t for t in _norm(title).split() if len(t) >= 4 and t not in STOPWORDS}


def event_similarity(a: str, b: str) -> float:
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def _event_id(title: str) -> str:
    digest = hashlib.sha1(_norm(title).encode("utf-8")).hexdigest()[:12]
    return f"EV-{digest.upper()}"


def _contains_term(title_norm: str, term: str) -> bool:
    term_norm = _norm(term)
    if not term_norm:
        return False
    pattern = r"(?<![a-z0-9])" + re.escape(term_norm) + r"(?![a-z0-9])"
    return re.search(pattern, title_norm) is not None


def _is_generic_or_static(finding: dict[str, Any], title_norm: str) -> bool:
    if title_norm in GENERIC_TITLES:
        return True
    if any(phrase in title_norm for phrase in LOW_SIGNAL_PHRASES):
        return True

    source_id = str(finding.get("source_id", ""))
    path = urlparse(str(finding.get("url", ""))).path.casefold()

    if source_id == "ch-sem":
        if path.endswith("/home.html") or "/themen/" in path or "/international-rueckkehr/" in path:
            return True

    return False


def _strategic_bonus(matched_terms: set[str], finding: dict[str, Any]) -> tuple[int, list[str]]:
    """Boost politically salient combinations instead of relying on isolated keywords only."""
    bonus = 0
    reasons: list[str] = []

    swiss_institutions = {"bundesrat", "parlament", "nationalrat", "staenderat"}
    eu_terms = {"eu", "europa", "eu-paket", "2025/0162", "afet"}
    direct_democracy = {"abstimmung", "referendum", "vote", "roll-call", "roll call"}
    core_topics = {"personenfreizuegigkeit", "stromabkommen", "migration", "zuwanderung", "asyl", "ubs", "f-35", "f35", "patriot", "ahv", "13. ahv"}

    if "bundesratsnachfolge" in matched_terms:
        bonus += 5
        reasons.append("strategic:bundesrat-succession")
    if matched_terms & swiss_institutions and matched_terms & eu_terms:
        bonus += 5
        reasons.append("strategic:swiss-institution-eu")
    if matched_terms & direct_democracy and (matched_terms & eu_terms or matched_terms & core_topics):
        bonus += 4
        reasons.append("strategic:vote-conflict")
    if matched_terms & swiss_institutions and matched_terms & core_topics:
        bonus += 3
        reasons.append("strategic:institution-core-topic")

    # E-paper context is useful for opaque headlines, but only reward combinations, not isolated neighbours.
    if str(finding.get("source_role", "")) == "early_epaper" and len(matched_terms) >= 2:
        bonus += min(2, len(matched_terms) - 1)
        reasons.append("strategic:epaper-context")

    return bonus, reasons


def score_finding(finding: dict[str, Any], procedure_watches: list[dict[str, Any]]) -> tuple[int, list[str]]:
    title = _clean_title(str(finding.get("title", "")))
    title_norm = _norm(title)
    if not title_norm or _is_generic_or_static(finding, title_norm):
        return 0, ["filtered:generic_or_static"]

    score = 0
    reasons: list[str] = []

    source_class = str(finding.get("source_class", ""))
    priority = str(finding.get("priority", ""))
    score += SOURCE_BONUS.get(source_class, 0)
    score += PRIORITY_BONUS.get(priority, 0)

    semantic_hits = 0
    matched_terms: set[str] = set()
    for term, points in HIGH_VALUE_TERMS.items():
        if _contains_term(title_norm, term):
            score += points
            semantic_hits += 1
            matched_terms.add(term)
            reasons.append(term)

    # E-paper PDF extraction may infer a topic from nearby deck/context text without storing article text.
    for raw_term in finding.get("detected_terms", []) or []:
        term = str(raw_term)
        if term in matched_terms or term not in HIGH_VALUE_TERMS:
            continue
        score += HIGH_VALUE_TERMS[term]
        semantic_hits += 1
        matched_terms.add(term)
        reasons.append(f"context:{term}")

    topics = set(finding.get("topics", []))
    if semantic_hits:
        if "schweiz-eu" in topics:
            score += 1
        if topics & {"migration", "energie", "finanzen", "wirtschaft", "ubs", "f35", "patriot", "ahv"}:
            score += 1

    strategic_points, strategic_reasons = _strategic_bonus(matched_terms, finding)
    score += strategic_points
    reasons.extend(strategic_reasons)

    for watch in procedure_watches:
        if not watch.get("active", True):
            continue
        refs = [
            watch.get("procedure_reference", ""),
            watch.get("parent_procedure_reference", ""),
            watch.get("committee", ""),
            watch.get("committee_dossier", ""),
        ]
        if any(_contains_term(title_norm, str(ref)) for ref in refs if _norm(str(ref))):
            score += 8
            semantic_hits += 1
            reasons.append(f"procedure:{watch.get('id')}")

    if semantic_hits == 0:
        return 0, ["filtered:no_relevance_signal"]

    return min(score, 20), reasons


def build_events(findings: list[dict[str, Any]], procedure_watches: list[dict[str, Any]]) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []

    for finding in findings:
        clean_title = _clean_title(str(finding.get("title", "")))
        score, reasons = score_finding(finding, procedure_watches)
        if score < 5:
            continue

        normalized_finding = dict(finding)
        normalized_finding["title"] = clean_title

        match = None
        best = 0.0
        for event in events:
            sim = event_similarity(clean_title, event["title"])
            if sim > best:
                best = sim
                match = event

        if match is not None and best >= 0.48:
            match["sources"].append(normalized_finding)
            match["source_count"] = len(match["sources"])
            match["score"] = min(20, max(match["score"], score) + min(2, match["source_count"] - 1))
            match["reasons"] = sorted(set(match["reasons"] + reasons))
            if normalized_finding.get("source_class") == "A" and match.get("primary_source") is None:
                match["primary_source"] = normalized_finding
            continue

        events.append({
            "event_id": _event_id(clean_title),
            "title": clean_title,
            "score": score,
            "status": "Neu",
            "reasons": reasons,
            "source_count": 1,
            "primary_source": normalized_finding if normalized_finding.get("source_class") == "A" else None,
            "sources": [normalized_finding],
        })

    events.sort(key=lambda e: (e["score"], e["source_count"]), reverse=True)
    return events


def select_top_events(events: list[dict[str, Any]], limit: int = 5, hard_max: int = 10) -> list[dict[str, Any]]:
    strong = [e for e in events if e["score"] >= 8 and e.get("status") in {"Neu", "Update", "Korrektur", "Unklar"}]
    if len(strong) <= limit:
        return strong

    selected = strong[:limit]
    for event in strong[limit:hard_max]:
        if event["score"] >= 17:
            selected.append(event)
    return selected[:hard_max]
