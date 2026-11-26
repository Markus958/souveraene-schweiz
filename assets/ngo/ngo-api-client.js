/* Begrenzter Browserzugriff auf die öffentliche NGO-API. */
(function (root, factory) {
  'use strict';
  root.NgoApi = factory;
})(window, function (optionen) {
  'use strict';
  optionen = optionen || {};
  var basis = String(optionen.basis || '').replace(/\/$/, '');
  var senden = optionen.fetch || window.fetch.bind(window);
  if (!/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(basis)) {
    throw new Error('API-Basisadresse fehlt oder ist ungültig');
  }

  function query(werte) {
    var q = new URLSearchParams();
    Object.keys(werte || {}).forEach(function (name) {
      var wert = werte[name];
      if (wert !== '' && wert !== null && wert !== undefined) q.set(name, String(wert));
    });
    return q.toString();
  }

  async function get(pfad, werte, signal) {
    var q = query(werte);
    var antwort = await senden(basis + pfad + (q ? '?' + q : ''), {
      method: 'GET', credentials: 'include', cache: 'no-store',
      headers: { Accept: 'application/json' }, signal: signal
    });
    if (!antwort.ok) {
      var fehler = new Error('HTTP ' + antwort.status);
      fehler.status = antwort.status;
      throw fehler;
    }
    return antwort.json();
  }

  function suchbegriff(wert) {
    wert = String(wert || '').trim();
    if (wert.length < 3 || wert.length > 60) throw new Error('Suchbegriff ungültig');
    return wert;
  }

  return Object.freeze({
    optionen: function (signal) {
      return get('/private/v3/cockpit/options', null, signal);
    },
    cockpit: function (filter, signal) {
      return get('/private/v3/cockpit/filtered', filter, signal);
    },
    suchen: function (art, begriff, filter, signal) {
      var pfad = art === 'person' ? '/private/v2/people/search' :
        art === 'organisation' ? '/private/v2/organisations/search' : '';
      if (!pfad) throw new Error('Suchart ungültig');
      var werte = Object.assign({}, filter || {}, { suche: suchbegriff(begriff), limit: 10, netz: 'G3' });
      return get(pfad, werte, signal);
    },
    referenz: function (token, typ, aktion, werte, signal) {
      if (!/^r1_[A-Za-z0-9_-]+$/.test(String(token || ''))) throw new Error('Referenz ungültig');
      return get('/private/v3/ref/' + encodeURIComponent(token),
        Object.assign({}, werte || {}, { typ: typ, aktion: aktion }), signal);
    }
  });
});
