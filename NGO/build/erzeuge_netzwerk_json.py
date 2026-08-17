# -*- coding: utf-8 -*-
"""
Erzeugt aus dem Datenpaket NGO_Datenbank_Master 3.7.1 die veroeffentlichungsfaehige
JSON fuer die Netzwerkseite.

Quellen (alle in NGO/daten/, nicht versioniert):
    ngo_nodes_organisation.csv    144 Masterorganisationen
    ngo_nodes_personen_raw.csv    1852 technische Rohpersonen
    ngo_edges_current.csv         2628 aktuelle Kanten Organisation -> Person
    ngo_clusters_analysis.csv     AP29-Bericht, Sollwerte fuer die Abnahme
    network_metadata.json         Kennzahlen und Abdeckungsluecken
    ngo_edge_sources.csv          2807 Zuordnungen Kante -> Quelle
    ngo_sources_web.csv           327 Quellen mit Herausgeber, Titel, URL

Ergebnis:
    NGO/ausgabe/ngo-netzwerk.json  und Kopie nach assets/ngo/ngo-netzwerk.json

Das Skript rechnet die Kennzahlen des AP29-Berichts nach und bricht ab, wenn die
Nachrechnung abweicht. Damit kann keine stillschweigend andere Auswertung
veroeffentlicht werden als die im Master dokumentierte.

Aufruf:  python NGO/build/erzeuge_netzwerk_json.py [--nur-pruefen]
"""
import collections
import csv
import datetime
import io
import itertools
import json
import os
import random
import re
import sys
import unicodedata

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATEN = os.path.join(WURZEL, 'NGO', 'daten')
AUSGABE = os.path.join(WURZEL, 'NGO', 'ausgabe')
ZIEL = os.path.join(WURZEL, 'assets', 'ngo')

# Louvain ist nur bei festem Startwert reproduzierbar. Dieser Wert bildet die
# neun Cluster des AP29-Berichts exakt ab; die Abnahme prueft das nach.
LOUVAIN_SEED = 5

G3_KLASSEN = ('N1', 'N2', 'N3')
G2_KLASSEN = ('N1', 'N2', 'N3', 'N4')

KLASSEN_TEXT = {
    'N1': 'N1 — Organ- oder Leitungsfunktion',
    'N2': 'N2 — Mitgliedschaft oder Gremium',
    'N3': 'N3 — Allianz oder Dachverband',
    'N4': 'N4 — weitere erfasste Beziehung',
}

# Sollwerte aus ngo_clusters_analysis.csv (AP29). Reihenfolge der Kennzahlen:
# Groesse, gemeinnuetzig, wirtschaftlich, politisch, interne Kanten, internes Gewicht
CLUSTER_SOLL = [
    ((19, 16, 0, 3, 21, 97), 15, 'Soziales / Teilhabe / Gesellschaft', 0.476),
    ((18, 3, 10, 5, 46, 191), 24, 'Wirtschaft / Verbände / Mobilität / Eigentum', 0.889),
    ((15, 8, 4, 3, 28, 95), 28, 'Landwirtschaft / Ernährung / Entwicklung', 0.733),
    ((15, 8, 5, 2, 36, 150), 31, 'Arbeit / Miete / Verkehr / Energie', 0.812),
    ((13, 9, 0, 4, 14, 61), 2, 'Klima / Nachhaltigkeit / Menschenrechte', 0.929),
    ((12, 8, 3, 1, 15, 70), 16, 'Umwelt / Mobilität / Tourismus / Gesundheit', 0.667),
    ((7, 4, 0, 3, 6, 26), 6, 'Migration / Aussenpolitik / Jugend', 0.571),
    ((7, 0, 5, 2, 10, 74), 27, 'Wirtschaft / Export / Finanz / Pharma', 0.875),
    ((4, 0, 3, 1, 3, 24), 35, 'Versicherung / Mobilität / Gesundheitsfinanzierung', 1.0),
]

OBERGRUPPE_KUERZEL = {
    'Gemeinnützige und zivilgesellschaftliche NGOs': 'g',
    'Wirtschafts- und Berufsverbände': 'w',
    'Politische und gesellschaftliche Interessenorganisationen': 'p',
}

# Obergruppenpaare aus dem AP29-Bericht: (Kanten, Gewicht)
OBERGRUPPEN_SOLL = {
    ('Gemeinnützige und zivilgesellschaftliche NGOs',
     'Gemeinnützige und zivilgesellschaftliche NGOs'): (79, 290),
    ('Wirtschafts- und Berufsverbände',
     'Wirtschafts- und Berufsverbände'): (36, 222),
    ('Gemeinnützige und zivilgesellschaftliche NGOs',
     'Wirtschafts- und Berufsverbände'): (61, 204),
    ('Politische und gesellschaftliche Interessenorganisationen',
     'Wirtschafts- und Berufsverbände'): (42, 161),
    ('Gemeinnützige und zivilgesellschaftliche NGOs',
     'Politische und gesellschaftliche Interessenorganisationen'): (53, 147),
    ('Politische und gesellschaftliche Interessenorganisationen',
     'Politische und gesellschaftliche Interessenorganisationen'): (15, 50),
}

