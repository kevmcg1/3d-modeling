// Revolve: a profile drawn across the axis (the full diameter, e.g. made with Mirror) is detected and still revolves as the whole part,
// the same as drawing one side only. A profile that is NOT mirrored about the axis still gives a clear error.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/design.revolve.mirror.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (3d-modeler.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 900)); } };
const near = (a, b, tol, what) => assert(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.addInitScript(() => { window.DATUM_PREMIUM = true; window.DATUM_AUTO = true; window.DATUM_NOFX = true; });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' })); await page.route(/gate\.js/, r => r.abort());
  await page.goto('file://' + path.resolve(__dirname, '..', '3d-modeler.html') + '?dev=1'); await page.waitForTimeout(2500);
  // a profile sketched on XY and revolved about the vertical line x = 0: returns the errors, the volume and the radial extent of the result
  const turn = (ents, pt) => page.evaluate(([ents, pt]) => {
    const L = (id, a, b, c, d) => ({ id, type: 'line', a: { x: a, y: b }, b: { x: c, y: d } });
    const es = ents.map((e, i) => e.length === 4 ? L(10 + i, ...e) : { id: 10 + i, type: 'circle', c: { x: e[0], y: e[1] }, r: e[2] });
    es.push({ id: 99, type: 'line', a: { x: 0, y: -5 }, b: { x: 0, y: 40 }, cons: true });
    loadDoc({ features: [{ id: 1, type: 'sketch', name: 'S', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: es, vis: true },
      { id: 2, type: 'revolve', name: 'R', sketch: 1, pts: [{ x: pt[0], y: pt[1] }], axis: { k: 'ent', sk: 1, ent: 99 }, angle: 360, mode: 'one', op: 'new' }], next: 40 }, 'x');
    const c = evaluate(0.02), b = c.bodies[0];
    const vol = b => { let v = 0; for (const p of b.polys) for (let i = 1; i + 1 < p.v.length; i++) v += dot3(p.v[0], crs3(p.v[i], p.v[i + 1])) / 6; return v; };
    return { errors: c.errors, n: c.bodies.length, vol: b ? vol(b) : 0, bb: b ? b.bb : null };
  }, [ents, pt]);
  const rect = (x0, x1, y0, y1) => [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]];

  await ok('control: one side of a rectangle revolves to a cylinder (r 6, h 20)', async () => {
    const r = await turn(rect(0, 6, 0, 20), [3, 10]);
    assert.deepStrictEqual(r.errors, {}); near(r.vol, Math.PI * 36 * 20, 25, 'volume');
  });
  await ok('the full diameter (rectangle across the axis) revolves to the same cylinder instead of failing', async () => {
    const r = await turn(rect(-6, 6, 0, 20), [0, 10]);
    assert.deepStrictEqual(r.errors, {}, JSON.stringify(r.errors)); assert(r.n === 1, 'one body'); near(r.vol, Math.PI * 36 * 20, 25, 'volume');
    near(r.bb[3] - r.bb[0], 12, 0.1, 'diameter'); near(r.bb[4] - r.bb[1], 20, 0.1, 'height');
  });
  await ok('a whole circle centered on the axis revolves to a sphere', async () => {
    const r = await turn([[0, 10, 5]], [0, 10]);
    assert.deepStrictEqual(r.errors, {}, JSON.stringify(r.errors)); near(r.vol, 4 / 3 * Math.PI * 125, 8, 'volume'); near(r.bb[3] - r.bb[0], 10, 0.1, 'diameter');
  });
  await ok('a stepped, mirrored profile (a wide base and a narrow neck, both across the axis) keeps both steps', async () => {
    const pts = [[-8, 0], [8, 0], [8, 6], [3, 6], [3, 18], [-3, 18], [-3, 6], [-8, 6]], ents = pts.map((p, i) => { const q = pts[(i + 1) % pts.length]; return [p[0], p[1], q[0], q[1]]; });
    const r = await turn(ents, [0, 3]);
    assert.deepStrictEqual(r.errors, {}, JSON.stringify(r.errors)); near(r.vol, Math.PI * 64 * 6 + Math.PI * 9 * 12, 25, 'volume'); near(r.bb[3] - r.bb[0], 16, 0.1, 'base diameter');
  });
  await ok('a profile that is not mirrored about the axis still errors, and says why', async () => {
    const r = await turn(rect(-3, 6, 0, 20), [0, 10]);
    assert(/not mirrored/i.test(Object.values(r.errors).join(' ')), JSON.stringify(r.errors));
  });
  await ok('the page raised no errors', async () => { assert.deepStrictEqual(errs, [], errs.join('\n')); });
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
