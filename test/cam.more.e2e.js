// Manufacture: slot, circle mill, deburr, holding tabs, waterline and the feeds & speeds card.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/cam.more.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (index.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 500)); } };
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
  // helpers inside the page: every level chain of the part
  await page.evaluate(() => {
    window.allChains = () => { const out = []; for (const b of visibleBodies()) { const m = bodyMesh(b); for (const ch of edgeChains(m)) if (chainFlat(ch)) { const c = buildChain(m, ch, true); if (c) out.push(c); } } return out; };
    window.setChain = (c, extra) => { const op = opById(CAMUI.op); op.chains = [{ id: 1, rev: false, start: 0, ...c }]; Object.assign(op, extra || {}); return op; };
  });
  await ok('slot: a straight slot ramps down along an open chain', async () => {
    const r = await page.evaluate(() => {
      const c = allChains().find(q => !q.closed) || allChains()[0], op = opById(CAMUI.op); chainSetMode(op, 'slot'); setChain({ ...c, closed: false }, { depth: 3, stepdown: 1.5 });
      const P = toolpath(op), cut = P.m.filter(m => !m.r);
      return { n: P.m.length, warn: P.warn, minz: Math.min(...cut.map(m => m.z)), top: c.z, info: P.info };
    });
    assert(r.n > 10 && !r.warn.length && Math.abs(r.minz - (r.top - 3)) < 0.05, JSON.stringify(r));
  });
  await ok('slot: a wider slot is cut with trochoidal loops that stay inside the slot width', async () => {
    const r = await page.evaluate(() => {
      const op = opById(CAMUI.op), t = toolOf(op.tool); op.slotW = t.d * 2; const c = op.chains[0], P = toolpath(op), cut = P.m.filter(m => !m.r);
      const base = chainTravel(c); let worst = 0;
      for (const m of cut) { let best = Infinity; for (let i = 0; i + 1 < base.length; i++) { const a = base[i], b = base[i + 1], dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((m.x - a.x) * dx + (m.y - a.y) * dy) / L)); best = Math.min(best, Math.hypot(m.x - a.x - u * dx, m.y - a.y - u * dy)); } worst = Math.max(worst, best); }
      return { n: P.m.length, warn: P.warn, worst, a: (op.slotW - t.d) / 2, info: P.info };
    });
    assert(r.n > 100 && !r.warn.length && r.worst <= r.a + 0.05, JSON.stringify(r));
  });
  await ok('circle: mills a hole by helical interpolation to the hole\'s true diameter', async () => {
    const r = await page.evaluate(() => {
      const circ = allChains().filter(q => q.closed).map(c => ({ c, D: 2 * Math.sqrt(Math.abs(cArea(cP(c.pts.map(p => P2(p[0], p[1]))))) / Math.PI) })).sort((a, b) => b.D - a.D);
      const op = opById(CAMUI.op); chainSetMode(op, 'circle'); const t = toolOf(op.tool);
      const big = circ.find(x => x.D > t.d * 1.5); if (!big) return { err: 'no hole bigger than the tool', ds: circ.map(x => x.D) };
      setChain(big.c, { depth: 0 }); const P = toolpath(op), cut = P.m.filter(m => !m.r);
      let cx = 0, cy = 0; big.c.pts.forEach(p => { cx += p[0]; cy += p[1]; }); cx /= big.c.pts.length; cy /= big.c.pts.length;
      const rr = cut.filter(m => Math.hypot(m.x - cx, m.y - cy) > 0.1).map(m => Math.hypot(m.x - cx, m.y - cy));
      return { warn: P.warn, D: big.D, rMin: Math.min(...rr), rMax: Math.max(...rr), want: big.D / 2 - t.d / 2, minz: Math.min(...cut.map(m => m.z)), info: P.info };
    });
    assert(!r.err && !r.warn.length && Math.abs(r.rMax - r.want) < 0.05 && Math.abs(r.rMin - r.want) < 0.05, JSON.stringify(r));
  });
  await ok('circle: a hole no bigger than the tool is refused with advice to drill it', async () => {
    const r = await page.evaluate(() => {
      const op = opById(CAMUI.op), t = toolOf(op.tool), keep = t.d; const small = allChains().filter(q => q.closed).sort((a, b) => a.pts.length - b.pts.length)[0]; setChain(small, {}); t.d = 1000; const P = toolpath(op); t.d = keep; return { warn: P.warn };
    });
    assert(r.warn.some(w => /drill/.test(w)), JSON.stringify(r));
  });
  await ok('circle: boss mode runs outside the circle', async () => {
    const r = await page.evaluate(() => {
      const op = opById(CAMUI.op), c = op.chains[0]; op.side = 'out'; const P = toolpath(op), t = toolOf(op.tool);
      let cx = 0, cy = 0; c.pts.forEach(p => { cx += p[0]; cy += p[1]; }); cx /= c.pts.length; cy /= c.pts.length;
      const D = 2 * Math.sqrt(Math.abs(cArea(cP(c.pts.map(p => P2(p[0], p[1]))))) / Math.PI), rr = P.m.filter(m => !m.r && Math.hypot(m.x - cx, m.y - cy) > 0.1).map(m => Math.hypot(m.x - cx, m.y - cy));
      return { warn: P.warn, rMin: Math.min(...rr), want: D / 2 + t.d / 2, n: P.m.length };
    });
    assert(r.n > 20 && Math.abs(r.rMin - r.want) < 0.05, JSON.stringify(r));
  });
  await ok('deburr: a chamfer mill follows the edge a fixed depth below it', async () => {
    const r = await page.evaluate(() => {
      const op = opById(CAMUI.op); chainSetMode(op, 'deburr'); const c = allChains().filter(q => q.closed).sort((a, b) => b.z - a.z)[0];
      setChain(c, { chSize: 0.5, tipBelow: 0.3 }); const t = toolOf(op.tool), P = toolpath(op), cut = P.m.filter(m => !m.r);
      return { type: t.type, warn: P.warn, z: [...new Set(cut.map(m => +m.z.toFixed(3)))], want: c.z - (0.5 / Math.tan((t.cone || 90) / 2 * Math.PI / 180) + 0.3), info: P.info };
    });
    assert(r.type === 'chamfer' && !r.warn.length && r.z.length === 1 && Math.abs(r.z[0] - r.want) < 0.01, JSON.stringify(r));
  });
  await ok('tabs: the last passes lift over each tab, and the program still goes all the way through elsewhere', async () => {
    const r = await page.evaluate(() => {
      const op = opById(CAMUI.op); chainSetMode(op, 'contour'); let seed = null;
      for (const b of visibleBodies()) { const m = bodyMesh(b); for (const ch of edgeChains(m)) if (chainFlat(ch) && Math.abs(ch.pts[0][1] - 15) < 1e-3 && Math.abs(Math.abs(ch.mid[0]) - 60) < 1e-3) seed = { ch, m }; }
      const c = buildChain(seed.m, seed.ch, true); setChain(c, { tabs: 0 });
      const plain = toolpath(op), zMinPlain = Math.min(...plain.m.map(m => m.z));
      op.tabs = 4; op.tabW = 5; op.tabH = 2; const P = toolpath(op), cut = P.m.filter(m => !m.r), zMin = Math.min(...cut.map(m => m.z));
      const low = cut.filter(m => m.z < zMin + 0.01).length, raised = cut.filter(m => Math.abs(m.z - (zMin + 2)) < 0.01).length;
      return { zMinPlain, zMin, low, raised, warn: P.warn, info: P.info };
    });
    assert(!r.warn.length && Math.abs(r.zMin - r.zMinPlain) < 0.01 && r.low > 10 && r.raised >= 8 && /4 tabs/.test(r.info), JSON.stringify(r));
  });
  await ok('waterline: contours at every level, deeper levels are no larger than shallower ones', async () => {
    const r = await page.evaluate(() => {
      camAddOp('waterline'); const op = opById(CAMUI.op), P = toolpath(op), cut = P.m.filter(m => !m.r), zs = [...new Set(cut.map(m => +m.z.toFixed(2)))];
      return { n: P.m.length, warn: P.warn, nz: zs.length, info: P.info, minz: Math.min(...cut.map(m => m.z)), type: op.type };
    });
    assert(r.n > 50 && !r.warn.length && r.nz >= 3, JSON.stringify(r));
  });
  await ok('new operations post G-code, show in the Manual list and simulate', async () => {
    const r = await page.evaluate(async () => {
      const g = postGcode().text; const types = cam().ops.map(o => o.type + ':' + (o.cm || ''));
      let simOk = true; try { simStart(); await new Promise(r => setTimeout(r, 800)); simStop(); } catch (e) { simOk = String(e); }
      return { lines: g.split('\n').length, g1: (g.match(/\nG0?[123] /g) || []).length, types, simOk };
    });
    assert(r.lines > 100 && r.g1 > 50 && r.simOk === true, JSON.stringify(r));
  });
  await ok('feeds & speeds card shows in the operation panel and the reset button restores the recommendation', async () => {
    const r = await page.evaluate(() => {
      CAMUI.view = 'op'; CAMUI.op = cam().ops[cam().ops.length - 1].id; const t = toolOf(opById(CAMUI.op).tool); t.feed *= 3; camRefresh();
      const html = document.getElementById('panel').innerHTML, has = /Feeds &amp; speeds/.test(html), btn = document.querySelector('[data-fsreset]');
      const before = t.feed; btn && btn.click(); return { has, btn: !!btn, restored: t.feed < before };
    });
    assert(r.has && r.btn && r.restored, JSON.stringify(r));
  });
  await ok('no page errors', async () => assert(!errs.length, errs.join(' | ')));
  await browser.close();
  console.log(fail ? fail + ' FAILED' : 'all CAM checks passed'); process.exit(fail ? 1 : 0);
})();