# Brueckenorganisationen aus dem AP29-Bericht, nach Kanonisierung
BRUECKEN_SOLL = {
    'LITRA': 16, 'Schweizerischer Gewerbeverband sgv': 16, 'VPOD': 13,
    'Schweizer Tierschutz STS': 10, 'economiesuisse': 9, 'Inclusion Handicap': 9,
    'Aqua Viva': 9, 'Europäische Bewegung Schweiz': 9,
    'Schweizerische Rettungsflugwacht (Rega)': 9,
    'Mieterinnen- und Mieterverband Schweiz': 8, 'Pro Alps': 8,
    'Schweizerischer Gewerkschaftsbund SGB': 8, 'Proviande': 8, 'IG Freiheit': 7,
}


class Abbruch(Exception):
    """Die Nachrechnung weicht vom Master ab — es wird nichts geschrieben."""


def lies_csv(name):
    pfad = os.path.join(DATEN, name)
    if not os.path.exists(pfad):
        raise Abbruch('Quelldatei fehlt: ' + pfad)
    with io.open(pfad, encoding='utf-8-sig', newline='') as datei:
        return list(csv.DictReader(datei))


def zahl(wert, standard=0):
    try:
        return int(float(wert))
    except (TypeError, ValueError):
        return standard


def text(wert):
    return (wert or '').strip()


# ---------------------------------------------------------------- Datum -----

EXCEL_EPOCHE = datetime.date(1899, 12, 30)


def datum_text(wert):
    """Die Quellendatei mischt Excel-Serienzahlen (46232.0), deutsche Daten
    (30.07.2026), Monat.Jahr (5.2025), Jahre (2026.0) und Spannen (2024–2026).
    Alles wird in eine lesbare Schreibweise gebracht, Unbekanntes bleibt stehen."""
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
    if z >= 20000:                                  # Excel-Serienzahl
        return (EXCEL_EPOCHE + datetime.timedelta(days=int(z))).strftime('%d.%m.%Y')
    if 1800 <= z <= 2100 and float(int(z)) == z:    # Jahreszahl
        return str(int(z))
    if re.match(r'^\d{1,2}\.\d{4}$', s):            # Monat.Jahr
        monat, jahr = s.split('.')
        return '%02d.%s' % (int(monat), jahr)
    return s


# --------------------------------------------------------- Kanonisierung ----

def canonical_person_key(name):
    """Auftrag Abschnitt 3: Unicode normalisieren, klein schreiben, Interpunktion
    als Trenner, Whitespace normalisieren, Tokens sortieren. Kein Fuzzy-Matching:
    zusammengefuehrt wird ausschliesslich bei identischer Tokenliste."""
    s = unicodedata.normalize('NFKC', name or '').lower()
    s = re.sub(r'[^\w\s]|_', ' ', s, flags=re.UNICODE)
    return ' '.join(sorted(t for t in s.split() if t))


def baue_personen(rohpersonen):
    gruppen = collections.OrderedDict()
    for p in rohpersonen:
        schluessel = canonical_person_key(p['display_name'])
        gruppen.setdefault(schluessel, []).append(p)

    personen = collections.OrderedDict()
    zusammenfuehrungen = []
    for schluessel, mitglieder in gruppen.items():
        anzeigen = []
        for m in mitglieder:
            if m['display_name'] not in anzeigen:
                anzeigen.append(m['display_name'])
        parteien = []
        for m in mitglieder:
            for label in text(m['party_labels']).split(';'):
                label = label.strip()
                if label and label not in parteien:
                    parteien.append(label)
        personen[schluessel] = {
            'k': schluessel,
            'n': anzeigen[0],
            'varianten': anzeigen,
            'rohIds': [m['person_id'] for m in mitglieder],
            'parteien': parteien,
        }
        if len(mitglieder) > 1:
            zusammenfuehrungen.append({
                'schluessel': schluessel,
                'varianten': anzeigen,
                'rohIds': [m['person_id'] for m in mitglieder],
            })
    return personen, zusammenfuehrungen


# ------------------------------------------------------------ Projektion ----

def projiziere(kanten, klassen, org_ids):
    """Organisationsprojektion nach AP29.

    Gemeinsame Personen: je Person und Organisation zaehlt das hoechste
    Rollengewicht, das Kantengewicht ist konservativ das kleinere der beiden.
    Direkte Master-zu-Master-Beziehungen kommen zusaetzlich hinzu.
    """
    gewaehlt = [k for k in kanten if k['klasse'] in klassen]

    pro_person = collections.defaultdict(dict)
    for k in gewaehlt:
        vorher = pro_person[k['person']].get(k['org'], 0)
        if k['gewicht'] > vorher:
            pro_person[k['person']][k['org']] = k['gewicht']

    paare = {}

    def eintrag(a, b):
        schluessel = (a, b) if a < b else (b, a)
        if schluessel not in paare:
            paare[schluessel] = {
                'a': schluessel[0], 'b': schluessel[1],
                'gewicht': 0, 'personen': [], 'direkt': False, 'ueberPersonen': False,
            }
        return paare[schluessel]

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
            schluessel = (k['org'], gegen) if k['org'] < gegen else (gegen, k['org'])
            direkte[schluessel].append(k['gewicht'])
    for schluessel, gewichte in direkte.items():
        v = eintrag(*schluessel)
        v['gewicht'] += sum(gewichte)
        v['direkt'] = True

    for v in paare.values():
        v['personen'].sort()
    return paare, bruecken


