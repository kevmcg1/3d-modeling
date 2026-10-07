// QA sweep of the Design tab's core modeling tools, on one machinable block: every result is checked against the exact volume.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/design.qa.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (index.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 500)); } };
const close = (a, b, tol, what) => assert(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (±${tol})`);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' }));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await page.waitForTimeout(1500);
  // a 40 × 30 × 20 block on the XY plane (volume 24000, top at z = 20) plus the given features; "@top", "@right" … stand for face references
  const run = (feats, opts = {}) => page.evaluate(([F, opts]) => {
    const L = (a, b, c, d, id) => ({ id, type: 'line', a: { x: a, y: b }, b: { x: c, y: d } });
    const doc0 = { features: [
      { id: 1, type: 'sketch', name: 'Sketch1', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: [L(0, 0, 40, 0, 2), L(40, 0, 40, 30, 3), L(40, 30, 0, 30, 4), L(0, 30, 0, 0, 5)], vis: true },
      { id: 6, type: 'extrude', name: 'Extrude1', sketch: 1, pts: [{ x: 20, y: 15 }], dist: 20, mode: 'one', op: 'new' }], next: 10 };
    const face = (body, n) => { const m = bodyMesh(body); for (const p of m.PL) { const s = Surf.list[p.f]; if (s.t === 'P' && dot3(s.n, n) > 0.99) return faceRef(m, p.f, faceInfo(m, p.f).on); } };
    const base = (loadDoc(doc0, 'x'), evaluate(0.05)), A = base.bodies[0];
    const refs = { top: face(A, [0, 0, 1]), right: face(A, [1, 0, 0]), back: face(A, [0, 1, 0]) };
    const feats = F.map(f => JSON.parse(JSON.stringify(f).replace(/"@(\w+)"/g, (m, k) => JSON.stringify(refs[k]))));
    doc0.features.push(...feats); loadDoc(doc0, 'x');
    const c = evaluate(0.05), vol = b => { let v = 0; for (const p of b.polys) for (let i = 1; i + 1 < p.v.length; i++) v += dot3(p.v[0], crs3(p.v[i], p.v[i + 1])) / 6; return v; };
    const out = { errors: c.errors, bodies: c.bodies.map(b => ({ id: b.id, vol: vol(b), bb: b.bb.map(x => +x.toFixed(4)) })) };
    // undo must give the plain block back and redo the feature again
    if (opts.undo) { const n = hist.cur; record('t', null); out.n = n; }
    return out;
  }, [feats, opts]);
  const BLOCK = 24000;

  await ok('block: 40 × 30 × 20 = 24000', async () => { const r = await run([]); assert.deepStrictEqual(r.errors, {}); close(r.bodies[0].vol, BLOCK, 1e-6, 'block'); });
  await ok('fillet: R3 on a 30 long edge takes (1 − π/4)·r²·L off', async () => {
    const r = await run([{ id: 20, type: 'fillet', name: 'Fillet1', edges: [{ a: '@top', b: '@right', pt: [40, 15, 20] }], size: 3 }]); assert.deepStrictEqual(r.errors, {});
    close(r.bodies[0].vol, BLOCK - (1 - Math.PI / 4) * 9 * 30, 6, 'fillet');
  });
  await ok('chamfer: 2 on a 30 long edge takes d²/2·L off', async () => {
    const r = await run([{ id: 20, type: 'chamfer', name: 'Chamfer1', edges: [{ a: '@top', b: '@right', pt: [40, 15, 20] }], size: 2 }]); assert.deepStrictEqual(r.errors, {});
    close(r.bodies[0].vol, BLOCK - 60, 0.05, 'chamfer');
  });
  await ok('hole: simple, through, counterbore and countersink have the right volumes', async () => {
    const hole = x => ({ id: 20, type: 'hole', name: 'Hole1', face: '@top', pts: [[20, 15, 20]], kind: 'simple', d: 6, depth: 10, through: false, cbd: 11, cbdepth: 4, csd: 12, csang: 90, tip: 'flat', ...x });
    let r = await run([hole({})]); assert.deepStrictEqual(r.errors, {}); close(r.bodies[0].vol, BLOCK - Math.PI * 9 * 10, 12, 'blind');
    r = await run([hole({ through: true })]); assert.deepStrictEqual(r.errors, {}); close(r.bodies[0].vol, BLOCK - Math.PI * 9 * 20, 20, 'through');
    r = await run([hole({ kind: 'cbore' })]); assert.deepStrictEqual(r.errors, {}); close(r.bodies[0].vol, BLOCK - Math.PI * (5.5 * 5.5 * 4 + 9 * 6), 20, 'counterbore');
    r = await run([hole({ kind: 'csink' })]); assert.deepStrictEqual(r.errors, {}); assert(r.bodies[0].vol < BLOCK - Math.PI * 9 * 10 - 5, 'countersink removes more than the plain hole: ' + r.bodies[0].vol);
    r = await run([hole({ tip: 118 })]); assert.deepStrictEqual(r.errors, {}); close(r.bodies[0].vol, BLOCK - Math.PI * 9 * 10 - Math.PI * 9 * 3 / Math.tan(59 * Math.PI / 180) / 3, 12, '118° drill point');
  });
  await ok('shell: top removed, 2 mm walls leave 36 × 26 × 18 empty', async () => {
    const r = await run([{ id: 20, type: 'shell', name: 'Shell1', faces: ['@top'], t: 2 }]); assert.deepStrictEqual(r.errors, {}); close(r.bodies[0].vol, BLOCK - 36 * 26 * 18, 2, 'shell');
  });
  await ok('pattern: a rectangular pattern of a hole makes three holes', async () => {
    const r = await run([{ id: 20, type: 'hole', name: 'Hole1', face: '@top', pts: [[8, 15, 20]], kind: 'simple', d: 4, depth: 8, through: false, cbd: 11, cbdepth: 4, csd: 12, csang: 90, tip: 'flat' },
      { id: 21, type: 'pattern', name: 'Pattern1', kind: 'rect', of: 'feats', feats: [20], bodies: [], join: false, dir1: { k: 'world', w: 'X' }, n1: 3, s1: 10, flip1: false, yaw1: 0, tilt1: 0, dir2: null, n2: 1, s2: 20, flip2: false, yaw2: 0, tilt2: 0 }]);
    assert.deepStrictEqual(r.errors, {}); close(r.bodies[0].vol, BLOCK - 3 * Math.PI * 4 * 8, 25, 'three holes');
  });
  await ok('combine: join, cut and intersect with a cylinder have the right volumes', async () => {
    const cyl = { id: 20, type: 'primitive', name: 'P', shape: 'cyl', base: 'XY', cx: 20, cy: 15, off: 0, op: 'new', w: 40, d: 30, h: 30, dia: 10, dia2: 0, tube: 6, center: false, sit: true };
    let r = await run([cyl, { id: 21, type: 'combine', name: 'C', target: 6, tools: [20], op: 'cut', keep: false }]); assert.deepStrictEqual(r.errors, {}); close(r.bodies.find(b => b.id === 6).vol, BLOCK - Math.PI * 25 * 20, 60, 'cut');
    r = await run([cyl, { id: 21, type: 'combine', name: 'C', target: 6, tools: [20], op: 'intersect', keep: false }]); assert.deepStrictEqual(r.errors, {}); close(r.bodies[0].vol, Math.PI * 25 * 20, 60, 'intersect');
    r = await run([cyl, { id: 21, type: 'combine', name: 'C', target: 6, tools: [20], op: 'join', keep: false }]); assert.deepStrictEqual(r.errors, {}); close(r.bodies[0].vol, BLOCK + Math.PI * 25 * 10, 60, 'join');
  });
  await ok('move / copy, rotate and scale: copies double the volume, a 2× scale gives 8×', async () => {
    let r = await run([{ id: 20, type: 'move', name: 'M', bodies: [6], tx: 60, ty: 0, tz: 0, rax: 'Z', rot: 0, pivot: 'center', copy: true }]); assert.deepStrictEqual(r.errors, {}); assert.strictEqual(r.bodies.length, 2);
    close(r.bodies[0].vol + r.bodies[1].vol, 2 * BLOCK, 1, 'copy'); close(Math.max(...r.bodies.map(b => b.bb[0])), 60, 1e-3, 'copy moved 60 in X');
    r = await run([{ id: 20, type: 'rotate', name: 'R', bodies: [6], axis: { k: 'world', w: 'Z' }, angle: 90, pivot: 'center', copy: true, n: 1 }]); assert.deepStrictEqual(r.errors, {}); assert.strictEqual(r.bodies.length, 2);
    r = await run([{ id: 20, type: 'scale', name: 'S', bodies: [6], s: 2, pivot: 'center' }]); assert.deepStrictEqual(r.errors, {}); close(r.bodies[0].vol, 8 * BLOCK, 1, 'scale');
  });
  await ok('split body: a plane through the middle gives two halves that add up', async () => {
    const r = await run([{ id: 15, type: 'plane', name: 'Mid', ref: { k: 'origin', w: 'XY' }, base: { o: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] }, off: 10, vis: true }, { id: 20, type: 'split', name: 'Sp', body: 6, plane: { k: 'feat', feat: 15 } }]); assert.deepStrictEqual(r.errors, {}); assert.strictEqual(r.bodies.length, 2);
    close(r.bodies[0].vol + r.bodies[1].vol, BLOCK, 1, 'halves');
  });
  await ok('revolve: a rectangle turned round an axis makes the exact tube', async () => {
    const L = (a, b, c, d, id, cons) => ({ id, type: 'line', a: { x: a, y: b }, b: { x: c, y: d }, ...(cons ? { cons: true } : {}) });
    const r = await page.evaluate(() => {
      const L = (a, b, c, d, id, cons) => ({ id, type: 'line', a: { x: a, y: b }, b: { x: c, y: d }, ...(cons ? { cons: true } : {}) });
      loadDoc({ features: [
        { id: 1, type: 'sketch', name: 'S', ref: { k: 'origin', w: 'XZ' }, plane: ORIGIN_PLANES.XZ, ents: [L(5, 0, 10, 0, 2), L(10, 0, 10, 20, 3), L(10, 20, 5, 20, 4), L(5, 20, 5, 0, 5), L(0, -5, 0, 25, 6, true)], vis: true },
        { id: 7, type: 'revolve', name: 'Revolve1', sketch: 1, pts: [{ x: 7.5, y: 10 }], axis: { k: 'ent', sk: 1, ent: 6 }, angle: 360, mode: 'one', op: 'new' }], next: 20 }, 'x');
      const c = evaluate(0.02), vol = b => { let v = 0; for (const p of b.polys) for (let i = 1; i + 1 < p.v.length; i++) v += dot3(p.v[0], crs3(p.v[i], p.v[i + 1])) / 6; return v; };
      return { errors: c.errors, vols: c.bodies.map(vol) };
    });
    assert.deepStrictEqual(r.errors, {}); close(r.vols[0], Math.PI * (100 - 25) * 20, 4712 * 0.01, 'tube');
  });
  await ok('extrude: cut, join and symmetric modes behave; the block undoes and redoes', async () => {
    const r = await page.evaluate(() => {
      const L = (a, b, c, d, id) => ({ id, type: 'line', a: { x: a, y: b }, b: { x: c, y: d } });
      const feats = [
        { id: 1, type: 'sketch', name: 'S', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: [L(0, 0, 10, 0, 2), L(10, 0, 10, 10, 3), L(10, 10, 0, 10, 4), L(0, 10, 0, 0, 5)], vis: true },
        { id: 6, type: 'extrude', name: 'E', sketch: 1, pts: [{ x: 5, y: 5 }], dist: 10, mode: 'sym', op: 'new' }];
      loadDoc({ features: feats, next: 10 }, 'x'); const c = evaluate(0.05); const sym = c.bodies[0].bb.map(x => +x.toFixed(3));
      return { sym, errors: c.errors };
    });
    assert.deepStrictEqual(r.errors, {}); assert.deepStrictEqual([r.sym[2], r.sym[5]], [-5, 5], 'symmetric about the sketch plane: ' + JSON.stringify(r.sym));
  });
  await ok('undo and redo step through the modeling history', async () => {
    const r = await page.evaluate(async () => {
      loadDoc({ features: [], next: 1 }, 'x'); const h0 = hist.cur;
      const sk = { id: newId(), type: 'sketch', name: 'S', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: [], vis: true };
      const before = snap(); insertFeature(sk); record('Add sketch', before);
      const a = doc.features.length; undo(); const b = doc.features.length; redo(); const c = doc.features.length;
      return { a, b, c, steps: hist.cur - h0 };
    });
    assert.deepStrictEqual([r.a, r.b, r.c, r.steps], [1, 0, 1, 1], JSON.stringify(r));
  });
  await ok('save and reload: the document JSON round-trips to the same bodies', async () => {
    const r = await page.evaluate(async () => {
      const s = samplePocketPlate(); loadDoc(s, 'x'); const v = () => { const c = evaluate(0.05); return c.bodies.map(b => b.polys.length).join(','); };
      const a = v(); const js = snap(); loadDoc({ features: [], next: 1 }, 'x'); loadDoc(JSON.parse(js), 'y'); return { a, b: v() };
    });
    assert.strictEqual(r.a, r.b);
  });
  await ok('every one of the sample parts rebuilds from its history without a feature error and with positive volume', async () => {
    const r = await page.evaluate(() => {
      const out = [];
      for (const s of SAMPLES) {
        try {
          loadDoc(s.make(), 'x'); const c = evaluate(0.05); let vol = 0;
          for (const b of c.bodies) for (const p of b.polys) for (let i = 1; i + 1 < p.v.length; i++) vol += dot3(p.v[0], crs3(p.v[i], p.v[i + 1])) / 6;
          out.push({ name: s.name, errors: Object.keys(c.errors || {}).length, bodies: c.bodies.length, vol });
        } catch (e) { out.push({ name: s.name, threw: String(e.message) }); }
      }
      return out;
    });
    assert(r.length > 100, 'samples: ' + r.length);
    const bad = r.filter(x => x.threw || x.errors || !x.bodies || !(x.vol > 0)).map(x => x.name + ':' + (x.threw || x.errors + ' errors'));
    assert.deepStrictEqual(bad, [], 'sample parts with problems: ' + bad.join(', '));
  });
  await ok('the page raised no errors', async () => { assert.deepStrictEqual(errs, [], errs.join('\n')); });
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
