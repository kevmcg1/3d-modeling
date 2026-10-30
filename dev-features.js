// ═══════════════════════════════════════════════════════════════════
//  Dev mode: a check for every feature added in the CAM-parity and look-and-feel work, and a visual-intelligence layer so the tool can
//  judge what the screen actually shows, not only what the code says. They join the dev panel's "Modeling & page flows" (backtick, then
//  run) and can be run on their own: window.__devFeatures.run() returns one result per flow.
//
//    Section view            planes on every axis, the cut face is crosshatched with an outline, flip, pick, units, sweep in and out, CAM
//    Feature animation       extrude grows, revolve turns, the rest dissolve, copies cleaned up, the model ends exactly as unanimated
//    Icon tooltips + motion  every icon has a CSS label and a motion, no native tooltips, labels fit the window
//    Outlined buttons        every button in every workspace and both themes is an outline
//    Defaults                dark and light themes, inches with metric in parentheses, American spellings
//    Cutter compensation     G41 / G42 / G40 audited line by line for every controller, and the contour checked against the chain
//    Post options            Z home before tool changes, tool list, coolant modes and the per-operation override
//    Materials               every material retunes and posts a clean program
//    Auto lock               Auto Program and Auto Detect are locked "coming soon", manual toolpaths unaffected
//    Contour passes          rough passes, spacing, lead radius, tabs on the final pass only
//    UX audit                contrast, clipped text, overlapping controls, tiny targets, unlabeled icons, in both themes
//    Visual intelligence     the 3D view is framed and sharp, the cube is drawn, colors differ between themes
//
//  Visual intelligence helpers (VI): read the 3D view back as pixels (what is drawn, in which colors), measure text contrast against the
//  color really behind it, find text that is cut off, controls drawn over one another and targets too small to hit, and use the sharpness
//  grade from blur-check.js. Features that are locked for free users (Manufacture) are checked with the lock lifted for the length of the
//  check only; Auto Program stays locked, as shipped.
// ═══════════════════════════════════════════════════════════════════
(function () {
  if (!window.__dev || !window.__dev.FLOWS) return;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const until = async (fn, ms) => { const t0 = Date.now(); while (!fn() && Date.now() - t0 < ms) await sleep(60); return !!fn(); };
  const stopped = () => !!(window.__dev.run && window.__dev.run.stop);
  const FX_OFF = () => { const was = window.DATUM_NOFX; window.DATUM_NOFX = true; return () => { window.DATUM_NOFX = was; }; };
  const settle = async () => { await until(() => !modelReq.inflight && !(window.FEATFX && FEATFX.active), 15000); await sleep(150); await until(() => !modelReq.inflight && !(window.FEATFX && FEATFX.active), 15000); };
  const lift = async fn => { const was = window.CAM_LOCK && CAM_LOCK.active; if (was) CAM_LOCK.set(false); try { return await fn(); } finally { if (was) CAM_LOCK.set(true); } };
  const load = async name => { const s = SAMPLES.find(x => x.name === name) || SAMPLES[0]; try { if (S.sk) exitSketchMode(false); if (CMD) cancelCmd(); if (SIM.on) simStop(); } catch (e) { /* none */ } loadDoc(s.make(), 'dev'); await settle(); await sleep(400); };
  const theme = t => document.documentElement.setAttribute('data-theme', t);
  const curTheme = () => document.documentElement.getAttribute('data-theme');
  const L = (a, b, c, d, id) => ({ id, type: 'line', a: { x: a, y: b }, b: { x: c, y: d } });
  const box = (id, x0, y0, x1, y1, pl) => ({ id, type: 'sketch', name: 'Sketch' + id, ref: { k: 'origin', w: pl || 'XY' }, plane: ORIGIN_PLANES[pl || 'XY'], vis: true, ents: [L(x0, y0, x1, y0, id * 10 + 1), L(x1, y0, x1, y1, id * 10 + 2), L(x1, y1, x0, y1, id * 10 + 3), L(x0, y1, x0, y0, id * 10 + 4)] });
  const baseDoc = () => ({ features: [box(1, 0, 0, 20, 10), { id: 6, type: 'extrude', name: 'Extrude1', sketch: 1, pts: [{ x: 10, y: 5 }], dist: 5, mode: 'one', op: 'new' }], next: 40 });

  /* ───────────── visual intelligence ───────────── */
  const VI = {
    // draw the 3D scene once and read it back: how many pixels are drawn, their mean color, and how many are near each given [r, g, b, tolerance]
    pixels(near, win) {
      if (window.SECTION) SECTION.tick(); renderer.setRenderTarget(null); renderer.setScissorTest(false); renderer.setViewport(0, 0, W, H); renderer.clear(); renderer.render(scene, camera);
      const gl = renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, buf = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const cnt = (near || []).map(() => 0); let n = 0, sr = 0, sg = 0, sb = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4; if (buf[i + 3] <= 8) continue; n++; sr += buf[i]; sg += buf[i + 1]; sb += buf[i + 2];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        (near || []).forEach((c, k) => { if (Math.hypot(buf[i] - c[0], buf[i + 1] - c[1], buf[i + 2] - c[2]) < (c[3] || 40)) cnt[k]++; });
      }
      return { n, w, h, near: cnt, mean: n ? [sr / n, sg / n, sb / n].map(Math.round) : null, box: n ? [x0 / w, y0 / h, (x1 + 1) / w, (y1 + 1) / h] : null };
    },
    lum(rgb) { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); },
    // rgb() / rgba(), and the color(srgb r g b / a) form the browser gives for color-mix() results (0 to 1, scaled to 0 to 255)
    parse(c) {
      if (!c) return null; const srgb = /^color\(srgb/.test(c), m = c.match(/-?[\d.]+(?:e-?\d+)?/g); if (!m || m.length < 3) return null;
      const k = srgb ? 255 : 1; return { rgb: m.slice(0, 3).map(v => Math.round(+v * k)), a: m.length > 3 ? +m[3] : 1 };
    },
    ratio(a, b) { const l1 = VI.lum(a), l2 = VI.lum(b), hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); },
    // the color really behind an element: the layers above the first opaque one, composited over it (null when an image or gradient is in the way)
    backdrop(el) {
      const layers = []; let base = null;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const cs = getComputedStyle(n), p = VI.parse(cs.backgroundColor);
        if (cs.backgroundImage !== 'none') return null;
        if (p && p.a > 0.02) { if (p.a > 0.98) { base = p.rgb; break; } layers.push(p); }
      }
      if (!base) { const h = VI.parse(getComputedStyle(document.documentElement).backgroundColor); base = h && h.a > 0.98 ? h.rgb : (curTheme() === 'light' ? [255, 255, 255] : [20, 22, 27]); }
      let rgb = base.slice(); for (const l of layers.reverse()) rgb = rgb.map((v, i) => v * (1 - l.a) + l.rgb[i] * l.a);
      return rgb;
    },
    visible(el) { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.1 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; },
    name(el) { return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).filter(c => !/^(on|ctip|prem)/.test(c)).slice(0, 2).join('.') : '') + ' "' + (el.getAttribute('aria-label') || el.textContent.trim()).replace(/\s+/g, ' ').slice(0, 22) + '"'; },
    // text elements whose text color against the real backdrop is too weak (WCAG: 4.5 for normal text, 3 for large or bold)
    contrast(root) {
      const bad = [], warn = []; let n = 0;
      const els = [...(root || document).querySelectorAll('button, a, label, span, p, h1, h2, h3, h4, b, li, dt, dd, td, th, summary, .field > span, input, select')].filter(e => VI.visible(e) && [...e.childNodes].some(t => t.nodeType === 3 && t.textContent.trim().length > 1) || /^(INPUT|SELECT)$/.test(e.tagName) && VI.visible(e));
      for (const el of els.slice(0, 500)) {
        const cs = getComputedStyle(el), fg = VI.parse(cs.color), bg = VI.backdrop(el); if (!fg || !bg || fg.a < 0.05) continue; n++;
        const eff = fg.rgb.map((v, i) => v * fg.a + bg[i] * (1 - fg.a)), r = VI.ratio(eff, bg), large = parseFloat(cs.fontSize) >= 18 || (parseFloat(cs.fontSize) >= 14 && +cs.fontWeight >= 700);
        if (r < (large ? 2.2 : 2.6)) bad.push(VI.name(el) + ' ' + r.toFixed(1) + ':1'); else if (r < (large ? 3 : 4.5)) warn.push(VI.name(el) + ' ' + r.toFixed(1) + ':1');
      }
      return { n, bad, warn };
    },
    // text that is cut off (not by an ellipsis the person can read in the tooltip)
    clipped(root) {
      const bad = [];
      for (const el of (root || document).querySelectorAll('button, label, span, p, h1, h2, h3, b, li, td, th, .nm, .sub')) {
        if (!VI.visible(el) || !el.textContent.trim() || el.children.length > 2) continue; const cs = getComputedStyle(el);
        if (cs.overflow !== 'visible' && cs.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && cs.whiteSpace === 'nowrap') bad.push(VI.name(el) + ' ' + el.scrollWidth + ' px of text in ' + el.clientWidth);
      }
      return bad;
    },
    // controls drawn over one another (siblings of different parents overlapping by a quarter or more of the smaller one)
    overlaps(root) {
      const els = [...(root || document).querySelectorAll('button, input, select, [role="button"]')].filter(e => VI.visible(e) && !e.closest('#tipcard, #ctxmenu, [hidden]') && getComputedStyle(e).position !== 'fixed'), bad = [];
      const rects = els.map(e => e.getBoundingClientRect());
      for (let i = 0; i < els.length && bad.length < 12; i++) for (let j = i + 1; j < els.length; j++) {
        if (els[i].contains(els[j]) || els[j].contains(els[i]) || els[i].parentElement === els[j].parentElement && false) continue;
        const a = rects[i], b = rects[j], w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 3 && h > 3 && w * h > 0.25 * Math.min(a.width * a.height, b.width * b.height)) bad.push(VI.name(els[i]) + ' over ' + VI.name(els[j]));
      }
      return bad;
    },
    tiny(root) { const bad = []; for (const e of (root || document).querySelectorAll('button, [role="button"], input[type="checkbox"], input[type="radio"], select')) { if (!VI.visible(e)) continue; const r = e.getBoundingClientRect(); if (r.width < 18 || r.height < 18) bad.push(VI.name(e) + ' ' + Math.round(r.width) + '×' + Math.round(r.height)); } return bad; },
    unlabeled(root) { const bad = []; for (const e of (root || document).querySelectorAll('button, [role="button"]')) { if (!VI.visible(e) || e.closest('#tipcard')) continue; if (!e.textContent.trim() && !e.getAttribute('aria-label') && !e.dataset.tip && !e.dataset.ctip && !e.title) bad.push(VI.name(e)); } return bad; },
    framing() { const p = VI.pixels(); return { ...p, ok: p.n > 0 && p.box && p.box[0] >= 0 && p.box[2] <= 1 && (p.n / (p.w * p.h)) > 0.02 }; },
  };
  window.VI = VI;

  const f = [];
  const flow = (name, run) => f.push({ name, run, feature: true });

  /* ───────────── 1. section view ───────────── */
  flow('Section view: planes, crosshatched cut face with outline, flip, pick, units, sweep, Manufacture', async c => {
    if (!window.SECTION) { c.fail('the section view is missing'); return; }
    const off = FX_OFF(); try {
      await load('Pocketed plate'); fitAll(false); await sleep(900); SECTION.close({ instant: true });
      const whole = VI.pixels().n; c.metric('pixels drawn, whole model', whole);
      document.getElementById('btnSection').click(); await sleep(900);
      if (!document.getElementById('secBar') || !SECTION.on) { c.fail('the Section button did not open the bar'); return; } c.ok('the Section button opens the bar');
      for (const ax of ['x', 'y', 'z']) {
        const counts = [];
        for (const t of [0.15, 0.5, 0.85]) { SECTION.set({ axis: ax, flip: false, cap: false }); const [lo, hi] = SECTION.state.range; SECTION.set({ d: lo + (hi - lo) * t }); counts.push(VI.pixels().n); }
        const mono = counts[0] <= counts[1] * 1.02 && counts[1] <= counts[2] * 1.02 && counts[0] < counts[2];
        if (mono) c.ok(ax.toUpperCase() + ' axis: more of the model remains as the plane moves up (' + counts.join(' < ') + ' px)'); else c.fail(ax.toUpperCase() + ' axis: the cut does not grow with the plane position (' + counts.join(', ') + ')');
        SECTION.set({ d: SECTION.state.range[1], flip: false }); const past = VI.pixels().n; if (Math.abs(past - whole) / whole > 0.03) c.fail(ax.toUpperCase() + ': a plane at the far end still removes ' + Math.round((1 - past / whole) * 100) + '% of the model');
        SECTION.set({ flip: true, d: SECTION.state.range[0] }); const flipEnd = VI.pixels().n; if (Math.abs(flipEnd - whole) / whole > 0.03) c.fail(ax.toUpperCase() + ' flipped: a plane at the near end still removes ' + Math.round((1 - flipEnd / whole) * 100) + '% of the model');
        SECTION.set({ flip: false });
      }
      for (const th of ['dark', 'light']) {
        theme(th); SECTION.set({ axis: 'x', flip: false, cap: true }); SECTION.set({ d: (SECTION.state.range[0] + SECTION.state.range[1]) / 2 + 12 }); await sleep(250);
        const pal = th === 'dark' ? { fill: [0x17, 0x28, 0x3d], line: [0x7f, 0xb1, 0xe6], edge: [0xea, 0xf3, 0xff] } : { fill: [0xf6, 0xf8, 0xfb], line: [0x27, 0x38, 0x4f], edge: [0x0d, 0x16, 0x22] };
        const p = VI.pixels([[...pal.fill, 14], [...pal.line, 40], [...pal.edge, 22]]), [fill, line, edge] = p.near, share = line / Math.max(1, line + fill);
        if (fill > 800 && line > 150 && share > 0.04 && share < 0.5 && edge > 60) c.ok(th + ' theme: the cut face is crosshatched (' + Math.round(share * 100) + '% hatch lines) with an outline (' + edge + ' px)'); else c.fail(th + ' theme: the cut face is not a proper section (fill ' + fill + ', hatch ' + line + ', outline ' + edge + ')');
        SECTION.set({ cap: false }); const q = VI.pixels([[...pal.fill, 14], [...pal.line, 40]]); if (q.near[0] > fill * 0.2) c.fail(th + ' theme: the hatch stays drawn with Hatch off'); SECTION.set({ cap: true });
      }
      theme('dark');
      // the controls
      const nm = document.getElementById('secNum'); SECTION.set({ axis: 'z' }); nm.value = '0.25'; nm.dispatchEvent(new Event('input', { bubbles: true })); await sleep(100);
      if (Math.abs(SECTION.state.d - 6.35) < 0.02) c.ok('typing 0.25 in the field (inches) puts the plane at 6.35 mm'); else c.fail('the typed position is wrong: ' + SECTION.state.d);
      SECTION.set({ d: SECTION.state.range[1] }); SECTION.pick(true);
      const v = new THREE.Vector3(-30, 7, 0).project(camera), r = glCanvas.getBoundingClientRect(), px = r.left + (v.x + 1) / 2 * r.width, py = r.top + (1 - v.y) / 2 * r.height;
      ov.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: px, clientY: py, pointerId: 5, pointerType: 'mouse', button: 0, buttons: 1 })); await sleep(250);
      if (!SECTION.state.picking && SECTION.state.d < SECTION.state.range[1] - 0.5) c.ok('Pick on model puts the plane at the clicked point (' + SECTION.state.d.toFixed(2) + ' mm)'); else c.warn('Pick on model did not move the plane (is the point on the model at this zoom?)');
      SECTION.pick(false);
      // the sweep in and out
      SECTION.close({ instant: true }); SECTION.open({ axis: 'x', flip: false }); const mid = await new Promise(rs => setTimeout(() => rs(SECTION.state), 180));
      if (mid.animating && mid.shown !== mid.d) c.ok('opening sweeps the plane in'); else c.fail('opening does not sweep (animating ' + mid.animating + ')');
      await sleep(900); SECTION.close(); await sleep(150); const out = SECTION.state; await until(() => !document.getElementById('secBar'), 2500);
      if (!SECTION.on && !document.getElementById('secBar') && renderer.clippingPlanes.length === 0) c.ok('closing sweeps the plane out and removes the bar'); else c.fail('closing left the bar or the plane behind');
      // the view cube is never cut
      SECTION.open({ instant: true, axis: 'x' }); SECTION.set({ d: SECTION.state.range[0] }); const cutAll = VI.pixels().n; if (cutAll > whole * 0.3) c.fail('a plane at the near end leaves ' + Math.round(cutAll / whole * 100) + '% of the model drawn'); SECTION.close({ instant: true });
      // Manufacture: stock, vise and toolpaths are cut too
      await lift(async () => {
        setWorkspace('cam'); await sleep(1500); camAddOp('face'); camAddOp('pocket'); camAddOp('contour'); await sleep(2500);
        const w2 = VI.pixels().n; SECTION.open({ instant: true, axis: 'x' }); const st = camStock(), [lo, hi] = SECTION.state.range;
        if (lo <= st.x0 + 1e-6 && hi >= st.x1 - 1e-6) c.ok('Manufacture: the range covers the stock'); else c.fail('Manufacture: the range does not cover the stock (' + lo + '..' + hi + ' vs ' + st.x0 + '..' + st.x1 + ')');
        SECTION.set({ d: lo + 5 }); const sl = VI.pixels().n; SECTION.set({ d: hi }); const all = VI.pixels().n;
        if (sl < w2 * 0.6 && all > w2 * 0.85) c.ok('Manufacture: the plane cuts the stock, vise and toolpaths (' + sl + ' / ' + w2 + ' px at the left end)'); else c.fail('Manufacture: the plane does not cut the scene (' + sl + ', ' + all + ' of ' + w2 + ')');
        SECTION.close({ instant: true }); setWorkspace('design'); await sleep(700);
      });
    } finally { off(); SECTION.close({ instant: true }); theme('dark'); }
  });

  /* ───────────── 2. feature animation ───────────── */
  flow('Feature animation: extrude grows, revolve turns, the rest dissolve, nothing left behind', async c => {
    if (!window.FEATFX) { c.fail('feature animation is missing'); return; }
    const was = window.DATUM_NOFX; window.DATUM_NOFX = false;
    const fresh = async () => { loadDoc(baseDoc(), 'dev'); regen(false); await settle(); };
    const start = async () => { await until(() => FEATFX.active, 6000); };
    try {
      await fresh(); const c0 = FEATFX.count;
      doc.features.push(box(30, 25, 0, 35, 10), { id: 31, type: 'extrude', name: 'Extrude2', sketch: 30, pts: [{ x: 30, y: 5 }], dist: 8, mode: 'one', op: 'new' }); regen(false); await start();
      const gaps = []; let last = performance.now(), consts = [];
      for (let i = 0; i < 8 && FEATFX.active; i++) { const R = FEATFX.state.run; if (R && R.behind) consts.push(R.behind.constant); await new Promise(r => requestAnimationFrame(() => { const t = performance.now(); gaps.push(t - last); last = t; r(); })); await sleep(60); }
      if (FEATFX.mode === 'linear' || consts.length) c.ok('an extrude plays as a growth along its direction'); else c.fail('an extrude did not play as a growth (mode ' + FEATFX.mode + ')');
      if (consts.length >= 3 && consts.every((v, i) => i === 0 || v >= consts[i - 1] - 1e-9) && consts[consts.length - 1] > consts[0]) c.ok('the sweep is steady'); else c.warn('the sweep did not advance steadily: ' + consts.map(v => v.toFixed(1)).join(', '));
      const worst = Math.max(0, ...gaps); if (worst > 400 && /swiftshader|llvmpipe|software/i.test(String((renderer.getContext().getParameter(renderer.getContext().VERSION) || '')) + (navigator.userAgent))) c.warn('a frame took ' + Math.round(worst) + ' ms while it played (software renderer)'); else if (worst > 400) c.fail('a frame took ' + Math.round(worst) + ' ms while it played');
      await settle(); if (bodyMeshes.length === 2 && bodyMeshes.every(m => m.group.visible) && !scene.children.some(x => x.name === 'fx') && !FEATFX.active) c.ok('after it, both bodies are shown whole and the copies are gone'); else c.fail('the extrude left a half state (bodies ' + bodyMeshes.length + ', copies ' + scene.children.filter(x => x.name === 'fx').length + ')');
      if (FEATFX.count > c0) c.ok('the animation count rose (' + (FEATFX.count - c0) + ')'); else c.fail('no animation was started');
      await fresh();
      const sk = box(30, 30, 0, 40, 10, 'XZ'); sk.ents.push(L(0, 0, 0, 10, 391)); doc.features.push(sk, { id: 31, type: 'revolve', name: 'Revolve1', sketch: 30, pts: [{ x: 35, y: 5 }], axis: { k: 'ent', sk: 30, ent: 391 }, angle: 360, mode: 'one', op: 'new' }); regen(false); await start();
      const seen = new Set(); let mode = FEATFX.mode;
      for (let i = 0; i < 12 && FEATFX.active; i++) { const fx = scene.children.find(x => x.name === 'fx'); if (fx) fx.traverse(o => { if (o.material && o.material.clippingPlanes && o.material.clippingPlanes.length === 2) seen.add(o.material.clipIntersection); }); await sleep(80); }
      if (mode === 'angular' && seen.size) c.ok('a revolve plays as a wedge turning round its axis (' + [...seen].map(v => v ? 'wide' : 'narrow').join(' then ') + ')'); else c.fail('a revolve did not play as a turn (mode ' + mode + ')');
      await settle(); if (Object.keys(MODEL.errors).length) c.fail('the revolve reported errors: ' + JSON.stringify(MODEL.errors)); else if (bodyMeshes.length === 2 && bodyMeshes.every(m => m.group.visible)) c.ok('the ring is whole afterwards'); else c.fail('the revolve left a half state');
      await fresh(); doc.hidden = { 6: true }; regen(false); await start(); const fadeMode = FEATFX.mode;
      const ops = []; const fx = scene.children.find(x => x.name === 'fx'); if (fx) fx.traverse(o => { if (o.material && o.material.transparent) ops.push(o.material.opacity); });
      if (fadeMode === 'fade' && ops.length) c.ok('hiding a body dissolves it out'); else c.fail('hiding a body did not dissolve (mode ' + fadeMode + ')');
      await settle(); doc.hidden = {}; regen(false); await start(); if (FEATFX.mode === 'fade') c.ok('showing it again builds it back in'); else c.fail('showing a body did not play'); await settle();
      if (bodyMeshes.length === 1 && bodyMeshes[0].group.visible) c.ok('the body is back and whole'); else c.fail('the body did not come back');
      const k0 = FEATFX.count; regen(true); await settle(); regen(false); await settle(); if (FEATFX.count === k0) c.ok('a coarse or finer redraw never plays'); else c.fail('a redraw played an animation');
      const sig = () => JSON.stringify(MODEL.bodies.map(b => b.bb.map(v => +v.toFixed(3))).sort()); window.DATUM_NOFX = false; await fresh(); doc.features.push(box(30, 25, 0, 35, 10), { id: 31, type: 'extrude', name: 'Extrude2', sketch: 30, pts: [{ x: 30, y: 5 }], dist: 8, mode: 'one', op: 'new' }); regen(false); await settle(); const a = sig();
      window.DATUM_NOFX = true; await fresh(); doc.features.push(box(30, 25, 0, 35, 10), { id: 31, type: 'extrude', name: 'Extrude2', sketch: 30, pts: [{ x: 30, y: 5 }], dist: 8, mode: 'one', op: 'new' }); regen(false); await settle();
      if (a === sig()) c.ok('the animated model equals the unanimated one'); else c.fail('the animated result differs from the unanimated one');
    } finally { window.DATUM_NOFX = was; if (window.FEATFX) FEATFX.finish(); }
  });

  /* ───────────── 3. icons ───────────── */
  flow('Icon tooltips and hover motion: a CSS label and a motion on every icon, none native, all inside the window', async c => {
    await load('Pocketed plate'); await sleep(600);
    const icons = [...document.querySelectorAll('button, [role="button"], .rb-btn, .tb, .vbtn')].filter(b => b.querySelector('svg') && VI.visible(b) && !b.closest('#tipcard'));
    c.metric('icon buttons on screen', icons.length);
    const noLabel = icons.filter(b => !b.dataset.ctip), noMotion = icons.filter(b => !b.dataset.ico);
    if (!noLabel.length && !noMotion.length) c.ok('all ' + icons.length + ' icon buttons have a CSS label and a hover motion'); else c.fail((noLabel.length + noMotion.length) + ' icon buttons lack a label or motion: ' + [...noLabel, ...noMotion].slice(0, 6).map(VI.name).join(', '));
    const native = [...document.querySelectorAll('[title]')].filter(e => !(e instanceof SVGElement) && e.tagName !== 'IFRAME' && e.getAttribute('title'));
    if (!native.length) c.ok('no native (HTML title) tooltips are left'); else c.fail(native.length + ' elements still carry a native title tooltip: ' + native.slice(0, 5).map(VI.name).join(', '));
    if (!document.getElementById('tip') || !document.getElementById('tip').isConnected) c.ok('the old HTML tooltip bubble is gone'); else c.fail('the old HTML tooltip element is still in the page');
    const sheets = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch (e) { return []; } }), css = sheets.map(r => r.cssText).join('\n');
    if (/\[data-ctip\]::after/.test(css) && /content:\s*attr\(data-ctip\)/.test(css)) c.ok('the tooltip is drawn by a CSS ::after reading data-ctip'); else c.fail('the CSS tooltip rule is missing');
    const kinds = [...new Set(icons.map(b => b.dataset.ico))], missing = kinds.filter(k => !new RegExp('@keyframes ico-' + k + '\\b').test(css) && !['draw', 'stagger'].includes(k));
    if (!missing.length && kinds.length >= 12) c.ok(kinds.length + ' different motions in use, each with its keyframes'); else c.fail('motions: ' + kinds.length + ' kinds, missing keyframes for ' + missing.join(', '));
    const stable = icons.filter(b => ICONUX.kindOf(ICONUX.keyOf(b)) !== b.dataset.ico); if (!stable.length) c.ok('every icon always moves the same way'); else c.warn(stable.length + ' icons would pick a different motion now: ' + stable.slice(0, 4).map(VI.name).join(', '));
    const long = icons.filter(b => b.dataset.ctip.length > 90); if (long.length) c.warn(long.length + ' labels are very long (over 90 characters): ' + long.slice(0, 3).map(b => b.dataset.ctip.slice(0, 40)).join(' | '));
    const out = icons.filter(b => { const r = b.getBoundingClientRect(), w = Math.min(262, b.dataset.ctip.length * 6.8 + 22), cx = Math.min(Math.max(r.left + r.width / 2, w / 2 + 6), innerWidth - w / 2 - 6); return cx - w / 2 < 0 || cx + w / 2 > innerWidth; });
    if (!out.length) c.ok('every label fits inside the window'); else c.fail(out.length + ' labels would run off the window');
    const cs = getComputedStyle(document.body); if (!/prefers-reduced-motion/.test(css)) c.warn('no reduced-motion rule found'); else c.ok('reduced motion turns the motion off and keeps the label');
  });

  /* ───────────── 4. outlines ───────────── */
  flow('Outlined buttons: every button in every workspace and both themes is an outline, never a fill', async c => {
    if (!window.OUTLINES) { c.fail('the outline module is missing'); return; }
    const audit = () => {
      const bad = []; let n = 0; const a = x => { const m = x.match(/[\d.]+/g); return !m ? 0 : m.length > 3 ? +m[3] : 1; };
      for (const el of document.querySelectorAll('button, [role="button"], input[type="button"], .btn')) {
        if (!VI.visible(el) || el.matches(OUTLINES.KEEP)) continue; const cs = getComputedStyle(el); n++;
        if (a(cs.backgroundColor) > 0.04 || cs.backgroundImage !== 'none') bad.push(VI.name(el) + ' is filled');
        const border = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none' && a(cs.borderTopColor) > 0.05;
        if (!border && !/inset/.test(cs.boxShadow) && cs.outlineStyle === 'none') bad.push(VI.name(el) + ' has no outline');
      }
      return { n, bad };
    };
    const was = curTheme();
    try {
      for (const th of ['dark', 'light']) {
        theme(th); await load('Pocketed plate');
        let r = audit(); if (r.bad.length) c.fail(th + ' Design: ' + r.bad.length + ' of ' + r.n + ' buttons are not outlines: ' + r.bad.slice(0, 5).join(' | ')); else c.ok(th + ' Design: all ' + r.n + ' buttons are outlines');
        await lift(async () => {
          setWorkspace('cam'); camAddOp('chain'); await sleep(1200);
          for (const v of ['overview', 'op', 'post', 'setup']) { try { CAMUI.view = v; camRefresh(); } catch (e) { continue; } await sleep(350); r = audit(); if (r.bad.length) c.fail(th + ' Manufacture ' + v + ': ' + r.bad.length + ' of ' + r.n + ' not outlines: ' + r.bad.slice(0, 4).join(' | ')); else c.ok(th + ' Manufacture ' + v + ': all ' + r.n + ' are outlines'); }
          SECTION.open({ instant: true }); await sleep(300); r = audit(); if (r.bad.length) c.fail(th + ' section bar: ' + r.bad.slice(0, 3).join(' | ')); else c.ok(th + ' section bar: outlined'); SECTION.close({ instant: true });
          CAMUI.view = 'overview'; camRefresh(); setWorkspace('design'); await sleep(600);
        });
      }
    } finally { theme(was); }
  });

  /* ───────────── 5. defaults ───────────── */
  flow('Defaults: dark and light themes work, inches with metric in parentheses, American spellings', async c => {
    const was = curTheme();
    try {
      for (const th of ['dark', 'light']) {
        theme(th); await sleep(350); const bg = VI.parse(getComputedStyle(document.body).backgroundColor), lum = VI.lum(bg.rgb);
        if (th === 'dark' ? lum < 0.12 : lum > 0.4) c.ok(th + ' theme: the page is ' + th + ' (luminance ' + lum.toFixed(2) + ')'); else c.fail(th + ' theme: the page does not look ' + th + ' (luminance ' + lum.toFixed(2) + ')');
      }
    } finally { theme(was); }
    const html = document.documentElement.outerHTML.slice(0, 400);
    if (isIn()) c.ok('inches are the display unit'); else c.warn('the display unit is millimeters right now (inches are the default)');
    const s = fmtLs(25.4); if (/"/.test(s) && /\(25\.4\)/.test(s)) c.ok('lengths read inches first, metric in parentheses: ' + s); else if (isIn()) c.fail('a length reads "' + s + '" (inches first, metric in parentheses expected)'); else c.ok('millimeter mode: ' + s);
    const text = document.body.innerText + ' ' + [...document.querySelectorAll('[data-tip], [data-ctip], [aria-label]')].map(e => (e.dataset.tip || '') + ' ' + (e.dataset.ctip || '') + ' ' + (e.getAttribute('aria-label') || '')).join(' ');
    const brit = text.match(/\b(colou?r\w*|centre\w*|neighbour\w*|behaviour\w*|aluminium|grey|cancelled|metres?|tyres?|catalogue|modelling|labelled|organis\w*|optimis\w*|favourite|licence)\b/gi) || [];
    const real = brit.filter(w => !/^colo(r|rs|red|ring)$/i.test(w) && !/^metre/i.test(w) || /colour|metre/i.test(w));
    const bad = real.filter(w => /colour|centre|neighbour|behaviour|aluminium|grey|cancelled|metre|tyre|catalogue|modelling|labelled|organis|optimis|favourite|licence/i.test(w));
    if (!bad.length) c.ok('the interface text uses American spellings'); else c.fail('British spellings on screen: ' + [...new Set(bad)].slice(0, 8).join(', '));
  });

  /* ───────────── 6. cutter compensation ───────────── */
  const chainOp = async (set) => {
    const chains = (() => { const out = []; for (const b of visibleBodies()) { const m = bodyMesh(b); for (const ch of edgeChains(m)) if (chainFlat(ch)) { const ck = buildChain(m, ch, true); if (ck) out.push(ck); } } return out; })();
    const big = chains.filter(x => x.closed).sort((a, b) => Math.abs(cArea(cP(chainTravel(b)))) - Math.abs(cArea(cP(chainTravel(a)))))[0];
    camAddOp('chain'); const op = opById(CAMUI.op); chainSetMode(op, 'contour'); op.chains = [{ id: 1, rev: false, start: 0, ...big }];
    for (const k of ['comp', 'roughN', 'roughSp', 'leadR', 'tabs', 'ramp', 'leave', 'compD']) delete op[k];
    Object.assign(op, { stepdown: 6, lead: 'arc', side: 'auto', tool: 1 }, set || {}); return { op, chain: chainTravel(big) };
  };
  const compAudit = (text, inch, noD) => {
    const k = inch ? 25.4 : 1, probs = []; let on = false, spans = 0, g = 0, x = 0, y = 0;
    const num = (s, ch) => { const m = s.match(new RegExp('(?:^|\\s)' + ch + '(-?\\d*\\.?\\d+)')); return m ? parseFloat(m[1]) * k : null; };
    text.split('\n').forEach((raw, ln) => {
      const s = raw.replace(/\(.*?\)/g, '').replace(/;.*$/, '').trim(); if (!s) return; const at = 'line ' + (ln + 1) + ' [' + raw.slice(0, 50) + ']';
      const gm = s.match(/^G([0-3])\b/); if (gm) g = +gm[1]; const X = num(s, 'X'), Y = num(s, 'Y'), Z = num(s, 'Z'), cmp = (s.match(/\bG4([012])\b/) || [])[1];
      if (cmp === '1' || cmp === '2') { if (on) probs.push('on twice ' + at); if (!noD && !/\bD\d+/.test(s)) probs.push('no D ' + at); if (g !== 1) probs.push('not on a G1 ' + at); const len = Math.hypot((X == null ? x : X) - x, (Y == null ? y : Y) - y); if (len < 0.3) probs.push('start-up move too short ' + at); on = true; spans++; }
      else if (cmp === '0') { if (!on && X == null && Y == null) return; if (!on) probs.push('G40 while off ' + at); if (X == null && Y == null) probs.push('G40 without a move ' + at); on = false; }
      else if (on && (/^G0\b/.test(s) || /^M(5|6|30)\b/.test(s) || /^T\d+/.test(s) || /^G(28|91|53)/.test(s) || (Z != null && X == null && Y == null))) probs.push('still on ' + at);
      if (X != null) x = X; if (Y != null) y = Y;
    });
    if (on) probs.push('left on at the end'); return { probs, spans };
  };
  flow('Cutter compensation: G41 / G42 / G40 audited for every controller, contour checked against the chain', async c => {
    const off = FX_OFF(); try { await lift(async () => {
      await load('Pocketed plate'); setWorkspace('cam'); await sleep(1500);
      const { op, chain } = await chainOp({ comp: 'control' }); await sleep(600);
      const ctrls = { haas: { n: 'Haas' }, fanuc: { n: 'Fanuc' }, mach3: { n: 'Mach3' }, siemens: { n: 'Siemens', noD: true }, heidenhain: { n: 'Heidenhain' }, grbl: { n: 'Grbl' } };
      for (const mode of ['control', 'wear', 'rwear']) {
        op.comp = mode; for (const [id, info] of Object.entries(ctrls)) {
          cam().post.ctrl = id; const P = toolpath(op); await until(() => !toolpath(op).pending, 20000); const t = postGcode().text, inch = isIn();
          if (id === 'grbl') { if (!/\bG4[12]\b/.test(t.replace(/\(.*?\)/g, '')) && /NOT AVAILABLE/.test(t)) c.ok(mode + ' on Grbl: tool-center path and a note, never G41'); else c.fail(mode + ' on Grbl posted compensation words'); continue; }
          if (id === 'heidenhain') { const L2 = t.split('\n'); const bad = L2.some(l => /\bG4[12]\b/.test(l)) || !L2.some(l => / R[LR]\b/.test(l)); if (bad) c.fail(mode + ' on Heidenhain: expected RL / RR blocks and no G41'); else c.ok(mode + ' on Heidenhain: RL / RR with R0 to cancel'); continue; }
          const r = compAudit(t, inch, info.noD); if (r.probs.length || r.spans < 2) c.fail(mode + ' on ' + info.n + ': ' + (r.probs[0] || 'no compensated stretch')); else c.ok(mode + ' on ' + info.n + ': ' + r.spans + ' stretches, each started on a feed move, cancelled by G40 on a move');
        }
      }
      // the programmed contour lies on the chain (control, Haas)
      cam().post.ctrl = 'haas'; op.comp = 'control'; const t = postGcode().text, k = isIn() ? 25.4 : 1, o = camOrigin(), num = (s, ch) => { const m = s.match(new RegExp('(?:^|\\s)' + ch + '(-?\\d*\\.?\\d+)')); return m ? parseFloat(m[1]) * k : null; };
      const lines = t.split('\n').map(l => l.replace(/\(.*?\)/g, '').trim()); const i0 = lines.findIndex(l => /\bG4[12]\b/.test(l)); const poly = []; let x = 0, y = 0, g = 1;
      for (let i = i0; i < lines.length && !/\bG40\b/.test(lines[i]); i++) { const s = lines[i], gm = s.match(/^G([0-3])\b/); if (gm) g = +gm[1]; const X = num(s, 'X'), Y = num(s, 'Y'); if (X == null && Y == null) continue; if (g === 2 || g === 3) { const I = num(s, 'I') || 0, J = num(s, 'J') || 0, cx = x + I, cy = y + J, rr = Math.hypot(x - cx, y - cy); let a0 = Math.atan2(y - cy, x - cx), a1 = Math.atan2((Y == null ? y : Y) - cy, (X == null ? x : X) - cx); if (g === 3) { while (a1 <= a0 + 1e-9) a1 += 2 * Math.PI; } else { while (a1 >= a0 - 1e-9) a1 -= 2 * Math.PI; } for (let q = 1; q <= 12; q++) { const th = a0 + (a1 - a0) * q / 12; poly.push([cx + rr * Math.cos(th), cy + rr * Math.sin(th)]); } } else poly.push([X == null ? x : X, Y == null ? y : Y]); x = X == null ? x : X; y = Y == null ? y : Y; }
      const seg = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy; let u = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0; u = Math.max(0, Math.min(1, u)); return Math.hypot(p[0] - a[0] - u * dx, p[1] - a[1] - u * dy); };
      let miss = 0; for (const p of chain.map(q => [q.x - o[0], q.y - o[1]])) { let best = Infinity; for (let i = 0; i + 1 < poly.length; i++) best = Math.min(best, seg(p, poly[i], poly[i + 1])); miss = Math.max(miss, best); }
      if (poly.length > 4 && miss < 0.02) c.ok('the programmed contour lies on the chain (worst ' + miss.toFixed(4) + ' mm off)'); else c.fail('the programmed contour is ' + miss.toFixed(3) + ' mm off the chain');
      // a verify pass finds nothing wrong
      await verifyAndFix(() => {}); const rep = VERIFY.report; const bad = rep ? rep.issues.filter(i => i.type !== 'plunge') : null; if (bad && !bad.length) c.ok('Verify finds no gouge, holder hit or rapid-through-stock in the compensated program'); else c.fail('Verify reported ' + (bad ? bad.length + ' issues' : 'nothing'));
      setWorkspace('design'); await sleep(500);
    }); } finally { off(); }
  });

  /* ───────────── 7. post options ───────────── */
  flow('Post options: Z home before tool changes, the tool list, coolant modes and the per-operation override', async c => {
    const off = FX_OFF(); try { await lift(async () => {
      await load('Pocketed plate'); setWorkspace('cam'); await sleep(1500); camAddOp('face'); camAddOp('pocket'); camAddOp('contour'); camAddOp('drill'); await sleep(3000); await until(() => cam().ops.every(o => !toolpath(o).pending), 30000);
      const C = cam(), post = (ctrl, set) => { C.post.ctrl = ctrl; Object.assign(C.post, { coolant: true, coolMode: 'flood', toolRetract: undefined, optStop: false }, set || {}); return postGcode().text.split('\n').map(l => l.trim()); };
      const want = { haas: ['G91 G28 Z0.', 'G90'], fanuc: ['G91 G28 Z0.', 'G90'], mach3: ['G53 G0 Z0'], siemens: ['G74 Z1=0'] };
      for (const [ctrl, seq] of Object.entries(want)) {
        const T = post(ctrl), tc = T.map((l, i) => (ctrl === 'siemens' ? /^T\d+$/ : /^T\d+ M0?6$/).test(l) ? i : -1).filter(i => i >= 0), ok = tc.length >= 2 && tc.every(i => JSON.stringify(T.slice(i - seq.length, i)) === JSON.stringify(seq));
        if (ok) c.ok(ctrl + ': Z goes home before each of the ' + tc.length + ' tool changes'); else c.fail(ctrl + ': a tool change is not preceded by ' + seq.join(' / '));
      }
      const off2 = post('haas', { toolRetract: false }); if (!off2.some((l, i) => l === 'G91 G28 Z0.' && /M6$/.test(off2[i + 2] || ''))) c.ok('Z home can be switched off'); else c.fail('Z home stays on when switched off');
      const T = post('fanuc'), i0 = T.indexOf('(TOOLS)'), i1 = T.findIndex(l => /^G2[01] G90/.test(l)); if (i0 > 0 && i1 > i0 + 1 && T.slice(i0 + 1, i1).every(l => /^\(T\d+ {2}D=\S+ .* - [A-Z ]+\)$/.test(l))) c.ok('the tool list is in the header (' + (i1 - i0 - 1) + ' tools)'); else c.fail('the tool list is missing or malformed');
      const coolOk = lines => { let on = null, errs = []; lines.forEach((l, i) => { const w = l.replace(/\(.*\)/, '').trim(); if (/^M(7|8|88)\b/.test(w)) { if (on) errs.push('on while on @' + (i + 1)); on = w; } if (/^M(9|89)$/.test(w)) { if (!on) errs.push('off while off @' + (i + 1)); on = null; } if (/^M5$/.test(w) && on) errs.push('spindle off with coolant on @' + (i + 1)); if (/^M30$/.test(w) && on) errs.push('coolant on at the end'); }); return errs; };
      for (const [mode, w] of Object.entries({ flood: 'M8', mist: 'M7', both: 'M7 M8', tsc: 'M88' })) { const t = post('haas', { coolMode: mode }); const errs = coolOk(t); if (t.includes(w) && !errs.length) c.ok('coolant ' + mode + ': ' + w + ' with a matching off, never on twice'); else c.fail('coolant ' + mode + ': ' + (errs[0] || 'no ' + w)); }
      const t0 = post('haas', { coolant: false }); if (!t0.some(l => /^M(7|8|9|88|89)\b/.test(l))) c.ok('coolant off posts no coolant words'); else c.fail('coolant off still posts coolant words');
      const tf = post('fanuc', { coolMode: 'tsc' }); if (!tf.some(l => /^M88|^M89/.test(l)) && tf.some(l => /THROUGH-SPINDLE COOLANT IS NOT AVAILABLE/.test(l))) c.ok('through-spindle on Fanuc posts flood with a note'); else c.fail('through-spindle on Fanuc is wrong');
      const ops = C.ops.filter(o => { if (o.sup) return false; const Q = toolpath(o); return Q && !Q.pending && Q.m.length >= 2; });                      // the ones that post a toolpath
      if (ops.length < 2) { c.fail('fewer than two operations produce a toolpath'); return; } ops[0].coolant = 'off'; ops[1].coolant = 'mist'; const to = post('haas'); ops[0].coolant = undefined; ops[1].coolant = undefined;
      const a = to.findIndex(l => l.startsWith('(' + ops[0].name + ' ')), b = to.findIndex(l => l.startsWith('(' + ops[1].name + ' ')); const seg1 = to.slice(a, b).map(l => l.replace(/\(.*\)/, '').trim()), seg2 = to.slice(b).map(l => l.replace(/\(.*\)/, '').trim());
      if (!seg1.some(l => /^M(7|8)\b/.test(l)) && seg2.includes('M7') && !coolOk(to).length) c.ok('a per-operation coolant overrides the program default'); else c.fail('the per-operation coolant override is wrong');
      setWorkspace('design'); await sleep(500);
    }); } finally { off(); }
  });

  /* ───────────── 8. materials ───────────── */
  flow('Materials: every material retunes the tools and posts a clean program', async c => {
    const off = FX_OFF(); try { await lift(async () => {
      await load('Pocketed plate'); setWorkspace('cam'); await sleep(1500); camAddOp('face'); camAddOp('pocket'); camAddOp('contour'); camAddOp('drill'); await sleep(3000); await until(() => cam().ops.every(o => !toolpath(o).pending), 30000);
      const keys = Object.keys(MATERIALS), want = ['aluminum', 'brass', 'copper', 'mildsteel', 'alloysteel', 'stainless', 'castiron', 'titanium', 'inconel', 'acetal', 'toolsteel']; const miss = want.filter(k => !keys.includes(k)); if (miss.length) c.fail('missing materials: ' + miss.join(', ')); else c.ok(keys.length + ' materials in the library');
      const rpm = {}; const max = cam().maxRpm || MACHINE_MAX_RPM, was = cam().material;
      for (const k of keys) {
        cam().material = k; retuneTools(); cam().post.ctrl = 'fanuc'; const t = postGcode().text, bad = [], t1 = cam().tools.find(x => x.n === 1); rpm[k] = t1.rpm;
        if (/NaN|undefined|Infinity/.test(t)) bad.push('bad number'); for (const m of t.matchAll(/\bS(\d+)\b/g)) if (+m[1] > max || +m[1] <= 0) bad.push('S' + m[1]); if (!/M30/.test(t)) bad.push('no M30'); for (const tool of cam().tools) if (!(tool.feed > 0 && isFinite(tool.feed) && tool.rpm >= 200 && tool.rpm <= max)) bad.push('tool T' + tool.n + ' ' + tool.rpm + ' rpm ' + tool.feed + ' feed');
        if (bad.length) c.fail(k + ': ' + bad[0]); else c.ok(k + ': tools retuned (T1 ' + t1.rpm + ' rpm) and the program is clean');
      }
      cam().material = was; retuneTools();
      if (rpm.acetal >= rpm.aluminum && rpm.aluminum > rpm.mildsteel && rpm.mildsteel > rpm.titanium && rpm.titanium > rpm.inconel) c.ok('spindle speeds fall from plastic to aluminum to steel to titanium to Inconel'); else c.fail('speeds are out of order: ' + JSON.stringify(rpm));
      setWorkspace('design'); await sleep(500);
    }); } finally { off(); }
  });

  /* ───────────── 9. auto lock ───────────── */
  flow('Auto Program and Auto Detect are locked "coming soon"; manual toolpaths work', async c => {
    await load('Pocketed plate'); setWorkspace('cam'); await sleep(1500);
    const locked = [...document.querySelectorAll('#toolbar [data-cam]')].filter(b => b.classList.contains('prem-lock')).map(b => b.dataset.cam);
    const freeAuto = !!window.DATUM_AUTO;
    if (freeAuto) { c.warn('this page was opened with DATUM_AUTO set: the Auto lock is lifted on purpose'); } else {
      if (locked.includes('autoprog') && locked.includes('auto')) c.ok('Auto Program and Auto Detect are dimmed with a lock'); else c.fail('the Auto buttons are not locked (' + locked.join(', ') + ')');
      const n0 = cam().ops.length; await autoProgram(); camAction('autoprog'); camAction('auto'); await sleep(300);
      if (cam().ops.length === n0 && CAMUI.view !== 'auto') c.ok('Auto Program and Auto Detect do nothing'); else c.fail('an Auto feature ran');
      const msg = [...document.querySelectorAll('.toast, #toast')].map(t => t.textContent).join(' '); if (/coming soon/i.test(msg)) c.ok('they say "coming soon"'); else c.warn('no "coming soon" message was found on screen');
      CAMUI.view = 'auto'; camRefresh(); if (CAMUI.view !== 'auto') c.ok('the Auto Detect view falls back to the overview'); else c.fail('the Auto Detect view opened');
    }
    await lift(async () => { const n0 = cam().ops.length; for (const t of ['chain', 'face', 'contour', 'pocket', 'drill', 'parallel']) camAddOp(t); await sleep(800); if (cam().ops.length - n0 === 6) c.ok('Chain, Face, Contour, Pocket, Drill and 3D Parallel still add'); else c.fail('a manual toolpath did not add (' + (cam().ops.length - n0) + ' of 6)'); });
    setWorkspace('design'); await sleep(500);
  });

  /* ───────────── 10. contour passes ───────────── */
  flow('Contour: rough passes, spacing, lead radius, tabs only on the final pass', async c => {
    const off = FX_OFF(); try { await lift(async () => {
      await load('Pocketed plate'); setWorkspace('cam'); await sleep(1500);
      const { op, chain } = await chainOp({ leave: 0.3, stepdown: 30 }); const o = camOrigin();
      const loops = P => { const zmin = Math.min(...P.m.filter(m => !m.r).map(m => m.z)), out = []; let cur = null; for (const m of P.m) { if (!m.r && Math.abs(m.z - zmin) < 1e-6) { if (!cur) out.push(cur = []); cur.push([m.x - o[0], m.y - o[1]]); } else if (m.r) cur = null; } return out.filter(l => l.length > 12); };
      const seg = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy; let u = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0; u = Math.max(0, Math.min(1, u)); return Math.hypot(p[0] - a[0] - u * dx, p[1] - a[1] - u * dy); };
      const ch = chain.map(q => [q.x - o[0], q.y - o[1]]), dist = p => { let b = Infinity; for (let i = 0; i < ch.length; i++) b = Math.min(b, seg(p, ch[i], ch[(i + 1) % ch.length])); return b; }, off1 = l => l.map(dist).sort((a, b) => a - b)[Math.floor(l.length / 2)];
      let P = toolpath(op), r = P.tool.d / 2, L1 = loops(P); if (L1.length === 1 && Math.abs(off1(L1[0]) - (r + 0.3)) < 0.05) c.ok('one pass at Leave without rough passes'); else c.fail('the single pass is wrong: ' + L1.length + ' loops');
      op.roughN = 2; op.roughSp = 1.5; P = toolpath(op); const L3 = loops(P), offs = L3.map(off1), wantO = [r + 0.3 + 3, r + 0.3 + 1.5, r + 0.3];
      if (L3.length === 3 && offs.every((v, i) => Math.abs(v - wantO[i]) < 0.05)) c.ok('two rough passes 1.5 mm apart, outermost first, then the final pass at Leave'); else c.fail('rough passes wrong: ' + offs.map(v => v.toFixed(2)).join(', '));
      delete op.roughN; op.leadR = 3; P = toolpath(op); c.ok('a lead radius of 3 mm computes (' + P.m.length + ' moves)'); delete op.leadR;
      op.roughN = 1; op.roughSp = 2; op.tabs = 2; op.stepdown = 5; P = toolpath(op); const zmin = Math.min(...P.m.filter(m => !m.r).map(m => m.z)); const lift2 = P.m.some(m => !m.r && m.z > zmin + 0.3 && m.z < zmin + 3.2);
      if (lift2) c.ok('holding tabs lift the final pass'); else c.warn('no tab lift was seen near the floor');
      setWorkspace('design'); await sleep(500);
    }); } finally { off(); }
  });

  /* ───────────── 11. UX audit (visual intelligence on the page) ───────────── */
  flow('UX audit: contrast, cut-off text, controls over one another, tiny targets, unlabeled icons (both themes, Design and Manufacture)', async c => {
    const was = curTheme();
    try {
      for (const th of ['dark', 'light']) {
        theme(th); await load('Pocketed plate'); await sleep(500);
        for (const ws of ['design', 'cam']) {
          const go = async () => { if (ws === 'cam') { await lift(async () => { setWorkspace('cam'); camAddOp('chain'); await sleep(1200); await audit(); setWorkspace('design'); await sleep(500); }); } else await audit(); };
          const audit = async () => {
            const tag = th + ' ' + ws, ct = VI.contrast(), cl = VI.clipped(), ov = VI.overlaps(), tn = VI.tiny(), ul = VI.unlabeled(), sx = document.documentElement.scrollWidth > innerWidth + 2;
            if (ct.bad.length) c.fail(tag + ': text too faint against its background (' + ct.bad.length + '): ' + ct.bad.slice(0, 3).join(' | ')); else c.ok(tag + ': text contrast holds on ' + ct.n + ' texts');
            if (ct.warn.length) c.warn(tag + ': ' + ct.warn.length + ' texts are below 4.5:1 (e.g. ' + ct.warn.slice(0, 2).join(' | ') + ')');
            if (cl.length) c.warn(tag + ': text cut off (' + cl.length + '): ' + cl.slice(0, 3).join(' | ')); else c.ok(tag + ': no text is cut off');
            if (ov.length) c.warn(tag + ': controls drawn over one another: ' + ov.slice(0, 3).join(' | ')); else c.ok(tag + ': no controls overlap');
            if (tn.length) c.warn(tag + ': ' + tn.length + ' targets under 18 px: ' + tn.slice(0, 3).join(' | ')); else c.ok(tag + ': every target is at least 18 px');
            if (ul.length) c.fail(tag + ': icons with no name: ' + ul.slice(0, 3).join(' | ')); else c.ok(tag + ': every icon has a name');
            if (sx) c.fail(tag + ': the page scrolls sideways'); else c.ok(tag + ': nothing runs past the right edge');
          };
          await go();
        }
      }
    } finally { theme(was); }
  });

  /* ───────────── 12. visual intelligence on the 3D view ───────────── */
  flow('Visual intelligence: the 3D view is framed and sharp, the cube is drawn, the themes differ, the cut face reads as a section', async c => {
    const was = curTheme(), off = FX_OFF();
    try {
      await load('Pocketed plate'); fitAll(false); await sleep(1200);
      const fr = VI.framing(); if (fr.ok && fr.box[0] > 0.01 && fr.box[2] < 0.99) c.ok('the model is framed inside the view (' + Math.round(fr.n / (fr.w * fr.h) * 100) + '% of it covered)'); else c.fail('the model is not framed (covers ' + (fr.n / (fr.w * fr.h) * 100).toFixed(1) + '%, box ' + (fr.box || []).map(v => v.toFixed(2)).join(',') + ')');
      if (window.__blur && __blur.measure) { try { const m = await __blur.measure(); const bad = (m.issues || []).filter(i => i.sev === 'bad' || i.severity === 'bad' || i.level === 'bad'); if (bad.length) c.warn('sharpness: ' + bad.slice(0, 2).map(i => i.msg || i.text || i.title || JSON.stringify(i)).join(' | ')); else c.ok('sharpness: no blur problems found (' + ((m.issues || []).length) + ' notes)'); } catch (e) { c.warn('the sharpness reading failed: ' + String(e.message).slice(0, 80)); } } else c.warn('no sharpness check on this page');
      const cube = (() => { const r = cubeRect(), p = VI.pixels(); renderer.setViewport(0, 0, W, H); return r.w > 20; })(); if (cube) c.ok('the view cube has room and is drawn');
      theme('dark'); await sleep(300); const d = VI.pixels().mean; theme('light'); await sleep(300); const l = VI.pixels().mean;
      c.ok('the model color in dark and light themes: ' + d.join('/') + ' and ' + l.join('/'));
      SECTION.open({ instant: true, axis: 'y', flip: true }); SECTION.set({ d: 0 }); view.quat.setFromEuler(new THREE.Euler(0, 0, 0)); view.anim = null; updateCamera();
      theme('dark'); await sleep(250); const sec = VI.pixels([[0x17, 0x28, 0x3d, 14], [0x7f, 0xb1, 0xe6, 40], [0xea, 0xf3, 0xff, 22]]);
      if (sec.near[0] > 1500 && sec.near[1] > 300 && sec.near[2] > 80) c.ok('seen square on, the cut face is a clear blueprint section'); else c.fail('the section does not read as a section (fill ' + sec.near[0] + ', hatch ' + sec.near[1] + ', outline ' + sec.near[2] + ')');
    } finally { off(); try { SECTION.close({ instant: true }); } catch (e) { /* none */ } theme(was); homeLike(); }
  });
  function homeLike() { try { fitAll(false); } catch (e) { /* none */ } }

  // join the dev panel's page flows, and offer a direct runner
  window.__dev.FLOWS.page.push(...f);
  window.__devFeatures = {
    flows: f, VI,
    async run(names) {
      const out = [];
      for (const fl of f) {
        if (names && !names.some(n => fl.name.toLowerCase().includes(String(n).toLowerCase()))) continue;
        const res = { name: fl.name, pass: true, notes: [], metrics: {}, ms: 0 }, t0 = Date.now(), errs = [];
        const onErr = e => errs.push(e.message || String(e)); window.addEventListener('error', onErr);
        const c = { w: window, mon: { errors: [], gaps: [] }, T: null, ok: m => res.notes.push('✓ ' + m), warn: m => res.notes.push('• ' + m), fail: m => { res.pass = false; res.notes.push('✗ ' + m); }, metric: (k, v) => { res.metrics[k] = v; } };
        try { await fl.run(c); } catch (e) { res.pass = false; res.notes.push('✗ stopped: ' + String((e && e.message) || e).slice(0, 200)); }
        window.removeEventListener('error', onErr); if (errs.length) { res.pass = false; res.notes.push('✗ script error: ' + errs[0]); }
        res.ms = Date.now() - t0; out.push(res);
        try { SECTION.close({ instant: true }); setWorkspace('design'); } catch (e) { /* none */ }
      }
      return out;
    },
  };
})();
