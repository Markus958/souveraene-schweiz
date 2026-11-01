(() => {
  'use strict';

  const STORAGE_API_BASE = 'ss-monitor-api-base';
  const STORAGE_API_KEY = 'ss-monitor-api-key';
  const CHATGPT_URL = 'https://chatgpt.com/';
  const POLL_INTERVAL_MS = 3500;
  const POLL_MAX = 80;

  let pollTimer = null;
  let pollCount = 0;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
    }[ch]));
  }

  function config() {
    return {
      base: String(localStorage.getItem(STORAGE_API_BASE) || '').replace(/\/+$/, ''),
      key: String(localStorage.getItem(STORAGE_API_KEY) || '')
    };
  }

  function isPrivateHttpUrl(url) {
    return /^http:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url);
  }

  function validateBaseUrl(value) {
    const url = String(value || '').trim().replace(/\/+$/, '');
    if (!url) throw new Error('Bitte die URL der Raspberry-Steuer-API eintragen.');
    if (!/^https:\/\//i.test(url) && !isPrivateHttpUrl(url)) {
      throw new Error('Für den Zugriff von unterwegs muss die Steuer-API über HTTPS erreichbar sein.');
    }
    return url;
  }

  function showToast(message, type = '') {
    document.querySelector('.control-toast')?.remove();
    const node = document.createElement('div');
    node.className = `control-toast ${type}`.trim();
    node.textContent = message;
    document.body.appendChild(node);
    window.setTimeout(() => node.remove(), 5000);
  }

  function apiHeaders(withBody = false) {
    const {key} = config();
    const headers = {'Accept':'application/json'};
    if (withBody) headers['Content-Type'] = 'application/json';
    if (key) headers['X-API-Key'] = key;
    return headers;
  }

  async function apiRequest(path, options = {}) {
    const {base, key} = config();
    if (!base || !key) {
      openSettings();
      throw new Error('Raspberry-Steuerung zuerst konfigurieren.');
    }
    const method = options.method || 'GET';
    const response = await fetch(`${base}${path}`, {
      method,
      headers: apiHeaders(Boolean(options.body)),
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache:'no-store',
      mode:'cors'
    });
    let payload = null;
    try { payload = await response.json(); } catch (_) { payload = {}; }
    if (!response.ok) {
      const detail = payload?.detail || payload?.message || payload?.error || `HTTP ${response.status}`;
      throw new Error(String(detail));
    }
    return payload || {};
  }

  function ensureDialog() {
    if (document.getElementById('monitorControlDialog')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'monitorControlDialog';
    dialog.className = 'control-dialog';
    dialog.innerHTML = `
      <form method="dialog" class="control-dialog-inner" id="monitorControlForm">
        <h2>Monitor-Steuerung</h2>
        <div class="control-field">
          <label for="monitorApiBase">Raspberry API</label>
          <input id="monitorApiBase" type="url" autocomplete="url" placeholder="https://api.souveraene-schweiz.ch">
          <p class="control-help">Für unterwegs eine öffentliche HTTPS-Adresse des sicheren Raspberry-Tunnels verwenden. Im Heimnetz ist auch die private HTTP-Adresse zulässig.</p>
        </div>
        <div class="control-field">
          <label for="monitorApiKey">API-Schlüssel</label>
          <input id="monitorApiKey" type="password" autocomplete="off" placeholder="API-Schlüssel">
          <p class="control-help">Der Schlüssel wird nur lokal in diesem Browser gespeichert und niemals ins GitHub-Repository geschrieben.</p>
        </div>
        <div class="control-dialog-actions">
          <button class="control-settings-button" type="button" id="monitorApiTest">Verbindung testen</button>
          <button class="control-settings-button" type="button" id="monitorApiCancel">Abbrechen</button>
          <button class="run-action-button primary" type="submit">Speichern</button>
        </div>
      </form>`;
    document.body.appendChild(dialog);

    dialog.querySelector('#monitorApiCancel').addEventListener('click', () => dialog.close());
    dialog.querySelector('#monitorApiTest').addEventListener('click', testSettings);
    dialog.querySelector('#monitorControlForm').addEventListener('submit', event => {
      event.preventDefault();
      try {
        const base = validateBaseUrl(dialog.querySelector('#monitorApiBase').value);
        const key = dialog.querySelector('#monitorApiKey').value.trim();
        if (!key) throw new Error('Bitte den API-Schlüssel eintragen.');
        localStorage.setItem(STORAGE_API_BASE, base);
        localStorage.setItem(STORAGE_API_KEY, key);
        dialog.close();
        showToast('Raspberry-Steuerung gespeichert.', 'ok');
        refreshStatus();
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  }

  function openSettings() {
    ensureDialog();
    const dialog = document.getElementById('monitorControlDialog');
    const {base, key} = config();
    dialog.querySelector('#monitorApiBase').value = base;
    dialog.querySelector('#monitorApiKey').value = key;
    if (!dialog.open) dialog.showModal();
  }

  async function testSettings() {
    const dialog = document.getElementById('monitorControlDialog');
    const button = dialog.querySelector('#monitorApiTest');
    const originalBase = localStorage.getItem(STORAGE_API_BASE);
    const originalKey = localStorage.getItem(STORAGE_API_KEY);
    try {
      const base = validateBaseUrl(dialog.querySelector('#monitorApiBase').value);
      const key = dialog.querySelector('#monitorApiKey').value.trim();
      if (!key) throw new Error('Bitte den API-Schlüssel eintragen.');
      localStorage.setItem(STORAGE_API_BASE, base);
      localStorage.setItem(STORAGE_API_KEY, key);
      button.disabled = true;
      button.textContent = 'Prüfe …';
      await apiRequest('/health');
      showToast('Verbindung zum Raspberry funktioniert.', 'ok');
    } catch (error) {
      showToast(`Verbindung fehlgeschlagen: ${error.message}`, 'error');
    } finally {
      if (originalBase === null) localStorage.removeItem(STORAGE_API_BASE); else localStorage.setItem(STORAGE_API_BASE, originalBase);
      if (originalKey === null) localStorage.removeItem(STORAGE_API_KEY); else localStorage.setItem(STORAGE_API_KEY, originalKey);
      button.disabled = false;
      button.textContent = 'Verbindung testen';
    }
  }

  function installSettingsButton() {
    const toolbar = document.querySelector('.toolbar');
    if (!toolbar || toolbar.querySelector('.monitor-control-settings')) return;
    const wrap = document.createElement('div');
    wrap.className = 'monitor-control-settings';
    wrap.innerHTML = '<button class="control-settings-button" type="button">⚙ Steuerung</button>';
    wrap.querySelector('button').addEventListener('click', openSettings);
    toolbar.appendChild(wrap);
  }

  function runControlsHtml() {
    return `<div class="run-controls" data-monitor-controls="1">
      <button class="run-action-button" type="button" data-run-kind="daily">Daily Run</button>
      <button class="run-action-button primary" type="button" data-run-kind="full">Full Run</button>
      <span class="run-status" data-run-status>Steuerung bereit</span>
    </div>`;
  }

  function enhanceRunButtons() {
    document.querySelectorAll('a.run-button').forEach(anchor => {
      if (anchor.closest('[data-monitor-controls="1"]')) return;
      const holder = document.createElement('div');
      holder.innerHTML = runControlsHtml();
      anchor.replaceWith(holder.firstElementChild);
    });
  }

  function statusNodes() {
    return Array.from(document.querySelectorAll('[data-run-status]'));
  }

  function setRunStatus(text, type = '') {
    statusNodes().forEach(node => {
      node.textContent = text;
      node.className = `run-status ${type}`.trim();
    });
  }

  function runStatusText(payload) {
    const state = String(payload.status || payload.state || payload.conclusion || '').toLowerCase();
    const kind = payload.kind || payload.run_kind || payload.type || '';
    const runId = payload.run_id || payload.id || '';
    const prefix = kind === 'full' ? 'Full Run' : kind === 'daily' ? 'Daily Run' : 'Run';
    const idText = runId ? ` #${runId}` : '';
    if (['queued','in_progress','running','pending','busy'].includes(state)) return {text:`${prefix}${idText} läuft …`, type:'busy', active:true};
    if (['success','completed','ok'].includes(state)) return {text:`${prefix}${idText} erfolgreich`, type:'ok', active:false};
    if (['failure','failed','error','cancelled','timed_out'].includes(state)) return {text:`${prefix}${idText}: ${state}`, type:'error', active:false};
    return {text: payload.message || 'Steuerung bereit', type:'', active:false};
  }

  async function refreshStatus() {
    if (!config().base || !config().key) {
      setRunStatus('Steuerung noch nicht konfiguriert');
      return;
    }
    try {
      const payload = await apiRequest('/monitor/status');
      const view = runStatusText(payload);
      setRunStatus(view.text, view.type);
      if (!view.active && pollTimer) stopPolling();
    } catch (error) {
      setRunStatus(`Status nicht erreichbar: ${error.message}`, 'error');
    }
  }

  function startPolling() {
    stopPolling();
    pollCount = 0;
    pollTimer = window.setInterval(async () => {
      pollCount += 1;
      await refreshStatus();
      if (pollCount >= POLL_MAX) stopPolling();
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimer) window.clearInterval(pollTimer);
    pollTimer = null;
  }

  async function startRun(kind, button) {
    const path = kind === 'full' ? '/monitor/full-run' : '/monitor/daily-run';
    const label = kind === 'full' ? 'Full Run' : 'Daily Run';
    const buttons = Array.from(document.querySelectorAll('[data-run-kind]'));
    buttons.forEach(item => { item.disabled = true; });
    setRunStatus(`${label} wird gestartet …`, 'busy');
    try {
      const payload = await apiRequest(path, {method:'POST'});
      const view = runStatusText({...payload, kind});
      setRunStatus(view.text || `${label} gestartet`, view.type || 'busy');
      showToast(`${label} gestartet.`, 'ok');
      startPolling();
    } catch (error) {
      setRunStatus(`${label}: ${error.message}`, 'error');
      showToast(`${label} konnte nicht gestartet werden: ${error.message}`, 'error');
    } finally {
      buttons.forEach(item => { item.disabled = false; });
      if (button) button.blur();
    }
  }

  function articlePayload(item) {
    const source = item.source || {};
    const detail = item.article_detail || {};
    return {
      headline:item.headline || '',
      status:item.status || '',
      summary:item.summary || '',
      post_approach:item.post_approach || '',
      why_important:item.why_important || '',
      post_potential:item.post_potential ?? null,
      source_display:item.source_display || source.name || '',
      source:{name:source.name || '', url:source.url || '', role:source.role || '', page:source.page || ''},
      page:item.page || '',
      relevance_factors:Array.isArray(item.relevance_factors) ? item.relevance_factors : [],
      risk_dossiers:Array.isArray(item.risk_dossiers) ? item.risk_dossiers : [],
      article_detail:{
        summary:detail.summary || '',
        relevance:detail.relevance || '',
        topics:Array.isArray(detail.topics) ? detail.topics : [],
        figures:Array.isArray(detail.figures) ? detail.figures : []
      }
    };
  }

  function draftRowFor(newsRow) {
    let detailRow = newsRow.nextElementSibling;
    let draftRow = detailRow?.nextElementSibling;
    if (draftRow?.classList.contains('post-draft-row')) return draftRow;
    draftRow = document.createElement('tr');
    draftRow.className = 'post-draft-row';
    draftRow.hidden = true;
    draftRow.innerHTML = '<td colspan="6"></td>';
    if (detailRow?.classList.contains('article-detail-row')) detailRow.after(draftRow);
    else newsRow.after(draftRow);
    return draftRow;
  }

  function renderDraft(newsRow, item, payload) {
    const draft = payload.draft || payload.text || payload.post || '';
    const handoffId = payload.handoff_id || payload.handoffId || '';
    const model = payload.model || '';
    const usage = payload.usage || {};
    const tokenText = usage.total_tokens ? `${usage.total_tokens} Tokens` : '';
    const meta = [handoffId ? `Handoff ${handoffId}` : '', model, tokenText].filter(Boolean).join(' · ');
    const row = draftRowFor(newsRow);
    row.hidden = false;
    row.dataset.draft = draft;
    row.dataset.handoffId = handoffId;
    row.innerHTML = `<td colspan="6"><div class="post-draft-card">
      <h4>Postvorschlag</h4>
      ${meta ? `<p class="post-draft-meta">${escapeHtml(meta)}</p>` : ''}
      <div class="post-draft-text">${escapeHtml(draft || 'Kein Posttext zurückgegeben.')}</div>
      <div class="post-actions">
        <button class="post-action-button" type="button" data-draft-action="copy">Kopieren</button>
        <button class="post-action-button primary" type="button" data-draft-action="handoff">In ChatGPT weiterbearbeiten</button>
        <button class="post-action-button" type="button" data-draft-action="regenerate">Neu generieren</button>
      </div>
    </div></td>`;
    row._postItem = item;
  }

  async function createDraft(button, newsRow, item) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Erstelle …';
    try {
      const payload = await apiRequest('/monitor/post-draft', {
        method:'POST',
        body:{mode:'x', article:articlePayload(item)}
      });
      renderDraft(newsRow, item, payload);
      showToast('Postvorschlag erstellt.', 'ok');
    } catch (error) {
      showToast(`Postvorschlag fehlgeschlagen: ${error.message}`, 'error');
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  function buildHandoff(item, draft, handoffId) {
    const source = item.source || {};
    const detail = item.article_detail || {};
    const topics = Array.isArray(detail.topics) ? detail.topics.join(' · ') : '';
    const figures = Array.isArray(detail.figures) ? detail.figures.join(' · ') : '';
    const factors = Array.isArray(item.relevance_factors) ? item.relevance_factors.join(' · ') : '';
    return [
      'NEWSMONITOR-ÜBERGABE',
      handoffId ? `Handoff-ID: ${handoffId}` : '',
      'Projekt: EU Vertrag / Souveräne Schweiz',
      '',
      `Thema: ${item.headline || ''}`,
      `Quelle: ${item.source_display || source.name || ''}`,
      source.url ? `URL: ${source.url}` : '',
      item.page ? `Seite: ${item.page}` : '',
      '',
      'Monitor-Zusammenfassung:',
      detail.summary || item.summary || '',
      '',
      topics ? `Kernpunkte: ${topics}` : '',
      figures ? `Zahlen / Grössen: ${figures}` : '',
      item.why_important ? `Relevanz: ${item.why_important}` : '',
      factors ? `Relevanzfaktoren: ${factors}` : '',
      item.post_approach ? `Bisheriger Ansatz: ${item.post_approach}` : '',
      '',
      'Aktueller Postentwurf:',
      draft || '',
      '',
      'Auftrag:',
      'Bearbeite diesen Post mit mir ausführlich weiter. Prüfe bei Bedarf zusätzliche Primärquellen und aktuelle Fakten. Behalte die Regeln und den Stil des Projekts Souveräne Schweiz / EU Vertrag bei. Zeige Unsicherheiten klar auf und erfinde keine Fakten oder Zitate.'
    ].filter((line, index, all) => line !== '' || (index > 0 && all[index - 1] !== '')).join('\n').trim();
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }

  async function handleDraftAction(button) {
    const row = button.closest('.post-draft-row');
    if (!row) return;
    const draft = row.dataset.draft || '';
    const item = row._postItem || {};
    const action = button.dataset.draftAction;
    if (action === 'copy') {
      try {
        await copyText(draft);
        showToast('Postvorschlag kopiert.', 'ok');
      } catch (error) {
        showToast(`Kopieren fehlgeschlagen: ${error.message}`, 'error');
      }
      return;
    }
    if (action === 'handoff') {
      const target = window.open(CHATGPT_URL, '_blank', 'noopener,noreferrer');
      try {
        const text = buildHandoff(item, draft, row.dataset.handoffId || '');
        await copyText(text);
        showToast('Übergabepaket kopiert. In ChatGPT einfügen und weiterarbeiten.', 'ok');
        if (!target) showToast('Übergabepaket kopiert. ChatGPT-Popup wurde vom Browser blockiert.', 'error');
      } catch (error) {
        target?.close();
        showToast(`Übergabe fehlgeschlagen: ${error.message}`, 'error');
      }
      return;
    }
    if (action === 'regenerate') {
      const newsRow = row.previousElementSibling?.classList.contains('article-detail-row')
        ? row.previousElementSibling.previousElementSibling
        : row.previousElementSibling;
      const draftButton = newsRow?.querySelector('.post-draft-button');
      if (draftButton) await createDraft(draftButton, newsRow, item);
    }
  }

  function bindControlEvents() {
    document.addEventListener('click', async event => {
      const runButton = event.target.closest('[data-run-kind]');
      if (runButton) {
        event.preventDefault();
        await startRun(runButton.dataset.runKind, runButton);
        return;
      }
      const draftButton = event.target.closest('.post-draft-button');
      if (draftButton) {
        event.preventDefault();
        const newsRow = draftButton.closest('tr.news-row');
        if (!newsRow) return;
        try {
          const item = JSON.parse(draftButton.dataset.postItem || '{}');
          await createDraft(draftButton, newsRow, item);
        } catch (error) {
          showToast(`Artikeldaten konnten nicht gelesen werden: ${error.message}`, 'error');
        }
        return;
      }
      const actionButton = event.target.closest('[data-draft-action]');
      if (actionButton) {
        event.preventDefault();
        await handleDraftAction(actionButton);
      }
    });
  }

  function observeMonitor() {
    const root = document.getElementById('reports');
    if (!root) return;
    const observer = new MutationObserver(() => enhanceRunButtons());
    observer.observe(root, {childList:true, subtree:true});
  }

  function initControl() {
    ensureDialog();
    installSettingsButton();
    bindControlEvents();
    observeMonitor();
    enhanceRunButtons();
    window.setTimeout(refreshStatus, 900);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initControl);
  else initControl();
})();
