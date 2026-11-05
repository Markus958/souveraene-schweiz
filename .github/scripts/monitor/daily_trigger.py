from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, time, timezone
from zoneinfo import ZoneInfo

ZURICH = ZoneInfo("Europe/Zurich")


def should_dispatch(runs: list[dict], cutoff_utc: datetime) -> tuple[bool, str]:
    for run in runs:
        created_text = str(run.get("created_at") or "")
        try:
            created = datetime.fromisoformat(created_text.replace("Z", "+00:00"))
        except ValueError:
            continue
        if created < cutoff_utc:
            continue
        status = str(run.get("status") or "")
        conclusion = str(run.get("conclusion") or "")
        if status in {"queued", "in_progress"}:
            return False, f"daily run {run.get('id')} already {status}"
        if status == "completed" and conclusion == "success":
            return False, f"daily run {run.get('id')} already succeeded after cutoff"
    return True, "no successful or active daily run after cutoff"


def _json_request(url: str, headers: dict[str, str], method: str = "GET") -> tuple[int, dict]:
    request = urllib.request.Request(url, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(body)
        except ValueError:
            payload = {"detail": body[:300]}
        return exc.code, payload


def main() -> int:
    repository = os.environ.get("GITHUB_REPOSITORY", "Markus958/souveraene-schweiz").strip()
    workflow = os.environ.get("DAILY_WORKFLOW", "monitor-news.yml").strip()
    github_token = os.environ.get("GITHUB_TOKEN", "").strip()
    api_base = os.environ.get("MONITOR_API_BASE", "http://192.168.1.162:8765").rstrip("/")
    monitor_key = os.environ.get("MONITOR_API_KEY", "").strip()
    if not github_token or not monitor_key:
        print("Daily trigger: required token/key missing", file=sys.stderr)
        return 2

    now = datetime.now(ZURICH)
    cutoff_local = datetime.combine(now.date(), time(7, 0), tzinfo=ZURICH)
    cutoff_utc = cutoff_local.astimezone(timezone.utc)
    workflow_path = urllib.parse.quote(workflow, safe="")
    url = f"https://api.github.com/repos/{repository}/actions/workflows/{workflow_path}/runs?per_page=20"
    status, payload = _json_request(url, {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {github_token}",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "newsmonitor-raspberry-daily-trigger",
    })
    if status != 200:
        print(f"Daily trigger: GitHub run check failed with HTTP {status}", file=sys.stderr)
        return 3

    dispatch, reason = should_dispatch(payload.get("workflow_runs") or [], cutoff_utc)
    if not dispatch:
        print(f"Daily trigger: skip; {reason}")
        return 0

    status, response = _json_request(
        f"{api_base}/monitor/daily-run",
        {"Accept": "application/json", "X-API-Key": monitor_key, "Content-Type": "application/json"},
        method="POST",
    )
    if status in {200, 201, 202}:
        print(f"Daily trigger: dispatched run_id={response.get('run_id', 'pending')}")
        return 0
    if status == 409:
        print("Daily trigger: skip; Raspberry API reports an active conflicting run")
        return 0
    print(f"Daily trigger: dispatch failed with HTTP {status}", file=sys.stderr)
    return 4


if __name__ == "__main__":
    raise SystemExit(main())
