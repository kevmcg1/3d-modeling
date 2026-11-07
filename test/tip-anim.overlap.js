// Overlap audit of every hover tip animation. Two checks:
//  1. every scene is drawn at 41 moments across its loop and watched while it draws: a label that lands on another label, on the mouse
//     pointer, on the picture's own shapes, that a later shape paints over, or that sits outside the picture is reported;
//  2. every hover target is hovered with the real mouse and its tip card must lie wholly inside the window and must not cover the control
//     it describes.
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/tip-anim.overlap.js [--scenes-only] [--json]
// Exits 1 when anything overlaps. Exports { scenes, cards } for reuse.
const path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { if (require.main === module) { console.log('skip: playwright is not installed'); process.exit(0); } }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
const ROOT = path.resolve(__dirname, '..');
const PAGES = [
  { file: 'index.html', tabs: [['Design', 'design'], ['Manufacture', 'cam'], ['3D Print', 'print']] },
  { file: 'drawing2d.html', tabs: [['2D Drawing', null]] },
  { file: 'house.html', tabs: [['House Design', null]] },
  { file: 'graphics.html', tabs: [['Graphics', null]] },
];
const SEL = '[data-tipkey], #toolbar button:not(.rb-arrow), #toolbar [data-act], #toolbar [data-cam], #topbar button:not(.rb-arrow), #viewtools button, #visGroup button, [data-selmode], #simbar button, [data-tip], .tool, .rb, [data-ws]';

async function openPage(browser, file, vp = { width: 1600, height: 900 }) {
  const page = await browser.newPage({ viewport: vp });
  page.__errs = []; page.on('pageerror', e => page.__errs.push(e.message));
  if (libs) { await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' })); await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' })); }
  await page.route(/fonts\.g/, r => r.abort());
  await page.goto('file://' + path.join(ROOT, file)); await page.waitForTimeout(1500);
  return page;
}

