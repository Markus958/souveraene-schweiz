"""Generates 1200x630 OG PNG images for the 10 ch-eu pages lacking custom images."""

from PIL import Image, ImageDraw, ImageFont
import textwrap, os

W, H = 1200, 630
BG      = (26, 63, 110)
STRIPE  = (200, 16, 46)
BAR     = (18, 40, 72)
WHITE   = (255, 255, 255)
LABEL_C = (122, 155, 181)
DESC_C  = (180, 210, 230)
GRID_C  = (30, 75, 130)
MARK_C  = (40, 85, 140)

FD = 'C:/Windows/Fonts/'
F_TITLE = ImageFont.truetype(FD + 'georgiab.ttf', 76)
F_LABEL = ImageFont.truetype(FD + 'arialbd.ttf', 19)
F_DESC  = ImageFont.truetype(FD + 'arial.ttf', 27)
F_BRAND = ImageFont.truetype(FD + 'arial.ttf', 20)
F_MARK  = ImageFont.truetype(FD + 'georgiab.ttf', 220)

PAGES = [
    dict(filename='binnenmarkt-og',
         title=['Binnenmarkt &', 'technische Vorschriften'],
         desc='Marktzugang zur EU ohne doppelte Zertifizierung — für Schweizer Exporteure.'),
    dict(filename='eu-programme-og',
         title=['EU-Programme', '(Horizon, Erasmus+)'],
         desc='Assoziierung der Schweiz an Horizon Europe und Erasmus+ — an politische Bedingungen geknüpft.'),
    dict(filename='forschung-og',
         title=['Forschung / Horizon'],
         desc='Assoziierung an Horizon Europe — existenziell für Schweizer Universitäten und Forschungsinstitute.'),
    dict(filename='gesundheit-og',
         title=['Gesundheit'],
         desc='Swissmedic vs. EMA, Arzneimittelzulassung und Harmonisierung des Gesundheitsrechts.'),
    dict(filename='landwirtschaft-og',
         title=['Landwirtschaft'],
         desc='Zölle, Veterinärvorschriften und Ursprungsbezeichnungen im Landwirtschaftsabkommen.'),
    dict(filename='lebensmittelsicherheit-og',
         title=['Lebensmittel-', 'sicherheit'],
         desc='Cassis-de-Dijon-Prinzip, Kennzeichnungspflicht und Harmonisierung mit EU-Lebensmittelrecht.'),
    dict(filename='luftverkehr-og',
         title=['Luftverkehr'],
         desc='Zugang zum europäischen Luftraum — ältestes Bilaterales unter Anpassungsdruck.'),
    dict(filename='mra-og',
         title=['MRA —', 'Gegenseitige Anerkennung'],
         desc='Produktzulassungen und technische Standards ohne Doppelzertifizierung — zentraler Standortvorteil.'),
    dict(filename='querschnitt-og',
         title=['Querschnittsthemen'],
         desc='Streitbeilegung, Rechtsübernahme und direkte Demokratie im Vertragspaket.'),
    dict(filename='weltraum-og',
         title=['Weltraum'],
         desc='Copernicus und Galileo — wirtschaftliche und sicherheitspolitische Relevanz für die Schweiz.'),
]

OUT_DIR = 'assets/ch-eu'

def make_og(page):
    img = Image.new('RGBA', (W, H), (*BG, 255))

    # Subtle dot grid
    base = ImageDraw.Draw(img)
    for gx in range(80, W, 48):
        for gy in range(0, H, 48):
            base.ellipse([gx, gy, gx + 2, gy + 2], fill=(*GRID_C, 255))

    # CH-EU watermark (faint, right side)
    mark_layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    mark_draw = ImageDraw.Draw(mark_layer)
    mark_draw.text((660, 190), 'CH', font=F_MARK, fill=(*MARK_C, 255))
    mark_draw.text((660, 395), 'EU', font=F_MARK, fill=(*MARK_C, 255))
    img = Image.alpha_composite(img, mark_layer)

    draw = ImageDraw.Draw(img)

    # Left red stripe
    draw.rectangle([0, 0, 10, H], fill=(*STRIPE, 255))

    # Bottom bar
    draw.rectangle([0, H - 72, W, H], fill=(*BAR, 255))

    # Section label
    draw.text((60, 62), 'PAKET CH–EU', font=F_LABEL, fill=(*LABEL_C, 255))
    draw.rectangle([60, 94, 290, 97], fill=(*STRIPE, 255))

    # Title
    n = len(page['title'])
    title_y = {1: 220, 2: 160, 3: 110}.get(n, 110)
    for line in page['title']:
        draw.text((60, title_y), line, font=F_TITLE, fill=(*WHITE, 255))
        title_y += 92

    # Description
    desc_y = max(title_y + 35, 400)
    wrapped = textwrap.fill(page['desc'], width=64)
    for line in wrapped.split('\n'):
        draw.text((60, desc_y), line, font=F_DESC, fill=(*DESC_C, 255))
        desc_y += 37

    # Bottom branding
    draw.text((60, H - 47), 'Souveräne Schweiz  ·  souveraene-schweiz.ch', font=F_BRAND, fill=(*LABEL_C, 255))

    out_path = os.path.join(OUT_DIR, page['filename'] + '.png')
    img.convert('RGB').save(out_path, 'PNG', optimize=True)
    print(f'  OK  {out_path}')

if __name__ == '__main__':
    os.makedirs(OUT_DIR, exist_ok=True)
    for p in PAGES:
        make_og(p)
    print('Fertig.')
