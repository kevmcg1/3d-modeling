// Manufacture → Chain: move a chain's start point by snapping to a vertex, an edge midpoint or a point along the chain,
// for one chain (Start…) or for every chain (Set start points), with real mouse input.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/cam.chain.start.e2e.js
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
  await page.waitForTimeout(1000);
  // the two closed chains at the top of the plate with the most edges (the outline and the pocket rim)
  const chains = await page.evaluate(() => {
    const op = opById(CAMUI.op), out = [];
    for (const b of visibleBodies()) {
      const m = bodyMesh(b), top = Math.max(...edgeChains(m).map(c => c.pts[0][1]));
      for (const ch of edgeChains(m)) {
        if (!chainFlat(ch) || Math.abs(ch.pts[0][1] - top) > 1e-3) continue;
        const nc = buildChain(m, ch, true); if (!nc || !nc.closed || out.some(c => c.eks.some(k => nc.eks.includes(k)))) continue;
        out.push({ rev: false, start: 0, ...nc });
      }
    }
    out.sort((a, b) => b.eks.length - a.eks.length || chainLength(b) - chainLength(a)); out.length = Math.min(out.length, 2); out.forEach((c, i) => c.id = i + 1);
    op.chains = out; camRefresh(); return out.length;
  });
  const page2 = (id, x, y) => page.evaluate(([id, x, y]) => { const c = opById(CAMUI.op).chains.find(q => q.id === id), r = ov.getBoundingClientRect(), s = toScreen(toW(x, y, c.z)); return { x: s.x + r.left, y: s.y + r.top }; }, [id, x, y]);
  const snapOf = (id, kind) => page.evaluate(([id, kind]) => { const c = opById(CAMUI.op).chains.find(q => q.id === id); return CHAINSTART.snapsOf(c).filter(s => s.kind === kind); }, [id, kind]);
  const first = id => page.evaluate(id => { const p = chainTravel(opById(CAMUI.op).chains.find(q => q.id === id)); return { x: p[0].x, y: p[0].y, n: p.length }; }, id);
  const press = async sel => { await page.evaluate(sel => { const b = document.querySelector(sel); if (!b) throw new Error('no ' + sel); b.click(); }, sel); await page.waitForTimeout(150); };
  const clickAt = async q => { await page.mouse.move(q.x, q.y); await page.waitForTimeout(80); await page.mouse.click(q.x, q.y); await page.waitForTimeout(200); };

  await ok('two closed chains to work with', async () => assert(chains === 2, 'chains: ' + chains));
  await ok('each chain offers vertices and edge midpoints to snap to', async () => {
    const v = await snapOf(1, 'vertex'), m = await snapOf(1, 'mid');
    assert(v.length >= 4 && m.length >= 4, JSON.stringify({ v: v.length, m: m.length }));
  });
  await ok('Start… then a click near an edge midpoint starts the chain (and its toolpath) there', async () => {
    const before = await page.evaluate(() => { const P = toolpath(opById(CAMUI.op)); return P.m.length; });
    await press('[data-chdo="start:1"]');
    const m = (await snapOf(1, 'mid'))[0], q = await page2(1, m.x, m.y);
    await page.mouse.move(q.x + 5, q.y + 4); await page.waitForTimeout(100);
    const hov = await page.evaluate(() => CHAINSTART.hover && CHAINSTART.hover.kind);
    assert.strictEqual(hov, 'mid', 'hover snaps to the midpoint');
    await page.mouse.click(q.x + 5, q.y + 4); await page.waitForTimeout(250);
    const f = await first(1), r = await page.evaluate(() => { const op = opById(CAMUI.op), P = toolpath(op); return { on: CHAINUI.startFor, sp: op.chains[0].sp, warn: P.warn, n: P.m.length }; });
    assert(Math.hypot(f.x - m.x, f.y - m.y) < 1e-3, 'travel starts at the midpoint: ' + JSON.stringify({ f, m }));
    assert(r.on == null && r.sp && !r.warn.length && r.n > 20 && before > 0, JSON.stringify(r));
  });
  await ok('the toolpath starts by the new start point', async () => {
    const r = await page.evaluate(() => {
      const op = opById(CAMUI.op), keep = op.chains; op.chains = [keep[0]];
      const P = toolpath(op), s = chainTravel(keep[0])[0], cut = P.m.filter(q => !q.r), d = Math.hypot(cut[0].x - s.x, cut[0].y - s.y);
      op.chains = keep; return { d, tool: toolOf(op.tool).d };
    });
    assert(r.d < r.tool, JSON.stringify(r));                    // the lead-in arc starts about a radius plus the lead from it
  });
  await ok('Reverse keeps the start point; undo puts the old start back', async () => {
    const a = await first(1);
    await press('[data-chdo="rev:1"]');
    const b = await first(1);
    assert(Math.hypot(a.x - b.x, a.y - b.y) < 1e-6, 'start kept when reversed');
    await page.evaluate(() => { undo(); undo(); camRefresh(); }); await page.waitForTimeout(150);
    const c = await page.evaluate(() => { const ch = opById(CAMUI.op).chains[0]; return { sp: ch.sp || null, rev: ch.rev }; });
    assert(!c.sp && !c.rev, JSON.stringify(c));
  });
  await ok('a click near a vertex starts the chain at that corner', async () => {
    await press('[data-chdo="start:1"]');
    const f0 = await first(1), v = (await snapOf(1, 'vertex')).find(s => Math.hypot(s.x - f0.x, s.y - f0.y) > 1), q = await page2(1, v.x, v.y);
    await clickAt({ x: q.x - 4, y: q.y + 3 });
    const f = await first(1), c = await page.evaluate(() => { const ch = opById(CAMUI.op).chains[0]; return { sp: ch.sp || null, start: ch.start }; });
    assert(Math.hypot(f.x - v.x, f.y - v.y) < 1e-3 && !c.sp && c.start > 0, JSON.stringify({ f, v, c }));
  });
  await ok('away from vertices and midpoints, a click starts the chain at that point along it', async () => {
    await press('[data-chdo="start:1"]');
    // a quarter of the way along the longest straight side
    const q = await page.evaluate(() => {
      const c = opById(CAMUI.op).chains[0], n = c.pts.length; let best = null;
      for (let i = 0; i < n; i++) { const a = c.pts[i], b = c.pts[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!best || L > best.L) best = { a, b, L }; }
      return { x: best.a[0] + (best.b[0] - best.a[0]) * 0.27, y: best.a[1] + (best.b[1] - best.a[1]) * 0.27 };
    });
    await clickAt(await page2(1, q.x, q.y));
    const f = await first(1), sp = await page.evaluate(() => opById(CAMUI.op).chains[0].sp);
    assert(sp && Math.hypot(f.x - q.x, f.y - q.y) < 0.5, JSON.stringify({ f, q, sp }));
  });
  await ok('Set start points moves the start of every chain, stays on until Esc', async () => {
    await press('[data-chstart="all"]');
    assert.strictEqual(await page.evaluate(() => CHAINUI.startFor), 'all');
    const want = [];
    for (const id of [1, 2]) {
      const f0 = await first(id), m = (await snapOf(id, 'mid')).find(s => Math.hypot(s.x - f0.x, s.y - f0.y) > 1);
      want.push(m); await clickAt(await page2(id, m.x, m.y));
    }
    for (const [i, id] of [1, 2].entries()) { const f = await first(id); assert(Math.hypot(f.x - want[i].x, f.y - want[i].y) < 1e-3, 'chain ' + id + ': ' + JSON.stringify({ f, w: want[i] })); }
    assert.strictEqual(await page.evaluate(() => CHAINUI.startFor), 'all', 'still picking');
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    const r = await page.evaluate(() => ({ on: CHAINUI.startFor, view: CAMUI.view, n: opById(CAMUI.op).chains.length }));
    assert(r.on == null && r.view === 'op' && r.n === chains, JSON.stringify(r));
  });
  await ok('an open chain starts at whichever end is clicked', async () => {
    await page.evaluate(() => {
      const op = opById(CAMUI.op), c = op.chains[0];
      op.chains = [{ id: 9, rev: false, start: 0, z: c.z, closed: false, eks: [], pts: c.pts.slice(0, 3) }]; camRefresh();
    });
    await page.waitForTimeout(150);
    const ends = await snapOf(9, 'vertex'), f0 = await first(9);
    assert.strictEqual(ends.length, 2);
    const far = ends.find(s => Math.hypot(s.x - f0.x, s.y - f0.y) > 1e-3);
    await press('[data-chdo="start:9"]');
    await clickAt(await page2(9, far.x, far.y));
    const f = await first(9), rev = await page.evaluate(() => opById(CAMUI.op).chains[0].rev);
    assert(rev && Math.hypot(f.x - far.x, f.y - far.y) < 1e-3, JSON.stringify({ f, far, rev }));
  });
  await ok('no page errors', async () => assert(!errs.length, errs.join(' | ')));
  await browser.close();
  console.log(fail ? fail + ' FAILED' : 'all chain start checks passed'); process.exit(fail ? 1 : 0);
})();