// runs in the page: draws every scene at many moments, recording each label (text, chip), the pointer and what is under / over them
function inPage(N) {
  const AW = TipAnim.AW, AH = TipAnim.AH, out = [];
  const cv = document.createElement('canvas'); cv.width = AW * 2; cv.height = AH * 2;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const bgDiff = (d, i) => { const y = (i / 4 / cv.width) | 0, t = y / cv.height, bg = [248 + (238 - 248) * t, 250 + (242 - 250) * t, 252 + (247 - 252) * t]; return Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 40; };
  // how cluttered the backdrop under a rectangle is: the share of its pixels that differ from its most common colour. A label inside a plain
  // button or panel is fine (0); a label with a line, an edge or a second shape running through it is not.
  const inkShare = (r, data) => {
    const x0 = Math.max(0, Math.floor(r.x * 2)), y0 = Math.max(0, Math.floor(r.y * 2)), x1 = Math.min(cv.width, Math.ceil((r.x + r.w) * 2)), y1 = Math.min(cv.height, Math.ceil((r.y + r.h) * 2)), px = [], bins = new Map();
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * cv.width + x) * 4, q = [data[i] >> 4, data[i + 1] >> 4, data[i + 2] >> 4], k = q.join(); px.push(q); bins.set(k, (bins.get(k) || 0) + 1); }
    if (!px.length) return 0; let top = null, tn = 0; for (const [k, n] of bins) if (n > tn) { tn = n; top = k.split(',').map(Number); }
    let far = 0; for (const q of px) if (Math.abs(q[0] - top[0]) + Math.abs(q[1] - top[1]) + Math.abs(q[2] - top[2]) > 3) far++;
    return far / px.length;
  };
  const share = (a, b) => { const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0 ? w * h / (a.w * a.h || 1) : 0; };
  const hit = (a, b, m = 0.5) => a.x < b.x + b.w - m && b.x < a.x + a.w - m && a.y < b.y + b.h - m && b.y < a.y + a.h - m;
  for (const key of TipAnim.keys()) {
    const problems = new Map(), add = (type, t, detail) => { const k = type + '|' + detail; if (!problems.has(k)) problems.set(k, { type, t, detail }); };
    cv.__g = null;
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, labels = [], cursors = [];
      TipAnim.render(key, cv, 0, 0);                    // makes (and resets) the drawing context, so it can be hooked
      const g = cv.__g; let chipNext = false;
      const oText = g.drawLabel, oChip = g.chip, oCur = g.cursor;
      const grabRect = (x, y, s, size, align) => { ctx.save(); ctx.font = `650 ${size}px Inter, system-ui, sans-serif`; const w = ctx.measureText(s).width; ctx.restore(); return { x: align === 'center' ? x - w / 2 : align === 'right' ? x - w : x, y: y - size * 0.8, w, h: size * 1.0 }; };
      g.drawLabel = (x, y, s, c, size = 8, align = 'center') => {
        const r = grabRect(x, y, s, size, align), before = ctx.getImageData(0, 0, cv.width, cv.height).data;
        oText(x, y, s, c, size, align);
        labels.push({ r, s, under: inkShare(r, before), snap: null, chip: false });
        labels[labels.length - 1].snap = ctx.getImageData(Math.max(0, Math.floor(r.x * 2)), Math.max(0, Math.floor(r.y * 2)), Math.max(1, Math.ceil(r.w * 2)), Math.max(1, Math.ceil(r.h * 2)));
      };
      g.chip = (s, c) => { const n = labels.length; oChip(s, c); const ctx2 = ctx; ctx2.save(); ctx2.font = '650 9px Inter, system-ui, sans-serif'; const w = ctx2.measureText(s).width + 12; ctx2.restore(); labels.push({ r: { x: 6, y: 6, w, h: 17 }, s, under: 0, chip: true, snap: null }); };
      
      TipAnim.render(key, cv, t, t * (TipAnim.info(key).dur || 4.4));
      g.cur.forEach(c => cursors.push(c));
      const after = ctx.getImageData(0, 0, cv.width, cv.height).data;
      labels.forEach((L, a) => {
        const tag = '“' + L.s + '”';
        if (L.r.x < 1 || L.r.y < 1 || L.r.x + L.r.w > AW - 1 || L.r.y + L.r.h > AH - 1) add('label outside the picture', t, tag);
        if (!L.chip && L.under > 0.2) add('a line or edge runs through a label', t, tag + ' (' + Math.round(L.under * 100) + '% of it over drawing)');
        for (let b = a + 1; b < labels.length; b++) if (hit(L.r, labels[b].r, 1)) add('labels overlap', t, tag + ' and “' + labels[b].s + '”');
        cursors.forEach(c => { if (share(L.r, c) > 0.2) add('pointer covers a label', t, tag); });
        if (L.snap && !L.chip) {   // something drawn after the label paints over it
          const x0 = Math.max(0, Math.floor(L.r.x * 2)), y0 = Math.max(0, Math.floor(L.r.y * 2)); let n = 0, k = 0;
          for (let y = 0; y < L.snap.height; y++) for (let x = 0; x < L.snap.width; x++) { const i = (y * L.snap.width + x) * 4, j = ((y0 + y) * cv.width + x0 + x) * 4; n++; if (Math.abs(L.snap.data[i] - after[j]) + Math.abs(L.snap.data[i + 1] - after[j + 1]) + Math.abs(L.snap.data[i + 2] - after[j + 2]) > 60) k++; }
          if (n && k / n > 0.2 && !cursors.some(c => hit(L.r, c, 1))) add('a later shape paints over a label', t, tag + ' (' + Math.round(k / n * 100) + '% covered)');
        }
      });
      cursors.forEach(c => { if (c.x < 0 || c.y < 0 || c.x > AW - 7 || c.y > AH - 11) add('pointer outside the picture', t, Math.round(c.x) + ',' + Math.round(c.y)); });
      g.drawLabel = oText; g.chip = oChip; g.cursor = oCur;
    }
    if (problems.size) out.push({ key, problems: [...problems.values()] });
  }
  return { checked: TipAnim.keys().length, out };
}

