// Manufacture: chains accept any edge or face (sloped, curved, vertical-adjacent), projected flat like a Mastercam 2D chain.
// Manufacture: chains accept any edge or face (sloped, curved, vertical-adjacent), projected flat like a Mastercam 2D chain.
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (index.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 400)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' }));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await page.waitForTimeout(2000);
  await page.evaluate(() => { const s = SAMPLES.find(x => x.name === 'Wedge block'); loadDoc(s.make(), 'test'); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { setWorkspace('cam'); camAddOp('chain'); });
  await page.waitForTimeout(800);
  const run = (code) => page.evaluate(code);
  await ok('a sloped or curved edge is accepted and projected flat at its highest point', async () => {
    const r = await run(() => {
      const op = opById(CAMUI.op); op.chains = [];
      const xy = c => Math.max(...c.pts.map(p => Math.hypot(p[0] - c.pts[0][0], p[2] - c.pts[0][2]))), m = bodyMesh(visibleBodies()[0]), ch = edgeChains(m).find(c => !chainFlat(c) && xy(c) > 0.5 && c.pts.some(p => Math.abs(p[1] - c.pts[0][1]) > 0.1));
      if (!ch) return { none: true };
      chainAdd(op, { mesh: m, ch }, false, false);
      const c = op.chains[0], top = Math.max(...ch.pts.map(p => p[1]));
      return { n: op.chains.length, z: c && c.z, top, pts: c && c.pts.length };
    });
    assert(!r.none && r.n === 1 && Math.abs(r.z - r.top) < 1e-3, JSON.stringify(r));
  });
  await ok('clicking a face (no edge) chains its outline, and the toolpath is built', async () => {
    const r = await run(() => {
      const op = opById(CAMUI.op); op.chains = [];
      const m = bodyMesh(visibleBodies()[0]);
      const xy = c => Math.max(...c.pts.map(p => Math.hypot(p[0] - c.pts[0][0], p[2] - c.pts[0][2]))), ch = edgeChains(m).filter(c => !chainFlat(c) && xy(c) > 0.5).sort((a, b) => b.len - a.len)[0];
      chainAdd(op, { mesh: m, ch, fid: ch.fa }, false, false);
      const P = toolpath(op);
      return { n: op.chains.length, pts: op.chains[0] && op.chains[0].pts.length, moves: P && P.m ? P.m.length : 0 };
    });
    assert(r.n === 1 && r.pts >= 2 && r.moves > 0, JSON.stringify(r));
  });
  await ok('no page errors', async () => assert.deepStrictEqual(errs, []));
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
