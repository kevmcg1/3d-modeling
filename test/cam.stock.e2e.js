// Manufacture: rest machining from the in-process stock ("Only cut what earlier operations left").
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/cam.stock.e2e.js
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
    setWorkspace('cam'); const C = cam(); C.ops = []; camAddOp('zrough'); camAddOp('zrough');
    const big = C.tools.find(t => t.type === 'flat' && t.d > 15) || C.tools[0], small = C.tools.find(t => t.type === 'flat' && t.d < 8 && t.d > 4);
    C.ops[0].tool = big.n; C.ops[1].tool = small.n; for (const op of C.ops) { op.leaveWall = 0.5; op.leaveFloor = 0.5; }
    // the length of every cutting move of an operation, after the program has been replayed against the stock
    window.cutLen = op => { camOptimizeAll(); const P = toolpath(op); let L = 0; for (let i = 1; i < P.m.length; i++) if (!P.m[i].r) L += Math.hypot(P.m[i].x - P.m[i - 1].x, P.m[i].y - P.m[i - 1].y, P.m[i].z - P.m[i - 1].z); return Math.round(L); };
    // the stock left at the end of the program, by slab area, for a fixed set of levels
    window.leftover = () => {
      camOptimizeAll(); const st = camStock(), segs = [];
      for (const op of cam().ops) { const P = toolpath(op); for (let i = 1; i < P.m.length; i++) segs.push({ a: P.m[i - 1], b: P.m[i], r: P.m[i].r, tool: P.tool }); }
      const model = new StockModel(st, window.LV || (window.LV = stockLevels(st, segs)));
      for (const op of cam().ops) { const P = toolpath(op); let n = 0; for (let i = 1; i < P.m.length; i++) if (!P.m[i].r) { model.cut(P.m[i - 1], P.m[i], P.tool, false); if (++n % 48 === 0) model.flush(); } }
      model.flush(); let tot = 0; for (let i = 0; i < model.n; i++) tot += model.eff(i).reduce((s, p) => s + Math.abs(cArea(p)), 0) * (model.lv[i + 1] - model.lv[i]);
      return tot;
    };
  });
  await page.waitForTimeout(500);
  let full = null, restLen = null;
  await ok('the second, smaller roughing tool cuts the whole way without the option', async () => {
    const r = await page.evaluate(() => { const C = cam(); const a = cutLen(C.ops[0]), b = cutLen(C.ops[1]); return { a, b, left: leftover() }; });
    full = r; assert(r.a > 500 && r.b > 500 && r.left > 0, JSON.stringify(r));
  });
  await ok('with "only cut what earlier operations left" the second pass is much shorter and still adds a path', async () => {
    const r = await page.evaluate(() => { const C = cam(); C.ops[1].restStock = true; const b = cutLen(C.ops[1]), P = toolpath(C.ops[1]); return { b, info: P.info, lost: P.restLost }; });
    restLen = r; assert(r.b > 0 && r.b < full.b * 0.9 && /rest from stock: \d+%/.test(r.info) && r.lost > 100, JSON.stringify({ r, full }));
  });
  await ok('nothing is lost: the stock left at the end is the same with and without the option', async () => {
    const r = await page.evaluate(() => { const C = cam(); const withRest = leftover(); C.ops[1].restStock = false; const without = leftover(); return { withRest, without }; });
    assert(Math.abs(r.withRest - r.without) / r.without < 0.004, JSON.stringify(r));
  });
  await ok('a repeat of the same roughing with the option cuts almost nothing', async () => {
    const r = await page.evaluate(() => { const C = cam(); C.ops[1].tool = C.ops[0].tool; C.ops[1].restStock = true; return { a: cutLen(C.ops[0]), b: cutLen(C.ops[1]) }; });
    assert(r.b < r.a * 0.15, JSON.stringify(r));
  });
  await ok('the first operation with the option on keeps nearly all of its moves (only its own air passes go) and removes no material', async () => {
    const r = await page.evaluate(() => { const C = cam(); C.ops[1].restStock = false; C.ops[0].restStock = true; const a = cutLen(C.ops[0]), l1 = leftover(); C.ops[0].restStock = false; const a0 = cutLen(C.ops[0]), l0 = leftover(); return { a, a0, l1, l0 }; });
    assert(r.a > r.a0 * 0.9 && Math.abs(r.l1 - r.l0) / r.l0 < 0.004, JSON.stringify(r));
  });
  await ok('the program still simulates and posts with the option on', async () => {
    const r = await page.evaluate(() => { const C = cam(); C.ops[1].tool = C.tools.find(t => t.type === 'flat' && t.d < 8 && t.d > 4).n; C.ops[1].restStock = true; camOptimizeAll(); const g = postGcode(); return { lines: g.lines, nan: /NaN|undefined/.test(g.text) }; });
    assert(r.lines > 100 && !r.nan, JSON.stringify(r));
  });
  await ok('the checkbox shows on the operation panel and toggles the option', async () => {
    const r = await page.evaluate(() => {
      const C = cam(), op = C.ops[1]; op.restStock = false; CAMUI.view = 'op'; CAMUI.op = op.id; camRefresh();
      const el = document.getElementById('opRestStock'); if (!el) return { found: false };
      el.checked = true; el.dispatchEvent(new Event('change')); return { found: true, on: !!op.restStock, tip: !!TIP_TXT['mc:reststock'] };
    });
    assert(r.found && r.on && r.tip, JSON.stringify(r));
  });
  await ok('drilling operations do not offer it', async () => {
    const r = await page.evaluate(() => { const C = cam(); camAddOp('drill'); const op = C.ops[C.ops.length - 1]; CAMUI.view = 'op'; CAMUI.op = op.id; camRefresh(); return !!document.getElementById('opRestStock'); });
    assert(r === false);
  });
  await ok('no page errors', async () => { assert(!errs.length, errs.join(' | ')); });
  await browser.close();
  console.log(fail ? `${fail} failed, ${pass} passed` : 'all CAM stock checks passed');
  process.exit(fail ? 1 : 0);
})();
