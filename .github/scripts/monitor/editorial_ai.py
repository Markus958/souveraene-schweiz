from __future__ import annotations

import hashlib
import json
import os
import random
import re
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from config import REPO_ROOT
from eventize import event_similarity
from storage import write_json
from url_identity import canonical_url

PROMPT_VERSION = "editorial-v1"
PROMPT_PATH = Path(__file__).with_name("prompts") / "editorial_v1.md"
CACHE_PATH = Path(os.getenv("EDITORIAL_AI_CACHE_PATH", str(REPO_ROOT / ".cache" / "newsmonitor" / "editorial_ai_cache.json")))
API_URL = "https://api.openai.com/v1/responses"
PRIORITIES = {"hoch", "mittel", "gering"}

ANALYSIS_FIELDS = (
    "article_id", "event_id", "headline", "original_source", "original_url",
    "published_at", "discovery_channels", "summary", "new_information",
    "swiss_relevance", "political_implications", "editorial_category",
    "editorial_priority", "post_potential", "suggested_hook", "post_approach",
    "evidence_quality", "uncertainties", "selection_reason",
)


class EditorialError(RuntimeError):
    pass


def _string_schema(enum: list[str] | None = None) -> dict[str, Any]:
    out: dict[str, Any] = {"type": "string"}
    if enum:
        out["enum"] = enum
    return out


ARTICLE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "article_id": _string_schema(), "event_id": _string_schema(),
        "headline": _string_schema(), "original_source": _string_schema(),
        "original_url": _string_schema(), "published_at": _string_schema(),
        "discovery_channels": {"type": "array", "items": _string_schema()},
        "summary": _string_schema(), "new_information": _string_schema(),
        "swiss_relevance": _string_schema(), "political_implications": _string_schema(),
        "editorial_category": _string_schema(),
        "editorial_priority": _string_schema(["hoch", "mittel", "gering"]),
        "post_potential": _string_schema(), "suggested_hook": _string_schema(),
        "post_approach": _string_schema(), "evidence_quality": _string_schema(),
        "uncertainties": {"type": "array", "items": _string_schema()},
        "selection_reason": _string_schema(),
    },
    "required": list(ANALYSIS_FIELDS),
}


def _batch_schema() -> dict[str, Any]:
    return {
        "type": "object", "additionalProperties": False,
        "properties": {"analyses": {"type": "array", "items": ARTICLE_SCHEMA}},
        "required": ["analyses"],
    }


def _selection_schema() -> dict[str, Any]:
    return {
        "type": "object", "additionalProperties": False,
        "properties": {
            "selected_article_ids": {"type": "array", "items": _string_schema()},
            "selection_notes": _string_schema(),
        },
        "required": ["selected_article_ids", "selection_notes"],
    }


def _load_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return default


def _text(value: Any, limit: int = 4000) -> str:
    clean = re.sub(r"\s+", " ", str(value or "")).strip()
    return clean[:limit]


def _source_name(item: dict[str, Any]) -> str:
    source = item.get("original_source") if isinstance(item.get("original_source"), dict) else {}
    return _text(source.get("name") or item.get("source_name") or "Unbekannt", 160)


def _channels(item: dict[str, Any]) -> list[str]:
    values = []
    for channel in item.get("discovery_channels", []) or []:
        value = channel.get("id") if isinstance(channel, dict) else channel
        if value and str(value) not in values:
            values.append(str(value))
    return values


def _article_id(item: dict[str, Any]) -> str:
    identity = canonical_url(str(item.get("canonical_url") or item.get("url") or ""))
    raw = identity or f"{item.get('title')}|{_source_name(item)}"
    return "AR-" + hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16].upper()


def _content(item: dict[str, Any]) -> str:
    facts = item.get("article_facts") if isinstance(item.get("article_facts"), dict) else {}
    parts = [
        item.get("subtitle"), item.get("summary"), item.get("description"),
        item.get("excerpt"), facts.get("summary"), facts.get("basis"),
        " ".join(str(v) for v in facts.get("figures", []) or []),
    ]
    return _text(" ".join(str(v or "") for v in parts), 6000)


