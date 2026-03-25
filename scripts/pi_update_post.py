import re, sys, json, html, urllib.request, logging
from datetime import datetime, timezone, timedelta
from xml.etree import ElementTree as ET
import os, base64

LOG = os.path.expanduser('~/mllw58/update_x_post.log')
REPO = 'Markus958/souveraene-schweiz'
FILE = 'data/latest-post.json'
TOKEN = os.environ.get('GITHUB_TOKEN', '')
NITTER = [
    'https://nitter.privacydev.net/MLLW58/rss',
    'https://nitter.poast.org/MLLW58/rss',
    'https://nitter.1d4.us/MLLW58/rss',
    'https://nitter.unixfox.eu/MLLW58/rss',
]
MONATE = [
    'Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni',
    'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'
]

logging.basicConfig(
    filename=LOG, level=logging.INFO,
    format='%(asctime)s %(message)s', datefmt='%Y-%m-%d %H:%M'
)

def log(msg):
    logging.info(msg)
    print(msg)

def trim_log():
    try:
        lines = open(LOG).readlines()
        if len(lines) > 500:
            open(LOG, 'w').writelines(lines[-500:])
    except Exception:
        pass

def fetch_rss():
    for url in NITTER:
        try:
            req = urllib.request.Request(
                url, headers={'User-Agent': 'Mozilla/5.0'}
            )
            with urllib.request.urlopen(req, timeout=12) as r:
                data = r.read()
            log('RSS OK: ' + url)
            return data
        except Exception as e:
            log('RSS Fehler ' + url + ': ' + str(e))
    return None

def fix_link(raw):
    return re.sub(r'https://[^/]+/', 'https://x.com/', raw)

def parse(xml):
    root = ET.fromstring(xml)
    item = root.find('channel/item')
    if item is None:
        return None
    title = html.unescape(item.findtext('title', '').strip())
    link = fix_link(item.findtext('link', '').strip())
    raw_desc = item.findtext('description', '')
    desc = html.unescape(re.sub(r'<[^>]+>', ' ', raw_desc)).strip()
    desc = re.sub(r'\s+', ' ', desc)
    text = desc if desc and desc != title else title
    try:
        dt = datetime.strptime(
            item.findtext('pubDate', ''), '%a, %d %b %Y %H:%M:%S %z'
        )
        dt = dt.astimezone(timezone(timedelta(hours=1)))
        datum = (
            str(dt.day) + '. ' + MONATE[dt.month - 1] +
            ' ' + str(dt.year) + ' · ' + dt.strftime('%H:%M')
        )
    except Exception:
        datum = ''
    return {'datum': datum, 'titel': title, 'text': text, 'url': link}

def github_get():
    url = 'https://api.github.com/repos/' + REPO + '/contents/' + FILE
    req = urllib.request.Request(url, headers={
        'Authorization': 'token ' + TOKEN,
        'User-Agent': 'pi-script'
    })
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())

def github_put(post, sha):
    content = base64.b64encode(
        json.dumps(post, ensure_ascii=False, indent=2).encode()
    ).decode()
    body = json.dumps({
        'message': 'Auto: neuester Post aktualisiert',
        'content': content,
        'sha': sha
    }).encode()
    url = 'https://api.github.com/repos/' + REPO + '/contents/' + FILE
    req = urllib.request.Request(url, data=body, method='PUT', headers={
        'Authorization': 'token ' + TOKEN,
        'Content-Type': 'application/json',
        'User-Agent': 'pi-script'
    })
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.status

try:
    trim_log()
    xml = fetch_rss()
    if not xml:
        log('Kein RSS erreichbar.')
        sys.exit(0)
    post = parse(xml)
    if not post:
        log('Parse fehlgeschlagen.')
        sys.exit(0)
    gh = github_get()
    current = json.loads(base64.b64decode(gh['content']))
    if current.get('url') == post['url']:
        log('Kein neuer Post.')
    else:
        status = github_put(post, gh['sha'])
        log('Aktualisiert (' + str(status) + '): ' + post['titel'])
except Exception as e:
    log('Fehler: ' + str(e))
