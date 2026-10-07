/* tip-anim.js: the action animation on every hover tip card.
   One small canvas view, shared by every tip card on the page, plays the tool being USED: a sketch profile being
   extruded, a cutter following a chain and the cut stock appearing behind it, a cursor drawing the line. Nothing
   morphs and nothing crossfades: a scene is drawn from scratch each frame from one progress number, so what you
   see is the action itself. It starts when a card opens and stops when it closes, so nothing runs while idle.

   Using it from a tip card (one call, no per-tool work):
     card.innerHTML = '…' + TipAnim.pic('f:revolve') + '…';     // '' when the tool has no scene yet
     TipAnim.start(card);                                          // after the card is in the page
     TipAnim.stop();                                               // when the card hides

   Adding a scene for a new tool (see docs/tip-animations.md for the recipe and the helper list):
     TipAnim.scene('f:newtool', g => {                             // g.t runs 0 → 1 over the loop
       const p = g.seg(0.1, 0.7);                                  // 0 → 1 (eased) between 10 % and 70 % of the loop
       g.sketch(PROFILE);                                          // the 2D profile on the ground plane
       g.prism(PROFILE, 0, 12 * p, 'a');                           // the solid grows as p goes up
       g.arrow([0, 0, 12 * p], [0, 0, 12 * p + 8]);
     });
   Scenes are plain functions of g.t: no state, no timers. A scene that needs state (a cut stock) takes it from
   g.mem, which is wiped every time the loop restarts.

   Falls back to the old before / after pictures (tip-anim-legacy.js) for tools that have no scene yet. */