async function scenes(browser) {
  const all = [];
  for (const P of PAGES) {
    const page = await openPage(browser, P.file);
    const r = await page.evaluate(inPage, 40).catch(e => ({ checked: 0, out: [], err: String(e.message).slice(0, 200) }));
    all.push({ page: P.file, ...r }); await page.close();
  }
  return all;
}

// the live card: inside the window, and not on the control it describes
async function cards(browser) {
  const out = []; let hovered = 0;
  for (const P of PAGES) {
    for (const vp of [{ width: 1600, height: 900 }, { width: 1100, height: 700 }]) {
      const page = await openPage(browser, P.file, vp);
      for (const [tab, ws] of P.tabs) {
        if (ws) { await page.evaluate(w => setWorkspace(w), ws); await page.waitForTimeout(600); }
        const n = await page.evaluate(sel => { let i = 0; for (const el of document.querySelectorAll(sel)) { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || !el.getClientRects().length) continue; el.setAttribute('data-ovl', i++); } return i; }, SEL);
        for (let i = 0; i < n; i++) {
          const loc = page.locator(`[data-ovl="${i}"]`).first();
          try { await loc.scrollIntoViewIfNeeded({ timeout: 600 }); await page.mouse.move(2, 2); await loc.hover({ timeout: 600, force: true }); } catch (e) { continue; }
          await page.waitForTimeout(620);
          const r = await page.evaluate(i => {
            const el = document.querySelector(`[data-ovl="${i}"]`), card = document.querySelector('#tipcard.on, #tipcard:not([hidden]), #tip.in, .tipl.on'); if (!el || !card) return null;
            const c = card.getBoundingClientRect(), e = el.getBoundingClientRect(); if (c.width < 20 || getComputedStyle(card).opacity < 0.5) return null;
            const W = document.documentElement.clientWidth, H = document.documentElement.clientHeight, inter = Math.min(c.right, e.right) - Math.max(c.left, e.left) > 2 && Math.min(c.bottom, e.bottom) - Math.max(c.top, e.top) > 2;
            return { name: (el.dataset.tipkey || el.dataset.act || el.dataset.cam || el.id || el.textContent || '').trim().slice(0, 32), cut: c.left < -1 || c.top < -1 || c.right > W + 1 || c.bottom > H + 1, covers: inter, card: [c.left, c.top, c.right, c.bottom].map(Math.round), el: [e.left, e.top, e.right, e.bottom].map(Math.round) };
          }, i);
          if (r) { hovered++; if (r.cut || r.covers) out.push({ page: P.file, tab, vp: vp.width + '×' + vp.height, ...r }); }
          await page.mouse.move(2, 2);
        }
      }
      await page.close();
    }
  }
  return { hovered, out };
}

module.exports = { scenes, cards, inPage };
if (require.main === module) (async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const res = { scenes: await scenes(browser) }; if (!process.argv.includes('--scenes-only')) res.cards = await cards(browser);
  await browser.close();
  if (process.argv.includes('--json')) { console.log(JSON.stringify(res, null, 1)); }
  let bad = 0;
  for (const s of res.scenes) {
    console.log(`\n${s.page}: ${s.checked} scenes${s.err ? ' (' + s.err + ')' : ''}`);
    for (const sc of s.out) { bad += sc.problems.length; console.log('  ' + sc.key); sc.problems.forEach(p => console.log(`     ✗ ${p.type}: ${p.detail} (at ${Math.round(p.t * 100)}%)`)); }
  }
  if (res.cards) { console.log(`\ncards: ${res.cards.hovered} hovered`); res.cards.out.forEach(c => { bad++; console.log(`  ✗ ${c.page} ${c.tab} ${c.vp} ${c.name}: ${c.cut ? 'card runs off the window ' : ''}${c.covers ? 'card covers its control ' : ''}card ${c.card} control ${c.el}`); }); }
  console.log(bad ? `\n${bad} overlap problems` : '\nno overlaps'); process.exit(bad ? 1 : 0);
})();
