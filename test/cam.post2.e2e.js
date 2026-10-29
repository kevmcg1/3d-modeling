// Manufacture posts, second batch: what Fusion and Mastercam posts do that a shop expects on every program.
//   Z to the machine's home before every tool change (a Fanuc-style control does not do it by itself),
//   a tool list at the top of the program (T, diameter, deepest Z, type) for the operator loading the carousel,
//   coolant modes (off, flood, mist, flood + mist, through-spindle) with a per-operation override,
//   and the G-code panel controls for them.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/cam.post2.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (3d-modeler.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 900)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } }); await page.addInitScript(() => { window.DATUM_PREMIUM = true; });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' })); await page.route(/gate\.js/, r => r.abort());
  await page.goto('file://' + path.resolve(__dirname, '..', '3d-modeler.html') + '?dev=1'); await page.waitForTimeout(2000);
  await page.addScriptTag({ path: path.resolve(__dirname, 'lib', 'gcode-check.js') });
  await page.evaluate(async () => {
    const e0 = camEpoch, s = SAMPLES.find(x => x.name === 'Pocketed plate'); loadDoc(s.make(), 'test'); setWorkspace('cam');
    for (let i = 0; i < 200 && camEpoch === e0; i++) await new Promise(r => setTimeout(r, 50));
    autoResult(); autoApply(true); await waitToolpaths(120000);
    window.post = (ctrl, set) => { const C = cam(); C.post.ctrl = ctrl; Object.assign(C.post, { coolant: true, coolMode: 'flood', toolRetract: undefined, optStop: false }, set || {}); return postGcode().text; };
  });
  const post = (ctrl, set) => page.evaluate(([c, s]) => post(c, s), [ctrl, set]);
  const lines = t => t.split('\n').map(l => l.trim());

  await ok('Z to home before every tool change: Haas and Fanuc G91 G28 Z0. / G90, Mach3 G53 G0 Z0, Siemens G74 Z1=0, none for Grbl; the first tool included', async () => {
    const want = { haas: ['G91 G28 Z0.', 'G90'], fanuc: ['G91 G28 Z0.', 'G90'], mach3: ['G53 G0 Z0'], siemens: ['G74 Z1=0'], grbl: [] };
    for (const [ctrl, seq] of Object.entries(want)) {
      const L = lines(await post(ctrl)), tc = L.map((l, i) => (ctrl === 'siemens' ? /^T\d+$/ : /^T\d+ M0?6$/).test(l) ? i : -1).filter(i => i >= 0);
      if (ctrl === 'grbl') { const body = L.slice(0, L.findIndex(l => /^M2$/.test(l))); assert(!body.some(l => /\bG28\b|\bG53\b|\bG74\b/.test(l.replace(/\(.*\)/, ''))), 'grbl: no home move before a manual tool change'); continue; }
      assert(tc.length >= 3, ctrl + ': tool changes ' + tc.length);
      for (const i of tc) assert.deepStrictEqual(L.slice(i - seq.length, i), seq, `${ctrl}: before line ${i + 1} (${L[i]}) came ${JSON.stringify(L.slice(i - 3, i))}`);
    }
  });

  await ok('Z-home-at-tool-change can be switched off, and the program is the same as before without it', async () => {
    const a = lines(await post('haas', { toolRetract: false })), b = lines(await post('haas'));
    assert(!a.some((l, i) => l === 'G91 G28 Z0.' && /M6$/.test(a[i + 2] || '')), 'no retract before a tool change when off');
    assert(b.filter(l => l === 'G91 G28 Z0.').length === a.filter(l => l === 'G91 G28 Z0.').length + new Set(b.filter(l => /^T\d+ M6$/.test(l))).size || b.length > a.length, 'on adds the lines');
    assert(a.filter(l => /^T\d+ M6$/.test(l)).length === b.filter(l => /^T\d+ M6$/.test(l)).length, 'same tool changes');
  });

  await ok('The program passes the G-code check on Haas and Fanuc with the retract (safe start, tool change, motion, end)', async () => {
    for (const ctrl of ['haas', 'fanuc']) {
      const r = await page.evaluate(c => { const t = post(c); return gcheck(t, { units: isIn() ? 'in' : 'mm' }); }, ctrl);
      assert.deepStrictEqual(r, [], ctrl + ': ' + JSON.stringify(r));
    }
  });

  await ok('Tool list: one line per tool in order of first use, with diameter, deepest Z and type, before the safe-start line', async () => {
    const r = await page.evaluate(() => {
      const t = post('fanuc'), o = camOrigin(), seen = [];
      for (const op of cam().ops.filter(x => !x.sup)) { const P = toolpath(op); if (!P || P.pending || P.m.length < 2) continue; let z = Infinity; for (const m of P.m) if (!m.r && m.z - o[2] < z) z = m.z - o[2]; const e = seen.find(s => s.n === P.tool.n); if (e) e.z = Math.min(e.z, z); else seen.push({ n: P.tool.n, d: P.tool.d, z, type: TOOL_TYPES[P.tool.type].toUpperCase().replace(/[()]/g, '') }); }
      return { t, seen, inch: isIn() };
    });
    const L = lines(r.t), i0 = L.indexOf('(TOOLS)'), safe = L.findIndex(l => /^G2[01] G90/.test(l)), tl = L.slice(i0 + 1, safe);
    assert(i0 > 0 && safe > i0 && tl.length === r.seen.length, `tool lines ${tl.length} vs ${r.seen.length}: ` + JSON.stringify(tl));
    const k = r.inch ? 1 / 25.4 : 1;
    r.seen.forEach((s, i) => {
      const m = tl[i].match(/^\(T(\d+) {2}D=(\S+) - ZMIN=(\S+) - (.+)\)$/);
      assert(m && +m[1] === s.n && Math.abs(parseFloat(m[2]) - s.d * k) < 0.0006 && Math.abs(parseFloat(m[3]) - s.z * k) < 0.0006 && m[4] === s.type, `${tl[i]} vs ${JSON.stringify(s)}`);
    });
  });

  await ok('Tool list: Siemens writes it as ; comments, Heidenhain and Grbl as before (no tool list)', async () => {
    const s = await post('siemens'); assert(/^; TOOLS$/m.test(s) && /^; T\d+ {2}D=/m.test(s), 'siemens: ' + s.split('\n').slice(0, 8).join(' | '));
    const g = await post('grbl'); assert(!/TOOLS/.test(g), 'grbl has none');
  });

  const cool = t => { const out = []; let on = null; lines(t).forEach((l, i) => { const w = l.replace(/\(.*\)/, '').trim(); if (/^M(7|8|88)\b/.test(w) || /^M7 M8$/.test(w)) { if (on) out.push('on while on @' + (i + 1)); on = w; } if (/^M(9|89)$/.test(w)) { if (!on) out.push('off while off @' + (i + 1)); on = null; } if (/^M5$/.test(w) && on) out.push('spindle off with coolant on @' + (i + 1)); if (/^M30$/.test(w) && on) out.push('coolant on at the end'); }); return out; };

  await ok('Coolant modes: Off posts none, Flood M8 / M9, Mist M7 / M9, Flood and mist M7 M8 / M9, Through-spindle M88 / M89 on Haas; never on twice, always off before M5 and at the end', async () => {
    const cases = { off: [null, null], flood: ['M8', 'M9'], mist: ['M7', 'M9'], both: ['M7 M8', 'M9'], tsc: ['M88', 'M89'] };
    for (const [mode, [onW, offW]] of Object.entries(cases)) {
      const t = await post('haas', mode === 'off' ? { coolant: false } : { coolMode: mode }), L = lines(t).map(l => l.replace(/\(.*\)/, '').trim());
      if (!onW) { assert(!L.some(l => /^M(7|8|9|88|89)\b/.test(l)), 'off: ' + L.filter(l => /^M[789]/.test(l)).join(',')); continue; }
      assert(L.filter(l => l === onW).length >= 3 && L.filter(l => l === offW).length >= 3, `${mode}: ${L.filter(l => /^M[789]/.test(l)).join(' ')}`);
      assert.deepStrictEqual(cool(t), [], mode + ': ' + JSON.stringify(cool(t)));
    }
  });

  await ok('Through-spindle on a control that has no M88 (Fanuc, Mach3) posts flood with a note instead', async () => {
    for (const ctrl of ['fanuc', 'mach3']) {
      const t = await post(ctrl, { coolMode: 'tsc' });
      assert(!/\bM88\b|\bM89\b/.test(t) && /THROUGH-SPINDLE COOLANT IS NOT AVAILABLE/.test(t) && /^M8$/m.test(t), ctrl);
    }
  });

  await ok('Per-operation coolant overrides the program default: Off for one operation, Mist for another; the program stays consistent', async () => {
    const r = await page.evaluate(() => {
      const C = cam(), ops = C.ops.filter(x => !x.sup); ops[0].coolant = 'off'; ops[1].coolant = 'mist';
      const t = post('haas'); ops[0].coolant = undefined; ops[1].coolant = undefined;
      return { t, names: ops.map(o => o.name) };
    });
    const L = lines(r.t); const i1 = L.findIndex(l => l.startsWith('(' + r.names[0] + ' ')), i2 = L.findIndex(l => l.startsWith('(' + r.names[1] + ' ')), i3 = L.findIndex((l, i) => i > i2 && /^\(/.test(l) && / — T\d+ /.test(l));
    const seg = (a, b) => L.slice(a, b).map(l => l.replace(/\(.*\)/, '').trim());
    assert(!seg(i1, i2).some(l => /^M(7|8)\b/.test(l)), 'op 1 coolant off: ' + seg(i1, i2).filter(l => /^M[789]/.test(l)).join(','));
    assert(seg(i2, i3).includes('M7'), 'op 2 mist: ' + seg(i2, i3).filter(l => /^M[789]/.test(l)).join(','));
    assert.deepStrictEqual(cool(r.t), [], JSON.stringify(cool(r.t)));
  });

  await ok('G-code panel: a Coolant list, the Z-home box and line numbers; changing each re-posts and one Undo reverts it', async () => {
    await page.evaluate(() => { cam().post.ctrl = 'haas'; Object.assign(cam().post, { coolant: true, coolMode: 'flood', toolRetract: undefined }); CAMUI.view = 'post'; camRefresh(); });
    await page.waitForTimeout(500);
    const has = await page.evaluate(() => ({ cool: !!document.getElementById('postCoolMode'), oldBox: !!document.getElementById('postCool'), retract: !!document.getElementById('postRetract'), val: document.getElementById('postCoolMode').value, opts: [...document.getElementById('postCoolMode').options].map(o => o.value) }));
    assert(has.cool && !has.oldBox && has.retract && has.val === 'flood' && has.opts.join() === 'off,flood,mist,both,tsc', JSON.stringify(has));
    await page.selectOption('#postCoolMode', 'mist'); await page.waitForTimeout(500);
    let r = await page.evaluate(() => ({ coolant: cam().post.coolant, mode: cam().post.coolMode, text: CAMUI.gcode }));
    assert(r.coolant && r.mode === 'mist' && /^M7$/m.test(r.text) && !/^M8$/m.test(r.text), JSON.stringify({ c: r.coolant, m: r.mode }));
    await page.selectOption('#postCoolMode', 'off'); await page.waitForTimeout(500);
    r = await page.evaluate(() => ({ coolant: cam().post.coolant, text: CAMUI.gcode })); assert(!r.coolant && !/^M(7|8|9)$/m.test(r.text), 'coolant off');
    await page.click('#postRetract'); await page.waitForTimeout(500);
    r = await page.evaluate(() => ({ r: cam().post.toolRetract, text: CAMUI.gcode })); assert(r.r === false && !/^G91 G28 Z0\.\nG90\nT\d+ M6/m.test(r.text), 'retract off');
    await page.evaluate(() => { undo(); undo(); undo(); }); await page.waitForTimeout(500);
    r = await page.evaluate(() => ({ coolant: cam().post.coolant, mode: cam().post.coolMode, r: cam().post.toolRetract })); assert(r.coolant && r.mode === 'flood' && r.r !== false, JSON.stringify(r));
  });

  await ok('Operation panel: a Coolant list (Program default first) in the Feeds & speeds tab; changing it is one Undo step', async () => {
    const r = await page.evaluate(() => { const op = cam().ops.find(x => !x.sup); CAMUI.op = op.id; CAMUI.view = 'op'; camRefresh(); return { id: op.id }; });
    await page.waitForTimeout(600);
    const info = await page.evaluate(() => { const el = document.getElementById('opCool'); return el ? { vals: [...el.options].map(o => o.value).join(), pane: (el.closest('[data-pane]') || {}).dataset && el.closest('[data-pane]').dataset.pane } : null; });
    assert(info && info.vals === 'inherit,off,flood,mist,both,tsc' && info.pane === 'feeds', JSON.stringify(info));
    const h0 = await page.evaluate(() => hist.cur);
    await page.evaluate(() => { const el = document.getElementById('opCool'); el.value = 'mist'; el.dispatchEvent(new Event('change', { bubbles: true })); }); await page.waitForTimeout(400);
    const r2 = await page.evaluate(() => ({ c: cam().ops.find(x => !x.sup).coolant, h: hist.cur })); assert(r2.c === 'mist' && r2.h === h0 + 1, JSON.stringify(r2));
    await page.evaluate(() => undo()); await page.waitForTimeout(300);
    assert(await page.evaluate(() => cam().ops.find(x => !x.sup).coolant) === undefined, 'undo restores the program default');
  });

  await ok('the page raised no errors', async () => { assert.deepStrictEqual(errs, [], errs.join('\n')); });
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
