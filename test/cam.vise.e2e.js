// Vise and parallels (cam-vise.js): they are drawn lit and visible in Manufacture and the simulation, sized to the stock,
// placed square to it (jaws on the stock sides, parallels under it), optional from Setup, and Verify still checks the cutter
// against them.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/cam.vise.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (index.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 600)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' }));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await page.waitForTimeout(2000);
  const load = async name => {
    await page.evaluate(n => { const s = SAMPLES.find(x => x.name === n); loadDoc(s.make(), 'test'); }, name); await page.waitForTimeout(1200);
    await page.evaluate(() => setWorkspace('cam')); await page.evaluate(() => autoProgram()); await page.evaluate(() => waitToolpaths()); await page.waitForTimeout(400);
  };
  // the model's boxes against the stock: jaws on its sides, parallels under it, everything inside the jaw width
  const check = () => page.evaluate(() => {
    const M = viseModel(), st = camStock(); if (!M) return { none: true };
    const X = M.across === 'x', A0 = X ? st.x0 : st.y0, A1 = X ? st.x1 : st.y1, L0 = X ? st.y0 : st.x0, L1 = X ? st.y1 : st.x1;
    const jaws = M.boxes.filter(b => b.kind === 'jaw'), bars = M.boxes.filter(b => b.kind === 'parallel'), base = M.boxes.find(b => b.kind === 'base');
    const ax = (b, i) => (X ? [b.x0, b.x1] : [b.y0, b.y1])[i], ln = (b, i) => (X ? [b.y0, b.y1] : [b.x0, b.x1])[i];
    const f = jaws.find(j => /fixed/.test(j.name)), m = jaws.find(j => /moving/.test(j.name));
    return {
      size: M.size, across: M.across, tooWide: M.tooWide, nPar: bars.length,
      fixedOnStock: Math.abs(ax(f, 1) - A0) < 1e-6, movingOnStock: Math.abs(ax(m, 0) - A1) < 1e-6,
      jawsCoverStock: ln(f, 0) <= L0 + 1e-6 || (ln(f, 1) - ln(f, 0)) >= Math.min(L1 - L0, 1) , // jaw width follows the stock
      barsUnderStock: bars.every(b => Math.abs(b.z1 - st.z0) < 1e-6 && b.z0 < st.z0 && ax(b, 0) >= A0 - 1e-6 && ax(b, 1) <= A1 + 1e-6),
      jawsReachStock: jaws.every(j => j.z1 > st.z0 && j.z1 < st.z1),
      baseUnder: base.z1 <= Math.min(...jaws.map(j => j.z0)) + 1e-6,
      opening: (M.spec.open), acrossW: A1 - A0,
      objects: viseObjects().length,
    };
  });

  const samples = ['Pocketed plate', 'Motor mount plate', 'Pillow block', 'Spacer ring', 'Gear blank', 'Hex nut tray'];
  for (const name of samples) {
    await ok(`${name}: vise and parallels are placed square to the stock and drawn`, async () => {
      await load(name);
      const c = await check();
      assert(!c.none, 'no vise model');
      assert(c.fixedOnStock && c.movingOnStock, 'jaws are not on the stock sides ' + JSON.stringify(c));
      assert(c.barsUnderStock, 'parallels are not under the stock ' + JSON.stringify(c));
      assert(c.jawsReachStock && c.baseUnder, 'jaw height or base is wrong ' + JSON.stringify(c));
      assert(!c.tooWide && c.acrossW <= c.opening, 'stock is wider than the vise opens ' + JSON.stringify(c));
      assert(c.objects >= 9, 'too few things drawn: ' + c.objects);
    });
  }

  await ok('the vise is lit steel, not unlit black boxes, and is visible in the simulation', async () => {
    await load('Pocketed plate');
    const r = await page.evaluate(() => { const o = viseObjects(); const m = o[0].material; return { env: !!m.envMap, color: m.color.getHex(), n: o.length, lines: o[0].children.some(c => c.isLineSegments) }; });
    assert(r.env && r.lines && r.color > 0x303030, JSON.stringify(r));
    await page.evaluate(() => camAction('sim')); await page.waitForTimeout(1500);
    assert(await page.evaluate(() => camGroup.children.some(o => o.userData.vise)), 'vise is not in the simulation scene');
    await page.evaluate(() => camAction('sim'));
  });

  await ok('size follows the stock: a wide stock gets a bigger vise, a small one a small vise', async () => {
    await load('Pocketed plate');
    await page.evaluate(() => { cam().stock.side = 60; camRefresh(); });
    let c = await check(); assert(c.size === '8' || c.size === '6', 'wide stock got ' + c.size); assert(!c.tooWide && c.acrossW <= c.opening, JSON.stringify(c));
    await page.evaluate(() => { cam().stock.side = 0.25; camRefresh(); });
    await load('Spacer ring'); c = await check(); assert(['4', '6'].includes(c.size), 'small part got ' + c.size);
  });

  await ok('Setup has the Workholding card: size, parallels, on / off, all undoable', async () => {
    await load('Pocketed plate');
    await page.evaluate(() => { CAMUI.view = 'setup'; camRefresh(); }); await page.waitForTimeout(300);
    assert(await page.locator('[data-vs="size:8"]').count() === 1, 'size buttons missing');
    await page.click('[data-vs="size:8"]'); await page.waitForTimeout(400);
    assert.strictEqual((await check()).size, '8');
    await page.click('[data-vs="parN:1"]'); await page.waitForTimeout(400);
    assert.strictEqual((await check()).nPar, 1);
    await page.click('[data-vs="parH:25.40"]'); await page.waitForTimeout(400);
    assert(await page.evaluate(() => Math.abs(viseModel().boxes.find(b => b.kind === 'parallel').z0 - (camStock().z0 - 25.4)) < 1e-6), 'parallel height did not change');
    await page.click('[data-vs="on:0"]'); await page.waitForTimeout(400);
    assert.strictEqual(await page.evaluate(() => viseModel()), null);
    assert.strictEqual(await page.evaluate(() => viseObjects().length), 0);
    for (let i = 0; i < 4; i++) { await page.click('#btnUndo'); await page.waitForTimeout(250); }
    assert.strictEqual(await page.evaluate(() => JSON.stringify(cam().vise || null)), 'null', 'undo did not restore the vise settings');
  });

  await ok('Show has a Vise & parallels toggle', async () => {
    await load('Pocketed plate');
    assert(await page.locator('#visGroup [data-vis="vise"]').count() === 1);
    await page.click('#visGroup [data-vis="vise"]'); await page.waitForTimeout(300);
    assert(!(await page.evaluate(() => camGroup.children.some(o => o.userData.vise))), 'still drawn after switching off');
    await page.click('#visGroup [data-vis="vise"]'); await page.waitForTimeout(300);
    assert(await page.evaluate(() => camGroup.children.some(o => o.userData.vise)), 'not drawn after switching on');
  });

  await ok('collision checks use the same jaws and parallels', async () => {
    await load('Pocketed plate');
    const r = await page.evaluate(() => {
      const M = viseModel(), tool = { ...toolOf(cam().ops.find(o => !o.sup).tool), d: 6 }, ti = { loc: 20, stick: 40, rs: 5, hs: { nutH: 10, rNut: 20 } };
      const jaw = M.boxes.find(b => b.kind === 'jaw'), bar = M.boxes.find(b => b.kind === 'parallel');
      const hitJaw = fixtureHit(M.boxes, (jaw.x0 + jaw.x1) / 2, (jaw.y0 + jaw.y1) / 2, jaw.z1 - 2, tool, ti);
      const hitBar = fixtureHit(M.boxes, (bar.x0 + bar.x1) / 2, (bar.y0 + bar.y1) / 2, bar.z1 - 2, tool, ti);
      const clear = fixtureHit(M.boxes, 0, 0, camStock().z1 + 30, tool, ti);
      return { hitJaw: hitJaw && hitJaw.kind, hitBar: hitBar && hitBar.kind, clear };
    });
    assert.strictEqual(r.hitJaw, 'jaw'); assert.strictEqual(r.hitBar, 'parallel'); assert.strictEqual(r.clear, null);
  });

  await ok('a shop-library vise and parallels in the model are equipment: the stock box does not wrap around them', async () => {
    await load('Pocketed plate');
    const before = await page.evaluate(() => JSON.stringify([camPart(), camStock()]));
    await page.evaluate(() => {
      const d = JSON.parse(snap()), id = Math.max(...d.features.map(f => f.id)) + 1;
      for (const [i, kd] of ['vise', 'parallels'].entries()) d.features.push({ id: id + i, type: 'shop', name: kd, ...FEATS.shop.init(), kind: kd, cx: 250, cy: 120 * i });
      loadDoc(d, 'test'); setWorkspace('cam');
    });
    await page.waitForTimeout(2500);
    assert(await page.evaluate(() => MODEL.bodies.length) > 3, 'vise bodies missing from the model');
    assert.strictEqual(await page.evaluate(() => JSON.stringify([camPart(), camStock()])), before, 'part or stock box changed when the vise was added');
    await page.evaluate(() => autoProgram()); await page.evaluate(() => waitToolpaths());
    assert.strictEqual(await page.evaluate(() => JSON.stringify(camPart())), JSON.stringify(JSON.parse(before)[0]), 'part changed after programming');
  });

  await ok('no page errors', async () => { assert.deepStrictEqual(errs, []); });
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
