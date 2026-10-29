// Early-access release: sketching and 3D modeling only (the Design tab; physics, hardware, fixtures, stress and drawings hidden), the notice, and STEP / STL / OBJ as the only 3D exports.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/release.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (3d-modeler.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 300)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const open = async (query = '') => {
    const page = await browser.newPage({ viewport: { width: 1400, height: 850 }, acceptDownloads: true });
    page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
    await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
    await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' })); await page.route(/gate\.js/, r => r.abort());
    await page.addInitScript(() => { window.DATUM_NOFX = true; }); await page.goto('file://' + path.resolve(__dirname, '..', '3d-modeler.html') + query); await page.waitForTimeout(1500);
    return page;
  };
  const page = await open();
  const visibleTabs = p => p.$$eval('.ws [data-ws]', bs => bs.filter(b => b.offsetParent !== null).map(b => b.dataset.ws));
  await ok('only the Design tab is visible', async () => assert.deepStrictEqual(await visibleTabs(page), ['design']));
  await ok('hidden tabs cannot be opened', async () => {
    const ws = await page.evaluate(() => { setWorkspace('house'); setWorkspace('gfx'); setWorkspace('print'); setWorkspace('draw'); setWorkspace('cam'); setWorkspace('sheet'); return UIX.ws; });
    assert.strictEqual(ws, 'design');
  });
  await ok('the physics, hardware, fixture, stress and drawing extras are hidden in the ribbon and its menus', async () => {
    const r = await page.evaluate(() => {
      const shown = [...document.querySelectorAll('#toolbar .rb-panel')].filter(g => g.offsetParent).map(g => g.getAttribute('aria-label')), acts = [...document.querySelectorAll('#toolbar [data-act]')].filter(b => b.offsetParent).map(b => b.dataset.act);
      return { shown, acts, menus: Object.values(TB_MENUS).flat().filter(Boolean).map(i => i[0]), btn: !!(document.getElementById('btnGuided') && document.getElementById('btnGuided').offsetParent) };
    });
    for (const g of ['Hardware', 'Fixture']) assert(!r.shown.includes(g), g + ' is shown');
    for (const a of ['stress', 'blueprint', 'f:joint', 'f:mate', 'f:fixture', 'hw:fast', 'hw:phys']) { assert(!r.acts.includes(a), a + ' is shown'); assert(!r.menus.includes(a), a + ' is in a menu'); }
    for (const g of ['Sketch', 'Create', 'Modify', 'Pattern', 'Construct', 'Inspect', 'Insert']) assert(r.shown.includes(g), g + ' is missing'); assert(r.acts.includes('import') && r.acts.includes('export') && r.acts.includes('extrude') && r.acts.includes('sketch'));
    assert.strictEqual(r.btn, false, 'Guided Setup is shown');
  });
  await ok('early-access notice is shown', async () => {
    const t = await page.textContent('#earlyAccess');
    assert.ok(t.includes('This software is in early access. You will experience many bugs or glitches, but it will receive consistent improvements over the coming days.'));
    assert.ok(await page.isVisible('#earlyAccess'));
  });
  await page.evaluate(() => { loadDoc(samplePocketPlate(), 'x'); });
  await page.waitForTimeout(800);
  await ok('Export offers STEP, STL and OBJ only', async () => {
    await page.evaluate(() => openExport());
    const fm = await page.$$eval('[data-exp]', bs => bs.map(b => b.dataset.exp));
    assert.deepStrictEqual(fm, ['step', 'stl', 'obj']);
    await page.evaluate(() => closeModal());
  });
  await ok('body right-click menu offers only those formats', async () => {
    const labels = await page.evaluate(() => { let items; const s = showMenu; showMenu = (i) => { items = i; }; bodyExportMenu(MODEL.bodies[0].id, 10, 10); showMenu = s; return items.filter(Boolean).map(i => i.label).filter(l => l.startsWith('Export as')); });
    assert.strictEqual(labels.length, 3);
    assert.ok(/STEP/.test(labels[0]) && /STL/.test(labels[1]) && /OBJ/.test(labels[2]));
  });
  for (const [key, ext, head] of [['step', 'step', 'ISO-10303-21'], ['stl', 'stl', null], ['obj', 'obj', '#']]) {
    await ok(`${key.toUpperCase()} export downloads a real file`, async () => {
      const dl = page.waitForEvent('download', { timeout: 20000 });
      await page.evaluate(k => runExport(k), key);
      const d = await dl; assert.ok(d.suggestedFilename().endsWith('.' + ext));
      const buf = await require('fs').promises.readFile(await d.path());
      assert.ok(buf.length > 200, 'file too small: ' + buf.length);
      if (head) assert.ok(buf.toString('utf8', 0, 200).includes(head), 'bad header');
      if (key === 'step') assert.ok(buf.toString().includes('MANIFOLD_SOLID_BREP') || buf.toString().includes('ADVANCED_FACE'));
      if (key === 'stl') assert.strictEqual(buf.length, 84 + 50 * buf.readUInt32LE(80));
      if (key === 'obj') assert.ok(/^v /m.test(buf.toString()) && /^f /m.test(buf.toString()));
    });
  }
  await ok('no page errors', async () => assert.deepStrictEqual(page.errs, []));
  const dev = await open('?dev=1');
  await ok('?dev=1 brings every tab, format and ribbon group back', async () => {
    assert.ok((await visibleTabs(dev)).length > 5);
    assert.ok(await dev.evaluate(() => [...document.querySelectorAll('#toolbar .rb-panel')].some(g => g.getAttribute('aria-label') === 'Hardware' && g.offsetParent)));
    await dev.evaluate(() => { loadDoc(samplePocketPlate(), 'x'); openExport(); });
    assert.ok((await dev.$$eval('[data-exp]', bs => bs.length)) > 3);
  });
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
