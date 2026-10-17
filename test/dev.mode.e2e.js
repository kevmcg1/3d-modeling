// Dev mode (the stress-test tool): nothing of it is in the page until the backtick key is pressed, the key opens and closes it
// (not while typing in a field), the address alone cannot start it, and a short run on the Manufacture tab of a free user finds no problems.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/dev.mode.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (3d-modeler.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 900)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const open = async query => {
    const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
    page.errs = []; page.on('pageerror', e => page.errs.push(e.message)); page.on('dialog', d => d.dismiss());
    await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
    await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' }));
    await page.route(/fonts\.g/, r => r.abort());
    await page.goto('file://' + path.resolve(__dirname, '..', '3d-modeler.html') + (query || '')); await page.waitForTimeout(3500);
    return page;
  };
  const traces = p => p.evaluate(() => ({ el: document.querySelectorAll('.dev, [aria-label="Dev mode"]').length, text: /Dev mode/i.test(document.body.innerText), css: [...document.querySelectorAll('style')].some(s => /\.dev\b/.test(s.textContent)) }));
  const shown = p => p.evaluate(() => { const e = document.querySelector('.dev'); if (!e || e.hidden) return false; const r = e.getBoundingClientRect(); return r.width > 100 && r.height > 100 && getComputedStyle(e).visibility !== 'hidden'; });

  const p = await open('');
  await ok('before the key is pressed nothing of dev mode is in the page', async () => assert.deepStrictEqual(await traces(p), { el: 0, text: false, css: false }));
  await ok('the address cannot start it (?dev=run, ?devgo and ?dev=1 do nothing alone)', async () => {
    for (const q of ['?dev=run', '?devgo=cam', '?dev=1&devgo=cam&mode=quick']) { const x = await open(q); assert.deepStrictEqual(await traces(x), { el: 0, text: false, css: false }, q); assert.strictEqual(await x.evaluate(() => !!(window.__dev && window.__dev.run.on)), false, q); await x.close(); }
  });
  await ok('other keys do not open it', async () => { for (const k of ['d', 'Control+`', 'Alt+`', 'F12', 'Shift+d']) await p.keyboard.press(k); assert.strictEqual((await traces(p)).el, 0); });
  await ok('the backtick does nothing while typing in a field', async () => {
    await p.evaluate(() => { const i = document.createElement('input'); i.type = 'text'; i.id = 'tmpIn'; document.body.appendChild(i); i.focus(); });
    await p.keyboard.press('`'); assert.strictEqual((await traces(p)).el, 0); assert.strictEqual(await p.inputValue('#tmpIn'), '`');
    await p.evaluate(() => document.getElementById('tmpIn').remove());
  });
  await ok('the backtick opens the panel, and again closes it', async () => {
    await p.locator('body').click({ position: { x: 700, y: 400 } }); await p.keyboard.press('`'); await p.waitForTimeout(500);
    assert.strictEqual(await shown(p), true); assert.strictEqual((await traces(p)).el, 1);
    await p.keyboard.press('`'); await p.waitForTimeout(500); assert.strictEqual(await shown(p), false);
    await p.keyboard.press('`'); await p.waitForTimeout(500); assert.strictEqual(await shown(p), true); assert.strictEqual((await traces(p)).el, 1, 'one panel only');
  });
  await ok('the panel covers the workspaces and offers its runs', async () => {
    const r = await p.evaluate(() => ({ ws: [...document.querySelectorAll('.dev input[data-t]')].map(i => i.dataset.t), modes: [...document.querySelectorAll('#devMode option')].map(o => o.value) }));
    assert(['design', 'cam', 'sheet', 'print', 'draw', 'house', 'gfx'].every(x => r.ws.includes(x)), r.ws.join()); assert.deepStrictEqual(r.modes, ['thorough', 'standard', 'quick']);
  });
  await ok('a short run on Manufacture as a free user finds no errors and respects the Premium lock', async () => {
    // the early-access build reloads itself with ?dev=1 before a run (its hidden tabs come back); start there so the page stays put
    const p = await open('?dev=1'); await p.locator('body').click({ position: { x: 700, y: 400 } }); await p.keyboard.press('`'); await p.waitForTimeout(500);
    await p.evaluate(() => { document.querySelectorAll('.dev input[data-t]').forEach(i => { i.checked = i.dataset.t === 'cam'; }); document.getElementById('devMode').value = 'quick'; document.getElementById('devCombo').checked = false; document.getElementById('devFlow').checked = false; document.getElementById('devCtl').checked = true; window.__dev.MODES.quick.pairs = 3; window.__dev.MODES.quick.triples = 3; window.__dev.MODES.quick.seqs = 3; });
    await p.evaluate(() => { window.__devDone = false; window.__dev.start(['cam']).then(() => { window.__devDone = true; }); });
    await p.waitForFunction(() => window.__devDone, null, { timeout: 420000, polling: 2000 });
    const R = await p.evaluate(() => { const r = window.__devReport, T = r.tools.cam; return { premiumLocked: r.premiumLocked, controls: T.controls, singles: T.singles.run, locked: T.locked, bad: T.findings.filter(f => !/^(jank|stall|slow control|feature error|locked control stayed silent)$/.test(f.type)).map(f => f.type + ': ' + f.detail), silent: T.findings.filter(f => f.type === 'locked control stayed silent').map(f => f.detail) }; });
    assert.strictEqual(R.premiumLocked, true); assert(R.controls > 20 && R.singles > 20, JSON.stringify(R));
    assert(R.locked.n > 0 && R.locked.said === R.locked.n, 'locked controls said so: ' + JSON.stringify(R.locked) + ' ' + R.silent.join('; '));
    assert.deepStrictEqual(R.bad, []); assert.deepStrictEqual(p.errs, []);
    await p.close();
  });
  await ok('no page errors', async () => assert.deepStrictEqual(p.errs, []));
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
