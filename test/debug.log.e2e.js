// The console debug log (Trace + debug-trace.js): silent while off; when on it reports clicks, typing, every value change as
// "from → to" with its unit and the model size, whether the field still shows what was typed, the 3D view (zoom, pan, orbit), resizes,
// drags, panels and state changes. Dev mode switches it on for its run and off after it (without saving the choice).
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/debug.log.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (3d-modeler.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 1200)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  const logs = [], errs = [];
  page.on('console', m => { const t = m.text(); if (/\[3D Modeler/.test(t)) logs.push(t.replace(/%c/g, '').replace(/ color:[^ ]*(?: color:[^ ]*)*/g, '')); });
  page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.dismiss());
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' })); await page.route(/gate\.js/, r => r.abort());
  await page.route(/fonts\.g/, r => r.abort());
  await page.goto('file://' + path.resolve(__dirname, '..', '3d-modeler.html') + '?dev=1'); await page.waitForTimeout(2500);
  await page.evaluate(() => { window.DATUM_PREMIUM = true; window.DATUM_AUTO = true; loadDoc(SAMPLES.find(s => s.name === 'Pocketed plate').make(), 't'); });
  await page.waitForTimeout(800);
  const since = async (f, ms = 900) => { logs.length = 0; await f(); await page.waitForTimeout(ms); return logs.join('\n'); };
  const extrude = () => page.evaluate(() => { const sk = doc.features.find(f => f.type === 'sketch'); selProfiles.push({ sketch: sk.id, pt: { x: 0, y: 0 } }); cmdExtrude(); });

  await ok('off by default: using the page writes nothing to the console', async () => {
    assert.strictEqual(await page.evaluate(() => Trace.on), false);
    const out = await since(async () => {
      await extrude(); await page.waitForTimeout(600);
      const i = await page.$('#panel input[type=number]'); await i.click(); await i.press('Control+A'); await i.type('7.5'); await i.press('Tab');
      await page.mouse.move(700, 400); await page.mouse.wheel(0, -300); await page.mouse.down(); await page.mouse.move(760, 430, { steps: 4 }); await page.mouse.up();
      await page.setViewportSize({ width: 1300, height: 800 }); await page.keyboard.press('Escape');
    }, 1200);
    const lines = logs.filter(l => !/debug log (is )?(on|off)/.test(l)); assert.deepStrictEqual(lines, [], lines.join('\n').slice(0, 600));
  });

  await ok('on: typing, the change from → to with its unit and mm, the model size and the check afterwards', async () => {
    await page.evaluate(() => { Trace.set(true, false); }); await page.waitForTimeout(300);
    const out = await since(async () => {
      await extrude(); await page.waitForTimeout(600);
      const i = await page.$('#panel input[type=number]'); await i.click(); await i.press('Control+A'); await i.type('7.5'); await i.press('Tab');
    }, 1500);
    for (const re of [/state command opened: none → extrude/, /panel side panel: .*Extrude/, /type panel › Distance.*: “7”/, /type panel › Distance.*: “7\.5”/, /key Tab/,
      /change panel › Distance \(in\): [\d.]+ → 7\.5 in \(Δ \+[\d.]+\) = [\d.]+ → 190\.5 mm/, /command\.f\.dist: [\d.]+ → 190\.5/, /model model rebuilt: 1 body · overall 120 × 190\.5 × 80 mm/, /verify Distance \(in\): shows 7\.5 in, as entered/])
      assert(re.test(out), 'missing ' + re + '\n' + out.slice(0, 2500));
  });

  await ok('on: committing and undoing report what changed and the new size', async () => {
    const out = await since(async () => { await page.evaluate(() => { const b = [...document.querySelectorAll('#panel button')].find(b => /^OK$/i.test(b.textContent.trim())); b.click(); }); await page.waitForTimeout(700); await page.evaluate(() => undo()); }, 1200);
    for (const re of [/history “Extrude\d+ created” \(mm\): 1 change \[added Extrude\d+\]/, /state command exited: extrude → none/, /call undo/, /model model rebuilt: 1 body · overall 120 × 15 × 80 mm \(Δ \+0, -175\.5, \+0\)/])
      assert(re.test(out), 'missing ' + re + '\n' + out.slice(0, 2500));
  });

  await ok('on: zoom, pan and orbit of the 3D view say what moved, by how much, and what caused it', async () => {
    const out = await since(async () => {
      await page.mouse.move(700, 400); await page.mouse.wheel(0, -300); await page.waitForTimeout(500);
      await page.mouse.move(700, 400); await page.mouse.down(); await page.mouse.move(780, 440, { steps: 6 }); await page.mouse.up();
    }, 1000);
    assert(/view zoom: view height [\d.]+ → [\d.]+ mm \(×[\d.]+\), [\d.]+ → [\d.]+ px per mm.*\[by wheel\]/.test(out), out.slice(0, 1800));
    assert(/orbit: [\d.]+° — azimuth -?[\d.]+° → -?[\d.]+°, elevation -?[\d.]+° → -?[\d.]+°.*\[by left drag\]/.test(out), out.slice(0, 1800));
    assert(/drag wheel on canvas#ov: \d+ turns?, -300 px/.test(out) && /drag left drag ended on canvas#ov: 80, 40 px/.test(out), out.slice(0, 1800));
  });

  await ok('on: resizing the window reports the window, the canvases and the panels', async () => {
    const out = await since(() => page.setViewportSize({ width: 1200, height: 760 }), 1200);
    for (const re of [/resize window: \d+ × \d+ → 1200 × 760 px/, /resize canvas#ov: [\d.]+ × [\d.]+ → [\d.]+ × [\d.]+ px \(Δ -?[\d.]+, -?[\d.]+\)/, /resize aside#panel/, /view canvas [\d.]+ × [\d.]+ → [\d.]+ × [\d.]+ px/])
      assert(re.test(out), 'missing ' + re + '\n' + out.slice(0, 2000));
  });

  await ok('on: a value set from script and a checkbox also report from → to', async () => {
    const out = await since(async () => {
      await page.evaluate(() => { const i = document.createElement('input'); i.type = 'number'; i.id = 'dbgTest'; i.setAttribute('value', '4'); document.getElementById('panel').appendChild(i); });
      await page.evaluate(() => { const i = document.getElementById('dbgTest'); i.value = '9'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); });
      await page.evaluate(() => { const c = document.createElement('input'); c.type = 'checkbox'; c.id = 'dbgChk'; document.getElementById('panel').appendChild(c); c.click(); });
    }, 700);
    assert(/change panel › dbgTest: 4 → 9 \(Δ \+5\)/.test(out), out.slice(0, 1500)); assert(/change panel › dbgChk: false → true/.test(out), out.slice(0, 1500));
    await page.evaluate(() => { document.getElementById('dbgTest').remove(); document.getElementById('dbgChk').remove(); });
  });

  await ok('on: a field that does not keep what was typed is called out', async () => {
    const out = await since(async () => {
      await page.evaluate(() => { const i = document.createElement('input'); i.type = 'number'; i.id = 'dbgClamp'; i.setAttribute('value', '1'); document.getElementById('panel').appendChild(i); i.addEventListener('change', () => { i.value = '5'; }); i.value = '50'; i.dispatchEvent(new Event('change', { bubbles: true })); });
    }, 700);
    assert(/verify dbgClamp: entered 50 but the field now shows 5/.test(out), out.slice(0, 1500));
    await page.evaluate(() => document.getElementById('dbgClamp').remove());
  });

  await ok('on: workspace changes, the debug menu entry and turning it off', async () => {
    logs.length = 0; await page.evaluate(() => setWorkspace('cam'));
    for (let k = 0; k < 40 && !/state workspace changed: design → cam/.test(logs.join('\n')); k++) await page.waitForTimeout(250);
    assert(/state workspace changed: design → cam/.test(logs.join('\n')), logs.join('\n').slice(0, 1500));
    await page.evaluate(() => Trace.toggle()); assert.strictEqual(await page.evaluate(() => Trace.on), false);
    const quiet = await since(async () => { await page.mouse.move(700, 400); await page.mouse.wheel(0, 200); await page.setViewportSize({ width: 1250, height: 760 }); }, 800);
    assert.deepStrictEqual(logs.filter(l => !/debug log (is )?(on|off)/.test(l)), []);
    await page.evaluate(() => setWorkspace('design'));
  });

  await ok('dev mode turns it on for its run and off after, without saving the choice', async () => {
    // the early-access build reloads itself with ?dev=1 before a run (its hidden tabs come back); start there so the page stays put
    const p = await browser.newPage({ viewport: { width: 1400, height: 850 } }), dl = [];
    p.on('console', m => { const t = m.text(); if (/\[3D Modeler/.test(t)) dl.push(t.replace(/%c/g, '').replace(/ color:[^ ]*(?: color:[^ ]*)*/g, '')); }); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.dismiss());
    await p.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' })); await p.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' })); await p.route(/gate\.js/, r => r.abort()); await p.route(/fonts\.g/, r => r.abort());
    await p.goto('file://' + path.resolve(__dirname, '..', '3d-modeler.html') + '?dev=1'); await p.waitForTimeout(3500);
    assert.strictEqual(await p.evaluate(() => Trace.on), false);
    await p.locator('body').click({ position: { x: 700, y: 400 } }); await p.keyboard.press('`'); await p.waitForTimeout(500);
    assert.strictEqual(await p.evaluate(() => document.getElementById('devLog').checked), true, 'the debug log option is on by default');
    dl.length = 0;
    await p.evaluate(() => {
      document.querySelectorAll('.dev input[data-t]').forEach(i => { i.checked = i.dataset.t === 'design'; }); document.getElementById('devMode').value = 'quick'; document.getElementById('devCombo').checked = false; document.getElementById('devFlow').checked = false;
      const M = window.__dev.MODES.quick; M.pairs = 2; M.triples = 2; M.seqs = 2; window.__devDone = false; window.__devDuring = false;
      const t = setInterval(() => { if (Trace.on) window.__devDuring = true; }, 100); window.__dev.start(['design']).then(() => { window.__devDone = true; clearInterval(t); });
    });
    await p.waitForFunction(() => window.__devDone, null, { timeout: 420000, polling: 2000 });
    assert.strictEqual(await p.evaluate(() => window.__devDuring), true, 'on during the run');
    assert.strictEqual(await p.evaluate(() => Trace.on), false, 'off after the run');
    assert.strictEqual(await p.evaluate(() => localStorage.getItem('datum.trace')), null, 'the choice is not saved');
    const all = dl.join('\n'); assert(/dev dev mode run started/.test(all) && /dev dev mode run finished/.test(all), all.slice(0, 600));
    for (const kind of ['click', 'change', 'state', 'panel']) assert(new RegExp(' ' + kind + ' ').test(all), 'no ' + kind + ' lines during the run');
    assert(dl.length > 200, 'the run wrote ' + dl.length + ' lines');
    await p.close();
  });

  await ok('no page errors', async () => assert.deepStrictEqual(errs, []));
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
