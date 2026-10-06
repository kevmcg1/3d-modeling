// Fusion-style modeling batch 3: Rib / Web, the Spline sketch tool and the Overall and Center Point slots.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/design.fusion3.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (index.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 400)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message + ' @ ' + String(e.stack).split('\n').slice(1, 3).join(' | ')));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' }));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await page.waitForTimeout(1500);
  const close = (a, b, tol, what) => assert(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
  // a curve sketch on the XY plane (ids 31..) plus a rib; with `plate`, a 40 × 20 × 3 plate under it
  const run = (ents, extra, plate) => page.evaluate(([E, X, plate]) => {
    const L = (a, b, c, d, id) => ({ id, type: 'line', a: { x: a, y: b }, b: { x: c, y: d } });
    const feats = [];
    if (plate) feats.push(
      { id: 1, type: 'sketch', name: 'Sketch1', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: [L(0, 0, 40, 0, 2), L(40, 0, 40, 20, 3), L(40, 20, 0, 20, 4), L(0, 20, 0, 0, 5)], vis: true },
      { id: 6, type: 'extrude', name: 'Extrude1', sketch: 1, pts: [{ x: 20, y: 10 }], dist: 3, mode: 'one', op: 'new' });
    feats.push({ id: 30, type: 'sketch', name: 'Curves', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: E.map((e, i) => e.type ? { id: 31 + i, ...e } : { id: 31 + i, type: 'line', a: { x: e[0], y: e[1] }, b: { x: e[2], y: e[3] } }), vis: true });
    loadDoc({ features: [...feats, ...X], next: 100 }, 'x');
    const c = evaluate(0.05), vol = b => { let v = 0; for (const p of b.polys) for (let i = 1; i + 1 < p.v.length; i++) v += dot3(p.v[0], crs3(p.v[i], p.v[i + 1])) / 6; return v; };
    return { errors: c.errors, bodies: c.bodies.map(b => ({ id: b.id, vol: vol(b), bb: b.bb })) };
  }, [ents, extra, !!plate]);
  const rib = (chains, x) => ({ id: 40, type: 'rib', name: 'Rib1', chains, t: 2, dist: 10, mode: 'one', extent: 'dist', op: 'new', ...x });

  await ok('rib: a straight line becomes a wall of the right size, symmetric and through-all variants too', async () => {
    const ch = [{ sketch: 30, ents: [31] }];
    let r = await run([[0, 0, 30, 0]], [rib(ch)]); assert.deepStrictEqual(r.errors, {}); close(r.bodies[0].vol, 30 * 2 * 10, 0.5, 'volume');
    const bb = r.bodies[0].bb; close(bb[5] - bb[2], 10, 1e-6, 'height'); close(bb[4] - bb[1], 2, 1e-6, 'thickness');
    r = await run([[0, 0, 30, 0]], [rib(ch, { mode: 'sym' })]); close(r.bodies[0].bb[2], -5, 1e-6, 'symmetric starts below the plane');
    r = await run([[0, 0, 30, 0]], [rib(ch, { extent: 'all' })]); assert.deepStrictEqual(r.errors, {}); assert(r.bodies[0].bb[5] - r.bodies[0].bb[2] > 500, 'through all is very tall');
    r = await run([[0, 0, 30, 0]], [rib(ch, { t: 0 })]); assert(r.errors[40] && /thickness/.test(r.errors[40]), JSON.stringify(r.errors));
  });
  await ok('rib: bends are mitered, arcs and closed curves work, several curves make a web', async () => {
    let r = await run([[0, 0, 30, 0], [30, 0, 30, 20]], [rib([{ sketch: 30, ents: [31, 32] }])]); assert.deepStrictEqual(r.errors, {});
    close(r.bodies[0].vol, (30 + 20 + 1) * 2 * 10 - 0, 25, 'an L with a mitered corner is about two walls');
    r = await run([{ type: 'circle', c: { x: 0, y: 0 }, r: 15 }], [rib([{ sketch: 30, ents: [31] }], { t: 2 })]); assert.deepStrictEqual(r.errors, {});
    close(r.bodies[0].vol, Math.PI * (16 * 16 - 14 * 14) * 10, 940 * 0.02, 'a closed rib is a ring');
    r = await run([[0, 0, 30, 0], [0, 10, 30, 10], [15, -5, 15, 15]], [rib([{ sketch: 30, ents: [31] }, { sketch: 30, ents: [32] }, { sketch: 30, ents: [33] }])]); assert.deepStrictEqual(r.errors, {});
    assert.strictEqual(r.bodies.length, 1, 'crossing walls fuse into one body');
  });
  await ok('rib: joins a plate, and a tall rib through a plate cuts when set to cut', async () => {
    let r = await run([[5, 10, 35, 10]], [rib([{ sketch: 30, ents: [31] }], { op: 'join', dist: 8 })], true); assert.deepStrictEqual(r.errors, {});
    close(r.bodies.find(b => b.id === 6 || true).vol, 40 * 20 * 3 + 30 * 2 * 5, 1, 'plate plus the part of the rib above it');
    r = await run([[5, 10, 35, 10]], [rib([{ sketch: 30, ents: [31] }], { op: 'cut', mode: 'sym', dist: 20 })], true); assert.deepStrictEqual(r.errors, {});
    close(r.bodies[0].vol, 40 * 20 * 3 - 30 * 2 * 3 + 0, 1.5, 'a slot is cut through the plate');
  });
  await ok('spline: points make a smooth closed or open chain of arcs that joins end to end', async () => {
    const a = await page.evaluate(() => {
      loadDoc({ features: [], next: 10 }, 'x');
      const f = { id: newId(), type: 'sketch', name: 'S', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: [], vis: true };
      insertFeature(f); enterSketch(f); setTool('spline');
      const tool = S.tool, flag = S.spline;
      for (const p of [[0, 0], [10, 8], [22, 4], [30, 14]]) polyClick(P2(...p));
      polyFinish();
      const open = S.sk.ents.map(e => e.type).join(',');
      const ends = G.ends(S.sk.ents[0]), last = G.ends(S.sk.ents[S.sk.ents.length - 1]);
      const gaps = []; for (let i = 0; i + 1 < S.sk.ents.length; i++) { const e0 = G.ends(S.sk.ents[i]), e1 = G.ends(S.sk.ents[i + 1]); gaps.push(Math.min(dst2(e0[1], e1[0]), dst2(e0[0], e1[1]), dst2(e0[1], e1[1]), dst2(e0[0], e1[0]))); }
      const through = [[10, 8], [22, 4]].map(q => Math.min(...S.sk.ents.flatMap(e => G.ends(e)).map(p => dst2(p, P2(...q)))));
      S.sk.ents.length = 0; setTool('spline');
      for (const p of [[0, 0], [20, 0], [20, 15], [0, 15], [0, 0]]) polyClick(P2(...p));
      const reg = arrOf(S.sk).regions;
      return { tool, flag, open, nOpen: open.split(',').length, maxGap: Math.max(...gaps), through, closed: S.sk.ents.length, regions: reg.length, area: reg.length ? Math.abs(loopArea(reg[0].outer)) : 0, after: S.spline };
    });
    assert.strictEqual(a.tool, 'polyline'); assert.strictEqual(a.flag, true); assert.strictEqual(a.nOpen, 6, a.open); assert(a.maxGap < 1e-9, 'arcs join end to end: ' + a.maxGap);
    assert(a.through.every(d => d < 1e-9), 'the curve passes through the fit points'); assert.strictEqual(a.closed, 8); assert.strictEqual(a.regions, 1);
    assert(a.area > 20 * 15 && a.area < 20 * 15 * 1.8, 'a smooth closed curve through the corners bulges past the rectangle: ' + a.area);
  });
  await ok('spline: it undoes in one step and leaving the tool finishes it; Polyline is plain again afterwards', async () => {
    const r = await page.evaluate(() => {
      loadDoc({ features: [], next: 10 }, 'x');
      const f = { id: newId(), type: 'sketch', name: 'S', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: [], vis: true };
      insertFeature(f); enterSketch(f); setTool('spline');
      for (const p of [[0, 0], [10, 8], [22, 4]]) polyClick(P2(...p));
      setTool('line');                                                     // leaving finishes the spline
      const n1 = S.sk.ents.map(e => e.type).join(',');
      undo(); const n2 = S.sk.ents.length;
      setTool('polyline'); for (const p of [[0, 0], [10, 8], [22, 4]]) polyClick(P2(...p)); polyFinish();
      return { n1, n2, plain: S.sk.ents.map(e => e.type).join(','), flag: S.spline };
    });
    assert.strictEqual(r.n1, 'arc,arc,arc,arc'); assert.strictEqual(r.n2, 0); assert.strictEqual(r.plain, 'line,line'); assert.strictEqual(r.flag, false);
  });
  await ok('overall slot and center point slot size themselves from the clicks', async () => {
    const r = await page.evaluate(() => {
      loadDoc({ features: [], next: 10 }, 'x');
      const f = { id: newId(), type: 'sketch', name: 'S', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: [], vis: true };
      insertFeature(f); enterSketch(f);
      const area = () => { const reg = arrOf(S.sk).regions; return reg.length === 1 ? Math.abs(loopArea(reg[0].outer)) : -1; };
      const bbx = () => { const b = S.sk.ents.map(G.bbox).reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]); return b; };
      setTool('slotov'); toolClick(P2(0, 0)); toolClick(P2(30, 0)); toolClick(P2(10, 5)); const ov = { area: area(), bb: bbx() };
      S.sk.ents.length = 0; setTool('slotcp'); toolClick(P2(0, 0)); toolClick(P2(15, 0)); toolClick(P2(5, 5)); const cp = { area: area(), bb: bbx() };
      return { ov, cp };
    });
    close(r.ov.area, 20 * 10 + Math.PI * 25, 0.05, 'overall slot area'); close(r.ov.bb[0], 0, 1e-6, 'overall left'); close(r.ov.bb[2], 30, 1e-6, 'overall right');
    close(r.cp.area, 30 * 10 + Math.PI * 25, 0.05, 'center slot area'); close(r.cp.bb[0], -20, 1e-6, 'center slot left'); close(r.cp.bb[2], 20, 1e-6, 'center slot right');
  });
  await ok('Rib opens from the ribbon, takes curve clicks and makes a body; spline and slot buttons are in the sketch ribbon', async () => {
    await run([[0, 0, 30, 0]], []);
    await page.evaluate(() => { refreshUI(); }); await page.waitForTimeout(300);
    assert(await page.evaluate(() => !!document.querySelector('[data-act="f:rib"]')));
    await page.evaluate(() => action('f:rib')); await page.waitForTimeout(200);
    assert(await page.evaluate(() => CMD && CMD.type === 'feat' && CMD.kind === 'rib'));
    await page.evaluate(() => { CMD.f.chains = [{ sketch: 30, ents: [31] }]; featSync(); featOK(); }); await page.waitForTimeout(500);
    const f = await page.evaluate(() => { const f = doc.features.find(f => f.type === 'rib'); return f && { err: MODEL.errors[f.id] || null, bodies: MODEL.bodies.length, name: bodyNames()[f.id] }; });
    assert(f && !f.err && f.bodies === 1 && /Body/.test(f.name), JSON.stringify(f));
    await page.evaluate(() => { const s = { id: newId(), type: 'sketch', name: 'S2', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: [], vis: true }; insertFeature(s); enterSketch(s); }); await page.waitForTimeout(400);
    for (const a of ['spline', 'slotov', 'slotcp']) assert(await page.evaluate(a => !!document.querySelector(`[data-act="${a}"]`), a), 'no button ' + a);
    await page.evaluate(() => action('spline')); await page.waitForTimeout(200);
    assert(await page.evaluate(() => S.spline && S.tool === 'polyline' && document.querySelector('[data-act="spline"]').classList.contains('on') && !document.querySelector('[data-act="polyline"]').classList.contains('on')), 'only Spline is lit');
  });
  await ok('no page errors', async () => { assert.deepStrictEqual(errs, []); });
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
