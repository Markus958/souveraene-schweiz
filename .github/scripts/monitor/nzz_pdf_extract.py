from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import fitz

EDITION = os.getenv("NZZ_EPAPER_EDITION", "nzz").strip().lower()
SOURCE_ID = "nzzas-epaper" if EDITION == "nzzas" else "nzz-epaper"
SOURCE_NAME = "NZZ am Sonntag E-Paper" if EDITION == "nzzas" else "NZZ E-Paper"
PDF_PATH = Path(os.getenv("NZZ_EPAPER_PDF_PATH", f"monitor-out/{EDITION}-current.pdf"))
OUT_PATH = Path(os.getenv("NZZ_EPAPER_OUTPUT", f"monitor-out/{EDITION}-epaper.json"))
STORE_URL = "https://epaper.nzz.ch/storefront/8"

TOPICS = [
    "schweizer-politik", "schweiz-eu", "migration", "wirtschaft", "energie",
    "international", "f35", "patriot", "ubs", "ahv",
]

TERM_PATTERNS = {
    "schweiz": r"\b(schweiz|schweizer|schweizerische[nrms]?)\b",
    "bundesrat": r"\bbundesrat\b",
    "parlament": r"\bparlament\b|\bbundeshaus\b",
    "nationalrat": r"\bnationalrat\b",
    "staenderat": r"\bst[äa]nderat\b",
    "migration": r"\bmigration\b|\bmigranten?\b",
    "zuwanderung": r"\bzuwanderung\b",
    "asyl": r"\basyl\b|\basylsuch",
    "personenfreizuegigkeit": r"personenfreiz[üu]gigkeit",
    "stromabkommen": r"stromabkommen",
    "ubs": r"\bubs\b",
    "finma": r"\bfinma\b",
    "snb": r"\bsnb\b|schweizerische nationalbank",
    "f-35": r"\bf[- ]?35\b",
    "patriot": r"\bpatriot\b",
    "ahv": r"\bahv\b",
    "13. ahv": r"13\.?\s*ahv",
    "eu-paket": r"eu[- ]paket|bilateralen? iii|eu[- ]vertr[aä]ge",
    "eu": r"\beu\b|europ[aä]ische union",
    "abstimmung": r"\babstimmung\b",
    "referendum": r"\breferendum\b",
}

SKIP_EXACT = {
    "nzz am sonntag", "nzzas", "neue zürcher zeitung", "nzz", "international",
    "schweiz", "wirtschaft", "kultur", "sport", "debatte", "magazin", "invest",
}


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def fingerprint(title: str, page: int) -> str:
    raw = f"{SOURCE_ID}|{page}|{title.casefold()}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def is_candidate(text: str, size: float, page: int) -> bool:
    threshold = 18.0 if page == 1 else 27.0
    if size < threshold or len(text) < 8 or len(text) > 180:
        return False
    if text.casefold() in SKIP_EXACT:
        return False
    if re.fullmatch(r"[A-ZÄÖÜ]{1,4}", text):
        return False
    if re.fullmatch(r"[\d %.'’]+", text):
        return False
    alpha = re.sub(r"[^A-Za-zÄÖÜäöü]", "", text)
    if alpha and alpha.upper() == alpha and len(text) < 45:
        return False
    return True


def detected_terms(page: fitz.Page, bbox: tuple[float, float, float, float]) -> list[str]:
    x0, y0, x1, y1 = bbox
    width = page.rect.width
    # Read only a modest region around/below the headline for classification; do not persist text.
    clip = fitz.Rect(max(0, x0 - 20), max(0, y0 - 20), min(width, max(x1 + 160, x0 + 420)), min(page.rect.height, y1 + 220))
    context = clean(page.get_text("text", clip=clip)).casefold()
    hits = [term for term, pattern in TERM_PATTERNS.items() if re.search(pattern, context, flags=re.IGNORECASE)]
    return hits


def extract_titles(pdf_path: Path) -> tuple[list[dict], int]:
    doc = fitz.open(pdf_path)
    findings: list[dict] = []
    now = datetime.now(timezone.utc).isoformat()

    for page_no, page in enumerate(doc, start=1):
        lines: list[dict] = []
        for block in page.get_text("dict").get("blocks", []):
            if "lines" not in block:
                continue
            for line in block["lines"]:
                spans = [s for s in line.get("spans", []) if clean(s.get("text", ""))]
                if not spans:
                    continue
                text = clean(" ".join(clean(s.get("text", "")) for s in spans))
                size = max(float(s.get("size", 0)) for s in spans)
                x0 = min(float(s["bbox"][0]) for s in spans)
                y0 = min(float(s["bbox"][1]) for s in spans)
                x1 = max(float(s["bbox"][2]) for s in spans)
                y1 = max(float(s["bbox"][3]) for s in spans)
                if is_candidate(text, size, page_no):
                    lines.append({"text": text, "size": size, "bbox": (x0, y0, x1, y1)})

        lines.sort(key=lambda item: (item["bbox"][1], item["bbox"][0]))
        used: set[int] = set()
        for i, line in enumerate(lines):
            if i in used:
                continue
            group = [line]
            used.add(i)
            last = line
            for j, other in enumerate(lines):
                if j in used:
                    continue
                if abs(other["size"] - line["size"]) > 1.1:
                    continue
                if abs(other["bbox"][0] - line["bbox"][0]) > 40:
                    continue
                gap = other["bbox"][1] - last["bbox"][3]
                if -8 <= gap <= 22:
                    group.append(other)
                    used.add(j)
                    last = other

            title = clean(" ".join(item["text"] for item in group))
            word_count = len(title.split())
            if word_count < 2 or word_count > 22:
                continue
            bbox = (
                min(item["bbox"][0] for item in group), min(item["bbox"][1] for item in group),
                max(item["bbox"][2] for item in group), max(item["bbox"][3] for item in group),
            )

            findings.append({
                "source_id": SOURCE_ID,
                "source_name": SOURCE_NAME,
                "source_class": "B",
                "priority": "M1",
                "title": title,
                "url": f"{STORE_URL}#page={page_no}",
                "fingerprint": fingerprint(title, page_no),
                "fetched_at": now,
                "topics": TOPICS,
                "page": page_no,
                "source_role": "early_epaper",
                "detected_terms": detected_terms(page, bbox),
            })

    return findings, len(doc)


def main() -> int:
    result = {
        "source_id": SOURCE_ID,
        "source_name": SOURCE_NAME,
        "priority": "M1",
        "status": "unreachable",
        "http_status": 200 if PDF_PATH.is_file() else None,
        "final_url": STORE_URL,
        "attempted_at": datetime.now(timezone.utc).isoformat(),
        "findings": [],
        "error": None,
        "metadata": {"pdf_detected": PDF_PATH.is_file(), "edition": EDITION},
    }

    try:
        if not PDF_PATH.is_file():
            result["status"] = "structure_changed"
            result["error"] = "E-paper PDF not available"
        else:
            findings, pages = extract_titles(PDF_PATH)
            result["findings"] = findings
            result["status"] = "new_publication" if findings else "structure_changed"
            result["metadata"]["pages"] = pages
            result["metadata"]["headline_candidates"] = len(findings)
            if not findings:
                result["error"] = "PDF opened but no headline candidates found"
    except Exception as exc:
        result["status"] = "structure_changed"
        result["error"] = f"{type(exc).__name__}: {str(exc)[:300]}"

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"NZZ PDF extract: edition={EDITION}; findings={len(result['findings'])}; status={result['status']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
