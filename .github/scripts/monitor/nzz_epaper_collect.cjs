const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const START = 'https://epaper.nzz.ch/storefront/8';
const EDITION = (process.env.NZZ_EPAPER_EDITION || 'nzz').trim().toLowerCase();
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
    const candidates = [
      page.getByText(/NZZ am Sonntag/i),
      page.getByText(/NZZaS/i),
    ];
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

async function tryVisibleDownloads(page, context) {
  const patterns = [/gesamtausgabe/i, /ausgabe.*laden/i, /download/i, /herunterladen/i, /pdf/i];
  for (const rx of patterns) {
    const locators = [
      page.getByRole('button', { name: rx }),
      page.getByRole('link', { name: rx }),
      page.getByText(rx),
    ];
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
    storefront: START,
    attempted_at: new Date().toISOString(),
    edition_selected: false,
    pdf_detected: false,
    pdf_path: PDF,
    final_url: null,
    error: null,
    diagnostics: { frames: [], candidate_texts: [] }
  };

  let browser;
  let saved = false;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ locale: 'de-CH' });
    const cookies = cookieObjects(process.env.NZZ_COOKIE_HEADER);
    if (cookies.length) await context.addCookies(cookies);

    const attach = page => {
      page.on('response', async response => {
        if (!saved && await savePdfResponse(response)) saved = true;
      });
    };
    context.on('page', attach);

    const page = await context.newPage();
    attach(page);
    await page.goto(START, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);

    result.diagnostics.candidate_texts = (await page.locator('a,button,[role="button"],[role="link"]').evaluateAll(els =>
      els.map(el => String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(t => /nzz|download|laden|pdf|gesamtausgabe/i.test(t))
        .filter(Boolean)
        .slice(0, 30)
    ).catch(() => [])).map(t => t.slice(0, 160));

    result.edition_selected = await chooseEdition(page);
    await page.waitForTimeout(5000);
    result.final_url = safeUrl(page.url());
    result.diagnostics.frames = page.frames().map(f => safeUrl(f.url())).slice(0, 20);

    if (!saved) {
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
    }

    if (!saved) saved = await tryVisibleDownloads(page, context);

    result.pdf_detected = saved;
    if (!saved) result.error = 'no PDF download was detected';
    writeMeta(result);
    console.log(`NZZ E-Paper collector: edition=${EDITION}; selected=${result.edition_selected}; pdf=${saved}; frames=${result.diagnostics.frames.length}`);
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
