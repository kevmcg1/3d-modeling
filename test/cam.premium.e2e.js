// The CAM Premium lock: everything in Manufacture is blocked with the "coming soon" message except Setup, the Tool Library,
// manually created 2D toolpaths (Face, Contour, Pocket, Drill, Chain), Simulate and G-code (post and save); window.DATUM_PREMIUM = true lifts it.
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
    await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' }));
    await page.route(/fonts\.g/, r => r.abort());
    await page.goto('file://' + path.resolve(__dirname, '..', '3d-modeler.html')); await page.waitForTimeout(1500);
    await page.evaluate(() => { loadDoc(SAMPLES.find(s => s.name === 'Pocketed plate').make(), 't'); setWorkspace('cam'); });
    await page.waitForTimeout(500);
    return page;
  };
  const toast = p => p.evaluate(() => document.getElementById('toast').textContent);
  const LOCKED = ['autoprog', 'auto', 'verify', 'measure', 'inspect', 'ws:sheet', 'threads', 'add:parallel', 'add:chamfer', 'mach:wire', 'mach:umc400'];
  const FREE = ['add:drill:tap', 'sim', 'post', 'setup', 'tools', 'add:face', 'add:contour', 'add:pocket', 'add:chain', 'add:drill:drill', 'add:drill:spot'];

  const p = await open(false);
  await ok('blocked buttons are marked and the free ones are not', async () => {
    const r = await p.evaluate(() => [...document.querySelectorAll('#toolbar [data-cam]')].map(b => [b.dataset.cam, b.classList.contains('prem-lock')]));
    for (const a of LOCKED) { const x = r.find(q => q[0] === a); assert(x && x[1], a + ' is not marked locked'); }
    for (const a of FREE) { const x = r.find(q => q[0] === a); assert(x && !x[1], a + ' is marked locked'); }
  });
  await ok('clicking a blocked button shows the message and changes nothing', async () => {
    for (const a of LOCKED) {
      await p.evaluate(() => { document.getElementById('toast').textContent = ''; });
      await p.evaluate(a => document.querySelector(`#toolbar [data-cam="${a}"]`).click(), a);
      assert.strictEqual(await toast(p), MSG, a);
      const s = await p.evaluate(() => ({ v: CAMUI.view, sim: SIM.on, n: cam().ops.length, m: cam().machine || 'mill' }));
      assert.deepStrictEqual(s, { v: 'overview', sim: false, n: 0, m: 'mill' }, a);
    }
  });
  await ok('the entry points behind the buttons are blocked too', async () => {
    const r = await p.evaluate(async () => { await autoProgram(); await verifyAndFix(() => {}); camAddOp('parallel'); return { v: CAMUI.view, sim: SIM.on, n: cam().ops.length }; });
    assert.deepStrictEqual(r, { v: 'overview', sim: false, n: 0 });
  });
  await ok('manual 2D toolpaths can still be added', async () => {
    for (const a of ['add:face', 'add:contour', 'add:pocket', 'add:chain', 'add:drill:drill', 'add:drill:spot']) await p.evaluate(a => document.querySelector(`#toolbar [data-cam="${a}"]`).click(), a);
    const t = await p.evaluate(() => cam().ops.map(o => o.type));
    assert.deepStrictEqual(t.slice(0, 5), ['face', 'contour', 'pocket', 'chain', 'drill']);
    assert.notStrictEqual(await p.evaluate(() => CAMUI.view), 'overview');
  });
  await ok('Simulate runs and the G-code posts, saves and copies for free users', async () => {
    await p.evaluate(() => { CAMUI.view = 'overview'; camRefresh(); });
    await p.evaluate(() => { document.getElementById('toast').textContent = ''; document.querySelector('#toolbar [data-cam="sim"]').click(); });
    await p.waitForFunction(() => SIM.on && CAMUI.view === 'sim', null, { timeout: 15000 });
    assert.notStrictEqual(await toast(p), MSG);
    const vb = await p.evaluate(() => { const b = document.querySelector('#panel [data-camdo="reverify"]'); return b ? b.classList.contains('prem-lock') : null; });
    assert.notStrictEqual(vb, false, 'the Verify button inside the simulation panel must show its lock');
    await p.evaluate(() => document.querySelector('#panel [data-camdo="endsim"]').click());
    assert.strictEqual(await p.evaluate(() => SIM.on), false);
    await p.evaluate(() => { document.getElementById('toast').textContent = ''; document.querySelector('#toolbar [data-cam="post"]').click(); });
    assert.strictEqual(await p.evaluate(() => CAMUI.view), 'post');
    const g = await p.evaluate(() => CAMUI.gcode);
    assert(/G21|G20/.test(g) && /M30/.test(g) && /\bG0?[123]\b/.test(g), 'posted program: ' + g.slice(0, 200));
    const dl = p.waitForEvent('download', { timeout: 8000 });
    await p.evaluate(() => document.querySelector('#panel [data-camdo="saveg"]').click());
    const d = await dl; assert(/\.nc$|\.tap$|\.gcode$|\.txt$/i.test(d.suggestedFilename()), d.suggestedFilename());
    assert.notStrictEqual(await toast(p), MSG);
    await p.evaluate(() => { CAMUI.view = 'overview'; camRefresh(); });
  });
  await ok('Setup and the Tool Library still open', async () => {
    for (const v of ['setup', 'tools']) { await p.evaluate(v => document.querySelector(`#toolbar [data-cam="${v}"]`).click(), v); assert.strictEqual(await p.evaluate(() => CAMUI.view), v); }
  });
  await ok('a blocked view left behind shows the lock panel, not the feature', async () => {
    const h = await p.evaluate(() => { CAMUI.view = 'report'; return camPanel(); });
    assert(h.includes(MSG) && !h.includes('Verify'), h.slice(0, 200));
  });
  await ok('the New Toolpath picker blocks 3D entries and lets 2D ones start', async () => {
    await p.evaluate(() => { CAMUI.view = 'overview'; camRefresh(); document.querySelector('#toolbar [data-cam="flow:new"]').click(); });
    await p.waitForSelector('#cfPicker .cf-item');
    const items = await p.evaluate(() => [...document.querySelectorAll('#cfPicker .cf-item')].map(b => [b.querySelector('.nm').textContent, b.classList.contains('prem-lock')]));
    const locked = n => (items.find(i => i[0] === n) || [])[1];
    assert.strictEqual(locked('3D Parallel Finish'), true); assert.strictEqual(locked('Waterline Finish'), true); assert.strictEqual(locked('Pocket'), false); assert.strictEqual(locked('Face'), false);
    await p.evaluate(() => { document.getElementById('toast').textContent = ''; [...document.querySelectorAll('#cfPicker .cf-item')].find(b => b.querySelector('.nm').textContent === '3D Parallel Finish').click(); });
    assert.strictEqual(await toast(p), MSG); assert(await p.$('#cfPicker.in'), 'picker should stay open');
    const n = await p.evaluate(() => cam().ops.length);
    await p.evaluate(() => [...document.querySelectorAll('#cfPicker .cf-item')].find(b => b.querySelector('.nm').textContent === 'Face').click());
    assert.strictEqual(await p.evaluate(() => cam().ops.length), n + 1);
  });
  await ok('the Auto rail button and the Setup Sheet tab are blocked', async () => {
    await p.evaluate(() => { CAMUI.view = 'overview'; camRefresh(); document.getElementById('toast').textContent = ''; document.querySelector('#catrail [data-cat="auto"]').click(); });
    assert.strictEqual(await toast(p), MSG);
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
  });
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
