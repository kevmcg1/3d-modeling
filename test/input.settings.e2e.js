// Export log button and the settings cog: log contents, ring buffer, secrets, mouse / keyboard layouts and rebinding.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/input.settings.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (index.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert'), fs = require('fs');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 400)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 850 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' }));
  const url = 'file://' + path.resolve(__dirname, '..', 'index.html');
  const load = async () => { await page.goto(url); await page.waitForTimeout(1200); };
  await load();
  const exportText = async () => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnExportLog')]);
    return { name: dl.suggestedFilename(), text: fs.readFileSync(await dl.path(), 'utf8') };
  };
  const openSettings = async () => { await page.click('#btnSettings'); await page.waitForSelector('#stLayout'); };
  const closeSettings = async () => { await page.click('.st [data-mx].btn'); await page.waitForTimeout(50); };
  const quat = () => page.evaluate(() => view.quat.toArray());
  const qd = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));   // the view may settle a little after a drag (level snap)
  const drag = async (button, dx = 120, dy = 60, mods = []) => {
    const r = await page.evaluate(() => { const b = document.getElementById('ov').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
    for (const m of mods) await page.keyboard.down(m);
    await page.mouse.move(r.x, r.y); await page.mouse.down({ button });
    for (let i = 1; i <= 6; i++) await page.mouse.move(r.x + dx * i / 6, r.y + dy * i / 6);
    await page.mouse.up({ button });
    for (const m of mods) await page.keyboard.up(m);
    await page.waitForTimeout(80);
  };
  const reset = async () => { await page.evaluate(() => { localStorage.clear(); }); await load(); };

  await ok('top right has an obvious Export log button and a settings cog', async () => {
    for (const id of ['btnExportLog', 'btnSettings']) {
      const b = await page.evaluate(i => { const r = document.getElementById(i).getBoundingClientRect(); return { r: r.right, t: r.top, w: r.width, h: r.height, vis: getComputedStyle(document.getElementById(i)).visibility }; }, id);
      assert(b.w > 30 && b.h > 20 && b.t < 80 && b.r > 1300 && b.vis === 'visible', id + ' ' + JSON.stringify(b));
    }
    assert.strictEqual(await page.textContent('#btnExportLog'), 'Export log');
  });

  await ok('export log: a .txt with environment, settings, state and what the user did, incl. errors, and no secrets', async () => {
    await page.evaluate(() => { localStorage.setItem('datum.apitoken', 'SUPERSECRETVALUE'); });
    await page.click('[data-ws="cam"]'); await page.waitForTimeout(200); await page.click('[data-ws="design"]'); await page.waitForTimeout(200);
    await page.keyboard.press('v'); await page.waitForTimeout(100);
    await drag('left');
    await page.evaluate(() => { console.warn('warn-marker'); console.error('error-marker password=hunter2 Bearer abc.def.ghi'); Promise.reject(new Error('reject-marker')); setTimeout(() => { throw new Error('uncaught-marker'); }, 0); });
    await page.waitForTimeout(200);
    const { name, text } = await exportText();
    assert(/^datum-log-\d{8}-\d{6}\.txt$/.test(name), name);
    for (const s of ['APP, BROWSER AND SCREEN', 'SETTINGS', 'CURRENT STATE', 'EVENT LOG', 'User agent:', 'Screen: ', 'Window: 1400×850', 'Graphics:', 'Mouse: {', 'Workspace: design',
      'setWorkspace cam', 'setWorkspace design', ' key ', 'view ', 'left drag', 'warn: warn-marker', 'error: error-marker', 'Unhandled promise rejection: reject-marker', 'uncaught-marker', 'page loaded']) assert(text.includes(s), 'missing ' + s);
    assert(!text.includes('SUPERSECRETVALUE') && !text.includes('hunter2') && !text.includes('abc.def.ghi'), 'secret leaked');
    assert(text.includes('datum.apitoken = [redacted]'));
    assert(/\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3}/.test(text), 'timestamps');
  });

  await ok('log is a capped ring buffer and says what it dropped', async () => {
    const n = await page.evaluate(() => { for (let i = 0; i < 9000; i++) Trace.log('click', 'filler ' + i); return Trace.buf.length; });
    assert(n <= 5000, 'buffer grew to ' + n);
    const { text } = await exportText();
    assert(/were dropped; the log keeps the latest 4000/.test(text) && text.includes('filler 8999') && !text.includes('filler 100\n'));
  });

  await ok('settings cog opens a panel with mouse mapping and a keyboard layout selector', async () => {
    await reset(); await openSettings();
    const opts = await page.$$eval('#stLayout option', o => o.map(x => x.textContent));
    for (const n of ['Blender', 'SolidWorks', 'Fusion', 'Mastercam', 'AutoCAD', 'Inventor', 'Onshape', 'FreeCAD', 'Rhino']) assert(opts.includes(n), n);
    assert(await page.$('[data-ms="left"]') && await page.$('[data-ms="middle"]') && await page.$('[data-ms="right"]') && await page.$('[data-ms="wheel"]'));
    assert.strictEqual(await page.evaluate(() => document.getElementById('stLayout').value), 'datum');
  });

  await ok('picking Blender sets the mouse and shortcuts, and it is saved between visits', async () => {
    await page.selectOption('#stLayout', 'blender');
    const st = await page.evaluate(() => ({ m: { ...MOUSE }, k: DatumKeys.get() }));
    assert.strictEqual(st.m.middle, 'orbit'); assert.strictEqual(st.m.midShift, 'pan'); assert.strictEqual(st.m.left, 'none'); assert.strictEqual(st.m.wheelAt, 'center');
    assert.strictEqual(st.k.fit, 'home'); assert.strictEqual(st.k.view2d, '5'); assert.strictEqual(st.k.m_move, 'g');
    assert.strictEqual(await page.evaluate(() => document.getElementById('stLayout').value), 'blender');
    await load();
    const again = await page.evaluate(() => ({ mid: MOUSE.middle, fit: DatumKeys.get().fit }));
    assert.deepStrictEqual(again, { mid: 'orbit', fit: 'home' });
    await openSettings();
    assert.strictEqual(await page.evaluate(() => document.getElementById('stLayout').value), 'blender');
    await closeSettings();
  });

  await ok('mouse buttons do what they are set to (Blender: middle orbits, shift+middle pans, left drag does nothing)', async () => {
 let q0 = await quat(); await drag('left'); await page.waitForTimeout(400); assert(qd(await quat(), q0) < 0.02, 'left drag moved the view');
    await drag('middle'); await page.waitForTimeout(900); assert(qd(await quat(), q0) > 0.05, 'middle drag did not orbit');
    q0 = await quat();const t0 = await page.evaluate(() => view.target.toArray().join());
    await drag('middle', 120, 60, ['Shift']); await page.waitForTimeout(600); assert(qd(await quat(), q0) < 0.02, 'shift+middle orbited'); assert.notStrictEqual(await page.evaluate(() => view.target.toArray().join()), t0, 'shift+middle did not pan');
  });

  await ok('default layout: left and right orbit, middle pans; each button can be changed one by one', async () => {
    await page.evaluate(() => { localStorage.clear(); }); await load();
    let q0 = await quat(); await drag('left'); await page.waitForTimeout(900); assert(qd(await quat(), q0) > 0.05, 'left');
    q0 = await quat(); await drag('right'); await page.waitForTimeout(900); assert(qd(await quat(), q0) > 0.05, 'right');
    await openSettings(); await page.selectOption('[data-ms="right"]', 'none'); await page.selectOption('[data-ms="left"]', 'pan'); await closeSettings();
    q0 = await quat(); await drag('right'); await page.waitForTimeout(600); assert(qd(await quat(), q0) < 0.02, 'right none');
    const t0 = await page.evaluate(() => view.target.toArray().join()); await drag('left'); assert.notStrictEqual(await page.evaluate(() => view.target.toArray().join()), t0, 'left pan');
    await openSettings(); assert.strictEqual(await page.evaluate(() => document.getElementById('stLayout').value), 'custom'); await closeSettings();
  });

  await ok('wheel: zooms by default, can be switched off', async () => {
    await reset();
    const h0 = await page.evaluate(() => view.viewH);
    const r = await page.evaluate(() => { const b = document.getElementById('ov').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
    await page.mouse.move(r.x, r.y); await page.mouse.wheel(0, -400); await page.waitForTimeout(1500);   // eased zoom settles
    const h1 = await page.evaluate(() => view.viewH); assert(h1 < h0, 'zoom in');
    await page.evaluate(() => { MOUSE.wheel = 'none'; }); await page.mouse.wheel(0, -400); await page.waitForTimeout(800);
    assert(Math.abs(await page.evaluate(() => view.viewH) / h1 - 1) < 1e-4, 'wheel off still zoomed');
  });

  await ok('rebinding a shortcut: new key works, old key stops, conflicts are shown, reset and persistence', async () => {
    await reset();
    const spy = () => page.evaluate(() => { window.__acts = []; window.action = a => { window.__acts.push(a); }; });
    await spy(); await page.keyboard.press('e');
    assert.deepStrictEqual(await page.evaluate(() => window.__acts), ['extrude'], 'default e');
    await load();
    await openSettings(); await page.click('[data-tab="keys"]');
    await page.click('[data-rec="extrude"]'); assert((await page.textContent('[data-rec="extrude"]')).includes('Press'));
    await page.keyboard.press('q');
    assert.strictEqual(await page.evaluate(() => DatumKeys.get().extrude), 'q');
    assert((await page.textContent('[data-rec="extrude"]')).trim() === 'Q');
    // conflict: give "Home view" the key that Fit uses
    await page.click('[data-rec="home"]'); await page.keyboard.press('Shift+F');
    assert(await page.$('.kr.bad[data-id="home"]') && await page.$('.kr.bad[data-id="fit"]'), 'conflict rows');
    assert((await page.textContent('.kr[data-id="home"] small')).includes('Also used by Fit'));
    await page.click('[data-kreset="home"]'); assert.strictEqual(await page.$('.kr.bad'), null, 'conflict cleared');
    // reserved keys are refused
    await page.click('[data-rec="fit"]'); await page.keyboard.press('Delete'); assert((await page.textContent('[data-rec="fit"]')).includes('Press')); await page.keyboard.press('Escape');
    await closeSettings();
    await spy(); await page.keyboard.press('q'); await page.keyboard.press('e');
    assert.deepStrictEqual(await page.evaluate(() => window.__acts), ['extrude'], 'q works, e does not');
    await load();
    assert.strictEqual(await page.evaluate(() => DatumKeys.get().extrude), 'q', 'saved');
    await spy(); await page.keyboard.press('q'); await page.keyboard.press('e');
    assert.deepStrictEqual(await page.evaluate(() => window.__acts), ['extrude'], 'after reload');
    await openSettings(); await page.click('#stResetAll'); await closeSettings();
    await spy(); await page.keyboard.press('e'); await page.keyboard.press('q');
    assert.deepStrictEqual(await page.evaluate(() => window.__acts), ['extrude'], 'reset to defaults');
  });

  await ok('a template moves a default key out of the way instead of leaving two meanings', async () => {
    await reset();
    const spy = () => page.evaluate(() => { window.__acts = []; window.action = a => { window.__acts.push(a); }; });
    await openSettings(); await page.selectOption('#stLayout', 'fusion'); await closeSettings();
    await spy();
    await page.keyboard.press('f'); await page.keyboard.press('m'); await page.keyboard.press('i'); await page.keyboard.press('g');
    assert.deepStrictEqual(await page.evaluate(() => window.__acts), ['fillet3', 'f:move', 'measure'], 'fusion f=fillet, m=move, i=measure, g=nothing');
  });

  await ok('typing in a field never triggers shortcuts; a password field is never logged', async () => {
    await reset();
    await page.evaluate(() => { window.__acts = []; window.action = a => { window.__acts.push(a); }; const i = document.createElement('input'); i.id = 'tmpIn'; i.type = 'password'; document.body.appendChild(i); i.focus(); });
    await page.keyboard.type('hunter2e');
    assert.deepStrictEqual(await page.evaluate(() => window.__acts), []);
    const { text } = await exportText();
    const bad = text.split('\n').filter(l => l.includes('hunter2')); assert.deepStrictEqual(bad, []);
  });

  await ok('no page errors besides the ones the test raised on purpose', async () => {
    const real = errs.filter(e => !/uncaught-marker|reject-marker/.test(e));
    assert.deepStrictEqual(real, []);
  });

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
