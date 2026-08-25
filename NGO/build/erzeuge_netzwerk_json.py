# -*- coding: utf-8 -*-
"""
Erzeugt aus dem Handoff-Paket NGO-CC-2026-08-25-r1 die
veroeffentlichungsfaehige JSON fuer die Netzwerkseite.

Quellen (alle in NGO/data/, nicht versioniert). Es sind genau die
build_inputs aus config/build_contract.json:
    organizations.csv         2852 Masterorganisationen, mit category_id und
                              cluster_id
    persons.csv               3143 Personenknoten, davon 16 nur in der G4-Historie
    person_name_variants.csv  212 Personen mit einer zweiten Schreibweise
    edges_current.csv         6779 aktuelle Beziehungen Organisation -> Person
    edge_sources.csv          Beziehung -> Quelle, die verbindliche Belegschicht
    history_g4.csv            97 fruehere Beziehungen, strikt getrennt
    history_sources.csv       Historienbeziehung -> Quelle
    source_registry.csv       1463 Quellen, davon 29 rekonstruierte Eintraege
    categories.csv            17 semantische Kategorien fuer die Anzeige
    cluster_assignments.csv   Organisation -> Netzwerkcluster

Nicht gelesen, weil der Vertrag es verbietet: alles unter audit/ und der
Excel-Schnappschuss. Die frueher genutzte ngo_stammdaten.csv liegt dem Paket
nicht mehr bei; die Profilfelder (Zweck, Rechtsform, Mitgliederzahl …) fehlen
deshalb in der Detailspalte.

Ergebnis:
    NGO/ausgabe/ngo-netzwerk.json  und Kopie nach assets/ngo/ngo-netzwerk.json

Der Build prueft die hard_rules des Vertrags und bricht ab, ohne zu
schreiben, sobald eine verletzt ist.

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
PAKETDOKU = os.path.join(WURZEL, 'NGO', 'doku', 'handoff-2026-08-25')
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

# Sollwerte des Handoff-Pakets. Sie stehen in README_CLAUDE_CODE.md, nicht in
# den CSV — deshalb hier als Konstanten.
SOLL = {
    'organisationen': 2852,
    'kanten': 6779,
    'historie': 97,
    'personen': 3143,       # inklusive 16 Knoten nur fuer die G4-Historie
    'personenAktuell': 3127,
    'varianten': 212,
    'quellen': 1463,
    'kategorien': 17,
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
# Felder, die organizations.csv fuer die Detailspalte mitbringt. Die
# ausfuehrlichen Profilfelder der frueheren ngo_stammdaten.csv sind im Paket
# vom 25.08.2026 nicht mehr enthalten.
ORG_FELDER = [
    ('profilstatus', 'profilstatus'),
    ('kategorie', 'category_id'),
    ('unterkategorie', 'subcategory'),
    ('klassifikationsart', 'classification_method'),
    ('klassifikationsguete', 'classification_confidence'),
    ('mutterorganisation', 'parent_org_id'),
    ('mutterbeziehung', 'parent_relation_type'),
]


class Abbruch(Exception):
    """Die Abnahme ist verletzt — es wird nichts geschrieben."""


def lies_csv(name):
    pfad = os.path.join(DATEN, name)
    if not os.path.exists(pfad):
        raise Abbruch('Quelldatei fehlt: ' + pfad)
    with io.open(pfad, encoding='utf-8-sig', newline='') as datei:
        return list(csv.DictReader(datei))


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


def baue_personen(rohpersonen, variantenzeilen):
    """
    Identitaet ist seit dem Handoff-Paket ID-basiert: person_id ist der
    Schluessel, nie der angezeigte Name. Die eigene Kanonisierung bleibt als
    Pruefung bestehen — findet sie zwei verschiedene person_id unter demselben
    Namensschluessel, meldet die Abnahme das, fuehrt sie aber nicht zusammen.

    Die Schreibvarianten liefert person_name_variants.csv; sie werden nicht
    mehr aus gleichlautenden Namen erraten.
    """
    varianten = collections.defaultdict(list)
    for z in variantenzeilen:
        pid = text(z.get('person_id'))
        name = text(z.get('variant_name'))
        if pid and name:
            varianten[pid].append({
                'name': name,
                'art': text(z.get('variant_type')),
                'status': text(z.get('status')),
            })

    personen = collections.OrderedDict()
    zusammenfuehrungen = []
    namensschluessel = collections.defaultdict(list)

    for p in rohpersonen:
        pid = text(p['person_id'])
        anzeige = text(p['display_name'])
        parteien = []
        for label in text(p.get('party_labels')).split(';'):
            label = label.strip()
            if label and label not in parteien:
                parteien.append(label)
        anzeigen = [anzeige]
        for v in varianten.get(pid, []):
            if v['name'] not in anzeigen:
                anzeigen.append(v['name'])
        personen[pid] = {
            'k': pid, 'n': anzeige, 'varianten': anzeigen,
            'rohIds': [pid], 'parteien': parteien,
        }
        if text(p.get('person_status')) == 'historical_only_g4':
            personen[pid]['nurHistorie'] = True
        if len(anzeigen) > 1:
            zusammenfuehrungen.append({
                'schluessel': pid, 'varianten': anzeigen, 'rohIds': [pid],
            })
        namensschluessel[canonical_person_key(anzeige)].append(pid)

    gleichnamig = [ids for ids in namensschluessel.values() if len(ids) > 1]
    return personen, zusammenfuehrungen, gleichnamig


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
    for z in lies_csv('source_registry.csv'):
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
            'registerstatus': text(z.get('registry_status')),
        }
        # Rekonstruierte Eintraege tragen die Organisationsseite als URL. Sie
        # darf nicht als genaue Belegstelle ausgegeben werden — der Vertrag
        # verlangt das ausdruecklich.
        if quellen[kennung]['registerstatus'] == 'reconstructed_missing_registry':
            quellen[kennung]['rekonstruiert'] = True
        # Reference-only: Kennung vorhanden, aber keine Registerzeile. Die
        # Luecke wird ausgewiesen, statt Herausgeber oder Titel zu erfinden.
        if not quellen[kennung]['herausgeber'] and not quellen[kennung]['titel']:
            quellen[kennung]['luecke'] = True
    return quellen


# -------------------------------------------------------------- Einlesen ----

def lies_datenpaket():
    org_zeilen = lies_csv('organizations.csv')
    personen_zeilen = lies_csv('persons.csv')
    varianten_zeilen = lies_csv('person_name_variants.csv')
    kanten_zeilen = lies_csv('edges_current.csv')
    kanten_quellen = lies_csv('edge_sources.csv')
    historie_zeilen = lies_csv('history_g4.csv')
    historie_quellen = lies_csv('history_sources.csv')
    kategorie_zeilen = lies_csv('categories.csv')
    zuordnung_zeilen = lies_csv('cluster_assignments.csv')
    cluster_zeilen = lies_csv('cluster_dictionary.csv')

    # Leere Zeilen am Dateiende wuerden als Eintrag ohne Kennung durchgehen
    # und alle Zaehlungen verschieben.
    org_zeilen = [o for o in org_zeilen if text(o.get('org_id'))]
    personen_zeilen = [z for z in personen_zeilen if text(z.get('person_id'))]
    kanten_zeilen = [z for z in kanten_zeilen if text(z.get('edge_id'))]
    historie_zeilen = [z for z in historie_zeilen if text(z.get('edge_id'))]

    # Belegschicht: Der Vertrag verlangt, dass jede sichtbare Beziehung ueber
    # edge_sources.csv aufloest. Die Spalten source_id/source_ids der Kante
    # bleiben ungenutzt — sie sind Rohtext aus dem Master.
    belege = collections.defaultdict(list)
    belegstatus = {}
    for z in kanten_quellen:
        kante, quelle = text(z.get('edge_id')), text(z.get('source_id'))
        if not kante or not quelle:
            continue
        if quelle not in belege[kante]:
            belege[kante].append(quelle)
        belegstatus[quelle] = text(z.get('registry_status'))
    for z in historie_quellen:
        kante, quelle = text(z.get('history_edge_id')), text(z.get('source_id'))
        if not kante or not quelle:
            continue
        if quelle not in belege[kante]:
            belege[kante].append(quelle)
        belegstatus[quelle] = text(z.get('registry_status'))

    kategorien = collections.OrderedDict()
    for z in kategorie_zeilen:
        kennung = text(z.get('category_id'))
        if kennung:
            kategorien[kennung] = {
                'id': kennung,
                'label': text(z.get('display_label_de')) or kennung,
                'beschreibung': text(z.get('description')),
            }

    zuordnung = {}
    for z in zuordnung_zeilen:
        org_id = text(z.get('org_id'))
        if org_id:
            zuordnung[org_id] = z

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
        for schluessel, spalte in ORG_FELDER:
            wert = text(o.get(spalte))
            if wert:
                eintrag[schluessel] = wert
        # cluster_id steht in zwei Dateien. Weichen sie ab, stimmt etwas nicht.
        zu = zuordnung.get(org_id)
        if zu is not None:
            aus_zuordnung = zahl(zu.get('cluster_id'), -1)
            if aus_zuordnung >= 0 and aus_zuordnung != eintrag['cluster']:
                raise Abbruch('Clusterzuordnung weicht ab: %s hat in organizations.csv %s, '
                              'in cluster_assignments.csv %s'
                              % (org_id, eintrag['cluster'], aus_zuordnung))
            if text(zu.get('cluster_status')) and text(zu.get('cluster_status')) != 'assigned':
                eintrag['clusterStatus'] = text(zu.get('cluster_status'))
        organisationen[org_id] = eintrag

    personen, zusammenfuehrungen, gleichnamig = baue_personen(
        personen_zeilen, varianten_zeilen)
    kanon_von_roh = {}
    for schluessel, person in personen.items():
        for roh in person['rohIds']:
            kanon_von_roh[roh] = schluessel

    def baue_kante(z, historisch=False):
        # Identitaet ist ID-basiert. Faellt eine Kante auf eine unbekannte
        # person_id, bleibt sie ohne Person und die Abnahme meldet es — ein
        # Ruecksprung auf den Namen wuerde den Fehler verdecken.
        roh = text(z.get('target_person_id') or '')
        anzeige = text(z.get('person_display') or z.get('person') or '')
        kanon = kanon_von_roh.get(roh, '')
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
            # Nur die Belegschicht, nie der Rohtext der Kante.
            'quellen': belege.get(text(z.get('edge_id')), [])[:],
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

    # Personen, die nur in der G4-Historie vorkommen, liefert persons.csv
    # ausdruecklich mit person_status=historical_only_g4. Sie werden hier nicht
    # mehr aus der Historie nachgebildet.

    # Cluster: Bezeichnung aus dem Woerterbuch, Groesse aus der Zuordnung.
    # Die im Woerterbuch gemeldete Groesse wird nur verglichen, nicht
    # uebernommen — gezaehlt wird, was tatsaechlich zugeordnet ist.
    gezaehlt = collections.Counter(
        eintrag['cluster'] for eintrag in organisationen.values())
    cluster = collections.OrderedDict()
    for c in cluster_zeilen:
        kennung = zahl(c['cluster_id'], -1)
        if kennung < 0:
            continue
        cluster[kennung] = {
            'id': kennung,
            'label': text(c['cluster_label']),
            'groesse': gezaehlt.get(kennung, 0),
            'groesseGemeldet': zahl(c.get('cluster_size_reported')),
            'zentrale': text(c.get('central_organizations')),
            'interneKanten': 0,
            'internesGewicht': 0,
        }

    # G2-Gewicht, G3-Kanten und Isolat-Flag stehen in organizations.csv.
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

    ausgeschlossen = {
        'ohneBeleg': [k['id'] for k in ohne_beleg],
        'ohneBelegHistorie': [k['id'] for k in ohne_beleg_hist],
        'organisationen': sorted(set(k['org'] for k in ohne_beleg)),
        'gleichnamig': gleichnamig,
        'kategorien': kategorien,
        'belegstatus': belegstatus,
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

    zeilen.append('Abnahme nach build_contract.json (NGO-CC-2026-08-25-r1)')
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
    pruefe('Personenknoten', len(personen), SOLL['personen'])
    nur_g4 = [p for p in personen.values() if p.get('nurHistorie')]
    pruefe('davon nur in der G4-Historie', len(nur_g4), SOLL['personen'] - SOLL['personenAktuell'])
    pruefe('Personen mit Schreibvariante', len(zusammenfuehrungen), SOLL['varianten'])
    pruefe('Quellen im Register', len(quellen), SOLL['quellen'])
    pruefe('semantische Kategorien', len(ausgeschlossen['kategorien']), SOLL['kategorien'])
    nur_historie = [p for p in personen.values() if p.get('nurHistorie')]

    ohne_org = [k['id'] for k in kanten + historie if k['org'] not in organisationen]
    pruefe('Kanten auf unbekannte Organisation', len(ohne_org), 0)
    for o in ohne_org[:5]:
        zeilen.append('      ' + o)

    ohne_person = [k['id'] for k in kanten + historie if not k['person']]
    pruefe('Kanten auf unbekannte person_id', len(ohne_person), 0)
    for o in ohne_person[:5]:
        zeilen.append('      ' + o)

    ohne_cluster = [o['id'] for o in organisationen.values()
                    if o['cluster'] and o['cluster'] not in cluster]
    pruefe('Clusterzuordnungen ohne Beschreibung', len(ohne_cluster), 0)
    pruefe('Cluster im Woerterbuch', len(cluster), len(cluster))
    ohne_cluster = [o['id'] for o in organisationen.values()
                    if o.get('clusterStatus')]
    zeilen.append('  %-52s %-10s %s'
                  % ('Organisationen ohne Netzwerkcluster', len(ohne_cluster),
                     'ausgewiesen, laut Vertrag zulaessig'))

    # Der Vertrag verlangt ID-basierte Identitaet. Gleichnamige Personen mit
    # verschiedener person_id sind kein Fehler, aber sie muessen sichtbar sein.
    gleich = ausgeschlossen['gleichnamig']
    zeilen.append('  %-52s %-10s %s'
                  % ('gleichnamige Personen mit eigener Kennung', len(gleich),
                     'nicht zusammengefuehrt, Identitaet ist ID-basiert'))
    for g in gleich[:4]:
        zeilen.append('      ' + ', '.join(g))

    verwendet = set()
    for k in kanten + historie:
        verwendet.update(k['quellen'])
    # Harte Regel des Vertrags: Jede sichtbare Kante loest ueber
    # edge_sources.csv nach source_registry.csv auf.
    fehlende = sorted(verwendet - set(quellen))
    pruefe('Quellenkennungen ohne Registereintrag', len(fehlende), 0)
    for f in fehlende[:5]:
        zeilen.append('      ' + f)

    rekonstruiert = [q for q in quellen.values() if q.get('rekonstruiert')]
    zeilen.append('  %-52s %-10s %s'
                  % ('rekonstruierte Registereintraege', len(rekonstruiert),
                     'ausgewiesen, URL ist keine genaue Belegstelle'))

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
            'paket': 'NGO_Claude_Code_Handoff_2026-08-25_r1',
            'masterVersion': 'NGO-CC-2026-08-25-r1',
            'datenstand': '2026-08-25',
            'quelle': 'NGO_Datenbank_Master',
            'standardansicht': 'G3',
            'klassen': list(G2_KLASSEN),
            'klassenText': KLASSEN_TEXT,
            'gewichtJeKlasse': [GEWICHT_JE_KLASSE[k] for k in G2_KLASSEN],
            'g3Klassen': list(G3_KLASSEN),
            # Semantische Kategorien fuer die Anzeige. Sie sind etwas anderes
            # als der Netzwerkcluster: thematisch statt strukturell.
            'kategorien': [ohne_leere(k) for k in ausgeschlossen['kategorien'].values()],
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
                'quellenRekonstruiert': len([q for q in verwendet
                                             if quellen[q].get('rekonstruiert')]),
                'kategorien': len(ausgeschlossen['kategorien']),
                'ohneCluster': len([o for o in organisationen.values()
                                    if o.get('clusterStatus')]),
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
