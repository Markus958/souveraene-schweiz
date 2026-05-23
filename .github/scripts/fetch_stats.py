import os
import csv
import json
import sys
import requests
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

TOKEN = os.environ.get('GOATCOUNTER_TOKEN', '')
BASE  = 'https://souveraene-schweiz.goatcounter.com/api/v0'
HDR   = {'Authorization': f'Bearer {TOKEN}'}

if not TOKEN:
    print('FEHLER: GOATCOUNTER_TOKEN ist nicht gesetzt', file=sys.stderr)
    sys.exit(1)

print(f'Token vorhanden: {TOKEN[:6]}…{TOKEN[-4:]}')

today = datetime.utcnow().date()

periods = {
    'last1':   (today,                        today + timedelta(days=1)),
    'last7':   (today - timedelta(days=7),   today),
    'last30':  (today - timedelta(days=30),  today),
    'last90':  (today - timedelta(days=90),  today),
    'last180': (today - timedelta(days=180), today),
    'last365': (today - timedelta(days=365), today),
}

def fetch_hits(start, end, limit=100):
    url = f'{BASE}/stats/hits'
    params = {'limit': limit, 'start': start.isoformat(), 'end': end.isoformat()}
    print(f'GET {url} {params}')
    r = requests.get(url, headers=HDR, params=params, timeout=30)
    print(f'  → HTTP {r.status_code}')
    if not r.ok:
        print(f'  → Response: {r.text[:300]}', file=sys.stderr)
    r.raise_for_status()
    return r.json().get('hits', [])

def slim(hits):
    result = []
    for h in hits:
        views = sum(v for day in h.get('stats', []) for v in day.get('hourly', []))
        entry = {
            'path':  h['path'],
            'title': h.get('title', ''),
            'count': views,
        }
        cu = h.get('count_unique')
        if cu is not None:
            entry['unique'] = cu
        result.append(entry)
    return result

def fetch_total(start, end):
    url = f'{BASE}/stats/total'
    params = {'start': start.isoformat(), 'end': end.isoformat()}
    print(f'GET {url} {params}')
    r = requests.get(url, headers=HDR, params=params, timeout=30)
    print(f'  → HTTP {r.status_code}')
    if not r.ok:
        print(f'  → Response: {r.text[:300]}', file=sys.stderr)
        return None
    data   = r.json()
    views  = data.get('total', 0)
    events = data.get('total_events', 0) or 0
    print(f'  → total={views} total_events={events}')
    return {'views': views, 'events': events, 'pageviews': views - events}

def categorize(hits):
    pages    = [h for h in hits if not h['path'].startswith(('media/', 'outbound/', 'km/'))]
    media    = sorted([h for h in hits if h['path'].startswith('media/')],    key=lambda x: x.get('count', 0), reverse=True)
    outbound = sorted([h for h in hits if h['path'].startswith('outbound/')], key=lambda x: x.get('count', 0), reverse=True)
    km       = sorted([h for h in hits if h['path'].startswith('km/')],       key=lambda x: x.get('count', 0), reverse=True)
    return {
        'pages':    slim(pages[:10]),
        'media':    slim(media[:10]),
        'outbound': slim(outbound[:10]),
        'km':       slim(km[:20]),
    }

now_ch = datetime.now(ZoneInfo('Europe/Zurich'))
stats  = {'updated': now_ch.strftime('%d.%m.%Y %H:%M')}

km_raw_last1 = []

for key, (start, end) in periods.items():
    hits  = fetch_hits(start, end)
    total = fetch_total(start, end)
    stats[key] = categorize(hits)
    if key == 'last1':
        km_raw_last1 = [h for h in hits if h['path'].startswith('km/')]
    if total:
        stats[key]['total'] = total
    stats[key]['period'] = f'{start.strftime("%d.%m.%Y")} – {end.strftime("%d.%m.%Y")}'
    if total:
        print(f'{key}: {total["pageviews"]} Seitenaufrufe + {total["events"]} Events = {total["views"]} total')
    else:
        print(f'{key}: {len(hits)} Pfade (total nicht verfügbar)')

with open('assets/stats.json', 'w', encoding='utf-8') as f:
    json.dump(stats, f, ensure_ascii=False, indent=2)

