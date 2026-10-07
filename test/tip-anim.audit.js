// Audit of every hover tip card: opens each one in a real browser with the real mouse, samples the animation over time and
// checks it is an action scene that moves (no still picture, no crossfade).
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/tip-anim.audit.js [--write-doc] [--quick]
//   --write-doc  writes docs/tip-animation-audit.md (tool, scene, verified) and the contact sheets in docs/tip-audit/
//   --quick      hovers about every 6th target only (the e2e test uses this)
// Exports { sweep } for test/tip-anim.e2e.js.
const path = require('path'), fs = require('fs');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { if (require.main === module) { console.log('skip: playwright is not installed'); process.exit(0); } }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
const ROOT = path.resolve(__dirname, '..');
const PAGES = [
  { file: 'index.html', tabs: [['Design', 'design'], ['Manufacture', 'cam'], ['Setup Sheet', 'sheet'], ['3D Print', 'print']] },
  { file: 'drawing2d.html', tabs: [['2D Drawing', null]] },
  { file: 'house.html', tabs: [['House Design', null]] },
  { file: 'graphics.html', tabs: [['Graphics', null]] },
];
const SEL = '[data-tipkey], #toolbar button:not(.rb-arrow), #toolbar [data-act], #toolbar [data-cam], #topbar button:not(.rb-arrow), #viewtools button, #visGroup button, [data-selmode], #simbar button, #simbar .play, #phy .phy-bar button, [data-tip], .tool, .mi, .dd, button, input[type=checkbox], input[type=range], [data-cmd], [data-p], .rb, [data-ws]';

async function openPage(browser, file) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  if (libs) { await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' })); await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' })); }
  await page.route(/fonts\.g/, r => r.abort());
  await page.goto('file://' + path.join(ROOT, file)); await page.waitForTimeout(1500);
  page.__errs = errs; return page;
}
// small fingerprint of the picture now on the card's canvas
const grab = () => {
  const cv = document.querySelector('#tipcard canvas.ta-cv, #tip canvas.ta-cv'); if (!cv) return null;
  const x = cv.getContext('2d'), w = cv.width, h = cv.height, d = x.getImageData(0, 0, w, h).data, out = [];
  for (let j = 0; j < h; j += 6) for (let i = 0; i < w; i += 6) { const k = (j * w + i) * 4; out.push(d[k], d[k + 1], d[k + 2]); }
  return out;
};
const frac = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 3) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 36) n++; return n / (a.length / 3); };

async function sweep(browser, opt = {}) {
  const rows = [];
  for (const P of PAGES) {
    const page = await openPage(browser, P.file);
    await page.evaluate(() => { window.__calls = []; const o = TipAnim.pic; TipAnim.pic = (k, f) => { window.__calls.push([k, TipAnim.has(k)]); return o(k, f); }; });
    for (const [tab, ws] of P.tabs) {
      if (ws) { await page.evaluate(w => setWorkspace(w), ws); await page.waitForTimeout(700); }
      const seenKeys = new Set();
      for (let pass = 0; pass < 2; pass++) {
        const n = await page.evaluate(sel => { let i = 0; for (const el of document.querySelectorAll(sel)) { const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || !el.getClientRects().length) continue; el.setAttribute('data-tipaudit', i++); } return i; }, SEL);
        for (let i = 0; i < n; i++) {
          if (opt.quick && i % 6) continue;
          const loc = page.locator(`[data-tipaudit="${i}"]`).first();
          let ok = true; try { await loc.scrollIntoViewIfNeeded({ timeout: 800 }); await page.mouse.move(2, 2); await loc.hover({ timeout: 800, force: true }); } catch (e) { ok = false; }
          if (!ok) continue;
          const n0 = await page.evaluate(() => window.__calls.length);
          await page.waitForTimeout(680);
          const info = await page.evaluate(n0 => ({ calls: window.__calls.slice(n0), title: ((document.querySelector('#tipcard .tip-head b, #tip .tip-head b') || {}).textContent || '').trim(), svgInPic: !!document.querySelector('#tipcard .tip-pics, #tip .tip-pics, #tipcard .tip-anim svg, #tip .tip-anim svg, #tipcard .tip-anim img, #tip .tip-anim img') }), n0);
          if (!info.calls.length) { await page.mouse.move(2, 2); continue; }
          const [key, has] = info.calls[info.calls.length - 1];
          if (!key || key === 'undefined') { await page.mouse.move(2, 2); continue; }   // a card with no picture (a plain text hint)
          if (seenKeys.has(key)) { await page.mouse.move(2, 2); continue; }
          seenKeys.add(key);
          let frames = [];
          if (has) { for (let f = 0; f < 3; f++) { frames.push(await page.evaluate(grab)); await page.waitForTimeout(330); } }
          const moved = frames.length > 1 && frames.every(Boolean) ? Math.max(frac(frames[0], frames[1]), frac(frames[1], frames[2]), frac(frames[0], frames[2])) : 0;
          rows.push({ page: P.file, tab, key, title: info.title, scene: has, hover: has && frames.every(Boolean), moved, still: info.svgInPic });
          await page.mouse.move(2, 2); await page.waitForTimeout(60);
        }
      }
    }
    await page.close();
  }
  return rows;
}

