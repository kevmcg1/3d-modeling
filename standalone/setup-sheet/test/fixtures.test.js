/* Unit tests for the fixture library (no browser, no dependencies).  Run:  node test/fixtures.test.js */
const F = require('../fixtures.js');
let fails = 0, passes = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL ' + m); } else passes++; };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const near = (a, b, m, t = 1e-6) => ok(Math.abs(a - b) <= t, `${m}: got ${a}, want ${b}`);
const finiteParts = parts => parts.every(p => p.faces.every(f => f.pts.every(q => q.every(Number.isFinite))));
const vec = { sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] };

/* ---- parseDim ---- */
const PD = [['3.5', 3.5], ['  .5 ', 0.5], ['1/2', 0.5], ['1 3/8', 1.375], ['12mm', 12 / 25.4], ['0.5"', 0.5], ['2in', 2], ['-1', -1], ['1,5', 1.5], ['2.54cm', 1], ['1e2', 100], ['5.', 5]];
PD.forEach(([t, v]) => near(F.parseDim(t, 'in'), v, `parseDim(${JSON.stringify(t)})`));
near(F.parseDim('25.4mm', 'mm'), 25.4, 'mm in mm'); near(F.parseDim('1in', 'mm'), 25.4, 'inch converted to mm');
['', ' ', 'abc', '1/0', '1 2/0', '--1', '1..2', '1e999', 'NaN', 'Infinity', '12 mm mm', '1/', '0x10', 'x'.repeat(100), '１２'].forEach(t => ok(F.parseDim(t, 'in') === null, `parseDim(${JSON.stringify(t).slice(0, 20)}) rejected`));
ok(F.parseDim(NaN) === null && F.parseDim(Infinity) === null && F.parseDim(null) === null && F.parseDim(undefined) === null && F.parseDim({}) === null, 'parseDim rejects non-numbers');
eq(F.parseDim(7), 7, 'parseDim passes numbers');

/* ---- expressions ---- */
near(F.evalExpr('$L/2+1', { L: 3 }), 2.5, 'expr'); near(F.evalExpr('-($a-1)*2', { a: 4 }), -6, 'expr unary'); near(F.evalExpr(' 2 * 3 + 4 / 2 ', {}), 8, 'expr precedence');
['$nope', '   ', '1/0', '1+', '(1', '1)', 'alert(1)', '$constructor', '$__proto__', '1 2', '', 'a', '1e3', '9999*9999', '$a$b'].forEach(t => {
  let threw = false; try { F.evalExpr(t, { a: 1 }); } catch (e) { threw = true; } ok(threw, `expr ${JSON.stringify(t)} rejected`);
});
let t0 = false; try { F.evalExpr('1'.repeat(200), {}); } catch (e) { t0 = true; } ok(t0, 'long expression rejected');

/* ---- every built-in fixture ---- */
const stock = { x: 6, y: 4, z: 0, w: 4, d: 3, h: 1 };
F.list().forEach(def => {
  const p = F.defaultParams(def), parts = F.buildItem({ type: def.id, p, x: 0, y: 0, z: 0, rot: 0 }, { stock });
  ok(parts.length > 0, `${def.id}: builds parts`); ok(finiteParts(parts), `${def.id}: finite coordinates`);
  parts.forEach(pt => { const c = pt.faces.flatMap(f => f.pts).reduce((s, q, _, a) => [s[0] + q[0] / a.length, s[1] + q[1] / a.length, s[2] + q[2] / a.length], [0, 0, 0]);
    pt.faces.forEach(f => { if (f.fixed) return; const n = require('./norm.js')(f.pts); ok(vec.dot(n, vec.sub(f.pts.reduce((s, q) => [s[0] + q[0] / f.pts.length, s[1] + q[1] / f.pts.length, s[2] + q[2] / f.pts.length], [0, 0, 0]), c)) >= -1e-9, `${def.id}/${pt.name}: faces point outward`); }); });
  const b = F.bounds(parts), fp = F.footprint(def, p);
  ok(b && b.z0 >= -1e-9, `${def.id}: sits on the table (z0=${b && b.z0})`);
  ok(Math.max(Math.abs(b.x0), Math.abs(b.x1)) <= fp.hw + 0.01 && Math.max(Math.abs(b.y0), Math.abs(b.y1)) <= fp.hd + 0.01, `${def.id}: footprint covers the model`);
  ok(typeof def.spec(p) === 'string' && def.spec(p).length > 0 && !/NaN|undefined/.test(def.spec(p)), `${def.id}: spec text`);
  ['top', 'front', 'iso'].forEach(v => { const sc = F.projectScene(parts, v === 'iso' ? F.makeView(35, 28) : F.VIEW[v]); ok(sc.polys.length > 0 && sc.bounds, `${def.id}: ${v} view draws`); ok(!/NaN|undefined|Infinity/.test(F.polysToSvg(sc.polys, { scale: 30 })), `${def.id}: ${v} svg is clean`); });
  // every parameter, at both limits
  def.params.forEach(par => (par.type === 'select' ? par.options.map(o => o.v) : [par.min, par.max]).forEach(v => {
    const q = Object.assign({}, p, { [par.key]: v }); const pp = F.buildItem({ type: def.id, p: q, x: 1, y: 1, z: 0, rot: 90 }, { stock });
    ok(pp.length > 0 && finiteParts(pp), `${def.id}: ${par.key}=${v} builds`);
  }));
});

