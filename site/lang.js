// Shows Norwegian or English: the saved choice, else the browser's language (Norwegian for nb/nn/no).
(function () {
  var root = document.documentElement;
  function pick(lang) {
    root.dataset.lang = lang;
    root.lang = lang;
    document.querySelectorAll('.lang button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.set === lang));
    });
    try {
      localStorage.setItem('grocr.lang', lang);
    } catch (e) {}
  }
  var saved = null;
  try {
    saved = localStorage.getItem('grocr.lang');
  } catch (e) {}
  var browser = (navigator.language || 'en').slice(0, 2);
  pick(saved || (['nb', 'nn', 'no'].indexOf(browser) >= 0 ? 'nb' : 'en'));
  document.addEventListener('click', function (e) {
    var set = e.target.closest && e.target.closest('[data-set]');
    if (set) pick(set.dataset.set);
  });
})();
