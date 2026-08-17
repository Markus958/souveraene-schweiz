path = 'ch-eu/schweizer-beitrag-kostenmodul.html'
with open(path, encoding='utf-8') as f:
    c = f.read()

old = (
    '    var dBetrag = g2Betrag - g1Betrag;\n'
    '    var dKopf   = g2Kopf - g1Kopf;\n'
    '    var cls  = dBetrag >= 0 ? \'km-delta-pos\' : \'km-delta-neg\';\n'
    '    var sign = dBetrag >= 0 ? \'+\' : \'\';\n'
    '    var signK = dKopf >= 0 ? \'+\' : \'\';\n'
    '    el.innerHTML =\n'
    '      \'<span class="\' + cls + \'">\' + sign + fmtCHF(dBetrag) + \'</span>\' +\n'
    '      \'<br><span style="font-weight:400;font-size:.78rem;color:var(--mittel)">\' + signK + fmtInt(dKopf) + \'&nbsp;CHF/Einw.</span>\';'
)
new = (
    '    var dKopf = g2Kopf - g1Kopf;\n'
    '    var cls   = dKopf >= 0 ? \'km-delta-pos\' : \'km-delta-neg\';\n'
    '    var sign  = dKopf >= 0 ? \'+\' : \'\';\n'
    '    el.innerHTML = \'<span class="\' + cls + \'">\' + sign + fmtInt(dKopf) + \'&nbsp;CHF/Einw.</span>\';'
)

if old in c:
    c = c.replace(old, new, 1)
    print('OK')
else:
    print('KEIN MATCH')

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
