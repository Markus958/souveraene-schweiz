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
start = (today - timedelta(days=30)).isoformat()
end   = today.isoformat()

print(f'Zeitraum: {start} bis {end}')

def fetch(endpoint, params=None):
    url = f'{BASE}/{endpoint}'
    print(f'GET {url} params={params}')
    r = requests.get(url, headers=HDR, params=params or {}, timeout=15)
    print(f'  → HTTP {r.status_code}')
    if not r.ok:
        print(f'  → Response: {r.text[:500]}', file=sys.stderr)
    r.raise_for_status()
    return r.json()

hits_raw  = fetch('stats/hits', {'limit': 50, 'start': start, 'end': end})
hits      = hits_raw.get('hits', [])
print(f'Hits erhalten: {len(hits)}')

refs_raw  = fetch('stats/refs', {'limit': 10, 'start': start, 'end': end})
refs      = refs_raw.get('refs', [])
print(f'Refs erhalten: {len(refs)}')

pages    = [h for h in hits if not h['path'].startswith(('media/', 'outbound/'))]
media    = sorted([h for h in hits if h['path'].startswith('media/')],    key=lambda x: x.get('count', 0), reverse=True)
outbound = sorted([h for h in hits if h['path'].startswith('outbound/')], key=lambda x: x.get('count', 0), reverse=True)

stats = {
    'updated': datetime.utcnow().strftime('%d.%m.%Y %H:%M UTC'),
    'period':  f'{start} bis {end}',
    'pages':    pages[:10],
    'media':    media[:10],
    'outbound': outbound[:10],
    'refs':     refs[:10],
}

with open('assets/stats.json', 'w', encoding='utf-8') as f:
    json.dump(stats, f, ensure_ascii=False, indent=2)

print(f'OK – {len(pages)} Seiten, {len(media)} Media, {len(outbound)} Outbound, {len(refs)} Referrer')
