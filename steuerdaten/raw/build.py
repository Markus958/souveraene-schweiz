# -*- coding: utf-8 -*-
"""Baut steuerdaten/steuerfuesse.{csv,json} und steuerdaten/tarife.{csv,json}
aus den ESTV-Rohdaten (swisstaxcalculator), Steuerjahr 2026."""
import json, csv, os, math

RAW = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(RAW)
YEAR = 2026
BASE = "https://swisstaxcalculator.estv.admin.ch/delegate/ost-integration/v1/lg-proxy/operation/c3b67379_ESTV"
URL_RATES  = BASE + "/API_exportManySimpleRates"   # TaxYear=2026, TaxGroupID=99
URL_SCALES = BASE + "/API_exportManyTaxScales"      # TaxYear=2026, TaxGroupID=88

def load(p):
    with open(os.path.join(RAW, p), encoding="utf-8") as f:
        return json.load(f)["response"]

def num(x):
    """FP-Rauschen entfernen; ganze Zahlen als int."""
    if x is None: return "n/a"
    r = round(float(x), 6)
    if r == int(r): return int(r)
    return r

NA = "n/a"

# Kanton-Einwohner (BFS, Stand 31.12.2024) -> Sortierung (grösster zuerst)
POP = {
 "ZH":1620020,"BE":1071216,"VD":855106,"AG":735808,"SG":540036,"GE":531102,
 "LU":437944,"VS":371288,"TI":358903,"FR":346674,"BL":301323,"TG":299509,
 "SO":289792,"GR":206138,"BS":201384,"NE":179518,"SZ":168931,"ZG":133739,
 "SH":88667,"JU":74840,"AR":56705,"NW":45345,"GL":42371,"OW":39662,
 "UR":38275,"AI":16733,
}

# =========================================================================
# TEIL A — STEUERFÜSSE
# =========================================================================
rates = load("rates_2026.json")
rows_a = []
for e in rates:
    L = e["Location"]
    rows_a.append({
        "Kanton": L["Canton"],
        "Gemeinde": L["BfsName"],
        "Jahr": YEAR,
        "Kantonssteuerfuss": num(e["IncomeRateCanton"]),
        "Gemeindesteuerfuss": num(e["IncomeRateCity"]),
        "Kirchensteuerfuss_kath": num(e["IncomeRateRoman"]),
        "Kirchensteuerfuss_ref": num(e["IncomeRateProtestant"]),
        "Quelle_URL": URL_RATES,
    })

# Sortierung: Kanton nach Einwohner (grösster zuerst), Gemeinden alphabetisch
import locale
def sortkey(r):
    return (-POP.get(r["Kanton"], 0), r["Kanton"], r["Gemeinde"].lower())
rows_a.sort(key=sortkey)

fields_a = ["Kanton","Gemeinde","Jahr","Kantonssteuerfuss","Gemeindesteuerfuss",
            "Kirchensteuerfuss_kath","Kirchensteuerfuss_ref","Quelle_URL"]
