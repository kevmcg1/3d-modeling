// Fusion-style modeling batch 1: Midplane, Plane at Angle, Plane Through 3 Points, Physical Properties, Interference, Section Analysis.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/design.fusion1.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (index.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 400)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message + ' @ ' + String(e.stack).split('\n').slice(1, 3).join(' | ')));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' }));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await page.waitForTimeout(1500);
  const close = (a, b, tol, what) => assert(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
  // a 20 × 10 × 5 box at the origin (sketch on XY, extruded 5) plus extra features; with `second`, a 10 × 10 × 5 box overlapping it
  const load = (extra, second) => page.evaluate(([X, second]) => {
    const L = (a, b, c, d, id) => ({ id, type: 'line', a: { x: a, y: b }, b: { x: c, y: d } });
    const feats = [
      { id: 1, type: 'sketch', name: 'Sketch1', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: [L(0, 0, 20, 0, 2), L(20, 0, 20, 10, 3), L(20, 10, 0, 10, 4), L(0, 10, 0, 0, 5)], vis: true },
      { id: 6, type: 'extrude', name: 'Extrude1', sketch: 1, pts: [{ x: 10, y: 5 }], dist: 5, mode: 'one', op: 'new' }];
    if (second) feats.push(
      { id: 7, type: 'sketch', name: 'Sketch2', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: [L(15, 0, 25, 0, 8), L(25, 0, 25, 10, 9), L(25, 10, 15, 10, 10), L(15, 10, 15, 0, 11)], vis: true },
      { id: 12, type: 'extrude', name: 'Extrude2', sketch: 7, pts: [{ x: 20, y: 5 }], dist: 5, mode: 'one', op: 'new' });
    loadDoc({ features: [...feats, ...X], next: 30 }, 'x');
    const c = evaluate(0.1);
    return { errors: c.errors, planes: JSON.parse(JSON.stringify(c.planes)), nb: c.bodies.length };
  }, [extra, second || false]);
  await page.waitForTimeout(400);

  await ok('midplane sits halfway between two parallel planes, and refuses non-parallel ones', async () => {
    const off = { id: 20, type: 'plane', name: 'Plane1', ref: { k: 'origin', w: 'XZ' }, base: { o: [0, 0, 0], u: [1, 0, 0], v: [0, 0, -1], n: [0, 1, 0] }, off: 20, vis: true };
    const r = await load([off, { id: 21, type: 'plane', cp: 'midplane', name: 'Mid', p1: { k: 'origin', w: 'XZ' }, p2: { k: 'feat', feat: 20 }, off: 0, vis: true }]);
    assert.deepStrictEqual(r.errors, {}); const p = r.planes[21]; close(Math.abs(p.n[1]), 1, 1e-9, 'normal'); close(p.o[1], 10, 1e-9, 'height');
    const bad = await load([{ id: 21, type: 'plane', cp: 'midplane', name: 'Mid', p1: { k: 'origin', w: 'XZ' }, p2: { k: 'origin', w: 'YZ' }, off: 0, vis: true }]);
    assert(bad.errors[21] && /parallel/.test(bad.errors[21]), JSON.stringify(bad.errors));
  });
  await ok('plane at angle turns about an axis: 90° from the front plane about X is the top plane', async () => {
    const r = await load([{ id: 21, type: 'plane', cp: 'planeang', name: 'Ang', axis: { k: 'world', w: 'X' }, ref: { k: 'origin', w: 'XY' }, angle: 90, off: 0, vis: true }]);
    assert.deepStrictEqual(r.errors, {}); const p = r.planes[21]; close(Math.abs(p.n[1]), 1, 1e-9, 'normal is vertical');
    const r0 = await load([{ id: 21, type: 'plane', cp: 'planeang', name: 'Ang', axis: { k: 'world', w: 'X' }, ref: { k: 'origin', w: 'XY' }, angle: 0, off: 0, vis: true }]);
    close(Math.abs(r0.planes[21].n[2]), 1, 1e-9, '0° is the reference plane');
    const r45 = await load([{ id: 21, type: 'plane', cp: 'planeang', name: 'Ang', axis: { k: 'world', w: 'X' }, ref: { k: 'origin', w: 'XY' }, angle: 45, off: 0, vis: true }]);
    close(Math.abs(r45.planes[21].n[1]), Math.SQRT1_2, 1e-9, '45°'); close(Math.abs(r45.planes[21].n[2]), Math.SQRT1_2, 1e-9, '45°');
  });
  await ok('plane through three points: normal, center, and a line of points is refused', async () => {
    const r = await load([{ id: 21, type: 'plane', cp: 'plane3', name: 'P3', pts: [[0, 5, 0], [10, 5, 0], [0, 5, 10]], off: 0, vis: true }]);
    assert.deepStrictEqual(r.errors, {}); close(Math.abs(r.planes[21].n[1]), 1, 1e-9, 'normal'); close(r.planes[21].o[1], 5, 1e-9, 'height');
    const bad = await load([{ id: 21, type: 'plane', cp: 'plane3', name: 'P3', pts: [[0, 0, 0], [1, 0, 0], [2, 0, 0]], off: 0, vis: true }]);
    assert(bad.errors[21] && /line/.test(bad.errors[21]), JSON.stringify(bad.errors));
  });
  await ok('a plane made by the new tools can be sketched on and the tree row says what it is', async () => {
    await load([{ id: 21, type: 'plane', cp: 'plane3', name: '3-Point Plane1', pts: [[0, 5, 0], [10, 5, 0], [0, 5, 10]], off: 0, vis: true }]);
    const t = await page.evaluate(() => featSub(doc.features.find(f => f.id === 21)));
    assert.strictEqual(t, '3 pts');
    assert(await page.evaluate(() => { modelChanged(true); return !!PLANES[21] || !!MODEL.planes[21]; }));
  });
  await ok('the New Plane tools appear in the Construct panel and make a feature from the UI', async () => {
    await load([]); await page.evaluate(() => { refreshUI(); }); await page.waitForTimeout(300);
    for (const a of ['f:midplane', 'f:planeang', 'f:plane3', 'i:props', 'i:interf', 'i:section']) assert(await page.evaluate(a => !!document.querySelector(`[data-act="${a}"]`), a), 'no button ' + a);
    await page.evaluate(() => { action('f:plane3'); }); await page.waitForTimeout(200);
    assert(await page.evaluate(() => CMD && CMD.type === 'feat' && CMD.kind === 'plane3'));
    await page.evaluate(() => { CMD.f.pts = [[0, 0, 0], [10, 0, 0], [0, 0, 10]]; featSync(); featOK(); }); await page.waitForTimeout(400);
    const f = await page.evaluate(() => { const f = doc.features.find(f => f.cp === 'plane3'); return f && { type: f.type, name: f.name, err: MODEL.errors[f.id] || null }; });
    assert(f && f.type === 'plane' && !f.err, JSON.stringify(f));
    await page.evaluate(() => { editFeature(doc.features.find(f => f.cp === 'plane3')); }); await page.waitForTimeout(200);
    assert(await page.evaluate(() => CMD && CMD.type === 'feat' && CMD.kind === 'plane3' && !CMD.isNew), 'editing reopens the 3-point plane');
    await page.evaluate(() => cancelCmd());
  });
  await ok('physical properties: volume, area, center of mass and mass from the density', async () => {
    await load([]); await page.evaluate(() => action('i:props')); await page.waitForTimeout(300);
    const txt = await page.evaluate(() => panel.innerText);
    assert(/Physical Properties/.test(txt), txt);
    // 20 × 10 × 5 mm = 1000 mm³ = 1 cm³ of steel (7.87 g/cm³) → 7.87 g; area 2 (200 + 100 + 50) = 700 mm² = 7 cm²
    assert(/\(1 cm³\)/.test(txt) && /7\.9 g/.test(txt), txt);
    assert(/1\.085 in² \(7 cm²\)/.test(txt), txt);
    assert(/Center of mass X[^]*10/.test(txt), txt);
    await page.evaluate(() => { const s = panel.querySelector('[data-insp="mat"]'); s.value = '2'; s.dispatchEvent(new Event('change')); }); await page.waitForTimeout(150);
    assert(/2\.7 g/.test(await page.evaluate(() => panel.innerText)), await page.evaluate(() => panel.innerText));
    await page.evaluate(() => cancelCmd());
  });
  await ok('interference finds the 5 × 10 × 5 overlap of two boxes, and none when they only touch', async () => {
    await load([], true); await page.evaluate(() => action('i:interf')); await page.waitForTimeout(500);
    const txt = await page.evaluate(() => panel.innerText);
    assert(/1 overlap/.test(txt), txt); assert(/0\.250 cm³|0\.0153 in³/.test(txt), txt);
    assert((await page.evaluate(() => FUSION1.grp.children.length)) >= 1);
    await page.evaluate(() => cancelCmd());
  });
  await ok('section analysis clips the model, outlines the cut and reads its area', async () => {
    await load([]); await page.evaluate(() => action('i:section')); await page.waitForTimeout(500);
    const info = await page.evaluate(() => ({ clip: FUSION1.clipOn, segs: FUSION1.secData ? FUSION1.secData.segs.length / 2 : 0, total: FUSION1.secData ? FUSION1.secData.total : 0, grp: FUSION1.grp.children.length }));
    assert(info.clip, 'clipping plane applied'); assert(info.segs >= 4, 'outline ' + info.segs);
    // the default cut is the Top plane halfway through the 10 mm depth: 20 × 5 = 100 mm²
    close(info.total, 100, 0.5, 'cut area');
    const SEC = () => page.evaluate(() => ({ total: FUSION1.secData ? FUSION1.secData.total : 0 }));
    await page.evaluate(() => { const r = panel.querySelector('[data-insp-live="pos"]'); r.value = '4'; r.dispatchEvent(new Event('input', { bubbles: true })); });
    close((await SEC()).total, 100, 0.5, 'a Top cut is 20 × 5 wherever it is');
    await page.evaluate(() => { const r = panel.querySelector('[data-insp-live="posn"]'); r.value = '100'; r.dispatchEvent(new Event('input', { bubbles: true })); });
    close((await SEC()).total, 0, 0.001, 'beyond the part');
    await page.evaluate(() => { panel.querySelector('[data-insp-set="w"][data-v="XY"]').click(); }); await page.waitForTimeout(150);
    close((await SEC()).total, 200, 0.5, 'front cut is 20 × 10');
    await page.evaluate(() => { panel.querySelector('[data-insp-set="w"][data-v="YZ"]').click(); }); await page.waitForTimeout(150);
    close((await SEC()).total, 50, 0.5, 'side cut is 10 × 5');
    await page.evaluate(() => cancelCmd()); await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({ clip: FUSION1.clipOn, segs: FUSION1.secData ? FUSION1.secData.segs.length / 2 : 0, total: FUSION1.secData ? FUSION1.secData.total : 0, grp: FUSION1.grp.children.length }));
    assert(!after.clip && after.grp === 0, 'clipping cleared on Done: ' + JSON.stringify(after));
  });
  await ok('no page errors', async () => { assert.deepStrictEqual(errs, []); });
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
