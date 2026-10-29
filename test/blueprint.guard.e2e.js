// Blueprint Drawing with nothing visible to draw: it says so and throws nothing, even after an earlier drawing was opened and closed
// (that left an emptied #bp behind, and the sheet's Check chip was then added to a stage that did not exist: "Cannot read properties of null (reading 'appendChild')").
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/blueprint.guard.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (3d-modeler.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 1500)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 850 } })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.dismiss());
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' })); await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' })); await page.route(/gate\.js/, r => r.abort()); await page.route(/fonts\.g/, r => r.abort());
  await page.goto('file://' + path.resolve(__dirname, '..', '3d-modeler.html') + '?dev=1'); await page.waitForTimeout(2500);
  await page.evaluate(() => { window.DATUM_PREMIUM = true; window.DATUM_AUTO = true; loadDoc(SAMPLES.find(s => s.name === 'Pocketed plate').make(), 't'); }); await page.waitForTimeout(1200);

  await ok('a drawing opens with its Check chip and stage', async () => {
    await page.evaluate(() => action('blueprint')); await page.waitForFunction(() => document.querySelector('#bp .bp-stage #bpCheckList') && document.querySelector('#bpPage svg'), null, { timeout: 15000 });
    assert(await page.evaluate(() => !!document.getElementById('bpCheck')));
    await page.evaluate(() => bpClose());
  });

  await ok('with every body hidden, Blueprint Drawing only toasts: no script error, nothing left open', async () => {
    await page.evaluate(() => { doc.hidden = doc.hidden || {}; MODEL.bodies.forEach(b => { doc.hidden[b.id] = true; }); });
    const threw = await page.evaluate(() => { try { action('i:curv'); action('blueprint'); action('blueprint'); return ''; } catch (e) { return e.message; } });
    assert.strictEqual(threw, ''); await page.waitForTimeout(400);
    const bp = await page.evaluate(() => { const e = document.getElementById('bp'); return e ? { hidden: e.hidden, empty: !e.innerHTML.trim(), chip: !!document.getElementById('bpCheck') } : null; });
    assert(!bp || (bp.hidden && bp.empty && !bp.chip), JSON.stringify(bp));
  });

  await ok('with no earlier drawing at all it is the same', async () => {
    await page.evaluate(() => { const e = document.getElementById('bp'); if (e) e.remove(); });
    assert.strictEqual(await page.evaluate(() => { try { action('blueprint'); return ''; } catch (e) { return e.message; } }), '');
    assert.strictEqual(await page.evaluate(() => !document.getElementById('bp') || document.getElementById('bp').hidden), true);
  });

  await ok('showing the bodies again brings the drawing back', async () => {
    await page.evaluate(() => { doc.hidden = {}; }); await page.evaluate(() => action('blueprint'));
    await page.waitForFunction(() => document.querySelector('#bp .bp-stage #bpCheckList') && document.querySelector('#bpPage svg'), null, { timeout: 15000 });
  });

  await ok('no page errors', async () => assert.deepStrictEqual(errs, []));
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
