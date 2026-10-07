// Wire EDM G-code: every wire sample posts a program a Robocut control can run. It is read the way the machine reads it: units, absolute mode, a start point,
// wire threaded before the first cut and cut after the last, compensation switched on before it is used and off again after each pass, every move inside the
// stock, and an end of program.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/cam.wire.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (index.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 900)); } };
// the machine's reading of a wire program: returns a list of problems
function wireCheck(text, st, inch) {
  const probs = [], L = text.split('\n').map(s => s.replace(/\(.*?\)/g, '').trim()).filter(Boolean);
  if (L[0] !== '%') probs.push('does not start with %');
  if (!L.some(l => /^G2[01]\b/.test(l))) probs.push('no G20 / G21');
  if (inch !== undefined && !L.some(l => new RegExp('^G' + (inch ? 20 : 21) + '\\b').test(l))) probs.push('wrong units');
  if (!L.some(l => /\bG90\b/.test(l))) probs.push('not in absolute mode');
  if (!L.some(l => /^G92 X\S+ Y\S+/.test(l))) probs.push('no G92 start point');
  let threaded = false, comp = false, cuts = 0, threads = 0, cutoffs = 0, ended = false, prev = null, depth = 0;
  const lim = st.map(v => v * (inch ? 1 / 25.4 : 1)), pad = inch ? 2 : 50;
  L.forEach((l, i) => {
    if (/^M60\b/.test(l)) { if (threaded) probs.push('line ' + i + ': thread while threaded'); threaded = true; threads++; }
    if (/^M45\b/.test(l)) { if (!threaded) probs.push('line ' + i + ': cut wire that is not threaded'); threaded = false; cutoffs++; }
    if (/^M(30|02)\b/.test(l)) ended = true;
    const m = l.match(/^(G4[012] )?(G0[0123]) /);
    if (m) {
      if (m[2] === 'G01' || m[2] === 'G02' || m[2] === 'G03') { if (!threaded) probs.push('line ' + i + ': a cut before the wire is threaded'); cuts++; }
      if (m[1] === 'G41 ' || m[1] === 'G42 ') { if (comp) probs.push('line ' + i + ': compensation turned on twice'); comp = true; }
      if (m[1] === 'G40 ') { if (!comp) probs.push('line ' + i + ': G40 with no compensation on'); comp = false; }
      for (const a of l.matchAll(/\b([XY])(-?\d+\.?\d*)/g)) {
        const v = +a[2], k = a[1] === 'X' ? 0 : 2;
        if (!isFinite(v)) probs.push('line ' + i + ': not a number');
        else if (v < lim[k] - pad || v > lim[k + 1] + pad) probs.push('line ' + i + ': ' + a[1] + v + ' is outside the stock');
      }
    } else if (/^S\d+ D\d+/.test(l)) { if (comp) probs.push('line ' + i + ': offset changed with compensation on'); }
  });
  if (comp) probs.push('compensation left on at the end');
  if (threaded) probs.push('wire left threaded at the end');
  if (!cuts) probs.push('no cutting moves');
  if (threads !== cutoffs) probs.push(threads + ' threadings but ' + cutoffs + ' wire cuts');
  if (!ended) probs.push('no M30');
  return probs;
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' }));
  await page.route(/fonts\.g/, r => r.abort());
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await page.waitForTimeout(2000);
  const names = await page.evaluate(() => SAMPLES.filter(s => s.axes === 'wire').map(s => s.name));
  await ok('there are wire samples to check', async () => assert(names.length >= 10, 'wire samples: ' + names.length));
  for (const name of names) await ok('wire G-code: ' + name, async () => {
    const r = await page.evaluate(async name => {
      const e0 = camEpoch; loadDoc(SAMPLES.find(x => x.name === name).make(), 'test'); setWorkspace('cam');
      for (let i = 0; i < 200 && camEpoch === e0; i++) await new Promise(r => setTimeout(r, 50));
      await waitToolpaths(90000);
      const st = camStock(), g = postGcode(), ops = cam().ops.filter(o => o.type === 'wire' && !o.sup);
      return { text: g.text, st: [st.x0, st.x1, st.y0, st.y1], inch: isIn(), loops: ops.reduce((n, o) => n + ((toolpath(o) || {}).wire || []).length, 0), warn: ops.flatMap(o => (toolpath(o) || {}).warn || []) };
    }, name);
    assert(r.loops > 0, 'no wire path was made. ' + r.warn.join(' | '));
    assert.deepStrictEqual(wireCheck(r.text, r.st, r.inch).slice(0, 5), []);
  });
  await ok('the page raised no errors', async () => assert.deepStrictEqual(errs, [], errs.join('\n')));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
