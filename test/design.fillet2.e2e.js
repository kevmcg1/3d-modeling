// Variable-radius and full-round fillets (on the QA block, checked against exact volumes).
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/design.fillet2.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (index.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 500)); } };
const close = (a, b, tol, what) => assert(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (±${tol})`);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } }); await page.addInitScript(() => { window.DATUM_PREMIUM = true; window.DATUM_AUTO = true; });   // the CAM Premium lock is off while testing the features it blocks
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' })); await page.route(/gate\.js/, r => r.abort());
  await page.goto('file://' + path.resolve(__dirname, '..', '3d-modeler.html')); await page.waitForTimeout(1500);
  // a 40 × 30 × 20 block on the XY plane (volume 24000, top at z = 20) plus the given features; "@top", "@right" … stand for face references
  const run = (feats, opts = {}) => page.evaluate(([F, opts]) => {
    const L = (a, b, c, d, id) => ({ id, type: 'line', a: { x: a, y: b }, b: { x: c, y: d } });
    const doc0 = { features: [
      { id: 1, type: 'sketch', name: 'Sketch1', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: [L(0, 0, 40, 0, 2), L(40, 0, 40, 30, 3), L(40, 30, 0, 30, 4), L(0, 30, 0, 0, 5)], vis: true },
      { id: 6, type: 'extrude', name: 'Extrude1', sketch: 1, pts: [{ x: 20, y: 15 }], dist: 20, mode: 'one', op: 'new' }], next: 10 };
    const face = (body, n) => { const m = bodyMesh(body); for (const p of m.PL) { const s = Surf.list[p.f]; if (s.t === 'P' && dot3(s.n, n) > 0.99) return faceRef(m, p.f, faceInfo(m, p.f).on); } };
    const base = (loadDoc(doc0, 'x'), evaluate(0.05)), A = base.bodies[0];
    const refs = { top: face(A, [0, 0, 1]), right: face(A, [1, 0, 0]), left: face(A, [-1, 0, 0]), back: face(A, [0, 1, 0]) };
    const feats = F.map(f => JSON.parse(JSON.stringify(f).replace(/"@(\w+)"/g, (m, k) => JSON.stringify(refs[k]))));
    doc0.features.push(...feats); loadDoc(doc0, 'x');
    const c = evaluate(0.05), vol = b => { let v = 0; for (const p of b.polys) for (let i = 1; i + 1 < p.v.length; i++) v += dot3(p.v[0], crs3(p.v[i], p.v[i + 1])) / 6; return v; };
    const out = { errors: c.errors, bodies: c.bodies.map(b => ({ id: b.id, vol: vol(b), bb: b.bb.map(x => +x.toFixed(4)) })) };
    // undo must give the plain block back and redo the feature again
    if (opts.undo) { const n = hist.cur; record('t', null); out.n = n; }
    return out;
  }, [feats, opts]);
  const BLOCK = 24000;
  await ok('variable radius: R2 → R6 along a 30 long edge takes (1 − π/4)·L·(r0² + r0·r1 + r1²)/3 off, and flipping it gives the same volume', async () => {
    const want = BLOCK - (1 - Math.PI / 4) * 30 * (4 + 12 + 36) / 3;
    for (const flip of [false, true]) {
      const r = await run([{ id: 20, type: 'fillet', name: 'F', edges: [{ a: '@top', b: '@right', pt: [40, 15, 20] }], size: 2, vr: 6, flip }]); assert.deepStrictEqual(r.errors, {}, JSON.stringify(r.errors));
      close(r.bodies[0].vol, want, 8, 'variable fillet flip=' + flip);
      assert.strictEqual(r.bodies.length, 1);
    }
  });
  await ok('variable radius with equal ends matches the constant fillet', async () => {
    const r = await run([{ id: 20, type: 'fillet', name: 'F', edges: [{ a: '@top', b: '@right', pt: [40, 15, 20] }], size: 3, vr: 3.0001 }]); assert.deepStrictEqual(r.errors, {});
    close(r.bodies[0].vol, BLOCK - (1 - Math.PI / 4) * 9 * 30, 6, 'equal ends');
  });
  await ok('full round: the two long edges of the top take a round of nearly half the gap off each', async () => {
    const r = await run([{ id: 20, type: 'fillet', name: 'F', edges: [{ a: '@top', b: '@right', pt: [40, 15, 20] }, { a: '@top', b: '@left', pt: [0, 15, 20] }], size: 1, full: true }]); assert.deepStrictEqual(r.errors, {}, JSON.stringify(r.errors));
    const rad = 40 * 0.499, want = BLOCK - 2 * (1 - Math.PI / 4) * rad * rad * 30;
    close(r.bodies[0].vol, want, 0.01 * want, 'full round');
  });
  await ok('full round refuses one edge or edges that are not parallel', async () => {
    const one = await run([{ id: 20, type: 'fillet', name: 'F', edges: [{ a: '@top', b: '@right', pt: [40, 15, 20] }], size: 1, full: true }]);
    assert(/two edges/i.test(one.errors[20] || ''), JSON.stringify(one.errors));
    const skew = await run([{ id: 20, type: 'fillet', name: 'F', edges: [{ a: '@top', b: '@right', pt: [40, 15, 20] }, { a: '@top', b: '@back', pt: [20, 30, 20] }], size: 1, full: true }]);
    assert(/parallel/i.test(skew.errors[20] || ''), JSON.stringify(skew.errors));
  });
  await ok('panel: Variable radius and Full round check boxes show up and set the feature', async () => {
    const r = await page.evaluate(() => {
      loadDoc({ features: [], next: 200 }, 'x'); setWorkspace('model'); cmdEdge('fillet');
      const html = edgePanel(); CMD.f.vr = 5; const html2 = edgePanel(); CMD.f.full = true; const html3 = edgePanel(); return [/edgeVar/.test(html), /edgeVr/.test(html2), /edgeVar/.test(html3) || /edgeVr/.test(html3), /edgeFull/.test(html3)];
    });
    assert.deepStrictEqual(r, [true, true, false, true]);
  });
  await ok('no page errors', async () => assert.deepStrictEqual(errs, []));
  console.log(`${pass} passed, ${fail} failed`); await browser.close(); process.exit(fail ? 1 : 0);
})();
