import sys, json
  from datetime import datetime, timezone, timedelta

  def main():
      if len(sys.argv) < 3 or not sys.argv[1].strip() or not sys.argv[2].strip():
          print('Fehler: URL und Text werden benoetigt.')
          sys.exit(1)

      tweet_url = sys.argv[1].strip().replace('twitter.com', 'x.com')
      text = sys.argv[2].strip()

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
          'url':   tweet_url
      }

      with open('data/latest-post.json', 'w', encoding='utf-8') as f:
          json.dump(post, f, ensure_ascii=False, indent=2)

      print(f'Aktualisiert: {titel}')

  main()
