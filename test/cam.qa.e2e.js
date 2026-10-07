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
    const e0 = camEpoch, s = SAMPLES.find(x => x.name === name); loadDoc(s.make(), 'test'); setWorkspace('cam');
    for (let i = 0; i < 200 && camEpoch === e0; i++) await new Promise(r => setTimeout(r, 50));       // the model has been rebuilt for the new part
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
  const full = (name, code) => page.evaluate(async ([name, code]) => {
    const e0 = camEpoch;
    if (code) { const k = sampleKit(); new Function('k', 'kBox', 'kCut', 'kHole', 'P2', code)(k, kBox, kCut, kHole, P2); loadDoc(k.doc(), name); }
    else loadDoc(SAMPLES.find(x => x.name === name).make(), 'test');
    setWorkspace('cam'); for (let i = 0; i < 200 && camEpoch === e0; i++) await new Promise(r => setTimeout(r, 50));
    await autoProgram(); await waitToolpaths(120000); await verifyAndFix();
    const R = VERIFY.report, g = postGcode();
    return { ops: cam().ops.map(o => o.name), bad: R.meas.filter(m => !m.ok).map(m => m.name), cover: R.cover ? R.cover.fail : null, counts: R.counts, probs: gcheck(g.text, { units: isIn() ? 'in' : 'mm' }), spindles: [...g.text.matchAll(/\bS(\d+)/g)].map(m => +m[1]) };
  }, [name, code]);

  await ok('a block with a shoulder and blind holes keeps a sturdy pocket tool (no hair-thin end mill where a Ø3/8" fits) and its blind-hole bottoms count as drilled', async () => {
    const r = await full('Stepped block');
    assert(r.ops.some(n => /Pocket 3 floors \(Ø3\/8"\)/.test(n)), r.ops.join(' | '));
    assert.strictEqual(r.cover, 0, 'coverage fails: ' + r.cover);
    assert.deepStrictEqual(r.bad, []);
  });
  await ok('a narrow channel between deep holes is pocketed with a tool that fits it and every floor measures to size', async () => {
    const r = await full('Battery tray');
    assert(r.ops.some(n => /Pocket 1 floor \(Ø1\/8"\)/.test(n)), r.ops.join(' | '));
    assert.deepStrictEqual(r.bad, [], 'floors not cut: ' + r.bad.join(', '));
    assert.strictEqual(r.cover, 0);
    assert.deepStrictEqual(r.probs, [], JSON.stringify(r.probs));
  });
  for (const [nm, why] of [['Tapped block', 'blind tap-drill holes leave a drill cone, not material left on the part'], ['Pen tray', 'two shallow wells are milled, not drilled with a drill that cannot reach full size'], ['Coaster with grooves', 'a ring groove\'s outer wall is not a drillable hole'], ['Soft jaw', 'a ring floor is measured on the floor, not at the hole in its middle'], ['Heat sink', 'a floor point on the edge of a fin is not measured']]) {
    await ok(nm + ': Verify passes: ' + why, async () => {
      const r = await page.evaluate(async (name) => {
        const e0 = camEpoch; loadDoc(SAMPLES.find(x => x.name === name).make(), 'test'); setWorkspace('cam');
        for (let i = 0; i < 200 && camEpoch === e0; i++) await new Promise(r => setTimeout(r, 50));
        await autoProgram(); await waitToolpaths(120000); await verifyAndFix();
        const R = VERIFY.report; return { ok: R.ok, bad: R.meas.filter(m => !m.ok).map(m => m.name), cover: R.cover && R.cover.fail, issues: R.issues.filter(i => i.type !== 'plunge').map(i => i.type), uncut: R.comp ? R.comp.clusters.filter(c => c.kind === 'uncut').length : 0 };
      }, nm);
      assert.strictEqual(r.ok, true, JSON.stringify(r));
    });
  }
  await ok('tiny features get small end mills, the spindle never exceeds 12000 rpm, and the program verifies', async () => {
    const r = await full('micro', `kBox(k,-10,-8,10,8,4); kHole(k,[0,0,4],[0,0,1],2,4); kCut(k,4,k.rect(-6,-5,-3,5),[P2(-4,0)],1.5);`);
    assert(r.ops.some(n => /Ø1\/(16|32)"/.test(n)), r.ops.join(' | '));
    assert(r.spindles.length && Math.max(...r.spindles) <= 12000, 'S: ' + Math.max(...r.spindles));
    assert.deepStrictEqual(r.probs, [], JSON.stringify(r.probs));
    assert.deepStrictEqual(r.bad, [], r.bad.join(', '));
  });
  await ok('the page raised no errors', async () => { assert.deepStrictEqual(errs, [], errs.join('\n')); });
  console.log(`${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
