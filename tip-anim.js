/* tip-anim.js: the 3D before → after picture on the hover tip cards.
   One small three.js view, shared by every tip card on the page, morphs the "before" drawing into the "after" drawing
   while it sways slowly for depth, then eases back (ping-pong). It starts when a card opens and stops when it closes,
   so nothing runs while idle.

   Using it from a tip card (one call, no per-tool work):
     card.innerHTML = '…' + TipAnim.pics(beforeSvg, afterSvg) + '…';   // beforeSvg / afterSvg are the existing SVG strings
     TipAnim.start(card);                                                // after the card is in the page
     TipAnim.stop();                                                     // when the card hides

   Any tool that already has a before/after SVG pair animates with no extra data: shapes are matched between the two
   drawings and tweened (corners, colours, line widths); shapes only one side has fade and grow in or out.
   Falls back to the original two still pictures when canvas is missing, the pair is not plain SVG, or the person asks
   for reduced motion. WebGL missing → the same morph is drawn flat with a CSS tilt. */
(function (root) {
  'use strict';
  const W = 120, H = 90, SC = 3, N_LAYERS = 3, MAX_PTS = 72;
  const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  const PAIRS = new Map(); let seq = 0;
  let host = null, cur = null, threeLoading = false;

  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
  const canCanvas = () => { try { return !!document.createElement('canvas').getContext('2d'); } catch (e) { return false; } };
  const css = name => { try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); } catch (e) { return ''; } };
  const isSvg = s => typeof s === 'string' && /^\s*<svg[\s>]/i.test(s) && !/<image[\s>]|<img[\s>]|url\(/i.test(s);

  // the page's own transition curve (--ease, shared timing), so the morph moves like every other panel
  function bezier(str) {
    const m = /cubic-bezier\(([^)]+)\)/.exec(str || ''), v = m ? m[1].split(',').map(Number) : [.2, .7, .2, 1];
    const [x1, y1, x2, y2] = v.length === 4 && v.every(isFinite) ? v : [.2, .7, .2, 1];
    const ax = 3 * x1 - 3 * x2 + 1, bx = 3 * x2 - 6 * x1, cx = 3 * x1, ay = 3 * y1 - 3 * y2 + 1, by = 3 * y2 - 6 * y1, cy = 3 * y1;
    const X = t => ((ax * t + bx) * t + cx) * t, Y = t => ((ay * t + by) * t + cy) * t;
    return x => { if (x <= 0) return 0; if (x >= 1) return 1; let lo = 0, hi = 1, t = x; for (let i = 0; i < 24; i++) { const d = X(t) - x; if (Math.abs(d) < 1e-4) break; if (d > 0) hi = t; else lo = t; t = (lo + hi) / 2; } return Y(t); };
  }

  /* ── reading a drawing into shapes ── */
  function parseColor(s) {
    const m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+%?))?/.exec(s || '');
    if (!m) return null;
    let a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4];
    return [+m[1], +m[2], +m[3], a];
  }
  const rgba = c => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, c[3])).toFixed(3)})`;
  const mixC = (a, b, t) => { a = a || (b ? [b[0], b[1], b[2], 0] : [0, 0, 0, 0]); b = b || [a[0], a[1], a[2], 0]; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]; };

  function readSvg(str) {
    if (!host) { host = document.createElement('div'); host.setAttribute('aria-hidden', 'true'); host.style.cssText = 'position:absolute;left:-9999px;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none'; document.body.appendChild(host); }
    host.innerHTML = str;
    const svg = host.querySelector('svg'); if (!svg) throw new Error('no svg');
    const vb = (svg.getAttribute('viewBox') || `0 0 ${W} ${H}`).split(/[\s,]+/).map(Number), vw = vb[2] || W, vh = vb[3] || H;
    svg.setAttribute('width', vw); svg.setAttribute('height', vh);
    const out = { shapes: [], bg: [], vw, vh };
    const els = svg.querySelectorAll('polygon,polyline,line,rect,ellipse,circle,path,text');
    for (const el of els) {
      const tag = el.tagName.toLowerCase(), cs = getComputedStyle(el), ctm = el.getCTM && el.getCTM();
      if (!ctm || cs.display === 'none') continue;
      const inGrid = !!el.closest('[data-grid]'), isBgRect = tag === 'rect' && el.parentNode === svg && +el.getAttribute('width') >= vw - 1;
      const op = (cs.opacity === '' ? 1 : +cs.opacity), k = Math.sqrt(Math.abs(ctm.a * ctm.d - ctm.b * ctm.c)) || 1;
      let fill = parseColor(cs.fill), stroke = parseColor(cs.stroke);
      if (fill) fill[3] *= op * (cs.fillOpacity === '' ? 1 : +cs.fillOpacity); if (stroke) stroke[3] *= op * (cs.strokeOpacity === '' ? 1 : +cs.strokeOpacity);
      const sw = (parseFloat(cs.strokeWidth) || 0) * k, dash = (cs.strokeDasharray && cs.strokeDasharray !== 'none') ? cs.strokeDasharray.split(/[ ,]+/).map(v => parseFloat(v) * k) : null;
      const base = { fill, stroke, sw: stroke ? sw : 0, dash, cap: cs.strokeLinecap || 'butt', tag };
      const tp = (x, y) => [ctm.a * x + ctm.c * y + ctm.e, ctm.b * x + ctm.d * y + ctm.f];
      if (tag === 'text') {
        out.shapes.push(Object.assign(base, { cls: 'text', text: el.textContent, p: tp(+el.getAttribute('x') || 0, +el.getAttribute('y') || 0), size: (parseFloat(cs.fontSize) || 8) * k, weight: cs.fontWeight || '600', anchor: cs.textAnchor || 'start', fill: fill || [0, 0, 0, 1] }));
        continue;
      }
      let pts, closed = true, rigid = null;
      if (tag === 'polygon' || tag === 'polyline') {
        pts = Array.from(el.points, p => tp(p.x, p.y)); closed = tag === 'polygon';
      } else if (tag === 'line') {
        pts = [tp(+el.getAttribute('x1') || 0, +el.getAttribute('y1') || 0), tp(+el.getAttribute('x2') || 0, +el.getAttribute('y2') || 0)]; closed = false;
      } else if (tag === 'rect' && !(+el.getAttribute('rx') || +el.getAttribute('ry'))) {
        const x = +el.getAttribute('x') || 0, y = +el.getAttribute('y') || 0, w = +el.getAttribute('width') || 0, h = +el.getAttribute('height') || 0;
        pts = [tp(x, y), tp(x + w, y), tp(x + w, y + h), tp(x, y + h)];
      } else {
        const d = tag === 'path' ? el.getAttribute('d') || '' : '';
        closed = tag !== 'path' || /z\s*$/i.test(d.trim());
        if (tag === 'path' && (d.match(/[Mm]/g) || []).length > 1) {      // several sub-paths: draw as one rigid piece, fade between
          rigid = { d, m: [ctm.a, ctm.b, ctm.c, ctm.d, ctm.e, ctm.f] };
        } else {
          const L = el.getTotalLength(), n = 40; pts = [];
          for (let i = 0; i < (closed ? n : n + 1); i++) { const q = el.getPointAtLength(L * i / n); pts.push(tp(q.x, q.y)); }
        }
      }
      if (rigid) { Object.assign(base, { cls: 'rigid', rigid, p: tp(0, 0) }); base.c = bboxC(base.rigid, el, tp); }
      else Object.assign(base, { cls: closed ? 'closed' : 'open', pts, closed });
      if (!rigid) base.c = centroid(pts);
      if (inGrid || isBgRect) out.bg.push(base); else out.shapes.push(base);
    }
    host.innerHTML = '';
    return out;
  }
  function bboxC(r, el, tp) { try { const b = el.getBBox(); return tp(b.x + b.width / 2, b.y + b.height / 2); } catch (e) { return [W / 2, H / 2]; } }
  const centroid = pts => { let x = 0, y = 0; for (const p of pts) { x += p[0]; y += p[1]; } return [x / pts.length, y / pts.length]; };

  /* ── matching and morphing ── */
  const lerp = (a, b, t) => a + (b - a) * t;
  function subdivide(pts, closed, n) {      // add corners (split the longest edge) until there are n; the picture does not change
    pts = pts.map(p => p.slice());
    while (pts.length < n) {
      let bi = 0, bl = -1; const last = closed ? pts.length : pts.length - 1;
      for (let i = 0; i < last; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], l = Math.hypot(a[0] - b[0], a[1] - b[1]); if (l > bl) { bl = l; bi = i; } }
      const a = pts[bi], b = pts[(bi + 1) % pts.length]; pts.splice(bi + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    }
    return pts;
  }
  function align(a, b) {                       // turn the ring b so its first corner is the one nearest to a's
    let best = 0, bd = Infinity;
    for (let s = 0; s < b.length; s++) { let d = 0; for (let i = 0; i < a.length; i++) { const q = b[(i + s) % b.length]; d += (a[i][0] - q[0]) ** 2 + (a[i][1] - q[1]) ** 2; } if (d < bd) { bd = d; best = s; } }
    return best ? b.slice(best).concat(b.slice(0, best)) : b;
  }
  const area = pts => { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };
  const colDist = (a, b) => !a || !b ? (a || b ? 60 : 0) : Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

  function plan(B, A) {
    const used = new Set(), items = [];
    A.shapes.forEach((a, ai) => {
      let bi = -1, bc = a.cls === 'open' ? 28 : 55;
      B.shapes.forEach((b, i) => {
        if (used.has(i) || b.cls !== a.cls) return;
        let c = Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1]) + colDist(b.fill, a.fill) * .08 + colDist(b.stroke, a.stroke) * .05;
        if (a.cls === 'text' && a.text !== b.text) c += 30;
        if (a.cls === 'closed') c += Math.sqrt(Math.abs(area(a.pts) - area(b.pts))) * .5;
        if (c < bc) { bc = c; bi = i; }
      });
      if (bi >= 0) used.add(bi);
      items.push({ a, b: bi >= 0 ? B.shapes[bi] : null, order: ai });
    });
    // the "before" shapes nothing matched go underneath, fading out
    B.shapes.forEach((b, i) => { if (!used.has(i)) items.unshift({ a: null, b, order: -1 }); });
    for (const it of items) {
      if (it.a && it.b && (it.a.cls === 'closed' || it.a.cls === 'open')) {
        const n = Math.min(MAX_PTS, Math.max(it.a.pts.length, it.b.pts.length)), closed = it.a.closed && it.b.closed;
        it.pa = subdivide(it.b.pts, closed, n); it.pb = subdivide(it.a.pts, closed, n); if (closed) it.pb = align(it.pa, it.pb);
      }
    }
    // the backdrop: drawn once when both drawings share it, otherwise it cross-fades
    const same = B.bg.length === A.bg.length;
    return { items, bg: same ? { once: A.bg } : { from: B.bg, to: A.bg }, n: items.length };
  }

  /* ── drawing one frame (p: 0 = before, 1 = after) onto layer canvases ── */
  function pathOf(pts, closed) { const p = new Path2D(); pts.forEach((q, i) => i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1])); if (closed) p.closePath(); return p; }
  function paint(ctx, s, alpha) {
    if (alpha <= 0.002) return;
    ctx.save(); ctx.globalAlpha = Math.min(1, alpha); ctx.lineCap = s.cap === 'butt' ? 'round' : s.cap; ctx.lineJoin = 'round';
    if (s.fill && s.fill[3] > 0) { ctx.fillStyle = rgba(s.fill); ctx.fill(s.path); }
    if (s.stroke && s.stroke[3] > 0 && s.sw > 0.01) { ctx.strokeStyle = rgba(s.stroke); ctx.lineWidth = s.sw; ctx.setLineDash(s.dash || []); ctx.stroke(s.path); }
    ctx.restore();
  }
  function drawBg(ctx, list, alpha) {
    for (const s of list) {
      if (s.tag === 'rect') { ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = rgba(s.fill || [246, 248, 251, 1]); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(0, 0, W, H, 8) : ctx.rect(0, 0, W, H); ctx.fill(); ctx.restore(); }
      else paint(ctx, Object.assign({}, s, { path: pathOf(s.pts, s.closed) }), alpha);
    }
  }
  function drawFrame(plan_, layers, p) {
    const ctxs = layers.map(l => { const c = l.getContext('2d'); c.setTransform(SC, 0, 0, SC, 0, 0); c.clearRect(0, 0, W, H); return c; });
    const bg = plan_.bg;
    if (bg.once) drawBg(ctxs[0], bg.once, 1); else { drawBg(ctxs[0], bg.from, 1 - p); drawBg(ctxs[0], bg.to, p); }
    const n = plan_.n || 1;
    plan_.items.forEach((it, idx) => {
      const ctx = ctxs[Math.min(N_LAYERS - 1, Math.max(0, Math.floor((idx / n) * N_LAYERS)))];
      const a = it.a, b = it.b;
      if (a && b) {
        const fill = mixC(b.fill, a.fill, p), stroke = mixC(b.stroke, a.stroke, p), sw = lerp(b.sw, a.sw, p);
        const s = { fill, stroke, sw, dash: p < .5 ? b.dash : a.dash, cap: p < .5 ? b.cap : a.cap };
        if (a.cls === 'text') { ctx.save(); ctx.fillStyle = rgba(fill); ctx.font = `${a.weight} ${lerp(b.size, a.size, p).toFixed(1)}px Inter,system-ui,sans-serif`; ctx.textAlign = a.anchor === 'middle' ? 'center' : a.anchor === 'end' ? 'right' : 'left'; ctx.fillText(p < .5 ? b.text : a.text, lerp(b.p[0], a.p[0], p), lerp(b.p[1], a.p[1], p)); ctx.restore(); }
        else if (a.cls === 'rigid') { drawRigid(ctx, b, 1 - p); drawRigid(ctx, a, p); }
        else { s.path = pathOf(it.pa.map((q, i) => [lerp(q[0], it.pb[i][0], p), lerp(q[1], it.pb[i][1], p)]), a.closed && b.closed); paint(ctx, s, 1); }
        return;
      }
      const lone = a || b, t = a ? p : 1 - p;                                  // only one side has it: fade (and grow / shrink) with progress
      const e = a ? Math.max(0, (p - .25) / .75) : Math.max(0, 1 - p / .7), grow = .55 + .45 * e;
      if (lone.cls === 'text') { ctx.save(); ctx.globalAlpha = e; ctx.fillStyle = rgba(lone.fill); ctx.font = `${lone.weight} ${lone.size.toFixed(1)}px Inter,system-ui,sans-serif`; ctx.textAlign = lone.anchor === 'middle' ? 'center' : lone.anchor === 'end' ? 'right' : 'left'; ctx.fillText(lone.text, lone.p[0], lone.p[1]); ctx.restore(); }
      else if (lone.cls === 'rigid') drawRigid(ctx, lone, e);
      else {
        const c = lone.c, pts = lone.pts.map(q => [c[0] + (q[0] - c[0]) * grow, c[1] + (q[1] - c[1]) * grow]);
        paint(ctx, { fill: lone.fill, stroke: lone.stroke, sw: lone.sw, dash: lone.dash, cap: lone.cap, path: pathOf(pts, lone.closed) }, e);
      }
    });
  }
  function drawRigid(ctx, s, alpha) {
    if (alpha <= 0.002) return;
    ctx.save(); ctx.transform(...s.rigid.m); const q = new Path2D(s.rigid.d);
    ctx.globalAlpha = alpha; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (s.fill && s.fill[3] > 0) { ctx.fillStyle = rgba(s.fill); ctx.fill(q); }
    if (s.stroke && s.stroke[3] > 0) { const k = Math.sqrt(Math.abs(s.rigid.m[0] * s.rigid.m[3] - s.rigid.m[1] * s.rigid.m[2])) || 1; ctx.strokeStyle = rgba(s.stroke); ctx.lineWidth = s.sw / k; ctx.setLineDash((s.dash || []).map(v => v / k)); ctx.stroke(q); }
    ctx.restore();
  }

  /* ── the shared view ── */
  const V = { renderer: null, gl: null, failed: false };
  function ensureThree() {
    if (root.THREE) return true;
    if (!threeLoading && !document.querySelector('script[data-tipanim-three]')) {         // pages without three.js load the same build the app uses, once
      threeLoading = true; const s = document.createElement('script'); s.src = THREE_URL; s.async = true; s.dataset.tipanimThree = '1'; document.head.appendChild(s);
    }
    return false;
  }
  function makeGL() {
    if (V.failed || !root.THREE) return null;
    if (V.gl) return V.gl;
    try {
      const T = root.THREE, canvas = document.createElement('canvas'), renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
      if (!renderer.getContext()) throw new Error('no webgl');
      renderer.setClearColor(0x000000, 0);
      const scene = new T.Scene(), cam = new T.PerspectiveCamera(28, W / H, 0.1, 100), group = new T.Group(); scene.add(group);
      const aspect = H / W, planes = [], texs = [];
      for (let i = 0; i < N_LAYERS; i++) {
        const c = document.createElement('canvas'); c.width = W * SC; c.height = H * SC;
        const tex = new T.CanvasTexture(c); tex.minFilter = T.LinearFilter; tex.generateMipmaps = false; if (tex.anisotropy !== undefined) tex.anisotropy = 4;
        const m = new T.Mesh(new T.PlaneGeometry(1, aspect), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
        m.position.z = (i - (N_LAYERS - 1) / 2) * 0.05; m.renderOrder = i; group.add(m); planes.push(m); texs.push(tex);
      }
      cam.position.set(0, 0, 1.8);
      V.gl = { T, canvas, renderer, scene, cam, group, texs, layers: texs.map(t => t.image) };
      return V.gl;
    } catch (e) { V.failed = true; return null; }
  }
  const FLAT = { layers: null, canvas: null };
  function makeFlat() {
    if (FLAT.canvas) return FLAT;
    const c = document.createElement('canvas'); c.width = W * SC; c.height = H * SC; FLAT.canvas = c;
    FLAT.layers = [0, 1, 2].map(() => { const l = document.createElement('canvas'); l.width = W * SC; l.height = H * SC; return l; });
    return FLAT;
  }
  function compose(flat) {                     // no WebGL: the layers are stacked on one canvas, the tilt is CSS
    const x = flat.canvas.getContext('2d'); x.clearRect(0, 0, flat.canvas.width, flat.canvas.height); for (const l of flat.layers) x.drawImage(l, 0, 0);
  }

  /* ── running ── */
  const HOLD_A = 650, MORPH = 1250, HOLD_B = 900;       // before holds, morphs to after, holds, morphs back
  function legacy(b, a) { return `<div class="tip-pics"><figure>${b}<figcaption>Before</figcaption></figure><span class="tip-arr">→</span><figure>${a}<figcaption>After</figcaption></figure></div>`; }
  function pics(before, after) {
    if (!isSvg(before) || !isSvg(after) || reduced() || !canCanvas()) return legacy(before, after);
    const id = ++seq; PAIRS.set(id, [before, after]); if (PAIRS.size > 40) PAIRS.delete(PAIRS.keys().next().value);
    return `<div class="tip-anim" data-tipanim="${id}"><div class="ta-view">${after}</div><div class="ta-cap"><span class="ta-b on">Before</span><i class="ta-bar"><b></b></i><span class="ta-a">After</span></div></div>`;
  }
  function start(rootEl) {
    stop();
    const slot = rootEl && rootEl.querySelector && rootEl.querySelector('[data-tipanim]'); if (!slot) return;
    const pair = PAIRS.get(+slot.dataset.tipanim); if (!pair) return;
    const fallback = () => { slot.outerHTML = legacy(pair[0], pair[1]); };
    let pl;
    try { pl = plan(readSvg(pair[0]), readSvg(pair[1])); } catch (e) { return fallback(); }
    ensureThree();
    const view = slot.querySelector('.ta-view'), cap = slot.querySelector('.ta-cap'), bar = cap.querySelector('.ta-bar b'), eb = cap.querySelector('.ta-b'), ea = cap.querySelector('.ta-a');
    const ease = bezier(css('--ease'));
    const st = cur = { slot, view, stop: false, raf: 0, mode: '', t0: 0, last: -1 };
    const mount = mode => {
      st.mode = mode; view.textContent = '';
      if (mode === 'gl') { const g = V.gl; g.canvas.style.cssText = 'display:block;width:100%;height:100%'; view.appendChild(g.canvas); st.layers = g.layers; }
      else { const f = makeFlat(); f.canvas.style.cssText = 'display:block;width:100%;height:100%;transition:none;transform-origin:50% 50%'; view.appendChild(f.canvas); st.layers = f.layers; }
      st.size = 0;
    };
    const frame = now => {
      if (st.stop || cur !== st) return;
      if (!st.t0) st.t0 = now;
      // three.js arrives late on pages that did not have it: switch over once it is there
      if (st.mode !== 'gl' && root.THREE && !V.failed && makeGL()) mount('gl');
      if (!st.mode) mount(root.THREE && makeGL() ? 'gl' : 'flat');
      const t = (now - st.t0), cyc = HOLD_A + MORPH + HOLD_B + MORPH, u = t % cyc;
      let p, label;
      if (u < HOLD_A) p = 0; else if (u < HOLD_A + MORPH) p = ease((u - HOLD_A) / MORPH);
      else if (u < HOLD_A + MORPH + HOLD_B) p = 1; else p = 1 - ease((u - HOLD_A - MORPH - HOLD_B) / MORPH);
      label = p > .5;
      drawFrame(pl, st.layers, p);
      bar.style.transform = `scaleX(${p.toFixed(3)})`; eb.classList.toggle('on', !label); ea.classList.toggle('on', label);
      const sway = Math.sin(t / 1000 * 0.9), bob = Math.sin(t / 1000 * 0.6 + 1);       // slow orbit: about ±24° across, a little pitch
      if (st.mode === 'gl') {
        const g = V.gl, w = view.clientWidth || 260, h = view.clientHeight || 195, dpr = Math.min(2, devicePixelRatio || 1);
        if (st.size !== w * 1000 + h) { g.renderer.setPixelRatio(dpr); g.renderer.setSize(w, h, false); g.cam.aspect = w / h; g.cam.updateProjectionMatrix(); st.size = w * 1000 + h; }
        g.group.rotation.y = sway * 0.42; g.group.rotation.x = -0.18 + bob * 0.06; g.group.position.z = 0.03 * Math.sin(p * Math.PI);
        g.texs.forEach(x => x.needsUpdate = true); g.renderer.render(g.scene, g.cam);
      } else {
        compose(FLAT);
        FLAT.canvas.style.transform = `perspective(520px) rotateY(${(sway * 24).toFixed(1)}deg) rotateX(${(10 + bob * 3).toFixed(1)}deg)`;
      }
      st.raf = requestAnimationFrame(frame);
    };
    st.raf = requestAnimationFrame(frame);
  }
  function stop() {
    if (!cur) return;
    cur.stop = true; cancelAnimationFrame(cur.raf);
    try { if (V.gl && V.gl.canvas.parentNode) V.gl.canvas.remove(); if (FLAT.canvas && FLAT.canvas.parentNode) FLAT.canvas.remove(); } catch (e) { /* the card is already gone */ }
    cur = null;
  }

  // card styles shared by every page: the same Inter / light-theme card the still pictures sat in
  const style = document.createElement('style');
  style.textContent = `.tip-anim{margin:0}
.tip-anim .ta-view{position:relative;width:100%;aspect-ratio:4/3;border-radius:10px;overflow:hidden;background:#f6f8fb;border:1px solid var(--rule,#e3e7ec)}
.tip-anim .ta-view>svg{display:block;width:100%;height:100%}
.tip-anim .ta-cap{display:flex;align-items:center;gap:8px;margin-top:6px;font:650 10px var(--font,Inter,system-ui,sans-serif);letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#8a94a3)}
.tip-anim .ta-cap span{transition:color .2s var(--ease,cubic-bezier(.2,.7,.2,1))}.tip-anim .ta-cap span.on{color:var(--accent,#2f7be8)}
.tip-anim .ta-bar{flex:1;height:3px;border-radius:2px;background:var(--rule,#e3e7ec);overflow:hidden}
.tip-anim .ta-bar b{display:block;height:100%;background:var(--accent,#2f7be8);transform-origin:0 50%;transform:scaleX(0)}`;
  (document.head || document.documentElement).appendChild(style);

  root.TipAnim = { pics, start, stop, _plan: plan, _read: readSvg };
})(typeof window !== 'undefined' ? window : this);
