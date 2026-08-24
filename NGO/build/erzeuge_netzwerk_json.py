# -*- coding: utf-8 -*-
"""
Erzeugt aus dem Web-Update 3.7.51 die veroeffentlichungsfaehige JSON fuer die
Netzwerkseite.

Quellen (alle in NGO/data/, nicht versioniert):
    nodes_organisation.csv    2852 Masterorganisationen, mit cluster_id
    nodes_personen.csv        3127 aktuelle Personenknoten
    web_edges.csv             6779 aktuelle Beziehungen Organisation -> Person
    historical_edges.csv      97 fruehere Beziehungen, strikt getrennt
    cluster_export.csv        Organisation -> Cluster; zusammengesetzte Datei,
                              siehe lies_cluster_export()
    cluster_summary.csv       Cluster 0 bis 63 mit Bezeichnung
    sources.csv               Quellenregister
    ngo_stammdaten.csv        vollstaendige Organisationsprofile

Ergebnis:
    NGO/ausgabe/ngo-netzwerk.json  und Kopie nach assets/ngo/ngo-netzwerk.json

Der Build prueft die Abnahmepunkte der Uebergabespezifikation 3.7.51 und
bricht ab, ohne zu schreiben, sobald einer verletzt ist.

Aufruf:  python NGO/build/erzeuge_netzwerk_json.py [--nur-pruefen]
"""
import collections
import csv
import datetime
import io
import itertools
import json
import os
import re
import sys
import unicodedata

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATEN = os.path.join(WURZEL, 'NGO', 'data')
PAKETDOKU = os.path.join(WURZEL, 'NGO', 'doku', 'paket-3.7.51')
AUSGABE = os.path.join(WURZEL, 'NGO', 'ausgabe')
ZIEL = os.path.join(WURZEL, 'assets', 'ngo')

G3_KLASSEN = ('N1', 'N2', 'N3')
G2_KLASSEN = ('N1', 'N2', 'N3', 'N4')

KLASSEN_TEXT = {
    'N1': 'N1 — Organ- oder Leitungsfunktion',
    'N2': 'N2 — Mitgliedschaft oder Gremium',
    'N3': 'N3 — Allianz oder Dachverband',
    'N4': 'N4 — weitere erfasste Beziehung',
}

# Das Rollengewicht haengt im Paket eindeutig an der Beziehungsklasse.
GEWICHT_JE_KLASSE = {'N1': 4, 'N2': 3, 'N3': 2, 'N4': 1}

# NGO-0172 existiert im Master nicht, NGO-0372 ist pensioniert und wird nicht
# wiederverwendet. Beide duerfen nie entstehen.
VERBOTENE_IDS = ('NGO-0172', 'NGO-0372')

# Sollwerte der Lieferung 3.7.51. Sie stehen in UPDATE_HINWEIS.txt und der
# Uebergabespezifikation, nicht in den CSV — deshalb hier als Konstanten.
SOLL = {
    'organisationen': 2852,
    'kanten': 6779,
    'historie': 97,
    'personen': 3127,
    'cluster': 64,          # 63 nichttriviale plus Cluster 0
}

# Projektionszahlen, die das Paket nennt. Der Build rechnet sie selbst nach und
# meldet jede Abweichung; er uebernimmt sie nicht.
PAKET_PROJEKTION = {
    'g2Kanten': 22160, 'g2Isolate': 489,
    'g3Kanten': 13123, 'g3Isolate': 892,
}

# Spalten der Stammdaten, die in die veroeffentlichte JSON gehen.
# Bewusst nicht uebernommen: Einflussscore und Abhaengigkeitsscore, weil
# Strukturmetriken laut Auftrag nicht als Einfluss gelesen werden duerfen,
# sowie «Haltung Schweiz–EU» als politische Zuschreibung ohne Auftrag.
STAMMDATEN_FELDER = [
    ('rechtsform', 'Rechtsform'),
    ('uid', 'Register-/UID-Nr.'),
    ('gruendung', 'Gründungsjahr'),
    ('zweck', 'Zweck Kurzfassung'),
    ('taetigkeit', 'Tätigkeitsgebiet'),
    ('reichweite', 'Geografische Reichweite'),
    ('mitglieder', 'Mitgliederzahl'),
    ('vollzeitstellen', 'Mitarbeitende FTE'),
    ('zewo', 'ZEWO-zertifiziert'),
    ('berichtsjahr', 'Berichtsjahr aktuell'),
    ('profilstatus', 'Profilstatus'),
]


class Abbruch(Exception):
    """Die Abnahme ist verletzt — es wird nichts geschrieben."""


def lies_csv(name):
    pfad = os.path.join(DATEN, name)
    if not os.path.exists(pfad):
        raise Abbruch('Quelldatei fehlt: ' + pfad)
    with io.open(pfad, encoding='utf-8-sig', newline='') as datei:
        return list(csv.DictReader(datei))


