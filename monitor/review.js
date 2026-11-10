(() => {
  'use strict';

  const ROOT = '/data/monitor/review/';
  const STORAGE_KEY = 'ss-monitor-editorial-review-v1';
  const PAGE_SIZE = 40;
  const NOTE_LIMIT = 1000;
  const ID_PATTERN = /^[A-Za-z0-9_-]{12,80}$/;
  const VALUES = new Set(['postworthy', 'not_postworthy']);
  const state = {days: [], articles: [], sourceAudit: null, date: '', shown: PAGE_SIZE, ratings: loadRatings()};

  function $(id) { return document.getElementById(id); }

  function loadRatings() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (!value || value.schema_version !== 1 || typeof value.ratings !== 'object' ||
          !value.ratings || Array.isArray(value.ratings)) return {};
      return value.ratings;
    } catch (_) {
      return {};
    }
  }

  function saveRatings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        schema_version: 1, ratings: state.ratings
      }));
      $('storageStatus').textContent = 'Bewertungen lokal gespeichert';
      return true;
    } catch (_) {
      $('storageStatus').textContent = 'Speichern blockiert – bitte Browser-Speicher prüfen';
      return false;
    }
  }

  function message(text) {
    $('error').textContent = text || '';
  }

  function validPath(path) {
    return /^(?:epaper\/)?20\d{2}-\d{2}-\d{2}(?:-(?:nzz|nzzas))?\.json$/.test(String(path || ''));
  }

  async function fetchFeed(path) {
    if (!validPath(path)) throw new Error('Ungültiger Dateipfad im Prüfindex.');
    const response = await fetch(ROOT + path, {cache:'no-store'});
    if (!response.ok) throw new Error('Prüfdaten fehlen (' + path + ').');
    const data = await response.json();
    if (!data || data.schema_version !== 1 || !Array.isArray(data.articles)) {
      throw new Error('Prüfdaten haben ein unbekanntes Format.');
    }
    return data;
  }

  function articlesFromFeeds(feeds) {
    const result = new Map();
    for (const feed of feeds) {
      // The three different editorial decisions remain separate. There is no
      // projection of procedure/risk checks into the strict 'new news' stream.
      const items = [
        ...feed.articles.map(item => ({...item, review_kind: 'news'})),
        ...(Array.isArray(feed.procedures) ? feed.procedures.map(item => ({...item, review_kind: 'procedure'})) : []),
        ...(Array.isArray(feed.risks) ? feed.risks.map(item => ({...item, review_kind: 'risk'})) : [])
      ];
      for (const item of items) {
        if (!item || !ID_PATTERN.test(String(item.id || ''))) continue;
        const url = String(item.url || '');
        if (!url.startsWith('https://')) continue;
        if (!result.has(item.id)) {
          result.set(item.id, {
            id: item.id, headline: String(item.headline || '').slice(0, 300),
            subtitle: String(item.subtitle || '').slice(0, 240),
            source: String(item.source || 'Quelle unbekannt').slice(0, 120),
            url,
            published_date: String(item.published_date || ''),
            discovered_date: String(item.discovered_date || ''),
            page: item.page || '',
            ai_selected: item.ai_selected === true,
            known_status: String(item.known_status || ''),
            kind: item.review_kind,
            kind_label: item.review_kind === 'procedure' ? 'EU-Verfahren' :
              item.review_kind === 'risk' ? 'Risiko-Dossier' :
              feed.kind === 'epaper' ? 'E-Paper' : 'Online / Behörden',
            status: String(item.status || ''),
            source_check_complete: item.source_check_complete !== false
          });
        }
      }
    }
    return Array.from(result.values()).sort((a, b) => {
      // Existing NZZ/online ordering stays intact; the new controls let
      // reviewers intentionally switch between article and monitoring topics.
      const priority = (b.kind_label === 'E-Paper') - (a.kind_label === 'E-Paper');
      return priority || b.published_date.localeCompare(a.published_date) ||
        a.source.localeCompare(b.source, 'de-CH') || a.headline.localeCompare(b.headline, 'de-CH');
    });
  }

  function rowFor(id) { return state.articles.find(item => item.id === id); }

  function ratingFor(id) {
    const entry = state.ratings[id];
    return entry && VALUES.has(entry.rating) ? entry : null;
  }

  function setRating(id, rating) {
    if (!ID_PATTERN.test(id) || (rating !== null && !VALUES.has(rating))) return;
    const article = rowFor(id);
    if (!article) return;
    const existing = state.ratings[id] || {};
    if (rating === null) {
      delete state.ratings[id];
    } else {
      state.ratings[id] = {
        rating,
        comment: String(existing.comment || '').slice(0, NOTE_LIMIT),
        headline: article.headline,
        source: article.source,
        url: article.url,
        kind: article.kind,
        first_seen_day: String(existing.first_seen_day || state.date),
        reviewed_at: new Date().toISOString()
      };
    }
    saveRatings();
    render();
  }

  function setComment(id, comment) {
    const article = rowFor(id);
    if (!article || !ratingFor(id)) return;
    state.ratings[id].comment = String(comment || '').slice(0, NOTE_LIMIT);
    state.ratings[id].reviewed_at = new Date().toISOString();
    saveRatings();
  }

  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = String(text);
    return el;
  }

  function makeCard(article) {
    const entry = ratingFor(article.id);
    const card = element('article', 'review-card');
    card.dataset.articleId = article.id;
    const top = element('div', 'review-top');
    const main = element('div', 'review-main');
    const title = element('h3', 'review-title');
    const link = element('a', '', article.headline);
    link.href = article.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    title.appendChild(link);
    const info = [
      article.source,
      article.page ? 'Seite ' + article.page : '',
      article.published_date ? 'Veröffentlicht ' + article.published_date : '',
      article.kind_label,
      article.status ? 'Prüfstatus: ' + article.status : '',
      article.source_check_complete === false ? 'Quellenlage unvollständig' : ''
    ].filter(Boolean).join(' · ');
    main.append(title, element('div', 'review-meta', info));
    top.append(main);
    // Do not bias independent human labels with the AI decision until the
    // reviewer has made a judgement of their own.
    if (article.ai_selected && entry) {
      top.appendChild(element('span', 'review-badge', 'KI-Vorauswahl'));
    }
    card.appendChild(top);
    if (article.subtitle) card.appendChild(element('p', 'review-desc', article.subtitle));

    const buttons = element('div', 'review-buttons');
    const positive = element('button', 'positive', 'Postwürdig');
    positive.type = 'button';
    positive.setAttribute('aria-pressed', entry?.rating === 'postworthy' ? 'true' : 'false');
    positive.addEventListener('click', () => setRating(article.id, 'postworthy'));
    const negative = element('button', '', 'Nicht postwürdig');
    negative.type = 'button';
    negative.setAttribute('aria-pressed', entry?.rating === 'not_postworthy' ? 'true' : 'false');
    negative.addEventListener('click', () => setRating(article.id, 'not_postworthy'));
    buttons.append(positive, negative);
    if (entry) {
      const reset = element('button', 'reset', 'Bewertung zurücksetzen');
      reset.type = 'button';
      reset.addEventListener('click', () => setRating(article.id, null));
      buttons.appendChild(reset);
    }
    card.appendChild(buttons);

    const notes = element('div', 'review-notes');
    const label = element('label', '', 'Freiwilliger Kommentar zur Bewertung');
    label.htmlFor = 'comment-' + article.id;
    const textarea = element('textarea');
    textarea.id = label.htmlFor;
    textarea.maxLength = NOTE_LIMIT;
    textarea.rows = 2;
    textarea.placeholder = 'Was macht diesen Artikel postwürdig oder nicht?';
    textarea.value = entry?.comment || '';
    textarea.disabled = !entry;
    textarea.addEventListener('input', () => setComment(article.id, textarea.value));
    notes.append(label, textarea);
    card.appendChild(notes);
    return card;
  }

  function matches(article) {
    const q = $('searchInput').value.trim().toLocaleLowerCase('de-CH');
    const selectedSource = $('sourceFilter').value;
    const selectedType = $('typeFilter').value;
    if (selectedType !== 'all' && selectedType !== article.kind) return false;
    if (selectedSource !== 'all' && selectedSource !== article.source) return false;
    if (q && !(article.headline + ' ' + article.source).toLocaleLowerCase('de-CH').includes(q)) return false;
    const entry = ratingFor(article.id);
    const filter = $('ratingFilter').value;
    if (filter === 'unrated' && entry) return false;
    if (filter === 'postworthy' && entry?.rating !== 'postworthy') return false;
    if (filter === 'not_postworthy' && entry?.rating !== 'not_postworthy') return false;
    return true;
  }

  function render() {
    const rated = state.articles.filter(x => ratingFor(x.id));
    const positives = rated.filter(x => ratingFor(x.id).rating === 'postworthy');
    const filtered = state.articles.filter(matches);
    $('candidateCount').textContent = 'Treffer: ' + state.articles.length +
      ' (' + state.articles.filter(x => x.kind === 'news').length + ' Nachrichten · ' +
      state.articles.filter(x => x.kind === 'procedure').length + ' EU-Verfahren · ' +
      state.articles.filter(x => x.kind === 'risk').length + ' Risiko-Dossiers)';
    $('ratedCount').textContent = 'Bewertet: ' + rated.length;
    $('postworthyCount').textContent = 'Postwürdig: ' + positives.length;
    $('filteredCount').textContent = 'In Ansicht: ' + filtered.length;
    const root = $('results');
    root.replaceChildren();
    if (!filtered.length) {
      root.appendChild(element('div', 'empty',
        state.articles.length
          ? 'Keine Treffer mit diesen Filtern. Du kannst den Bewertungsfilter auf «Alle Treffer» stellen.'
          : 'Für diesen Tag sind noch keine Prüfdaten vorhanden.'));
    } else {
      const fragment = document.createDocumentFragment();
      for (const article of filtered.slice(0, state.shown)) fragment.appendChild(makeCard(article));
      root.appendChild(fragment);
    }
    const more = $('moreButton');
    more.hidden = filtered.length <= state.shown;
    if (!more.hidden) more.textContent = 'Weitere Treffer anzeigen (' +
      Math.min(PAGE_SIZE, filtered.length - state.shown) + ' von ' + (filtered.length - state.shown) + ')';
  }

  function rebuildSources() {
    const select = $('sourceFilter');
    const old = select.value;
    select.replaceChildren();
    const all = element('option', '', 'Alle Quellen');
    all.value = 'all';
    select.appendChild(all);
    const sources = [...new Set(state.articles.map(x => x.source))].sort((a, b) => a.localeCompare(b, 'de-CH'));
    for (const name of sources) {
      const option = element('option', '', name);
      option.value = name;
      select.appendChild(option);
    }
    select.value = sources.includes(old) ? old : 'all';
  }

  function renderSourceAudit() {
    const summary = $('sourceAuditSummary');
    const body = $('sourceAuditBody');
    body.replaceChildren();
    const overview = state.sourceAudit;
    if (!overview || !Array.isArray(overview.sources)) {
      summary.textContent = 'Quellenkontrolle – kein Daily Run für diesen Tag vorhanden';
      body.appendChild(element('p', 'muted',
        'Die Quellenkontrolle wird aus dem nächsten manuellen Daily-/Full Run erzeugt. E-Paper-Titel können bereits separat vorliegen.'));
      return;
    }
    const counts = overview.summary || {};
    summary.textContent = 'Quellenkontrolle: ' +
      (counts.successful ?? 0) + ' erfolgreich / ' +
      (counts.enabled ?? 0) + ' aktiviert · ' +
      (counts.failed ?? 0) + ' mit Problem · ' +
      (overview.sources.length - (counts.enabled ?? 0)) + ' deaktiviert';

    const statusText = {
      disabled: 'Deaktiviert', not_checked: 'Nicht geprüft', new_publication: 'Erfolgreich – Treffer',
      checked_no_new: 'Erfolgreich – keine Treffer', unreachable: 'Nicht erreichbar',
      auth_failed: 'Anmeldung fehlgeschlagen', structure_changed: 'Struktur verändert',
      stale_feed: 'Quelle veraltet', incomplete: 'Unvollständig'
    };
    const intro = element('p', 'muted',
      'Treffer = Quelleneinträge, nicht neue Artikel. In Prüfliste = eindeutige bewertbare Artikel; ' +
      'Dublettenerkennung und Schutzfilter können die Anzahl reduzieren.');
    body.appendChild(intro);
    const table = element('table', 'audit-table');
    const thead = element('thead');
    const headings = element('tr');
    for (const title of ['Quelle', 'Abrufstatus', 'Treffer', 'In Prüfliste']) {
      headings.appendChild(element('th', '', title));
    }
    thead.appendChild(headings);
    table.appendChild(thead);
    const tbody = element('tbody');
    for (const source of overview.sources) {
      const tr = element('tr');
      tr.appendChild(element('td', '', String(source.name || source.id || '-')));
      tr.appendChild(element('td', '', statusText[source.status] || String(source.status || 'Unbekannt')));
      tr.appendChild(element('td', '', Number(source.raw_findings || 0)));
      tr.appendChild(element('td', '', Number(source.review_entries || 0)));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    const tableWrap = element('div', 'audit-table-wrap');
    tableWrap.appendChild(table);
    body.appendChild(tableWrap);
    body.appendChild(element('p', 'muted',
      'EU-Verfahren: ' + Number(counts.procedures_checked || 0) + ' Seiten geprüft (' +
      Number(counts.procedures_with_warning || 0) + ' unklar). ' +
      'Risiko-Dossiers: ' + Number(counts.risks_checked || 0) + ' geprüft (' +
      Number(counts.risks_with_incomplete_sources || 0) + ' mit unvollständiger Quellenlage).'));
  }

  async function loadDay(date) {
    state.date = date;
    state.shown = PAGE_SIZE;
    message('');
    $('results').replaceChildren(element('p', '', 'Prüfdaten werden geladen …'));
    const item = state.days.find(x => x.date === date);
    if (!item) {
      state.articles = [];
      render();
      return;
    }
    const paths = [item.daily?.path, ...(item.epaper || []).map(e => e.path)].filter(Boolean);
    try {
      const results = await Promise.allSettled(paths.map(fetchFeed));
      const feeds = results.filter(x => x.status === 'fulfilled').map(x => x.value);
      const failures = results.filter(x => x.status === 'rejected');
      state.articles = articlesFromFeeds(feeds);
      const daily = feeds.find(feed => feed.kind === 'daily');
      state.sourceAudit = daily?.source_overview || null;
      rebuildSources();
      renderSourceAudit();
      render();
      if (failures.length) message('Ein Teil der Prüfdaten konnte nicht geladen werden. Bitte später erneut versuchen.');
    } catch (_) {
      state.articles = [];
      state.sourceAudit = null;
      renderSourceAudit();
      render();
      message('Die Prüfdaten konnten nicht geladen werden.');
    }
  }

  function exportRatings() {
    const rows = Object.entries(state.ratings)
      .filter(([id, entry]) => ID_PATTERN.test(id) && entry && VALUES.has(entry.rating))
      .map(([id, entry]) => ({
        id,
        rating: entry.rating,
        comment: String(entry.comment || '').slice(0, NOTE_LIMIT),
        headline: String(entry.headline || '').slice(0, 300),
        source: String(entry.source || '').slice(0, 120),
        url: String(entry.url || '').slice(0, 1600),
        kind: ['news', 'procedure', 'risk'].includes(entry.kind) ? entry.kind : 'news',
        first_seen_day: String(entry.first_seen_day || ''),
        reviewed_at: String(entry.reviewed_at || '')
      }));
    if (!rows.length) { message('Es gibt noch keine Bewertungen zum Exportieren.'); return; }
    const result = {
      schema_version: 1, type: 'editorial-review-feedback', exported_at: new Date().toISOString(),
      storage: 'local-browser', ratings: rows
    };
    const blob = new Blob([JSON.stringify(result, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const anchor = element('a');
    anchor.href = url;
    anchor.download = 'newsmonitor-bewertungen-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    message('');
  }

  async function importRatings(file) {
    if (!file) return;
    if (file.size > 5_000_000) { message('Die Importdatei ist zu gross (maximal 5 MB).'); return; }
    try {
      const data = JSON.parse(await file.text());
      if (data?.schema_version !== 1 || data?.type !== 'editorial-review-feedback' ||
          !Array.isArray(data.ratings)) {
        throw new Error('Unbekanntes Bewertungsformat.');
      }
      const fresh = {};
      for (const entry of data.ratings) {
        const id = String(entry?.id || '');
        if (!ID_PATTERN.test(id) || !VALUES.has(entry?.rating)) throw new Error('Ungültige Artikel-ID oder Bewertung.');
        fresh[id] = {
          rating: entry.rating, comment: String(entry.comment || '').slice(0, NOTE_LIMIT),
          headline: String(entry.headline || '').slice(0, 300),
          source: String(entry.source || '').slice(0, 120),
          url: String(entry.url || '').slice(0, 1600),
          kind: ['news', 'procedure', 'risk'].includes(entry.kind) ? entry.kind : 'news',
          first_seen_day: String(entry.first_seen_day || '').slice(0, 10),
          reviewed_at: String(entry.reviewed_at || '').slice(0, 40)
        };
      }
      if (!window.confirm('Sollen ' + Object.keys(fresh).length +
        ' Bewertungen importiert werden? Bei gleichen Artikeln ersetzt die Datei die lokale Bewertung.')) return;
      const backup = {...state.ratings};
      state.ratings = {...backup, ...fresh};
      if (!saveRatings()) {
        state.ratings = backup;
        throw new Error('Lokal speichern fehlgeschlagen.');
      }
      message(Object.keys(fresh).length + ' Bewertungen erfolgreich importiert.');
      render();
    } catch (error) {
      message('Import nicht möglich: ' + (error?.message || 'ungültige Datei'));
    }
  }

  async function init() {
    $('ratingFilter').addEventListener('change', () => {state.shown = PAGE_SIZE; render();});
    $('sourceFilter').addEventListener('change', () => {state.shown = PAGE_SIZE; render();});
    $('typeFilter').addEventListener('change', () => {state.shown = PAGE_SIZE; render();});
    $('searchInput').addEventListener('input', () => {state.shown = PAGE_SIZE; render();});
    $('dateFilter').addEventListener('change', event => loadDay(event.target.value));
    $('moreButton').addEventListener('click', () => {state.shown += PAGE_SIZE; render();});
    $('exportButton').addEventListener('click', exportRatings);
    $('importButton').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', async event => {
      await importRatings(event.target.files[0]);
      event.target.value = '';
    });
    try {
      const response = await fetch(ROOT + 'index.json', {cache:'no-store'});
      if (!response.ok) throw new Error('Kein Prüfdaten-Index vorhanden.');
      const index = await response.json();
      if (index.schema_version !== 1 || !Array.isArray(index.days)) throw new Error('Unbekanntes Indexformat.');
      state.days = index.days.filter(x => /^20\d{2}-\d{2}-\d{2}$/.test(String(x.date || '')));
      const select = $('dateFilter');
      select.replaceChildren();
      for (const item of state.days) {
        const option = element('option', '', item.date);
        option.value = item.date;
        select.appendChild(option);
      }
      if (!state.days.length) { message('Noch keine Artikel erfasst. Der nächste manuelle Full Run erzeugt die Prüfliste.'); render(); return; }
      select.value = state.days[0].date;
      await loadDay(select.value);
    } catch (error) {
      state.articles = [];
      render();
      message('Prüfmodus noch ohne Daten: ' + (error?.message || 'Ladefehler'));
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
