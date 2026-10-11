from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

FOLDER_ID = os.getenv("NZZ_DRIVE_FOLDER_ID", "1tA1KpEAClcmmuMPW70YyCx-YwNrQ4pAX")
EDITION = os.getenv("NZZ_EPAPER_EDITION", "nzz").strip().lower()
PDF_PATH = Path(os.getenv("NZZ_EPAPER_PDF_PATH", f"monitor-out/{EDITION}-current.pdf"))
SERVICE_ACCOUNT_JSON = os.getenv("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON", "").strip()


def file_name() -> str:
    date = datetime.now(ZoneInfo("Europe/Zurich")).date().isoformat()
    prefix = "NZZaS" if EDITION == "nzzas" else "NZZ"
    return f"{prefix}_{date}.pdf"


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
        scopes=["https://www.googleapis.com/auth/drive.file"],
    )
    drive = build("drive", "v3", credentials=creds, cache_discovery=False)

    name = file_name()
    query = f"name = '{name.replace(chr(39), chr(92)+chr(39))}' and '{FOLDER_ID}' in parents and trashed = false"
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
