/* tip-scenes-model.js: action scenes for the Design tab's 3D modeling tools (Fusion-style).
   Each one plays the tool being used on a small part: the profile is extruded, the edge is rolled round, the hole is cut. */
(function (root) {
  'use strict';
  const A = root.TipAnim; if (!A) return;
  const S = A.scene, U = A.util, { lerp, clamp, ngon } = U;
  const TAU = Math.PI * 2;
  const R = (w, d) => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  const PROF = [[-10, -7], [10, -7], [10, 3], [3, 3], [3, 7], [-10, 7]];
  const z0 = p => [p[0], p[1], 0];
  const pulse = (g, a, b) => { const u = g.lin(a, b); return u > 0 && u < 1 ? u : 0; };
  const rectRing = (w, d, n = 32) => Array.from({ length: n }, (_, i) => { const t = TAU * i / n, c = Math.cos(t), s = Math.sin(t), k = Math.min(w / 2 / Math.max(Math.abs(c), 1e-6), d / 2 / Math.max(Math.abs(s), 1e-6)); return [c * k, s * k]; });
  const mixRing = (A1, B1, u) => A1.map((p, i) => [lerp(p[0], B1[i][0], u), lerp(p[1], B1[i][1], u)]);
  const bigView = (g, oy = 128, s = 3) => g.view(120, oy, s);
  const label = (g, p, s, c = 'r') => { const q = g.P(...p); g.text(q[0], q[1], s, c, 9); };
  const ghost = (g, fn) => { g.ctx.save(); g.ctx.globalAlpha = 0.28; fn(); g.ctx.restore(); };
  const dashBox = (g, x, y, z, w, d, h) => { const c = [[x, y], [x + w, y], [x + w, y + d], [x, y + d]]; for (const zz of [z, z + h]) g.line(c.map(p => [p[0], p[1], zz]), 'm', 0.9, { close: true, dash: [3, 2] }); c.forEach(p => g.line([[p[0], p[1], z], [p[0], p[1], z + h]], 'm', 0.9, { dash: [3, 2] })); };
  const thick = (path, t) => { const L = [], Rr = []; path.forEach((p, i) => { const a = path[Math.min(i + 1, path.length - 1)], b = path[Math.max(i - 1, 0)], dx = a[0] - b[0], dy = a[1] - b[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * t / 2, ny = dx / l * t / 2; L.push([p[0] + nx, p[1] + ny]); Rr.push([p[0] - nx, p[1] - ny]); }); return L.concat(Rr.reverse()); };

  /* ── sketch → solid ── */
  S('extrude', g => {
    bigView(g, 138); const p = g.seg(0.2, 0.65), H = 14 * p;
    g.plane(0, 18, 'a'); if (p < 0.01) { g.fill(PROF.map(z0), 'a', { a: 0.2 }); g.sketch(PROF, 'a', 2); } else g.prism(PROF, 0, H, 'a');
    g.arrow([0, 0, H], [0, 0, H + 10], 'r', 1.8); if (p > 0.05) label(g, [0, 0, H + 14], Math.round(H * 10) / 10 + ' mm');
    g.cursorAt([0, 0, H + 10], pulse(g, 0.12, 0.22));
  });
  S('f:revolve', g => {
    bigView(g, 132, 3); const prof = [[3, 0], [11, 0], [11, 4], [7, 4], [7, 12], [3, 12]], a = 330 * g.seg(0.25, 0.8);
    g.line([[0, 0, -3], [0, 0, 18]], 'k', 1, { dash: [4, 2] });
    if (a < 1) { g.fill(prof.map(([r, h]) => [r, 0, h]), 'a', { a: 0.25, stroke: 'a', w: 1.8 }); } else g.rev(prof, 0, 0, 0, 0, a, 'a', { cap: 'a' });
    if (a >= 1) { g.rev(prof, 0, 0, 0, 0, a, 'a', { cap: 'a' }); g.fill(prof.map(([r, h]) => [r * Math.cos(a * Math.PI / 180), r * Math.sin(a * Math.PI / 180), h]), 'a', { a: 0.5, stroke: 'a', w: 1.6 }); }
    g.line(U.ngon(0, 0, 15, 36).slice(0, 1).concat([]).map(p => [p[0], p[1], 0]), 'r', 0);
    const aa = a * Math.PI / 180; g.line(Array.from({ length: 24 }, (_, i) => [15 * Math.cos(aa * i / 23), 15 * Math.sin(aa * i / 23), 14]), 'r', 1.5);
    g.arrow([15 * Math.cos(aa - 0.12), 15 * Math.sin(aa - 0.12), 14], [15 * Math.cos(aa), 15 * Math.sin(aa), 14], 'r', 1.5);
  });
  S('f:sweep', g => {
    bigView(g, 122, 2.6); const path = Array.from({ length: 40 }, (_, i) => { const u = i / 39; return [-18 + 36 * u, 9 * Math.sin(u * Math.PI * 1.3), 12 * u]; }), f = g.seg(0.2, 0.85);
    g.line(path, 'r', 1.4, { dash: [3, 2] }); const hd = g.head(path, f); if (hd.length > 1) g.tube(hd, 2.4, 'a', { n: 10 });
    const p0 = path[0]; g.ring(p0[0], p0[1], p0[2], 2.6, 'a', 1.6); const e = g.along(path, f).p; g.dot(e, 'r', 2.4); g.cursorAt(e, 0);
  });
  S('f:loft', g => {
    bigView(g, 138, 3); const Rc = rectRing(22, 14), Cc = ngon(0, 0, 6, 32), H = 18, p = g.seg(0.2, 0.8);
    g.ring(0, 0, H, 6, 'a', 1.6, { dash: [3, 2] }); g.sketch(Rc, 'a', 1.6, 0);
    const steps = 14; for (let k = 0; k < steps; k++) { const u0 = k / steps, u1 = (k + 1) / steps; if (u0 >= p) break; const u1c = Math.min(u1, p); g.loft(mixRing(Rc, Cc, u0), H * u0, mixRing(Rc, Cc, u1c), H * u1c, 'a', { smooth: true, top: u1c >= 0.999 || u1 > p }); }
    g.dot([0, 0, H * p], 'r', 2.4);
  });
  S('f:coil', g => {
    bigView(g, 138, 2.8); const f = g.seg(0.15, 0.85), pts = Array.from({ length: 90 }, (_, i) => { const u = i / 89; return [9 * Math.cos(TAU * 3 * u), 9 * Math.sin(TAU * 3 * u), 20 * u]; });
    g.line([[0, 0, -2], [0, 0, 24]], 'k', 1, { dash: [4, 2] }); const hd = g.head(pts, f); if (hd.length > 2) g.tube(hd, 1.6, 'a', { n: 8 }); g.dot(g.along(pts, f).p, 'r', 2.4);
  });
  S('f:hole', g => {
    bigView(g, 130, 3); const p = g.seg(0.2, 0.7), d = 10 * p; g.prism(R(26, 20), 0, 10, 'n', { holes: [{ pts: ngon(2, 0, 4.5, 24), depth: d }] });
    g.tool('drill', 2, 0, 10 - d, { r: 4.5, len: 14 });
    g.click([2, 0, 10], 0.05, 0.2);
  });
  S('f:gear', g => {
    bigView(g, 132, 2.8); const n = 12, k = g.seg(0.25, 0.85) * n, tooth = (i, full) => { const a = TAU * i / n, h = TAU / n / 4, ro = 12, ri = 9.4; return full ? [[ri, a - 2 * h], [ro, a - h * 0.8], [ro, a + h * 0.8], [ri, a + 2 * h]] : [[ri, a - 2 * h], [ri, a + 2 * h]]; };
    const pts = []; for (let i = 0; i < n; i++) for (const [r, a] of tooth(i, i < k)) pts.push([r * Math.cos(a), r * Math.sin(a)]);
    g.prism(pts, 0, 5, 'a', { holes: [{ pts: ngon(0, 0, 3, 14), depth: 5 }] }); g.arrow([14, 0, 5], [14 * Math.cos(k * TAU / n), 14 * Math.sin(k * TAU / n), 5], 'r', 0);
    const ang = k * TAU / n; g.dot([12.5 * Math.cos(ang), 12.5 * Math.sin(ang), 5], 'r', 2.4);
  });
  S('f:primitive', g => {
    bigView(g, 138, 2.6); g.plane(0, 24, 'a');
    const a = g.seg(0.05, 0.3), b = g.seg(0.3, 0.45), c = g.seg(0.5, 0.65), d = g.seg(0.7, 0.9);
    if (a > 0) { const w = 14 * a; g.box(-18, -6, 0, w, 10 * a, 10 * b, 'a'); if (b < 0.02) g.fill(R(w, 10 * a).map(p => [p[0] - 18 + w / 2, p[1] - 6 + 5 * a, 0]), 'a', { a: 0.3, stroke: 'a' }); }
    if (c > 0) g.cyl(12, -8, 0, 5, 12 * c, 'a');
    if (d > 0) g.sphere(2, 10, 6 * d, 6 * d, 'a');
    const tip = g.t < 0.3 ? [-18 + 14 * a, -6 + 10 * a, 0] : g.t < 0.5 ? [-4, 4, 10 * b] : g.t < 0.68 ? [12, -8, 12 * c] : [2, 10, 12 * d]; g.cursorAt(tip, 0);
  });
  S('f:pipe', g => {
    bigView(g, 130, 2.7); const path = [[-18, -8, 0], [-18, 8, 0], [4, 8, 0], [4, 8, 14]], f = g.seg(0.2, 0.85); const pts = []; for (let i = 0; i < path.length - 1; i++) for (let k = 0; k < 8; k++) pts.push([lerp(path[i][0], path[i + 1][0], k / 8), lerp(path[i][1], path[i + 1][1], k / 8), lerp(path[i][2], path[i + 1][2], k / 8)]); pts.push(path[3]);
    g.line(path, 'r', 1.2, { dash: [3, 2] }); const hd = g.head(pts, f); if (hd.length > 1) g.tube(hd, 2.6, 'a', { n: 10 }); const e = g.along(pts, f).p; g.ring(e[0], e[1], e[2], 1.4, 'k', 1.5); g.dot(e, 'r', 0);
  });
  S('f:rib', g => {
    bigView(g, 134, 2.8); g.box(-16, -12, -2, 32, 24, 2, 'n'); const path = [[-12, -6], [-3, 6], [5, -4], [13, 7]], f = g.seg(0.15, 0.4), h = 12 * g.seg(0.45, 0.85);
    g.line(g.head(path.map(z0), f), 'a', 2); if (h > 0.05) { const poly = thick(path, 2.2); g.prism(poly, 0, h, 'a'); }
    g.cursorAt(g.along(path.map(z0), f).p.map((v, i) => i === 2 ? h : v), 0); if (h > 0.5) g.arrow([0, 0, h], [0, 0, h + 7], 'r', 1.5);
  });
  S('f:bfill', g => {
    bigView(g, 134, 2.7); g.box(-18, -10, 0, 36, 20, 3, 'n'); g.box(-18, -10, 15, 36, 20, 3, 'n'); g.box(-18, -10, 3, 5, 20, 12, 'n'); g.box(13, -10, 3, 5, 20, 12, 'n');
    const k = g.seg(0.3, 0.8); if (k > 0.02) g.box(-13, -10, 3, 26 * k, 20, 12, 'a'); g.cursorAt([-13 + 26 * k, 0, 9], 0);
  });
  S('f:combine', g => {
    bigView(g, 132, 2.9); const p = g.seg(0.2, 0.55), k = g.seg(0.6, 0.8); g.box(-14, -8, 0, 28, 16, 8, 'n');
    const z = lerp(26, 4, p); g.cyl(2, 0, z, 5, 14, k > 0.1 ? 'n' : 'a'); if (p < 1) g.arrow([2, 0, z + 16], [2, 0, z + 6], 'r', 1.5);
    if (k > 0 && k < 1) { g.ctx.save(); g.ctx.globalAlpha = (1 - k) * 0.6; g.ctx.restore(); }
    if (g.t > 0.55) label(g, [0, 0, 28], 'Join', 'g');
  });
  S('f:split', g => {
    bigView(g, 134, 2.9); const p = g.seg(0.15, 0.4), q = g.seg(0.55, 0.85);
    g.box(-13, -9, 0, 26, 18, 6, 'n'); g.move(q * 7, -q * 6, 7 * q + 0, () => g.box(-13, -9, 6, 26, 18, 6, g.t > 0.55 ? 'a' : 'n'));
    if (g.t < 0.6) g.fill([[-19, -15, 6], [19, -15, 6], [19, 15, 6], [-19, 15, 6]], 'a', { a: 0.18 * Math.min(1, p * 2), stroke: 'a', w: 1.2 });
    if (g.t < 0.6) g.cursorAt([-16 + 32 * p, 12 - 24 * p, 6], 0);
  });
  S('f:move', g => {
    bigView(g, 136, 2.8); const u = g.seg(0.2, 0.55), v = g.seg(0.6, 0.9); dashBox(g, -20, -5, 0, 12, 10, 8);
    g.move(-14 + 22 * 0 + 28 * u, 0, 0, () => g.box(-6, -5, 0, 12, 10, 8, g.t < 0.58 ? 'a' : 'n'));
    if (g.t > 0.58) g.move(-14 + 28 * u * 0 + 0, 0, 0, () => 0);
    g.arrow([14 * u - 6, 0, 8], [14 * u + 10, 0, 8], 'r', 1.6);
    g.cursorAt([-14 + 28 * u, 0, 8], pulse(g, 0.15, 0.25));
  });
  S('f:rotate', g => {
    bigView(g, 132, 2.8); const a = 90 * g.seg(0.25, 0.8); g.ring(0, 0, 0, 16, 'r', 1.2, { dash: [3, 2] }); g.turn('z', a, [0, 0, 0], () => g.prism(PROF.map(p => [p[0] * 0.9, p[1] * 0.9]), 0, 9, 'a'));
    g.line(Array.from({ length: 20 }, (_, i) => [16 * Math.cos(a * Math.PI / 180 * i / 19 + 0.3), 16 * Math.sin(a * Math.PI / 180 * i / 19 + 0.3), 0]), 'r', 2); g.cursorAt([16 * Math.cos(a * Math.PI / 180 + 0.3), 16 * Math.sin(a * Math.PI / 180 + 0.3), 0], 0);
  });
  S('f:scale', g => {
    bigView(g, 136, 2.6); const k = 1 + 0.7 * g.seg(0.25, 0.8); dashBox(g, -8, -7, 0, 16, 14, 10); g.scale3(k, k, k, [0, 0, 0], () => g.box(-8, -7, 0, 16, 14, 10, 'a'));
    g.dot([8 * k, 7 * k, 10 * k], 'r', 3); g.cursorAt([8 * k + 4, 7 * k + 4, 10 * k], 0);
  });
  S('f:stretch', g => {
    bigView(g, 138, 2.6); const L = 12 + 20 * g.seg(0.3, 0.8); dashBox(g, -8, -7, 0, 16, 14, 10); g.box(-8, -7, 0, L + 4, 14, 10, 'a');
    g.fill([[L - 4, -7, 0], [L - 4, 7, 0], [L - 4, 7, 10], [L - 4, -7, 10]], 'c', { a: 0.4, stroke: 'c' }); g.arrow([L - 4, 0, 5], [L + 8, 0, 5], 'r', 1.6); g.cursorAt([L + 8, 0, 5], 0);
  });
  S('f:delbody', g => {
    bigView(g, 136, 2.7); g.box(-24, -7, 0, 16, 14, 10, 'n'); const u = g.seg(0.55, 0.8), sel = g.t > 0.25;
    if (u < 1) { g.ctx.save(); g.ctx.globalAlpha = 1 - u; g.scale3(1 - 0.4 * u, 1 - 0.4 * u, 1 - 0.4 * u, [16, 0, 0], () => g.box(8, -7, 0, 16, 14, 10, sel ? 'c' : 'n')); g.ctx.restore(); }
    g.chip('Delete', 'r'); g.cursorAt([16, 0, 10], pulse(g, 0.2, 0.3));
  });
  S('f:deform', g => {
    bigView(g, 130, 2.7); const n = 16, b = g.seg(0.2, 0.5), tw = g.seg(0.55, 0.9); let x = -18, z = 0, ang = 0; const L = 36 / n;
    for (let i = 0; i < n; i++) { const bend = 0.09 * b, rot = tw * 1.4 * i / n; ang += bend; g.move(x, 0, z, () => g.turn('y', -ang * 180 / Math.PI, [0, 0, 0], () => g.turn('x', rot * 180 / Math.PI, [0, 0, 0], () => g.box(0, -4, -3, L + 0.15, 8, 6, i % 2 ? 'a' : 'n', { edge: false })))); x += L * Math.cos(ang); z += L * Math.sin(ang); }
    g.chip(g.t < 0.5 ? 'Bend' : 'Twist', 'a');
  });
  S('f:pushpull', g => {
    bigView(g, 138, 2.9); g.box(-12, -8, 0, 24, 16, 8, 'n'); const u = g.seg(0.3, 0.75), h = 10 * u;
    if (h > 0.05) g.box(-12, -8, 8, 24, 16, h, 'a'); else g.fill([[-12, -8, 8], [12, -8, 8], [12, 8, 8], [-12, 8, 8]], 'c', { a: 0.35, stroke: 'c' });
    g.arrow([0, 0, 8 + h], [0, 0, 8 + h + 9], 'r', 1.7); g.cursorAt([4, 0, 8 + h], 0);
  });
  S('f:draft', g => {
    bigView(g, 138, 3); const u = g.seg(0.3, 0.8), s = 1 - 0.28 * u, Rr = R(20, 16); dashBox(g, -10, -8, 0, 20, 16, 14);
    g.loft(Rr, 0, Rr.map(p => [p[0] * s, p[1] * s]), 14, 'a'); g.line(Array.from({ length: 10 }, (_, i) => [10 + 0.0, 8, 0]).slice(0, 0), 'r', 0);
    g.arrow([10 * s, 8 * s, 14], [10 * s - 5, 8 * s - 5, 14], 'r', 1.5); label(g, [0, 0, 20], Math.round(u * 8) + '°');
  });
  S('f:align', g => {
    bigView(g, 138, 2.6); g.box(-20, -7, 0, 14, 14, 10, 'n'); const u = g.seg(0.45, 0.85), sel = g.t > 0.2, a = 40 * (1 - u), x = lerp(22, -6, u);
    g.fill([[-6, -7, 0], [-6, 7, 0], [-6, 7, 10], [-6, -7, 10]], 'c', { a: sel ? 0.5 : 0, stroke: 'c' });
    g.move(x, 3 * (1 - u), 0, () => g.turn('z', a, [0, 0, 0], () => g.box(0, -7, 0, 14, 14, 10, 'a')));
    g.arrow([x + 7, 0, 12], [x - 3, 0, 12], 'r', 0); g.cursorAt([-6, 0, 10], pulse(g, 0.12, 0.25));
  });

  /* ── modify ── */
  const edgeBlock = (g, kind, p) => {
    const r = 5, cx = 15 - r, cz = 14 - r, arc = kind === 'round' ? Array.from({ length: 8 }, (_, i) => [cx + r * Math.cos(Math.PI / 2 * i / 7), cz + r * Math.sin(Math.PI / 2 * i / 7)]) : [[15, cz], [cx, 14]];
    const prof = [[-15, 0], [15, 0], ...arc, [-15, 14]].map(q => [q[0] * 0.6, q[1] * 0.7]), sharp = [[-9, 0], [9, 0], [9, 9.8], [-9, 9.8]], xr = -12 + 24 * p;
    g.axisPrism('x', prof.map(q => [q[0], q[1]]), -12, Math.max(0.01, xr + 12), 'n', { smooth: kind === 'round' });
    if (xr < 12) g.axisPrism('x', sharp, xr, 12 - xr, 'n'); return xr;
  };
  const edgeRoll = (g, kind) => { bigView(g, 138, 3); const xr = edgeBlock(g, kind, g.seg(0.2, 0.85)); if (kind === 'round') g.sphere(xr, 3.4, 7.5, 3, 'a'); else g.cone(xr, 3.4, 6, 0.1, 4, 4, 'a'); g.line([[-12, 9, 9.8], [12, 9, 9.8]], 'a', 0); g.cursorAt([xr, 9, 11], 0); };
  S('fillet3', g => edgeRoll(g, 'round'));
  S('chamfer3', g => edgeRoll(g, 'flat'));
  S('f:shell', g => {
    bigView(g, 134, 3); const u = g.seg(0.4, 0.85), top = [[-12, -9, 12], [12, -9, 12], [12, 9, 12], [-12, 9, 12]];
    g.prism(R(24, 18), 0, 12, 'n', { holes: [{ pts: R(24 - 5, 18 - 5), depth: 9.5 * u }] });
    if (g.t < 0.4) g.fill(top, 'c', { a: 0.45 * g.seg(0.1, 0.25), stroke: 'c', w: 1.6 }); g.cursorAt([0, 0, 12], pulse(g, 0.12, 0.25)); g.chip('Wall 2.5 mm', 'a');
  });
  S('thread', g => {
    bigView(g, 134, 2.8); g.cyl(0, 0, 0, 5, 20, 'm'); const f = g.seg(0.2, 0.85), pts = Array.from({ length: 90 }, (_, i) => { const u = i / 89; return [5.2 * Math.cos(TAU * 7 * u), 5.2 * Math.sin(TAU * 7 * u), 20 - 18 * u]; }); const hd = g.head(pts, f); if (hd.length > 2) g.tube(hd, 0.7, 'k', { n: 6 }); g.dot(g.along(pts, f).p, 'r', 2.4);
  });
  S('f:midplane', g => {
    bigView(g, 138, 2.8); g.box(-14, -10, 0, 28, 20, 2, 'n'); g.box(-14, -10, 14, 28, 20, 2, 'n'); const u = g.seg(0.3, 0.7); g.fill([[-18, -14, 1], [18, -14, 1], [18, 14, 1], [-18, 14, 1]].map(p => [p[0], p[1], lerp(2, 8, u)]), 'a', { a: 0.2 * u, stroke: 'a', w: 1.2 }); g.line([[0, 0, 2], [0, 0, 14]], 'r', 1.2, { dash: [3, 2] }); g.cursorAt([0, 0, 8], pulse(g, 0.12, 0.28));
  });
  S('plane', g => {
    bigView(g, 138, 2.8); g.box(-14, -10, 0, 28, 20, 8, 'n'); const u = g.seg(0.25, 0.75), h = 8 + 12 * u; g.fill([[-18, -14, h], [18, -14, h], [18, 14, h], [-18, 14, h]], 'a', { a: 0.2, stroke: 'a', w: 1.2, dash: [3, 2] });
    g.arrow([0, 0, 8], [0, 0, h], 'r', 1.6); label(g, [0, 0, h + 5], Math.round((h - 8) * 10) / 10 + ' mm'); g.cursorAt([0, 0, h], 0);
  });
  S('f:planeang', g => {
    bigView(g, 138, 2.8); g.box(-14, -10, 0, 28, 20, 8, 'n'); const a = 50 * g.seg(0.25, 0.75); g.line([[-18, 10, 8], [18, 10, 8]], 'r', 2); g.turn('x', -a, [0, 10, 8], () => g.fill([[-18, 10, 8], [18, 10, 8], [18, -12, 8], [-18, -12, 8]], 'a', { a: 0.22, stroke: 'a', w: 1.2 }));
    g.line(Array.from({ length: 14 }, (_, i) => [0, 10 - 12 * Math.cos(a * Math.PI / 180 * i / 13), 8 + 12 * Math.sin(a * Math.PI / 180 * i / 13)]), 'r', 1.4); label(g, [0, 0, 22], Math.round(a) + '°');
  });
  S('f:plane3', g => {
    bigView(g, 138, 2.8); g.box(-14, -10, 0, 28, 20, 10, 'n'); const P = [[-14, 10, 10], [14, 10, 10], [14, -10, 0]], k = g.lin(0.1, 0.65); P.forEach((p, i) => { if (k > i / 3) { g.dot(p, 'r', 3); g.click(p, i / 3 * 0.55 + 0.1, i / 3 * 0.55 + 0.2, 'r'); } }); if (g.t > 0.65) g.fill(P.concat([[-14, -10, 0]]), 'a', { a: 0.3 * g.seg(0.65, 0.85), stroke: 'a', w: 1.2 }); g.cursorAt(P[Math.min(2, Math.floor(k * 3))], 0);
  });
  S('point', g => { bigView(g, 138, 3); g.box(-12, -9, 0, 24, 18, 10, 'n'); const u = g.seg(0.2, 0.6), c = [12, -9, 10]; g.cursorAt([lerp(24, c[0], u), lerp(-20, c[1], u), lerp(20, c[2], u)], pulse(g, 0.6, 0.7)); if (g.t > 0.6) { g.dot(c, 'r', 3.4); g.line([[c[0] - 5, c[1], c[2]], [c[0] + 5, c[1], c[2]]], 'r', 1.2); g.line([[c[0], c[1] - 5, c[2]], [c[0], c[1] + 5, c[2]]], 'r', 1.2); } });
  S('p:rect', g => {
    bigView(g, 140, 2.5); g.box(-22, -12, 0, 44, 24, 3, 'n'); const k = g.lin(0.15, 0.85), pos = []; for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) pos.push([-12 + c * 12, -5 + r * 11]);
    pos.forEach((p, i) => { const a = clamp(k * (pos.length + 0.5) - i); if (a > 0) g.cyl(p[0], p[1], 3, 3.2, 7 * g.ease(a), i ? 'a' : 'n'); }); g.arrow([-12, -9, 12], [20, -9, 12], 'r', 1.3); g.cursorAt([-12 + 24 * k, -9, 12], 0);
  });
  S('p:circ', g => {
    bigView(g, 138, 2.6); g.cyl(0, 0, 0, 16, 3, 'n'); const k = g.lin(0.15, 0.85), n = 6;
    for (let i = 0; i < n; i++) { const a = clamp(k * (n + 0.5) - i), th = TAU * i / n; if (a > 0) g.cyl(10 * Math.cos(th), 10 * Math.sin(th), 3, 2.6, 7 * g.ease(a), i ? 'a' : 'n'); } g.line(U.ngon(0, 0, 10, 36).map(p => [p[0], p[1], 3]), 'r', 1, { close: true, dash: [2, 2] }); g.dot([0, 0, 3], 'r', 2);
  });
  S('p:mirror', g => {
    bigView(g, 138, 2.6); g.box(-24, -8, 0, 48, 16, 2, 'n'); const k = g.seg(0.35, 0.8); g.fill([[0, -12, -1], [0, 12, -1], [0, 12, 14], [0, -12, 14]], 'a', { a: 0.15, stroke: 'a', w: 1.2 });
    const bump = () => { g.cyl(-12, 0, 2, 4, 8, 'a'); g.box(-18, -2, 2, 4, 4, 4, 'a'); }; bump();
    if (k > 0.02) g.scale3(-k, 1, 1, [0, 0, 0], () => { g.cyl(-12, 0, 2, 4, 8, 'g', { both: true }); g.box(-18, -2, 2, 4, 4, 4, 'g', { both: true }); });
  });
  S('f:pathpat', g => {
    bigView(g, 138, 2.5); const path = Array.from({ length: 30 }, (_, i) => { const u = i / 29; return [-20 + 40 * u, 9 * Math.sin(u * 5), 0]; }); g.line(path, 'r', 1.4, { dash: [3, 2] }); const k = g.lin(0.15, 0.85), n = 6;
    for (let i = 0; i < n; i++) { const a = clamp(k * (n + 0.5) - i), p = g.along(path, i / (n - 1)).p; if (a > 0) g.cyl(p[0], p[1], 0, 2.6, 8 * g.ease(a), i ? 'a' : 'n'); } g.cursorAt(g.along(path, clamp(k * (n + 0.5) / n)).p, 0);
  });

  /* ── hardware, physics, inspect, exchange ── */
  S('hw:fast', g => {
    bigView(g, 136, 2.8); g.prism(R(28, 20), 0, 8, 'n', { holes: [{ pts: ngon(0, 0, 3, 18), depth: 8 }] }); const u = g.seg(0.25, 0.8), z = lerp(22, 8, u), spin = u * 12;
    g.cyl(0, 0, z - 14, 2.8, 14, 'm', { n: 14 }); for (let k = 0; k < 10; k++) { const zz = z - 14 + k * 1.4 + (spin % 1.4); if (zz > z - 14 && zz < z) g.ring(0, 0, zz, 2.9, 'k', 0.8, { a: 0.6 }); }
    g.cyl(0, 0, z, 5, 3.6, 'k', { n: 6 }); g.arrow([0, 0, z + 10], [0, 0, z + 4.5], 'r', 1.4); g.cursorAt([0, 0, z + 5], 0);
  });
  S('hw:shop', g => {
    bigView(g, 138, 2.7); g.box(-22, -10, 0, 44, 20, 3, 'k'); g.box(-22, -10, 3, 6, 20, 12, 'm'); const u = g.seg(0.25, 0.7), x = lerp(22, 8, u); g.box(x - 6 + 0, -10, 3, 6, 20, 12, 'm'); g.box(-8, -6, 3, 16, 12, 9, 'a'); g.arrow([x + 4, 0, 18], [x - 2, 0, 18], 'r', 0); g.line([[22, 0, 15], [x + 4, 0, 15]], 'k', 2);
  });
  S('hw:drive', g => {
    bigView(g, 134, 2.6); const sp = g.time * 2, pul = (x, r) => { g.cyl(x, 0, 0, r, 5, 'm'); for (let i = 0; i < 6; i++) { const a = sp * (r > 6 ? 1 : 2) + i * TAU / 6; g.line([[x, 0, 5.2], [x + (r - 1) * Math.cos(a), (r - 1) * Math.sin(a), 5.2]], 'k', 1.1); } g.dot([x, 0, 5.2], 'k', 2); };
    pul(-12, 8); pul(14, 4.5); g.line([[-12, 8, 3], [14, 4.5, 3]], 'k', 1.6); g.line([[-12, -8, 3], [14, -4.5, 3]], 'k', 1.6); g.arrow([-12, 11, 6], [-6, 11.5, 6], 'r', 1.2);
  });
  S('hw:phys', g => {
    bigView(g, 138, 2.6); g.box(-22, -8, 0, 44, 16, 2, 'n'); const u = g.lin(0.15, 0.85); const x = lerp(-18, 18, u), y = Math.abs(Math.cos(u * 9)) * 9 * (1 - u) * (u > 0.15 ? 1 : 1); g.dot([x, 0, 2], 'k', 0); g.sphere(x, 0, 4 + 2 * Math.abs(Math.cos(u * 10)) * (1 - u) * 3 + 0, 2.5, 'a'); g.line([[x, 0, 0], [x, 0, 2]], 'k', 0);
  });
  S('measure', g => {
    bigView(g, 138, 3); g.box(-12, -9, 0, 24, 18, 10, 'n'); const A1 = [-12, 9, 10], B1 = [12, 9, 10], u = g.seg(0.25, 0.65); g.dot(A1, 'r', 3); if (g.t > 0.65) g.dot(B1, 'r', 3); const e = [lerp(A1[0], B1[0], u), 9, 10]; g.line([A1, e], 'r', 1.6); g.arrow(A1, [A1[0] + 3, 9, 10], 'r', 1); if (g.t > 0.66) g.arrow(B1, [B1[0] - 3, 9, 10], 'r', 1); if (g.t > 0.68) label(g, [0, 12, 15], '24.00 mm'); g.cursorAt(e, pulse(g, 0.62, 0.72));
  });
  S('i:props', g => {
    bigView(g, 138, 3); g.box(-12, -9, 0, 24, 18, 10, 'n'); const u = g.seg(0.25, 0.75); g.dot([0, 0, 5 * u], 'r', 3.2 * u); if (u > 0.01) { g.arrow([0, 0, 5], [18 * u, 0, 5], 'r', 1.3); g.arrow([0, 0, 5], [0, 14 * u, 5], 'g', 1.3); g.arrow([0, 0, 5], [0, 0, 5 + 13 * u], 'a', 1.3); } if (g.t > 0.7) g.chip('Volume 4 320 mm³ · Mass 11.7 g', 'a');
  });
  S('i:interf', g => {
    bigView(g, 138, 2.8); g.box(-16, -8, 0, 20, 16, 10, 'n'); const u = g.seg(0.25, 0.7), x = lerp(22, -4, u); g.box(x, -5, 2, 18, 12, 10, 'a', { a: 0.85 }); const o0 = Math.max(x, -16), o1 = Math.min(x + 18, 4); if (o1 > o0) g.box(o0, -5, 2, o1 - o0, 12, 8, 'r'); if (g.t > 0.7) g.chip('Interference found', 'r');
  });
  S('i:section', g => {
    bigView(g, 138, 3); const u = g.seg(0.25, 0.75), xs = -12 + 16 * u; g.ctx.save(); g.ctx.globalAlpha = 0.2; g.box(-12, -9, 0, xs + 12, 18, 10, 'a'); g.ctx.restore(); g.prism(R(1, 1), 0, 0, 'n'); g.box(xs, -9, 0, 24 - (xs + 12), 18, 10, 'n', { holes: [] });
    g.fill([[xs, -9, 0], [xs, 9, 0], [xs, 9, 10], [xs, -9, 10]], 'c', { a: 0.5, stroke: 'c', w: 1.4 }); g.arrow([xs, 0, 10], [xs + 9, 0, 10], 'r', 1.3);
  });
  S('stress', g => {
    bigView(g, 130, 2.7); const b = g.seg(0.25, 0.8), n = 14, L = 32 / n; g.box(-26, -8, -8, 6, 16, 24, 'k'); let x = -20, z = 0, ang = 0;
    for (let i = 0; i < n; i++) { ang += 0.05 * b; const st = 1 - i / n, col = [lerp(70, 235, st * b + 0.0), lerp(150, 70, st * b), lerp(235, 70, st * b)]; g.move(x, 0, z, () => g.turn('y', ang * 180 / Math.PI, [0, 0, 0], () => g.box(0, -4, -3, L + 0.2, 8, 6, col, { edge: false }))); x += L * Math.cos(ang); z -= L * Math.sin(ang); }
    g.arrow([x, 0, z + 18], [x, 0, z + 5], 'r', 2); g.chip('Von Mises stress', 'r');
  });
  S('blueprint', g => {
    g.view(64, 112, 2.3); g.prism(PROF.map(p => [p[0] * 0.8, p[1] * 0.8]), 0, 8, 'n'); const u = g.lin(0.25, 0.85);
    g.fill([[132, 34], [232, 34], [232, 164], [132, 164]].map(p => [(p[0] - 120) / 2.6, -(p[1] - 94) / 2.6]), 'w', { a: 0.01 });
    g.in2d(0, 0, 1, () => { g.fill([[128, 24], [234, 24], [234, 160], [128, 160]], 'w', { a: 0.95, stroke: 'a', w: 1.2 }); const sx = 2.3, views = [[[0, 0], [20, 0], [20, 8], [0, 8]], [[0, 0], [20, 0], [20, 10], [12, 10], [12, 14], [0, 14]], [[0, 0], [14, 0], [14, 8], [0, 8]]]; const pos = [[142, 148], [142, 106], [190, 148]]; views.forEach((v, i) => { const a = clamp(u * 3 - i); if (a > 0) { const pts = v.map(p => [pos[i][0] + p[0] * 2.2, pos[i][1] - p[1] * 2.2]); g.line(g.head(pts.concat([pts[0]]), a), 'a', 1.6); } }); });
    g.line([[0, 0, 4]], 'k', 0);
  });
  S('import', g => {
    bigView(g, 138, 2.8); const u = g.seg(0.2, 0.55), v = g.seg(0.55, 0.85); const fx = lerp(40, 8, u) - 0; g.in2d(0, 0, 1, () => { const x = lerp(220, 190, u), y = 60; g.fill([[x - 12, y - 16], [x + 4, y - 16], [x + 12, y - 8], [x + 12, y + 16], [x - 12, y + 16]], 'w', { a: 0.98, stroke: 'a', w: 1.4 }); g.text(x, y + 6, '.step', 'a', 8); });
    if (v > 0) g.prism(PROF.map(p => [p[0] * 0.9 * v, p[1] * 0.9 * v]), 0, 10 * v, 'a'); g.arrow([14, 0, 14], [4, 0, 14], 'r', 0);
  });
  S('export', g => {
    bigView(g, 138, 2.8); const u = g.seg(0.25, 0.75); g.in2d(0, 0, 1, () => { const x = 205, y = 104; g.fill([[x - 12, y - 16], [x + 4, y - 16], [x + 12, y - 8], [x + 12, y + 16], [x - 12, y + 16]], 'w', { a: 0.98, stroke: 'a', w: 1.4 }); g.text(x, y + 6, '.stl', 'a', 8); });
    g.move(24 * u, 0, 0, () => g.scale3(1 - 0.55 * u, 1 - 0.55 * u, 1 - 0.55 * u, [0, 0, 0], () => g.prism(PROF.map(p => [p[0] * 0.9, p[1] * 0.9]), 0, 10, 'a')));
  });
  S('f:fixture', g => {
    bigView(g, 138, 2.6); g.box(-24, -12, 0, 48, 24, 3, 'k'); const u = g.seg(0.2, 0.55), v = g.seg(0.6, 0.85); g.box(-8, -6, 3 + 14 * (1 - u), 16, 12, 8, 'a'); const c = lerp(10, 0, v); g.box(-20 - 0, -12, 3, 6 + 0, 24, 10, 'm'); g.box(14 + c, -12, 3, 6, 24, 10, 'm'); g.box(-8 - 0, -6, 3 + 0, 0.01, 0.01, 0.01, 'n');
  });
// the pointer travels in early, so the card is already moving when someone hovers for a moment
  A.touch(['f:draft', 'p:mirror', 'i:props'], 120, 92, 0.4, [185, 140]);
})(typeof window !== 'undefined' ? window : this);
