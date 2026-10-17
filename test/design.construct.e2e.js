// Axis, Tangent Plane, Plane/Point through two edges (construct.js).
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/design.construct.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 700)); } };
const close = (a, b, tol, what) => assert(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (±${tol})`);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' }));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await page.waitForTimeout(1500);
  const ev = (F) => page.evaluate(F0 => { loadDoc({ features: F0, next: 200 }, 'x'); const c = evaluate(0.05); return { errors: c.errors, ext: c.ext, planes: c.planes, points: c.points, bodies: c.bodies.length }; }, F);
  await ok('axis through two points', async () => {
    const r = await ev([{ id: 10, type: 'axis', name: 'A', akind: 'pts', pts: [[0, 0, 0], [0, 0, 10]], vis: true }]);
    assert.deepStrictEqual(r.errors, {}); const a = r.ext[10].axis; close(a.dir[2], 1, 1e-9, 'dir');
  });
  await ok('axis where two planes cross', async () => {
    const r = await ev([{ id: 10, type: 'axis', name: 'A', akind: 'planes', p1: { k: 'origin', w: 'XY' }, p2: { k: 'origin', w: 'YZ' }, vis: true }]);
    assert.deepStrictEqual(r.errors, {}, JSON.stringify(r)); const a = r.ext[10].axis;
    assert(Math.abs(a.dir[0]) + Math.abs(a.dir[1]) + Math.abs(a.dir[2]) > 0.99); close(Math.hypot(...a.dir), 1, 1e-9, 'unit');
    const L = a.p; close(Math.hypot(...L), Math.hypot(...L) , 1e-9, 'p'); close(Math.abs(a.p[0] * a.dir[0] + a.p[1] * a.dir[1] + a.p[2] * a.dir[2]), Math.hypot(...a.p), 1e-9, 'point lies on the origin line');
  });
  await ok('parallel planes give a clear error; normal axis follows the plane normal', async () => {
    const r1 = await ev([{ id: 10, type: 'axis', name: 'A', akind: 'planes', p1: { k: 'origin', w: 'XY' }, p2: { k: 'origin', w: 'XY' }, vis: true }]);
    const r2 = await ev([{ id: 10, type: 'axis', name: 'A', akind: 'normal', p1: { k: 'origin', w: 'XY' }, pt: [5, 6, 7], vis: true }]);
    assert(/parallel/i.test(r1.errors[10]), JSON.stringify(r1.errors)); assert.deepStrictEqual(r2.errors, {}); close(r2.ext[10].axis.p[0], 5, 1e-9, 'p');
    close(Math.abs(r2.ext[10].axis.dir[2]), 1, 1e-9, 'normal to the XY plane');
  });
  await ok('a revolve about a feature axis uses it (axis ref resolves)', async () => {
    const r = await page.evaluate(() => {
      loadDoc({ features: [{ id: 10, type: 'axis', name: 'A', akind: 'pts', pts: [[0, 0, 0], [1, 0, 0]], vis: true }], next: 200 }, 'x'); const c = evaluate(0.05);
      return resolveAxis({ k: 'feat', feat: 10 }, c);
    });
    close(r.dir[0], 1, 1e-9, 'dir');
  });
  const box = { id: 10, type: 'primitive', name: 'B', shape: 'box', base: 'XY', cx: 0, cy: 0, off: 0, op: 'new', w: 20, d: 20, h: 10, dia: 12, dia2: 0, tube: 6, center: true, sit: true };
  const cyl = { ...box, shape: 'cyl', dia: 20 };
  await ok('tangent plane touches the cylinder at the set angle', async () => {
    const r = await page.evaluate(([C]) => {
      loadDoc({ features: [C], next: 200 }, 'x'); const b = evaluate(0.05).bodies[0], m = bodyMesh(b), p = b.polys.find(q => Surf.list[q.f].t === 'C'), ref = faceRef(m, p.f, faceInfo(m, p.f).on);
      const out = [];
      for (const ang of [0, 90]) { loadDoc({ features: [C, { id: 11, type: 'plane', cp: 'planetan', name: 'T', axis: { k: 'face', f: ref }, angle: ang, off: 0, vis: true }], next: 200 }, 'x'); const c = evaluate(0.05); out.push({ e: c.errors, pl: c.planes[11], s: Surf.list[p.f] }); }
      return out;
    }, [cyl]);
    for (const o of r) { assert.deepStrictEqual(o.e, {}); close(Math.abs(o.pl.n[0] * o.s.dir[0] + o.pl.n[1] * o.s.dir[1] + o.pl.n[2] * o.s.dir[2]), 0, 1e-9, 'normal ⟂ axis'); const d = o.pl.n[0] * (o.pl.o[0] - o.s.p[0]) + o.pl.n[1] * (o.pl.o[1] - o.s.p[1]) + o.pl.n[2] * (o.pl.o[2] - o.s.p[2]); close(d, o.s.r, 1e-6, 'tangent distance'); }
    assert(Math.abs(r[0].pl.n[0] - r[1].pl.n[0]) + Math.abs(r[0].pl.n[1] - r[1].pl.n[1]) + Math.abs(r[0].pl.n[2] - r[1].pl.n[2]) > 0.5, 'angle rolls the plane');
  });
  await ok('plane and point through two edges (sketch lines)', async () => {
    const r = await page.evaluate(() => {
      const L = (id, x1, y1, x2, y2) => ({ id, type: 'line', a: { x: x1, y: y1 }, b: { x: x2, y: y2 } });
      const sk = { id: 1, type: 'sketch', name: 'S', ref: { k: 'origin', w: 'XY' }, plane: null, ents: [L(2, 0, 0, 10, 0), L(3, 5, -5, 5, 5), L(4, 0, 8, 10, 8)], vis: true }; sk.plane = ORIGIN_PLANES.XY;
      const e = id => ({ k: 'ent', sk: 1, ent: id });
      const run = F => { loadDoc({ features: [sk, ...F], next: 200 }, 'x'); return evaluate(0.05); };
      const a = run([{ id: 11, type: 'plane', cp: 'plane2e', name: 'P', p1: e(2), p2: e(3), off: 0, vis: true }, { id: 12, type: 'point', cp: 'pt2e', name: 'Q', p1: e(2), p2: e(3), vis: true }]);
      const b = run([{ id: 11, type: 'plane', cp: 'plane2e', name: 'P', p1: e(2), p2: e(4), off: 0, vis: true }]);
      const c = run([{ id: 12, type: 'point', cp: 'pt2e', name: 'Q', p1: e(2), p2: e(4), vis: true }]);
      return { a: { errors: a.errors, n: a.planes[11].n, pt: a.points[12] }, b: { errors: b.errors, n: b.planes[11].n }, c: c.errors };
    });
    assert.deepStrictEqual(r.a.errors, {}, JSON.stringify(r)); close(Math.hypot(...r.a.n), 1, 1e-9, 'unit'); close(Math.abs(r.a.n[2]), 1, 1e-6, 'plane of the XY sketch');
    close(r.a.pt[0], 5, 1e-6, 'x'); close(Math.abs(r.a.pt[2]), 0, 1e-6, 'on the sketch');
    assert.deepStrictEqual(r.b.errors, {}); close(Math.abs(r.b.n[2]), 1, 1e-6, 'parallel lines still give the sketch plane');
    assert(/parallel/i.test(r.c[12]), JSON.stringify(r.c));
  });
  await ok('ribbon buttons exist and open the tools', async () => {
    const r = await page.evaluate(() => {
      const box = { id: 10, type: 'primitive', name: 'B', shape: 'box', base: 'XY', cx: 0, cy: 0, off: 0, op: 'new', w: 20, d: 20, h: 10, dia: 12, dia2: 0, tube: 6, center: true, sit: true };
      loadDoc({ features: [box], next: 200 }, 'x'); setWorkspace('model'); applyModel(evaluate(0.05), { tol: 0.05 });
      const out = {};
      for (const k of ['axis', 'planetan', 'plane2e', 'pt2e']) { const b = document.querySelector(`[data-act="f:${k}"]`); out[k] = !!b && !!TIP_TXT['f:' + k]; if (b) { b.click(); out[k] = out[k] && CMD && CMD.kind === k; cancelCmd(); } }
      return out;
    });
    assert.deepStrictEqual(r, { axis: true, planetan: true, plane2e: true, pt2e: true });
  });
  await ok('axis drawn in the scene is pickable by the axis picker', async () => {
    const r = await page.evaluate(() => {
      loadDoc({ features: [{ id: 10, type: 'axis', name: 'A', akind: 'pts', pts: [[0, 0, 0], [0, 0, 10]], vis: true }], next: 200 }, 'x'); setWorkspace('model'); applyModel(evaluate(0.05), { tol: 0.05 });
      const a = MODEL.ext[10].axis, s = toScreen(a.p), L = Math.max(sceneR * 1.2, 30), s1 = toScreen(add3(a.p, mul3(a.dir, L)));
      const hit = pickAxisFeat((s.x + s1.x) / 2, (s.y + s1.y) / 2);
      return { hit: hit && hit.feat, ref: axisFromHover({ kind: 'axisf', feat: 10 }) };
    });
    assert.strictEqual(r.hit, 10); assert.deepStrictEqual(r.ref, { k: 'feat', feat: 10 });
  });
  await ok('worker evaluates the new features (not just the main thread)', async () => {
    const r = await page.evaluate(async () => {
      loadDoc({ features: [{ id: 10, type: 'axis', name: 'A', akind: 'pts', pts: [[0, 0, 0], [0, 0, 10]], vis: true }], next: 200 }, 'x');
      const c = await Kernel.evalAsync(0.05); return { errors: c.errors, ext: !!(c.ext && c.ext[10]) };
    });
    assert.deepStrictEqual(r.errors, {}); assert(r.ext, 'ext reaches the page');
  });
  await ok('no page errors', async () => assert.deepStrictEqual(errs, []));
  console.log(`${pass} passed, ${fail} failed`); await browser.close(); process.exit(fail ? 1 : 0);
})();
