from __future__ import annotations

import hashlib
import json
import re
import ssl
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from config import REPO_ROOT

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153 Safari/537.36"
STATE_PATH = REPO_ROOT / "data" / "monitor" / "state" / "procedure_state.json"


def _load_state() -> dict[str, Any]:
    if not STATE_PATH.is_file():
        return {"schema_version": 1, "pages": {}, "last_run": None}
    try:
        data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            data.setdefault("schema_version", 1)
            data.setdefault("pages", {})
            return data
    except Exception:
        pass
    return {"schema_version": 1, "pages": {}, "last_run": None}


def _save_state(state: dict[str, Any]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _fetch(url: str, timeout: int = 25) -> tuple[int, str, bytes]:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept-Language": "de-CH,de;q=0.9,en;q=0.8",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout, context=ssl.create_default_context()) as response:
        return int(response.status), response.geturl(), response.read(4_000_000)


def _fingerprint(raw: bytes) -> str:
    text = raw.decode("utf-8", errors="replace")
    text = re.sub(r"(?is)<script.*?</script>|<style.*?</style>", " ", text)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip().casefold()
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


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
        for key, url in dict(watch.get("urls", {})).items():
            state_key = f"{watch_id}:{key}"
            previous = pages.get(state_key, {}) if isinstance(pages.get(state_key, {}), dict) else {}
            item = {
                "watch_id": watch_id,
                "page": key,
                "url": url,
                "priority": watch.get("priority", "P1"),
                "checked_at": checked_at,
                "status": "unreachable",
                "http_status": None,
                "final_url": None,
                "fingerprint": None,
                "previous_fingerprint": previous.get("fingerprint"),
                "error": None,
            }
            try:
                http_status, final_url, raw = _fetch(str(url))
                fp = _fingerprint(raw)
                item["http_status"] = http_status
                item["final_url"] = final_url
                item["fingerprint"] = fp
                if http_status != 200:
                    item["status"] = "unreachable"
                elif not previous.get("fingerprint"):
                    item["status"] = "baseline"
                elif previous.get("fingerprint") == fp:
                    item["status"] = "unchanged"
                else:
                    item["status"] = "changed"
                if persist and http_status == 200:
                    pages[state_key] = {
                        "watch_id": watch_id,
                        "page": key,
                        "url": url,
                        "fingerprint": fp,
                        "last_checked": checked_at,
                        "last_changed": checked_at if item["status"] in {"baseline", "changed"} else previous.get("last_changed"),
                    }
            except Exception as exc:
                item["error"] = f"{type(exc).__name__}: {exc}"[:500]
                item["status"] = "unreachable"

            if item["status"] == "unreachable":
                warnings.append({"watch_id": watch_id, "page": key, "status": item["status"], "error": item["error"]})
            results.append(item)

    if persist:
        state["last_run"] = {"checked_at": checked_at, "warnings": len(warnings)}
        _save_state(state)

    return results, warnings
