// Manufacture: the guided Manual flow (cam-flow.js): one toolpath picker, geometry / tool / parameters steps, smart defaults, last-used values,
// select-by-feature, live preview, Enter / Esc / right-click.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/cam.flow.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (index.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 700)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' }));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await page.waitForTimeout(2000);
  await page.evaluate(() => { const s = SAMPLES.find(x => x.name === 'Pocketed plate'); loadDoc(s.make(), 'test'); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => setWorkspace('cam'));
  await page.waitForTimeout(1200);
  const st = () => page.evaluate(() => { const op = opById(CAMUI.op); return { view: CAMUI.view, ops: cam().ops.length, step: CAMFLOW.FLOW.step, tab: CAMFLOW.FLOW.tab, op: op && { name: op.name, type: op.type, cm: op.cm, tool: op.tool, sd: op.stepdown, chains: (op.chains || []).length }, hist: hist.labels.slice(-2) }; });
  const pick = async (q) => { await page.keyboard.press('n'); await page.waitForTimeout(250); if (q) await page.keyboard.type(q); await page.waitForTimeout(150); await page.keyboard.press('Enter'); await page.waitForTimeout(700); };

  await ok('N opens the picker: grouped, searchable, and it lists every MC_CM mode', async () => {
    await page.keyboard.press('n'); await page.waitForTimeout(300);
    const all = await page.evaluate(() => [...document.querySelectorAll('#cfPicker .cf-item .nm')].map(e => e.textContent));
    const groups = await page.evaluate(() => [...document.querySelectorAll('#cfPicker .cf-grp')].map(e => e.textContent));
    const mc = await page.evaluate(() => Object.values(MC_CM).map(m => m.name));
    assert(['Contour', 'Pocket', 'Face', 'Spot Drill', '3D Parallel Finish'].every(n => all.includes(n)), JSON.stringify(all));
    assert(mc.every(n => all.includes(n)), 'MC modes missing: ' + JSON.stringify(mc));
    assert(groups.includes('2D') && groups.includes('3D') && groups.includes('Drilling'), JSON.stringify(groups));
    await page.keyboard.type('dyn'); await page.waitForTimeout(200);
    const f = await page.evaluate(() => [...document.querySelectorAll('#cfPicker .cf-item .nm')].map(e => e.textContent));
    assert(f.length === 1 && f[0] === 'Dynamic Mill', JSON.stringify(f));
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    assert(!(await page.evaluate(() => !!document.getElementById('cfPicker'))));
  });

  await ok('picking Pocket makes one operation in one undo step and starts on geometry with whole-chain on', async () => {
    const h0 = await page.evaluate(() => hist.cur);
    await pick('pocket');
    const s = await st();
    assert(s.ops === 1 && s.op.type === 'chain' && s.op.cm === 'pocket' && s.op.name === 'Pocket' && s.step === 'geo' && s.view === 'op', JSON.stringify(s));
    assert((await page.evaluate(() => hist.cur)) === h0 + 1 && /Add Pocket/.test(s.hist[1]), JSON.stringify(s.hist));
    assert(await page.evaluate(() => CHAINUI.mode === 'chain'));
  });

  await ok('select by feature: All pockets takes the floor chain, the path appears and the tool is the automatic pick, marked Recommended', async () => {
    await page.click('[data-cfsel="pockets"]'); await page.waitForTimeout(900);
    const r = await page.evaluate(() => { const op = opById(CAMUI.op); const P = toolpath(op); return { n: op.chains.length, closed: op.chains[0].closed, moves: P.m.length, warn: P.warn }; });
    assert(r.n === 1 && r.closed && r.moves > 100 && !r.warn.length, JSON.stringify(r));
    await page.keyboard.press('Enter'); await page.waitForTimeout(600);
    const s = await st();
    assert(s.step === 'tool', JSON.stringify(s));
    const rec = await page.evaluate(() => { const r = CAMFLOW.recommend(opById(CAMUI.op)); return { rec: r.tool.n, want: opById(CAMUI.op).tool, auto: !!opById(CAMUI.op).autoTool, onCard: !!document.querySelector('.cf-tool.on .cf-rec'), sd: opById(CAMUI.op).stepdown, d: toolOf(opById(CAMUI.op).tool).d }; });
    assert(rec.rec === rec.want && rec.auto && rec.onCard && Math.abs(rec.sd - 0.5 * rec.d) < 0.02, JSON.stringify(rec));
  });

  await ok('parameters step: tabs split the panel and the fields sit in the right one', async () => {
    await page.keyboard.press('Enter'); await page.waitForTimeout(500);
    const tabs = await page.evaluate(() => [...document.querySelectorAll('.cf-tabs button')].map(b => b.textContent));
    assert(['Tool', 'Cut', 'Depths', 'Linking', 'Feeds & speeds'].every(t => tabs.includes(t)), JSON.stringify(tabs));
    assert(await page.evaluate(() => !!document.querySelector('.cf-pane:not([hidden]) #opSo')), 'stepover should be on Cut');
    await page.click('[data-cftab="depth"]'); await page.waitForTimeout(500);
    assert(await page.evaluate(() => !!document.querySelector('.cf-pane:not([hidden]) #opSd') && !document.querySelector('.cf-pane:not([hidden]) #opSo')), 'stepdown should be on Depths');
    await page.click('[data-cftab="feeds"]'); await page.waitForTimeout(400);
    assert(await page.evaluate(() => /Surface speed/.test(document.querySelector('.cf-pane:not([hidden])').textContent)));
    await page.click('[data-cftab="link"]'); await page.waitForTimeout(400);
    assert(await page.evaluate(() => !!document.querySelector('.cf-pane:not([hidden]) #cfSafeLinks')));
  });

  await ok('live preview: typing a stepdown redraws the path before it is committed; one Undo step reverts it', async () => {
    await page.click('[data-cftab="depth"]'); await page.waitForTimeout(400);
    const before = await page.evaluate(() => ({ sd: opById(CAMUI.op).stepdown, n: toolpath(opById(CAMUI.op)).m.length, h: hist.cur }));
    await page.click('#opSd'); await page.keyboard.press('Control+a'); await page.keyboard.type('1'); await page.waitForTimeout(400);
    const live = await page.evaluate(() => ({ sd: opById(CAMUI.op).stepdown, n: toolpath(opById(CAMUI.op)).m.length, h: hist.cur, focus: document.activeElement.id }));
    assert(Math.abs(live.sd - 1) < 1e-6 || Math.abs(live.sd - 25.4) < 1e-6, JSON.stringify(live));
    assert(live.n !== before.n && live.h === before.h && live.focus === 'opSd', JSON.stringify({ before, live }));
    await page.keyboard.press('Tab'); await page.waitForTimeout(500);
    const done = await page.evaluate(() => ({ h: hist.cur, label: hist.labels[hist.cur] }));
    assert(done.h === before.h + 1 && /stepdown/.test(done.label), JSON.stringify(done));
    await page.evaluate(() => undo()); await page.waitForTimeout(500);
    assert(await page.evaluate(b => Math.abs(opById(CAMUI.op).stepdown - b) < 1e-6, before.sd), 'undo should restore the stepdown');
  });

  await ok('Enter finishes, and the next Pocket starts from the values and tool last used', async () => {
    await page.evaluate(() => { const op = opById(CAMUI.op); camEdit(op, 'stepdown', 3); camEdit(op, 'tool', cam().tools.find(t => t.type === 'flat' && t.n !== op.tool).n); });
    const tool = await page.evaluate(() => opById(CAMUI.op).tool);
    await page.mouse.click(5, 5); await page.keyboard.press('Enter'); await page.waitForTimeout(600);
    assert((await st()).view === 'cat', JSON.stringify(await st()));
    await pick('pocket');
    const s = await st();
    assert(s.op.name === 'Pocket 2' && s.op.tool === tool && Math.abs(s.op.sd - 3) < 1e-6, JSON.stringify({ s, tool }));
  });

  await ok('Esc on a toolpath with no geometry cancels it, back to the step before', async () => {
    const n0 = await page.evaluate(() => cam().ops.length);
    await page.keyboard.press('Escape'); await page.waitForTimeout(600);
    assert((await page.evaluate(() => cam().ops.length)) === n0 - 1);
  });

  await ok('Change… swaps the toolpath type in place and keeps the picked chain', async () => {
    await pick('pocket');
    await page.click('[data-cfsel="pockets"]'); await page.waitForTimeout(600);
    await page.click('[data-cfswap]'); await page.waitForTimeout(300);
    const only = await page.evaluate(() => [...document.querySelectorAll('#cfPicker .cf-item .nm')].map(e => e.textContent));
    assert(only.includes('Contour') && !only.includes('Face') && !only.includes('Spot Drill'), JSON.stringify(only));
    await page.keyboard.type('contour'); await page.keyboard.press('Enter'); await page.waitForTimeout(700);
    const s = await st();
    assert(s.op.cm === 'contour' && s.op.chains === 1, JSON.stringify(s));
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  });

  await ok('right-click in the view offers OK, reverse and clear for the chain', async () => {
    await pick('pocket');
    await page.click('[data-cfsel="pockets"]'); await page.waitForTimeout(600);
    await page.mouse.click(700, 760, { button: 'right' }); await page.waitForTimeout(300);
    const items = await page.evaluate(() => [...document.querySelectorAll('#ctxmenu button')].map(b => b.textContent));
    assert(items.some(t => /OK|Next/.test(t)) && items.some(t => /Reverse/.test(t)) && items.some(t => /Clear/.test(t)), JSON.stringify(items));
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  });

  await ok('drilling by clicking holes: All Ø holes takes every hole of that size', async () => {
    await page.evaluate(() => { CAMUI.view = 'overview'; camRefresh(); });
    await pick('drill by');
    const r = await page.evaluate(() => { const b = [...document.querySelectorAll('[data-cfsel^="hole:"]')]; return b.map(x => x.textContent); });
    assert(r.length >= 1, JSON.stringify(r));
    await page.click('[data-cfsel^="hole:"]'); await page.waitForTimeout(600);
    const n = await page.evaluate(() => { const op = opById(CAMUI.op), d = parseFloat(document.querySelector('[data-cfsel^="hole:"]') ? 0 : 0); return { chains: op.chains.length, ds: op.chains.map(c => c.pts.length) }; });
    assert(n.chains >= 1, JSON.stringify(n));
  });

  await ok('no page errors', async () => { assert(!errs.length, errs.join(' | ')); });
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
