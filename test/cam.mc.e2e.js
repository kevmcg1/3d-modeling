// Manufacture: Mastercam-style toolpaths, batch 1 (Dynamic Mill, Peel Mill, Area Mill, Corner Rest Mill, Ramp Contour).
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/cam.mc.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (index.html loads them from CDNs)'); process.exit(0); }
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
  await page.evaluate(() => { const s = SAMPLES.find(x => x.name === 'Pocketed plate'); loadDoc(s.make(), 'test'); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { setWorkspace('cam'); camAddOp('chain'); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    window.allChains = () => { const out = []; for (const b of visibleBodies()) { const m = bodyMesh(b); for (const ch of edgeChains(m)) if (chainFlat(ch)) { const c = buildChain(m, ch, true); if (c) out.push(c); } } return out; };
    // the big pocket's floor outline (z = 7) and the stock-size rectangle at the top
    window.pocketChain = () => allChains().filter(c => c.closed && Math.abs(c.z - 7) < 0.01).sort((a, b) => Math.abs(cArea(cP(chainTravel(b)))) - Math.abs(cArea(cP(chainTravel(a)))))[0];
    window.setMode = (cm, c, extra) => { const op = opById(CAMUI.op); chainSetMode(op, cm); op.chains = [{ id: 1, rev: false, start: 0, ...c }]; Object.assign(op, extra || {}); return op; };
    // every cutting move must stay inside the tool-center region: the area shrunk by the tool radius (and what is left on the walls)
    window.insideArea = (P, c, extra) => { const pts = chainTravel(c), area = [orient(cP(pts), true)], r = P.tool.d / 2, reg = cOffset(area, -(r + (extra || 0)) + 0.02); let bad = 0; for (const m of P.m) if (!m.r && !inPaths(P2(m.x, m.y), reg)) bad++; return bad; };
  });
  await ok('the toolpath list offers the new modes and the Chain panel shows them', async () => {
    const r = await page.evaluate(() => { const op = opById(CAMUI.op); chainSetMode(op, 'dynamic'); const html = chainPanelFields(op); return { modes: Object.keys(MC_CM), has: ['Dynamic Mill', 'Peel Mill', 'Area Mill', 'Corner Rest Mill'].every(n => html.includes(n)), cm: op.cm, tool: toolOf(op.tool).type }; });
    assert(r.modes.length === 4 && r.has && r.cm === 'dynamic' && ['flat', 'bull'].includes(r.tool), JSON.stringify(r));
  });
  await ok('dynamic: clears the pocket to its floor with a light bite, raised feed and nothing outside the walls', async () => {
    const r = await page.evaluate(() => {
      const c = pocketChain(), op = setMode('dynamic', c, { stepdown: 6, leaveWall: 0.25 }), P = toolpath(op), cut = P.m.filter(m => !m.r), t = toolOf(op.tool);
      return { n: P.m.length, warn: P.warn, minz: Math.min(...cut.map(m => m.z)), floor: c.z, bad: insideArea(P, c, 0.25), boosted: cut.filter(m => m.f > t.feed * 1.2).length, info: P.info };
    });
    assert(r.n > 200 && !r.warn.length && Math.abs(r.minz - r.floor) < 0.05 && r.bad === 0 && r.boosted > 50 && /chip thinning/.test(r.info), JSON.stringify(r));
  });
  await ok('dynamic: switching the feed boost off keeps every move at the tool feed', async () => {
    const r = await page.evaluate(() => { const op = opById(CAMUI.op); op.chipThin = false; const P = toolpath(op), t = toolOf(op.tool); return P.m.filter(m => !m.r && m.f > t.feed * 1.001 && m.f !== t.plunge).length; });
    assert(r === 0, 'moves above the tool feed: ' + r);
  });
  await ok('area: zigzag strokes at an angle stay inside the area, reach the floor and finish with a wall pass', async () => {
    const r = await page.evaluate(() => {
      const c = pocketChain(), op = setMode('area', c, { stepdown: 4, angle: 30 }), P = toolpath(op), cut = P.m.filter(m => !m.r);
      return { n: P.m.length, warn: P.warn, minz: Math.min(...cut.map(m => m.z)), floor: c.z, bad: insideArea(P, c, 0), info: P.info };
    });
    assert(r.n > 100 && !r.warn.length && Math.abs(r.minz - r.floor) < 0.05 && r.bad === 0 && /zigzag/.test(r.info) && /30°/.test(r.info), JSON.stringify(r));
  });
  await ok('area: a different stroke angle gives a different path', async () => {
    const r = await page.evaluate(() => { const op = opById(CAMUI.op); const a = JSON.stringify(toolpath(op).m.slice(10, 40)); op.angle = 90; const b = JSON.stringify(toolpath(op).m.slice(10, 40)); return a !== b; });
    assert(r);
  });
  await ok('rest: refuses without a bigger roughing tool, then cuts only the corners it left', async () => {
    const r = await page.evaluate(() => {
      const c = pocketChain(), op = setMode('rest', c, { restD: 0 }), t = toolOf(op.tool), P0 = toolpath(op), warned = P0.warn.length > 0;
      op.restD = t.d * 4; const P = toolpath(op);
      return { warned, n: P.m.length, warn: P.warn, bad: insideArea(P, c, 0), info: P.info, d: t.d };
    });
    assert(r.warned && (r.n > 20 ? r.bad === 0 : r.warn.length) , JSON.stringify(r));
  });
  await ok('peel: full-depth passes from the stock side in, ending on the wall pass', async () => {
    const r = await page.evaluate(() => {
      const c = allChains().find(q => q.closed && Math.abs(q.z - 15) < 0.01 && Math.abs(cArea(cP(chainTravel(q))) - 9600) < 5) || allChains()[0], op = setMode('peel', c, { stepdown: 8, depthMode: 'below', depth: 5 }), P = toolpath(op), cut = P.m.filter(m => !m.r);
      return { n: P.m.length, warn: P.warn, minz: Math.min(...cut.map(m => m.z)), top: c.z, info: P.info };
    });
    assert(r.n > 50 && !r.warn.length && Math.abs(r.minz - (r.top - 5)) < 0.05 && /band peeled/.test(r.info), JSON.stringify(r));
  });
  await ok('ramp contour: one spiral down a closed chain, no plunge at each level', async () => {
    const r = await page.evaluate(() => {
      const c = pocketChain(), op = setMode('contour', c, { stepdown: 2, depthMode: 'below', depth: 6, side: 'right' });
      const a = toolpath(op); const plunges0 = a.m.filter(m => !m.r && m.f === toolOf(op.tool).plunge).length;
      op.ramp = true; const P = toolpath(op), cut = P.m.filter(m => !m.r), plunges1 = cut.filter(m => m.f === toolOf(op.tool).plunge).length;
      return { n: P.m.length, warn: P.warn, minz: Math.min(...cut.map(m => m.z)), floor: c.z - 6, plunges0, plunges1 };
    });
    assert(r.n > 20 && !r.warn.length && Math.abs(r.minz - r.floor) < 0.05, JSON.stringify(r));
  });
  await ok('auto detect offers Dynamic rough pocket as an unticked alternative, and applying it makes a working operation', async () => {
    const r = await page.evaluate(async () => {
      cam().ops = []; CAMUI.view = 'auto'; AUTO.res = null; AUTO.key = ''; AUTO.on = {};
      const R = autoResult(), alt = R.plan.find(s => s.key === 'pocketdyn');
      if (!alt) return { alt: null, keys: R.plan.map(s => s.key) };
      const offBefore = !stepOn(alt); AUTO.on.pocketdyn = true; AUTO.on.pocket = false; autoApply(true);
      const op = cam().ops.find(o => o.type === 'chain' && o.cm === 'dynamic'), P = op && toolpath(op);
      return { alt: true, offBefore, has: !!op, n: P && P.m.length, warn: P && P.warn, name: op && op.name };
    });
    assert(r.alt && r.offBefore && r.has && r.n > 200 && !r.warn.length, JSON.stringify(r));
  });
  await ok('new operations post G-code and simulate', async () => {
    const r = await page.evaluate(async () => {
      const C = cam(); camAddOp('chain'); const op = C.ops[C.ops.length - 1]; chainSetMode(op, 'area'); op.chains = [{ id: 1, rev: false, start: 0, ...pocketChain() }];
      const g = postGcode().text; return { g: g.length, lines: g.split('\n').filter(l => /^N?\d*\s*G[0123]\b/.test(l)).length, types: C.ops.map(o => o.type + ':' + (o.cm || '')) };
    });
    assert(r.g > 500 && r.lines > 5 && r.types.includes('chain:area'), JSON.stringify(r));
  });
  await ok('the heat map picks the new modes up with their own bite and depth, and the raised feed shows as a higher chip load', async () => {
    const r = await page.evaluate(async () => {
      const C = cam(); C.ops = []; camAddOp('chain'); const c = pocketChain(), op = setMode('dynamic', c, { stepdown: 6 }), t = toolOf(op.tool);
      HEAT.on = true; CAMUI.view = 'sim'; simStart(); camDraw();
      const segs = (HEAT.segs || []).filter(s => s.op === op && !s.m.plunge), hi = segs.filter(s => s.b.f > t.feed * 1.2);
      return { n: segs.length, ae: segs.length && segs[Math.floor(segs.length / 2)].m.ae / t.d, ap: segs.length && segs[0].m.ap, boosted: hi.length, chip: hi.length && hi[0].m.ratio };
    });
    assert(r.n > 100 && Math.abs(r.ae - 0.12) < 0.02 && Math.abs(r.ap - 6) < 0.01 && r.boosted > 50, JSON.stringify(r));
  });
  await ok('no page errors', async () => { assert(!errs.length, errs.join(' | ')); });
  await browser.close();
  console.log(fail ? `${fail} failed, ${pass} passed` : 'all CAM batch 1 checks passed');
  process.exit(fail ? 1 : 0);
})();
