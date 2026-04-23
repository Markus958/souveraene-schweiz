import sys, json, os, urllib.request, urllib.error
from datetime import datetime, timezone, timedelta

BEARER_TOKEN = ''.join(os.environ.get('X_BEARER_TOKEN', '').split())
USER_ID_ENV  = os.environ.get('X_USER_ID', '').strip()
USERNAME     = 'MLLW58'
OUTPUT       = 'data/latest-post.json'
MONATE       = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni',
                 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.']
BASE_URL     = 'https://api.x.com/2/'

def api_get(url):
    req = urllib.request.Request(url, headers={
        'Authorization': 'Bearer ' + BEARER_TOKEN,
        'User-Agent':    'fetch-x-post/1.0'
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read()), r.status
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        print('HTTP ' + str(e.code) + ' für ' + url)
        print('Body: ' + body[:500])
        raise

def get_user_id():
    if USER_ID_ENV:
        print('User-ID aus Env-Var: ' + USER_ID_ENV)
        return USER_ID_ENV
    print('X_USER_ID nicht gesetzt — hole via API (kostet 1 Extra-Call).')
    data, _ = api_get(BASE_URL + 'users/by/username/' + USERNAME)
    uid = data['data']['id']
    print('>>> User-ID für ' + USERNAME + ': ' + uid)
    print('>>> Als Repo-Variable X_USER_ID speichern, um diesen Call einzusparen.')
    return uid

def load_since_id():
    try:
        with open(OUTPUT, encoding='utf-8') as f:
            url = json.load(f).get('url', '')
            parts = url.rstrip('/').split('/')
            if parts[-2] == 'status':
                return parts[-1].split('?')[0]
    except Exception:
        pass
    return None

def fetch_timeline(user_id, params):
    url = BASE_URL + 'users/' + user_id + '/tweets' + params
    data, _ = api_get(url)
    return data

def diagnose(user_id):
    print('--- DIAGNOSE: rufe Timeline ohne since_id/exclude ab ---')
    params = '?max_results=5&tweet.fields=created_at,text,referenced_tweets,in_reply_to_user_id'
    data = fetch_timeline(user_id, params)
    tweets = data.get('data', [])
    print('Erhaltene Tweets: ' + str(len(tweets)))
    for t in tweets:
        refs = t.get('referenced_tweets', [])
        types = [r.get('type') for r in refs]
        print('  id=' + t['id']
              + '  created=' + t.get('created_at', '')
              + '  reply_to_user=' + str(t.get('in_reply_to_user_id'))
              + '  refs=' + str(types)
              + '  text=' + t.get('text', '')[:60].replace('\n', ' ') + '...')

def get_latest_tweet(user_id):
    since_id = load_since_id()
    params = '?max_results=5&tweet.fields=created_at,text&exclude=retweets,replies'
    if since_id:
        params += '&since_id=' + since_id
        print('since_id=' + since_id)
    data = fetch_timeline(user_id, params)
    tweets = data.get('data', [])
    print('Gefilterte Tweets: ' + str(len(tweets)))
    if not tweets:
        diagnose(user_id)
        return None
    return tweets[0]

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
        print('Kein passender Tweet gefunden (siehe Diagnose oben).')
        sys.exit(0)

    post = build_post(tweet)
    os.makedirs('data', exist_ok=True)
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(post, f, ensure_ascii=False, indent=2)

    print('Aktualisiert: ' + post['titel'])

main()
