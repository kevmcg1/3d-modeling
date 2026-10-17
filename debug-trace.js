// ═══════════════════════════════════════════════════════════════════
//  The deeper debug log. Trace (in 3d-modeler.html) already writes every button, menu item, shortcut key and
//  command to the browser console. When the log is on, this adds everything else:
//
//    type      every key typed in a field (the text so far), and Tab / Enter / arrows / Escape inside it
//    change    a value changed: field label, unit, from → to (and the same in mm), then what the app did with it:
//              every model or toolpath value that moved ("path: from → to", model units are mm)
//    verify    200 ms later, whether the field still shows what was typed (clamped, rounded or refused values show up here)
//    model     bodies and their overall size X × Y × Z after every rebuild, with the change from the last one; stock size
//    view      the 3D view: zoom (view height, pixels per mm), pan, orbit (azimuth / elevation), visible area, canvas size
//    resize    the window and every canvas, panel, dialog and frame: size from → to
//    drag      every pointer drag (what was grabbed, how far it moved, how long), wheel turns, scrolls, dropped files
//    state     workspace, command, sketch, tool, selection, simulation and toolpath view: opened, changed, exited
//    panel     the side panel, dialogs and menus opening and closing; each toast message
//
//  Nothing runs while the log is off (Trace.on is false): no listener does work and nothing is written. Dev mode
//  switches the log on for its run and off after it; File → Debug log switches it by hand.
// ═══════════════════════════════════════════════════════════════════
(function () {
  if (typeof Trace === 'undefined') return;
  const short = (s, n = 60) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
  const r = (n, d = 3) => (typeof n === 'number' && isFinite(n) ? +n.toFixed(d) : n);
  const L = (kind, what, data, level) => { if (Trace.on) Trace.log(kind, what, data, level); };
  const unitName = () => { try { return typeof uName === 'function' ? uName() : 'mm'; } catch (e) { return 'mm'; } };
  const inches = () => { try { return typeof isIn === 'function' && isIn(); } catch (e) { return false; } };
  const sz = b => [r(b[3] - b[0]), r(b[4] - b[1]), r(b[5] - b[2])];
  const dims = a => a.join(' × ');

  /* ---------------- naming things ---------------- */
  const whereOf = el => {
    const c = s => el.closest && el.closest(s);
    return c('#toolbar') ? 'toolbar' : c('#panel') ? 'panel' : c('#modal') ? 'dialog' : c('#ctxmenu') ? 'menu' : c('#tl-items') ? 'timeline' : c('#browser') ? 'browser' : c('#simbar') ? 'sim bar' : c('#topbar') ? 'top bar' : c('#viewtools, #visGroup') ? 'view tools' : 'page';
  };
  const labelOf = el => {
    let t = el.getAttribute('aria-label') || el.getAttribute('title') || '';
    if (!t) { const lab = el.closest('label'); if (lab) { const sp = lab.querySelector('span'); t = (sp || lab).textContent; } }
    if (!t) { const f = el.closest('.field, .hfield'); if (f) { const sp = f.querySelector('span, label'); t = sp ? sp.textContent : ''; } }
    if (!t) t = el.placeholder || el.name || '';
    return short(t) || el.id || el.type || el.tagName.toLowerCase();
  };
  const unitOf = el => {
    if (el.dataset && el.dataset.unit) return el.dataset.unit;
    const m = / \(([^)]{1,6})\)\s*$/.exec(labelOf(el)); if (m) return m[1];
    if (el.dataset && el.dataset.len) return unitName();
    const u = el.parentElement && el.parentElement.querySelector('.u, .unit'); return u ? short(u.textContent, 6) : '';
  };
  const secret = el => el.type === 'password' || /pass|secret|token|key\b/i.test((el.id || '') + ' ' + (el.name || ''));
  const valueOf = el => secret(el) ? '[hidden]' : el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.tagName === 'SELECT' ? (el.selectedOptions[0] ? short(el.selectedOptions[0].textContent) + ' (' + el.value + ')' : el.value) : el.value;
  const nameEl = el => {
    if (!el || !el.tagName) return 'nothing';
    const id = el.id ? '#' + el.id : '', cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const named = el.matches && el.matches('button, a, label, input, select, textarea, [role=button], [data-act], .tl, .pick');   // other elements hold whole panels of text: name them by id / class only
    const txt = short(el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('data-tip')) || (el.tagName === 'CANVAS' || el.tagName === 'IMG' ? el.alt || '' : named ? el.textContent : ''), 40);
    return el.tagName.toLowerCase() + id + (id ? '' : cls) + (txt ? ' “' + txt + '”' : '');
  };

  /* ---------------- what changed in the model ---------------- */
  const plain = (k, v) => typeof v === 'function' || (typeof Node !== 'undefined' && v instanceof Node) || v instanceof Set || v instanceof Map ? undefined : v;
  const snapshot = () => {
    try {
      const o = {};
      if (typeof CMD !== 'undefined' && CMD) o.command = CMD;
      if (typeof doc !== 'undefined' && doc) { if (doc.cam) o.cam = doc.cam; if (doc.params) o.params = doc.params; if (doc.units) o.units = doc.units; }
      const s = JSON.stringify(o, plain);
      return s.length > 600000 ? null : s;
    } catch (e) { return null; }
  };
  // every value that differs between two JSON texts, as "path: from → to"
  const diff = (a, b, path, out, depth) => {
    if (out.length >= 40) return;
    if (a === b) return;
    const ta = typeof a, tb = typeof b;
    if (ta === 'number' && tb === 'number') { if (Math.abs(a - b) > 1e-9) out.push(`${path}: ${r(a, 6)} → ${r(b, 6)} (Δ ${b - a > 0 ? '+' : ''}${r(b - a, 6)})`); return; }
    if (a && b && ta === 'object' && tb === 'object' && depth < 7) {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const k of keys) { if (out.length >= 40) return; diff(a[k], b[k], path ? path + (Array.isArray(a) ? '[' + k + ']' : '.' + k) : k, out, depth + 1); }
      return;
    }
    out.push(`${path}: ${short(JSON.stringify(a), 50)} → ${short(JSON.stringify(b), 50)}`);
  };
  const diffText = (before, after) => { const out = []; try { diff(JSON.parse(before), JSON.parse(after), '', out, 0); } catch (e) { /* not comparable */ } return out; };

  // the overall size of everything modeled, the stock, and what they were last time
  let lastDims = null;
  const dimsNow = () => {
    const d = {};
    try {
      const bs = (MODEL && MODEL.bodies) || [];
      if (bs.length) { const bb = bs.reduce((m, b) => [Math.min(m[0], b.bb[0]), Math.min(m[1], b.bb[1]), Math.min(m[2], b.bb[2]), Math.max(m[3], b.bb[3]), Math.max(m[4], b.bb[4]), Math.max(m[5], b.bb[5])], [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]); d.model = sz(bb); d.bodies = bs.map(b => ({ id: b.id, size: sz(b.bb) })); }
      if (typeof UIX !== 'undefined' && UIX.ws === 'cam' && typeof camStock === 'function') { const st = camStock(); if (st) d.stock = [r(st.x1 - st.x0), r(st.y1 - st.y0), r(st.z1 - st.z0)]; }
    } catch (e) { /* nothing modeled yet */ }
    return d;
  };
  const logDims = why => {
    if (!Trace.on) return;
    const d = dimsNow(), p = lastDims || {}, parts = [];
    const delta = (a, b) => b ? ' (Δ ' + a.map((x, i) => (x - b[i] >= 0 ? '+' : '') + r(x - b[i])).join(', ') + ')' : '';
    if (d.model && JSON.stringify(d.model) !== JSON.stringify(p.model)) parts.push(`overall ${dims(d.model)} mm${delta(d.model, p.model)}`);
    if (d.stock && JSON.stringify(d.stock) !== JSON.stringify(p.stock)) parts.push(`stock ${dims(d.stock)} mm${delta(d.stock, p.stock)}`);
    if (parts.length) L('model', `${why}: ${(d.bodies || []).length} bod${(d.bodies || []).length === 1 ? 'y' : 'ies'} · ${parts.join(' · ')}`, d.bodies && d.bodies.length > 1 ? d.bodies : undefined);
    lastDims = d;
  };

  /* ---------------- fields: typing, from → to, and the check afterwards ---------------- */
  const seen = new WeakMap();   // the value a field showed when it was last focused or changed
  const dirty = new WeakMap();  // a field set by script since then: what it showed just before (dev mode and the app set values this way)
  const pending = new WeakMap();
  const entered = new WeakMap();  // what a field held the moment its change event started, before the app's handler could touch it
  const rememberField = el => { if (!seen.has(el) && el.matches && el.matches('input, select, textarea') && el.type !== 'checkbox' && el.type !== 'radio') seen.set(el, valueOf(el)); };
  const fieldDoc = el => !!(el && el.matches && el.matches('input, select, textarea, [contenteditable=""], [contenteditable="true"]'));
  // a value set from script (el.value = …, el.checked = …) is remembered as "from" the first time, until the next change event settles it
  const patchSetter = (proto, prop) => {
    const d = Object.getOwnPropertyDescriptor(proto, prop); if (!d || !d.set || d.set.__dbg) return;
    const set = function (v) { if (Trace.on && !dirty.has(this)) { try { dirty.set(this, prop === 'checked' ? this.checked : valueOf(this)); } catch (e) { /* none */ } } return d.set.call(this, v); };
    set.__dbg = true; Object.defineProperty(proto, prop, { ...d, set });
  };
  patchSetter(HTMLInputElement.prototype, 'value'); patchSetter(HTMLInputElement.prototype, 'checked'); patchSetter(HTMLSelectElement.prototype, 'value'); patchSetter(HTMLTextAreaElement.prototype, 'value');
  function onInput(ev, tag) {
    if (!Trace.on) return;
    const el = ev.target; if (!fieldDoc(el)) return;
    rememberField(el);
    if (el.type === 'checkbox' || el.type === 'radio' || el.tagName === 'SELECT' || el.type === 'range') return;   // these report on change
    L('type', `${tag}${whereOf(el)} › ${labelOf(el)}: “${secret(el) ? '[hidden]' : el.isContentEditable ? short(el.textContent, 80) : el.value}”`, ev.inputType ? { input: ev.inputType, data: secret(el) ? '[hidden]' : ev.data } : undefined);
  }
  function onChange(ev, tag, before, entered) {
    if (!Trace.on) return;
    const el = ev.target; if (!el.matches || !el.matches('input, select, textarea')) return;
    const toggle = el.type === 'checkbox';
    // "to" is what was entered, read before the app's own handler ran (it may clamp or round it); "from" is what the field showed before
    const to = entered === undefined ? valueOf(el) : entered, from = toggle ? !to : dirty.has(el) ? dirty.get(el) : seen.has(el) ? seen.get(el) : '?', unit = unitOf(el), label = labelOf(el);
    dirty.delete(el);
    const isNum = el.type === 'number' || el.type === 'range' || (typeof to === 'string' && to !== '' && isFinite(+to) && typeof from === 'string' && isFinite(+from));
    let what = `${tag}${whereOf(el)} › ${label}: ${from} → ${to}`;
    if (isNum && from !== '?') { const a = +from, b = +to; what += `${unit ? ' ' + unit : ''} (Δ ${b - a >= 0 ? '+' : ''}${r(b - a, 6)})`; if (unit === 'in') what += ` = ${r(a * 25.4, 4)} → ${r(b * 25.4, 4)} mm`; }
    const data = { field: el.id || el.name || undefined, type: el.type }; if (unit) data.unit = unit;
    L('change', what, data);
    seen.set(el, to);
    // what the app did with it: the model / toolpath values that moved, and whether the field still shows what was typed
    setTimeout(() => {
      if (!Trace.on) return;
      // the panel is often rebuilt after a change: look the field up again by its id
      const live = el.isConnected ? el : el.id ? el.ownerDocument.getElementById(el.id) : null;
      if (live) { const now = valueOf(live); seen.set(live, now); dirty.delete(live); if (String(now) === String(to)) L('verify', `${label}: shows ${now}${unit ? ' ' + unit : ''}, as entered${live === el ? '' : ' (panel rebuilt)'}`); else L('verify', `${label}: entered ${to} but the field now shows ${now}${unit ? ' ' + unit : ''}`, { entered: to, shown: now }, 'warn'); }
      else L('verify', `${label}: field is gone after the change (the panel changed)`);
      if (before) { const after = snapshot(), d = after ? diffText(before, after) : []; L('change', d.length ? `model after “${label}” (mm): ${d.length >= 40 ? '40+ values' : d.length + ' value' + (d.length === 1 ? '' : 's')} changed` : `model after “${label}”: no stored value changed`, d.length ? d : undefined); }
      logDims(`after “${label}”`);
    }, 200);
  }
  function onBeforeChange(ev) {
    if (!Trace.on) return;
    const el = ev.target; if (!fieldDoc(el)) return;
    rememberField(el);
    if (ev.type === 'change' && el.matches('input, select, textarea')) entered.set(el, valueOf(el));
    if (!pending.has(el)) { const s = snapshot(); if (s) pending.set(el, s); }
  }
  function onKey(ev, tag) {
    if (!Trace.on) return;
    const el = ev.target; if (!fieldDoc(el)) return;
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(ev.key)) return;
    if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) return;   // typed characters are logged by the input event
    L('type', `${tag}${whereOf(el)} › ${labelOf(el)}: key ${(ev.ctrlKey || ev.metaKey ? 'Ctrl+' : '') + (ev.altKey ? 'Alt+' : '') + (ev.shiftKey && ev.key.length > 1 ? 'Shift+' : '') + (ev.key === ' ' ? 'Space' : ev.key)}`);
  }

  /* ---------------- drags, wheel, scroll, drops ---------------- */
  const input = { what: '', t: 0 };   // the last thing the user did to the view, to say what moved it
  const drags = new Map();
  function onPointerDown(ev, tag) {
    if (!Trace.on) return;
    const btn = ['left', 'middle', 'right'][ev.button] || 'button ' + ev.button;
    drags.set(ev.pointerId, { el: ev.target, x: ev.clientX, y: ev.clientY, t: performance.now(), logT: 0, btn, n: 0, tag });
    input.what = btn + ' drag'; input.t = performance.now();
  }
  function onPointerMove(ev) {
    if (!Trace.on) return;
    const d = drags.get(ev.pointerId); if (!d) return;
    const now = performance.now(); d.n++;
    input.t = now;
    if (now - d.logT < 200 || Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 4) return;
    d.logT = now;
    L('drag', `${d.tag}${d.btn} drag on ${nameEl(d.el)}: moved ${r(ev.clientX - d.x, 1)}, ${r(ev.clientY - d.y, 1)} px so far`, { from: [r(d.x, 1), r(d.y, 1)], at: [r(ev.clientX, 1), r(ev.clientY, 1)] });
  }
  function onPointerUp(ev) {
    const d = drags.get(ev.pointerId); if (!d) return;
    drags.delete(ev.pointerId);
    if (!Trace.on) return;
    const dx = ev.clientX - d.x, dy = ev.clientY - d.y;
    if (Math.hypot(dx, dy) < 4) return;   // a click: Trace already logged it
    L('drag', `${d.tag}${d.btn} drag ended on ${nameEl(d.el)}: ${r(dx, 1)}, ${r(dy, 1)} px in ${Math.round(performance.now() - d.t)} ms (${d.n} moves)`, { from: [r(d.x, 1), r(d.y, 1)], to: [r(ev.clientX, 1), r(ev.clientY, 1)] });
  }
  const wheels = new Map();
  function onWheel(ev, tag) {
    if (!Trace.on) return;
    input.what = ev.ctrlKey ? 'pinch / ctrl-wheel' : 'wheel'; input.t = performance.now();
    const key = ev.target; let w = wheels.get(key);
    if (!w) { w = { n: 0, dy: 0, dx: 0, x: ev.clientX, y: ev.clientY, t: 0 }; wheels.set(key, w); }
    w.n++; w.dy += ev.deltaY; w.dx += ev.deltaX; clearTimeout(w.t);
    w.t = setTimeout(() => { wheels.delete(key); L('drag', `${tag}wheel on ${nameEl(key)}: ${w.n} turn${w.n === 1 ? '' : 's'}, ${r(w.dy, 1)}${w.dx ? ', ' + r(w.dx, 1) : ''} px${ev.ctrlKey ? ' (pinch)' : ''} at ${r(w.x, 1)}, ${r(w.y, 1)}`); }, 150);
  }
  const scrolls = new Map();
  function onScroll(ev, tag) {
    if (!Trace.on) return;
    const el = ev.target === ev.target.ownerDocument || !ev.target.tagName ? null : ev.target; if (!el) return;
    let s = scrolls.get(el);
    if (!s) { s = { x: el.__dbgX || 0, y: el.__dbgY || 0, t: 0 }; scrolls.set(el, s); }
    clearTimeout(s.t);
    s.t = setTimeout(() => { scrolls.delete(el); L('scroll', `${tag}${nameEl(el)} scrolled: top ${r(s.y, 0)} → ${r(el.scrollTop, 0)}, left ${r(s.x, 0)} → ${r(el.scrollLeft, 0)}`); el.__dbgX = el.scrollLeft; el.__dbgY = el.scrollTop; }, 200);
  }
  function onDrop(ev, tag) {
    if (!Trace.on) return;
    const files = ev.dataTransfer && ev.dataTransfer.files ? [...ev.dataTransfer.files].map(f => `${f.name} (${f.type || 'no type'}, ${f.size} bytes)`) : [];
    L('drag', `${tag}drop on ${nameEl(ev.target)}${files.length ? ': ' + files.join(', ') : ''}`);
  }

  /* ---------------- one set of listeners per document (the page and each same-origin frame) ---------------- */
  const hooked = new WeakSet();
  function hookDoc(d, tag) {
    if (!d || hooked.has(d)) return; hooked.add(d);
    const t = tag ? tag + ' › ' : '';
    d.addEventListener('focusin', e => { if (Trace.on && fieldDoc(e.target)) { rememberField(e.target); onBeforeChange(e); L('state', `${t}focus ${whereOf(e.target)} › ${labelOf(e.target)}`); } }, true);
    d.addEventListener('focusout', e => { pending.delete(e.target); if (Trace.on && fieldDoc(e.target)) L('state', `${t}blur ${whereOf(e.target)} › ${labelOf(e.target)}`); }, true);
    d.addEventListener('input', e => onInput(e, t), true);
    d.addEventListener('beforeinput', onBeforeChange, true);
    d.addEventListener('change', onBeforeChange, true);   // capture runs before the app's own handler: take the "before" picture here…
    d.addEventListener('change', e => { const b = pending.get(e.target) || null; pending.delete(e.target); const typed = entered.get(e.target); entered.delete(e.target); setTimeout(() => onChange(e, t, b, typed), 0); }, false);   // …and report once the app has handled it
    d.addEventListener('keydown', e => onKey(e, t), true);
    d.addEventListener('pointerdown', e => { onBeforeChange(e); onPointerDown(e, t); }, true);
    d.addEventListener('pointermove', onPointerMove, true);
    d.addEventListener('pointerup', onPointerUp, true); d.addEventListener('pointercancel', onPointerUp, true);
    d.addEventListener('wheel', e => onWheel(e, t), { capture: true, passive: true });
    d.addEventListener('scroll', e => onScroll(e, t), true);
    d.addEventListener('drop', e => onDrop(e, t), true);
    d.addEventListener('dragstart', e => { if (Trace.on) L('drag', `${t}drag start on ${nameEl(e.target)}`); }, true);
    d.addEventListener('contextmenu', e => { if (Trace.on) L('click', `${t}right-click on ${nameEl(e.target)}`, { at: [e.clientX, e.clientY] }); }, true);
    d.addEventListener('visibilitychange', () => L('page', `${t}page ${d.hidden ? 'hidden' : 'visible'}`));
    if (tag) {   // frames: Trace's own click log only watches the page
      d.addEventListener('click', e => { if (Trace.on) L('click', `${t}${nameEl(e.target.closest ? e.target.closest('button, a, [role=button], label, select, input, canvas') || e.target : e.target)}`, { at: [e.clientX, e.clientY] }); }, true);
      d.addEventListener('keydown', e => { if (Trace.on && !fieldDoc(e.target) && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) L('key', t + (e.ctrlKey || e.metaKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (e.key === ' ' ? 'Space' : e.key)); }, true);
    }
  }
  const FRAMES = { d2dFrame: '2D Drawing', houseFrame: 'House Design', gfxFrame: 'Graphics', ssgFrame: 'Setup Sheet' };
  function hookFrames() {
    document.querySelectorAll('iframe').forEach(f => {
      let d = null; try { d = f.contentDocument; } catch (e) { /* cross-origin (file://) */ }
      if (d && d.body) hookDoc(d, FRAMES[f.id] || f.id || 'frame');
    });
  }
  document.addEventListener('load', e => { if (e.target && e.target.tagName === 'IFRAME') { L('page', `frame loaded: ${FRAMES[e.target.id] || e.target.id || 'frame'}`); hookFrames(); watchSizes(); } }, true);

  /* ---------------- sizes: the window, canvases, panels, dialogs, frames ---------------- */
  const sizes = new WeakMap();
  let ro = null;
  const ids = ['ov', 'panel', 'browser', 'toolbar', 'modal', 'modalCard', 'simbar', 'ctxmenu', 'tl'];
  function watchSizes() {
    if (typeof ResizeObserver === 'undefined') return;
    if (!ro) ro = new ResizeObserver(entries => {
      if (!Trace.on) return;
      for (const e of entries) {
        const el = e.target, w = r(e.contentRect.width, 1), h = r(e.contentRect.height, 1), p = sizes.get(el);
        sizes.set(el, [w, h]);
        if (!p || (p[0] === w && p[1] === h)) continue;
        const own = el.ownerDocument.defaultView !== window ? '(frame) ' : '';
        L('resize', `${own}${nameEl(el)}: ${p[0]} × ${p[1]} → ${w} × ${h} px (Δ ${r(w - p[0], 1)}, ${r(h - p[1], 1)})`);
        if (el.id === 'ov' || el.tagName === 'CANVAS') input.what = input.what || 'resize';
      }
    });
    const add = el => { if (el && !sizes.has(el)) { sizes.set(el, null); ro.observe(el); } };
    for (const id of ids) add(document.getElementById(id));
    document.querySelectorAll('canvas, iframe').forEach(add);
    document.querySelectorAll('iframe').forEach(f => { try { const d = f.contentDocument; if (d) { const FRO = f.contentWindow.ResizeObserver; if (FRO) { if (!f.__dbgRo) { f.__dbgRo = new FRO(entries => { if (!Trace.on) return; for (const e of entries) { const el = e.target, w = r(e.contentRect.width, 1), h = r(e.contentRect.height, 1), p = sizes.get(el); sizes.set(el, [w, h]); if (p && (p[0] !== w || p[1] !== h)) L('resize', `(${FRAMES[f.id] || 'frame'}) ${nameEl(el)}: ${p[0]} × ${p[1]} → ${w} × ${h} px (Δ ${r(w - p[0], 1)}, ${r(h - p[1], 1)})`); } }); } d.querySelectorAll('canvas').forEach(c => { if (!sizes.has(c)) { sizes.set(c, null); f.__dbgRo.observe(c); } }); } } } catch (e) { /* cross-origin */ } });
  }
  let lastWin = null;
  addEventListener('resize', () => {
    if (!Trace.on) return;
    const cur = [innerWidth, innerHeight, r(devicePixelRatio, 3)];
    L('resize', `window: ${lastWin ? lastWin[0] + ' × ' + lastWin[1] : '?'} → ${cur[0]} × ${cur[1]} px · pixel ratio ${lastWin ? lastWin[2] : '?'} → ${cur[2]}`);
    lastWin = cur;
  });

  /* ---------------- the 3D view: zoom, pan, orbit, canvas size ---------------- */
  let v0 = null, vTimer = 0, vSig = '';
  const vstate = () => ({ t: view.target.toArray(), q: view.quat.toArray(), h: view.viewH, w: W, hh: H, anim: !!view.anim });
  const look = q => { const b = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(q[0], q[1], q[2], q[3])); return { az: Math.atan2(b.x, b.z) * 180 / Math.PI, el: Math.asin(Math.max(-1, Math.min(1, b.y))) * 180 / Math.PI }; };
  function viewLog() {
    vTimer = 0;
    if (!Trace.on || !v0) return;
    const c = vstate(), p = v0; v0 = c;
    const parts = [], data = {};
    if (Math.abs(c.h / p.h - 1) > 1e-4) { parts.push(`zoom: view height ${r(p.h, 2)} → ${r(c.h, 2)} mm (×${r(c.h / p.h, 4)}), ${r(p.hh / p.h, 3)} → ${r(c.hh / c.h, 3)} px per mm`); }
    const dt = Math.hypot(c.t[0] - p.t[0], c.t[1] - p.t[1], c.t[2] - p.t[2]);
    if (dt > 1e-4 * Math.max(1, c.h)) { parts.push(`pan: target (${p.t.map(x => r(x, 2))}) → (${c.t.map(x => r(x, 2))}) mm, moved ${r(dt, 3)} mm`); }
    const dq = Math.abs(p.q[0] * c.q[0] + p.q[1] * c.q[1] + p.q[2] * c.q[2] + p.q[3] * c.q[3]), ang = 2 * Math.acos(Math.min(1, dq)) * 180 / Math.PI;
    if (ang > 1e-3) { const a = look(p.q), b = look(c.q); parts.push(`orbit: ${r(ang, 2)}° — azimuth ${r(a.az, 1)}° → ${r(b.az, 1)}°, elevation ${r(a.el, 1)}° → ${r(b.el, 1)}°`); }
    if (c.w !== p.w || c.hh !== p.hh) parts.push(`canvas ${p.w} × ${p.hh} → ${c.w} × ${c.hh} px`);
    if (!parts.length) return;
    data.visible = `${r(c.h * c.w / c.hh, 2)} × ${r(c.h, 2)} mm`;
    const by = performance.now() - input.t < 500 ? input.what : c.anim || p.anim ? 'animated view change' : 'the app';
    L('view', `${parts.join(' · ')} [by ${by}]`, data);
  }
  function viewTick() {
    if (!Trace.on) return;
    try {
      const sig = view.quat.x + ',' + view.quat.y + ',' + view.quat.z + ',' + view.quat.w + ',' + view.target.x + ',' + view.target.y + ',' + view.target.z + ',' + view.viewH + ',' + W + ',' + H;
      if (!v0) { v0 = vstate(); vSig = sig; return; }
      if (sig === vSig) return;
      vSig = sig;
      // while it keeps moving, report every ~150 ms; when it settles, report the rest
      if (!vTimer) vTimer = setTimeout(viewLog, 150);
    } catch (e) { /* the view does not exist yet */ }
  }
  let tickT = 0;
  if (typeof window.frame === 'function') { const f0 = window.frame; window.frame = function () { const r0 = f0.apply(this, arguments); viewTick(); if (Trace.on && performance.now() - tickT > 100) { tickT = performance.now(); stateTick(); panelTick(); } return r0; }; }

  /* ---------------- what the app is doing: workspace, command, sketch, selection, panels ---------------- */
  let st = null;
  const stateNow = () => {
    const o = {};
    try { o.workspace = UIX.ws; o.tab = UIX.tab; } catch (e) { /* not ready */ }
    try { o.command = CMD ? (CMD.type === 'feat' ? 'feature ' + CMD.kind + (CMD.step ? ' (' + CMD.step + ')' : '') : CMD.type) : 'none'; } catch (e) { /* none */ }
    try { o.sketch = S.sk ? S.sk.name : 'none'; o.tool = S.sk ? S.tool : 'none'; o.selected = S.sel ? S.sel.size : 0; } catch (e) { /* none */ }
    try { o.selection3D = (sel3D ? sel3D.kind || 'yes' : 'none') + (selProfiles.length ? ' + ' + selProfiles.length + ' profile(s)' : ''); } catch (e) { /* none */ }
    try { if (UIX.ws === 'cam') o.manufacture = CAMUI.view + (CAMUI.op ? ' op ' + CAMUI.op : ''); } catch (e) { /* none */ }
    try { o.simulation = SIM.on ? (SIM.playing ? 'playing' : 'paused') : 'off'; } catch (e) { /* none */ }
    try { o.units = inches() ? 'in' : 'mm'; o.history = hist.cur + '/' + (hist.states.length - 1); o.features = doc.features.length; } catch (e) { /* none */ }
    return o;
  };
  const OPEN = { command: 'none', sketch: 'none', simulation: 'off' };
  function stateTick() {
    if (!Trace.on) return;
    const c = stateNow(); if (!st) { st = c; return; }
    for (const k of Object.keys(c)) {
      if (c[k] === st[k]) continue;
      if (k === 'history') { st[k] = c[k]; continue; }   // history steps are logged with their own label
      const was = st[k] === undefined ? 'none' : st[k], now = c[k];
      const verb = k in OPEN ? (now === OPEN[k] ? 'exited' : was === OPEN[k] ? 'opened' : 'changed') : 'changed';
      L('state', `${k} ${verb}: ${was} → ${now}`, k === 'workspace' ? undefined : undefined);
    }
    st = c;
  }
  // the side panel, dialogs, menus and toasts
  let panelTitle = null, modalOpen = false, menuOpen = false, lastToast = '';
  function panelTick() {
    if (!Trace.on) return;
    const p = document.getElementById('panel'), h = p && p.querySelector('h2, h3, .pn-head');
    const t = p && !p.hidden && p.offsetWidth ? (h ? short(h.textContent, 50) : 'untitled') : 'closed';
    if (panelTitle !== null && t !== panelTitle) L('panel', t === 'closed' ? `side panel closed (was “${panelTitle}”)` : panelTitle === 'closed' ? `side panel opened: “${t}”` : `side panel: “${panelTitle}” → “${t}”`);
    panelTitle = t;
    const m = document.getElementById('modal'), mo = !!m && !m.hidden;
    if (mo !== modalOpen) { const c = m && m.querySelector('h1, h2, h3, .title'); L('panel', mo ? `dialog opened${c ? ': “' + short(c.textContent, 50) + '”' : ''}` : 'dialog closed'); modalOpen = mo; }
    const x = document.getElementById('ctxmenu'), xo = !!x && !x.hidden;
    if (xo !== menuOpen) { L('panel', xo ? `menu opened (${x.querySelectorAll('button, [data-i], li').length} items)` : 'menu closed'); menuOpen = xo; }
    const to = document.getElementById('toast'), tt = to ? short(to.textContent, 120) : '';
    if (tt && tt !== lastToast) L('panel', `toast: ${tt}`);
    lastToast = tt;
  }

  /* ---------------- history steps: what each one changed ---------------- */
  if (typeof window.record === 'function') {
    const rec0 = window.record;
    window.record = function (label, before) {
      const out = rec0.apply(this, arguments);
      if (Trace.on && typeof before === 'string') {
        try {
          const a = JSON.parse(before), b = typeof doc !== 'undefined' ? doc : null, o = [];
          if (b) {
            const fa = new Map((a.features || []).map(f => [f.id, f])), fb = new Map((b.features || []).map(f => [f.id, f]));
            for (const [id, f] of fb) { if (!fa.has(id)) o.push(`added ${f.name || f.type || '#' + id}`); else diff(fa.get(id), f, `${f.name || f.type || '#' + id}`, o, 0); }
            for (const [id, f] of fa) if (!fb.has(id)) o.push(`removed ${f.name || f.type || '#' + id}`);
            const ca = { ...(a.cam || {}) }, cb = { ...(b.cam || {}) }; diff(ca, cb, 'manufacture', o, 0);
            diff(a.params || {}, b.params || {}, 'parameters', o, 0);
          }
          L('change', `history “${label}” (mm): ${o.length ? o.length >= 40 ? '40+ values changed' : o.length + ' change' + (o.length === 1 ? '' : 's') : 'nothing stored changed'}`, o.length ? o : undefined);
        } catch (e) { /* the before picture is not comparable */ }
      }
      return out;
    };
  }
  // every model rebuild: the bodies and their size
  if (typeof window.applyModel === 'function') {
    const am0 = window.applyModel;
    window.applyModel = function () { const out = am0.apply(this, arguments); logDims('model rebuilt'); return out; };
  }
  if (typeof window.loadDoc === 'function') {
    const ld0 = window.loadDoc;
    window.loadDoc = function (d) {
      const out = ld0.apply(this, arguments);
      if (Trace.on) { try { L('state', `document loaded: ${(d && d.features ? d.features.length : 0)} feature(s)${d && d.cam && d.cam.ops ? ', ' + d.cam.ops.length + ' toolpath(s)' : ''}`); } catch (e) { /* none */ } lastDims = null; logDims('document loaded'); }
      return out;
    };
  }

  /* ---------------- switching on and off ---------------- */
  let timer = 0;
  function start() {
    hookDoc(document, '');
    hookFrames(); watchSizes();
    lastWin = [innerWidth, innerHeight, r(devicePixelRatio, 3)];
    st = null; v0 = null; vSig = ''; lastDims = null; panelTitle = null; lastToast = (document.getElementById('toast') || {}).textContent || '';
    stateTick(); viewTick(); panelTick();
    if (!timer) timer = setInterval(() => { hookFrames(); watchSizes(); stateTick(); panelTick(); if (!v0) viewTick(); }, 150);
    try {
      const nav = performance.getEntriesByType('navigation')[0], js = performance.getEntriesByType('resource').filter(e => /\.js(\?|$)/.test(e.name)).map(e => `${e.name.split('/').pop().split('?')[0]} ${Math.round(e.duration)} ms`);
      L('page', `page: ${innerWidth} × ${innerHeight} px · pixel ratio ${r(devicePixelRatio, 2)} · ${nav ? 'loaded in ' + Math.round(nav.loadEventEnd || nav.duration) + ' ms' : ''} · ${js.length} scripts`, js.length ? js : undefined);
    } catch (e) { /* timing not available */ }
    logDims('log on');
    L('state', 'state', stateNow());
  }
  function stop() { clearInterval(timer); timer = 0; clearTimeout(vTimer); vTimer = 0; drags.clear(); }
  Trace.hooks.push(on => { if (on) start(); else stop(); });
  window.__debugTrace = { snapshot, diffText, dimsNow, stateNow };
  if (Trace.on) start();
})();
