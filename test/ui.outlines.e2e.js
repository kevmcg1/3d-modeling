// Every button is an outline, never a fill: ordinary and primary buttons, the selected one of a group, toggles, play, ribbon icons, panels
// and the embedded pages; in the dark and the light theme; hover and selected shown by outline and text color only. Color swatches keep
// their fill (the fill is the color).
// Run: NODE_PATH=<dir with playwright, three@0.128, clipper-lib@6.4.2> CHROMIUM_PATH=<chrome> node test/ui.outlines.e2e.js
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.log('skip: playwright is not installed'); process.exit(0); }
let libs = null; try { libs = { three: require.resolve('three/build/three.min.js'), clipper: require.resolve('clipper-lib/clipper.js') }; } catch (e) { /* offline */ }
if (!libs) { console.log('skip: needs three and clipper-lib in node_modules (3d-modeler.html loads them from CDNs)'); process.exit(0); }
const path = require('path'), assert = require('assert');
let pass = 0, fail = 0;
const ok = async (name, f) => { try { await f(); pass++; console.log('ok - ' + name); } catch (e) { fail++; console.log('FAIL - ' + name + ' :: ' + String(e.message).slice(0, 1200)); } };
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 850 } }); await page.addInitScript(() => { window.DATUM_PREMIUM = true; window.DATUM_AUTO = true; window.DATUM_NOFX = true; });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' }));
  await page.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' })); await page.route(/gate\.js/, r => r.abort());
  await page.route(/fonts\.g/, r => r.abort());
  await page.goto('file://' + path.resolve(__dirname, '..', '3d-modeler.html') + '?dev=1'); await page.waitForTimeout(3000);
  await page.evaluate(() => {
    // every visible button in the page and in its frames: what is wrong with how it is drawn
    window.auditButtons = () => {
      const bad = [], docs = [document]; document.querySelectorAll('iframe').forEach(f => { try { if (f.contentDocument && f.contentDocument.body) docs.push(f.contentDocument); } catch (e) { /* another origin */ } });
      const a = c => { const m = c.match(/[\d.]+/g); return !m ? 0 : m.length > 3 ? +m[3] : 1; };
      let n = 0;
      for (const d of docs) {
        const w = d.defaultView, tag = d === document ? '' : '[frame] ';
        for (const el of d.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"], .btn')) {
          const r = el.getBoundingClientRect(); if (r.width < 6 || r.height < 6) continue;
          const cs = w.getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
          if (el.matches(OUTLINES.KEEP)) continue;
          n++;
          const name = tag + el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + '.' + [...el.classList].filter(c => !/^(on|ctip|prem)/.test(c)).join('.') + ' "' + (el.getAttribute('aria-label') || el.textContent.trim().slice(0, 18)) + '"';
          if (a(cs.backgroundColor) > 0.04) bad.push(name + ' is filled (' + cs.backgroundColor + ')');
          else if (cs.backgroundImage !== 'none') bad.push(name + ' has a background image (' + cs.backgroundImage.slice(0, 40) + ')');
          const border = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none' && a(cs.borderTopColor) > 0.05;
          const shadow = /inset/.test(cs.boxShadow) && cs.boxShadow !== 'none', outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
          if (!border && !shadow && !outline) bad.push(name + ' has no outline');
        }
      }
      return { n, bad };
    };
  });
  const audit = async label => { const r = await page.evaluate(() => auditButtons()); assert(r.n > 5, label + ': only ' + r.n + ' buttons found'); assert.deepStrictEqual(r.bad.slice(0, 12), [], label + ' (' + r.bad.length + ' of ' + r.n + '): ' + r.bad.slice(0, 12).join(' | ')); return r.n; };

  for (const theme of ['dark', 'light']) {
    await ok(`${theme} theme: every button in Design is an outline (no fill, no background image), even the primary, the selected and the play buttons`, async () => {
      await page.evaluate(t => { document.documentElement.setAttribute('data-theme', t); loadDoc(SAMPLES.find(x => x.name === 'Pocketed plate').make(), 't'); setWorkspace('design'); }, theme); await page.waitForTimeout(1800);
      await audit('design');
    });
    await ok(`${theme} theme: Manufacture, with its panels, the section bar and the tool list`, async () => {
      await page.evaluate(() => { setWorkspace('cam'); camAddOp('chain'); }); await page.waitForTimeout(1500);
      await page.evaluate(() => SECTION.open({ instant: true })); await page.waitForTimeout(500);
      await audit('cam'); await page.evaluate(() => { SECTION.close({ instant: true }); CAMUI.view = 'post'; camRefresh(); }); await page.waitForTimeout(500); await audit('cam post panel');
      await page.evaluate(() => { CAMUI.view = 'setup'; camRefresh(); }); await page.waitForTimeout(500); await audit('cam setup panel');
    });
    await ok(`${theme} theme: the embedded pages (Setup Sheet, 2D Drawing, House Design, Graphics)`, async () => {
      for (const ws of ['sheet', 'draw', 'house', 'gfx']) {
        await page.evaluate(w => { try { setWorkspace(w); } catch (e) { /* not offered */ } }, ws); await page.waitForTimeout(2500);
        const r = await page.evaluate(() => { const f = [...document.querySelectorAll('iframe')].filter(x => { try { return x.offsetParent && x.contentDocument && x.contentDocument.body && x.contentDocument.body.children.length; } catch (e) { return false; } }); return f.length; });
        if (!r) continue;
        await audit(ws);
      }
      await page.evaluate(() => setWorkspace('design')); await page.waitForTimeout(800);
    });
  }

  await ok('the four embedded apps, opened on their own, draw every button as an outline too (they carry the module themselves)', async () => {
    for (const f of ['drawing2d.html', 'house.html', 'graphics.html', 'setup-sheet-generator.html']) {
      const q = await browser.newPage({ viewport: { width: 1400, height: 850 } }); const qe = []; q.on('pageerror', e => qe.push(e.message));
      await q.route(/three\.min\.js/, r => r.fulfill({ path: libs.three, contentType: 'text/javascript' })); await q.route(/clipper\.js/, r => r.fulfill({ path: libs.clipper, contentType: 'text/javascript' }));
      await q.route(/gate\.js/, r => r.abort()); await q.route(/fonts\.g|cdn|unpkg/, r => r.abort());
      await q.goto('file://' + path.resolve(__dirname, '..', f)); await q.waitForTimeout(2500);
      for (const theme of ['dark', 'light']) {
        await q.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme); await q.waitForTimeout(300);
        const r = await q.evaluate(() => {
          const a = c => { const m = c.match(/[\d.]+/g); return !m ? 0 : m.length > 3 ? +m[3] : 1; }, bad = []; let n = 0;
          for (const el of document.querySelectorAll('button, [role="button"], input[type="button"], .btn')) {
            const r = el.getBoundingClientRect(); if (r.width < 6 || r.height < 6) continue; const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || el.matches('.swatch, [data-swatch], [data-color], .cf-swatch, .sw')) continue; n++;
            const nm = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + '.' + [...el.classList].join('.') + ' "' + (el.getAttribute('aria-label') || el.textContent.trim().slice(0, 16)) + '"';
            if (a(cs.backgroundColor) > 0.04) bad.push(nm + ' filled ' + cs.backgroundColor); else if (cs.backgroundImage !== 'none') bad.push(nm + ' bg image');
            const border = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none' && a(cs.borderTopColor) > 0.05, shadow = /inset/.test(cs.boxShadow), out = cs.outlineStyle !== 'none';
            if (!border && !shadow && !out) bad.push(nm + ' no outline');
          }
          return { n, bad };
        });
        assert(r.n >= 3, f + ' ' + theme + ': only ' + r.n + ' buttons');
        assert.deepStrictEqual(r.bad.slice(0, 8), [], f + ' ' + theme + ' (' + r.bad.length + ' of ' + r.n + '): ' + r.bad.slice(0, 8).join(' | '));
      }
      await q.close();
    }
  });

  await ok('a selected option reads as an outline and an accent text: the Solid / Shaded / Wireframe group and the 2D / 3D switch have one selected button each, none filled', async () => {
    await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); setWorkspace('design'); }); await page.waitForTimeout(800);
    const r = await page.evaluate(() => {
      const groups = ['#visGroup', '#viewtools', '.seg'].flatMap(s => [...document.querySelectorAll(s + ' button.on, ' + s + ' .on')]).filter(b => b.getBoundingClientRect().width > 4).slice(0, 12);
      const rest = document.querySelector('#visGroup button:not(.on)') || document.querySelector('.seg button:not(.on)');
      return { sel: groups.map(b => { const cs = getComputedStyle(b); return { fill: cs.backgroundColor, color: cs.color, shadow: cs.boxShadow !== 'none', border: cs.borderTopColor }; }), rest: rest && getComputedStyle(rest).color };
    });
    assert(r.sel.length >= 2 && r.sel.every(s => /rgba\(0, 0, 0, 0\)|transparent/.test(s.fill)), JSON.stringify(r));
    assert(r.sel.some(s => s.color !== r.rest), 'the selected one has its own text color: ' + JSON.stringify(r));
  });

  await ok('hover turns the outline and text to the accent and the fill stays empty', async () => {
    const box = await (await page.$('#btnFile')).boundingBox();
    const before = await page.evaluate(() => { const b = document.getElementById('btnFile'), cs = getComputedStyle(b); return { c: cs.color, s: cs.boxShadow + '|' + cs.borderTopColor }; });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(500);
    const after = await page.evaluate(() => { const b = document.getElementById('btnFile'), cs = getComputedStyle(b); return { c: cs.color, s: cs.boxShadow + '|' + cs.borderTopColor, bg: cs.backgroundColor }; });
    assert(after.c !== before.c && after.s !== before.s && /rgba\(0, 0, 0, 0\)|transparent/.test(after.bg), JSON.stringify([before, after]));
    await page.mouse.move(700, 500);
  });

  await ok('keyboard focus shows a clear ring and disabled buttons dim (Undo with nothing to undo)', async () => {
    await page.focus('#btnTheme'); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); await page.waitForTimeout(300);
    const r = await page.evaluate(() => { const f = document.activeElement, cs = getComputedStyle(f), u = getComputedStyle(document.getElementById('btnUndo')); return { id: f.id, ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1.5, undoDim: document.getElementById('btnUndo').disabled ? +u.opacity < 0.9 : true }; });
    assert(r.id === 'btnTheme' && r.ring && r.undoDim, JSON.stringify(r));
  });

  await ok('buttons made later get the same treatment (a panel opened after the page loaded)', async () => {
    await page.evaluate(() => { const b = document.createElement('button'); b.className = 'btn primary'; b.id = 'lateBtn'; b.textContent = 'Later'; document.getElementById('panel').appendChild(b); }); await page.waitForTimeout(400);
    const r = await page.evaluate(() => { const cs = getComputedStyle(document.getElementById('lateBtn')); return { bg: cs.backgroundColor, bgi: cs.backgroundImage, line: cs.boxShadow + cs.borderTopColor }; });
    assert(/rgba\(0, 0, 0, 0\)|transparent/.test(r.bg) && r.bgi === 'none' && r.line.length > 8, JSON.stringify(r));
    await page.evaluate(() => document.getElementById('lateBtn').remove());
  });

  await ok('color swatches keep their fill (the fill is the color)', async () => {
    const r = await page.evaluate(() => { const b = document.createElement('button'); b.className = 'swatch'; b.style.cssText = 'width:20px;height:20px;background:rgb(200,30,30)'; document.body.appendChild(b); const cs = getComputedStyle(b); const out = cs.backgroundColor; b.remove(); return out; });
    assert(r === 'rgb(200, 30, 30)', r);
  });

  await ok('the page raised no errors', async () => { assert.deepStrictEqual(errs, [], errs.join('\n')); });
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
