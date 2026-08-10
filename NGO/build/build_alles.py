# -*- coding: utf-8 -*-
"""Fuehrt beide Build-Schritte aus und legt das Ergebnis in assets/ngo/ ab.

  1. erzeuge_public_json.py     interne Flatfile  -> ngo-fuehrungsnetz.json
  2. erzeuge_redaktion_json.py  Bemerkungen       -> ngo-redaktion.json
  3. Kopie nach ../assets/ngo/  (nur diese Dateien werden veroeffentlicht)

Aufruf:  python NGO/build/build_alles.py [--nur-verifiziert]
"""

import os
import shutil
import subprocess
import sys

HIER = os.path.dirname(os.path.abspath(__file__))
NGO = os.path.dirname(HIER)
REPO = os.path.dirname(NGO)
AUSGABE = os.path.join(NGO, "ausgabe")
ZIEL = os.path.join(REPO, "assets", "ngo")

DATEIEN = ("ngo-fuehrungsnetz.json", "ngo-redaktion.json")


def schritt(skript, argumente):
    print("--- %s" % skript)
    ergebnis = subprocess.run([sys.executable, os.path.join(HIER, skript)] + argumente)
    if ergebnis.returncode != 0:
        sys.exit("Abbruch in %s" % skript)


def main():
    argumente = [a for a in sys.argv[1:] if a == "--nur-verifiziert"]
    schritt("erzeuge_public_json.py", argumente)
    schritt("erzeuge_redaktion_json.py", [])

    os.makedirs(ZIEL, exist_ok=True)
    print("--- Kopie nach assets/ngo/")
    for name in DATEIEN:
        quelle = os.path.join(AUSGABE, name)
        if not os.path.exists(quelle):
            sys.exit("Fehlt: %s" % quelle)
        shutil.copyfile(quelle, os.path.join(ZIEL, name))
        print("  %-26s %.1f KB" % (name, os.path.getsize(quelle) / 1024.0))
    print("Fertig.")


if __name__ == "__main__":
    main()
