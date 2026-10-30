// Dev mode checks every feature added in the CAM-parity and look-and-feel work by itself, with visual intelligence: section view, feature
// animation, icon tooltips and motion, outlined buttons, defaults, cutter compensation, post options, materials, the Auto lock, contour
// passes, a UX audit of the page, and a look at what the 3D view really draws. Each flow must pass; this runs them all through the dev tool.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/dev.features.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (3d-modeler.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 1800)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } }); await page.addInitScript(() => { window.DATUM_PREMIUM = false; });   // as shipped: Manufacture locked (the flows lift it for themselves), Auto locked
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.dismiss());
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' })); await page.route(/gate\.js/, r => r.abort()); await page.route(/fonts\.g/, r => r.abort());
  await page.goto('file://' + path.resolve(__dirname, '..', '3d-modeler.html') + '?dev=1'); await page.waitForTimeout(3500);
  const names = await page.evaluate(() => window.__devFeatures.flows.map(f => f.name));
  await ok('the dev tool carries a check for each feature (twelve of them) and offers them in its page flows', async () => {
    assert(names.length === 12, names.length + ': ' + names.join(' | '));
    const inPanel = await page.evaluate(() => window.__dev.FLOWS.page.filter(f => f.feature).length); assert(inPanel === 12, 'in the panel flows: ' + inPanel);
    for (const w of ['Section view', 'Feature animation', 'Icon tooltips', 'Outlined buttons', 'Defaults', 'Cutter compensation', 'Post options', 'Materials', 'Auto Program', 'Contour', 'UX audit', 'Visual intelligence']) assert(names.some(n => n.includes(w)), 'no flow for ' + w);
  });
  for (let i = 0; i < names.length; i++) {
    await ok(names[i], async () => {
      const r = await page.evaluate(async i => { const out = await window.__devFeatures.run([window.__devFeatures.flows[i].name]); return out[0]; }, i);
      const fails = r.notes.filter(n => n[0] === '✗');
      assert(r.pass && !fails.length, fails.slice(0, 6).join(' || ') + ' [' + r.notes.length + ' notes, ' + r.ms + ' ms]');
      assert(r.notes.filter(n => n[0] === '✓').length >= 1, 'the flow checked nothing');
      console.log('   ' + r.notes.filter(n => n[0] === '✓').length + ' checks passed' + (r.notes.some(n => n[0] === '•') ? ', warnings: ' + r.notes.filter(n => n[0] === '•').slice(0, 3).map(n => n.slice(2, 110)).join(' | ') : ''));
    });
  }
  await ok('the flows put everything back: theme dark, no section, no lock left lifted, Manufacture still locked', async () => {
    const r = await page.evaluate(() => ({ theme: document.documentElement.getAttribute('data-theme'), sec: SECTION.on, lock: CAM_LOCK.active, ws: UIX.ws, planes: renderer.clippingPlanes.length }));
    assert(r.theme === 'dark' && !r.sec && r.lock && r.ws === 'design' && r.planes === 0, JSON.stringify(r));
  });
  await ok('the page raised no errors', async () => { assert.deepStrictEqual(errs, [], errs.join('\n')); });
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
