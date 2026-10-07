// Manufacture: the operations manager in the CAM browser (cam-flow.js): reorder, duplicate, regenerate, enable, show, stale marker.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/cam.opm.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 700)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' }));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await page.waitForTimeout(2000);
  await page.evaluate(() => { loadDoc(SAMPLES.find(x => x.name === 'Pocketed plate').make(), 'test'); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => setWorkspace('cam'));
  await page.waitForTimeout(1000);
  const names = () => page.evaluate(() => cam().ops.map(o => o.name));
  const make = async (q, sel) => { await page.keyboard.press('n'); await page.waitForTimeout(200); await page.keyboard.type(q); await page.keyboard.press('Enter'); await page.waitForTimeout(600); if (sel) { await page.click(sel); await page.waitForTimeout(500); } await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.waitForTimeout(500); };
  await make('pocket', '[data-cfsel="pockets"]');
  await make('contour', '[data-cfsel="outline"]');
  await make('face');
  await ok('the list shows every operation in the left browser', async () => {
    const r = await page.evaluate(() => [...document.querySelectorAll('#tabBody .opm-row .nm')].map(e => e.textContent));
    assert.deepStrictEqual(r, await names()); assert(r.length === 3, r.join());
  });
  await ok('drag one row below another reorders the program in one undo step', async () => {
    const h0 = await page.evaluate(() => hist.cur), n0 = await names();
    await page.evaluate(() => { const ops = cam().ops; CAMFLOW.moveOp(ops[2], ops[0], false); });
    await page.waitForTimeout(300);
    const n1 = await names();
    assert.deepStrictEqual(n1, [n0[2], n0[0], n0[1]]);
    assert((await page.evaluate(() => hist.cur)) === h0 + 1);
    await page.evaluate(() => undo()); await page.waitForTimeout(400);
    assert.deepStrictEqual(await names(), n0);
  });
  await ok('real drag and drop in the list', async () => {
    const rows = page.locator('#tabBody .opm-row'), n0 = await names();
    await rows.nth(0).dragTo(rows.nth(2), { targetPosition: { x: 80, y: 20 } });
    await page.waitForTimeout(400);
    assert.deepStrictEqual(await names(), [n0[1], n0[2], n0[0]]);
    await page.evaluate(() => undo()); await page.waitForTimeout(300);
  });
  await ok('duplicate, enable / disable and show / hide', async () => {
    await page.hover('#tabBody .opm-row:nth-child(1)'); await page.click('#tabBody .opm-row:nth-child(1) [data-opm-dup]'); await page.waitForTimeout(400);
    const n = await names(); assert(n.length === 4 && /copy/.test(n[1]), n.join());
    await page.click('#tabBody .opm-row:nth-child(2) [data-opm-on]'); await page.waitForTimeout(300);
    assert(await page.evaluate(() => cam().ops[1].sup === true));
    await page.hover('#tabBody .opm-row:nth-child(2)'); await page.click('#tabBody .opm-row:nth-child(2) [data-opm-eye]'); await page.waitForTimeout(300);
    assert(await page.evaluate(() => cam().ops[1].hide === true));
    await page.evaluate(() => { undo(); undo(); undo(); }); await page.waitForTimeout(400);
    assert((await names()).length === 3);
  });
  await ok('a model change marks the toolpath stale; Regenerate clears it and keeps the chain', async () => {
    assert(await page.evaluate(() => cam().ops.every(o => !CAMFLOW.isStale(o))));
    await page.evaluate(() => { const f = doc.features.find(x => x.type === 'extrude'); f.depth = (f.depth || 10) * 1; doc.features.push({ ...JSON.parse(JSON.stringify(f)), id: 'zz', name: 'Extra', op: 'new' }); modelChanged(); });
    await page.waitForTimeout(800);
    const st = await page.evaluate(() => ({ stale: cam().ops.filter(o => CAMFLOW.isStale(o)).length, badge: document.querySelectorAll('#tabBody .opm-stale').length }));
    assert(st.stale >= 1 && st.badge === st.stale, JSON.stringify(st));
    await page.click('#tabBody .opm-stale'); await page.waitForTimeout(600);
    const after = await page.evaluate(() => ({ stale: cam().ops.filter(o => CAMFLOW.isStale(o)).length, chains: cam().ops.filter(o => o.type === 'chain').map(o => o.chains.length) }));
    assert(after.stale < st.stale && after.chains.every(c => c >= 1), JSON.stringify(after));
  });
  await ok('no page errors', async () => { assert(!errs.length, errs.join(' | ')); });
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
