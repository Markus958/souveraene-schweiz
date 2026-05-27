#!/usr/bin/env python3
"""Prüft Site-Integrität: Sitemap-Einträge, OG-Images und interne Links."""
import os, re
from pathlib import Path
from urllib.parse import unquote

ROOT     = Path('.')
BASE_URL = 'https://www.souveraene-schweiz.ch/'
SITEMAP  = ROOT / 'sitemap.xml'
SUMMARY  = os.environ.get('GITHUB_STEP_SUMMARY')

errors   = []
warnings = []
lines    = []

def log(msg):
    print(msg)
    lines.append(msg)

# ── 1. Sitemap: jeder <loc>-Eintrag muss als Datei existieren ──────────────
log('## Sitemap-Check')
sitemap_text = SITEMAP.read_text(encoding='utf-8')
locs = re.findall(r'<loc>(.*?)</loc>', sitemap_text)
for url in locs:
    rel = url.replace(BASE_URL, '').strip('/')
    if not rel:
        rel = 'index.html'
    path = ROOT / rel
    if path.exists():
        log(f'- [x] `{rel}`')
    else:
        errors.append(f'Sitemap: Datei fehlt → {rel}')
        log(f'- [ ] **FEHLER: `{rel}` nicht gefunden**')

# ── 2. OG-Images: alle og:image-URLs müssen als Datei existieren ───────────
log('\n## OG-Image-Check')
for html_file in sorted(ROOT.rglob('*.html')):
    text = html_file.read_text(encoding='utf-8', errors='ignore')
    for m in re.finditer(r'og:image[^>]*content="([^"]*souveraene-schweiz\.ch/([^"]+\.(png|jpg|jpeg|webp|svg)))"', text):
        rel = m.group(2)
        img_path = ROOT / unquote(rel)
        label = html_file.relative_to(ROOT)
        if img_path.exists():
            log(f'- [x] `{label}` → `{rel}`')
        else:
            errors.append(f'OG-Image fehlt: {label} → {rel}')
            log(f'- [ ] **FEHLER: `{label}` → `{rel}` nicht gefunden**')

# ── 3. Interne Links: .html-hrefs müssen auf existierende Dateien zeigen ───
log('\n## Interne Links')
root_abs = ROOT.resolve()
for html_file in sorted(ROOT.rglob('*.html')):
    text = html_file.read_text(encoding='utf-8', errors='ignore')
    for m in re.finditer(r'href="([^"#?]*\.html)"', text):
        href = m.group(1)
        if href.startswith('http'):
            continue
        if href.startswith('/'):
            target = (ROOT / href.lstrip('/')).resolve()
        else:
            target = (html_file.parent / href).resolve()
        if not str(target).startswith(str(root_abs)):
            continue
        label = html_file.relative_to(ROOT)
        if target.exists():
            pass  # Kein Log für OK-Links (zu viele)
        else:
            warnings.append(f'Toter Link: {label} → {href}')
            log(f'- [ ] **WARNUNG: `{label}` → `{href}` nicht gefunden**')

if not warnings:
    log('- Alle internen Links in Ordnung.')

# ── Zusammenfassung ────────────────────────────────────────────────────────
log(f'\n## Ergebnis')
log(f'- Fehler: **{len(errors)}**')
log(f'- Warnungen: **{len(warnings)}**')
for e in errors:
    log(f'  - FEHLER: {e}')
for w in warnings:
    log(f'  - WARNUNG: {w}')

if SUMMARY:
    with open(SUMMARY, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

if errors:
    print('\nIntegritätsprüfung FEHLGESCHLAGEN.')
    raise SystemExit(1)
else:
    print('\nIntegritätsprüfung bestanden.')
