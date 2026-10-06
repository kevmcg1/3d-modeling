// Fusion-style modeling batch 2: Pipe, Pattern on Path, and the Slot and Ellipse sketch tools.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/design.fusion2.e2e.js
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
  // a path sketch on the XY plane (id 30: ents with ids 31..) plus extra features; returns errors and the volume and box of every body
  const run = (pathEnts, extra, withBox) => page.evaluate(([E, X, withBox]) => {
    const L = (a, b, c, d, id) => ({ id, type: 'line', a: { x: a, y: b }, b: { x: c, y: d } });
    const feats = [];
    if (withBox) feats.push(
      { id: 1, type: 'sketch', name: 'Sketch1', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: [L(0, 0, 20, 0, 2), L(20, 0, 20, 10, 3), L(20, 10, 0, 10, 4), L(0, 10, 0, 0, 5)], vis: true },
      { id: 6, type: 'extrude', name: 'Extrude1', sketch: 1, pts: [{ x: 10, y: 5 }], dist: 5, mode: 'one', op: 'new' });
    feats.push({ id: 30, type: 'sketch', name: 'Path', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: E.map((e, i) => e.type === 'circle' ? { id: 31 + i, ...e } : { id: 31 + i, type: 'line', a: { x: e[0], y: e[1] }, b: { x: e[2], y: e[3] } }), vis: true });
    loadDoc({ features: [...feats, ...X], next: 100 }, 'x');
    const c = evaluate(0.05), vol = b => { let v = 0; for (const p of b.polys) for (let i = 1; i + 1 < p.v.length; i++) v += dot3(p.v[0], crs3(p.v[i], p.v[i + 1])) / 6; return v; };
    return { errors: c.errors, bodies: c.bodies.map(b => ({ id: b.id, vol: vol(b), bb: b.bb })) };
  }, [pathEnts, extra, !!withBox]);
  const pipe = x => ({ id: 40, type: 'pipe', name: 'Pipe1', path: { sketch: 30, ents: [31] }, d: 10, shape: 'round', hollow: false, wall: 1.5, op: 'new', ...x });

  await ok('pipe: round, square and hollow tubes have the right volumes', async () => {
    const line = [[0, 0, 40, 0]];
    let r = await run(line, [pipe({})]); assert.deepStrictEqual(r.errors, {}); close(r.bodies[0].vol, Math.PI * 25 * 40, 3141.6 * 0.02, 'round');
    r = await run(line, [pipe({ shape: 'square' })]); assert.deepStrictEqual(r.errors, {}); close(r.bodies[0].vol, 4000, 1, 'square');
    r = await run(line, [pipe({ hollow: true })]); assert.deepStrictEqual(r.errors, {}); close(r.bodies[0].vol, Math.PI * (25 - 3.5 * 3.5) * 40, 1600 * 0.03, 'hollow');
    r = await run(line, [pipe({ hollow: true, wall: 5 })]); assert(r.errors[40] && /wall/.test(r.errors[40]), JSON.stringify(r.errors));
  });
  await ok('pipe: follows a bend (two lines) and a closed path makes a ring', async () => {
    let r = await run([[0, 0, 40, 0], [40, 0, 40, 30]], [pipe({ path: { sketch: 30, ents: [31, 32] } })]); assert.deepStrictEqual(r.errors, {});
    close(r.bodies[0].vol, Math.PI * 25 * 70, 5500 * 0.06, 'elbow'); // two straight runs; the mitered corner is close to the sum
    r = await run([{ type: 'circle', c: { x: 0, y: 0 }, r: 20 }], [pipe({ path: { sketch: 30, ents: [31] } })]); assert.deepStrictEqual(r.errors, {});
    close(r.bodies[0].vol, Math.PI * 25 * 2 * Math.PI * 20, 9870 * 0.03, 'ring');
  });
  await ok('pipe: cut mode removes a channel from a body', async () => {
    const r = await run([[-5, 5, 25, 5]], [pipe({ op: 'cut', d: 4 })], true); assert.deepStrictEqual(r.errors, {});
    const b = r.bodies.find(x => x.id === 6) || r.bodies[0]; close(b.vol, 1000 - Math.PI * 4 * 20 / 2, 6, 'half a 4 mm channel is cut out of the 5 mm plate');
  });
  await ok('pattern on path: evenly spaced copies with and without turning', async () => {
    const pat = x => ({ id: 50, type: 'pathpat', name: 'Path Pattern1', bodies: [6], path: { sketch: 30, ents: [31] }, n: 4, mode: 'even', s: 20, follow: false, flip: false, join: false, ...x });
    let r = await run([[0, 0, 60, 0]], [pat({})], true); assert.deepStrictEqual(r.errors, {}); assert.strictEqual(r.bodies.length, 4);
    const xs = r.bodies.map(b => b.bb[0]).sort((a, b) => a - b); [0, 20, 40, 60].forEach((v, i) => close(xs[i], v, 1e-6, 'x of copy ' + i));
    r = await run([[0, 0, 60, 0]], [pat({ mode: 'space', s: 25, n: 3 })], true); assert.strictEqual(r.bodies.length, 3);
    r = await run([[0, 0, 60, 0]], [pat({ n: 99, mode: 'space', s: 25 })], true); assert.strictEqual(r.bodies.length, 3, 'copies stop at the end of the path');
    r = await run([[0, 0, 30, 0], [30, 0, 30, 30]], [pat({ follow: true, n: 3 })], true); assert.deepStrictEqual(r.errors, {}); assert.strictEqual(r.bodies.length, 3);
    const last = r.bodies.find(b => b.id !== 6 && b.bb[0] > 25); assert(last, 'the last copy turned onto the second leg');
    r = await run([[0, 0, 60, 0]], [pat({ join: true, n: 2 })], true); assert(!r.errors[50]); assert.strictEqual(r.bodies.length, 2, 'copies that do not touch stay separate bodies even when joining');
  });
  await ok('slot tool: two centers and a width make a closed slot profile of the right area', async () => {
    const a = await page.evaluate(() => {
      loadDoc({ features: [], next: 10 }, 'x');
      const f = { id: newId(), type: 'sketch', name: 'S', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: [], vis: true };
      insertFeature(f); enterSketch(f); setTool('slot');
      toolClick(P2(0, 0)); toolClick(P2(20, 0)); S.cur = P2(10, 5); toolClick(P2(10, 5));
      const arr = arrOf(S.sk), reg = arr.regions;
      return { n: S.sk.ents.length, types: S.sk.ents.map(e => e.type).sort().join(','), regions: reg.length, area: reg.length ? Math.abs(loopArea(reg[0].outer)) : 0 };
    });
    assert.strictEqual(a.n, 4); assert.strictEqual(a.types, 'arc,arc,line,line'); assert.strictEqual(a.regions, 1);
    close(a.area, 20 * 10 + Math.PI * 25, 0.01, 'slot area');
  });
  await ok('ellipse tool: closed profile, area within 0.1% of π·a·b, every point within 0.3% of the true curve', async () => {
    for (const [a, b, ang] of [[30, 10, 0], [30, 10, 0.7], [20, 15, 2.2], [12, 25, 0]]) {
      const r = await page.evaluate(([a, b, ang]) => {
        loadDoc({ features: [], next: 10 }, 'x');
        const f = { id: newId(), type: 'sketch', name: 'S', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: [], vis: true };
        insertFeature(f); enterSketch(f); setTool('ellipse');
        const c = Math.cos(ang), s = Math.sin(ang);
        toolClick(P2(5, 3)); toolClick(P2(5 + a * c, 3 + a * s)); toolClick(P2(5 - b * s, 3 + b * c));
        const reg = arrOf(S.sk).regions;
        let worst = 0;
        for (const e of S.sk.ents) { if (e.type !== 'arc') continue; for (let i = 0; i <= 20; i++) { const t = e.a0 + (e.a1 - e.a0) * i / 20, x = e.c.x + e.r * Math.cos(t) - 5, y = e.c.y + e.r * Math.sin(t) - 3, u = x * c + y * s, v = -x * s + y * c; worst = Math.max(worst, Math.abs(Math.sqrt(u * u / (a * a) + v * v / (b * b)) - 1)); } }
        return { n: S.sk.ents.length, regions: reg.length, area: reg.length ? Math.abs(loopArea(reg[0].outer)) : 0, worst };
      }, [a, b, ang]);
      assert.strictEqual(r.n, 16, 'arcs'); assert.strictEqual(r.regions, 1, `region for ${a}×${b}`);
      close(r.area / (Math.PI * a * b), 1, 0.001, `area ${a}×${b}`); assert(r.worst < 0.003, `shape error ${r.worst} for ${a}×${b}`);
    }
  });
  await ok('the new tools are in the ribbons, typed dimensions are offered, and a circle comes out when the radii match', async () => {
    await page.evaluate(() => { loadDoc({ features: [], next: 10 }, 'x'); refreshUI(); }); await page.waitForTimeout(300);
    for (const a of ['f:pipe', 'f:pathpat']) assert(await page.evaluate(a => !!document.querySelector(`[data-act="${a}"]`), a), 'no button ' + a);
    await page.evaluate(() => { const f = { id: newId(), type: 'sketch', name: 'S', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: [], vis: true }; insertFeature(f); enterSketch(f); }); await page.waitForTimeout(400);
    for (const a of ['slot', 'ellipse']) assert(await page.evaluate(a => !!document.querySelector(`[data-act="${a}"]`), a), 'no sketch button ' + a);
    const r = await page.evaluate(() => {
      setTool('slot'); toolClick(P2(0, 0)); const s1 = dimSpec(); toolClick(P2(10, 0)); const s2 = dimSpec(); S.pts = [];
      setTool('ellipse'); toolClick(P2(0, 0)); toolClick(P2(10, 0)); toolClick(P2(0, 10));
      return { s1, s2, ents: S.sk.ents.map(e => e.type) };
    });
    assert.deepStrictEqual(r.s1, ['Length', 'Angle°']); assert.deepStrictEqual(r.s2, ['Width']); assert.deepStrictEqual(r.ents, ['circle']);
  });
  await ok('Pipe and Pattern on Path open from the ribbon and make features', async () => {
    await run([[0, 0, 40, 0]], []);
    await page.evaluate(() => { action('f:pipe'); }); await page.waitForTimeout(200);
    assert(await page.evaluate(() => CMD && CMD.type === 'feat' && CMD.kind === 'pipe'));
    await page.evaluate(() => { CMD.f.path = { sketch: 30, ents: [31] }; featSync(); featOK(); }); await page.waitForTimeout(500);
    const f = await page.evaluate(() => { const f = doc.features.find(f => f.type === 'pipe'); return f && { err: MODEL.errors[f.id] || null, bodies: MODEL.bodies.length, name: bodyNames()[f.id] }; });
    assert(f && !f.err && f.bodies === 1 && /Body/.test(f.name), JSON.stringify(f));
  });
  await ok('no page errors', async () => { assert.deepStrictEqual(errs, []); });
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
