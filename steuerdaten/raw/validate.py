# -*- coding: utf-8 -*-
import json, urllib.request, time, math, re, os
RAW=os.path.dirname(os.path.abspath(__file__)); OUT=os.path.dirname(RAW)
BASE="https://swisstaxcalculator.estv.admin.ch/delegate/ost-integration/v1/lg-proxy/operation/c3b67379_ESTV"

def load(p):
    with open(os.path.join(RAW,p),encoding="utf-8") as f: return json.load(f)["response"]
rates=load("rates_2026.json")
loc={(e["Location"]["Canton"],e["Location"]["BfsName"]):e["Location"]["TaxLocationID"] for e in rates}

with open(os.path.join(OUT,"tarife.json"),encoding="utf-8") as f:
    tarife=json.load(f)
# index: (ebene,kanton,tariftyp) -> tarif (nimm 'allein' bzw 'alle')
def get_tarif(kanton):
    cand=[t for t in tarife if t["ebene"]=="Kanton" and t["kanton"]==kanton]
    for tt in ("alle","allein"):
        for t in cand:
            if t["tariftyp"]==tt: return t
    return cand[0] if cand else None

def n(v):
    return None if v=="n/a" else float(v)

def eval_tarif(t, x):
    typ=t["tabellentyp"]; st=t["stufen"]
    if typ in ("BUND","ZUERICH"):
        chosen=st[0]
        for s in st:
            if x>=n(s["von"]): chosen=s
            else: break
        return n(chosen["grundbetrag"])+(x-n(chosen["von"]))*n(chosen["prozentsatz"])/100
    if typ=="FLATTAX":
        return x*n(st[0]["prozentsatz"])/100
    if typ=="FREIBURG":
        pts=[(n(s["von"]),n(s["prozentsatz"])) for s in st]
        rate=pts[-1][1]
        for i in range(len(pts)-1):
            x0,r0=pts[i]; x1,r1=pts[i+1]
            if x0<=x<=x1:
                rate=r0+( (x-x0)/(x1-x0)*(r1-r0) if x1>x0 else 0); break
        else:
            if x<pts[0][0]: rate=pts[0][1]
        return x*rate/100
    if typ=="FORMEL":
        chosen=st[0]
        for s in st:
            if x>=n(s["von"]): chosen=s
            else: break
        f=chosen["formel"]
        if f in (None,"n/a"): return 0.0
        expr=f.replace("$wert$","W")
        expr=re.sub(r"log\s+W","math.log(W)",expr)
        return eval(expr,{"math":math,"W":x})
    return None

def calc(tl,inc,rel=1,year=2026):
    p={"TaxYear":year,"TaxLocationID":tl,"Relationship":rel,"Confession1":5,"Confession2":5,
       "Children":[],"Age1":40,"Age2":0,"RevenueType1":2,"Revenue1":inc,"RevenueType2":0,
       "Revenue2":0,"Fortune":0}
    req=urllib.request.Request(BASE+"/API_calculateDetailedTaxes",
        data=json.dumps(p).encode(),headers={"Content-Type":"application/json"})
    with urllib.request.urlopen(req,timeout=60) as r: return json.load(r)["response"]

caps={"ZH":"Zürich","BE":"Bern","VD":"Lausanne","AG":"Aarau","SG":"St. Gallen","GE":"Genève",
 "LU":"Luzern","VS":"Sion","TI":"Bellinzona","FR":"Fribourg","BL":"Liestal","TG":"Frauenfeld",
 "SO":"Solothurn","GR":"Chur","BS":"Basel","NE":"Neuchâtel","SZ":"Schwyz","ZG":"Zug",
 "SH":"Schaffhausen","JU":"Delémont","AR":"Herisau","NW":"Stans","GL":"Glarus","OW":"Sarnen",
 "UR":"Altdorf (UR)","AI":"Appenzell"}

print(f"{'Kt':3}{'typ':9}{'income':>8}{'taxbl':>9}{'API':>9}{'mein':>9}{'Δ%':>8}")
worst={}
for c,city in caps.items():
    tl=loc.get((c,city))
    t=get_tarif(c)
    if not tl or not t:
        print(c,"?? loc/tarif fehlt",tl,bool(t)); continue
    for inc in (60000,120000,250000):
        try:
            res=calc(tl,inc)
            xb=res["TaxableIncomeCanton"]; api=res["IncomeSimpleTaxCanton"]
            xf=math.floor(xb/100)*100
            mine=eval_tarif(t,xf)
            d=(mine-api)/api*100 if api else 0
            worst[c]=max(worst.get(c,0),abs(d))
            flag="" if abs(d)<1.0 else "  <-- ABWEICHUNG"
            print(f"{c:3}{t['tabellentyp']:9}{inc:>8}{xb:>9}{api:>9}{mine:>9.0f}{d:>7.2f}%{flag}")
            time.sleep(0.15)
        except Exception as ex:
            print(c,inc,"FEHLER",ex)
print("\nMax |Δ%| je Kanton:")
for c in caps:
    w=worst.get(c)
    print(f"  {c}: {w:.2f}%" if w is not None else f"  {c}: -")
