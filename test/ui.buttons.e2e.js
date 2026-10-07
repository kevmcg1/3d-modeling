// Smoke test of the Design and Manufacture ribbons: every toolbar button is clicked on a fresh sample part, and none may throw or break the next refresh.
// Also guards the Guided Setup panel: with no part left (deleted, undone to nothing) it must fall back to step 1, not read the stock settings of a part that is gone.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/ui.buttons.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (index.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 900)); } };
const SKIP = /export|save|open|import|print|download|file|new|clear|reset/i;   // these open the browser's file dialogs
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.dismiss());
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' }));
  await page.route(/fonts\.g/, r => r.abort());
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await page.waitForTimeout(1500);
  const load = () => page.evaluate(() => { if (typeof cancelCmd === 'function') try { cancelCmd(); } catch (e) { /* none open */ } loadDoc(SAMPLES.find(s => s.name === 'Pocketed plate').make(), 't'); });

  await ok('Guided Setup with no part left shows step 1 and does not throw', async () => {
    await load(); await page.evaluate(() => { setWorkspace('cam'); GS.step = 2; });
    const r = await page.evaluate(() => { try { bodyMeshes.length = 0; for (const st of [2, 3]) { GS.step = st; gsPanel(); } return ''; } catch (e) { return e.message; } });   // no body on screen, as after undoing everything
    assert.strictEqual(r, '');
  });
  for (const ws of ['design', 'cam']) {
    await ok(`every ${ws} ribbon button can be clicked without an error`, async () => {
      await load(); await page.evaluate(w => setWorkspace(w), ws); await page.waitForTimeout(500);
      const n = await page.evaluate(() => { let i = 0; for (const el of document.querySelectorAll('#toolbar button:not(.rb-arrow), #topbar button:not(.rb-arrow)')) { const r = el.getBoundingClientRect(); if (r.width < 2 || !el.getClientRects().length) continue; el.setAttribute('data-sm', i++); } return i; });
      assert(n > 30, 'only ' + n + ' buttons found');
      const bad = [];
      for (let i = 0; i < n; i++) {
        const info = await page.evaluate(i => { const el = document.querySelector(`[data-sm="${i}"]`); return el ? { t: (el.getAttribute('data-tipkey') || el.dataset.act || el.dataset.cam || el.id || el.textContent || '').trim().slice(0, 40), dis: el.disabled } : null; }, i);
        if (!info || info.dis || SKIP.test(info.t)) continue;
        errs.length = 0; await load();
        await page.evaluate(i => document.querySelector(`[data-sm="${i}"]`).click(), i); await page.waitForTimeout(220); await page.keyboard.press('Escape'); await page.waitForTimeout(60);
        const re = await page.evaluate(() => { try { refreshUI(); return ''; } catch (e) { return 'refreshUI: ' + e.message; } }); if (re) errs.push(re);
        if (errs.length) bad.push(info.t + ' → ' + errs[0]);
      }
      assert.deepStrictEqual(bad, []);
    });
  }
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
