"""
Fügt Artikel-Toolbar (Alle öffnen/schliessen + Drucken) auf allen Seiten mit h3-Akkordeon ein.
Überspringt Seiten, auf denen die Toolbar bereits vorhanden ist.
"""
import re, os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FILES = [
    "10mio/bundesstudie.html",
    "10mio/fachkraefte.html",
    "10mio/infrastruktur.html",
    "10mio/wohnen.html",
    "10mio/zahlen.html",
    "10mio/zuwanderung.html",
    "ch-eu/binnenmarkt.html",
    "ch-eu/botschaft-bundesrat.html",
    "ch-eu/eu-programme.html",
    "ch-eu/forschung.html",
    "ch-eu/gesundheit.html",
    "ch-eu/landverkehr.html",
    "ch-eu/landwirtschaft.html",
    "ch-eu/lebensmittelsicherheit.html",
    "ch-eu/luftverkehr.html",
    "ch-eu/mra.html",
    "ch-eu/personenfreizuegigkeit.html",
    "ch-eu/querschnitt.html",
    "ch-eu/richli-gutachten.html",
    "ch-eu/schweizer-beitrag.html",
    "ch-eu/strom.html",
    "ch-eu/weltraum.html",
]

CSS_BLOCK = """
    /* Artikel-Toolbar */
    .artikel-toolbar {
      display: flex;
      gap: 0.6rem;
      align-items: center;
      margin: 0 0 1.6rem;
      flex-wrap: wrap;
    }
    .toolbar-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.42rem 1rem;
      font-size: 0.78rem;
      font-weight: 600;
      font-family: inherit;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.18s, color 0.18s;
      border: 1.5px solid var(--gruen);
      background: var(--weiss);
      color: var(--gruen);
    }
    .toolbar-btn:hover { background: var(--gruen); color: var(--weiss); }
    .toolbar-btn-print {
      border-color: var(--mittel);
      color: var(--mittel);
    }
    .toolbar-btn-print:hover { background: var(--dunkel); border-color: var(--dunkel); color: var(--weiss); }

    /* Print */
    @media print {
      nav, .hamburger, #mobileMenu,
      .artikel-toolbar, .sidebar,
      .quellen-block-wrap, .x-hinweis-wrap, .gl-hinweis-wrap,
      footer, .search-wrap { display: none !important; }

      body { background: white !important; font-size: 11pt; color: #000; }
      .page-hero { background: none !important; color: #000 !important; padding: 0 0 1rem; border-bottom: 2pt solid #000; }
      .page-hero h1 { font-size: 16pt; color: #000 !important; }
      .page-hero .lead, .page-hero .zuletzt-aktualisiert { color: #333 !important; }
      .divider { border-color: #ccc; }
      .content-wrap { display: block !important; }
      .article-body { max-width: 100% !important; padding: 0 !important; }

      .accordion-content { max-height: none !important; overflow: visible !important; }
      .accordion-toggle::after { display: none !important; }

      h3 { font-size: 12pt; page-break-after: avoid; margin-top: 1.4rem; color: #000; }
      p, li { font-size: 10.5pt; line-height: 1.55; color: #222; }
      a { color: #000; text-decoration: none; }
      a[href]::after { content: none; }
    }
"""

TOOLBAR_HTML = """    <div class="artikel-toolbar">
      <button class="toolbar-btn" id="toggle-all-btn">Alle Abschnitte öffnen</button>
      <button class="toolbar-btn toolbar-btn-print" onclick="window.print()">\U0001f5a8 Drucken</button>
    </div>

"""

TOGGLE_JS = """
  var allOpen = false;
  var toggleBtn = document.getElementById('toggle-all-btn');
  function updateToggleBtn() {
    var wraps = document.querySelectorAll('.accordion-content');
    allOpen = Array.from(wraps).every(function(w) { return w.style.maxHeight !== '0px' && w.style.maxHeight !== '0'; });
    toggleBtn.textContent = allOpen ? 'Alle Abschnitte schliessen' : 'Alle Abschnitte öffnen';
  }
  if (toggleBtn) {
    toggleBtn.addEventListener('click', function() {
      allOpen = !allOpen;
      document.querySelectorAll('.article-body h3.accordion-toggle').forEach(function(h3) {
        var wrap = h3.nextElementSibling;
        if (!wrap || !wrap.classList.contains('accordion-content')) return;
        if (allOpen) {
          h3.classList.add('open');
          wrap.style.maxHeight = wrap.scrollHeight + 'px';
        } else {
          h3.classList.remove('open');
          wrap.style.maxHeight = '0';
        }
      });
      toggleBtn.textContent = allOpen ? 'Alle Abschnitte schliessen' : 'Alle Abschnitte öffnen';
    });
    updateToggleBtn();
  }
"""

def process(rel_path):
    path = os.path.join(BASE, rel_path.replace('/', os.sep))
    with open(path, encoding='utf-8') as f:
        content = f.read()

    if 'artikel-toolbar' in content:
        print(f"  SKIP (already has toolbar): {rel_path}")
        return False

    # 1. CSS vor </style> einfügen (erste Occurrence)
    style_end = content.find('</style>')
    if style_end == -1:
        print(f"  SKIP (no </style>): {rel_path}")
        return False
    content = content[:style_end] + CSS_BLOCK + content[style_end:]

    # 2. Toolbar HTML vor erstem <h3> innerhalb article-body einfügen
    ab_start = content.find('<div class="article-body">')
    if ab_start == -1:
        print(f"  SKIP (no article-body): {rel_path}")
        return False
    h3_match = re.search(r'\n(\s*)<h3', content[ab_start:])
    if not h3_match:
        print(f"  SKIP (no h3 in article-body): {rel_path}")
        return False
    insert_pos = ab_start + h3_match.start() + 1  # nach dem \n
    content = content[:insert_pos] + TOOLBAR_HTML + content[insert_pos:]

    # 3. updateToggleBtn() in click-handler + Toggle-JS nach forEach
    # Zuverlässiges Ende des accordion-forEach:
    OLD_END = "      wrap.style.maxHeight = open ? wrap.scrollHeight + 'px' : '0';\n    });\n  });"
    NEW_END = "      wrap.style.maxHeight = open ? wrap.scrollHeight + 'px' : '0';\n      updateToggleBtn();\n    });\n  });" + TOGGLE_JS

    if OLD_END not in content:
        print(f"  WARN (click-handler pattern not found): {rel_path}")
    else:
        content = content.replace(OLD_END, NEW_END, 1)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"  OK: {rel_path}")
    return True

changed = 0
for f in FILES:
    if process(f):
        changed += 1
print(f"\nFertig: {changed} Dateien geändert.")
