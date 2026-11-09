from __future__ import annotations

"""Report incomplete runs; targeted retries now happen before AI evaluation.

Kept as the existing workflow entrypoint so no later step needs to rerun the
entire monitor or overwrite a correctly processed first attempt.
"""

import json
import os
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ZURICH = ZoneInfo("Europe/Zurich")
REPORT_DIR = Path("data/monitor/reports")


def summarize(report: dict) -> tuple[str, bool]:
    quality = report.get("quality") if isinstance(report.get("quality"), dict) else {}
    statuses = quality.get("source_statuses") if isinstance(quality.get("source_statuses"), list) else []
    failed = [
        str(item.get("id") or item.get("name") or "unknown")
        for item in statuses if isinstance(item, dict) and item.get("ok") is False
    ]
    retried = [
        item for item in statuses
        if isinstance(item, dict) and isinstance(item.get("retry"), dict)
    ]
    recovered = sum(1 for item in retried if item["retry"].get("recovered") is True)
    reliability = str(report.get("run_reliability") or "unknown")
    incomplete = reliability != "complete"
    lines = [
        "### Newsmonitor – Quellenstatus",
        f"- Zuverlässigkeit: **{reliability}**",
        f"- Quellen: **{quality.get('sources_successful', '?')}/{quality.get('sources_attempted', '?')}** erfolgreich",
        f"- Gezielte Wiederholungsversuche: **{len(retried)}**, davon **{recovered}** erfolgreich",
        "- Zweiter vollständiger Monitor-/KI-Lauf: **nicht ausgeführt**",
    ]
    if failed:
        lines.append("- Weiterhin nicht erreichbar: **" + ", ".join(failed) + "**")
    if incomplete:
        lines.append("- **Unvollständiger Lauf:** Fehlende Quellen wurden nicht als erfolgreich ausgegeben; die bestehende Basis bleibt geschützt.")
    return "\n".join(lines) + "\n", incomplete


def main() -> int:
    report_date = datetime.now(ZURICH).date().isoformat()
    report_path = REPORT_DIR / f"{report_date}.json"
    if not report_path.is_file():
        print(f"Monitor status: report not found at {report_path}")
        return 0

    report = json.loads(report_path.read_text(encoding="utf-8"))
    summary, incomplete = summarize(report)
    print(summary)
    if incomplete:
        # Explicit GitHub Actions annotation without blocking deployment of
        # the report, which already carries status=success_with_warnings.
        print("::warning title=Newsmonitor unvollständig::Mindestens eine P1-Quelle oder Verfahrensquelle fehlt; kein vollständiger zweiter Lauf gestartet.")

    path = os.getenv("GITHUB_STEP_SUMMARY", "").strip()
    if path:
        with open(path, "a", encoding="utf-8") as target:
            target.write(summary + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