print('OK – stats.json gespeichert')

# ── km-log.csv: stündliches Logfile der Kostenmodul-Nutzung ──
def update_km_log(km_raw):
    log_path   = Path('assets/km-log.csv')
    utc_offset = int(now_ch.utcoffset().total_seconds() // 3600)
    today_ch   = now_ch.date()

    # Bestehende Zeilen lesen; nur Tage VOR heute behalten (heute wird neu berechnet)
    existing = []
    if log_path.exists():
        with open(log_path, newline='', encoding='utf-8') as f:
            for row in csv.DictReader(f):
                try:
                    parts    = row.get('datum', '').split('.')
                    row_date = datetime(int(parts[2]), int(parts[1]), int(parts[0])).date()
                    if row_date < today_ch:
                        row.setdefault('uhrzeit', '')  # Migration alter Zeilen ohne Uhrzeit
                        existing.append(row)
                except (ValueError, IndexError):
                    pass

    # Nur Gemeinde-Events, stündlich aufgelöst
    today_rows = []
    for h in km_raw:
        path = h['path']
        if not path.startswith('km/gemeinde/'):
            continue
        gemeinde = path.replace('km/gemeinde/', '')

        for day_stat in h.get('stats', []):
            day_str = day_stat.get('day', '')[:10]  # YYYY-MM-DD
            try:
                y, m, d = int(day_str[:4]), int(day_str[5:7]), int(day_str[8:10])
            except (ValueError, IndexError):
                continue
            for hour_utc, count in enumerate(day_stat.get('hourly', [])):
                if count > 0:
                    dt_ch = datetime(y, m, d, hour_utc) + timedelta(hours=utc_offset)
                    today_rows.append({
                        'datum':    dt_ch.strftime('%d.%m.%Y'),
                        'uhrzeit':  dt_ch.strftime('%H:00'),
                        'gemeinde': gemeinde,
                        'anzahl':   count,
                    })

    all_rows = existing + today_rows
    if all_rows:
        with open(log_path, 'w', newline='', encoding='utf-8') as f:
            w = csv.DictWriter(f, fieldnames=['datum', 'uhrzeit', 'gemeinde', 'anzahl'],
                               extrasaction='ignore')
            w.writeheader()
            w.writerows(all_rows)
        print(f'km-log.csv: {len(today_rows)} Stundeneintr. heute, {len(existing)} historische Zeilen')
    else:
        print('km-log.csv: noch keine km-Events vorhanden')

update_km_log(km_raw_last1)

# ── km-countries.csv: tägliche Länderherkunft der Kostenmodul-Aufrufe ──
def fetch_km_countries(start, end):
    url = f'{BASE}/stats/countries'
    params = {'start': start.isoformat(), 'end': end.isoformat(), 'limit': 100, 'filter': 'km/'}
    print(f'GET {url} {params}')
    r = requests.get(url, headers=HDR, params=params, timeout=30)
    print(f'  → HTTP {r.status_code}')
    if not r.ok:
        print(f'  → Response: {r.text[:300]}', file=sys.stderr)
        return []
    return r.json().get('countries', [])

def update_km_countries(countries_raw):
    log_path  = Path('assets/km-countries.csv')
    today_str = now_ch.strftime('%d.%m.%Y')

    existing = []
    if log_path.exists():
        with open(log_path, newline='', encoding='utf-8') as f:
            for row in csv.DictReader(f):
                if row.get('datum') != today_str:
                    existing.append(row)

    today_rows = [
        {'datum': today_str, 'land': c.get('id', '?'), 'anzahl': c.get('count', 0)}
        for c in countries_raw if c.get('count', 0) > 0
    ]

    all_rows = existing + today_rows
    if all_rows:
        with open(log_path, 'w', newline='', encoding='utf-8') as f:
            w = csv.DictWriter(f, fieldnames=['datum', 'land', 'anzahl'])
            w.writeheader()
            w.writerows(all_rows)
        print(f'km-countries.csv: {len(today_rows)} Länder heute, {len(existing)} historische Zeilen')
    else:
        print('km-countries.csv: noch keine Länderdaten vorhanden')

countries_km = fetch_km_countries(today, today + timedelta(days=1))
update_km_countries(countries_km)
