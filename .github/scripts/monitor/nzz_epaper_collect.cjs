const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const START = 'https://epaper.nzz.ch/storefront/8';
const EDITION = (process.env.NZZ_EPAPER_EDITION || 'nzz').trim().toLowerCase();
const TARGET_DATE = (process.env.NZZ_EPAPER_TARGET_DATE || '').trim();
const PDF = process.env.NZZ_EPAPER_PDF_PATH || `monitor-out/${EDITION}-current.pdf`;
const META = process.env.NZZ_EPAPER_META_PATH || `monitor-out/${EDITION}-epaper-download.json`;

function cookieObjects(raw) {
  return String(raw || '').split(';').map(x => x.trim()).filter(Boolean).map(pair => {
    const i = pair.indexOf('=');
    if (i < 1) return null;
    return {
      name: pair.slice(0, i).trim(),
      value: pair.slice(i + 1).trim(),
      domain: '.nzz.ch', path: '/', secure: true, sameSite: 'Lax'
    };
  }).filter(Boolean);
}

function writeMeta(obj) {
  fs.mkdirSync(path.dirname(META), { recursive: true });
  fs.writeFileSync(META, JSON.stringify(obj, null, 2) + '\n');
}

function validPdf(buf) {
  return !!buf && buf.length > 100000 && buf.subarray(0, 4).toString() === '%PDF';
}

function safeUrl(raw) {
  try {
    const u = new URL(raw);
    return `${u.origin}${u.pathname}`;
  } catch (_) {
    return String(raw || '').slice(0, 250);
  }
}

async function persistPdf(buf) {
  if (!validPdf(buf)) return false;
  fs.mkdirSync(path.dirname(PDF), { recursive: true });
  fs.writeFileSync(PDF, buf);
  return true;
}

async function savePdfResponse(response) {
  try {
    const type = String(response.headers()['content-type'] || '').toLowerCase();
    const url = response.url().toLowerCase();
    if (!type.includes('application/pdf') && !/\.pdf($|\?)/i.test(url)) return false;
    return await persistPdf(await response.body());
  } catch (_) {
    return false;
  }
}

