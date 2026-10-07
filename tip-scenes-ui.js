/* tip-scenes-ui.js: action scenes for the main window's own controls (view buttons, tabs, panels). */
(function (root) {
  'use strict';
  const A = root.TipAnim; if (!A) return;
  const S = A.scene, U = A.util, { lerp, ngon } = U;
  const TAU = Math.PI * 2;
  const R = (w, d) => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  const PROF = [[-10, -7], [10, -7], [10, 3], [3, 3], [3, 7], [-10, 7]];
  const part = (g, c = 'a') => { g.prism(PROF, 0, 9, c); };
  const tabs = (g, names, k, on) => g.in2d(0, 0, 1, () => { let x = 20; names.forEach((n, i) => { const w = 12 + n.length * 5.6; g.fill([[x, 40], [x + w, 40], [x + w, 62], [x, 62]], i === k ? 'a' : 'n', { a: i === k ? 0.2 : 0.5, stroke: i === k ? 'a' : 'm' }); g.text(x + w / 2, 55, n, i === k ? 'a' : 'k', 8.5); x += w + 4; }); });
  S('btn3D', g => { g.view(120, 130, 2.8); const a = 90 * (1 - g.seg(0.3, 0.8)); g.ground(40, 30); g.turn('x', -a, [0, 0, 5], () => part(g)); g.chip('3D view', 'a'); });
  S('btn2D', g => { g.view(120, 130, 2.8); const a = 60 * g.seg(0.3, 0.8); g.ground(40, 30); g.turn('x', -a, [0, 0, 5], () => part(g)); g.chip('Straight-on 2D view', 'a'); });
  S('btnHome', g => { g.view(120, 130, 2.8); const a = 80 * (1 - g.seg(0.3, 0.8)); g.ground(40, 30); g.turn('z', a, [0, 0, 5], () => part(g)); g.chip('Back to the home view', 'a'); });
  S('btnFit', g => { const z = 2.6 - 1.2 * g.seg(0.3, 0.8); g.view(120, 130, 2.8 * z * 0.7); g.ground(40, 30); part(g); g.chip('Fit everything in view', 'a'); });
  S('btnExplode', g => { g.view(120, 136, 2.5); const u = g.seg(0.25, 0.75); g.box(-14, -8, 0 - 6 * u, 28, 16, 4, 'n'); g.cyl(-5, 0, 4 + 2 * u * 0, 4, 8, 'a'); g.move(0, 0, 14 * u, () => g.cyl(5, 0, 4, 4, 8, 'c')); g.move(0, 0, 8 * u, () => g.box(-14, -8, 12, 28, 16, 3, 'g')); });
  S('btnTree', g => { g.view(120, 120, 3); const u = g.lin(0.15, 0.85); g.in2d(0, 0, 1, () => { g.fill([[40, 24], [200, 24], [200, 152], [40, 152]], 'w', { a: 1, stroke: 'm' }); ['Bodies', '  Body 1', '  Body 2', 'Sketches', '  Sketch 1', 'Origin planes'].forEach((s, i) => { if (u * 7 > i) g.text(52, 42 + i * 18, (i === 0 || i === 3 || i === 5 ? '▾ ' : '') + s.trim(), 'k', 8.5, s.startsWith('  ') ? 'left' : 'left'); }); }); });
  const visScene = (label, fn) => g => { g.view(120, 136, 2.6); const on = g.t < 0.5 || g.t > 0.9; g.ground(40, 30); fn(g, on); g.chip(label + (on ? ' shown' : ' hidden'), 'a'); };
  S('vis:part', visScene('Part', (g, on) => { if (on) part(g); else g.ctx.save(), g.ctx.restore(); }));
  S('vis:sketches', visScene('Sketches', (g, on) => { part(g, 'n'); if (on) { g.sketch(PROF, 'a', 2, 9); } }));
  S('vis:planes', visScene('Planes', (g, on) => { part(g, 'n'); if (on) { g.plane(0, 20, 'a'); g.plane(9, 16, 'g'); } }));
  S('sel:body', g => { g.view(120, 136, 2.6); g.box(-24, -7, 0, 18, 14, 9, g.t > 0.5 ? 'n' : 'n'); g.box(4, -7, 0, 18, 14, 9, g.t > 0.5 ? 'a' : 'n'); const u = g.seg(0.2, 0.5); g.cursorAt([lerp(-20, 12, u), 0, 9], g.lin(0.5, 0.6)); g.chip('Pick a whole body', 'a'); });
  S('sel:face', g => { g.view(120, 136, 2.6); g.box(-12, -8, 0, 24, 16, 10, 'n'); const u = g.seg(0.2, 0.5); if (g.t > 0.5) g.fill([[-12, -8, 10], [12, -8, 10], [12, 8, 10], [-12, 8, 10]], 'a', { a: 0.55, stroke: 'a', w: 1.6 }); g.cursorAt([lerp(-18, 0, u), 0, 10], g.lin(0.5, 0.6)); g.chip('Pick a single face', 'a'); });
  S('btnTheme', g => { g.view2d(); const u = g.seg(0.4, 0.7); g.ctx.fillStyle = `rgba(24,32,46,${0.75 * u})`; g.ctx.fillRect(0, 0, 240, 180); const c = u < 0.5 ? 'y' : 'w'; g.in2d(0, 0, 1, () => { g.fill(ngon(120, 88, 20, 24).map(p => p), c, { a: 1 }); if (u < 0.5) for (let k = 0; k < 8; k++) g.line([[120 + 26 * Math.cos(k * TAU / 8), 88 + 26 * Math.sin(k * TAU / 8)], [120 + 34 * Math.cos(k * TAU / 8), 88 + 34 * Math.sin(k * TAU / 8)]], 'y', 2); else g.fill(ngon(128, 82, 17, 24), [24, 32, 46], { a: 1 }); }); });
  S('btnGuided', g => { g.view2d(); const k = Math.floor(g.lin(0.1, 0.9) * 4.99); g.in2d(0, 0, 1, () => { g.fill([[40, 24], [200, 24], [200, 156], [40, 156]], 'w', { a: 1, stroke: 'm' }); ['Start a sketch', 'Draw a shape', 'Extrude it', 'Refine it', 'Machine it'].forEach((s, i) => { g.fill(ngon(58, 44 + i * 24, 7, 14), i < k ? 'g' : i === k ? 'a' : 'n', { a: i <= k ? 0.9 : 0.5 }); if (i < k) g.line([[54, 44 + i * 24], [57, 47 + i * 24], [63, 41 + i * 24]], 'w', 1.6); g.text(72, 47 + i * 24, s, i === k ? 'a' : 'k', 9, 'left'); }); }); });
  S('ws:design ws:cam', g => { g.view2d(); const k = g.t < 0.5 ? 0 : 1; tabs(g, ['Design', 'Manufacture', 'Setup Sheet'], k); g.in2d(0, 0, 1, () => { const x = k ? 70 : 38; g.cursor(x, 56 + 6, g.lin(0.4, 0.5) > 0 && g.lin(0.4, 0.5) < 1 ? g.lin(0.4, 0.5) : 0); g.text(120, 120, k ? 'Toolpaths, simulation, G-code' : 'Sketch and model the part', 'k', 9); }); });
  S('ws:sheet', g => { g.view2d(); tabs(g, ['Design', 'Manufacture', 'Setup Sheet'], 2); });
  // the tabs that open the other apps: a quick taste of what each one does
  S('ws:draw', g => { g.view2d(120, 94, 2.6); g.grid2(10, 46); const P = [[-28, -14], [8, -14], [8, 8], [-12, 8], [-28, -14]], f = g.seg(0.1, 0.85); g.line(g.head(P.map(p => [p[0], p[1], 0]), f), 'a', 2.2); g.cursorAt([...g.along(P, f).p.slice(0, 2), 0], 0); g.chip('2D drafting: line, circle, dimension', 'a'); });
  S('ws:house', g => { g.view(120, 132, 2.5); g.ground(60, 44); const u = g.seg(0.1, 0.5), v = g.seg(0.5, 0.9); g.box(-18, -12, 0, 36, 24, 12 * u, 'n'); if (v > 0) { const z0 = 12 + 12 * (1 - v); g.faces([{ v: [[-20, -14, z0], [20, -14, z0], [20, 0, z0 + 9], [-20, 0, z0 + 9]], c: 'r' }, { v: [[-20, 0, z0 + 9], [20, 0, z0 + 9], [20, 14, z0], [-20, 14, z0]], c: 'r', f: 1.1 }, { v: [[20, 0, z0 + 9], [20, 14, z0], [20, -14, z0]], c: 'r', both: true }], {}); } g.chip('House design: walls, rooms, roof', 'a'); });
  S('ws:print', g => { g.view(120, 132, 2.6); g.box(-24, -19, -2, 48, 38, 2, 'k'); const f = g.seg(0.1, 0.9), h = 12 * f; g.cyl(0, 0, 0, 8, h, 'a', { n: 24 }); g.tool('nozzle', 8 * Math.cos(f * 30), 8 * Math.sin(f * 30), h + 0.2); g.chip('3D print: slice and print', 'a'); });
  S('ws:gfx', g => { g.view2d(120, 94, 2.6); g.fill([[-44, -32], [44, -32], [44, 32], [-44, 32]], 'w', { a: 1, stroke: 'm' }); const P = Array.from({ length: 50 }, (_, i) => [-34 + 68 * i / 49, 12 * Math.sin(i / 49 * 6.2)]), f = g.seg(0.1, 0.85), d = g.along(P, f).d; for (let s2 = 0; s2 <= d; s2 += 2) { const p = g.along(P, s2 / g.along(P, 1).len).p, q = g.P(p[0], p[1], 0), gr = g.ctx.createRadialGradient(q[0], q[1], 1, q[0], q[1], 11); gr.addColorStop(0, 'rgba(92,150,240,.4)'); gr.addColorStop(1, 'rgba(92,150,240,0)'); g.ctx.fillStyle = gr; g.ctx.beginPath(); g.ctx.arc(q[0], q[1], 11, 0, 7); g.ctx.fill(); } g.cursorAt([...g.along(P, f).p.slice(0, 2), 0], 0); g.chip('Graphics: paint, filter, pen', 'a'); });
  S('inspect', g => { g.view(120, 132, 2.8); g.box(-12, -8, 0, 24, 16, 8, 'n'); const k = Math.floor(g.lin(0.1, 0.9) * 2.99), pts = [[0, 0, 8], [12, 0, 4], [0, 8, 4]], p = pts[k], u = (g.lin(0.1, 0.9) * 3) % 1, z = p[2] + 14 * Math.abs(Math.cos(u * Math.PI)); const off = k === 0 ? [0, 0, 1] : k === 1 ? [1, 0, 0] : [0, 1, 0]; const tip = [p[0] + off[0] * 14 * (1 - Math.sin(u * Math.PI)), p[1] + off[1] * 14 * (1 - Math.sin(u * Math.PI)), p[2] + off[2] * 14 * (1 - Math.sin(u * Math.PI))]; g.line([tip, [tip[0] + off[0] * 10, tip[1] + off[1] * 10, tip[2] + off[2] * 10]], 'k', 1.6); g.sphere(tip[0], tip[1], tip[2], 1.4, 'r'); if (u > 0.45) g.dot(p, 'g', 3); g.chip('Probe the part, compare to the model', 'g'); });
  S('vis:stock', g => { g.view(120, 136, 2.8); const on = g.t < 0.5 || g.t > 0.9; g.ground(40, 30); g.box(-8, -6, 0, 16, 12, 8, 'a'); if (on) { const c = [[-14, -10], [14, -10], [14, 10], [-14, 10]]; [0, 11].forEach(z => g.line(c.map(p => [p[0], p[1], z]), 'c', 1.4, { close: true, dash: [3, 2] })); c.forEach(p => g.line([[p[0], p[1], 0], [p[0], p[1], 11]], 'c', 1.4, { dash: [3, 2] })); } g.chip('Stock box ' + (on ? 'shown' : 'hidden'), 'c'); });
  S('vis:paths', g => { g.view(120, 136, 2.8); const on = g.t < 0.5 || g.t > 0.9; g.ground(40, 30); g.box(-12, -8, 0, 24, 16, 6, 'n'); if (on) g.line([[-10, -6, 6.2], [10, -6, 6.2], [10, 0, 6.2], [-10, 0, 6.2], [-10, 6, 6.2], [10, 6, 6.2]], 'g', 1.8); g.chip('Toolpaths ' + (on ? 'shown' : 'hidden'), 'g'); });
  S('vis:rapids', g => { g.view(120, 136, 2.8); const on = g.t < 0.5 || g.t > 0.9; g.ground(40, 30); g.box(-12, -8, 0, 24, 16, 6, 'n'); g.line([[-10, -6, 6.2], [10, -6, 6.2], [10, 6, 6.2]], 'g', 1.8); if (on) g.line([[10, 6, 6.2], [10, 6, 16], [-10, -6, 16], [-10, -6, 6.2]], 'r', 1.4, { dash: [3, 2] }); g.chip('Rapid moves ' + (on ? 'shown' : 'hidden'), 'r'); });
  { const i = A.info('f:fixture'); if (i) S('fixture', i.fn); }

  /* second drafts of the toggles and tab switches: the pointer travels to the control and the result follows the click */
  const pr = (g, a) => { const u = g.lin(a, a + 0.07); return u > 0 && u < 1 ? 1 - u : 0; };
  const toggle = (label, fn) => g => {
    g.view(120, 136, 2.6); const on = g.t < 0.5 || g.t > 0.9; g.ground(40, 30); fn(g, on);
    g.in2d(0, 0, 1, () => {
      g.fill([[150, 150], [230, 150], [230, 172], [150, 172]], 'w', { a: 0.95, stroke: 'm' }); g.fill([[156, 156], [168, 156], [168, 168], [156, 168]], on ? 'a' : 'w', { a: 1, stroke: 'k' });
      if (on) g.line([[158, 162], [161, 165.5], [166, 158]], 'w', 1.6); g.text(174, 165.5, label, 'k', 8, 'left');
      const a = g.seg(0.02, 0.44), b = g.seg(0.6, 0.86); g.cursor(lerp(lerp(120, 162, a), 140, b) + 6 * g.lin(0.5, 0.6) * (1 - b), lerp(lerp(110, 162, a), 120, b), Math.max(pr(g, 0.44), pr(g, 0.86)));
    });
    g.chip(label + (on ? ' shown' : ' hidden'), 'a');
  };
  S('vis:part', toggle('Part', (g, on) => { if (on) part(g); }));
  S('vis:sketches', toggle('Sketches', (g, on) => { part(g, 'n'); if (on) g.sketch(PROF, 'a', 2, 9); }));
  S('vis:planes', toggle('Planes', (g, on) => { part(g, 'n'); if (on) { g.plane(0, 20, 'a'); g.plane(9, 16, 'g'); } }));
  S('vis:stock', toggle('Stock box', (g, on) => { g.box(-8, -6, 0, 16, 12, 8, 'a'); if (on) { const c = [[-14, -10], [14, -10], [14, 10], [-14, 10]]; [0, 11].forEach(z => g.line(c.map(p => [p[0], p[1], z]), 'c', 1.4, { close: true, dash: [3, 2] })); c.forEach(p => g.line([[p[0], p[1], 0], [p[0], p[1], 11]], 'c', 1.4, { dash: [3, 2] })); } }));
  S('vis:paths', toggle('Toolpaths', (g, on) => { g.box(-12, -8, 0, 24, 16, 6, 'n'); if (on) g.line([[-10, -6, 6.2], [10, -6, 6.2], [10, 0, 6.2], [-10, 0, 6.2], [-10, 6, 6.2], [10, 6, 6.2]], 'g', 1.8); }));
  S('vis:rapids', toggle('Rapid moves', (g, on) => { g.box(-12, -8, 0, 24, 16, 6, 'n'); g.line([[-10, -6, 6.2], [10, -6, 6.2], [10, 6, 6.2]], 'g', 1.8); if (on) g.line([[10, 6, 6.2], [10, 6, 16], [-10, -6, 16], [-10, -6, 6.2]], 'r', 1.4, { dash: [3, 2] }); }));
  const tabsTo = (k, from, text) => g => { g.view2d(); const names = ['Design', 'Manufacture', 'Setup Sheet'], xs = [38, 100, 168], a = g.seg(0.04, 0.42), kk = g.t < 0.46 ? from : k; tabs(g, names, kk); g.in2d(0, 0, 1, () => { g.text(120, 120, text[kk], 'k', 9); g.fill([[60, 92], [180, 92], [180, 100], [60, 100]], 'n', { a: 0.5 }); g.fill([[60, 92], [60 + 120 * g.seg(0.5, 0.9), 92], [60 + 120 * g.seg(0.5, 0.9), 100], [60, 100]], 'a', { a: 0.6 }); g.cursor(lerp(190, xs[k], a), lerp(130, 58, a), pr(g, 0.42)); }); };
  const txt = ['Sketch and model the part', 'Toolpaths, simulation, G-code', 'Setup sheet for the shop'];
  S('ws:design', tabsTo(0, 1, txt)); S('ws:cam', tabsTo(1, 0, txt)); S('ws:sheet', tabsTo(2, 1, txt));
// the pointer travels in early, so the card is already moving when someone hovers for a moment
  A.touch(['btnTheme'], 120, 88, 0.45, [175, 135]);
})(typeof window !== 'undefined' ? window : this);
