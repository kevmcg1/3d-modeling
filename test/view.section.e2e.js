// Section view: cut the model (and in Manufacture the stock, vise and toolpaths) with a plane at any point along X, Y or Z.
// The cut face is drawn like an engineering section: a blueprint crosshatch with a bold outline. Opening sweeps the plane in and closing
// sweeps it out (a dissolve and rebuild); the bar fades.
// Checked on what the renderer actually draws: the canvas is transparent where nothing is drawn, so the count of drawn pixels
// says what the plane removed, and the colors of the cut face say whether it is hatched.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/view.section.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (3d-modeler.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 900)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } }); await page.addInitScript(() => { window.DATUM_PREMIUM = true; window.DATUM_AUTO = true; window.DATUM_NOFX = true; });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' })); await page.route(/gate\.js/, r => r.abort());
  await page.goto('file://' + path.resolve(__dirname, '..', '3d-modeler.html') + '?dev=1'); await page.waitForTimeout(2000);
  await page.evaluate(() => { const s = SAMPLES.find(x => x.name === 'Pocketed plate'); loadDoc(s.make(), 'test'); }); await page.waitForTimeout(1500);
  await page.evaluate(() => { fitAll(); }); await page.waitForTimeout(1500);
  await page.evaluate(() => {
    // render the scene once and read it back: the drawn pixels (alpha), their mean color, and how many are near each of the given colors
    window.drawn = (win, near) => {
      SECTION.tick(); renderer.setRenderTarget(null); renderer.setScissorTest(false); renderer.setViewport(0, 0, W, H); renderer.clear(); renderer.render(scene, camera);
      if (win === 'cube') { const r = cubeRect(); cubeCam.position.copy(new THREE.Vector3(0, 0, 3).applyQuaternion(view.quat)); cubeCam.quaternion.copy(view.quat); cubeCam.updateMatrixWorld(); const cp = renderer.clippingPlanes; renderer.clippingPlanes = []; renderer.clearDepth(); renderer.setViewport(r.x, H - r.y - r.h, r.w, r.h); renderer.render(cubeScene, cubeCam); renderer.clippingPlanes = cp; renderer.setViewport(0, 0, W, H); win = [Math.floor(r.x), Math.floor(H - r.y - r.h), Math.ceil(r.x + r.w), Math.ceil(H - r.y)]; }
      const gl = renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, buf = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let n = 0, sr = 0, sg = 0, sb = 0; const x0 = win ? win[0] : 0, y0 = win ? win[1] : 0, x1 = win ? win[2] : w, y1 = win ? win[3] : h, cnt = (near || []).map(() => 0);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4; if (buf[i + 3] > 8) { n++; sr += buf[i]; sg += buf[i + 1]; sb += buf[i + 2]; (near || []).forEach((c, k) => { if (Math.hypot(buf[i] - c[0], buf[i + 1] - c[1], buf[i + 2] - c[2]) < (c[3] || 40)) cnt[k]++; }); }
      }
      return { n, mean: n ? [sr / n, sg / n, sb / n].map(v => Math.round(v)) : null, near: cnt, w, h };
    };
  });
  const drawn = (win, near) => page.evaluate(([w, n]) => drawn(w, n), [win, near]);
  const open = o => page.evaluate(o => SECTION.open({ instant: true, flip: false, cap: true, ...o }), o);
  const set = o => page.evaluate(o => SECTION.set(o), o);
  const close = () => page.evaluate(() => SECTION.close({ instant: true }));

  await ok('the toolbar button opens the Section bar (axis, slider, value, Flip, Hatch, Pick, Close) and closes it again; nothing is cut while it is closed', async () => {
    const before = await drawn();
    await page.click('#btnSection'); await page.waitForTimeout(900);
    const has = await page.evaluate(() => ({ bar: !!document.getElementById('secBar'), ax: [...document.querySelectorAll('#secBar [data-sax]')].map(b => b.dataset.sax).join(''), ids: ['secRange', 'secNum', 'secFlip', 'secCapBox', 'secPick', 'secClose'].every(id => !!document.getElementById(id)), on: SECTION.on, planes: renderer.clippingPlanes.length, btn: document.getElementById('btnSection').classList.contains('on') }));
    assert(has.bar && has.ax === 'xyz' && has.ids && has.on && has.planes === 1 && has.btn, JSON.stringify(has));
    await page.click('#secClose'); await page.waitForTimeout(1100);
    const after = await page.evaluate(() => ({ bar: !!document.getElementById('secBar'), on: SECTION.on, planes: renderer.clippingPlanes.length, caps: scene.children.some(c => c.name === 'sectionCaps') }));
    assert(!after.bar && !after.on && after.planes === 0 && !after.caps, JSON.stringify(after));
    const again = await drawn(); assert(Math.abs(again.n - before.n) / before.n < 0.001, `closing restores the view: ${before.n} vs ${again.n}`);
  });

  await ok('opening sweeps the plane in from the end of the model and closing sweeps it back out; the bar fades in and out (a dissolve and rebuild, never a pop)', async () => {
    await page.evaluate(() => SECTION.open({ axis: 'x', flip: false }));
    const mid = await page.evaluate(() => new Promise(r => setTimeout(() => r({ ...SECTION.state, opacity: +getComputedStyle(document.getElementById('secBar')).opacity }), 180)));
    assert(mid.animating && mid.shown > mid.d + 1 && mid.shown < mid.range[1] - 0.01, 'the plane is on its way in: ' + JSON.stringify(mid));
    await page.waitForTimeout(900);
    const done = await page.evaluate(() => ({ ...SECTION.state, opacity: +getComputedStyle(document.getElementById('secBar')).opacity }));
    assert(!done.animating && Math.abs(done.shown - done.d) < 1e-6 && done.opacity > 0.99, 'settled at the position: ' + JSON.stringify(done));
    await page.evaluate(() => SECTION.close());
    const out = await page.evaluate(() => new Promise(r => setTimeout(() => r({ ...SECTION.state, still: !!document.getElementById('secBar'), planes: renderer.clippingPlanes.length, fading: document.getElementById('secBar').classList.contains('sec-hidden') && getComputedStyle(document.getElementById('secBar')).transitionDuration !== '0s' }), 180)));
    assert(out.still && out.planes === 1 && out.fading && out.shown > done.d, 'on its way out, the bar fading: ' + JSON.stringify(out));
    await page.waitForTimeout(1100);
    assert(await page.evaluate(() => !document.getElementById('secBar') && !SECTION.on && renderer.clippingPlanes.length === 0), 'gone once the sweep ends');
    // a drag of the slider is immediate and cancels a sweep in progress
    await page.evaluate(() => { SECTION.open({ axis: 'x', flip: false }); SECTION.set({ d: 3 }); });
    const s = await page.evaluate(() => SECTION.state); assert(!s.animating && s.shown === s.d, 'dragging is immediate');
    await close();
  });

  await ok('the plane is where it says on every axis: default keeps the low side of the position, Flip keeps the high side, and a face lying exactly on the plane stays whole', async () => {
    await open({});
    const r = await page.evaluate(() => {
      const out = {};
      for (const ax of ['x', 'y', 'z']) for (const flip of [false, true]) {
        SECTION.set({ axis: ax, flip, d: SECTION.state.range[0] + 0.25 * (SECTION.state.range[1] - SECTION.state.range[0]) }); SECTION.tick();
        const pl = renderer.clippingPlanes[0], u = { x: [1, 0, 0], y: [0, 0, -1], z: [0, 1, 0] }[ax], d = SECTION.state.d;
        const at = s => new THREE.Vector3(...u).multiplyScalar(s);               // a scene point at user coordinate s along the axis
        out[ax + (flip ? 'F' : '')] = { low: pl.distanceToPoint(at(d - 5)) >= 0, high: pl.distanceToPoint(at(d + 5)) >= 0, on: pl.distanceToPoint(at(d)) >= 0 && pl.distanceToPoint(at(d)) < 0.05 };
      }
      return out;
    });
    for (const ax of ['x', 'y', 'z']) { assert(r[ax].low && !r[ax].high && r[ax].on, ax + ' ' + JSON.stringify(r[ax])); assert(!r[ax + 'F'].low && r[ax + 'F'].high && r[ax + 'F'].on, ax + ' flipped ' + JSON.stringify(r[ax + 'F'])); }
  });

  await ok('the renderer really cuts: a plane past the model changes nothing, a plane at one end leaves a sliver, one through the middle removes about half', async () => {
    await close();
    const whole = (await drawn()).n;
    await open({ axis: 'x', cap: false }); await set({ d: await page.evaluate(() => SECTION.state.range[1]) });
    const past = (await drawn()).n;
    await set({ d: await page.evaluate(() => SECTION.state.range[0] + 3) });
    const sliver = (await drawn()).n;
    await set({ d: await page.evaluate(() => (SECTION.state.range[0] + SECTION.state.range[1]) / 2) });
    const half = (await drawn()).n;
    assert(Math.abs(past - whole) / whole < 0.02, `plane exactly at the far face: ${past} vs ${whole}`);
    assert(sliver < whole * 0.25, `a sliver at one end: ${sliver} vs ${whole}`);
    assert(half < whole * 0.85 && half > sliver, `through the middle: ${half} of ${whole}`);
  });

  await ok('the cut face is a blueprint section: crosshatched (lines and fill both present, in about the right proportion) with a bold outline, and without Hatch it is not', async () => {
    await open({ axis: 'x', cap: true }); await set({ d: await page.evaluate(() => (SECTION.state.range[0] + SECTION.state.range[1]) / 2 + 12) });
    // dark theme palette: fill 17283d, hatch 7fb1e6, outline eaf3ff
    const near = [[0x17, 0x28, 0x3d, 14], [0x7f, 0xb1, 0xe6, 40], [0xea, 0xf3, 0xff, 22]];
    const on = await drawn(null, near), [fill, line, edge] = on.near;
    assert(fill > 800 && line > 150 && edge > 60, `fill ${fill}, hatch lines ${line}, outline ${edge}`);
    const share = line / (line + fill); assert(share > 0.04 && share < 0.5, 'hatch share ' + share.toFixed(2));
    await set({ cap: false }); const off = await drawn(null, near);
    assert(off.near[0] < fill * 0.2 && off.near[1] < line * 0.3 && off.near[2] < edge * 0.3, `without Hatch: ${JSON.stringify(off.near)} vs ${JSON.stringify(on.near)}`);
    await set({ cap: true });
  });

  await ok('hatch lines run at 45 degrees: a row of the cut face crosses a line at a steady interval, and the next row is shifted', async () => {
    // the cut face seen square on: look along the axis of a Y cut (the plate cut lengthwise)
    const r = await page.evaluate(() => {
      SECTION.close({ instant: true }); SECTION.open({ instant: true, axis: 'y', flip: true, cap: true }); SECTION.set({ d: 0 });
      view.quat.setFromEuler(new THREE.Euler(0, 0, 0)); view.anim = null; updateCamera(); SECTION.tick(); renderer.setRenderTarget(null); renderer.setScissorTest(false); renderer.setViewport(0, 0, W, H); renderer.clear(); renderer.render(scene, camera);
      const gl = renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, buf = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const isCut = i => buf[i + 3] > 8 && buf[i + 2] > buf[i] + 25 && buf[i + 2] >= buf[i + 1], isLine = i => isCut(i) && buf[i + 1] > 105, isFill = i => isCut(i) && !isLine(i);       // the cut face is blue; the lines are its light blue
      // find a row with a long run of cut face
      let best = null;
      for (let y = 0; y < h && !best; y += 3) { let run = 0, lines = [], inLine = false, start = -1; for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, f = isFill(i), l = isLine(i); if (f || l) { if (!run) start = x; run++; if (l && !inLine) { lines.push(x); inLine = true; } if (!l) inLine = false; } else { if (run > 90 && lines.length >= 3) { best = { y, lines, start, run }; break; } run = 0; lines = []; inLine = false; } } }
      if (!best) return null;
      const row = y => { const out = []; let inL = false; for (let x = best.start; x < best.start + best.run; x++) { const l = isLine((y * w + x) * 4); if (l && !inL) out.push(x); inL = l; } return out; };
      return { a: best.lines, b: row(best.y + 4), y: best.y };
    });
    assert(r && r.a.length >= 3, 'no cut face found: ' + JSON.stringify(r));
    const gaps = r.a.slice(1).map((x, i) => x - r.a[i]), mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    assert(gaps.every(g => Math.abs(g - mean) < 2.5), 'even spacing ' + JSON.stringify(gaps));
    assert(r.b.length >= 3 && Math.abs(r.b[0] - r.a[0]) > 0.5, '45 degrees: the lines in the next row are shifted: ' + JSON.stringify([r.a.slice(0, 4), r.b.slice(0, 4)]));
    await page.evaluate(() => { SECTION.close({ instant: true }); });
  });

  await ok('the position can be typed in the display units (inches), slid, or picked on the model; Pick puts the plane through the clicked point', async () => {
    await page.click('#btnHome'); await page.waitForTimeout(900);
    await open({ axis: 'z' });
    await page.fill('#secNum', '0.25'); await page.waitForTimeout(200);
    assert(Math.abs(await page.evaluate(() => SECTION.state.d) - 6.35) < 0.01, 'typed 0.25 in = 6.35 mm');
    await page.evaluate(() => { const r = document.getElementById('secRange'); r.value = r.max; r.dispatchEvent(new Event('input', { bubbles: true })); });
    assert(Math.abs(await page.evaluate(() => SECTION.state.d - SECTION.state.range[1])) < 1e-6, 'slider to the top');
    const toScreen = pt => page.evaluate(p => { const v = new THREE.Vector3(...p).project(camera), r = glCanvas.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; }, pt);
    await page.click('#secPick'); await page.waitForTimeout(150);
    assert(await page.evaluate(() => SECTION.state.picking), 'picking');
    const top = await toScreen([-30, 15, 30]);                              // on the plate's top face
    await page.mouse.click(top.x, top.y); await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ d: SECTION.state.d, picking: SECTION.state.picking }));
    assert(!r.picking && Math.abs(r.d - 15) < 0.2, JSON.stringify(r));
    await page.evaluate(() => { SECTION.set({ d: SECTION.state.range[1] }); SECTION.pick(true); });
    const floor = await toScreen([-30, 7, 0]);                              // on the floor of the pocket
    await page.mouse.click(floor.x, floor.y); await page.waitForTimeout(300);
    const r2 = await page.evaluate(() => SECTION.state.d); assert(r2 > 6.5 && r2 < 15.2, 'a second pick moves the plane to ' + r2);
    await page.evaluate(() => SECTION.pick(true)); await page.keyboard.press('Escape'); assert(!(await page.evaluate(() => SECTION.state.picking)), 'Escape leaves picking');
    await close();
  });

  await ok('changing the axis recomputes the range from the model and re-centers the plane; the value field follows', async () => {
    const r = await page.evaluate(() => { SECTION.open({ instant: true, axis: 'z', flip: false }); const z = SECTION.state.range.slice(); SECTION.set({ axis: 'x' }); const x = SECTION.state.range.slice(), dx = SECTION.state.d; return { z, x, dx, field: document.getElementById('secNum').value }; });
    assert(Math.abs(r.z[1] - r.z[0] - 15) < 0.1 && Math.abs(r.x[1] - r.x[0] - 120) < 0.1 && Math.abs(r.dx) < 0.1, JSON.stringify(r));
    assert(Math.abs(parseFloat(r.field)) < 0.01, 'the field shows the center: ' + r.field);
  });

  await ok('the view cube is never cut, even when the plane removes nearly the whole model', async () => {
    await close();
    const win = 'cube';
    const cubeOpen = (await drawn(win)).n;
    await open({ axis: 'x' }); await set({ d: await page.evaluate(() => SECTION.state.range[0]) });
    const cubeCut = (await drawn(win)).n;
    assert(cubeOpen > 50, 'the cube is drawn: ' + cubeOpen);
    assert(Math.abs(cubeOpen - cubeCut) / cubeOpen < 0.02, `cube pixels ${cubeOpen} vs ${cubeCut}`);
    await close();
  });

  await ok('Manufacture: the same plane cuts the stock, the vise and the toolpaths, its range covers the stock, and it stays on when switching workspace', async () => {
    await page.evaluate(async () => { const e0 = camEpoch; setWorkspace('cam'); for (let i = 0; i < 200 && camEpoch === e0; i++) await new Promise(r => setTimeout(r, 50)); autoResult(); autoApply(true); await waitToolpaths(120000); });
    await page.waitForTimeout(1200);
    const whole = (await drawn()).n;
    const r = await page.evaluate(() => { SECTION.open({ instant: true, axis: 'x', flip: false, cap: true }); const st = camStock(); return { range: SECTION.state.range, stock: [st.x0, st.x1] }; });
    assert(r.range[0] <= r.stock[0] + 1e-6 && r.range[1] >= r.stock[1] - 1e-6, 'range covers the stock: ' + JSON.stringify(r));
    await set({ d: r.range[0] + 5 });
    const sliver = (await drawn()).n;
    await set({ d: r.range[1] });
    const all = (await drawn()).n;
    assert(sliver < whole * 0.6 && all > whole * 0.85 && all <= whole * 1.01, `whole ${whole}, a sliver at the left end ${sliver}, plane at the right end ${all}`);
    const lines = await page.evaluate(() => { let n = 0; scene.traverse(o => { if (o.isLine && o.visible) n++; }); return n; });
    assert(lines > 0, 'the toolpaths are lines in the scene and the plane clips them: ' + lines);
    await page.evaluate(() => { setWorkspace('design'); }); await page.waitForTimeout(500);
    assert(await page.evaluate(() => SECTION.on && renderer.clippingPlanes.length === 1 && !!document.getElementById('secBar')), 'still on in Design');
    await close();
  });

  await ok('light theme: the cut face turns to ink on paper (dark hatch on a light fill) and the bar stays readable', async () => {
    await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'light'); });
    await open({ axis: 'x' }); await set({ d: await page.evaluate(() => (SECTION.state.range[0] + SECTION.state.range[1]) / 2 + 12) });
    const near = [[0xf6, 0xf8, 0xfb, 10], [0x27, 0x38, 0x4f, 40]];
    const r = await drawn(null, near); assert(r.near[0] > 800 && r.near[1] > 150, 'paper and ink: ' + JSON.stringify(r.near));
    const c = await page.evaluate(() => { const b = document.getElementById('secBar'), cs = getComputedStyle(b); const L = s => { const m = s.match(/\d+(\.\d+)?/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; }; return { bg: L(cs.backgroundColor), fg: L(cs.color) }; });
    assert(Math.abs(c.bg - c.fg) > 0.4, JSON.stringify(c));
    await close(); await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  });

  await ok('the page raised no errors', async () => { assert.deepStrictEqual(errs, [], errs.join('\n')); });
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