async function chooseEdition(page) {
  if (EDITION === 'nzzas') {
    const candidates = [page.getByText(/NZZ am Sonntag/i), page.getByText(/NZZaS/i)];
    for (const loc of candidates) {
      const el = loc.first();
      if (await el.isVisible({ timeout: 1800 }).catch(() => false)) {
        await el.click({ timeout: 5000 }).catch(() => {});
        return true;
      }
    }
    return false;
  }

  const texts = [/Neue Z[uü]rcher Zeitung/i, /\bNZZ\b/i];
  for (const rx of texts) {
    const loc = page.getByText(rx);
    const count = await loc.count().catch(() => 0);
    for (let i = 0; i < Math.min(count, 12); i++) {
      const el = loc.nth(i);
      if (!await el.isVisible({ timeout: 600 }).catch(() => false)) continue;
      const txt = String(await el.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      if (/sonntag/i.test(txt)) continue;
      await el.click({ timeout: 5000 }).catch(() => {});
      return true;
    }
  }
  return false;
}

function datePatterns(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return [];
  const [, y, mm, dd] = m;
  const d = String(Number(dd));
  const month = String(Number(mm));
  const names = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  const monthName = names[Number(mm) - 1];
  return [
    new RegExp(`${dd}\\.${mm}\\.${y}`),
    new RegExp(`${d}\\.${month}\\.${y}`),
    new RegExp(`${dd}\\.${mm}\\.`),
    new RegExp(`${d}\\.\\s*${monthName}\\s*${y}`, 'i'),
  ];
}

async function chooseIssueDate(page) {
  if (!TARGET_DATE) return false;
  for (const rx of datePatterns(TARGET_DATE)) {
    const loc = page.getByText(rx);
    const count = await loc.count().catch(() => 0);
    for (let i = 0; i < Math.min(count, 20); i++) {
      const el = loc.nth(i);
      if (!await el.isVisible({ timeout: 500 }).catch(() => false)) continue;
      await el.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(2500);
      return true;
    }
  }
  return false;
}

async function tryVisibleDownloads(page, context) {
  const patterns = [/gesamtausgabe/i, /ausgabe.*laden/i, /download/i, /herunterladen/i, /pdf/i];
  for (const rx of patterns) {
    const locators = [page.getByRole('button', { name: rx }), page.getByRole('link', { name: rx }), page.getByText(rx)];
    for (const loc of locators) {
      const count = await loc.count().catch(() => 0);
      for (let i = 0; i < Math.min(count, 8); i++) {
        const el = loc.nth(i);
        if (!await el.isVisible({ timeout: 500 }).catch(() => false)) continue;
        const waitDownload = page.waitForEvent('download', { timeout: 12000 }).catch(() => null);
        const waitPopup = page.waitForEvent('popup', { timeout: 5000 }).catch(() => null);
        await el.click({ timeout: 4000 }).catch(() => {});
        const dl = await waitDownload;
        if (dl) {
          await dl.saveAs(PDF);
          if (validPdf(fs.readFileSync(PDF))) return true;
        }
        const popup = await waitPopup;
        if (popup) {
          await popup.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
          const r = await context.request.get(popup.url(), { timeout: 60000 }).catch(() => null);
          if (r && r.ok() && await persistPdf(await r.body())) return true;
        }
        await page.waitForTimeout(1500);
      }
    }
  }
  return false;
}

(async () => {
  const result = {
    edition: EDITION,
    target_date: TARGET_DATE || null,
    storefront: START,
    attempted_at: new Date().toISOString(),
    edition_selected: false,
    target_date_selected: false,
    pdf_detected: false,
    pdf_path: PDF,
    final_url: null,
    error: null,
    diagnostics: { frames: [], candidate_texts: [] }
  };

  let browser;
  let saved = false;
  let captureEnabled = false;
  const attachedPages = new WeakSet();
  const responseTasks = new Set();

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ locale: 'de-CH' });
    const cookies = cookieObjects(process.env.NZZ_COOKIE_HEADER);
    if (cookies.length) await context.addCookies(cookies);

    const attach = page => {
      if (!page || attachedPages.has(page)) return;
      attachedPages.add(page);
      page.on('response', response => {
        if (!captureEnabled) return;
        const task = (async () => {
          if (saved) return;
          const responseSaved = await savePdfResponse(response);
          if (responseSaved) saved = true;
        })();
        responseTasks.add(task);
        task.finally(() => responseTasks.delete(task));
      });
    };
    context.on('page', attach);

    const page = await context.newPage();
    attach(page);
    await page.goto(START, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);

    result.diagnostics.candidate_texts = (await page.locator('a,button,[role="button"],[role="link"]').evaluateAll(els =>
      els.map(el => String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(t => /nzz|download|laden|pdf|gesamtausgabe|2026/i.test(t))
        .filter(Boolean)
        .slice(0, 50)
    ).catch(() => [])).map(t => t.slice(0, 180));

    result.edition_selected = await chooseEdition(page);
    await page.waitForTimeout(2500);
    result.target_date_selected = await chooseIssueDate(page);
    await page.waitForTimeout(2500);

    // Erst jetzt PDFs akzeptieren. Beim Laden des Storefronts können alte,
    // zuletzt geöffnete Ausgaben als PDF-Response erscheinen.
    captureEnabled = true;
    result.final_url = safeUrl(page.url());
    result.diagnostics.frames = page.frames().map(f => safeUrl(f.url())).slice(0, 20);

    for (const frame of page.frames()) {
      const hrefs = await frame.locator('a').evaluateAll(as => as.map(a => a.href).filter(Boolean)).catch(() => []);
      for (const href of hrefs.filter(h => /\.pdf($|\?)/i.test(h)).slice(0, 10)) {
        const r = await context.request.get(href, { timeout: 60000 }).catch(() => null);
        if (r && r.ok() && await persistPdf(await r.body())) {
          saved = true;
          break;
        }
      }
      if (saved) break;
    }

    if (!saved) saved = await tryVisibleDownloads(page, context);
    if (!saved && responseTasks.size) await Promise.allSettled([...responseTasks]);

    if (!saved && fs.existsSync(PDF)) {
      try { saved = validPdf(fs.readFileSync(PDF)); } catch (_) { saved = false; }
    }

    result.pdf_detected = saved;
    if (!saved) result.error = 'no PDF download was detected';
    writeMeta(result);
    console.log(`NZZ E-Paper collector: edition=${EDITION}; target=${TARGET_DATE || '-'}; date_selected=${result.target_date_selected}; pdf=${saved}`);
    process.exit(saved ? 0 : 2);
  } catch (err) {
    result.error = `${err.name || 'Error'}: ${String(err.message || err).slice(0, 300)}`;
    writeMeta(result);
    console.log(`NZZ E-Paper collector failed: ${result.error}`);
    process.exit(2);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();
