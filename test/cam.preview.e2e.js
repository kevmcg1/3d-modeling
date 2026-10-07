// Manufacture: the see-through stock preview while an operation is being programmed.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/cam.preview.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (index.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 900)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' }));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await page.waitForTimeout(2000);
  await page.evaluate(() => { const s = SAMPLES.find(x => x.name === 'Pocketed plate'); loadDoc(s.make(), 'test'); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    try { localStorage.removeItem('datum.stockPreview'); } catch (e) { }
    StockPreview.on = true;
    setWorkspace('cam'); const C = cam(); C.ops = []; camAddOp('contour');
    // a fingerprint of the preview's geometry: triangles and the sum of every vertex coordinate
    window.pvSig = () => { const g = StockPreview.group; if (!g) return null; let n = 0, s = 0, tr = true; g.traverse(o => { if (!o.isMesh) return; const a = o.geometry.attributes.position; n += a.count; for (let i = 0; i < a.array.length; i++) s += a.array[i]; for (const m of [].concat(o.material)) tr = tr && m.transparent && m.opacity < 1; }); return { n, s: Math.round(s), tr, shown: !!g.parent }; };
    window.pvReady = () => new Promise((res, rej) => { const t0 = performance.now(); const tick = () => { if (StockPreview.state === 'ready' || StockPreview.state === 'empty') res(StockPreview.state); else if (performance.now() - t0 > 30000) rej(new Error('state ' + StockPreview.state)); else setTimeout(tick, 50); }; setTimeout(tick, 200); });
  });
  let first = null;
  await ok('opening an operation shows a see-through preview of the stock after it', async () => {
    const r = await page.evaluate(async () => { const st = await pvReady(); return { st, sig: pvSig(), note: (document.getElementById('opStockPvNote') || {}).textContent, box: !!document.getElementById('opStockPv') }; });
    first = r.sig; assert(r.st === 'ready' && r.sig && r.sig.n > 0 && r.sig.tr && r.sig.shown && r.box && /after this operation/.test(r.note), JSON.stringify(r));
  });
  await ok('changing the tool side updates the preview before any simulation', async () => {
    const r = await page.evaluate(async () => { const op = cam().ops[0]; camEdit(op, 'side', 'inside'); await new Promise(r => setTimeout(r, 30)); const busy = StockPreview.state; await pvReady(); return { busy, sig: pvSig(), sim: SIM.on }; });
    assert(r.busy === 'busy' && r.sig && r.sig.n > 0 && !r.sim && (r.sig.s !== first.s || r.sig.n !== first.n), JSON.stringify({ r, first }));
  });
  await ok('switching the side back gives the first preview again', async () => {
    const r = await page.evaluate(async () => { camEdit(cam().ops[0], 'side', 'outside'); await new Promise(r => setTimeout(r, 30)); await pvReady(); const a = pvSig(); camEdit(cam().ops[0], 'side', 'auto'); await new Promise(r => setTimeout(r, 30)); await pvReady(); return pvSig(); });
    assert(r.n === first.n && r.s === first.s, JSON.stringify({ r, first }));
  });
  await ok('any other parameter (the depth step) updates it too', async () => {
    const r = await page.evaluate(async () => { const op = cam().ops[0]; camEdit(op, 'leave', (op.leave || 0) + 1.5); await new Promise(r => setTimeout(r, 30)); await pvReady(); return pvSig(); });
    assert(r.n > 0 && r.s !== first.s, JSON.stringify({ r, first }));
  });
  await ok('a second operation previews the stock after both', async () => {
    const r = await page.evaluate(async () => { const one = pvSig(); camAddOp('zrough'); await new Promise(r => setTimeout(r, 30)); await pvReady(); return { one, two: pvSig() }; });
    assert(r.two.n > 0 && r.two.s !== r.one.s, JSON.stringify(r));
  });
  await ok('leaving the operation hides it; the simulation is untouched', async () => {
    const r = await page.evaluate(async () => { CAMUI.view = 'overview'; camRefresh(); const off = pvSig(); CAMUI.view = 'op'; CAMUI.op = cam().ops[0].id; camRefresh(); await pvReady(); const on = pvSig(); simStart(); const sim = pvSig(); simStop(); return { off, on, sim }; });
    assert(r.off === null && r.on && r.on.shown && r.sim === null, JSON.stringify(r));
  });
  await ok('the checkbox turns it off and on', async () => {
    const r = await page.evaluate(async () => { CAMUI.view = 'op'; CAMUI.op = cam().ops[0].id; camRefresh(); await pvReady(); const cb = document.getElementById('opStockPv'); cb.click(); const off = pvSig(); const cb2 = document.getElementById('opStockPv'); cb2.click(); await pvReady(); return { off, on: pvSig(), kept: localStorage.getItem('datum.stockPreview') }; });
    assert(r.off === null && r.on && r.on.shown && r.kept === '1', JSON.stringify(r));
  });
  await ok('the switch sits outside the guided-flow tabs, above the footer bar', async () => {
    const r = await page.evaluate(() => { const b = document.getElementById('opStockPvBox'); return { has: !!b, inPane: !!(b && b.closest('.cf-pane')), next: b && b.nextElementSibling && b.nextElementSibling.className }; });
    assert(r.has && !r.inPane, JSON.stringify(r));
  });
  await ok('no page errors', async () => { assert(!errs.length, errs.join(' | ')); });
  await browser.close();
  console.log(fail ? `${fail} failed, ${pass} passed` : 'all stock preview checks passed');
  process.exit(fail ? 1 : 0);
})();
