/*
 * Cross-app Light/Dark theme.
 *
 * Loaded by every page in apps/* — homepage, chat, product-explorer, and
 * each dashboard page. Independent of the dashboard's TypeScript build.
 *
 * - Stores the choice in localStorage under "app-theme" (values: "light" | "dark").
 * - Default is light.
 * - Sets <html class="theme-light"> or "theme-dark" before paint to avoid a flash.
 * - Renders a small toggle button. If the page has [data-theme-mount] it
 *   mounts there; otherwise it floats in the bottom-right corner.
 * - Other tabs see the change live via the "storage" event.
 */
(function () {
  var STORAGE_KEY = 'app-theme';
  var VALID = { light: 1, dark: 1 };
  var ROOT = document.documentElement;

  function read() {
    try {
      var v = window.localStorage.getItem(STORAGE_KEY);
      return VALID[v] ? v : 'light';
    } catch (e) {
      return 'light';
    }
  }
  function write(v) {
    try { window.localStorage.setItem(STORAGE_KEY, v); } catch (e) { /* ignore */ }
  }

  function apply(theme) {
    ROOT.classList.remove('theme-light', 'theme-dark');
    ROOT.classList.add('theme-' + theme);
    ROOT.setAttribute('data-theme', theme);
    // Update any rendered toggle buttons.
    var btns = document.querySelectorAll('[data-theme-button]');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var target = b.getAttribute('data-theme-button');
      var active = target === theme;
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  }

  // Apply as early as possible so the page paints in the right theme.
  apply(read());

  function ensureToggle() {
    if (document.querySelector('[data-theme-toggle]')) return;

    var mount = document.querySelector('[data-theme-mount]');
    var floating = false;
    if (!mount) {
      mount = document.createElement('div');
      mount.style.cssText =
        'position:fixed;right:16px;bottom:16px;z-index:9999;' +
        'font-family:Inter,system-ui,-apple-system,sans-serif;';
      document.body.appendChild(mount);
      floating = true;
    }

    var wrap = document.createElement('div');
    wrap.setAttribute('data-theme-toggle', '');
    wrap.className = 'app-theme-toggle' + (floating ? ' app-theme-toggle--floating' : '');
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Theme');

    wrap.innerHTML =
      '<button type="button" data-theme-button="light" title="Light theme" aria-pressed="false">' +
        '<span class="material-symbols-outlined" aria-hidden="true">light_mode</span><span class="label">Light</span>' +
      '</button>' +
      '<button type="button" data-theme-button="dark" title="Dark theme" aria-pressed="false">' +
        '<span class="material-symbols-outlined" aria-hidden="true">dark_mode</span><span class="label">Dark</span>' +
      '</button>';

    wrap.addEventListener('click', function (e) {
      var t = e.target;
      while (t && t !== wrap && !t.getAttribute('data-theme-button')) t = t.parentNode;
      if (!t || t === wrap) return;
      var theme = t.getAttribute('data-theme-button');
      if (!VALID[theme]) return;
      apply(theme);
      write(theme);
    });

    mount.appendChild(wrap);
    apply(read());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureToggle);
  } else {
    ensureToggle();
  }

  window.addEventListener('storage', function (e) {
    if (e.key === STORAGE_KEY && VALID[e.newValue]) apply(e.newValue);
  });

  window.appTheme = {
    get: read,
    set: function (v) { if (VALID[v]) { apply(v); write(v); } },
    toggle: function () { var n = read() === 'dark' ? 'light' : 'dark'; apply(n); write(n); },
  };
})();
