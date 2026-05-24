import os

PLACEHOLDER_BLOCK = """
    <h3>Quellen und Vertiefung</h3>
    <ul class="quellen-liste">
      <li><em>Quellenangaben folgen.</em></li>
    </ul>"""

SKIP = {
    'ch-eu/strom.html',
    'ch-eu/botschaft-bundesrat.html',
    'ch-eu/landverkehr.html',
    'ch-eu/richli-gutachten.html',
}

INSERT_BEFORE = '  </div>\n  <aside class="sidebar">'

updated = []
skipped = []

for d in ['ch-eu', '10mio']:
    for fn in sorted(os.listdir(d)):
        if not fn.endswith('.html'):
            continue
        path = d + '/' + fn
        if path in SKIP:
            skipped.append(path + ' (hat bereits quellen-liste)')
            continue
        with open(path, encoding='utf-8') as f:
            c = f.read()
        if 'content-wrap' not in c:
            skipped.append(path + ' (kein article-layout)')
            continue
        if 'quellen-liste' in c:
            skipped.append(path + ' (hat bereits quellen-liste)')
            continue

        # schweizer-beitrag: has Quellen h3 (no-accordion) but no list — append list only
        if 'no-accordion' in c:
            new_c = c.replace(INSERT_BEFORE,
                '    <ul class="quellen-liste">\n      <li><em>Quellenangaben folgen.</em></li>\n    </ul>\n' + INSERT_BEFORE, 1)
        else:
            new_c = c.replace(INSERT_BEFORE, PLACEHOLDER_BLOCK + '\n' + INSERT_BEFORE, 1)

        if new_c == c:
            skipped.append(path + ' (kein match)')
            continue

        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_c)
        updated.append(path)

print(f'Aktualisiert ({len(updated)}):')
for p in updated:
    print(' ', p)
print(f'\nUebersprungen ({len(skipped)}):')
for p in skipped:
    print(' ', p)