with open(os.path.join(OUT,"steuerfuesse.csv"), "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=fields_a)
    w.writeheader(); w.writerows(rows_a)
with open(os.path.join(OUT,"steuerfuesse.json"), "w", encoding="utf-8") as f:
    json.dump(rows_a, f, ensure_ascii=False, indent=1)
print(f"steuerfuesse: {len(rows_a)} Zeilen, {len(set(r['Kanton'] for r in rows_a))} Kantone")

# =========================================================================
# TEIL B — TARIFE
# =========================================================================
scales = load("scales_2026.json")

def tariftyp(group):
    if group == "ALLE": return "alle"
    if "VERHEIRATET" in group: return "verheiratet"
    return "allein"

def methode(tabletype, canton):
    if tabletype in ("BUND","ZUERICH"):
        return ("Marginaltarif: einfache Steuer = grundbetrag + (Einkommen - von) * "
                "prozentsatz/100 fuer die Stufe mit von <= Einkommen < bis.")
    if tabletype == "FLATTAX":
        return "Proportionaltarif: einfache Steuer = Einkommen * prozentsatz/100."
    if tabletype == "FREIBURG" and canton == "FR":
        return ("Durchschnittssatztarif: prozentsatz = Steuersatz an der Stuetzstelle 'von'; "
                "zwischen Stuetzstellen linear interpolieren und auf das GESAMTE steuerbare "
                "Einkommen anwenden (gegen ESTV verifiziert).")
    if tabletype == "LOOKUP":
        return ("Stuetzwert-Tabelle: einfache Steuer = lineare Interpolation von 'grundbetrag' ueber "
                "'von' (steuerbares Einkommen). VS-Tarif ist formelbasiert (kant. StG VS) und wurde "
                "aus der amtlichen ESTV-Berechnung (API_calculateDetailedTaxes) abgetastet; Einheitstarif "
                "(ledig = verheiratet, kein Splitting). Interpolationsfehler < 0.6 %.")
    if tabletype == "FORMEL":
        return ("Formeltarif: einfache Steuer = 'formel' mit $wert$ = steuerbares Einkommen, "
                "fuer den Bereich von <= $wert$ < bis (log = natuerlicher Logarithmus).")
    return ""

def transform(tabletype, table):
    """-> Liste von Stufen {von,bis,grundbetrag,prozentsatz,formel}."""
    stufen = []
    if tabletype == "FLATTAX":
        r = table[0]
        stufen.append({"von":0,"bis":NA,"grundbetrag":0,
                       "prozentsatz":num(r["Percent"]),"formel":NA})
        return stufen
    if tabletype == "ZUERICH":
        # Amount = Stufenbreite, Percent = Satz auf der Stufe, kumuliert berechnen
        von = 0; base = 0.0
        for r in table:
            w = float(r["Amount"]); p = float(r["Percent"])
            if w >= 99999999:  # offene Spitzenstufe
                stufen.append({"von":num(von),"bis":NA,"grundbetrag":num(base),
                               "prozentsatz":num(p),"formel":NA})
                von = None; break
            bis = von + w
            stufen.append({"von":num(von),"bis":num(bis),"grundbetrag":num(base),
                           "prozentsatz":num(p),"formel":NA})
            base += w * p / 100.0
            von = bis
        return stufen
    if tabletype == "BUND":
        # Amount = von, Taxes = grundbetrag (kumuliert), Percent = Grenzsatz auf Überschuss
        for i, r in enumerate(table):
            von = r["Amount"]
            bis = table[i+1]["Amount"] if i+1 < len(table) else NA
            stufen.append({"von":num(von),"bis":(num(bis) if bis!=NA else NA),
                           "grundbetrag":num(r["Taxes"]),"prozentsatz":num(r["Percent"]),
                           "formel":NA})
        return stufen
    if tabletype == "FREIBURG":
        # Amount = Einkommens-Stützstelle, Percent = Steuersatz (Durchschnittssatz) an der Stützstelle
        # (Anwendung: zwischen Stützstellen linear interpoliert, auf GANZES Einkommen) -> kein Marginalsatz
        for i, r in enumerate(table):
            von = r["Amount"]
            bis = table[i+1]["Amount"] if i+1 < len(table) else NA
            stufen.append({"von":num(von),"bis":(num(bis) if bis!=NA else NA),
                           "grundbetrag":NA,"prozentsatz":num(r["Percent"]),"formel":NA})
        return stufen
    if tabletype == "FORMEL":
        # Amount = Bereichsuntergrenze, Formula = Berechnungsformel ($wert$ = steuerb. Einkommen)
        for i, r in enumerate(table):
            von = r["Amount"]
            bis = table[i+1]["Amount"] if i+1 < len(table) else NA
            stufen.append({"von":num(von),"bis":(num(bis) if bis!=NA else NA),
                           "grundbetrag":NA,"prozentsatz":NA,
                           "formel":(r["Formula"] if r["Formula"] else NA)})
        return stufen
    raise ValueError("unbekannter TableType "+tabletype)

tarife_objs = []   # nested (für JSON)
tarife_rows = []   # flach (für CSV)

# --- Bund: einmal zentral (federally uniform), aus ZH extrahiert ---
bund_entries = [e for e in scales if e["Target"]=="BUND" and e["TaxType"]=="EINKOMMENSSTEUER"
                and e["Location"]["Canton"]=="ZH"]
for e in sorted(bund_entries, key=lambda e: 0 if "VERHEIRATET" not in e["Group"] else 1):
    tt = tariftyp(e["Group"])
    stufen = transform(e["TableType"], e["Table"])
    obj = {"ebene":"Bund","kanton":NA,"tariftyp":tt,"gruppe":e["Group"],"jahr":YEAR,
           "tabellentyp":e["TableType"],"splitting":num(e["Splitting"]),"basis":"kanton",
           "methode":methode(e["TableType"],"BUND"),
           "quelle_url":URL_SCALES,"stufen":stufen}
    tarife_objs.append(obj)
    for s in stufen:
        tarife_rows.append({"Ebene":"Bund","Kanton":NA,"Tariftyp":tt,"Jahr":YEAR,
            "von":s["von"],"bis":s["bis"],"grundbetrag":s["grundbetrag"],
            "prozentsatz":s["prozentsatz"],"Quelle_URL":URL_SCALES,
            "tabellentyp":e["TableType"],"gruppe":e["Group"],
            "splitting":num(e["Splitting"]),"basis":"kanton","formel":s["formel"]})

# --- Kantone: einfache Einkommenssteuer (Target=KANTON) ---
kanton_entries = [e for e in scales if e["Target"]=="KANTON" and e["TaxType"]=="EINKOMMENSSTEUER"]
# nach Einwohner sortieren, dann Tariftyp (allein, alle, verheiratet)
order = {"allein":0,"alle":1,"verheiratet":2}
kanton_entries.sort(key=lambda e: (-POP.get(e["Location"]["Canton"],0),
                                    e["Location"]["Canton"],
                                    order.get(tariftyp(e["Group"]),9),
                                    e["Group"]))
URL_CALC = BASE + "/API_calculateDetailedTaxes"
_VS = json.load(open(os.path.join(RAW,"vs_lookup.json"), encoding="utf-8"))
def vs_lookup_stufen(stand, basis):
    """VS: einfache Steuer als Stützwert-Tabelle. stand=led|verh, basis=kanton|gemeinde."""
    pts = _VS[stand][basis]; st = []
    for i,(x,y) in enumerate(pts):
        bis = pts[i+1][0] if i+1 < len(pts) else NA
        st.append({"von":num(x),"bis":(num(bis) if bis!=NA else NA),
                   "grundbetrag":num(y),"prozentsatz":NA,"formel":NA})
    return st

def emit_tarif(ebene, c, tt, gruppe, tabellentyp, split, quelle, stufen, basis):
    obj = {"ebene":ebene,"kanton":c,"tariftyp":tt,"gruppe":gruppe,"jahr":YEAR,
           "tabellentyp":tabellentyp,"splitting":split,"basis":basis,
           "methode":methode(tabellentyp,c),"quelle_url":quelle,"stufen":stufen}
    tarife_objs.append(obj)
    for s in stufen:
        tarife_rows.append({"Ebene":ebene,"Kanton":c,"Tariftyp":tt,"Jahr":YEAR,
            "von":s["von"],"bis":s["bis"],"grundbetrag":s["grundbetrag"],
            "prozentsatz":s["prozentsatz"],"Quelle_URL":quelle,
            "tabellentyp":tabellentyp,"gruppe":gruppe,"splitting":split,"basis":basis,"formel":s["formel"]})

for e in kanton_entries:
    c = e["Location"]["Canton"]
    if c == "VS":   # formelbasiert -> Stützwert-Tabellen (ledig/verheiratet x kantonal/kommunal)
        emit_tarif("Kanton","VS","allein","LEDIG_ALLEINE","LOOKUP",0,URL_CALC, vs_lookup_stufen("led","kanton"),  "kanton")
        emit_tarif("Kanton","VS","allein","LEDIG_ALLEINE","LOOKUP",0,URL_CALC, vs_lookup_stufen("led","gemeinde"),"gemeinde")
        emit_tarif("Kanton","VS","verheiratet","VERHEIRATET","LOOKUP",0,URL_CALC, vs_lookup_stufen("verh","kanton"),  "kanton")
        emit_tarif("Kanton","VS","verheiratet","VERHEIRATET","LOOKUP",0,URL_CALC, vs_lookup_stufen("verh","gemeinde"),"gemeinde")
    else:
        emit_tarif("Kanton", c, tariftyp(e["Group"]), e["Group"], e["TableType"],
                   num(e["Splitting"]), URL_SCALES, transform(e["TableType"], e["Table"]), "kanton")

fields_b = ["Ebene","Kanton","Tariftyp","Jahr","von","bis","grundbetrag","prozentsatz",
            "Quelle_URL","tabellentyp","gruppe","splitting","basis","formel"]
with open(os.path.join(OUT,"tarife.csv"), "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=fields_b)
    w.writeheader(); w.writerows(tarife_rows)
with open(os.path.join(OUT,"tarife.json"), "w", encoding="utf-8") as f:
    json.dump(tarife_objs, f, ensure_ascii=False, indent=1)

print(f"tarife: {len(tarife_objs)} Tarife ({len(tarife_rows)} Stufen-Zeilen)")
print("  Bund-Tarife:", sum(1 for o in tarife_objs if o['ebene']=='Bund'))
print("  Kanton-Tarife:", sum(1 for o in tarife_objs if o['ebene']=='Kanton'),
      "über", len(set(o['kanton'] for o in tarife_objs if o['ebene']=='Kanton')), "Kantone")

# =========================================================================
# TEIL C — VERMÖGENSSTEUER-TARIFE (für Gemeinde-Steuerrechner)
# =========================================================================
vm_objs = []
vm_entries = [e for e in scales if e["Target"]=="KANTON" and e["TaxType"]=="VERMOEGENSSTEUER"]
vm_entries.sort(key=lambda e: (-POP.get(e["Location"]["Canton"],0), e["Location"]["Canton"],
                               order.get(tariftyp(e["Group"]),9), e["Group"]))
for e in vm_entries:
    c = e["Location"]["Canton"]
    vm_objs.append({"ebene":"Kanton","kanton":c,"tariftyp":tariftyp(e["Group"]),"gruppe":e["Group"],
        "jahr":YEAR,"tabellentyp":e["TableType"],"splitting":num(e["Splitting"]),"basis":"kanton",
        "methode":methode(e["TableType"],c),"quelle_url":URL_SCALES,
        "stufen":transform(e["TableType"], e["Table"])})
with open(os.path.join(OUT,"vermoegenssteuer.json"), "w", encoding="utf-8") as f:
    json.dump(vm_objs, f, ensure_ascii=False, indent=1)
print(f"vermoegenssteuer: {len(vm_objs)} Tarife über {len(set(o['kanton'] for o in vm_objs))} Kantone")

# =========================================================================
# TEIL D — STEUER-MULTIPLIKATOREN je Gemeinde (bfs-keyed, Einkommen + Vermögen + Kirche)
# =========================================================================
mult = []
for e in rates:
    L = e["Location"]
    mult.append({
        "bfs_nr": L["BfsID"], "kanton": L["Canton"], "gemeinde": L["BfsName"],
        "eink": {"kanton":num(e["IncomeRateCanton"]), "gemeinde":num(e["IncomeRateCity"]),
                 "kath":num(e["IncomeRateRoman"]), "ref":num(e["IncomeRateProtestant"]),
                 "christ":num(e["IncomeRateChrist"])},
        "verm": {"kanton":num(e["FortuneRateCanton"]), "gemeinde":num(e["FortuneRateCity"]),
                 "kath":num(e["FortuneRateRoman"]), "ref":num(e["FortuneRateProtestant"]),
                 "christ":num(e["FortuneRateChrist"])},
    })
mult.sort(key=lambda r:(r["kanton"], r["gemeinde"].lower()))
out_mult = {"meta":{"jahr":YEAR,"quelle":URL_RATES,
            "hinweis":"Steuerfüsse natürliche Personen in % der einfachen Steuer; Einkommen und Vermögen getrennt, Kirche je Konfession."},
            "gemeinden": mult}
with open(os.path.join(OUT,"steuer-multiplikatoren.json"), "w", encoding="utf-8") as f:
    json.dump(out_mult, f, ensure_ascii=False)
print(f"steuer-multiplikatoren: {len(mult)} Gemeinden (bfs-keyed)")
