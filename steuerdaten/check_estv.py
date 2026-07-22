# -*- coding: utf-8 -*-
"""
ESTV-Datenwächter für den Steuerrechner.

Fragt die offene ESTV-API (swisstaxcalculator) ab und meldet, wenn sich gegenüber
dem ausgelieferten Datenstand etwas geändert hat:
  (a) rückwirkend geänderte Steuerfüsse/Tarife im aktuellen (ausgelieferten) Steuerjahr,
  (b) ein neueres Steuerjahr mit abweichenden Werten.

Schreibt/aktualisiert:
  - steuerdaten/estv-state.json : Vergleichsstand (Hashes), nicht öffentlich relevant
  - assets/estv-log.json        : kleines Log für die (passwortgeschützte) Statistik-Seite

Kein pip nötig (nur Standardbibliothek). Läuft in GitHub Actions (Python 3.11).
"""
import json, os, hashlib, urllib.request, datetime, sys

BASE = "https://swisstaxcalculator.estv.admin.ch/delegate/ost-integration/v1/lg-proxy/operation/c3b67379_ESTV"
URL_RATES  = BASE + "/API_exportManySimpleRates"   # Steuerfüsse (TaxGroupID 99)
URL_SCALES = BASE + "/API_exportManyTaxScales"     # Tarife (TaxGroupID 88)

HERE  = os.path.dirname(os.path.abspath(__file__))
ROOT  = os.path.dirname(HERE)
STATE = os.path.join(HERE, "estv-state.json")
LOG   = os.path.join(ROOT, "assets", "estv-log.json")

# Steuerjahr, das die ausgelieferten Datendateien (assets/data/…, data/…) abbilden.
# Beim Rebuild auf ein neues Jahr hier bzw. in estv-state.json anpassen.
DEFAULT_BASELINE_YEAR = 2026
PROBE_AHEAD = 2          # wie viele Folgejahre zusätzlich geprüft werden
MAX_LOG_ENTRIES = 60     # Log begrenzen
SAMPLE = 15              # max. Gemeinden in der Detail-Auflistung


