const fs = require('fs');
const crypto = require('crypto');
const { chromium } = require('playwright');

const OUT = process.env.NZZAS_EPAPER_OUTPUT || 'monitor-out/nzzas-epaper.json';
const START = 'https://epaper.nzz.ch/storefront/8';
const SOURCE_ID = 'nzzas-epaper';

function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
function fp(title, url) {
  return crypto.createHash('sha256').update(`${SOURCE_ID}|${title.toLowerCase()}|${url}`).digest('hex');
}
function write(obj) {
  fs.mkdirSync(require('path').dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(obj, null, 2) + '\n');
}
function goodTitle(t) {
  if (t.length < 24 || t.length > 220) return false;
  const l = t.toLowerCase();
  const bad = ['nzz am sonntag','neue zürcher zeitung','anmelden','abonnieren','datenschutz','impressum','cookie','e-paper','epaper'];
  if (bad.some(x => l === x)) return false;
  return t.split(/\s+/).length >= 4;
}

(async () => {
  const result = {
    source_id: SOURCE_ID,
    source_name: 'NZZ am Sonntag E-Paper',
    priority: 'M1',
    status: 'unreachable',
    http_status: null,
    final_url: null,
    attempted_at: new Date().toISOString(),
    findings: [],
    error: null,
    metadata: { edition_selected: false, session_header_used: false }
  };

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const headers = {};
    if (process.env.NZZ_COOKIE_HEADER) {
      headers.Cookie = process.env.NZZ_COOKIE_HEADER;
      result.metadata.session_header_used = true;
    }
    const context = await browser.newContext({ locale: 'de-CH', extraHTTPHeaders: headers });
    const page = await context.newPage();
    const response = await page.goto(START, { waitUntil: 'domcontentloaded', timeout: 60000 });
    result.http_status = response ? response.status() : 0;
    await page.waitForTimeout(6000);

    const sunday = page.getByText(/NZZ am Sonntag/i).first();
    if (await sunday.isVisible({ timeout: 3000 }).catch(() => false)) {
      await sunday.click({ timeout: 5000 }).catch(() => {});
      result.metadata.edition_selected = true;
      await page.waitForTimeout(5000);
    }

    result.final_url = page.url();
    const rows = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('a,h1,h2,h3,[role="link"],[class*="headline" i],[class*="title" i]')) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const text = String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        let href = '';
        if (el.tagName === 'A') href = el.href || '';
        else {
          const a = el.closest('a') || el.querySelector('a');
          if (a) href = a.href || '';
        }
        out.push({ text, href });
      }
      return out;
    });

    const seen = new Set();
    for (const row of rows) {
      const title = clean(row.text);
      if (!goodTitle(title)) continue;
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const url = /^https?:/i.test(row.href || '') ? row.href : result.final_url;
      result.findings.push({
        source_id: SOURCE_ID,
        source_name: 'NZZ am Sonntag E-Paper',
        source_class: 'B',
        priority: 'M1',
        title,
        url,
        fingerprint: fp(title, url),
        fetched_at: new Date().toISOString(),
        topics: ['schweizer-politik','schweiz-eu','migration','wirtschaft','energie','international','f35','patriot','ubs','ahv']
      });
      if (result.findings.length >= 120) break;
    }

    result.status = result.findings.length ? 'new_publication' : 'structure_changed';
    if (!result.findings.length) result.error = 'no article-like titles found';
    write(result);
    console.log(`NZZaS E-Paper: selected=${result.metadata.edition_selected}; findings=${result.findings.length}; status=${result.status}`);
    console.log('No article body text is logged or stored.');
  } catch (err) {
    result.error = `${err.name || 'Error'}: ${String(err.message || err).slice(0, 300)}`;
    write(result);
    console.log(`NZZaS E-Paper: ${result.status}; ${result.error}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
})();
