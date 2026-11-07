/* Perf budget: an idle page must not spend work every frame. Counts requestAnimationFrame callbacks and CPU task time
   over a quiet window on each page. Prints the numbers; fails when over budget.
   Run:  NODE_PATH=<dir with playwright-core, three, clipper-lib> node test/perf.idle.test.js */
const http = require('http'), fs = require('fs'), path = require('path');
let chromium; try { ({ chromium } = require('playwright-core')); } catch (e) { try { ({ chromium } = require('playwright')); } catch (e2) { console.log('skip: playwright is not installed'); process.exit(0); } }
const ROOT = path.join(__dirname, '..');
const nm = n => { for (const p of (process.env.NODE_PATH || '').split(path.delimiter)) { const f = path.join(p, n); if (fs.existsSync(f)) return f; } return null; };
if (!nm('three') || !nm('clipper-lib')) { console.log('skip: needs three and clipper-lib on NODE_PATH'); process.exit(0); }
const THREE = fs.readFileSync(path.join(nm('three'), 'build/three.min.js')), CLIPPER = fs.readFileSync(path.join(nm('clipper-lib'), 'clipper.js'));
const WINDOW_MS = 2000, BUDGET_CB_PER_SEC = +(process.env.IDLE_RAF_BUDGET || 4);
let fails = 0;
(async () => {
  const server = http.createServer((q, r) => {
    const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.statusCode = 404; return r.end(); }
    r.setHeader('content-type', /\.js$/.test(f) ? 'text/javascript' : 'text/html'); r.end(fs.readFileSync(f));
  }).listen(0);
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  for (const pg of (process.env.PAGES || 'index.html,graphics.html,house.html,drawing2d.html,setup-sheet-generator.html').split(',')) {
    const page = await (await browser.newContext({ viewport: { width: 1500, height: 900 } })).newPage();
    await page.addInitScript(() => { window.__raf = 0; const o = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = cb => o(t => { window.__raf++; return cb(t); }); });
    await page.route('**/*', route => {
      const u = route.request().url();
      if (u.includes('three.min.js')) return route.fulfill({ body: THREE, contentType: 'text/javascript' });
      if (u.includes('clipper')) return route.fulfill({ body: CLIPPER, contentType: 'text/javascript' });
      if (u.startsWith('http://localhost')) return route.continue();
      return route.abort();
    });
    await page.goto(`http://localhost:${port}/${pg}`); await page.waitForTimeout(2500);
    const cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable');
    const m0 = await cdp.send('Performance.getMetrics'), r0 = await page.evaluate(() => window.__raf);
    await page.waitForTimeout(WINDOW_MS);
    const m1 = await cdp.send('Performance.getMetrics'), r1 = await page.evaluate(() => window.__raf);
    const g = (m, n) => m.metrics.find(x => x.name === n).value;
    const cb = (r1 - r0) / (WINDOW_MS / 1000), cpu = (g(m1, 'TaskDuration') - g(m0, 'TaskDuration')) / (WINDOW_MS / 1000) * 100;
    const bad = cb > BUDGET_CB_PER_SEC; if (bad) fails++;
    console.log(`${bad ? 'FAIL' : 'ok'} - ${pg}: idle ${cb.toFixed(1)} rAF callbacks/s, ${cpu.toFixed(1)}% main-thread CPU`);
    await page.close();
  }
  await browser.close(); server.close(); process.exit(fails ? 1 : 0);
})();
