// Manufacture: Mastercam chaining picks with real mouse input: Window, Area, Partial, Single, Chain, Last and Undo.
// Manufacture: Mastercam chaining picks with real mouse input: Window, Area, Partial, Single, Chain, Last and Undo.
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
  await page.waitForTimeout(800);
  const n = () => page.evaluate(() => opById(CAMUI.op).chains.length);
  const setMode = async m => { await page.evaluate(m => { CHAINUI.mode = m; CHAINUI.hoverKey = ''; CHAINX.partial = null; camRefresh(); }, m); await page.waitForTimeout(200); };
  const clear = () => page.evaluate(() => { const op = opById(CAMUI.op); op.chains = []; camRefresh(); });
  const box = () => page.evaluate(() => { const r = ov.getBoundingClientRect(); return { x: r.left, y: r.top }; });
  // screen points (page coordinates) of things in the model
  const pts = () => page.evaluate(() => {
    const r = ov.getBoundingClientRect(), m = bodyMesh(visibleBodies()[0]), P = p => { const s = toScreen(p); return { x: s.x + r.left, y: s.y + r.top }; };
    const top = Math.max(...edgeChains(m).map(c => c.pts[0][1])), flat = edgeChains(m).filter(c => chainFlat(c) && Math.abs(c.pts[0][1] - top) < 1e-3);
    const all = visibleBodies().flatMap(b => bodyMesh(b).VP.map(P));
    return { flat: flat.map(c => ({ mid: P(c.mid), closed: c.closed })), min: { x: Math.min(...all.map(p => p.x)) - 10, y: Math.min(...all.map(p => p.y)) - 10 }, max: { x: Math.max(...all.map(p => p.x)) + 10, y: Math.max(...all.map(p => p.y)) + 10 } };
  });
  await ok('Window: dragging a rectangle chains the geometry inside it', async () => {
    await clear(); await setMode('window'); const p = await pts();
    await page.mouse.move(p.min.x, p.min.y); await page.mouse.down(); await page.mouse.move((p.min.x + p.max.x) / 2, (p.min.y + p.max.y) / 2, { steps: 5 }); await page.mouse.move(p.max.x, p.max.y, { steps: 5 }); await page.mouse.up();
    await page.waitForTimeout(500);
    const k = await n(); assert(k >= 1, 'chains: ' + k);
    const orbited = await page.evaluate(() => CHAINX.WIN === null); assert(orbited);
  });
  await ok('Window: a small window picks only what is inside it', async () => {
    await clear(); await setMode('window'); const p = await pts(), e = p.flat[0].mid;
    await page.mouse.move(e.x - 4, e.y - 4); await page.mouse.down(); await page.mouse.move(e.x + 4, e.y + 4, { steps: 3 }); await page.mouse.up(); await page.waitForTimeout(300);
    assert.strictEqual(await n(), 0);
  });
  await ok('Chain: clicking an edge takes its whole run; Backspace removes the last chain', async () => {
    await clear(); await setMode('chain'); const p = await pts(), e = p.flat[0].mid;
    await page.mouse.click(e.x, e.y); await page.waitForTimeout(400);
    assert.strictEqual(await n(), 1);
    await page.keyboard.press('Backspace'); await page.waitForTimeout(300);
    assert.strictEqual(await n(), 0);
  });
  await ok('Single: clicking an edge takes just that edge', async () => {
    await clear(); await setMode('single'); const p = await pts(), e = p.flat[0].mid;
    await page.mouse.click(e.x, e.y); await page.waitForTimeout(400);
    assert.strictEqual(await n(), 1);
  });
  await ok('Area: clicking a face chains its outline', async () => {
    await clear(); await setMode('area');
    const c = await page.evaluate(() => { const r = ov.getBoundingClientRect(), m = bodyMesh(visibleBodies()[0]); let best = null; for (const t of m.triF.keys()) { } const P = Surf.list; for (let f = 0; f < P.length; f++) { const s = P[f]; if (s && s.t === 'P' && s.n[1] > 0.999) { const vs = faceVerts(m, f); if (vs.length && (!best || vs.length > best.n)) best = { f, n: vs.length, vs }; } } const cx = best.vs.reduce((a, v) => a + v[0], 0) / best.n, cy = best.vs.reduce((a, v) => a + v[1], 0) / best.n, cz = best.vs.reduce((a, v) => a + v[2], 0) / best.n, s = toScreen([cx, cy, cz]); return { x: s.x + r.left, y: s.y + r.top }; });
    await page.mouse.click(c.x, c.y); await page.waitForTimeout(500);
    assert((await n()) >= 1, 'area chains ' + await n());
  });
  await ok('Partial: first edge then last edge chains the run between them', async () => {
    await clear(); await setMode('partial'); const p = await pts();
    const closed = p.flat.filter(c => !c.closed);
    assert(p.flat.length >= 2);
    await page.mouse.click(p.flat[0].mid.x, p.flat[0].mid.y); await page.waitForTimeout(300);
    assert(await page.evaluate(() => !!CHAINX.partial), 'first edge not taken');
    const second = p.flat[1].mid;
    await page.mouse.move(second.x, second.y); await page.mouse.click(second.x, second.y); await page.waitForTimeout(500);
    assert(await page.evaluate(() => CHAINX.partial === null), 'partial not finished');
  });
  await ok('Last: copies the chains of the previous chain toolpath', async () => {
    const r = await page.evaluate(() => {
      const a = opById(CAMUI.op); a.chains = [{ id: 1, rev: false, start: 0, z: 0, closed: true, pts: [[0, 0], [10, 0], [10, 10]], eks: ['q1'] }];
      camAddOp('chain'); const b = opById(CAMUI.op); b.chains = []; CHAINX.useLast(b); return { b: b.chains.length, same: b !== a };
    });
    assert(r.same && r.b === 1, JSON.stringify(r));
  });
  await ok('the mode grid is in the panel', async () => {
    const t = await page.evaluate(() => [...document.querySelectorAll('#panel [data-chmode]')].map(b => b.textContent.trim()).join(','));
    assert(t.includes('Window') && t.includes('Area') && t.includes('Partial'), t);
  });
  await ok('no page errors', async () => assert.deepStrictEqual(errs, []));
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
