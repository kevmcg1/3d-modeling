// "Not available yet" gate. Loaded first in <head> of every page, before the app.
// While LOCKED is true it shows a full-screen popup over the page (the app still loads and shows
// behind it, but can't be clicked) and blocks right-click, F12, Ctrl+U, Ctrl+Shift+I/J/C (and the Mac Cmd+Option equivalents).
// To work on the app yourself, set LOCKED to false (or remove the <script src="gate.js"> line).
// Note: this is a browser-side deterrent only. The files are public in the GitHub repo.
(function () {
  var LOCKED = true;
  if (!LOCKED) return;

  var MSG = 'Looks like you found the URL! Unfortunately this isn’t available yet.';

  function block(e) { e.preventDefault(); e.stopImmediatePropagation(); return false; }

  window.addEventListener('contextmenu', block, true);
  var dismissed = false;
  window.addEventListener('keydown', function (e) {
    var k = (e.key || '').toLowerCase(), c = e.code;
    // the "-" key dismisses the popup (the owner's bypass); the page behind it is then usable
    if (!dismissed && (e.key === '-' || c === 'Minus' || c === 'NumpadSubtract') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      dismissed = true; var g = document.getElementById('nyGate'), gs = document.getElementById('nyGateStyle');
      if (g) { g.style.transition = 'opacity .25s ease'; g.style.opacity = '0'; setTimeout(function () { if (g.parentNode) g.remove(); if (gs && gs.parentNode) gs.remove(); }, 260); }
      return;
    }
    var ctrl = e.ctrlKey || e.metaKey;
    var devtools =
      e.key === 'F12' || c === 'F12' ||
      (ctrl && !e.altKey && e.shiftKey && (c === 'KeyI' || c === 'KeyJ' || c === 'KeyC' || k === 'i' || k === 'j' || k === 'c')) ||
      (e.metaKey && e.altKey && (c === 'KeyI' || c === 'KeyJ' || c === 'KeyC' || c === 'KeyU')) ||
      (ctrl && !e.altKey && !e.shiftKey && (c === 'KeyU' || k === 'u')) ||
      (ctrl && !e.altKey && !e.shiftKey && (c === 'KeyS' || k === 's'));
    if (devtools) block(e);
  }, true);
  window.addEventListener('dragstart', block, true);

  var css =
    '#nyGate{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;' +
    'background:rgba(8,8,12,.35);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-user-select:none;user-select:none}' +
    '#nyGate .ny-box{max-width:440px;width:100%;text-align:center;padding:32px 28px;border-radius:14px;color:#f2f2f5;' +
    'background:#1a1a22;border:1px solid #33333f;box-shadow:0 20px 60px rgba(0,0,0,.6)}' +
    '#nyGate h1{margin:0;font-size:20px;line-height:1.4;font-weight:600}';

  function build() {
    var root = document.documentElement;
    if (document.getElementById('nyGate')) return;
    var st = document.createElement('style'); st.id = 'nyGateStyle'; st.textContent = css;
    var box = document.createElement('div'); box.id = 'nyGate'; box.setAttribute('role', 'alertdialog'); box.setAttribute('aria-modal', 'true');
    var inner = document.createElement('div'); inner.className = 'ny-box';
    var h = document.createElement('h1'); h.textContent = MSG;
    inner.appendChild(h); box.appendChild(inner);
    root.appendChild(st); root.appendChild(box);
  }

  build();
  // put it back if anything removes it
  new MutationObserver(function () {
    if (dismissed) return;
    if (!document.getElementById('nyGate') || !document.getElementById('nyGateStyle')) {
      var o = document.getElementById('nyGate'); if (o) o.remove();
      var s = document.getElementById('nyGateStyle'); if (s) s.remove();
      build();
    }
  }).observe(document.documentElement, { childList: true });
})();