def lies_cluster_export():
    """
    cluster_export.csv ist seit 3.7.51 keine einfache Tabelle mehr, sondern
    eine zusammengesetzte Datei: sechs Zeilen Metadaten, dann eine Kopfzeile,
    ab der zwei Tabellen nebeneinander stehen. Links, in den Spalten 0 bis 10,
    die Clusterzusammenfassung; rechts, in den Spalten 12 und 13, die
    Zuordnung Organisation -> Cluster ueber alle Organisationen.

    Ein DictReader kann das nicht lesen: Er wuerde die Metadatenzeile als
    Kopfzeile nehmen und die rechte Tabelle in dieselben Felder mischen.

    Rueckgabe: (zusammenfassung, zuordnung)
        zusammenfassung  Liste von Dicts wie in cluster_summary.csv
        zuordnung        {org_id: cluster_id}
    """
    pfad = os.path.join(DATEN, 'cluster_export.csv')
    if not os.path.exists(pfad):
        raise Abbruch('Quelldatei fehlt: ' + pfad)
    with io.open(pfad, encoding='utf-8-sig', newline='') as datei:
        zeilen = list(csv.reader(datei))

    kopf_nr = None
    for nr, zeile in enumerate(zeilen):
        if zeile and text(zeile[0]) == 'Cluster-ID':
            kopf_nr = nr
            break
    if kopf_nr is None:
        raise Abbruch('cluster_export.csv: keine Kopfzeile mit «Cluster-ID» gefunden')

    kopf = [text(z) for z in zeilen[kopf_nr]]
    try:
        spalte_org = kopf.index('org_id')
        spalte_cluster = kopf.index('cluster_id')
    except ValueError:
        raise Abbruch('cluster_export.csv: Spalten org_id/cluster_id fehlen in der Kopfzeile')

    # Die Zusammenfassung endet, wo die linke Tabelle keine Cluster-ID mehr hat.
    zusammenfassung, zuordnung = [], collections.OrderedDict()
    for zeile in zeilen[kopf_nr + 1:]:
        links = text(zeile[0]) if zeile else ''
        if links:
            eintrag = {}
            for i, name in enumerate(kopf[:spalte_org]):
                if name:
                    eintrag[name] = zeile[i] if i < len(zeile) else ''
            zusammenfassung.append(eintrag)
        if len(zeile) > spalte_cluster:
            org = text(zeile[spalte_org])
            if org:
                zuordnung[org] = text(zeile[spalte_cluster])

    return zusammenfassung, zuordnung


def text(wert):
    return (wert or '').strip()


def zahl(wert, standard=0):
    try:
        return int(float(wert))
    except (TypeError, ValueError):
        return standard


def teile_ids(wert):
    """Quellenlisten sind mit Pipe getrennt; Strichpunkt wird mitgelesen."""
    return [t.strip() for t in re.split(r'[|;]', wert or '') if t.strip()]


# ---------------------------------------------------------------- Datum -----

EXCEL_EPOCHE = datetime.date(1899, 12, 30)


def datum_text(wert):
    """Die Quellendatei mischt Excel-Serienzahlen, deutsche Daten, Monat.Jahr,
    Jahre und Spannen. Alles wird lesbar gemacht, Unbekanntes bleibt stehen."""
    s = text(wert)
    if not s:
        return ''
    if re.match(r'^\d{1,2}\.\d{1,2}\.\d{4}$', s):
        tag, monat, jahr = s.split('.')
        return '%02d.%02d.%s' % (int(tag), int(monat), jahr)
    try:
        z = float(s)
    except ValueError:
        return s
    if z >= 20000:
        return (EXCEL_EPOCHE + datetime.timedelta(days=int(z))).strftime('%d.%m.%Y')
    if 1800 <= z <= 2100 and float(int(z)) == z:
        return str(int(z))
    if re.match(r'^\d{1,2}\.\d{4}$', s):
        monat, jahr = s.split('.')
        return '%02d.%s' % (int(monat), jahr)
    return s


# --------------------------------------------------------- Kanonisierung ----

def canonical_person_key(name):
    """Unicode normalisieren, klein schreiben, Interpunktion als Trenner,
    Whitespace normalisieren, Tokens sortieren. Kein Fuzzy-Matching:
    zusammengefuehrt wird nur bei identischer Tokenliste."""
    s = unicodedata.normalize('NFKC', name or '').lower()
    s = re.sub(r'[^\w\s]|_', ' ', s, flags=re.UNICODE)
    return ' '.join(sorted(t for t in s.split() if t))


def baue_personen(rohpersonen):
    gruppen = collections.OrderedDict()
    for p in rohpersonen:
        gruppen.setdefault(canonical_person_key(p['display_name']), []).append(p)

    personen = collections.OrderedDict()
    zusammenfuehrungen = []
    for schluessel, mitglieder in gruppen.items():
        anzeigen = []
        for m in mitglieder:
            if m['display_name'] not in anzeigen:
                anzeigen.append(m['display_name'])
        parteien = []
        for m in mitglieder:
            for label in text(m.get('party_labels')).split(';'):
                label = label.strip()
                if label and label not in parteien:
                    parteien.append(label)
        personen[schluessel] = {
            'k': schluessel, 'n': anzeigen[0], 'varianten': anzeigen,
            'rohIds': [m['person_id'] for m in mitglieder], 'parteien': parteien,
        }
        if len(mitglieder) > 1:
            zusammenfuehrungen.append({
                'schluessel': schluessel, 'varianten': anzeigen,
                'rohIds': [m['person_id'] for m in mitglieder],
            })
    return personen, zusammenfuehrungen


