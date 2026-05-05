(function () {
  'use strict';

  var overlay = document.getElementById('searchOverlay');
  if (!overlay) return;

  var ROOT = overlay.dataset.root || '';
  var SEARCH_IDX = null;

  fetch(ROOT + 'data/search-index.json')
    .then(function (r) { return r.ok ? r.json() : []; })
    .then(function (d) { SEARCH_IDX = d; })
    .catch(function () {});

  window.heroSearchOpen = function (el) {
    overlay.hidden = false;
    var inp = document.getElementById('searchInput');
    inp.value = el.value;
    inp.focus();
    if (el.value.trim().length >= 2) window.doSearch(el.value);
    el.blur(); el.value = '';
  };

  window.toggleSearch = function () {
    overlay.hidden = !overlay.hidden;
    if (!overlay.hidden) {
      document.getElementById('searchInput').focus();
    } else {
      document.getElementById('searchInput').value = '';
      document.getElementById('searchResList').innerHTML = '';
    }
  };

  window.closeSearch = function () {
    overlay.hidden = true;
    document.getElementById('searchInput').value = '';
    document.getElementById('searchResList').innerHTML = '';
  };

  function sectionPriority(s) {
    if (s === 'Paket CH–EU' || s === '10-Mio.-Schweiz') return 0;
    if (s === 'Glossar') return 2;
    return 1;
  }

  window.doSearch = function (q) {
    var list = document.getElementById('searchResList');
    q = q.trim();
    if (!SEARCH_IDX || q.length < 2) { list.innerHTML = ''; return; }
    var words = q.toLowerCase().split(/\s+/).filter(Boolean);
    var SHOW = 10;

    var scored = SEARCH_IDX.map(function (e) {
      var tl = (e.title || '').toLowerCase();
      var hay = (tl + ' ' + (e.h2s || []).join(' ') + ' ' + (e.text || '')).toLowerCase();
      if (!words.every(function (w) { return hay.includes(w); })) return null;
      var score = 0;
      words.forEach(function (w) {
        if (tl.includes(w)) score += 30;
        score += (hay.match(new RegExp(escRe(w), 'g')) || []).length;
      });
      return { e: e, score: score, pri: sectionPriority(e.section) };
    }).filter(Boolean)
      .sort(function (a, b) {
        return a.pri !== b.pri ? a.pri - b.pri : b.score - a.score;
      });

    var total = scored.length;
    if (!total) {
      list.innerHTML = '<div class="search-no-results">Keine Treffer für «' + escHtml(q) + '»</div>';
      return;
    }

    var items = scored.slice(0, SHOW).map(function (x) {
      var e = x.e;
      var snippet = getSnippet(e.text || e.desc || '', words);
      var bc = e.section.includes('CH') ? 'cheu'
             : e.section.includes('Mio') ? 'mio'
             : e.section === 'Glossar' ? 'glossar' : 'other';
      return '<a class="search-res-item" href="' + ROOT + escHtml(e.url) + '">' +
        '<div class="search-res-meta"><span class="search-badge search-badge-' + bc + '">' + escHtml(e.section) + '</span></div>' +
        '<span class="search-res-title">' + highlight(escHtml(e.title), words) + '</span>' +
        (snippet ? '<span class="search-res-snippet">' + highlight(escHtml(snippet), words) + '</span>' : '') +
        '</a>';
    }).join('');

    var more = total > SHOW
      ? '<div class="search-more">+ ' + (total - SHOW) + ' weitere Treffer – Suchbegriff verfeinern</div>'
      : '';
    list.innerHTML = items + more;
  };

  function getSnippet(text, words) {
    if (!text) return '';
    var tl = text.toLowerCase(); var best = -1;
    words.forEach(function (w) {
      var i = tl.indexOf(w);
      if (i >= 0 && (best < 0 || i < best)) best = i;
    });
    if (best < 0) return text.slice(0, 110) + (text.length > 110 ? '…' : '');
    var s = Math.max(0, best - 40);
    var end = Math.min(text.length, s + 130);
    return (s > 0 ? '…' : '') + text.slice(s, end) + (end < text.length ? '…' : '');
  }

  function highlight(esc, words) {
    words.forEach(function (w) {
      esc = esc.replace(new RegExp('(' + escRe(w) + ')', 'gi'), '<mark>$1</mark>');
    });
    return esc;
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') window.closeSearch(); });
  document.addEventListener('click', function (e) {
    var btn = document.getElementById('navSearchBtn');
    if (!overlay.hidden && !overlay.contains(e.target) && btn && !btn.contains(e.target)) window.closeSearch();
  });
}());
