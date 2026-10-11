from __future__ import annotations

import hashlib
import html
import json
import re
import ssl
import urllib.request
from datetime import datetime, timezone
from typing import Any

from config import REPO_ROOT

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153 Safari/537.36"
STATE_PATH = REPO_ROOT / "data" / "monitor" / "state" / "procedure_state.json"
SCHEMA_VERSION = 3


def _empty_state() -> dict[str, Any]:
    return {"schema_version": SCHEMA_VERSION, "pages": {}, "last_run": None}


def _load_state() -> dict[str, Any]:
    if not STATE_PATH.is_file():
        return _empty_state()
    try:
        data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return _empty_state()
        if int(data.get("schema_version", 0) or 0) < SCHEMA_VERSION:
            # Fingerprint semantics changed: establish one clean baseline rather
            # than reporting a false political change caused by parser changes.
            return _empty_state()
        data["schema_version"] = SCHEMA_VERSION
        data.setdefault("pages", {})
        return data
    except Exception:
        return _empty_state()


def _save_state(state: dict[str, Any]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _fetch(url: str, timeout: int = 25) -> tuple[int, str, bytes]:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept-Language": "en-GB,en;q=0.9,de;q=0.7",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Cache-Control": "no-cache",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout, context=ssl.create_default_context()) as response:
        return int(response.status), response.geturl(), response.read(4_000_000)


def _visible_text(raw: bytes) -> str:
    text = raw.decode("utf-8", errors="replace")
    text = re.sub(r"(?is)<script.*?</script>|<style.*?</style>|<!--.*?-->", " ", text)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _oeil_signal(raw: bytes, watch: dict[str, Any]) -> dict[str, Any]:
    text = _visible_text(raw)
    folded = text.casefold()

    refs: set[str] = set()
    for pattern in (
        r"\bA10-\d{4}/\d{4}\b",
        r"\bPE\s?\d{3}\.\d{3}\b",
        r"\bCOM\(\d{4}\)\d{4}\b",
        r"\bAFET/\d{2}/\d{5}\b",
        r"\b\d{4}/\d{4}R?\(NLE\)\b",
    ):
        refs.update(re.findall(pattern, text, flags=re.IGNORECASE))

    dates = sorted(set(re.findall(r"\b\d{2}/\d{2}/\d{4}\b", text)))

    expected_refs = {
        str(watch.get("procedure_reference", "")),
        str(watch.get("parent_procedure_reference", "")),
        str(watch.get("committee_dossier", "")),
        str(watch.get("parent_committee_dossier", "")),
    }
    expected_refs.discard("")
    found_expected = sorted(ref for ref in expected_refs if ref.casefold() in folded)

    known_documents = [str(v) for v in dict(watch.get("known_documents", {})).values()]
    found_known_documents = sorted(doc for doc in known_documents if doc.casefold() in folded)

    status_markers = []
    for marker in (
        "awaiting parliament's vote",
        "vote in committee",
        "committee report tabled for plenary",
        "indicative plenary sitting date",
        "procedure completed",
        "decision by parliament",
        "final act",
    ):
        if marker in folded:
            status_markers.append(marker)

    # Context snippets remain diagnostic only. They are intentionally excluded
    # from the fingerprint because navigation/order changes on OEIL are volatile.
    contexts: list[str] = []
    for anchor in ("stage reached in procedure", "vote in committee", "committee report tabled", "indicative plenary sitting date"):
        pos = folded.find(anchor)
        if pos >= 0:
            left = max(0, pos - 100)
            right = min(len(text), pos + len(anchor) + 180)
            contexts.append(re.sub(r"\s+", " ", text[left:right]).strip())

    return {
        "references": sorted(refs, key=str.casefold),
        "dates": dates,
        "expected_references_found": found_expected,
        "known_documents_found": found_known_documents,
        "status_markers": sorted(status_markers),
        "contexts": contexts,
    }


def _generic_signal(raw: bytes) -> dict[str, Any]:
    text = _visible_text(raw).casefold()
    return {"text_hash": hashlib.sha256(text.encode("utf-8")).hexdigest()}


def _signal(raw: bytes, page_type: str, watch: dict[str, Any]) -> dict[str, Any]:
    if page_type == "oeil":
        return _oeil_signal(raw, watch)
    return _generic_signal(raw)


def _fingerprint(signal: dict[str, Any]) -> str:
    stable_signal = {k: v for k, v in signal.items() if k != "contexts"}
    canonical = json.dumps(stable_signal, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def check_procedure_watches(watches: list[dict[str, Any]], persist: bool) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    state = _load_state()
    pages = state.setdefault("pages", {})
    results: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    checked_at = datetime.now(timezone.utc).isoformat()

    for watch in watches:
        if not watch.get("active", True):
            continue
        watch_id = str(watch.get("id", ""))
        page_types = dict(watch.get("page_types", {}))

        for key, url in dict(watch.get("urls", {})).items():
            state_key = f"{watch_id}:{key}"
            previous = pages.get(state_key, {}) if isinstance(pages.get(state_key, {}), dict) else {}
            page_type = str(page_types.get(key, "generic"))
            item = {
                "watch_id": watch_id,
                "page": key,
                "page_type": page_type,
                "url": url,
                "priority": watch.get("priority", "P1"),
                "checked_at": checked_at,
                "status": "unreachable",
                "http_status": None,
                "final_url": None,
                "fingerprint": None,
                "previous_fingerprint": previous.get("fingerprint"),
                "signal": None,
                "error": None,
            }
            try:
                http_status, final_url, raw = _fetch(str(url))
                signal = _signal(raw, page_type, watch)
                fp = _fingerprint(signal)
                item["http_status"] = http_status
                item["final_url"] = final_url
                item["fingerprint"] = fp
                item["signal"] = signal

                if http_status != 200:
                    item["status"] = "unreachable"
                elif page_type == "oeil" and not signal.get("expected_references_found"):
                    item["status"] = "structure_changed"
                    item["error"] = "OEIL page loaded but expected procedure identifiers were not found"
                elif not previous.get("fingerprint"):
                    item["status"] = "baseline"
                elif previous.get("fingerprint") == fp:
                    item["status"] = "unchanged"
                else:
                    item["status"] = "changed"

                if persist and item["status"] in {"baseline", "unchanged", "changed"}:
                    pages[state_key] = {
                        "watch_id": watch_id,
                        "page": key,
                        "page_type": page_type,
                        "url": url,
                        "fingerprint": fp,
                        "signal": signal,
                        "last_checked": checked_at,
                        "last_changed": checked_at if item["status"] in {"baseline", "changed"} else previous.get("last_changed"),
                    }
            except Exception as exc:
                item["error"] = f"{type(exc).__name__}: {exc}"[:500]
                item["status"] = "unreachable"

            if item["status"] in {"unreachable", "structure_changed"}:
                warnings.append({
                    "watch_id": watch_id,
                    "page": key,
                    "status": item["status"],
                    "error": item["error"],
                })
            results.append(item)

    if persist:
        state["schema_version"] = SCHEMA_VERSION
        state["last_run"] = {"checked_at": checked_at, "warnings": len(warnings)}
        _save_state(state)

    return results, warnings