# ------------------------------------------------------------ Projektion ----

def projiziere(kanten, klassen, org_ids):
    """Organisationsprojektion: gemeinsame Personen zaehlen je Person und
    Organisation mit dem hoechsten Rollengewicht, das Kantengewicht ist
    konservativ das kleinere der beiden. Direkte Master-zu-Master-Beziehungen
    kommen hinzu und bleiben als solche gekennzeichnet."""
    gewaehlt = [k for k in kanten if k['klasse'] in klassen]

    pro_person = collections.defaultdict(dict)
    for k in gewaehlt:
        vorher = pro_person[k['person']].get(k['org'], 0)
        if k['gewicht'] > vorher:
            pro_person[k['person']][k['org']] = k['gewicht']

    paare = {}

    def eintrag(a, b):
        s = (a, b) if a < b else (b, a)
        if s not in paare:
            paare[s] = {'a': s[0], 'b': s[1], 'gewicht': 0, 'personen': [],
                        'direkt': False, 'ueberPersonen': False}
        return paare[s]

    bruecken = collections.defaultdict(set)
    for person, orgmap in pro_person.items():
        if len(orgmap) > 1:
            for org in orgmap:
                bruecken[org].add(person)
        for a, b in itertools.combinations(sorted(orgmap), 2):
            v = eintrag(a, b)
            v['gewicht'] += min(orgmap[a], orgmap[b])
            v['ueberPersonen'] = True
            if person not in v['personen']:
                v['personen'].append(person)

    direkte = collections.defaultdict(list)
    for k in gewaehlt:
        gegen = k['gegenpartId']
        if gegen and gegen != k['org'] and gegen in org_ids:
            s = (k['org'], gegen) if k['org'] < gegen else (gegen, k['org'])
            direkte[s].append(k['gewicht'])
    for s, gewichte in direkte.items():
        v = eintrag(*s)
        v['gewicht'] += sum(gewichte)
        v['direkt'] = True

    for v in paare.values():
        v['personen'].sort()
    return paare, bruecken


# --------------------------------------------------------------- Quellen ----

def lies_quellen():
    """Quellenregister. Reference-only-Eintraege ohne URL bleiben erhalten,
    damit die Datenluecke sichtbar wird statt zu verschwinden."""
    quellen = collections.OrderedDict()
    for z in lies_csv('sources.csv'):
        kennung = text(z['Quellen-ID'])
        if not kennung:
            continue
        quellen[kennung] = {
            'id': kennung,
            'orgId': text(z['NGO-ID']),
            'herausgeber': text(z['Herausgeber/Autor']),
            'titel': text(z['Titel']),
            'typ': text(z['Quellentyp']),
            'rang': text(z['Quellenrang']),
            'guete': text(z['Qualitätsstufe']),
            'eignung': text(z['Eignung']),
            'dokumentNr': text(z['Dokument-/Geschäftsnummer']),
            'datum': datum_text(z['Dokumentdatum']),
            'jahr': datum_text(z['Berichtsjahr']),
            'abschnitt': text(z['Seite/Ziffer/Abschnitt']),
            'url': text(z['URL']),
            'abgerufen': datum_text(z['Abrufdatum']),
            'archiv': text(z['Archivpfad/Dateiname']),
            'pruefstatus': text(z['Prüfstatus']),
        }
        # Reference-only: Kennung vorhanden, aber keine Registerzeile. Die
        # Luecke wird ausgewiesen, statt Herausgeber oder Titel zu erfinden.
        if not quellen[kennung]['herausgeber'] and not quellen[kennung]['titel']:
            quellen[kennung]['luecke'] = True
    return quellen


# -------------------------------------------------------------- Einlesen ----

