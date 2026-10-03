// Slicer stress test: awkward meshes x odd settings x every printer, with G-code invariants checked.
//   npm i --no-save clipper-lib@6.4.2 && node test/slicer.stress.js [--quick]
const assert = require('assert');
const S = require('../slicer.js');
const quick = process.argv.includes('--quick');

/* ── meshes ─────────────────────────────────────────────────────────── */
const box = (x0, y0, z0, x1, y1, z1) => {
  const V = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const q = (a, b, c, d) => [a, b, c, a, c, d];
  return { V, T: [].concat(q(0, 3, 2, 1), q(4, 5, 6, 7), q(0, 1, 5, 4), q(1, 2, 6, 5), q(2, 3, 7, 6), q(3, 0, 4, 7)) };
};
const merge = (...ms) => { const V = [], T = []; for (const m of ms) { const o = V.length; V.push(...m.V); for (const t of m.T) T.push(t + o); } return { V, T }; };
const move = (m, dx, dy, dz) => ({ V: m.V.map(v => [v[0] + dx, v[1] + dy, v[2] + dz]), T: m.T });
const flip = m => { const T = m.T.slice(); for (let i = 0; i < T.length; i += 3) [T[i + 1], T[i + 2]] = [T[i + 2], T[i + 1]]; return { V: m.V, T }; };
function tube(r, h, n = 48, ri = 0) {                       // cylinder, or a pipe when ri > 0
  const V = [], T = [], ring = (rad, z) => { const s = V.length; for (let i = 0; i < n; i++) V.push([rad * Math.cos(i / n * 2 * Math.PI), rad * Math.sin(i / n * 2 * Math.PI), z]); return s; };
  const ob = ring(r, 0), ot = ring(r, h), ib = ri ? ring(ri, 0) : 0, it = ri ? ring(ri, h) : 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    T.push(ob + i, ob + j, ot + j, ob + i, ot + j, ot + i);
    if (ri) T.push(ib + j, ib + i, it + i, ib + j, it + i, it + j, ob + i, ib + i, ib + j, ob + i, ib + j, ob + j, ot + j, it + j, it + i, ot + j, it + i, ot + i);
  }
  if (!ri) { const cb = V.length; V.push([0, 0, 0]); const ct = V.length; V.push([0, 0, h]); for (let i = 0; i < n; i++) { const j = (i + 1) % n; T.push(cb, ob + j, ob + i, ct, ot + i, ot + j); } }
  return { V, T };
}
function sphere(r, nu = 32, nv = 16) {
  const V = [], T = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i < nu; i++) { const th = j / nv * Math.PI, ph = i / nu * 2 * Math.PI; V.push([r * Math.sin(th) * Math.cos(ph), r * Math.sin(th) * Math.sin(ph), r - r * Math.cos(th)]); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * nu + i, b = j * nu + (i + 1) % nu, c = a + nu, d = b + nu; if (j > 0) T.push(a, c, b); if (j < nv - 1) T.push(b, c, d); }
  return { V, T };
}
function torus(R, r, nu = 40, nv = 16) {
  const V = [], T = [];
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const u = i / nu * 2 * Math.PI, v = j / nv * 2 * Math.PI; V.push([(R + r * Math.cos(v)) * Math.cos(u), (R + r * Math.cos(v)) * Math.sin(u), r + r * Math.sin(v)]); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * nu + i, b = j * nu + (i + 1) % nu, c = (j + 1) % nv * nu + i, d = (j + 1) % nv * nu + (i + 1) % nu; T.push(a, b, d, a, d, c); }
  return { V, T };
}
const MESHES = {
  'tiny 1mm cube': box(0, 0, 0, 1, 1, 1),
  'sliver 0.05mm wall': box(0, 0, 0, 30, 0.05, 20),
  'thin wall 0.3mm': box(0, 0, 0, 40, 0.3, 30),
  'flat plate 100x100x0.4': box(0, 0, 0, 100, 100, 0.4),
  'bed-filling plate': box(0, 0, 0, 215, 215, 3),
  'tall tower 8x8x120': box(0, 0, 0, 8, 8, 120),
  'sphere r=15 (needs support)': sphere(15),
  'torus': torus(20, 5),
  'pipe (hole)': tube(15, 30, 64, 13),
  'cone-ish stack': merge(tube(20, 5), move(tube(10, 5), 0, 0, 5), move(tube(2, 10), 0, 0, 10)),
  'T overhang': merge(box(0, 0, 0, 10, 10, 20), box(-15, 0, 20, 25, 10, 25)),
  'bridge between pillars': merge(box(0, 0, 0, 5, 5, 20), box(30, 0, 0, 35, 5, 20), box(0, 0, 20, 35, 5, 23)),
  'overlapping bodies': merge(box(0, 0, 0, 20, 20, 20), box(10, 10, 5, 30, 30, 25)),
  'disjoint islands': merge(box(0, 0, 0, 10, 10, 10), box(40, 40, 0, 50, 50, 15), box(80, 0, 0, 85, 5, 5)),
  'inside-out (flipped normals)': flip(box(0, 0, 0, 20, 20, 20)),
  'degenerate triangles': (() => { const m = box(0, 0, 0, 20, 20, 20); m.V.push([5, 5, 5], [5, 5, 5], [5, 5, 5]); m.T.push(8, 9, 10, 8, 8, 8); return m; })(),
  'open box (no lid)': (() => { const m = box(0, 0, 0, 20, 20, 20); m.T.splice(6, 6); return m; })(),
  'floating body': merge(box(0, 0, 0, 20, 20, 3), move(box(0, 0, 0, 10, 10, 10), 5, 5, 30)),
  'sub-layer step 0.03mm': merge(box(0, 0, 0, 20, 20, 5), box(0, 0, 5, 20, 20, 5.03)),
  'coincident faces': merge(box(0, 0, 0, 20, 20, 10), box(20, 0, 0, 40, 20, 10)),
};

