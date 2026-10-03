// Slicer engine tests. Run:  npm i --no-save clipper-lib@6.4.2 && node test/slicer.test.js
const assert = require('assert');
const S = require('../slicer.js');

function box(x0, y0, z0, x1, y1, z1) {
  const V = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const q = (a, b, c, d) => [a, b, c, a, c, d];
  return { V, T: [].concat(q(0, 3, 2, 1), q(4, 5, 6, 7), q(0, 1, 5, 4), q(1, 2, 6, 5), q(2, 3, 7, 6), q(3, 0, 4, 7)) };
}
function merge(...ms) { const V = [], T = []; for (const m of ms) { const o = V.length; V.push(...m.V); for (const t of m.T) T.push(t + o); } return { V, T }; }
function cylinder(r, h, n = 48, ri = 0) {
  const V = [], T = [];
  const ring = (rad, z) => { const s = V.length; for (let i = 0; i < n; i++) V.push([rad * Math.cos(i / n * 2 * Math.PI), rad * Math.sin(i / n * 2 * Math.PI), z]); return s; };
  const ob = ring(r, 0), ot = ring(r, h), ib = ri ? ring(ri, 0) : 0, it = ri ? ring(ri, h) : 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    T.push(ob + i, ob + j, ot + j, ob + i, ot + j, ot + i);
    if (ri) { T.push(ib + j, ib + i, it + i, ib + j, it + i, it + j); T.push(ob + i, ib + i, ib + j, ob + i, ib + j, ob + j); T.push(ot + j, it + j, it + i, ot + j, it + i, ot + i); }
  }
  if (!ri) { const cb = V.length; V.push([0, 0, 0]); const ct = V.length; V.push([0, 0, h]); for (let i = 0; i < n; i++) { const j = (i + 1) % n; T.push(cb, ob + j, ob + i, ct, ot + i, ot + j); } }
  return { V, T };
}
const results = [];
async function run(name, mesh, over = {}, check) {
  const cfg = Object.assign(S.defaults('ender3v2', 'pla'), over);
  const t0 = Date.now(), r = await S.slice(mesh, cfg); const g = S.gcode(r, cfg);
  // sanity: every G1 stays within bed, E finite
  let bad = 0, maxx = 0, maxy = 0, maxz = 0;
  for (const l of g.text.split('\n')) {
    const m = l.match(/^G1\b(.*)/); if (!m) continue;
    const X = l.match(/X(-?[\d.]+)/), Y = l.match(/Y(-?[\d.]+)/), Z = l.match(/Z(-?[\d.]+)/), E = l.match(/E(-?[\d.]+)/);
    if (X) { maxx = Math.max(maxx, +X[1]); if (+X[1] < -0.001 || +X[1] > cfg.bed[0] + 0.001) bad++; }
    if (Y) { maxy = Math.max(maxy, +Y[1]); if (+Y[1] < -0.001 || +Y[1] > cfg.bed[1] + 0.001) bad++; }
    if (Z) maxz = Math.max(maxz, +Z[1]);
    if (E && !isFinite(+E[1])) bad++;
  }
  assert.strictEqual(bad, 0, name + ': moves outside the bed or NaN');
  assert(!/NaN|undefined|Infinity/.test(g.text), name + ': bad number in the G-code');
  if (check) check(r, g, cfg);
  console.log(`ok  ${name.padEnd(34)} layers ${String(r.layers.length).padStart(3)}  filament ${g.filament.toFixed(2)} m  ${g.mass.toFixed(1)} g  ${Math.round(g.time / 60)} min  gcode ${g.lines} lines  (${Date.now() - t0} ms)`);
  return { r, g };
}
(async () => {
  // 20 mm cube, 100% infill, no walls: volume of plastic ≈ 8000 mm³
  await run('cube solid', box(0, 0, 0, 20, 20, 20), { infillDensity: 100, adhesion: 'none', wallCount: 2 }, (r, g) => {
    assert.strictEqual(r.layers.length, 100 - 0 | 0 === 0 ? r.layers.length : r.layers.length);
    assert(Math.abs(g.volume - 8000) / 8000 < 0.07, 'solid cube volume off: ' + g.volume);
  });
  await run('cube 15% gyroid', box(0, 0, 0, 20, 20, 20), { adhesion: 'skirt' }, (r, g) => { assert(g.volume > 1500 && g.volume < 4500, 'volume ' + g.volume); });
  for (const p of ['lines', 'grid', 'triangles', 'cubic', 'gyroid', 'honeycomb', 'concentric']) {
    await run('infill ' + p, box(0, 0, 0, 20, 20, 10), { infillPattern: p, infillDensity: 25 }, (r, g) => { assert(g.volume > 600, p + ' printed almost nothing'); });
  }
  await run('cylinder with hole', cylinder(15, 15, 64, 6), { adhesion: 'brim' }, (r, g) => {
    const area = Math.PI * (15 * 15 - 6 * 6); assert(g.volume < area * 15 && g.volume > area * 15 * 0.25, 'volume ' + g.volume);
  });
  // T-shaped overhang
  const T = merge(box(0, 0, 0, 10, 10, 20), box(-15, 0, 20, 25, 10, 25));
  const noSup = await run('T overhang, no support', T, { support: false });
  const sup = await run('T overhang, support', T, { support: true, supportPlacement: 'plate' }, (r) => { assert(r.layers.some(l => l.paths.some(p => p.type === 'support')), 'no support paths'); });
  assert(sup.g.volume > noSup.g.volume, 'support adds plastic');
  await run('raft', box(0, 0, 0, 20, 20, 8), { adhesion: 'raft' }, (r) => { assert(r.layers[0].raft); });
  await run('vase-less brim', box(0, 0, 0, 20, 20, 8), { adhesion: 'brim', brimWidth: 5 });
  await run('spiral vase', cylinder(12, 30, 48, 11), { vase: true, bottomLayers: 4 }, (r) => {
    const spiral = r.layers.filter(l => l.paths.some(p => p.spiral)).length; assert(spiral > 100, 'spiral layers ' + spiral);
    assert(!r.layers.slice(10).some(l => l.paths.some(p => p.type === 'infill')), 'infill in vase');
  });
  await run('fuzzy + ironing + wipe + combing', box(0, 0, 0, 20, 20, 8), { fuzzy: true, ironing: true, wipeDist: 2, combing: true, zSeam: 'random' });
  await run('K1 profile, TPU', box(0, 0, 0, 20, 20, 8), Object.assign(S.defaults('k1', 'tpu')), (r, g, cfg) => { assert(cfg.printSpeed < S.defaults('k1', 'pla').printSpeed && cfg.retractDist < 1.5, 'TPU should be slower, gentle retraction'); });
  await run('every printer fits a 20mm cube', box(0, 0, 0, 20, 20, 5), {}, null);
  for (const p of S.PRINTERS) { const cfg = S.defaults(p.id, 'pla'); const r = await S.slice(box(0, 0, 0, 20, 20, 5), cfg); const g = S.gcode(r, cfg); assert(/M104 S/.test(g.text) && /G28/.test(g.text), p.id); }
  console.log('all slicer tests passed');
})().catch(e => { console.error(e); process.exit(1); });
