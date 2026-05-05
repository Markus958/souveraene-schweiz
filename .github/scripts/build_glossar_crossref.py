#!/usr/bin/env python3
"""
Baut data/glossar-crossref.json:
Für jeden Glossarbegriff wird geprüft, in welchen Dossier-Seiten er vorkommt
(nicht im Heimat-Dossier, sondern in anderen Dossiers).
"""
import json, re, os
from pathlib import Path
from html.parser import HTMLParser

ROOT = Path(__file__).parent.parent.parent

# Alle zu durchsuchenden Dossier-Seiten mit Name und URL-Pfad
DOSSIER_PAGES = [
    {"key": "personenfreizuegigkeit", "file": "ch-eu/personenfreizuegigkeit.html", "label": "Personenfreizügigkeit",  "url": "ch-eu/personenfreizuegigkeit.html"},
    {"key": "schweizer-beitrag",      "file": "ch-eu/schweizer-beitrag.html",      "label": "Schweizer Beitrag",      "url": "ch-eu/schweizer-beitrag.html"},
    {"key": "strom",                  "file": "ch-eu/strom.html",                  "label": "Strom",                  "url": "ch-eu/strom.html"},
    {"key": "landverkehr",            "file": "ch-eu/landverkehr.html",            "label": "Landverkehr",            "url": "ch-eu/landverkehr.html"},
    {"key": "institutionelles",       "file": "ch-eu/binnenmarkt.html",            "label": "Institutionelles",       "url": "ch-eu/binnenmarkt.html"},
    {"key": "richli",                 "file": "ch-eu/richli-gutachten.html",       "label": "Richli-Gutachten",       "url": "ch-eu/richli-gutachten.html"},
    {"key": "botschaft-bundesrat",    "file": "ch-eu/botschaft-bundesrat.html",    "label": "Botschaft Bundesrat",    "url": "ch-eu/botschaft-bundesrat.html"},
    {"key": "zuwanderung",            "file": "10mio/zuwanderung.html",            "label": "Zuwanderung",            "url": "10mio/zuwanderung.html"},
    {"key": "infrastruktur",          "file": "10mio/infrastruktur.html",          "label": "Infrastruktur",          "url": "10mio/infrastruktur.html"},
    {"key": "wohnen",                 "file": "10mio/wohnen.html",                 "label": "Wohnen & Raum",          "url": "10mio/wohnen.html"},
    {"key": "zahlen",                 "file": "10mio/zahlen.html",                 "label": "Zahlen & Prognosen",     "url": "10mio/zahlen.html"},
]

class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.text_parts = []
        self._skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "nav", "footer"):
            self._skip = True

    def handle_endtag(self, tag):
        if tag in ("script", "style", "nav", "footer"):
            self._skip = False

    def handle_data(self, data):
        if not self._skip:
            self.text_parts.append(data)

    def get_text(self):
        return " ".join(self.text_parts)


def extract_text(filepath):
    try:
        content = filepath.read_text(encoding="utf-8")
        parser = TextExtractor()
        parser.feed(content)
        return parser.get_text()
    except Exception:
        return ""


def extract_glossar_terms(glossar_html):
    """Extrahiert alle {dossier, begriff} Paare aus dem JS-Array in glossar.html."""
    content = glossar_html.read_text(encoding="utf-8")
    pattern = r"\{\s*thema:'[^']+',\s*dossier:'([^']+)',\s*begriff:'([^']+)'"
    return [(m.group(1), m.group(2)) for m in re.finditer(pattern, content)]


def main():
    glossar_html = ROOT / "glossar.html"
    terms = extract_glossar_terms(glossar_html)
    print(f"Gefundene Glossarbegriffe: {len(terms)}")

    # Seitentexte einlesen
    page_texts = {}
    for page in DOSSIER_PAGES:
        filepath = ROOT / page["file"]
        if filepath.exists():
            page_texts[page["key"]] = extract_text(filepath).lower()
        else:
            print(f"  WARNUNG: {page['file']} nicht gefunden")
            page_texts[page["key"]] = ""

    # Querverweise aufbauen (Schlüssel: "dossier:begriff" damit gleiche Begriffe
    # aus verschiedenen Heimat-Dossiers korrekt unterschieden werden)
    crossref = {}
    for home_dossier, begriff in terms:
        term_lower = begriff.lower()
        found_in = []
        for page in DOSSIER_PAGES:
            if page["key"] == home_dossier:
                continue  # Heimat-Dossier überspringen
            if term_lower in page_texts.get(page["key"], ""):
                found_in.append({"label": page["label"], "url": page["url"]})
        if found_in:
            crossref[home_dossier + ':' + begriff] = found_in

    out_path = ROOT / "data" / "glossar-crossref.json"
    out_path.write_text(json.dumps(crossref, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Querverweise geschrieben: {len(crossref)} Begriffe haben Treffer in anderen Dossiers")
    print(f"Output: {out_path}")


if __name__ == "__main__":
    main()