/* ---- parameter fuzz: whatever is typed, the value ends up valid ---- */
const JUNK = [undefined, null, NaN, Infinity, -Infinity, '', 'abc', '1e999', -5, 0, 1e9, {}, [], '12mm', true, '1/2', '99999', '\u0000', 'x'.repeat(500), '__proto__'];
F.list().forEach(def => JUNK.forEach(j => {
  const p = F.sanitizeParams(def, Object.fromEntries(def.params.map(q => [q.key, j])));
  def.params.forEach(q => ok(q.type === 'select' ? q.options.some(o => String(o.v) === p[q.key]) : Number.isFinite(p[q.key]) && p[q.key] >= q.min && p[q.key] <= q.max, `${def.id}.${q.key} sanitised from ${String(j).slice(0, 12)}`));
}));
ok(F.sanitizeParams(F.get('vise'), null).size === '6', 'sanitize handles null params');
JUNK.forEach(j => ok(F.buildItem({ type: 'vblock', p: { width: j, vee: j }, x: j, y: j, z: j, rot: j }, { stock }).every(pt => pt.faces.every(f => f.pts.every(q => q.every(Number.isFinite)))), `buildItem with junk ${String(j).slice(0, 10)} stays finite`));
eq(F.buildItem({ type: 'nope' }, {}), [], 'unknown fixture builds nothing');
['__proto__', 'constructor', 'toString', 'hasOwnProperty'].forEach(k => { ok(F.get(k) === null, `no fixture called ${k}`); eq(F.buildItem({ type: k }, {}), [], `${k} builds nothing`); });

/* ---- the toe clamp (stainless pressure plate) ---- */
const tc = F.get('toe-clamp');
[70, 80, 90].forEach(len => [8, 12].forEach(th => ['M8', 'M10'].forEach(bolt => {
  const p = F.sanitizeParams(tc, { length: String(len), thick: String(th), thread: bolt, rise: 25.4 }), parts = F.buildItem({ type: 'toe-clamp', p, x: 0, y: 0, z: 0, rot: 0 }, { stock }), strap = parts.find(q => q.name === 'Pressure plate'), b = F.bounds([strap]);
  near(b.y1 - b.y0, len / 25.4, `clamp ${len}mm long`, 1e-6); near(b.z1 - b.z0, th / 25.4, `clamp ${th}mm thick`, 1e-6); near(b.z0, 1, 'strap sits on the stock top (rise 25.4 mm)');
  ok(strap.faces.some(f => f.holes && f.holes.length), 'strap has its bolt hole'); ok(parts.some(q => q.name === bolt + ' bolt'), `has the ${bolt} bolt`);
  ok(parts.some(q => q.name === 'Step block'), 'has the heel step block');
})));
{ // rise 0 follows the stock height, even when the stock is raised
  const p = F.defaultParams(tc), z = s => F.bounds([F.buildItem({ type: 'toe-clamp', p, x: 0, y: 0, z: 0, rot: 0 }, { stock: s }).find(q => q.name === 'Pressure plate')]).z0;
  near(z({ z: 0, h: 1 }), 1, 'strap at stock top'); near(z({ z: 0.5, h: 2 }), 2.5, 'strap follows a raised stock'); near(z(undefined), 1, 'no stock: default height');
}

/* ---- placing ---- */
['front', 'back', 'left', 'right'].forEach(side => F.list().filter(d => d.side).forEach(def => {
  const p = F.defaultParams(def), pl = F.placeAtSide(def, p, stock, side), item = Object.assign({ type: def.id, p, z: 0 }, pl), r = F.worldRect(item);
  const ov = def.toe ? def.toe(p) : 0;
  const gap = { front: stock.y - stock.d / 2 - r.y1, back: r.y0 - (stock.y + stock.d / 2), left: stock.x - stock.w / 2 - r.x1, right: r.x0 - (stock.x + stock.w / 2) }[side];
  near(gap, -ov, `${def.id} at ${side}: toe overlap ${ov}`, 1e-6);
}));
const plate = { w: 12, d: 8, t: 0.75, pattern: 'plain' };
{ const items = []; for (let i = 0; i < 8; i++) { const def = F.get('block-123'), p = F.defaultParams(def), s = F.freeSpot(def, p, plate, items, stock); items.push(Object.assign({ type: 'block-123', p, z: 0, rot: 0 }, s)); }
  ok(F.checkLayout(plate, stock, items).every(w => !/Overlaps/.test(w.msg)), 'freeSpot never overlaps'); }
{ const mk = (x, y) => ({ id: 1, type: 'block-123', p: F.defaultParams(F.get('block-123')), x, y, z: 0, rot: 0 });
  eq(F.checkLayout(plate, stock, [mk(2, 1.5)]).length, 0, 'clean layout: no warnings');
  ok(F.checkLayout(plate, stock, [mk(0, 0)]).some(w => /edge/.test(w.msg)), 'off the plate is flagged');
  ok(F.checkLayout(plate, stock, [mk(3, 2), mk(3.5, 2.2)]).some(w => /Overlaps/.test(w.msg)), 'overlap is flagged');
  const hi = Object.assign(mk(3, 2), { z: 5 }); ok(!F.checkLayout(plate, stock, [mk(3, 2), hi]).some(w => /Overlaps/.test(w.msg)), 'stacked items are not overlapping'); }