# --------------------------------------------------------------- Louvain ----

def _lokale_stufe(nachbarn, eigen, seed):
    rnd = random.Random(seed)
    knoten = sorted(nachbarn)
    m2 = float(sum(sum(d.values()) for d in nachbarn.values()) + 2 * sum(eigen.values()))
    if m2 == 0:
        return dict((v, v) for v in knoten)
    k = dict((v, sum(nachbarn[v].values()) + 2 * eigen.get(v, 0)) for v in knoten)
    gemeinde = dict((v, v) for v in knoten)
    sigma = dict(k)
    verbessert, runden = True, 0
    while verbessert and runden < 100:
        verbessert, runden = False, runden + 1
        reihenfolge = knoten[:]
        rnd.shuffle(reihenfolge)
        for v in reihenfolge:
            alt = gemeinde[v]
            sigma[alt] -= k[v]
            gewichte = collections.defaultdict(float)
            for w, g in nachbarn[v].items():
                gewichte[gemeinde[w]] += g
            bestes = alt
            bestwert = gewichte.get(alt, 0.0) - sigma[alt] * k[v] / m2
            for c, g in gewichte.items():
                wert = g - sigma[c] * k[v] / m2
                if wert > bestwert + 1e-12:
                    bestes, bestwert = c, wert
            sigma[bestes] += k[v]
            gemeinde[v] = bestes
            if bestes != alt:
                verbessert = True
    return gemeinde


def louvain(paare, seed):
    """Mehrstufiges Louvain-Verfahren auf dem gewichteten Projektionsgraph."""
    nachbarn = collections.defaultdict(dict)
    for (a, b), v in paare.items():
        nachbarn[a][b] = nachbarn[a].get(b, 0) + v['gewicht']
        nachbarn[b][a] = nachbarn[b].get(a, 0) + v['gewicht']
    eigen = collections.defaultdict(float)
    zuordnung = dict((v, v) for v in nachbarn)
    while True:
        gemeinde = _lokale_stufe(nachbarn, eigen, seed)
        if len(set(gemeinde.values())) == len(nachbarn):
            break
        zuordnung = dict((v, gemeinde[c]) for v, c in zuordnung.items())
        neu_n = collections.defaultdict(dict)
        neu_e = collections.defaultdict(float)
        for v in nachbarn:
            neu_e[gemeinde[v]] += eigen.get(v, 0)
            for w, g in nachbarn[v].items():
                if gemeinde[v] == gemeinde[w]:
                    neu_e[gemeinde[v]] += g / 2.0
                else:
                    neu_n[gemeinde[v]][gemeinde[w]] = neu_n[gemeinde[v]].get(gemeinde[w], 0) + g
        for c in neu_e:
            neu_n.setdefault(c, {})
        if len(neu_n) == len(nachbarn):
            break
        nachbarn, eigen = neu_n, neu_e
    return zuordnung


def ordne_cluster_zu(paare, organisationen):
    """Louvain rechnen und den neun AP29-Clustern zuordnen. Weicht ein Profil ab,
    bricht der Build ab, statt eine andere Clusterung zu veroeffentlichen."""
    zuordnung = louvain(paare, LOUVAIN_SEED)
    gruppen = collections.defaultdict(list)
    for org, gemeinde in zuordnung.items():
        gruppen[gemeinde].append(org)

    profile = {}
    for gemeinde, mitglieder in gruppen.items():
        interne_kanten = interne_gewichte = 0
        for (a, b), v in paare.items():
            if zuordnung[a] == gemeinde and zuordnung[b] == gemeinde:
                interne_kanten += 1
                interne_gewichte += v['gewicht']
        verteilung = collections.Counter(
            OBERGRUPPE_KUERZEL[organisationen[o]['obergruppe']] for o in mitglieder)
        profile[gemeinde] = (len(mitglieder), verteilung['g'], verteilung['w'],
                             verteilung['p'], interne_kanten, interne_gewichte)

    cluster_von_org = {}
    cluster_liste = []
    offen = dict(profile)
    for soll, cluster_id, label, jaccard in CLUSTER_SOLL:
        treffer = [g for g, p in offen.items() if p == soll]
        if len(treffer) != 1:
            raise Abbruch(
                'Cluster «%s» (Sollprofil %s) wurde %d mal gefunden. Die Clusterung des '
                'Masters laesst sich mit Startwert %d nicht mehr reproduzieren; '
                'es wurde nichts geschrieben.' % (label, soll, len(treffer), LOUVAIN_SEED))
        gemeinde = treffer.pop()
        del offen[gemeinde]
        mitglieder = sorted(gruppen[gemeinde])
        for org in mitglieder:
            cluster_von_org[org] = cluster_id
        cluster_liste.append({
            'id': cluster_id,
            'label': label,
            'groesse': soll[0],
            'gemeinnuetzig': soll[1],
            'wirtschaft': soll[2],
            'politisch': soll[3],
            'interneKanten': soll[4],
            'internesGewicht': soll[5],
            'g3Jaccard': jaccard,
            'mitglieder': mitglieder,
        })

    # Restgemeinden: im AP29-Bericht nicht als Hauptcluster gefuehrt.
    rest = sorted(offen.items(), key=lambda kv: -kv[1][0])
    kleine = []
    for gemeinde, profil in rest:
        mitglieder = sorted(gruppen[gemeinde])
        for org in mitglieder:
            cluster_von_org[org] = 0
        kleine.append(mitglieder)

    cluster_liste.sort(key=lambda c: -c['groesse'])
    return cluster_von_org, cluster_liste, kleine


