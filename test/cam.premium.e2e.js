// The CAM Premium lock: every ability in Manufacture (setup, tools, 2D and 3D toolpaths, Simulate, G-code, Verify, Measure...) is blocked with
// the "coming soon" message; window.DATUM_PREMIUM = true lifts it.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/cam.premium.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (3d-modeler.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
const MSG = 'These features will be coming soon for Premium users';
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 900)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const open = async premium => {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    page.errs = []; page.on('pageerror', e => page.errs.push(e.message)); page.on('dialog', d => d.dismiss());
    if (premium) await page.addInitScript(() => { window.DATUM_PREMIUM = true; });
    await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
    await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' })); await page.route(/gate\.js/, r => r.abort());
    await page.route(/fonts\.g/, r => r.abort());
    await page.goto('file://' + path.resolve(__dirname, '..', '3d-modeler.html') + '?dev=1'); await page.waitForTimeout(1500);
    await page.evaluate(() => { loadDoc(SAMPLES.find(s => s.name === 'Pocketed plate').make(), 't'); setWorkspace('cam'); });
    await page.waitForTimeout(500);
    return page;
  };
  const toast = p => p.evaluate(() => document.getElementById('toast').textContent);
  const LOCKED = ['autoprog', 'auto', 'verify', 'measure', 'inspect', 'ws:sheet', 'threads', 'add:parallel', 'add:chamfer', 'mach:wire', 'mach:umc400',
    'add:drill:tap', 'sim', 'post', 'setup', 'tools', 'add:face', 'add:contour', 'add:pocket', 'add:chain', 'add:drill:drill', 'add:drill:spot', 'flow:new', 'setorigin'];

  const p = await open(false);
  await ok('every Manufacture button is marked locked', async () => {
    const r = await p.evaluate(() => [...document.querySelectorAll('#toolbar [data-cam]')].map(b => [b.dataset.cam, b.classList.contains('prem-lock')]));
    for (const a of LOCKED) { const x = r.find(q => q[0] === a); assert(x && x[1], a + ' is not marked locked'); }
    assert(r.every(q => q[1]) || r.filter(q => !q[1]).every(q => q[0] === 'mach:mill'), 'unlocked: ' + r.filter(q => !q[1]).map(q => q[0]));
  });
  await ok('clicking any button shows the message and changes nothing', async () => {
    for (const a of LOCKED) {
      await p.evaluate(() => { document.getElementById('toast').textContent = ''; });
      await p.evaluate(a => { const b = document.querySelector(`#toolbar [data-cam="${a}"]`); if (b) b.click(); }, a);
      assert.strictEqual(await toast(p), MSG, a);
      const s = await p.evaluate(() => ({ v: CAMUI.view, sim: SIM.on, n: cam().ops.length, m: cam().machine || 'mill' }));
      assert.deepStrictEqual(s, { v: 'overview', sim: false, n: 0, m: 'mill' }, a);
    }
  });
  await ok('the entry points behind the buttons are blocked too', async () => {
    const r = await p.evaluate(async () => { await autoProgram(); await verifyAndFix(() => {}); camAddOp('parallel'); camAddOp('pocket'); camAction('sim'); camAction('post'); return { v: CAMUI.view, sim: SIM.on, n: cam().ops.length }; });
    assert.deepStrictEqual(r, { v: 'overview', sim: false, n: 0 });
  });
  await ok('the panel shows only the lock note, in every view', async () => {
    for (const v of ['overview', 'setup', 'tools', 'op', 'sim', 'post', 'report']) {
      const h = await p.evaluate(v => { CAMUI.view = v; return camPanel(); }, v);
      assert(h.includes(MSG) && !h.includes('data-camdo'), v + ': ' + h.slice(0, 200));
    }
    await p.evaluate(() => { CAMUI.view = 'overview'; camRefresh(); });
  });
  await ok('the New Toolpath picker, the rail and the Setup Sheet tab are blocked', async () => {
    await p.evaluate(() => { document.getElementById('toast').textContent = ''; document.querySelector('#toolbar [data-cam="flow:new"]').click(); });
    assert.strictEqual(await toast(p), MSG); assert(!(await p.$('#cfPicker.in')), 'the picker must not open');
    for (const cat of await p.evaluate(() => [...document.querySelectorAll('#catrail [data-cat]')].map(b => b.dataset.cat))) {
      await p.evaluate(c => { document.getElementById('toast').textContent = ''; document.querySelector(`#catrail [data-cat="${c}"]`).click(); }, cat);
      assert.strictEqual(await toast(p), MSG, cat);
    }
    await p.evaluate(() => { document.getElementById('toast').textContent = ''; document.querySelector('[data-ws="sheet"]').click(); });
    assert.strictEqual(await toast(p), MSG); assert.strictEqual(await p.evaluate(() => UIX.ws), 'cam');
  });
  await ok('no page errors', async () => assert.deepStrictEqual(p.errs, []));
  await p.close();

  const q = await open(true);
  await ok('DATUM_PREMIUM lifts the lock', async () => {
    const r = await q.evaluate(() => ({ a: CAM_LOCK.active, l: document.querySelectorAll('#toolbar .prem-lock').length }));
    assert.deepStrictEqual(r, { a: false, l: 0 });
    await q.evaluate(() => document.querySelector('#toolbar [data-cam="measure"]').click());
    assert.strictEqual(await q.evaluate(() => CMD && CMD.type), 'measure');
    await q.evaluate(() => { cancelCmd(); document.querySelector('#toolbar [data-cam="add:face"]').click(); });
    assert.strictEqual(await q.evaluate(() => cam().ops.length), 1);
  });
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
