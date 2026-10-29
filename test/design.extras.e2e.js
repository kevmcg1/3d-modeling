// Dome, end caps on structural members, and the Cut List (extras.js).
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/design.extras.e2e.js
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
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' })); await page.route(/gate\.js/, r => r.abort());
  await page.goto('file://' + path.resolve(__dirname, '..', '3d-modeler.html')); await page.waitForTimeout(1500);
  const box = (id, op, cx, w, d, h) => ({ id, type: 'primitive', name: 'Box' + id, shape: 'box', base: 'XY', cx, cy: 0, off: 0, op, w, d, h, dia: 10, dia2: 0, tube: 6, center: true, sit: true });
  const vol = `b => { let v = 0; for (const p of b.polys) for (let i = 1; i + 1 < p.v.length; i++) v += dot3(p.v[0], crs3(p.v[i], p.v[i + 1])) / 6; return v; }`;
  const run = F => page.evaluate(([F, vs]) => {
    loadDoc({ features: F, next: 200 }, 'x'); const c = evaluate(0.05), vol = eval(vs);
    return { errors: c.errors, bodies: c.bodies.map(b => ({ id: b.id, vol: vol(b), bb: b.bb.map(x => +x.toFixed(3)) })) };
  }, [F, vol]);

  await ok('dome: a 20 × 20 × 10 block (20 deep, 10 thick) with a 5 high dome on its top face grows to 25 and gains a plausible volume', async () => {
    const r = await page.evaluate(([vs]) => {
      const B = { id: 10, type: 'primitive', name: 'B', shape: 'box', base: 'XY', cx: 0, cy: 0, off: 0, op: 'new', w: 20, d: 20, h: 10, dia: 10, dia2: 0, tube: 6, center: true, sit: true };
      loadDoc({ features: [B], next: 200 }, 'x'); const c0 = evaluate(0.05), b0 = c0.bodies[0], top = b0.polys.find(p => p.n[1] > 0.99);
      const ref = faceRef(bodyMesh(b0), top.f, faceInfo(bodyMesh(b0), top.f).on);
      loadDoc({ features: [B, { id: 11, type: 'dome', name: 'D', faces: [ref], h: 5 }], next: 200 }, 'x'); const c = evaluate(0.05), vol = eval(vs);
      return { errors: c.errors, v0: vol(b0), v: vol(c.bodies[0]), bb: c.bodies[0].bb };
    }, [vol]);
    assert.deepStrictEqual(r.errors, {}, JSON.stringify(r)); close(r.bb[4] - r.bb[1], 25, 0.01, 'height'); const gain = r.v - r.v0;
    assert(gain > 200 * 5 * 0.4 && gain < 200 * 5 * 0.85, 'dome volume plausible (between 40% and 85% of the box above the 20 x 10 face): ' + gain);
  });
  await ok('dome refuses a curved face and a zero height', async () => {
    const r = await page.evaluate(() => {
      const C = { id: 10, type: 'primitive', name: 'C', shape: 'cyl', base: 'XY', cx: 0, cy: 0, off: 0, op: 'new', w: 10, d: 10, h: 10, dia: 20, dia2: 0, tube: 6, center: true, sit: true };
      loadDoc({ features: [C], next: 200 }, 'x'); const b = evaluate(0.05).bodies[0], side = b.polys.find(p => Surf.list[p.f].t === 'C'), m = bodyMesh(b);
      const ref = faceRef(m, side.f, faceInfo(m, side.f).on);
      loadDoc({ features: [C, { id: 11, type: 'dome', name: 'D', faces: [ref], h: 5 }], next: 200 }, 'x'); const e1 = evaluate(0.05).errors[11] || '';
      const top = b.polys.find(p => Surf.list[p.f].t === 'P'), r2 = faceRef(m, top.f, faceInfo(m, top.f).on);
      loadDoc({ features: [C, { id: 11, type: 'dome', name: 'D', faces: [r2], h: 0 }], next: 200 }, 'x'); return { e1, e2: evaluate(0.05).errors[11] || '' };
    });
    assert(/flat/i.test(r.e1) && /height/i.test(r.e2), JSON.stringify(r));
  });
  await ok('gusset: a web in the corner of an L bracket adds ½ · d1 · d2 · t and is one body; errors are clear', async () => {
    const r = await page.evaluate(([vs]) => {
      const P = (id, op, cy, d, h) => ({ id, type: 'primitive', name: 'P' + id, shape: 'box', base: 'XY', cx: 0, cy, off: 0, op, w: 40, d, h, dia: 10, dia2: 0, tube: 6, center: true, sit: true });
      const F0 = [P(10, 'new', 0, 40, 5), P(11, 'join', -17.5, 5, 30)];
      loadDoc({ features: F0, next: 200 }, 'x'); const c0 = evaluate(0.05), b = c0.bodies[0], vol = eval(vs), m = bodyMesh(b);
      const ref = p => faceRef(m, p.f, faceInfo(m, p.f).on);
      const base = b.polys.find(p => p.n[2] > 0.99 && Math.abs(p.v[0][2] - 5) < 1e-6), wall = b.polys.find(p => p.n[1] > 0.99 && Math.abs(p.v[0][1] + 15) < 1e-6);
      const G = o => ({ id: 12, type: 'gusset', name: 'G', a: ref(base), b: ref(wall), d1: 10, d2: 12, t: 4, frac: 0.5, ...o });
      const run = o => { loadDoc({ features: [...F0, G(o)], next: 200 }, 'x'); const c = evaluate(0.05); return { errors: c.errors, n: c.bodies.length, v: c.bodies[0] && vol(c.bodies[0]), bb: c.bodies[0] && c.bodies[0].bb }; };
      return { v0: vol(b), a: run({}), end: run({ frac: 1 }), bad: run({ b: ref(base) }), thick: run({ t: 100 }), zero: run({ d1: 0 }) };
    }, [vol]);
    assert.deepStrictEqual(r.a.errors, {}, JSON.stringify(r.a)); assert.strictEqual(r.a.n, 1);
    close(r.a.v - r.v0, 0.5 * 10 * 12 * 4, 0.5, 'gusset volume'); close(r.end.v - r.v0, 240, 0.5, 'at the end of the corner');
    assert(/parallel/i.test(r.bad.errors[12]) && /shorter/i.test(r.thick.errors[12]) && /legs/i.test(r.zero.errors[12]), JSON.stringify([r.bad.errors, r.thick.errors, r.zero.errors]));
  });
  await ok('end caps add plates of the right thickness to the ends of a structural member', async () => {
    const L = (id, x1, y1, x2, y2) => ({ id, type: 'line', a: { x: x1, y: y1 }, b: { x: x2, y: y2 } });
    const mk = o => [{ id: 1, type: 'sketch', name: 'P', ref: { k: 'origin', w: 'XY' }, plane: null, ents: [L(2, 0, 0, 100, 0)], vis: true }, { id: 10, type: 'struct', name: 'M', path: { sketch: 1, ents: [2] }, stype: 'rtube', s: 20, h: 10, t: 2, rot: 0, cap0: false, cap1: false, ct: 3, op: 'new', ...o }];
    const r = await page.evaluate(([a, b, c, vs]) => {
      const out = [];
      for (const F of [a, b, c]) { F[0].plane = ORIGIN_PLANES.XY; loadDoc({ features: F, next: 200 }, 'x'); const cx = evaluate(0.05), vol = eval(vs); out.push({ errors: cx.errors, v: vol(cx.bodies[0]), len: cx.bodies[0].bb[3] - cx.bodies[0].bb[0] }); }
      return out;
    }, [mk({}), mk({ cap0: true }), mk({ cap0: true, cap1: true })].concat([vol]));
    assert.deepStrictEqual(r.map(x => x.errors), [{}, {}, {}]); close(r[1].len, 103, 0.01, 'one cap'); close(r[2].len, 106, 0.01, 'two caps'); close(r[1].v - r[0].v, 200 * 3, 1e-3, 'cap volume'); close(r[2].v - r[0].v, 200 * 6, 1e-3, 'two caps volume');
  });
  await ok('cut list counts identical bodies together and the panel and CSV work', async () => {
    const r = await page.evaluate(F => {
      loadDoc({ features: F, next: 200 }, 'x'); setWorkspace('model'); applyModel(evaluate(0.05), { tol: 0.05 });
      document.querySelector('[data-act="i:cutlist"]').click();
      const rows = FUSION1.cutList(), out = { open: CMD && CMD.kind === 'cutlist', rows: rows.map(x => [x.qty, ...x.d.map(v => +v.toFixed(2))]), html: /Cut List/.test(panel.innerHTML) && /Copy as CSV/.test(panel.innerHTML) };
      panel.querySelector('[data-cl="copy"]').click(); out.csv = FUSION1.lastCsv; cancelCmd(); return out;
    }, [box(10, 'new', 0, 10, 10, 10), box(11, 'new', 30, 10, 10, 10), box(12, 'new', 60, 20, 5, 5)]);
    assert(r.open && r.html, JSON.stringify(r));
    assert(r.rows.some(x => x[0] === 2 && x[1] === 10) && r.rows.some(x => x[0] === 1 && x[1] === 20), JSON.stringify(r.rows)); assert(/^Qty,Part/.test(r.csv) && r.csv.split('\n').length === 3, r.csv);
  });
  await ok('Dome and Cut List have ribbon buttons and hover cards', async () => {
    const r = await page.evaluate(() => { setWorkspace('model'); return ['f:dome', 'f:gusset', 'i:cutlist'].map(a => [a, !!document.querySelector(`[data-act="${a}"]`), !!TIP_TXT[a]]); });
    for (const [a, b, t] of r) assert(b && t, a + ' button/tip missing');
  });
  await ok('no page errors', async () => assert.deepStrictEqual(errs, []));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
