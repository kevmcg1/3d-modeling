// The sharpness check (blur-check.js): how blurry the 3D view, text, geometry edges and labels are, in the dev panel and in Export status.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/blur.check.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (3d-modeler.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 1500)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [];
  const open = async (scale = 1) => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 850 }, deviceScaleFactor: scale, acceptDownloads: true }), page = await ctx.newPage();
    page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.dismiss());
    await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' })); await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' })); await page.route(/gate\.js/, r => r.abort()); await page.route(/fonts\.g/, r => r.abort());
    await page.goto('file://' + path.resolve(__dirname, '..', '3d-modeler.html') + '?dev=1'); await page.waitForTimeout(2500);
    await page.evaluate(() => { window.DATUM_PREMIUM = true; window.DATUM_AUTO = true; window.DATUM_NOFX = true; loadDoc(SAMPLES.find(s => s.name === 'Pocketed plate').make(), 't'); }); await page.waitForTimeout(1200);
    return page;
  };
  const page = await open();

  await ok('edge width: a crisp step reads as 1 pixel, a blurred one as several', async () => {
    const [crisp, soft] = await page.evaluate(() => {
      const w = 60, h = 40, mk = blur => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let k = -blur; k <= blur; k++) v += (x + k >= 30 ? 255 : 0); v /= (2 * blur + 1); const p = (y * w + x) * 4; d[p] = d[p + 1] = d[p + 2] = v; d[p + 3] = 255; } return d; };
      const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
      return [med(window.__blur.edgeWidths(mk(0), w, h)), med(window.__blur.edgeWidths(mk(3), w, h))];
    });
    assert(crisp <= 1.05, 'crisp ' + crisp); assert(soft >= 2.5, 'soft ' + soft);
  });

  await ok('sharp by default: canvases are 1:1, anti-aliasing is on, the 3D view edges are crisp', async () => {
    const q = await page.evaluate(() => { const q = __blur.quick(); return { c: q.canvases.map(c => [c.name, c.scale.word]), r: q.render, grade: __blur.gradeOf(q.issues), issues: q.issues.filter(i => i.sev !== 'info').map(i => i.msg) }; });
    for (const n of ['canvas#gl', 'canvas#ov']) assert(q.c.some(([name, w]) => name === n && /sharp, 1:1/.test(w)), JSON.stringify(q.c));
    assert.strictEqual(q.r.antialias, true); assert(q.r.samples > 0, 'samples ' + q.r.samples);
    assert.deepStrictEqual(q.issues, [], 'no soft or blurry findings: ' + q.issues.join('; '));
    const res = await page.evaluate(() => __blur.measure().then(r => ({ grade: r.grade, view: r.edge.view, overlay: r.edge.overlay })));
    assert(res.view && res.view.n > 20, 'edges measured in the 3D view: ' + JSON.stringify(res.view)); assert(res.view.devicePx <= 2.4, 'median edge spread ' + res.view.devicePx);
    assert.strictEqual(res.grade, 'Sharp', JSON.stringify(res));
  });

  await ok('text: size on screen, small, between pixels and on a stretched canvas are counted', async () => {
    const res = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 100; c.height = 50; c.style.cssText = 'position:fixed;left:3px;top:3px;width:200px;height:100px;z-index:5'; document.body.appendChild(c);
      const x = c.getContext('2d'), f0 = window.frame;
      window.frame = function () { const o = f0.apply(this, arguments); x.font = '600 4px Inter, sans-serif'; x.fillText('Tiny', 10.4, 20.4); x.fillText('Two', 30, 30); x.font = '600 14px Inter, sans-serif'; x.fillText('Big', 10, 45); return o; };
      return __blur.measure().then(r => { window.frame = f0; c.remove(); return { t: r.text, issues: r.issues.map(i => i.area + ': ' + i.msg), canv: r.canvases.map(c => [c.name, c.scale.word]) }; });
    });
    assert(res.t.n >= 3 && res.t.small >= 2 && res.t.between >= 1 && res.t.stretched >= 3, JSON.stringify(res.t));
    assert(res.t.min <= 8.1 && res.t.min >= 7.9, 'smallest text is 4 px stretched ×2 = 8 screen px, got ' + res.t.min + '; ' + JSON.stringify(res.canv));
    assert(res.issues.some(m => /text: .*on a stretched canvas/.test(m)), res.issues.join('\n'));
  });

  await ok('lowered render scale: the 3D view is called blurry, with the canvas stretched and the edges spread out', async () => {
    await page.evaluate(() => { PERF.dpr = 0.5; resize(); }); await page.waitForTimeout(600);
    const res = await page.evaluate(() => __blur.measure().then(r => ({ grade: r.grade, view: r.edge.view, issues: r.issues.map(i => i.area + ': ' + i.msg), gl: r.canvases.find(c => c.name === 'canvas#gl').scale.word })));
    assert(/stretched ×2/.test(res.gl), res.gl); assert.strictEqual(res.grade, 'Blurry', JSON.stringify(res));
    assert(res.issues.some(m => /render scale: the 3D view renders at pixel ratio 0\.5 instead of 1/.test(m)) && res.issues.some(m => /canvas: canvas#gl is stretched ×2/.test(m)), res.issues.join('\n'));
    assert(res.view.devicePx > 2.4, 'edges are wider on screen: ' + res.view.devicePx);
    // the tracker noticed
    const steps = await page.evaluate(() => Trace.buf.filter(e => e.kind === 'blur').map(e => e.what)); await page.waitForTimeout(1300);
    const after = await page.evaluate(() => Trace.buf.filter(e => e.kind === 'blur').map(e => e.what));
    assert(after.some(w => /sharpness Sharp → Blurry: pixel ratio 0\.5 of 1/.test(w)), 'no blur step: ' + after.join(' | '));
  });

  await ok('Export status carries the sharpness section; the dev panel shows the grade and the findings', async () => {
    await page.locator('body').click({ position: { x: 700, y: 400 } }); await page.keyboard.press('`'); await page.waitForTimeout(500);
    await page.click('#devBlurNow'); await page.waitForFunction(() => /Blurry|Soft|Sharp/.test(document.getElementById('devBlurGrade').textContent), null, { timeout: 8000 });
    assert.strictEqual(await page.textContent('#devBlurGrade'), 'Blurry'); assert(/renders at pixel ratio 0\.5/.test(await page.textContent('#devBlurText')));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#devExport')]);
    const text = require('fs').readFileSync(await dl.path(), 'utf8');
    assert(/== SHARPNESS/.test(text) && /Overall: Blurry/.test(text) && /3D view edges: \d+ measured/.test(text) && /BLURRY +render scale/.test(text) && /Text in one frame/.test(text), text.split('== SHARPNESS')[1].slice(0, 1500));
    await page.keyboard.press('`'); await page.evaluate(() => { PERF.dpr = 1; resize(); }); await page.waitForTimeout(600);
  });

  await ok('a fractional screen pixel ratio (browser zoom) is called soft, with the canvases still matched to it', async () => {
    const p = await open(1.25);
    const q = await p.evaluate(() => { const q = __blur.quick(); return { gl: q.canvases.find(c => c.name === 'canvas#gl').scale.word, issues: q.issues.map(i => i.area + ': ' + i.msg), ratio: renderer.getPixelRatio() }; });
    assert(/sharp, 1:1/.test(q.gl), q.gl + ' ratio ' + q.ratio); assert(q.issues.some(m => /page: browser zoom or screen scaling gives a fractional pixel ratio \(1\.25\)/.test(m)), q.issues.join('\n'));
    await p.context().close();
  });

  await ok('no page errors', async () => assert.deepStrictEqual(errs, []));
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
