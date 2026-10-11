const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { chromium } = require('playwright');

const OUT = process.env.NZZAS_EPAPER_OUTPUT || 'monitor-out/nzzas-epaper.json';
const PDF = process.env.NZZAS_PDF_PATH || 'monitor-out/nzzas-current.pdf';
const START = 'https://epaper.nzz.ch/storefront/8';

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

function writeFailure(error, selected) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({
    source_id: 'nzzas-epaper',
    source_name: 'NZZ am Sonntag E-Paper',
    priority: 'M1',
    status: 'structure_changed',
    http_status: 200,
    final_url: START,
    attempted_at: new Date().toISOString(),
    findings: [],
    error,
    metadata: { edition_selected: selected, pdf_detected: false }
  }, null, 2) + '\n');
}

async function savePdfResponse(response) {
  try {
    const type = String(response.headers()['content-type'] || '').toLowerCase();
    const url = response.url().toLowerCase();
    if (!type.includes('application/pdf') && !/\.pdf($|\?)/i.test(url)) return false;
    const body = await response.body();
    if (!body || body.length < 100000 || body.subarray(0, 4).toString() !== '%PDF') return false;
    fs.mkdirSync(path.dirname(PDF), { recursive: true });
    fs.writeFileSync(PDF, body);
    return true;
  } catch (_) {
    return false;
  }
}

(async () => {
  let browser;
  let selected = false;
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

    const sunday = page.getByText(/NZZ am Sonntag/i).first();
    if (await sunday.isVisible({ timeout: 4000 }).catch(() => false)) {
      await sunday.click({ timeout: 5000 }).catch(() => {});
      selected = true;
      await page.waitForTimeout(5000);
    }

    if (!saved) {
      const hrefs = await page.locator('a').evaluateAll(as => as.map(a => a.href).filter(Boolean));
      const pdfHref = hrefs.find(h => /\.pdf($|\?)/i.test(h));
      if (pdfHref) {
        const r = await context.request.get(pdfHref, { timeout: 60000 });
        const body = await r.body();
        if (r.ok() && body.subarray(0, 4).toString() === '%PDF') {
          fs.mkdirSync(path.dirname(PDF), { recursive: true });
          fs.writeFileSync(PDF, body);
          saved = true;
        }
      }
    }

    if (!saved) {
      for (const rx of [/pdf/i, /download/i, /herunterladen/i, /ausgabe laden/i]) {
        const el = page.getByText(rx).first();
        if (!await el.isVisible({ timeout: 1200 }).catch(() => false)) continue;
        const wait = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
        await el.click({ timeout: 3000 }).catch(() => {});
        const dl = await wait;
        if (dl) {
          fs.mkdirSync(path.dirname(PDF), { recursive: true });
          await dl.saveAs(PDF);
          const head = fs.readFileSync(PDF).subarray(0, 4).toString();
          if (head === '%PDF') saved = true;
        }
        if (saved) break;
      }
    }

    if (!saved) {
      writeFailure('NZZaS edition selected, but no PDF download was detected', selected);
      console.log(`NZZaS E-Paper: selected=${selected}; PDF not detected`);
      return;
    }

    cp.execFileSync('python', ['-m', 'pip', 'install', '--disable-pip-version-check', '--quiet', 'pymupdf'], { stdio: 'inherit' });
    cp.execFileSync('python', ['.github/scripts/monitor/nzzas_pdf_extract.py'], {
      stdio: 'inherit',
      env: { ...process.env, NZZAS_PDF_PATH: PDF, NZZAS_EPAPER_OUTPUT: OUT }
    });
    fs.rmSync(PDF, { force: true });
    console.log(`NZZaS E-Paper: selected=${selected}; PDF parsed; temporary PDF removed`);
  } catch (err) {
    writeFailure(`${err.name || 'Error'}: ${String(err.message || err).slice(0, 300)}`, selected);
    try { fs.rmSync(PDF, { force: true }); } catch (_) {}
    console.log(`NZZaS E-Paper: failed: ${String(err.message || err).slice(0, 220)}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();
