# -*- coding: utf-8 -*-
"""Fuehrt den Build der Netzwerkseite aus.

  erzeuge_netzwerk_json.py   Datenpaket 3.7.1 -> NGO/ausgabe/ngo-netzwerk.json
                             und Kopie nach assets/ngo/ngo-netzwerk.json

Das Skript rechnet dabei die Kennzahlen des AP29-Berichts nach und bricht ab,
wenn die Nachrechnung abweicht.

Die frueheren Schritte erzeuge_public_json.py und erzeuge_redaktion_json.py
gehoeren zum abgeloesten Fuehrungsnetz (100 Organisationen). Sie liegen weiter
im Ordner, werden aber von keiner Seite mehr geladen und deshalb hier nicht
mehr ausgefuehrt. Bei Bedarf einzeln aufrufen.

Aufruf:  python NGO/build/build_alles.py [--nur-pruefen]
"""

import os
import subprocess
import sys

HIER = os.path.dirname(os.path.abspath(__file__))


def schritt(skript, argumente):
    print("--- %s" % skript)
    ergebnis = subprocess.run([sys.executable, os.path.join(HIER, skript)] + argumente)
    if ergebnis.returncode != 0:
        sys.exit("Abbruch in %s" % skript)


def main():
    argumente = [a for a in sys.argv[1:] if a == "--nur-pruefen"]
    schritt("erzeuge_netzwerk_json.py", argumente)
    print("Fertig.")


if __name__ == "__main__":
    main()
