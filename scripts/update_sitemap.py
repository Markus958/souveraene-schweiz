#!/usr/bin/env python3
"""Aktualisiert <lastmod>-Daten in sitemap.xml aus dem Git-Log."""
import re, subprocess
from pathlib import Path

SITEMAP  = Path('sitemap.xml')
BASE_URL = 'https://www.souveraene-schweiz.ch/'

def url_to_path(url):
    rel = url.replace(BASE_URL, '').strip('/')
    return Path('index.html') if not rel else Path(rel)

def git_date(path):
    r = subprocess.run(
        ['git', 'log', '-1', '--format=%cs', '--', str(path)],
        capture_output=True, text=True
    )
    return r.stdout.strip() or None  # YYYY-MM-DD

content = SITEMAP.read_text(encoding='utf-8')
changes = []

def replace_block(m):
    block = m.group(0)
    loc = re.search(r'<loc>(.*?)</loc>', block)
    if not loc:
        return block
    path = url_to_path(loc.group(1))
    if not path.exists():
        return block
    new_date = git_date(path)
    if not new_date:
        return block
    old_date_m = re.search(r'<lastmod>(.*?)</lastmod>', block)
    if not old_date_m or old_date_m.group(1) == new_date:
        return block
    changes.append(f'  {path}: {old_date_m.group(1)} -> {new_date}')
    return re.sub(r'<lastmod>.*?</lastmod>', f'<lastmod>{new_date}</lastmod>', block)

new_content = re.sub(r'<url>.*?</url>', replace_block, content, flags=re.DOTALL)

if changes:
    SITEMAP.write_text(new_content, encoding='utf-8')
    print(f'{len(changes)} lastmod-Datum/Daten aktualisiert:')
    for c in changes:
        print(c)
else:
    print('sitemap.xml ist aktuell, keine Änderungen.')
