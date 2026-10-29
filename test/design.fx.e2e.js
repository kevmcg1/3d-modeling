// Feature animation: a change to the model plays instead of popping in. Extrude / Hole / Sweep / Loft / Coil grow along their direction,
// Revolve turns round its axis, everything else dissolves old into new, and a hidden or deleted body dissolves out. The real meshes wait
// while the copies play, so the model is never in a half state, and everything ends exactly where the unanimated result would.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/design.fx.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (3d-modeler.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ease = u => u * u * (3 - 2 * u);
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 900)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  await page.addInitScript(() => { window.DATUM_PREMIUM = true; window.DATUM_AUTO = true; });               // (no DATUM_NOFX: the animation is what is tested)
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' })); await page.route(/gate\.js/, r => r.abort());
  await page.goto('file://' + path.resolve(__dirname, '..', '3d-modeler.html') + '?dev=1'); await page.waitForTimeout(2000);
  await page.evaluate(() => {
    window.L = (a, b, c, d, id) => ({ id, type: 'line', a: { x: a, y: b }, b: { x: c, y: d } });
    window.base = () => ({ features: [
      { id: 1, type: 'sketch', name: 'Sketch1', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: [L(0, 0, 20, 0, 2), L(20, 0, 20, 10, 3), L(20, 10, 0, 10, 4), L(0, 10, 0, 0, 5)], vis: true },
      { id: 6, type: 'extrude', name: 'Extrude1', sketch: 1, pts: [{ x: 10, y: 5 }], dist: 5, mode: 'one', op: 'new' }], next: 40 });
    window.sketchBox = (id, x0, y0, x1, y1, plane) => ({ id, type: 'sketch', name: 'Sketch' + id, ref: { k: 'origin', w: plane || 'XY' }, plane: ORIGIN_PLANES[plane || 'XY'], vis: true, ents: [L(x0, y0, x1, y0, id * 10 + 1), L(x1, y0, x1, y1, id * 10 + 2), L(x1, y1, x0, y1, id * 10 + 3), L(x0, y1, x0, y0, id * 10 + 4)] });
    window.settle = async () => { for (let i = 0; i < 400 && (FEATFX.active || modelReq.inflight); i++) await new Promise(r => setTimeout(r, 25)); await new Promise(r => setTimeout(r, 120)); for (let i = 0; i < 400 && (FEATFX.active || modelReq.inflight); i++) await new Promise(r => setTimeout(r, 25)); };
    window.fresh = async () => { loadDoc(base(), 'x'); regen(false); await settle(); return FEATFX.count; };
  });

  await ok('loading a model never animates (only a change to the model does)', async () => {
    const r = await page.evaluate(async () => { const c0 = FEATFX.count; await fresh(); return { c0, c1: FEATFX.count, active: FEATFX.active }; });
    assert(r.c1 === r.c0 && !r.active, JSON.stringify(r));
  });

  await ok('an extrude grows along its direction: the new body waits while a clipped copy plays, then it is whole', async () => {
    const r = await page.evaluate(async () => {
      await fresh(); const c0 = FEATFX.count, nb = bodyMeshes.length;
      doc.features.push(sketchBox(30, 25, 0, 35, 10), { id: 31, type: 'extrude', name: 'Extrude2', sketch: 30, pts: [{ x: 30, y: 5 }], dist: 8, mode: 'one', op: 'new' }); regen(false);
      for (let i = 0; i < 200 && !FEATFX.active; i++) await new Promise(r => setTimeout(r, 25));
      await new Promise(r => setTimeout(r, 200));
      const mid = { active: FEATFX.active, mode: FEATFX.mode, nb: bodyMeshes.length, hiddenReal: bodyMeshes.filter(m => !m.group.visible).length, fx: scene.children.find(c => c.name === 'fx'), clip: 0 };
      if (mid.fx) mid.fx.traverse(o => { if (o.material && o.material.clippingPlanes && o.material.clippingPlanes.length) mid.clip++; });
      const planeAt = mid.fx ? null : null; mid.fx = !!mid.fx;
      await settle();
      return { c0, c1: FEATFX.count, nb, mid, end: { active: FEATFX.active, n: bodyMeshes.length, visible: bodyMeshes.every(m => m.group.visible), fxLeft: scene.children.some(c => c.name === 'fx') } };
    });
    assert(r.c1 === r.c0 + 1 && r.mid.active && r.mid.mode === 'linear' && r.mid.fx && r.mid.clip >= 1, JSON.stringify(r));
    assert(r.mid.nb === r.nb + 1 && r.mid.hiddenReal === 1, 'the real new body waits: ' + JSON.stringify(r.mid));
    assert(!r.end.active && r.end.n === 2 && r.end.visible && !r.end.fxLeft, 'whole and clean afterwards: ' + JSON.stringify(r.end));
  });

  await ok('the extrude sweeps: the clipping plane moves through the new body between its two ends', async () => {
    const r = await page.evaluate(async () => {
      await fresh();
      doc.features.push(sketchBox(30, 25, 0, 35, 10), { id: 31, type: 'extrude', name: 'Extrude2', sketch: 30, pts: [{ x: 30, y: 5 }], dist: 8, mode: 'one', op: 'new' }); regen(false);
      for (let i = 0; i < 200 && !FEATFX.active; i++) await new Promise(r => setTimeout(r, 25));
      const c = () => { const R = FEATFX.state.run; return R ? R.behind.constant : null; };
      const samples = []; for (let i = 0; i < 6; i++) { samples.push(c()); await new Promise(r => setTimeout(r, 90)); }
      await settle(); return samples.filter(v => v != null);
    });
    assert(r.length >= 4 && r.every((v, i) => i === 0 || v >= r[i - 1] - 1e-9) && r[r.length - 1] > r[0], 'steady sweep ' + JSON.stringify(r));
  });

  await ok('a revolve turns: a wedge about the axis opens (angular mode), then the ring is whole', async () => {
    const r = await page.evaluate(async () => {
      await fresh();
      const sk = sketchBox(30, 30, 0, 40, 10, 'XZ'); sk.ents.push(L(0, 0, 0, 10, 391));
      doc.features.push(sk, { id: 31, type: 'revolve', name: 'Revolve1', sketch: 30, pts: [{ x: 35, y: 5 }], axis: { k: 'ent', sk: 30, ent: 391 }, angle: 360, mode: 'one', op: 'new' }); regen(false);
      for (let i = 0; i < 200 && !FEATFX.active && !modelReq.inflight; i++) await new Promise(r => setTimeout(r, 25));
      for (let i = 0; i < 200 && !FEATFX.active; i++) await new Promise(r => setTimeout(r, 25));
      const seen = { mode: FEATFX.mode, ci: new Set(), planes: 0 };
      for (let i = 0; i < 12; i++) { const fx = scene.children.find(c => c.name === 'fx'); if (fx) fx.traverse(o => { if (o.material && o.material.clippingPlanes && o.material.clippingPlanes.length === 2) { seen.planes = 2; seen.ci.add(o.material.clipIntersection); } }); await new Promise(r => setTimeout(r, 80)); }
      await settle();
      return { mode: seen.mode, planes: seen.planes, ci: [...seen.ci], err: Object.keys(MODEL.errors).length, n: bodyMeshes.length, visible: bodyMeshes.every(m => m.group.visible), active: FEATFX.active, errs: JSON.stringify(MODEL.errors) };
    });
    assert(r.err === 0, 'the revolve builds: ' + r.errs);
    assert(r.mode === 'angular' && r.planes === 2 && r.ci.includes(false) && r.ci.includes(true), 'a narrow wedge is two half spaces intersected, a wide one united: ' + JSON.stringify(r));
    assert(r.n === 2 && r.visible && !r.active, 'whole afterwards: ' + JSON.stringify(r));
  });

  await ok('the revolve wedge is oriented right: at any moment the share of the new ring kept by the clipping planes equals how far round the sweep is, and the old shape is kept exactly where the new is not', async () => {
    const r = await page.evaluate(async () => {
      await fresh();
      const sk = sketchBox(30, 30, 0, 40, 10, 'XZ'); sk.ents.push(L(0, 0, 0, 10, 391));
      doc.features.push(sk, { id: 31, type: 'revolve', name: 'Revolve1', sketch: 30, pts: [{ x: 35, y: 5 }], axis: { k: 'ent', sk: 30, ent: 391 }, angle: 360, mode: 'one', op: 'new' }); regen(false);
      for (let i = 0; i < 200 && !FEATFX.active; i++) await new Promise(r => setTimeout(r, 25));
      const out = [];
      for (let k = 0; k < 8 && FEATFX.active; k++) {
        const R = FEATFX.state.run; if (!R || R.mode !== 'angular') break;
        const nm = R.newGroups[0], me = nm.children.find(c => c.isMesh && c.geometry.attributes.position), P = me.geometry.attributes.position.array, mat = me.material;
        const kept = (planes, ci, v) => { const ins = planes.map(p => p.distanceToPoint(v) >= 0); return ci ? ins.some(Boolean) : ins.every(Boolean); };
        let n = 0, k1 = 0; const v = new THREE.Vector3();
        for (let i = 0; i < P.length; i += 9) { v.set(P[i], P[i + 1], P[i + 2]); n++; if (kept(mat.clippingPlanes, mat.clipIntersection, v)) k1++; }
        const { P0, Pt, N0, Nt } = R.angPlanes, wide = mat.clipIntersection;
        let agree = 0; for (let i = 0; i < P.length; i += 9) { v.set(P[i], P[i + 1], P[i + 2]); const nw = kept([P0, Pt], wide, v), od = kept([N0, Nt], !wide, v); if (nw !== od) agree++; }
        out.push({ u: Math.min(1, (performance.now() - R.t0) / R.dur), share: k1 / n, wide, complement: agree / n });
        await new Promise(r => setTimeout(r, 110));
      }
      await settle(); return out;
    });
    assert(r.length >= 4, 'samples: ' + JSON.stringify(r));
    for (const o of r) { assert(o.complement > 0.98, 'old is kept where new is not: ' + JSON.stringify(o)); assert(Math.abs(o.share - ease(o.u)) < 0.2, 'share ' + o.share.toFixed(2) + ' vs progress ' + ease(o.u).toFixed(2)); }
    assert(r[r.length - 1].share > r[0].share, 'the wedge opens');
  });

  await ok('a change that is not a growth (a fillet, a hide) dissolves: old fades out while new fades in, with transparent copies in the scene', async () => {
    const r = await page.evaluate(async () => {
      await fresh();
      doc.hidden = { 6: true }; regen(false);
      for (let i = 0; i < 200 && !FEATFX.active; i++) await new Promise(r => setTimeout(r, 25));
      await new Promise(r => setTimeout(r, 200));
      const fx = scene.children.find(c => c.name === 'fx'), ops = []; if (fx) fx.traverse(o => { if (o.material && o.material.transparent) ops.push(+o.material.opacity.toFixed(2)); });
      const mid = { mode: FEATFX.mode, ops, bodies: bodyMeshes.length };
      await settle();
      const hid = { bodies: bodyMeshes.length, active: FEATFX.active, fx: scene.children.some(c => c.name === 'fx') };
      doc.hidden = {}; regen(false);
      for (let i = 0; i < 200 && !FEATFX.active; i++) await new Promise(r => setTimeout(r, 25));
      const back = { mode: FEATFX.mode }; await settle();
      return { mid, hid, back, end: bodyMeshes.length, visible: bodyMeshes.every(m => m.group.visible) };
    });
    assert(r.mid.mode === 'fade' && r.mid.ops.length > 0 && r.mid.ops.every(v => v >= 0 && v <= 1) && r.mid.ops.some(v => v < 1), 'dissolving out: ' + JSON.stringify(r.mid));
    assert(r.hid.bodies === 0 && !r.hid.active && !r.hid.fx, 'gone cleanly: ' + JSON.stringify(r.hid));
    assert(r.back.mode === 'fade' && r.end === 1 && r.visible, 'built back in: ' + JSON.stringify(r));
  });

  await ok('a second change while one plays finishes the first cleanly: no copies left behind, every body shown and the final model is the second change', async () => {
    const r = await page.evaluate(async () => {
      await fresh();
      doc.features.push(sketchBox(30, 25, 0, 35, 10), { id: 31, type: 'extrude', name: 'Extrude2', sketch: 30, pts: [{ x: 30, y: 5 }], dist: 8, mode: 'one', op: 'new' }); regen(false);
      for (let i = 0; i < 200 && !FEATFX.active; i++) await new Promise(r => setTimeout(r, 25));
      doc.features.push(sketchBox(32, 40, 0, 50, 10), { id: 33, type: 'extrude', name: 'Extrude3', sketch: 32, pts: [{ x: 45, y: 5 }], dist: 6, mode: 'one', op: 'new' }); regen(false);
      await settle();
      return { n: bodyMeshes.length, visible: bodyMeshes.every(m => m.group.visible), fx: scene.children.filter(c => c.name === 'fx').length, active: FEATFX.active };
    });
    assert(r.n === 3 && r.visible && r.fx === 0 && !r.active, JSON.stringify(r));
  });

  await ok('a coarse redraw (a drag in progress) and a finer redraw for the zoom never play', async () => {
    const r = await page.evaluate(async () => { await fresh(); const c0 = FEATFX.count; regen(true); await settle(); regen(false); await settle(); return { d: FEATFX.count - c0 }; });
    assert(r.d === 0, JSON.stringify(r));
  });

  await ok('the animation is off with reduced motion and with DATUM_NOFX, and never runs in Manufacture or during Build playback', async () => {
    const r = await page.evaluate(async () => {
      await fresh(); const out = {};
      window.DATUM_NOFX = true; let c = FEATFX.count; doc.features.push(sketchBox(30, 25, 0, 35, 10), { id: 31, type: 'extrude', name: 'Extrude2', sketch: 30, pts: [{ x: 30, y: 5 }], dist: 8, mode: 'one', op: 'new' }); regen(false); await settle(); out.noFx = FEATFX.count - c; window.DATUM_NOFX = false;
      await fresh(); c = FEATFX.count; setWorkspace('cam'); await new Promise(r => setTimeout(r, 600));
      doc.features.push(sketchBox(30, 25, 0, 35, 10), { id: 31, type: 'extrude', name: 'Extrude2', sketch: 30, pts: [{ x: 30, y: 5 }], dist: 8, mode: 'one', op: 'new' }); regen(false); await settle(); out.cam = FEATFX.count - c; setWorkspace('design');
      return out;
    });
    assert(r.noFx === 0 && r.cam === 0, JSON.stringify(r));
  });

  await ok('after an animation the model is exactly the unanimated result: same bodies, same volumes, same errors', async () => {
    const r = await page.evaluate(async () => {
      const vol = b => b.bb.reduce((a, v) => a + Math.abs(v), 0);                       // a fingerprint of the body: its box
      await fresh();
      doc.features.push(sketchBox(30, 25, 0, 35, 10), { id: 31, type: 'extrude', name: 'Extrude2', sketch: 30, pts: [{ x: 30, y: 5 }], dist: 8, mode: 'one', op: 'new' }); regen(false); await settle();
      const a = MODEL.bodies.map(b => +vol(b).toFixed(3)).sort(), ea = Object.keys(MODEL.errors).length;
      window.DATUM_NOFX = true; await fresh(); doc.features.push(sketchBox(30, 25, 0, 35, 10), { id: 31, type: 'extrude', name: 'Extrude2', sketch: 30, pts: [{ x: 30, y: 5 }], dist: 8, mode: 'one', op: 'new' }); regen(false); await settle();
      const b = MODEL.bodies.map(b => +vol(b).toFixed(3)).sort(); window.DATUM_NOFX = false;
      return { a, b, ea, eb: Object.keys(MODEL.errors).length };
    });
    assert(JSON.stringify(r.a) === JSON.stringify(r.b) && r.ea === 0 && r.eb === 0, JSON.stringify(r));
  });

  await ok('the page raised no errors', async () => { assert.deepStrictEqual(errs, [], errs.join('\n')); });
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
