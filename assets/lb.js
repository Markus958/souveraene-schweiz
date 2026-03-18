/* ── Lightbox ── */
(function () {
  var overlay, img;

  function build() {
    overlay = document.createElement('div');
    overlay.id = 'lb-overlay';
    overlay.innerHTML = '<img id="lb-img" alt="" />';
    document.body.appendChild(overlay);
    img = overlay.querySelector('#lb-img');
    overlay.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
  }

  function open(src, alt) {
    if (!overlay) build();
    img.src = src;
    img.alt = alt || '';
    overlay.classList.add('lb-open');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove('lb-open');
    document.body.style.overflow = '';
  }

  function init() {
    document.querySelectorAll('figure img, .kostenhammer-img, .sb-figure img').forEach(function (el) {
      el.style.cursor = 'zoom-in';
      el.addEventListener('click', function () {
        open(el.src, el.alt);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
