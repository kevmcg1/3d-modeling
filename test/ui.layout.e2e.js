// UI layout: ribbon buttons are centered and unclipped, segmented controls are evenly sized with no wrapped or clipped labels,
// and the extrude drag arrow is big and lights up on hover — at 1100, 1400 and 1920 px wide, in every tab.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/ui.layout.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (index.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 900)); } };
// what is wrong with the visible ribbon buttons and segmented controls, as short strings
const probe = () => {
  const bad = [], vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const rbar = document.querySelector('.ribbon') && document.querySelector('.ribbon').getBoundingClientRect();
  document.querySelectorAll('.rb-big').forEach(el => {
    if (!vis(el)) return; const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, sp = el.querySelector('span'), sv = el.querySelector('svg'), name = (sp ? sp.textContent : el.textContent).trim();
    if (sv) { const s = sv.getBoundingClientRect(); if (Math.abs(s.left + s.width / 2 - cx) > 1.5) bad.push(`ribbon "${name}": icon off center`); }
    if (sp) {
      const g = document.createRange(); g.selectNodeContents(sp); const t = g.getBoundingClientRect();
      if (Math.abs(t.left + t.width / 2 - cx) > 2) bad.push(`ribbon "${name}": label off center`);
      if (sp.scrollWidth > sp.clientWidth + 1 || t.left < r.left - 0.5 || t.right > r.right + 0.5) bad.push(`ribbon "${name}": label clipped`);
    }
  });
  document.querySelectorAll('.seg').forEach(seg => {
    if (!vis(seg) || seg.closest('[hidden]')) return;
    const bs = [...seg.children].filter(b => b.tagName === 'BUTTON' && vis(b)); if (bs.length < 2) return;
    const label = bs.map(b => b.textContent.trim()).join(' | ');
    bs.forEach(b => { if (b.scrollWidth > b.clientWidth + 1) bad.push(`seg "${label}": "${b.textContent.trim()}" clipped`); });
    const hs = new Set(bs.map(b => Math.round(b.getBoundingClientRect().height))); if (hs.size > 1) bad.push(`seg "${label}": uneven heights ${[...hs]}`);
    const rows = {}; bs.forEach(b => { const r = b.getBoundingClientRect(); (rows[Math.round(r.top)] = rows[Math.round(r.top)] || []).push(r.width); });
    const keys = Object.keys(rows), full = rows[keys[0]];
    keys.forEach(k => { const w = rows[k]; if (Math.max(...w) - Math.min(...w) > 1.5 && w.length === full.length) bad.push(`seg "${label}": uneven widths ${w.map(Math.round)}`); });
    if (keys.length > 1 && Math.max(...full) - Math.min(...full) > 1.5) bad.push(`seg "${label}": uneven widths ${full.map(Math.round)}`);
    const sr = seg.getBoundingClientRect(); bs.forEach(b => { const r = b.getBoundingClientRect(); if (r.right > sr.right + 1 || r.left < sr.left - 1) bad.push(`seg "${label}": button outside the control`); });
  });
  return bad;
};
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' }));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html')); await page.waitForTimeout(2000);
  const widths = [1100, 1400, 1920];
  const sweep = async ws => { const all = []; for (const w of widths) { await page.setViewportSize({ width: w, height: 850 }); await page.waitForTimeout(900); (await page.evaluate(probe)).forEach(m => all.push(`${w}px: ${m}`)); } return [...new Set(all)]; };

  await page.evaluate(() => {
    const L = (a, b, c, d, id) => ({ id, type: 'line', a: { x: a, y: b }, b: { x: c, y: d } });
    loadDoc({ features: [{ id: 1, type: 'sketch', name: 'Sketch1', ref: { k: 'origin', w: 'XY' }, plane: ORIGIN_PLANES.XY, ents: [L(0, 0, 20, 0, 2), L(20, 0, 20, 10, 3), L(20, 10, 0, 10, 4), L(0, 10, 0, 0, 5)], vis: true }], next: 30 }, 'x');
    selProfiles.push({ sketch: 1, pt: { x: 10, y: 5 } }); cmdExtrude();
  });
  await page.waitForTimeout(1200);

  await ok('design tab with the extrude panel: ribbon and controls are centered, even and unclipped at every width', async () => {
    const bad = await sweep(); assert(bad.length === 0, bad.join('\n'));
  });
  await ok('extent control: four options sit in an even grid with whole labels', async () => {
    const r = await page.evaluate(() => { const s = [...document.querySelectorAll('.seg')].find(x => x.textContent.includes('Up to next')), bs = [...s.children].map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), b.scrollWidth <= b.clientWidth]; }); return bs; });
    assert(r.length === 4 && r.every(b => b[1]) && Math.max(...r.map(b => b[0])) - Math.min(...r.map(b => b[0])) <= 1, JSON.stringify(r));
  });
  await ok('extrude arrow is big, and lights up when hovered', async () => {
    await page.setViewportSize({ width: 1400, height: 850 }); await page.waitForTimeout(500);
    const g = await page.evaluate(() => { const g = arrowGeom(), r = ov.getBoundingClientRect(); return { len: Math.hypot(g.tip.x - g.s0.x, g.tip.y - g.s0.y), x: (g.tip.x + g.s0.x) / 2 + r.left, y: (g.tip.y + g.s0.y) / 2 + r.top, hot: arrowHot }; });
    assert(g.len >= 80 && !g.hot, JSON.stringify(g));
    await page.mouse.move(g.x, g.y); await page.waitForTimeout(150);
    assert(await page.evaluate(() => arrowHot), 'arrow did not highlight on hover');
    await page.mouse.move(g.x + 150, g.y - 100); await page.waitForTimeout(150);
    assert(!(await page.evaluate(() => arrowHot)), 'arrow stayed highlighted after the pointer left');
  });
  await page.evaluate(() => { cancelCmd && cancelCmd(); });
  for (const ws of ['cam', 'sheet', 'draw', 'house', 'print', 'gfx']) {
    await ok(`${ws} tab: ribbon and controls are centered, even and unclipped at every width`, async () => {
      await page.evaluate(w => { try { setWorkspace(w); } catch (e) { /* tab missing */ } }, ws); await page.waitForTimeout(900);
      const bad = await sweep(); assert(bad.length === 0, bad.join('\n'));
    });
  }
  await ok('manufacture tab: every operation panel has even, whole segmented controls', async () => {
    await page.evaluate(() => { const s = SAMPLES.find(x => x.name === 'Pocketed plate'); loadDoc(s.make(), 'test'); setWorkspace('cam'); autoProgram(); return waitToolpaths(); });
    const ids = await page.evaluate(() => cam().ops.map(o => o.id)), bad = [];
    for (const id of ids.slice(0, 8)) {
      await page.evaluate(i => { CAMUI.op = i; refreshUI(); }, id); await page.waitForTimeout(500);
      for (const w of [1100, 1920]) { await page.setViewportSize({ width: w, height: 850 }); await page.waitForTimeout(700); (await page.evaluate(probe)).forEach(m => bad.push(`op ${id} @${w}px: ${m}`)); }
    }
    assert(bad.length === 0, [...new Set(bad)].join('\n'));
  });
  await ok('no page errors', async () => { assert(errs.length === 0, errs.join(' | ')); });
  await browser.close(); console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
