#!/usr/bin/env python3
"""Injects search button, overlay and script into all HTML pages."""
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent

PAGES = [
    # Root pages (prefix = "")
    ("glossar.html",                       ""),
    ("faktenchecks.html",                  ""),
    ("reaktionen.html",                    ""),
    ("mediathek.html",                     ""),
    ("ueber.html",                         ""),
    ("impressum.html",                     ""),
    ("statistik.html",                     ""),
    # Paket CH-EU
    ("ch-eu/index.html",                   "../"),
    ("ch-eu/personenfreizuegigkeit.html",  "../"),
    ("ch-eu/schweizer-beitrag.html",       "../"),
    ("ch-eu/strom.html",                   "../"),
    ("ch-eu/landverkehr.html",             "../"),
    ("ch-eu/binnenmarkt.html",             "../"),
    ("ch-eu/botschaft-bundesrat.html",     "../"),
    ("ch-eu/richli-gutachten.html",        "../"),
    ("ch-eu/eu-programme.html",            "../"),
    ("ch-eu/forschung.html",               "../"),
    ("ch-eu/gesundheit.html",              "../"),
    ("ch-eu/landwirtschaft.html",          "../"),
    ("ch-eu/lebensmittelsicherheit.html",  "../"),
    ("ch-eu/luftverkehr.html",             "../"),
    ("ch-eu/mra.html",                     "../"),
    ("ch-eu/querschnitt.html",             "../"),
    ("ch-eu/weltraum.html",                "../"),
    ("ch-eu/timeline.html",                "../"),
    # 10-Millionen-Schweiz
    ("10mio/index.html",                   "../"),
    ("10mio/zuwanderung.html",             "../"),
    ("10mio/infrastruktur.html",           "../"),
    ("10mio/wohnen.html",                  "../"),
    ("10mio/zahlen.html",                  "../"),
    ("10mio/timeline.html",                "../"),
]

NAV_BTN = (
    '  <button class="nav-search-btn" id="navSearchBtn" onclick="toggleSearch()" aria-label="Suche">\n'
    '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">\n'
    '      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>\n'
    '    </svg>\n'
    '  </button>\n'
)

def overlay_html(prefix):
    return (
        '<div class="search-overlay" id="searchOverlay" data-root="' + prefix + '" hidden>\n'
        '  <div class="search-overlay-bar">\n'
        '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">\n'
        '      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>\n'
        '    </svg>\n'
        '    <input class="search-input" id="searchInput" type="search" placeholder="Suchen auf souveraene-schweiz.ch…" autocomplete="off" spellcheck="false" oninput="doSearch(this.value)" onkeydown="if(event.key===\'Escape\')closeSearch()" />\n'
        '    <button class="search-close-btn" onclick="closeSearch()" aria-label="Suche schliessen">&#x2715;</button>\n'
        '  </div>\n'
        '  <div class="search-res-list" id="searchResList"></div>\n'
        '</div>\n'
    )


def inject(file_path, prefix):
    fp = ROOT / file_path
    if not fp.exists():
        print(f"  SKIP (nicht gefunden): {file_path}")
        return

    content = fp.read_text(encoding="utf-8")

    if 'nav-search-btn' in content or 'searchOverlay' in content:
        print(f"  SKIP (bereits vorhanden): {file_path}")
        return

    # 1. CSS link before </head>
    css_link = f'<link rel="stylesheet" href="{prefix}assets/search.css" />\n'
    content = content.replace('</head>', css_link + '</head>', 1)

    # 2. Nav search button before hamburger
    content = content.replace(
        '<button class="hamburger"',
        NAV_BTN + '  <button class="hamburger"',
        1
    )

    # 3. Search overlay after first </nav>
    content = content.replace('</nav>\n', '</nav>\n\n' + overlay_html(prefix), 1)

    # 4. Script before </body>
    script_tag = f'<script src="{prefix}assets/search.js"></script>\n'
    content = content.replace('</body>', script_tag + '</body>', 1)

    fp.write_text(content, encoding="utf-8")
    print(f"  OK: {file_path}")


def main():
    for file_path, prefix in PAGES:
        inject(file_path, prefix)


if __name__ == "__main__":
    main()
