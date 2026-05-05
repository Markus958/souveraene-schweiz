#!/usr/bin/env python3
"""Builds data/search-index.json for client-side site search."""
import json, re
from pathlib import Path
from html.parser import HTMLParser

ROOT = Path(__file__).parent.parent.parent

PAGES = [
    {"file": "ch-eu/personenfreizuegigkeit.html", "section": "Paket CH–EU"},
    {"file": "ch-eu/schweizer-beitrag.html",       "section": "Paket CH–EU"},
    {"file": "ch-eu/strom.html",                   "section": "Paket CH–EU"},
    {"file": "ch-eu/landverkehr.html",             "section": "Paket CH–EU"},
    {"file": "ch-eu/binnenmarkt.html",             "section": "Paket CH–EU"},
    {"file": "ch-eu/botschaft-bundesrat.html",     "section": "Paket CH–EU"},
    {"file": "ch-eu/richli-gutachten.html",        "section": "Paket CH–EU"},
    {"file": "ch-eu/eu-programme.html",            "section": "Paket CH–EU"},
    {"file": "ch-eu/forschung.html",               "section": "Paket CH–EU"},
    {"file": "ch-eu/gesundheit.html",              "section": "Paket CH–EU"},
    {"file": "ch-eu/landwirtschaft.html",          "section": "Paket CH–EU"},
    {"file": "ch-eu/lebensmittelsicherheit.html",  "section": "Paket CH–EU"},
    {"file": "ch-eu/luftverkehr.html",             "section": "Paket CH–EU"},
    {"file": "ch-eu/mra.html",                     "section": "Paket CH–EU"},
    {"file": "ch-eu/querschnitt.html",             "section": "Paket CH–EU"},
    {"file": "ch-eu/weltraum.html",                "section": "Paket CH–EU"},
    {"file": "10mio/zuwanderung.html",             "section": "10-Mio.-Schweiz"},
    {"file": "10mio/infrastruktur.html",           "section": "10-Mio.-Schweiz"},
    {"file": "10mio/wohnen.html",                  "section": "10-Mio.-Schweiz"},
    {"file": "10mio/zahlen.html",                  "section": "10-Mio.-Schweiz"},
    {"file": "faktenchecks.html",                  "section": "Faktenchecks"},
    {"file": "reaktionen.html",                    "section": "Reaktionen"},
    {"file": "mediathek.html",                     "section": "Mediathek"},
]


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self._skip = False
        self._in_title = False
        self.title = ""
        self.description = ""
        self.headings = []
        self._text = []
        self._cur_heading = None

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "nav", "footer", "noscript"):
            self._skip = True
        elif tag == "title":
            self._in_title = True
        elif tag == "meta":
            d = dict(attrs)
            if d.get("name") == "description":
                self.description = d.get("content", "")
        elif tag in ("h1", "h2", "h3"):
            self._cur_heading = tag

    def handle_endtag(self, tag):
        if tag in ("script", "style", "nav", "footer", "noscript"):
            self._skip = False
        elif tag == "title":
            self._in_title = False
        elif tag in ("h1", "h2", "h3"):
            self._cur_heading = None

    def handle_data(self, data):
        t = data.strip()
        if not t:
            return
        if self._in_title:
            self.title += t
            return
        if self._skip:
            return
        if self._cur_heading in ("h2", "h3"):
            self.headings.append(t)
        self._text.append(t)

    def get_text(self):
        return " ".join(self._text)


def unescape_js(s):
    return re.sub(r'\\u([0-9a-fA-F]{4})', lambda m: chr(int(m.group(1), 16)), s)


def parse_page(filepath):
    try:
        p = PageParser()
        p.feed(filepath.read_text(encoding="utf-8"))
        title = re.sub(r'\s*[|–].*$', '', p.title).strip()
        title = re.sub(r'^\[VORSCHAU\]\s*', '', title).strip()
        text = re.sub(r'\s+', ' ', p.get_text()).strip()[:1800]
        return {
            "title": title or filepath.stem,
            "desc":  p.description,
            "h2s":   p.headings[:12],
            "text":  text,
        }
    except Exception as e:
        print(f"  ERROR {filepath}: {e}")
        return None


def extract_glossar_terms(glossar_html):
    content = glossar_html.read_text(encoding="utf-8")
    pattern = r"\{\s*thema:'[^']+',\s*dossier:'[^']+',\s*begriff:'([^']+)',\s*erklaerung:'([^']+)'"
    entries = []
    for m in re.finditer(pattern, content):
        term = unescape_js(m.group(1))
        defn = unescape_js(m.group(2))
        entries.append({
            "title":   term,
            "desc":    defn,
            "section": "Glossar",
            "url":     "glossar.html",
            "h2s":     [],
            "text":    defn,
        })
    return entries


def main():
    index = []

    for p in PAGES:
        fp = ROOT / p["file"]
        if not fp.exists():
            print(f"  SKIP (nicht gefunden): {p['file']}")
            continue
        entry = parse_page(fp)
        if entry:
            entry["section"] = p["section"]
            entry["url"]     = p["file"]
            index.append(entry)
            print(f"  OK: {p['file']} — {entry['title']}")

    terms = extract_glossar_terms(ROOT / "glossar.html")
    index.extend(terms)
    print(f"Glossar-Terme: {len(terms)}")

    out = ROOT / "data" / "search-index.json"
    out.write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")
    print(f"Index: {len(index)} Eintraege -> {out}")


if __name__ == "__main__":
    main()
