import os

OLD = (
    "  document.querySelectorAll('.article-body h3').forEach(function(h3, i) {\n"
    "    var content = [];\n"
    "    var next = h3.nextElementSibling;\n"
    "    while (next && next.tagName !== 'H3') { content.push(next); next = next.nextElementSibling; }\n"
    "    if (!content.length) return;\n"
    "    var wrap = document.createElement('div');\n"
    "    wrap.className = 'accordion-content';\n"
    "    h3.parentNode.insertBefore(wrap, content[0]);\n"
    "    content.forEach(function(el) { wrap.appendChild(el); });"
)

NEW = (
    "  document.querySelectorAll('.article-body h3').forEach(function(h3, i) {\n"
    "    var teaser = null;\n"
    "    var firstEl = h3.nextElementSibling;\n"
    "    if (firstEl && firstEl.classList && firstEl.classList.contains('accordion-teaser')) {\n"
    "      teaser = firstEl;\n"
    "      firstEl = firstEl.nextElementSibling;\n"
    "    }\n"
    "    var content = [];\n"
    "    var next = firstEl;\n"
    "    while (next && next.tagName !== 'H3') { content.push(next); next = next.nextElementSibling; }\n"
    "    if (!content.length) return;\n"
    "    var wrap = document.createElement('div');\n"
    "    wrap.className = 'accordion-content';\n"
    "    var anchor = teaser || h3;\n"
    "    if (anchor.nextElementSibling) {\n"
    "      anchor.parentNode.insertBefore(wrap, anchor.nextElementSibling);\n"
    "    } else {\n"
    "      anchor.parentNode.appendChild(wrap);\n"
    "    }\n"
    "    content.forEach(function(el) { wrap.appendChild(el); });"
)

SKIP = {'ch-eu/schweizer-beitrag.html', 'ch-eu/botschaft-bundesrat.html'}

updated = []
skipped = []

for d in ['ch-eu', '10mio']:
    for fn in sorted(os.listdir(d)):
        if not fn.endswith('.html'):
            continue
        path = d + '/' + fn
        if path in SKIP:
            skipped.append(path + ' (eigenes JS)')
            continue
        with open(path, encoding='utf-8') as f:
            c = f.read()
        if OLD not in c:
            skipped.append(path + ' (kein match)')
            continue
        new_c = c.replace(OLD, NEW, 1)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_c)
        updated.append(path)

print(f'Aktualisiert ({len(updated)}):')
for p in updated:
    print(' ', p)
print(f'\nUebersprungen ({len(skipped)}):')
for p in skipped:
    print(' ', p)
