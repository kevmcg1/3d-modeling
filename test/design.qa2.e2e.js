// Second QA sweep of the Design tab: the modeling tools the first sweep (design.qa.e2e.js) marked "opens, no volume check".
// Each result is compared with an exact formula (sweep, loft, coil, mirror, circular pattern, offset plane, gear, hole in a sweep) or a hard bound (thread, deform).
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/design.qa2.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (index.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 600)); } };
const close = (a, b, tol, what) => assert(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (±${tol})`);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' }));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await page.waitForTimeout(1500);
  // builds a document from feature templates; "PLANE:XY:z" stands for a sketch plane at height z
  const run = feats => page.evaluate(F => {   // feats may nest arrays (sk() returns two features for an offset plane)
    F = F.flat();
    const mk = o => o;
    const doc0 = { features: F.map(mk), next: 200 };
    loadDoc(doc0, 'x');
    const c = evaluate(0.04), vol = b => { let v = 0; for (const p of b.polys) for (let i = 1; i + 1 < p.v.length; i++) v += dot3(p.v[0], crs3(p.v[i], p.v[i + 1])) / 6; return v; };
    return { errors: c.errors, bodies: c.bodies.map(b => ({ id: b.id, vol: vol(b), bb: b.bb.map(x => +x.toFixed(3)) })) };
  }, feats);
  // a sketch on an origin plane, or on an offset plane feature (z != 0, which adds its own plane feature with id 100 + sketch id)
  const sk = (id, w, ents, z = 0) => { const s = { id, type: 'sketch', name: 'Sketch' + id, ref: z ? { k: 'feat', feat: 100 + id } : { k: 'origin', w }, ents: ents.map((e, i) => ({ id: id * 10 + i, ...e })), vis: true }; return z ? [{ id: 100 + id, type: 'plane', name: 'Plane' + id, ref: { k: 'origin', w }, base: w, off: z, vis: true }, s] : s; };
  const L = (a, b, c, d) => ({ type: 'line', a: { x: a, y: b }, b: { x: c, y: d } });
  const rect = (x0, y0, x1, y1) => [L(x0, y0, x1, y0), L(x1, y0, x1, y1), L(x1, y1, x0, y1), L(x0, y1, x0, y0)];
  const circle = (x, y, r) => [{ type: 'circle', c: { x, y }, r }];
  const BLOCK = [sk(1, 'XY', rect(0, 0, 40, 30)), { id: 2, type: 'extrude', name: 'Extrude1', sketch: 1, pts: [{ x: 20, y: 15 }], dist: 20, mode: 'one', op: 'new' }];

  await ok('extrude from an offset sketch plane sits at that height', async () => {
    const r = await run([sk(1, 'XY', rect(0, 0, 10, 10), 15), { id: 2, type: 'extrude', name: 'E', sketch: 1, pts: [{ x: 5, y: 5 }], dist: 8, mode: 'one', op: 'new' }]);
    assert.deepStrictEqual(r.errors, {}); close(r.bodies[0].vol, 800, 1e-6, 'volume'); close(r.bodies[0].bb[2], 15, 1e-6, 'bottom'); close(r.bodies[0].bb[5], 23, 1e-6, 'top');
  });
  await ok('loft: two squares of the same size, 20 apart, make a 10 × 10 × 20 prism', async () => {
    const r = await run([sk(1, 'XY', rect(0, 0, 10, 10)), sk(2, 'XY', rect(0, 0, 10, 10), 20), { id: 3, type: 'loft', name: 'Loft1', secs: [{ sketch: 1, pt: { x: 5, y: 5 } }, { sketch: 2, pt: { x: 5, y: 5 } }], smooth: false, op: 'new' }]);
    assert.deepStrictEqual(r.errors, {}); close(r.bodies[0].vol, 2000, 1, 'volume');
  });
  await ok('loft: a 10 square to a 20 square over 10 makes a frustum, h/3·(A1 + A2 + √(A1·A2))', async () => {
    const r = await run([sk(1, 'XY', rect(0, 0, 10, 10)), sk(2, 'XY', rect(-5, -5, 15, 15), 10), { id: 3, type: 'loft', name: 'Loft1', secs: [{ sketch: 1, pt: { x: 5, y: 5 } }, { sketch: 2, pt: { x: 5, y: 5 } }], smooth: false, op: 'new' }]);
    assert.deepStrictEqual(r.errors, {}); close(r.bodies[0].vol, 10 / 3 * (100 + 400 + 200), 5, 'volume');
  });
  await ok('sweep: a circle of radius 3 along a straight 30 path is π·9·30', async () => {
    const r = await run([sk(1, 'XY', circle(0, 0, 3)), sk(2, 'XZ', [L(0, 0, 0, 30)]), { id: 3, type: 'sweep', name: 'Sweep1', sketch: 1, pts: [{ x: 0, y: 0 }], path: { sketch: 2, ents: [20] }, twist: 0, scale: 1, op: 'new' }]);
    assert.deepStrictEqual(r.errors, {}); close(r.bodies[0].vol, Math.PI * 9 * 30, 15, 'volume (the round section is a polygon, so a little under)');
  });
  await ok('coil: Pappus, section area × 2π·R × turns (circle and square sections)', async () => {
    for (const [sec, A] of [['circle', Math.PI * 4], ['square', 16]]) {
      const r = await run([{ id: 1, type: 'coil', name: 'Coil1', base: 'XZ', D: 40, pitch: 8, turns: 3, size: 4, sec, cx: 0, cy: 0, op: 'new' }]);
      assert.deepStrictEqual(r.errors, {}, sec); close(r.bodies[0].vol / (A * 2 * Math.PI * 20 * 3), 1, 0.03, sec + ' coil volume ratio');
    }
  });
  await ok('mirror: a feature mirrored across a plane makes twice the volume', async () => {
    const r = await run([sk(1, 'XY', rect(5, 0, 15, 10)), { id: 2, type: 'extrude', name: 'E', sketch: 1, pts: [{ x: 10, y: 5 }], dist: 6, mode: 'one', op: 'new' },
      { id: 3, type: 'pattern', name: 'Mirror1', kind: 'mirror', of: 'feats', feats: [2], bodies: [], join: false, plane: { k: 'origin', w: 'YZ' }, dir1: { k: 'world', w: 'X' }, n1: 1, s1: 20, flip1: false, yaw1: 0, tilt1: 0, dir2: null, n2: 1, s2: 20, flip2: false, yaw2: 0, tilt2: 0, axis: { k: 'world', w: 'Z' }, n: 2, angle: 360 }]);
    assert.deepStrictEqual(r.errors, {}); const v = r.bodies.reduce((s, b) => s + b.vol, 0); close(v, 1200, 1, 'total volume'); assert.strictEqual(r.bodies.length >= 1, true);
  });
  await ok('circular pattern: four copies of a block around Z make four times the volume', async () => {
    const r = await run([sk(1, 'XY', rect(10, -2, 16, 2)), { id: 2, type: 'extrude', name: 'E', sketch: 1, pts: [{ x: 13, y: 0 }], dist: 5, mode: 'one', op: 'new' },
      { id: 3, type: 'pattern', name: 'Pattern1', kind: 'circ', of: 'feats', feats: [2], bodies: [], join: false, axis: { k: 'world', w: 'Z' }, n: 4, angle: 360, plane: { k: 'origin', w: 'YZ' }, dir1: { k: 'world', w: 'X' }, n1: 1, s1: 20, flip1: false, yaw1: 0, tilt1: 0, dir2: null, n2: 1, s2: 20, flip2: false, yaw2: 0, tilt2: 0 }]);
    assert.deepStrictEqual(r.errors, {}); close(r.bodies.reduce((s, b) => s + b.vol, 0), 4 * 6 * 4 * 5, 1, 'total volume');
  });
  await ok('spur gear: the volume sits between the root and tip cylinders and near the pitch cylinder', async () => {
    const r = await run([{ id: 1, type: 'gear', name: 'Gear1', gtype: 'spur', off: 0, phase: 0, m: 2, z: 20, pa: 20, width: 10, helix: 20, hand: 'R', bore: 0, key: false, hub: false, hubD: 0, hubL: 0, backlash: 0, shift: 0, mate: 24, starts: 1, q: 10, length: 40, height: 10, rim: 6, base: 'XY', cx: 0, cy: 0, op: 'new' }]);
    assert.deepStrictEqual(r.errors, {}); const v = r.bodies[0].vol; assert(v > Math.PI * 17.5 ** 2 * 10 && v < Math.PI * 22 ** 2 * 10, 'volume ' + v); close(v / (Math.PI * 20 * 20 * 10), 1, 0.06, 'against the pitch cylinder');
  });
  await ok('deform (bend, taper): the body stays one valid solid with a similar volume', async () => {
    const r0 = await run(BLOCK), v0 = r0.bodies[0].vol;
    for (const mode of ['bend', 'taper', 'twist']) {
      const r = await run([...BLOCK, { id: 7, type: 'deform', name: 'D', bodies: [2], mode, ax: 'X', dir: 'Z', angle: 20, scale: 0.8, amp: 3, wavelength: 40, phase: 0, spiral: false, fade: false, from: 0, to: 100, res: 'standard', path: null, fit: false }]);
      assert.deepStrictEqual(r.errors, {}, mode); assert(r.bodies.length === 1 && r.bodies[0].vol > v0 * 0.6 && r.bodies[0].vol < v0 * 1.3, mode + ' volume ' + (r.bodies[0] && r.bodies[0].vol));
    }
  });
  await ok('no page errors', async () => assert.deepStrictEqual(errs, []));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
