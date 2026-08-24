# -*- coding: utf-8 -*-
"""
Uebernimmt eine neue Datenlieferung aus NGO/lieferung/ nach NGO/data/.

Der Build liest ausschliesslich NGO/data/ und erwartet dort acht Dateien mit
festen Namen. Lieferungen kommen aber als ZIP, mit Unterordnern, mit
Versionsnummern im Dateinamen oder mit zusaetzlichen Dateien. Dieses Skript
sucht die acht Pflichtdateien irgendwo unterhalb von NGO/lieferung/ und legt
sie unter dem erwarteten Namen in NGO/data/ ab.

Ablauf:
    1. Lieferung nach NGO/lieferung/ entpacken oder kopieren, Struktur egal.
    2. python NGO/build/uebernimm_lieferung.py
       meldet, was gefunden wurde und was fehlt. Schreibt nichts.
    3. python NGO/build/uebernimm_lieferung.py --uebernehmen
       sichert das bisherige NGO/data/ nach NGO/data_vorher/ und kopiert.
    4. python NGO/build/erzeuge_netzwerk_json.py --nur-pruefen

Gefunden wird nach Dateiname, klein geschrieben, ohne Ruecksicht auf den
Ordner. Liegt dieselbe Datei mehrfach vor, aber inhaltsgleich — Lieferungen
packen sie gern in Wurzel- und data-Ordner zugleich —, gilt sie als eindeutig.
Unterscheiden sich die Fassungen, bricht das Skript ab: Welche gemeint ist,
darf nicht geraten werden.

ZIP-Dateien werden nicht selbst entpackt. Entpacken, dann aufrufen.

Aufruf:  python NGO/build/uebernimm_lieferung.py [--uebernehmen]
"""
import hashlib
import io
import os
import shutil
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LIEFERUNG = os.path.join(WURZEL, 'NGO', 'lieferung')
DATEN = os.path.join(WURZEL, 'NGO', 'data')
SICHERUNG = os.path.join(WURZEL, 'NGO', 'data_vorher')

# Die acht Dateien, die erzeuge_netzwerk_json.py liest. Reihenfolge wie dort.
PFLICHT = [
    'nodes_organisation.csv',
    'ngo_stammdaten.csv',
    'nodes_personen.csv',
    'web_edges.csv',
    'historical_edges.csv',
    'cluster_summary.csv',
    'cluster_export.csv',
    'sources.csv',
]

# Wird mitgenommen, wenn vorhanden, aber vom Build nicht gelesen.
KUER = ['ap31_specification.csv']


class Abbruch(Exception):
    pass


def pruefsumme(pfad):
    try:
        with open(pfad, 'rb') as datei:
            return hashlib.sha256(datei.read()).hexdigest()
    except (IOError, OSError):
        return None


def zeilen(pfad):
    """Datenzeilen ohne Kopfzeile — grobe Plausibilitaet, kein CSV-Parser."""
    try:
        with io.open(pfad, encoding='utf-8-sig', errors='replace') as datei:
            return max(0, sum(1 for _ in datei) - 1)
    except (IOError, OSError):
        return 0


def suche():
    """Sammelt je Pflichtdatei alle Fundstellen unterhalb von NGO/lieferung/."""
    funde = dict((name, []) for name in PFLICHT + KUER)
    fremde = []
    for ordner, _, dateien in os.walk(LIEFERUNG):
        for datei in dateien:
            klein = datei.lower()
            pfad = os.path.join(ordner, datei)
            if klein in funde:
                funde[klein].append(pfad)
            elif klein.endswith(('.csv', '.json', '.xlsx')):
                fremde.append(pfad)

    # Lieferungen enthalten dieselbe Datei oft zweimal, etwa im Wurzel- und im
    # data-Ordner des ZIP. Sind die Fassungen inhaltsgleich, ist das kein
    # Zweifelsfall — nur unterschiedliche Fassungen sind einer.
    for name in list(funde):
        treffer = funde[name]
        if len(treffer) < 2:
            continue
        gesehen, eindeutig = set(), []
        for pfad in sorted(treffer):
            summe = pruefsumme(pfad)
            if summe in gesehen:
                continue
            gesehen.add(summe)
            eindeutig.append(pfad)
        funde[name] = eindeutig

    return funde, fremde


