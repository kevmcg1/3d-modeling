// QA regressions for the 3-axis flow: what Auto Detect programs must post as correct G-code.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/cam.qa.e2e.js
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
  await page.addScriptTag({ path: path.resolve(__dirname, 'lib', 'gcode-check.js') });
  const program = name => page.evaluate(async (name) => {
    const s = SAMPLES.find(x => x.name === name); loadDoc(s.make(), 'test'); setWorkspace('cam');
    await new Promise(r => setTimeout(r, 1200));
    autoResult(); autoApply(true); await waitToolpaths(120000);
    const g = postGcode();
    return { text: g.text, probs: gcheck(g.text, { units: isIn() ? 'in' : 'mm' }), dev: gDeviation().filter(d => d.err || d.toolpathOffGcode > 0.03 || d.gcodeOffToolpath > 0.03), warns: cam().ops.flatMap(o => toolpath(o).warn || []) };
  }, name);

  await ok('round pockets: the rough cycle and the finish cycle both post as G12, and no arc starts from the wrong place', async () => {
    const r = await program('Mold cavity insert');
    const g12 = r.text.split('\n').filter(l => /^G91 G12/.test(l));
    assert(g12.length >= 2, 'two G12 cycles (rough, finish): ' + JSON.stringify(g12));
    assert.deepStrictEqual(r.probs, [], JSON.stringify(r.probs));
    assert.deepStrictEqual(r.dev, [], JSON.stringify(r.dev));
    assert(/CENTER-CUTTING/.test(r.text), 'the G12 note tells the machinist the tool plunges at the center');
  });
  await ok('a degenerate sliver face is not offered as a pocket floor, so no "could not read a floor face" warning', async () => {
    const r = await program('Flanged boss');
    assert(!r.warns.some(w => /Could not read a floor face/.test(w)), JSON.stringify(r.warns));
    assert.deepStrictEqual(r.probs, [], JSON.stringify(r.probs));
  });
  await ok('the page raised no errors', async () => { assert.deepStrictEqual(errs, [], errs.join('\n')); });
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
