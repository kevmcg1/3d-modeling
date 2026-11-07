// Manufacture: 2D toolpaths assigned by hand to sketches, no 3D part needed, and the parameters of the selected operation in the left sidebar.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/cam.sketch.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (index.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 700)); } };
const near = (a, b, tol, what) => assert(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  await page.addInitScript(() => { window.DATUM_PREMIUM = true; window.DATUM_AUTO = true; window.DATUM_NOFX = true; });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' })); await page.route(/gate\.js/, r => r.abort());
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html') + '?dev=1'); await page.waitForTimeout(2500);
  // a 60 × 40 rectangle (ids 10-13), a Ø12 circle (20) and a free open line (30) on the Top plane; a second sketch on the Front plane
  const setup = () => page.evaluate(() => {
    const L = (id, a, b, c, d) => ({ id, type: 'line', a: { x: a, y: b }, b: { x: c, y: d } });
    loadDoc({ features: [
      { id: 1, type: 'sketch', name: 'Outline', ref: { k: 'origin', w: 'XZ' }, plane: ORIGIN_PLANES.XZ, vis: true, ents: [L(10, 0, 0, 60, 0), L(11, 60, 0, 60, 40), L(12, 60, 40, 0, 40), L(13, 0, 40, 0, 0), { id: 20, type: 'circle', c: { x: 30, y: 20 }, r: 6 }, L(30, 70, 0, 90, 10)] },
      { id: 2, type: 'sketch', name: 'Front', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, vis: true, ents: [L(40, 0, 0, 10, 0)] }], next: 100 }, 'x');
    setWorkspace('cam'); camAddOp('chain');
  });
  await setup(); await page.waitForTimeout(1800);                // let the view settle

  await ok('a sketch gives chains: the rectangle one closed chain, the circle another, the loose line an open one; a Front-plane sketch gives none', async () => {
    const r = await page.evaluate(() => ({ top: CAMSK.allChains(1).map(c => ({ n: c.ents.length, closed: c.closed, z: c.z })), front: CAMSK.chainsOf(doc.features[1]).flat }));
    assert.strictEqual(r.top.length, 3, JSON.stringify(r)); assert(r.top.some(c => c.n === 4 && c.closed), 'rectangle'); assert(r.top.some(c => c.n === 1 && c.closed), 'circle'); assert(r.top.some(c => c.n === 1 && !c.closed), 'line');
    assert.strictEqual(r.front, false);
  });
  await ok('lines joined to arcs make one chain with the arcs cut as arcs (a rounded rectangle)', async () => {
    const r = await page.evaluate(() => {
      const sk = doc.features[0], keep = sk.ents; const R = 5, A = (id, cx, cy, a0, a1) => ({ id, type: 'arc', c: { x: cx, y: cy }, r: R, a0, a1 }), L = (id, a, b, c, d) => ({ id, type: 'line', a: { x: a, y: b }, b: { x: c, y: d } });
      sk.ents = [L(1, 5, 0, 55, 0), A(2, 55, 5, -Math.PI / 2, 0), L(3, 60, 5, 60, 35), A(4, 55, 35, 0, Math.PI / 2), L(5, 55, 40, 5, 40), A(6, 5, 35, Math.PI / 2, Math.PI), L(7, 0, 35, 0, 5), A(8, 5, 5, Math.PI, 1.5 * Math.PI)];
      const c = CAMSK.chainsOf(sk).chains; sk.ents = keep; return c.map(q => ({ n: q.ents.length, closed: q.closed, pts: q.pts.length }));
    });
    assert.strictEqual(r.length, 1, JSON.stringify(r)); assert(r[0].n === 8 && r[0].closed && r[0].pts > 30, JSON.stringify(r));
  });
  const click = async (sketchPt, shift) => {
    const s = await page.evaluate(([p]) => { const P = planeTo3(MODEL.planes[1] || doc.features[0].plane, { x: p[0], y: p[1] }), q = toScreen(P), r = ov.getBoundingClientRect(); return { x: q.x + r.left, y: q.y + r.top }; }, [sketchPt]);
    if (shift) await page.keyboard.down('Shift');
    await page.mouse.click(s.x, s.y);
    if (shift) await page.keyboard.up('Shift');
    await page.waitForTimeout(250);
  };
  const chains = () => page.evaluate(() => (cam().ops[0].chains || []).map(c => ({ ents: c.ents, closed: c.closed, sk: c.sk })));
  await ok('clicking a sketch curve in the view chains it: one curve in Single mode, the whole connected run in Chain mode', async () => {
    await page.evaluate(() => { cam().ops[0].chains = []; camRefresh(); CHAINUI.mode = 'single'; }); await page.waitForTimeout(300);
    await click([30, 0]);
    let c = await chains(); assert(c.length === 1 && c[0].ents.length === 1 && c[0].ents[0] === 10 && !c[0].closed, JSON.stringify(c));
    await page.evaluate(() => { cam().ops[0].chains = []; camRefresh(); CHAINUI.mode = 'chain'; }); await page.waitForTimeout(300);
    await click([30, 40]);
    c = await chains(); assert(c.length === 1 && c[0].ents.length === 4 && c[0].closed && c[0].sk === 1, JSON.stringify(c));
    await click([36, 20], true);                                    // Shift adds the circle
    c = await chains(); assert(c.length === 2 && c[1].ents[0] === 20, JSON.stringify(c));
  });
  await ok('Chain all (the Sketches list in the panel) chains every run in a sketch, and a chained curve is not added twice', async () => {
    const r = await page.evaluate(() => { const op = cam().ops[0]; op.chains = []; camRefresh(); const b = document.querySelector('[data-skchain="1"]'); b.click(); const n1 = op.chains.length; document.querySelector('[data-skchain="1"]').click(); return { n1, n2: op.chains.length, hasFront: !!document.querySelector('[data-skchain="2"][disabled]') }; });
    assert.strictEqual(r.n1, 3); assert.strictEqual(r.n2, 3); assert(r.hasFront, 'the Front sketch is greyed out');
  });
  await ok('with no 3D part, the sketch is the part: stock around it, and a contour is made with no warnings', async () => {
    const r = await page.evaluate(() => {
      const op = cam().ops[0]; op.chains = CAMSK.allChains(1).filter(c => c.ents.length === 4); camAutoTool(op);
      const P = toolpath(op), p = camPart(), st = camStock(); let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, zmin = Infinity;
      for (const m of P.m) if (!m.r) { x0 = Math.min(x0, m.x); x1 = Math.max(x1, m.x); y0 = Math.min(y0, m.y); y1 = Math.max(y1, m.y); zmin = Math.min(zmin, m.z); }
      return { moves: P.m.length, warn: P.warn, part: p, st, ext: [x0, x1, y0, y1], zmin, r: toolOf(op.tool).d / 2 };
    });
    assert(r.moves > 20 && r.warn.length === 0, JSON.stringify(r.warn)); assert(r.part && r.part.sketchOnly && r.st, 'sketch part');
    assert(r.ext[0] <= -r.r + 0.1 && r.ext[0] > -r.r - 12, 'left: ' + r.ext[0]); assert(r.ext[1] >= 60 + r.r - 0.1 && r.ext[1] < 60 + r.r + 12, 'right: ' + r.ext[1]); assert(r.ext[2] <= -r.r + 0.1 && r.ext[3] >= 40 + r.r - 0.1, 'bottom / top: ' + r.ext);   // outside the line by the tool radius, plus the lead-in arc
    assert(r.zmin < -12, 'cuts through the 0.5" stock: ' + r.zmin);
  });
  await ok('the tool path follows the sketch when it changes', async () => {
    const r = await page.evaluate(() => {
      const op = cam().ops[0], ext = () => { const P = toolpath(op); let x1 = -Infinity; for (const m of P.m) if (!m.r) x1 = Math.max(x1, m.x); return x1; };
      const a = ext(); const sk = doc.features[0]; sk.ents.find(e => e.id === 11).a.x = 80; sk.ents.find(e => e.id === 11).b.x = 80; sk.ents.find(e => e.id === 10).b.x = 80; sk.ents.find(e => e.id === 12).a.x = 80;
      const b = ext(); return { a, b };
    });
    near(r.b - r.a, 20, 0.6, 'the path grew with the sketch');
  });
  await ok('Regenerate keeps sketch chains, and they are never marked stale', async () => {
    const r = await page.evaluate(() => { const op = cam().ops[0]; const n = op.chains.length; const lost = CAMFLOW.regenerate(op, true); return { n, after: op.chains.length, lost, stale: CAMFLOW.isStale(op) }; });
    assert(r.lost === 0 && r.after === r.n && !r.stale, JSON.stringify(r));
  });
  await ok('a chain whose sketch curves are deleted warns instead of failing', async () => {
    const r = await page.evaluate(() => { const op = cam().ops[0]; doc.features[0].ents = doc.features[0].ents.filter(e => e.id > 14); const P = toolpath(op); return P.warn; });
    assert(r.some(w => /sketch/.test(w)), JSON.stringify(r));
    await setup();
  });
  await ok('the stock thickness is editable in Stock & origin when there is no 3D part', async () => {
    await page.evaluate(() => { CAMUI.view = 'setup'; camRefresh(); });
    const r = await page.evaluate(() => { const i = document.getElementById('skThk'); if (!i) return null; i.value = String(uval(25.4)); i.dispatchEvent(new Event('change')); return { thk: cam().sketchThk, z: camStock().z1 - camStock().z0 }; });
    assert(r && Math.abs(r.thk - 25.4) < 1e-6, JSON.stringify(r)); near(r.z, 25.4 + 12.7, 1e-6, 'stock height = thickness + margins');
  });

  // the work origin, on a part that is only sketches
  const gcode0 = () => page.evaluate(() => { const g = postGcode().text.split('\n').find(l => /^G0 X/.test(l)); const m = /X(-?[\d.]+) Y(-?[\d.]+)/.exec(g || ''); return m ? [+m[1], +m[2]] : null; });
  await page.evaluate(() => { const op = cam().ops[0]; op.chains = CAMSK.allChains(1).filter(c => c.ents.length === 4); op.depthMode = 'through'; CAMUI.view = 'setup'; camRefresh(); });
  await page.waitForTimeout(300);
  await ok('the work origin list moves G54 for a sketch-only part: every choice lands where it says and the program follows', async () => {
    const r = await page.evaluate(async () => {
      const out = {}, sel = document.getElementById('camOrigin');
      if (!sel) return null;
      const g0 = () => { const g = postGcode().text.split('\n').find(l => /^G0 X/.test(l)), m = /X(-?[\d.]+) Y(-?[\d.]+)/.exec(g || ''); return m ? [+m[1], +m[2]] : null; };
      for (const k of ['top-center', 'top-corner', 'bottom-corner', 'model-top']) {
        document.getElementById('camOrigin').value = k; document.getElementById('camOrigin').dispatchEvent(new Event('change', { bubbles: true }));
        out[k] = { o: camOrigin(), is: cam().origin, g: g0(), st: camStock(), p: camPart() };
      }
      return out;
    });
    assert(r, 'no origin list in Stock & origin');
    const c = r['top-center'], k = r['top-corner'], b = r['bottom-corner'], m = r['model-top'];
    near(c.o[0], (c.st.x0 + c.st.x1) / 2, 1e-6, 'top center X'); near(c.o[2], c.st.z1, 1e-6, 'top center Z');
    near(k.o[0], k.st.x0, 1e-6, 'top corner X'); near(k.o[1], k.st.y0, 1e-6, 'top corner Y'); near(k.o[2], k.st.z1, 1e-6, 'top corner Z');
    near(b.o[2], b.st.z0, 1e-6, 'bottom corner Z');
    near(m.o[0], (m.p.x0 + m.p.x1) / 2, 1e-6, 'part top center X'); near(m.o[2], m.p.z1, 1e-6, 'part top Z');
    assert(c.g && k.g, 'a program with a first move');
    near((k.g[0] - c.g[0]) * 25.4, c.o[0] - k.o[0], 0.02, 'the program moved with the origin (X)'); near((k.g[1] - c.g[1]) * 25.4, c.o[1] - k.o[1], 0.02, 'the program moved with the origin (Y)');
  });
  await ok('Set Origin snaps to a sketch corner: hover shows it, a click and Confirm moves G54 there, and Undo puts it back', async () => {
    await page.evaluate(() => { cam().origin = 'top-center'; CAMUI.view = 'overview'; camRefresh(); });
    await page.waitForTimeout(400);
    const before = await page.evaluate(() => JSON.stringify(cam().origin));
    await page.click('#orgChip .oc-b'); await page.waitForTimeout(200);
    const on = await page.evaluate(() => ORG_STATE.on); assert(on, 'Set Origin did not start');
    const s = await page.evaluate(() => { const q = toScreen(planeTo3(MODEL.planes[1] || doc.features[0].plane, { x: 60, y: 40 })), r = ov.getBoundingClientRect(); return { x: q.x + r.left, y: q.y + r.top }; });
    await page.mouse.move(s.x + 3, s.y + 2); await page.waitForTimeout(250);
    const hov = await page.evaluate(() => ORG_STATE.hover && { k: ORG_STATE.hover.k, m: ORG_STATE.hover.m });
    assert(hov && hov.k === 'skpt', 'hover: ' + JSON.stringify(hov)); near(hov.m[0], 60, 1e-3, 'hover X'); near(hov.m[1], 40, 1e-3, 'hover Y');
    await page.mouse.click(s.x + 3, s.y + 2); await page.waitForTimeout(300);
    await page.click('[data-org="ok"]'); await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({ o: camOrigin(), org: cam().origin, on: ORG_STATE.on, name: wcsName(cam()) }));
    assert(after.org && after.org.k === 'skpt' && !after.on, JSON.stringify(after)); near(after.o[0], 60, 1e-3, 'G54 X'); near(after.o[1], 40, 1e-3, 'G54 Y'); near(after.o[2], 0, 1e-3, 'G54 Z');
    const g = await gcode0(); assert(g, 'program'); assert(Math.abs(g[0]) < 8 && Math.abs(g[1]) < 8, 'the program is now measured from that corner: ' + JSON.stringify(g));
    await page.evaluate(() => undo()); await page.waitForTimeout(200);
    assert.strictEqual(await page.evaluate(() => JSON.stringify(cam().origin)), before);
  });
  await ok('Set Origin still snaps to the stock box of a sketch-only part, and Escape leaves it alone', async () => {
    await page.click('#orgChip .oc-b'); await page.waitForTimeout(200);
    const s = await page.evaluate(() => { const st = camStock(), q = toScreen(toW(st.x0, st.y0, st.z1)), r = ov.getBoundingClientRect(); return { x: q.x + r.left, y: q.y + r.top }; });
    await page.mouse.move(s.x, s.y); await page.waitForTimeout(250);
    const hov = await page.evaluate(() => ORG_STATE.hover && ORG_STATE.hover.k); assert(hov === 'scorner', String(hov));
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    assert.strictEqual(await page.evaluate(() => ORG_STATE.on), false);
  });
  await page.evaluate(() => { cam().origin = 'top-center'; CAMUI.view = 'overview'; camRefresh(); });

  // the left sidebar
  const left = () => page.evaluate(() => { const q = document.querySelector('#tabBody [data-opq]'); return q ? q.innerText : null; });
  await page.evaluate(() => { const op = cam().ops[0]; op.chains = CAMSK.allChains(1).filter(c => c.ents.length === 4); CAMUI.view = 'op'; CAMUI.op = op.id; camRefresh(); });
  await ok('the selected operation opens its parameters in the left sidebar: type, tool, compensation, side, depths, feeds', async () => {
    const t = await left(); assert(t, 'no editor under the row');
    for (const w of ['Type', 'Tool', 'Compensation', 'Comp side', 'Cut down to', 'Stepdown', 'Leave stock', 'Lead in / out', 'Feed rate', 'Plunge', 'Spindle']) assert(new RegExp(w, 'i').test(t), 'missing ' + w + ' in: ' + t);
  });
  await ok('comp side and compensation type are set from the left sidebar and change the toolpath', async () => {
    const r = await page.evaluate(() => {
      const op = cam().ops[0], ext = () => { const P = toolpath(op); let x0 = Infinity; for (const m of P.m) if (!m.r) x0 = Math.min(x0, m.x); return x0; };
      document.querySelector('[data-qset="side:left"]').click(); const l = { side: op.side, x0: ext() };
      document.querySelector('[data-qset="side:right"]').click(); const rt = { side: op.side, x0: ext() };
      document.querySelector('[data-qset="comp:control"]').click(); const comp = op.comp, d = !!document.querySelector('#tabBody [data-opq] [data-qn="compD"]');
      document.querySelector('[data-qset="comp:computer"]').click();
      return { l, rt, comp, d };
    });
    assert(r.l.side === 'left' && r.rt.side === 'right' && r.comp === 'control' && r.d, JSON.stringify(r));
    assert(Math.abs(r.l.x0 - r.rt.x0) > 5, 'left and right put the tool on opposite sides of the line: ' + JSON.stringify(r));
  });
  await ok('feed, plunge and spindle speed are the operation\'s own: they reach the moves and the G-code, and the tool is untouched', async () => {
    const r = await page.evaluate(() => {
      const set = (k, v) => { const i = document.querySelector(`#tabBody [data-qn="${k}"]`); i.value = String(v); i.dispatchEvent(new Event('change', { bubbles: true })); };
      const op = cam().ops[0], t = toolOf(op.tool), t0 = { feed: t.feed, plunge: t.plunge, rpm: t.rpm };
      set('feed', 40); set('plunge', 12); set('rpm', 4321);
      const P = toolpath(op), fs = new Set(P.m.filter(m => !m.r).map(m => Math.round(m.f)));
      const g = postGcode().text;
      return { feed: op.feed, plunge: op.plunge, rpm: op.rpm, fs: [...fs], tool: { feed: t.feed, plunge: t.plunge, rpm: t.rpm }, t0, s4321: /S4321 M3/.test(g), inFeed: /\bF40\b/.test(g) && /\bF12\b/.test(g), gs: g.split('\n').filter(l => /F\d/.test(l)).slice(0, 6).join(' / ') };
    });
    near(r.feed, 40 * 25.4, 0.01, 'feed'); near(r.plunge, 12 * 25.4, 0.01, 'plunge'); assert(r.rpm === 4321);
    assert(r.fs.includes(1016) && r.fs.includes(305), JSON.stringify(r.fs)); assert.deepStrictEqual(r.tool, r.t0); assert(r.s4321, 'S4321 in the program'); assert(r.inFeed, 'the feed in the program: ' + r.gs);
  });
  await ok('two operations on one tool can run at different spindle speeds', async () => {
    const r = await page.evaluate(() => {
      const op = cam().ops[0]; camAddOp('chain'); const op2 = cam().ops[1]; op2.chains = JSON.parse(JSON.stringify(op.chains)); op2.tool = op.tool; op2.rpm = 6000; delete op2.feed; delete op2.plunge;
      const g = postGcode().text; return { n4321: (g.match(/S4321 M3/g) || []).length, s6000: /S6000 \(/.test(g) };
    });
    assert(r.n4321 === 1 && r.s6000, JSON.stringify(r));
    await page.evaluate(() => { cam().ops.splice(1, 1); CAMUI.view = 'op'; CAMUI.op = cam().ops[0].id; camRefresh(); });
  });
  await ok('Use tool\'s clears the three overrides; a blank field clears one', async () => {
    const r = await page.evaluate(() => {
      const op = cam().ops[0], b = document.querySelector('#tabBody [data-qreset]'); b.click();
      return { f: op.feed, p: op.plunge, r: op.rpm };
    });
    assert(r.f === undefined && r.p === undefined && r.r === undefined, JSON.stringify(r));
    const r2 = await page.evaluate(() => { const op = cam().ops[0]; op.feed = 500; camRefresh(); const i = document.querySelector('#tabBody [data-qn="feed"]'); i.value = ''; i.dispatchEvent(new Event('change', { bubbles: true })); return op.feed; });
    assert(r2 === undefined, String(r2));
  });
  await ok('toolpath type and tool are switched from the left sidebar', async () => {
    const r = await page.evaluate(() => {
      const op = cam().ops[0], s = document.querySelector('#tabBody [data-qs="cm"]'); s.value = 'pocket'; s.dispatchEvent(new Event('change', { bubbles: true })); const cm = op.cm;
      const tl = document.querySelector('#tabBody [data-qs="tool"]'), other = cam().tools.find(t => t.n !== op.tool); tl.value = String(other.n); tl.dispatchEvent(new Event('change', { bubbles: true }));
      return { cm, tool: op.tool, want: other.n };
    });
    assert(r.cm === 'pocket' && r.tool === r.want, JSON.stringify(r));
  });
  await ok('undo takes a left-sidebar edit back', async () => {
    const r = await page.evaluate(() => { const op = cam().ops[0]; op.cm = 'contour'; const was = op.side || 'auto'; camEdit(op, 'side', 'left'); const now = cam().ops[0].side; undo(); return { was, now, back: cam().ops[0].side || 'auto' }; });
    assert(r.now === 'left' && r.back === r.was, JSON.stringify(r));
  });
  await ok('inches by default: the length fields are labeled with the unit in use', async () => {
    const t = await left(); assert(/\(in\)|\(mm\)/.test(t), t);
  });
  assert.deepStrictEqual(errs, [], errs.join('\n'));
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
