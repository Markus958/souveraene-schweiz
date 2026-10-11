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

async function savePdfResponse(response) {
  try {
    const type = String(response.headers()['content-type'] || '').toLowerCase();
    const url = response.url().toLowerCase();
    if (!type.includes('application/pdf') && !/\.pdf($|\?)/i.test(url)) return false;
    const body = await response.body();
    if (!validPdf(body)) return false;
    fs.mkdirSync(path.dirname(PDF), { recursive: true });
    fs.writeFileSync(PDF, body);
    return true;
  } catch (_) {
    return false;
  }
}

(async () => {
  const label = EDITION === 'nzzas' ? /NZZ am Sonntag/i : /^NZZ$/i;
  const result = {
    edition: EDITION,
    storefront: START,
    attempted_at: new Date().toISOString(),
    edition_selected: false,
    pdf_detected: false,
    pdf_path: PDF,
    final_url: null,
    error: null
  };

  let browser;
  let saved = false;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ locale: 'de-CH' });
    const cookies = cookieObjects(process.env.NZZ_COOKIE_HEADER);
    if (cookies.length) await context.addCookies(cookies);
    const page = await context.newPage();

    page.on('response', async response => {
      if (!saved && await savePdfResponse(response)) saved = true;
    });

    await page.goto(START, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);

    const edition = page.getByText(label).first();
    if (await edition.isVisible({ timeout: 5000 }).catch(() => false)) {
      await edition.click({ timeout: 5000 }).catch(() => {});
      result.edition_selected = true;
      await page.waitForTimeout(5000);
    }
    result.final_url = page.url();

    if (!saved) {
      const hrefs = await page.locator('a').evaluateAll(as => as.map(a => a.href).filter(Boolean));
      const pdfHref = hrefs.find(h => /\.pdf($|\?)/i.test(h));
      if (pdfHref) {
        const r = await context.request.get(pdfHref, { timeout: 60000 });
        const body = await r.body();
        if (r.ok() && validPdf(body)) {
          fs.mkdirSync(path.dirname(PDF), { recursive: true });
          fs.writeFileSync(PDF, body);
          saved = true;
        }
      }
    }

    if (!saved) {
      const selectors = [/pdf/i, /download/i, /herunterladen/i, /ausgabe laden/i, /gesamtausgabe/i];
      for (const rx of selectors) {
        const el = page.getByText(rx).first();
        if (!await el.isVisible({ timeout: 1200 }).catch(() => false)) continue;
        const wait = page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
        await el.click({ timeout: 4000 }).catch(() => {});
        const dl = await wait;
        if (dl) {
          fs.mkdirSync(path.dirname(PDF), { recursive: true });
          await dl.saveAs(PDF);
          const body = fs.readFileSync(PDF);
          if (validPdf(body)) saved = true;
        }
        if (saved) break;
      }
    }

    result.pdf_detected = saved;
    if (!saved) result.error = 'edition selected, but no PDF download was detected';
    writeMeta(result);
    console.log(`NZZ E-Paper collector: edition=${EDITION}; selected=${result.edition_selected}; pdf=${saved}`);
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
