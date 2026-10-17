// ═══════════════════════════════════════════════════════════════════
//  CAM Premium lock. Everything in Manufacture is blocked and shows
//  "These features will be coming soon for Premium users", except
//  Setup, the Tool Library and the manual 2D toolpaths (Face, Contour,
//  Pocket, Drill and Chain), which stay fully usable.
//  Loaded last so it wraps every earlier override of the CAM entry points.
//  Premium builds (and tests) set window.DATUM_PREMIUM = true before this
//  script runs, or call CAM_LOCK.set(false); dev mode reads CAM_LOCK.active
//  and CAM_LOCK.has(feature) to expect the lock instead of reporting failures.
// ═══════════════════════════════════════════════════════════════════
const CAM_LOCK = (() => {
  const MSG = 'These features will be coming soon for Premium users';
  let on = window.DATUM_PREMIUM !== true;
  // what stays usable: the views a manual 2D toolpath needs, and the 2D operations themselves
  const FREE_VIEWS = new Set(['overview', 'setup', 'tools', 'op', 'cat']);
  const FREE_OPS = new Set(['face', 'contour', 'pocket', 'drill', 'chain']);
  const FREE_ACTS = /^(setup|tools|setorigin|flow:new|mach:mill|add:(face|contour|pocket|chain|drill(:(?!tap$)[a-z]+)?))$/;
  const FREE_DO = /^(overview|addtool|pastetool|loadtools|savetools|delop)$/;
  const api = {
    MSG,
    get active() { return on; },
    set(v) { on = !!v; try { if (UIX.ws === 'cam') { const tb = document.getElementById('toolbar'); if (tb) tb._h = null; refreshUI(); } } catch (e) { /* not ready */ } },
    // is this ribbon action / operation type / view blocked?
    act: a => on && !FREE_ACTS.test(String(a)),
    op: t => on && !FREE_OPS.has(t),
    view: v => on && !FREE_VIEWS.has(v),
    has(feature) { return on && !(FREE_ACTS.test(String(feature)) || FREE_OPS.has(feature) || FREE_VIEWS.has(feature)); },
    // a New Toolpath picker entry (cam-flow.js): 3D and other chain modes, tapping and the rest of the catalog are blocked
    item: it => on && (api.op(it.type) || it.group === '3D' || it.group === 'Other' || it.kind === 'tap'),
    icon: '',
    say() { try { toast(MSG); } catch (e) { /* toast not ready */ } },
    panel() {
      return `<div class="pn-head"><h2>Premium</h2><span class="tag">coming soon</span></div><div class="pn-body"><div class="prem-note">${LOCK_SVG}<p>${MSG}</p></div>
        <p class="note">Setup, the Tool Library and manually created 2D toolpaths (Face, Contour, Pocket, Drill and Chain) stay open.</p>
        <div class="btns"><button class="btn primary" data-camdo="overview">Back to Manufacture</button></div></div>`;
    },
  };
  const LOCK_SVG = '<svg viewBox="0 0 20 20" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="9" width="11" height="8" rx="1.6"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/></svg>';
  const css = document.createElement('style');
  css.textContent = `
.rb-btn.prem-lock, .cat-btn.prem-lock { opacity: .55; cursor: not-allowed; }
.rb-btn.prem-lock:hover, .cat-btn.prem-lock:hover { opacity: .75; }
.cf-item.prem-lock { position: relative; }
.prem-lock .lk { position: absolute; top: 2px; right: 2px; width: 11px; height: 11px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; opacity: .85; pointer-events: none; }
.prem-note { display: flex; gap: 10px; align-items: flex-start; padding: 12px; border: 1px solid var(--rule); border-radius: 8px; background: var(--accent-soft); color: var(--accent); }
.prem-note p { margin: 0; font-weight: 600; color: var(--ink); line-height: 1.35; }
.prem-note svg { flex: none; margin-top: 1px; }
.tip-prem { display: block; margin-top: 6px; font-weight: 600; color: var(--accent); }`;
  document.head.appendChild(css);

  // the entry points a blocked feature can be reached through (ribbon, panels, search, shortcuts): each says whether this call is blocked
  const gates = {
    camAction: a => api.act(a[0]),
    camAddOp: a => api.op(a[0]),
    autoProgram: () => on, simStart: () => on, verifyAndFix: () => on, openSetupSheet: () => on,
    setMachine: a => on && a[0] !== 'mill',
    cmdMeasure: () => on && UIX.ws === 'cam',
  };
  for (const name of Object.keys(gates)) {
    const orig = window[name];
    if (typeof orig !== 'function') continue;
    window[name] = function () {
      if (!gates[name](arguments)) return orig.apply(this, arguments);
      api.say();
      return /^(autoProgram|verifyAndFix|openSetupSheet)$/.test(name) ? Promise.resolve() : undefined;
    };
  }

  // ribbon: dim and badge every blocked button (the hover card keeps working, with the Premium line added)
  const lockIcon = api.icon = '<svg class="lk" viewBox="0 0 20 20" aria-hidden="true"><rect x="4.5" y="9" width="11" height="8" rx="1.6"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/></svg>';
  const tb0 = camToolbar;
  camToolbar = function () {
    const h = tb0.apply(this, arguments);
    if (!on) return h;
    return h.replace(/<button class="rb-btn ([^"]*)"([^>]*?) data-cam="([^"]*)"([^>]*)>([\s\S]*?)<\/button>/g, (m, cls, a, act, b, inner) =>
      api.act(act) ? `<button class="rb-btn ${cls} prem-lock"${a} data-cam="${act}"${b} aria-disabled="true">${inner}${lockIcon}</button>` : m);
  };
  const pn0 = camPanel;
  camPanel = function () {
    if (on && camStock()) {
      if (api.view(CAMUI.view) || (CAMUI.view === 'op' && opById(CAMUI.op) && api.op(opById(CAMUI.op).type)) || (CAMUI.view === 'cat' && CAMUI.cat === 'auto')) return api.panel();
    }
    return pn0.apply(this, arguments);
  };
  const rail0 = catRailRender;
  catRailRender = function () {
    rail0.apply(this, arguments);
    const b = document.querySelector('#catrail [data-cat="auto"]');
    if (b) { b.classList.toggle('prem-lock', on); if (on && !b.querySelector('.lk')) b.insertAdjacentHTML('beforeend', lockIcon); }
  };
  const tip0 = tipInfoFor;
  tipInfoFor = function (b) {
    const r = tip0.apply(this, arguments);
    if (r && r.tx && b && b.classList && b.classList.contains('prem-lock')) r.tx = [`${r.tx[0] || ''}<span class="tip-prem">${MSG}</span>`, null];
    return r;
  };

  // clicks on blocked things are swallowed before anything else sees them
  document.addEventListener('click', e => {
    if (!on || !e.target.closest) return;
    const t = e.target.closest('[data-cam], [data-camdo], [data-camview], [data-cat], [data-automenu], [data-ws="sheet"]');
    if (!t) return;
    const d = t.dataset;
    const blocked = d.cam !== undefined ? api.act(d.cam) : d.camdo !== undefined ? !FREE_DO.test(d.camdo) : d.camview !== undefined ? api.view(d.camview)
      : d.cat !== undefined ? d.cat === 'auto' : d.automenu !== undefined ? true : d.ws === 'sheet';
    if (!blocked) return;
    e.stopImmediatePropagation(); e.preventDefault(); api.say();
  }, true);

  // anything already left on a blocked view (a saved session, the search box) falls back to the overview
  const rf0 = camRefresh;
  camRefresh = function () {
    if (on && api.view(CAMUI.view)) { if (SIM.on) simStop(); CAMUI.view = 'overview'; }
    return rf0.apply(this, arguments);
  };
  return api;
})();
window.CAM_LOCK = CAM_LOCK;