/* ── G-code invariants ──────────────────────────────────────────────── */
function check(name, cfg, res, g) {
  const pr = S.printerById(cfg.printer), txt = g.text, errs = [];
  if (/NaN|undefined|Infinity|null/.test(txt)) errs.push('bad token in G-code');
  let x = 0, y = 0, z = 0, minz = Infinity, maxz = 0, ext = 0, mx = 0, my = 0, nmove = 0, E = 0, fmax = 0, lastLayerZ = -1, hop = cfg.zHop || 0;
  for (const l of txt.split('\n')) {
    const m = l.match(/^G1 (.*)/); if (!m) { const t = l.match(/^M10[49] S(\d+)/) || l.match(/^M1[49]0 S(\d+)/); if (t) { const v = +t[1], hot = /^M10[49]/.test(l); if (hot && v > pr.maxHotend) errs.push('nozzle ' + v + ' > max ' + pr.maxHotend); if (!hot && v > pr.maxBed) errs.push('bed ' + v + ' > max ' + pr.maxBed); } continue; }
    const g1 = {}; for (const w of m[1].split(' ')) if (/^[XYZEF]-?[\d.]+$/.test(w)) g1[w[0]] = +w.slice(1);
    if ('X' in g1) x = g1.X; if ('Y' in g1) y = g1.Y; if ('Z' in g1) z = g1.Z;
    if ('F' in g1) { fmax = Math.max(fmax, g1.F / 60); }
    nmove++;
    if ((x < -0.01 || x > cfg.bed[0] + 0.01 || y < -0.01 || y > cfg.bed[1] + 0.01) && !(res.warnings || []).some(w => /bed/.test(w))) errs.push(`XY out of bed (${x}, ${y})`);
    if (z < -0.01) errs.push('Z below bed ' + z);
    if (z > cfg.bed[2] + hop + 0.5) errs.push('Z above build height ' + z);
    if (('X' in g1 || 'Y' in g1) && 'E' in g1 && g1.E > 0) { ext += g1.E; }
    if ('E' in g1 && cfg.relativeE !== false && Math.abs(g1.E) > 50) errs.push('absurd E ' + g1.E);
  }
  if (fmax > pr.maxSpeed + 0.5 && fmax > cfg.travelSpeed + 0.5) errs.push('feed ' + fmax.toFixed(0) + ' mm/s beyond printer max ' + pr.maxSpeed);
  if (!isFinite(g.time) || g.time < 0) errs.push('time ' + g.time);
  if (!isFinite(g.filament) || g.filament < 0) errs.push('filament ' + g.filament);
  if (res.layers.length) {
    const zs = res.layers.map(l => l.z);
    for (let i = 1; i < zs.length; i++) if (zs[i] < zs[i - 1] - 1e-6) { errs.push('layer Z goes down at ' + i); break; }
  }
  return errs;
}

