const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const START = 'https://epaper.nzz.ch/storefront/8';
const OUT = process.env.NZZAS_PDF_PATH || 'monitor-out/nzzas-current.pdf';

function cookieObjects(raw) {
  return String(raw || '').split(';').map(x => x.trim()).filter(Boolean).map(pair => {
    const i = pair.indexOf('=');
    if (i < 1) return null;
    return {
      name: pair.slice(0, i).trim(),
      value: pair.slice(i + 1).trim(),
      domain: '.nzz.ch',
      path: '/',
      secure: true,
      sameSite: 'Lax'
    };
  }).filter(Boolean);
}

async function saveResponsePdf(response) {
  try {
    const type = String(response.headers()['content-type'] || '').toLowerCase();
    const url = response.url().toLowerCase();
    if (!type.includes('application/pdf') && !url.includes('.pdf')) return false;
    const body = await response.body();
    if (!body || body.length < 100000 || body.slice(0, 4).toString() !== '%PDF') return false;
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, body);
    return true;
  } catch (_) {
    return false;
  }
}

(async () => {
  let browser;
  let saved = false;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ locale: 'de-CH' });
    const cookies = cookieObjects(process.env.NZZ_COOKIE_HEADER);
    if (cookies.length) await context.addCookies(cookies);
    const page = await context.newPage();

    page.on('response', async response => {
      if (!saved && await saveResponsePdf(response)) saved = true;
    });

    await page.goto(START, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);

    const sunday = page.getByText(/NZZ am Sonntag/i).first();
    if (await sunday.isVisible({ timeout: 4000 }).catch(() => false)) {
      await sunday.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(5000);
    }

    if (!saved) {
      const hrefs = await page.locator('a').evaluateAll(as => as.map(a => a.href).filter(Boolean));
      const pdfHref = hrefs.find(h => /\.pdf($|\?)/i.test(h));
      if (pdfHref) {
        const r = await context.request.get(pdfHref, { timeout: 60000 });
        const body = await r.body();
        if (r.ok() && body.slice(0, 4).toString() === '%PDF') {
          fs.mkdirSync(path.dirname(OUT), { recursive: true });
          fs.writeFileSync(OUT, body);
          saved = true;
        }
      }
    }

    if (!saved) {
      const buttons = [/pdf/i, /download/i, /herunterladen/i, /ausgabe laden/i];
      for (const rx of buttons) {
        const el = page.getByText(rx).first();
        if (!await el.isVisible({ timeout: 1200 }).catch(() => false)) continue;
        const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
        await el.click({ timeout: 3000 }).catch(() => {});
        const download = await downloadPromise;
        if (download) {
          fs.mkdirSync(path.dirname(OUT), { recursive: true });
          await download.saveAs(OUT);
          const head = fs.readFileSync(OUT, { encoding: null, flag: 'r' }).subarray(0, 4).toString();
          if (head === '%PDF') saved = true;
        }
        if (saved) break;
      }
    }

    console.log(`NZZaS PDF download: ${saved ? 'PDF saved' : 'no PDF detected'}`);
  } catch (err) {
    console.log(`NZZaS PDF download: ${err.name || 'Error'}: ${String(err.message || err).slice(0, 220)}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();
