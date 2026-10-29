// App-wide defaults: dark theme first with a working light theme, inches first with the metric value in parentheses, American English.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/ui.defaults.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (3d-modeler.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert'), fs = require('fs');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 900)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const mk = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 850 }, colorScheme: 'light' });      // a light OS must not turn the app light on its own
    const page = await ctx.newPage(); await page.addInitScript(() => { window.DATUM_PREMIUM = true; window.DATUM_AUTO = true; window.DATUM_NOFX = true; });
    page.errs = []; page.on('pageerror', e => page.errs.push(e.message));
    await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
    await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' })); await page.route(/gate\.js/, r => r.abort());
    await page.goto('file://' + path.resolve(__dirname, '..', '3d-modeler.html') + '?dev=1'); await page.waitForTimeout(2000);
    return page;
  };
  const p = await mk();
  await ok('dark theme is the default, even on a light operating system, and the page really is dark', async () => {
    const r = await p.evaluate(() => ({ t: document.documentElement.getAttribute('data-theme'), bg: getComputedStyle(document.body).backgroundColor }));
    const [rr, gg, bb] = r.bg.match(/\d+/g).map(Number);
    assert(r.t === 'dark' && (rr + gg + bb) / 3 < 90, JSON.stringify(r));
  });
  await ok('the theme button switches to light, the page turns light, and the choice is remembered on reload; switching back to dark is remembered too', async () => {
    await p.click('#btnTheme'); await p.waitForTimeout(400);
    let r = await p.evaluate(() => ({ t: document.documentElement.getAttribute('data-theme'), s: localStorage.getItem('datum.theme'), bg: getComputedStyle(document.body).backgroundColor }));
    assert(r.t === 'light' && r.s === 'light' && r.bg.match(/\d+/g).map(Number).reduce((a, b) => a + b, 0) / 3 > 150, JSON.stringify(r));
    await p.reload(); await p.waitForTimeout(2000);
    assert(await p.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'light', 'light is remembered');
    await p.click('#btnTheme'); await p.waitForTimeout(300); await p.reload(); await p.waitForTimeout(2000);
    assert(await p.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'dark', 'dark is remembered');
  });
  await ok('inches are the default unit and every length reads inches first with the metric value in parentheses', async () => {
    const r = await p.evaluate(() => ({ inch: isIn(), l: fmtLs(25.4), l2: fmtLs(12.7), stored: localStorage.getItem('datum.units') }));
    assert(r.inch && /^1(\.0+)?"? \(25\.4\)$|^1(\.0+)?" \(25\.4\)$/.test(r.l.replace(/ /g, ' ')) || /\(25\.4\)/.test(r.l), JSON.stringify(r));
    assert(/"/.test(r.l) && /\(12\.7\)/.test(r.l2), JSON.stringify(r));
  });
  await ok('the interface text uses American spellings (color, center, gray, neighbor, canceled, meter, aluminum, tire)', async () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', '3d-modeler.html'), 'utf8').split('\n');
    const bad = [], re = /(?<![A-Za-z0-9_.])(colou?r(?!s?\b)|colour\w*|centre\w*|neighbour\w*|behaviour\w*|aluminium|grey\b|cancelled|metres?\b|tyre\w*|catalogue|modelling|labelled|organis\w*|optimis\w*|favourite)/gi;
    src.forEach((l, i) => { if (/\.METRE\.|centimetres\?|grey: '#9aa3ad'/.test(l)) return; const m = l.match(re); if (m && m.some(w => !/^colo(r)/i.test(w))) bad.push((i + 1) + ': ' + m.join(',')); });
    assert(!bad.length, bad.slice(0, 8).join(' | '));
  });
  await ok('the page raised no errors', async () => { assert.deepStrictEqual(p.errs, [], p.errs.join('\n')); });
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
