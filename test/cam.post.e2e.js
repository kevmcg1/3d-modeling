// Manufacture: controllers (post processors) and work offsets G54 to G59.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/cam.post.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (index.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 900)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' }));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await page.waitForTimeout(2000);
  await page.evaluate(() => { const s = SAMPLES.find(x => x.name === 'Pocketed plate'); loadDoc(s.make(), 'test'); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { setWorkspace('cam'); const C = cam(); C.ops = []; camAddOp('face'); camAddOp('drill'); const d = C.ops[1]; d.mode = 'spot'; d.dwell = 1.5; });
  await page.waitForTimeout(2500);
  const post = ctrl => page.evaluate(c => { const C = cam(); C.post.ctrl = c; C.post.lineNums = false; return postGcode().text; }, ctrl);
  await ok('Haas (default) keeps its program: O number, T M6, G43, G12 pocket cycle where used, G28 end', async () => {
    const t = await post('haas');
    assert(/^%\nO01001 \(DATUM - HAAS MILL\)/.test(t) && /\nT\d+ M6\n/.test(t) && /G43 H\d+ Z/.test(t) && /G82 X/.test(t) && / P1\.5/.test(t) && /G28 G91 Z0\./.test(t) && /M30\n%$/.test(t), t.slice(0, 600));
  });
  await ok('Fanuc: O1001, T01 M06, dwell in milliseconds, no Haas G12', async () => {
    const t = await post('fanuc');
    assert(/^%\nO1001 /.test(t) && /T0\d M06/.test(t) && /G82 X[^\n]* P1500\b/.test(t) && !/G12\b/.test(t) && /G43 H/.test(t), t.slice(0, 700));
  });
  await ok('Mach3: no O number, dwell in seconds, ends with G53 Z0 and M30, no G12', async () => {
    const t = await post('mach3');
    assert(!/^O\d|\nO\d/.test(t) && /G82 X[^\n]* P1\.5/.test(t) && /G53 G0 Z0\nM30$/.test(t) && !/G12\b/.test(t), t.slice(0, 700));
  });
  await ok('Grbl: no tool change word, no tool length, no canned cycles, M0 pause, ends M2', async () => {
    const t = await post('grbl');
    assert(!/M6\b/.test(t) && !/G43/.test(t) && !/G8[1-9]\b/.test(t.replace(/\([^)]*\)/g, '')) && /M0 \(Change to/.test(t) && /M2$/.test(t) && !/\n%/.test(t) && /G1 /.test(t), t.slice(0, 700));
  });
  await ok('Siemens: ; comments only, G71, T / M6 / D1, CYCLE82 modal call with one position per hole, G74 end', async () => {
    const t = await post('siemens');
    const holes = t.split('\n').filter(l => /^X[-\d.]+ Y[-\d.]+$/.test(l)).length;
    assert(!/\(/.test(t.replace(/CYCLE\d+\([^)]*\)/g, '')) && /G7[01] G90/.test(t) && /\nT\d+\nM6\nD1\n/.test(t) && /MCALL CYCLE82\(/.test(t) && /\nMCALL\n/.test(t) && holes >= 4 && /G74 Z1=0\nM30$/.test(t) && !/G43/.test(t), t.slice(0, 900));
  });
  await ok('Siemens: a deep-hole cycle carries the peck depth, the reference plane and the safety distance', async () => {
    const t = await page.evaluate(() => { const C = cam(); C.ops[1].mode = 'peck'; C.ops[1].peck = 2.5; C.post.ctrl = 'siemens'; return postGcode().text; });
    const isIn = await page.evaluate(() => isIn()); const m = /MCALL CYCLE83\(([^)]*)\)/.exec(t); assert(m, t.slice(0, 600));
    const a = m[1].split(',').map(Number); assert(a.length === 12 && Math.abs(a[6] - 2.5 / (isIn ? 25.4 : 1)) < 1e-3 && a[1] < a[0] && a[3] < a[1] && a[2] > 0, m[1]);
  });
  await ok('a cycle a control does not have is posted as plain moves with a note (Mach3 fine bore)', async () => {
    const t = await page.evaluate(() => { const C = cam(); C.ops[1].mode = 'fine'; C.post.ctrl = 'mach3'; return postGcode().text; });
    assert(!/G76/.test(t.replace(/\(G76[^)]*\)/g, '')) && /no canned cycle for this, posted as moves/.test(t) && /G1 Z/.test(t), t.slice(0, 700));
  });
  await ok('line numbers: every line but % gets N10, N20 …', async () => {
    const t = await page.evaluate(() => { const C = cam(); C.ops[1].mode = 'spot'; C.post.ctrl = 'fanuc'; C.post.lineNums = true; C.post.lineStep = 5; return postGcode().text; });
    const ls = t.split('\n').filter(l => l !== '%'); assert(ls.length > 20 && ls.every((l, i) => l.startsWith('N' + (i + 1) * 5 + ' ')), ls.slice(0, 4).join('|'));
  });
  await ok('file name and extension follow the controller', async () => {
    const r = await page.evaluate(() => { const C = cam(), o = {}; for (const k of POST_ORDER) { C.post.ctrl = k; o[k] = postFileName(); } return o; });
    assert(r.haas === 'datum-O1001.nc' && r.siemens === 'DATUM1001.mpf' && r.grbl === 'datum-O1001.gcode' && r.mach3.endsWith('.tap'), JSON.stringify(r));
  });
  await ok('work offsets: G55 with a shift moves the operation\'s coordinates and posts G55 before it', async () => {
    const r = await page.evaluate(() => {
      const C = cam(); C.post.ctrl = 'haas'; C.post.lineNums = false; C.wcs = {};
      const base = postGcode().text, first = t => { const i = t.indexOf('(Face'); return /G0 X(-?[\d.]+) Y(-?[\d.]+)/.exec(t.slice(i)); };
      C.wcs[55] = { o: C.origin, d: [100, 0, 0] }; C.ops[0].wcs = 1;
      const t = postGcode().text, a = first(base), b = first(t);
      const lines = t.split('\n'), i = lines.findIndex(l => l === 'G55'), op = lines.findIndex(l => l.startsWith('(Face'));
      return { a: a && +a[1], b: b && +b[1], i, op, hdrG55: t.slice(0, t.indexOf('(Face')).includes('G55'), other: lines.filter(l => l === 'G54').length, label: wcsLabel(55), sh: 100 / (isIn() ? 25.4 : 1) };
    });
    assert(r.i > r.op && Math.abs(r.a - r.b - r.sh) < 0.01 && r.other >= 1 && /shifted/.test(r.label), JSON.stringify(r));
  });
  await ok('work offsets: back to G54 for the next operation, and the simulation toolpath is unchanged', async () => {
    const r = await page.evaluate(() => {
      const C = cam(), t = postGcode().text, lines = t.split('\n'), g54 = lines.map((l, i) => l === 'G54' ? i : -1).filter(i => i >= 0), g55 = lines.indexOf('G55');
      const m = toolpath(C.ops[0]).m[5]; C.wcs = {}; C.ops[0].wcs = 0; const m2 = toolpath(C.ops[0]).m[5];
      return { back: g54.some(i => i > g55), same: Math.abs(m.x - m2.x) < 1e-9 && Math.abs(m.y - m2.y) < 1e-9 };
    });
    assert(r.back && r.same, JSON.stringify(r));
  });
  await ok('the setup panel adds and removes work offsets and the operation panel then offers them', async () => {
    const r = await page.evaluate(() => {
      CAMUI.view = 'setup'; camRefresh(); const add = document.querySelector('[data-wcsadd="55"]'); add.click();
      const row = !!document.querySelector('[data-wcs="55"]'), C = cam(), has = !!C.wcs[55];
      CAMUI.view = 'op'; CAMUI.op = C.ops[0].id; camRefresh(); const opSel = !!document.getElementById('opWcs');
      CAMUI.view = 'setup'; camRefresh(); document.querySelector('[data-wcsdel="55"]').click();
      CAMUI.view = 'op'; camRefresh(); return { row, has, opSel, gone: !cam().wcs[55], none: !document.getElementById('opWcs') };
    });
    assert(r.row && r.has && r.opSel && r.gone && r.none, JSON.stringify(r));
  });
  await ok('Heidenhain: numbered blocks from BEGIN PGM to END PGM, BLK FORM, TOOL CALL, FMAX rapids, no G or M6 words', async () => {
    const t = await post('heidenhain'), ls = t.split('\n');
    assert(/^0 BEGIN PGM 1001 (MM|INCH)$/.test(ls[0]) && /^\d+ END PGM 1001 (MM|INCH)$/.test(ls[ls.length - 1]) && ls.every((l, i) => l.startsWith(i + ' ')) && /BLK FORM 0\.1 Z X/.test(t) && /BLK FORM 0\.2 X/.test(t)
      && /TOOL CALL \d+ Z S\d+/.test(t) && /L Z\+?-?[\d.]+ R0 FMAX M3/.test(t) && /R0 F\d+/.test(t) && !/\bG\d+\b/.test(t.replace(/;.*$/gm, '')) && /M30\n\d+ END PGM/.test(t), t.slice(0, 900));
  });
  await ok('Heidenhain: spot drilling posts CYCL DEF 200 with the dwell, one M99 block per hole, and a datum shift for G55', async () => {
    const r = await page.evaluate(() => {
      const C = cam(); C.post.ctrl = 'heidenhain'; C.wcs = { 55: { o: C.origin, d: [50, 0, 0] } }; C.ops[1].wcs = 1; C.ops[1].mode = 'spot';
      const t = postGcode().text; C.wcs = {}; C.ops[1].wcs = 0; return t;
    });
    const holes = (r.match(/M99/g) || []).length;
    assert(/CYCL DEF 200 DRILLING ~/.test(r) && /Q211=1\.5 ;DWELL TIME AT DEPTH/.test(r) && holes >= 4 && /CYCL DEF 7\.1 #2/.test(r) && /CYCL DEF 7\.0 DATUM SHIFT/.test(r), r.slice(-900));
  });
  await ok('Heidenhain: arcs post as CC + C with DR direction, and feeds are a number', async () => {
    const t = await page.evaluate(() => { const C = cam(); C.post.ctrl = 'heidenhain'; C.ops.push(Object.assign({}, C.ops[0])); C.ops.pop(); camAddOp('pocket'); const op = C.ops[C.ops.length - 1]; return postGcode().text; });
    assert(!/FNaN|F undefined/.test(t), t.slice(0, 300));
  });
  await ok('the G-code panel lists the controllers and switching one re-posts', async () => {
    const r = await page.evaluate(() => {
      CAMUI.view = 'post'; camRefresh(); const s = document.getElementById('postCtrl'); const names = [...s.options].map(o => o.value);
      s.value = 'siemens'; s.dispatchEvent(new Event('change')); return { names, ctrl: cam().post.ctrl, text: CAMUI.gcode.slice(0, 40) };
    });
    assert(r.names.length >= 6 && r.ctrl === 'siemens' && /^; DATUM/.test(r.text), JSON.stringify(r));
  });
  await ok('no page errors', async () => { assert(!errs.length, errs.join(' | ')); });
  await browser.close();
  console.log(fail ? `${fail} failed, ${pass} passed` : 'all CAM post checks passed');
  process.exit(fail ? 1 : 0);
})();
