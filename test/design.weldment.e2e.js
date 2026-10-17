// Weldments (weldment.js): Structural Member profiles along a path.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/design.weldment.e2e.js
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
  const L = (id, x1, y1, x2, y2) => ({ id, type: 'line', a: { x: x1, y: y1 }, b: { x: x2, y: y2 } });
  const feats = (o = {}, pts = [[0, 0, 100, 0]]) => [
    { id: 1, type: 'sketch', name: 'Path', ref: { k: 'origin', w: 'XY' }, plane: null, ents: pts.map((p, i) => L(2 + i, ...p)), vis: true },
    { id: 10, type: 'struct', name: 'Member', path: { sketch: 1, ents: pts.map((_, i) => 2 + i) }, stype: 'rtube', s: 20, h: 10, t: 2, rot: 0, op: 'new', ...o },
  ];
  const run = F => page.evaluate(F => {
    F[0].plane = ORIGIN_PLANES.XY; loadDoc({ features: F, next: 200 }, 'x');
    const c = evaluate(0.05), vol = b => { let v = 0; for (const p of b.polys) for (let i = 1; i + 1 < p.v.length; i++) v += dot3(p.v[0], crs3(p.v[i], p.v[i + 1])) / 6; return v; };
    return { errors: c.errors, bodies: c.bodies.map(b => ({ id: b.id, vol: vol(b), bb: b.bb.map(x => +x.toFixed(3)) })) };
  }, F);
  const cases = [
    ['rtube', { s: 20, h: 10, t: 2 }, 20 * 10 - 16 * 6], ['rbar', { s: 20, h: 10, t: 0 }, 200], ['angle', { s: 20, h: 20, t: 3 }, 20 * 3 + 17 * 3],
    ['channel', { s: 20, h: 30, t: 3 }, 30 * 3 + 2 * 17 * 3], ['ibeam', { s: 20, h: 30, t: 3 }, 2 * 20 * 3 + 24 * 3], ['tbar', { s: 20, h: 30, t: 3 }, 20 * 3 + 27 * 3],
    ['ttube', { s: 20, h: 20, t: 2 }, Math.PI * (100 - 64)],
  ];
  for (const [ty, sz, area] of cases) {
    await ok(`${ty}: a 100 long member has the profile's exact area × length`, async () => {
      const r = await run(feats({ stype: ty, ...sz })); assert.deepStrictEqual(r.errors, {}); const b = r.bodies[0];
      close(b.vol, area * 100, area * 100 * (ty === 'ttube' ? 0.01 : 1e-6), 'volume');
    });
  }
  await ok('a mitered L-shaped frame is one solid, turning the profile moves its box, bad sizes are errors', async () => {
    const r = await run(feats({}, [[0, 0, 100, 0], [100, 0, 100, 60]])); assert.deepStrictEqual(r.errors, {}); assert.strictEqual(r.bodies.length, 1);
    const a = await run(feats()), b = await run(feats({ rot: 90 }));
    assert(Math.abs((a.bodies[0].bb[4] - a.bodies[0].bb[1]) - (b.bodies[0].bb[4] - b.bodies[0].bb[1])) > 5, 'rotation changes the extents');
    const bad = await run(feats({ t: 12 })); assert(/wall/i.test(bad.errors[10] || ''), JSON.stringify(bad.errors));
  });
  await ok('the ribbon button opens the panel and the profile list switches the sizes', async () => {
    const r = await page.evaluate(F => {
      F[0].plane = ORIGIN_PLANES.XY; loadDoc({ features: F, next: 200 }, 'x'); setWorkspace('model');
      const b = document.querySelector('[data-act="f:struct"]'); if (!b) return { btn: false };
      b.click(); const sel = panel.querySelector('select[data-ft="stype"]'); const out = { btn: true, opts: sel ? sel.options.length : 0, tip: !!TIP_TXT['f:struct'] };
      CMD.f.stype = 'ibeam'; FEATS.struct.onSet('stype'); out.preset = CMD.f.s; cancelCmd(); return out;
    }, feats().slice(0, 1));
    assert(r.btn && r.opts === 7 && r.preset === 50 && r.tip, JSON.stringify(r));
  });
  await ok('no page errors', async () => assert.deepStrictEqual(errs, []));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