def _merge_candidates(findings: list[dict[str, Any]], max_candidates: int) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    for raw in findings:
        if not isinstance(raw, dict) or not _text(raw.get("title"), 500):
            continue
        item = dict(raw)
        url = canonical_url(str(item.get("canonical_url") or item.get("url") or ""))
        match = None
        for existing in merged:
            if url and url == existing.get("original_url"):
                match = existing
                break
            if event_similarity(str(item.get("title")), str(existing.get("headline"))) >= 0.65:
                match = existing
                break
        if match:
            match["discovery_channels"] = sorted(set(match["discovery_channels"] + _channels(item)))
            match["collector_sources"] = sorted(set(match["collector_sources"] + [str(item.get("source_id") or item.get("source_name") or "unknown")]))
            if len(_content(item)) > len(match.get("content") or ""):
                match["content"] = _content(item)
            continue
        aid = _article_id(item)
        merged.append({
            "article_id": aid, "event_id": str(item.get("event_id") or ""),
            "headline": _text(item.get("title"), 500),
            "original_source": _source_name(item),
            "original_url": url or _text(item.get("url"), 1000),
            "published_at": _text(item.get("published_at") or item.get("updated_at"), 80),
            "discovered_at": _text(item.get("discovered_at") or item.get("fetched_at"), 80),
            "discovery_channels": _channels(item), "content": _content(item),
            "content_access": _text(item.get("content_access") or ("excerpt" if _content(item) else "headline_only"), 80),
            "source_class": _text(item.get("source_class"), 10),
            "collector_sources": [str(item.get("source_id") or item.get("source_name") or "unknown")],
        })
    # Technical ordering only: information completeness and source quality. No keyword score.
    merged.sort(key=lambda x: (bool(x["content"]), x["source_class"] in {"A", "B"}, x["published_at"], x["discovered_at"]), reverse=True)
    # Round-robin across collectors prevents one broad feed from crowding out all
    # other sources before the model sees them.
    groups: dict[str, list[dict[str, Any]]] = {}
    for article in merged:
        key = str((article.get("collector_sources") or ["unknown"])[0])
        groups.setdefault(key, []).append(article)
    balanced: list[dict[str, Any]] = []
    while len(balanced) < max_candidates and any(groups.values()):
        for key in sorted(groups):
            if groups[key]:
                balanced.append(groups[key].pop(0))
                if len(balanced) >= max_candidates:
                    break
    return balanced


def _cache_key(article: dict[str, Any], model: str) -> str:
    stable = {k: article.get(k) for k in ("article_id", "headline", "original_source", "original_url", "published_at", "discovery_channels", "content", "content_access")}
    raw = json.dumps([PROMPT_VERSION, model, stable], ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _validate_analysis(value: Any, expected_ids: set[str] | None = None) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise EditorialError("analysis is not an object")
    missing = [key for key in ANALYSIS_FIELDS if key not in value]
    if missing:
        raise EditorialError(f"analysis missing fields: {', '.join(missing)}")
    if value.get("editorial_priority") not in PRIORITIES:
        raise EditorialError("invalid editorial_priority")
    if not isinstance(value.get("discovery_channels"), list) or not isinstance(value.get("uncertainties"), list):
        raise EditorialError("array fields invalid")
    if expected_ids is not None and str(value.get("article_id")) not in expected_ids:
        raise EditorialError("response contains unknown article_id")
    return value


def _response_text(payload: dict[str, Any]) -> str:
    if isinstance(payload.get("output_text"), str):
        return payload["output_text"]
    chunks = []
    for output in payload.get("output", []) or []:
        for content in output.get("content", []) or []:
            if isinstance(content, dict) and content.get("type") == "output_text":
                chunks.append(str(content.get("text") or ""))
    if not chunks:
        raise EditorialError("OpenAI response has no output_text")
    return "".join(chunks)


def _request(payload: dict[str, Any], api_key: str, timeout: int, retries: int) -> dict[str, Any]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    for attempt in range(retries + 1):
        request = urllib.request.Request(API_URL, data=body, method="POST", headers={
            "Authorization": f"Bearer {api_key}", "Content-Type": "application/json",
        })
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError) as exc:
            if attempt >= retries:
                raise EditorialError(f"OpenAI request failed after {attempt + 1} attempts: {type(exc).__name__}") from exc
            time.sleep(min(8.0, (2 ** attempt) + random.random()))
    raise EditorialError("unreachable")


def _call_structured(model: str, api_key: str, instructions: str, user_input: str, schema_name: str,
                     schema: dict[str, Any], requester: Callable[..., dict[str, Any]]) -> tuple[dict[str, Any], dict[str, int]]:
    payload = {
        "model": model, "instructions": instructions, "input": user_input,
        "text": {"format": {"type": "json_schema", "name": schema_name, "strict": True, "schema": schema}},
    }
    raw = requester(payload, api_key, int(os.getenv("EDITORIAL_AI_TIMEOUT_SECONDS", "60")), int(os.getenv("EDITORIAL_AI_RETRIES", "2")))
    if raw.get("status") == "incomplete":
        raise EditorialError("OpenAI response incomplete")
    parsed = json.loads(_response_text(raw))
    usage = raw.get("usage") if isinstance(raw.get("usage"), dict) else {}
    details = usage.get("input_tokens_details") if isinstance(usage.get("input_tokens_details"), dict) else {}
    return parsed, {
        "input_tokens": int(usage.get("input_tokens") or 0),
        "cached_input_tokens": int(details.get("cached_tokens") or 0),
        "output_tokens": int(usage.get("output_tokens") or 0),
        "total_tokens": int(usage.get("total_tokens") or 0),
    }