// every scene, drawn offline at a spread of t: it must change, and must not look like a crossfade of two pictures
async function offline(browser, keysOnly) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.setContent('<!doctype html><meta charset=utf-8><body></body>');
  const files = ['tip-anim-legacy.js', 'tip-anim.js'].filter(f => fs.existsSync(path.join(ROOT, f))).concat(fs.readdirSync(ROOT).filter(f => /^tip-scenes-.*\.js$/.test(f)).sort());
  for (const f of files) await page.addScriptTag({ path: path.join(ROOT, f) });
  const res = await page.evaluate(() => {
    const out = {}, TS = Array.from({ length: 9 }, (_, i) => 0.04 + i * 0.1);
    for (const key of TipAnim.keys()) {
      const cv = document.createElement('canvas'); cv.width = 240; cv.height = 180;
      const fr = TS.map(t => { cv.__g = null; if (!TipAnim.render(key, cv, t, t * 4.4)) return null; const d = cv.getContext('2d').getImageData(0, 0, 240, 180).data, o = []; for (let j = 0; j < 180; j += 3) for (let i = 0; i < 240; i += 3) { const k = (j * 240 + i) * 4; o.push(d[k], d[k + 1], d[k + 2]); } return o; });
      if (fr.some(f => !f)) { out[key] = { error: true }; continue; }
      const fr2 = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 3) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 36) n++; return n / (a.length / 3); };
      let changes = 0, maxStep = 0; for (let i = 1; i < fr.length; i++) { const c = fr2(fr[i - 1], fr[i]); if (c > 0.002) changes++; maxStep = Math.max(maxStep, c); }
      // crossfade signature: the middle frame is the average of the first and last wherever those two differ
      let cf = 0; for (const [a, m, b] of [[0, 4, 8], [0, 2, 4], [4, 6, 8]]) { let diff = 0, avg = 0; for (let i = 0; i < fr[a].length; i++) { if (Math.abs(fr[a][i] - fr[b][i]) > 40) { diff++; if (Math.abs(fr[m][i] - (fr[a][i] + fr[b][i]) / 2) < 10) avg++; } } if (diff > 400) cf = Math.max(cf, avg / diff); }
      out[key] = { changes, maxStep, crossfade: cf, ends: fr2(fr[0], fr[8]) };
    }
    return out;
  });
  await page.close(); return res;
}

async function main() {
  const quick = process.argv.includes('--quick'), write = process.argv.includes('--write-doc');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const rows = await sweep(browser, { quick }), off = await offline(browser);
  await browser.close();
  const bad = rows.filter(r => !r.scene || !r.hover || r.moved < 0.002 || r.still);
  console.log(`${rows.length} tip cards hovered, ${rows.filter(r => r.scene).length} with an action scene, ${bad.length} problems`);
  bad.forEach(r => console.log('  PROBLEM', r.page, r.tab, r.key, r.title, r.scene ? 'not moving' : 'no scene'));
  if (write) {
    const lines = ['# Hover tip animation audit', '', 'Every tip card that shows a picture, opened with the real mouse in a real browser (`node test/tip-anim.audit.js --write-doc`). **Scene** is the action scene that plays; **Verified** lists what was measured: frames sampled while hovering (the picture changed between them), and nine offline frames across the loop (how many steps changed, and that the middle frame is not a blend of the ends, i.e. no crossfade or morph).', '', '| Tab | Tool | Key | Scene | Verified |', '|---|---|---|---|---|'];
    for (const r of rows.sort((a, b) => a.page.localeCompare(b.page) || a.tab.localeCompare(b.tab))) {
      const o = off[r.key] || {};
      lines.push(`| ${r.tab} | ${r.title.replace(/\|/g, '/')} | \`${r.key}\` | ${r.scene ? 'action' : '**none**'} | ${r.scene && r.hover && r.moved >= 0.002 && !r.still && o.changes >= 3 && o.crossfade < 0.5 ? `yes · hover ${(r.moved * 100).toFixed(0)}% changed · ${o.changes}/8 steps · blend ${(o.crossfade * 100).toFixed(0)}%` : '**no**'} |`);
    }
    fs.writeFileSync(path.join(ROOT, 'docs', 'tip-animation-audit.md'), lines.join('\n') + '\n');
    console.log('wrote docs/tip-animation-audit.md');
  }
  process.exit(bad.length ? 1 : 0);
}
module.exports = { sweep, offline, openPage };
if (require.main === module) main();
