/* First-load checks for index.html in a real browser: the page must not shift layout after it is shown, all workspace tabs
   are in the markup (not added late), the search icon is sized from the first paint, and a slider-driven physics control
   applies once per frame with its newest value.
   Run:  NODE_PATH=<dir with playwright-core, three, clipper-lib> node test/load.test.js */
const http = require('http'), fs = require('fs'), path = require('path');
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { try { ({ chromium } = require('playwright')); } catch (e2) { console.log('skip: playwright is not installed'); process.exit(0); } }
const ROOT = path.join(__dirname, '..');
const nm = n => { for (const p of (process.env.NODE_PATH || '').split(path.delimiter)) { const f = path.join(p, n); if (fs.existsSync(f)) return f; } return null; };
if (!nm('three') || !nm('clipper-lib')) { console.log('skip: needs three and clipper-lib on NODE_PATH'); process.exit(0); }
const THREE = fs.readFileSync(path.join(nm('three'), 'build/three.min.js')), CLIPPER = fs.readFileSync(path.join(nm('clipper-lib'), 'clipper.js'));
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL ' + m); } else console.log('ok - ' + m); };
(async () => {
  const server = http.createServer((q, r) => {
    const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.statusCode = 404; return r.end(); }
    r.setHeader('content-type', /\.js$/.test(f) ? 'text/javascript' : 'text/html'); r.end(fs.readFileSync(f));
  }).listen(0);
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 900 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message.slice(0, 200)));
  await page.addInitScript(() => {
    window.__shifts = 0; window.__first = null;
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__shifts += e.value; }).observe({ type: 'layout-shift', buffered: true });
    new MutationObserver(() => { if (!window.__first && document.documentElement && !document.documentElement.classList.contains('booting') && document.querySelector('#gsearch svg')) { window.__first = [...document.querySelectorAll('.ws button')].map(b => b.dataset.ws); const s = document.querySelector('#gsearch svg'); window.__icon = s && s.getBoundingClientRect().width; } }).observe(document, { attributes: true, subtree: true, attributeFilter: ['class'] });
  });
  await page.route('**/*', route => {
    const u = route.request().url();
    if (u.includes('three.min.js')) return route.fulfill({ body: THREE, contentType: 'text/javascript' });
    if (u.includes('clipper')) return route.fulfill({ body: CLIPPER, contentType: 'text/javascript' });
    if (u.startsWith('http://localhost:' + port)) return route.continue();
    return route.abort();
  });
  await page.goto(`http://localhost:${port}/`);
  await page.waitForFunction(() => typeof PHY_SIMS !== 'undefined' && window.PRINT && !document.documentElement.classList.contains('booting'), null, { timeout: 60000 });
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => ({ shifts: window.__shifts, first: window.__first, icon: window.__icon }));
  ok(r.shifts < 0.01, 'no layout shift after load (' + r.shifts.toFixed(4) + ')');
  ok(r.first && ['design', 'cam', 'sheet', 'draw', 'house', 'print', 'gfx'].every((k, i) => r.first[i] === k), 'all seven workspace tabs exist at the first visible frame: ' + JSON.stringify(r.first));
  ok(r.icon > 0 && r.icon <= 20, 'search icon is small at the first visible frame (' + r.icon + 'px)');
  const phy = await page.evaluate(() => new Promise(res => {
    physicsOpen('marbles'); const sim = PHY.sim, calls = [], o = sim.set; sim.set = function (k, v) { calls.push([k, v]); return o.apply(this, arguments); };
    const inp = document.querySelector('.phy input[type=range]'); if (!inp) return res(null);
    for (let i = 0; i < 5; i++) { inp.value = +inp.min + i; inp.dispatchEvent(new Event('input', { bubbles: true })); }
    const sync = calls.length; requestAnimationFrame(() => requestAnimationFrame(() => res({ sync, calls })));
  }));
  ok(phy && phy.sync === 0 && phy.calls.length === 1 && phy.calls[0][1] === +phy.calls[0][1] && phy.calls[0][1] >= 5, 'physics slider: five input events become one update with the newest value ' + JSON.stringify(phy));
  ok(!errors.length, 'no page errors ' + errors.join(' | '));
  await browser.close(); server.close();
  console.log(fails ? fails + ' FAILED' : 'all load checks passed'); process.exit(fails ? 1 : 0);
})();
