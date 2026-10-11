from __future__ import annotations

import json
import os
import re
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import fitz
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

FOLDER_ID = os.getenv("NZZ_DRIVE_FOLDER_ID", "1tA1KpEAClcmmuMPW70YyCx-YwNrQ4pAX")
EDITION = os.getenv("NZZ_EPAPER_EDITION", "nzz").strip().lower()
PDF_PATH = Path(os.getenv("NZZ_EPAPER_PDF_PATH", f"monitor-out/{EDITION}-current.pdf"))
SERVICE_ACCOUNT_JSON = os.getenv("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON", "").strip()

MONTHS = {
    "januar": 1, "februar": 2, "märz": 3, "maerz": 3, "april": 4, "mai": 5, "juni": 6,
    "juli": 7, "august": 8, "september": 9, "oktober": 10, "november": 11, "dezember": 12,
}


def issue_date() -> date:
    fallback = datetime.now(ZoneInfo("Europe/Zurich")).date()
    try:
        doc = fitz.open(PDF_PATH)
        text = doc[0].get_text("text")[:5000].casefold()
        m = re.search(r"(\d{1,2})\.\s*(januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\s+(20\d{2})", text)
        if m:
            return date(int(m.group(3)), MONTHS[m.group(2)], int(m.group(1)))
    except Exception:
        pass
    return fallback


def file_name() -> str:
    prefix = "NZZaS" if EDITION == "nzzas" else "NZZ"
    return f"{prefix}_{issue_date().isoformat()}.pdf"


def main() -> int:
    if not PDF_PATH.is_file():
        print("Drive upload skipped: PDF missing")
        return 2
    if not SERVICE_ACCOUNT_JSON:
        print("Drive upload skipped: GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON missing")
        return 3

    info = json.loads(SERVICE_ACCOUNT_JSON)
    creds = service_account.Credentials.from_service_account_info(
        info,
        scopes=["https://www.googleapis.com/auth/drive"],
    )
    drive = build("drive", "v3", credentials=creds, cache_discovery=False)

    name = file_name()
    escaped = name.replace("'", "\\'")
    query = f"name = '{escaped}' and '{FOLDER_ID}' in parents and trashed = false"
    existing = drive.files().list(q=query, fields="files(id,name)", pageSize=10).execute().get("files", [])
    media = MediaFileUpload(str(PDF_PATH), mimetype="application/pdf", resumable=True)

    if existing:
        file_id = existing[0]["id"]
        drive.files().update(fileId=file_id, media_body=media, fields="id,name,webViewLink").execute()
        print(f"Drive upload updated: {name} ({file_id})")
    else:
        created = drive.files().create(
            body={"name": name, "parents": [FOLDER_ID]},
            media_body=media,
            fields="id,name,webViewLink",
        ).execute()
        print(f"Drive upload created: {name} ({created.get('id')})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
