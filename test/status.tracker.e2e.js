// The status tracker (Trace.track, on by default) and dev mode's "Export status": every step a person takes is kept, numbered, with no
// console output unless the console debug log is on; Export status downloads them (text or JSON); passwords stay out; a reload keeps the trail;
// the tracker can be switched off and on again; dev mode's own steps are marked.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/status.tracker.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (3d-modeler.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert'), fs = require('fs');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 1500)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 850 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const logs = [], errs = [];
  page.on('console', m => { const t = m.text(); if (/\[3D Modeler/.test(t)) logs.push(t); });
  page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.dismiss());
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' })); await page.route(/gate\.js/, r => r.abort());
  await page.route(/fonts\.g/, r => r.abort());
  const url = 'file://' + path.resolve(__dirname, '..', '3d-modeler.html') + '?dev=1';
  await page.goto(url); await page.waitForTimeout(2500);
  await page.evaluate(() => { window.DATUM_PREMIUM = true; window.DATUM_AUTO = true; loadDoc(SAMPLES.find(s => s.name === 'Pocketed plate').make(), 't'); });
  await page.waitForTimeout(800);
  const extrude = () => page.evaluate(() => { const sk = doc.features.find(f => f.type === 'sketch'); selProfiles.push({ sketch: sk.id, pt: { x: 0, y: 0 } }); cmdExtrude(); });
  const steps = () => page.evaluate(() => Trace.buf.map(e => `${e.kind} ${e.what}`));
  const exportAs = async (fmt) => { const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(f => { window.exportStatus(f); }, fmt)]); return { name: dl.suggestedFilename(), text: fs.readFileSync(await dl.path(), 'utf8') }; };

  await ok('on by default: steps are recorded and nothing is written to the console', async () => {
    assert.deepStrictEqual(await page.evaluate(() => [Trace.track, Trace.on, Trace.live]), [true, false, true]);
    logs.length = 0;
    await extrude(); await page.waitForTimeout(600);
    const i = await page.$('#panel input[type=number]'); await i.click(); await i.press('Control+A'); await i.type('7.5'); await i.press('Tab');
    await page.mouse.move(700, 400); await page.mouse.wheel(0, -300); await page.waitForTimeout(500);
    await page.mouse.down(); await page.mouse.move(760, 430, { steps: 4 }); await page.mouse.up();
    await page.setViewportSize({ width: 1300, height: 800 }); await page.waitForTimeout(1200);
    const all = (await steps()).join('\n');
    for (const re of [/state command opened: none → extrude/, /type panel › Distance.*: “7\.5”/, /change panel › Distance \(in\): [\d.]+ → 7\.5 in/, /verify Distance \(in\): shows 7\.5 in/, /model model rebuilt: 1 body · overall 120 × 190\.5 × 80 mm/, /view zoom: view height/, /view .*orbit:/, /resize window: \d+ × \d+ → 1300 × 800 px/])
      assert(re.test(all), 'missing ' + re + '\n' + all.slice(-2500));
    assert.deepStrictEqual(logs.filter(l => !/debug log/.test(l)), [], 'the console stays quiet while the console log is off');
  });

  await ok('Export status: a numbered text file with the state now and every step in order', async () => {
    const { name, text } = await exportAs();
    assert(/^datum-status-\d{8}-\d{6}\.txt$/.test(name), name);
    assert(/3D MODELER STATUS/.test(text) && /== STATE NOW =+/.test(text) && /== STEPS =+/.test(text), text.slice(0, 800));
    assert(/Status tracker on {3}Console log off/.test(text), text.slice(0, 1200));
    assert(/workspace +design/.test(text) && /model +120 × 190\.5 × 80 mm overall/.test(text), text.slice(0, 1600));
    const rows = text.split('== STEPS')[1].split('\n').filter(l => /^ +\d+  \d\d:\d\d:\d\d\.\d{3}  \+/.test(l));
    assert(rows.length > 15, rows.length + ' rows');
    const nums = rows.map(l => +l.trim().split(/\s+/)[0]); for (let k = 1; k < nums.length; k++) assert(nums[k] > nums[k - 1], 'steps out of order at ' + nums[k]);
    assert(rows.some(l => /type .*panel › Distance/.test(l)) && rows.some(l => /change .*panel › Distance \(in\): [\d.]+ → 7\.5 in/.test(l)) && rows.some(l => /export .*status exported/.test(l)), 'expected rows missing');
  });

  await ok('Export status as JSON carries the same steps', async () => {
    const { name, text } = await exportAs('json');
    assert(/\.json$/.test(name)); const j = JSON.parse(text);
    assert(j.tracker === 'on' && j.steps.length > 15 && j.steps[0].n < j.steps[1].n && j.steps.some(s => s.kind === 'change' && /→ 7\.5 in/.test(s.what)), text.slice(0, 600));
  });

  await ok('passwords and tokens are left out', async () => {
    await page.evaluate(() => { const i = document.createElement('input'); i.type = 'password'; i.id = 'pw'; document.body.appendChild(i); });
    await page.click('#pw'); await page.keyboard.type('hunter2-secret'); await page.keyboard.press('Tab');
    await page.evaluate(() => Trace.log('call', 'sync with token=abc123XYZ and Bearer eyJhbGciOi'));
    const { text } = await exportAs(); assert(!/hunter2|abc123XYZ|eyJhbGciOi/.test(text), 'a secret reached the file');
    assert(/\[hidden\]/.test(text) && /token=\[redacted\]/.test(text) && /Bearer \[redacted\]/.test(text), 'hidden marks missing');
    await page.evaluate(() => document.getElementById('pw').remove());
  });

  await ok('dev panel: the backtick key shows Export status, a step count and the tracker switch', async () => {
    await page.locator('body').click({ position: { x: 700, y: 400 } }); await page.keyboard.press('`'); await page.waitForTimeout(500);
    assert.strictEqual(await page.evaluate(() => document.getElementById('devTrack').checked), true);
    assert(/\d+ steps recorded/.test(await page.textContent('#devSteps')), await page.textContent('#devSteps'));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#devExport')]);
    assert(/\.txt$/.test(dl.suggestedFilename()) && /== STEPS/.test(fs.readFileSync(await dl.path(), 'utf8')));
    const [dj] = await Promise.all([page.waitForEvent('download'), page.click('#devExportJson')]);
    assert(/\.json$/.test(dj.suggestedFilename()));
  });

  await ok('the tracker can be switched off (nothing new is kept) and on again', async () => {
    await page.click('#devTrack'); assert.strictEqual(await page.evaluate(() => [Trace.track, Trace.live]).then(a => a.join()), 'false,false');
    assert.strictEqual(await page.evaluate(() => localStorage.getItem('datum.track')), '0');
    await page.waitForTimeout(400);
    const n0 = await page.evaluate(() => Trace.buf.length);
    await page.mouse.move(700, 400); await page.mouse.wheel(0, 200); await page.setViewportSize({ width: 1250, height: 780 }); await page.keyboard.press('x'); await page.waitForTimeout(1000);
    const grew = (await steps()).slice(n0).filter(s => !/^click |^key /.test(s));   // Trace's own click and key lines are the app's, always kept
    assert.deepStrictEqual(grew.filter(s => /^(view|resize|drag|type|change|state|panel) /.test(s) && !/^view wheel/.test(s)), [], 'watchers stopped');
    assert(/tracker is off/.test(await page.textContent('#devSteps')), 'the panel says so');
    await page.click('#devTrack'); assert.strictEqual(await page.evaluate(() => Trace.live), true);
    await page.mouse.move(700, 400); await page.mouse.wheel(0, -200); await page.waitForTimeout(800);
    assert((await steps()).slice(n0).some(s => /^drag wheel/.test(s)), 'recording again');
    await page.evaluate(() => localStorage.removeItem('datum.track'));
  });

  await ok('steps done by dev mode are marked "dev"', async () => {
    await page.evaluate(() => { Trace.auto = true; Trace.log('click', 'automated click'); Trace.auto = false; Trace.log('click', 'human click'); });
    const { text } = await exportAs();
    assert(/click +dev +\w* +automated click/.test(text) && /click +\w* +human click/.test(text) && !/click +dev +\w* +human click/.test(text), text.split('\n').filter(l => /click/.test(l)).slice(-4).join('\n'));
  });

  await ok('a reload keeps the trail, listed before the new steps', async () => {
    await page.evaluate(() => Trace.log('call', 'marker before reload'));
    await page.reload(); await page.waitForTimeout(3000);
    const { text } = await exportAs();
    const a = text.indexOf('== BEFORE THE PAGE WAS RELOADED'), b = text.indexOf('== STEPS');
    assert(a > 0 && a < b, 'no earlier section'); assert(/marker before reload/.test(text.slice(a, b)) && !/marker before reload/.test(text.slice(b)));
    assert(/earlier step\(s\) from before the last reload/.test(text));
  });

  await ok('no page errors', async () => assert.deepStrictEqual(errs, []));
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
