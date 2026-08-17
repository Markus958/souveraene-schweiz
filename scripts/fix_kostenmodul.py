import re

path = 'ch-eu/schweizer-beitrag-kostenmodul.html'
with open(path, encoding='utf-8') as f:
    c = f.read()

NBSP = '\xa0'

# Fix 1: fmtCHF — handle negative numbers
old_fmt = (
    '  function fmtCHF(n) {\n'
    "    if (n >= 1e9) return (n / 1e9).toFixed(2).replace('.', ',') + '" + NBSP + "Mrd. CHF';\n"
    "    if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + '" + NBSP + "Mio. CHF';\n"
    "    return fmtInt(n) + '" + NBSP + "CHF';\n"
    '  }'
)
new_fmt = (
    '  function fmtCHF(n) {\n'
    '    var neg = n < 0; var abs = Math.abs(n); var s;\n'
    "    if (abs >= 1e9) s = (abs / 1e9).toFixed(2).replace('.', ',') + '" + NBSP + "Mrd. CHF';\n"
    "    else if (abs >= 1e6) s = (abs / 1e6).toFixed(1).replace('.', ',') + '" + NBSP + "Mio. CHF';\n"
    "    else s = fmtInt(abs) + '" + NBSP + "CHF';\n"
    "    return neg ? '-' + s : s;\n"
    '  }'
)

if old_fmt in c:
    c = c.replace(old_fmt, new_fmt, 1)
    print('Fix 1 (fmtCHF): OK')
else:
    print('Fix 1 (fmtCHF): KEIN MATCH')

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
