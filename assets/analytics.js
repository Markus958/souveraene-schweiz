// ── GoatCounter Event Tracking ──────────────────────────────────────────────
//
// Custom Event auslösen:
//   gcEvent('kategorie/bezeichnung', 'Lesbarer Titel')
//
// Konventionen für neue Inhalte:
//   Videos/Audio:   gcEvent('media/video-pfz',        'Media: PFZ abgespielt')
//   PDF-Downloads:  gcEvent('download/pfz-bericht',   'Download: PFZ Bericht')
//   Faktenchecks:   gcEvent('fc/fc-16-kovic',         'FC: Kovic geöffnet')
//   Outbound-Links: werden automatisch erfasst (siehe unten)
// ─────────────────────────────────────────────────────────────────────────────

function gcEvent(path, title) {
  if (window.goatcounter && window.goatcounter.count) {
    const pageUrl = window.location.href.split('?')[0];
    window.goatcounter.count({ path: path, title: (title || path) + ' | ' + pageUrl, event: true });
  }
}

// Outbound-Link-Tracking (automatisch für alle externen Links)
document.addEventListener('click', function (e) {
  var a = e.target.closest('a[href]');
  if (!a) return;
  try {
    var url = new URL(a.href);
    if (url.hostname && url.hostname !== location.hostname) {
      gcEvent('outbound/' + url.hostname + url.pathname, 'Outbound: ' + url.hostname);
    }
  } catch (ignore) {}
});
