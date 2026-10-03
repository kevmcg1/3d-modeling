// Headless checks for drawing2d.html (the 2D Drawing workspace). Needs Playwright + a Chromium:
//   npm i -D playwright   (set CHROMIUM_PATH to use an existing browser)   then   node test/drawing2d.test.js
// Skips cleanly when Playwright is not installed.
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
const path = require('path'), assert = require('assert');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await page.goto('file://' + path.resolve(__dirname, '..', 'drawing2d.html')); await page.waitForTimeout(300);
  await page.evaluate(() => { D2D.VANIM.on = false; });
  const ev = (f, a) => page.evaluate(f, a);
  // run a command and feed it input lines, yielding between lines so each prompt is asked before the next answer arrives
  const cmd = (name, ...lines) => page.evaluate(async ([n, ls]) => { D2D.run(n); for (const l of ls) { await new Promise(r => setTimeout(r, 0)); D2D.submit(l); } await new Promise(r => setTimeout(r, 0)); }, [name, lines]);
  let n = 0; const ok = (name, cond, extra) => { n++; assert.ok(cond, name + (extra ? ' ' + JSON.stringify(extra) : '')); console.log('ok -', name); };

  // select-then-Enter flow (the interactive path used by every modify command)
  await ev(() => { D2D.add(D2D.mk('line', { p1: [0, 0], p2: [5, 0] })); D2D.add(D2D.mk('line', { p1: [0, 1], p2: [5, 1] })); });
  await cmd('erase', 'all', '');
  ok('erase: select all, Enter', (await ev(() => D2D.doc().ents.length)) === 0);
  await ev(() => { D2D.add(D2D.mk('line', { p1: [0, 0], p2: [10, 0] })); });
  await cmd('move', 'all', '', '0,0', '3,4');
  const mv = await ev(() => D2D.doc().ents[0].p1.map(x => +x.toFixed(6)));
  ok('move by typed points', mv[0] === 3 && mv[1] === 4, mv);

  // DXF round trip keeps every entity type and extents
  const rt = await ev(() => {
    const d = D2D.doc(); d.ents.length = 0; const A = (t, p) => D2D.add(D2D.mk(t, p));
    A('line', { p1: [0, 0], p2: [10, 5] }); A('circle', { c: [3, 3], r: 2.5 }); A('arc', { c: [0, 0], r: 4, a0: .3, a1: 2.1 });
    A('pline', { pts: [[0, 0, 0], [4, 0, .5], [4, 4, 0], [0, 4, -.3]], closed: true }); A('ellipse', { c: [20, 5], maj: [4, 1], ratio: .5, a0: 0, a1: Math.PI * 2 });
    A('spline', { pts: [[0, 10], [3, 12], [6, 9], [9, 12]], closed: false }); A('text', { p: [1, 8], str: 'Hello', h: .5, rot: 0, just: 'BL' });
    const cnt = () => { const c = {}; for (const e of D2D.doc().ents) c[e.type] = (c[e.type] || 0) + 1; return JSON.stringify([c, D2D.docBox().map(x => +x.toFixed(3))]); };
    const before = cnt(), r = D2D.importDXF(D2D.exportDXF()); D2D.loadDocData(JSON.parse(JSON.stringify(r.doc)), 'rt'); return { before, after: cnt(), skipped: r.stats.skipped };
  });
  ok('DXF round trip', rt.before === rt.after && !Object.keys(rt.skipped).length, rt);

  // malformed / hostile DXF text never throws and never yields NaN geometry
  const bad = await ev(() => ['', 'not a dxf', '0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\nabc\n20\n0\n11\n5\n21\n5\n0\nENDSEC\n0\nEOF\n', '0\nSECTION\n2\nENTITIES\n0\nLINE\n8\n0\n10\n1e300\n20\n0\n11\n5\n21\n5\n0\nENDSEC\n0\nEOF\n'].map(s => D2D.importDXF(s).doc.ents.length));
  ok('bad DXF is rejected safely', bad.every(c => c === 0), bad);

  // a big drawing stays interactive and the undo history stays bounded
  const big = await ev(() => {
    const d = D2D.doc(); d.ents.length = 0; let s = 7; const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 20000; i++) { const x = R() * 1000, y = R() * 600; D2D.add(D2D.mk('line', { p1: [x, y], p2: [x + R() * 10, y + R() * 10] })); }
    d.view = { cx: 500, cy: 300, s: 1 }; D2D.drawMain();
    let t = performance.now(); for (let i = 0; i < 20; i++) D2D.pickAt([500 + i, 300]); const pick = (performance.now() - t) / 20;
    t = performance.now(); D2D.drawMain(); const draw = performance.now() - t;
    D2D.HIST.stack = []; D2D.HIST.at = -1; for (let i = 0; i < 300; i++) { D2D.add(D2D.mk('line', { p1: [i, 0], p2: [i, 1] })); D2D.commit(); }
    return { pick, draw, stack: D2D.HIST.stack.length };
  });
  ok('pick on 20k entities < 25 ms', big.pick < 25, big); ok('redraw of 20k entities < 400 ms', big.draw < 400, big); ok('undo history is capped', big.stack <= 120, big);

  // step-by-step guide in the sidebar follows the running command
  await ev(() => { D2D.doc().ents.length = 0; D2D.run('circle'); });
  await page.waitForTimeout(50);
  const g = await ev(() => ({ steps: document.querySelectorAll('#guideBox .g-steps li').length, live: (document.querySelector('#guideBox .g-live') || {}).textContent || '' }));
  ok('guide shows steps and live prompt for Circle', g.steps >= 2 && /center/i.test(g.live), g);
  await page.keyboard.press('Escape');
  ok('no page errors', errs.length === 0, errs.slice(0, 3));
  console.log(`${n} checks passed`); await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