eq(F.norm360(-90), 270, 'norm360 negative'); eq(F.norm360(450), 90, 'norm360 wraps'); eq(F.norm360(NaN), 0, 'norm360 NaN');

/* ---- custom fixtures ---- */
const GOOD = { id: 'riser', name: 'Riser', params: [{ key: 'L', label: 'Length', def: 3, min: 1, max: 10 }, { key: 'D', label: 'Dia', unit: 'mm', def: 25.4, min: 5, max: 100 }],
  parts: [{ shape: 'box', x: ['-$L/2', '$L/2'], y: [-1, 1], z: [0, 1] }, { shape: 'cylinder', axis: 'z', cx: 0, cy: 0, r: '$D/2', len: [1, 2] }, { shape: 'prism', axis: 'x', profile: [[0, 0], [1, 0], [0, 1]], len: [-1, 1] }] };
eq(F.validateCustom(GOOD).ok, true, 'good custom fixture validates');
const cd = F.registerCustom(GOOD); ok(F.get('riser') && F.get('riser').custom, 'custom fixture registered');
const cparts = F.buildItem({ type: 'riser', p: F.defaultParams(cd), x: 0, y: 0, z: 0, rot: 0 }, {}); ok(cparts.length === 3 && finiteParts(cparts), 'custom fixture builds');
near(F.bounds([cparts[1]]).x1, 0.5, 'mm parameter converts (25.4 mm = 1 in, radius 0.5)');
near(F.bounds([cparts[0]]).x1, 1.5, 'expression $L/2 evaluated');
ok(F.footprint(cd, F.defaultParams(cd)).hw >= 1.5, 'custom footprint from its parts');
ok(F.unregister('riser') && !F.get('riser'), 'custom fixture can be removed'); ok(!F.unregister('vise'), 'built-ins cannot be removed');
const BAD = [null, [], 'str', 5, {}, { id: 'x y', name: 'n', parts: [{}] }, { id: 'vise', name: 'n', parts: [{ shape: 'box', x: [0, 1], y: [0, 1], z: [0, 1] }] }, { id: 'a', name: '', parts: [{}] }, { id: 'a', name: 'n', parts: [] },
  { id: 'a', name: 'n', parts: [{ shape: 'sphere' }] }, { id: 'a', name: 'n', parts: [{ shape: 'box', x: [0, 0], y: [0, 1], z: [0, 1] }] }, { id: 'a', name: 'n', parts: [{ shape: 'box', x: ['$q', 1], y: [0, 1], z: [0, 1] }] },
  { id: 'a', name: 'n', parts: [{ shape: 'box', x: [0, 1e9], y: [0, 1], z: [0, 1] }] }, { id: 'a', name: 'n', parts: [{ shape: 'cylinder', r: -1, len: [0, 1] }] },
  { id: 'a', name: 'n', params: [{ key: '1bad', def: 1 }], parts: [{ shape: 'box', x: [0, 1], y: [0, 1], z: [0, 1] }] }, { id: 'a', name: 'n', params: [{ key: 'L', def: 'x' }], parts: [{ shape: 'box', x: [0, 1], y: [0, 1], z: [0, 1] }] },
  { id: 'a', name: 'n', parts: Array(61).fill({ shape: 'box', x: [0, 1], y: [0, 1], z: [0, 1] }) }, { id: 'a', name: 'n', parts: [{ shape: 'prism', profile: [[0, 0], [1, 1]], len: [0, 1] }] }];
BAD.forEach((d, i) => { ok(F.validateCustom(d).ok === false, `bad custom #${i} is rejected`); let threw = false; try { F.registerCustom(d); } catch (e) { threw = true; } ok(threw && !F.get('a') && !F.get('x y'), `bad custom #${i} cannot register`); });
let reg = false; try { F.register({ id: 'bad id!', build() {} }); } catch (e) { reg = true; } ok(reg, 'register() validates ids');

/* ---- parts list ---- */
{ const items = [{ id: 1, type: 'toe-clamp', name: 'Toe clamp', p: F.defaultParams(tc), x: 1.5, y: 2, z: 0, rot: 270 }, { id: 2, type: 'ghost', x: 0, y: 0, rot: 0 }];
  const rows = F.bom(plate, stock, items); eq(rows.length, 4, 'bom rows'); ok(/80/.test(rows[2].spec) && /270/.test(rows[2].at), 'bom row has size and position'); ok(rows[3].spec === 'unknown fixture', 'bom survives an unknown fixture');
  ok(!/NaN|undefined/.test(JSON.stringify(rows)), 'bom text is clean'); }

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
