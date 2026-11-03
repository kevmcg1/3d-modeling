// Revolve: a distance to the axis line can be a diameter (across the axis, twice the radius) instead of a radius.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/design.revolve.diameter.e2e.js
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
  // a rectangle r 6 × 20 beside a construction axis at x = 0, in the sketch editor; ids 10-13 the sides (10 = bottom), 99 the axis
  const setup = () => page.evaluate(() => {
    const L = (id, a, b, c, d) => ({ id, type: 'line', a: { x: a, y: b }, b: { x: c, y: d } });
    const ents = [L(10, 0, 0, 6, 0), L(11, 6, 0, 6, 20), L(12, 6, 20, 0, 20), L(13, 0, 20, 0, 0), { id: 99, type: 'line', a: { x: 0, y: -5 }, b: { x: 0, y: 40 }, cons: true }];
    loadDoc({ features: [{ id: 1, type: 'sketch', name: 'S', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents, vis: true },
      { id: 2, type: 'revolve', name: 'R', sketch: 1, pts: [{ x: 3, y: 10 }], axis: { k: 'ent', sk: 1, ent: 99 }, angle: 360, mode: 'one', op: 'new' }], next: 40 }, 'x');
    setWorkspace('model'); enterSketch(doc.features[0]);
  });
  const vol = () => page.evaluate(() => {
    const c = evaluate(0.02), b = c.bodies[0]; let v = 0;
    if (b) for (const p of b.polys) for (let i = 1; i + 1 < p.v.length; i++) v += dot3(p.v[0], crs3(p.v[i], p.v[i + 1])) / 6;
    return { errors: c.errors, vol: v };
  });

  await ok('dimensioning a point to the construction axis starts as a diameter; the radius is half of it', async () => {
    await setup();
    const m = await page.evaluate(() => {
      S.tool = 'dim';
      const sk = S.sk, ax = sk.ents.find(e => e.id === 99);
      const items = [{ kind: 'pt', ref: { e: 11, k: 'a' }, p: { x: 6, y: 0 } }, { kind: 'ent', e: ax }];
      const cand = dimCandidate(items, { x: 3, y: 5 });
      return { type: cand && cand.type, dm: cand && cand.dm };
    });
    assert.strictEqual(m.type, 'ptline'); assert.strictEqual(m.dm, true);
  });
  await ok('the measured value is Ø12 (2 × 6), reads with the Ø prefix, and toggles back to a radius of 6', async () => {
    await setup();
    const r = await page.evaluate(() => {
      const d = { id: 50, type: 'ptline', refs: [{ e: 11, k: 'a' }, { e: 99 }], s: 1, dm: true, rel: { x: 2, y: 0 } };
      d.s = 1; d.s = Math.sign(dimMeasure(S.sk, d)) || 1;
      S.sk.dims = [d]; d.value = dimMeasure(S.sk, d);
      const a = { v: d.value, txt: dimText(d) };
      dimToggleDia(d);
      const b = { v: d.value, txt: dimText(d), dm: d.dm };
      dimToggleDia(d);
      return { a, b, back: d.value };
    });
    near(Math.abs(r.a.v), 12, 1e-6, 'diameter'); assert(/^Ø/.test(r.a.txt), r.a.txt);
    near(Math.abs(r.b.v), 6, 1e-6, 'radius'); assert(!/Ø/.test(r.b.txt) && !r.b.dm, JSON.stringify(r.b)); near(Math.abs(r.back), 12, 1e-6, 'diameter again');
  });
  await ok('typing a diameter of 20 moves the profile to radius 10 and the revolve is a Ø20 × 20 cylinder', async () => {
    await setup();
    const r = await page.evaluate(() => {
      const d = { id: 50, type: 'ptline', refs: [{ e: 11, k: 'a' }, { e: 99 }], s: 1, dm: true, rel: { x: 2, y: 0 } };
      d.s = 1; d.s = Math.sign(dimMeasure(S.sk, d)) || 1;
      S.sk.dims = [d]; d.value = dimMeasure(S.sk, d);
      dimCommitText(d, String(toU(20)));
      return { x: S.sk.ents.find(e => e.id === 11).a.x, pend: d.pend, value: d.value };
    });
    near(r.x, 10, 1e-3, 'profile radius'); assert(r.pend === undefined, 'applied, not pending');
    const v = await vol(); assert.deepStrictEqual(v.errors, {}); near(v.vol, Math.PI * 100 * 20, 40, 'volume');
  });
  await ok('the Ø button shows in the dimension box and in the sketch panel', async () => {
    await setup();
    const r = await page.evaluate(() => {
      const d = { id: 50, type: 'ptline', refs: [{ e: 11, k: 'a' }, { e: 99 }], s: 1, dm: true, rel: { x: 2, y: 0 } };
      d.s = 1; d.s = Math.sign(dimMeasure(S.sk, d)) || 1;
      S.sk.dims = [d]; d.value = dimMeasure(S.sk, d); refreshPanel(); requestDraw();
      dimOpenEditor(d);
      const box = !!document.querySelector('#dimEdit [data-de="dia"].on'), row = !!document.querySelector('[data-dimdia="50"]');
      document.querySelector('#dimEdit [data-de="dia"]').click();
      return { box, row, dm: d.dm, again: !!document.querySelector('#dimEdit [data-de="dia"]:not(.on)') };
    });
    assert(r.box && r.row && r.dm === false && r.again, JSON.stringify(r));
  });
  assert.deepStrictEqual(errs, [], errs.join('\n'));
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
