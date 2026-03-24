import re, sys, html as html_module
from datetime import datetime, timezone, timedelta
from xml.etree import ElementTree as ET
import urllib.request

USERNAME = 'MLLW58'

RSS_URLS = [
    f'https://nitter.privacydev.net/{USERNAME}/rss',
    f'https://nitter.poast.org/{USERNAME}/rss',
    f'https://nitter.1d4.us/{USERNAME}/rss',
    f'https://nitter.unixfox.eu/{USERNAME}/rss',
    f'https://rsshub.app/twitter/user/{USERNAME}',
]

print(f'Python {sys.version}')
print(f'Versuche RSS für @{USERNAME} abzurufen ...')

def fetch_rss():
    for url in RSS_URLS:
        try:
            req = urllib.request.Request(
                url,
                headers={'User-Agent': 'Mozilla/5.0 (compatible; RSS-reader)'}
            )
            with urllib.request.urlopen(req, timeout=12) as r:
                data = r.read()
            print(f'RSS geladen: {url}')
            return data
        except Exception as e:
            print(f'Fehler bei {url}: {e}')
    return None

def run():
    xml_data = fetch_rss()
    if not xml_data:
        print('Kein RSS-Feed erreichbar – keine Änderung.')
        return

    root = ET.fromstring(xml_data)
    channel = root.find('channel')
    if channel is None:
        print('Ungültiges RSS-Format.')
        return
    item = channel.find('item')
    if item is None:
        print('Kein Item im Feed.')
        return

    raw_title = item.findtext('title', '').strip()
    link      = item.findtext('link', '').strip()
    raw_desc  = item.findtext('description', '').strip()

    desc_text = re.sub(r'<[^>]+>', ' ', raw_desc)
    desc_text = re.sub(r'\s+', ' ', desc_text).strip()
    desc_text = html_module.unescape(desc_text)
    titel     = html_module.unescape(raw_title)
    teaser    = desc_text if desc_text and desc_text != titel else titel

    pub_date = item.findtext('pubDate', '').strip()
    monate = ['Jan.','Feb.','März','Apr.','Mai','Juni',
              'Juli','Aug.','Sep.','Okt.','Nov.','Dez.']
    try:
        dt = datetime.strptime(pub_date, '%a, %d %b %Y %H:%M:%S %z')
        dt = dt.astimezone(timezone(timedelta(hours=1)))
        datum = f"{dt.day}. {monate[dt.month-1]} {dt.year} · {dt.strftime('%H:%M')}"
    except Exception as e:
        print(f'Datum-Parsing fehlgeschlagen: {e}')
        datum = pub_date[:16] if pub_date else ''

    print(f'Titel: {titel}')
    print(f'Datum: {datum}')
    print(f'Link:  {link}')

    def js(s):
        return s.replace('\\', '\\\\').replace("'", "\\'")

    new_block = (
        "  var LETZTER_POST = {\n"
        f"    datum: '{js(datum)}',\n"
        f"    titel: '{js(titel)}',\n"
        f"    text:  '{js(teaser)}',\n"
        f"    url:   '{link}'\n"
        "  };"
    )

    with open('index.html', 'r', encoding='utf-8') as f:
        html_content = f.read()

    updated = re.sub(
        r'var LETZTER_POST = \{.*?\};',
        new_block,
        html_content,
        flags=re.DOTALL
    )

    if updated == html_content:
        print('Bereits aktuell – kein Commit nötig.')
        return

    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(updated)
    print(f'Aktualisiert: {titel}')

try:
    run()
except Exception as e:
    print(f'Fehler: {e}')

sys.exit(0)