def kurz(pfad):
    return os.path.relpath(pfad, LIEFERUNG).replace('\\', '/')


def bericht(funde, fremde):
    print('Lieferordner: ' + LIEFERUNG)
    print('')
    fehlend, doppelt = [], []
    for name in PFLICHT + KUER:
        treffer = funde[name]
        if not treffer:
            if name in KUER:
                print('  --      %-26s nicht geliefert, wird vom Build nicht gelesen' % name)
                continue
            fehlend.append(name)
            print('  FEHLT   %-26s' % name)
        elif len(treffer) > 1:
            doppelt.append(name)
            print('  MEHRFACH %-25s %d unterschiedliche Fassungen:' % (name, len(treffer)))
            for pfad in treffer:
                print('           %s' % kurz(pfad))
        else:
            print('  ok      %-26s %6d Zeilen   %s'
                  % (name, zeilen(treffer[0]), kurz(treffer[0])))

    if fremde:
        print('')
        print('  Nicht uebernommen (kein Pflichtname), bleibt liegen:')
        for pfad in sorted(fremde)[:12]:
            print('    %s' % kurz(pfad))
        if len(fremde) > 12:
            print('    ... und %d weitere' % (len(fremde) - 12))
    return fehlend, doppelt


def vergleiche(funde):
    """Zeigt, wie sich die Zeilenzahlen gegenueber dem aktuellen Stand aendern."""
    if not os.path.isdir(DATEN):
        return
    print('')
    print('Aenderung gegenueber dem aktuellen NGO/data/:')
    for name in PFLICHT + KUER:
        if len(funde[name]) != 1:
            continue
        alt_pfad = os.path.join(DATEN, name)
        if not os.path.exists(alt_pfad):
            print('  %-26s neu' % name)
            continue
        alt, neu = zeilen(alt_pfad), zeilen(funde[name][0])
        if alt == neu:
            print('  %-26s %6d  unveraendert' % (name, neu))
        else:
            print('  %-26s %6d  statt %d  (%+d)' % (name, neu, alt, neu - alt))


def uebernimm(funde):
    if os.path.isdir(DATEN):
        if os.path.isdir(SICHERUNG):
            shutil.rmtree(SICHERUNG)
        shutil.copytree(DATEN, SICHERUNG)
        print('')
        print('bisheriger Stand gesichert nach: NGO/data_vorher/')
    else:
        os.makedirs(DATEN)

    for name in PFLICHT + KUER:
        if not funde[name]:
            continue
        shutil.copyfile(funde[name][0], os.path.join(DATEN, name))
        print('  uebernommen: %s' % name)
    print('')
    print('Naechster Schritt:')
    print('  python NGO/build/erzeuge_netzwerk_json.py --nur-pruefen')


def main():
    uebernehmen = '--uebernehmen' in sys.argv

    if not os.path.isdir(LIEFERUNG):
        os.makedirs(LIEFERUNG)
        raise Abbruch('NGO/lieferung/ war nicht vorhanden und wurde angelegt. '
                      'Lieferung dorthin kopieren und erneut aufrufen.')

    funde, fremde = suche()
    fehlend, doppelt = bericht(funde, fremde)
    vergleiche(funde)

    if fehlend:
        raise Abbruch('%d Pflichtdatei(en) fehlen. Nichts uebernommen.' % len(fehlend))
    if doppelt:
        raise Abbruch('%d Dateiname(n) mehrfach vorhanden. Welche Fassung gilt, '
                      'muss die Lieferung entscheiden, nicht dieses Skript.' % len(doppelt))

    if not uebernehmen:
        print('')
        print('Alle acht Pflichtdateien vorhanden. Nichts geschrieben.')
        print('Uebernehmen mit:  python NGO/build/uebernimm_lieferung.py --uebernehmen')
        return

    uebernimm(funde)


if __name__ == '__main__':
    try:
        main()
    except Abbruch as fehler:
        print('')
        print('ABBRUCH: %s' % fehler)
        sys.exit(1)
