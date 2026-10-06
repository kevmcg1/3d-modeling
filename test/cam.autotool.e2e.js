// Manufacture → automatic tool for internal contours: the largest library tool that fits, the reason, one-click override.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/cam.autotool.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules'); process.exit(0); }
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
  const sq = (x0, y0, x1, y1, r) => `[${x0},${y0},${x1},${y1},${r}]`;
  await ok('core: a 40 mm square pocket with 7 mm corners takes the 12.7 end mill; sharp corners too', async () => {
    const r = await page.evaluate(() => {
      const rr = (w, h, rad) => { const p = [], n = 16, c = [[w / 2 - rad, h / 2 - rad], [-w / 2 + rad, h / 2 - rad], [-w / 2 + rad, -h / 2 + rad], [w / 2 - rad, -h / 2 + rad]];
        c.forEach(([cx, cy], k) => { for (let i = 0; i <= n; i++) { const a = (k * 90 + 90 * i / n) * Math.PI / 180 - 0; p.push({ X: Math.round((cx + rad * Math.cos(a)) * CS), Y: Math.round((cy + rad * Math.sin(a)) * CS) }); } }); return p; };
      const pk = a => { const o = camPickTool({ air: [a], depth: 5, kind: 'wall' }); return o && { d: o.tool.d, type: o.tool.type, ok: o.ok, reason: o.reason }; };
      return { r3: pk(rr(40, 40, 3)), r7: pk(rr(40, 40, 7)), slot: pk(rr(40, 8, 3.9)), deep: camPickTool({ air: [rr(40, 40, 7)], depth: 100, kind: 'wall' }).ok };
    });
    assert.strictEqual(r.r3.d, 3.175, JSON.stringify(r)); assert(/inside radius/.test(r.r3.reason), r.r3.reason);
    assert.strictEqual(r.r7.d, 12.7, JSON.stringify(r.r7)); assert.strictEqual(r.slot.d, 6.35, JSON.stringify(r.slot));
    assert.strictEqual(r.deep, false);
  });
  await ok('3D kind prefers bull nose over ball nose of the same size', async () => {
    const r = await page.evaluate(() => { const o = camPickTool({ air: [[{ X: 0, Y: 0 }, { X: 40000, Y: 0 }, { X: 40000, Y: 40000 }, { X: 0, Y: 40000 }]], depth: 5, kind: 'surface' }); return { type: o.tool.type, d: o.tool.d, reason: o.reason }; });
    assert.strictEqual(r.type, 'bull'); assert.strictEqual(r.d, 12.7);
  });
  await ok('contour on a picked recess face gets the auto tool, with a sidebar card', async () => {
    await page.evaluate(() => { setWorkspace('cam'); camAddOp('contour'); });
    await page.waitForTimeout(800);
    // pick the lowest horizontal face as a recess floor through the real click path
    const res = await page.evaluate(() => {
      const op = opById(CAMUI.op); const hs = horizFaces().sort((a, b) => a.z - b.z);
      for (const f of hs) {
        const h = { mesh: f.mesh, fid: f.fid }; op.faces = []; op.autoTool = null; op.toolMan = false; op.tool = cam().tools[0].n;
        camToggleFace(op, h);
        if (op.autoTool) return { n: op.tool, z: f.z, reason: op.autoTool.reason, html: camPanel().includes('class="autotool'), alts: op.autoTool.alts };
      }
      return null;
    });
    assert(res, 'no recess face found'); assert(/Ø|"/.test(res.reason), res.reason); assert(res.html, 'no sidebar card');
  });
  await ok('override with one click keeps the user\'s tool; Auto pick restores', async () => {
    const r = await page.evaluate(() => {
      const op = opById(CAMUI.op), auto = op.tool, alt = op.autoTool.alts[0] || cam().tools.find(t => t.n !== auto && t.type === 'flat').n;
      camSetToolManual(op, alt); const manual = { tool: op.tool, man: op.toolMan, label: camPanel().includes('Your pick') };
      camEdit(op, 'through', 1); const kept = op.tool;
      camToolAuto(op); return { auto, alt, manual, kept, back: op.tool, man2: !!op.toolMan };
    });
    assert.strictEqual(r.manual.tool, r.alt); assert(r.manual.man && r.manual.label); assert.strictEqual(r.kept, r.alt);
    assert.strictEqual(r.back, r.auto); assert.strictEqual(r.man2, false);
  });
  await ok('an outside contour keeps the default tool', async () => {
    const r = await page.evaluate(() => { camAddOp('contour'); const op = opById(CAMUI.op); return { tool: op.tool, auto: !!op.autoTool, def: cam().tools.find(t => t.type === 'flat').n }; });
    assert(!r.auto); assert.strictEqual(r.tool, r.def);
  });
  await ok('3D parallel / waterline pick a ball or bull nose for the recesses', async () => {
    const r = await page.evaluate(() => { camAddOp('waterline'); const w = opById(CAMUI.op); camAddOp('parallel'); const p = opById(CAMUI.op); return { w: w.autoTool && toolOf(w.tool).type, p: p.autoTool && toolOf(p.tool).type }; });
    assert(r.w === 'bull' || r.w === 'ball', JSON.stringify(r)); assert(r.p === 'bull' || r.p === 'ball', JSON.stringify(r));
  });
  await ok('no page errors', async () => { assert.deepStrictEqual(errs, []); });
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
