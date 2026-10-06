// Manufacture: the feeds-and-speeds heat map on the simulated toolpath.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/cam.heatmap.e2e.js
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
  await page.evaluate(() => { setWorkspace('cam'); });
  await page.evaluate(() => autoProgram()); await page.evaluate(() => waitToolpaths());
  await page.evaluate(() => { camAction('sim'); });
  await page.waitForTimeout(2500);

  await ok('heat map is on in the simulation, with its sidebar steps and bar button', async () => {
    const r = await page.evaluate(() => ({ on: HEAT.on, obj: !!HEAT.obj, n: HEAT.segs && HEAT.segs.length, inScene: camGroup.children.includes(HEAT.obj), panel: !!document.getElementById('heatMetric'), btn: !!document.getElementById('sbHeat'), steps: document.querySelectorAll('.heat-step').length }));
    assert(r.on && r.obj && r.n > 20 && r.inScene && r.panel && r.btn && r.steps === 3, JSON.stringify(r));
  });
  await ok('every metric builds a gradient range and colors the path', async () => {
    const out = await page.evaluate(() => ['load', 'mrr', 'chip', 'feed', 'rpm'].map(k => { HEAT.metric = k; camDraw(); return [k, HEAT.range.lo, HEAT.range.hi, HEAT.obj.children[0].geometry.attributes.color.count]; }));
    for (const [k, lo, hi, n] of out) assert(Number.isFinite(lo) && Number.isFinite(hi) && hi >= lo && n > 40, k + ' ' + JSON.stringify([lo, hi, n]));
  });
  await ok('changing a tool speed updates the map live; an over-limit spindle speed turns moves red', async () => {
    const r = await page.evaluate(() => {
      HEAT.metric = 'rpm'; camDraw(); const before = HEAT.range.hi, over0 = HEAT.over, ts = cam().tools;
      const was = ts.map(t => t.rpm); ts.forEach(t => t.rpm *= 5); camDraw();
      const r = { before, after: HEAT.range.hi, over0, over1: HEAT.over };
      ts.forEach((t, i) => t.rpm = was[i]); camDraw(); return r;
    });
    assert(Math.abs(r.after / r.before - 5) < 0.01 && r.over0 === 0 && r.over1 > 0, JSON.stringify(r));
  });
  await ok('toggle off restores the plain toolpath; hover shows a readout', async () => {
    await page.evaluate(() => { setWorkspace('cam'); HEAT.metric = 'load'; camDraw(); });
    const box = await page.evaluate(() => { const r = glCanvas.getBoundingClientRect(), m = HEAT.mid, v = new THREE.Vector3(m[0], m[1], m[2]).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix); return { x: r.left + (v.x * .5 + .5) * r.width, y: r.top + (-v.y * .5 + .5) * r.height }; });
    await page.mouse.move(box.x - 60, box.y - 60); await page.mouse.move(box.x, box.y); await page.waitForTimeout(400);
    const shown = await page.evaluate(() => document.querySelector('.heat-tip').classList.contains('in') && document.querySelector('.heat-tip').textContent);
    assert(shown && /Chip load/.test(shown), String(shown));
    await page.evaluate(() => { document.getElementById('sbHeat').click(); });
    const off = await page.evaluate(() => ({ on: HEAT.on, inScene: camGroup.children.includes(HEAT.obj), tip: document.querySelector('.heat-tip').classList.contains('in') }));
    assert(!off.on && !off.inScene && !off.tip, JSON.stringify(off));
  });
  await ok('no page errors', async () => assert(!errs.length, errs.join(' | ')));
  await page.screenshot({ path: process.env.HEAT_SHOT || '/tmp/heat.png' });
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
