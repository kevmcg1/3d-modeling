// Ribbon fit: at every window width and screen zoom, in every workspace and in sketch mode, no ribbon button is ever cut off by the ribbon's edge or
// covered by a scroll arrow, no icon leaves its button or sits off-center, no label is clipped, and paging with the arrows shows every button whole.
// Browser zoom is the same as a narrower window with a higher pixel ratio, so the sweep covers both (widths 640 to 2560, pixel ratio 1 to 2).
// Below about 520 px the widest group is wider than the screen; it can still be scrolled but not shown whole, so the sweep stops at 640.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/ribbon.fit.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (3d-modeler.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 1800)); } };

// what is wrong with the ribbon as it stands, and which buttons are whole on screen right now
const probe = () => {
  const nav = document.getElementById('toolbar'), nr = nav.getBoundingClientRect(), bad = [], whole = [], all = [];
  const arrows = [...document.querySelectorAll('.ribbon-wrap > .rb-arrow')].map(a => a.getBoundingClientRect()).filter(r => r.width > 0);
  const nm = b => (b.dataset.act || b.dataset.cam || b.getAttribute('data-tipkey') || b.title || b.textContent.trim() || '?').slice(0, 30);
  nav.querySelectorAll('.rb-btn').forEach(b => {
    const r = b.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(b).visibility === 'hidden') return;
    const name = nm(b), panel = b.closest('.rb-panel');
    all.push(name);
    if (panel && panel.classList.contains('edge')) return;                     // a group the edge would cut in half is not shown until it is paged in whole
    if (!(r.right > nr.left + 0.5 && r.left < nr.right - 0.5)) return;          // paged out of view
    if (r.left < nr.left - 0.5 || r.right > nr.right + 0.5) { bad.push(`${name}: cut by the ribbon edge (${Math.round(Math.max(nr.left - r.left, r.right - nr.right))}px)`); return; }
    if (r.top < nr.top - 0.5 || r.bottom > nr.bottom + 0.5) { bad.push(`${name}: cut at the top or bottom`); return; }
    for (const a of arrows) if (Math.min(r.right, a.right) - Math.max(r.left, a.left) > 0.5) bad.push(`${name}: under a scroll arrow`);
    const sv = b.querySelector('svg:not(.lk)'), sp = b.querySelector(':scope > span:not(.rip-wrap)'), spShown = sp && getComputedStyle(sp).display !== 'none' && sp.getBoundingClientRect().width > 0;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (sv) {
      const s = sv.getBoundingClientRect();
      if (s.left < r.left - 0.5 || s.right > r.right + 0.5 || s.top < r.top - 0.5 || s.bottom > r.bottom + 0.5) bad.push(`${name}: icon sticks out of its button`);
      if (b.classList.contains('rb-big') && Math.abs(s.left + s.width / 2 - cx) > 1.5) bad.push(`${name}: icon off center by ${(s.left + s.width / 2 - cx).toFixed(1)}px`);
      if (!spShown && Math.abs(s.left + s.width / 2 - cx) > 1.5) bad.push(`${name}: icon-only button, icon off center by ${(s.left + s.width / 2 - cx).toFixed(1)}px`);
      if (!spShown && Math.abs(s.top + s.height / 2 - cy) > 1.5) bad.push(`${name}: icon-only button, icon off the middle`);
    }
    if (spShown) {
      const g = document.createRange(); g.selectNodeContents(sp); const t = g.getBoundingClientRect();
      if (sp.scrollWidth > sp.clientWidth + 1 || sp.scrollHeight > sp.clientHeight + 1) bad.push(`${name}: label clipped`);
      if (t.left < r.left - 0.5 || t.right > r.right + 0.5) bad.push(`${name}: label sticks out of its button`);
      if (b.classList.contains('rb-big') && Math.abs(t.left + t.width / 2 - cx) > 2) bad.push(`${name}: label off center`);
    }
    whole.push(name);
  });
  return { bad, whole, all: [...new Set(all)], left: nav.scrollLeft, max: nav.scrollWidth - nav.clientWidth, over: document.querySelector('.ribbon-wrap').classList.contains('ov') };
};

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [];
  const open = async dpr => {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 850 }, deviceScaleFactor: dpr }), page = await ctx.newPage();
    await page.addInitScript(() => { window.DATUM_PREMIUM = true; window.DATUM_AUTO = true; window.DATUM_NOFX = true; });
    page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.dismiss());
    await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' })); await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' })); await page.route(/gate\.js/, r => r.abort()); await page.route(/fonts\.g/, r => r.abort());
    await page.goto('file://' + path.resolve(__dirname, '..', '3d-modeler.html') + '?dev=1'); await page.waitForTimeout(2500);
    return page;
  };
  const STATES = {
    design: p => p.evaluate(() => { setWorkspace('design'); }),
    sketch: p => p.evaluate(() => { setWorkspace('design'); const L = (a, b, c, d, id) => ({ id, type: 'line', a: { x: a, y: b }, b: { x: c, y: d } }); loadDoc({ features: [{ id: 1, type: 'sketch', name: 'Sketch1', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: [L(0, 0, 20, 0, 2), L(20, 0, 20, 10, 3), L(20, 10, 0, 10, 4), L(0, 10, 0, 0, 5)], vis: true }], next: 30 }, 'x'); enterSketch(doc.features[0]); }),
    extrude: p => p.evaluate(() => { setWorkspace('design'); const L = (a, b, c, d, id) => ({ id, type: 'line', a: { x: a, y: b }, b: { x: c, y: d } }); loadDoc({ features: [{ id: 1, type: 'sketch', name: 'Sketch1', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: [L(0, 0, 20, 0, 2), L(20, 0, 20, 10, 3), L(20, 10, 0, 10, 4), L(0, 10, 0, 0, 5)], vis: true }], next: 30 }, 'x'); selProfiles.push({ sketch: 1, pt: { x: 10, y: 5 } }); cmdExtrude(); }),
    manufacture: p => p.evaluate(() => { loadDoc(SAMPLES.find(x => x.name === 'Pocketed plate').make(), 't'); setWorkspace('cam'); }),
    sheet: p => p.evaluate(() => { setWorkspace('sheet'); }),
    print: p => p.evaluate(() => { setWorkspace('print'); }),
  };
  // wait until the ribbon has stopped scrolling and the groups cut by an edge have been hidden
