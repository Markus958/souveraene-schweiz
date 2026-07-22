# -*- coding: utf-8 -*-
"""VS einfache Einkommenssteuer als Stützwert-Tabellen, abgetastet aus amtlicher ESTV-Berechnung.
Vier Reihen: ledig/verheiratet x kantonal/kommunal (VS hat eigene kommunale Basis UND Verheiratetentarif)."""
import json, urllib.request, time, os
YEAR=int(os.environ.get("TAX_YEAR","2026"))
RAW=os.path.dirname(os.path.abspath(__file__))
BASE="https://swisstaxcalculator.estv.admin.ch/delegate/ost-integration/v1/lg-proxy/operation/c3b67379_ESTV"
def loadr(p):
    with open(os.path.join(RAW,p),encoding="utf-8") as f: return json.load(f)["response"]
rates=loadr(f"rates_{YEAR}.json")
TL={(e["Location"]["Canton"],e["Location"]["BfsName"]):e["Location"]["TaxLocationID"] for e in rates}["VS","Sion"]
def calc(net,rel):
    p={"TaxYear":YEAR,"TaxLocationID":TL,"Relationship":rel,"Confession1":5,"Confession2":5,"Children":[],
       "Age1":40,"Age2":40,"RevenueType1":2,"Revenue1":net,"RevenueType2":0,"Revenue2":0,"Fortune":0}
    req=urllib.request.Request(BASE+"/API_calculateDetailedTaxes",data=json.dumps(p).encode(),headers={"Content-Type":"application/json"})
    d=json.load(urllib.request.urlopen(req,timeout=60))["response"]
    # Effektive einfache Steuer = Steuerbetrag / (Steuerfuss/100): fuss-neutral, kantonsweit gültig,
    # enthält die VS-Verheiratetenentlastung (wird nach dem Tarif auf den Steuerbetrag angewandt).
    rk=d["TaxRates"]["IncomeRateCanton"]; rc=d["TaxRates"]["IncomeRateCity"]
    effK = d["IncomeTaxCanton"]/(rk/100) if rk else d["IncomeSimpleTaxCanton"]
    effC = d["IncomeTaxCity"]/(rc/100) if rc else d["IncomeSimpleTaxCity"]
    return d["TaxableIncomeCanton"], effK, effC
nets=list(range(6000,160000,3000))+list(range(160000,300000,8000))+list(range(300000,1000001,40000))
def sample(rel):
    pts={}
    for net in nets:
        tx,sk,sc=calc(net,rel); pts[tx]=(sk,sc); time.sleep(0.04)
    P=sorted(pts.items())
    if P[0][0]>0: P=[(0,(0,0))]+P
    return ([[int(x),round(v[0],2)] for x,v in P], [[int(x),round(v[1],2)] for x,v in P])
print("sample ledig..."); k_led,g_led=sample(1)
print("sample verheiratet..."); k_verh,g_verh=sample(2)
out={"jahr":YEAR,"quelle":BASE+"/API_calculateDetailedTaxes",
     "hinweis":"VS einfache Einkommenssteuer, abgetastet aus amtlicher ESTV-Berechnung. Eigene kommunale Basis und Verheiratetentarif.",
     "led":{"kanton":k_led,"gemeinde":g_led}, "verh":{"kanton":k_verh,"gemeinde":g_verh}}
json.dump(out,open(os.path.join(RAW,f"vs_lookup_{YEAR}.json"),"w",encoding="utf-8"),ensure_ascii=False)
print("vs_lookup.json:",len(k_led),"Punkte je Reihe (led+verh, kanton+gemeinde)")
# Schnell-Validierung verheiratet kantonal bei taxable 100000
def interp(P,x):
    if x<=P[0][0]: return P[0][1]
    for i in range(len(P)-1):
        if P[i][0]<=x<=P[i+1][0]:
            x0,y0=P[i]; x1,y1=P[i+1]; return y0+(y1-y0)*(x-x0)/(x1-x0) if x1>x0 else y0
    return P[-1][1]
tx,sk,sc=calc(104000,2)
print(f"Check verh taxable~{tx}: ESTV kanton {sk}, interp {interp(k_verh,tx):.0f}; ESTV gde {sc}, interp {interp(g_verh,tx):.0f}")
