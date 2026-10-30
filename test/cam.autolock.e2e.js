// Auto Program and Auto Detect are "coming soon" and locked for everyone (Premium included) while the 2D and 3D toolpaths are proven by hand.
// Manual toolpaths stay fully usable. window.DATUM_AUTO = true (tests only) lifts the Auto lock.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/cam.autolock.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (3d-modeler.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 900)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const open = async auto => {
    const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
    await page.addInitScript(a => { window.DATUM_PREMIUM = true; if (a) window.DATUM_AUTO = true; window.DATUM_NOFX = true; }, auto);
    page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
    await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
    await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' })); await page.route(/gate\.js/, r => r.abort());
    await page.goto('file://' + path.resolve(__dirname, '..', '3d-modeler.html') + '?dev=1'); await page.waitForTimeout(2000);
    await page.evaluate(() => { const s = SAMPLES.find(x => x.name === 'Pocketed plate'); loadDoc(s.make(), 'test'); }); await page.waitForTimeout(1200);
    await page.evaluate(() => setWorkspace('cam')); await page.waitForTimeout(1200);
    return page;
  };
  const p = await open(false);
  const MSG = 'Auto Program and Auto Detect are coming soon';

  await ok('the Auto Program and Auto Detect ribbon buttons are dimmed with a lock; no other Manufacture button is', async () => {
    const r = await p.evaluate(() => [...document.querySelectorAll('#toolbar [data-cam]')].map(b => [b.dataset.cam, b.classList.contains('prem-lock'), !!b.querySelector('.lk')]));
    const locked = r.filter(x => x[1]).map(x => x[0]);
    assert.deepStrictEqual(locked.sort(), ['auto', 'autoprog'], JSON.stringify(locked) + ' of ' + r.length);
    assert(r.filter(x => x[1]).every(x => x[2]), 'each carries the lock icon');
  });

  await ok('clicking either button says "coming soon", adds no operation and opens no Auto view', async () => {
    for (const a of ['autoprog', 'auto']) {
      const before = await p.evaluate(() => ({ n: cam().ops.length, v: CAMUI.view }));
      await p.click(`#toolbar [data-cam="${a}"]`, { force: true }); await p.waitForTimeout(500);
      const after = await p.evaluate(() => ({ n: cam().ops.length, v: CAMUI.view, toast: [...document.querySelectorAll('.toast, #toast')].map(t => t.textContent).join('|') }));
      assert(after.n === before.n && after.v === before.v && after.v !== 'auto' && after.v !== 'report' && after.toast.includes(MSG), a + ' ' + JSON.stringify([before, after]));
    }
  });

  await ok('autoProgram() and camAction("auto") do nothing but toast, whoever calls them (command search, dev mode, scripts)', async () => {
    const r = await p.evaluate(async () => { const n = cam().ops.length; await autoProgram(); camAction('autoprog'); camAction('auto'); return { n, m: cam().ops.length, v: CAMUI.view, res: !!AUTO.res }; });
    assert(r.n === r.m && r.v !== 'auto' && !r.res, JSON.stringify(r));
  });

  await ok('the Auto category in the left rail is locked and clicking it does not switch to it', async () => {
    const r = await p.evaluate(() => { const b = document.querySelector('#catrail [data-cat="auto"]'); return b ? { lock: b.classList.contains('prem-lock'), lk: !!b.querySelector('.lk') } : null; });
    assert(r && r.lock && r.lk, JSON.stringify(r));
    const cur = () => p.evaluate(() => { const b = document.querySelector('#catrail .cat-btn.on'); return b ? b.dataset.cat : null; });
    const before = await cur();
    await p.click('#catrail [data-cat="auto"]', { force: true }); await p.waitForTimeout(300);
    assert(await cur() === before && before !== 'auto', 'category unchanged: ' + before + ' -> ' + await cur());
  });

  await ok('a saved or scripted Auto Detect view falls back to the overview; the Auto Detect panel reads "coming soon"', async () => {
    const r = await p.evaluate(() => { CAMUI.view = 'auto'; camRefresh(); return CAMUI.view; });
    assert(r !== 'auto', r);
    const h = await p.evaluate(() => { CAMUI.view = 'auto'; return camPanel(); });
    assert(h.includes('coming soon') && h.includes(MSG) && !/data-camdo="auto"/.test(h), 'panel');
  });

  await ok('the "Auto-detect features" buttons in the overview and lists are locked and the Options button is gone', async () => {
    await p.evaluate(() => { CAMUI.view = 'overview'; camRefresh(); }); await p.waitForTimeout(400);
    const r = await p.evaluate(() => { const h = camPanel(); return { btn: [...h.matchAll(/<button[^>]*data-camdo="auto"[^>]*>/g)].map(m => /prem-lock/.test(m[0])), opts: /data-automenu/.test(h) }; });
    assert(r.btn.every(Boolean) && !r.opts, JSON.stringify(r));
  });

  await ok('hand-made toolpaths stay fully usable: Chain, Contour, Pocket, Drill, Face and 3D Parallel add and compute', async () => {
    const r = await p.evaluate(async () => { const n0 = cam().ops.length; for (const t of ['chain', 'face', 'contour', 'pocket', 'drill', 'parallel']) camAddOp(t); return { added: cam().ops.length - n0, types: cam().ops.map(o => o.type) }; });
    assert(r.added === 6, JSON.stringify(r));
    assert(await p.evaluate(() => !!postGcode().text), 'posts');
  });

  await ok('the page raised no errors', async () => { assert.deepStrictEqual(p.errs, [], p.errs.join('\n')); });
  await p.close();

  const q = await open(true);
  await ok('with the test flag the Auto features work again (autoProgram builds a program)', async () => {
    const r = await q.evaluate(async () => { const e0 = camEpoch; await autoProgram(); await waitToolpaths(120000); return { n: cam().ops.length, lock: [...document.querySelectorAll('#toolbar .prem-lock')].length }; });
    assert(r.n > 3 && r.lock === 0, JSON.stringify(r));
  });
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
