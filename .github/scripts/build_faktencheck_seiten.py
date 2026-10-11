#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Erzeugt fuer jeden Faktencheck eine eigene Seite faktencheck-NN.html.

Gepflegt werden die Faktenchecks ausschliesslich in faktenchecks.html.
Daraus entstehen hier die Einzelseiten, damit jeder Faktencheck eine
eigene, zitierbare Adresse hat. Sie uebernehmen Kopf, Navigation,
Darstellung und Fuss der Uebersicht, zeigen aber nur einen Block -
ohne Filterleiste und ohne Akkordeon, also sofort lesbar.

Fehlende Adressen werden zugleich in die sitemap.xml nachgetragen.
Ein neuer Faktencheck in faktenchecks.html braucht darum keinen
weiteren Handgriff: der naechste Deploy erzeugt Seite und Eintrag.

Die Blockgrenzen werden geparst, nicht gezaehlt: eine Zaehlung von
div-Tags verzaehlt sich an verschachtelten Containern.
"""
import html as H
import re
from datetime import date
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
QUELLE = ROOT / "faktenchecks.html"
SITEMAP = ROOT / "sitemap.xml"
BASIS = "https://www.souveraene-schweiz.ch/"

# Skripte der Uebersicht, die ohne Filterleiste ins Leere greifen.
UEBERSICHT_NUR = "function toggleFC|activeThema|applyFilters|data-hash-open"

ZUSATZ_CSS = """
  <style>
    /* Einzelansicht: ein Block, ohne Filter und ohne Akkordeon. */
    .fc-einzel-kopf { margin: 0 0 1.25rem; }
    .fc-einzel-badges { display: flex; flex-wrap: wrap; gap: .4rem; align-items: center; margin-bottom: .6rem; }
    .fc-einzel-meta { display: flex; flex-wrap: wrap; gap: .9rem; font-size: .9rem; color: #6b7280; }
    .fc-zurueck { display: inline-block; margin-top: 2rem; font-size: .95rem; }
  </style>
"""


class Blocksucher(HTMLParser):
    """Sammelt die fc-block-Container samt ihrem Akkordeoninhalt ein."""

    def __init__(self, text):
        super().__init__(convert_charrefs=False)
        self.text = text
        self.zeilenstart = [0]
        for zeile in text.split("\n")[:-1]:
            self.zeilenstart.append(self.zeilenstart[-1] + len(zeile) + 1)
        self.treffer = []
        self._block = None
        self._tiefe = 0
        self._inhalt_von = None
        self._inhalt_bis = None
        self._inhalt_tiefe = None

    def _pos(self):
        z, s = self.getpos()
        return self.zeilenstart[z - 1] + s

    def handle_starttag(self, tag, attrs):
        if tag != "div":
            return
        d = dict(attrs)
        if self._block is None:
            if d.get("class") == "fc-block" and (d.get("id") or "").startswith("fc-"):
                roh = self.get_starttag_text()
                self._block = (int(d["id"][3:]),
                               roh[len('<div class="fc-block"'):-1],
                               self._pos())
                self._tiefe = 1
            return
        self._tiefe += 1
        if d.get("class") == "fc-accordion-content" and self._inhalt_von is None:
            self._inhalt_von = self._pos() + len(self.get_starttag_text())
            self._inhalt_tiefe = self._tiefe

    def handle_endtag(self, tag):
        if tag != "div" or self._block is None:
            return
        if self._inhalt_tiefe is not None and self._tiefe == self._inhalt_tiefe:
            self._inhalt_bis = self._pos()
            self._inhalt_tiefe = None
        self._tiefe -= 1
        if self._tiefe == 0:
            nr, attr, start = self._block
            self.treffer.append({
                "nr": nr,
                "attr": attr,
                "roh": self.text[start:self._pos() + len("</div>")],
                "inhalt": (self.text[self._inhalt_von:self._inhalt_bis].rstrip()
                           if self._inhalt_von is not None and self._inhalt_bis else ""),
            })
            self._block = None
            self._inhalt_von = self._inhalt_bis = None


def feld(blk, muster, standard=""):
    m = re.search(muster, blk, re.S)
    return m.group(1).strip() if m else standard


def text_von(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", H.unescape(s))).strip()


def geruest(h):
    """Zerlegt die Uebersicht in Kopf, Rahmen oben und Rahmen unten."""
    kopf = h[:h.index("</head>")]
    nach_kopf = h[h.index("</head>"):]
    oben = nach_kopf[:nach_kopf.index('<nav class="mx-auto text-[13px] text-gray-400"')]
    unten = h[h.index('<footer class="mt-6 border-t border-gray-200">'):]

    muster = re.compile("[^\n]*<script(?: [^>]*)?>(?:(?!</script>).)*?</script>\n", re.S)
    for m in list(muster.finditer(unten))[::-1]:
        if re.search(UEBERSICHT_NUR, m.group(0)):
            unten = unten[:m.start()] + unten[m.end():]
    for rest in ("toggleFC", "activeThema", "data-hash-open"):
        assert rest not in unten, "Steuerskript blieb stehen: " + rest
    for bleibt in ("menu-toggle", "search.js", "goatcounter"):
        assert bleibt in unten, "Notwendiges Element entfernt: " + bleibt
    return kopf, oben, unten


def bloecke_aus(h):
    sucher = Blocksucher(h)
    sucher.feed(h)
    aus = []
    for tr in sucher.treffer:
        roh, attr = tr["roh"], tr["attr"]
        aus.append({
            "nr": tr["nr"],
            "attr": attr,
            # Der Verweis auf die Einzelseite zeigte dort auf sich selbst.
            "inhalt": re.sub(r'\s*<a href="faktencheck-\d+\.html" class="fc-einzel-link">[^<]*</a>',
                             "", tr["inhalt"]),
            "titel": text_von(feld(roh, r'<span class="fc-toggle-title">(.*?)</span>')),
            "datum": text_von(feld(roh, r'<div class="fc-toggle-meta">\s*<span>(.*?)</span>')),
            "thema": text_von(feld(roh, r'<span class="fc-thema-badge[^"]*">(.*?)</span>')),
            "quelle": text_von(feld(roh, r'<span class="fc-quelle-badge[^"]*">(.*?)</span>')),
            "themaid": (re.search(r'data-thema="([^"]*)"', attr) or [None, ""])[1],
            "quelleid": (re.search(r'data-quelle="([^"]*)"', attr) or [None, ""])[1],
            "stats": re.findall(r'<span class="fc-stat-[a-z]+">([^<]*)</span>', roh),
        })
    return aus


def kopf_fuer(kopf_ganz, titel, beschr, url):
    """Uebernimmt den Kopf der Uebersicht, setzt nur die Angaben zur Seite neu."""
    t = H.escape(titel, quote=True)
    k = kopf_ganz
    k = re.sub(r"  <title>.*?</title>",
               "  <title>%s | Souveräne Schweiz</title>" % t, k, count=1, flags=re.S)
    k = re.sub(r'  <link rel="canonical" href="[^"]*" ?/?>',
               '  <link rel="canonical" href="%s" />' % url, k, count=1)
    k = re.sub(r'  <meta name="description" content="[^"]*" ?/?>',
               '  <meta name="description" content="%s" />' % beschr, k, count=1)
    for art, name, wert in (("property", "og:title", t + " | Souveräne Schweiz"),
                            ("property", "og:description", beschr),
                            ("property", "og:url", url),
                            ("property", "og:type", "article"),
                            ("name", "twitter:title", t + " | Souveräne Schweiz"),
                            ("name", "twitter:description", beschr)):
        k = re.sub(r'(<meta %s="%s" content=")[^"]*"' % (art, re.escape(name)),
                   lambda m, w=wert: m.group(1) + w + '"', k, count=1)
    return k


def seite(b, kopf_ganz, oben, unten):
    datei = "faktencheck-%d.html" % b["nr"]
    url = BASIS + datei
    titel = "Faktencheck %d: %s" % (b["nr"], b["titel"])
    stat = " · ".join(b["stats"])
    beschr = H.escape(("Faktencheck %d – %s. %s" % (b["nr"], b["titel"], stat))[:300],
                      quote=True)

    brot = ('<nav class="mx-auto text-[13px] text-gray-400" style="max-width:900px;padding:1rem 5vw 0" '
            'aria-label="Brotkrumen"><a href="index.html" class="transition hover:text-swiss">Start</a>'
            '<span class="px-1.5">/</span>'
            '<a href="faktenchecks.html" class="transition hover:text-swiss">Faktenchecks</a>'
            '<span class="px-1.5">/</span>'
            '<span class="text-gray-600">Nr. %d</span></nav>\n' % b["nr"])

    hero = ('<div class="page-hero">\n'
            '  <div class="page-label">Faktencheck %d</div>\n'
            '  <h1>%s</h1>\n'
            '  <p class="zuletzt-aktualisiert">%s</p>\n'
            '</div>\n'
            '<hr class="divider" />\n\n'
            % (b["nr"], H.escape(b["titel"]), H.escape(b["datum"])))

    badges = ('  <div class="fc-einzel-kopf">\n'
              '    <div class="fc-einzel-badges">\n'
              '      <span class="fc-thema-badge %s">%s</span>\n'
              '      <span class="fc-quelle-badge %s">%s</span>\n'
              '    </div>\n'
              '    <div class="fc-einzel-meta">%s</div>\n'
              '  </div>\n'
              % (b["themaid"], H.escape(b["thema"]), b["quelleid"], H.escape(b["quelle"]),
                 "".join("<span>%s</span>" % H.escape(s) for s in b["stats"])))

    return datei, (
        kopf_fuer(kopf_ganz, titel, beschr, url) + ZUSATZ_CSS + oben
        + brot + hero
        + '<div class="fc-wrap">\n'
        + '  <div class="fc-block" id="fc-%d"%s>\n' % (b["nr"], b["attr"])
        + badges
        + '    <div class="fc-accordion-content" style="max-height:none;opacity:1;padding-top:0">\n'
        + b["inhalt"] + "\n"
        + '    </div>\n'
        + '  </div>\n'
        + '  <p class="fc-zurueck"><a href="faktenchecks.html#fc-%d">← Alle Faktenchecks</a></p>\n' % b["nr"]
        + '</div>\n\n'
        + unten)


def uebersicht_ergaenzen(h, nummern):
    """Setzt auf der Uebersicht fehlende Nummern und Verweise zur Einzelseite.

    Ein von Hand eingefuegter Block hat beides nicht; beides wird hier
    nachgetragen, damit ein neuer Faktencheck nur noch geschrieben
    werden muss.
    """
    teile = re.split(r'(<div class="fc-block" id="fc-\d+")', h)
    neu, ergaenzt = [teile[0]], 0
    for i in range(1, len(teile), 2):
        kopf, rest = teile[i], teile[i + 1]
        nr = re.search(r"fc-(\d+)", kopf).group(1)
        # Bis zum Ende dieses Blocks schauen, nicht in den naechsten hinein.
        ende = len(rest)

        marke = '<div class="fc-toggle-top">'
        j = rest.find(marke)
        if 0 <= j < ende and 'class="fc-nummer"' not in rest[j:j + 400]:
            j += len(marke)
            rest = rest[:j] + '\n          <span class="fc-nummer">Nr. %s</span>' % nr + rest[j:]
            ergaenzt += 1

        marke = '<div class="fc-block-links">'
        k = rest.find(marke)
        if 0 <= k and 'class="fc-einzel-link"' not in rest[k:k + 400]:
            k += len(marke)
            rest = (rest[:k]
                    + '\n        <a href="faktencheck-%s.html" class="fc-einzel-link">'
                      'Einzelseite →</a>' % nr
                    + rest[k:])
        neu += [kopf, rest]
    return "".join(neu), ergaenzt


def sitemap_ergaenzen(nummern):
    """Traegt fehlende Einzelseiten nach dem Eintrag der Uebersicht nach."""
    if not SITEMAP.exists():
        return 0
    s = SITEMAP.read_text(encoding="utf-8")
    fehlend = [n for n in nummern if "/faktencheck-%d.html<" % n not in s]
    if not fehlend:
        return 0
    marke = "    <loc>" + BASIS + "faktenchecks.html</loc>"
    i = s.index("  </url>", s.index(marke)) + len("  </url>\n")
    heute = date.today().isoformat()
    neu = "".join(
        "  <url>\n"
        "    <loc>%sfaktencheck-%d.html</loc>\n"
        "    <lastmod>%s</lastmod>\n"
        "    <priority>0.5</priority>\n"
        "  </url>\n" % (BASIS, n, heute)
        for n in sorted(fehlend))
    SITEMAP.write_text(s[:i] + neu + s[i:], encoding="utf-8", newline="")
    return len(fehlend)


def main():
    h = QUELLE.read_text(encoding="utf-8")
    bloecke = bloecke_aus(h)
    if not bloecke:
        raise SystemExit("Keine Faktenchecks in %s gefunden." % QUELLE.name)

    nummern_roh = sorted(b["nr"] for b in bloecke)
    h, ergaenzt = uebersicht_ergaenzen(h, nummern_roh)
    if ergaenzt:
        QUELLE.write_text(h, encoding="utf-8", newline="")
        bloecke = bloecke_aus(h)
    print("Uebersicht: %s"
          % ("%d Nummer(n) nachgetragen" % ergaenzt if ergaenzt else "vollstaendig"))

    kopf_ganz, oben, unten = geruest(h)

    schief = [b["nr"] for b in bloecke
              if len(re.findall(r"<div\b", b["inhalt"])) != len(re.findall(r"</div>", b["inhalt"]))]
    assert not schief, "Unausgeglichene Container in Faktencheck %s" % schief

    for b in bloecke:
        datei, text = seite(b, kopf_ganz, oben, unten)
        (ROOT / datei).write_text(text, encoding="utf-8", newline="")

    nummern = sorted(b["nr"] for b in bloecke)
    print("Faktencheck-Einzelseiten: %d (Nr. %d bis %d)"
          % (len(nummern), nummern[0], nummern[-1]))
    n = sitemap_ergaenzen(nummern)
    print("Sitemap: %s" % ("%d Adresse(n) nachgetragen" % n if n else "vollstaendig"))


if __name__ == "__main__":
    main()
