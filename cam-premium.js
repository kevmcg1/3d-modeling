// ═══════════════════════════════════════════════════════════════════
//  CAM Premium lock. Every ability in Manufacture is blocked and shows
//  "These features will be coming soon for Premium users": Setup, the Tool
//  Library, 2D and 3D toolpaths, Auto Program, Verify, Simulate, G-code
//  (post / save .nc), Measure, the Setup Sheet and the other machines.
//  (The early-access build also hides the Manufacture tab; this lock is
//  what a free user meets whenever it is shown.)
//  Loaded last so it wraps every earlier override of the CAM entry points.
//  There is one switch: isPremium below (no accounts yet, so it is false).
//  Tests set window.DATUM_PREMIUM = true before this script runs, or call
//  CAM_LOCK.set(false); dev mode reads CAM_LOCK.active and CAM_LOCK.has(feature)
//  to expect the lock instead of reporting failures.
// ═══════════════════════════════════════════════════════════════════
const CAM_LOCK = (() => {
  const isPremium = false;   // flip to true (or sign the user in, once accounts exist) to lift every Premium lock
  const MSG = 'These features will be coming soon for Premium users';
  let on = !(isPremium || window.DATUM_PREMIUM === true);
  // Auto Program and Auto Detect are locked for everyone, Premium included, while the 2D and 3D toolpaths are proven by hand.
  // Tests that need them set window.DATUM_AUTO = true before this script runs.
  const AUTO_MSG = 'Auto Program and Auto Detect are coming soon';
  let autoLocked = window.DATUM_AUTO !== true;
  const isAutoAct = a => a === 'autoprog' || a === 'auto';
  // what stays usable for a free user: nothing. (Kept as lists so a feature can be opened up again by adding it here.)
  const FREE_VIEWS = new Set();
  const FREE_OPS = new Set();
  const FREE_ACTS = /(?!)/;
  const FREE_DO = /(?!)/;
  const api = {
    MSG,
    get active() { return on; },
    set(v) { on = !!v; try { if (UIX.ws === 'cam') { const tb = document.getElementById('toolbar'); if (tb) tb._h = null; refreshUI(); } } catch (e) { /* not ready */ } },
    // is this ribbon action / operation type / view blocked?
    act: a => on && !FREE_ACTS.test(String(a)),
    op: t => on && !FREE_OPS.has(t),
    view: v => on && !FREE_VIEWS.has(v),
    has(feature) { return on && !(FREE_ACTS.test(String(feature)) || FREE_OPS.has(feature) || FREE_VIEWS.has(feature)); },
    // a New Toolpath picker entry (cam-flow.js): 3D and other chain modes and the rest of the catalog are blocked
    item: it => on && (api.op(it.type) || it.group === '3D' || it.group === 'Other'),
    icon: '',
    // unlock everything, Auto Program and Auto Detect included (bound to the ] key at the bottom of this file)
    unlockAll() { autoLocked = false; api.set(false); try { const tb = document.getElementById('toolbar'); if (tb) tb._h = null; refreshUI(); } catch (e) { /* not ready */ } },
    say() { try { toast(MSG); } catch (e) { /* toast not ready */ } },
    panel() {
      return `<div class="pn-head"><h2>Premium</h2><span class="tag">coming soon</span></div><div class="pn-body"><div class="prem-note">${LOCK_SVG}<p>${MSG}</p></div>
        <p class="note">Manufacture (setup, the tool library, 2D and 3D toolpaths, simulation and G-code) is part of Premium.</p></div>`;
    },
  };
  const LOCK_SVG = '<svg viewBox="0 0 20 20" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="9" width="11" height="8" rx="1.6"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/></svg>';
  const css = document.createElement('style');
  css.textContent = `
.rb-btn.prem-lock, .cat-btn.prem-lock, .btn.prem-lock { opacity: .55; cursor: not-allowed; }
.rb-btn.prem-lock:hover, .cat-btn.prem-lock:hover, .btn.prem-lock:hover { opacity: .75; }
.btn.prem-lock { position: relative; padding-right: 22px; }
.cf-item.prem-lock { position: relative; }
.prem-lock .lk { position: absolute; top: 2px; right: 2px; width: 11px; height: 11px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; opacity: .85; pointer-events: none; }
.prem-note { display: flex; gap: 10px; align-items: flex-start; padding: 12px; border: 1px solid var(--rule); border-radius: 8px; background: var(--accent-soft); color: var(--accent); }
.prem-note p { margin: 0; font-weight: 600; color: var(--ink); line-height: 1.35; }
.prem-note svg { flex: none; margin-top: 1px; }
.tip-prem { display: block; margin-top: 6px; font-weight: 600; color: var(--accent); }`;
  document.head.appendChild(css);

  // the entry points a blocked feature can be reached through (ribbon, panels, search, shortcuts): each says whether this call is blocked
  const gates = {
    camAction: a => api.act(a[0]) || (autoLocked && isAutoAct(a[0])),
    camAddOp: a => api.op(a[0]),
    autoProgram: () => on || autoLocked, verifyAndFix: () => on, openSetupSheet: () => on,
    setMachine: a => on && a[0] !== 'mill',
    cmdMeasure: () => on && UIX.ws === 'cam',
  };
  for (const name of Object.keys(gates)) {
    const orig = window[name];
    if (typeof orig !== 'function') continue;
    window[name] = function () {
      if (!gates[name](arguments)) return orig.apply(this, arguments);
      if (!on && autoLocked && (name === 'autoProgram' || (name === 'camAction' && isAutoAct(arguments[0])))) { try { toast(AUTO_MSG); } catch (e) { /* toast not ready */ } } else api.say();
      return /^(autoProgram|verifyAndFix|openSetupSheet)$/.test(name) ? Promise.resolve() : undefined;
    };
  }

  // ribbon: dim and badge every blocked button (the hover card keeps working, with the Premium line added)
  const lockIcon = api.icon = '<svg class="lk" viewBox="0 0 20 20" aria-hidden="true"><rect x="4.5" y="9" width="11" height="8" rx="1.6"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/></svg>';
  const tb0 = camToolbar;
  camToolbar = function () {
    const h = tb0.apply(this, arguments);
    if (!on && !autoLocked) return h;
    return h.replace(/<button class="rb-btn ([^"]*)"([^>]*?) data-cam="([^"]*)"([^>]*)>([\s\S]*?)<\/button>/g, (m, cls, a, act, b, inner) =>
      api.act(act) || (autoLocked && isAutoAct(act)) ? `<button class="rb-btn ${cls} prem-lock"${a} data-cam="${act}"${b} aria-disabled="true">${inner}${lockIcon}</button>` : m);
  };
  const autoPanel0 = () => `<div class="pn-head"><h2>Auto Detect</h2><span class="tag">coming soon</span></div><div class="pn-body"><div class="prem-note">${LOCK_SVG}<p>${AUTO_MSG}</p></div>
        <p class="note">Until then, build each toolpath by hand: press N for the New Toolpath list, or use the Chain, Contour, Pocket and Drill buttons in the toolbar.</p></div>`;
  const pn0 = camPanel;
  camPanel = function () {
    if (on) return api.panel();   // every view is Premium
    if (autoLocked && CAMUI.view === 'auto') return autoPanel0();
    let h = pn0.apply(this, arguments);
    if (autoLocked && typeof h === 'string') {                                   // the Auto buttons in the other views stay, locked
      h = h.replace(/<button class="btn primary" data-camdo="auto">Auto-detect features<\/button>/g, `<button class="btn primary prem-lock" data-camdo="auto" aria-disabled="true">Auto-detect features${lockIcon}</button>`)
        .replace(/<button class="btn" data-automenu>Options…<\/button>/g, '');
    }
    // (the simulation itself is Premium too; this keeps the Verify button honest if it is ever opened up)
    return on && typeof h === 'string' ? h.replace('<button class="btn" data-camdo="reverify">Verify now</button>', `<button class="btn prem-lock" data-camdo="reverify" aria-disabled="true">Verify now${lockIcon}</button>`) : h;
  };
  const rail0 = catRailRender;
  catRailRender = function () {
    rail0.apply(this, arguments);
    const b = document.querySelector('#catrail [data-cat="auto"]');
    if (b) { b.classList.toggle('prem-lock', on || autoLocked); if ((on || autoLocked) && !b.querySelector('.lk')) b.insertAdjacentHTML('beforeend', lockIcon); }
  };
  const tip0 = tipInfoFor;
  tipInfoFor = function (b) {
    const r = tip0.apply(this, arguments);
    if (r && r.tx && b && b.classList && b.classList.contains('prem-lock')) r.tx = [`${r.tx[0] || ''}<span class="tip-prem">${!on && b.matches && b.matches('[data-cam="auto"], [data-cam="autoprog"], [data-cat="auto"], [data-camdo="auto"]') ? AUTO_MSG : MSG}</span>`, null];
    return r;
  };

  // clicks on blocked things are swallowed before anything else sees them
  document.addEventListener('click', e => {
    if ((!on && !autoLocked) || !e.target.closest) return;
    const t = e.target.closest('[data-cam], [data-camdo], [data-camview], [data-cat], [data-automenu], [data-ws="sheet"]');
    if (!t) return;
    const d = t.dataset;
    if (!on) {                                                                     // only Auto is locked
      if (!(isAutoAct(d.cam) || d.camdo === 'auto' || d.camview === 'auto' || d.cat === 'auto' || d.automenu !== undefined)) return;
      e.stopImmediatePropagation(); e.preventDefault(); try { toast(AUTO_MSG); } catch (er) { /* toast not ready */ } return;
    }
    const blocked = d.cam !== undefined ? api.act(d.cam) : d.camdo !== undefined ? !FREE_DO.test(d.camdo) : d.camview !== undefined ? api.view(d.camview)
      : d.cat !== undefined ? true : d.automenu !== undefined ? true : d.ws === 'sheet';
    if (!blocked) return;
    e.stopImmediatePropagation(); e.preventDefault(); api.say();
  }, true);

  // anything already left on a blocked view (a saved session, the search box) falls back to the overview
  const rf0 = camRefresh;
  camRefresh = function () {
    if (on && api.view(CAMUI.view)) { if (SIM.on) simStop(); CAMUI.view = 'overview'; }
    if (autoLocked && CAMUI.view === 'auto') CAMUI.view = 'overview';
    return rf0.apply(this, arguments);
  };
  return api;
})();
window.CAM_LOCK = CAM_LOCK;

// Pressing ] (not while typing in a field) unlocks every CAM feature, Auto Program and Auto Detect included, and shows the Manufacture tab.
document.addEventListener('keydown', e => {
  if ((e.key !== ']' && e.code !== 'BracketRight') || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target, tag = t && t.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
  e.preventDefault();
  if (window.DATUM_REVEAL_CAM) window.DATUM_REVEAL_CAM();
  CAM_LOCK.unlockAll();
  try { toast('All Manufacture features are unlocked.'); } catch (err) { /* toast not ready */ }
}, true);
