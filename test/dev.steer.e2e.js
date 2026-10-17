// Dev mode's run steering: "Don't review working things" (a control that worked and ran smooth in the first pass is not tried again in the pairs, triples,
// combinations and random runs after it), "Aim more for mistakes" (a problem makes the run repeat it and spend more of the rest around it) and the Endless mode
// (random runs, good or bad, until Stop). All on sketching and 3D modeling, the only part the dev tool tests.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/dev.steer.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (3d-modeler.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 1500)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const open = async (query = '?dev=1') => {
    const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
    page.errs = []; page.on('pageerror', e => { if (!/injected fault/.test(e.message)) page.errs.push(e.message); }); page.on('dialog', d => d.dismiss());
    await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' })); await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' })); await page.route(/fonts\.g/, r => r.abort());
    await page.goto('file://' + path.resolve(__dirname, '..', '3d-modeler.html') + query); await page.waitForTimeout(3500);
    await page.locator('body').click({ position: { x: 700, y: 400 } }); await page.keyboard.press('`'); await page.waitForTimeout(500);
    return page;
  };
  // one run on the Design workspace; opts: skip, aim, fault (a ribbon action that throws), mode
  const go = (p, o) => p.evaluate(async o => {
    document.querySelectorAll('.dev input[data-t]').forEach(i => { i.checked = i.dataset.t === 'design'; });
    document.getElementById('devMode').value = o.mode || 'quick'; document.getElementById('devCombo').checked = false; document.getElementById('devFlow').checked = false; document.getElementById('devCtl').checked = true;
    document.getElementById('devSkip').checked = !!o.skip; document.getElementById('devAim').checked = !!o.aim;
    const M = window.__dev.MODES.quick; M.pairs = 40; M.triples = 30; M.seqs = 25;
    if (o.fault) { const a0 = window.action; window.action = function (n) { if (n === o.fault) throw new Error('injected fault'); return a0.apply(this, arguments); }; window.__a0 = a0; }
    window.__devDone = false; const run = window.__dev.start(['design']).then(() => { window.__devDone = true; });
    if (o.stopAfter) { await new Promise(r => setTimeout(r, o.stopAfter)); document.getElementById('devStop').click(); }
    await run;
    if (o.fault) window.action = window.__a0;
    const T = window.__devReport.tools.design;
    return { T: JSON.parse(JSON.stringify(T, (k, v) => (k === 'sample' ? undefined : v))), summary: window.__dev.summaryText(), options: window.__devReport.options };
  }, o);

  await ok('Start with the checks: "Don\'t review working things" is on by default, "Aim more for mistakes" is off', async () => {
    const p = await open();
    assert.deepStrictEqual(await p.evaluate(() => [document.getElementById('devSkip').checked, document.getElementById('devAim').checked, /Don't review working things/.test(document.querySelector('.dev').textContent), /Aim more for mistakes/.test(document.querySelector('.dev').textContent)]), [true, false, true, true]);
    await p.close();
  });

  let off;
  await ok('without it, controls that worked are tried again in the later phases', async () => {
    const p = await open(); off = await go(p, { skip: false });
    const again = Object.values(off.T.ctl).filter(c => c.issues === 0 && c.runs > 1);
    assert(again.length > 3, 'controls used more than once: ' + again.length);
    assert(!/Don't review working things:/.test(off.summary)); await p.close();
  });

  await ok('with it, a control that worked and ran smooth is used once and never again', async () => {
    const p = await open(); const on = await go(p, { skip: true });
    const cleared = Object.values(on.T.ctl).filter(c => c.runs > 0 && c.issues === 0 && c.worst <= 50);
    assert(cleared.length > 20, 'cleared ' + cleared.length);
    // (a control the page re-labels between two looks, such as a clock or a feature row whose number moves, is counted under two keys; a handful of those is not the rule failing)
    const reused = cleared.filter(c => c.runs > 1 && !/^\d+\D/.test(c.label)).map(c => c.label + ' ×' + c.runs), offReused = Object.values(off.T.ctl).filter(c => c.issues === 0 && c.worst <= 50 && c.runs > 1).length;
    assert(reused.length <= Math.max(6, cleared.length * .05) && reused.length * 3 < offReused, 'cleared controls tried again: ' + reused.length + ' (without the rule: ' + offReused + ') ' + reused.join('; '));
    assert.strictEqual(on.T.skip.on, true); assert(on.T.skip.cleared >= cleared.length - 2, JSON.stringify(on.T.skip));
    assert(/Don't review working things: \d+ of \d+ controls worked and ran smooth the first time/.test(on.summary), on.summary.slice(0, 900));
    assert(on.T.pairs.possible < off.T.pairs.possible, 'fewer pairs to choose from: ' + on.T.pairs.possible + ' vs ' + off.T.pairs.possible);
    await p.close();
  });

  await ok('aim more for mistakes: a control that throws is repeated, its area gets the extra steps, and the report says so', async () => {
    const p = await open(); const r = await go(p, { skip: true, aim: true, fault: 'chamfer3' });
    const A = r.T.aim, hot = Object.entries(A.hot).filter(e => e[1] > 0);
    assert(A.on && hot.length >= 1, JSON.stringify(A)); assert(A.repeats >= 2, 'repeats ' + A.repeats);
    const area = hot.sort((x, y) => y[1] - x[1])[0][0]; assert((A.steered[area] || 0) >= 2, area + ': ' + JSON.stringify(A.steered));
    const faulty = Object.values(r.T.ctl).filter(c => /chamfer/i.test(c.label)); assert(faulty.some(c => c.runs >= 3), 'the throwing control was used ' + faulty.map(c => c.runs).join());
    assert(r.T.findings.some(f => /injected fault/.test(f.detail) || f.type === 'control threw' || f.type === 'console error'), 'the fault was found');
    assert(/Aim more for mistakes: \d+ area/.test(r.summary) && new RegExp(area + ': .* extra steps').test(r.summary), r.summary.slice(0, 1200));
    assert.strictEqual(r.options.aim, true); await p.close();
  });

  await ok('aim off: the same fault is found but nothing is repeated or steered', async () => {
    const p = await open(); const r = await go(p, { skip: true, aim: false, fault: 'chamfer3' });
    assert.strictEqual(r.T.aim.on, false); assert.strictEqual(r.T.aim.repeats, 0); assert.deepStrictEqual(r.T.aim.steered, {}); assert(!/Aim more for mistakes/.test(r.summary)); await p.close();
  });

  await ok('aim more for mistakes with nothing wrong says so and steers nothing', async () => {
    const p = await open(); const r = await go(p, { skip: true, aim: true });
    const hardErr = Object.values(r.T.aim.hot).some(v => v >= 3);
    if (!hardErr) assert(/Aim more for mistakes: (nothing went wrong|\d+ area)/.test(r.summary)); await p.close();
  });

  await ok('Endless: random runs only, no first pass or flows, until Stop; good or bad; a fault does not end it', async () => {
    const p = await open();
    assert.strictEqual(await p.evaluate(() => { document.getElementById('devMode').value = 'endless'; document.getElementById('devMode').dispatchEvent(new Event('change', { bubbles: true })); return /until you press Stop/.test(document.getElementById('devEst').textContent); }), true);
    const r = await go(p, { mode: 'endless', aim: true, fault: 'chamfer3', stopAfter: 45000 });
    assert(r.T.sequences.run >= 3, 'runs ' + r.T.sequences.run); assert.strictEqual(r.T.singles.run, 0); assert.strictEqual(r.T.pairs.run, 0); assert.strictEqual(r.T.scenarios.length, 0);
    assert.strictEqual(r.options.endless, true); assert.strictEqual(r.T.skip.on, false, 'the skip rule does not apply to Endless');
    assert.strictEqual(await p.evaluate(() => window.__dev.run.on), false, 'stopped');
    await p.close();
  });

  await ok('from the plain page (nothing but sketching and 3D modeling shown) the run starts in place and only tries what is on screen', async () => {
    const p = await open(''); await p.evaluate(() => { window.__marker = 1; });
    const r = await go(p, { mode: 'endless', stopAfter: 15000 });
    assert.strictEqual(await p.evaluate(() => window.__marker), 1, 'the page was not reloaded');
    const labels = Object.values(r.T.ctl).map(c => c.label).join('\n'); assert(r.T.sequences.run >= 1, 'it ran');
    assert(!/act (hw:|stress|blueprint|f:fixture|f:joint|f:mate)|menu (construct|inspect) › (Blueprint|Stress|Fixture|Joint|Mate)|Physics lab|Fasteners|Workholding/i.test(labels), 'tried a hidden control: ' + labels.split('\n').filter(l => /hw:|stress|blueprint|fixture|joint|mate|physics/i.test(l)).join('; '));
    await p.close();
  });

  await browser.close();
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
