// Manufacture materials: the library Fusion and Mastercam users expect (aluminum, brass, copper, mild / alloy / hardened steel,
// stainless, cast iron, titanium, Inconel, acetal) with surface speeds and chip loads that make physical sense, and a program that
// posts and checks clean in every one.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/cam.material.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (3d-modeler.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 900)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } }); await page.addInitScript(() => { window.DATUM_PREMIUM = true; });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' })); await page.route(/gate\.js/, r => r.abort());
  await page.goto('file://' + path.resolve(__dirname, '..', '3d-modeler.html') + '?dev=1'); await page.waitForTimeout(2000);
  await page.addScriptTag({ path: path.resolve(__dirname, 'lib', 'gcode-check.js') });
  await page.evaluate(async () => {
    const e0 = camEpoch, s = SAMPLES.find(x => x.name === 'Pocketed plate'); loadDoc(s.make(), 'test'); setWorkspace('cam');
    for (let i = 0; i < 200 && camEpoch === e0; i++) await new Promise(r => setTimeout(r, 50));
    autoResult(); autoApply(true); await waitToolpaths(120000);
  });

  await ok('the library has the materials a shop cuts, each with a name, a short name and speeds for milling, facing, drilling and tapping', async () => {
    const r = await page.evaluate(() => Object.entries(MATERIALS).map(([k, m]) => ({ k, name: m.name, short: m.short, vc: m.vc, fz: m.fz })));
    const keys = r.map(m => m.k);
    for (const k of ['aluminum', 'brass', 'copper', 'mildsteel', 'alloysteel', 'stainless', 'castiron', 'titanium', 'inconel', 'acetal', 'toolsteel']) assert(keys.includes(k), 'missing ' + k + ' in ' + keys);
    for (const m of r) assert(m.name && m.short && ['mill', 'face', 'drill', 'tap'].every(q => m.vc[q] > 0) && m.fz > 0, JSON.stringify(m));
  });

  await ok('harder, tougher materials cut slower and lighter: speeds fall from aluminum to steel to titanium to Inconel, hardened steel slowest of the steels, plastic fastest', async () => {
    const vc = await page.evaluate(() => Object.fromEntries(Object.entries(MATERIALS).map(([k, m]) => [k, m.vc.mill])));
    const fz = await page.evaluate(() => Object.fromEntries(Object.entries(MATERIALS).map(([k, m]) => [k, m.fz])));
    const order = ['acetal', 'aluminum', 'brass', 'copper', 'mildsteel', 'castiron', 'alloysteel', 'stainless', 'titanium', 'inconel'];
    for (let i = 0; i + 1 < order.length; i++) assert(vc[order[i]] >= vc[order[i + 1]] * 0.999, `${order[i]} (${vc[order[i]]}) should cut at least as fast as ${order[i + 1]} (${vc[order[i + 1]]})`);
    assert(vc.toolsteel < vc.alloysteel && vc.inconel > 0, 'hardened tool steel is slower than pre-hard alloy steel');
    assert(fz.inconel < fz.titanium && fz.titanium < fz.stainless + 0.2 && fz.acetal > fz.aluminum, JSON.stringify(fz));
  });

  await ok('retuning the tool library for each material gives every tool a sane spindle speed (200 to the machine limit), a feed and a plunge, and slower spindles in harder materials', async () => {
    const r = await page.evaluate(() => {
      const out = {}; const keys = Object.keys(MATERIALS);
      for (const k of keys) { cam().material = k; retuneTools(); out[k] = cam().tools.map(t => ({ n: t.n, type: t.type, d: t.d, rpm: t.rpm, feed: t.feed, plunge: t.plunge })); }
      cam().material = 'aluminum'; retuneTools(); return out;
    });
    for (const [k, tools] of Object.entries(r)) for (const t of tools) assert(t.rpm >= 200 && t.rpm <= 12000 && t.feed > 0 && t.plunge > 0 && isFinite(t.feed), k + ' T' + t.n + ' ' + JSON.stringify(t));
    const t1 = k => r[k].find(t => t.n === 1);                             // Ø 1/2" end mill
    assert(t1('aluminum').rpm > t1('mildsteel').rpm && t1('mildsteel').rpm > t1('titanium').rpm && t1('titanium').rpm > t1('inconel').rpm, JSON.stringify(['aluminum', 'mildsteel', 'titanium', 'inconel'].map(k => [k, t1(k).rpm])));
  });

  await ok('the same Auto Program posts a clean program in every material (no bad numbers, spindle within the machine, feeds within reason) and reports no errors', async () => {
    const bad = await page.evaluate(() => {
      const out = [];
      for (const k of Object.keys(MATERIALS)) {
        cam().material = k; retuneTools(); cam().post.ctrl = 'fanuc';
        const t = postGcode().text, probs = gcheck(t, { units: isIn() ? 'in' : 'mm' });
        if (probs.length) out.push(k + ': ' + probs.slice(0, 2).join(' / '));
      }
      cam().material = 'aluminum'; retuneTools(); return out;
    });
    assert.deepStrictEqual(bad, [], JSON.stringify(bad));
  });

  await ok('the Setup panel lists every material, wraps instead of overflowing, and choosing one is a single Undo step that retunes the tools', async () => {
    await page.evaluate(() => { CAMUI.view = 'setup'; camRefresh(); }); await page.waitForTimeout(500);
    const n = await page.evaluate(() => document.querySelectorAll('[data-mat]').length), total = await page.evaluate(() => Object.keys(MATERIALS).length);
    assert(n === total && n >= 11, n + ' of ' + total);
    const wraps = await page.evaluate(() => { const seg = document.querySelector('[data-mat]').parentElement, r = seg.getBoundingClientRect(), pr = seg.closest('.pn-body, #cam-panel, .panel') ? seg.closest('.pn-body, #cam-panel, .panel').getBoundingClientRect() : { right: innerWidth }; return { overflow: r.right > pr.right + 1, wrap: getComputedStyle(seg).flexWrap }; });
    assert(!wraps.overflow && wraps.wrap === 'wrap', JSON.stringify(wraps));
    const h0 = await page.evaluate(() => ({ h: hist.cur, rpm: cam().tools.find(t => t.n === 1).rpm }));
    await page.click('[data-mat="titanium"]'); await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({ h: hist.cur, m: cam().material, rpm: cam().tools.find(t => t.n === 1).rpm }));
    assert(r.m === 'titanium' && r.h === h0.h + 1 && r.rpm < h0.rpm, JSON.stringify([h0, r]));
    await page.evaluate(() => undo()); await page.waitForTimeout(300);
    assert(await page.evaluate(() => cam().material) === 'aluminum' && await page.evaluate(() => cam().tools.find(t => t.n === 1).rpm) === h0.rpm, 'undo restores the material and the speeds');
  });

  await ok('the page raised no errors', async () => { assert.deepStrictEqual(errs, [], errs.join('\n')); });
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
