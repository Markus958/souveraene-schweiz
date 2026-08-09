# -*- coding: utf-8 -*-
"""Einmalige Rekonstruktion der Datengrundlage fuer die Netzwerk-Vorschau.

Die Original-CSV (Netzwerk_personelle_Verflechtungen_Daten.csv) lag nicht im
Repository vor. Diese Datei erzeugt die Datengrundlage deshalb verlustfrei aus
der Personen-Tabelle der Referenzdatei
  assets/Projektarbeit NGO-Uebersicht Schweiz_files/saved_resource.html
und schreibt sie im vereinbarten Spaltenformat nach
  assets/data/netzwerk-verflechtungen.csv

Sobald die Original-CSV vorliegt, wird sie einfach an diese Stelle kopiert;
dieses Skript wird dann nicht mehr benoetigt.

Aufruf:  python scripts/netzwerk_csv_aus_referenz.py
"""

import csv
import html
import io
import os
import re

BASIS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QUELLE = os.path.join(
    BASIS, "assets", "Projektarbeit NGO-Übersicht Schweiz_files", "saved_resource.html"
)
ZIEL = os.path.join(BASIS, "assets", "data", "netzwerk-verflechtungen.csv")
DATENSTAND = "09.08.2026"

# "SAV (NGO-0058)" -> ("SAV", "NGO-0058")
ORG_MUSTER = re.compile(r"^(.*?)\s*\((NGO-\d+)\)$")


def lies_tabelle(pfad):
    roh = io.open(pfad, encoding="utf-8").read()
    tabelle = re.search(r"<table>.*?</table>", roh, re.S).group(0)
    zeilen = re.findall(r"<tr><td>(.*?)</td><td>(.*?)</td><td>(.*?)</td></tr>", tabelle, re.S)
    for person, organisationen, anzahl in zeilen:
        yield (
            html.unescape(person).strip(),
            html.unescape(organisationen),
            int(html.unescape(anzahl).strip()),
        )


def main():
    saetze = []
    for person, org_text, anzahl in lies_tabelle(QUELLE):
        eintraege = [t.strip() for t in org_text.split("·") if t.strip()]
        if len(eintraege) != anzahl:
            raise SystemExit(
                "Anzahl stimmt nicht mit den Organisationen ueberein: %s" % person
            )
        for eintrag in eintraege:
            treffer = ORG_MUSTER.match(eintrag)
            if not treffer:
                raise SystemExit("Unerwartetes Organisationsformat: %r" % eintrag)
            organisation, ngo_id = treffer.group(1).strip(), treffer.group(2)
            saetze.append([person, ngo_id, organisation, anzahl, DATENSTAND])

    os.makedirs(os.path.dirname(ZIEL), exist_ok=True)
    with io.open(ZIEL, "w", encoding="utf-8", newline="") as f:
        schreiber = csv.writer(f, delimiter=";")
        schreiber.writerow(
            ["Person", "NGO-ID", "Organisation", "Anzahl verbundener Organisationen", "Datenstand"]
        )
        schreiber.writerows(saetze)

    personen = {s[0] for s in saetze}
    organisationen = {s[1] for s in saetze}
    print("Geschrieben: %s" % ZIEL)
    print("%d Datenzeilen, %d Personen, %d Organisationen" % (len(saetze), len(personen), len(organisationen)))


if __name__ == "__main__":
    main()