/* ── runs ───────────────────────────────────────────────────────────── */
let n = 0, fail = 0, slow = [];
async function run(label, mesh, over = {}, printer = 'ender3v2', material = 'pla', expectLayers) {
  const cfg = Object.assign(S.defaults(printer, material), over);
  const t0 = Date.now(); let res, g, errs = [];
  try {
    res = await S.slice(mesh, cfg); g = S.gcode(res, cfg);
    errs = check(label, cfg, res, g);
    if (expectLayers) { const [lo, hi] = expectLayers; if (res.layers.length < lo || res.layers.length > hi) errs.push(`layers ${res.layers.length} not in ${lo}..${hi}`); }
  } catch (e) { errs.push('THREW ' + (e.stack || e).toString().split('\n').slice(0, 3).join(' | ')); }
  const dt = Date.now() - t0; n++;
  if (dt > 15000) slow.push([label, dt]);
  if (errs.length) { fail++; console.log(`FAIL ${label} [${printer}/${material}] ${JSON.stringify(over)}\n     ${[...new Set(errs)].slice(0, 4).join('\n     ')}`); }
  return { res, g, errs, dt };
}
(async () => {
  console.log('— awkward meshes —');
  for (const [name, mesh] of Object.entries(MESHES)) await run(name, mesh, { support: /support|sphere|bridge|T over|floating/.test(name) });
  console.log('— awkward meshes, vase / raft / brim / fuzzy / ironing —');
  for (const [name, mesh] of Object.entries(MESHES)) for (const over of [{ vase: true }, { adhesion: 'raft' }, { adhesion: 'brim', support: true }, { fuzzy: true, ironing: true, wipeDist: 3 }]) { if (quick && Math.random() < 0.6) continue; await run(name, mesh, over); }
  console.log('— settings extremes —');
  const cube = box(0, 0, 0, 25, 25, 12), sph = sphere(12);
  const EXT = [
    { layerHeight: 0.05, firstLayerHeight: 0.1 }, { layerHeight: 0.6, firstLayerHeight: 0.6, lineWidth: 0.8 }, { wallCount: 0 }, { wallCount: 12 }, { topLayers: 0, bottomLayers: 0 },
    { infillDensity: 0 }, { infillDensity: 100 }, { infillDensity: 3 }, { infillLayerThickness: 6 }, { infillBeforeWalls: true, outerWallFirst: true }, { skinPattern: 'concentric', infillPattern: 'concentric' },
    { retraction: false }, { retractDist: 12, zHop: 3, wipeDist: 8 }, { relativeE: false }, { combing: false }, { accel: 20000, jerk: 20, linearAdvance: 1.2 },
    { minLayerTime: 60, minSpeed: 1 }, { fanSpeed: 0, fanStartLayer: 20, fanFullLayer: 40 }, { printSpeed: 600, outerWallSpeed: 600, infillSpeed: 800, travelSpeed: 1000 },
    { maxFlowRate: 1 }, { flow: 50 }, { flow: 150 }, { xyComp: 0.8 }, { xyComp: -0.8 }, { elephantFoot: 1 }, { slicingTol: 'inclusive' }, { slicingTol: 'exclusive' }, { resolution: 0.3 },
    { zSeam: 'random' }, { zSeam: 'nearest' }, { zSeam: 'aligned', seamSide: 'left' }, { supportAngle: 5, support: true }, { supportAngle: 85, support: true }, { support: true, supportPlacement: 'everywhere' },
    { support: true, supportDensity: 100, supportRoof: 8, supportZ: 5, supportXY: 5 }, { support: true, supportDensity: 5, supportRoof: 0, supportZ: 0, supportXY: 0 },
    { adhesion: 'skirt', skirtLines: 20, skirtDist: 30, skirtMinLength: 2000 }, { adhesion: 'brim', brimWidth: 30 }, { adhesion: 'raft', raftLayers: 6, raftMargin: 20, raftGap: 1 },
    { layerGcode: '1: M600\n5: M117 hello\n9999: M0\nnonsense' }, { startGcode: '', endGcode: '' }, { xform: { scale: 20, rx: 45, ry: 33, rz: 17 } }, { xform: { scale: 100, rx: 90, ry: 90, rz: 90 } },
    { partX: -50, partY: 500 }, { filamentDia: 2.85, nozzle: 0.8, lineWidth: 0.9, layerHeight: 0.4 },
  ];
  for (const e of EXT) for (const [nm, m] of [['cube', cube], ['sphere', sph]]) { if (quick && Math.random() < 0.5) continue; await run('ext ' + nm, m, Object.assign({ support: nm === 'sphere' }, e)); }
  for (const pat of ['lines', 'grid', 'triangles', 'cubic', 'gyroid', 'honeycomb', 'concentric']) for (const d of [1, 8, 40, 99]) for (const sp of ['lines', 'grid', 'triangles']) { if (quick && Math.random() < 0.8) continue; await run(`pattern ${pat} d=${d} support=${sp}`, MESHES['T overhang'], { infillPattern: pat, infillDensity: d, support: true, supportPattern: sp }); }
  console.log('— every printer × every material —');
  for (const p of S.PRINTERS) for (const mt of S.MATERIALS) { if (quick && Math.random() < 0.7) continue; await run('printer', box(0, 0, 0, 30, 30, 6), {}, p.id, mt.id); }
  console.log('— big jobs —');
  const big = await run('huge: 2000 layers', box(0, 0, 0, 10, 10, 100), { layerHeight: 0.05, firstLayerHeight: 0.1, wallCount: 1, infillDensity: 5 }, 'ender3v2', 'pla', [1900, 2100]);
  console.log('   2000 layers took', big.dt, 'ms,', (big.g.text.length / 1e6).toFixed(1), 'MB of G-code');
  if (!quick) {
    const pl = await run('big plate 215x215x20 gyroid', box(0, 0, 0, 215, 215, 20), { infillPattern: 'gyroid', infillDensity: 20 }, 'ender3v2');
    console.log('   215x215x20 took', pl.dt, 'ms,', (pl.g.text.length / 1e6).toFixed(1), 'MB');
    const hi = await run('sphere r=40 fine, support', sphere(40, 96, 48), { layerHeight: 0.12, support: true }, 'k1max');
    console.log('   hi-res sphere took', hi.dt, 'ms');
  }
  console.log(`\n${n} runs, ${fail} failed${slow.length ? ', slow: ' + JSON.stringify(slow) : ''}`);
  process.exit(fail ? 1 : 0);
})();