def api(url, year, group):
    body = json.dumps({"TaxYear": year, "TaxGroupID": group}).encode()
    req = urllib.request.Request(url, data=body,
        headers={"Content-Type": "application/json", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode()).get("response", [])


def rates_map(year):
    """{(Kanton, Gemeinde): (KantonsFuss, GemeindeFuss, Kath, Ref)} für ein Steuerjahr."""
    out = {}
    for e in api(URL_RATES, year, 99):
        loc = e.get("Location", {})
        key = (loc.get("Canton"), loc.get("BfsName"))
        out[key] = (
            e.get("IncomeRateCanton"), e.get("IncomeRateCity"),
            e.get("IncomeRateRoman"), e.get("IncomeRateProtestant"),
        )
    return out


def digest(obj):
    return hashlib.sha256(
        json.dumps(obj, sort_keys=True, ensure_ascii=False, default=str).encode()
    ).hexdigest()


def scales_digest(year):
    data = api(URL_SCALES, year, 88)
    return digest(data)


def diff_rates(old, new):
    """Liefert (geänderte Gemeinden, neue Gemeinden, entfallene Gemeinden)."""
    changed = sorted(f"{k[0]}/{k[1]}" for k in old.keys() & new.keys() if old[k] != new[k])
    added   = sorted(f"{k[0]}/{k[1]}" for k in new.keys() - old.keys())
    removed = sorted(f"{k[0]}/{k[1]}" for k in old.keys() - new.keys())
    return changed, added, removed


def sample(lst):
    if len(lst) <= SAMPLE:
        return ", ".join(lst)
    return ", ".join(lst[:SAMPLE]) + f" … (+{len(lst) - SAMPLE} weitere)"


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def save(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def main():
    today = os.environ.get("ESTV_TODAY") or datetime.date.today().isoformat()
    state = load(STATE, {})
    log   = load(LOG, {"entries": []})
    baseline_year = state.get("baseline_year", DEFAULT_BASELINE_YEAR)

    findings = []   # Klartext-Meldungen für das Log
    kind = "ok"
    try:
        # (a) Aktuelles (ausgeliefertes) Jahr: rückwirkende Änderungen?
        cur = rates_map(baseline_year)
        cur_hash = digest({f"{k[0]}/{k[1]}": v for k, v in cur.items()})
        cur_scales = scales_digest(baseline_year)

        prev = state.get("baseline_rates")            # {gemeinde: [werte]} vom letzten Lauf
        if prev is not None:
            prev_map = {tuple(k.split("/", 1)): tuple(v) for k, v in prev.items()}
            changed, added, removed = diff_rates(prev_map,
                {k: tuple(v) for k, v in cur.items()})
            if changed or added or removed:
                kind = "geaendert"
                parts = []
                if changed: parts.append(f"{len(changed)} Gemeinde(n) mit geänderten Steuerfüssen ({sample(changed)})")
                if added:   parts.append(f"{len(added)} neue Gemeinde(n) ({sample(added)})")
                if removed: parts.append(f"{len(removed)} entfallene Gemeinde(n) ({sample(removed)})")
                findings.append(f"Steuerjahr {baseline_year}: " + "; ".join(parts) + ".")
        if state.get("baseline_scales") and state["baseline_scales"] != cur_scales:
            kind = "geaendert"
            findings.append(f"Steuerjahr {baseline_year}: Tarife (Tariffunktionen) haben sich geändert.")

        # (b) Neuere Steuerjahre mit abweichenden Werten?
        seen = state.get("seen_years", {})
        for y in range(baseline_year + 1, baseline_year + 1 + PROBE_AHEAD):
            ym = rates_map(y)
            yhash = digest({f"{k[0]}/{k[1]}": v for k, v in ym.items()})
            same_as_baseline = (yhash == cur_hash)
            already = seen.get(str(y))
            seen[str(y)] = yhash
            if same_as_baseline:
                continue  # nur fortgeschriebener Platzhalter (= identisch mit Basisjahr)
            if already == yhash:
                continue  # dieses abweichende Jahr wurde schon gemeldet, unverändert
            # echtes, abweichendes (und neu gesehenes bzw. verändertes) Jahr
            kind = "neue-daten"
            changed, added, removed = diff_rates(
                {k: tuple(v) for k, v in cur.items()},
                {k: tuple(v) for k, v in ym.items()})
            det = []
            if changed: det.append(f"{len(changed)} geänderte Steuerfüsse ({sample(changed)})")
            if added:   det.append(f"{len(added)} neue Gemeinde(n) ({sample(added)})")
            if removed: det.append(f"{len(removed)} entfallene Gemeinde(n) ({sample(removed)})")
            findings.append(
                f"Steuerjahr {y} verfügbar und weicht vom ausgelieferten Stand ({baseline_year}) ab: "
                + ("; ".join(det) if det else "abweichende Werte") + ".")

        state["baseline_year"]   = baseline_year
        state["baseline_rates"]  = {f"{k[0]}/{k[1]}": list(v) for k, v in cur.items()}
        state["baseline_scales"] = cur_scales
        state["seen_years"]      = seen
        state["last_run"]        = today

        text = " ".join(findings) if findings else f"Geprüft – keine Änderung (Stand {baseline_year})."
    except Exception as e:
        kind = "fehler"
        text = f"Prüfung fehlgeschlagen: {type(e).__name__}: {str(e)[:160]}"

    log["baseline_year"] = state.get("baseline_year", baseline_year)
    log["updated"] = today
    log["last_status"] = kind
    log["last_text"]   = text
    # Nur echte Ereignisse ins Log; „keine Änderung" aktualisiert nur das Prüfdatum.
    if kind != "ok":
        entry = {"date": today, "kind": kind, "text": text}
        log["entries"] = ([entry] + log.get("entries", []))[:MAX_LOG_ENTRIES]

    if kind != "fehler":
        save(STATE, state)
    save(LOG, log)
    print(f"[{kind}] {text}")


if __name__ == "__main__":
    main()
