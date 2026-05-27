"""
Toolbar-Update: sticky, zentriert, mit Vorlesen-Button.
- Toolbar aus article-body heraus und vor content-wrap verschieben
- CSS auf sticky + inner-wrapper updaten
- Vorlesen-Button + JS ergänzen
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

OLD_CSS = """    /* Artikel-Toolbar */
    .artikel-toolbar {
      display: flex;
      gap: 0.6rem;
      align-items: center;
      margin: 0 0 1.6rem;
      flex-wrap: wrap;
    }"""

NEW_CSS = """    /* Artikel-Toolbar */
    .artikel-toolbar {
      position: sticky;
      top: 64px;
      z-index: 90;
      background: var(--weiss);
      border-bottom: 1px solid var(--linie);
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
    }
    .artikel-toolbar-inner {
      max-width: 900px;
      margin: 0 auto;
      padding: 0.55rem 5vw;
      display: flex;
      gap: 0.6rem;
      align-items: center;
      flex-wrap: wrap;
    }"""

READ_CSS = "    .toolbar-btn-read { border-color: #5a7fa8; color: #5a7fa8; }\n    .toolbar-btn-read:hover { background: #5a7fa8; color: var(--weiss); }\n    .toolbar-btn-read.reading { border-color: var(--rot); color: var(--rot); }\n    .toolbar-btn-read.reading:hover { background: var(--rot); color: var(--weiss); }"

NEW_TOOLBAR_HTML = """<div class="artikel-toolbar" id="artikel-toolbar">
  <div class="artikel-toolbar-inner">
    <button class="toolbar-btn" id="toggle-all-btn">Alle Abschnitte öffnen</button>
    <button class="toolbar-btn toolbar-btn-print" onclick="window.print()">\U0001f5a8 Drucken</button>
    <button class="toolbar-btn toolbar-btn-read" id="read-btn">\U0001f50a Vorlesen</button>
  </div>
</div>

"""

READ_JS = """
  // Vorlesen
  (function() {
    var readBtn = document.getElementById('read-btn');
    if (!readBtn) return;
    var synth = window.speechSynthesis;
    if (!synth) { readBtn.style.display = 'none'; return; }

    var isReading = false;
    var chunks = [];
    var chunkIdx = 0;

    function getChunks() {
      var body = document.querySelector('.article-body');
      if (!body) return [];
      var clone = body.cloneNode(true);
      var tb = clone.querySelector('.artikel-toolbar');
      if (tb) tb.remove();
      var parts = [];
      clone.querySelectorAll('h3, p, li').forEach(function(el) {
        var t = el.textContent.replace(/\\s+/g, ' ').trim();
        if (t.length > 3) parts.push(t);
      });
      var result = [];
      var buf = '';
      parts.forEach(function(p) {
        if (buf.length + p.length > 180) { if (buf) result.push(buf); buf = p; }
        else { buf = buf ? buf + '. ' + p : p; }
      });
      if (buf) result.push(buf);
      return result;
    }

    function stopReading() {
      synth.cancel();
      isReading = false;
      readBtn.textContent = '\\U0001f50a Vorlesen';
      readBtn.classList.remove('reading');
    }

    function speakNext() {
      if (!isReading || chunkIdx >= chunks.length) { stopReading(); return; }
      var utt = new SpeechSynthesisUtterance(chunks[chunkIdx++]);
      utt.lang = 'de-DE';
      utt.rate = 0.92;
      utt.onend = speakNext;
      utt.onerror = function(e) { if (e.error !== 'interrupted') stopReading(); };
      synth.speak(utt);
    }

    readBtn.addEventListener('click', function() {
      if (isReading) { stopReading(); return; }
      chunks = getChunks();
      chunkIdx = 0;
      isReading = true;
      readBtn.textContent = '\\u23f9 Stopp';
      readBtn.classList.add('reading');
      synth.cancel();
      speakNext();
    });

    window.addEventListener('beforeunload', function() { synth.cancel(); });
  })();

"""

def process(rel_path):
    path = os.path.join(BASE, rel_path.replace('/', os.sep))
    with open(path, encoding='utf-8') as f:
        content = f.read()

    if 'artikel-toolbar-inner' in content:
        print(f"  SKIP (already updated): {rel_path}")
        return False

    if 'artikel-toolbar' not in content:
        print(f"  SKIP (no toolbar): {rel_path}")
        return False

    # 1. CSS ersetzen
    if OLD_CSS in content:
        content = content.replace(OLD_CSS, NEW_CSS, 1)
    else:
        print(f"  WARN (old CSS not found): {rel_path}")

    # 2. Read-Button CSS nach toolbar-btn-print einfügen (falls noch nicht da)
    if 'toolbar-btn-read' not in content:
        content = content.replace(
            "    .toolbar-btn-print:hover { background: var(--dunkel); border-color: var(--dunkel); color: var(--weiss); }",
            "    .toolbar-btn-print:hover { background: var(--dunkel); border-color: var(--dunkel); color: var(--weiss); }\n" + READ_CSS,
            1
        )

    # 3. Alte Toolbar aus article-body entfernen
    old_toolbar = (
        "    <div class=\"artikel-toolbar\">\n"
        "      <button class=\"toolbar-btn\" id=\"toggle-all-btn\">Alle Abschnitte öffnen</button>\n"
        "      <button class=\"toolbar-btn toolbar-btn-print\" onclick=\"window.print()\">\U0001f5a8 Drucken</button>\n"
        "    </div>\n\n"
    )
    if old_toolbar in content:
        content = content.replace(old_toolbar, '', 1)
    else:
        print(f"  WARN (old toolbar HTML not found): {rel_path}")

    # 4. Neue Toolbar vor <div class="content-wrap"> einfügen
    content_wrap_tag = '<div class="content-wrap">'
    idx = content.find(content_wrap_tag)
    if idx == -1:
        print(f"  WARN (no content-wrap): {rel_path}")
    else:
        content = content[:idx] + NEW_TOOLBAR_HTML + content[idx:]

    # 5. Vorlesen-JS vor function toggleMenu() einfügen (falls noch nicht da)
    if 'speechSynthesis' not in content:
        toggle_menu = '  function toggleMenu()'
        if toggle_menu in content:
            content = content.replace(toggle_menu, READ_JS + toggle_menu, 1)
        else:
            print(f"  WARN (toggleMenu not found): {rel_path}")

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"  OK: {rel_path}")
    return True

changed = 0
for f in FILES:
    if process(f):
        changed += 1
print(f"\nFertig: {changed} Dateien geändert.")
