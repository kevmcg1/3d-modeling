// Reverse Normal and Reduce Mesh (mesh2.js).
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/design.mesh2.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (index.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 500)); } };
const close = (a, b, tol, what) => assert(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (±${tol})`);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } }); await page.addInitScript(() => { window.DATUM_PREMIUM = true; window.DATUM_AUTO = true; window.DATUM_NOFX = true; });   // the CAM Premium lock is off while testing the features it blocks
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' })); await page.route(/gate\.js/, r => r.abort());
  await page.goto('file://' + path.resolve(__dirname, '..', '3d-modeler.html')); await page.waitForTimeout(1500);
  const go = src => page.evaluate(src => {
    const P = (shape, extra) => ({ id: 10, type: 'primitive', name: 'B', shape, base: 'XY', cx: 0, cy: 0, off: 0, op: 'new', w: 20, d: 20, h: 20, dia: 40, dia2: 0, tube: 6, center: true, sit: true, ...extra });
    const vol = b => { let v = 0; for (const p of b.polys) for (let i = 1; i + 1 < p.v.length; i++) v += dot3(p.v[0], crs3(p.v[i], p.v[i + 1])) / 6; return v; };
    const run = feats => { loadDoc({ features: feats, next: 200 }, 'x'); const c = evaluate(0.05); return { errors: c.errors, n: c.bodies.length, v: c.bodies[0] && vol(c.bodies[0]), tris: c.bodies[0] && c.bodies[0].polys.length }; };
    return eval('(' + src + ')')({ P, run });
  }, src);
  await ok('reverse normal: volume changes sign, twice puts it back', async () => {
    const r = await go(`H => ({ a: H.run([H.P('box')]), b: H.run([H.P('box'), { id: 11, type: 'revnorm', name: 'R', bodies: [10] }]), c: H.run([H.P('box'), { id: 11, type: 'revnorm', name: 'R', bodies: [10] }, { id: 12, type: 'revnorm', name: 'R2', bodies: [10] }]), e: H.run([H.P('box'), { id: 11, type: 'revnorm', name: 'R', bodies: [] }]) })`);
    close(r.a.v, 8000, 1e-6, 'box'); close(r.b.v, -8000, 1e-6, 'inside out'); close(r.c.v, 8000, 1e-6, 'back'); assert(/pick/i.test(r.e.errors[11] || ''), JSON.stringify(r.e));
  });
  await ok('reduce: a sphere gets fewer triangles and keeps about its volume; a huge size is refused', async () => {
    const r = await go(`H => ({ a: H.run([H.P('sphere')]), b: H.run([H.P('sphere'), { id: 11, type: 'reducemesh', name: 'R', bodies: [10], size: 6 }]), c: H.run([H.P('sphere'), { id: 11, type: 'reducemesh', name: 'R', bodies: [10], size: 500 }]), d: H.run([H.P('sphere'), { id: 11, type: 'reducemesh', name: 'R', bodies: [10], size: 0 }]) })`);
    assert.deepStrictEqual(r.b.errors, {}, JSON.stringify(r.b)); assert(r.b.tris < r.a.tris * 0.8, `${r.b.tris} vs ${r.a.tris}`); close(r.b.v / r.a.v, 1, 0.35, 'volume ratio');
    assert(r.c.errors[11] && r.d.errors[11], JSON.stringify([r.c.errors, r.d.errors]));
  });
  await ok('smooth: a sphere keeps closing and shrinks a little; bad amounts are refused', async () => {
    const r = await go(`H => ({ a: H.run([H.P('sphere')]), b: H.run([H.P('sphere'), { id: 11, type: 'smoothmesh', name: 'S', bodies: [10], iter: 3, amount: 0.5 }]), c: H.run([H.P('sphere'), { id: 11, type: 'smoothmesh', name: 'S', bodies: [10], iter: 1, amount: 0 }]) })`);
    assert.deepStrictEqual(r.b.errors, {}, JSON.stringify(r.b)); assert(r.b.v < r.a.v && r.b.v > r.a.v * 0.5, `${r.b.v} vs ${r.a.v}`); assert(r.c.errors[11], JSON.stringify(r.c.errors));
  });
  await ok('ribbon buttons open the tools', async () => {
    const r = await page.evaluate(() => { loadDoc({ features: [], next: 200 }, 'x'); setWorkspace('model'); const out = {}; for (const a of ['f:revnorm', 'f:reducemesh', 'f:smoothmesh']) { const b = document.querySelector(`[data-act="${a}"]`); out[a] = !!b && !!TIP_TXT[a]; if (b) { b.click(); out[a] = out[a] && !!CMD; cancelCmd(); } } return out; });
    assert(Object.values(r).every(Boolean), JSON.stringify(r));
  });
  await ok('no page errors', async () => assert.deepStrictEqual(errs, []));
  console.log(`${pass} passed, ${fail} failed`); await browser.close(); process.exit(fail ? 1 : 0);
})();
