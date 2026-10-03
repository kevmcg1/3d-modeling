// Headless checks for graphics.html (the Graphics workspace) and its tab in index.html.
// Needs Playwright + a Chromium:  npm i -D playwright  (CHROMIUM_PATH picks an existing browser)  then  node test/graphics.test.js
// Skips cleanly when Playwright is not installed.
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
const path = require('path'), assert = require('assert');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const errs = []; let n = 0;
  const ok = (name, cond, extra) => { n++; assert.ok(cond, name + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); console.log('ok -', name); };
  const open = async file => {
    const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await page.goto('file://' + path.resolve(__dirname, '..', file)); await page.waitForTimeout(300); return page;
  };

  // the tab sits right after 3D Print and shows the editor in a frame. index.html loads three.js and clipper from CDNs,
  // so serve them from node_modules (npm i -D three@0.128 clipper-lib@6.4.2) and skip these checks when they are missing
  let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
  if (!libs) console.log('skip: tab checks need three and clipper-lib in node_modules');
  else {
    const app = await browser.newPage({ viewport: { width: 1400, height: 850 } });
    app.on('pageerror', e => errs.push(e.message));
    await app.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
    await app.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' }));
    await app.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await app.waitForTimeout(800);
    const tabs = await app.evaluate(() => [...document.querySelectorAll('.ws button')].map(b => b.dataset.ws)), gi = tabs.indexOf('gfx');
    ok('Graphics tab comes right after 3D Print', gi > 0 && tabs[gi - 1] === 'print', tabs);
    await app.click('.ws button[data-ws="gfx"]'); await app.waitForTimeout(500);
    const shown = await app.evaluate(() => ({ cls: document.body.classList.contains('ws-gfx'), src: document.getElementById('gfxFrame').getAttribute('src'), vis: getComputedStyle(document.getElementById('gfxWs')).display, main: getComputedStyle(document.getElementById('main')).display }));
    ok('tab shows graphics.html and hides the modeling UI', shown.cls && shown.src === 'graphics.html' && shown.vis === 'block' && shown.main === 'none', shown);
    await app.click('.ws button[data-ws="print"]');
    ok('switching to another tab hides the editor', await app.evaluate(() => !document.body.classList.contains('ws-gfx') && getComputedStyle(document.getElementById('gfxWs')).display === 'none'));
    await app.click('.ws button[data-ws="design"]');
    ok('switching back restores the modeling UI', await app.evaluate(() => getComputedStyle(document.getElementById('main')).display !== 'none'));
    await app.close();
  }

  const page = await open('graphics.html');
  await page.waitForFunction(() => window.GFX);
  const ev = (f, a) => page.evaluate(f, a);
  const reset = (w, h) => ev(([w, h]) => { GFX.resetDoc(w, h, '#ffffff'); GFX.fitView(true); }, [w, h]);
  const px = (x, y) => ev(([x, y]) => [...GFX.flatten().getContext('2d').getImageData(x, y, 1, 1).data], [x, y]);
  const hash = () => ev(() => { const c = GFX.flatten('#fff'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 11) h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) | 0; return h + ':' + c.width + 'x' + c.height + ':' + GFX.D.layers.length; });

  // raster: a layer, fill under a selection, undo and redo
  await reset(400, 300);
  await ev(() => { GFX.addLayer('raster'); const c = document.createElement('canvas'); c.width = GFX.D.w; c.height = GFX.D.h; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(50, 50, 100, 80); GFX.selCommit(c, 'sel'); GFX.fillSelection('#ff0000'); });
  let p = await px(100, 90); ok('fill paints inside the selection', p[0] === 255 && p[1] === 0 && p[2] === 0, p);
  p = await px(200, 90); ok('fill leaves outside untouched', p[0] === 255 && p[1] === 255 && p[2] === 255, p);
  await ev(() => GFX.undo()); p = await px(100, 90); ok('undo restores the pixels', p[1] === 255, p);
  await ev(() => GFX.redo()); p = await px(100, 90); ok('redo repaints', p[1] === 0, p);

  // blend modes and masks
  await reset(200, 200);
  await ev(() => { GFX.activeLayer().cv.getContext('2d').fillStyle = '#ffff00'; GFX.activeLayer().cv.getContext('2d').fillRect(0, 0, 200, 200); GFX.addLayer('raster'); const L = GFX.activeLayer(); L.cv.getContext('2d').fillStyle = '#00ffff'; L.cv.getContext('2d').fillRect(0, 0, 200, 200); L.blend = 'multiply'; });
  p = await px(10, 10); ok('multiply blend of cyan over yellow is green', p[0] < 5 && p[1] > 250 && p[2] < 5, p);
  await ev(() => { GFX.activeLayer().blend = 'source-over'; GFX.addMask('hide'); });
  p = await px(10, 10); ok('a hide-all mask reveals the layer below', p[0] > 250 && p[1] > 250 && p[2] < 5, p);

  // vector: shapes, boolean ops, gradient render
  await reset(400, 300);
  const nb = await ev(() => {
    const L = GFX.ensureVectorLayer(), a = GFX.newShape('ellipse', [GFX.ellipseSub(150, 150, 80, 80)]), b = GFX.newShape('rect', [GFX.rectSub(150, 100, 150, 100, 0)]);
    L.shapes.push(a, b); const out = {};
    for (const op of ['union', 'subtract', 'intersect', 'exclude']) { GFX.setVSel([a.id, b.id]); GFX.booleanOp(op); out[op] = L.shapes.length; GFX.undo(); }
    return out;
  });
  ok('boolean ops collapse two shapes into one and undo', Object.values(nb).every(v => v === 1), nb);

  // SVG and project round trips
  const rt = await ev(async () => {
    GFX.resetDoc(400, 300, '#ffffff'); const L = GFX.ensureVectorLayer(); const a = GFX.newShape('star', [GFX.starSub(120, 120, 60, 25, 5, 0)]);
    a.fill = { type: 'linear', color: '#000', stops: [{ o: 0, c: '#ff0000', a: 1 }, { o: 1, c: '#0000ff', a: 1 }], p0: [60, 120], p1: [180, 120] }; L.shapes.push(a);
    const t = GFX.newText(200, 60, 'Hi'); L.shapes.push(t);
    const svg = GFX.toSVG(), parsed = GFX.parseSVG(svg), h0 = (() => { const c = GFX.flatten('#fff'); return [...c.getContext('2d').getImageData(120, 120, 1, 1).data]; })();
    const json = await GFX.projectJSON(); GFX.resetDoc(10, 10, '#fff'); await GFX.loadProject(json);
    const c = GFX.flatten('#fff'); return { gradient: /linearGradient/.test(svg), text: /<text/.test(svg), n: parsed.shapes.length, size: [GFX.D.w, GFX.D.h], same: JSON.stringify(h0) === JSON.stringify([...c.getContext('2d').getImageData(120, 120, 1, 1).data]) };
  });
  ok('SVG export carries gradients and text and parses back', rt.gradient && rt.text && rt.n === 2, rt);
  ok('project save and load restores size and pixels', rt.size[0] === 400 && rt.size[1] === 300 && rt.same, rt);

  // rotating the canvas must not leave a transform on the layers: a fill afterwards lands where the selection is
  await reset(300, 200);
  const rot = await ev(() => {
    GFX.rotateDoc(90); const c = document.createElement('canvas'); c.width = GFX.D.w; c.height = GFX.D.h; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(10, 20, 40, 30); GFX.selCommit(c, 'sel'); GFX.fillSelection('#00ff00');
    const d = GFX.flatten('#fff').getContext('2d'); return { inside: [...d.getImageData(20, 30, 1, 1).data], transposed: [...d.getImageData(45, 12, 1, 1).data], size: [GFX.D.w, GFX.D.h] };
  });
  ok('fill after rotate lands inside the selection', rot.size[0] === 200 && rot.inside[1] === 255 && rot.inside[0] === 0 && rot.transposed[0] === 255, rot);

  // fuzz: random edits, then undo everything and redo everything and compare pixels at every step
  const fuzz = await ev(() => {
    GFX.HIST.max = 1e9; GFX.resetDoc(500, 360, '#ffffff'); let seed = 4242; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296, ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const hashNow = () => { const c = GFX.flatten('#fff'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 11) h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) | 0; return h + ':' + GFX.D.w + 'x' + GFX.D.h + ':' + GFX.D.layers.length; };
    const seen = {}; const ops = ['rect', 'ell', 'fill', 'invert', 'layer', 'vlayer', 'shape', 'mask', 'dup', 'del', 'opac', 'blend', 'desel', 'rot', 'flip'];
    for (let k = 0; k < 150; k++) {
      const op = ops[ri(0, ops.length - 1)], A = GFX.activeLayer();
      if (op === 'rect' || op === 'ell') { const x = ri(0, GFX.D.w - 60), y = ri(0, GFX.D.h - 60), c = document.createElement('canvas'); c.width = GFX.D.w; c.height = GFX.D.h; const g = c.getContext('2d'); g.fillStyle = '#fff'; if (op === 'rect') g.fillRect(x, y, ri(10, 150), ri(10, 150)); else { g.beginPath(); g.ellipse(x + 50, y + 50, ri(10, 80), ri(10, 80), 0, 0, 7); g.fill(); } GFX.selCommit(c, 'sel'); }
      else if (op === 'fill') { GFX.setColor('fg', '#' + ri(0, 16777215).toString(16).padStart(6, '0')); if (A && A.type === 'raster') GFX.fillSelection(GFX.C.fg); }
      else if (op === 'invert') GFX.selInvert();
      else if (op === 'layer') GFX.addLayer('raster');
      else if (op === 'vlayer') GFX.addLayer('vector');
      else if (op === 'shape') { GFX.setColor('fg', '#' + ri(0, 16777215).toString(16).padStart(6, '0')); const s = GFX.newShape('rect', [GFX.rectSub(ri(0, 300), ri(0, 200), ri(10, 150), ri(10, 150), 0)]); GFX.metaAction('shape', () => GFX.ensureVectorLayer().shapes.push(s)); }
      else if (op === 'mask' && A && !A.mask) GFX.addMask(rnd() < .5 ? 'hide' : 'reveal');
      else if (op === 'dup') GFX.duplicateLayer();
      else if (op === 'del' && GFX.D.layers.length > 2) GFX.deleteLayer(GFX.D.active);
      else if (op === 'opac' && A) GFX.metaAction('opacity', () => { A.opacity = ri(20, 100) / 100; });
      else if (op === 'blend' && A) GFX.metaAction('blend', () => { A.blend = ['multiply', 'screen', 'overlay', 'source-over'][ri(0, 3)]; });
      else if (op === 'desel') GFX.selNone();
      else if (op === 'rot' && GFX.D.w < 700 && rnd() < .3) GFX.rotateDoc(90);
      else if (op === 'flip') GFX.flipDoc(rnd() < .5);
      seen[GFX.HIST.i] = hashNow();
    }
    const total = GFX.HIST.i, bad = []; for (let i = total; i >= -1; i--) { if (seen[i] !== undefined && hashNow() !== seen[i]) bad.push(['undo', i]); if (i >= 0) GFX.undo(); }
    for (let i = 0; i <= total; i++) { GFX.redo(); if (seen[i] !== undefined && hashNow() !== seen[i]) bad.push(['redo', i]); }
    return { total, bad: bad.slice(0, 5), nbad: bad.length };
  });
  ok('150 random edits undo and redo to identical pixels', fuzz.total > 40 && fuzz.nbad === 0, fuzz);

  // a heavy document still composes quickly
  const heavy = await ev(() => {
    GFX.resetDoc(4000, 3000, '#ffffff'); GFX.addLayer('raster'); GFX.activeLayer().cv.getContext('2d').fillRect(100, 100, 3000, 2000);
    const c = document.createElement('canvas'); c.width = 1400; c.height = 900; const x = c.getContext('2d'), t = performance.now(); for (let i = 0; i < 5; i++) GFX.compose(x, 1400, 900, [0.3, 0, 0, 0.3, 50, 50]); return (performance.now() - t) / 5;
  });
  ok('compose of a 12 MP document under 250 ms', heavy < 250, heavy);

  ok('no page errors', errs.length === 0, errs.slice(0, 3));
  console.log(`${n} checks passed`); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
