// Layout regression: entering Simulation (G-code dock open) must keep the workspace one row —
// browser | code dock | viewport | rail | right panel — filling the window, at several sizes and in every tab.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/layout.sim.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (index.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 600)); } };
// every visible grid child of #main on one row, the right panel inside the window, nothing past the bottom/right edge
const probe = () => {
  const m = document.getElementById('main'), mr = m.getBoundingClientRect();
  const kids = [...m.children].filter(c => getComputedStyle(c).display !== 'none' && getComputedStyle(c).position !== 'absolute').map(c => { const r = c.getBoundingClientRect(); return { id: c.id, x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }; });
  const p = document.getElementById('panel'), pr = p.getBoundingClientRect(), v = document.getElementById('viewport').getBoundingClientRect();
  return { mr: { y: mr.y, b: mr.bottom, h: mr.height }, kids, panelHidden: getComputedStyle(p).display === 'none', pr: { x: pr.x, y: pr.y, r: pr.right }, vr: v.right, vh: v.height, iw: innerWidth, ih: innerHeight, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight };
};
const check = (r, label) => {
  const tops = new Set(r.kids.map(k => Math.round(k.y)));
  assert(tops.size === 1, label + ': grid children wrapped onto several rows ' + JSON.stringify(r.kids));
  assert(r.mr.b <= r.ih + 1 && r.mr.h > r.ih * 0.5, label + ': #main does not fill the window ' + JSON.stringify(r.mr));
  assert(r.kids.every(k => k.b <= r.ih + 1 && k.r <= r.iw + 1), label + ': a column runs past the window ' + JSON.stringify(r.kids));
  assert(r.panelHidden || r.pr.x >= r.vr - 1, label + ': right panel is not to the right of the viewport');
  assert(r.sh <= r.ih + 1, label + ': page scrolls vertically ' + r.sh + ' in ' + r.ih);
};
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 800 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' }));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await page.waitForTimeout(2000);
  await page.evaluate(() => { const s = SAMPLES.find(x => x.name === 'Pocketed plate'); loadDoc(s.make(), 'test'); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => setWorkspace('cam'));
  await page.evaluate(() => autoProgram()); await page.evaluate(() => waitToolpaths());
  await page.evaluate(() => camAction('sim')); await page.waitForTimeout(2000);

  await ok('simulation docks the G-code and keeps the right panel in the right column', async () => {
    assert(await page.evaluate(() => document.body.classList.contains('code-docked') && document.body.classList.contains('sim-on')), 'simulation / code dock not on');
    for (const [w, h] of [[1920, 800], [1400, 850], [1100, 700], [900, 700]]) {
      await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(400);
      check(await page.evaluate(probe), w + 'x' + h);
    }
  });
  await ok('closing the simulation restores the plain layout', async () => {
    await page.setViewportSize({ width: 1920, height: 800 });
    await page.evaluate(() => camAction('sim')); await page.waitForTimeout(800);
    check(await page.evaluate(probe), 'after close');
  });
  await ok('every workspace tab fills the window', async () => {
    const tabs = await page.evaluate(() => [...document.querySelectorAll('[data-ws]')].map(b => b.dataset.ws));
    for (const t of tabs) {
      await page.evaluate(w => { try { setWorkspace(w); } catch (e) { /* tab opens a page */ } }, t); await page.waitForTimeout(500);
      const r = await page.evaluate(probe), vis = await page.evaluate(() => getComputedStyle(document.getElementById('main')).display !== 'none');
      if (vis) check(r, 'tab ' + t);
    }
  });
  await ok('no page errors', async () => assert(!errs.length, errs.join(' | ')));
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
