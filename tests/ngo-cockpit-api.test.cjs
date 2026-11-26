const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const clientSource = fs.readFileSync(path.join(root, 'assets/ngo/ngo-api-client.js'), 'utf8');
const cockpitSource = fs.readFileSync(path.join(root, 'assets/ngo/ngo-cockpit-api.js'), 'utf8');
const cockpitHtml = fs.readFileSync(path.join(root, 'NGO/cockpit.html'), 'utf8');

const calls = [];
const context = {
  URLSearchParams,
  AbortController,
  window: {
    fetch: async (url, options) => {
      calls.push({url, options});
      return {ok: true, json: async () => ({aggregiert: true})};
    }
  }
};
vm.createContext(context);
vm.runInContext(clientSource, context, {filename: 'ngo-api-client.js'});

assert.throws(
  () => context.window.NgoApi({basis: 'http://127.0.0.1:8877'}),
  /API-Basisadresse/
);

const api = context.window.NgoApi({basis: 'https://api.example.test:10000/'});

(async () => {
  await api.cockpit({
    kategorie: 'BILDUNG_FORSCHUNG', kanton: 'ZH', cluster_min: 10,
    klassen: 'N1,N3', kernnetz: 1, bruecken: '', mit_personen: 1
  });
  assert.equal(
    calls[0].url,
    'https://api.example.test:10000/private/v3/cockpit/filtered?' +
      'kategorie=BILDUNG_FORSCHUNG&kanton=ZH&cluster_min=10&klassen=N1%2CN3&kernnetz=1&mit_personen=1'
  );
  assert.equal(calls[0].options.credentials, 'include');
  assert.equal(calls[0].options.cache, 'no-store');

  await api.suchen('person', 'Müller');
  assert.match(calls[1].url, /\/private\/v2\/people\/search\?/);
  assert.match(calls[1].url, /suche=M%C3%BCller/);
  assert.match(calls[1].url, /limit=10/);
  assert.throws(() => api.suchen('person', 'ab'), /Suchbegriff/);

  assert.doesNotMatch(cockpitSource, /ngo-netzwerk\.json/);
  assert.doesNotMatch(cockpitSource, /fetch\s*\(/);
  assert.doesNotMatch(cockpitHtml, /data-quelle=/);
  assert.match(cockpitHtml, /ngo-api-client\.js/);
  assert.match(cockpitHtml, /ngo-cockpit-api\.js/);
  assert.doesNotMatch(cockpitHtml, /ngo-netz-daten\.js/);

  console.log('NGO cockpit API integration tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
