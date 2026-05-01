import os
import json
import sys
import requests
from datetime import datetime, timedelta

TOKEN = os.environ.get('GOATCOUNTER_TOKEN', '')
BASE  = 'https://souveraene-schweiz.goatcounter.com/api/v0'
HDR   = {'Authorization': f'Bearer {TOKEN}'}

if not TOKEN:
    print('FEHLER: GOATCOUNTER_TOKEN ist nicht gesetzt', file=sys.stderr)
    sys.exit(1)

print(f'Token vorhanden: {TOKEN[:6]}…{TOKEN[-4:]}')

today = datetime.utcnow().date()

periods = {
    'last1':   (today - timedelta(days=1),   today),
    'last7':   (today - timedelta(days=7),   today),
    'last30':  (today - timedelta(days=30),  today),
    'last90':  (today - timedelta(days=90),  today),
    'last180': (today - timedelta(days=180), today),
    'last365': (today - timedelta(days=365), today),
}

def fetch_hits(start, end, limit=200):
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
    if hits:
        h0 = hits[0]
        print(f'DEBUG first hit keys: {list(h0.keys())}')
        print(f'DEBUG count={h0.get("count")} count_unique={h0.get("count_unique")} path={h0.get("path")}')
    result = []
    for h in hits:
        views = sum(v for day in h.get('stats', []) for v in day.get('hourly', []))
        result.append({
            'path':   h['path'],
            'title':  h.get('title', ''),
            'count':  views,
            'unique': h.get('count_unique', h.get('count', 0))
        })
    return result

def categorize(hits):
    pages    = [h for h in hits if not h['path'].startswith(('media/', 'outbound/'))]
    media    = sorted([h for h in hits if h['path'].startswith('media/')],    key=lambda x: x.get('count', 0), reverse=True)
    outbound = sorted([h for h in hits if h['path'].startswith('outbound/')], key=lambda x: x.get('count', 0), reverse=True)
    return {
        'pages':    slim(pages[:10]),
        'media':    slim(media[:10]),
        'outbound': slim(outbound[:10]),
    }

stats = {'updated': datetime.utcnow().strftime('%d.%m.%Y %H:%M UTC')}

for key, (start, end) in periods.items():
    hits = fetch_hits(start, end, limit=200)
    stats[key] = categorize(hits)
    stats[key]['period'] = f'{start.strftime("%d.%m.%Y")} – {end.strftime("%d.%m.%Y")}'
    print(f'{key}: {len(hits)} Hits')

with open('assets/stats.json', 'w', encoding='utf-8') as f:
    json.dump(stats, f, ensure_ascii=False, indent=2)

print('OK – stats.json gespeichert')
