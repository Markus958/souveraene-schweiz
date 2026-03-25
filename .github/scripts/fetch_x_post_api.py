import sys, json, os, urllib.request
from datetime import datetime, timezone, timedelta

BEARER_TOKEN = ''.join(os.environ.get('X_BEARER_TOKEN', '').split())
USERNAME     = 'MLLW58'
OUTPUT       = 'data/latest-post.json'
MONATE       = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni',
                 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.']

def api_get(url):
    req = urllib.request.Request(url, headers={
        'Authorization': 'Bearer ' + BEARER_TOKEN,
        'User-Agent':    'fetch-x-post/1.0'
    })
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

BASE_URL = 'https://api.x.com/2/'

def get_user_id():
    data = api_get(BASE_URL + 'users/by/username/' + USERNAME)
    return data['data']['id']

def get_latest_tweet(user_id):
    url = (
        BASE_URL + 'users/' + user_id + '/tweets'
        '?max_results=5&tweet.fields=created_at,text&exclude=retweets,replies'
    )
    tweets = api_get(url).get('data', [])
    return tweets[0] if tweets else None

def format_datum(iso_str):
    try:
        dt = datetime.fromisoformat(iso_str.replace('Z', '+00:00'))
        dt = dt.astimezone(timezone(timedelta(hours=1)))
        return f"{dt.day}. {MONATE[dt.month-1]} {dt.year} · {dt.strftime('%H:%M')}"
    except Exception:
        return ''

def build_post(tweet):
    raw   = tweet['text'].strip()
    lines = raw.split('\n', 1)
    titel = lines[0].strip()
    rest  = lines[1].strip() if len(lines) > 1 else ''

    if rest and len(rest) > 120:
        cut  = rest.rfind(' ', 0, 120)
        rest = rest[:cut if cut > 0 else 120] + ' …'

    return {
        'datum': format_datum(tweet.get('created_at', '')),
        'titel': titel,
        'text':  rest,
        'url':   'https://x.com/' + USERNAME + '/status/' + tweet['id']
    }

def main():
    if not BEARER_TOKEN:
        print('Fehler: X_BEARER_TOKEN nicht gesetzt.')
        sys.exit(1)

    tweet = get_latest_tweet(get_user_id())
    if not tweet:
        print('Kein Tweet gefunden.')
        sys.exit(0)

    post = build_post(tweet)

    try:
        with open(OUTPUT, encoding='utf-8') as f:
            if json.load(f).get('url') == post['url']:
                print('Kein neuer Post.')
                sys.exit(0)
    except Exception:
        pass

    os.makedirs('data', exist_ok=True)
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(post, f, ensure_ascii=False, indent=2)

    print('Aktualisiert: ' + post['titel'])

main()
