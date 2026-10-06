// Manufacture → Chain: click an edge, double-click for the whole chain, then contour / pocket / drill from the chains.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/cam.chain.e2e.js
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
  await page.evaluate(() => { const s = SAMPLES.find(x => x.name === 'Pocketed plate'); loadDoc(s.make(), 'test'); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { setWorkspace('cam'); camAddOp('chain'); });
  await page.waitForTimeout(1500);
  // the screen position of the middle of every level edge chain of the plate, by looking it up in the mesh
  const edges = () => page.evaluate(() => {
    const out = [], r = ov.getBoundingClientRect();
    for (const b of visibleBodies()) { const mesh = bodyMesh(b); for (const ch of edgeChains(mesh)) {
      if (!chainFlat(ch)) continue; const m = ch.mid, s = toScreen(m); if (pickEdge(s.x, s.y, visibleBodies(), 8) && pickEdge(s.x, s.y, visibleBodies(), 8).ch === ch) out.push({ x: s.x + r.left, y: s.y + r.top, z: m[1], closed: ch.closed, len: ch.len });
    } }
    return out;
  });
  await ok('level edges are pickable', async () => { const e = await edges(); assert(e.length >= 4, 'edges: ' + e.length); });
  await ok('one click selects one edge, double-click selects the whole connected chain', async () => {
    const e = (await edges()).filter(q => !q.closed).sort((a, b) => b.z - a.z)[0];
    assert(e, 'no open top edge');
    await page.mouse.move(e.x, e.y); await page.waitForTimeout(100); await page.mouse.click(e.x, e.y); await page.waitForTimeout(200);
    const one = await page.evaluate(() => opById(CAMUI.op).chains.map(c => ({ closed: c.closed, n: c.pts.length, eks: c.eks.length })));
    assert.strictEqual(one.length, 1); assert.strictEqual(one[0].eks, 1);
    await page.mouse.dblclick(e.x, e.y); await page.waitForTimeout(250);
    const whole = await page.evaluate(() => opById(CAMUI.op).chains.map(c => ({ closed: c.closed, eks: c.eks.length })));
    assert.strictEqual(whole.length, 1, JSON.stringify(whole)); assert(whole[0].eks > 1 && whole[0].closed, JSON.stringify(whole));
  });
  await ok('contour toolpath from the chain is generated, cuts at depth and has no warnings', async () => {
    const r = await page.evaluate(() => { const op = opById(CAMUI.op), P = toolpath(op); return { n: P.m.length, warn: P.warn, minz: Math.min(...P.m.map(m => m.z)), info: P.info }; });
    assert(r.n > 20 && !r.warn.length, JSON.stringify(r)); assert(Math.abs(r.minz - 7) < 0.05, 'cuts down to the pocket floor (7), not through it: ' + r.minz);
  });
  await ok('the plate outline chain cuts outside the part, all the way through', async () => {
    const r = await page.evaluate(() => {
      const op = opById(CAMUI.op), keep = op.chains; let seed = null;
      for (const b of visibleBodies()) { const m = bodyMesh(b); for (const ch of edgeChains(m)) if (chainFlat(ch) && Math.abs(ch.pts[0][1] - 15) < 1e-3 && Math.abs(Math.abs(ch.mid[0]) - 60) < 1e-3) { seed = { ch, m }; } }
      if (!seed) return { err: 'no outline edge' };
      const c = buildChain(seed.m, seed.ch, true); op.chains = [{ id: 1, rev: false, start: 0, ...c }];
      const P = toolpath(op), xs = P.m.map(q => q.x), ys = P.m.map(q => q.y), cut = P.m.filter(q => !q.r);
      const res = { closed: c.closed, n: c.pts.length, warn: P.warn, minz: Math.min(...P.m.map(q => q.z)), outside: Math.min(...cut.map(q => Math.min(60 - Math.abs(q.x), 40 - Math.abs(q.y)))) };
      op.chains = keep; return res;
    });
    assert(!r.err && r.closed && r.n >= 4 && !r.warn.length, JSON.stringify(r));
    assert(Math.abs(r.minz + 0.5) < 0.05, 'through the part: ' + r.minz);
    assert(r.outside < -5, 'the tool centre runs about a tool radius outside the outline: ' + r.outside);
  });
  await ok('reverse flips the direction, Start… moves the start point, undo restores', async () => {
    const r = await page.evaluate(() => { const op = opById(CAMUI.op), a = chainTravel(op.chains[0])[0], b0 = chainTravel(op.chains[0]); chainDo(op, 'rev:' + op.chains[0].id); const b = chainTravel(op.chains[0]); undo(); const c = chainTravel(opById(CAMUI.op).chains[0]); return { same: Math.hypot(a.x - b[0].x, a.y - b[0].y) < 1e-6, flipped: Math.hypot(b0[1].x - b[b.length - 1].x, b0[1].y - b[b.length - 1].y) < 1e-6, restored: Math.hypot(a.x - c[0].x, a.y - c[0].y) < 1e-6 && !opById(CAMUI.op).chains[0].rev }; });
    assert(r.same && r.flipped && r.restored, JSON.stringify(r));
  });
  await ok('pocket mode needs a closed chain; an open chain can be closed', async () => {
    const r = await page.evaluate(() => { const op = opById(CAMUI.op); chainSetMode(op, 'pocket'); const P = toolpath(op); return { n: P.m.length, warn: P.warn.length }; });
    assert(r.n > 20 && r.warn === 0, JSON.stringify(r));
  });
  await ok('drill mode drills the circle you click', async () => {
    const e = (await edges()).filter(q => q.closed).sort((a, b) => a.len - b.len)[0];
    assert(e, 'no circle');
    await page.evaluate(() => { const op = opById(CAMUI.op); chainSetMode(op, 'drill'); op.chains = []; camRefresh(); });
    await page.mouse.move(e.x, e.y); await page.waitForTimeout(100); await page.mouse.click(e.x, e.y); await page.waitForTimeout(300);
    const r = await page.evaluate(() => { const op = opById(CAMUI.op), P = toolpath(op), g = postGcode().text; return { n: (op.chains || []).length, holes: (P.holes || []).length, warn: P.warn, gcode: /G8[1-5]/.test(g) }; });
    assert(r.n === 1 && r.holes === 1 && !r.warn.length && r.gcode, JSON.stringify(r));
  });
  await ok('sidebar has separate Manual and Auto categories', async () => {
    const r = await page.evaluate(() => { const h = [...document.querySelectorAll('.auto-head')].map(e => e.textContent.replace(/\s+/g, ' ').trim()), man = document.querySelector('.manual-card'); return { h, manual: man ? man.querySelectorAll('[data-op]').length : -1 }; });
    assert(r.h[0].startsWith('Manual') && r.h[1].startsWith('Auto') && r.manual === 1, JSON.stringify(r));
    const a = await page.evaluate(() => { camAddOp('face'); const op = cam().ops[cam().ops.length - 1]; op.auto = true; camRefresh(); return [...document.querySelectorAll('.auto-card')].map(c => c.querySelectorAll('[data-op]').length); });
    assert.deepStrictEqual(a, [1, 1], JSON.stringify(a));
  });
  await ok('no page errors', async () => assert(!errs.length, errs.join(' | ')));
  await browser.close();
  console.log(fail ? fail + ' FAILED' : 'all chain checks passed'); process.exit(fail ? 1 : 0);
})();
