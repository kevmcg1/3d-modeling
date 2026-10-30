// Dev mode: stress-tests the sketching and 3D modeling part by itself, times how smoothly each control runs, and reports what glitches.
// (Modelled on the dev mode in shop-tool-sim: same panel, same report, same seeded replays.)
//
// Press the backtick key (`) to open or close the panel; there is no button for it. For each workspace it finds every control on screen
// (buttons, checkboxes, sliders, lists, text and number fields, drags / scrolls on the canvases, and the keys) and uses them:
//
//   one by one      each control on its own, then every control a click brings into view
//   pairs           every control followed by every other control (Thorough), or a random share of them
//   combinations    every on/off combination of the checkboxes (each a single flip from the last), then a few other controls on top
//   triples         three controls in a row (a random share of every ordered triple)
//   random runs     random runs of 3 to 10 controls (the same seed gives the same runs, so a bug can be replayed)
//   endless         (a mode of its own) random runs, one after another, good or bad, until Stop is pressed
//   flows           whole journeys with checks: every sample part rebuilds, every kind of modeling feature opens and finishes,
//                   every sketch tool draws, orbit / zoom / pan are smooth, undo and redo walk the history, Auto Program + Verify,
//                   slicing for 3D printing
//
// Don't review working things: a control that worked and ran smooth in the first pass is left out of the pairs, triples, combinations and random runs after it.
// Aim more for mistakes: a control that gets a problem (an error, a stall, a jank, clipping, blur, a failed check) heats its area and the areas beside it; the
// rest of the run repeats it and spends more of its pairs, triples, combinations and random runs there, and less on areas that keep passing.
// The workspaces other than sketching and 3D modeling stay defined below but are not offered or run (SCOPE).
//
// While it runs, the console debug log is on (Trace, plus debug-trace.js): every click, key, value change (from → to, with the model size), view move and
// resize is written to the browser console, and it is switched off again when the run ends. The panel has a checkbox for it.
// The status tracker (on by default, also a checkbox) keeps every step a person or the run does, numbered; "Export status" downloads them as a file.
// The Sharpness line grades how blurry the 3D view, text, edges and labels are (blur-check.js) and goes into the export too.
//
// After every step it looks for: a script error or unhandled promise, a console error, a lost 3D context, a stalled frame, "NaN" /
// "undefined" / "Infinity" on screen. It times every frame to grade each workspace's smoothness, and notes whether each control did anything.
// It cannot test every possible order of every control (that is billions); the report says what it covered.
(function () {
  const qs = new URLSearchParams(location.search);
  window.__devToggle = () => { ensurePanel().hidden = !panel.hidden; };
  const onKey = e => {
    if (e.key !== '`' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target, typing = t && (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && /^(text|number|search|email|password|tel|url)$/.test(t.type || 'text')));
    if (typing) return;
    e.preventDefault(); window.__devToggle();
  };
  document.addEventListener('keydown', onKey, true);
  // the House, Drawing, Graphics and Setup Sheet tabs live in frames: the key must open the panel from there too
  const hookFrame = f => { try { const d = f.contentDocument; if (d && !d.__devKey) { d.__devKey = true; d.addEventListener('keydown', onKey, true); } } catch (e) { /* cross-origin frame */ } };
  document.addEventListener('load', e => { if (e.target && e.target.tagName === 'IFRAME') hookFrame(e.target); }, true);
  document.querySelectorAll('iframe').forEach(hookFrame);

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const until = async (fn, ms) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await sleep(100); return !!fn(); };
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  // workspaces: id, name, the iframe holding it (none: the page itself), its canvases
  const ALL_WS = [
    { id: 'design', name: 'Sketching & 3D modeling', canv: ['#ov'] },
    { id: 'cam', name: 'Manufacture', canv: ['#ov'] },
    { id: 'sheet', name: 'Setup Sheet', frame: 'ssgFrame', canv: [] },
    { id: 'print', name: '3D Print', canv: ['#ov'] },
    { id: 'draw', name: '2D Drawing', frame: 'd2dFrame', canv: ['#ov'] },
    { id: 'house', name: 'House Design', frame: 'houseFrame', canv: ['#pc', '#gl'] },
    { id: 'gfx', name: 'Graphics', frame: 'gfxFrame', canv: ['#cv'] },
    { id: 'page', name: 'Modeling & page flows', flowsOnly: true },
  ];
  // what the dev tool tests: sketching and 3D modeling (and the flows that go with them). Add an id here to bring a workspace back.
  const SCOPE = ['design', 'page'];
  const WS = ALL_WS.filter(w => SCOPE.includes(w.id));
  const NAME = Object.fromEntries(WS.map(w => [w.id, w.name]));
  const RATE = 12;   // steps a second
  const MODES = {
    thorough: { label: 'Thorough: every control, every pair, 3000 triples, every checkbox combination, 600 random runs, all flows', pairs: Infinity, triples: 3000, seqs: 600, combos: 256, probe: 6 },
    standard: { label: 'Standard: every control, 300 pairs, 400 triples, 64 combinations, 200 random runs, all flows', pairs: 300, triples: 400, seqs: 200, combos: 64, probe: 4 },
    quick: { label: 'Quick: every control, 40 pairs, 12 combinations, 30 random runs, all flows', pairs: 40, triples: 30, seqs: 30, combos: 12, probe: 3 },
  };
  MODES.endless = { label: 'Endless: random runs in sketching and 3D modeling, good or bad, until you press Stop', endless: true, pairs: 0, triples: 0, seqs: 0, combos: 0, probe: 3 };
  const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape', 'Enter', 'Delete', 'Backspace', 'Tab', 'e', 'k', 'l', 'r', 'f', 'c', 'p', 'o', 'm', 'g', 's', 'd', 't', 'x', '1', '2', 'ctrl+z', 'ctrl+y', 'ctrl+a'];
  const BAD_TEXT = /\b(NaN|undefined|Infinity)\b|\[object |function\s*\(/;
  const SKIP = /export|save|open|import|download|file|\bnew\b|clear|reset|delete all|erase all|sample|help|keys|settings|guided|print$/i;   // file dialogs, page-wide resets and overlays
  // frame times (ms between two painted frames): 60 fps is 16.7; past 34 is under 30 fps; past 50 the eye sees a hitch; past 100 it is a jank
  const FR = { fine: 34, slow: 50, jank: 100, stall: 1500 };
  const WARN = { jank: 1, stall: 1, 'slow control': 1, 'feature error': 1, 'locked control stayed silent': 1 };

  const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  const r1 = n => Math.round(n * 10) / 10;
  const frameStats = g => ({ n: g.length, avg: r1(avg(g)), p95: r1(pct(g, .95)), max: Math.round(g.length ? g.reduce((m, x) => Math.max(m, x), 0) : 0), over50: g.filter(x => x > FR.slow).length, over100: g.filter(x => x > FR.jank).length });
  function grade(f) {
    if (f.n < 30) return { word: 'not enough frames', cls: 'warn' };
    const bad = f.over50 / f.n, jank = f.over100 / f.n;
    if (jank < .002 && bad < .01 && f.p95 <= FR.fine) return { word: 'smooth', cls: 'ok' };
    if (jank < .01 && bad < .04 && f.p95 <= FR.slow) return { word: 'mostly smooth', cls: 'ok' };
    if (jank < .03) return { word: 'a little rough', cls: 'warn' };
    return { word: 'rough', cls: 'bad' };
  }

  /* ---------------- watching a page ---------------- */
  function instrument(w) {
    if (w.__devMon) return w.__devMon;
    const mon = w.__devMon = { errors: [], warns: [], gaps: [], last: 0, dirty: true, cache: null, muts: 0, idle: 0 };
    try { const P = w.Element.prototype; ['setPointerCapture', 'releasePointerCapture'].forEach(n => { const o = P[n]; P[n] = function (id) { try { return o.call(this, id); } catch (e) { if (e && e.name === 'NotFoundError') return; throw e; } }; }); } catch (e) { /* no capture */ }
    try { new w.MutationObserver(r => { mon.dirty = true; mon.muts += r.length; }).observe(w.document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'disabled', 'hidden', 'aria-pressed', 'style', 'open'] }); } catch (e) { /* no observer */ }
    // where it really happened: the first stack frame that is not the app's own call tracer
    const where = e => { const fr = String((e.error && e.error.stack) || '').split('\n').slice(1).map(x => x.trim()).filter(x => x && !/at w \(|Trace\./.test(x)); const m = (fr[0] || '').match(/([^\/\s]+:\d+):\d+\)?$/); return m ? m[1] : String(e.filename || '').split('/').pop() + ':' + (e.lineno || '?'); };
    w.addEventListener('error', e => mon.errors.push({ type: 'script error', msg: (e.message || 'error') + ' (' + where(e) + ')' }));
    w.addEventListener('unhandledrejection', e => mon.errors.push({ type: 'unhandled promise', msg: String((e.reason && e.reason.message) || e.reason).slice(0, 240) }));
    const ce = w.console.error.bind(w.console), cw = w.console.warn.bind(w.console);
    w.console.error = (...a) => { mon.errors.push({ type: 'console error', msg: a.map(x => (x && x.message) || String(x)).join(' ').slice(0, 260) }); ce(...a); };
    w.console.warn = (...a) => { mon.warns.push({ type: 'console warning', msg: a.map(String).join(' ').slice(0, 200) }); cw(...a); };
    w.document.addEventListener('webglcontextlost', e => mon.errors.push({ type: '3D context lost', msg: '#' + (e.target.id || e.target.className || 'canvas') }), true);
    const loop = t => { if (mon.last && !w.document.hidden) mon.gaps.push(t - mon.last); mon.last = w.document.hidden ? 0 : t; w.requestAnimationFrame(loop); };
    w.requestAnimationFrame(loop);
    return mon;
  }
  const frameOf = ws => ws.frame ? document.getElementById(ws.frame) : null;
  const winOf = ws => { const f = frameOf(ws); try { return f ? f.contentWindow : window; } catch (e) { return null; } };
  const ready = ws => { const f = frameOf(ws); if (!f) return true; try { const w = f.contentWindow; return !!(w && w.document && w.document.readyState === 'complete' && w.document.body && getComputedStyle(f).display !== 'none'); } catch (e) { return false; } };

  /* ---------------- finding the controls on screen ---------------- */
  const visible = el => { if (!el || !el.getClientRects().length) return false; const w = el.ownerDocument.defaultView, cs = w.getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.02; };
  const labelOf = el => (el.id ? '#' + el.id : '') || el.getAttribute('aria-label') || (el.dataset && (el.dataset.act ? 'act ' + el.dataset.act : el.dataset.cam ? 'cam ' + el.dataset.cam : el.dataset.menu ? 'menu ' + el.dataset.menu : el.dataset.tool ? 'tool ' + el.dataset.tool : el.dataset.vis ? 'show ' + el.dataset.vis : el.dataset.fs ? el.dataset.fs + '=' + el.dataset.v : el.dataset.fdo ? 'feature ' + el.dataset.fdo : '')) || (el.textContent || '').trim().replace(/\s+/g, ' ').replace(/\d+\s*[smhd]\s+ago\b/gi, '').trim().slice(0, 30) || el.title || el.className.toString().slice(0, 24) || el.tagName.toLowerCase();
  // the part of the page a control belongs to: a ribbon group (its menu counts as the same), the side panel, the 3D view, the keyboard…
  function areaOf(a) {
    if (a.kind === 'run' && /^menu /.test(a.label)) return a.label.slice(5).split(' › ')[0].toLowerCase();
    if (a.kind === 'view') return 'the 3D view';
    if (a.kind === 'key') return 'the keyboard';
    let el = null; try { el = a.get(); } catch (e) { /* gone */ }
    if (!el || !el.closest) return 'the page';
    const g = el.closest('.rb-panel'); if (g) return (g.getAttribute('aria-label') || 'ribbon').toLowerCase();
    if (el.closest('.ribbon, #toolbar')) return 'ribbon';
    for (const [sel, n] of [['#panel', 'the side panel'], ['#browser', 'the browser tree'], ['#timeline', 'the timeline'], ['#visGroup', 'the view toggles'], ['#modal', 'a dialog']]) if (el.closest(sel)) return n;
    return 'the page';
  }
  function discover(w, ws) {
    const d = w.document, list = [], count = {};
    const key = (base, kind) => { const k = kind + ':' + base; count[k] = (count[k] || 0) + 1; return count[k] > 1 ? k + '#' + count[k] : k; };
    const skip = el => el.closest('.dev, #modal, #ctxmenu') || (el.matches && el.matches('a[href]')) || el.disabled || !visible(el) || el.hasAttribute('data-ws') || SKIP.test((el.id || '') + ' ' + (el.textContent || '').trim().slice(0, 30) + ' ' + (el.title || ''));
    // a Premium-locked Manufacture control must say so when pressed (js/cam-premium.js), and nothing else may happen
    const lockedEl = el => { try { const L = window.CAM_LOCK, d = el.dataset || {}; return !!(L && L.active && (el.classList.contains('prem-lock') || (d.cam !== undefined && L.act(d.cam)) || (d.camview !== undefined && L.view(d.camview)) || d.cat !== undefined || d.camdo !== undefined || d.ws === 'sheet')); } catch (e) { return false; } };
    d.querySelectorAll('button, [role=tab], input[type=checkbox], input[type=radio]').forEach(el => {
      if (skip(el)) return;
      const kind = el.tagName === 'INPUT' ? 'toggle' : 'click', base = labelOf(el), locked = lockedEl(el);
      list.push({ key: key(base, kind), label: base + (locked ? ' 🔒' : ''), kind, locked, get: () => el });
    });
    // every tool in the ribbon's drop-down menus (Create, Modify, Pattern, Construct: the newer tools are added there), used directly
    if (w === window && ws.id === 'design' && typeof TB_MENUS !== 'undefined' && typeof action === 'function' && !(typeof S !== 'undefined' && S.sk)) {
      for (const [name, items] of Object.entries(TB_MENUS)) for (const it of items) if (it) list.push({ key: 'menu:' + name + ':' + it[0], label: 'menu ' + name + ' › ' + it[1], kind: 'run', run: () => action(it[0]), get: () => d.body });
    }
    d.querySelectorAll('input[type=range]').forEach(el => {
      if (skip(el)) return; const base = labelOf(el);
      [['min', 0], ['mid', .5], ['max', 1], ['quarter', .25]].forEach(([n, f]) => list.push({ key: key(base + '=' + n, 'slide'), label: base + ' ' + n, kind: 'slide', frac: f, get: () => el }));
    });
    d.querySelectorAll('select').forEach(el => {
      if (skip(el)) return; const base = labelOf(el), n = el.options.length;
      for (let i = 0; i < Math.min(n, 9); i++) { const idx = n <= 9 ? i : Math.round(i / 8 * (n - 1)); list.push({ key: key(base + '[' + idx + ']', 'pick'), label: base + ' → ' + (el.options[idx] ? el.options[idx].text.slice(0, 22) : idx), kind: 'pick', idx, get: () => el }); }
    });
    d.querySelectorAll('input[type=text], input[type=number], input[type=search], input:not([type]), textarea').forEach(el => {
      if (skip(el) || el.readOnly || el.id === 'gsIn' || el.id === 'cmdIn') return;
      const base = labelOf(el), num = el.type === 'number', lo = el.min === '' ? 0 : +el.min, hi = el.max === '' ? 100 : +el.max;
      const vals = num ? [['mid', String((lo + hi) / 2)], ['min', String(lo)], ['max', String(hi)], ['empty', ''], ['too low', String(lo - 1)], ['too high', String(hi + 1)]]
        : [['number', '0.5'], ['negative', '-3'], ['empty', ''], ['letters', 'abc'], ['huge', '99999'], ['tiny', '0.0000001']];
      vals.forEach(([n, v]) => list.push({ key: key(base + '=' + n, 'type'), label: base + ' ← ' + n, kind: 'type', v, get: () => el }));
    });
    d.querySelectorAll('input[type=color]').forEach(el => {
      if (skip(el)) return; const base = labelOf(el);
      [['white', '#ffffff'], ['black', '#000000'], ['blue', '#5b93ea']].forEach(([n, v]) => list.push({ key: key(base + '=' + n, 'type'), label: base + ' ← ' + n, kind: 'type', v, get: () => el }));
    });
    d.querySelectorAll('[data-tool], [role=button]:not(button), [role=menuitem], [role=switch], summary').forEach(el => {
      if (skip(el)) return; const base = labelOf(el);
      list.push({ key: key(base, 'click'), label: base, kind: 'click', get: () => el });
    });
    // the canvases: drags, scroll and clicks, like a hand would
    (ws.canv || []).forEach(sel => {
      const cv = d.querySelector(sel);
      if (cv && visible(cv)) ['orbit drag', 'pan drag', 'zoom in', 'zoom out', 'click middle', 'small drag', 'right click'].forEach(n => list.push({ key: 'view' + sel + ':' + n, label: sel + ' ' + n, kind: 'view', how: n, get: () => cv }));
    });
    KEYS.forEach(k => list.push({ key: 'key:' + k, label: 'key ' + k, kind: 'key', k, get: () => d.body }));
    list.forEach(a => { a.area = areaOf(a); });
    return list;
  }
  const actionsOf = (w, ws) => { const m = w.__devMon; if (!m) return discover(w, ws); if (m.dirty || !m.cache) { m.cache = discover(w, ws); m.dirty = false; } return m.cache; };
  function perform(w, a) {
    const el = a.get(); if (!el || (el.isConnected === false)) return;   // a control the page has since replaced is gone, as it is for a hand
    if (a.kind === 'run') a.run();
    else if (a.kind === 'click' || a.kind === 'toggle') el.click();
    else if (a.kind === 'slide') {
      const lo = +el.min || 0, hi = el.max === '' ? 100 : +el.max, st = +el.step || 1; let v = lo + (hi - lo) * a.frac; v = Math.round(v / st) * st; el.value = v;
      el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true }));
    } else if (a.kind === 'pick') { el.selectedIndex = a.idx; el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); }
    else if (a.kind === 'type') {
      el.focus(); el.value = a.v; el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true }));
      const o = { key: 'Enter', bubbles: true, cancelable: true }; el.dispatchEvent(new w.KeyboardEvent('keydown', o)); el.dispatchEvent(new w.KeyboardEvent('keyup', o)); el.blur();
    } else if (a.kind === 'key') {
      const ctrl = a.k.startsWith('ctrl+'), k = ctrl ? a.k.slice(5) : a.k, o = { key: k, ctrlKey: ctrl, bubbles: true, cancelable: true };
      (w.document.activeElement && w.document.activeElement !== w.document.body ? w.document.activeElement : w.document.body).dispatchEvent(new w.KeyboardEvent('keydown', o)); w.document.dispatchEvent(new w.KeyboardEvent('keyup', o));
    } else if (a.kind === 'view') {
      const r = el.getBoundingClientRect(), cx = r.left + r.width * .5, cy = r.top + r.height * .5;
      const P = (t, x, y, b, bs) => el.dispatchEvent(new w.PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y, button: b, buttons: bs }));
      const drag = (dx, dy, b) => { P('pointerdown', cx, cy, b, 1 << b); for (let i = 1; i <= 6; i++) P('pointermove', cx + dx * i / 6, cy + dy * i / 6, b, 1 << b); P('pointerup', cx + dx, cy + dy, b, 0); };
      if (a.how === 'orbit drag') drag(80, -40, 0); else if (a.how === 'pan drag') drag(-60, 30, a.how === 'pan drag' ? 1 : 2); else if (a.how === 'small drag') drag(8, 6, 0);
      else if (a.how === 'click middle') { P('pointerdown', cx, cy, 0, 1); P('pointerup', cx, cy, 0, 0); }
      else if (a.how === 'right click') { P('pointerdown', cx, cy, 2, 2); P('pointerup', cx, cy, 2, 0); el.dispatchEvent(new w.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: cx, clientY: cy })); }
      else el.dispatchEvent(new w.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: a.how === 'zoom in' ? -240 : 240, clientX: cx, clientY: cy }));
    }
  }
  // did a control change anything you could see? Its own value, or the page (more than the page changes by itself)
  const valueSig = a => { try { const el = a.get(); return a.kind === 'toggle' ? String(el.checked) : (a.kind === 'slide' || a.kind === 'pick' || a.kind === 'type') ? String(el.value) : el.getAttribute && el.getAttribute('aria-pressed') + '|' + (el.className && el.className.toString()); } catch (e) { return ''; } };
  const viewSig = w => { try { if (w === window && typeof view !== 'undefined') return view.quat.toArray().concat(view.viewH, view.target.toArray()).map(v => v.toFixed(3)).join(); } catch (e) { /* none */ } return ''; };

  // The ribbon after a step: a button cut by the ribbon's edge or covered by a scroll arrow, an icon that leaves its button or sits off-center, a label that does not fit.
  // (A group the ribbon has hidden because an edge would cut it is not a problem: it is paged in whole with the arrows.)
  function ribbonProblems() {
    const nav = document.getElementById('toolbar'); if (!nav || !nav.offsetWidth || nav.dataset.moving) return [];   // (paging is animating: the groups are on their way in, checked again at the next step)
    // the page fits the ribbon in the frame callback before it paints; a step measured between a rebuild and that callback would see a state nobody ever sees
    try { if (window.ribFit) window.ribFit(); } catch (e) { /* no ribbon fit */ }
    const nr = nav.getBoundingClientRect(), out = [], arrows = [...document.querySelectorAll('.ribbon-wrap > .rb-arrow')].map(a => a.getBoundingClientRect()).filter(r => r.width > 0);
    for (const b of nav.querySelectorAll('.rb-btn')) {
      const r = b.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const pn = b.closest('.rb-panel'); if (pn && pn.classList.contains('edge')) continue;
      if (!(r.right > nr.left + 0.5 && r.left < nr.right - 0.5)) continue;   // paged out of view
      const name = (b.dataset.act || b.dataset.cam || b.title || b.textContent.trim() || '?').slice(0, 28);
      if (r.left < nr.left - 0.5 || r.right > nr.right + 0.5) { out.push(name + ' is cut off by the edge of the ribbon'); continue; }
      if (arrows.some(a => Math.min(r.right, a.right) - Math.max(r.left, a.left) > 0.5)) { out.push(name + ' is covered by a scroll arrow'); continue; }
      const sv = b.querySelector('svg:not(.lk)'), sp = b.querySelector(':scope > span:not(.rip-wrap)'), shown = sp && sp.getBoundingClientRect().width > 0 && getComputedStyle(sp).display !== 'none';
      if (sv) {
        const q = sv.getBoundingClientRect(), dx = q.left + q.width / 2 - (r.left + r.width / 2), dy = q.top + q.height / 2 - (r.top + r.height / 2);
        if (q.left < r.left - 0.5 || q.right > r.right + 0.5 || q.top < r.top - 0.5 || q.bottom > r.bottom + 0.5) out.push(name + ': icon sticks out of its button');
        else if ((b.classList.contains('rb-big') || !shown) && Math.abs(dx) > 1.5) out.push(name + ': icon is ' + Math.abs(dx).toFixed(1) + ' px off center');
        else if (!shown && Math.abs(dy) > 1.5) out.push(name + ': icon is off the middle');
      }
      if (shown && (sp.scrollWidth > sp.clientWidth + 1 || sp.scrollHeight > sp.clientHeight + 1)) out.push(name + ': label is clipped');
    }
    return out;
  }

  /* ---------------- looking for glitches after a step ---------------- */
  function inspect(w, mon, mark, ws) {
    const found = [];
    mon.errors.slice(mark.e).forEach(e => found.push({ type: e.type, detail: e.msg }));
    const gaps = mon.gaps.slice(mark.g), worst = gaps.length ? gaps.reduce((m, x) => Math.max(m, x), 0) : 0;
    if (worst > FR.stall && !w.document.hidden) found.push({ type: 'stall', detail: 'a frame took ' + Math.round(worst) + ' ms' });
    else if (worst > FR.jank && !w.document.hidden) found.push({ type: 'jank', detail: 'a frame took ' + Math.round(worst) + ' ms' });
    try {
      const t = w === window ? [...w.document.body.children].filter(e => e !== panel && !/^(SCRIPT|STYLE)$/.test(e.tagName)).map(e => e.innerText || '').join(' ') : (w.document.body.innerText || ''), m = BAD_TEXT.exec(t);
      if (m) { const i = m.index; found.push({ type: 'bad text on screen', detail: '“' + t.slice(Math.max(0, i - 24), i + 24).replace(/\s+/g, ' ') + '”' }); }
    } catch (e) { /* unreadable */ }
    try { if (w === window) ribbonProblems().slice(0, 4).forEach(d => found.push({ type: 'ribbon clipped', detail: d })); } catch (e) { /* no ribbon */ }
    try {   // a feature that fails to build is worth a note, not a failure: random controls build impossible things on purpose
      if (w === window && typeof MODEL !== 'undefined') for (const id in MODEL.errors) { const k = id + ':' + MODEL.errors[id]; if (!seenErr.has(k)) { seenErr.add(k); found.push({ type: 'feature error', detail: String(MODEL.errors[id]).slice(0, 120) }); } }
      if (w === window && typeof view !== 'undefined' && !view.quat.toArray().concat(view.viewH, view.target.toArray()).every(Number.isFinite)) found.push({ type: 'number gone bad', detail: 'the camera has a non-number' });
    } catch (e) { /* no model */ }
    return { found, worst, gaps };
  }
  const seenErr = new Set();

  /* ---------------- the panel ---------------- */
  const DEV_CSS = `
.dev{position:fixed;left:14px;bottom:14px;width:min(540px,calc(100vw - 28px));max-height:calc(100vh - 120px);z-index:99000;display:flex;flex-direction:column;background:#131416;color:#ececee;border:1px solid #3d4147;border-radius:12px;font:13px/1.45 "Inter",system-ui,sans-serif;box-shadow:0 18px 44px rgba(0,0,0,.55);transition:opacity .25s ease,transform .3s cubic-bezier(.22,.8,.25,1),visibility 0s}
.dev[hidden]{display:flex;opacity:0;visibility:hidden;transform:translateY(14px);pointer-events:none;transition:opacity .2s ease,transform .25s ease,visibility 0s linear .25s}
.dev h3{margin:0;font-size:14px;font-weight:600;padding:12px 14px 4px;display:flex;justify-content:space-between;align-items:center}
.dev h3 small{font-weight:400;color:#8a8f97;font-size:11.5px}
.dev .body{padding:6px 14px 12px;overflow-y:auto}
.dev label{display:flex;gap:6px;align-items:center;margin:3px 0;font-size:12.5px;cursor:pointer}
.dev .grid{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}
.dev select,.dev input[type=number]{background:#1b1d20;color:#ececee;border:1px solid #3d4147;border-radius:6px;padding:5px 7px;font:inherit;width:100%}
.dev button{font:600 12.5px "Inter",system-ui,sans-serif;color:#ececee;background:transparent;border:1px solid #3d4147;border-radius:7px;padding:6px 11px;cursor:pointer}
.dev button:hover{border-color:#8a8f97;background:rgba(255,255,255,.06)}
.dev button:disabled{opacity:.4;cursor:default}
.dev button.go{border-color:#5b93ea;color:#5b93ea}
.dev .row{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
.dev .bar{display:block;height:6px;background:#24272b;border-radius:99px;overflow:hidden;margin:10px 0 4px}
.dev .bar i{display:block;height:100%;width:0;background:#5b93ea;transition:width .3s ease}
.dev .now{color:#8a8f97;font-size:12px;min-height:18px}
.dev .sum{margin:8px 0;font-size:12px;border-collapse:collapse;width:100%}
.dev .sum td,.dev .sum th{padding:3px 6px;border-bottom:1px solid #222428;text-align:left;font-weight:500}
.dev .sum th{color:#8a8f97;font-weight:600}
.dev .ok{color:#5fcf8a}.dev .bad{color:#ff7a6e}.dev .warn{color:#e8c547}
.dev .find{border:1px solid #3d4147;border-radius:8px;padding:7px 9px;margin:6px 0;font-size:12px}
.dev .find b{display:block;font-size:12.5px}.dev .find code{display:block;color:#8a8f97;font:11px/1.45 ui-monospace,Consolas,monospace;margin-top:3px;white-space:pre-wrap;word-break:break-word}
.dev .find.bad{border-color:#ff7a6e}.dev .find.warn{border-color:#e8c547}
.dev details{border:1px solid #2a2d31;border-radius:8px;margin:6px 0;padding:0 9px}
.dev details[open]{padding-bottom:8px}
.dev summary{cursor:pointer;padding:6px 0;font-weight:600;font-size:12.5px;list-style:none;display:flex;justify-content:space-between;gap:8px}
.dev summary::-webkit-details-marker{display:none}
.dev summary small{font-weight:400;color:#8a8f97;font-size:11.5px}
.dev .fb{font-size:12px;margin:3px 0;color:#c9ccd1}.dev .fb b{color:#ececee}
.dev .sc{margin:4px 0;font-size:12px}.dev .sc b{display:flex;gap:6px}.dev .sc ul{margin:2px 0 0;padding-left:16px;color:#aeb2b9;font-size:11.5px}
.dev .ctl{width:100%;border-collapse:collapse;font-size:11px}.dev .ctl td,.dev .ctl th{padding:2px 5px;border-bottom:1px solid #1f2125;text-align:left;font-weight:400}.dev .ctl th{color:#8a8f97}
.dev .ctl td:nth-child(n+3){text-align:right;font-variant-numeric:tabular-nums}
.dev .chk{display:inline-flex;gap:5px;align-items:center;margin-right:10px}
@media (prefers-reduced-motion: reduce){.dev,.dev[hidden],.dev .bar i{transition:none}}`;

  // Nothing of the dev tool exists in the page (no style, no element) until the backtick key is pressed the first time.
  let panel = null;
  const $d = id => panel.querySelector('#' + id);
  function ensurePanel() {
    if (panel) return panel;
    const css = document.createElement('style'); css.textContent = DEV_CSS; document.head.appendChild(css);
    panel = document.createElement('div');
    panel.className = 'dev'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Dev mode');
    panel.innerHTML = '<h3>Dev mode · auto test <small id="devSub">idle</small></h3><div class="body">' +
    '<div class="grid">' + WS.map(t => '<label><input type="checkbox" data-t="' + t.id + '" checked> ' + t.name + '</label>').join('') + '</div>' +
    '<div class="row" style="margin-top:4px"><label class="chk"><input type="checkbox" id="devCtl" checked> Controls</label><label class="chk"><input type="checkbox" id="devCombo" checked> Combinations</label><label class="chk"><input type="checkbox" id="devFlow" checked> Flows</label><label class="chk"><input type="checkbox" id="devPrem"> Lift the Premium lock</label><label class="chk"><input type="checkbox" id="devLog" checked> Debug log in the console</label><label class="chk"><input type="checkbox" id="devTrack" checked> Status tracker</label></div>' +
    '<div class="row"><label class="chk" title="A control that worked and ran smooth the first time it was tried is left out of the pairs, triples, combinations and random runs after it (Endless ignores this)"><input type="checkbox" id="devSkip" checked> Don\'t review working things</label><label class="chk" title="When something goes wrong, the run repeats it and spends more of the rest on that area and the ones beside it, and less on areas that keep passing"><input type="checkbox" id="devAim"> Aim more for mistakes</label></div>' +
    '<div class="row"><button id="devExport" title="Downloads every step recorded since the page loaded, numbered: clicks, keys, typed values, changes (from → to), view moves, resizes, panels">Export status</button><button id="devExportJson" title="The same steps as JSON">JSON</button><small id="devSteps"></small></div>' +
    '<div class="row"><b style="font-size:12.5px">Sharpness</b><span id="devBlurGrade" style="font:600 11.5px Inter,system-ui,sans-serif;padding:2px 8px;border-radius:9px;background:#2a2d31;color:#8a8f97">not checked</span><button id="devBlurNow" title="Draws one frame and reads it back: how many screen pixels each edge is spread over, how big the text really is, whether any canvas is stretched">Check now</button><label class="chk"><input type="checkbox" id="devBlurLive" checked> Live</label></div>' +
    '<pre id="devBlurText" style="margin:2px 0 6px;white-space:pre-wrap;word-break:break-word;max-height:150px;overflow:auto;font:11px/1.4 ui-monospace,Menlo,monospace;color:#b8bcc2"></pre>' +
    '<div class="row"><select id="devMode">' + Object.keys(MODES).map(k => '<option value="' + k + '"' + (k === 'standard' ? ' selected' : '') + '>' + MODES[k].label + '</option>').join('') + '</select><input type="number" id="devSeed" value="20261016" style="max-width:110px" aria-label="Seed"></div>' +
    '<div class="row"><button class="go" id="devGo">Start</button><button id="devStop" disabled>Stop</button><button id="devSummary">Copy summary</button><button id="devCopy">Copy report</button><button id="devSave">Download</button></div>' +
    '<div class="now" id="devEst"></div><div class="bar"><i id="devBar"></i></div><div class="now" id="devNow"></div><table class="sum" id="devSum"></table><div id="devFeed"></div><div id="devFinds"></div></div>';
    document.body.appendChild(panel);
    bindPanel(); return panel;
  }

  /* ---------------- the run ---------------- */
  const run = { on: false, stop: false, report: null, steps: 0, active: 0, at: 0, base: 0, span: 100 };
  const fmtMs = ms => ms < 90000 ? Math.round(ms / 1000) + ' s' : Math.round(ms / 60000) + ' min';
  const newTool = id => ({ id, name: NAME[id] || id, controls: 0, singles: { run: 0, withFindings: 0 }, pairs: { run: 0, possible: 0 }, triples: { run: 0 }, locked: { n: 0, said: 0 }, combos: { run: 0, possible: 0, toggles: 0 }, sequences: { run: 0 }, findings: [], ms: 0, ctl: {}, fr: { n: 0, over34: 0, over50: 0, over100: 0, max: 0, sample: [] }, scenarios: [], aim: { hot: {}, why: {}, passes: {}, steered: {}, repeats: 0, order: [] }, skip: { cleared: 0, left: 0 } });
  function addFinding(T, f, seq) {
    const k = f.type + '|' + f.detail.replace(/\d+/g, '#');
    let x = T.findings.find(y => y.k === k);
    if (!x) { x = { k, type: f.type, detail: f.detail, count: 0, example: seq.slice(-8), by: {} }; T.findings.push(x); }
    x.count++; const last = seq[seq.length - 1] || '?'; x.by[last] = (x.by[last] || 0) + 1;
  }
  function addFrames(T, gaps) {
    const f = T.fr;
    gaps.forEach(g => { f.n++; if (g > FR.fine) f.over34++; if (g > FR.slow) f.over50++; if (g > FR.jank) f.over100++; if (g > f.max) f.max = g; if (f.sample.length < 4000) f.sample.push(g); else f.sample[Math.floor(Math.random() * 4000)] = g; });
  }
  const ctlOf = (T, a) => T.ctl[a.key] || (T.ctl[a.key] = { label: a.label, kind: a.kind, runs: 0, effects: 0, gaps: [], worst: 0, jank: 0, issues: 0 });

  // put the modeler back in a known state: no sketch, no command, no simulation, a sample part on screen
  const SAMPLE = () => (typeof SAMPLES !== 'undefined' && (SAMPLES.find(s => s.name === 'Pocketed plate') || SAMPLES[0]));
  async function resetMain(withOps) {
    try { if (typeof S !== 'undefined' && S.sk) exitSketchMode(false); } catch (e) { /* none */ }
    try { if (typeof CMD !== 'undefined' && CMD) cancelCmd(); } catch (e) { /* none */ }
    try { if (typeof SIM !== 'undefined' && SIM.on) simStop(); } catch (e) { /* none */ }
    try { if (typeof ctxmenu !== 'undefined') ctxmenu.hidden = true; } catch (e) { /* none */ }
    try { loadDoc(SAMPLE().make(), 'dev'); } catch (e) { /* none */ }
    await sleep(700);
    try { if (UIX.ws === 'cam' && withOps) { if (window.CAM_LOCK && CAM_LOCK.active) { } else { camAction('autoprog'); await sleep(2500); } CAMUI.view = 'overview'; camRefresh(); await sleep(300); } } catch (e) { /* none */ }
  }
  async function openWs(ws) {
    if (ws.flowsOnly) { setWorkspace('design'); await sleep(800); return window; }
    try { setWorkspace(ws.id); } catch (e) { /* reported by the page */ }
    await until(() => ready(ws), 60000); await sleep(ws.frame ? 2500 : 1200);
    if (!ws.frame) await resetMain(true);
    return winOf(ws);
  }
  // anything a step left open (a menu, a dialog, a half-made feature) is closed so the next step starts clean
  function tidy(w) {
    try {
      w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      if (w === window && typeof refreshUI === 'function') refreshUI();   // the panel must follow what Escape just canceled, as it does for a hand
      if (w === window) { const m = document.getElementById('modal'); if (m && !m.hidden && m.offsetParent) { const c = m.querySelector('[data-do=cancel], [data-mx], .close, button'); if (c) c.click(); } }
    } catch (e) { /* nothing to close */ }
  }

  // Aim more for mistakes: how much a control's area is worth another try. A problem heats the area (a script error counts 3, a stall or jank 1) and half of that
  // spills onto the areas beside it; every pass in an area cools it a little. Without a problem anywhere every control weighs the same.
  const heatOf = (T, area) => { const A = T.aim, i = A.order.indexOf(area); let h = A.hot[area] || 0; if (i >= 0) for (const j of [i - 1, i + 1]) if (A.order[j]) h += .5 * (A.hot[A.order[j]] || 0); return h; };
  const weightOf = (T, a) => Math.max(.12, (1 + 4 * Math.min(6, heatOf(T, a.area))) / (1 + (T.aim.passes[a.area] || 0) / 60));
  // a control that worked (no problem found) and ran smooth (no frame past a hitch) the first time it was used
  const clearedCtl = (T, a) => { const c = T.ctl[a.key]; return !!c && c.runs > 0 && c.issues === 0 && c.worst <= FR.slow; };
  const pickFrom = (rand, items, wf) => { if (!wf) return items[Math.floor(rand() * items.length)]; let tot = 0; const ws = items.map(x => { const v = wf(x); tot += v; return v; }); let r = rand() * tot; for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r <= 0) return items[i]; } return items[items.length - 1]; };

  async function testWs(ws, mode, seed, T, opt) {
    const t0 = Date.now(), rand = rng(seed + ws.id.length * 131), aimOn = !!opt.aim, skipOn = !!opt.skip && !mode.endless;
    T.aim.on = aimOn; T.skip.on = skipOn;
    let w = await openWs(ws), mon = instrument(w);
    { const m0 = mon.muts; await sleep(600); mon.idle = (mon.muts - m0) / 600; }
    let lastFound = 0;
    const step = async (a, seq) => {
      const mark = { e: mon.errors.length, g: mon.gaps.length, m: mon.muts }, v0 = valueSig(a), c0 = viewSig(w);
      const now0 = performance.now(); if (!run.at || now0 - run.at > 250) run.at = now0;
      const slot = run.at; run.at = slot + 1000 / RATE;
      let thrown = null; try { perform(w, a); } catch (e) { thrown = e; }
      await sleep(Math.max(4, run.at - performance.now() - 6));
      run.steps++; run.active += Math.min(400, performance.now() - now0);
      const r = inspect(w, mon, mark, ws);
      if (a.locked) { T.locked.n++; if (/coming soon for Premium/i.test(w.document.body.innerText || '')) T.locked.said++; else r.found.push({ type: 'locked control stayed silent', detail: a.label + ' did not show the Premium message' }); }
      if (thrown) r.found.push({ type: 'control threw', detail: String(thrown.message || thrown).slice(0, 200) });
      addFrames(T, r.gaps);
      const c = ctlOf(T, a); c.runs++;
      if (valueSig(a) !== v0 || viewSig(w) !== c0 || (mon.muts - mark.m) > mon.idle * (performance.now() - now0) * 1.5 + 3) c.effects++;
      r.gaps.forEach(g => { if (c.gaps.length < 120) c.gaps.push(g); if (g > c.worst) c.worst = g; if (g > FR.jank) c.jank++; });
      if (r.found.length) c.issues++;
      r.found.forEach(x => addFinding(T, x, seq));
      { const A = T.aim, area = a.area || 'the page'; if (!A.order.includes(area)) A.order.push(area);
        if (r.found.length) { A.hot[area] = (A.hot[area] || 0) + r.found.reduce((n, x) => n + (WARN[x.type] ? 1 : 3), 0); const why = A.why[area] = A.why[area] || {}; r.found.forEach(x => { why[x.type] = (why[x.type] || 0) + 1; }); }
        else A.passes[area] = (A.passes[area] || 0) + 1; }
      lastFound = r.found.length;
      if (a.kind !== 'key' && a.kind !== 'view') tidy(w);
      return r.found.filter(x => !WARN[x.type]).length;
    };
    // a step that goes wrong is tried again (twice) and followed by a control from the same area or its neighbors: the run reaches further around a mistake
    const stepR = async (a, seq) => {
      let n = await step(a, seq);
      if (aimOn && lastFound && !run.stop) {
        const A = T.aim, area = a.area || 'the page';
        for (let k = 0; k < 2 && !run.stop; k++) { const again = actionsOf(w, ws).find(x => x.key === a.key); if (!again) break; A.repeats++; A.steered[area] = (A.steered[area] || 0) + 1; n += await step(again, seq.concat('again')); }
        const near = actionsOf(w, ws).filter(x => x.key !== a.key && heatOf(T, x.area) > 0 && !(skipOn && clearedCtl(T, x)));
        if (near.length && !run.stop) { const b = pickFrom(rand, near, x => weightOf(T, x)); A.steered[b.area] = (A.steered[b.area] || 0) + 1; n += await step(b, seq.concat(b.label)); }
      }
      return n;
    };
    // the controls a later phase may use: with "Don't review working things" the ones that already worked and ran smooth are left out
    const usable = list => skipOn ? list.filter(a => !clearedCtl(T, a)) : list;
    const pickA = list => { const a = pickFrom(rand, list, aimOn ? x => weightOf(T, x) : null); if (aimOn && heatOf(T, a.area) > 0) T.aim.steered[a.area] = (T.aim.steered[a.area] || 0) + 1; return a; };
    const refresh = async () => { await resetMain0(); mon = instrument(w); };
    const resetMain0 = async () => { if (!ws.frame) await resetMain(true); else { const f = frameOf(ws); f.contentWindow.location.reload(); await sleep(500); await until(() => ready(ws), 60000); await sleep(2000); w = winOf(ws); } };
    let actions = actionsOf(w, ws);
    T.controls = actions.length; actions.forEach(a => { if (!T.aim.order.includes(a.area)) T.aim.order.push(a.area); });
    // Endless: random runs one after another, good or bad, until Stop. Every so often a different sample part is loaded so the runs meet different models.
    if (mode.endless) {
      const parts = sampleParts(); let n = 0;
      while (!run.stop) {
        progress(T, 'endless: run ' + (n + 1) + (aimOn ? ' · aiming at ' + (Object.entries(T.aim.hot).sort((p, q) => q[1] - p[1]).slice(0, 2).map(e => e[0]).join(', ') || 'nothing yet') : ''), (n % 50) / 50);
        const len = 1 + Math.floor(rand() * 10), seq = [];
        for (let k = 0; k < len && !run.stop; k++) { const cur = actionsOf(w, ws); if (!cur.length) break; const a = pickA(cur); seq.push(a.label); await stepR(a, seq); }
        T.sequences.run++; n++;
        if (n % 12 === 0) await refresh();
        if (n % 40 === 0 && parts.length) { try { await resetMainTo(parts[Math.floor(rand() * parts.length)]); mon = instrument(w); } catch (e) { /* the next run starts from what is there */ } }
      }
      T.ms = Date.now() - t0; return;
    }
    if (opt.controls) {
      const seen = new Set(actions.map(a => a.key)); T.revealed = 0;
      // 1. every control on its own, then every control a click brings into view (panels, option rows, dialogs), each used once as well
      const reveal = async (from, depth) => {
        const fresh = actionsOf(w, ws).filter(a => !seen.has(a.key));
        if (!fresh.length || depth > 1) return;
        for (const a of fresh) {
          if (run.stop || T.revealed >= 250) break;
          seen.add(a.key); T.revealed++;
          progress(T, 'revealed: ' + a.label, .2);
          const n = await stepR(a, [from.label, 'then ' + a.label]); T.singles.run++; if (n) T.singles.withFindings++;
          if (depth < 1) await reveal(a, depth + 1);
        }
      };
      for (let i = 0; i < actions.length && !run.stop; i++) {
        progress(T, 'one by one: ' + actions[i].label, i / actions.length * .2);
        const live = actionsOf(w, ws).find(x => x.key === actions[i].key); if (!live) continue;
        const n = await stepR(live, [live.label]); T.singles.run++; if (n) T.singles.withFindings++;
        await reveal(live, 0);
        if (i % 20 === 19) await refresh();
      }
      T.controls = seen.size;
      // 2. pairs
      await refresh(); actions = actionsOf(w, ws);
      T.skip.cleared = actions.filter(a => clearedCtl(T, a)).length; T.skip.left = actions.length - T.skip.cleared;
      const keys = usable(actions).map(a => a.key), pairs = [];
      for (let i = 0; i < keys.length; i++) for (let j = 0; j < keys.length; j++) if (i !== j) pairs.push([keys[i], keys[j]]);
      T.pairs.possible = pairs.length;
      const want = mode.pairs === Infinity ? pairs.length : Math.min(mode.pairs, pairs.length);
      for (let i = pairs.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pairs[i], pairs[j]] = [pairs[j], pairs[i]]; }
      for (let p = 0; p < want && !run.stop; p++) {
        progress(T, 'pairs ' + (p + 1) + ' / ' + want, .2 + p / want * .3);
        const seq = [];
        if (aimOn) {   // of a few random pairs left, the one whose controls sit in the hottest areas goes next
          const now = actionsOf(w, ws), by = k => now.find(x => x.key === k); let best = p, bw = -1;
          for (let t = 0; t < 16 && p < pairs.length; t++) { const i = p + Math.floor(rand() * (pairs.length - p)), x = by(pairs[i][0]), y = by(pairs[i][1]), v = (x ? weightOf(T, x) : 0) + (y ? weightOf(T, y) : 0); if (v > bw) { bw = v; best = i; } }
          [pairs[p], pairs[best]] = [pairs[best], pairs[p]];
          pairs[p].forEach(k => { const x = by(k); if (x && heatOf(T, x.area) > 0) T.aim.steered[x.area] = (T.aim.steered[x.area] || 0) + 1; });
        }
        for (const k of pairs[p]) { const a = actionsOf(w, ws).find(x => x.key === k); if (!a) continue; if (skipOn && clearedCtl(T, a)) continue; seq.push(a.label); await stepR(a, seq); }
        T.pairs.run++;
        if (p % 30 === 29) await refresh();
      }
      // 2b. triples: three controls in a row (a random share of every ordered triple; Thorough takes the most)
      for (let q = 0; q < mode.triples && !run.stop; q++) {
        progress(T, 'triples ' + (q + 1) + ' / ' + mode.triples, .5);
        const seq = [];
        for (let k = 0; k < 3; k++) { const cur = usable(actionsOf(w, ws)); if (!cur.length) break; const a = pickA(cur); seq.push(a.label); await stepR(a, seq); }
        T.triples.run++;
        if (q % 25 === 24) await refresh();
      }
    }
    // 3. every on/off combination of the checkboxes (each one a single flip from the last), and some other controls on top of each
    if (opt.combos && !run.stop) {
      await refresh();
      const togs = usable(actionsOf(w, ws).filter(a => a.kind === 'toggle')).map(a => a.key), k = Math.min(togs.length, 10);
      T.combos.toggles = togs.length;
      if (k) {
        const total = 1 << k, n = Math.min(total, mode.combos); T.combos.possible = total;
        let idx = [...Array(total).keys()];
        if (n < total) { for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; } idx = idx.slice(0, n).sort((a, b) => a - b); }
        for (let c = 0; c < idx.length && !run.stop; c++) {
          progress(T, 'checkbox combinations ' + (c + 1) + ' / ' + idx.length, .5 + c / idx.length * .2);
          const gray = idx[c] ^ (idx[c] >> 1), seq = ['combination ' + gray.toString(2).padStart(k, '0')];
          for (let b = 0; b < k; b++) {
            const a = actionsOf(w, ws).find(x => x.key === togs[b]); if (!a) continue;
            if (!!a.get().checked !== !!((gray >> b) & 1)) { seq.push(a.label); await stepR(a, seq); }
          }
          for (let q = 0; q < mode.probe && !run.stop; q++) {
            const cur = usable(actionsOf(w, ws).filter(a => a.kind !== 'toggle')); if (!cur.length) break;
            const a = pickA(cur); seq.push(a.label); await stepR(a, seq);
          }
          T.combos.run++;
          if (c % 25 === 24) await refresh();
        }
      }
    }
    // 4. random runs of 3 to 10
    if (opt.controls) {
      for (let s = 0; s < mode.seqs && !run.stop; s++) {
        progress(T, 'random runs ' + (s + 1) + ' / ' + mode.seqs, .7 + s / mode.seqs * .25);
        const len = 3 + Math.floor(rand() * 8), seq = [];
        for (let k = 0; k < len && !run.stop; k++) {
          const cur = usable(actionsOf(w, ws)); if (!cur.length) break;
          const a = pickA(cur); seq.push(a.label); await stepR(a, seq);
        }
        T.sequences.run++;
        if (s % 15 === 14) await refresh();
      }
    }
    // 5. whole journeys, with checks along the way
    if (opt.flows && FLOWS[ws.id] && !run.stop) { await refresh(); w = winOf(ws) || w; mon = instrument(w); await runFlows(ws, T, mode, rand); }
    { const all = Object.values(T.ctl); T.skip.cleared = all.filter(c => c.runs > 0 && c.issues === 0 && c.worst <= FR.slow).length; T.skip.left = all.length - T.skip.cleared; }
    T.ms = Date.now() - t0;
  }

  /* ---------------- flows: whole journeys with checks ---------------- */
  const sampleParts = () => (typeof SAMPLES !== 'undefined' ? SAMPLES : []);
  const regenDone = async () => { await sleep(150); await until(() => typeof MeshStore === 'undefined' || true, 100); await sleep(250); };
  function smoothNote(c, what, f) {
    if (f.n < 6) { c.warn(what + ': too few frames to rate (' + f.n + ')'); return; }
    const g = grade(f), line = what + ': ' + g.word + ' (average ' + f.avg + ' ms a frame, p95 ' + f.p95 + ' ms, worst ' + f.max + ' ms)';
    if (g.cls === 'bad' && softGpu) c.warn(line + ' · drawn by a software renderer, so judge it on a real GPU'); else if (g.cls === 'bad') c.fail(line); else if (g.cls === 'warn') c.warn(line); else c.ok(line);
  }
  const screenOf = (u, v) => { const s = xfPt(planeXf(planeOf(S.sk)), P2(u, v)), r = document.getElementById('ov').getBoundingClientRect(); return { x: s.x + r.left, y: s.y + r.top }; };
  const ptr = (el, t, x, y, b, bs) => el.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 11, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y, button: b, buttons: bs }));
  // the camera, read on every frame of the page's own animation clock
  const watchFrames = (ms, read) => new Promise(res => { const out = [], t0 = performance.now(); (function f() { out.push({ t: performance.now() - t0, s: read() }); if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(out); })(); });
  const eachFrame = (n, fn) => new Promise(res => { let i = 0; (function f() { if (i < n) { fn(i++); requestAnimationFrame(f); } else res(); })(); });
  const camNow = () => ({ q: view.quat.toArray(), h: view.viewH, t: view.target.toArray() });

  const FLOWS = {
    design: [
      { name: 'Every sample part rebuilds', async run(c) {
        const list = sampleParts(); let slowest = { n: '', ms: 0 }, bad = 0; c.metric('sample parts', list.length);
        for (const s of list) {
          if (run.stop) break;
          const g0 = c.mon.gaps.length, t0 = performance.now(), e0 = c.mon.errors.length;
          try { await resetMainTo(s); } catch (e) { bad++; c.fail(s.name + ': threw ' + String(e.message).slice(0, 120)); continue; }
          const ms = Math.round(performance.now() - t0), errs = Object.values(MODEL.errors || {}), bodies = (MODEL.bodies || []).length;
          if (ms > slowest.ms) slowest = { n: s.name, ms };
          if (errs.length) { bad++; c.fail(s.name + ': ' + errs.length + ' feature error(s): ' + String(errs[0]).slice(0, 100)); }
          else if (!bodies && s.axes !== 'model') { bad++; c.fail(s.name + ': builds no body'); }
          else if (c.mon.errors.length > e0) { bad++; c.fail(s.name + ': ' + c.mon.errors[c.mon.errors.length - 1].msg); }
          const f = frameStats(c.mon.gaps.slice(g0)); if (f.max > 2500) c.warn(s.name + ': a frame took ' + f.max + ' ms while it built');
          progress(c.T, 'sample: ' + s.name, .96);
        }
        c.metric('slowest sample', slowest.n + ' ' + slowest.ms + ' ms'); if (!bad) c.ok('all ' + list.length + ' sample parts build with no error');
      } },
      { name: 'Export every file format (STEP, STL, OBJ and the rest)', async run(c) {
        const groups = window.DATUM_ALL_EXPORT_FORMATS || EXPORT_FORMATS, specs = groups.flatMap(g => g.list);
        c.metric('formats', specs.map(x => x[0]).join(', '));
        for (const need of ['step', 'stl', 'obj']) if (!specs.some(x => x[0] === need)) c.fail('no ' + need.toUpperCase() + ' export format is registered');
        await resetMainTo(sampleParts()[0] || SAMPLE());
        const real = window.download, got = [];
        window.download = (name, blob) => { got.push({ name, blob }); };
        try {
          for (const sp of specs) {
            if (run.stop) break;
            got.length = 0; const g0 = c.mon.gaps.length, e0 = c.mon.errors.length, t0 = performance.now();
            try { await runExport(sp[0], { base: 'devtest' }); } catch (e) { c.fail(sp[1] + ': threw ' + String(e.message).slice(0, 120)); continue; }
            if (!await until(() => got.length, 60000)) { c.fail(sp[1] + ' (.' + sp[2] + '): nothing was downloaded'); continue; }
            const f = got[0], size = f.blob.size, ms = Math.round(performance.now() - t0), head = await f.blob.slice(0, 200).text().catch(() => '');
            if (!size) c.fail(sp[1] + ': the file is empty');
            else if (c.mon.errors.length > e0) c.fail(sp[1] + ': ' + c.mon.errors[c.mon.errors.length - 1].msg);
            else if (/\b(NaN|undefined|Infinity)\b/.test(head)) c.fail(sp[1] + ': the file starts with NaN / undefined');
            else if (sp[0] === 'step' && !/ISO-10303/.test(head)) c.fail('STEP file does not start with ISO-10303-21');
            else if (sp[0] === 'obj' && !/^\s*(#|v |o |g |mtllib)/m.test(head)) c.fail('OBJ file has no vertex data at its start');
            else c.ok(sp[1] + ' .' + sp[2] + ': ' + size.toLocaleString() + ' bytes in ' + ms + ' ms');
            const fr = frameStats(c.mon.gaps.slice(g0)); if (fr.max > 2500) c.warn(sp[1] + ': a frame took ' + fr.max + ' ms while exporting');
          }
        } finally { window.download = real; }
      } },
      { name: 'Holding an arrow key in a number field keeps stepping it', async run(c) {
        const hold = (el, key, n, mods = {}) => { for (let i = 0; i < n; i++) el.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true, repeat: i > 0, ...mods })); };
        let tested = 0;
        for (const k of ['primitive', 'hole', 'revolve', 'shell', 'pattern', 'chamfer', 'draft', 'stretch'].filter(x => FEATS[x])) {
          if (run.stop) break;
          await resetMain(); const e0 = c.mon.errors.length;
          try { cmdFeat(k); await sleep(350); } catch (e) { c.fail(k + ': threw ' + String(e.message).slice(0, 100)); continue; }
          const inp = [...document.querySelectorAll('#panel input[type=number], .panel input[type=number]')].find(x => x.isConnected && !x.disabled && !x.readOnly && x.offsetParent);
          if (!inp) { c.warn(k + ': no number field on screen'); continue; }
          const sig = inp.dataset.fv ? 'input[data-fv="' + inp.dataset.fv + '"]' : null;
          inp.focus(); const v0 = parseFloat(inp.value), N = 6; let hits = 0; inp.addEventListener('input', () => hits++);
          hold(inp, 'ArrowUp', N); await sleep(150);
          const cur = (sig && document.querySelector(sig)) || inp, v1 = parseFloat(cur.value), lo = parseFloat(inp.min), hi = parseFloat(inp.max);
          const room = !(isFinite(hi) && v0 + 1 > hi);
          if (!isFinite(v1)) c.fail(k + ': holding ↑ left "' + cur.value + '" in the field');
          else if (room && !(v1 > v0)) c.fail(k + ': holding ↑ did not step the field (' + v0 + ' → ' + v1 + ')');
          else if (room && hits < N) c.warn(k + ': ' + hits + ' of ' + N + ' key repeats stepped the field');
          else if (c.mon.errors.length > e0) c.fail(k + ': ' + c.mon.errors[c.mon.errors.length - 1].msg);
          else { tested++; c.ok(k + ': ↑ held ' + N + ' times, ' + v0 + ' → ' + v1); }
          hold(cur, 'ArrowDown', 2, { shiftKey: true }); await sleep(100);
          if (!isFinite(parseFloat((sig && document.querySelector(sig) || cur).value))) c.fail(k + ': Shift+↓ left a bad value');
        }
        c.metric('fields tried', tested);
      } },
      { name: 'Every kind of modeling feature opens, builds and undoes', async run(c) {
        const kinds = Object.keys(FEATS); c.metric('feature kinds', kinds.length); let finished = 0, needPick = 0;
        for (const k of kinds) {
          if (run.stop) break;
          await resetMain(); const e0 = c.mon.errors.length, n0 = doc.features.length, g0 = c.mon.gaps.length, t0 = performance.now();
          try {
            cmdFeat(k); await sleep(350);
            if (!CMD || CMD.type !== 'feat') { c.fail(k + ': the command did not open'); continue; }
            const ok = document.querySelector('[data-fdo=ok]');
            if (!ok) { c.fail(k + ': its panel has no OK button'); }
            else if (ok.disabled) { needPick++; c.warn(k + ': needs a pick from the model before OK (not finished)'); }
            else { ok.click(); await sleep(500); const errs = Object.values(MODEL.errors || {}); if (doc.features.length > n0) { finished++; if (errs.length) c.warn(k + ' builds with an error: ' + String(errs[0]).slice(0, 90)); else c.ok(k + ': built'); undo(); await sleep(250); if (doc.features.length !== n0) c.fail(k + ': undo did not remove it'); } else c.fail(k + ': OK added no feature'); }
          } catch (e) { c.fail(k + ': threw ' + String(e.message).slice(0, 120)); }
          if (c.mon.errors.length > e0) c.fail(k + ': ' + c.mon.errors[c.mon.errors.length - 1].msg);
          const f = frameStats(c.mon.gaps.slice(g0)); if (f.n > 5 && f.max > 300) c.warn(k + ': a frame took ' + f.max + ' ms (' + Math.round(performance.now() - t0) + ' ms in all)');
          progress(c.T, 'feature: ' + k, .96);
        }
        c.metric('built and undone', finished); c.metric('needing a pick', needPick); await resetMain();
      } },
      { name: 'Every sketch tool draws', async run(c) {
        await resetMain();
        const f = { id: newId(), type: 'sketch', name: 'Dev sketch', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: [], vis: true };
        insertFeature(f); enterSketch(f); await sleep(1200);
        const ov = document.getElementById('ov'), tools = [...SKETCH_TOOLS.flat(), ...SKETCH_XF].map(t => t[0]); let drew = 0;
        // a starter shape so edit tools (trim, offset, fillet…) have something to act on
        const L = (a, b, d, e) => f.ents.push({ id: newId(), type: 'line', a: P2(a, b), b: P2(d, e) });
        L(-30, -20, 30, -20); L(30, -20, 30, 20); L(30, 20, -30, 20); L(-30, 20, -30, -20); modelChanged();
        for (const t of tools) {
          if (run.stop) break;
          if (!S.sk) { enterSketch(f); await sleep(500); }
          const e0 = c.mon.errors.length, n0 = S.sk ? S.sk.ents.length : 0, g0 = c.mon.gaps.length;
          try {
            if (!S.sk) { c.fail(t + ': the sketch could not be re-entered'); continue; }
            setTool(t); await sleep(250);
            const a = screenOf(-15, -8), b = screenOf(18, 12);
            ptr(ov, 'pointerdown', a.x, a.y, 0, 1); for (let i = 1; i <= 8; i++) { ptr(ov, 'pointermove', a.x + (b.x - a.x) * i / 8, a.y + (b.y - a.y) * i / 8, 0, 1); await sleep(16); }
            ptr(ov, 'pointerup', b.x, b.y, 0, 0); await sleep(120);
            ptr(ov, 'pointerdown', b.x, b.y, 0, 1); ptr(ov, 'pointerup', b.x, b.y, 0, 0); await sleep(120);   // a second click finishes two-click tools
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(120);
            if (S.sk && S.sk.ents.length !== n0) drew++;
          } catch (e) { c.fail(t + ': threw ' + String(e.message).slice(0, 120)); }
          if (c.mon.errors.length > e0) c.fail(t + ': ' + c.mon.errors[c.mon.errors.length - 1].msg);
          const fs = frameStats(c.mon.gaps.slice(g0)); if (fs.n > 5 && fs.max > FR.jank) c.warn(t + ': a frame took ' + fs.max + ' ms');
          try { if (CMD) cancelCmd(); } catch (e) { /* none */ }
          progress(c.T, 'sketch tool: ' + t, .96);
        }
        c.metric('sketch tools', tools.length); c.metric('changed the sketch', drew);
        if (drew) c.ok(drew + ' of ' + tools.length + ' tools changed the sketch (the rest are selection / dimension tools or need a pick)');
        try { finishSketch(); } catch (e) { /* closed */ } await resetMain();
      } },
      { name: 'Mouse: orbit, pan and zoom are smooth', async run(c) {
        await resetMain(); const el = document.getElementById('ov'), r = el.getBoundingClientRect();
        const g0 = c.mon.gaps.length;
        for (const [label, b] of [['orbit drag', 0], ['pan drag', 1]]) {
          for (const [fx, fy] of [[0.15, 0.8], [0.85, 0.2], [0.1, 0.15]]) {
            const cx = r.left + r.width * fx, cy = r.top + r.height * fy, N = 40;
            await sleep(500); const rec = watchFrames(N * 17 + 900, camNow);
            ptr(el, 'pointerdown', cx, cy, b, 1 << b); await eachFrame(N, i => ptr(el, 'pointermove', cx + (i + 1) * 4, cy + (i + 1) * 1.2, b, 1 << b)); ptr(el, 'pointerup', cx + N * 4, cy + N * 1.2, b, 0);
            const fr = await rec, mag = fr.map((f, i) => i ? Math.hypot(...f.s.q.map((v, k) => v - fr[i - 1].s.q[k]), f.s.h - fr[i - 1].s.h, ...f.s.t.map((v, k) => v - fr[i - 1].s.t[k])) : 0);
            const mid = mag.slice(6, N - 3), mean = avg(mid);
            if (mean < 1e-5) { c.warn(label + ' from ' + fx + ',' + fy + ': the camera did not move (a drag there may grab a part)'); continue; }
            const sd = Math.sqrt(avg(mid.map(x => (x - mean) * (x - mean)))), cv = sd / mean, stalls = mid.filter(x => x < .15 * mean).length;
            c.metric(label + ': unevenness (std ÷ mean)', +cv.toFixed(2));
            if (cv > .6 || stalls > 3) c.fail(label + ': uneven (' + cv.toFixed(2) + ', ' + stalls + ' stalled frames)'); else c.ok(label + ': even (' + cv.toFixed(2) + ')');
            break;
          }
        }
        for (const [label, n, gap] of [['one wheel notch', 1, 0], ['six notches', 6, 110]]) {
          await sleep(500); const s0 = camNow().h, rec = watchFrames(n * gap + 1100, camNow);
          for (let i = 0; i < n; i++) { el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 })); if (i < n - 1) await sleep(gap); }
          const fr = await rec, hs = fr.map(f => f.s.h), total = hs[hs.length - 1] - s0;
          if (Math.abs(total) < 1e-6) { c.fail(label + ': the wheel did not zoom'); continue; }
          let worst = 0; for (let i = 1; i < hs.length; i++) worst = Math.max(worst, Math.abs(hs[i] - hs[i - 1]) / Math.abs(total));
          const back = hs.filter((z, i) => i && (z - hs[i - 1]) * total < -1e-9).length, per = worst * n;
          c.metric(label + ': most of one notch in one frame (%)', Math.round(per * 100));
          if (per > .6) c.warn(label + ': jumps (' + Math.round(per * 100) + '% of a notch in one frame)'); else c.ok(label + ': glides (' + Math.round(per * 100) + '% of a notch at most in a frame)');
          if (back) c.fail(label + ': the zoom turned back on itself ' + back + ' times');
        }
        smoothNote(c, 'frames while the mouse is used', frameStats(c.mon.gaps.slice(g0)));
        for (const id of ['btnHome', 'btnFit', 'btn2D', 'btn3D']) { const b = document.getElementById(id); if (b) { const g1 = c.mon.gaps.length; b.click(); await sleep(1100); smoothNote(c, '#' + id + ' view move', frameStats(c.mon.gaps.slice(g1))); } }
      } },
      { name: 'Undo and redo walk the whole history', async run(c) {
        await resetMain(); const list = [SAMPLES.find(s => s.name === 'Flanged boss'), SAMPLES.find(s => s.name === 'Pocketed plate')].filter(Boolean);
        for (const s of list) await resetMainTo(s);
        const top = hist.cur; let n = 0; const t0 = performance.now();
        while (hist.cur > 0 && n < 60) { undo(); n++; await sleep(60); }
        let m = 0; while (hist.cur < hist.states.length - 1 && m < 60) { redo(); m++; await sleep(60); }
        c.metric('undo steps', n); c.metric('redo steps', m); c.metric('ms per step', Math.round((performance.now() - t0) / Math.max(1, n + m)));
        if (hist.cur >= top) c.ok('walked back ' + n + ' steps and forward ' + m + ' again'); else c.fail('redo did not return to where undo started (' + hist.cur + ' of ' + top + ')');
      } },
    ],
    cam: [
      { name: 'Auto Program, Verify and Simulate on sample parts (free users: every Manufacture action refuses)', async run(c) {
        const locked = window.CAM_LOCK && CAM_LOCK.active;
        const picks = ['Flanged boss', 'Pocketed plate', 'Cross-drilled shaft'].map(n => SAMPLES.find(s => s.name === n)).filter(Boolean);
        for (const s of picks) {
          if (run.stop) break;
          await resetMainTo(s); const e0 = c.mon.errors.length, g0 = c.mon.gaps.length, t0 = performance.now();
          try {
            if (locked) {   // Premium lock: these must refuse with the message and change nothing
              const n0 = cam().ops.length; for (const [what, fn] of [['Auto Program', () => camAction('autoprog')], ['Verify', () => camAction('verify')]]) {
                document.body.innerText; fn(); await sleep(300);
                if (/coming soon for Premium/i.test(document.body.innerText)) c.ok(s.name + ': ' + what + ' is locked and says so'); else c.warn(s.name + ': ' + what + ' is locked but showed no message');
              }
              if (cam().ops.length !== n0) c.fail(s.name + ': a locked action changed the program');
              // everything in Manufacture is Premium: 2D toolpaths, Simulate and G-code refuse too
              for (const [what, a] of [['a 2D toolpath', 'add:pocket'], ['Simulate', 'sim'], ['G-code', 'post']]) {
                camAction(a); await sleep(300);
                if (cam().ops.length !== n0 || SIM.on || CAMUI.view === 'post') c.fail(s.name + ': ' + what + ' ran for a free user'); else c.ok(s.name + ': ' + what + ' is locked');
                CAMUI.view = 'overview'; camRefresh();
              }
              CAMUI.view = 'overview'; camRefresh();
              continue;
            }
            camAction('autoprog'); await sleep(1500);
            await until(() => cam().ops.length && cam().ops.every(o => { try { const P = toolpath(o); return P && !P.pending; } catch (e) { return true; } }), 90000); await sleep(1500);   // every path computed before Verify starts
            const ops = cam().ops.length; if (!ops) c.fail(s.name + ': Auto Program made no operations'); else c.ok(s.name + ': Auto Program made ' + ops + ' operations in ' + Math.round(performance.now() - t0) + ' ms');
            VERIFY.report = null; camAction('verify'); await sleep(800); if (!VERIFY.busy && !VERIFY.report) camAction('verify');
            await until(() => !VERIFY.busy && VERIFY.report, 180000); await sleep(500);
            if (VERIFY.report) c.ok(s.name + ': Verify finished'); else c.warn(s.name + ': Verify did not finish in 3 minutes');
            camAction('sim'); await sleep(2500); smoothNote(c, s.name + ' simulation', frameStats(c.mon.gaps.slice(g0))); if (SIM.on) simStop();
          } catch (e) { c.fail(s.name + ': threw ' + String(e.message).slice(0, 140)); }
          if (c.mon.errors.length > e0) c.fail(s.name + ': ' + c.mon.errors[c.mon.errors.length - 1].msg);
          progress(c.T, 'CAM flow: ' + s.name, .96);
        }
      } },
      { name: 'Every toolpath type: usable ones are added, locked ones refuse', async run(c) {
        await resetMainTo(SAMPLE()); const btns = [...document.querySelectorAll('#toolbar [data-cam^="add:"]')].map(b => b.dataset.cam); c.metric('toolpath types', btns.length);
        let added = 0, refused = 0;
        for (const a of btns) {
          if (run.stop) break;
          const e0 = c.mon.errors.length, n0 = cam().ops.length, lock = window.CAM_LOCK && CAM_LOCK.act(a), t0 = performance.now(), g0 = c.mon.gaps.length;
          try { camAction(a); await sleep(400); } catch (e) { c.fail(a + ': threw ' + String(e.message).slice(0, 120)); }
          const ms = Math.round(performance.now() - t0), worst = frameStats(c.mon.gaps.slice(g0)).max, grew = cam().ops.length > n0;
          if (c.mon.errors.length > e0) c.fail(a + ': ' + c.mon.errors[c.mon.errors.length - 1].msg);
          else if (lock) { if (grew) c.fail(a + ' is Premium-locked but added a toolpath'); else { refused++; c.ok(a + ': locked'); } }
          else if (worst > 1500) { added += grew; c.warn(a + ': ' + (grew ? 'added' : 'opened') + ' but froze the page for ' + worst + ' ms'); }
          else { added += grew; c.ok(a + (grew ? ': added' : ': opened') + ' in ' + ms + ' ms'); }
          try { CAMUI.view = 'overview'; camRefresh(); } catch (e) { /* none */ }
        }
        c.metric('added', added); c.metric('refused (locked)', refused);
      } },
      { name: 'Free 2D toolpaths build and post G-code (Face, Contour, Pocket, Drill, Chain)', async run(c) {
        await resetMainTo(SAMPLE()); const kinds = ['add:face', 'add:contour', 'add:pocket', 'add:drill:spot', 'add:drill:peck', 'add:drill:drill', 'add:drill:cbore', 'add:chain'];
        for (const a of kinds) { const n0 = cam().ops.length, e0 = c.mon.errors.length; try { camAction(a); await sleep(500); CAMUI.view = 'overview'; camRefresh(); } catch (e) { c.fail(a + ': threw ' + String(e.message).slice(0, 100)); } if (c.mon.errors.length > e0) c.fail(a + ': ' + c.mon.errors[c.mon.errors.length - 1].msg); else if (cam().ops.length > n0) c.ok(a + ': added'); }
        await sleep(1500); const bad = cam().ops.filter(o => { const P = toolpath(o); return P && !P.pending && P.warn && P.warn.length; }).length;
        c.metric('operations', cam().ops.length); if (!cam().ops.length) c.fail('no operations were made'); else if (bad) c.warn(bad + ' operation(s) carry a warning'); else c.ok('every operation computed with no warning');
      } },
    ],
    print: [
      { name: 'Slice a sample part', async run(c) {
        await resetMainTo(SAMPLE()); const b = [...document.querySelectorAll('button')].find(x => /^Slice$/.test(x.textContent.trim()) && visible(x));
        if (!b) { c.warn('no Slice button on screen'); return; }
        const g0 = c.mon.gaps.length, t0 = performance.now(); b.click();
        const done = await until(() => /Sliced/.test(document.body.innerText), 120000);
        if (done) c.ok('sliced in ' + Math.round(performance.now() - t0) + ' ms'); else c.fail('slicing did not finish in 2 minutes');
        smoothNote(c, 'frames while slicing', frameStats(c.mon.gaps.slice(g0)));
      } },
    ],
    page: [
      { name: 'Every workspace tab opens and comes back', async run(c) {
        for (const t of WS.filter(x => !x.flowsOnly)) {
          const g0 = c.mon.gaps.length, t0 = performance.now(); try { setWorkspace(t.id); } catch (e) { c.fail(t.name + ': threw ' + String(e.message).slice(0, 120)); continue; }
          await until(() => ready(t), 60000); await sleep(1200); c.metric(t.name + ' opened in (ms)', Math.round(performance.now() - t0));
          smoothNote(c, t.name + ' tab', frameStats(c.mon.gaps.slice(g0)));
          const tab = document.querySelector('[data-ws="' + t.id + '"]'); if (tab && !tab.classList.contains('on')) c.fail(t.name + ': its tab is not marked as on');
        }
        setWorkspace('design'); await sleep(600);
      } },
      { name: 'Theme, units and page toggles', async run(c) {
        for (const id of ['btnTheme', 'btnTheme']) { const b = document.getElementById(id); if (b) { b.click(); await sleep(500); } }
        c.ok('theme toggled twice'); const g0 = c.mon.gaps.length; window.dispatchEvent(new Event('resize')); await sleep(600); smoothNote(c, 'resize', frameStats(c.mon.gaps.slice(g0)));
      } },
    ],
  };
  async function resetMainTo(s) { try { if (S.sk) exitSketchMode(false); if (CMD) cancelCmd(); if (SIM.on) simStop(); } catch (e) { /* none */ } loadDoc(s.make(), 'dev'); await regenDone(); await sleep(500); }

  async function runFlows(ws, T, mode, rand) {
    const list = FLOWS[ws.id] || [];
    for (let i = 0; i < list.length && !run.stop; i++) {
      const sc = list[i];
      if (sc.ws) { try { setWorkspace(sc.ws); } catch (e) { /* reported by the page */ } await sleep(900); if (sc.ws !== 'sheet') await resetMain(); }
      const w = winOf(ws) || window, mon = instrument(w), t0 = Date.now();
      const out = { name: sc.name, pass: true, notes: [], metrics: {}, ms: 0 };
      const mark = { e: mon.errors.length, g: mon.gaps.length };
      const c = { w, mon, T, ok: m => out.notes.push('✓ ' + m), warn: m => out.notes.push('• ' + m), fail: m => { out.pass = false; out.notes.push('✗ ' + m); }, metric: (k, v) => { out.metrics[k] = v; } };
      progress(T, 'flow: ' + sc.name, .96);
      try { await sc.run(c); } catch (e) { out.pass = false; out.notes.push('✗ stopped: ' + String((e && e.message) || e).slice(0, 200)); }
      const r = inspect(w, mon, mark, ws);
      r.found.filter(x => !WARN[x.type]).forEach(x => { out.pass = false; out.notes.push('✗ ' + x.type + ': ' + x.detail); addFinding(T, x, [sc.name]); });
      addFrames(T, r.gaps); out.ms = Date.now() - t0;
      T.scenarios.push(out); render();
      if (!ws.frame) await resetMain();
    }
  }

  /* ---------------- feedback ---------------- */
  const controlRows = T => Object.values(T.ctl).map(c => ({ label: c.label, kind: c.kind, uses: c.runs, didSomething: c.runs ? Math.round(c.effects / c.runs * 100) : 0, avgFrameMs: r1(avg(c.gaps)), p95FrameMs: r1(pct(c.gaps, .95)), worstFrameMs: Math.round(c.worst), janks: c.jank, issues: c.issues }));
  function feedback(T) {
    const rows = controlRows(T), f = frameStats(T.fr.sample), g = grade({ ...f, n: T.fr.n, over50: T.fr.over50, over100: T.fr.over100 });
    const slow = rows.filter(r => r.uses >= 2).sort((a, b) => b.p95FrameMs - a.p95FrameMs).slice(0, 6);
    const inert = rows.filter(r => r.uses >= 3 && r.didSomething === 0 && r.kind !== 'key' && !/🔒/.test(r.label));
    return { rows, frames: { ...f, n: T.fr.n, over34: T.fr.over34, over50: T.fr.over50, over100: T.fr.over100, max: Math.round(T.fr.max) }, grade: g, slow, inert };
  }
  let lastRender = 0;
  function progress(T, what, frac) {
    const rate = run.steps > 5 && run.active ? (run.steps / (run.active / 1000)).toFixed(1) : '–';
    $d('devNow').textContent = (T ? T.id + ': ' : '') + what + ' · ' + rate + ' tests/s · ' + run.steps + ' done';
    $d('devBar').style.width = Math.round(run.base + frac * run.span) + '%';
    if (Date.now() - lastRender > 700) { lastRender = Date.now(); render(); }
  }
  // what "Don't review working things" and "Aim more for mistakes" did, for the summary and the panel
  function steerLines(T) {
    const L = [];
    if (T.skip && T.skip.on) L.push('Don\'t review working things: ' + T.skip.cleared + ' of ' + (T.skip.cleared + T.skip.left) + ' controls worked and ran smooth the first time and were not tried again in the pairs, triples, combinations and random runs after.');
    if (T.aim && T.aim.on) {
      const A = T.aim, hot = Object.entries(A.hot).filter(e => e[1] > 0).sort((p, q) => q[1] - p[1]);
      if (!hot.length) L.push('Aim more for mistakes: nothing went wrong, so no area got extra attention.');
      else {
        L.push('Aim more for mistakes: ' + hot.length + ' area' + (hot.length > 1 ? 's' : '') + ' got extra attention (' + A.repeats + ' repeats of a step that went wrong).');
        hot.slice(0, 8).forEach(([area]) => L.push('  ' + area + ': ' + Object.entries(A.why[area] || {}).map(e => e[0] + ' ×' + e[1]).join(', ') + ' · ' + (A.steered[area] || 0) + ' extra steps'));
        const cool = Object.entries(A.passes).filter(e => !(A.hot[e[0]] > 0) && e[1] >= 20).map(e => e[0]); if (cool.length) L.push('  less attention: ' + cool.slice(0, 8).join(', ') + ' (kept passing)');
      }
    }
    return L;
  }
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  function render() {
    const R = run.report; if (!R) return;
    const rows = Object.values(R.tools).map(T => {
      const errs = T.findings.filter(x => !WARN[x.type]).length, warns = T.findings.filter(x => WARN[x.type]).length, fl = T.scenarios, flBad = fl.filter(s => !s.pass).length, fb = feedback(T), bad = errs + flBad;
      return '<tr><td>' + T.name + '</td><td>' + T.controls + '</td><td>' + T.singles.run + '</td><td>' + T.pairs.run + '<span style="color:#8a8f97"> / ' + T.pairs.possible + '</span></td><td>' + T.triples.run + '</td><td>' + T.combos.run + '</td><td>' + T.sequences.run + '</td><td>' + (fl.length ? (fl.length - flBad) + '/' + fl.length : '–') + '</td><td class="' + fb.grade.cls + '">' + (T.fr.n ? fb.grade.word : '–') + '</td><td class="' + (bad ? 'bad' : warns ? 'warn' : 'ok') + '">' + (bad ? bad + ' issue' + (bad > 1 ? 's' : '') : warns ? warns + ' warning' + (warns > 1 ? 's' : '') : 'clean') + '</td></tr>';
    }).join('');
    $d('devSum').innerHTML = '<tr><th>workspace</th><th>controls</th><th>single</th><th>pairs</th><th>triples</th><th>combos</th><th>runs</th><th>flows</th><th>smoothness</th><th>result</th></tr>' + rows;
    const opened = new Set([...panel.querySelectorAll('#devFeed > details[open]')].map(x => x.dataset.t));
    $d('devFeed').innerHTML = Object.values(R.tools).map(T => {
      const fb = feedback(T); let h = '<details data-t="' + T.id + '"' + (opened.has(T.id) || (!run.on && !opened.size) ? ' open' : '') + '><summary><span>' + T.name + '</span><small class="' + fb.grade.cls + '">' + (T.fr.n ? fb.grade.word : 'no frames timed') + '</small></summary>';
      if (T.fr.n) h += '<div class="fb"><b>Smoothness.</b> ' + T.fr.n + ' frames timed: average ' + fb.frames.avg + ' ms, p95 ' + fb.frames.p95 + ' ms, worst ' + fb.frames.max + ' ms. ' + fb.frames.over50 + ' hitches over ' + FR.slow + ' ms, ' + fb.frames.over100 + ' janks over ' + FR.jank + ' ms.</div>';
      if (fb.slow.length && fb.slow[0].p95FrameMs > FR.fine) h += '<div class="fb"><b>Slowest controls.</b> ' + fb.slow.filter(r => r.p95FrameMs > FR.fine).map(r => esc(r.label) + ' (p95 ' + r.p95FrameMs + ' ms, worst ' + r.worstFrameMs + ' ms)').join('; ') + '</div>';
      steerLines(T).forEach(l => { h += '<div class="fb">' + esc(l).replace(/\n/g, '<br>') + '</div>'; });
      if (T.locked.n) h += '<div class="fb"><b>Premium lock.</b> Locked controls were pressed ' + T.locked.n + ' times and said so ' + T.locked.said + ' times.</div>';
      if (fb.inert.length) h += '<div class="fb"><b>Did nothing you could see (' + fb.inert.length + ').</b> ' + fb.inert.slice(0, 14).map(r => esc(r.label)).join(', ') + (fb.inert.length > 14 ? '…' : '') + ' (some are meant to, when they are at a limit)</div>';
      h += T.scenarios.map(s => '<div class="sc"><b><span class="' + (s.pass ? 'ok' : 'bad') + '">' + (s.pass ? '✓' : '✗') + '</span> ' + esc(s.name) + ' <small style="color:#8a8f97;font-weight:400">' + Math.round(s.ms / 1000) + ' s' + Object.entries(s.metrics).map(e => ' · ' + e[0] + ' ' + e[1]).join('') + '</small></b><ul>' + s.notes.slice(0, 60).map(n => '<li class="' + (n[0] === '✗' ? 'bad' : n[0] === '•' ? 'warn' : '') + '">' + esc(n) + '</li>').join('') + '</ul></div>').join('');
      if (fb.rows.length) h += '<details><summary><span>Every control (' + fb.rows.length + ')</span><small>uses · did something · frame ms</small></summary><table class="ctl"><tr><th>control</th><th>kind</th><th>uses</th><th>did something</th><th>p95</th><th>worst</th></tr>' + fb.rows.map(r => '<tr><td>' + esc(r.label) + '</td><td>' + r.kind + '</td><td>' + r.uses + '</td><td>' + r.didSomething + '%</td><td class="' + (r.p95FrameMs > FR.slow ? 'bad' : r.p95FrameMs > FR.fine ? 'warn' : '') + '">' + r.p95FrameMs + '</td><td class="' + (r.worstFrameMs > FR.jank ? 'warn' : '') + '">' + r.worstFrameMs + '</td></tr>').join('') + '</table></details>';
      return h + '</details>';
    }).join('');
    const all = []; Object.values(R.tools).forEach(T => T.findings.forEach(x => all.push({ tool: T.name, x })));
    all.sort((p, q) => (WARN[p.x.type] ? 1 : 0) - (WARN[q.x.type] ? 1 : 0));
    $d('devFinds').innerHTML = all.length ? all.slice(0, 60).map(({ tool, x }) => '<div class="find ' + (WARN[x.type] ? 'warn' : 'bad') + '"><b>' + tool + ' · ' + x.type + (x.count > 1 ? ' (×' + x.count + ')' : '') + '</b>' + esc(x.detail) + '<code>' + esc(x.example.map((s, i) => (i + 1) + '. ' + s).join('\n') + (Object.keys(x.by || {}).length > 1 ? '\nset off most by: ' + Object.entries(x.by).sort((p, q) => q[1] - p[1]).slice(0, 4).map(e => e[0] + ' ×' + e[1]).join(', ') : '')) + '</code></div>').join('') : (run.on ? '' : '<div class="ok">Nothing glitched.</div>');
  }
  // frame times on a software renderer (SwiftShader, llvmpipe, a VM without a GPU) measure the machine, not the app
  const gpuName = (() => { try { const gl = document.createElement('canvas').getContext('webgl'); const x = gl && gl.getExtension('WEBGL_debug_renderer_info'); return x ? String(gl.getParameter(x.UNMASKED_RENDERER_WEBGL)) : ''; } catch (e) { return ''; } })();
  const softGpu = /swiftshader|llvmpipe|software|softpipe|basic render/i.test(gpuName);
  function summaryText() {
    const R = run.report; if (!R) return 'No run yet.';
    const L = ['3D modeling dev run · ' + R.mode + ' · seed ' + R.seed + ' · ' + R.startedAt + (R.totalMs ? ' · ' + fmtMs(R.totalMs) : ''), ''];
    if (R.softwareRendering) L.push('NOTE: drawn by a software renderer (' + R.gpu + '), so frame times and first-use shader compiles are far slower than on a graphics card. Judge smoothness on a real GPU.', '');
    Object.values(R.tools).forEach(T => {
      const fb = feedback(T), errs = T.findings.filter(x => !WARN[x.type]), warns = T.findings.filter(x => WARN[x.type]);
      L.push(T.name.toUpperCase() + ' — ' + (errs.length || T.scenarios.some(s => !s.pass) ? 'ISSUES' : 'clean') + (T.fr.n ? ' · ' + fb.grade.word : ''));
      L.push('  controls ' + T.controls + ' · single ' + T.singles.run + ' · pairs ' + T.pairs.run + '/' + T.pairs.possible + ' · triples ' + T.triples.run + ' · checkbox combinations ' + T.combos.run + '/' + T.combos.possible + ' (' + T.combos.toggles + ' checkboxes) · random runs ' + T.sequences.run + ' · flows ' + T.scenarios.filter(s => s.pass).length + '/' + T.scenarios.length);
      steerLines(T).forEach(l => L.push('  ' + l));
      if (T.fr.n) L.push('  smoothness: ' + T.fr.n + ' frames, average ' + fb.frames.avg + ' ms, p95 ' + fb.frames.p95 + ' ms, worst ' + fb.frames.max + ' ms, ' + fb.frames.over50 + ' hitches, ' + fb.frames.over100 + ' janks');
      fb.slow.filter(r => r.p95FrameMs > FR.fine).forEach(r => L.push('  slow: ' + r.label + ' — p95 ' + r.p95FrameMs + ' ms, worst ' + r.worstFrameMs + ' ms'));
      if (T.locked.n) L.push('  Premium-locked controls pressed ' + T.locked.n + ' times, each said so ' + T.locked.said + ' times');
      if (fb.inert.length) L.push('  did nothing visible: ' + fb.inert.map(r => r.label).join(', '));
      T.scenarios.forEach(s => { L.push('  ' + (s.pass ? '✓' : '✗') + ' ' + s.name + ' (' + Math.round(s.ms / 1000) + ' s)'); s.notes.filter(n => n[0] !== '✓' || !s.pass).forEach(n => L.push('      ' + n)); });
      errs.forEach(x => L.push('  ✗ ' + x.type + ' ×' + x.count + ': ' + x.detail + ' (after: ' + x.example.join(' › ') + ')'));
      warns.forEach(x => L.push('  • ' + x.type + ' ×' + x.count + ': ' + x.detail));
      L.push('');
    });
    return L.join('\n');
  }
  async function start(only) {
    if (run.on) return;
    ensurePanel();
    // (not in the modeling-only build: its tabs are the ones the dev tool tests, and it must test what the person can see)
    if (window.DATUM_RELEASE && !DATUM_RELEASE.dev && !DATUM_RELEASE.modelingOnly) {
      // The early-access build hides tabs and export formats; reload with ?dev=1 so everything is back, then start the same run.
      const ids0 = only || [...panel.querySelectorAll('input[data-t]:checked')].map(x => x.dataset.t), u = new URL(location.href);
      try { sessionStorage.setItem('datum.devgo', JSON.stringify({ ids: ids0, mode: $d('devMode').value, seed: $d('devSeed').value, opts: ($d('devCtl').checked ? 'c' : '') + ($d('devCombo').checked ? 'm' : '') + ($d('devFlow').checked ? 'f' : '') + ($d('devPrem').checked ? 'p' : '') + ($d('devLog').checked ? 'l' : '') + ($d('devSkip').checked ? 's' : '') + ($d('devAim').checked ? 'a' : '') })); } catch (e) { $d('devNow').textContent = 'Could not reload with dev mode on.'; return; }
      u.searchParams.set('dev', '1'); u.searchParams.delete('premium'); u.searchParams.delete('ws');
      $d('devNow').textContent = 'Reloading with dev mode on (?dev=1) so the hidden tabs and export formats come back…'; location.href = u.href; return;
    }
    const mode = MODES[$d('devMode').value], seed = +$d('devSeed').value || 1;
    const ids = (only || [...panel.querySelectorAll('input[data-t]:checked')].map(x => x.dataset.t)).filter(id => { const w = WS.find(x => x.id === id); return w && !(mode.endless && w.flowsOnly); });
    const opt = { controls: $d('devCtl').checked, combos: $d('devCombo').checked, flows: $d('devFlow').checked && !mode.endless, skip: $d('devSkip').checked && !mode.endless, aim: $d('devAim').checked, endless: !!mode.endless };
    if (!ids.length) return;
    run.on = true; run.stop = false; run.steps = 0; run.active = 0; run.at = 0;
    // the console debug log (every click, key, value change, view move, resize…) is on for the run and off after it
    const debugLog = typeof Trace !== 'undefined' && $d('devLog').checked; if (debugLog) Trace.set(true, false);
    // the status tracker marks what the run does as "dev" so Export status can tell it from what a person did
    if (typeof Trace !== 'undefined') { Trace.log('dev', 'dev mode run started', { mode: $d('devMode').value, seed, workspaces: ids.join(', ') }); Trace.auto = true; }
    const wasLocked = window.CAM_LOCK ? CAM_LOCK.active : false; if (window.CAM_LOCK && $d('devPrem').checked) CAM_LOCK.set(false);
    run.report = { startedAt: new Date().toISOString(), mode: $d('devMode').value, seed, options: opt, userAgent: navigator.userAgent, gpu: gpuName, softwareRendering: softGpu, tools: {}, note: 'Pairs, combinations and runs are sampled unless the mode is Thorough; the counts say what was covered. Frame times are the gaps between painted frames.' };
    $d('devGo').disabled = true; $d('devStop').disabled = false; $d('devSub').textContent = 'running';
    const t0 = Date.now();
    for (let n = 0; n < ids.length && !run.stop; n++) {
      const ws = WS.find(x => x.id === ids[n]); if (!ws) continue;
      run.base = n / ids.length * 100; run.span = 100 / ids.length;
      const T = run.report.tools[ws.id] = newTool(ws.id);
      try {
        if (ws.flowsOnly) { await openWs(ws); instrument(window); const tag = (id, l) => (opt.flows ? l : []).map(f => ({ ...f, ws: id })), flows = [...SCOPE.filter(id => id !== 'page' && FLOWS[id]).flatMap(id => tag(id, FLOWS[id])), ...(opt.flows ? FLOWS.page : []).map(f => ({ ...f, ws: 'design' }))]; FLOWS.__page = flows; await runPageFlows(ws, T, mode); }
        else await testWs(ws, mode, seed, T, opt);
      } catch (e) { T.findings.push({ k: 'harness', type: 'test harness stopped', detail: String((e && e.message) || e), count: 1, example: [] }); }
      render();
    }
    run.report.totalMs = Date.now() - t0; run.report.premiumLocked = window.CAM_LOCK ? CAM_LOCK.active : null;
    if (window.CAM_LOCK && wasLocked && !CAM_LOCK.active) CAM_LOCK.set(true);
    Object.values(run.report.tools).forEach(T => { const fb = feedback(T); T.feedback = { smoothness: fb.grade.word, frames: fb.frames, slowestControls: fb.slow, didNothingVisible: fb.inert.map(r => r.label), controls: fb.rows }; });
    if (typeof Trace !== 'undefined') { Trace.auto = false; Trace.log('dev', run.stop ? 'dev mode run stopped' : 'dev mode run finished', { ms: run.report.totalMs }); }
    if (debugLog && Trace.on) Trace.set(false, false);
    run.on = false; $d('devGo').disabled = false; $d('devStop').disabled = true; $d('devBar').style.width = '100%';
    const bad = Object.values(run.report.tools).reduce((s, T) => s + T.findings.filter(x => !WARN[x.type]).length + T.scenarios.filter(q => !q.pass).length, 0);
    $d('devSub').textContent = (run.stop ? 'stopped · ' : 'done · ') + fmtMs(run.report.totalMs) + ' · ' + (bad ? bad + ' issue' + (bad > 1 ? 's' : '') : 'clean');
    $d('devNow').textContent = ''; render(); window.__devReport = run.report;
  }
  // "Page & modeling flows" runs every flow of the modeler even when its workspace is not ticked
  async function runPageFlows(ws, T, mode) { FLOWS[ws.id] = FLOWS.__page; await runFlows(ws, T, mode, rng(1)); }
  const estimate = () => {
    const mode = MODES[$d('devMode').value], sel = [...panel.querySelectorAll('input[data-t]:checked')].map(x => x.dataset.t), real = sel.filter(x => { const w = WS.find(q => q.id === x); return w && !w.flowsOnly; }), n = real.length, c = 60;
    if (mode.endless) { $d('devEst').textContent = 'Endless: random runs in sketching and 3D modeling until you press Stop.'; return; }
    const ctl = $d('devCtl').checked, combos = $d('devCombo').checked, flows = $d('devFlow').checked;
    let steps = n * ((ctl ? c + (mode.pairs === Infinity ? c * (c - 1) : mode.pairs) * 2 + mode.triples * 3 + mode.seqs * 6.5 : 0) + (combos ? mode.combos * (4 + mode.probe) : 0));
    let ms = steps / RATE * 1000 + n * 12000;
    if (flows) ms += 3 * 60000; if (sel.includes('page')) ms += 4 * 60000;
    $d('devEst').textContent = 'About ' + fmtMs(ms) + ' for ' + sel.length + ' workspace' + (sel.length === 1 ? '' : 's') + ' at ' + RATE + ' steps a second' + (flows ? ', with the flows' : '') + '.';
  };
  function bindPanel() {
    panel.addEventListener('change', estimate); estimate();
    $d('devGo').addEventListener('click', () => start());
    const steps = () => { if (typeof Trace === 'undefined') return; $d('devSteps').textContent = Trace.track ? Trace.buf.length + ' steps recorded' : 'tracker is off'; };
    $d('devTrack').checked = typeof Trace !== 'undefined' && Trace.track;
    $d('devTrack').addEventListener('change', () => { if (typeof Trace !== 'undefined') Trace.setTrack($d('devTrack').checked); steps(); });
    // sharpness: the grade and what is wrong, live while the panel is open (a reading draws one frame, so it waits while a run is going)
    const GRADE = { Sharp: ['#17361f', '#5fd38a'], Soft: ['#3a3014', '#e9c04c'], Blurry: ['#40191a', '#f06a6a'] };
    let blurBusy = false;
    const blur = async () => {
      if (!window.__blur || blurBusy) return; blurBusy = true;
      try {
        const res = await window.__blur.measure(), g = $d('devBlurGrade'), c = GRADE[res.grade] || GRADE.Sharp;
        g.textContent = res.grade; g.style.background = c[0]; g.style.color = c[1];
        $d('devBlurText').textContent = window.__blur.text();
      } catch (e) { $d('devBlurText').textContent = 'Could not read the view: ' + e.message; } finally { blurBusy = false; }
    };
    $d('devBlurNow').addEventListener('click', blur);
    setInterval(() => { if (!panel.hidden && $d('devBlurLive').checked && !run.on) blur(); }, 3000);
    // Export status takes a fresh sharpness reading first, so the file says how the view looks right now
    const exportNow = async fmt => { if (window.__blur && !run.on) await blur(); if (typeof window.exportStatus === 'function') window.exportStatus(fmt); steps(); };
    $d('devExport').addEventListener('click', () => exportNow());
    $d('devExportJson').addEventListener('click', () => exportNow('json'));
    steps(); setInterval(() => { if (!panel.hidden) steps(); }, 1000);
    $d('devStop').addEventListener('click', () => { run.stop = true; $d('devSub').textContent = 'stopping…'; });
    const text = () => JSON.stringify(run.report || {}, (k, v) => (k === 'k' || k === 'sample') ? undefined : v, 2);
    const copy = (s, ok) => { try { navigator.clipboard.writeText(s).then(() => { $d('devNow').textContent = ok; }, () => { $d('devNow').textContent = 'Could not copy. Use Download.'; }); } catch (e) { $d('devNow').textContent = 'Could not copy. Use Download.'; } };
    $d('devCopy').addEventListener('click', () => copy(text(), 'Report copied.'));
    $d('devSummary').addEventListener('click', () => copy(summaryText(), 'Summary copied.'));
    $d('devSave').addEventListener('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text()], { type: 'application/json' })); a.download = '3d-modeling-dev-report.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); });
  }
  window.__dev = { ribbonProblems, start, run, MODES, WS, discover, instrument, inspect, summaryText, frameStats, grade, FLOWS };
  // The early-access build reloads itself with ?dev=1 to bring its hidden tabs back; the run that was asked for rides along in sessionStorage
  // (a one-shot set only by the panel's own Start button), so the page address alone can never launch dev mode.
  const handoff = (() => { try { const v = sessionStorage.getItem('datum.devgo'); sessionStorage.removeItem('datum.devgo'); return v ? JSON.parse(v) : null; } catch (e) { return null; } })();
  if (handoff) setTimeout(() => {
    ensurePanel().hidden = false;
    if (handoff.mode && MODES[handoff.mode]) $d('devMode').value = handoff.mode;
    if (handoff.seed) $d('devSeed').value = handoff.seed;
    const o = handoff.opts || ''; $d('devCtl').checked = o.includes('c'); $d('devCombo').checked = o.includes('m'); $d('devFlow').checked = o.includes('f'); $d('devPrem').checked = o.includes('p'); $d('devLog').checked = o.includes('l'); $d('devSkip').checked = o.includes('s'); $d('devAim').checked = o.includes('a');
    start(handoff.ids && handoff.ids.length ? handoff.ids : null);
  }, 2500);
})();