# ------------------------------------------------------------- Einlesen -----

def lies_quellen():
    """Quellenverzeichnis und die Bruecke Kante -> Quelle (Auftrag Abschnitt 8).

    Eine Kante kann mehrere Quellen haben; die Rohspalte `source_id` der
    Kantendatei fasst sie mit Strichpunkt zusammen. Massgebend ist die Bruecke.
    """
    quellen = collections.OrderedDict()
    for z in lies_csv('ngo_sources_web.csv'):
        quellen[text(z['source_id'])] = {
            'id': text(z['source_id']),
            'orgId': text(z['org_id']),
            'herausgeber': text(z['publisher_author']),
            'titel': text(z['title']),
            'typ': text(z['source_type']),
            'rang': text(z['source_rank']),
            'guete': text(z['quality']),
            'eignung': text(z['suitability']),
            'dokumentNr': text(z['document_number']),
            'datum': datum_text(z['document_date']),
            'jahr': datum_text(z['report_year']),
            'abschnitt': text(z['page_section']),
            'url': text(z['url']),
            'abgerufen': datum_text(z['retrieved_date']),
            'archiv': text(z['archive_path']),
        }

    je_kante = collections.OrderedDict()
    unbekannt = []
    for z in lies_csv('ngo_edge_sources.csv'):
        kante, quelle = text(z['edge_id']), text(z['source_id'])
        liste = je_kante.setdefault(kante, [])
        if quelle not in quellen:
            # Wird nicht stillschweigend verschluckt: die Kante behaelt die
            # Kennung und die Seite zeigt sie als nicht gefunden an.
            unbekannt.append((kante, quelle))
            liste.append({'fehlt': quelle})
        elif quelle not in [e.get('id') for e in liste]:
            liste.append(quellen[quelle])
    return quellen, je_kante, unbekannt


def lies_datenpaket():
    org_zeilen = lies_csv('ngo_nodes_organisation.csv')
    personen_zeilen = lies_csv('ngo_nodes_personen_raw.csv')
    kanten_zeilen = lies_csv('ngo_edges_current.csv')
    with io.open(os.path.join(DATEN, 'network_metadata.json'), encoding='utf-8') as datei:
        metadaten = json.load(datei)

    organisationen = collections.OrderedDict()
    for o in org_zeilen:
        organisationen[o['org_id']] = {
            'id': o['org_id'],
            'name': text(o['name']),
            'kurz': text(o['short_name']) or text(o['name']),
            'obergruppe': text(o['obergruppe']),
            'hauptkategorie': text(o['hauptkategorie']),
            'organisationstyp': text(o['organisationstyp']),
            'sitz': text(o['sitz']),
            'kanton': text(o['kanton']),
            'website': text(o['website']),
            'datenstand': text(o['datenstand']),
            'historischeKanten': zahl(o['g4_historical_edges']),
            'abdeckungsluecke': text(o['coverage_flag']) != 'ok',
        }

    personen, zusammenfuehrungen = baue_personen(personen_zeilen)
    kanon_von_roh = {}
    for schluessel, person in personen.items():
        for roh in person['rohIds']:
            kanon_von_roh[roh] = schluessel

    kanten = []
    for z in kanten_zeilen:
        roh = z['target_person_id']
        kanon = kanon_von_roh.get(roh) or canonical_person_key(z['person_display'])
        kanten.append({
            'id': z['edge_id'],
            'org': z['source_org_id'],
            'person': kanon,
            'rohPerson': roh,                      # Originalwert bleibt erhalten
            'anzeige': text(z['person_display']),  # Originalwert bleibt erhalten
            'rolle': text(z['role']),
            'personScope': text(z['person_scope']),
            'klasse': text(z['relation_class']),
            'gewicht': zahl(z['weight']),
            'amt': text(z['political_function']),
            'partei': text(z['party_label']),
            'behoerde': text(z['authority_commission']),
            'dachverband': text(z['umbrella_alliance']),
            'gegenpart': text(z['counterparty_org']),
            'gegenpartId': text(z['counterparty_master_id']),
            'quelle': text(z['source_id']),
            'quellenGuete': text(z['source_quality']),
            'status': text(z['data_status']),
            'aktiv': text(z['active']),
        })
    return organisationen, personen, kanten, zusammenfuehrungen, metadaten