const settle = page => page.evaluate(() => new Promise(res => { const n = document.getElementById('toolbar'); let last = -1, same = 0; const t = setInterval(() => { if (n.scrollLeft === last) { if (++same >= 4) { clearInterval(t); setTimeout(res, 220); } } else { same = 0; last = n.scrollLeft; } }, 60); }));
// every page of the ribbon at the current size: returns what was wrong on any page and which buttons were never whole
  const sweepPages = async page => {
    await page.evaluate(() => { const n = document.getElementById('toolbar'); n.style.scrollBehavior = 'auto'; n.scrollLeft = 0; n.style.scrollBehavior = ''; }); await settle(page);
    const bad = new Set(), seen = new Set(); let all = [], pages = 0, over = false;
    for (let k = 0; k < 40; k++) {
      const r = await page.evaluate(probe); pages++; over = over || r.over; r.bad.forEach(m => bad.add(m)); r.whole.forEach(n => seen.add(n)); all = r.all.length > all.length ? r.all : all;
      const more = await page.evaluate(() => document.querySelector('.ribbon-wrap > .rb-arrow.r').classList.contains('show'));
      if (!more) break;
      const before = r.left; await page.click('.ribbon-wrap > .rb-arrow.r'); await page.waitForTimeout(100); await settle(page);
      if ((await page.evaluate(() => document.getElementById('toolbar').scrollLeft)) <= before + 1) { bad.add('the right arrow is lit but the ribbon does not move'); break; }
    }
    const never = all.filter(n => !seen.has(n)); if (never.length) bad.add(`never shown whole on any page: ${never.slice(0, 8).join(', ')}${never.length > 8 ? ' …' : ''}`);
    return { bad: [...bad], pages, over };
  };

  const WIDTHS = [640, 760, 900, 1024, 1100, 1280, 1366, 1440, 1600, 1920, 2560];
  const page = await open(1);
  for (const [state, setup] of Object.entries(STATES)) {
    await ok(`${state}: no button is cut, covered, off-center or clipped at any width, and every button can be paged in whole`, async () => {
      await page.setViewportSize({ width: 1400, height: 850 }); await setup(page); await page.waitForTimeout(1200);
      const bad = [];
      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w, height: 850 }); await page.waitForTimeout(400);
        const r = await sweepPages(page); r.bad.forEach(m => bad.push(`${w}px: ${m}`));
      }
      assert(bad.length === 0, [...new Set(bad)].join('\n'));
    });
  }
  await ok('the ribbon fits without arrows on a wide screen, and the arrows only take room while it overflows', async () => {
    await page.setViewportSize({ width: 1400, height: 850 }); await STATES.sheet(page); await page.waitForTimeout(900);
    const wide = await page.evaluate(() => ({ ov: document.querySelector('.ribbon-wrap').classList.contains('ov'), aw: document.querySelector('.rb-arrow.l').getBoundingClientRect().width }));
    assert.strictEqual(wide.ov, false); assert.strictEqual(wide.aw, 0);
    await STATES.design(page); await page.setViewportSize({ width: 900, height: 850 }); await page.waitForTimeout(700);
    const narrow = await page.evaluate(() => ({ ov: document.querySelector('.ribbon-wrap').classList.contains('ov'), aw: document.querySelector('.rb-arrow.l').getBoundingClientRect().width }));
    assert.strictEqual(narrow.ov, true); assert(narrow.aw >= 28, 'arrow column ' + narrow.aw);
  });
  await ok('paging back with the left arrow returns to the first group', async () => {
    await page.setViewportSize({ width: 1100, height: 850 }); await STATES.design(page); await page.waitForTimeout(800);
    await page.evaluate(() => { const n = document.getElementById('toolbar'); n.style.scrollBehavior = 'auto'; n.scrollLeft = 0; n.style.scrollBehavior = ''; }); await page.waitForTimeout(300);
    for (let k = 0; k < 6 && await page.evaluate(() => document.querySelector('.rb-arrow.r').classList.contains('show')); k++) { await page.click('.rb-arrow.r'); await page.waitForTimeout(100); await settle(page); }
    assert((await page.evaluate(() => document.getElementById('toolbar').scrollLeft)) > 100, 'it paged forward');
    for (let k = 0; k < 40 && await page.evaluate(() => document.querySelector('.rb-arrow.l').classList.contains('show')); k++) { await page.click('.rb-arrow.l'); await page.waitForTimeout(100); await settle(page); const r = await page.evaluate(probe); assert.deepStrictEqual(r.bad, [], `page ${k}`); }
    assert((await page.evaluate(() => document.getElementById('toolbar').scrollLeft)) <= 4, 'back at the start');
  });
  await ok('the mouse wheel pages the ribbon by whole groups', async () => {
    await page.setViewportSize({ width: 1100, height: 850 }); await STATES.design(page); await page.waitForTimeout(800);
    await page.evaluate(() => { const n = document.getElementById('toolbar'); n.style.scrollBehavior = 'auto'; n.scrollLeft = 0; n.style.scrollBehavior = ''; }); await page.waitForTimeout(300);
    const b = await page.evaluate(() => { const r = document.getElementById('toolbar').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await page.mouse.move(b[0], b[1]); await page.mouse.wheel(0, 120); await page.waitForTimeout(100); await settle(page);
    const r = await page.evaluate(probe); assert(r.left > 100, 'paged ' + r.left); assert.deepStrictEqual(r.bad, []);
  });
  await ok('a hidden group is brought in whole when keyboard focus reaches it', async () => {
    await page.setViewportSize({ width: 1100, height: 850 }); await STATES.design(page); await page.waitForTimeout(800);
    await page.evaluate(() => { const n = document.getElementById('toolbar'); n.style.scrollBehavior = 'auto'; n.scrollLeft = 0; n.style.scrollBehavior = ''; }); await page.waitForTimeout(500);
    const name = await page.evaluate(() => { const p = document.querySelector('.ribbon .rb-panel.edge'); if (!p) return null; const b = p.querySelector('.rb-btn'); b.focus(); return b.dataset.act || b.title; });
    assert(name, 'no group is hidden at this width'); await page.waitForTimeout(900);
    const r = await page.evaluate(probe); assert(r.whole.some(n => n.includes((name || '').slice(0, 12))), 'the focused button is whole: ' + name + ' in ' + r.whole.join(', ')); assert.deepStrictEqual(r.bad, []);
  });
  await ok('nothing fades or masks the ribbon, and the dev tool flags a clipped ribbon but not a hidden group', async () => {
    await page.setViewportSize({ width: 1100, height: 850 }); await STATES.design(page); await page.waitForTimeout(800);
    await page.evaluate(() => { const n = document.getElementById('toolbar'); n.style.scrollBehavior = 'auto'; n.scrollLeft = 0; n.style.scrollBehavior = ''; }); await settle(page);
    const css = await page.evaluate(() => { const c = getComputedStyle(document.getElementById('toolbar')); return [c.maskImage || c.webkitMaskImage, c.filter, c.opacity]; });
    assert.deepStrictEqual(css, ['none', 'none', '1'], 'the ribbon has no mask, filter or fade: ' + css);
    assert.deepStrictEqual(await page.evaluate(() => window.__dev.ribbonProblems()), [], 'a hidden group is not a problem');
    const flagged = await page.evaluate(() => { const p = document.querySelector('.ribbon .rb-panel.edge'), fit = window.ribFit; window.ribFit = null; p.classList.remove('edge'); const out = window.__dev.ribbonProblems(); p.classList.add('edge'); window.ribFit = fit; return out; });   // (ribFit would put the edge class straight back, as it does for the real page)
    assert(flagged.length > 0 && /cut off by the edge of the ribbon/.test(flagged[0]), JSON.stringify(flagged));
  });
  await ok('switching tabs or sketch mode never shows a cut button, not even for a moment', async () => {
    await page.setViewportSize({ width: 1400, height: 850 }); await STATES.design(page); await page.waitForTimeout(800);
    for (const step of ['sketch', 'finish', 'k-key', 'sketch', 'finish']) {
      const seen = await page.evaluate(step => new Promise(res => {
        const bad = new Set(), t0 = performance.now();
        const tick = () => { setTimeout(() => { window.__dev.ribbonProblems().forEach(m => bad.add(m)); }, 0); if (performance.now() - t0 < 700) requestAnimationFrame(tick); else setTimeout(() => res([...bad]), 20); };
        if (step === 'sketch') action('sketch'); else if (step === 'finish') { try { finishSketch(); } catch (e) { /* not sketching */ } } else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true }));
        requestAnimationFrame(tick);
      }), step);
      assert.deepStrictEqual(seen, [], step + ': ' + seen.join('; '));
    }
  });
  await page.context().close();

  // browser zoom changes the pixel ratio along with the width: 125% to 200% of a 1920 / 1366 / 1100 screen
  for (const [dpr, widths] of [[1.25, [1536, 1093, 880]], [1.5, [1280, 910, 733]], [2, [960, 683, 550]]]) {
    await ok(`zoom ${Math.round(dpr * 100)}%: design and manufacture ribbons have nothing cut or off-center`, async () => {
      const p = await open(dpr), bad = [];
      for (const st of ['design', 'manufacture']) {
        await p.setViewportSize({ width: 1400, height: 850 }); await STATES[st](p); await p.waitForTimeout(1000);
        for (const w of widths) { await p.setViewportSize({ width: w, height: 850 }); await p.waitForTimeout(500); const r = await sweepPages(p); r.bad.forEach(m => bad.push(`${st} ${w}px: ${m}`)); }
      }
      await p.context().close(); assert(bad.length === 0, [...new Set(bad)].join('\n'));
    });
  }
  await ok('no page errors', async () => assert.deepStrictEqual(errs, []));
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
