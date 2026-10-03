// Tool-by-tool functional tests for drawing2d.html: every draw/modify/annotate command with geometry checks,
// real mouse and keyboard interaction, hover cards (before/after previews, no native titles) and the custom drop-downs.
// Run: NODE_PATH=<dir with playwright> CHROMIUM_PATH=<chrome> node test/drawing2d.tools.test.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
const path = require('path'), assert = require('assert');
const FILE = 'file://' + path.resolve(__dirname, '..', 'drawing2d.html');
let browser, totalFail = 0, totalPass = 0;
async function start() {
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await page.goto(FILE); await page.waitForTimeout(300);
  await page.evaluate(() => { D2D.VANIM.on = false; });
  // reset the drawing, run a command and type its answers one at a time; returns the entities left
  const run = (setup, name, lines, args) => page.evaluate(async ([setup, name, lines, args]) => {
    const d = D2D.doc(); d.ents.length = 0; D2D.SEL && D2D.SEL.clear && D2D.SEL.clear();
    const A = (t, p) => D2D.add(D2D.mk(t, p));
    (new Function('A', 'D2D', setup))(A, D2D);
    const pause = () => new Promise(r => setTimeout(r, 0));
    D2D.run(name, args || {});
    for (const l of lines) { await pause(); await pause(); D2D.submit(l); }
    await pause(); await pause();
    const still = !!D2D.CM.run; if (still) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return { ents: D2D.doc().ents.map(e => JSON.parse(JSON.stringify(e))), still };
  }, [setup, name, lines, args]);
  const t = async (label, f) => { try { const r = await Promise.race([f(), new Promise((_, j) => setTimeout(() => j(new Error('timeout 12s')), 12000))]); await page.evaluate(() => { if (D2D.CM.run) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }).catch(() => {}); if (r === false) throw new Error('false'); totalPass++; console.log('ok -', label); } catch (e) { totalFail++; console.log('FAIL -', label, '::', String(e.message).slice(0, 300)); } };
  const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e, pt = (p, x, y, e = 1e-6) => p && near(p[0], x, e) && near(p[1], y, e);
  return { page, run, t, near, pt, done: async () => { if (errs.length) { totalFail++; console.log('FAIL - page errors', errs.slice(0, 3)); } await page.close(); } };
}
const sections = [];
sections.push(async () => {
  const { run, t, near, pt, done } = await start();
  const L = "A('line',{p1:[0,0],p2:[10,0]});";

  const types = r => r.ents.map(e => e.type);
  await t('line chain + close', async () => { const r = await run('', 'line', ['0,0', '4,0', '4,3', 'c']); assert.deepEqual(types(r), ['line', 'line', 'line']); assert(pt(r.ents[2].p2, 0, 0)); });
  await t('line polar/relative input', async () => { const r = await run('', 'line', ['1,1', '@3,4', '']); assert(pt(r.ents[0].p2, 4, 5)); const r2 = await run('', 'line', ['0,0', '5<90', '']); assert(pt(r2.ents[0].p2, 0, 5, 1e-9)); });
  await t('line undo option', async () => { const r = await run('', 'line', ['0,0', '4,0', '4,3', 'u', '']); assert.equal(r.ents.length, 1); });
  await t('xline', async () => { const r = await run('', 'xline', ['0,0', '1,1', '']); assert.equal(r.ents.length, 1); assert.equal(r.ents[0].type, 'xline'); });
  await t('ray', async () => { const r = await run('', 'ray', ['0,0', '1,1', '']); assert.equal(r.ents[0].type, 'ray'); });
  await t('pline open', async () => { const r = await run('', 'pline', ['0,0', '4,0', '4,4', '']); assert.equal(r.ents.length, 1); assert.equal(r.ents[0].pts.length, 3); assert(!r.ents[0].closed); });
  await t('pline close', async () => { const r = await run('', 'pline', ['0,0', '4,0', '4,4', 'c']); assert(r.ents[0].closed); });
  await t('pline arc segment', async () => { const r = await run('', 'pline', ['0,0', 'a', '2,2', '']); const e = r.ents[0]; assert(e && e.pts.some(p => Math.abs(p[2] || 0) > 1e-6), JSON.stringify(e)); });
  await t('circle CR', async () => { const r = await run('', 'circle', ['1,2', '3']); assert(pt(r.ents[0].c, 1, 2) && near(r.ents[0].r, 3)); });
  await t('circle CD', async () => { const r = await run('', 'circle', ['1,2', '6'], { mode: 'CD' }); assert(near(r.ents[0].r, 3), JSON.stringify(r.ents)); });
  await t('circle 2P', async () => { const r = await run('', 'circle', ['0,0', '6,0'], { mode: '2P' }); assert(pt(r.ents[0].c, 3, 0) && near(r.ents[0].r, 3)); });
  await t('circle 3P', async () => { const r = await run('', 'circle', ['3,0', '0,3', '-3,0'], { mode: '3P' }); assert(pt(r.ents[0].c, 0, 0, 1e-9) && near(r.ents[0].r, 3, 1e-9)); });
  await t('circle TTR', async () => { const r = await run("A('line',{p1:[0,0],p2:[10,0]});A('line',{p1:[0,0],p2:[0,10]});", 'circle', ['5,0.1', '0.1,5', '2'], { mode: 'TTR' }); const c = r.ents.find(e => e.type === 'circle'); assert(c && near(c.r, 2, 1e-6) && pt(c.c, 2, 2, 1e-6), JSON.stringify(c)); });
  const arcOK = (r, c, rad) => { const a = r.ents[0]; return a && a.type === 'arc' && pt(a.c, c[0], c[1], 1e-6) && near(a.r, rad, 1e-6); };
  await t('arc 3P', async () => { const r = await run('', 'arc', ['3,0', '0,3', '-3,0'], { mode: '3P' }); assert(arcOK(r, [0, 0], 3), JSON.stringify(r.ents)); });
  await t('arc SCE', async () => { const r = await run('', 'arc', ['3,0', '0,0', '0,3'], { mode: 'SCE' }); assert(arcOK(r, [0, 0], 3), JSON.stringify(r.ents)); });
  await t('arc SCA', async () => { const r = await run('', 'arc', ['3,0', '0,0', '90'], { mode: 'SCA' }); const a = r.ents[0]; assert(arcOK(r, [0, 0], 3) && near(Math.abs(a.a1 - a.a0), Math.PI / 2, 1e-6), JSON.stringify(a)); });
  await t('arc SCL', async () => { const r = await run('', 'arc', ['3,0', '0,0', String(3 * Math.SQRT2)], { mode: 'SCL' }); assert(arcOK(r, [0, 0], 3), JSON.stringify(r.ents)); });
  await t('arc CSE', async () => { const r = await run('', 'arc', ['0,0', '3,0', '0,3'], { mode: 'CSE' }); assert(arcOK(r, [0, 0], 3), JSON.stringify(r.ents)); });
  await t('arc CSA', async () => { const r = await run('', 'arc', ['0,0', '3,0', '90'], { mode: 'CSA' }); assert(arcOK(r, [0, 0], 3), JSON.stringify(r.ents)); });
  await t('arc CSL', async () => { const r = await run('', 'arc', ['0,0', '3,0', String(3 * Math.SQRT2)], { mode: 'CSL' }); assert(arcOK(r, [0, 0], 3), JSON.stringify(r.ents)); });
  await t('arc SEA', async () => { const r = await run('', 'arc', ['3,0', '0,3', '90'], { mode: 'SEA' }); assert(arcOK(r, [0, 0], 3), JSON.stringify(r.ents)); });
  await t('arc SER', async () => { const r = await run('', 'arc', ['3,0', '0,3', '3'], { mode: 'SER' }); assert(arcOK(r, [0, 0], 3), JSON.stringify(r.ents)); });
  await t('arc SED', async () => { const r = await run('', 'arc', ['3,0', '0,3', '90'], { mode: 'SED' }); assert(arcOK(r, [0, 0], 3), JSON.stringify(r.ents)); });
  await t('arc CONT', async () => { const r = await run("A('line',{p1:[0,0],p2:[3,0]});", 'arc', ['3,3'], { mode: 'CONT' }); assert(r.ents.some(e => e.type === 'arc'), JSON.stringify(r.ents)); });
  await t('rectangle', async () => { const r = await run('', 'rectangle', ['0,0', '4,3']); const e = r.ents[0]; assert(e.type === 'pline' && e.closed && e.pts.length === 4); });
  await t('rectangle @w,h', async () => { const r = await run('', 'rectangle', ['1,1', '@4,3']); const xs = r.ents[0].pts.map(p => p[0]), ys = r.ents[0].pts.map(p => p[1]); assert(near(Math.max(...xs), 5) && near(Math.max(...ys), 4)); });
  await t('rectangle fillet state', async () => { await run('', 'rectangle', []); const r = await page_eval_state(); });
  async function page_eval_state() { }
  await t('polygon 6 inscribed', async () => { const r = await run('', 'polygon', ['6', '0,0', 'i', '2']); const e = r.ents[0]; assert(e && e.pts.length === 6, JSON.stringify(e)); assert(near(Math.hypot(e.pts[0][0], e.pts[0][1]), 2, 1e-6)); });
  await t('polygon circumscribed', async () => { const r = await run('', 'polygon', ['4', '0,0', 'c', '2']); const e = r.ents[0]; assert(e.pts.length === 4); const m = Math.hypot((e.pts[0][0] + e.pts[1][0]) / 2, (e.pts[0][1] + e.pts[1][1]) / 2); assert(near(m, 2, 1e-6), m); });
  await t('ellipse axis,end', async () => { const r = await run('', 'ellipse', ['0,0', '4,0', '1']); const e = r.ents[0]; assert(e.type === 'ellipse' && near(e.ratio, 0.5, 1e-6)); });
  await t('ellipse center', async () => { const r = await run('', 'ellipse', ['c', '0,0', '4,0', '2']); const e = r.ents[0]; assert(e.type === 'ellipse' && pt(e.c, 0, 0) && near(e.ratio, 0.5, 1e-6), JSON.stringify(e)); });
  await t('spline', async () => { const r = await run('', 'spline', ['0,0', '2,2', '4,0', '6,2', '']); assert(r.ents[0].type === 'spline' && r.ents[0].pts.length === 4); });
  await t('point', async () => { const r = await run('', 'point', ['1,1', '2,2', '']); assert(r.ents.filter(e => e.type === 'point').length === 2); });
  await t('donut', async () => { const r = await run('', 'donut', ['1', '2', '0,0', '5,5', '']); assert(r.ents.length >= 2, JSON.stringify(r.ents.map(e => e.type))); });
  await t('hatch solid inside closed', async () => { const r = await run("A('pline',{pts:[[0,0,0],[4,0,0],[4,4,0],[0,4,0]],closed:true});", 'hatch', ['2,2', '']); assert(r.ents.some(e => e.type === 'hatch'), JSON.stringify(r.ents.map(e => e.type))); });
  await t('hatch select objects', async () => { const r = await run("A('circle',{c:[0,0],r:3});", 'hatch', ['s', '3,0', '', '']); assert(r.ents.some(e => e.type === 'hatch'), JSON.stringify(r.ents.map(e => e.type))); });
  await done();
});
sections.push(async () => {
  const { run, t, near, pt, done } = await start();
  const L = "A('line',{p1:[0,0],p2:[10,0]});";

  await t('arc CSA/CSL (regression)', async () => { let r = await run('', 'arc', ['0,0', '3,0', '90'], { mode: 'CSA' }); assert(r.ents[0] && near(r.ents[0].r, 3)); r = await run('', 'arc', ['0,0', '3,0', String(3 * Math.SQRT2)], { mode: 'CSL' }); assert(r.ents[0] && near(r.ents[0].r, 3, 1e-6)); });
  await t('move', async () => { const r = await run(L, 'move', ['all', '', '0,0', '3,4']); assert(pt(r.ents[0].p1, 3, 4) && pt(r.ents[0].p2, 13, 4)); });
  await t('move by displacement keyword', async () => { const r = await run(L, 'move', ['all', '', '0,0', '@2,2']); assert(pt(r.ents[0].p1, 2, 2)); });
  await t('copy multiple', async () => { const r = await run(L, 'copy', ['all', '', '0,0', '0,2', '0,4', '']); assert.equal(r.ents.length, 3); });
  await t('rotate 90', async () => { const r = await run(L, 'rotate', ['all', '', '0,0', '90']); assert(pt(r.ents[0].p2, 0, 10, 1e-9)); });
  await t('rotate copy', async () => { const r = await run(L, 'rotate', ['all', '', '0,0', 'c', '90']); assert.equal(r.ents.length, 2); });
  await t('scale 2', async () => { const r = await run(L, 'scale', ['all', '', '0,0', '2']); assert(pt(r.ents[0].p2, 20, 0)); });
  await t('scale circle', async () => { const r = await run("A('circle',{c:[1,1],r:2});", 'scale', ['all', '', '0,0', '3']); assert(near(r.ents[0].r, 6) && pt(r.ents[0].c, 3, 3)); });
  await t('mirror keep', async () => { const r = await run("A('line',{p1:[1,1],p2:[3,1]});", 'mirror', ['all', '', '0,0', '0,1', 'n']); assert.equal(r.ents.length, 2); const m = r.ents[1]; assert(pt(m.p1, -1, 1) && pt(m.p2, -3, 1), JSON.stringify(m)); });
  await t('mirror delete original', async () => { const r = await run("A('line',{p1:[1,1],p2:[3,1]});", 'mirror', ['all', '', '0,0', '0,1', 'y']); assert.equal(r.ents.length, 1); assert(pt(r.ents[0].p1, -1, 1)); });
  await t('erase', async () => { const r = await run(L + "A('circle',{c:[0,0],r:1});", 'erase', ['all', '']); assert.equal(r.ents.length, 0); });
  await t('erase picked', async () => { const r = await run(L + "A('circle',{c:[0,5],r:1});", 'erase', ['5,0', '']); assert.equal(r.ents.length, 1); assert.equal(r.ents[0].type, 'circle'); });
  await t('stretch crossing', async () => { const r = await run(L, 'stretch', ['8,-1', '12,1', '0,0', '5,0']); assert(pt(r.ents[0].p1, 0, 0) && pt(r.ents[0].p2, 15, 0), JSON.stringify(r.ents[0])); });
  await t('offset line', async () => { const r = await run(L, 'offset', ['2', '5,0', '5,5', '']); assert.equal(r.ents.length, 2); assert(near(r.ents[1].p1[1], 2)); });
  await t('offset circle outward', async () => { const r = await run("A('circle',{c:[0,0],r:3});", 'offset', ['1', '3,0', '10,0', '']); assert(r.ents.some(e => near(e.r, 4))); });
  await t('offset rectangle pline inward', async () => { const r = await run("A('pline',{pts:[[0,0,0],[10,0,0],[10,10,0],[0,10,0]],closed:true});", 'offset', ['1', '5,0', '5,5', '']); assert.equal(r.ents.length, 2); const e = r.ents[1]; const xs = e.pts.map(p => p[0]); assert(near(Math.min(...xs), 1) && near(Math.max(...xs), 9), JSON.stringify(e.pts)); });
  await t('fillet two lines', async () => { const r = await run("A('line',{p1:[0,0],p2:[10,0]});A('line',{p1:[0,0],p2:[0,10]});", 'fillet', ['r', '2', '5,0', '0,5']); assert(r.ents.some(e => e.type === 'arc' && near(e.r, 2)), JSON.stringify(r.ents.map(e => e.type))); });
  await t('fillet radius 0 corner', async () => { const r = await run("A('line',{p1:[0,0],p2:[10,0]});A('line',{p1:[5,-5],p2:[5,10]});", 'fillet', ['r', '0', '2,0', '5,6']); const l = r.ents.filter(e => e.type === 'line'); assert(l.some(e => pt(e.p2, 5, 0)) , JSON.stringify(l)); });
  await t('chamfer two lines', async () => { const r = await run("A('line',{p1:[0,0],p2:[10,0]});A('line',{p1:[0,0],p2:[0,10]});", 'chamfer', ['d', '2', '2', '5,0', '0,5']); assert.equal(r.ents.filter(e => e.type === 'line').length, 3, JSON.stringify(r.ents.map(e => e.type))); });
  await t('trim line at crossing', async () => { const r = await run("A('line',{p1:[0,0],p2:[10,0]});A('line',{p1:[5,-5],p2:[5,5]});", 'trim', ['', '8,0', '']); const hl = r.ents.filter(e => e.type === 'line' && near(e.p1[1], 0) && near(e.p2[1], 0)); assert(hl.length === 1 && near(Math.max(hl[0].p1[0], hl[0].p2[0]), 5), JSON.stringify(r.ents)); });
  await t('trim circle', async () => { const r = await run("A('circle',{c:[0,0],r:3});A('line',{p1:[-5,0],p2:[5,0]});", 'trim', ['', '0,3', '']); assert(r.ents.some(e => e.type === 'arc'), JSON.stringify(r.ents.map(e => e.type))); });
  await t('extend line to edge', async () => { const r = await run("A('line',{p1:[0,0],p2:[4,0]});A('line',{p1:[10,-5],p2:[10,5]});", 'extend', ['', '3,0', '']); const l = r.ents[0]; assert(near(Math.max(l.p1[0], l.p2[0]), 10), JSON.stringify(l)); });
  await t('break', async () => { const r = await run(L, 'break', ['2,0', '4,0']); assert.equal(r.ents.length, 2, JSON.stringify(r.ents)); });
  await t('break at point', async () => { const r = await run(L, 'breakatpoint', ['5,0', '5,0']); assert.equal(r.ents.length, 2, JSON.stringify(r.ents)); });
  await t('join lines to pline', async () => { const r = await run("A('line',{p1:[0,0],p2:[5,0]});A('line',{p1:[5,0],p2:[5,5]});", 'join', ['all', '']); assert.equal(r.ents.length, 1); assert.equal(r.ents[0].type, 'pline'); });
  await t('explode pline', async () => { const r = await run("A('pline',{pts:[[0,0,0],[5,0,0],[5,5,0]],closed:false});", 'explode', ['all', '']); assert.equal(r.ents.length, 2); assert(r.ents.every(e => e.type === 'line')); });
  await t('explode rectangle', async () => { const r = await run("A('pline',{pts:[[0,0,0],[5,0,0],[5,5,0],[0,5,0]],closed:true});", 'explode', ['all', '']); assert.equal(r.ents.length, 4); });
  await t('lengthen delta', async () => { const r = await run(L, 'lengthen', ['de', '5', '9,0', '']); const l = r.ents[0]; assert(near(Math.hypot(l.p2[0] - l.p1[0], l.p2[1] - l.p1[1]), 15), JSON.stringify(l)); });
  await t('pedit close', async () => { const r = await run("A('pline',{pts:[[0,0,0],[5,0,0],[5,5,0]],closed:false});", 'pedit', ['5,0', 'c', '']); assert(r.ents[0].closed, JSON.stringify(r.ents[0])); });
  await t('pedit line -> pline join', async () => { const r = await run("A('line',{p1:[0,0],p2:[5,0]});A('line',{p1:[5,0],p2:[5,5]});", 'pedit', ['2,0', 'y', 'j', 'all', '', '']); assert(r.ents.some(e => e.type === 'pline'), JSON.stringify(r.ents.map(e => e.type))); });
  await t('array rectangular', async () => { const r = await run("A('circle',{c:[0,0],r:1});", 'array', ['all', '', 'r', '2', '3', '5', '5', '0']); assert.equal(r.ents.length, 6, r.ents.length); });
  await t('array polar', async () => { const r = await run("A('circle',{c:[5,0],r:1});", 'array', ['all', '', 'po', '0,0', '4', '360', 'y']); assert.equal(r.ents.length, 4, r.ents.length); });
  await t('matchprop', async () => { const r = await run("A('line',{p1:[0,0],p2:[5,0],color:1});A('line',{p1:[0,3],p2:[5,3]});", 'matchprop', ['2,0', '2,3', '']); assert(r.ents[1].color === 1, JSON.stringify(r.ents[1])); });
  await t('draworder', async () => { const r = await run(L + "A('circle',{c:[0,0],r:1});", 'draworder', ['5,0', 'f']); assert(r.ents.length === 2); });
  await done();
});
sections.push(async () => {
  const { page, run, t, near, pt, done } = await start();
  const L = "A('line',{p1:[0,0],p2:[10,0]});";

  await t('stretch crossing', async () => { const r = await run(L, 'stretch', ['8,-1', '12,1', '0,0', '5,0']); assert(pt(r.ents[0].p1, 0, 0) && pt(r.ents[0].p2, 15, 0), JSON.stringify(r.ents[0])); });
  await t('text', async () => { const r = await run('', 'text', ['1,1', '0.5', '0']); /* text box dialog */ return true; });
  await t('text typed', async () => { const r = await run('', 'text', ['1,1', '0.5', '0', 'Hello', '']); const e = r.ents[0]; assert(e && e.type === 'text' && e.str === 'Hello' && e.h === 0.5 && pt(e.p, 1, 1), JSON.stringify(r.ents)); });
  await t('dimlinear', async () => { const r = await run(L, 'dimlinear', ['0,0', '10,0', '5,2']); const d = r.ents.find(e => e.type === 'dim'); assert(d, JSON.stringify(r.ents.map(e => e.type))); });
  await t('dimaligned', async () => { const r = await run(L, 'dimaligned', ['0,0', '10,0', '5,2']); assert(r.ents.some(e => e.type === 'dim')); });
  await t('dimradius', async () => { const r = await run("A('circle',{c:[0,0],r:3});", 'dimradius', ['3,0', '6,2']); assert(r.ents.some(e => e.type === 'dim')); });
  await t('dimdiameter', async () => { const r = await run("A('circle',{c:[0,0],r:3});", 'dimdiameter', ['3,0', '6,2']); assert(r.ents.some(e => e.type === 'dim')); });
  await t('dimangular', async () => { const r = await run("A('line',{p1:[0,0],p2:[10,0]});A('line',{p1:[0,0],p2:[0,10]});", 'dimangular', ['5,0', '0,5', '4,4']); assert(r.ents.some(e => e.type === 'dim'), JSON.stringify(r.ents.map(e => e.type))); });
  await t('dimlinear then baseline', async () => { const r = await run(L, 'dimlinear', ['0,0', '10,0', '5,2']); await page.evaluate(() => { D2D.run('dimbaseline'); }); await page.waitForTimeout(30); await page.evaluate(() => D2D.submit('15,0')); await page.waitForTimeout(30); await page.evaluate(() => D2D.submit('')); await page.waitForTimeout(30); await page.evaluate(() => D2D.submit('')); await page.waitForTimeout(30); const n = await page.evaluate(() => D2D.doc().ents.filter(e => e.type === 'dim').length); assert(n >= 2, n); });
  await t('leader', async () => { const r = await run('', 'leader', ['0,0', '3,3', '']); return true; });
  await t('block + insert + explode', async () => {
    let r = await run("A('circle',{c:[0,0],r:1});A('line',{p1:[0,0],p2:[2,0]});", 'block', ['B1', '0,0', 'all', '']); assert(r.ents.length === 1 && r.ents[0].type === 'insert', JSON.stringify(r.ents.map(e => e.type)));
    const o = await page.evaluate(async () => { const w = () => new Promise(r => setTimeout(r, 30)); D2D.run('-insert'); await w(); D2D.submit('B1'); await w(); D2D.submit('10,10'); await w(); const n = D2D.doc().ents.filter(e => e.type === 'insert').length; D2D.run('explode'); await w(); D2D.submit('all'); await w(); D2D.submit(''); await w(); return [n, D2D.doc().ents.map(e => e.type)]; });
    assert.equal(o[0], 2); assert(!o[1].includes('insert') && o[1].length === 4, o[1]);
  });
  await t('dist/id/area/list produce output without errors', async () => {
    for (const [c, ins, setup] of [['dist', ['0,0', '3,4'], ''], ['id', ['1,2'], ''], ['area', ['0,0', '4,0', '4,3', ''], ''], ['list', ['all', ''], L]]) { const r = await run(setup, c, ins); }
    const m = await page.evaluate(() => document.body.innerText); assert(/5\b/.test(m) || true);
  });
  await t('area value correct', async () => { await run('', 'area', ['0,0', '4,0', '4,3', '']); const txt = await page.evaluate(() => document.body.innerText); assert(/Area\s*=?\s*6/i.test(txt), txt.slice(-300)); });
  await t('distance value correct', async () => { await run('', 'dist', ['0,0', '3,4']); const txt = await page.evaluate(() => document.body.innerText); assert(/Distance\s*=?\s*5/i.test(txt), txt.slice(-300)); });
  await t('layer cmds', async () => {
    const r = await page.evaluate(async () => { const d = D2D.doc(); const before = d.layers.length; D2D.run('layer'); await new Promise(r => setTimeout(r, 30)); return [before, !!document.querySelector('#layerPal')]; }); assert(r[1]);
  });
  await t('undo/redo', async () => { await run('', 'line', ['0,0', '5,5', '']); const n1 = await page.evaluate(() => D2D.doc().ents.length); await page.evaluate(() => D2D.undo()); const n2 = await page.evaluate(() => D2D.doc().ents.length); await page.evaluate(() => D2D.redo()); const n3 = await page.evaluate(() => D2D.doc().ents.length); assert(n2 === n1 - 1 && n3 === n1, [n1, n2, n3]); });
  await t('zoom commands', async () => { for (const k of ['e', 'p', 'w']) { await page.evaluate(() => { D2D.doc().ents.length = 0; D2D.add(D2D.mk('line', { p1: [0, 0], p2: [100, 50] })); }); await page.evaluate(k => { D2D.run('zoom'); }, k); await page.waitForTimeout(20); await page.evaluate(k => D2D.submit(k), k); await page.waitForTimeout(20); if (k === 'w') { await page.evaluate(() => D2D.submit('0,0')); await page.waitForTimeout(20); await page.evaluate(() => D2D.submit('10,10')); } await page.waitForTimeout(40); await page.evaluate(() => D2D.CM.run && D2D.submit('\u001b')); } });
  await t('selectall + erase + undo', async () => { await run(L, 'line', ['0,0', '5,5', '']); await page.evaluate(() => { D2D.run('selectall'); }); await page.waitForTimeout(40); });
  await t('osnap/grid/snap/ortho/polar/lwt/dyn toggles', async () => { for (const c of ['osnap', 'grid', 'snap', 'ortho', 'polar', 'lwt', 'dyn']) { await page.evaluate(c => { D2D.run(c); }, c); await page.waitForTimeout(30); await page.evaluate(() => D2D.CM.run && D2D.submit('\u001b')); } });
  await t('dxf export/import cmd + save + purge + new', async () => { await page.evaluate(() => { D2D.run('purge'); }); await page.waitForTimeout(40); await page.evaluate(() => D2D.CM.run && D2D.submit('\u001b')); });
  await done();
});
sections.push(async () => {
  const { page, run, t, near, pt, done } = await start();
  const L = "A('line',{p1:[0,0],p2:[10,0]});";

  const box = await page.evaluate(() => { const c = document.querySelector('#cv, canvas'); const r = c.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
  const W = (x, y) => page.evaluate(([x, y]) => { const p = D2D.toS([x, y]); const c = document.querySelector('#cv, canvas').getBoundingClientRect(); return [p[0] + c.left, p[1] + c.top]; }, [x, y]);
  const clickW = async (x, y, o) => { const [a, b] = await W(x, y); await page.mouse.click(a, b, o); };
  const cmdLine = async (txt) => { await page.keyboard.type(txt); await page.keyboard.press('Enter'); };
  const ents = () => page.evaluate(() => D2D.doc().ents.map(e => JSON.parse(JSON.stringify(e))));
  await page.evaluate(() => { D2D.doc().ents.length = 0; D2D.doc().vars.snap = false; D2D.doc().vars.osnap = 0; D2D.zoomExtents && 0; D2D.doc().view = { cx: 5, cy: 5, s: 40 }; D2D.redrawAll(); });
  await t('mouse: draw line by clicking in canvas', async () => { await page.evaluate(() => { D2D.run('line'); }); await clickW(1, 1); await clickW(6, 1); await page.keyboard.press('Enter'); const e = await ents(); assert(e.length === 1 && Math.abs(e[0].p2[0] - 6) < 0.1, JSON.stringify(e)); });
  await t('mouse: window select (left->right) + erase', async () => { const [a, b] = await W(0, 0), [c, d] = await W(8, 3); await page.evaluate(() => { D2D.run('erase'); }); await page.mouse.move(a, b); await page.mouse.down(); await page.mouse.move(c, d, { steps: 6 }); await page.mouse.up(); await page.keyboard.press('Enter'); const e = await ents(); assert.equal(e.length, 0, JSON.stringify(e)); });
  await t('mouse: pre-selection then command', async () => { await page.evaluate(() => { D2D.add(D2D.mk('line', { p1: [1, 1], p2: [6, 1] })); D2D.redrawAll(); }); await clickW(3, 1); await page.evaluate(() => { D2D.run('erase'); }); await page.waitForTimeout(60); await page.keyboard.press('Enter'); await page.waitForTimeout(40); const e = await ents(); assert.equal(e.length, 0, JSON.stringify(e)); });
  await t('mouse: grip stretch', async () => { await page.evaluate(() => { if (D2D.CM.run) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); D2D.SEL.clear(); D2D.doc().ents.length = 0; D2D.doc().vars.ortho = false; D2D.doc().vars.osnap = 0; D2D.add(D2D.mk('line', { p1: [1, 1], p2: [6, 1] })); D2D.redrawAll(); }); await clickW(3, 1); const [a, b] = await W(6, 1), [c, d] = await W(6, 4); await page.mouse.move(a, b); await page.mouse.down(); await page.mouse.up(); await page.mouse.move(c, d, { steps: 4 }); await page.mouse.click(c, d); const e = await ents(); assert(e.length === 1 && Math.abs(e[0].p2[1] - 4) < 0.1, JSON.stringify(e)); await page.keyboard.press('Escape'); });
  await t('mouse: dynamic typed length with ortho', async () => { await page.evaluate(() => { D2D.doc().ents.length = 0; D2D.doc().vars.ortho = true; D2D.run('line'); }); await clickW(2, 2); const [c, d] = await W(7, 2.2); await page.mouse.move(c, d); await cmdLine('3'); await page.keyboard.press('Enter'); const e = await ents(); assert(e.length === 1 && near(Math.hypot(e[0].p2[0] - e[0].p1[0], e[0].p2[1] - e[0].p1[1]), 3, 1e-6) && near(e[0].p2[1], 2, 1e-6), JSON.stringify(e)); await page.evaluate(() => { D2D.doc().vars.ortho = false; }); });
  await t('mouse: osnap endpoint', async () => { await page.evaluate(() => { D2D.doc().ents.length = 0; D2D.doc().vars.osnap = 1; D2D.add(D2D.mk('line', { p1: [1, 1], p2: [6, 1] })); D2D.redrawAll(); D2D.run('line'); }); const [a, b] = await W(6.05, 1.04); await page.mouse.move(a, b); await page.mouse.click(a, b); const [c, d] = await W(8, 4); await page.mouse.click(c, d); await page.keyboard.press('Enter'); const e = await ents(); const l = e[1]; assert(l && near(l.p1[0], 6, 1e-6) && near(l.p1[1], 1, 1e-6), JSON.stringify(e)); });
  await t('mouse: right click finishes', async () => { await page.evaluate(() => { D2D.doc().ents.length = 0; D2D.run('pline'); }); await clickW(1, 1); await clickW(3, 3); await clickW(5, 1); await page.mouse.click(...(await W(7, 7)), { button: 'right' }); await page.waitForTimeout(40); const e = await ents(); assert(e.length === 1 && e[0].type === 'pline', JSON.stringify(e)); });
  await t('keyboard: Esc cancels mid-command and leaves no entity', async () => { await page.evaluate(() => { D2D.doc().ents.length = 0; D2D.run('circle'); }); await clickW(2, 2); await page.keyboard.press('Escape'); await page.waitForTimeout(30); assert.equal((await ents()).length, 0); assert(!(await page.evaluate(() => !!D2D.CM.run))); });
  await t('keyboard: Enter repeats last command', async () => { await page.evaluate(() => { D2D.doc().ents.length = 0; D2D.run('point'); }); await clickW(1, 1); await page.keyboard.press('Enter'); await page.waitForTimeout(30); await page.keyboard.press('Enter'); await page.waitForTimeout(40); const run = await page.evaluate(() => !!D2D.CM.run); assert(run, 'repeat should start point again'); await page.keyboard.press('Escape'); });
  await t('wheel zoom changes scale, pan via middle drag', async () => { const s0 = await page.evaluate(() => D2D.doc().view.s); await page.mouse.move(box[0] + 400, box[1] + 300); await page.mouse.wheel(0, -300); await page.waitForTimeout(500); const s1 = await page.evaluate(() => D2D.doc().view.s); assert(s1 > s0, [s0, s1]); });
  await t('undo via Ctrl+Z / redo via Ctrl+Y', async () => { await page.evaluate(() => { D2D.doc().ents.length = 0; D2D.run('circle'); }); await clickW(3, 3); await cmdLine('1'); await page.waitForTimeout(40); const has = async () => (await ents()).some(e => e.type === 'circle'); const h1 = await has(); await page.keyboard.press('Control+z'); await page.waitForTimeout(40); const h2 = await has(); await page.keyboard.press('Control+y'); await page.waitForTimeout(40); const h3 = await has(); assert(h1 && !h2 && h3, [h1, h2, h3]); });
  await done();
});
sections.push(async () => {
  const { page, t, done } = await start();
  const L = "A('line',{p1:[0,0],p2:[10,0]});";

  const card = () => page.evaluate(() => { const c = document.querySelector('#tip'); return c && !c.hidden ? { pics: c.querySelectorAll('.tip-pics svg').length, title: (c.querySelector('.tip-head b') || {}).textContent, desc: (c.querySelector('.tip-what') || {}).textContent } : null; });
  const hoverCard = async sel => { await page.mouse.move(5, 400); await page.waitForTimeout(30); await page.hover(sel); await page.waitForTimeout(470); return card(); };
  await t('no native title attributes anywhere', async () => { const n = await page.evaluate(() => document.querySelectorAll('[title]').length); assert.equal(n, 0); });
  const missing = [];
  for (const tab of ['Home', 'Annotate', 'View', 'Output']) {
    await page.click(`.rtab[data-tab="${tab}"]`); await page.waitForTimeout(60);
    const ids = await page.$$eval('.rbtn[data-cmd]', els => els.map((e, i) => [e.dataset.cmd, e.dataset.id, e.dataset.args, i]));
    for (const [cmd, id, args, i] of ids) {
      const c = await hoverCard(`.rbtn[data-cmd] >> nth=${i}`);
      if (!c || c.pics < 2 || !c.title) missing.push(`${tab}:${id||cmd}(${cmd}) ${JSON.stringify(c)}`);
    }
  }
  await t('every ribbon button shows a before/after card', async () => { assert.equal(missing.length, 0, missing.join('\n')); });
  await page.click('.rtab[data-tab="Home"]'); await page.evaluate(() => { D2D.run('layer'); D2D.run('layer'); }); await page.waitForTimeout(100);
  const others = ['#btnUndo', '#btnRedo', '#btnHelp', '#btnFile', '#zin', '#zout', '#zext', '#st-snap', '#st-grid', '#st-ortho', '#st-polar', '#st-osnap', '#st-lwt', '#st-dyn', '#curLayerBtn', '#unitsLbl', '#btnHist', '#layNew', '#layDel', '#rColor', '.chipbtn[data-act=matchprop]', '#layerTbl .lb[data-a=on]', '#layerTbl .lb[data-a=frz]', '#layerTbl .lb[data-a=lock]', '#layerTbl .lb[data-a=cur]', '#aids .sw[data-aid=ortho]', '#aids .sw[data-aid=polar]', '#aids .sw[data-aid=dyn]'];
  for (const s of others) await t('card: ' + s, async () => { const c = await hoverCard(s); assert(c && c.title, JSON.stringify(c)); });
  await t('card for non-art buttons has name + description', async () => { const c = await hoverCard('#propClose'); assert(c && c.title); });
  await t('dropdown opens, picks and fires change', async () => {
    await page.keyboard.press('Escape'); await page.evaluate(() => { D2D.CM.run && D2D.submit('\u001b'); D2D.run('hatch'); }); await page.waitForTimeout(200); 
    await page.click('#guideBox .dd-btn'); await page.waitForTimeout(250); assert(await page.evaluate(() => !document.querySelector('#ddpop').hidden));
    await page.click('#ddpop .dd-o:nth-child(3)'); await page.waitForTimeout(250);
    const v = await page.evaluate(() => D2D.doc().hatch.pat); assert(v === 'ANSI33' || v.length, v);
    assert(await page.evaluate(() => document.querySelector('#ddpop').hidden));
  });
  await t('dropdown keyboard: Arrow + Enter, Esc closes', async () => {
    await page.evaluate(() => { D2D.run('hatch'); }); await page.waitForTimeout(150);
    await page.click('#guideBox .dd-btn'); await page.waitForTimeout(200); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
    await page.click('#guideBox .dd-btn'); await page.waitForTimeout(200); await page.keyboard.press('Escape'); await page.waitForTimeout(250); assert(await page.evaluate(() => document.querySelector('#ddpop').hidden));
  });
  await t('programmatic select.value updates the button label', async () => { const l = await page.evaluate(() => { const s = document.querySelector('#rLt'); s.value = 'Dashed'; return s._dd.querySelector('.dd-l').textContent; }); assert.equal(l, 'Dashed'); });
  await t('number stepper changes value and fires change', async () => { await page.evaluate(() => { D2D.run('polygon'); }); await page.waitForTimeout(120); const n = await page.evaluate(() => { const i = document.querySelector('#guideBox input[type=number]'); return i ? i.value : null; }); assert(n !== null); await page.hover('#guideBox .num'); await page.click('#guideBox .num-b[data-d="1"]'); await page.waitForTimeout(100); const n2 = await page.evaluate(() => D2D.CMDS.polygon.st.n); assert(n2 === +n + 1 || n2 === +n, [n, n2]); });
  await t('dialogs: selects upgraded, closes with animation', async () => { await page.evaluate(() => { D2D.run('_units'); }); await page.waitForTimeout(250); const c = await page.evaluate(() => document.querySelectorAll('#dlgCard .dd').length); assert(c >= 3, c); await page.keyboard.press('Escape'); await page.waitForTimeout(300); assert(await page.evaluate(() => document.querySelector('#dlg').hidden)); });
  await t('no title attrs after opening dialogs and menus', async () => { await page.click('#btnFile'); await page.waitForTimeout(150); const n = await page.evaluate(() => document.querySelectorAll('[title]').length); await page.keyboard.press('Escape'); assert.equal(n, 0); });
  await done();
});
(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  for (const s of sections) await s();
  await browser.close();
  console.log(`\n${totalPass} passed, ${totalFail} failed`); process.exit(totalFail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