# -------------------------------------------------------------- Abnahme -----

def abnahme(organisationen, personen, kanten, zusammenfuehrungen, metadaten,
            g2_paare, g3_paare, bruecken_g2, cluster_liste, kleine_cluster,
            quellen, quellen_je_kante, quellen_unbekannt):
    zeilen = []
    fehler = []

    def pruefe(titel, ist, soll):
        ok = ist == soll
        zeilen.append('  %-52s %-10s %s' % (titel, ist, 'ok' if ok else 'ABWEICHUNG, soll ' + str(soll)))
        if not ok:
            fehler.append('%s: ist %s, soll %s' % (titel, ist, soll))

    zeilen.append('Abnahme nach Auftrag Abschnitt 7')
    pruefe('Organisationen', len(organisationen), 144)
    pruefe('aktuelle Kanten (Organisation -> Person)', len(kanten), 2628)
    g3 = [k for k in kanten if k['klasse'] in G3_KLASSEN]
    pruefe('G3-Kanten (N1-N3)', len(g3), 2404)
    pruefe('N4-Kanten in der Standardansicht G3',
           len([k for k in g3 if k['klasse'] == 'N4']), 0)

    unvollstaendig = [k['id'] for k in kanten
                      if not k['org'] or not k['rohPerson'] or not k['klasse'] or not k['quelle']]
    pruefe('Kanten ohne org/person/relation_class/source_id', len(unvollstaendig), 0)
    if unvollstaendig:
        zeilen.append('      betroffen: ' + ', '.join(unvollstaendig[:10]))

    unbekannt = [k['id'] for k in kanten if k['org'] not in organisationen]
    pruefe('Kanten auf unbekannte Organisation', len(unbekannt), 0)

    luecken = [o for o in organisationen.values() if o['abdeckungsluecke']]
    pruefe('Abdeckungsluecken', len(luecken), 8)
    soll_luecken = set(metadaten.get('coverage_gaps', []))
    zeilen.append('  Abdeckungsluecken bleiben als Organisation sichtbar, ohne Wertung:')
    for org in sorted(luecken, key=lambda o: o['name']):
        # network_metadata.json nennt teils den Kurznamen (HEKS), teils den langen
        # Namen; beide Schreibweisen gelten als Treffer.
        felder = (org['name'], org['kurz'], org['name'].split(' (')[0])
        bekannt = any(s in felder or any(s in f or f in s for f in felder) for s in soll_luecken)
        zeilen.append('      - %s%s' % (org['name'],
                                        '' if bekannt else '  (nicht in network_metadata.json)'))

    # Nachrechnung des AP29-Berichts
    zeilen.append('')
    zeilen.append('Nachrechnung des AP29-Berichts')
    pruefe('Rohpersonen', len(set(k['rohPerson'] for k in kanten)), 1852)
    pruefe('kanonische Personen', len(personen), 1772)
    pruefe('sichere Variantengruppen', len(zusammenfuehrungen),
           metadaten['person_id_rule']['safe_variant_groups_found_in_AP29'])
    pruefe('G2-Projektionskanten', len(g2_paare), 286)
    pruefe('G2-Projektionsgewicht', sum(v['gewicht'] for v in g2_paare.values()), 1074)
    pruefe('Gesamtgewicht aller Kanten', sum(k['gewicht'] for k in kanten),
           metadaten['graph']['g2_total_weight'])
    pruefe('Hauptcluster', len(cluster_liste), metadaten['graph']['main_clusters'])

    abweichend = []
    for name, soll in BRUECKEN_SOLL.items():
        org_id = next((o['id'] for o in organisationen.values() if o['name'] == name), None)
        ist = len(bruecken_g2.get(org_id, ()))
        if ist != soll:
            abweichend.append('%s (ist %d, soll %d)' % (name, ist, soll))
    pruefe('Brueckenorganisationen des Berichts', len(abweichend), 0)
    for a in abweichend:
        zeilen.append('      ' + a)

    ist_og = collections.defaultdict(lambda: [0, 0])
    for (a, b), v in g2_paare.items():
        schluessel = tuple(sorted((organisationen[a]['obergruppe'], organisationen[b]['obergruppe'])))
        ist_og[schluessel][0] += 1
        ist_og[schluessel][1] += v['gewicht']
    og_abweichend = [k for k, soll in OBERGRUPPEN_SOLL.items()
                     if tuple(ist_og[tuple(sorted(k))]) != soll]
    pruefe('Obergruppen-Paare des Berichts', len(og_abweichend), 0)

    # --- Quellenanzeige (Auftrag Abschnitt 8) ---
    zeilen.append('')
    zeilen.append('Quellenanzeige')
    verwendet = set()
    for k in kanten:
        for teil in k['quelle'].split(';'):
            if teil.strip():
                verwendet.add(teil.strip())
    nicht_aufloesbar = sorted(verwendet - set(quellen))
    pruefe('in Kanten verwendete Quellenkennungen', len(verwendet),
           metadaten.get('sources', {}).get('individual_source_ids_referenced', len(verwendet)))
    pruefe('davon ohne Eintrag in ngo_sources_web.csv', len(nicht_aufloesbar), 0)
    for kennung in nicht_aufloesbar[:10]:
        zeilen.append('      fehlt: ' + kennung)
    ohne_quelle = [k['id'] for k in kanten if not quellen_je_kante.get(k['id'])]
    pruefe('Kanten ohne aufgeloeste Quelle', len(ohne_quelle), 0)
    pruefe('fehlende Source-Joins in der Bruecke', len(quellen_unbekannt), 0)
    zeilen.append('  %d Quellen, %d Zuordnungen Kante -> Quelle' %
                  (len(quellen), sum(len(v) for v in quellen_je_kante.values())))
    ohne_url = [q for q in quellen.values() if not q['url']]
    ohne_titel = [q for q in quellen.values() if not q['titel']]
    zeilen.append('  %d Quellen ohne URL (bibliografisch angezeigt, kein Link erfunden), '
                  '%d ohne Titel (Herausgeber und Quellentyp als Ersatz)'
                  % (len(ohne_url), len(ohne_titel)))
    guete = collections.Counter(q['guete'] for q in quellen.values())
    zeilen.append('  Guetestufen: ' + ', '.join('%s %d' % (g, n) for g, n in sorted(guete.items())))
    for stufe in ('Q1', 'Q2'):
        beispiel = next((q for q in quellen.values() if q['guete'] == stufe), None)
        if beispiel is None:
            fehler.append('keine Beispielquelle der Guetestufe %s' % stufe)
            zeilen.append('  Stichprobe %s: FEHLT' % stufe)
            continue
        sichtbar = beispiel['titel'] or (beispiel['herausgeber'] + ' — ' + beispiel['typ'])
        zeilen.append('  Stichprobe %s: %s — %s | %s · %s · %s%s'
                      % (stufe, beispiel['herausgeber'], sichtbar, beispiel['typ'],
                         beispiel['rang'], beispiel['guete'],
                         ' · ' + (beispiel['datum'] or beispiel['jahr'])
                         if (beispiel['datum'] or beispiel['jahr']) else ''))
        zeilen.append('              %s | interne Referenz %s'
                      % ('Link: ' + beispiel['url'] if beispiel['url']
                         else 'ohne URL, nur bibliografisch', beispiel['id']))
        if beispiel['id'] == sichtbar:
            fehler.append('Guetestufe %s: interne Kennung ist die einzige sichtbare Angabe' % stufe)

    zeilen.append('')
    zeilen.append('Zusammengefuehrte Namensvarianten (sichere Kanonisierung, %d Gruppen)'
                  % len(zusammenfuehrungen))
    for gruppe in sorted(zusammenfuehrungen, key=lambda g: g['schluessel']):
        zeilen.append('  %s  <-  %s' % (gruppe['varianten'][0], ' | '.join(gruppe['varianten'])))

    zeilen.append('')
    zeilen.append('Hinweise')
    doppelt = collections.Counter(
        (k['org'], k['rohPerson'], k['rolle'], k['klasse'], k['quelle']) for k in kanten)
    mehrfach = [(s, n) for s, n in doppelt.items() if n > 1]
    if mehrfach:
        zeilen.append('  %d Zeilen sind bis auf die edge_id vollstaendig doppelt (%d Gruppen, '
                      '%d Organisationen). Sie werden nicht zusammengefasst; die Seite zaehlt '
                      'Personen und Beziehungen getrennt aus.'
                      % (sum(n - 1 for _, n in mehrfach), len(mehrfach),
                         len(set(s[0] for s, _ in mehrfach))))
    zeilen.append('  Cluster: neun Hauptcluster aus dem Bericht reproduziert; %d weitere '
                  'Kleingemeinden ohne Berichtslabel (%s Organisationen), gefuehrt als '
                  '«kein Hauptcluster».'
                  % (len(kleine_cluster), sum(len(k) for k in kleine_cluster)))
    ohne_projektion = [o['id'] for o in organisationen.values()
                       if not any(o['id'] in (a, b) for a, b in g2_paare)]
    zeilen.append('  %d Organisationen haben keine Projektionskante (G2) und erscheinen '
                  'nur in der Personenansicht und in den Tabellen.' % len(ohne_projektion))
    historisch = sum(o['historischeKanten'] for o in organisationen.values())
    zeilen.append('  Historienmodus: das Paket enthaelt %d historische Beziehungen nur als '
                  'Zahl je Organisation, keine Einzelkanten. Der Modus zeigt deshalb die '
                  'Zahlen, nicht die einzelnen Beziehungen.' % historisch)
    zeilen.append('  G3-Projektionskanten: %d (Standardansicht).' % len(g3_paare))

    return '\n'.join(zeilen), fehler


