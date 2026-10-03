// node test/house.test.js
// House Design (house.html) keeps its logic inline. This loads everything except the DOM-bound plan view and boot code into a
// sandbox and checks units, wall joints, rooms, stairs, floor cut-outs, document loading and the DXF / OBJ exports.
const assert = require('assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'house.html'), 'utf8');
let src = html.match(/<script>([\s\S]*)<\/script>/)[1];
const cut = (a, b) => { const i = src.indexOf(a), j = b ? src.indexOf(b) : src.length; assert(i > 0 && j > i, 'marker ' + a); src = src.slice(0, i) + src.slice(j); };
cut('/* ════════ Plan rendering', '/* ════════ Export');   // plan canvas and tool handlers
cut('/* ════════ Boot');
const noop = () => ({ style: {}, classList: { add() { }, remove() { }, toggle() { } }, addEventListener() { }, querySelectorAll: () => [] });
const ctx = vm.createContext({ document: { querySelector: noop, querySelectorAll: () => [], documentElement: { dataset: {} }, createElement: noop }, window: { addEventListener() { } }, console, Math, JSON, Set, Map, Float32Array, isFinite, parseInt, parseFloat });
vm.runInContext(src + '\n;this.T = { get doc() { return doc; }, set doc(v) { doc = v; }, fmtLen, parseLen, sanitize, newDoc, addWall, footprints, faceAt, roomGeom, stairInfo, floorHoles, triangulate, subtractConvex, area2, buildScene, exportDXF, exportOBJ, sampleDoc, splitWall, openFits, S, REVUP: () => { REV++; } };', ctx);
const T = ctx.T, near = (a, b, e = 1e-6) => assert(Math.abs(a - b) < e, `${a} != ${b}`);

// lengths: feet-inches in, feet-inches out
near(T.parseLen("12'6\""), 150); near(T.parseLen("12' 6"), 150); near(T.parseLen('12.5'), 150); near(T.parseLen('150"'), 150); near(T.parseLen('12-6'), 150);
near(T.parseLen("1' 6 1/2\""), 18.5); near(T.parseLen('3m'), 118.110236, 1e-5); near(T.parseLen('6', 'in'), 6); near(T.parseLen('-4'), -48);
['', 'abc', "12'x"].forEach(s => assert(isNaN(T.parseLen(s)), s));
assert.strictEqual(T.fmtLen(150), "12'-6\""); assert.strictEqual(T.fmtLen(150.5), "12'-6 1/2\""); assert.strictEqual(T.fmtLen(6), '6"'); assert.strictEqual(T.fmtLen(144, { short: true }), "12'");
for (const v of [0, 1, 17.25, 96, 250.125]) near(T.parseLen(T.fmtLen(v)), v, 1 / 16);

// a closed 20 x 14 ft box with a partition: two rooms of the clear size
const D = T.newDoc(); T.doc = D;
const box = [[0, 0], [240, 0], [240, 168], [0, 168]];
box.forEach((p, i) => T.addWall(p, box[(i + 1) % 4], 'L1'));
T.addWall([120, 0], [120, 168], 'L1', { t: 4.5 });
T.REVUP();
const f = T.faceAt('L1', [60, 80]); assert(f, 'room face found');
near(f.area, (120 - 3 - 2.25) * (168 - 6), 1e-3);   // walls are 6" thick (half each side), partition 4.5"
assert.strictEqual(T.faceAt('L1', [500, 500]), null, 'outside the walls there is no room');
// mitred corners: the outside corner of two 6" walls sits 3" beyond both centre lines
const fp = T.footprints('L1'), w0 = D.walls[0], c = fp[w0.id];
assert(c.aL.concat(c.aR).some(v => Math.abs(v + 3) < 1e-6), 'outer mitre corner');
// splitting a wall keeps the rooms and moves doors to the right half
D.opens.push({ id: 'o1', wall: w0.id, kind: 'door', style: 'single', d: 180, w: 36, h: 80, sill: 0, flip: 0, hinge: 0 });
const n = T.splitWall(w0, 120); assert(n && D.opens[0].wall === n.id && D.opens[0].d === 60);
assert.strictEqual(T.splitWall(n, 60), null, 'cannot split through a door');

// stairs: 108" rise → 15 risers of 7.2", and the level above is opened up
D.levels.push({ id: 'L2', name: 'Level 2', elev: 108, height: 96 });
D.stairs.push({ id: 's1', lv: 'L1', p: [20, 30], ang: 0, w: 36, run: 10, shape: 'straight', turn: 'left', c: '#b08d62' });
T.REVUP();
let st = T.stairInfo(D.stairs[0]); assert.strictEqual(st.n, 15); near(st.r, 7.2); assert.strictEqual(st.blocks.length, 14);
D.stairs[0].shape = 'L'; T.REVUP(); st = T.stairInfo(D.stairs[0]); assert.strictEqual(st.n, 15); assert(st.blocks.some(b => b.landing));
assert.strictEqual(T.floorHoles('L2').length, 3); assert.strictEqual(T.floorHoles('L1').length, 0);

// polygon helpers: ear clipping keeps the area, subtracting a convex hole removes exactly its area
const L = [[0, 0], [100, 0], [100, 50], [50, 50], [50, 100], [0, 100]];
const tr = T.triangulate(L); near(tr.reduce((s, t) => s + Math.abs(T.area2(t.map(i => L[i]))), 0), 7500);
let seed = 99; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
for (let k = 0; k < 300; k++) {                          // random star-shaped polygons (always simple), some with collinear extra vertices
  const m = 3 + Math.floor(rnd() * 12), P = [];
  for (let i = 0; i < m; i++) { const a = i / m * Math.PI * 2, r = 20 + rnd() * 100; P.push([Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r)]); if (rnd() < 0.2) P.push([(P[P.length - 1][0] + Math.round(Math.cos(a + 6.28 / m) * r)) / 2, (P[P.length - 1][1] + Math.round(Math.sin(a + 6.28 / m) * r)) / 2]); }
  const want = Math.abs(T.area2(P)), got = T.triangulate(P).reduce((s, t) => s + Math.abs(T.area2(t.map(i => P[i]))), 0);
  if (want > 50) assert(Math.abs(want - got) < 1e-6 * want + 1e-6, 'triangulate area ' + k + ': ' + want + ' vs ' + got);
}
const left = T.subtractConvex([[0, 0], [100, 0], [0, 100]], [[10, 10], [30, 10], [30, 30], [10, 30]]);
near(left.reduce((s, p) => s + Math.abs(T.area2(p)), 0), 5000 - 400, 1e-6);

