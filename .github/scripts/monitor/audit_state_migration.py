from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import Counter
from typing import Any

from state import _migrate, _polluted_history, seen_canonical_urls, seen_fingerprints
from url_identity import canonical_url


def _sources(payload: dict[str, Any], event_ids: set[str] | None = None) -> list[dict[str, Any]]:
    return [
        source
        for event_id, event in (payload.get("events") or {}).items()
        if (event_ids is None or str(event_id) in event_ids) and isinstance(event, dict)
        for source in event.get("sources", []) or [] if isinstance(source, dict)
    ]


def _identity(source: dict[str, Any]) -> tuple[str, str]:
    return (
        canonical_url(str(source.get("canonical_url") or source.get("url") or "")),
        str(source.get("fingerprint") or ""),
    )


def _identity_status_index(payload: dict[str, Any]) -> dict[tuple[str, str], str]:
    index: dict[tuple[str, str], str] = {}
    for event in (payload.get("events") or {}).values():
        if not isinstance(event, dict):
            continue
        status = "Duplikat" if event.get("baseline_confirmed") else "Update"
        for source in event.get("sources", []) or []:
            if isinstance(source, dict):
                url, fingerprint = _identity(source)
                if url:
                    index[("url", url)] = status
                if fingerprint:
                    index[("fingerprint", fingerprint)] = status
    return index


def audit(before: dict[str, Any]) -> dict[str, Any]:
    after = _migrate(before)
    before_events = before.get("events") if isinstance(before.get("events"), dict) else {}
    after_events = after.get("events") if isinstance(after.get("events"), dict) else {}
    polluted = [event_id for event_id, event in before_events.items() if isinstance(event, dict) and _polluted_history(event)]
    before_fps = seen_fingerprints(before)
    after_fps = seen_fingerprints(after)
    before_baseline = seen_fingerprints(before, baseline=True)
    after_baseline = seen_fingerprints(after, baseline=True)
    before_urls = seen_canonical_urls(before)
    after_urls = seen_canonical_urls(after)
    changes = []
    after_status = _identity_status_index(after)
    # Only split candidates can change cluster-level novelty classification.
    # Identity-set comparisons below cover every other source without an O(n²)
    # classification pass over the full production archive.
    for event_id in polluted:
        event = before_events[event_id]
        old_status = "Duplikat" if event.get("baseline_confirmed") else "Update"
        for source in event.get("sources", []) or []:
            if not isinstance(source, dict):
                continue
            url, fingerprint = _identity(source)
            new_status = after_status.get(("url", url)) if url else None
            if new_status is None and fingerprint:
                new_status = after_status.get(("fingerprint", fingerprint))
            new_status = new_status or "Neu"
            if old_status != new_status:
                changes.append({
                    "title": source.get("title"), "canonical_url": url,
                    "before": old_status, "after": new_status,
                })
    false_new = [item for item in changes if item["after"] == "Neu" and item["before"] != "Neu"]
    transitions = Counter(f"{item['before']} -> {item['after']}" for item in changes)
    return {
        "schema_before": before.get("schema_version"), "schema_after": after.get("schema_version"),
        "events_before": len(before_events), "events_after": len(after_events),
        "polluted_clusters_detected": len(polluted), "polluted_cluster_ids": polluted,
        "additional_split_clusters": max(0, len(after_events) - len(before_events)),
        "fingerprints_before": len(before_fps), "fingerprints_after": len(after_fps),
        "fingerprints_lost": sorted(before_fps - after_fps),
        "confirmed_baseline_before": len(before_baseline), "confirmed_baseline_after": len(after_baseline),
        "baseline_added": sorted(after_baseline - before_baseline), "baseline_lost": sorted(before_baseline - after_baseline),
        "canonical_urls_before": len(before_urls), "canonical_urls_after": len(after_urls),
        "canonical_urls_lost": sorted(before_urls - after_urls),
        "novelty_status_changes": len(changes), "novelty_status_transitions": dict(transitions),
        "novelty_status_change_examples": changes[:50],
        "possible_false_new_count": len(false_new), "possible_false_new_examples": false_new[:50],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only schema migration audit")
    parser.add_argument("--git-ref", help="Read JSON with `git show <ref>` instead of stdin")
    args = parser.parse_args()
    if args.git_ref:
        raw = subprocess.run(
            ["git", "show", args.git_ref], check=True, capture_output=True, text=True, encoding="utf-8"
        ).stdout
        payload = json.loads(raw)
    else:
        payload = json.load(sys.stdin)
    if not isinstance(payload, dict):
        raise ValueError("state input must be a JSON object")
    print(json.dumps(audit(payload), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
