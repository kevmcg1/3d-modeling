// ═══════════════════════════════════════════════════════════════════
//  Sharpness check for the dev panel and Export status: how blurry is the 3D view, its text, geometry edges and labels?
//
//  Blur comes from a few places, and this looks at each:
//    canvas scale   every canvas has a backing size (its pixels) and a CSS size; blur appears when the backing is smaller than
//                   the screen pixels it covers (the browser stretches it) or sits between device pixels
//    render scale   the 3D view lowers its pixel ratio by itself when frames run slow (PERF.dpr); browser zoom, a pinch zoom
//                   (visualViewport.scale) and a fractional devicePixelRatio soften everything on the page
//    edges          the 3D view and the overlay (sketch lines, dimensions, labels) are read back and every strong edge is measured:
//                   how many screen pixels the step from dark to light is spread over (1 = crisp, 2 = anti-aliased, 3+ = soft)
//    text           every fillText / strokeText of one frame: on-screen size in device pixels, whether it sits between pixels,
//                   whether it is rotated, and whether its canvas is stretched
//    labels         the view cube's label textures against the size of the cube face; textures drawn without mipmaps
//    page           text inside CSS transforms, filters and zoom
//
//  window.__blur.measure() takes the pixel and text readings (it draws one frame); .quick() is the cheap part (no drawing);
//  .text() is the section Export status writes. Nothing runs until the panel asks, except a once-a-second look at the canvas
//  sizes while the status tracker is on, which adds a "blur" step when the sharpness changes.
// ═══════════════════════════════════════════════════════════════════
(function () {
  const r = (n, d = 2) => (typeof n === 'number' && isFinite(n) ? +n.toFixed(d) : n);
  const short = (s, n = 40) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
  const safe = (f, d) => { try { const v = f(); return v === undefined ? d : v; } catch (e) { return d; } };
  const nameOf = (el, tag) => (tag ? tag + ' › ' : '') + (el.id ? 'canvas#' + el.id : 'canvas' + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : ''));
  const SEV = { bad: 3, warn: 2, info: 1 };
  const FRAMES = { d2dFrame: '2D Drawing', houseFrame: 'House Design', gfxFrame: 'Graphics', ssgFrame: 'Setup Sheet' };

  /* ---------------- text: every fillText / strokeText while a reading is being taken ---------------- */
  let cap = null;
  function recText(ctx, txt, x, y) {
    const cv = ctx.canvas; if (!cv || !cv.getBoundingClientRect) return;
    if (!cv.isConnected) { cap.off++; return; }   // baked into a texture: the labels check covers those
    let ci = cap.canv.get(cv);
    if (!ci) { const rc = cv.getBoundingClientRect(), dpr = (cv.ownerDocument.defaultView || window).devicePixelRatio || 1; ci = { f: cv.width ? rc.width * dpr / cv.width : 1, name: nameOf(cv, cv.ownerDocument === document ? '' : 'frame') }; cap.canv.set(cv, ci); }
    // ci.f: screen pixels one canvas pixel covers (1 = sharp, over 1 = stretched)
    const m = ctx.getTransform(), s = Math.hypot(m.a, m.b), px = parseFloat((/(\d+(?:\.\d+)?)px/.exec(ctx.font) || [])[1]);
    if (!isFinite(px) || !String(txt).trim()) return;
    const dev = px * s * ci.f, X = (m.a * x + m.c * y + m.e) * ci.f, Y = (m.b * x + m.d * y + m.f) * ci.f;
    const t = cap.t; t.n++;
    if (cap.sizes.length < 3000) cap.sizes.push(dev);
    if (dev < 9) t.small++;
    if (Math.abs(X - Math.round(X)) > 0.25 || Math.abs(Y - Math.round(Y)) > 0.25) t.between++;
    if (Math.abs(Y - Math.round(Y)) > 0.25) t.betweenY++;
    if (Math.abs(m.b) > 1e-3 || Math.abs(m.c) > 1e-3) t.rotated++;
    if (ci.f > 1.01) t.stretched++;
    if (cap.ex.length < 4 && dev < 9) cap.ex.push(`“${short(txt, 18)}” ${r(dev, 1)} px`);
  }
  const P2D = typeof CanvasRenderingContext2D !== 'undefined' ? CanvasRenderingContext2D.prototype : null;
  if (P2D && !P2D.fillText.__blur) {
    for (const k of ['fillText', 'strokeText']) {
      const f0 = P2D[k];
      const w = function (txt, x, y) { if (cap) { try { recText(this, txt, x, y); } catch (e) { /* a reading must never break drawing */ } } return f0.apply(this, arguments); };
      w.__blur = true; P2D[k] = w;
    }
  }

  /* ---------------- canvases and render scale: no drawing needed ---------------- */
  function canvases() {
    const out = [];
    const add = (cv, win, tag) => {
      const rc = cv.getBoundingClientRect(); if (rc.width < 8 || rc.height < 8) return;
      const cs = win.getComputedStyle(cv); if (cs.visibility === 'hidden' || cs.display === 'none') return;
      const dpr = win.devicePixelRatio || 1, dw = rc.width * dpr, dh = rc.height * dpr;
      out.push({ name: nameOf(cv, tag), cv, backing: [cv.width, cv.height], css: [r(rc.width), r(rc.height)], device: [r(dw, 1), r(dh, 1)], fx: cv.width / dw, fy: cv.height / dh, offX: Math.abs(rc.left * dpr - Math.round(rc.left * dpr)), offY: Math.abs(rc.top * dpr - Math.round(rc.top * dpr)), dpr });
    };
    document.querySelectorAll('canvas').forEach(c => add(c, window, ''));
    document.querySelectorAll('iframe').forEach(f => { let d = null; try { d = f.contentDocument; } catch (e) { /* cross-origin (file://) */ } if (d && d.body) { const rcf = f.getBoundingClientRect(); if (rcf.width > 8) d.querySelectorAll('canvas').forEach(c => add(c, f.contentWindow, FRAMES[f.id] || f.id || 'frame')); } });
    return out;
  }
  function scaleOf(c) {   // what the browser does to this canvas on the way to the screen
    const f = Math.min(c.fx, c.fy), F = Math.max(c.fx, c.fy);
    if (Math.abs(c.backing[0] - c.device[0]) <= 1.01 && Math.abs(c.backing[1] - c.device[1]) <= 1.01) return { word: 'sharp, 1:1', bad: 0 };
    if (F < 0.99) return { word: `stretched ×${r(1 / f)} (blurry)`, bad: 1 / f > 1.15 ? 2 : 1 };
    if (f > 1.01) return { word: `drawn larger and shrunk ×${r(f)} (smooth)`, bad: 0 };
    return { word: `off by ${r(Math.abs(1 - f) * 100, 1)}% (a little soft)`, bad: 1 };
  }
  function cubeLabels() {
    const o = { texture: null };
    try {
      if (typeof cubeMats === 'undefined' || typeof CUBE_SIZE === 'undefined') return o;
      const m = cubeMats[0] && cubeMats[0].map; if (!m || !m.image) return o;
      const dpr = typeof DPR !== 'undefined' ? DPR : 1, face = CUBE_SIZE * 0.62 * dpr;   // a face seen head-on spans about 0.6 of the cube's box
      o.texture = m.image.width; o.face = r(face, 0); o.mips = !!m.generateMipmaps; o.ratio = r(face / m.image.width); o.dpr = dpr;
    } catch (e) { /* no cube */ }
    return o;
  }
  function sceneStats() {
    const o = { lines: 0, textures: 0, noMips: 0, nearest: 0, aniso: 0 };
    try {
      const seen = new Set();
      scene.traverse(n => {
        const m = n.material; if (!m) return;
        for (const mm of Array.isArray(m) ? m : [m]) {
          if (mm.isLineBasicMaterial || mm.isLineDashedMaterial) o.lines++;
          const t = mm.map; if (t && t.image && !seen.has(t)) { seen.add(t); o.textures++; if (!t.generateMipmaps) o.noMips++; if (t.minFilter === THREE.NearestFilter || t.magFilter === THREE.NearestFilter) o.nearest++; if (t.anisotropy > 1) o.aniso++; }
        }
      });
    } catch (e) { /* no scene yet */ }
    return o;
  }
  function renderInfo() {
    const o = {};
    try {
      const gl = renderer.getContext(), at = gl.getContextAttributes ? gl.getContextAttributes() : {};
      o.antialias = !!at.antialias; o.samples = gl.getParameter(gl.SAMPLES); o.webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
      o.buffer = [gl.drawingBufferWidth, gl.drawingBufferHeight]; o.canvas = [glCanvas.width, glCanvas.height];
      o.pixelRatio = renderer.getPixelRatio(); o.appRatio = PERF.dpr; o.device = window.devicePixelRatio || 1; o.top = Math.min(o.device, 2); o.maxSamples = safe(() => renderer.capabilities.maxSamples, 0);
    } catch (e) { /* no renderer yet */ }
    return o;
  }
  function pageInfo() {
    const vv = window.visualViewport;
    return { dpr: window.devicePixelRatio || 1, pinch: vv ? vv.scale : 1, win: [innerWidth, innerHeight], fonts: safe(() => document.fonts.status, '?'), inter: safe(() => document.fonts.check('12px Inter'), '?') };
  }

  /* ---------------- edges: how many screen pixels each strong edge is spread over ---------------- */
  // Luminance of every pixel over white, then every strong step (peak change >= 24) along rows and columns: its total change / its peak change.
  function edgeWidths(d, w, h) {
    const lum = new Float32Array(w * h);
    for (let i = 0, p = 0; i < w * h; i++, p += 4) { const a = d[p + 3] / 255; lum[i] = (0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]) * a + 255 * (1 - a); }
    const widths = [];
    const scan = (get, n, len) => {
      for (let line = 0; line < n; line += 2) {
        let s = 0, sign = 0, peak = 0;
        const close = e => { if (sign && peak >= 24 && e - s <= 8) { const step = Math.abs(get(line, e) - get(line, s)); if (step >= 40) widths.push(step / peak); } sign = 0; peak = 0; };
        for (let k = 1; k < len; k++) {
          const dv = get(line, k) - get(line, k - 1), sg = Math.abs(dv) < 3 ? 0 : dv > 0 ? 1 : -1;
          if (sg === 0 || sg !== sign) { close(k - 1); if (sg) { sign = sg; s = k - 1; peak = Math.abs(dv); } } else peak = Math.max(peak, Math.abs(dv));
        }
        close(len - 1);
      }
    };
    scan((y, x) => lum[y * w + x], h, w); scan((x, y) => lum[y * w + x], w, h);
    return widths;
  }
  const median = a => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
  // read a patch (center, up to 640 × 400 device pixels) of a canvas back and measure its edges
  let scratch = null;
  function pixelEdges(cv) {
    if (!cv || !cv.width || !cv.height) return null;
    const w = Math.min(640, cv.width), h = Math.min(400, cv.height), sx = Math.max(0, (cv.width - w) >> 1), sy = Math.max(0, (cv.height - h) >> 1);
    if (!scratch) scratch = document.createElement('canvas');
    scratch.width = w; scratch.height = h;
    const x = scratch.getContext('2d', { willReadFrequently: true }); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(cv, sx, sy, w, h, 0, 0, w, h);
    const widths = edgeWidths(x.getImageData(0, 0, w, h).data, w, h);
    return { n: widths.length, w: median(widths), wide: widths.length ? widths.filter(v => v > 2.5).length / widths.length : 0, patch: [w, h] };
  }

  /* ---------------- text inside CSS transforms and filters ---------------- */
  function pageText() {
    const out = [], seen = new Map();
    const dpr = window.devicePixelRatio || 1;
    const els = document.body ? document.body.querySelectorAll('*') : [];
    let n = 0;
    for (const el of els) {
      if (++n > 8000) break;
      if (!el.childNodes || ![...el.childNodes].some(c => c.nodeType === 3 && c.nodeValue.trim())) continue;
      const rc = el.getBoundingClientRect(); if (!rc.width || !rc.height) continue;
      const cs = getComputedStyle(el); let why = '';
      if (cs.transform !== 'none') {
        const m = /matrix\(([^)]+)\)/.exec(cs.transform);
        if (m) { const v = m[1].split(',').map(Number); if (Math.abs(Math.hypot(v[0], v[1]) - 1) > 0.005) why = `scaled ×${r(Math.hypot(v[0], v[1]), 3)}`; else if (Math.abs(v[1]) > 1e-3) why = 'rotated'; else if (Math.abs(v[4] * dpr - Math.round(v[4] * dpr)) > 0.1 || Math.abs(v[5] * dpr - Math.round(v[5] * dpr)) > 0.1) why = 'moved by a part of a pixel'; }
        else if (/matrix3d|perspective/.test(cs.transform)) why = 'in a 3D transform';
      }
      if (!why && cs.filter !== 'none' && /blur/.test(cs.filter)) why = 'under a blur filter';
      if (!why && cs.zoom && cs.zoom !== '1' && cs.zoom !== 'normal') why = 'zoom ' + cs.zoom;
      if (!why) continue;
      const key = (el.id ? '#' + el.id : el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : '')) + ' ' + why;
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    for (const [k, c] of seen) out.push(c > 1 ? `${k} (${c} elements)` : k);
    return out.slice(0, 8);
  }

  /* ---------------- put it together ---------------- */
  let last = null;   // the latest full reading (measure), with the time it was taken
  function quick() {
    const cv = canvases(), ri = renderInfo(), pg = pageInfo(), sc = sceneStats(), cb = cubeLabels(), issues = [];
    for (const c of cv) { const s = scaleOf(c); c.scale = s; if (s.bad) issues.push({ sev: s.bad >= 2 ? 'bad' : 'warn', area: 'canvas', msg: `${c.name} is ${s.word}: ${c.backing[0]} × ${c.backing[1]} pixels shown over ${c.device[0]} × ${c.device[1]} screen pixels` }); else if ((c.offX > 0.05 || c.offY > 0.05) && /^canvas#(gl|ov)$/.test(c.name)) issues.push({ sev: 'info', area: 'canvas', msg: `${c.name} starts ${r(c.offX, 2)}, ${r(c.offY, 2)} device pixels off a pixel edge (a little soft at the border)` }); }
    if (ri.appRatio !== undefined && ri.appRatio < ri.top - 1e-6) issues.push({ sev: ri.appRatio / ri.top < 0.7 ? 'bad' : 'warn', area: 'render scale', msg: `the 3D view renders at pixel ratio ${ri.appRatio} instead of ${ri.top}: it lowered itself to keep the frame rate up, so the view is drawn at ${r(ri.appRatio / ri.top * 100, 0)}% resolution` });
    if (ri.device > 2) issues.push({ sev: 'info', area: 'render scale', msg: `the screen has pixel ratio ${r(ri.device)}; the 3D view stops at 2` });
    if (ri.antialias === false) issues.push({ sev: 'warn', area: 'edges', msg: 'anti-aliasing is off in the 3D view: edges will be jagged' });
    else if (ri.antialias && ri.samples === 0) issues.push({ sev: 'warn', area: 'edges', msg: 'anti-aliasing was asked for but the browser gives 0 samples: edges may be jagged' });
    if (ri.buffer && ri.canvas && (ri.buffer[0] !== ri.canvas[0] || ri.buffer[1] !== ri.canvas[1])) issues.push({ sev: 'bad', area: 'canvas', msg: `the browser gave the 3D view a ${ri.buffer[0]} × ${ri.buffer[1]} buffer instead of ${ri.canvas[0]} × ${ri.canvas[1]} (too big for this GPU): it is stretched` });
    if (Math.abs(pg.dpr - Math.round(pg.dpr)) > 0.01) issues.push({ sev: 'warn', area: 'page', msg: `browser zoom or screen scaling gives a fractional pixel ratio (${r(pg.dpr, 3)}): text and lines fall between pixels` });
    if (Math.abs(pg.pinch - 1) > 0.01) issues.push({ sev: 'warn', area: 'page', msg: `the page is pinch-zoomed ×${r(pg.pinch, 2)}: the 3D view is stretched` });
    if (pg.inter === false) issues.push({ sev: 'info', area: 'text', msg: 'the Inter font is not loaded: labels use the system font' });
    if (cb.texture && cb.ratio > 1.2) issues.push({ sev: 'warn', area: 'labels', msg: `view cube labels are ${cb.texture} px textures on faces about ${cb.face} px wide: stretched ×${cb.ratio}` });
    if (sc.noMips) issues.push({ sev: 'info', area: 'labels', msg: `${sc.noMips} texture${sc.noMips > 1 ? 's' : ''} in the scene without mipmaps (they shimmer when small, and stay blocky when large)` });
    return { at: Date.now(), canvases: cv, render: ri, page: pg, scene: sc, cube: cb, issues };
  }
  const gradeOf = issues => { const top = Math.max(0, ...issues.map(i => SEV[i.sev])); return top >= 3 ? 'Blurry' : top === 2 ? 'Soft' : 'Sharp'; };

  // The full reading: draws one frame while text is recorded, then reads the 3D view and the overlay back
  function measure() {
    return new Promise(resolve => {
      const q = quick();
      cap = { canv: new Map(), sizes: [], t: { n: 0, small: 0, between: 0, betweenY: 0, rotated: 0, stretched: 0 }, off: 0, ex: [] };
      let done = false;
      const finish = (gl) => {
        if (done) return; done = true;
        const text = cap; cap = null;
        const c0 = (q.canvases.find(c => c.name === 'canvas#gl') || { fx: 1 }), f = Math.min(c0.fx, c0.fy || c0.fx) || 1;
        const edge = {};
        edge.view = gl ? { ...gl, devicePx: gl.w ? gl.w / f : null } : null;
        const oe = safe(() => pixelEdges(ov), null); if (oe) { const fo = (q.canvases.find(c => c.name === 'canvas#ov') || { fx: 1 }); oe.devicePx = oe.w ? oe.w / (Math.min(fo.fx, fo.fy || fo.fx) || 1) : null; }
        edge.overlay = oe;
        const t = text.t, sizes = text.sizes.slice().sort((a, b) => a - b);
        const tx = { n: t.n, small: t.small, between: t.between, betweenY: t.betweenY, rotated: t.rotated, stretched: t.stretched, min: sizes[0] != null ? r(sizes[0], 1) : null, median: sizes.length ? r(sizes[sizes.length >> 1], 1) : null, examples: text.ex, offscreen: text.off };
        const issues = q.issues.slice();
        const judge = (e, what) => { if (!e || e.n < 12 || e.devicePx == null) return; if (e.devicePx > 3.2) issues.push({ sev: 'bad', area: 'edges', msg: `${what} edges are spread over about ${r(e.devicePx)} screen pixels (crisp is 1 to 2)` }); else if (e.devicePx > 2.4) issues.push({ sev: 'warn', area: 'edges', msg: `${what} edges are spread over about ${r(e.devicePx)} screen pixels (crisp is 1 to 2)` }); };
        judge(edge.view, 'the 3D view'); judge(edge.overlay, 'the overlay (sketch lines, dimensions, labels)');
        if (tx.n) {
          if (tx.small) issues.push({ sev: tx.small / tx.n > 0.25 ? 'warn' : 'info', area: 'text', msg: `${tx.small} of ${tx.n} text draws are under 9 screen pixels tall${tx.examples.length ? ' (' + tx.examples.join(', ') + ')' : ''}: hard to read` });
          if (tx.stretched) issues.push({ sev: 'bad', area: 'text', msg: `${tx.stretched} of ${tx.n} text draws are on a stretched canvas: blurry` });
          if (tx.betweenY / tx.n > 0.5) issues.push({ sev: 'info', area: 'text', msg: `${tx.betweenY} of ${tx.n} text draws sit between two pixel rows (smeared vertically a little)` });
          if (tx.rotated) issues.push({ sev: 'info', area: 'text', msg: `${tx.rotated} of ${tx.n} text draws are rotated (rotated text is never pixel-snapped)` });
        }
        const html = safe(pageText, []);
        for (const h of html) issues.push({ sev: 'warn', area: 'page text', msg: h });
        last = { ...q, issues, at: Date.now(), edge, text: tx, html, grade: gradeOf(issues) };
        resolve(last);
      };
      // read the 3D view in the same task as the frame that drew it (the drawing buffer is cleared once it is on screen)
      const prev = window.frame;
      if (typeof prev !== 'function' || typeof requestDraw !== 'function') { finish(null); return; }
      let wrapped = null;
      wrapped = function () { const out = prev.apply(this, arguments); window.frame = prev; let gl = null; try { gl = pixelEdges(glCanvas); } catch (e) { /* unreadable */ } finish(gl); return out; };
      window.frame = wrapped;
      try { drawPending = false; } catch (e) { /* a frame already waiting keeps the old function: let ours also be asked for */ }
      requestDraw();
      setTimeout(() => { if (!done) { if (window.frame === wrapped) window.frame = prev; finish(null); } }, 1500);
    });
  }
  
  /* ---------------- text for Export status, and the tracker's blur steps ---------------- */
  function textReport(res) {
    const q = res || last || quick(), L = [];
    const age = last ? Math.round((Date.now() - last.at) / 1000) : null;
    L.push(`Overall: ${q.grade || gradeOf(q.issues)}${q.grade ? '' : ' (quick look; open dev mode and press Check now for pixel and text readings)'}${last && age != null ? `   (full reading ${age} s ago)` : ''}`);
    const ri = q.render;
    if (ri && ri.device) L.push(`Screen pixel ratio ${r(ri.device, 3)}, 3D view renders at ${ri.pixelRatio} (own limit ${ri.top}, now ${ri.appRatio}); anti-aliasing ${ri.antialias ? 'on' : 'off'}, ${ri.samples} sample(s)${ri.webgl2 ? ' (WebGL 2)' : ''}; page pinch ×${r(q.page.pinch, 2)}`);
    L.push('Canvases (pixels it has → screen pixels it covers):');
    for (const c of q.canvases) L.push(`  ${c.name.padEnd(28)} ${c.backing.join(' × ')} → ${c.device.join(' × ')}  ${c.scale ? c.scale.word : scaleOf(c).word}`);
    if (last && last.edge) {
      const e = last.edge;
      if (e.view) L.push(`3D view edges: ${e.view.n} measured, median spread ${e.view.w == null ? '?' : r(e.view.devicePx) + ' screen px'}, ${r(e.view.wide * 100, 0)}% wider than 2.5 px`);
      if (e.overlay) L.push(`Overlay edges (sketch, dimensions, labels): ${e.overlay.n} measured, median spread ${e.overlay.w == null ? '?' : r(e.overlay.devicePx) + ' screen px'}, ${r(e.overlay.wide * 100, 0)}% wider than 2.5 px`);
      if (!e.view) L.push('3D view edges: not read (the frame could not be read back)');
      const t = last.text; L.push(`Text in one frame: ${t.n} draw(s), median ${t.median == null ? '-' : t.median + ' px'} tall on screen (smallest ${t.min == null ? '-' : t.min}), ${t.small} under 9 px, ${t.between} between pixels, ${t.rotated} rotated, ${t.stretched} on a stretched canvas`);
    }
    if (q.cube && q.cube.texture) L.push(`View cube labels: ${q.cube.texture} px textures on faces about ${q.cube.face} px wide (×${q.cube.ratio}), mipmaps ${q.cube.mips ? 'on' : 'off'}`);
    L.push(`Scene: ${q.scene.lines} line material(s) (lines are always 1 device pixel wide, thin when the pixel ratio is high), ${q.scene.textures} texture(s), ${q.scene.noMips} without mipmaps, ${q.scene.nearest} with nearest-pixel filtering`);
    L.push(q.issues.length ? 'Findings:' : 'Findings: none');
    for (const i of q.issues.slice().sort((a, b) => SEV[b.sev] - SEV[a.sev])) L.push(`  ${i.sev === 'bad' ? 'BLURRY' : i.sev === 'warn' ? 'SOFT  ' : 'note  '} ${i.area}: ${i.msg}`);
    return L.join('\n');
  }
  // the tracker notes when the sharpness changes (cheap: canvas sizes only, no drawing)
  let sigPrev = null, timer = 0;
  function watch() {
    if (typeof Trace === 'undefined' || !Trace.live) return;
    let q; try { q = quick(); } catch (e) { return; }
    const grade = gradeOf(q.issues), sig = q.canvases.map(c => c.name + c.backing.join('x') + c.device.join('x')).join('|') + '|' + (q.render.appRatio || '') + '|' + r(q.page.dpr, 3) + '|' + r(q.page.pinch, 2);
    if (sigPrev === null) { sigPrev = sig; Trace.log('blur', `sharpness at start: ${grade}`, q.issues.length ? q.issues.map(i => i.area + ': ' + i.msg).slice(0, 6) : undefined); watch.grade = grade; return; }
    if (sig === sigPrev) return;
    sigPrev = sig;
    const bad = q.issues.filter(i => i.sev !== 'info').map(i => i.area + ': ' + i.msg);
    Trace.log('blur', `sharpness ${watch.grade} → ${grade}: pixel ratio ${q.render.appRatio === undefined ? '?' : q.render.appRatio} of ${q.render.top === undefined ? '?' : q.render.top}, ${q.canvases.filter(c => c.scale && c.scale.bad).length} canvas(es) stretched`, bad.length ? bad.slice(0, 6) : undefined, grade === 'Blurry' ? 'warn' : undefined);
    watch.grade = grade;
  }
  function begin() { if (!timer) { timer = setInterval(watch, 1000); watch(); } }
  if (typeof Trace !== 'undefined') { Trace.hooks.push(live => { if (live) begin(); else { clearInterval(timer); timer = 0; sigPrev = null; } }); if (Trace.live) begin(); }

  window.__blur = { quick, measure, text: () => textReport(), last: () => last, gradeOf, edgeWidths };
})();
