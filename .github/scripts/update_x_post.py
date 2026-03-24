import sys, json, re, html as html_module, urllib.parse
from datetime import datetime, timezone, timedelta
import urllib.request

def fetch_oembed(tweet_url):
    url = 'https://publish.twitter.com/oembed?url=' + urllib.parse.quote(tweet_url) + '&omit_script=true'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (compatible)'})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())

def extract_text(embed_html):
    m = re.search(r'<p[^>]*>(.*?)</p>', embed_html, re.DOTALL)
    if not m:
        return ''
    text = re.sub(r'<[^>]+>', ' ', m.group(1))
    text = re.sub(r'\s+', ' ', text).strip()
    return html_module.unescape(text)

def main():
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        print('Keine Tweet-URL angegeben.')
        sys.exit(0)

    tweet_url = sys.argv[1].strip()
    print(f'Verarbeite: {tweet_url}')

    try:
        data = fetch_oembed(tweet_url)
    except Exception as e:
        print(f'oEmbed-Fehler: {e}')
        sys.exit(0)

    text = extract_text(data.get('html', ''))
    if not text:
        print('Kein Text im oEmbed gefunden.')
        sys.exit(0)

    # Erste ~120 Zeichen als Titel
    if len(text) > 120:
        cut = text.rfind(' ', 0, 120)
        titel = text[:cut if cut > 0 else 120] + ' …'
    else:
        titel = text

    dt = datetime.now(timezone(timedelta(hours=1)))
    monate = ['Jan.','Feb.','März','Apr.','Mai','Juni',
              'Juli','Aug.','Sep.','Okt.','Nov.','Dez.']
    datum = f"{dt.day}. {monate[dt.month-1]} {dt.year} · {dt.strftime('%H:%M')}"

    post = {
        'datum': datum,
        'titel': titel,
        'text':  text,
        'url':   tweet_url.replace('twitter.com', 'x.com')
    }

    with open('data/latest-post.json', 'w', encoding='utf-8') as f:
        json.dump(post, f, ensure_ascii=False, indent=2)

    print(f'Aktualisiert: {titel}')

main()
