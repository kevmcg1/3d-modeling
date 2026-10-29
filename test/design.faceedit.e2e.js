// Replace Face, Delete Face and Split Face (faceedit.js), checked against exact volumes.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/design.faceedit.e2e.js
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
  const BLOCK = 24000;
  // run(extra): the QA block plus features; `mk(helpers)` builds them once the block's faces can be referenced
  const go = (src) => page.evaluate(src => {
    const L = (a, b, c, d, id) => ({ id, type: 'line', a: { x: a, y: b }, b: { x: c, y: d } });
    const base = () => ({ features: [
      { id: 1, type: 'sketch', name: 'Sketch1', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: [L(0, 0, 40, 0, 2), L(40, 0, 40, 30, 3), L(40, 30, 0, 30, 4), L(0, 30, 0, 0, 5)], vis: true },
      { id: 6, type: 'extrude', name: 'Extrude1', sketch: 1, pts: [{ x: 20, y: 15 }], dist: 20, mode: 'one', op: 'new' }], next: 100 });
    const vol = b => { let v = 0; for (const p of b.polys) for (let i = 1; i + 1 < p.v.length; i++) v += dot3(p.v[0], crs3(p.v[i], p.v[i + 1])) / 6; return v; };
    const faceBy = (body, pred) => { const m = bodyMesh(body); for (const p of m.PL) { const s = Surf.list[p.f]; if (pred(s, m, p.f)) return faceRef(m, p.f, faceInfo(m, p.f).on); } };
    const nFaces = body => new Set(bodyMesh(body).PL.map(p => p.f)).size;
    const run = feats => { const d = base(); d.features.push(...feats); loadDoc(d, 'x'); const c = evaluate(0.05); return { errors: c.errors, v: c.bodies.map(vol), bb: c.bodies[0] && c.bodies[0].bb.map(x => +x.toFixed(3)), nf: c.bodies[0] && nFaces(c.bodies[0]), c }; };
    const strip = o => ({ errors: o.errors, v: o.v, bb: o.bb, nf: o.nf, n: o.c.bodies.length });
    const H = { base, vol, faceBy, run, strip, nFaces };
    return eval('(' + src + ')')(H);
  }, src);
  await ok('replace face: the top moved to 10 high, tilted onto a plane, and refused at a right angle', async () => {
    const r = await go(`H => {
      loadDoc(H.base(), 'x'); const A = evaluate(0.05).bodies[0], top = H.faceBy(A, s => s.t === 'P' && s.n[2] > 0.99);
      const a = H.strip(H.run([{ id: 20, type: 'repface', name: 'R', faces: [top], plane: { k: 'origin', w: 'XY' }, off: 10 }]));
      const b = H.strip(H.run([{ id: 20, type: 'repface', name: 'R', faces: [top], plane: { k: 'origin', w: 'YZ' }, off: 0 }]));
      return { a, b };
    }`);
    assert.deepStrictEqual(r.a.errors, {}, JSON.stringify(r.a)); close(r.a.v[0], 40 * 30 * 10, 1, 'replaced height'); close(r.a.bb[5], 10, 1e-6, 'top at 10');
    assert(/right angle/i.test(r.b.errors[20] || ''), JSON.stringify(r.b.errors));
  });
  await ok('delete face: a chamfer and a fillet are healed back to the sharp block', async () => {
    const r = await go(`H => {
      const out = {};
      for (const kind of ['chamfer', 'fillet']) {
        loadDoc(H.base(), 'x'); const A = evaluate(0.05).bodies[0];
        const top = H.faceBy(A, s => s.t === 'P' && s.n[2] > 0.99), right = H.faceBy(A, s => s.t === 'P' && s.n[0] > 0.99);
        const e = { id: 20, type: kind, name: 'E', edges: [{ a: top.m, b: right.m, pt: [40, 15, 20] }], size: 3 };
        const d1 = H.base(); d1.features.push(e); loadDoc(d1, 'x'); const c1 = evaluate(0.05), B = c1.bodies[0], v1 = H.vol(B);
        const strip = H.faceBy(B, (s, m, fid) => !!(s.metas || []).some(x => String(x).includes('"feat":20')) && (kind === 'fillet' ? s.t === 'C' : s.t === 'P'));
        out[kind] = { v1, err1: c1.errors, res: strip ? H.strip(H.run([e, { id: 21, type: 'delface', name: 'D', faces: [strip] }])) : 'no strip face' };
      }
      return out;
    }`);
    for (const k of ['chamfer', 'fillet']) {
      assert(r[k].v1 < BLOCK - 5, `${k} should take material off: ${r[k].v1}`); assert.strictEqual(typeof r[k].res, 'object', String(r[k].res));
      assert.deepStrictEqual(r[k].res.errors, {}, JSON.stringify(r[k].res)); close(r[k].res.v[0], BLOCK, 2, k + ' healed'); assert.strictEqual(r[k].res.nf, 6, k + ' faces');
    }
  });
  await ok('delete face: a through hole and a blind hole are closed up', async () => {
    const r = await go(`H => {
      const out = {};
      for (const [name, off, h] of [['through', -5, 40], ['blind', 10, 20]]) {
        const cyl = { id: 20, type: 'primitive', name: 'Cut', shape: 'cyl', base: 'XY', cx: 20, cy: 15, off, op: 'cut', w: 10, d: 10, h, dia: 10, dia2: 0, tube: 6, center: true, sit: true };
        const d1 = H.base(); d1.features.push(cyl); loadDoc(d1, 'x'); const c1 = evaluate(0.05), B = c1.bodies[0];
        const wall = H.faceBy(B, s => s.t === 'C');
        out[name] = { v1: H.vol(B), err1: c1.errors, res: wall ? H.strip(H.run([cyl, { id: 21, type: 'delface', name: 'D', faces: [wall] }])) : 'no wall' };
      }
      return out;
    }`);
    for (const k of ['through', 'blind']) {
      assert(r[k].v1 < BLOCK - 100, `${k} hole should cut: ${r[k].v1} ${JSON.stringify(r[k].err1)}`); assert.strictEqual(typeof r[k].res, 'object', String(r[k].res));
      assert.deepStrictEqual(r[k].res.errors, {}, JSON.stringify(r[k].res)); close(r[k].res.v[0], BLOCK, 3, k + ' filled'); assert.strictEqual(r[k].res.nf, 6, k + ' faces: ' + r[k].res.nf);
    }
  });
  await ok('delete face refuses a face between curved neighbours', async () => {
    const r = await go(`H => {
      loadDoc(H.base(), 'x'); const A = evaluate(0.05).bodies[0], top = H.faceBy(A, s => s.t === 'P' && s.n[2] > 0.99);
      return H.strip(H.run([{ id: 21, type: 'delface', name: 'D', faces: [top] }]));
    }`);
    assert(r.errors[21], JSON.stringify(r));
  });
  await ok('split face: the top is cut in two along a plane at x = 20 and the shape is unchanged', async () => {
    const r = await go(`H => {
      loadDoc(H.base(), 'x'); const A = evaluate(0.05).bodies[0], top = H.faceBy(A, s => s.t === 'P' && s.n[2] > 0.99);
      const pl = { id: 30, type: 'plane', name: 'P', ref: { k: 'origin', w: 'YZ' }, off: 20, vis: true };
      const a = H.strip(H.run([pl, { id: 31, type: 'splitface', name: 'S', faces: [top], plane: { k: 'feat', feat: 30 } }]));
      const b = H.strip(H.run([{ id: 31, type: 'splitface', name: 'S', faces: [top], plane: { k: 'origin', w: 'YZ' } }]));
      return { a, b, before: H.nFaces(A) };
    }`);
    assert.deepStrictEqual(r.a.errors, {}, JSON.stringify(r.a)); close(r.a.v[0], BLOCK, 1e-3, 'volume'); assert.strictEqual(r.a.nf, r.before + 1);
    assert(/does not cross/i.test(r.b.errors[31] || ''), JSON.stringify(r.b.errors));
  });
  await ok('ribbon buttons open the tools', async () => {
    const r = await page.evaluate(() => {
      loadDoc({ features: [], next: 200 }, 'x'); setWorkspace('model'); const out = {};
      for (const a of ['f:repface', 'f:delface', 'f:splitface']) { const b = document.querySelector(`[data-act="${a}"]`); out[a] = !!b && !!TIP_TXT[a]; if (b) { b.click(); out[a] = out[a] && !!CMD; cancelCmd(); } }
      return out;
    });
    assert(Object.values(r).every(Boolean), JSON.stringify(r));
  });
  await ok('no page errors', async () => assert.deepStrictEqual(errs, []));
  console.log(`${pass} passed, ${fail} failed`); await browser.close(); process.exit(fail ? 1 : 0);
})();