(function (root) {
  'use strict';
  const LEG = root.TipAnim || null;                       // the old morph engine, loaded first while scenes are being converted
  const AW = 240, AH = 180;                               // the drawing's own size; the canvas scales it
  const SCENES = new Map();
  let cur = null, seq = 0;

  /* ── small maths and colour ── */
  const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeIO = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const easeO = t => 1 - Math.pow(1 - t, 3);
  const PAL = { n: [222, 229, 237], a: [92, 150, 240], s: [226, 207, 174], m: [180, 188, 200], c: [243, 156, 56], g: [48, 164, 86], r: [222, 72, 62], k: [92, 103, 118], w: [255, 255, 255], y: [250, 206, 72], p: [150, 112, 222], t: [74, 190, 196] };
  const rgb = c => Array.isArray(c) ? c : PAL[c] || (/^#[0-9a-f]{6}$/i.test(c) ? [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)] : PAL.n);
  const shade = (c, f, a = 1) => { c = rgb(c); return `rgba(${Math.min(255, c[0] * f) | 0},${Math.min(255, c[1] * f) | 0},${Math.min(255, c[2] * f) | 0},${a})`; };
  const LIGHT = (() => { const l = [0.25, 0.5, 0.83], n = Math.hypot(...l); return l.map(v => v / n); })();
  const lit = n => 0.5 + 0.55 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const unit = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const ngon = (cx, cy, r, n = 20, a0 = 0) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos(a0 + i * 2 * Math.PI / n), cy + r * Math.sin(a0 + i * 2 * Math.PI / n)]);
  const area2 = pts => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
  const ccw = pts => area2(pts) < 0 ? pts.slice().reverse() : pts;

  // the position at fraction f (0..1) along a polyline, and which way it is heading
  function along(path, f) {
    const L = [0]; for (let i = 1; i < path.length; i++) L.push(L[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], (path[i][2] || 0) - (path[i - 1][2] || 0)));
    const tot = L[L.length - 1] || 1, d = clamp(f) * tot; let i = 1; while (i < path.length - 1 && L[i] < d) i++;
    const a = path[i - 1], b = path[i], u = (d - L[i - 1]) / ((L[i] - L[i - 1]) || 1);
    return { p: [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2] || 0, b[2] || 0, u)], dir: unit(sub(b, a)), len: tot, d };
  }
  // a polyline cut off at fraction f (for "being drawn" strokes)
  function head(path, f) {
    if (f >= 1) return path.slice(); if (f <= 0) return [path[0]];
    const a = along(path, f), out = [path[0]]; let acc = 0;
    for (let i = 1; i < path.length; i++) { const seg = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], (path[i][2] || 0) - (path[i - 1][2] || 0)); if (acc + seg >= a.d) break; out.push(path[i]); acc += seg; }
    out.push(a.p); return out;
  }

  /* ── the drawing context handed to every scene ── */
  function makeG(ctx) {
    const g = { ctx, t: 0, time: 0, mem: {}, ox: 120, oy: 120, s: 2.3, flat: false, fy: -1, X: null, W: AW, H: AH };
    g.clamp = clamp; g.lerp = lerp; g.ease = easeIO; g.along = along; g.head = head; g.ngon = ngon; g.shade = shade;
    g.seg = (a, b) => easeIO(clamp((g.t - a) / (b - a)));          // eased 0 → 1 between two moments of the loop
    g.lin = (a, b) => clamp((g.t - a) / (b - a));                   // the same, linear
    g.view = (ox, oy, s) => { g.ox = ox; g.oy = oy; g.s = s; g.flat = false; return g; };           // isometric
    g.view2d = (ox = AW / 2, oy = AH / 2 + 4, s = 2.6) => { g.ox = ox; g.oy = oy; g.s = s; g.flat = true; g.fy = -1; return g; };   // flat drawing board, y up
    g.P = (x, y, z = 0) => { if (g.X) [x, y, z] = g.X(x, y, z); return g.flat ? [g.ox + x * g.s, g.oy + g.fy * y * g.s] : [g.ox + (x - y) * 0.866 * g.s, g.oy + (x + y) * 0.5 * g.s - z * g.s]; };
    // run draw() with everything inside turned (axis 'x' | 'y' | 'z', degrees, about a point) or moved
    g.xf = (fn, draw) => { const prev = g.X; g.X = prev ? (x, y, z) => fn(...prev(x, y, z)) : fn; try { draw(); } finally { g.X = prev; } };
    g.turn = (axis, deg, c, draw) => { const a = deg * Math.PI / 180, co = Math.cos(a), si = Math.sin(a), [cx, cy, cz] = c || [0, 0, 0]; g.xf((x, y, z) => { x -= cx; y -= cy; z -= cz; return axis === 'z' ? [cx + x * co - y * si, cy + x * si + y * co, cz + z] : axis === 'x' ? [cx + x, cy + y * co - z * si, cz + y * si + z * co] : [cx + x * co + z * si, cy + y, cz - x * si + z * co]; }, draw); };
    g.move = (dx, dy, dz, draw) => g.xf((x, y, z) => [x + dx, y + dy, z + dz], draw);
    g.scale3 = (sx, sy, sz, c, draw) => { const [cx, cy, cz] = c || [0, 0, 0]; g.xf((x, y, z) => [cx + (x - cx) * sx, cy + (y - cy) * sy, cz + (z - cz) * sz], draw); };

    /* flat drawing: strokes, fills, dots, arrows (in whatever view is current) */
    const path2 = (pts, close) => { ctx.beginPath(); pts.forEach((p, i) => { const q = g.P(p[0], p[1], p[2] || 0); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); if (close) ctx.closePath(); };
    g.line = (pts, c = 'k', w = 1.2, o = {}) => { if (pts.length < 2) return; ctx.save(); ctx.globalAlpha *= o.a == null ? 1 : o.a; ctx.strokeStyle = shade(c, 1); ctx.lineWidth = w; ctx.lineCap = ctx.lineJoin = 'round'; if (o.dash) ctx.setLineDash(o.dash); path2(pts, o.close); ctx.stroke(); ctx.restore(); };
    g.fill = (pts, c = 'a', o = {}) => { ctx.save(); ctx.globalAlpha *= o.a == null ? 1 : o.a; ctx.fillStyle = shade(c, o.f || 1); path2(pts, true); ctx.fill(); if (o.stroke) { ctx.strokeStyle = shade(o.stroke, 1); ctx.lineWidth = o.w || 0.8; ctx.lineJoin = 'round'; if (o.dash) ctx.setLineDash(o.dash); ctx.stroke(); } ctx.restore(); };
    g.dot = (p, c = 'a', r = 2.4, o = {}) => { const q = g.P(...p); ctx.save(); ctx.globalAlpha *= o.a == null ? 1 : o.a; ctx.fillStyle = shade(c, 1); ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 7); ctx.fill(); ctx.restore(); };
    g.arrow = (a, b, c = 'r', w = 1.5) => {
      const p = g.P(...a), q = g.P(...b), dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy); if (L < 1.5) return;
      const ux = dx / L, uy = dy / L, h = Math.min(5.5, L * 0.6); ctx.save(); ctx.strokeStyle = ctx.fillStyle = shade(c, 1); ctx.lineWidth = w; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0] - ux * h * 0.7, q[1] - uy * h * 0.7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0] - ux * h - uy * h * 0.55, q[1] - uy * h + ux * h * 0.55); ctx.lineTo(q[0] - ux * h + uy * h * 0.55, q[1] - uy * h - ux * h * 0.55); ctx.closePath(); ctx.fill(); ctx.restore();
    };
    g.text = (x, y, s, c = 'k', size = 8, align = 'center') => { ctx.save(); ctx.font = `650 ${size}px Inter, system-ui, sans-serif`; ctx.fillStyle = shade(c, 1); ctx.textAlign = align; ctx.fillText(s, x, y); ctx.restore(); };
    g.chip = (s, c = 'a') => { ctx.save(); ctx.font = '650 9px Inter, system-ui, sans-serif'; const w = ctx.measureText(s).width + 12; ctx.fillStyle = 'rgba(255,255,255,.86)'; ctx.strokeStyle = shade(c, 1); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(7, AH - 21, w, 15, 7) : ctx.rect(7, AH - 21, w, 15); ctx.fill(); ctx.stroke(); ctx.fillStyle = shade(c, 0.8); ctx.textAlign = 'left'; ctx.fillText(s, 13, AH - 10.5); ctx.restore(); };
    g.ground = (w = 40, d = 30, z = 0, c = 'n') => g.fill([[-w / 2, -d / 2, z], [w / 2, -d / 2, z], [w / 2, d / 2, z], [-w / 2, d / 2, z]], c, { a: 0.55, stroke: 'm', w: 0.6 });
    g.grid2 = (step = 10, ex = 40) => { for (let v = -ex; v <= ex; v += step) { g.line([[v, -ex], [v, ex]], 'n', 0.8); g.line([[-ex, v], [ex, v]], 'n', 0.8); } };
    g.plane = (z = 0, s = 22, c = 'a') => g.fill([[-s, -s, z], [s, -s, z], [s, s, z], [-s, s, z]], c, { a: 0.1, stroke: c, w: 0.8, dash: [3, 2] });
    g.sketch = (pts, c = 'a', w = 1.8, z = 0, o = {}) => g.line(pts.map(p => [p[0], p[1], z]), c, w, { close: true, ...o });
    g.ring = (cx, cy, z, r, c = 'k', w = 1.2, o = {}) => g.line(ngon(cx, cy, r, 28).map(p => [p[0], p[1], z]), c, w, { close: true, ...o });
    g.disc = (cx, cy, z, r, c = 'a', o = {}) => g.fill(ngon(cx, cy, r, 28).map(p => [p[0], p[1], z]), c, o);
    // a mouse pointer in screen pixels
    g.cursor = (x, y, press) => {
      ctx.save(); ctx.translate(x, y); if (press) ctx.scale(0.88, 0.88); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1f2a37'; ctx.lineWidth = 1.2; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 13); ctx.lineTo(3.4, 9.8); ctx.lineTo(6, 15.5); ctx.lineTo(8.3, 14.4); ctx.lineTo(5.8, 8.9); ctx.lineTo(10, 8.7); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (press) { ctx.strokeStyle = shade('a', 1); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 0, 6 + press * 4, 0, 7); ctx.globalAlpha = 1 - press; ctx.stroke(); }
      ctx.restore();
    };
    // draw in plain screen pixels (origin ox, oy, y DOWN, scale s) for a moment, e.g. a drawing sheet beside a 3D part
    g.in2d = (ox, oy, s, fn) => { const o = [g.ox, g.oy, g.s, g.flat, g.X, g.fy]; g.ox = ox; g.oy = oy; g.s = s; g.flat = true; g.X = null; g.fy = 1; try { fn(); } finally { [g.ox, g.oy, g.s, g.flat, g.X, g.fy] = o; } };
    // a click: a ring that opens out at p while t runs from a to b
    g.click = (p, a, b, c = 'a') => { const u = g.lin(a, b); if (u <= 0 || u >= 1) return; const q = g.P(...p); ctx.save(); ctx.strokeStyle = shade(c, 1); ctx.globalAlpha = 1 - u; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(q[0], q[1], 2 + 9 * u, 0, 7); ctx.stroke(); ctx.restore(); };
    g.cursorAt = (p, press) => { const q = g.P(...p); g.cursor(q[0], q[1], press); };

    /* solids: faces are shaded by their normal, hidden ones dropped, the rest drawn far → near */
    g.faces = (list, o = {}) => {
      const out = [];
      for (const f of list) {
        const v = f.v.map(p => g.X ? g.X(p[0], p[1], p[2]) : p);
        const n = unit(cross(sub(v[1], v[0]), sub(v[2], v[0]))), sum = n[0] + n[1] + n[2];
        let m = n;
        if (sum <= 1e-3) { if (!(o.both || f.both)) continue; m = [-n[0], -n[1], -n[2]]; }
        out.push({ v, c: f.c || o.c || 'n', f: f.f || 1, n: m, d: v.reduce((s, p) => s + p[0] + p[1] + p[2], 0) / v.length, e: f.e, holes: f.holes && f.holes.map(h => h.map(p => g.X ? g.X(p[0], p[1], p[2]) : p)) });
      }
      out.sort((a, b) => a.d - b.d);
      ctx.save(); ctx.globalAlpha *= o.a == null ? 1 : o.a; ctx.lineJoin = 'round';
      for (const f of out) {
        const sp = p => g.flat ? [g.ox + p[0] * g.s, g.oy + g.fy * p[1] * g.s] : [g.ox + (p[0] - p[1]) * 0.866 * g.s, g.oy + (p[0] + p[1]) * 0.5 * g.s - p[2] * g.s];
        ctx.beginPath(); f.v.forEach((p, i) => { const q = sp(p); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath();
        if (f.holes) for (const h of f.holes) { h.forEach((p, i) => { const q = sp(p); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath(); }
        ctx.fillStyle = shade(f.c, lit(f.n) * f.f); ctx.fill('evenodd');
        if (o.edge !== false && f.e !== false) { ctx.strokeStyle = o.ec ? shade(o.ec, 1) : 'rgba(52,64,80,.5)'; ctx.lineWidth = o.ew || 0.6; ctx.stroke(); }
        else if (o.edge !== false) { ctx.strokeStyle = shade(f.c, lit(f.n) * f.f); ctx.lineWidth = 0.5; ctx.stroke(); }
      }
      ctx.restore();
    };
    const sides = (pts, z0, z1, c, smooth) => { const out = []; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; out.push({ v: [[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]], c, e: smooth ? false : undefined }); } return out; };
    // an extruded outline (closed polygon [[x,y]…]) from z to z + h
    g.prism = (pts, z, h, c = 'n', o = {}) => {
      pts = ccw(pts); if (Math.abs(h) < 0.02) return;
      const lo = h > 0 ? z : z + h, hi = h > 0 ? z + h : z, list = sides(pts, lo, hi, c, o.smooth);
      const hs = (o.holes || []).filter(h => h.depth > 0.02);
      if (o.top !== false) list.push({ v: pts.map(p => [p[0], p[1], hi]), c, e: o.smooth ? false : undefined, holes: hs.map(h => ccw(h.pts).reverse().map(p => [p[0], p[1], hi])) });
      for (const h of hs) { const d = Math.min(h.depth, hi - lo), wall = sides(ccw(h.pts).reverse(), hi - d, hi, h.c || c, true); list.push(...wall); list.push({ v: ccw(h.pts).map(p => [p[0], p[1], hi - d]), c: h.c || c, f: 0.8, e: false }); }
      g.faces(list, o);
    };
    // an outline drawn on the YZ plane (axis 'x') or the ZX plane (axis 'y'), pushed along that axis from a to a + h
    g.axisPrism = (axis, pts, a, h, c = 'n', o = {}) => g.xf(axis === 'x' ? (u, v, w) => [w, u, v] : (u, v, w) => [v, w, u], () => g.prism(pts, a, h, c, o));
    // a solid between two outlines with the same number of points: A at height za, B at height zb (a draft, a loft, a taper)
    g.loft = (A, za, B, zb, c = 'n', o = {}) => {
      if (A.length !== B.length) return; if (area2(A) < 0) { A = A.slice().reverse(); B = B.slice().reverse(); }
      const list = []; for (let i = 0; i < A.length; i++) { const j = (i + 1) % A.length; list.push({ v: [[A[i][0], A[i][1], za], [A[j][0], A[j][1], za], [B[j][0], B[j][1], zb], [B[i][0], B[i][1], zb]], c, e: o.smooth ? false : undefined }); }
      if (o.top !== false) list.push({ v: B.map(p => [p[0], p[1], zb]), c, e: o.smooth ? false : undefined });
      g.faces(list, o);
    };
    g.box = (x, y, z, w, d, h, c = 'n', o = {}) => g.prism([[x, y], [x + w, y], [x + w, y + d], [x, y + d]], z, h, c, o);
    g.cyl = (cx, cy, z, r, h, c = 'n', o = {}) => g.prism(ngon(cx, cy, r, o.n || 22), z, h, c, { smooth: true, ...o });
    // a frustum (r0 at the bottom, r1 at the top; r1 = 0 is a cone)
    g.cone = (cx, cy, z, r0, r1, h, c = 'n', o = {}) => {
      const n = o.n || 22, A = ngon(cx, cy, r0, n), B = ngon(cx, cy, Math.max(r1, 0.001), n), list = [];
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; list.push({ v: [[A[i][0], A[i][1], z], [A[j][0], A[j][1], z], [B[j][0], B[j][1], z + h], [B[i][0], B[i][1], z + h]], c, e: false }); }
      if (r1 > 0.01) list.push({ v: B.map(p => [p[0], p[1], z + h]), c, e: false });
      g.faces(list, o);
    };
    g.sphere = (cx, cy, cz, r, c = 'm') => {
      const q = g.P(cx, cy, cz), R = r * g.s, k = rgb(c), gr = ctx.createRadialGradient(q[0] - R * 0.35, q[1] - R * 0.4, R * 0.1, q[0], q[1], R);
      gr.addColorStop(0, shade(k, 1.25)); gr.addColorStop(1, shade(k, 0.7)); ctx.save(); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(q[0], q[1], R, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(52,64,80,.45)'; ctx.lineWidth = 0.6; ctx.stroke(); ctx.restore();
    };
    // a solid of revolution: profile [[radius, height]…] turned about the vertical axis through (cx, cy) from a0 to a1 degrees
    g.rev = (profile, cx, cy, z, a0, a1, c = 'n', o = {}) => {
      const steps = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 15)), list = [];
      for (let k = 0; k < steps; k++) {
        const t0 = (a0 + (a1 - a0) * k / steps) * Math.PI / 180, t1 = (a0 + (a1 - a0) * (k + 1) / steps) * Math.PI / 180;
        for (let i = 0; i + 1 < profile.length; i++) {
          const [r0, h0] = profile[i], [r1, h1] = profile[i + 1], v = (r, h, t) => [cx + r * Math.cos(t), cy + r * Math.sin(t), z + h];
          list.push({ v: [v(r0, h0, t0), v(r0, h0, t1), v(r1, h1, t1), v(r1, h1, t0)], c, both: true, e: false });
        }
      }
      if (o.caps !== false && Math.abs(a1 - a0) < 359) {                                 // the two cut faces of a part-turned solid
        for (const t of [a0, a1]) { const tt = t * Math.PI / 180; list.push({ v: profile.map(([r, h]) => [cx + r * Math.cos(tt), cy + r * Math.sin(tt), z + h]), c: o.cap || c, both: true, f: 0.92 }); }
      }
      g.faces(list, { ...o, both: true, edge: o.edge });
    };
    // a ribbon / tube along a 3D path (a pipe, a sweep, a coil wire, a hose)
    g.tube = (pts, r, c = 'a', o = {}) => {
      const sides = o.n || 8, list = [];
      const ring = (p, d) => { const u = Math.abs(d[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1], a = unit(cross(d, u)), b = cross(d, a); return Array.from({ length: sides }, (_, k) => { const t = k * 2 * Math.PI / sides; return [p[0] + r * (a[0] * Math.cos(t) + b[0] * Math.sin(t)), p[1] + r * (a[1] * Math.cos(t) + b[1] * Math.sin(t)), p[2] + r * (a[2] * Math.cos(t) + b[2] * Math.sin(t))]; }); };
      const dirs = pts.map((p, i) => unit(sub(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)]))), rs = pts.map((p, i) => ring(p, dirs[i]));
      for (let i = 0; i + 1 < pts.length; i++) for (let k = 0; k < sides; k++) { const k2 = (k + 1) % sides; list.push({ v: [rs[i][k], rs[i + 1][k], rs[i + 1][k2], rs[i][k2]], c, both: true, e: false }); }
      g.faces(list, { both: true, ...o });
    };

    /* a stock block as a height map, so "cut" really removes material as the tool passes */
    g.stock = (id, o) => {
      const m = g.mem['stock:' + id]; if (m) return m;
      const res = o.res || 0.8, nx = Math.round(o.w / res), ny = Math.round(o.d / res), H = new Float32Array(nx * ny).fill(o.h), top = new Float32Array(nx * ny).fill(o.h);
      if (o.init) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const v = o.init(o.x0 + (i + 0.5) * res, o.y0 + (j + 0.5) * res); H[j * nx + i] = top[j * nx + i] = v; }
      const st = { x0: o.x0, y0: o.y0, w: o.w, d: o.d, h: o.h, res, nx, ny, H, top, c: o.c || 's', cutc: o.cutc || 'n', keep: o.keep || null, floor: o.floor || 0, last: -1 };
      // remove material under a tool of radius r whose tip is at (x, y, z); `prof` shapes the tip (ball, cone…)
      st.cut = (x, y, z, r, prof) => {
        const i0 = Math.max(0, Math.floor((x - r - st.x0) / res)), i1 = Math.min(nx - 1, Math.ceil((x + r - st.x0) / res)), j0 = Math.max(0, Math.floor((y - r - st.y0) / res)), j1 = Math.min(ny - 1, Math.ceil((y + r - st.y0) / res));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const cx = st.x0 + (i + 0.5) * res, cy = st.y0 + (j + 0.5) * res, d = Math.hypot(cx - x, cy - y); if (d > r) continue;
          if (st.keep && st.keep(cx, cy)) continue;
          const zz = z + (prof ? prof(d, r) : 0); if (zz < H[j * nx + i]) H[j * nx + i] = Math.max(st.floor, zz);
        }
      };
      st.draw = () => {
        // far rows first; each cell is a top plus the front and right walls where its neighbour is lower
        const c = rgb(st.c), cc = rgb(st.cutc), F = (col, f) => `rgb(${Math.min(255, col[0] * f) | 0},${Math.min(255, col[1] * f) | 0},${Math.min(255, col[2] * f) | 0})`;
        const kx = 0.866 * g.s, ky = 0.5 * g.s, oz = g.s;
        const X = (x, y) => g.ox + (x - y) * kx, Y = (x, y, z) => g.oy + (x + y) * ky - z * oz;
        ctx.save(); ctx.lineWidth = 0.4; ctx.lineJoin = 'round';
        const tf = g.X;                                            // stock scenes are not turned except the whole view
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const hi = j * nx + i, h = H[hi], x = st.x0 + i * res, y = st.y0 + j * res, fresh = h < top[hi] - 0.05, col = fresh ? cc : c;
          const hy = j + 1 < ny ? H[hi + nx] : st.floor, hx = i + 1 < nx ? H[hi + 1] : st.floor;
          if (hy < h) { ctx.fillStyle = F(col, 0.78); ctx.beginPath(); ctx.moveTo(X(x, y + res), Y(x, y + res, hy)); ctx.lineTo(X(x + res, y + res), Y(x + res, y + res, hy)); ctx.lineTo(X(x + res, y + res), Y(x + res, y + res, h)); ctx.lineTo(X(x, y + res), Y(x, y + res, h)); ctx.fill(); }
          if (hx < h) { ctx.fillStyle = F(col, 0.62); ctx.beginPath(); ctx.moveTo(X(x + res, y), Y(x + res, y, hx)); ctx.lineTo(X(x + res, y + res), Y(x + res, y + res, hx)); ctx.lineTo(X(x + res, y + res), Y(x + res, y + res, h)); ctx.lineTo(X(x + res, y), Y(x + res, y, h)); ctx.fill(); }
          const f = fresh ? 1.02 - Math.min(0.18, (top[hi] - h) * 0.03) : 0.97;
          ctx.fillStyle = ctx.strokeStyle = F(col, f); ctx.beginPath(); ctx.moveTo(X(x, y), Y(x, y, h)); ctx.lineTo(X(x + res, y), Y(x + res, y, h)); ctx.lineTo(X(x + res, y + res), Y(x + res, y + res, h)); ctx.lineTo(X(x, y + res), Y(x, y + res, h)); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        ctx.restore();
      };
      g.mem['stock:' + id] = st; return st;
    };
    // move a cutter along `path` up to fraction f, removing material on the way; returns the cutter position
    g.mill = (st, path, f, r, prof, zOff = 0) => {
      const a = along(path, f), step = Math.max(0.35, r * 0.35), dTo = a.d;
      if (st.sd == null) st.sd = 0;
      while (st.sd < dTo) { st.sd = Math.min(dTo, st.sd + step); const q = along(path, st.sd / a.len).p; st.cut(q[0], q[1], q[2] + zOff, r, prof); }
      st.cut(a.p[0], a.p[1], a.p[2] + zOff, r, prof);
      return a;
    };

    /* cutters, nozzles, wire: the tip is at (x, y, z), the body stands above it */
    g.tool = (kind, x, y, z, o = {}) => {
      const r = o.r || 2, len = o.len || 15, spin = (o.spin == null ? g.time * 9 : o.spin), c = o.c || 'm', hold = o.holder !== false;
      if (kind === 'wire') { g.line([[x, y, z - 9], [x, y, z + 26]], 'y', 1.4); g.line([[x, y, z - 9], [x, y, z + 26]], 'w', 0.5); g.dot([x, y, z + 26], 'k', 3); return; }
      if (kind === 'nozzle') { g.cone(x, y, z, 0.5, 2.2, 3.4, 'c'); g.cone(x, y, z + 3.4, 2.2, 3.6, 3, 'k'); g.box(x - 3.4, y - 3.4, z + 6.4, 6.8, 6.8, 9, 'k', {}); return; }
      let tipH = 0;
      if (kind === 'drill' || kind === 'tap' || kind === 'bore') { tipH = kind === 'drill' ? r * 0.6 : 0; if (tipH) g.cone(x, y, z, 0.05, r, tipH, c); }
      else if (kind === 'spot') { tipH = r * 0.5; g.cone(x, y, z, 0.05, r, tipH, c); }
      else if (kind === 'ball') { g.sphere(x, y, z + r, r, c); tipH = r; }
      else if (kind === 'cham') { tipH = r * 1.1; g.cone(x, y, z, 0.05, r * 1.45, tipH, c); }
      else if (kind === 'engrave') { tipH = r * 1.2; g.cone(x, y, z, 0.05, r * 0.8, tipH, c); }
      else if (kind === 'dove') { tipH = r * 0.8; g.cone(x, y, z, r * 1.4, r * 0.7, tipH, c); }
      const rr = kind === 'face' ? r : kind === 'cham' ? r * 1.45 : r;
      if (kind === 'face') { g.cyl(x, y, z, r, 2, 'k'); for (let k = 0; k < 6; k++) { const t = spin + k * Math.PI / 3; g.box(x + (r - 0.6) * Math.cos(t) - 0.6, y + (r - 0.6) * Math.sin(t) - 0.6, z - 0.2, 1.2, 1.2, 0.8, 'y'); } tipH = 2; }
      else if (kind === 'thread') { g.cyl(x, y, z + tipH, r * 0.55, r * 1.2, c); for (let k = 0; k < 5; k++) g.cyl(x, y, z + tipH + 0.4 + k * 0.7, r * 0.8, 0.35, c); tipH += r * 1.4; }
      const body = kind === 'face' ? 0 : len - tipH;
      if (body > 0) {
        g.cyl(x, y, z + tipH, kind === 'cham' ? r * 0.7 : kind === 'dove' ? r * 0.7 : kind === 'engrave' ? r * 0.8 : kind === 'thread' ? r * 0.55 : rr, body, c);
        // two flutes turning round the shank say "spinning"
        const R = kind === 'thread' ? r * 0.55 : rr;
        for (let f = 0; f < 2; f++) { const pts = []; for (let k = 0; k <= 8; k++) { const t = spin + f * Math.PI + k * 0.55, vis = Math.cos(t - Math.PI / 4); if (vis > 0.15) pts.push([x + R * Math.cos(t), y + R * Math.sin(t), z + tipH + 0.5 + (body - 1) * k / 8]); else if (pts.length > 1) break; } if (pts.length > 1) g.line(pts, 'k', 0.9, { a: 0.55 }); }
      }
      if (hold) { const top = z + (kind === 'face' ? 2 : len); g.cone(x, y, top, rr * 1.05, rr * 1.9, 3.2, 'k'); g.cyl(x, y, top + 3.2, rr * 1.9, 5, 'k'); }
    };
    return g;
  }

  /* ── registry and the shared player ── */
  const keyList = k => Array.isArray(k) ? k : String(k).includes('|') ? String(k).split('|').map(x => x.trim()).filter(Boolean) : String(k).split(/\s+/).filter(Boolean);   // names with spaces: separate keys with |
  function scene(keys, fn, o = {}) { for (const k of keyList(keys)) SCENES.set(k, { fn, dur: o.dur || 4.4, kind: o.kind || 'action' }); }
  const has = k => SCENES.has(k);
  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  function pic(key, fallback) {
    if (SCENES.has(key)) return `<div class="tip-anim tip-act" data-tipscene="${String(key).replace(/"/g, '&quot;')}"><canvas class="ta-cv" aria-hidden="true"></canvas></div>`;
    return typeof fallback === 'function' ? fallback() : (typeof fallback === 'string' ? fallback : '');
  }
  // draw one frame of a scene at progress t (0..1) onto any canvas; the player and the audit both use this
  function drawScene(key, cv, t, time) {
    const sc = SCENES.get(key); if (!sc) return false;
    const ctx = cv.getContext('2d'); ctx.setTransform(cv.width / AW, 0, 0, cv.width / AW, 0, 0);
    ctx.clearRect(0, 0, AW, AH);
    const bg = ctx.createLinearGradient(0, 0, 0, AH); bg.addColorStop(0, '#f8fafc'); bg.addColorStop(1, '#eef2f7'); ctx.fillStyle = bg; ctx.fillRect(0, 0, AW, AH);
    const st = cv.__g || (cv.__g = makeG(ctx)); st.ctx = ctx;
    if (st.lastT != null && t < st.lastT - 0.2) st.mem = {};                      // the loop restarted: start the scene fresh
    st.lastT = t; st.t = t; st.time = time == null ? t * sc.dur : time; st.X = null; st.flat = false; st.view(120, 122, 2.8);
    try { sc.fn(st); } catch (e) { ctx.fillStyle = '#d9443a'; ctx.font = '10px sans-serif'; ctx.fillText('scene error: ' + e.message, 8, 14); if (root.console) console.warn('TipAnim scene ' + key + ': ' + e.message); return false; }
    return true;
  }
  function start(rootEl) {
    stop();
    const slot = rootEl && rootEl.querySelector && rootEl.querySelector('[data-tipscene]');
    if (!slot) return LEG && LEG.start(rootEl);
    const key = slot.dataset.tipscene, cv = slot.querySelector('canvas'); if (!cv || !SCENES.has(key)) return;
    const dpr = Math.min(2, root.devicePixelRatio || 1), w = slot.clientWidth || 266; cv.width = Math.round(w * dpr); cv.height = Math.round(w * dpr * AH / AW); cv.__dpr = dpr;
    const sc = SCENES.get(key), id = ++seq, st = cur = { slot, cv, raf: 0, stop: false, id };
    if (reduced()) { drawScene(key, cv, 0.9, 0.9 * sc.dur); return; }              // reduced motion: the finished action as one still picture
    let t0 = 0, lastDraw = 0;   // the loop starts a little way in, so the tool is already at work when someone hovers for a moment
    const frame = now => {
      if (st.stop || cur !== st) return;
      if (!t0) t0 = now - 0.15 * sc.dur * 1000;
      if (now - lastDraw >= 30) {                                                  // ~33 fps is plenty for a hover picture
        lastDraw = now; const el = (now - t0) / 1000; drawScene(key, cv, (el % sc.dur) / sc.dur, el);
      }
      st.raf = requestAnimationFrame(frame);
    };
    drawScene(key, cv, 0, 0); st.raf = requestAnimationFrame(frame);
  }
  function stop() {
    if (cur) { cur.stop = true; cancelAnimationFrame(cur.raf); cur = null; }
    if (LEG) LEG.stop();
  }

  // add the mouse to an existing scene: it glides in from (x+46, y+38), presses (x, y) at fraction `at` of the loop, then stays
  function touch(keys, x, y, at = 0.5, from) {
    for (const k of Array.isArray(keys) ? keys : [keys]) {
      const sc = SCENES.get(k); if (!sc) continue; const fn = sc.fn;
      scene([k], g => {
        fn(g);
        const u = g.seg(0.02, at - 0.03), fx = from ? from[0] : x + 46, fy = from ? from[1] : y + 38, dn = g.lin(at - 0.03, at + 0.02), up = g.lin(at + 0.02, at + 0.3);
        g.cursor(lerp(fx, x, u) + 6 * up, lerp(fy, y, u) + 4 * up, dn > 0 && dn < 1 ? 1 - dn : 0);
        if (dn >= 1 && up < 0.6) g.cursor(x, y, 0);
      }, { dur: sc.dur, kind: sc.kind });
    }
  }

  const style = document.createElement('style');
  style.textContent = `.tip-act{margin:0}
.tip-act .ta-cv{display:block;width:100%;aspect-ratio:4/3;border-radius:10px;background:#f4f7fa;border:1px solid var(--rule,#e3e7ec)}`;
  (document.head || document.documentElement).appendChild(style);

  root.TipAnim = Object.assign({}, LEG || {}, {
    scene, touch, has, pic, start, stop, keys: () => [...SCENES.keys()], info: k => SCENES.get(k) || null, render: drawScene,
    legacyPics: LEG && LEG.pics, util: { clamp, lerp, ease: easeIO, easeO, ngon, along, head, shade, PAL }, AW, AH,
  });
})(typeof window !== 'undefined' ? window : this);
