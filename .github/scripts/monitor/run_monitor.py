from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from config import REPO_ROOT, load_risks, load_sources
from storage import write_json
from validation import validate_risks, validate_sources


def main() -> int:
    mode = os.getenv("MONITOR_MODE", "dry-run").strip().lower()
    output_dir = Path(os.getenv("MONITOR_OUTPUT_DIR", "monitor-out"))

    started = datetime.now(timezone.utc)
    sources = load_sources()
    risks = load_risks()

    source_errors = validate_sources(sources)
    risk_errors, risk_page_checks = validate_risks(risks, REPO_ROOT)
    errors = source_errors + risk_errors

    nzz_configured = any(source.get("id") == "nzz" for source in sources)
    nzz_secret_available = bool(os.getenv("NZZ_COOKIE_HEADER"))

    result = {
        "schema_version": 1,
        "mode": mode,
        "started_at": started.isoformat(),
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "status": "success" if not errors else "failed",
        "writes_enabled": False,
        "public_output_enabled": False,
        "repository": {
            "root_detected": str(REPO_ROOT),
        },
        "configuration": {
            "source_count": len(sources),
            "risk_dossier_count": len(risks),
            "nzz_configured": nzz_configured,
            "nzz_secret_available": nzz_secret_available,
        },
        "risk_page_checks": risk_page_checks,
        "errors": errors,
        "next_phase": "source fetching and normalized findings",
    }

    output_path = output_dir / "monitor-dry-run.json"
    write_json(output_path, result)

    print("MONITOR FOUNDATION DRY RUN")
    print(f"Status: {result['status']}")
    print(f"Sources configured: {len(sources)}")
    print(f"Risk dossiers configured: {len(risks)}")
    print(f"Risk pages checked: {len(risk_page_checks)}")
    print(f"NZZ secret available: {'yes' if nzz_secret_available else 'no'}")
    print(f"Persistent writes enabled: no")
    print(f"Public output enabled: no")
    print(f"Artifact: {output_path}")

    if errors:
        print("Validation errors:")
        for error in errors:
            print(f"- {error}")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
