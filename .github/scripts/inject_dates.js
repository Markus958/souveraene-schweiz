// Läuft in GitHub Actions: ersetzt <!--LASTMOD--> durch das Git-Datum der jeweiligen Datei
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const MONATE = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

function toGerman(iso) {
  if (!iso) return '–';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d}. ${MONATE[m - 1]} ${y}`;
}

function walk(dir, files = []) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory() && !f.startsWith('.')) walk(full, files);
    else if (f.endsWith('.html')) files.push(full);
  }
  return files;
}

const root = process.cwd();
let n = 0;
for (const fp of walk(root)) {
  let html = fs.readFileSync(fp, 'utf8');
  if (!html.includes('<!--LASTMOD-->')) continue;

  const rel = path.relative(root, fp).replace(/\\/g, '/');
  try {
    const iso = execSync(`git log -1 --format="%as" -- "${rel}"`).toString().trim();
    const german = toGerman(iso);
    html = html.replace('<!--LASTMOD-->', german);
    fs.writeFileSync(fp, html, 'utf8');
    console.log(`${rel}: ${german}`);
    n++;
  } catch (e) {
    console.error(`${rel}: ERROR - ${e.message}`);
  }
}
console.log(`\nFertig: ${n} Seiten mit Datum versehen.`);
