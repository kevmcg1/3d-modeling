/* tip-scenes-cam.js: action scenes for the Manufacture tab (Mastercam-style toolpaths and the shop tools).
   Each toolpath scene runs a cutter of the right type through a small block of stock and removes the stock as the tool
   passes (g.stock / g.mill in tip-anim.js), so the cut part appears behind the tool exactly where the path went. */
(function (root) {
  'use strict';
  const A = root.TipAnim; if (!A) return;
  const S = A.scene, U = A.util, { lerp, clamp, ngon } = U;
  const TAU = Math.PI * 2;
  const CUTC = [236, 229, 214];
  const stock = (g, o = {}) => g.stock('s', { x0: -18, y0: -12, w: 36, d: 24, h: 8, res: 0.8, c: 's', cutc: CUTC, ...o });
  const dense = (pts, step = 0.8) => { const out = [pts[0]]; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], (b[2] || 0) - (a[2] || 0)) / step)); for (let k = 1; k <= n; k++) out.push([lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n), lerp(a[2] || 0, b[2] || 0, k / n)]); } return out; };
  const at = (pts, z) => pts.map(p => [p[0], p[1], z]);
  const loopRect = (x0, y0, x1, y1, z) => [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [x0, y0, z]];
  const zig = (x0, x1, y0, y1, z, step, vertical) => { const out = []; let k = 0; if (vertical) { for (let x = x0; x <= x1 + 0.01; x += step, k++) out.push(k % 2 ? [x, y1, z] : [x, y0, z], k % 2 ? [x, y0, z] : [x, y1, z]); } else for (let y = y0; y <= y1 + 0.01; y += step, k++) out.push(k % 2 ? [x1, y, z] : [x0, y, z], k % 2 ? [x0, y, z] : [x1, y, z]); return out; };
  const circle = (cx, cy, r, z, a0 = 0, a1 = TAU, n = 36) => Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos(lerp(a0, a1, i / n)), cy + r * Math.sin(lerp(a0, a1, i / n)), z]);
  const ball = (d, r) => r - Math.sqrt(Math.max(0, r * r - d * d));
  const cone = k => d => d * k;
  const dome = (x, y) => 2 + 5.4 * Math.sqrt(Math.max(0, 1 - (x * x / 150 + y * y / 80)));
  const withZ = (pts, f) => pts.map(p => [p[0], p[1], f(p[0], p[1])]);
  const dotsAt = (g, pts, c = 'g') => pts.forEach(p => g.dot(p, c, 2));
  const pathLine = (g, path, c = 'g') => g.line(path.map(p => [p[0], p[1], p[2] + 0.15]), c, 1, { a: 0.6, dash: [2, 2] });

  // draw the stock, the planned path (faint), the cutter at fraction f of the path, cutting as it goes
  function cut(g, st, path, kind, r, o = {}) {
    const f = o.f == null ? g.lin(o.a == null ? 0.08 : o.a, o.b == null ? 0.92 : o.b) : o.f;
    const a = g.mill(st, path, f, o.cr || r, o.prof, o.zOff || 0);
    st.draw(); if (o.show !== false) pathLine(g, path, o.pc || 'g');
    g.tool(kind, a.p[0], a.p[1], a.p[2] + (o.tipOff || 0), { r: o.vr || r, len: o.len || 15 });
    return a;
  }
  const camView = g => g.view(120, 122, 3);

  /* ── 2D milling ── */
  S('add:face', g => { camView(g); const st = stock(g); const path = dense(zig(-24, 24, -9, 9, 6.4, 5, false), 1); path.unshift([-24, -9, 12]); cut(g, st, path, 'face', 6, { vr: 6, cr: 6, len: 8 }); });
  S('add:contour', g => {
    camView(g); const part = (x, y) => x > -9 && x < 9 && y > -6 && y < 6, st = stock(g, { keep: part, floor: 0 });
    const r = 2, path = dense([[-14, -12, 11], [-14, -9.5, 11], ...loopRect(-11.5, -8.5, 11.5, 8.5, 0.2).slice(0, 1), ...loopRect(-11.5, -8.5, 11.5, 8.5, 0.2), [-11.5, -8.5, 6]], 0.8); path.splice(2, 0, [-11.5, -8.5, 8]);
    st.floor = 0; cut(g, st, path, 'end', r, { len: 14 });
  });
  S('add:chain', g => {
    camView(g); const st = stock(g, { floor: 0.5 }), chain = []; for (let i = 0; i <= 40; i++) { const u = i / 40; chain.push([-14 + 28 * u, 7 * Math.sin(u * 6.2) * (0.5 + u * 0.5), 3]); }
    const sel = g.lin(0, 0.25); if (g.t < 0.25) { g.ground(0, 0); st.draw(); g.line(chain.map(p => [p[0], p[1], 8.1]), 'a', 2.6, { a: 0.4 + 0.6 * sel }); g.cursorAt([lerp(-20, 0, g.seg(0, 0.2)), 8, 8.1], g.lin(0.18, 0.25)); return; }
    const path = [[-14, 0, 12], ...chain]; cut(g, st, path, 'end', 1.6, { a: 0.28, b: 0.92, show: false }); g.line(chain.map(p => [p[0], p[1], 8.1]), 'a', 1.6, { a: 0.8 });
  });
  const pocketPath = (z, w = 9, h = 5.5, step = 2.4) => { const out = []; for (let k = 0, y = -h; y <= h + 0.01; y += step, k++) { out.push(k % 2 ? [w, y, z] : [-w, y, z], k % 2 ? [-w, y, z] : [w, y, z]); } return out; };
  S('add:pocket', g => { camView(g); const st = stock(g, { floor: 0.5, keep: (x, y) => !(Math.abs(x) < 11 && Math.abs(y) < 7.5) }); const path = dense([[-9, -5.5, 11], ...pocketPath(3.2)], 0.8); cut(g, st, path, 'end', 2, {}); });
  S('add:clear', g => { camView(g); const st = stock(g, { floor: 0.5, init: (x, y) => (Math.abs(x) < 11 && Math.abs(y) < 7.5 && Math.hypot(Math.abs(x) - 9, Math.abs(y) - 5.5) < 3.2 && Math.abs(x) > 8 && Math.abs(y) > 4.5) ? 8 : (Math.abs(x) < 11 && Math.abs(y) < 7.5 ? 3 : 8) }); const cs = [[-9.5, -6.3], [9.5, -6.3], [9.5, 6.3], [-9.5, 6.3]]; const path = dense([[cs[0][0], cs[0][1], 11], ...cs.flatMap((c, i) => [[c[0], c[1], 3], [c[0], c[1], 3], [c[0], c[1], 11]].slice(0, 2)), [cs[0][0], cs[0][1], 3]], 0.7); const seq = []; cs.forEach(c => { seq.push([c[0], c[1], 11], [c[0], c[1], 3.1], [c[0], c[1], 11]); }); cut(g, st, dense(seq, 0.7), 'end', 1.3, { prof: null }); });
  S('add:chamfer', g => { camView(g); const st = stock(g, { x0: -16, y0: -10, w: 32, d: 20, res: 0.8, h: 8 }); const path = dense([[-18, -11.2, 12], [-18, -11.2, 4.4], [17.2, -11.2, 4.4], [17.2, 11.2, 4.4], [-17.2, 11.2, 4.4], [-17.2, -11.2, 4.4]], 0.8); cut(g, st, path, 'cham', 3.2, { prof: cone(1), cr: 3.4, tipOff: 0.0, len: 14 }); });
  S('add:engrave', g => {
    camView(g); const st = stock(g, { floor: 5.6 }); const letters = [[[-12, -4], [-12, 4], [-8, 4], [-8, 0], [-12, 0]], [[-4, -4], [-4, 4]], [[-4, 4], [0, 4], [0, -4], [-4, -4]], [[4, -4], [4, 4], [8, 4]], [[8, 0], [4, 0]]];
    const seq = []; letters.forEach(l => { seq.push([l[0][0], l[0][1], 9]); l.forEach(p => seq.push([p[0], p[1], 6.4])); seq.push([l[l.length - 1][0], l[l.length - 1][1], 9]); }); cut(g, st, dense(seq, 0.5), 'engrave', 1.1, { prof: cone(2.4), cr: 1.1, show: false, len: 12 });
  });
  S('add:dovetail add:dtrough', g => { camView(g); const st = stock(g, { x0: -18, y0: -12, w: 36, d: 24 }); const path = dense([[-20, 0, 8], [-20, 0, 4], [20, 0, 4]], 0.8); cut(g, st, path, 'dove', 3.5, { cr: 3.5, prof: d => Math.max(0, d - 1.6) * 0.6, len: 13 }); });
  S('add:wire mach:wire', g => {
    g.view(120, 126, 3); const keepIn = (x, y) => Math.hypot(x, y * 1.3) < 8, st = stock(g, { h: 6, floor: 0, keep: keepIn }); const path = dense(circle(0, 0, 10.2, 0, -1.5, 1.5 * Math.PI + 0.1, 48).map(p => [p[0] * 1, p[1] * 0.8, 0]), 0.5); path.unshift([-16, 0, 0]);
    const f = g.lin(0.1, 0.9), a = g.mill(st, path, f, 0.7, null, 0); st.draw(); g.tool('wire', a.p[0], a.p[1], 3); g.chip('Wire EDM: straight through', 'y');
  });

  /* ── drilling ── */
  const holes = [[-9, -3], [0, 4], [9, -3]];
  const drillSeq = (z0, z1, peck) => { const seq = []; holes.forEach(h => { seq.push([h[0], h[1], 12]); if (peck) { let z = 8; while (z > z1) { z = Math.max(z1, z - peck); seq.push([h[0], h[1], z], [h[0], h[1], z + 2]); } } seq.push([h[0], h[1], z1], [h[0], h[1], 12]); }); return seq; };
  const drillLike = (kind, r, z1, prof, peck) => g => { camView(g); const st = stock(g, { floor: 0 }); cut(g, st, dense(drillSeq(8, z1, peck), 0.6), kind, r, { prof, cr: r, len: 14, show: false }); holes.forEach(h => g.dot([h[0], h[1], 8.15], 'g', 0)); };
  S('add:drill:drill add:drill', drillLike('drill', 2.1, 0.5, cone(0.5), 0));
  S('add:drill:spot', drillLike('spot', 2.6, 6.8, cone(1), 0));
  S('add:drill:peck', g => drillLike('drill', 2.1, 0.5, cone(0.5), 2.4)(g));
  S('add:drill:tap', g => {
    camView(g); const st = stock(g, { init: (x, y) => 8 }); st.cut(0, 0, 0.5, 2.6, null); g.mem.tapped = true; const f = g.lin(0.1, 0.9), down = f < 0.5, z = down ? lerp(12, 1.5, f * 2) : lerp(1.5, 12, f * 2 - 1);
    st.draw(); const dz = 8 - clamp(down ? z : 1.5, 1.5, 8); for (let k = 0; k * 0.9 < dz; k++) g.ring(0, 0, 8 - k * 0.9, 2.7, 'k', 0.9, { a: 0.65 }); g.tool('tap', 0, 0, z, { r: 2.1, len: 12, spin: down ? g.time * 10 : -g.time * 10 }); g.chip(down ? 'Tap in at pitch feed' : 'Reverse out', 'a');
  });
  S('add:drill:cbore', g => {
    camView(g); const st = stock(g, { floor: 0 }); const f = g.lin(0.08, 0.92), one = f < 0.5; const d1 = [[0, 0, 12], [0, 0, 0.5], [0, 0, 12]], d2 = [[0, 0, 12], [0, 0, 5], [0, 0, 12]];
    if (one) cut(g, st, dense(d1, 0.5), 'drill', 2, { f: f * 2, cr: 2, prof: cone(0.5), show: false }); else { st.cut(0, 0, 0.5, 2, cone(0.5)); st.sd = 0; const a = g.mill(st, dense(d2, 0.5), (f - 0.5) * 2, 3.8, null); st.draw(); g.tool('end', a.p[0], a.p[1], a.p[2], { r: 3.8, len: 13 }); }
    g.chip(one ? 'Drill the hole' : 'Counterbore the head seat', 'a');
  });
  S('add:drill:bsf', g => {
    // the plate is drawn see-through so the cutter working on its underside shows
    g.view(120, 112, 3); const f = g.lin(0.1, 0.9), up = f < 0.5 ? f * 2 : 1 - (f - 0.5) * 2, cd = clamp((f - 0.3) * 3, 0, 1), zt = lerp(-14, 5.2, up);
    g.tool('end', 0, 0, zt, { r: 3.6, len: 15 });
    g.prism([[-14, -10], [14, -10], [14, 10], [-14, 10]], 6, 8, 'n', { a: 0.62, holes: [{ pts: ngon(0, 0, 2.2, 20), depth: 8 }] });
    g.ring(0, 0, 6, 3.6 * cd + 0.01, 'c', 2.2, { a: cd > 0 ? 1 : 0 }); g.chip('Cut from the back through the hole', 'a');
  });
  S('threads add:thread', g => {
    camView(g); const st = stock(g, {}); st.cut(0, 0, 0.5, 3.4, null); const f = g.lin(0.12, 0.88), turns = 5, n = 80, helix = Array.from({ length: n + 1 }, (_, i) => { const u = i / n; return [1.4 * Math.cos(TAU * turns * u), 1.4 * Math.sin(TAU * turns * u), lerp(1, 7, u)]; }), p = g.along(helix, f).p;
    st.draw(); const hd = g.head(helix.map(q => [q[0] * 2.4, q[1] * 2.4, q[2]]), f); g.line(hd, 'g', 1.6); g.tool('thread', p[0], p[1], p[2] - 0.5, { r: 2, len: 13 }); g.chip('Thread mill spirals up the hole', 'a');
  });

  /* ── 3D surfaces ── */
  const domeStock = g => g.stock('s', { x0: -18, y0: -12, w: 36, d: 24, h: 8, res: 0.8, c: 's', cutc: CUTC, init: (x, y) => Math.min(8, dome(x, y) + 1.6) });
  const domeCut = (g, path, o = {}) => { camView(g); const st = domeStock(g), r = o.r || 2; return cut(g, st, path, o.kind || 'ball', r, { prof: ball, cr: r, show: o.show, len: 14, zOff: -0.0, ...o }); };
  const domeRaster = (step = 2.2) => { const out = []; for (let k = 0, y = -9; y <= 9.01; y += step, k++) { const row = []; for (let x = -16; x <= 16.01; x += 1) row.push([x, y]); out.push(...(k % 2 ? row.reverse() : row)); } return withZ(dense(out.map(p => [p[0], p[1], 0]), 0.9), dome); };
  S('add:parallel add:surf', g => domeCut(g, domeRaster(2.4)));
  S('mc:radial', g => { const out = []; for (let k = 0; k < 14; k++) { const a = TAU * k / 14, row = [0, 1].map(i => [16 * Math.cos(a) * (i ? 1 : 0.05), 9.5 * Math.sin(a) * (i ? 1 : 0.05)]); out.push(...(k % 2 ? row.reverse() : row)); } domeCut(g, withZ(dense(out.map(p => [p[0], p[1], 0]), 0.9), dome)); });
  S('mc:spiral', g => { const out = []; for (let t = 0; t <= 6.5 * TAU; t += 0.12) { const k = t / (6.5 * TAU); out.push([17 * (1 - k) * Math.cos(t), 10 * (1 - k) * Math.sin(t), 0]); } domeCut(g, withZ(out, dome)); });
  S('mc:scallop', g => { const out = []; for (let k = 0; k < 6; k++) { const s = 1 - k * 0.17; for (let t = 0; t <= TAU + 0.05; t += 0.14) out.push([16 * s * Math.cos(t), 9.5 * s * Math.sin(t), 0]); } domeCut(g, withZ(out, dome)); });
  S('mc:project', g => { const out = []; for (let i = 0; i <= 60; i++) { const u = i / 60; out.push([-14 + 28 * u, 5 * Math.sin(u * 7), 0]); } domeCut(g, withZ(dense(out, 0.7), dome), { r: 1.2, kind: 'engrave', prof: (d, r) => d * 1.5, show: true }); });
  S('mc:pencil', g => {
    camView(g); const st = stock(g, { init: (x, y) => (Math.abs(x) < 10 && Math.abs(y) < 6) ? 6 : (Math.abs(x) < 10.8 && Math.abs(y) < 6.8 ? 4.4 : 3.2) }); const path = dense([[-10.4, -6.4, 9], ...loopRect(-10.4, -6.4, 10.4, 6.4, 3.6).slice(0, 1), ...loopRect(-10.4, -6.4, 10.4, 6.4, 3.6)], 0.8); cut(g, st, path, 'ball', 1.1, { prof: ball, show: true, len: 12 });
  });
  S('mc:rest', g => {
    camView(g); const big = g.lin(0, 0.45) < 1 && g.t < 0.45; const st = stock(g, { floor: 0.6, init: (x, y) => (Math.abs(x) < 12 && Math.abs(y) < 8 ? ((Math.hypot(Math.abs(x) - 9.4, Math.abs(y) - 5.4) < 3.4 && Math.abs(x) > 9.4 && Math.abs(y) > 5.4) ? 8 : 3) : 8) });
    const cs = [[-10.4, -6.6], [10.4, -6.6], [10.4, 6.6], [-10.4, 6.6]], seq = []; cs.forEach(c => seq.push([c[0], c[1], 11], [c[0], c[1], 3.1], [c[0], c[1], 11])); cut(g, st, dense(seq, 0.6), 'end', 1.2, { a: 0.1 }); g.chip('Small tool cleans what the big one left', 'a');
  });
  S('mc:dynamic', g => { camView(g); const st = stock(g, { floor: 0.5, keep: (x, y) => !(Math.abs(x) < 12 && Math.abs(y) < 7.5) }); const out = []; for (let t = 0; t <= 5 * TAU; t += 0.1) { const k = t / (5 * TAU), rx = 10.5 * k, ry = 6.2 * k; out.push([rx * Math.cos(t) + 1.2 * Math.cos(t * 9), ry * Math.sin(t) + 1.2 * Math.sin(t * 9), 3.2]); } cut(g, st, [[0, 0, 11], ...out], 'end', 2, { show: false }); g.chip('Adaptive path, constant tool load', 'a'); });
  S('mc:peel', g => { camView(g); const st = stock(g, { floor: 0.5, keep: (x, y) => !(Math.abs(x) < 12 && Math.abs(y) < 7.5) }); const out = []; for (let k = 0; k < 4; k++) { const s = 1 - k * 0.24; out.push(...loopRect(-11 * s, -6.8 * s, 11 * s, 6.8 * s, 3.2)); } cut(g, st, dense([[-11, -6.8, 11], ...out], 0.8), 'end', 2, {}); g.chip('Peel the pocket, layer by layer', 'a'); });
  S('mc:area add:pocket2', g => { camView(g); const isl = (x, y) => Math.hypot(x, y) < 3.4; const st = stock(g, { floor: 0.5, keep: (x, y) => !(Math.abs(x) < 12 && Math.abs(y) < 7.5) || isl(x, y) }); const path = dense([[-10, -6, 11], ...zig(-10, 10, -6, 6, 3.2, 2.6, false)], 0.8); cut(g, st, path, 'end', 2, {}); g.chip('Clear the area, keep the island', 'a'); });
  S('add:zrough', g => {
    camView(g); const st = domeStock(g); st.cut; const lv = [7.2, 5.6, 4.0, 2.4]; const seq = []; lv.forEach(z => { for (let t = 0; t <= TAU + 0.06; t += 0.12) { const s = Math.max(0.2, Math.sqrt(Math.max(0.0, 1 - Math.pow((z - 2) / 5.4, 2)))); seq.push([(15.5 * s + 2.2) * Math.cos(t), (9 * s + 2.2) * Math.sin(t), z]); } seq.push([seq[seq.length - 1][0], seq[seq.length - 1][1], 9]); });
    cut(g, st, seq.reverse().reverse(), 'end', 2, { show: false });
  });
  S('add:waterline', g => {
    camView(g); const st = domeStock(g); const lv = [6.8, 5.4, 4, 2.8]; const seq = []; lv.forEach(z => { const s = Math.sqrt(Math.max(0, 1 - Math.pow((z - 2) / 5.4, 2))); for (let t = 0; t <= TAU + 0.06; t += 0.12) seq.push([15.2 * s * Math.cos(t) * 1 + 0, 8.8 * s * Math.sin(t) + 0, z]); });
    cut(g, st, seq, 'ball', 1.8, { prof: ball, show: false });
  });

  /* ── setup, program, verify, post ── */
  S('setup', g => {
    camView(g); const u = g.seg(0.15, 0.6); g.box(-8, -6, 0, 16, 12, 8, 'a'); const w = 6 * u; g.line([[-14, -11, 0], [14, -11, 0], [14, 11, 0], [-14, 11, 0], [-14, -11, 0]].map(p => [p[0] * u + p[0] * (1 - u) * 0.0, p[1] * u, 0]), 'c', 1.6, { a: u });
    g.ctx.save(); g.ctx.globalAlpha = 0.5 * u; g.box(-14 * u - 0.01, -11 * u - 0.01, 0, 28 * u + 0.02, 22 * u + 0.02, 8 + 3 * u, 's', { edge: true }); g.ctx.restore();
    if (g.t > 0.55) { const k = g.seg(0.55, 0.85); g.arrow([-14, -11, 0], [-14 + 9 * k, -11, 0], 'r', 1.6); g.arrow([-14, -11, 0], [-14, -11 + 9 * k, 0], 'g', 1.6); g.arrow([-14, -11, 0], [-14, -11, 9 * k], 'a', 1.6); g.dot([-14, -11, 0], 'k', 2.6); }
  });
  S('tools', g => {
    g.view(120, 118, 3); const u = g.seg(0.15, 0.55); g.box(-24, -4, -2, 48, 8, 2, 'k'); const kinds = ['end', 'ball', 'drill', 'cham', 'face']; kinds.forEach((k, i) => { const x = -17 + i * 8.5, a = clamp(u * 5.5 - i); if (a > 0) g.tool(k, x, 0, lerp(30, 0, g.ease(a)) , { r: k === 'face' ? 3.6 : 2.2, len: 12, holder: false, spin: 0.4 }); }); const sel = Math.floor(g.lin(0.6, 0.95) * 4.999); if (g.t > 0.6) g.ring(-17 + sel * 8.5, 0, 0, 5, 'c', 1.6, { a: 0.9 });
  });
  S('flow:new', g => {
    camView(g); const st = stock(g, { floor: 0.5, keep: (x, y) => !(Math.abs(x) < 11 && Math.abs(y) < 7) }); const steps = ['Pick the geometry', 'Pick the tool', 'Set depths'], k = Math.floor(g.lin(0, 0.5) * 2.999); if (g.t < 0.5) { st.draw(); g.line(loopRect(-11, -7, 11, 7, 8.1), g.t > 0.12 ? 'a' : 'm', 2.4); g.chip((k + 1) + '. ' + steps[k], 'a'); g.cursorAt([lerp(-20, -11, g.seg(0, 0.15)), -7, 8.1], g.lin(0.12, 0.2)); return; }
    cut(g, st, dense([[-9, -5, 11], ...pocketPath(3.2, 9, 5, 2.4)], 0.8), 'end', 2, { a: 0.52, b: 0.95 }); g.chip('Toolpath created', 'g');
  });
  S('auto', g => {
    camView(g); g.prism([[-14, -10], [14, -10], [14, 10], [-14, 10]], 0, 8, 'n', { holes: [{ pts: ngon(-7, 0, 2.4, 20), depth: 8 }, { pts: R(9, 7, -1, 0), depth: 3 }, { pts: ngon(8, 3, 2, 18), depth: 8 }] });
    const feat = [[-7, 0], [1, 0], [8, 3]], k = Math.floor(g.lin(0.1, 0.9) * 2.999); for (let i = 0; i <= k; i++) { g.ring(feat[i][0], feat[i][1], 8.2, 4.6, 'c', 1.8); g.dot([feat[i][0], feat[i][1], 8.3], 'c', 2); } const sc = g.lin(0.05, 0.9); g.line([[-14 + 28 * sc, -11, 8.2], [-14 + 28 * sc, 11, 8.2]], 'g', 1.4, { a: 0.8 }); g.chip(['Hole found', 'Pocket found', 'Hole found'][k], 'c');
    function R(w, d, cx, cy) { return [[cx - w / 2 + 2, cy - d / 2], [cx + w / 2 + 2, cy - d / 2], [cx + w / 2 + 2, cy + d / 2], [cx - w / 2 + 2, cy + d / 2]]; }
  });
  S('autoprog', g => {
    g.view(120, 118, 3); g.fill([[-40, 26], [40, 26], [40, -30], [-40, -30]].map(p => [p[0] * 0.01, p[1] * 0.01]), 'w', { a: 0 }); const ops = [['Face', 'a'], ['Contour', 'g'], ['Pocket', 'c'], ['Drill', 'r'], ['Tap', 'p']];
    g.in2d(0, 0, 1, () => { g.fill([[60, 24], [180, 24], [180, 150], [60, 150]], 'w', { a: 0.97, stroke: 'm' }); ops.forEach(([n, c], i) => { const a = clamp(g.lin(0.1, 0.85) * 5.4 - i); if (a > 0) { g.fill([[68, 34 + i * 22], [172 * 0 + 68 + 104 * g.ease(a), 34 + i * 22], [68 + 104 * g.ease(a), 52 + i * 22], [68, 52 + i * 22]], c, { a: 0.18, stroke: c }); g.text(76, 47 + i * 22, i + 1 + '  ' + n, c, 9, 'left'); } }); });
  });
  S('verify', g => {
    camView(g); const st = stock(g, { floor: 0.5, keep: (x, y) => !(Math.abs(x) < 11 && Math.abs(y) < 7) }); const path = dense([[-9, -5, 11], ...pocketPath(3.2, 9, 5, 2.4)], 0.9), f = g.lin(0.08, 0.8); cut(g, st, path, 'end', 2, { f, show: false }); if (g.t > 0.82) { g.fill([[-6, 14, 14], [6, 14, 14], [6, 14, 14]], 'g', { a: 0 }); g.chip('✓ No collisions, within the stock', 'g'); } else g.chip('Checking the path…', 'a');
  });
  S('sim', g => {
    camView(g); const st = stock(g, { floor: 0.5, keep: (x, y) => !(Math.abs(x) < 11 && Math.abs(y) < 7) }); const path = dense([[-9, -5, 11], ...pocketPath(3.2, 9, 5, 2.4)], 0.8), f = g.lin(0.08, 0.92); cut(g, st, path, 'end', 2, { f, show: false });
    g.in2d(0, 0, 1, () => { g.fill([[16, 164], [224, 164], [224, 172], [16, 172]], 'n', { stroke: 'm', w: 0.6 }); g.fill([[16, 164], [16 + 208 * f, 164], [16 + 208 * f, 172], [16, 172]], 'a'); g.dot([16 + 208 * f, 168], 'a', 5, {}); });
  });
  S('post', g => {
    g.view(120, 118, 3); const lines = ['%', 'O1001', 'G90 G54 G17', 'T1 M6', 'S8000 M3', 'G0 X-9. Y-5.', 'G1 Z-3. F300', 'G1 X9. F900', 'Y-2.5', 'X-9.', 'M30', '%'], n = Math.floor(g.lin(0.1, 0.9) * lines.length);
    g.in2d(0, 0, 1, () => { g.fill([[44, 14], [196, 14], [196, 150], [44, 150]], 'w', { a: 0.98, stroke: 'm' }); lines.slice(0, n).forEach((s, i) => g.text(54, 30 + i * 10.5, s, i === n - 1 ? 'a' : 'k', 8.5, 'left')); g.fill([[44, 14], [196, 14], [196, 20], [44, 20]], 'a', { a: 0.15 }); g.text(54, 19.4, 'program.nc', 'a', 6.5, 'left'); });
  });
  S('ws:sheet sheetfill', g => {
    g.view(120, 118, 3); const u = g.lin(0.1, 0.85);
    g.in2d(0, 0, 1, () => { g.fill([[50, 10], [190, 10], [190, 160], [50, 160]], 'w', { a: 0.99, stroke: 'm', w: 1 }); g.text(60, 26, 'SETUP SHEET', 'k', 9, 'left'); g.fill([[60, 36], [180, 36], [180, 36.6], [60, 36.6]], 'k', { a: 0.6 }); ['Tool 1  Ø12 flat', 'Tool 2  Ø6 drill', 'Op 1  Face', 'Op 2  Pocket', 'Op 3  Drill', 'Cycle 4:12'].forEach((s, i) => { if (u * 6.5 > i) g.text(60, 52 + i * 14, s, 'k', 8.5, 'left'); }); });
  });
  S('tocam', g => { camView(g); g.in2d(0, 0, 1, () => { g.fill([[60, 40], [180, 40], [180, 140], [60, 140]], 'w', { a: 0.95, stroke: 'm' }); }); const u = g.seg(0.2, 0.7); g.arrow([20 * 0 + 2, 0, 0], [-10 * u, 0, 0], 'a', 2.2); g.cursorAt([8 - 14 * u, 0, 0], g.lin(0.6, 0.75)); });
  S('jaws', g => {
    camView(g); const u = g.seg(0.1, 0.4), v = g.seg(0.5, 0.85); g.box(-20, -10, 0, 8, 20, 12, 'm'); g.box(12, -10, 0, 8, 20, 12, 'm'); g.box(-22, -10, -3, 44, 20, 3, 'k');
    g.prism([[-12, -4], [-6, -4], [-6, 4], [-12, 4]], 6, 0.01, 'n'); g.ctx.save(); g.ctx.restore(); const pz = lerp(26, 7, v); g.box(-6, -5, pz, 12, 10, 6, 'a'); g.ring(0, 0, 12.1, 0.01, 'k', 0); g.chip(g.t < 0.45 ? 'Machine the jaw pocket' : 'Part drops in, held by its own shape', 'a'); if (g.t < 0.45) g.tool('end', -16 + 32 * 0 + 0, 0, 12 - 4 * u, { r: 2.4, len: 13 });
  });
  S('mach:mill', g => {
    camView(g); const st = stock(g, { floor: 0.5, keep: (x, y) => !(Math.abs(x) < 11 && Math.abs(y) < 7) }); cut(g, st, dense([[-9, -5, 11], ...pocketPath(3.2, 9, 5, 2.4)], 0.8), 'end', 2, { show: false }); g.chip('3-axis mill: Haas VF', 'a');
  });
  S('mach:umc400', g => {
    g.view(120, 124, 3); const tilt = 35 * Math.sin(g.t * TAU), rot = g.t * 360; g.turn('y', tilt, [0, 0, 0], () => g.turn('z', rot * 0.5, [0, 0, 4], () => { g.cyl(0, 0, -2, 12, 2, 'k'); g.prism([[-6, -4], [6, -4], [6, 4], [-6, 4]], 0, 9, 'a'); })); g.tool('end', 0, 0, 12, { r: 2, len: 14 }); g.chip('5-axis: table tilts and turns', 'a');
  });
  S('sbPlay', g => { camView(g); const st = stock(g, { floor: 0.5, keep: (x, y) => !(Math.abs(x) < 11 && Math.abs(y) < 7) }); cut(g, st, dense([[-9, -5, 11], ...pocketPath(3.2, 9, 5, 2.4)], 0.8), 'end', 2, { show: false }); });
  S('sbCode', g => { g.view(120, 118, 3); const lines = ['G0 X-9. Y-5.', 'G1 Z-3. F300', 'G1 X9. F900', 'Y-2.5', 'X-9.', 'Y0.', 'X9.'], k = Math.floor(g.lin(0.1, 0.9) * 6.99); g.in2d(0, 0, 1, () => { g.fill([[44, 20], [196, 20], [196, 150], [44, 150]], 'w', { a: 0.98, stroke: 'm' }); lines.forEach((s, i) => { if (i === k) g.fill([[46, 28 + i * 14], [194, 28 + i * 14], [194, 40 + i * 14], [46, 40 + i * 14]], 'a', { a: 0.2 }); g.text(54, 38 + i * 14, s, i === k ? 'a' : 'k', 9, 'left'); }); }); });
  S('sbHeat', g => { camView(g); const st = domeStock(g); const f = g.lin(0.1, 0.9); const path = domeRaster(2.4); cut(g, st, path, 'ball', 2, { prof: ball, f, show: false }); g.chip('Load: red = heavy cut', 'r'); });

  /* ── the labs and the physics toys ── */
  S('lab:chips phy:chips', g => {
    camView(g); const st = stock(g, { floor: 4, h: 8 }); const path = dense([[-20, 0, 4.5], [20, 0, 4.5]], 0.6), a = cut(g, st, path, 'end', 2, { show: false }); for (let k = 0; k < 9; k++) { const t = (g.time * 0.9 + k / 9) % 1, ch = [a.p[0] - 3 - t * 8, a.p[1] + 2 + Math.sin(k) * 3, 5 + 5 * Math.sin(t * Math.PI) - t * 2]; g.dot(ch, 'c', 2.2 - t); }
  });
  S('lab:fluid phy:fluid phy:hose', g => {
    camView(g); g.box(-8, -6, 0, 16, 12, 6, 'a'); g.tool('end', 0, 0, 6, { r: 2, len: 14 }); for (let k = 0; k < 14; k++) { const t = (g.time * 1.2 + k / 14) % 1, side = k % 2 ? 1 : -1, p = [side * (14 - 12 * t), 4 * (k % 3 - 1) * t, 20 - 14 * t * t - 6 * t]; g.dot(p, 't', 1.8); } g.cyl(-14, 0, 18, 1, 6, 'k'); g.cyl(14, 0, 18, 1, 6, 'k');
  });
  S('lab:mech phy:mech', g => {
    camView(g); const sp = g.time * 1.4, gear = (x, r, n, ph, c) => { const pts = []; for (let i = 0; i < n * 2; i++) { const a = ph + TAU * i / (n * 2), rr = i % 2 ? r : r + 1.8; pts.push([x + rr * Math.cos(a), rr * Math.sin(a)], [x + rr * Math.cos(a + TAU / (n * 4)), rr * Math.sin(a + TAU / (n * 4))]); } g.prism(pts, 0, 3, c, { holes: [{ pts: ngon(x, 0, 1.4, 12), depth: 3 }] }); }; gear(-8, 7, 10, sp, 'a'); gear(8.3, 7, 10, -sp + Math.PI / 10, 'g');
  });
  S('lab:lathe phy:lathe', g => {
    g.view(120, 118, 3); const f = g.lin(0.1, 0.9), spin = g.time * 8; g.turn('y', 90, [0, 0, 0], () => 0); const R0 = 6, rc = lerp(6, 4.2, g.seg(0.15, 0.9)); const prof = [[0, -16], [R0, -16], [R0, 16 - 32 * (1 - f)], [rc, 16 - 32 * (1 - f)], [rc, 16], [0, 16]]; g.turn('y', 90, [0, 0, 0], () => g.rev([[0, -16], [rc, -16], [rc, 16], [0, 16]], 0, 0, 0, 0, 360, 's', { edge: false })); const x = lerp(-16, 16, f); g.move(x, 0, 0, () => g.box(-1.5, 7, 4, 3, 6, 3, 'm')); for (let k = 0; k < 6; k++) { const a = spin + k * 1.05; g.line([[-16, 6.2 * Math.cos(a), 6.2 * Math.sin(a)], [16, 6.2 * Math.cos(a), 6.2 * Math.sin(a)]], 'k', 0.6, { a: 0.0 }); }
  });
  S('lab:shop phy:shop', g => {
    camView(g); g.box(-12, -8, 0, 24, 16, 8, 'a'); const u = g.seg(0.2, 0.55), v = g.seg(0.6, 0.8); const z = lerp(24, 8.6, u); g.cyl(0, 0, z, 0.8, 12, 'k'); g.sphere(0, 0, z, 1.3, 'r'); if (g.t > 0.55) { g.dot([0, 0, 8.2], 'g', 3); g.chip('Touch-off: Z = 0 set', 'g'); } else g.chip('Probe finds the top', 'a');
  });
  S('phy:sticks', g => { camView(g); const t = g.lin(0.1, 0.9); for (let k = 0; k < 5; k++) { const a = 0.5 + k * 0.6, z = Math.max(1, 20 - 40 * t * t - k * 0.0); g.turn('z', a * 57, [0, 0, 0], () => g.box(-6 + k * 1.5, -0.6, Math.max(0.6, 24 - 40 * Math.min(1, t * (1.3 - k * 0.1)) ** 2), 12, 1.2, 1.2, k % 2 ? 'a' : 'c')); } g.box(-20, -12, -1, 40, 24, 1, 'n'); });
  S('phy:marbles', g => { camView(g); g.box(-20, -12, -1, 40, 24, 1, 'n'); const t = g.lin(0.05, 0.95); for (let k = 0; k < 5; k++) { const tt = clamp(t * 1.4 - k * 0.12), z = Math.abs(Math.cos(tt * 8 + k)) * 12 * (1 - tt) + 1.6; g.sphere(-12 + k * 6, -6 + (k % 3) * 5 + tt * 8, z, 1.8, ['a', 'c', 'g', 'r', 'p'][k]); } });
  S('phy:drone', g => { camView(g); const t = g.time; const x = 10 * Math.cos(t * 1.1), y = 6 * Math.sin(t * 1.1), z = 12 + 2 * Math.sin(t * 2); g.ctx.save(); g.ctx.globalAlpha = 0.25; g.box(x - 3, y - 3, 0, 6, 6, 0.4, 'k'); g.ctx.restore(); g.box(x - 2, y - 2, z, 4, 4, 1.4, 'k'); [[-4, -4], [4, -4], [4, 4], [-4, 4]].forEach(([dx, dy], i) => { g.line([[x, y, z + 0.7], [x + dx, y + dy, z + 0.7]], 'k', 1.2); const a = t * 30 + i; g.line([[x + dx - 2.4 * Math.cos(a), y + dy - 2.4 * Math.sin(a), z + 1.2], [x + dx + 2.4 * Math.cos(a), y + dy + 2.4 * Math.sin(a), z + 1.2]], 'a', 1.4); }); });
  S('phy:waterjet', g => { camView(g); const st = stock(g, { h: 6, floor: 0 }); const path = dense(circle(0, 0, 8, 0, 0, TAU, 40), 0.6); path.unshift([-16, 0, 0]); const f = g.lin(0.1, 0.9), a = g.mill(st, path, f, 0.9, null, 0); st.draw(); g.line([[a.p[0], a.p[1], 22], [a.p[0], a.p[1], 0]], 't', 1.8); g.dot([a.p[0], a.p[1], 0], 'w', 2.2); g.cyl(a.p[0], a.p[1], 22, 1.2, 4, 'k'); });
})(typeof window !== 'undefined' ? window : this);
