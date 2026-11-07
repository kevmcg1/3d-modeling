/* G-code view with a 20,000-line program: only visible rows are drawn, lines are split once, scrolling and the cursor line work.
   Run:  NODE_PATH=<dir with playwright-core, three, clipper-lib> node test/gcode.view.test.js */
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
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 900 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message.slice(0, 200)));
  await page.route('**/*', route => {
    const u = route.request().url();
    if (u.includes('three.min.js')) return route.fulfill({ body: THREE, contentType: 'text/javascript' });
    if (u.includes('clipper')) return route.fulfill({ body: CLIPPER, contentType: 'text/javascript' });
    if (u.startsWith('http://localhost')) return route.continue();
    return route.abort();
  });
  await page.goto(`http://localhost:${server.address().port}/index.html`); await page.waitForTimeout(2500);
  const r = await page.evaluate(async () => {
    const N = 20000, text = Array.from({ length: N }, (_, i) => `N${i} G1 X${i % 90}.5 Y${i % 40}.25 F800`).join('\n');
    GCED.edited = true; GCED.text = text; GCED.base = text; gcedShow(true);
    const ta = document.getElementById('geIn'); ta.value = text; GCED.el.style.cssText = 'position:fixed;left:0;top:0;width:800px;height:700px;display:flex;flex-direction:column;z-index:9999'; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); gcedDraw();
    const hl = document.getElementById('geHl'), rows0 = hl.children.length;
    const a = gcedLines(), b = gcedLines();
    ta.scrollTop = 19 * 10000; ta.dispatchEvent(new Event('scroll'));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const gut = document.getElementById('geGutIn').firstChild.textContent;
    ta.setSelectionRange(text.indexOf('N5 '), text.indexOf('N5 ')); gcedDraw();
    return { rows0, same: a === b, n: a.length, gut, ln: document.getElementById('geLn').textContent, count: document.getElementById('geCount').textContent };
  });
  ok(r.rows0 > 10 && r.rows0 < 200, `only the visible rows are drawn (${r.rows0} of ${r.n})`);
  ok(r.same, 'lines are split once per program text');
  ok(+r.gut > 9900 && +r.gut < 10000, `scrolling redraws the window around the new position (first row ${r.gut})`);
  ok(/Ln 6,/.test(r.ln), `cursor line is counted (${r.ln})`);
  ok(/20,000 lines/.test(r.count), 'line count shown');
  ok(!errors.length, 'no page errors ' + errors.join('|'));
  await browser.close(); server.close(); process.exit(fails ? 1 : 0);
})();
