// Sheet metal (sheet-metal.js): Base Flange with bends, Flat Pattern.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/design.sheetmetal.e2e.js
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
  const feats = (extra = {}, pts = [[0, 0, 30, 0], [30, 0, 30, 20]]) => [
    { id: 1, type: 'sketch', name: 'Profile', ref: { k: 'origin', w: 'XY' }, plane: null, ents: pts.map((p, i) => L(2 + i, ...p)), vis: true },
    { id: 10, type: 'smbase', name: 'Flange', chain: { sketch: 1, ents: pts.map((_, i) => 2 + i) }, t: 2, r: 2, kf: 0.44, width: 40, sym: false, op: 'new', ...extra },
    { id: 11, type: 'smflat', name: 'Flat', src: 10, gap: 20 },
  ];
  const run = F => page.evaluate(F => {
    F[0].plane = ORIGIN_PLANES.XY; loadDoc({ features: F, next: 200 }, 'x');
    const c = evaluate(0.05), vol = b => { let v = 0; for (const p of b.polys) for (let i = 1; i + 1 < p.v.length; i++) v += dot3(p.v[0], crs3(p.v[i], p.v[i + 1])) / 6; return v; };
    return { errors: c.errors, bodies: c.bodies.map(b => ({ id: b.id, vol: vol(b), bb: b.bb.map(x => +x.toFixed(3)) })) };
  }, F);

  await ok('an L profile becomes a bent sheet with the right thickness, width and volume', async () => {
    const r = await run(feats()); assert.deepStrictEqual(r.errors, {});
    const b = r.bodies.find(x => x.id === 10); assert(b, JSON.stringify(r.bodies));
    close(b.vol, 40 * 2 * (44 + Math.PI / 2 * 3), 0.02 * b.vol, 'volume (centerline 44 + bend arc 3 × π/2, 2 thick, 40 wide)');
    close(b.bb[3] - b.bb[0], 31, 0.1, 'x extent'); close(b.bb[5] - b.bb[2], 40, 0.01, 'width along the sketch normal');
  });
  await ok('flat pattern: length = flats + bend allowance, a plate beside the model', async () => {
    const r = await run(feats()); const f = r.bodies.find(x => Math.abs(x.id - 11) < 1e-9); assert(f, JSON.stringify(r.bodies));
    const len = 44 + (Math.PI / 2) * (2 + 0.44 * 2);
    close(f.vol, len * 40 * 2, 0.5, 'flat plate volume'); close(f.bb[3] - f.bb[0], len, 0.01, 'flat length'); assert(f.bb[0] >= r.bodies.find(x => x.id === 10).bb[3] + 19, 'sits beside the model');
  });
  await ok('a bigger K-factor lengthens the flat; a symmetric flange is centered; bad input is an error', async () => {
    const a = await run(feats({ kf: 0.2 })), b = await run(feats({ kf: 0.5, sym: true }));
    const la = a.bodies.find(x => Math.abs(x.id - 11) < 1e-9).bb, lb = b.bodies.find(x => Math.abs(x.id - 11) < 1e-9).bb;
    assert(lb[3] - lb[0] > la[3] - la[0], 'K 0.5 longer than K 0.2'); const f = b.bodies.find(x => x.id === 10); close(f.bb[2], -20, 0.01, 'centered');
    const bad = await run(feats({ t: 0 })); assert(/thickness/.test(bad.errors[10] || ''), JSON.stringify(bad.errors));
    const closed = await run(feats({}, [[0, 0, 10, 0], [10, 0, 10, 10], [10, 10, 0, 10], [0, 10, 0, 0]])); assert(/open|Pick/.test(closed.errors[10] || ''), JSON.stringify(closed.errors));
  });
  await ok('the ribbon has both buttons and the panels open', async () => {
    const r = await page.evaluate(F => {
      F[0].plane = ORIGIN_PLANES.XY; loadDoc({ features: F, next: 200 }, 'x'); setWorkspace('model'); applyModel(evaluate(0.05), { tol: 0.05 });
      const out = {};
      for (const k of ['smbase', 'smflat']) { const b = document.querySelector(`[data-act="f:${k}"]`); out[k + 'Btn'] = !!b; if (b) { b.click(); out[k] = !!CMD && CMD.f && CMD.f.type === k && /Flat|Thickness|Unfold/.test(panel.innerHTML); cancelCmd(); } out[k + 'Tip'] = !!TIP_TXT['f:' + k]; }
      return out;
    }, feats().slice(0, 2));
    assert(r.smbaseBtn && r.smflatBtn && r.smbase && r.smflat && r.smbaseTip && r.smflatTip, JSON.stringify(r));
  });
  await ok('no page errors', async () => assert.deepStrictEqual(errs, []));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