def lies_datenpaket():
    org_zeilen = lies_csv('nodes_organisation.csv')
    personen_zeilen = lies_csv('nodes_personen.csv')
    kanten_zeilen = lies_csv('web_edges.csv')
    historie_zeilen = lies_csv('historical_edges.csv')
    cluster_zeilen = lies_csv('cluster_summary.csv')
    export_zusammenfassung, export_zuordnung = lies_cluster_export()
    stammdaten_zeilen = lies_csv('ngo_stammdaten.csv')

    # cluster_summary.csv und die linke Tabelle in cluster_export.csv sind
    # dieselbe Zusammenfassung. Weicht die Zahl der Zeilen ab, stimmt in der
    # Lieferung etwas nicht — dann lieber abbrechen als raten.
    if len(export_zusammenfassung) != len(cluster_zeilen):
        raise Abbruch('cluster_summary.csv hat %d Cluster, cluster_export.csv %d'
                      % (len(cluster_zeilen), len(export_zusammenfassung)))

    stammdaten = {}
    for s in stammdaten_zeilen:
        stammdaten[text(s['NGO-ID'])] = s

    # Die Lieferung endet mit einer leeren Zeile. Sie wuerde als Organisation
    # ohne Kennung durchgehen und alle Zaehlungen um eins verschieben.
    org_zeilen = [o for o in org_zeilen if text(o.get('org_id'))]
    personen_zeilen = [z for z in personen_zeilen if text(z.get('person_id'))]
    kanten_zeilen = [z for z in kanten_zeilen if text(z.get('edge_id'))]

    organisationen = collections.OrderedDict()
    for o in org_zeilen:
        org_id = text(o['org_id'])
        eintrag = {
            'id': org_id,
            'name': text(o['name']),
            'kurz': text(o['short_name']) or text(o['name']),
            'obergruppe': text(o['obergruppe']) or 'ohne Zuordnung',
            'hauptkategorie': text(o['hauptkategorie']),
            'organisationstyp': text(o['organisationstyp']),
            'sitz': text(o['sitz']),
            'kanton': text(o['kanton']),
            'website': text(o['website']),
            'datenstand': datum_text(o['datenstand']),
            'cluster': zahl(o['cluster_id']),
            'abdeckungsluecke': text(o['coverage_flag']) != 'ok',
        }
        stamm = stammdaten.get(org_id, {})
        for schluessel, spalte in STAMMDATEN_FELDER:
            wert = text(stamm.get(spalte))
            if wert:
                eintrag[schluessel] = datum_text(wert) if schluessel == 'gruendung' else wert
        organisationen[org_id] = eintrag

    personen, zusammenfuehrungen = baue_personen(personen_zeilen)
    kanon_von_roh = {}
    for schluessel, person in personen.items():
        for roh in person['rohIds']:
            kanon_von_roh[roh] = schluessel

    def baue_kante(z, historisch=False):
        roh = text(z.get('target_person_id') or '')
        anzeige = text(z.get('person_display') or z.get('person') or '')
        kanon = kanon_von_roh.get(roh) or canonical_person_key(anzeige)
        return {
            'id': text(z.get('edge_id')),
            'org': text(z.get('source_org_id') or z.get('org_id')),
            'person': kanon,
            'rohPerson': roh,
            'anzeige': anzeige,
            'rolle': text(z.get('role') or z.get('rolle')),
            'klasse': text(z.get('relation_class')),
            'gewicht': zahl(z.get('weight')),
            'amt': text(z.get('political_function') or z.get('politische_funktion')),
            'partei': text(z.get('party_label') or z.get('partei')),
            'behoerde': text(z.get('authority_commission')),
            'dachverband': text(z.get('umbrella_alliance')),
            'gegenpart': text(z.get('counterparty_org') or z.get('counterparty')),
            'gegenpartId': text(z.get('counterparty_master_id')),
            'quellen': teile_ids(z.get('source_ids_all') or z.get('source_id')),
            'quellenGuete': text(z.get('source_quality')),
            'status': text(z.get('data_status')),
            'historisch': historisch,
            'von': text(z.get('von')),
            'bis': text(z.get('bis')),
            'verbindungstyp': text(z.get('verbindungstyp')),
            'bemerkung': text(z.get('bemerkung')),
        }

    kanten = [baue_kante(z) for z in kanten_zeilen]
    historie = [baue_kante(z, True) for z in historie_zeilen]

    # Abnahmekriterium der Spezifikation: Jede sichtbare Verbindung muss auf
    # eine source_id zurueckfuehrbar sein. Kanten ganz ohne Quellenangabe
    # erfuellen das nicht und werden deshalb nicht gezeichnet. Sie
    # verschwinden aber nicht stillschweigend, sondern stehen in der Abnahme
    # und als Zahl in der Seite.
    ohne_beleg = [k for k in kanten if not k['quellen']]
    ohne_beleg_hist = [k for k in historie if not k['quellen']]
    kanten = [k for k in kanten if k['quellen']]
    historie = [k for k in historie if k['quellen']]

    # Fruehere Beziehungen fuehren Personen, die im aktuellen Knotensatz nicht
    # mehr vorkommen. Sie werden als eigene Gruppe ergaenzt, damit die Historie
    # nicht ins Leere zeigt; sie zaehlen nicht zu den 3192 Rohpersonen.
    for k in historie:
        if k['person'] and k['person'] not in personen:
            personen[k['person']] = {
                'k': k['person'], 'n': k['anzeige'], 'varianten': [k['anzeige']],
                'rohIds': [], 'parteien': [p for p in [k['partei']] if p],
                'nurHistorie': True,
            }

    cluster = collections.OrderedDict()
    for c in cluster_zeilen:
        kennung = zahl(c['Cluster-ID'], -1)
        if kennung < 0:
            continue
        cluster[kennung] = {
            'id': kennung,
            'label': text(c['Deskriptives Clusterlabel']),
            'groesse': zahl(c['Grösse']),
            'gemeinnuetzig': zahl(c['Gemeinnützig']),
            'wirtschaft': zahl(c['Wirtschaft']),
            'politisch': zahl(c['Politisch']),
            'interneKanten': zahl(c['interne Kanten']),
            'internesGewicht': zahl(c['internes Gewicht']),
            'zentrale': text(c['zentrale Organisationen']),
        }

    # Bis 3.7.49 standen G2-Grad, G2-Gewicht und Isolat-Flag in
    # cluster_export.csv. Seit 3.7.51 fuehrt sie nodes_organisation.csv.
    paketwerte = {}
    for o in org_zeilen:
        org_id = text(o['org_id'])
        if not org_id:
            continue
        paketwerte[org_id] = {
            'g2Gewicht': zahl(o.get('g2_weight')),
            'g3Kanten': zahl(o.get('g3_core_edges')),
            'isolat': text(o.get('coverage_flag')) != 'ok',
        }

    # Die Clusterzuordnung steht in zwei Dateien. Sie muessen uebereinstimmen.
    abweichend = []
    for org_id, eintrag in organisationen.items():
        aus_export = zahl(export_zuordnung.get(org_id, ''), -1)
        if aus_export >= 0 and aus_export != eintrag['cluster']:
            abweichend.append('%s: nodes %s, export %s'
                              % (org_id, eintrag['cluster'], aus_export))
    if abweichend:
        raise Abbruch('Clusterzuordnung weicht zwischen nodes_organisation.csv und '
                      'cluster_export.csv ab, %d Faelle, erster: %s'
                      % (len(abweichend), abweichend[0]))

    ausgeschlossen = {
        'ohneBeleg': [k['id'] for k in ohne_beleg],
        'ohneBelegHistorie': [k['id'] for k in ohne_beleg_hist],
        'organisationen': sorted(set(k['org'] for k in ohne_beleg)),
    }
    return (organisationen, personen, kanten, historie, cluster, paketwerte,
            zusammenfuehrungen, ausgeschlossen)


