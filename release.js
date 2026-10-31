// Applies release-config.js: hides workspace tabs and export formats, and shows the early-access notice.
// Loaded last. Nothing is deleted: dev mode (see release-config.js) gets everything back.
(function () {
  const R = window.DATUM_RELEASE;
  if (!R) return;

  // ── Early-access notice (always shown, dev mode included) ──
  if (R.earlyAccessNotice) {
    const st = document.createElement('style');
    st.textContent = '#earlyAccess{display:flex;align-items:center;gap:10px;padding:7px 14px;font-size:12.5px;line-height:1.4;color:var(--ink);' +
      'background:color-mix(in srgb,var(--warn,#d9792a) 16%,var(--panel));border-bottom:1px solid color-mix(in srgb,var(--warn,#d9792a) 45%,transparent)}' +
      '#earlyAccess .ea-tag{flex:none;font:700 10.5px/1 var(--font);letter-spacing:.08em;text-transform:uppercase;padding:4px 7px;border-radius:5px;color:#fff;background:var(--warn,#d9792a)}' +
      '#earlyAccess span{min-width:0}body.ws-2d #earlyAccess,body.ws-house #earlyAccess,body.ws-gfx #earlyAccess{display:none}';
    document.head.appendChild(st);
    const bar = document.createElement('div');
    bar.id = 'earlyAccess'; bar.setAttribute('role', 'note');
    bar.innerHTML = '<b class="ea-tag">Early access</b><span></span>';
    bar.lastChild.textContent = R.earlyAccessNotice;
    const tb = document.getElementById('toolbar');
    if (tb) tb.before(bar); else document.getElementById('topbar').appendChild(bar);
  }

  if (R.dev) return;

  // ── Workspace tabs ──
  const st2 = document.createElement('style');
  st2.textContent = '.ws button[hidden]{display:none!important}' +
    '[data-bpx]:not(' + R.drawingExports.map(k => '[data-bpx="' + k + '"]').join(',') + '):not([data-bpx="close"]){display:none!important}';
  document.head.appendChild(st2);
  document.querySelectorAll('.ws [data-ws]').forEach(b => { b.hidden = !R.tabs.includes(b.dataset.ws); });
  if (typeof setWorkspace === 'function') {
    const prev = setWorkspace;
    // 'sheet' stays reachable because Manufacture opens it for the setup sheet
    setWorkspace = function (ws) { if (!R.tabs.includes(ws) && !(ws === 'sheet' && ((!R.modelingOnly && R.tabs.includes('cam')) || camRevealed))) return; return prev.apply(this, arguments); };
  }

  // ── Hidden Manufacture tab: pressing = (not while typing in a field) brings the Manufacture tab (and the Setup Sheet it opens) back, with no reload ──
  let camRevealed = false;
  document.addEventListener('keydown', e => {
    if (e.key !== '=' || e.ctrlKey || e.metaKey || e.altKey || camRevealed) return;
    const t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    camRevealed = true; e.preventDefault();
    if (!R.tabs.includes('cam')) R.tabs.push('cam');
    const b = document.querySelector('.ws [data-ws="cam"]'); if (b) b.hidden = false;
    if (typeof toast === 'function') toast('Manufacture tab is on.');
  }, true);

  // ── Sketching and 3D modeling only: the physics, hardware, fixture and drawing extras of the Design ribbon are hidden (CSS and menu lists; nothing is removed) ──
  if (R.modelingOnly) {
    const q = v => String(v).replace(/"/g, '\\"');
    const sel = [...(R.hideGroups || []).map(g => '.rb-panel[aria-label="' + q(g) + '"]'), ...(R.hideActions || []).map(a => '[data-act="' + q(a) + '"]'), ...(R.hideButtons || []).map(id => '#' + id)];
    const st3 = document.createElement('style'); st3.id = 'modelingOnlyCss';
    st3.textContent = sel.join(',') + '{display:none!important}'; document.head.appendChild(st3);
    document.documentElement.classList.add('modeling-only');
    if (typeof TB_MENUS !== 'undefined') for (const k of Object.keys(TB_MENUS)) TB_MENUS[k] = TB_MENUS[k].filter(it => !it || !(R.hideActions || []).includes(it[0]));
  }

  // ── Export formats ──
  if (typeof EXPORT_FORMATS !== 'undefined') {
    const all = EXPORT_FORMATS.flatMap(g => g.list);
    window.DATUM_ALL_EXPORT_FORMATS = EXPORT_FORMATS.slice();
    EXPORT_FORMATS.length = 0;
    EXPORT_FORMATS.push({ g: 'Export a 3D file', list: R.exportFormats.map(k => all.find(x => x[0] === k)).filter(Boolean) });
  }
})();
