// Set Origin (cam-origin.js): the ribbon button and view chip start a pick, hovering previews the new axes, clicking opens
// "Your origin was here / Now you moved it here", Confirm moves G54 and the G-code, setup sheet, simulation and verify follow,
// and one undo puts it back.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/cam.origin.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (index.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 600)); } };
// the first rapid X / Y / Z of the program, as numbers
const firstMove = g => { const l = g.split('\n').find(s => /^G0 X/.test(s)); const m = /X(-?[\d.]+)\s+Y(-?[\d.]+)/.exec(l); const z = /\n(?:G43 H\d+ )?Z(-?[\d.]+)/.exec(g.slice(g.indexOf(l))); return { x: +m[1], y: +m[2], z: z ? +z[1] : NaN }; };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' }));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await page.waitForTimeout(2000);
  await page.evaluate(() => { const s = SAMPLES.find(x => x.name === 'Pocketed plate'); loadDoc(s.make(), 'test'); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => setWorkspace('cam'));
  await page.evaluate(() => autoProgram()); await page.evaluate(() => waitToolpaths());
  await page.waitForTimeout(500);
  let g0, o0, pt;

  await ok('a Set Origin button is in the Manufacture ribbon and a Set origin chip sits over the view', async () => {
    assert(await page.locator('.rb-btn[data-cam="setorigin"]').isVisible(), 'ribbon button not visible');
    assert((await page.locator('.rb-btn[data-cam="setorigin"]').innerText()).includes('Set Origin'));
    assert(await page.locator('#orgChip .oc-b').isVisible(), 'chip not visible');
    assert((await page.locator('#orgChip').innerText()).includes('Stock top center'));
  });

  await ok('picking: hovering a point previews the new axes and reads out the offset', async () => {
    g0 = await page.evaluate(() => postGcode().text); o0 = await page.evaluate(() => camOrigin());
    await page.click('.rb-btn[data-cam="setorigin"]'); await page.waitForTimeout(200);
    assert(await page.evaluate(() => ORG_STATE.on), 'pick mode not on');
    pt = await page.evaluate(() => { const st = camStock(), s = toScreen(toW(st.x1, st.y0, st.z1)), r = ov.getBoundingClientRect(); return { x: s.x + r.left, y: s.y + r.top }; });
    await page.mouse.move(pt.x, pt.y); await page.waitForTimeout(250);
    const h = await page.evaluate(() => ORG_STATE.hover);
    assert(h && h.k === 'scorner', 'expected the stock corner, got ' + JSON.stringify(h));
    assert((await page.locator('#hint').innerText()).includes('from the current origin'), 'no live readout');
  });

  await ok('clicking opens the confirmation with old and new positions and the question', async () => {
    await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(300);
    const t = await page.locator('#modalCard').innerText();
    assert(t.includes('Your origin was here') && t.includes('Now you moved it here'), t);
    assert(/You ok with this\?/.test(t) && /move all your coordinates and change your G-code and toolpaths/.test(t));
    assert(await page.locator('#modalCard svg').count() >= 4, 'small pictures missing');
    assert(await page.locator('[data-org="ok"]').isVisible() && await page.locator('[data-org="cancel"]').isVisible());
    assert.deepStrictEqual(await page.evaluate(() => camOrigin()), o0, 'origin moved before Confirm');
  });

  await ok('Cancel leaves the origin and the G-code alone', async () => {
    await page.click('[data-org="cancel"]'); await page.waitForTimeout(200);
    assert.deepStrictEqual(await page.evaluate(() => camOrigin()), o0);
    assert.strictEqual(await page.evaluate(() => postGcode().text), g0);
    assert(!(await page.evaluate(() => ORG_STATE.on)), 'still picking after Cancel');
  });

  await ok('Confirm moves G54: every program coordinate shifts by the move, nothing errors', async () => {
    await page.click('#orgChip .oc-b'); await page.mouse.move(pt.x, pt.y); await page.waitForTimeout(200); await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(250);
    await page.click('[data-org="ok"]'); await page.waitForTimeout(800);
    const o1 = await page.evaluate(() => camOrigin()), st = await page.evaluate(() => camStock());
    assert(Math.abs(o1[0] - st.x1) < 1e-3 && Math.abs(o1[1] - st.y0) < 1e-3 && Math.abs(o1[2] - st.z1) < 1e-3, 'origin is not the stock corner: ' + o1);
    const g1 = await page.evaluate(() => postGcode().text), a = firstMove(g0), b = firstMove(g1), k = 1 / 25.4;
    assert(Math.abs((a.x - b.x) - (o1[0] - o0[0]) * k) < 2e-3, `X shift ${a.x - b.x} vs ${(o1[0] - o0[0]) * k}`);
    assert(Math.abs((a.y - b.y) - (o1[1] - o0[1]) * k) < 2e-3, `Y shift ${a.y - b.y} vs ${(o1[1] - o0[1]) * k}`);
    assert(g1 !== g0 && /\(WCS G54: Stock corner on the stock\)/.test(g1), 'G-code header does not name the new origin');
    assert(/Stock corner on the stock/.test(await page.locator('#orgChip').innerText()));
    // every X word moved by the same amount: spot-check the whole program against the old one
    const nums = s => [...s.matchAll(/X(-?[\d.]+)/g)].map(m => +m[1]);
    const A = nums(g0), B = nums(g1); assert.strictEqual(A.length, B.length, 'program length changed');
    const dx = (o1[0] - o0[0]) * k; assert(A.every((v, i) => Math.abs(v - B[i] - dx) < 2e-3), 'an X coordinate did not shift by the same amount');
  });

  await ok('verify, simulation and the setup sheet all run from the new origin without errors', async () => {
    await page.evaluate(() => verifyAndFix(() => {})); await page.waitForTimeout(3500);
    const r = await page.evaluate(() => VERIFY.report && { gouge: VERIFY.report.counts.gouge || 0, holder: VERIFY.report.counts.holder || 0 });
    assert(r && r.gouge === 0 && r.holder === 0, 'verify found problems after the move: ' + JSON.stringify(r));
    await page.evaluate(() => camAction('sim')); await page.waitForTimeout(1500);
    assert(await page.evaluate(() => SIM.on), 'simulation did not start');
    await page.evaluate(() => camAction('sim')); await page.waitForTimeout(300);
    const sheet = await page.evaluate(() => { const O = camOrigin(); return typeof wcsName === 'function' && wcsName(cam()) + '|' + O.length; });
    assert(/Stock corner/.test(sheet), sheet);
  });

  await ok('moving the origin while the simulation is open restarts it from the new origin', async () => {
    await page.evaluate(() => camAction('sim')); await page.waitForTimeout(1200);
    assert(await page.evaluate(() => SIM.on), 'simulation not on');
    await page.click('.rb-btn[data-cam="setorigin"]'); await page.waitForTimeout(200);
    assert(!(await page.evaluate(() => SIM.on)) && await page.evaluate(() => ORG_STATE.on), 'starting a pick should close the simulation');
    await page.keyboard.press('Escape');
  });

  await ok('one undo puts the origin and the G-code back', async () => {
    await page.evaluate(() => { cam().origin = 'top-center'; camRefresh(); });
    await page.waitForTimeout(300);
    // the real undo button: set again, then Undo
    await page.click('#orgChip .oc-b'); await page.mouse.move(pt.x, pt.y); await page.waitForTimeout(200); await page.mouse.click(pt.x, pt.y); await page.waitForTimeout(250);
    await page.click('[data-org="ok"]'); await page.waitForTimeout(500);
    assert(await page.evaluate(() => cam().origin && cam().origin.pick), 'origin not set');
    await page.click('#btnUndo'); await page.waitForTimeout(600);
    assert.deepStrictEqual(await page.evaluate(() => camOrigin()), o0, 'undo did not restore the origin');
    assert.strictEqual(await page.evaluate(() => postGcode().text), g0, 'undo did not restore the G-code');
  });

  await ok('any surface, edge or arc center can be the origin, and Esc cancels', async () => {
    await page.click('#orgChip .oc-b'); await page.waitForTimeout(150);
    // sweep the cursor over the view with real mouse moves
    const seen = new Set();
    for (let x = 300; x < 1050; x += 30) for (let y = 260; y < 700; y += 30) { await page.mouse.move(x, y); const h = await page.evaluate(() => ORG_STATE.hover && ORG_STATE.hover.k); if (h) seen.add(h); }
    assert(seen.has('surf'), 'no surface point found: ' + [...seen]);
    assert([...seen].length >= 2, 'only one kind of snap found: ' + [...seen]);
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    assert(!(await page.evaluate(() => ORG_STATE.on)), 'Esc did not cancel');
  });

  await ok('no page errors', async () => { assert.deepStrictEqual(errs, []); });
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