// the sample house: builds geometry without NaN, exports are well formed
const sd = T.sampleDoc(); T.doc = sd; T.REVUP(); T.S.lv = sd.levels[0].id;
assert(sd.walls.length > 10 && sd.rooms.every(r => T.roomGeom(r)), 'every sample room is enclosed');
const M = T.buildScene(true); assert(M.t.length > 3000 && [...M.t, ...M.l, ...M.g].every(isFinite), 'finite mesh');
const obj = T.exportOBJ().split('\n'), nv = obj.filter(l => l.startsWith('v ')).length, nn = obj.filter(l => l.startsWith('vn ')).length;
for (const l of obj.filter(l => l.startsWith('f '))) for (const t of l.slice(2).split(' ')) { const [a, b] = t.split('//').map(Number); assert(a >= 1 && a <= nv && b >= 1 && b <= nn, l); }
const dxf = T.exportDXF(true); assert(/^0\nSECTION\n2\nHEADER/.test(dxf) && dxf.trimEnd().endsWith('EOF') && !/NaN|undefined/.test(dxf));
assert((dxf.match(/\nPOLYLINE\n/g) || []).length > 20 && /\nARC\n/.test(dxf) && /\nTEXT\n/.test(dxf));

// loading arbitrary JSON never throws on shape, only on non-objects
for (const bad of [{}, { levels: [] }, { levels: 'x', walls: 5 }, { walls: [null, 5, { id: 'w', a: ['x', 1], b: [1, 1] }] },
  { levels: [{ id: 'A', elev: 'abc', height: -5 }], walls: [{ id: 'w1', lv: 'zzz', a: [0, 0], b: [100, 0], t: 1e9 }], opens: [{ id: 'o1', wall: 'w1', d: 1e12, w: 1e9 }, { id: 'o2', wall: 'none' }], rooms: [{ id: 'r', pt: [NaN, 1] }] }]) {
  const d = T.sanitize(bad); T.doc = d; T.REVUP(); T.S.lv = d.levels[0].id; assert(d.levels.length >= 1); T.buildScene(true); T.exportDXF(true); T.exportOBJ();
}
assert.throws(() => T.sanitize(null));
const rt = T.sanitize(JSON.parse(JSON.stringify(sd))); assert.deepStrictEqual(JSON.parse(JSON.stringify(rt)), JSON.parse(JSON.stringify(sd)), 'save → load round trip');
console.log('house tests passed');