def _cost(usage: dict[str, int]) -> dict[str, Any]:
    try:
        input_rate = float(os.getenv("EDITORIAL_AI_INPUT_USD_PER_MTOK", ""))
        output_rate = float(os.getenv("EDITORIAL_AI_OUTPUT_USD_PER_MTOK", ""))
        cached_rate = float(os.getenv("EDITORIAL_AI_CACHED_INPUT_USD_PER_MTOK", ""))
    except ValueError:
        input_rate = output_rate = cached_rate = 0.0
    if input_rate <= 0 or output_rate <= 0:
        return {"usd": None, "reason": "pricing_not_configured"}
    cached = min(usage.get("cached_input_tokens", 0), usage["input_tokens"])
    uncached = usage["input_tokens"] - cached
    effective_cached_rate = cached_rate if cached_rate > 0 else input_rate
    amount = (uncached * input_rate + cached * effective_cached_rate + usage["output_tokens"] * output_rate) / 1_000_000
    return {"usd": round(amount, 6), "input_usd_per_mtok": input_rate, "cached_input_usd_per_mtok": effective_cached_rate, "output_usd_per_mtok": output_rate}


def run_editorial_shadow(findings: list[dict[str, Any]], legacy_selection: list[dict[str, Any]], *,
                         requester: Callable[..., dict[str, Any]] = _request, persist_cache: bool = False) -> dict[str, Any]:
    started = datetime.now(timezone.utc).isoformat()
    enabled = os.getenv("EDITORIAL_AI_ENABLED", "0").lower() in {"1", "true", "yes", "on"}
    model = os.getenv("EDITORIAL_AI_MODEL", "").strip()
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    base = {"schema_version": 1, "mode": "shadow", "prompt_version": PROMPT_VERSION, "model": model or None, "started_at": started}
    if not enabled:
        return {**base, "status": "disabled", "fallback": True, "fallback_reason": "EDITORIAL_AI_ENABLED is false", "analyses": [], "selection": []}
    if not model or not api_key:
        return {**base, "status": "fallback", "fallback": True, "fallback_reason": "missing EDITORIAL_AI_MODEL or OPENAI_API_KEY", "analyses": [], "selection": []}

    candidates = _merge_candidates(findings, int(os.getenv("EDITORIAL_AI_MAX_CANDIDATES", "80")))
    cache = _load_json(CACHE_PATH, {"schema_version": 1, "entries": {}})
    entries = cache.get("entries") if isinstance(cache.get("entries"), dict) else {}
    selections = cache.get("selections") if isinstance(cache.get("selections"), dict) else {}
    analyses: list[dict[str, Any]] = []
    uncached = []
    for article in candidates:
        key = _cache_key(article, model)
        cached = entries.get(key)
        if isinstance(cached, dict) and isinstance(cached.get("analysis"), dict):
            try:
                analyses.append(_validate_analysis(cached["analysis"], {article["article_id"]}))
            except EditorialError:
                uncached.append((article, key))
        else:
            uncached.append((article, key))
    cache_hits = len(analyses)

    usage = {"input_tokens": 0, "cached_input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
    errors: list[str] = []
    instructions = PROMPT_PATH.read_text(encoding="utf-8")
    batch_size = max(1, min(10, int(os.getenv("EDITORIAL_AI_BATCH_SIZE", "5"))))
    batches = [uncached[i:i + batch_size] for i in range(0, len(uncached), batch_size)]

    def analyse_batch(batch: list[tuple[dict[str, Any], str]]) -> tuple[list[dict[str, Any]], dict[str, int]]:
        articles = [item[0] for item in batch]
        prompt = "Analysiere jeden Artikel unabhängig. Gib exakt eine Analyse je article_id zurück.\n" + json.dumps(
            [{**article, "content": f"<untrusted_article>{article['content']}</untrusted_article>"} for article in articles],
            ensure_ascii=False,
        )
        parsed, batch_usage = _call_structured(model, api_key, instructions, prompt, "editorial_article_batch", _batch_schema(), requester)
        values = parsed.get("analyses")
        if not isinstance(values, list) or len(values) != len(articles):
            raise EditorialError("analysis count does not match request")
        ids = {article["article_id"] for article in articles}
        requested = {article["article_id"]: article for article in articles}
        checked = []
        for value in values:
            value = dict(_validate_analysis(value, ids))
            source = requested[value["article_id"]]
            # Source identity and dates come from the collector, never from model inference.
            for field in ("event_id", "headline", "original_source", "original_url", "published_at", "discovery_channels"):
                value[field] = source[field]
            checked.append(value)
        return checked, batch_usage

    workers = max(1, min(4, int(os.getenv("EDITORIAL_AI_MAX_CONCURRENCY", "2"))))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(analyse_batch, batch): batch for batch in batches}
        for future in as_completed(futures):
            try:
                values, batch_usage = future.result()
                analyses.extend(values)
                for key in usage:
                    usage[key] += batch_usage[key]
                keyed = {article["article_id"]: key for article, key in futures[future]}
                for value in values:
                    entries[keyed[value["article_id"]]] = {"analysis": value, "created_at": datetime.now(timezone.utc).isoformat()}
            except Exception as exc:
                errors.append(str(exc)[:300])

    if not analyses or errors:
        return {**base, "status": "fallback", "fallback": True, "fallback_reason": errors[0] if errors else "no analyses", "candidate_count": len(candidates), "analyses": [], "selection": [], "usage": usage, "cost": _cost(usage), "errors": errors}

    analysis_by_id = {str(item["article_id"]): item for item in analyses}
    selection_input = [{key: item[key] for key in ("article_id", "headline", "summary", "new_information", "swiss_relevance", "political_implications", "editorial_category", "editorial_priority", "post_potential", "evidence_quality", "uncertainties", "selection_reason")} for item in analyses]
    selection_key = hashlib.sha256(json.dumps(
        [PROMPT_VERSION, model, selection_input], ensure_ascii=False, sort_keys=True
    ).encode("utf-8")).hexdigest()
    cached_selection = selections.get(selection_key)
    selection_cache_hit = isinstance(cached_selection, dict)
    try:
        if selection_cache_hit:
            parsed = cached_selection
        else:
            parsed, select_usage = _call_structured(
                model, api_key, instructions,
                "Vergleiche diese Analysen. Wähle höchstens zehn, ohne Pflicht zur Vollzahl. Achte auf Relevanz, Neuigkeit, Belegbarkeit, Vielfalt und Eigenständigkeit.\n" + json.dumps(selection_input, ensure_ascii=False),
                "editorial_daily_selection", _selection_schema(), requester,
            )
            for key in usage:
                usage[key] += select_usage[key]
            selections[selection_key] = parsed
        if not isinstance(parsed.get("selected_article_ids"), list) or not isinstance(parsed.get("selection_notes"), str):
            raise EditorialError("selection response invalid")
        ids = []
        for aid in parsed.get("selected_article_ids", []):
            if aid in analysis_by_id and aid not in ids:
                ids.append(aid)
        selection = [analysis_by_id[aid] for aid in ids[:10]]
        notes = str(parsed.get("selection_notes") or "")
    except Exception as exc:
        errors.append(str(exc)[:300])
        selection, notes = [], "Tagesauswahl fehlgeschlagen; Legacy-Auswahl bleibt aktiv."

    if persist_cache:
        write_json(CACHE_PATH, {"schema_version": 1, "prompt_version": PROMPT_VERSION, "model": model, "entries": entries, "selections": selections})
    legacy_ids = {str(event.get("event_id") or "") for event in legacy_selection}
    ai_event_ids = {str(item.get("event_id") or "") for item in selection if item.get("event_id")}
    return {
        **base, "finished_at": datetime.now(timezone.utc).isoformat(),
        "status": "success_with_warnings" if errors else "success", "fallback": bool(errors and not selection),
        "candidate_count": len(candidates), "analysed_count": len(analyses),
        "cache_hits": cache_hits,
        "selection_cache_hit": selection_cache_hit,
        "api_evaluations": len(uncached), "analyses": analyses, "selection": selection,
        "selection_notes": notes, "comparison": {
            "both_event_ids": sorted(legacy_ids & ai_event_ids),
            "legacy_only_event_ids": sorted(legacy_ids - ai_event_ids),
            "ai_only_event_ids": sorted(ai_event_ids - legacy_ids),
        },
        "usage": usage, "cost": _cost(usage), "errors": errors,
    }


def write_shadow_artifact(output_dir: Path, report: dict[str, Any]) -> Path:
    path = output_dir / "editorial-ai-shadow.json"
    write_json(path, report)
    return path
