// More modeling tools: Bounding Box, Cavity, Sketch Driven Pattern, Draft Analysis, Wall Thickness (more-tools.js).
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/design.more.e2e.js
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
  const run = feats => page.evaluate(F => {
    loadDoc({ features: F, next: 200 }, 'x');
    const c = evaluate(0.05), vol = b => { let v = 0; for (const p of b.polys) for (let i = 1; i + 1 < p.v.length; i++) v += dot3(p.v[0], crs3(p.v[i], p.v[i + 1])) / 6; return v; };
    return { errors: c.errors, bodies: c.bodies.map(b => ({ id: b.id, vol: vol(b), bb: b.bb.map(x => +x.toFixed(3)) })) };
  }, feats);
  const box = (id, op, cx, cy, off, w, d, h) => ({ id, type: 'primitive', name: 'Box' + id, shape: 'box', base: 'XY', cx, cy, off, op, w, d, h, dia: 10, dia2: 0, tube: 6, center: true, sit: true });

  await ok('bounding box encloses two bodies and takes the padding', async () => {
    const r = await run([box(10, 'new', 0, 0, 0, 10, 10, 10), box(11, 'new', 20, 0, 0, 10, 10, 10), { id: 12, type: 'bbox', name: 'BB', bodies: [10, 11], pad: 1 }]);
    assert.deepStrictEqual(r.errors, {}); const b = r.bodies.find(x => Math.abs(x.id - 12) < 1e-9); assert(b, JSON.stringify(r.bodies));
    close(b.vol, 32 * 12 * 12, 1, 'volume (30 + 2 by 10 + 2 by 10 + 2)');
  });
  await ok('cavity at 100% cuts the tool out, at 120% leaves clearance, and can drop the tool', async () => {
    const T = box(10, 'new', 0, 0, 0, 30, 30, 30), t = box(11, 'new', 0, 0, 10, 10, 10, 10);
    const a = await run([T, t, { id: 12, type: 'cavity', name: 'C', target: 10, tools: [11], pct: 100, keep: true }]);
    assert.deepStrictEqual(a.errors, {}); assert.strictEqual(a.bodies.length, 2); close(a.bodies.find(b => b.id === 10).vol, 27000 - 1000, 1, '100%');
    const b = await run([T, t, { id: 12, type: 'cavity', name: 'C', target: 10, tools: [11], pct: 120, keep: false }]);
    assert.strictEqual(b.bodies.length, 1); close(b.bodies[0].vol, 27000 - 1728, 5, '120%');
  });
  await ok('sketch driven pattern copies a body to the other circle centers', async () => {
    const sk = { id: 20, type: 'sketch', name: 'Pts', ref: { k: 'origin', w: 'XY' }, plane: null, ents: [{ id: 21, type: 'circle', c: { x: 0, y: 0 }, r: 1 }, { id: 22, type: 'circle', c: { x: 30, y: 0 }, r: 1 }, { id: 23, type: 'circle', c: { x: 0, y: 30 }, r: 1 }], vis: true };
    const r = await page.evaluate(F => {
      F[0].plane = ORIGIN_PLANES.XY; loadDoc({ features: F, next: 200 }, 'x'); const c = evaluate(0.05); return { errors: c.errors, n: c.bodies.length, ctr: c.bodies.map(b => [(b.bb[0] + b.bb[3]) / 2, (b.bb[2] + b.bb[5]) / 2].map(v => +v.toFixed(2))) };
    }, [sk, box(10, 'new', 0, 0, 0, 4, 4, 4), { id: 24, type: 'skpat', name: 'SP', bodies: [10], sk: 20, join: false }]);
    assert.deepStrictEqual(r.errors, {}); assert.strictEqual(r.n, 3, JSON.stringify(r));
  });
  await ok('draft analysis: a box has green top, red bottom and yellow walls; two-part mold has no red', async () => {
    const r = await page.evaluate(() => {
      loadDoc({ features: [{ id: 10, type: 'primitive', name: 'B', shape: 'box', base: 'XY', cx: 0, cy: 0, off: 0, op: 'new', w: 10, d: 10, h: 10, dia: 10, dia2: 0, tube: 6, center: true, sit: true }], next: 200 }, 'x');
      setWorkspace('model'); applyModel(evaluate(0.05), { tol: 0.05 }); document.querySelector('[data-act="i:draft"]').click();
      const a = FUSION1.classifyDraft(MORE_TOOLS.DR), b = FUSION1.classifyDraft({ ...MORE_TOOLS.DR, both: true }), open = CMD && CMD.type === 'inspect' && CMD.kind === 'draft', html = panel.innerHTML, grp = FUSION1.grp.children.length;
      cancelCmd(); return { a: [a.pos, a.neg, a.need], b: [b.pos, b.neg, b.need], open, html: /Draft Analysis/.test(html), grp };
    });
    assert(r.open && r.html && r.grp > 0, JSON.stringify(r));
    close(r.a[0], 100, 1e-3, 'top'); close(r.a[1], 100, 1e-3, 'bottom'); close(r.a[2], 400, 1e-3, 'walls'); close(r.b[0], 200, 1e-3, 'both ways'); assert.strictEqual(r.b[1], 0);
  });
  await ok('wall thickness: a 10 mm box reads 10, a 2 mm wall of a cup reads 2', async () => {
    const r = await page.evaluate(() => {
      const P = (id, op, off, w, h) => ({ id, type: 'primitive', name: 'B' + id, shape: 'box', base: 'XY', cx: 0, cy: 0, off, op, w, d: w, h, dia: 10, dia2: 0, tube: 6, center: true, sit: true });
      loadDoc({ features: [P(10, 'new', 0, 10, 10)], next: 200 }, 'x'); setWorkspace('model'); applyModel(evaluate(0.05), { tol: 0.05 });
      const a = FUSION1.rayThickness().min;
      loadDoc({ features: [P(10, 'new', 0, 20, 20), P(11, 'cut', 2, 16, 20)], next: 200 }, 'x'); applyModel(evaluate(0.05), { tol: 0.05 });
      document.querySelector('[data-act="i:thick"]').click(); const b = FUSION1.rayThickness().min, html = panel.innerHTML, grp = FUSION1.grp.children.length; cancelCmd();
      return { a, b, html: /Wall Thickness/.test(html), grp };
    });
    close(r.a, 10, 0.01, 'solid box'); close(r.b, 2, 0.01, 'cup wall'); assert(r.html && r.grp > 0, JSON.stringify(r));
  });
  await ok('every new button exists and its hover card has text', async () => {
    const r = await page.evaluate(() => { setWorkspace('model'); return ['f:bbox', 'f:cavity', 'f:skpat', 'i:draft', 'i:thick'].map(a => [a, !!document.querySelector(`[data-act="${a}"]`), !!TIP_TXT[a]]); });
    for (const [a, b, t] of r) assert(b && t, a + ' button/tip missing');
  });
  await ok('no page errors', async () => assert.deepStrictEqual(errs, []));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
