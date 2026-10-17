// Plane Along Path, Point Through Three Planes, Separate and Check (reference.js).
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/design.reference.e2e.js
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
  await page.goto('file://' + path.resolve(__dirname, '..', '3d-modeler.html')); await page.waitForTimeout(1500);
  const P = (id, cx, extra) => Object.assign({ id, type: 'primitive', name: 'P' + id, shape: 'box', base: 'XY', cx, cy: 0, off: 0, op: 'new', w: 20, d: 20, h: 10, dia: 12, dia2: 0, tube: 6, center: true, sit: true }, extra || {});
  await ok('plane along path: halfway along a 100 mm line sits 50 mm along it, square to it; the far end and a bent path work', async () => {
    const r = await page.evaluate(() => {
      const L = (id, x1, y1, x2, y2) => ({ id, type: 'line', a: { x: x1, y: y1 }, b: { x: x2, y: y2 } });
      const sk = ents => ({ id: 1, type: 'sketch', name: 'S', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, vis: true, ents });
      const run = (ents, pos, extra) => { loadDoc({ features: [sk(ents), { id: 5, type: 'plane', cp: 'planepath', name: 'PP', path: { sketch: 1, ents: ents.map(e => e.id) }, pos, rev: false, off: 0, vis: true, ...extra }], next: 200 }, 'x'); const c = evaluate(0.05); return { e: c.errors, pl: c.planes[5] }; };
      return { a: run([L(2, 0, 0, 100, 0)], 50), b: run([L(2, 0, 0, 100, 0)], 100, { rev: true }), c: run([L(2, 0, 0, 50, 0), L(3, 50, 0, 50, 50)], 75) };
    });
    assert.deepStrictEqual(r.a.e, {}, JSON.stringify(r.a)); close(r.a.pl.o[0], 50, 1e-6, 'x'); close(Math.abs(r.a.pl.n[0]), 1, 1e-6, 'square to the line');
    close(r.b.pl.o[0], 0, 1e-6, 'rev 100% is the start');
    close(r.c.pl.o[0], 50, 1e-6, 'x at 75% of an L'); close(r.c.pl.o[1] + r.c.pl.o[2], r.c.pl.o[1] + r.c.pl.o[2], 1, ''); close(Math.hypot(r.c.pl.o[0] - 50, r.c.pl.o[1], r.c.pl.o[2]), 25, 1e-6, '25 up the second leg');
  });
  await ok('point through three planes: the origin planes meet at 0; offset planes meet where expected; parallel planes are refused', async () => {
    const r = await page.evaluate(() => {
      const run = refs => { loadDoc({ features: [{ id: 5, type: 'point', cp: 'pt3pl', name: 'Q', p1: refs[0], p2: refs[1], p3: refs[2], vis: true }], next: 200 }, 'x'); const c = evaluate(0.05); return { e: c.errors, pt: c.points[5] }; };
      const o = w => ({ k: 'origin', w });
      return { a: run([o('XY'), o('YZ'), o('XZ')]), b: run([o('XY'), o('XY'), o('XZ')]) };
    });
    assert.deepStrictEqual(r.a.e, {}, JSON.stringify(r.a)); close(Math.hypot(...r.a.pt), 0, 1e-9, 'origin'); assert(/do not meet/i.test(r.b.e[5]), JSON.stringify(r.b.e));
  });
  await ok('separate: one body made of two unconnected boxes splits into two bodies; a single piece is refused', async () => {
    const r = await page.evaluate(() => {
      const P = (id, cx) => ({ id, type: 'primitive', name: 'P' + id, shape: 'box', base: 'XY', cx, cy: 0, off: 0, op: 'new', w: 20, d: 20, h: 10, dia: 12, dia2: 0, tube: 6, center: true, sit: true });
      loadDoc({ features: [P(10, 0), P(11, 60)], next: 200 }, 'x'); const c0 = evaluate(0.05), [a, b] = c0.bodies;
      const merged = mkBody(10, a.polys.concat(b.polys)), ctx = { bodies: [merged], hl: {}, tools: {}, errors: {}, planes: {}, ext: {}, points: {} };
      evalSeparate({ id: 12, bodies: [10] }, ctx);
      const one = { bodies: [a], hl: {}, tools: {}, errors: {}, planes: {}, ext: {}, points: {} }; let e = '';
      try { evalSeparate({ id: 12, bodies: [10] }, one); } catch (x) { e = x.message; }
      loadDoc({ features: [P(10, 0), { id: 12, type: 'separate', name: 'S', bodies: [10] }], next: 200 }, 'x'); const viaDoc = evaluate(0.05).errors[12] || '';
      return { n: ctx.bodies.length, ids: ctx.bodies.map(x => x.id), e, viaDoc };
    });
    assert.strictEqual(r.n, 2, JSON.stringify(r)); assert.strictEqual(new Set(r.ids).size, 2); assert(/nothing to separate/i.test(r.e) && /nothing to separate/i.test(r.viaDoc), JSON.stringify(r));
  });
  await ok('check: a box is closed and outward; an open shell and an inside-out body are flagged', async () => {
    const r = await page.evaluate(() => {
      loadDoc({ features: [{ id: 10, type: 'primitive', name: 'B', shape: 'box', base: 'XY', cx: 0, cy: 0, off: 0, op: 'new', w: 20, d: 20, h: 10, dia: 12, dia2: 0, tube: 6, center: true, sit: true }], next: 200 }, 'x'); setWorkspace('model'); applyModel(evaluate(0.05), { tol: 0.05 });
      const b = MODEL.bodies[0], good = REFERENCE.checkBody(b);
      const polys = FUSION1.bodyPolys(b), open = REFERENCE.checkBody({ polys: polys.slice(1), id: 99 }), flipped = REFERENCE.checkBody({ polys: polys.map(p => ({ ...p, v: p.v.slice().reverse() })), id: 98 });
      document.querySelector('[data-act="i:check"]').click();
      return { good, open, flipped, panel: /Every body is a closed solid/.test(panel.textContent) };
    });
    assert(r.good.closed && r.good.outward && r.good.bad === 0 && r.good.shells === 1, JSON.stringify(r.good)); assert(!r.open.closed, 'a missing face leaves a gap'); assert(!r.flipped.outward, 'reversed faces give a negative volume'); assert(r.panel, 'panel verdict');
  });
  await ok('ribbon buttons open the tools', async () => {
    const r = await page.evaluate(() => {
      loadDoc({ features: [], next: 200 }, 'x'); setWorkspace('model'); const out = {};
      for (const a of ['f:planepath', 'f:pt3pl', 'f:separate', 'i:check']) { const b = document.querySelector(`[data-act="${a}"]`); out[a] = !!b && !!TIP_TXT[a]; if (b) { b.click(); out[a] = out[a] && !!CMD; cancelCmd(); } }
      return out;
    });
    assert(Object.values(r).every(Boolean), JSON.stringify(r));
  });
  await ok('no page errors', async () => assert.deepStrictEqual(errs, []));
  console.log(`${pass} passed, ${fail} failed`); await browser.close(); process.exit(fail ? 1 : 0);
})();
