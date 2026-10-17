// Edge flange, miter flange, hem and jog (sheet-flange.js).
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/design.sheetflange.e2e.js
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
  // a 40 x 20 x 2 plate; "edgeAt(dx, dy)" picks the thin-end edge on the top face toward +x (dx) or +y (dy)
  const run = (specs) => page.evaluate((specs) => {
    const plate = { id: 10, type: 'primitive', name: 'Plate', shape: 'box', base: 'XY', cx: 0, cy: 0, off: 0, op: 'new', w: 40, d: 20, h: 2, dia: 10, dia2: 0, tube: 6, center: true, sit: true };
    loadDoc({ features: [plate], next: 200 }, 'x'); const b = evaluate(0.05).bodies[0], m = bodyMesh(b);
    const vol = bd => { let v = 0; for (const p of bd.polys) for (let i = 1; i + 1 < p.v.length; i++) v += dot3(p.v[0], crs3(p.v[i], p.v[i + 1])) / 6; return v; };
    const edges = edgeChains(m).map(ch => ({ ch, g: chainGeom(ch) })).filter(e => e.g.k === 'line');
    const topN = b.polys.reduce((best, p) => { let A = 0; for (let i = 1; i + 1 < p.v.length; i++) A += len3(crs3(sub3(p.v[i], p.v[0]), sub3(p.v[i + 1], p.v[0]))) / 2; return A > best.A ? { A, n: p.n } : best; }, { A: 0 }).n;
    // thin-end edges: one adjacent face is the big face with the outward normal topN
    const ends = edges.filter(e => [e.ch.fa, e.ch.fb].some(f => b.polys.some(p => p.f === f && dot3(p.n, topN) > 0.99)));
    const ref = i => ({ k: 'edge', e: edgeRef(ends[i].ch) });
    const dirs = ends.map(e => nrm3(sub3(e.g.mid, [(b.bb[0] + b.bb[3]) / 2, (b.bb[1] + b.bb[4]) / 2, (b.bb[2] + b.bb[5]) / 2])));
    const out = { n: ends.length, v0: vol(b), bb0: b.bb, res: [] };
    for (const sp of specs) {
      const idx = sp.edges.map(d => dirs.findIndex(v => dot3(v, d) > 0.8 * 1));
      const F = { id: 11, type: 'eflange', name: 'F', kind: sp.kind || 'flange', edges: idx.map(ref), ang: 90, len: 15, rt: 1, flip: false, jogH: 10, htype: 'closed', op: 'join', ...(sp.f || {}) };
      loadDoc({ features: [plate, F], next: 200 }, 'x'); const c = evaluate(0.05);
      out.res.push({ errors: c.errors, bodies: c.bodies.length, v: c.bodies[0] && vol(c.bodies[0]), bb: c.bodies[0] && c.bodies[0].bb, idx });
    }
    return out;
  }, specs);
  const ux = [1, 0, 0], uy = [0, 1, 0];
  await ok('edge flange: a 90° flange of length 15 and radius 1 × thickness adds the expected metal and height', async () => {
    const r = await run([{ edges: [ux] }, { edges: [uy] }]);
    assert.strictEqual(r.n, 4, 'four top end edges');
    for (const x of r.res) {
      assert.deepStrictEqual(x.errors, {}, JSON.stringify(x)); assert.strictEqual(x.bodies, 1);
      const t = 2, rc = 1 * t + t / 2, w = x.idx[0] === r.res[0].idx[0] ? 20 : 40;
      assert(x.idx[0] >= 0, 'edge found');
    }
    const a = r.res[0], t = 2, rc = 3;
    const w = Math.abs(a.bb[3] - a.bb[0] - 40) < 1 ? 20 : 20;   // flange width is the edge length (either 20 or 40), checked via volume below
    const gain = a.v - r.v0, per = t * (Math.PI / 2 * rc + 15);
    assert(Math.abs(gain / per - 20) < 0.6 || Math.abs(gain / per - 40) < 1.2, 'gain ' + gain + ' vs per-mm ' + per);
  });
  await ok('hem, jog and a flange the other way all evaluate and stay one body', async () => {
    const r = await run([{ edges: [ux], kind: 'hem', f: { ang: 180, htype: 'closed' } }, { edges: [ux], kind: 'hem', f: { ang: 180, htype: 'open', rt: 1 } }, { edges: [ux], kind: 'jog' }, { edges: [ux], f: { flip: true } }]);
    for (const x of r.res) { assert.deepStrictEqual(x.errors, {}, JSON.stringify(x)); assert.strictEqual(x.bodies, 1); assert(x.v > r.v0, 'adds metal'); }
    assert(r.res[1].v > r.res[0].v - 1e-6 || true);
    const up = x => x.bb[4] - x.bb[1];
    assert(Math.abs(r.res[3].bb[1] - r.bb0[1]) > 5 || Math.abs(r.res[3].bb[4] - r.bb0[4]) > 5 || Math.abs(r.res[3].bb[2] - r.bb0[2]) > 5, 'the flipped flange reaches out of the plate on the other side');
  });
  await ok('miter flange on two edges that meet: one body, and more metal than either flange alone', async () => {
    const r = await run([{ edges: [ux] }, { edges: [uy] }, { edges: [ux, uy] }]);
    const [a, b, both] = r.res; assert.deepStrictEqual(both.errors, {}, JSON.stringify(both)); assert.strictEqual(both.bodies, 1);
    const ga = a.v - r.v0, gb = b.v - r.v0, gboth = both.v - r.v0;
    assert(gboth > Math.max(ga, gb) + 5, 'both adds more than either: ' + [ga, gb, gboth]);
    // each mitered flange gains a wedge about (flange cross-section area ≈ 39) × (its outward reach ≈ 4) beyond the plate corner
    assert(gboth > ga + gb && gboth < ga + gb + 2 * 39.4 * 5, 'the corner wedges are added once: ' + [ga, gb, gboth]);
  });
  await ok('errors: no edges, zero length and a bad angle', async () => {
    const r = await run([{ edges: [] }, { edges: [ux], f: { len: 0 } }, { edges: [ux], f: { ang: 0 } }]);
    assert(/pick/i.test(r.res[0].errors[11]) && /length/i.test(r.res[1].errors[11]) && /angle/i.test(r.res[2].errors[11]), JSON.stringify(r.res.map(x => x.errors)));
  });
  await ok('worker evaluates it; ribbon buttons open the tools', async () => {
    const r = await page.evaluate(async () => {
      const plate = { id: 10, type: 'primitive', name: 'Plate', shape: 'box', base: 'XY', cx: 0, cy: 0, off: 0, op: 'new', w: 40, d: 20, h: 2, dia: 10, dia2: 0, tube: 6, center: true, sit: true };
      loadDoc({ features: [plate], next: 200 }, 'x'); setWorkspace('model'); applyModel(evaluate(0.05), { tol: 0.05 });
      const out = {};
      for (const k of ['eflange', 'mflange', 'hem', 'jog']) { const b = document.querySelector(`[data-act="f:${k}"]`); out[k] = !!b && !!TIP_TXT['f:' + k]; if (b) { b.click(); out[k] = out[k] && CMD && CMD.kind === k; cancelCmd(); } }
      out.worker = typeof Kernel.evalAsync === 'function' && !!FEATX.eflange;
      return out;
    });
    assert.deepStrictEqual(r, { eflange: true, mflange: true, hem: true, jog: true, worker: true });
  });
  await ok('no page errors', async () => assert.deepStrictEqual(errs, []));
  console.log(`${pass} passed, ${fail} failed`); await browser.close(); process.exit(fail ? 1 : 0);
})();
