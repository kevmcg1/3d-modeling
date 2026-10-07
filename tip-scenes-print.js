/* tip-scenes-print.js: action scenes for the 3D Print tab: the slicer and the printer doing what each setting or button means.
   The nozzle really lays the layers: perimeters first, then infill, with the part growing under it. */
(function (root) {
  'use strict';
  const A = root.TipAnim; if (!A) return;
  const S = A.scene, U = A.util, { lerp, clamp, ngon } = U;
  const TAU = Math.PI * 2;
  const R = (w, d) => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  const PART = R(24, 16), PART2 = R(30, 22);
  const bed = g => { g.box(-24, -19, -2, 48, 38, 2, 'k', { edge: true }); for (let i = -20; i <= 20; i += 10) { g.line([[i, -19, 0.05], [i, 19, 0.05]], 'm', 0.5, { a: 0.5 }); g.line([[-24, i * 0.8, 0.05], [24, i * 0.8, 0.05]], 'm', 0.5, { a: 0.5 }); } };
  const loop = (hw, hd, z) => [[-hw, -hd, z], [hw, -hd, z], [hw, hd, z], [-hw, hd, z], [-hw, -hd, z]];
  const infillPath = (hw, hd, z, kind, dens) => {
    const sp = clamp(7 / Math.max(0.05, dens), 1.4, 14), out = []; let k = 0;
    if (kind === 'none') return out;
    const lines = (vertical, off) => { k = 0; if (vertical) for (let x = -hw + off; x <= hw; x += sp, k++) out.push(k % 2 ? [x, hd, z] : [x, -hd, z], k % 2 ? [x, -hd, z] : [x, hd, z]); else for (let y = -hd + off; y <= hd; y += sp, k++) out.push(k % 2 ? [hw, y, z] : [-hw, y, z], k % 2 ? [-hw, y, z] : [hw, y, z]); };
    if (kind === 'grid') { lines(false, 0); lines(true, 0); } else if (kind === 'tri') { lines(false, 0); for (let x = -hw - hd; x <= hw + hd; x += sp * 1.6) out.push([x, -hd, z], [x + hd * 2, hd, z]); } else if (kind === 'gyroid') { for (let x = -hw; x <= hw; x += 1) out.push([x, Math.sin(x * 0.7) * hd * 0.8, z]); for (let x = hw; x >= -hw; x -= 1) out.push([x, Math.cos(x * 0.7) * hd * 0.8, z]); } else if (kind === 'conc') { for (let s = 0.8; s > 0.1; s -= sp / 16) out.push(...loop(hw * s, hd * s, z)); } else lines(false, 0);
    return out;
  };
  const layerPath = (o, z) => { const out = []; for (let i = 0; i < (o.walls || 2); i++) out.push(...loop(11 - i * 1.1, 7 - i * 1.1, z)); out.push(...infillPath(8.6 - (o.walls || 2) * 0.6, 5.2 - (o.walls || 2) * 0.6, z, o.infill || 'lines', o.density == null ? 0.25 : o.density)); return out; };

  // the part growing under a moving nozzle; o: lh (layer height shown), walls, infill, density, support, brim, vase, temp...
  function print(g, o = {}) {
    g.view(120, 132, 2.7); bed(g); const H = o.H || 12, lh = o.lh || 1.2, N = Math.round(H / lh), p = g.lin(0.06, 0.94), cur = p * N, done = Math.min(N - 1, Math.floor(cur)), within = cur - done;
    const part = o.part || PART;
    if (o.brim) { const bp = g.lin(0.0, 0.1); for (let k = 0; k < 3; k++) g.line(loop(14 + k * 0.9, 10 + k * 0.9, 0.1), 'c', 1.4, { a: 0.9 }); }
    if (o.raft) g.box(-15, -11, 0, 30, 22, 1, 'n');
    if (o.support) { const sh = Math.min(done * lh, 7); for (let k = 0; k < 4; k++) g.cyl(-10 + k * 6.5, 12, 0, 1.1, sh, 'm', { n: 8 }); }
    const groups = Math.min(done, o.vase ? 1 : 14); for (let k = 0; k < groups; k++) { const z0 = done * lh * k / Math.max(1, groups), z1 = done * lh * (k + 1) / Math.max(1, groups); g.prism(part, z0, z1 - z0, k % 2 ? [86, 142, 226] : 'a', { edge: false }); }
    if (done > 0) g.prism(part, done * lh - 0.01, 0.01, 'a');
    const z = (done + 1) * lh, path = o.vase ? Array.from({ length: 60 }, (_, i) => [11 * Math.cos(TAU * i / 60), 7 * Math.sin(TAU * i / 60), z]) : layerPath(o, z + 0.05), hd = g.head(path, within);
    g.line(hd, 'c', o.thin ? 1.2 : 2.2); const e = g.along(path, within).p; g.tool('nozzle', e[0], e[1], e[2] + 0.1);
    if (o.draw) o.draw(g, e, p);
    return { e, p, z };
  }
  // a flat top-down slice drawn by the nozzle
  function slice(g, o = {}) {
    g.view2d(120, 92, 4.6); g.fill(R(34, 24).map(p => [p[0], p[1]]), 'k', { a: 0.12, stroke: 'm' }); const path = layerPath({ walls: o.walls || 2, infill: o.infill || 'lines', density: o.density == null ? 0.3 : o.density }, 0).map(p => [p[0] * 1.1, p[1] * 1.15]), f = g.lin(0.08, 0.92);
    g.line(g.head(path, f), 'c', o.w || 2.2); const e = g.along(path, f).p; g.dot(e, 'k', 3.2); g.dot(e, 'r', 1.4); return e;
  }
  const chip = (g, s, c) => g.chip(s, c || 'a');

  S('print:slice', g => {
    g.view(120, 132, 2.7); bed(g); const u = g.seg(0.1, 0.65), H = 12, pz = H * u; g.prism(PART, 0, H, 'n', { a: 0.35 });
    const k = Math.floor(u * 10); for (let i = 0; i <= k; i++) g.line(loop(12, 8, i * 1.2), 'a', 1.2, { a: 0.9 }); g.fill([[-18, -14, pz], [18, -14, pz], [18, 14, pz], [-18, 14, pz]], 'c', { a: 0.25, stroke: 'c', w: 1.2 }); if (g.t > 0.7) chip(g, 'Sliced: 10 layers, 6 m of filament', 'g');
  });
  S('print:save', g => {
    g.view(120, 118, 3); const lines = ['; Datum slicer', 'G28', 'M104 S210', 'G1 Z0.3 F600', 'G1 X20 Y20 E1.2', 'G1 X60 E3.4', 'G1 Y40 E4.7', 'M107'], n = Math.floor(g.lin(0.1, 0.8) * lines.length);
    g.in2d(0, 0, 1, () => { g.fill([[44, 14], [196, 14], [196, 150], [44, 150]], 'w', { a: 0.98, stroke: 'm' }); lines.slice(0, n).forEach((s, i) => g.text(54, 34 + i * 12, s, 'k', 8.5, 'left')); g.text(54, 24, 'part.gcode', 'a', 7, 'left'); });
  });
  const rotScene = axis => g => {
    g.view(120, 128, 2.7); bed(g); const a = 90 * g.seg(0.25, 0.8), c = [0, 0, 6]; g.turn(axis, a, c, () => g.prism([[-12, -6], [12, -6], [12, 2], [4, 2], [4, 6], [-12, 6]], 0, 12, 'a')); const pts = Array.from({ length: 20 }, (_, i) => { const t = a * Math.PI / 180 * i / 19 + 0.3, r = 16; return axis === 'z' ? [r * Math.cos(t), r * Math.sin(t), 0.2] : axis === 'x' ? [0, r * Math.cos(t), 6 + r * Math.sin(t)] : [r * Math.cos(t), 0, 6 + r * Math.sin(t)]; }); g.line(pts, 'r', 1.8);
  };
  S('print:rotx place:rx', rotScene('x')); S('print:roty place:ry', rotScene('y')); S('print:rotz place:rz', rotScene('z'));
  S('print:flat', g => { g.view(120, 128, 2.7); bed(g); const a = 38 * (1 - g.seg(0.25, 0.8)); g.turn('y', -a, [12, 0, 0], () => g.box(-12, -7, 0, 24, 14, 8, 'a')); g.chip('Lay the biggest face on the bed', 'a'); });
  S('print:center', g => { g.view(120, 128, 2.7); bed(g); const u = g.seg(0.25, 0.8); g.line([[-24, 0, 0.1], [24, 0, 0.1]], 'r', 0.8, { dash: [3, 2], a: 0.6 }); g.line([[0, -19, 0.1], [0, 19, 0.1]], 'r', 0.8, { dash: [3, 2], a: 0.6 }); g.move(lerp(-14, 0, u), lerp(9, 0, u), 0, () => g.box(-8, -6, 0, 16, 12, 9, 'a')); });
  S('print:ghost', g => { g.view(120, 128, 2.7); bed(g); const u = g.seg(0.2, 0.55), f = g.lin(0.3, 0.9); g.ctx.save(); g.ctx.globalAlpha = 1 - 0.8 * u; g.prism(PART, 0, 10, 'a'); g.ctx.restore(); const path = layerPath({ walls: 2, infill: 'grid', density: 0.3 }, 5).concat(layerPath({ walls: 2, infill: 'grid', density: 0.3 }, 7)); g.line(g.head(path, f), 'c', 1.4, { a: u }); g.line(loop(12, 8, 0.1), 'c', 1, { a: u * 0.6 }); });
  S('print:saveprof print:loadprof', g => { g.view(120, 118, 3); const u = g.seg(0.2, 0.7); g.in2d(0, 0, 1, () => { const pg = (x, y, c) => g.fill([[x - 20, y - 26], [x + 8, y - 26], [x + 20, y - 14], [x + 20, y + 26], [x - 20, y + 26]], 'w', { a: 0.99, stroke: c, w: 1.4 }); pg(176, 92, 'a'); g.text(176, 108, '.json', 'a', 8); g.fill([[30, 70], [100, 70], [100, 118], [30, 118]], 'w', { a: 0.97, stroke: 'm' }); [['Layer', 0.5], ['Infill', 0.2], ['Speed', 0.7]].forEach(([n, v], i) => { g.text(36, 84 + i * 14, n, 'k', 7, 'left'); g.fill([[62, 80 + i * 14], [96, 80 + i * 14], [96, 83 + i * 14], [62, 83 + i * 14]], 'n'); g.fill([[62, 80 + i * 14], [62 + 34 * v, 80 + i * 14], [62 + 34 * v, 83 + i * 14], [62, 83 + i * 14]], 'a'); }); g.arrow([108, 94], [136, 94], 'a', 1.6); g.fill([[30 + 100 * u, 80], [50 + 100 * u, 80], [50 + 100 * u, 100], [30 + 100 * u, 100]], 'a', { a: 0.0 }); }); });
  S('print:reset', g => { g.view(120, 118, 3); const u = g.seg(0.3, 0.8); g.in2d(0, 0, 1, () => { g.fill([[40, 40], [200, 40], [200, 140], [40, 140]], 'w', { a: 0.97, stroke: 'm' }); [['Layer', 0.8, 0.5], ['Infill', 0.1, 0.2], ['Speed', 0.9, 0.5]].forEach(([n, a, b], i) => { const v = lerp(a, b, u); g.text(50, 62 + i * 24, n, 'k', 8, 'left'); g.fill([[96, 58 + i * 24], [190, 58 + i * 24], [190, 62 + i * 24], [96, 62 + i * 24]], 'n'); g.fill([[96, 58 + i * 24], [96 + 94 * v, 58 + i * 24], [96 + 94 * v, 62 + i * 24], [96, 62 + i * 24]], 'a'); g.dot([96 + 94 * v, 60 + i * 24], 'a', 4.5); }); }); });
  S('print:layerup print:layerdn', g => { g.view(120, 132, 2.7); bed(g); const f = g.lin(0.1, 0.9), k = Math.round(1 + 9 * f), up = true, n = 10; g.prism(PART, 0, k * 1.2, 'a'); g.line(loop(12, 8, k * 1.2), 'c', 1.8); g.in2d(0, 0, 1, () => { g.fill([[220, 30], [224, 30], [224, 150], [224, 150]], 'n', { a: 1 }); g.fill([[218, 30], [222, 30], [222, 150], [218, 150]], 'n', { stroke: 'm' }); g.dot([220, 150 - 120 * f], 'a', 5); }); g.chip('Layer ' + k + ' of 10', 'a'); });
  const prof = (lh, name) => g => { print(g, { lh: lh * 4, H: 12, walls: 1, infill: 'none' }); g.chip(name, 'a'); };
  S('print:prof-draft', prof(0.3, 'Draft: 0.3 mm layers, fastest')); S('print:prof-standard', prof(0.2, 'Standard: 0.2 mm layers')); S('print:prof-fine', prof(0.12, 'Fine: 0.12 mm layers')); S('print:prof-ultra', prof(0.08, 'Ultra: 0.08 mm, smoothest'));
  S('set:layerHeight', g => { const lh = 0.6 + 0.9 * (0.5 + 0.5 * Math.sin(g.t * TAU)); print(g, { lh, walls: 1, infill: 'none' }); g.chip('Layer height ' + (lh / 4).toFixed(2) + ' mm', 'a'); });
  S('set:firstLayerHeight', g => { print(g, { lh: 1.2, walls: 2, infill: 'lines', draw: (g, e, p) => { g.arrow([14, -9, 6], [14, -9, 1.7], 'r', 1.2); } }); g.chip('First layer sticks best when thicker', 'a'); });
  S('set:lineWidth', g => { const w = 1 + 1.6 * (0.5 + 0.5 * Math.sin(g.t * TAU)); slice(g, { w, walls: 3, infill: 'lines' }); g.chip('Line width ' + (0.3 + w * 0.12).toFixed(2) + ' mm', 'a'); });
  S('set:wallCount', g => { const walls = 1 + Math.floor(g.lin(0, 0.9) * 3.99); slice(g, { walls, infill: 'none', w: 2.4 }); g.chip(walls + (walls > 1 ? ' walls' : ' wall'), 'a'); });
  S('set:zSeam', g => { g.view(120, 130, 2.8); bed(g); const f = g.lin(0.1, 0.9), N = 8; g.cyl(0, 0, 0, 9, 12 * f, 'a', { n: 28 }); for (let k = 0; k < N; k++) if (12 * f > k * 1.5) g.line([[9, 0.01, k * 1.5], [9, 0.01, k * 1.5 + 1.5]], 'r', 2.2); g.tool('nozzle', 9 * Math.cos(f * 40), 9 * Math.sin(f * 40), 12 * f + 0.2); g.chip('Seams line up in one column', 'r'); });
  S('set:topLayers set:bottomLayers set:skinPattern', g => {
    g.view(120, 130, 2.8); bed(g); g.box(-12, -8, 0, 24, 16, 6, 'a', { edge: false }); const f = g.lin(0.1, 0.9), n = 5, lines = []; for (let k = 0; k < n; k++) { const z = 6 + k * 0.7; for (let y = -7; y <= 7.01; y += 1.4) lines.push([[-11, y, z], [11, y, z]]); } const path = []; let kk = 0; for (let k = 0; k < n; k++) for (let y = -7; y <= 7.01; y += 1.4, kk++) { const z = 6 + k * 0.7; path.push(kk % 2 ? [11, y, z] : [-11, y, z], kk % 2 ? [-11, y, z] : [11, y, z]); }
    const hd = g.head(path, f); const topk = Math.floor(f * n); for (let k = 0; k <= topk && k < n; k++) g.box(-12, -8, 6 + k * 0.7, 24, 16, 0.7, k % 2 ? [90, 146, 228] : 'a', { edge: false }); g.line(hd.slice(-30), 'c', 1.4); const e = g.along(path, f).p; g.tool('nozzle', e[0], e[1], e[2] + 0.3);
  });
  S('set:infillDensity', g => { const d = 0.1 + 0.6 * g.seg(0.1, 0.9); slice(g, { walls: 1, infill: 'grid', density: d }); g.chip('Infill ' + Math.round(d * 100) + '%', 'a'); });
  const infillKind = k => g => { slice(g, { walls: 1, infill: k, density: 0.3 }); g.chip(k === 'tri' ? 'Triangles' : k === 'grid' ? 'Grid' : k === 'gyroid' ? 'Gyroid' : 'Lines', 'a'); };
  S('set:infillPattern', g => { const kinds = ['lines', 'grid', 'tri', 'gyroid'], k = kinds[Math.min(3, Math.floor(g.t * 4))]; g.t = (g.t * 4) % 1; infillKind(k)(g); });
  S('set:nozzleTemp', g => {
    print(g, { lh: 1.2, walls: 1, infill: 'none', draw: () => 0 }); const th = 0.5 + 0.5 * Math.sin(g.t * TAU); g.in2d(0, 0, 1, () => { g.fill([[16, 24], [24, 24], [24, 100], [16, 100]], 'n', { stroke: 'm' }); g.fill([[16, 100 - 76 * (0.4 + 0.5 * th)], [24, 100 - 76 * (0.4 + 0.5 * th)], [24, 100], [16, 100]], th > 0.5 ? 'r' : 'c'); g.dot([20, 104], th > 0.5 ? 'r' : 'c', 7); }); g.chip('Nozzle ' + Math.round(190 + 40 * th) + ' °C', th > 0.5 ? 'r' : 'c');
  });
  S('set:bedTemp', g => { g.view(120, 128, 2.7); const th = 0.5 + 0.5 * Math.sin(g.t * TAU * 0.9 - 1); g.box(-24, -19, -2, 48, 38, 2, [lerp(92, 235, th), lerp(103, 120, th), lerp(118, 90, th)]); for (let k = 0; k < 6; k++) { const t = (g.time * 0.8 + k / 6) % 1; g.line([[-18 + k * 7, 4, 0.5 + t * 8], [-18 + k * 7, 4, 1.5 + t * 8]], 'r', 1.4, { a: (1 - t) * th }); } g.box(-9, -6, 0, 18, 12, 6, 'a'); g.chip('Bed ' + Math.round(40 + 40 * th) + ' °C', 'r'); });
  S('set:flow', g => { const fl = 0.5 + 0.5 * Math.sin(g.t * TAU); slice(g, { walls: 2, infill: 'lines', w: 1.4 + 2.4 * fl }); g.chip('Flow ' + Math.round(85 + 30 * fl) + ' %', 'a'); });
  const speedScene = (name, speedUp, extra) => g => { const r = print(g, { lh: 1.2, walls: 2, infill: 'lines', draw: extra }); g.in2d(0, 0, 1, () => { for (let k = 0; k < 4; k++) { const x = 14 + ((g.time * speedUp * 30 + k * 18) % 72); g.line([[x - 10, 150 + k * 5], [x, 150 + k * 5]], 'c', 1.4, { a: 0.8 }); } }); g.chip(name, 'a'); };
  S('set:printSpeed', speedScene('Print speed', 1)); S('set:outerWallSpeed', speedScene('Outer wall: slow for a clean surface', 0.5)); S('set:infillSpeed', speedScene('Infill: fast, nobody sees it', 1.6)); S('set:firstLayerSpeed', speedScene('First layer: slow to stick', 0.35));
  S('set:travelSpeed', g => { g.view(120, 130, 2.7); bed(g); g.box(-12, -7, 0, 8, 14, 7, 'a'); g.box(4, -7, 0, 8, 14, 7, 'a'); const f = g.lin(0.1, 0.9), x = lerp(-8, 8, g.ease(f)), z = 7.5 + 6 * Math.sin(f * Math.PI); g.line([[-8, 0, 7.4], [x, 0, z]], 'k', 1, { dash: [2, 2] }); g.tool('nozzle', x, 0, z); g.chip('Travel: fast, no extruding', 'a'); });
  const retr = (name, amt) => g => { g.view(120, 130, 2.8); bed(g); g.box(-12, -4, 0, 5, 8, 8, 'a'); g.box(7, -4, 0, 5, 8, 8, 'a'); const f = g.lin(0.1, 0.9), x = lerp(-9, 10, g.seg(0.3, 0.7)), up = f > 0.2 && f < 0.85 ? amt : 0; g.tool('nozzle', x, 0, 8.4 + 4 * Math.sin(g.seg(0.3, 0.7) * Math.PI)); const fil = g.seg(0.15, 0.3) - g.seg(0.75, 0.9); g.line([[x, 0, 19], [x, 0, 28 - 6 * (0)]], 'm', 1.6); g.arrow([x + 4, 0, 24], [x + 4, 0, 24 + 5 * g.seg(0.15, 0.3) * amt - 5 * g.seg(0.75, 0.9) * amt], 'r', 1.4); if (f > 0.3 && f < 0.7) g.line([[-8.4, 0, 8.4], [x, 0, 8.4 + 4 * Math.sin(g.seg(0.3, 0.7) * Math.PI)]], 'c', 0.5, { a: 0.0 }); g.chip(name, 'a'); };
  S('set:retraction', retr('Retract: no strings between parts', 1)); S('set:retractDist', retr('Retraction distance', 1.6)); S('set:retractSpeed', retr('Retraction speed', 1.2));
  S('set:fanSpeed set:fanStartLayer', g => { print(g, { lh: 1.2, walls: 1, infill: 'none' }); g.in2d(0, 0, 1, () => { const x = 196, y = 60, a = g.time * 14; g.fill(ngon(x, y, 15, 24).map(p => [p[0], p[1]]), 'n', { stroke: 'm' }); for (let k = 0; k < 3; k++) g.line([[x, y], [x + 13 * Math.cos(a + k * TAU / 3), y + 13 * Math.sin(a + k * TAU / 3)]], 'a', 3); for (let k = 0; k < 4; k++) { const t = (g.time * 1.4 + k / 4) % 1; g.line([[x - 18 - t * 36, y + 4 + k * 4 - 6], [x - 26 - t * 36, y + 4 + k * 4 - 6]], 't', 1.4, { a: 1 - t }); } }); g.chip('Cooling fan on the fresh layer', 't'); });
  S('set:minLayerTime', g => { const r = print(g, { H: 12, lh: 2.4, walls: 1, infill: 'none', thin: true, part: R(10, 8) }); g.chip(((g.t * 4) % 1) > 0.5 ? 'Small layer: wait to cool' : 'Printing', 'a'); });
  const sup = name => g => { g.view(120, 130, 2.6); bed(g); const f = g.lin(0.1, 0.9), N = 14; g.box(-14, -8, 0, 6, 16, 14, 'a'); const arm = clamp((f - 0.12) * 1.5); g.box(-14, -8, 14 - 4, 6 + 20 * g.ease(arm), 16, 4, 'a'); const sh = Math.min(10, f * 18); for (let k = 0; k < 5; k++) { const x = -4 + k * 4.4; if (x < -8 + 26 * g.ease(arm)) g.cyl(x, 0, 0, 0.9, Math.min(10, f * 16), 'm', { n: 8 }); } g.chip(name, 'a'); };
  S('set:support', sup('Support holds up the overhang')); S('set:supportPlacement', sup('Everywhere, or only from the bed')); S('set:supportAngle', sup('Overhang steeper than this gets support')); S('set:supportPattern', sup('Support pattern: easy to peel')); S('set:supportDensity', sup('Denser support = stronger, harder to remove'));
  S('set:adhesion', g => { const f = g.lin(0, 0.4); g.view(120, 130, 2.7); bed(g); g.box(-10, -7, 0, 20, 14, 9 * g.seg(0.45, 0.95), 'a'); for (let k = 0; k < 3; k++) g.line(g.head(loop(14 + k * 1, 10 + k * 1, 0.1).concat([]), clamp(f * 3 - k)), 'c', 1.6); g.tool('nozzle', ...g.along(loop(14, 10, 0.1), f).p.map((v, i) => i === 2 ? 0.3 : v)); g.chip('Brim: extra grip on the bed', 'c'); });
  S('set:vase', g => { print(g, { lh: 1, H: 14, vase: true, part: ngon(0, 0, 9, 24) }); g.chip('Vase mode: one spiral wall', 'a'); });
  S('print:printer', g => { g.view(120, 130, 2.6); g.box(-18, -12, 0, 36, 24, 2, 'k'); g.box(-18, -12, 2, 3, 3, 26, 'm'); g.box(15, -12, 2, 3, 3, 26, 'm'); g.box(-18, -12, 26, 36, 3, 3, 'm'); const x = 10 * Math.sin(g.t * TAU); g.tool('nozzle', x, 0, 12); g.box(-8, -6, 2, 16, 12, 5, 'a'); });
  S('print:material', g => { g.view(120, 130, 2.6); const sp = g.time * 2; g.cyl(0, 0, 0, 12, 7, 'a'); g.cyl(0, 0, 0, 12.1, 0.01, 'n'); g.cyl(0, 0, 7, 4, 0.1, 'k'); for (let k = 0; k < 5; k++) g.line([[8 * Math.cos(sp + k * TAU / 5), 8 * Math.sin(sp + k * TAU / 5), 7.1], [11.5 * Math.cos(sp + k * TAU / 5), 11.5 * Math.sin(sp + k * TAU / 5), 7.1]], 'w', 1.2); });
  S('print:search print:all', g => { g.view(120, 118, 3); const u = g.lin(0.1, 0.85); g.in2d(0, 0, 1, () => { g.fill([[50, 22], [190, 22], [190, 38], [50, 38]], 'w', { a: 1, stroke: 'a' }); g.text(58, 33, 'infi'.slice(0, Math.floor(u * 5)), 'k', 9, 'left'); ['Infill density', 'Infill pattern', 'Infill speed', 'Layer height', 'Wall count'].forEach((s, i) => { const hit = /nfil/.test(s); if (u > 0.5 || !hit) { g.fill([[50, 46 + i * 18], [190, 46 + i * 18], [190, 60 + i * 18], [50, 60 + i * 18]], hit ? 'a' : 'n', { a: hit ? 0.15 : 0.15 * (u > 0.5 ? 0.3 : 1) }); g.text(58, 57 + i * 18, s, hit ? 'a' : 'k', 8.5, 'left'); } }); }); });
  S('place:scale', g => { g.view(120, 128, 2.6); bed(g); const k = 0.7 + 0.8 * g.seg(0.2, 0.8); g.scale3(k, k, k, [0, 0, 0], () => g.prism([[-8, -5], [8, -5], [8, 2], [2, 2], [2, 5], [-8, 5]], 0, 8, 'a')); g.dot([8 * k, 5 * k, 8 * k], 'r', 3); g.chip(Math.round(k * 100) + ' %', 'a'); });
  S('place:partX', g => { g.view(120, 128, 2.6); bed(g); const x = lerp(-10, 10, g.seg(0.2, 0.8)); g.move(x, 0, 0, () => g.box(-6, -5, 0, 12, 10, 8, 'a')); g.arrow([-18, 15, 0.1], [18, 15, 0.1], 'r', 1.2); g.dot([x, 15, 0.1], 'r', 3); g.chip('X ' + (x * 5 + 110).toFixed(0) + ' mm', 'a'); });
  S('place:partY', g => { g.view(120, 128, 2.6); bed(g); const y = lerp(-8, 8, g.seg(0.2, 0.8)); g.move(0, y, 0, () => g.box(-6, -5, 0, 12, 10, 8, 'a')); g.arrow([-21, -16, 0.1], [-21, 16, 0.1], 'r', 1.2); g.dot([-21, y, 0.1], 'r', 3); g.chip('Y ' + (y * 5 + 110).toFixed(0) + ' mm', 'a'); });
  S('place:sizeZ', g => { g.view(120, 130, 2.6); bed(g); const h = 8 + 6 * g.seg(0.2, 0.8); g.box(-8, -6, 0, 16, 12, h, 'a'); g.arrow([12, 0, 0], [12, 0, h], 'r', 1.6); g.arrow([12, 0, h], [12, 0, 0], 'r', 1.6); g.chip('Height ' + (h * 4).toFixed(0) + ' mm', 'a'); });
  const cost = (name, c, fn) => g => { g.view(120, 118, 3); const u = fn ? fn(g) : g.seg(0.15, 0.8); g.in2d(0, 0, 1, () => { const parts = [['Machine', 0.3, 'a'], ['Material', 0.2, 'g'], ['Labour', 0.25, 'c'], ['Power', 0.1, 'p'], ['Fail', 0.08, 'r']]; let x = 36; parts.forEach(([n, w, col]) => { const cw = 168 * w * (col === c ? 0.5 + 0.9 * u : 0.6); g.fill([[x, 70], [x + cw, 70], [x + cw, 100], [x, 100]], col, { a: col === c ? 0.95 : 0.35 }); x += cw; }); g.text(120, 132, name, 'k', 9); }); };
  const COSTS = { shopRate: ['Machine rate per hour', 'a'], laborRate: ['Labour rate per hour', 'c'], setupMin: ['Setup time, shared by the batch', 'c'], handMin: ['Hands-on time per part', 'c'], qty: ['Quantity: setup spreads thinner', 'a'], powerW: ['Printer power draw', 'p'], kwh: ['Electricity price', 'p'], overheadPct: ['Overhead on top', 'a'], failurePct: ['Failed prints added in', 'r'], marginPct: ['Margin on the price', 'g'], filamentCost: ['Filament price per kg', 'g'] };
  for (const [k, [n, c]] of Object.entries(COSTS)) S('cost:' + k, cost(n, c));

  /* second drafts: the settings panel is copied out to a file (save) or filled in from one (load); search types and the list narrows */
  const profScene = dir => g => {
    g.view(120, 118, 3); const u = g.seg(0.2, 0.75), t = dir > 0 ? u : 1 - u;
    g.in2d(0, 0, 1, () => {
      const pg = (x, y, c) => g.fill([[x - 20, y - 26], [x + 8, y - 26], [x + 20, y - 14], [x + 20, y + 26], [x - 20, y + 26]], 'w', { a: 0.99, stroke: c, w: 1.4 });
      pg(180, 92, 'a'); g.text(180, 108, '.json', 'a', 8); g.fill([[20, 66], [92, 66], [92, 120], [20, 120]], 'w', { a: 0.97, stroke: 'm' });
      [['Layer', 0.5, 0.25], ['Infill', 0.2, 0.7], ['Speed', 0.7, 0.4]].forEach(([n, v, w], i) => { const val = dir > 0 ? v : lerp(w, v, u); g.text(26, 84 + i * 14, n, 'k', 7, 'left'); g.fill([[52, 80 + i * 14], [86, 80 + i * 14], [86, 83 + i * 14], [52, 83 + i * 14]], 'n'); g.fill([[52, 80 + i * 14], [52 + 34 * val, 80 + i * 14], [52 + 34 * val, 83 + i * 14], [52, 83 + i * 14]], 'a'); });
      const x = lerp(56, 150, t); g.fill([[x - 12, 80], [x + 12, 80], [x + 12, 104], [x - 12, 104]], 'a', { a: 0.35 * Math.sin(Math.PI * u) + 0.02, stroke: 'a', w: 1 }); g.arrow([100, 96], [136, 96], 'a', 1.6);
      g.cursor(lerp(dir > 0 ? 40 : 170, dir > 0 ? 56 : 160, g.seg(0.02, 0.2)) + 0 * u, lerp(130, 96, g.seg(0.02, 0.2)), g.lin(0.18, 0.26) > 0 && g.lin(0.18, 0.26) < 1 ? 1 - g.lin(0.18, 0.26) : 0);
    });
    g.chip(dir > 0 ? 'Save these settings as a file' : 'Load settings from a file', 'a');
  };
  S('print:saveprof', profScene(1)); S('print:loadprof', profScene(-1));
  S('print:search print:all', g => {
    g.view(120, 118, 3); const n = Math.floor(g.lin(0.3, 0.6) * 5), mv = g.seg(0.62, 0.88), rows = ['Infill density', 'Infill pattern', 'Infill speed', 'Layer height', 'Wall count'];
    g.in2d(0, 0, 1, () => {
      g.fill([[50, 22], [190, 22], [190, 38], [50, 38]], 'w', { a: 1, stroke: 'a' }); g.text(58, 33, 'infi'.slice(0, Math.min(4, n)) + (Math.floor(g.time * 3) % 2 ? '|' : ''), 'k', 9, 'left');
      let r = 0;
      rows.forEach((s, i) => {
        const hit = /nfil/.test(s), y = hit ? lerp(46 + i * 18, 46 + (r++) * 18, mv) : 46 + i * 18, x = hit ? 0 : 150 * mv;
        g.fill([[50 + x, y], [190 + x, y], [190 + x, y + 14], [50 + x, y + 14]], hit ? 'a' : 'n', { a: 0.18, stroke: hit ? 'a' : 'm' }); g.text(58 + x, y + 11, s, hit ? 'a' : 'k', 8.5, 'left');
      });
      const c = g.seg(0.0, 0.28); g.cursor(lerp(215, 60, c), lerp(120, 30, c), g.lin(0.26, 0.33) > 0 && g.lin(0.26, 0.33) < 1 ? 1 - g.lin(0.26, 0.33) : 0);
    });
  });
})(typeof window !== 'undefined' ? window : this);
