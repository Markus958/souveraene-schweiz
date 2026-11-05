from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


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
    status, _ = request(f"{api}/dispatches", token, "POST", {"ref": "main", "inputs": {"edition": "auto"}})
    if status == 204:
        print("E-paper trigger: dispatched")
        return 0
    print(f"E-paper trigger: dispatch failed with HTTP {status}", file=sys.stderr)
    return 4


if __name__ == "__main__":
    raise SystemExit(main())
