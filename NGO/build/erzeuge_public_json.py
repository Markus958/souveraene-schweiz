# -*- coding: utf-8 -*-
"""Erzeugt aus der internen Flatfile eine veroeffentlichungsfaehige JSON.

  NGO/daten/NGO_Fuehrungsnetz_Flatfile.json   (intern, vollstaendig)
      -> NGO/ausgabe/ngo-fuehrungsnetz.json   (ohne interne Bereiche)

Entfernt werden:
  * reviewLog            (55 interne Pruefprotokolle)
  * researchNotes        (interne Recherchenotizen, internalOnly = true)
  * roles[].review       Freitext (result, newEvidence, note) — es bleibt
                         ausschliesslich der Pruefstatus erhalten
  * persons[].sourceName (interne Schreibweise aus der Rohliste)

Der Aufruf ist bewusst ein eigener Schritt: Was die Seite per fetch laedt,
kann jede Besucherin herunterladen. Ein Filtern erst im Browser verbirgt
nichts.

Aufruf:
  python NGO/build/erzeuge_public_json.py
  python NGO/build/erzeuge_public_json.py --nur-verifiziert   # offene Datensaetze weglassen
"""

import argparse
import io
import json
import os
import sys

BASIS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QUELLE = os.path.join(BASIS, "daten", "NGO_Fuehrungsnetz_Flatfile.json")
ZIEL = os.path.join(BASIS, "ausgabe", "ngo-fuehrungsnetz.json")

# Bereiche, die nie nach aussen gelangen duerfen.
INTERNE_BEREICHE = ("reviewLog", "researchNotes")
# Freitextfelder im Pruefblock einer Rolle: interne Recherche, nicht oeffentlich.
INTERNE_REVIEW_FELDER = ("result", "newEvidence", "note", "reviewId")

AKTUELLE_ZEITSTATUS = ("reported_current", "current_with_announced_change")


def lade(pfad):
    with io.open(pfad, encoding="utf-8") as f:
        return json.load(f)


def saeubere_rolle(rolle, nur_verifiziert):
    """Gibt die oeffentliche Fassung einer Rolle zurueck oder None."""
    if nur_verifiziert:
        if rolle.get("temporalStatus") not in AKTUELLE_ZEITSTATUS:
            return None
        if rolle.get("source", {}).get("verificationRequired"):
            return None
        if rolle.get("unresolvedPerson"):
            return None

    rein = dict(rolle)

    # Pruefblock auf den Status reduzieren.
    review = rein.get("review")
    if review:
        rein["review"] = {
            "status": review.get("status"),
            "reviewedAt": review.get("reviewedAt"),
        }
        for feld in INTERNE_REVIEW_FELDER:
            if feld in rein["review"]:
                del rein["review"][feld]
    return rein


def saeubere_person(person):
    rein = dict(person)
    rein.pop("sourceName", None)
    return rein


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--nur-verifiziert",
        action="store_true",
        help="nur aktuelle, verifizierte und aufgeloeste Rollen uebernehmen",
    )
    args = parser.parse_args()

    if not os.path.exists(QUELLE):
        sys.exit("Quelldatei fehlt: %s" % QUELLE)

    daten = lade(QUELLE)
    raus = {}

    for schluessel, wert in daten.items():
        if schluessel in INTERNE_BEREICHE:
            continue
        raus[schluessel] = wert

    raus["roles"] = [
        r for r in (saeubere_rolle(x, args.nur_verifiziert) for x in daten["roles"]) if r
    ]
    raus["persons"] = [saeubere_person(p) for p in daten["persons"]]

    if args.nur_verifiziert:
        erlaubt = {r["id"] for r in raus["roles"]}
        raus["graph"] = dict(raus["graph"])
        raus["graph"]["edges"] = [e for e in raus["graph"]["edges"] if e["id"] in erlaubt]

    raus["metadata"] = dict(raus["metadata"])
    raus["metadata"]["publicBuild"] = {
        "erzeugtAus": os.path.basename(QUELLE),
        "entfernt": [
            "interne Pruefprotokolle",
            "interne Recherchenotizen",
            "Freitext im Pruefblock der Rollen",
            "interne Schreibweise der Personennamen",
        ],
        "nurVerifizierte": bool(args.nur_verifiziert),
    }

    os.makedirs(os.path.dirname(ZIEL), exist_ok=True)
    with io.open(ZIEL, "w", encoding="utf-8", newline="\n") as f:
        json.dump(raus, f, ensure_ascii=False, separators=(",", ":"))

    pruefe(ZIEL)

    print("Geschrieben: %s" % ZIEL)
    print("  %d Organisationen, %d Personen, %d Rollen, %d Kanten"
          % (len(raus["organisations"]), len(raus["persons"]),
             len(raus["roles"]), len(raus["graph"]["edges"])))
    print("  %d aktuelle Organisationsbruecken, %d aus dem Altbestand"
          % (len(raus["graph"]["organisationBridges"]),
             len(raus["graph"]["legacyOrganisationBridges"])))
    print("  Groesse: %.1f KB (intern: %.1f KB)"
          % (os.path.getsize(ZIEL) / 1024.0, os.path.getsize(QUELLE) / 1024.0))


def pruefe(pfad):
    """Sicherheitsnetz: bricht ab, wenn interne Spuren in der Ausgabe stecken.

    Geprueft wird die Struktur (Schluessel) und zusaetzlich der Rohtext auf
    Inhaltsmarker, die ausschliesslich in internen Feldern vorkommen.
    """
    daten = lade(pfad)

    for bereich in INTERNE_BEREICHE:
        if bereich in daten:
            sys.exit("ABBRUCH: interner Bereich in der Ausgabe: %s" % bereich)

    for rolle in daten.get("roles", []):
        review = rolle.get("review")
        if not review:
            continue
        uebrig = set(review) - {"status", "reviewedAt"}
        if uebrig:
            sys.exit("ABBRUCH: Pruefblock enthaelt Freitext: %s" % ", ".join(sorted(uebrig)))

    for person in daten.get("persons", []):
        if "sourceName" in person:
            sys.exit("ABBRUCH: persons[].sourceName ist noch enthalten")

    text = io.open(pfad, encoding="utf-8").read()
    marker = ["newEvidence", "internalOnly", "Prüfergebnis", "Prüfgrund", "Empfohlene Prüfung"]
    treffer = [w for w in marker if w in text]
    if treffer:
        sys.exit("ABBRUCH: interne Inhalte in der Ausgabe gefunden: %s" % ", ".join(treffer))


if __name__ == "__main__":
    main()
