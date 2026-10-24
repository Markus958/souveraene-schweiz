from __future__ import annotations

import hashlib
import re
from typing import Any
from urllib.parse import urlparse

STOPWORDS = {
    "der","die","das","den","dem","des","ein","eine","einer","eines","und","oder","mit","für","von","zur","zum","bei","im","in","auf","aus","ist","sind","wird","werden","über","nach","vor","als","an","am","zu",
    "the","a","an","and","or","of","to","for","in","on","with","from","by","at","is","are","will","new",
}

# Basissignale: politisch relevante Begriffe. Einzelne Institutionsbegriffe erhalten
# bewusst nur kleine Gewichte; der eigentliche Rang entsteht über Themenprofil,
# Dossierbezug und konkrete Konflikt-/Kosten-/Vollzugssignale.
HIGH_VALUE_TERMS = {
    "schweiz": 2, "switzerland": 2, "bundesrat": 2, "bundesratsnachfolge": 5,
    "bundesratskandidatur": 6, "kandidatur": 4, "kandidieren": 4, "nachfolge": 4, "ticket": 3, "fraktion": 2,
    "parlament": 2, "nationalrat": 2, "staenderat": 2,
    "migration": 3, "zuwanderung": 5, "asyl": 3,
    "syrer": 6, "syrien": 4, "rueckkehr": 5, "abschiebung": 4,
    "personenfreizuegigkeit": 6, "stromabkommen": 5,
    "ubs": 5, "credit suisse": 5, "finma": 4, "snb": 3,
    "f-35": 5, "f35": 5, "patriot": 5,
    "rakete": 4, "raketen": 4, "kampfjet": 4, "kampfjets": 5,
    "waffensystem": 4, "waffensysteme": 4,
    "svp": 4, "sp": 3, "fdp": 4, "die mitte": 4, "gruene": 4, "glp": 3, "evp": 3,
    "schwaecheln": 4, "wahlbarometer": 5, "wahlumfrage": 4, "stimmenanteil": 3, "waehleranteil": 3,
    "ahv": 5, "13. ahv": 7,
    "eu-paket": 7, "2025/0162": 7, "afet": 6,
    "abstimmung": 3, "referendum": 4, "initiative": 4, "volksentscheid": 5, "staendemehr": 5,
    "stimmbuerger": 4, "souveraenitaet": 5, "mitsprache": 4, "vote": 2,
    "roll-call": 6, "roll call": 6,
    "eu": 2, "europa": 1, "europaeer": 4, "eu-gipfel": 4, "uneins": 4,

    # Steuern / Staatsfinanzen / Staatsausgaben
    "mwst": 6, "mehrwertsteuer": 6, "steuererhoehung": 6, "steuerbelastung": 5, "steuern": 4,
    "bundeshaushalt": 5, "defizit": 5, "schulden": 4, "subvention": 5, "subventionen": 5,
    "staatsausgaben": 5, "staatsfinanzen": 5,

    # Regulierung / wirtschaftliche Freiheit / Abhängigkeit
    "verbot": 4, "bewilligung": 3, "regulierung": 4, "marktzugang": 4, "wettbewerb": 4, "monopol": 4,
    "autarkie": 6, "abhaengigkeit": 5, "importabhaengigkeit": 6, "versorgungssicherheit": 5,

    # Bildung / Integration
    "pisa": 6, "schule": 5, "schueler": 4, "bildung": 5,
    "leistungsniveau": 5, "leistungsorientierung": 4, "migrationshintergrund": 5,
    "landessprache": 3, "integration": 3,

    # Service public / Staatsunternehmen
    "srg": 6, "service public": 5, "medienabgabe": 5, "gebuehr": 3,
    "stellenabbau": 3, "staatsunternehmen": 5,
    "post": 4, "postreform": 5, "a-post": 4, "postfinance": 5,
    "grundversorgung": 4, "privatisierung": 4,

    # Struktur- und Zukunftsthemen
    "ki": 4, "kuenstliche intelligenz": 5, "infrastruktur": 4,
    "energiepreise": 3, "budget": 3,

    # Editoriales Profil / wiederkehrende Themen der Website
    "armee": 5, "ruestung": 4, "rüstung": 4,
    "finanzierung": 4, "kosten": 3, "milliarden": 3,
    "pensionskasse": 4, "cyberangriff": 5, "cyber": 3,
    "wohnungsmarkt": 5, "wohnung": 3, "mieten": 3,
    "software": 3, "citysoftnet": 5, "it-desaster": 5,
    "verwaltung": 3, "vollzug": 4, "fehlsteuerung": 5,
    "polizei": 4, "krawall": 4, "sicherheit": 3,
    "mercosur": 4, "freihandel": 3,
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


def _contains_term(text_norm: str, term: str) -> bool:
    term_norm = _norm(term)
    if not term_norm:
        return False
    pattern = r"(?<![a-z0-9])" + re.escape(term_norm) + r"(?![a-z0-9])"
    return re.search(pattern, text_norm) is not None


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


def _context_term_allowed(term: str, searchable_norm: str, direct_terms: set[str]) -> bool:
    """Use nearby E-paper context only when title/deck contains a matching thematic anchor."""
    groups = (
        ({"pisa", "schule", "schueler", "bildung", "leistungsniveau", "leistungsorientierung", "migrationshintergrund", "landessprache", "integration"},
         {"migration", "zuwanderung", "integration", "migrationshintergrund", "landessprache"}),
        ({"srg", "service public", "medienabgabe", "gebuehr", "stellenabbau"},
         {"kosten", "finanzierung", "bundesrat", "verwaltung"}),
        ({"post", "postreform", "a-post", "postfinance", "grundversorgung", "privatisierung", "staatsunternehmen"},
         {"kosten", "finanzierung", "verwaltung", "vollzug"}),
        ({"syrer", "syrien", "asyl", "migration", "zuwanderung", "rueckkehr", "abschiebung"},
         {"migration", "asyl", "rueckkehr", "abschiebung", "vollzug"}),
        ({"f-35", "f35", "patriot", "armee", "ruestung", "rüstung", "rakete", "raketen", "kampfjet", "kampfjets", "waffensystem", "waffensysteme"},
         {"kosten", "finanzierung", "armee", "ruestung", "rüstung", "sicherheit", "schweiz", "bundesrat"}),
        ({"svp", "sp", "fdp", "die mitte", "gruene", "glp", "evp"},
         {"schweiz", "bundesrat", "parlament", "nationalrat", "staenderat"}),
        ({"ubs", "credit suisse", "finma", "snb"},
         {"kosten", "milliarden", "finanzierung", "bundesrat", "schweiz"}),
        ({"eu", "europa", "europaeer", "eu-gipfel", "eu-paket", "2025/0162", "afet"},
         {"eu", "europa", "europaeer", "eu-paket", "energiepreise", "budget"}),
        ({"ki", "kuenstliche intelligenz", "infrastruktur"},
         {"ki", "kuenstliche intelligenz", "infrastruktur", "kosten", "finanzierung"}),
        ({"bundesrat", "bundesratsnachfolge", "bundesratskandidatur", "kandidatur", "kandidieren", "nachfolge"},
         {"bundesrat", "bundesratsnachfolge", "bundesratskandidatur", "kandidatur", "kandidieren", "nachfolge", "ticket", "fraktion"}),
        ({"mwst", "mehrwertsteuer", "steuererhoehung", "steuern", "finanzierung", "bundeshaushalt", "defizit", "schulden"},
         {"mwst", "mehrwertsteuer", "steuererhoehung", "steuern", "finanzierung", "kosten", "milliarden", "bundeshaushalt", "defizit", "schulden", "subvention", "subventionen"}),
    )
    for anchors, allowed_context in groups:
        if direct_terms & anchors and term in allowed_context:
            return True
    return _contains_term(searchable_norm, term)


def _editorial_profile_bonus(matched_terms: set[str], finding: dict[str, Any]) -> tuple[int, list[str]]:
    """Prioritise the site's recurring dossiers and editorial themes over generic politics."""
    bonus = 0
    reasons: list[str] = []

    dossier_terms = {
        "ahv", "13. ahv", "ubs", "credit suisse", "f-35", "f35", "patriot",
        "personenfreizuegigkeit", "stromabkommen", "eu-paket", "2025/0162",
    }
    party_terms = {"svp", "sp", "fdp", "die mitte", "gruene", "glp", "evp"}
    party_trend_terms = {"schwaecheln", "wahlbarometer", "wahlumfrage", "stimmenanteil", "waehleranteil"}
    finance_state = {"finanzierung", "kosten", "milliarden", "armee", "ruestung", "rüstung"}
    tax_state = {"mwst", "mehrwertsteuer", "steuererhoehung", "steuerbelastung", "steuern", "bundeshaushalt", "defizit", "schulden", "subvention", "subventionen", "staatsausgaben", "staatsfinanzen"}
    succession = {"bundesrat", "bundesratsnachfolge", "bundesratskandidatur", "kandidatur", "kandidieren", "nachfolge", "ticket", "fraktion"}
    democracy = {"abstimmung", "referendum", "initiative", "volksentscheid", "staendemehr", "stimmbuerger", "souveraenitaet", "mitsprache"}
    regulation = {"verbot", "bewilligung", "regulierung", "marktzugang", "wettbewerb", "monopol"}
    sovereignty_economy = {"autarkie", "abhaengigkeit", "importabhaengigkeit", "versorgungssicherheit"}
    migration_infra = {"zuwanderung", "migration", "wohnungsmarkt", "wohnung", "mieten"}
    migration_policy = {"syrer", "syrien", "asyl", "rueckkehr", "abschiebung", "zuwanderung", "migration"}
    education = {"pisa", "schule", "schueler", "bildung", "leistungsniveau", "leistungsorientierung", "migrationshintergrund", "landessprache", "integration"}
    service_public = {"srg", "service public", "medienabgabe", "gebuehr", "stellenabbau", "staatsunternehmen", "post", "postreform", "a-post", "postfinance", "grundversorgung", "privatisierung"}
    future_structure = {"ki", "kuenstliche intelligenz", "infrastruktur"}
    eu_conflict = {"eu", "europa", "europaeer", "eu-gipfel", "uneins", "energiepreise", "budget"}
    execution_risk = {"software", "citysoftnet", "it-desaster", "verwaltung", "vollzug", "fehlsteuerung"}
    security = {"cyberangriff", "cyber", "pensionskasse", "polizei", "krawall", "sicherheit"}
    trade = {"mercosur", "freihandel", "referendum"}

    risk_ids = {str(v) for v in (finding.get("risk_ids", []) or [])}
    if matched_terms & dossier_terms or risk_ids:
        bonus += 5
        reasons.append("profile:dossier")
    swiss_political_context = {"schweiz", "bundesrat", "parlament", "nationalrat", "staenderat"}
    if matched_terms & party_terms and matched_terms & party_trend_terms and matched_terms & swiss_political_context:
        bonus += 5
        reasons.append("profile:party-election-shift")
    if len(matched_terms & finance_state) >= 2:
        bonus += 4
        reasons.append("profile:public-finance")
    if matched_terms & tax_state:
        bonus += 5
        reasons.append("profile:tax-public-finance")
    if len(matched_terms & succession) >= 2:
        bonus += 6
        reasons.append("profile:bundesrat-succession")
    if matched_terms & democracy:
        bonus += 4
        reasons.append("profile:direct-democracy")
    if matched_terms & regulation:
        bonus += 3
        reasons.append("profile:regulation-economic-freedom")
    if matched_terms & sovereignty_economy:
        bonus += 5
        reasons.append("profile:economic-sovereignty")
    if len(matched_terms & migration_infra) >= 2:
        bonus += 5
        reasons.append("profile:migration-infrastructure")
    if matched_terms & migration_policy:
        bonus += 5
        reasons.append("profile:migration-policy")
    if matched_terms & education:
        bonus += 5
        reasons.append("profile:education-performance")
    if matched_terms & service_public:
        bonus += 5
        reasons.append("profile:service-public")
    if len(matched_terms & future_structure) >= 2:
        bonus += 3
        reasons.append("profile:future-structure")
    if "uneins" in matched_terms and matched_terms & eu_conflict:
        bonus += 4
        reasons.append("profile:eu-internal-conflict")
    if matched_terms & execution_risk:
        bonus += 4
        reasons.append("profile:execution-risk")
    if matched_terms & security:
        bonus += 3
        reasons.append("profile:security")
    if len(matched_terms & trade) >= 2:
        bonus += 2
        reasons.append("profile:trade-conflict")

    # Konkrete Zahlen/Kosten erhöhen die Postfähigkeit stärker als reine Institutionsnamen.
    combined_text = " ".join([
        str(finding.get("title", "")),
        str(finding.get("subtitle", "")),
    ])
    if re.search(r"\b\d+(?:[.,]\d+)?\s*(?:mrd|milliard|mio|million|franken|prozent|%)\b", _norm(combined_text)):
        bonus += 2
        reasons.append("profile:concrete-number")

    return bonus, reasons


def _strategic_bonus(matched_terms: set[str], finding: dict[str, Any]) -> tuple[int, list[str]]:
    """Boost politically salient combinations without letting generic institutions dominate."""
    bonus = 0
    reasons: list[str] = []

    swiss_institutions = {"bundesrat", "parlament", "nationalrat", "staenderat"}
    succession_terms = {"bundesratsnachfolge", "bundesratskandidatur", "kandidatur", "kandidieren", "nachfolge", "ticket"}
    tax_terms = {"mwst", "mehrwertsteuer", "steuererhoehung", "steuerbelastung", "steuern"}
    fiscal_terms = {"finanzierung", "bundeshaushalt", "defizit", "schulden", "subvention", "subventionen", "staatsausgaben", "staatsfinanzen", "kosten", "milliarden"}
    democracy_terms = {"abstimmung", "referendum", "initiative", "volksentscheid", "staendemehr", "stimmbuerger", "souveraenitaet", "mitsprache"}
    regulation_terms = {"verbot", "bewilligung", "regulierung", "marktzugang", "wettbewerb", "monopol"}
    sovereignty_terms = {"autarkie", "abhaengigkeit", "importabhaengigkeit", "versorgungssicherheit"}
    eu_terms = {"eu", "europa", "europaeer", "eu-gipfel", "eu-paket", "2025/0162", "afet"}
    direct_democracy = {"abstimmung", "referendum", "vote", "roll-call", "roll call", "initiative", "volksentscheid", "staendemehr"}
    core_topics = {
        "personenfreizuegigkeit", "stromabkommen", "migration", "zuwanderung", "asyl", "syrer", "syrien", "rueckkehr",
        "ubs", "credit suisse", "f-35", "f35", "patriot", "ahv", "13. ahv", "mercosur",
        "pisa", "schule", "bildung", "srg", "post", "postreform", "postfinance",
    }

    if "bundesratsnachfolge" in matched_terms:
        bonus += 2
        reasons.append("strategic:bundesrat-succession")
    if "bundesrat" in matched_terms and matched_terms & succession_terms:
        bonus += 6
        reasons.append("strategic:bundesrat-candidacy")
    if matched_terms & swiss_institutions and matched_terms & tax_terms:
        bonus += 5
        reasons.append("strategic:institution-tax-burden")
    if matched_terms & tax_terms and matched_terms & fiscal_terms:
        bonus += 4
        reasons.append("strategic:tax-financing")
    if matched_terms & democracy_terms and matched_terms & swiss_institutions:
        bonus += 4
        reasons.append("strategic:democratic-power")
    if matched_terms & regulation_terms and (matched_terms & {"schweiz", "bundesrat", "parlament", "nationalrat", "staenderat"}):
        bonus += 4
        reasons.append("strategic:swiss-regulation")
    if matched_terms & sovereignty_terms and matched_terms & {"schweiz", "eu", "europa", "freihandel", "versorgungssicherheit"}:
        bonus += 4
        reasons.append("strategic:economic-dependency")
    if matched_terms & swiss_institutions and matched_terms & eu_terms:
        bonus += 2
        reasons.append("strategic:swiss-institution-eu")
    if matched_terms & direct_democracy and (matched_terms & eu_terms or matched_terms & core_topics):
        bonus += 4
        reasons.append("strategic:vote-conflict")
    if matched_terms & swiss_institutions and matched_terms & core_topics:
        bonus += 3
        reasons.append("strategic:institution-core-topic")

    if str(finding.get("source_role", "")) == "early_epaper" and len(matched_terms) >= 2:
        bonus += min(2, len(matched_terms) - 1)
        reasons.append("strategic:epaper-context")

    return bonus, reasons


def _has_direct_swiss_relevance(matched_terms: set[str], finding: dict[str, Any]) -> bool:
    swiss_signals = {
        "schweiz", "bundesrat", "bundesratsnachfolge", "bundesratskandidatur", "kandidatur", "kandidieren", "nachfolge",
        "parlament", "nationalrat", "staenderat", "personenfreizuegigkeit", "stromabkommen",
        "ubs", "credit suisse", "finma", "snb", "f-35", "f35", "patriot", "ahv", "13. ahv",
        "mwst", "mehrwertsteuer", "steuererhoehung", "steuerbelastung", "bundeshaushalt", "staatsfinanzen",
        "abstimmung", "referendum", "initiative", "volksentscheid", "staendemehr", "stimmbuerger", "souveraenitaet", "mitsprache",
        "autarkie", "importabhaengigkeit", "versorgungssicherheit",
        "pisa", "schule", "schueler", "bildung", "srg", "service public", "post", "postreform", "postfinance",
        "staatsunternehmen", "medienabgabe",
    }
    if matched_terms & swiss_signals or finding.get("risk_ids"):
        return True

    # E-paper article context can establish a Swiss defense-supply link when the
    # headline names weapons systems and the local article extract identifies
    # rearmament. This captures Swiss F-35/Patriot procurement coverage without
    # allowing unrelated foreign defense headlines into the domestic stream.
    source_id = str(finding.get("source_id") or "")
    source_role = str(finding.get("source_role") or "")
    context_terms = set(finding.get("detected_terms", []) or [])
    facts = finding.get("article_facts") if isinstance(finding.get("article_facts"), dict) else {}
    context_terms.update(facts.get("terms", []) or [])
    defense_systems = {"f-35", "f35", "patriot", "rakete", "raketen", "kampfjet", "kampfjets", "waffensystem", "waffensysteme"}
    defense_context = {"armee", "ruestung", "rüstung", "f-35", "f35", "patriot"}
    return (
        source_id in {"nzz-epaper", "nzzas-epaper"}
        and source_role == "early_epaper"
        and bool(matched_terms & defense_systems)
        and bool(context_terms & defense_context)
    )


def score_finding(finding: dict[str, Any], procedure_watches: list[dict[str, Any]]) -> tuple[int, list[str]]:
    title = _clean_title(str(finding.get("title", "")))
    title_norm = _norm(title)
    subtitle = str(finding.get("subtitle", "") or "").strip()
    searchable_norm = _norm(f"{title} {subtitle}")
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
    direct_terms: set[str] = set()
    for term, points in HIGH_VALUE_TERMS.items():
        if _contains_term(searchable_norm, term):
            score += points
            semantic_hits += 1
            matched_terms.add(term)
            direct_terms.add(term)
            reasons.append(term)

    # E-paper context is useful, but only if title/deck contains a matching thematic anchor.
    # This prevents neighbouring articles from injecting unrelated terms such as cyber/security.
    for raw_term in finding.get("detected_terms", []) or []:
        term = str(raw_term)
        if term in matched_terms or term not in HIGH_VALUE_TERMS:
            continue
        if not _context_term_allowed(term, searchable_norm, direct_terms):
            continue
        score += HIGH_VALUE_TERMS[term]
        semantic_hits += 1
        matched_terms.add(term)
        reasons.append(f"context:{term}")

    topics = set(finding.get("topics", []))
    if semantic_hits:
        if "schweiz-eu" in topics and matched_terms & {"schweiz", "eu", "europa", "europaeer", "eu-paket", "personenfreizuegigkeit", "stromabkommen"}:
            score += 1
        if topics & {"migration", "energie", "finanzen", "wirtschaft", "ubs", "f35", "patriot", "ahv"}:
            score += 1

    profile_points, profile_reasons = _editorial_profile_bonus(matched_terms, finding)
    score += profile_points
    reasons.extend(profile_reasons)

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
        if any(_contains_term(searchable_norm, str(ref)) for ref in refs if _norm(str(ref))):
            score += 8
            semantic_hits += 1
            reasons.append(f"procedure:{watch.get('id')}")

    if semantic_hits == 0:
        return 0, ["filtered:no_relevance_signal"]

    # Internationale Meldungen ohne erkennbaren Schweiz-Bezug sollen die Inlandsauswahl
    # nicht mehr verdrängen. Sie bleiben als schwache Kandidaten verfügbar, erreichen aber
    # die öffentliche Post-Potenzial-Schwelle in der Regel nicht.
    if not _has_direct_swiss_relevance(matched_terms, finding):
        score = min(score, 8)
        reasons.append("cap:no-direct-swiss-anchor")

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


def select_top_events(events: list[dict[str, Any]], limit: int = 10, hard_max: int = 10) -> list[dict[str, Any]]:
    strong = [e for e in events if e["score"] >= 8 and e.get("status") in {"Neu", "Update", "Korrektur", "Unklar"}]
    return strong[:hard_max]
