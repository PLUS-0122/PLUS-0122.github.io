// Load the 3D badge after the page has painted. If the module or WebGL is
// unavailable the static WebP underneath simply stays visible, so the hero
// never depends on JavaScript to look right.

(function () {
  var stage = document.getElementById('stage');
  if (!stage) return;

  function boot() {
    import('./js/badge3d.js')
      .then(function (mod) { return mod.start(stage); })
      .catch(function (err) {
        console.warn('3D badge unavailable, keeping the still image.', err);
      });
  }

  var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 300); };

  if (document.readyState === 'complete') idle(boot);
  else window.addEventListener('load', function () { idle(boot); }, { once: true });
})();