# -------------------------------------------------------------- Abnahme -----

def abnahme(organisationen, personen, kanten, historie, cluster, paketwerte,
            zusammenfuehrungen, quellen, g2_paare, g3_paare, bruecken_g2,
            ausgeschlossen):
    zeilen = []
    fehler = []

    def pruefe(titel, ist, soll):
        ok = ist == soll
        zeilen.append('  %-52s %-10s %s' % (titel, ist, 'ok' if ok else 'ABWEICHUNG, soll ' + str(soll)))
        if not ok:
            fehler.append('%s: ist %s, soll %s' % (titel, ist, soll))

    zeilen.append('Abnahme nach Uebergabespezifikation 3.7.51')
    pruefe('Organisationsknoten', len(organisationen), SOLL['organisationen'])

    verboten = [i for i in VERBOTENE_IDS if i in organisationen]
    for k in kanten + historie:
        for i in VERBOTENE_IDS:
            if k['org'] == i or k['gegenpartId'] == i:
                verboten.append(i + ' in Kante ' + k['id'])
    pruefe('gesperrte Kennungen (%s)' % ', '.join(VERBOTENE_IDS), len(verboten), 0)
    for v in verboten[:5]:
        zeilen.append('      ' + v)

    ohne_beleg = len(ausgeschlossen['ohneBeleg'])
    pruefe('aktuelle Kanten', len(kanten) + ohne_beleg, SOLL['kanten'])
    if ohne_beleg:
        zeilen.append('      davon %d ohne jede Quellenangabe, deshalb nicht im Netz:'
                      % ohne_beleg)
        zeilen.append('      %s' % ', '.join(ausgeschlossen['ohneBeleg'][:6])
                      + (' …' if ohne_beleg > 6 else ''))
        zeilen.append('      betroffene Organisationen: %s'
                      % ', '.join(ausgeschlossen['organisationen'][:8]))
    pruefe('fruehere Beziehungen', len(historie), SOLL['historie'])
    pruefe('Personenknoten (roh)', sum(len(p['rohIds']) for p in personen.values()),
           SOLL['personen'])
    nur_historie = [p for p in personen.values() if p.get('nurHistorie')]

    ohne_org = [k['id'] for k in kanten + historie if k['org'] not in organisationen]
    pruefe('Kanten auf unbekannte Organisation', len(ohne_org), 0)
    for o in ohne_org[:5]:
        zeilen.append('      ' + o)

    ohne_person = [k['id'] for k in kanten if not k['person']]
    pruefe('Kanten ohne aufloesbare Person', len(ohne_person), 0)

    ohne_cluster = [o['id'] for o in organisationen.values()
                    if o['cluster'] and o['cluster'] not in cluster]
    pruefe('Clusterzuordnungen ohne Beschreibung', len(ohne_cluster), 0)
    pruefe('Cluster inklusive Cluster 0', len(cluster), SOLL['cluster'])

    verwendet = set()
    for k in kanten + historie:
        verwendet.update(k['quellen'])
    fehlende = sorted(verwendet - set(quellen))
    zeilen.append('  %-52s %-10s %s'
                  % ('Quellenkennungen ohne Registereintrag', len(fehlende),
                     'ok' if not fehlende else 'Luecke der Lieferung'))
    if fehlende:
        zeilen.append('      Die Kante bleibt auf ihre source_id zurueckfuehrbar,')
        zeilen.append('      der Registereintrag mit Herausgeber und Titel fehlt.')
        zeilen.append('      %s' % ', '.join(fehlende[:6])
                      + (' …' if len(fehlende) > 6 else ''))

    g3 = [k for k in kanten if k['klasse'] in G3_KLASSEN]
    pruefe('N4-Kanten in der Standardansicht', len([k for k in g3 if k['klasse'] == 'N4']), 0)

    unvollstaendig = [k['id'] for k in kanten
                      if not k['org'] or not k['rohPerson'] or not k['klasse']]
    pruefe('Kanten ohne Pflichtangabe', len(unvollstaendig), 0)

    # --- Zahlen, die auf der Seite stehen ---
    zeilen.append('')
    zeilen.append('Kennzahlen dieses Stands')
    luecken = [o for o in organisationen.values() if o['abdeckungsluecke']]
    zeilen.append('  %d Organisationen, davon %d ohne erfasste Beziehung (Abdeckungsluecke)'
                  % (len(organisationen), len(luecken)))
    zeilen.append('  %d Rohpersonen -> %d kanonische Personen, %d Variantengruppen'
                  % (sum(len(p['rohIds']) for p in personen.values()),
                     len(personen) - len(nur_historie), len(zusammenfuehrungen)))
    zeilen.append('  %d Personen kommen nur in fruehreren Beziehungen vor' % len(nur_historie))
    zeilen.append('  Kanten je Klasse: ' + ', '.join(
        '%s %d' % (kl, len([k for k in kanten if k['klasse'] == kl])) for kl in G2_KLASSEN))
    zeilen.append('  G3-Kanten %d, G2-Kanten %d' % (len(g3), len(kanten)))
    zeilen.append('  Quellen im Register %d, davon verwendet %d, ohne URL %d'
                  % (len(quellen), len(verwendet),
                     len([q for q in quellen.values() if not q['url']])))
    zeilen.append('  Projektionskanten G3 %d, G2 %d' % (len(g3_paare), len(g2_paare)))

    # --- Abweichung zu den Projektionszahlen des Pakets ---
    verbunden = set()
    for a, b in g2_paare:
        verbunden.add(a)
        verbunden.add(b)
    eigene_isolate = len(organisationen) - len(verbunden)
    verbunden_g3 = set()
    for a, b in g3_paare:
        verbunden_g3.add(a)
        verbunden_g3.add(b)
    eigene_isolate_g3 = len(organisationen) - len(verbunden_g3)
    flag_isolate = len([o for o in organisationen.values() if o['abdeckungsluecke']])

    zeilen.append('')
    zeilen.append('Abgleich mit den Projektionszahlen des Pakets')
    zeilen.append('  G2-Kanten:   eigene Rechnung %6d, Paket %6d'
                  % (len(g2_paare), PAKET_PROJEKTION['g2Kanten']))
    zeilen.append('  G2-Isolate:  eigene Rechnung %6d, Paket %6d, coverage_flag %6d'
                  % (eigene_isolate, PAKET_PROJEKTION['g2Isolate'], flag_isolate))
    zeilen.append('  G3-Kanten:   eigene Rechnung %6d, Paket %6d'
                  % (len(g3_paare), PAKET_PROJEKTION['g3Kanten']))
    zeilen.append('  G3-Isolate:  eigene Rechnung %6d, Paket %6d'
                  % (eigene_isolate_g3, PAKET_PROJEKTION['g3Isolate']))
    if (len(g2_paare) != PAKET_PROJEKTION['g2Kanten']
            or eigene_isolate != PAKET_PROJEKTION['g2Isolate']):
        zeilen.append('  Die Zahlen des Pakets lassen sich aus web_edges.csv nicht')
        zeilen.append('  nachrechnen; das Paket stuetzt sie auf Daten ausserhalb der')
        zeilen.append('  Lieferung. Die Seite zeigt die nachvollziehbare eigene Rechnung.')

    zeilen.append('')
    zeilen.append('Zusammengefuehrte Namensvarianten: %d Gruppen' % len(zusammenfuehrungen))
    for gruppe in sorted(zusammenfuehrungen, key=lambda g: g['schluessel'])[:12]:
        zeilen.append('  %s  <-  %s' % (gruppe['varianten'][0], ' | '.join(gruppe['varianten'])))
    if len(zusammenfuehrungen) > 12:
        zeilen.append('  … und %d weitere' % (len(zusammenfuehrungen) - 12))

    return '\n'.join(zeilen), fehler