# ---------------------------------------------------------------- Bauen -----

def baue(nur_pruefen=False):
    organisationen, personen, kanten, zusammenfuehrungen, metadaten = lies_datenpaket()
    quellen, quellen_je_kante, quellen_unbekannt = lies_quellen()
    org_ids = set(organisationen)

    g2_paare, bruecken_g2 = projiziere(kanten, G2_KLASSEN, org_ids)
    g3_paare, bruecken_g3 = projiziere(kanten, G3_KLASSEN, org_ids)
    cluster_von_org, cluster_liste, kleine_cluster = ordne_cluster_zu(g2_paare, organisationen)

    bericht, fehler = abnahme(organisationen, personen, kanten, zusammenfuehrungen,
                              metadaten, g2_paare, g3_paare, bruecken_g2,
                              cluster_liste, kleine_cluster,
                              quellen, quellen_je_kante, quellen_unbekannt)
    print(bericht)
    if fehler:
        raise Abbruch('Abnahme nicht bestanden:\n  - ' + '\n  - '.join(fehler))
    if nur_pruefen:
        return None

    # --- Kennzahlen je Organisation, aus den Daten gerechnet ---
    kanten_je_org = collections.Counter(k['org'] for k in kanten)
    g3_je_org = collections.Counter(k['org'] for k in kanten if k['klasse'] in G3_KLASSEN)
    personen_je_org = collections.defaultdict(set)
    for k in kanten:
        personen_je_org[k['org']].add(k['person'])

    for org_id, org in organisationen.items():
        org['cluster'] = cluster_von_org.get(org_id, 0)
        org['kanten'] = kanten_je_org.get(org_id, 0)
        org['kantenG3'] = g3_je_org.get(org_id, 0)
        org['personen'] = len(personen_je_org.get(org_id, ()))
        org['brueckenpersonen'] = len(bruecken_g2.get(org_id, ()))
        org['brueckenpersonenG3'] = len(bruecken_g3.get(org_id, ()))

    # --- Wiederkehrende Texte einmal ablegen, in den Kanten nur den Index ---
    # Ohne diese Verdichtung waere die JSON rund 1,3 MB gross und damit fuer
    # mobile Verbindungen zu schwer. Die Seite loest die Indizes beim Laden auf.
    org_index = dict((org_id, i) for i, org_id in enumerate(organisationen))
    personen_index = dict((schluessel, i) for i, schluessel in enumerate(personen))

    woerterbuecher = collections.OrderedDict(
        (name, collections.OrderedDict()) for name in ('rolle', 'quelle', 'guete', 'status'))

    def code(name, wert):
        buch = woerterbuecher[name]
        if wert not in buch:
            buch[wert] = len(buch)
        return buch[wert]

    # Das Rollengewicht haengt im Paket eindeutig an der Beziehungsklasse.
    # Stimmt das einmal nicht mehr, bricht der Build ab, statt still zu runden.
    gewicht_je_klasse = {'N1': 4, 'N2': 3, 'N3': 2, 'N4': 1}
    for k in kanten:
        if gewicht_je_klasse.get(k['klasse']) != k['gewicht']:
            raise Abbruch('Kante %s: Gewicht %s passt nicht zur Klasse %s. Die Annahme '
                          '«Gewicht folgt aus der Klasse» gilt nicht mehr.'
                          % (k['id'], k['gewicht'], k['klasse']))

    quellen_index = dict((kennung, i) for i, kennung in enumerate(quellen))

    klassen_liste = list(G2_KLASSEN)
    kanten_json = []
    for k in kanten:
        person = personen[k['person']]
        eintrag = {
            'id': k['id'],
            'o': org_index[k['org']],
            'p': personen_index[k['person']],
            # Originalwerte bleiben erhalten: rohPerson als Index in person.rohIds,
            # person_display als Index in person.varianten.
            'pr': person['rohIds'].index(k['rohPerson']),
            'pa': person['varianten'].index(k['anzeige']) if k['anzeige'] in person['varianten'] else 0,
            'k': klassen_liste.index(k['klasse']),
            'r': code('rolle', k['rolle']),
            'q': code('quelle', k['quelle']),
            'qg': code('guete', k['quellenGuete']),
            's': code('status', k['status']),
        }
        if k['amt']:
            eintrag['amt'] = k['amt']
        if k['partei']:
            eintrag['partei'] = k['partei']
        if k['behoerde']:
            eintrag['behoerde'] = k['behoerde']
        if k['dachverband']:
            eintrag['dachverband'] = k['dachverband']
        # Quellen der Kante als Index in die Quellenliste; nicht aufloesbare
        # Kennungen bleiben als Text erhalten und werden auf der Seite als
        # «im Datenexport nicht gefunden» ausgewiesen.
        belege, fehlend = [], []
        for beleg in quellen_je_kante.get(k['id'], []):
            if 'fehlt' in beleg:
                fehlend.append(beleg['fehlt'])
            else:
                belege.append(quellen_index[beleg['id']])
        if belege:
            eintrag['qs'] = belege
        if fehlend:
            eintrag['qf'] = fehlend

        gegen = k['gegenpartId']
        if gegen and gegen in org_index:
            eintrag['gp'] = org_index[gegen]        # Name kommt aus der Organisation
        elif k['gegenpart']:
            eintrag['gpName'] = k['gegenpart']      # Gegenpart ausserhalb des Masters
        kanten_json.append(eintrag)

    def paare_json(paare):
        liste = []
        for (a, b), v in sorted(paare.items()):
            liste.append({
                'a': org_index[a], 'b': org_index[b], 'gewicht': v['gewicht'],
                'personen': [personen_index[p] for p in v['personen']],
                'direkt': bool(v['direkt']),
                'ueberPersonen': bool(v['ueberPersonen']),
            })
        return liste

    def ohne_leere(d):
        return dict((k, v) for k, v in d.items() if v not in ('', None, [], False))

    personen_json = []
    for p in personen.values():
        eintrag = {'k': p['k'], 'n': p['n'], 'rohIds': p['rohIds']}
        if p['varianten'][1:]:
            eintrag['varianten'] = p['varianten']
        if p['parteien']:
            eintrag['parteien'] = p['parteien']
        personen_json.append(eintrag)

    for cluster in cluster_liste:
        cluster['mitglieder'] = [org_index[o] for o in cluster['mitglieder']]

    daten = {
        'meta': {
            'paket': metadaten.get('package'),
            'masterVersion': metadaten.get('master_version'),
            'datenstand': metadaten.get('data_date'),
            'quelle': metadaten.get('authoritative_source'),
            'standardansicht': 'G3',
            'louvainSeed': LOUVAIN_SEED,
            'klassen': list(G2_KLASSEN),
            'klassenText': KLASSEN_TEXT,
            'gewichtJeKlasse': [gewicht_je_klasse[k] for k in G2_KLASSEN],
            'g3Klassen': list(G3_KLASSEN),
            'nichtUebernommen': 'Alle 2628 Kanten des Pakets sind aktiv (Spalte active = Ja); '
                                'die Spalte entfaellt deshalb. Die Spalte person_scope (P1–P6) '
                                'ist im Paket nicht erläutert und wird nicht dargestellt.',
            'hinweise': {
                'zentralitaet': 'Knotengrösse zeigt die strukturelle Brückenfunktion im '
                                'erfassten Netz (Netzwerkzentralität). Das ist kein Einflussmass.',
                'abdeckungsluecke': 'Organisationen ohne erfasste aktuelle Beziehung sind eine '
                                    'Abdeckungslücke der Erhebung, kein Nachweis fehlender Vernetzung.',
                'partei': 'Parteiangaben gehören zu einzelnen Personen. Aus ihnen lässt sich '
                          'keine Parteizugehörigkeit der Organisation ableiten.',
                'historie': 'Historische Beziehungen liegen im Datenpaket nur als Zahl je '
                            'Organisation vor. Sie werden getrennt ausgewiesen und nie mit '
                            'aktuellen Beziehungen vermischt.',
                'cluster': 'Clusterlabels sind deskriptive Kurzbezeichnungen nach den '
                           'enthaltenen Organisationen, keine politische Bewertung.',
                'quellen': 'Angezeigt werden Herausgeber, Titel, Quellentyp, Rang, Güte und '
                           'Datum. Die interne Kennung steht nur als Zusatz im Auditbereich '
                           'und ist nie die einzige sichtbare Quellenangabe.',
                'quelleFehlt': 'Quellenangabe im Datenexport nicht gefunden',
            },
        },
        'cluster': cluster_liste,
        'obergruppen': sorted(set(o['obergruppe'] for o in organisationen.values())),
        'woerterbuecher': dict((name, list(buch)) for name, buch in woerterbuecher.items()),
        'quellen': [ohne_leere(q) for q in quellen.values()],
        'organisationen': [ohne_leere(o) for o in organisationen.values()],
        'personen': personen_json,
        'kanten': kanten_json,
        'projektion': {'g2': paare_json(g2_paare), 'g3': paare_json(g3_paare)},
        'variantengruppen': zusammenfuehrungen,
    }

    if not os.path.isdir(AUSGABE):
        os.makedirs(AUSGABE)
    pfad_ausgabe = os.path.join(AUSGABE, 'ngo-netzwerk.json')
    with io.open(pfad_ausgabe, 'w', encoding='utf-8') as datei:
        datei.write(json.dumps(daten, ensure_ascii=False, separators=(',', ':')))

    pfad_ziel = os.path.join(ZIEL, 'ngo-netzwerk.json')
    with io.open(pfad_ausgabe, encoding='utf-8') as quelle:
        inhalt = quelle.read()
    with io.open(pfad_ziel, 'w', encoding='utf-8') as datei:
        datei.write(inhalt)

    groesse = os.path.getsize(pfad_ziel) / 1024.0
    print('')
    print('geschrieben: %s (%.0f KB)' % (os.path.relpath(pfad_ausgabe, WURZEL), groesse))
    print('kopiert nach: %s' % os.path.relpath(pfad_ziel, WURZEL))
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
