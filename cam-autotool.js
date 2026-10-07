// Manufacture: automatic tool choice for internal features.
// camPickTool() is the reusable core: give it the space the cutter has to fit into (Clipper paths, machine XY, µm), the cut
// depth and what kind of surface it leaves, and it returns the largest library tool that fits, with the reason. Other
// operations (the Mastercam-style toolpaths in cam-mc.js and later batches) can call it directly with their own region.
//   kind: 'wall'    flat 2D walls: square end mills
//         'pocket'  pockets and slots: square end mills, then bull nose
//         'surface' 3D surfaces: bull nose when it fits as well as a ball nose, else ball nose
// camAutoTool(op) wires it into the Contour, Chain (contour / pocket) and 3D (Waterline, 3D Parallel) operations.
(function () {
  const CLR = 0.1;                                        // mm of room left round the cutter
  const KINDS = {
    wall:    { types: ['flat'],         label: 'Square end mill for flat walls' },
    pocket:  { types: ['flat', 'bull'], label: 'Square or bull-nose end mill' },
    surface: { types: ['bull', 'ball'], label: 'Bull or ball nose for 3D surfaces' },
  };
  const TYPE_NAME = { flat: 'square end mill', ball: 'ball nose', bull: 'bull nose' };
  const dia = mm => isIn() ? fmtToolD(mm) : 'Ø' + +mm.toFixed(2);
  const len = mm => isIn() ? fmt(mm / 25.4, 3) + '"' : +mm.toFixed(2) + ' mm';
  const area = p => Math.abs(ClipperLib.Clipper.Area(p)) / (CS * CS);
  const fluteLen = t => { try { return toolParams(t).loc || Infinity; } catch (e) { return Infinity; } };

  // Smallest radius (mm) of a rounded inside corner of the space. Sharp corners (a turn over ~28° at one vertex) are
  // ignored: no cutter can make them, whatever its size. Infinity when the space has no rounded corner.
  function minInsideRadius(air) {
    let best = Infinity;
    for (const path of air) {
      const n = path.length; if (n < 3) continue;
      const at = i => path[(i % n + n) % n], dist = (p, q) => Math.hypot(p.X - q.X, p.Y - q.Y), turn = new Array(n);
      for (let i = 0; i < n; i++) {
        const a = at(i - 1), b = at(i), c = at(i + 1), ux = b.X - a.X, uy = b.Y - a.Y, vx = c.X - b.X, vy = c.Y - b.Y;
        turn[i] = Math.hypot(ux, uy) < 1 || Math.hypot(vx, vy) < 1 ? 0 : Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);   // > 0: a convex corner of the space, an inside corner of the pocket
      }
      for (let i = 0; i < n; i++) {
        if (turn[i] < 1e-3 || turn[i] > 0.5) continue;
        // a circle through this vertex and the ones about 1 mm either side, so tessellation and rounding noise cancel out
        let ia = i, ic = i, sa = 0, sc = 0, sharp = false, tot = 0;
        for (let k = 1; k < n && sa < CS; k++) { sa += dist(at(i - k), at(i - k + 1)); ia = i - k; if (turn[((ia % n) + n) % n] > 0.5) sharp = true; tot += Math.abs(turn[((ia % n) + n) % n]); }
        for (let k = 1; k < n && sc < CS; k++) { sc += dist(at(i + k), at(i + k - 1)); ic = i + k; if (turn[((ic % n) + n) % n] > 0.5) sharp = true; tot += Math.abs(turn[((ic % n) + n) % n]); }
        if (sharp) continue;                                       // the window runs over a sharp corner: no radius to read here
        const A = at(ia), B = at(i), Cc = at(ic), ab = dist(A, B), bc = dist(B, Cc), ca = dist(Cc, A), ar2 = Math.abs((B.X - A.X) * (Cc.Y - A.Y) - (B.Y - A.Y) * (Cc.X - A.X));
        if (ar2 < 1) continue;
        best = Math.min(best, ab * bc * ca / (2 * ar2) / CS);
      }
    }
    return best;
  }
  // Largest cutter diameter (mm) that gets into every part of the space.
  function widthFits(air, D) {
    const open = cOffset(air, -(D / 2 + CLR)), n0 = air.filter(p => ClipperLib.Clipper.Orientation(p)).length;
    return open.filter(p => ClipperLib.Clipper.Orientation(p) && area(p) > 1e-4).length >= Math.max(1, n0);
  }

  // → { tool, ok, reason, alts: [tool…], minR, depth } or null when the library has no tool of a suitable type.
  function camPickTool({ air, depth = 0, kind = 'wall', tools }) {
    const spec = KINDS[kind] || KINDS.wall, lib = (tools || cam().tools).filter(t => spec.types.includes(t.type) && !t.wire);
    if (!lib.length || !air || !air.length) return null;
    air = cUnion(air).filter(p => area(p) > 1e-4);
    if (!air.length) return null;
    const minR = minInsideRadius(air);
    const why = t => {                                               // the first reason this tool does not do the job, or ''
      if (isFinite(minR) && t.d / 2 > minR - CLR + 1e-9) return 'radius';
      if (!widthFits(air, t.d)) return 'width';
      if (depth > 0 && fluteLen(t) + 1e-6 < depth) return 'flute';
      return '';
    };
    // diameter first; at the same diameter the kind's own type order (bull nose before ball nose for 3D)
    const rank = t => spec.types.indexOf(t.type);
    const order = lib.slice().sort((a, b) => b.d - a.d || rank(a) - rank(b));
    const good = order.filter(t => !why(t));
    const shape = order.filter(t => { const w = why(t); return !w || w === 'flute'; });                  // fits the corners and width, flutes too short
    let tool = good[0], ok = !!tool, short = false;
    if (!tool && shape.length) { tool = shape[0]; short = true; }
    if (!tool) tool = order[order.length - 1];                       // nothing fits: the closest smaller one is the smallest we have
    const bigger = order.filter(t => t.d > tool.d + 1e-6).map(t => ({ t, w: why(t) })).filter(x => x.w).sort((a, b) => a.t.d - b.t.d)[0];
    const nm = `${dia(tool.d)} ${TYPE_NAME[tool.type] || tool.type}`;
    let reason;
    if (short) reason = `${nm} fits, but no tool in the library has flutes for the ${len(depth)} depth (${len(fluteLen(tool))} reach): add a longer one or cut it in two setups`;
    else if (!ok) { const w = why(tool), kn = kind === 'surface' ? 'ball or bull nose' : 'end mill'; reason = w === 'flute' ? `No ${kn} in the library reaches the ${len(depth)} depth: ${nm} is the closest, so it will need a longer tool` : `No ${kn} in the library fits${w === 'radius' ? ` the ${len(minR)} inside radius` : ' this feature'}: ${nm} is the closest, so the corners will be left`; }
    else if (bigger && bigger.w === 'radius') reason = `${nm}: fits the ${len(minR)} inside radius`;
    else if (bigger && bigger.w === 'width') reason = `${nm}: fits the narrowest part of the feature`;
    else if (bigger && bigger.w === 'flute') reason = `${nm}: its flutes reach the ${len(depth)} depth`;
    else reason = `${nm}: the largest ${kind === 'surface' ? 'ball or bull nose' : 'end mill'} in the library that fits`;
    const alts = (good.length ? good : shape).filter(t => t !== tool).slice(0, 3);
    return { tool, ok, reason, alts, minR, depth };
  }

  // ── What each operation hands to camPickTool ──
  // → { air, depth, kind } for an internal feature, or null (outside, or nothing chosen yet: the default tool stays).
  function opRegion(op) {
    const st = camStock(), part = camPart();
    if (!st || !part) return null;
    const through = op.through == null ? 0.5 : op.through;
    if (op.type === 'contour') {
      if (op.holes) {
        const air = []; let bot = Infinity;
        for (const f of resolveCamFaces(op.faces || [])) {
          const all = faceRegion(f.mesh, f.fid);
          if (all) for (const rg of all.parts) for (const h of rg.holes) if (isCutout(h)) air.push(orient(cP(h), true));
        }
        return air.length ? { air, depth: st.z1 - part.z0 + through, kind: 'wall' } : null;
      }
      if (op.faces && op.faces.length) {
        const sel = resolveCamFaces(op.faces);
        if (!sel.length) return null;
        const side = op.side === 'inside' || op.side === 'outside' ? op.side : contourFaceSide(sel, part).side;
        if (side !== 'inside') return null;
        const air = []; for (const f of sel) { const rg = faceRegion(f.mesh, f.fid); if (rg) air.push(orient(cP(rg.outer), true)); }
        return air.length ? { air, depth: st.z1 - Math.min(...sel.map(f => f.z)) + through, kind: 'wall' } : null;
      }
      if (op.side === 'inside') {
        const air = []; for (const f of horizFaces()) { const rg = faceRegion(f.mesh, f.fid); if (rg) air.push(orient(cP(rg.outer), true)); }
        return air.length ? { air, depth: st.z1 - part.z0 + through, kind: 'wall' } : null;
      }
      return null;
    }
    if (op.type === 'chain') {
      const cm = op.cm || 'contour';
      if (cm !== 'contour' && cm !== 'pocket') return null;
      const inner = [], other = []; let depth = 0;
      for (const c of op.chains || []) {
        if (!c.closed || !c.pts || c.pts.length < 3) continue;
        const pts = chainTravel(c), side = op.side && op.side !== 'auto' ? op.side : chainAutoSide(c, pts).side;
        const ccw = cArea(cP(pts)) > 0, inside = cm === 'pocket' || side === 'on' ? true : (side === 'left') === ccw;
        const path = orient(cP(pts), true);
        if (!inside) { other.push(path); continue; }
        inner.push(path);
        const fl = chainSideFloor(c, pts, side === 'on' ? chainAutoSide(c, pts).side : side), dm = op.depthMode || 'auto';
        const bottom = dm === 'below' ? c.z - (op.depth || 0) : dm === 'chain' ? c.z : dm === 'through' ? part.z0 - through : Math.min(c.z, fl === -Infinity ? part.z0 - through : fl);
        depth = Math.max(depth, st.z1 - bottom);
      }
      if (!inner.length) return null;
      if (cm === 'pocket') {          // a loop inside another is an island (a boss on the floor, a groove's middle): the tool must fit between them
        const depthIn = q => inner.filter(o => o !== q && ClipperLib.Clipper.PointInPolygon(q[0], o) !== 0).length;
        const isl = inner.filter(q => depthIn(q) % 2);
        if (isl.length) return { air: cDiff(cUnion(inner.filter(q => !isl.includes(q))), cUnion(isl)), depth, kind: 'pocket' };
      }
      return { air: other.length ? cDiff(cUnion(inner), cUnion(other)) : inner, depth, kind: cm === 'pocket' ? 'pocket' : 'wall' };
    }
    if (op.type === 'waterline' || op.type === 'parallel') {     // 3D: the recesses of the part (floors with walls rising round them)
      const air = []; let depth = 0;
      for (const f of horizFaces()) {
        const rg = faceRegion(f.mesh, f.fid); if (!rg) continue;
        if (contourFaceSide([f], part).side !== 'inside') continue;
        air.push(orient(cP(rg.outer), true)); depth = Math.max(depth, st.z1 - f.z);
      }
      return air.length ? { air, depth, kind: 'surface' } : null;
    }
    return null;
  }
  const AUTO_OPS = ['contour', 'chain', 'waterline', 'parallel'];
  const defaultTool = op => { const t = op.type === 'parallel' ? 'ball' : 'flat', C = cam(); return (C.tools.find(x => x.type === t) || C.tools[0]).n; };

  // Choose the tool for an operation now (call before record() so the change is part of the same undo step).
  // A tool the user picked by hand (op.toolMan) is never replaced. An external feature keeps the default tool.
  function camAutoTool(op) {
    if (!op || !AUTO_OPS.includes(op.type) || op.toolMan) return;
    let r = null, res = null;
    try { r = opRegion(op); res = r && camPickTool(r); } catch (e) { console.error(e); }
    if (!res) {
      if (op.autoTool) { op.tool = op.autoTool.prev != null && cam().tools.some(t => t.n === op.autoTool.prev) ? op.autoTool.prev : defaultTool(op); delete op.autoTool; }
      return;
    }
    const prev = op.autoTool ? op.autoTool.prev : op.tool;
    op.tool = res.tool.n;
    op.autoTool = { reason: res.reason, ok: res.ok, alts: res.alts.map(t => t.n), prev };
  }
  // The user picked a tool: keep it.
  function camSetToolManual(op, n) {
    const before = snap();
    op.tool = n; if (op.autoTool) op.toolMan = true;
    record(`Edit ${op.name} tool`, before);
    camRefresh();
  }
  // Back to the automatic choice.
  function camToolAuto(op) {
    const before = snap();
    delete op.toolMan; camAutoTool(op);
    record(`Auto tool for ${op.name}`, before);
    camRefresh();
  }
  // Sidebar card under the Tool field: the choice, why, and one-click alternatives.
  function camAutoToolCard(op) {
    const a = op.autoTool; if (!a) return '';
    const C = cam(), cur = toolOf(op.tool);
    const chip = (n, on) => { const t = C.tools.find(x => x.n === n); return t ? `<button class="chip ${on ? 'on' : ''}" data-autotool="${n}" data-tip="Use T${t.n} instead of the automatic choice">T${t.n} <small>${dia(t.d)} ${TYPE_NAME[t.type] || t.type}</small></button>` : ''; };
    const auto = op.toolMan ? '' : 'on';
    return `<div class="autotool ${a.ok ? '' : 'warn'}"><div class="at-head"><span class="at-badge">${op.toolMan ? 'Your pick' : 'Auto'}</span><span class="at-nm">${dia(cur.d)} ${TYPE_NAME[cur.type] || cur.type}</span></div>
      <p class="at-why">${op.toolMan ? `You chose T${cur.n}. The automatic choice was ${a.reason}.` : a.reason}</p>
      <div class="chips">${op.toolMan ? `<button class="chip" data-autotool="auto" data-tip="Go back to the largest tool that fits">Auto pick</button>` : ''}${a.alts.map(n => chip(n, false)).join('')}</div></div>`;
  }
  const css = document.createElement('style');
  css.textContent = `.autotool { border: 1px solid var(--rule); background: var(--panel-2); border-radius: 10px; padding: 9px 11px; margin: -2px 0 10px; display: flex; flex-direction: column; gap: 6px; animation: atIn .22s ease both; }
.autotool.warn { border-color: #d9a441; background: color-mix(in srgb, #d9a441 10%, var(--panel-2)); }
.autotool .at-head { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; }
.autotool .at-badge { font-size: 10px; letter-spacing: .04em; text-transform: uppercase; color: var(--accent); border: 1px solid var(--accent); border-radius: 8px; padding: 1px 6px; }
.autotool .at-why { margin: 0; font-size: 12px; color: var(--muted); line-height: 1.45; }
.autotool .chip { transition: border-color .15s, background .15s; }
.autotool .chip:hover { border-color: var(--accent); }
@keyframes atIn { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: none; } }`;
  document.head.appendChild(css);
  Object.assign(window, { camPickTool, camAutoTool, camSetToolManual, camToolAuto, camAutoToolCard });
})();
