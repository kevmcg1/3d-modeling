// Design modeling tools: Primitive, Push / Pull, Draft, Align, Stretch and Delete Body (kernel results, plus the panels and ribbon).
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/design.model.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (index.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 300)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' }));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await page.waitForTimeout(1500);
  // a 20 × 10 × 5 box (sketch on the XY plane, extruded 5) plus whatever features a test adds; returns volumes and boxes of every body
  const run = feats => page.evaluate(F => {
    const L = (a, b, c, d, id) => ({ id, type: 'line', a: { x: a, y: b }, b: { x: c, y: d } });
    const doc0 = { features: [
      { id: 1, type: 'sketch', name: 'Sketch1', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: [L(0, 0, 20, 0, 2), L(20, 0, 20, 10, 3), L(20, 10, 0, 10, 4), L(0, 10, 0, 0, 5)], vis: true },
      { id: 6, type: 'extrude', name: 'Extrude1', sketch: 1, pts: [{ x: 10, y: 5 }], dist: 5, mode: 'one', op: 'new' }], next: 10 };
    const face = (body, n) => { const m = bodyMesh(body); for (const p of m.PL) { const s = Surf.list[p.f]; if (s.t === 'P' && dot3(s.n, n) > 0.99) return faceRef(m, p.f, faceInfo(m, p.f).on); } };
    const base = (loadDoc(doc0, 'x'), evaluate(0.1)), A = base.bodies[0];
    const refs = { top: face(A, [0, 0, 1]), sides: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]].map(n => face(A, n)) };
    const feats = F.map(f => JSON.parse(JSON.stringify(f).replace(/"@(\w+)(?::(\d))?"/g, (m, k, i) => JSON.stringify(i === undefined ? refs[k] : refs[k][+i]))));
    doc0.features.push(...feats); loadDoc(doc0, 'x');
    const c = evaluate(0.1), vol = b => { let v = 0; for (const p of b.polys) for (let i = 1; i + 1 < p.v.length; i++) v += dot3(p.v[0], crs3(p.v[i], p.v[i + 1])) / 6; return v; };
    return { errors: c.errors, bodies: c.bodies.map(b => ({ id: b.id, vol: vol(b), bb: b.bb })) };
  }, feats);
  const P = (shape, x) => ({ id: 20, type: 'primitive', name: 'P', shape, base: 'XZ', cx: 0, cy: 0, off: 0, op: 'new', w: 40, d: 30, h: 20, dia: 30, dia2: 0, tube: 6, center: true, sit: true, ...x });
  const close = (a, b, tol, what) => assert(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
  const body = (r, id) => r.bodies.find(b => b.id === id);

  await ok('primitives: box, cylinder, cone, sphere and torus have the right volumes', async () => {
    for (const [name, f, v] of [['box', P('box'), 24000], ['cyl', P('cyl'), Math.PI * 225 * 20], ['cone', P('cone', { dia2: 10 }), Math.PI * 20 / 3 * (225 + 75 + 25)], ['sphere', P('sphere'), 4 / 3 * Math.PI * 3375], ['torus', P('torus', { dia: 40, tube: 8 }), 2 * Math.PI * Math.PI * 20 * 16]]) {
      const r = await run([f]); assert.deepStrictEqual(r.errors, {}, name); close(body(r, 20).vol, v, v * 0.035, name);
    }
  });
  await ok('primitive: cut makes a hole in the box', async () => {
    const r = await run([P('cyl', { cx: 10, cy: 5, dia: 4, h: 20, off: -5, op: 'cut', base: 'XY' })]);
    assert.deepStrictEqual(r.errors, {}); assert.strictEqual(r.bodies.length, 1); assert(body(r, 6).vol < 1000 - 20, body(r, 6).vol);
  });
  await ok('push / pull: a face out by 3 adds a slab; in by 2 trims one; the whole body grows on every side', async () => {
    let r = await run([{ id: 20, type: 'pushpull', name: 'PP', faces: ['@top'], d: 3 }]); close(body(r, 6).vol, 1600, 1e-6, 'out'); close(body(r, 6).bb[5], 8, 1e-6, 'top');
    r = await run([{ id: 20, type: 'pushpull', name: 'PP', faces: ['@top'], d: -2 }]); close(body(r, 6).vol, 600, 1e-6, 'in');
    r = await run([{ id: 20, type: 'pushpull', name: 'PP', faces: [], whole: true, body: 6, d: 1 }]); close(body(r, 6).vol, 22 * 12 * 7, 1e-3, 'whole');
  });
  await ok('push / pull: pushing right through the part is refused', async () => {
    const r = await run([{ id: 20, type: 'pushpull', name: 'PP', faces: ['@top'], d: -9 }]); assert(r.errors[20], 'no error');
  });
  await ok('draft: tilting the four side faces keeps the base and narrows the top', async () => {
    const r = await run([{ id: 20, type: 'draft', name: 'Dr', faces: ['@sides:0', '@sides:1', '@sides:2', '@sides:3'], plane: { k: 'origin', w: 'XY' }, angle: 10 }]);
    assert.deepStrictEqual(r.errors, {}); const b = body(r, 6); close(b.bb[3], 20, 1e-6, 'base width');
    const k = Math.tan(10 * Math.PI / 180); close(b.vol, (20 * 10 + (20 - 10 * k) * (10 - 10 * k)) / 2 * 5 + 0, 60, 'volume'); assert(b.vol < 1000 - 20, 'narrower');
    const down = await run([{ id: 20, type: 'draft', name: 'Dr', faces: ['@top'], plane: { k: 'origin', w: 'XY' }, angle: 10 }]); assert(down.errors[20], 'a face parallel to the neutral plane has to be refused');
  });
  await ok('align: a box lands on the first body, centered, with a gap, and an error for the same body', async () => {
    const P2box = { id: 20, type: 'primitive', name: 'P', shape: 'box', base: 'XZ', cx: 50, cy: 0, off: 0, op: 'new', w: 10, d: 10, h: 10, center: true };
    const out = await page.evaluate(P2 => {
      const L = (a, b, c, d, id) => ({ id, type: 'line', a: { x: a, y: b }, b: { x: c, y: d } });
      const d0 = { features: [
        { id: 1, type: 'sketch', name: 'Sketch1', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: [L(0, 0, 20, 0, 2), L(20, 0, 20, 10, 3), L(20, 10, 0, 10, 4), L(0, 10, 0, 0, 5)], vis: true },
        { id: 6, type: 'extrude', name: 'Extrude1', sketch: 1, pts: [{ x: 10, y: 5 }], dist: 5, mode: 'one', op: 'new' }, P2], next: 30 };
      loadDoc(d0, 'x'); const c = evaluate(0.1), ref = (b, n) => { const m = bodyMesh(b); for (const p of m.PL) { const s = Surf.list[p.f]; if (s.t === 'P' && dot3(s.n, n) > 0.99) return faceRef(m, p.f, faceInfo(m, p.f).on); } };
      const A = c.bodies.find(b => b.id === 6), B = c.bodies.find(b => b.id === 20), res = {};
      for (const [k, o] of [['center', { center: true, gap: 0 }], ['gap', { center: false, gap: 2 }]]) {
        d0.features = d0.features.slice(0, 3); d0.features.push({ id: 21, type: 'align', name: 'Al', fa: ref(B, [0, -1, 0]), fb: ref(A, [0, 0, 1]), flush: false, spin: 0, ...o });
        loadDoc(d0, 'x'); const r = evaluate(0.1); res[k] = { errors: r.errors, bb: r.bodies.find(b => b.id === 20).bb };
      }
      d0.features = d0.features.slice(0, 3); d0.features.push({ id: 21, type: 'align', name: 'Al', fa: ref(A, [0, 0, 1]), fb: ref(A, [1, 0, 0]) }); loadDoc(d0, 'x'); res.same = evaluate(0.1).errors[21] || null;
      return res;
    }, P2box);
    assert.deepStrictEqual(out.center.bb.map(v => Math.round(v * 100) / 100), [5, 0, 5, 15, 10, 15]); assert.strictEqual(out.gap.bb[5], 17); assert(out.same, 'same-body align should be refused');
  });
  await ok('stretch: X ×2 and Z ×3 scale each direction; a cylinder stretched along its axis stays round; delete body removes it', async () => {
    let r = await run([{ id: 20, type: 'stretch', name: 'St', bodies: [6], sx: 2, sy: 1, sz: 3, pivot: 'origin' }]); close(body(r, 6).vol, 6000, 1e-6, 'box');
    r = await run([P('cyl', { dia: 10, h: 10 }), { id: 21, type: 'stretch', name: 'St', bodies: [20], sx: 1, sy: 1, sz: 2, pivot: 'center' }]); close(body(r, 20).vol, Math.PI * 25 * 20, 60, 'cylinder along its axis');
    r = await run([P('cyl', { dia: 10, h: 10 }), { id: 21, type: 'stretch', name: 'St', bodies: [20], sx: 2, sy: 1, sz: 1, pivot: 'center' }]); assert.deepStrictEqual(r.errors, {}); close(body(r, 20).vol, Math.PI * 25 * 10 * 2, 60, 'ellipse');
    r = await run([P('box'), { id: 21, type: 'delbody', name: 'D', bodies: [6] }]); assert.deepStrictEqual(r.bodies.map(b => b.id), [20]);
  });
  await ok('ribbon: the new tools are buttons, open their panels, and a face pick makes a live Push / Pull', async () => {
    await page.evaluate(() => { const d = { features: [] }; loadDoc({ features: [] }, 'x'); }); await page.waitForTimeout(300);
    for (const k of ['primitive', 'pushpull', 'draft', 'align', 'stretch', 'delbody']) assert(await page.evaluate(k => !!document.querySelector(`[data-act="f:${k}"]`), k), 'no ribbon button for ' + k);
    await page.evaluate(() => action('f:primitive')); await page.waitForTimeout(600);
    assert(await page.evaluate(() => /Shape/.test(document.getElementById('panel').textContent)), 'primitive panel');
    await page.evaluate(() => { CMD.f.shape = 'sphere'; featSync(); }); await page.waitForTimeout(900);
    await page.waitForFunction(() => MODEL.bodies && MODEL.bodies.length === 1); await page.click('[data-fdo="ok"]'); await page.waitForTimeout(300);
    await page.evaluate(() => action('f:pushpull')); await page.waitForTimeout(700);
    const [x, y] = await page.evaluate(() => { const b = MODEL.bodies[0].bb, s = toScreen([(b[0] + b[3]) / 2, b[4] - 0.001, (b[2] + b[5]) / 2 - 0]), r = ov.getBoundingClientRect(); return [s.x + r.left, s.y + r.top]; });
    await page.mouse.move(x, y); await page.waitForTimeout(250); await page.mouse.click(x, y); await page.waitForTimeout(900);
    assert.strictEqual(await page.evaluate(() => CMD.f.faces.length), 1, 'a click picks the sphere face');
  });
  await ok('no page errors', async () => assert.deepStrictEqual(errs, []));
  console.log(fail ? `\n${pass} passed, ${fail} failed` : 'all design model checks passed');
  await browser.close(); process.exit(fail ? 1 : 0);
})();