# ---------------------------------------------------------------- Bauen -----

def baue(nur_pruefen=False):
    (organisationen, personen, kanten, historie, cluster, paketwerte,
     zusammenfuehrungen, ausgeschlossen) = lies_datenpaket()
    quellen = lies_quellen()
    org_ids = set(organisationen)

    for k in kanten:
        if GEWICHT_JE_KLASSE.get(k['klasse']) != k['gewicht']:
            raise Abbruch('Kante %s: Gewicht %s passt nicht zur Klasse %s.'
                          % (k['id'], k['gewicht'], k['klasse']))

    g2_paare, bruecken_g2 = projiziere(kanten, G2_KLASSEN, org_ids)
    g3_paare, bruecken_g3 = projiziere(kanten, G3_KLASSEN, org_ids)

    bericht, fehler = abnahme(organisationen, personen, kanten, historie, cluster,
                              paketwerte, zusammenfuehrungen, quellen,
                              g2_paare, g3_paare, bruecken_g2, ausgeschlossen)
    print(bericht)
    if fehler:
        raise Abbruch('Abnahme nicht bestanden:\n  - ' + '\n  - '.join(fehler))
    if nur_pruefen:
        return None

    # --- Kennzahlen je Organisation aus den Daten ---
    kanten_je_org = collections.Counter(k['org'] for k in kanten)
    g3_je_org = collections.Counter(k['org'] for k in kanten if k['klasse'] in G3_KLASSEN)
    historie_je_org = collections.Counter(k['org'] for k in historie)
    personen_je_org = collections.defaultdict(set)
    for k in kanten:
        personen_je_org[k['org']].add(k['person'])

    for org_id, org in organisationen.items():
        org['kanten'] = kanten_je_org.get(org_id, 0)
        org['kantenG3'] = g3_je_org.get(org_id, 0)
        org['personen'] = len(personen_je_org.get(org_id, ()))
        org['brueckenpersonen'] = len(bruecken_g2.get(org_id, ()))
        org['brueckenpersonenG3'] = len(bruecken_g3.get(org_id, ()))
        org['historischeKanten'] = historie_je_org.get(org_id, 0)

    # --- Verdichtung: Indizes statt wiederholter Texte ---
    org_index = dict((o, i) for i, o in enumerate(organisationen))
    personen_index = dict((p, i) for i, p in enumerate(personen))

    # Nur die tatsaechlich belegten Quellen ausliefern; das Register bleibt intern.
    # Seit 3.7.51 nennen Kanten Kennungen, zu denen sources.csv keinen Eintrag
    # hat. Sie werden als fehlender Beleg mitgegeben, nicht stillschweigend
    # weggelassen — sonst sieht die Kante belegt aus, obwohl der Nachweis fehlt.
    verwendet, ohne_eintrag = [], []
    for k in kanten + historie:
        for q in k['quellen']:
            if q in quellen:
                if q not in verwendet:
                    verwendet.append(q)
            elif q not in ohne_eintrag:
                ohne_eintrag.append(q)
    quellen_index = dict((q, i) for i, q in enumerate(verwendet))

    woerterbuecher = collections.OrderedDict(
        (name, collections.OrderedDict()) for name in ('rolle', 'guete', 'status', 'typ'))

    def code(name, wert):
        buch = woerterbuecher[name]
        if wert not in buch:
            buch[wert] = len(buch)
        return buch[wert]

    klassen_liste = list(G2_KLASSEN)

    def kante_json(k):
        person = personen[k['person']]
        eintrag = {
            'id': k['id'],
            'o': org_index[k['org']],
            'p': personen_index[k['person']],
            'pr': person['rohIds'].index(k['rohPerson']) if k['rohPerson'] in person['rohIds'] else 0,
            'pa': person['varianten'].index(k['anzeige']) if k['anzeige'] in person['varianten'] else 0,
            'k': klassen_liste.index(k['klasse']) if k['klasse'] in klassen_liste else 0,
            'r': code('rolle', k['rolle']),
            'qg': code('guete', k['quellenGuete']),
            's': code('status', k['status']),
            'qs': [quellen_index[q] for q in k['quellen'] if q in quellen_index],
        }
        fehlt = [q for q in k['quellen'] if q not in quellen_index]
        if fehlt:
            eintrag['qf'] = fehlt
        for feld, schluessel in (('amt', 'amt'), ('partei', 'partei'),
                                 ('behoerde', 'behoerde'), ('dachverband', 'dachverband'),
                                 ('von', 'von'), ('bis', 'bis'), ('bemerkung', 'bemerkung')):
            if k[feld]:
                eintrag[schluessel] = k[feld]
        if k['verbindungstyp']:
            eintrag['vt'] = code('typ', k['verbindungstyp'])
        gegen = k['gegenpartId']
        if gegen and gegen in org_index:
            eintrag['gp'] = org_index[gegen]
        elif k['gegenpart']:
            eintrag['gpName'] = k['gegenpart']
        return eintrag

    def paare_json(paare):
        liste = []
        for (a, b), v in sorted(paare.items()):
            liste.append({
                'a': org_index[a], 'b': org_index[b], 'gewicht': v['gewicht'],
                'personen': [personen_index[p] for p in v['personen']],
                'direkt': bool(v['direkt']), 'ueberPersonen': bool(v['ueberPersonen']),
            })
        return liste

    def ohne_leere(d):
        return dict((k, v) for k, v in d.items() if v not in ('', None, [], False))

    personen_json = []
    for p in personen.values():
        eintrag = {'k': p['k'], 'n': p['n'], 'rohIds': p['rohIds']}
        if p.get('nurHistorie'):
            eintrag['nurHistorie'] = True
        if p['varianten'][1:]:
            eintrag['varianten'] = p['varianten']
        if p['parteien']:
            eintrag['parteien'] = p['parteien']
        personen_json.append(eintrag)

    cluster_json = []
    for c in cluster.values():
        eintrag = dict(c)
        eintrag['mitglieder'] = [org_index[o] for o, v in organisationen.items()
                                 if v['cluster'] == c['id']]
        cluster_json.append(eintrag)

    # Erst die Kanten aufbauen: dabei fuellen sich die Woerterbuecher. Wuerden
    # sie im Dict-Literal vor den Kanten stehen, waeren sie noch leer.
    kanten_json = [kante_json(k) for k in kanten]
    historie_json = [kante_json(k) for k in historie]

    luecken = len([o for o in organisationen.values() if o['abdeckungsluecke']])
    verbunden = set()
    for a, b in g2_paare:
        verbunden.add(a)
        verbunden.add(b)

    daten = {
        'meta': {
            'paket': 'NGO_Web_Update_3.7.51',
            'masterVersion': '3.7.51 – AP28–AP31 Finalrerun nach AP34',
            'datenstand': '2026-08-19',
            'quelle': 'NGO_Datenbank_Master',
            'standardansicht': 'G3',
            'klassen': list(G2_KLASSEN),
            'klassenText': KLASSEN_TEXT,
            'gewichtJeKlasse': [GEWICHT_JE_KLASSE[k] for k in G2_KLASSEN],
            'g3Klassen': list(G3_KLASSEN),
            # Zahlen fuer die Seitentexte, damit dort keine festen Werte stehen.
            'zahlen': {
                'organisationen': len(organisationen),
                'abdeckungsluecken': luecken,
                'rohpersonen': sum(len(p['rohIds']) for p in personen.values()),
                'personen': len([p for p in personen.values() if not p.get('nurHistorie')]),
                'personenNurHistorie': len([p for p in personen.values() if p.get('nurHistorie')]),
                'variantengruppen': len(zusammenfuehrungen),
                'kanten': len(kanten),
                'kantenG3': len([k for k in kanten if k['klasse'] in G3_KLASSEN]),
                'historie': len(historie),
                'cluster': len(cluster),
                'quellen': len(verwendet),
                'quellenOhneUrl': len([q for q in verwendet if not quellen[q]['url']]),
                'quellenOhneEintrag': len(ohne_eintrag),
                'projektionG2': len(g2_paare),
                'projektionG3': len(g3_paare),
                'ohneProjektionskante': len(organisationen) - len(verbunden),
                'brueckenpersonen': len([p for p in personen
                                         if len(set(k['org'] for k in kanten
                                                    if k['person'] == p)) > 1]),
            },
            'hinweise': {
                'zentralitaet': 'Knotengrösse zeigt die strukturelle Brückenfunktion im '
                                'erfassten Netz (Netzwerkzentralität). Das ist kein Einflussmass '
                                'und keine Aussage über Macht, Steuerung oder Einflussnahme.',
                'abdeckungsluecke': 'Organisationen ohne erfasste Beziehung sind eine '
                                    'Abdeckungslücke der Erhebung, kein Nachweis fehlender '
                                    'Vernetzung und keine tatsächliche Isolation.',
                'partei': 'Parteiangaben gehören zu einzelnen Personen. Aus ihnen lässt sich '
                          'keine Parteizugehörigkeit der Organisation ableiten.',
                'historie': 'Frühere Beziehungen werden getrennt geführt und nie mit den '
                            'aktuellen vermischt.',
                'cluster': 'Clusterlabels sind deskriptive Kurzbezeichnungen nach den '
                           'enthaltenen Organisationen, keine politische Bewertung.',
                'quellen': 'Angezeigt werden Herausgeber, Titel, Quellentyp, Rang, Güte und '
                           'Datum. Die interne Kennung steht nur als Zusatz im Auditbereich.',
                'quelleFehlt': 'Quellenangabe im Datenexport nicht gefunden',
                'quelleOhneUrl': 'Für diese Quelle liegt im Register keine eigene Zeile mit '
                                 'Fundstelle vor. Die Lücke wird ausgewiesen, statt einen Link '
                                 'zu erfinden.',
                'projektion': 'Die Verbindungen zwischen Organisationen sind aus den '
                              'gelieferten Beziehungen gerechnet: gemeinsame Personen und '
                              'direkt erfasste Beziehungen.',
            },
        },
        'cluster': cluster_json,
        'obergruppen': sorted(set(o['obergruppe'] for o in organisationen.values())),
        'woerterbuecher': dict((name, list(buch)) for name, buch in woerterbuecher.items()),
        'quellen': [ohne_leere(quellen[q]) for q in verwendet],
        'organisationen': [ohne_leere(o) for o in organisationen.values()],
        'personen': personen_json,
        'kanten': kanten_json,
        'historie': historie_json,
        'projektion': {'g2': paare_json(g2_paare), 'g3': paare_json(g3_paare)},
        'variantengruppen': zusammenfuehrungen,
    }

    if not os.path.isdir(AUSGABE):
        os.makedirs(AUSGABE)
    pfad_ausgabe = os.path.join(AUSGABE, 'ngo-netzwerk.json')
    with io.open(pfad_ausgabe, 'w', encoding='utf-8') as datei:
        datei.write(json.dumps(daten, ensure_ascii=False, separators=(',', ':')))
    with io.open(pfad_ausgabe, encoding='utf-8') as quelle:
        inhalt = quelle.read()
    with io.open(os.path.join(ZIEL, 'ngo-netzwerk.json'), 'w', encoding='utf-8') as datei:
        datei.write(inhalt)

    print('')
    print('geschrieben: %s (%.0f KB)'
          % (os.path.relpath(pfad_ausgabe, WURZEL), os.path.getsize(pfad_ausgabe) / 1024.0))
    print('kopiert nach: assets/ngo/ngo-netzwerk.json')
    return daten


def main():
    try:
        baue('--nur-pruefen' in sys.argv)
    except Abbruch as fehler:
        print('')
        print('ABBRUCH: %s' % fehler)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
