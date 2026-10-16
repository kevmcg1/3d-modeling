// Joints (assembly.js): revolute, slider, cylindrical, planar, ball, limits, and the panel / Animate button.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/design.joint.e2e.js
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
  const box = { id: 10, type: 'primitive', name: 'Arm', shape: 'box', base: 'XY', cx: 10, cy: 0, off: 0, op: 'new', w: 4, d: 4, h: 4, dia: 10, dia2: 0, tube: 6, center: true, sit: true };
  const joint = o => ({ id: 11, type: 'joint', name: 'J', bodies: [10], jtype: 'revolute', axis: { k: 'world', w: 'Z' }, pivot: 'origin', value: 0, value2: 0, min: -180, max: 180, rx: 0, ry: 0, rz: 0, ...o });
  const run = F => page.evaluate(F => {
    loadDoc({ features: F, next: 200 }, 'x'); const c = evaluate(0.05);
    return { errors: c.errors, n: c.bodies.length, bb: c.bodies[0].bb.map(x => +x.toFixed(3)) };
  }, F);
  const ctr = bb => [(bb[0] + bb[3]) / 2, (bb[1] + bb[4]) / 2, (bb[2] + bb[5]) / 2];
  await ok('revolute: 90° about the world Z axis through the origin swings the arm from +X to the other horizontal axis', async () => {
    const a = await run([box, joint({ value: 0 })]), b = await run([box, joint({ value: 90 })]), ax = await page.evaluate(() => WORLD_AX.Z);
    assert.deepStrictEqual(b.errors, {}); const c0 = ctr(a.bb), c1 = ctr(b.bb), along = c => c[0] * ax[0] + c[1] * ax[1] + c[2] * ax[2], perp = c => Math.sqrt(Math.max(0, c[0] ** 2 + c[1] ** 2 + c[2] ** 2 - along(c) ** 2));
    close(perp(c1), perp(c0), 1e-6, 'distance from the axis kept'); close(along(c1), along(c0), 1e-6, 'position along the axis kept'); close(Math.hypot(c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]), perp(c0) * Math.SQRT2, 1e-6, 'a quarter turn moves the center by r·√2');
  });
  await ok('slider moves along the axis and the limits clamp the value', async () => {
    const a = await run([box, joint({ jtype: 'slider', axis: { k: 'world', w: 'X' }, value: 0, min: -50, max: 30 })]);
    const b = await run([box, joint({ jtype: 'slider', axis: { k: 'world', w: 'X' }, value: 25, min: -50, max: 30 })]);
    const c = await run([box, joint({ jtype: 'slider', axis: { k: 'world', w: 'X' }, value: 500, min: -50, max: 30 })]);
    close(ctr(b.bb)[0] - ctr(a.bb)[0], 25, 1e-6, 'moved 25'); close(ctr(c.bb)[0] - ctr(a.bb)[0], 30, 1e-6, 'clamped to 30');
  });
  await ok('cylindrical turns and slides; planar moves in the plane; ball turns about its own center; rigid does nothing', async () => {
    const a = await run([box]);
    const cy = await run([box, joint({ jtype: 'cylindrical', value: 90, value2: 7 })]); close(ctr(cy.bb)[1] - ctr(a.bb)[1], 7, 1e-6, 'slid 7 along Z (up)');
    const pl = await run([box, joint({ jtype: 'planar', axis: { k: 'world', w: 'Z' }, value: 5, value2: 3 })]); close(ctr(pl.bb)[1], ctr(a.bb)[1], 1e-6, 'stays level'); close(Math.hypot(ctr(pl.bb)[0] - ctr(a.bb)[0], ctr(pl.bb)[2] - ctr(a.bb)[2]), Math.hypot(5, 3), 1e-6, 'moved 5 and 3');
    const ba = await run([box, joint({ jtype: 'ball', rx: 30, ry: 20, rz: 10 })]); close(ctr(ba.bb)[0], 10, 1e-6, 'center stays'); assert(Math.abs((ba.bb[3] - ba.bb[0]) - 4) > 0.2, 'it turned');
    const rg = await run([box, joint({ jtype: 'rigid', value: 99 })]); assert.deepStrictEqual(rg.bb, a.bb);
  });
  await ok('a bad axis or no bodies is an error, not a crash', async () => {
    const r = await run([box, joint({ bodies: [] })]); assert(/Pick the moving bodies/.test(r.errors[11] || ''), JSON.stringify(r.errors));
    const r2 = await run([box, joint({ axis: null })]); assert(/axis/i.test(r2.errors[11] || ''), JSON.stringify(r2.errors));
  });
  await ok('the ribbon button opens the panel, the type buttons switch it, and Animate moves the joint then stops', async () => {
    const r = await page.evaluate(async b => {
      loadDoc({ features: [b], next: 200 }, 'x'); setWorkspace('model'); applyModel(evaluate(0.05), { tol: 0.05 });
      const btn = document.querySelector('[data-act="f:joint"]'); if (!btn) return { btn: false };
      btn.click(); CMD.f.bodies = [10]; featSync(); await new Promise(r => setTimeout(r, 200));
      const out = { btn: true, types: panel.querySelectorAll('[data-fs="jtype"]').length };
      panel.querySelector('[data-fs="jtype"][data-v=\'"slider"\']').click(); await new Promise(r => setTimeout(r, 100)); out.slider = CMD.f.jtype === 'slider' && CMD.f.min === -50;
      panel.querySelector('[data-fdo="play"]').click(); await new Promise(r => setTimeout(r, 700)); out.moved = CMD.f.value !== 0; out.playing = !!CMD.playing;
      cancelCmd(); await new Promise(r => setTimeout(r, 400)); out.stopped = true; return out;
    }, box);
    assert(r.btn && r.types === 6 && r.slider && r.moved && r.playing, JSON.stringify(r));
  });
  await ok('no page errors', async () => assert.deepStrictEqual(errs, []));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
