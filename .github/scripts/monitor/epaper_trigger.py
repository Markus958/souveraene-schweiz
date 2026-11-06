from __future__ import annotations

import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

from epaper_schedule import intended_evening_target


ZURICH = ZoneInfo("Europe/Zurich")


def request(url: str, token: str, method: str = "GET", body: dict | None = None) -> tuple[int, dict]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Accept": "application/vnd.github+json", "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "newsmonitor-epaper-trigger",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        return exc.code, {}


def raspberry_dispatch_inputs(now: datetime) -> dict[str, str]:
    _evening, target, _reason, valid = intended_evening_target(now)
    if not valid:
        raise ValueError("outside Raspberry e-paper trigger window")
    edition = "nzzas" if target.weekday() == 6 else "nzz"
    return {"edition": edition, "trigger_mode": "raspberry", "target_date": target.isoformat()}


def completed_target_from_contents(payload: dict) -> tuple[str, str] | None:
    try:
        encoded = "".join(str(payload.get("content") or "").split())
        raw = base64.b64decode(encoded, validate=True)
        status = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    issue = status.get("issue") or {}
    attempt = status.get("current_attempt") or {}
    if attempt.get("complete") is True:
        target_date = str(issue.get("target_date") or "")
        edition = str(issue.get("edition") or "")
        return (target_date, edition) if target_date and edition else None
    return None


def main() -> int:
    token = os.getenv("GITHUB_TOKEN", "").strip()
    repo = os.getenv("GITHUB_REPOSITORY", "Markus958/souveraene-schweiz").strip()
    workflow = os.getenv("EPAPER_WORKFLOW", "monitor-epaper-evening.yml").strip()
    if not token:
        print("E-paper trigger: GITHUB_TOKEN missing", file=sys.stderr)
        return 2
    api = f"https://api.github.com/repos/{repo}/actions/workflows/{urllib.parse.quote(workflow, safe='')}"
    status, payload = request(f"{api}/runs?per_page=10", token)
    if status != 200:
        print(f"E-paper trigger: run check failed with HTTP {status}", file=sys.stderr)
        return 3
    if any(str(run.get("status")) in {"queued", "in_progress"} for run in payload.get("workflow_runs", [])):
        print("E-paper trigger: skip; workflow already active")
        return 0
    try:
        inputs = raspberry_dispatch_inputs(datetime.now(ZURICH))
    except ValueError as exc:
        print(f"E-paper trigger: skip; {exc}")
        return 0
    contents_url = f"https://api.github.com/repos/{repo}/contents/data/monitor/status/nzz-epaper.json?ref=main"
    contents_status, contents = request(contents_url, token)
    expected_issue = (inputs["target_date"], inputs["edition"])
    if contents_status == 200 and completed_target_from_contents(contents) == expected_issue:
        print(f"E-paper trigger: skip; issue {inputs['target_date']} ({inputs['edition']}) already complete")
        return 0
    status, _ = request(f"{api}/dispatches", token, "POST", {"ref": "main", "inputs": inputs})
    if status == 204:
        print(f"E-paper trigger: dispatched target {inputs['target_date']}")
        return 0
    print(f"E-paper trigger: dispatch failed with HTTP {status}", file=sys.stderr)
    return 4


if __name__ == "__main__":
    raise SystemExit(main())
