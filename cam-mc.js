// Manufacture: Mastercam-style toolpaths, added to the Chain operation as extra toolpath modes (MC_CM, declared in
// index.html). Each mode has gen(op, tool, st, part, P, chains) and fields(op), and works from clicked chains (Manual)
// or from op.faces (Auto Detect). The coverage list is docs/mastercam-toolpaths.md.
// Batch 1, 2D high speed and area clearing: Dynamic Mill, Peel Mill, Area Mill, Corner Rest Mill (and Ramp Contour, an option
// on the Contour mode, see chainContour).
(function () {
  const seg = (k, items, cur) => `<div class="seg">${items.map(([v, l, t]) => `<button data-opset="${k}:${v}" class="${cur === v ? 'on' : ''}" ${t ? `data-tip="${t}"` : ''}>${l}</button>`).join('')}</div>`;
  ['opMcPeelW', 'opMcAp', 'opMcRestD', 'opShift', 'opMcCx', 'opMcCy', 'opMcSlotT'].forEach(k => CAM_LEN.add(k));

  // ── Where the material is: closed chains (nested ones are islands) or, from Auto Detect, the floors of the picked faces ──
  // Returns [{ area (Clipper paths, outer ccw and islands cw), floor }].
  function mcAreas(op, st, part, P, chains) {
    const out = [];
    const polys = chains.filter(c => c.closed && c.pts.length >= 3).map(c => ({ c, p: chainTravel(c) }));
    const open = chains.length - polys.length;
    if (open) P.warn.push(`${open} open chain${open > 1 ? 's' : ''} skipped: this toolpath needs a closed chain (use Close chain to join the ends).`);
    polys.forEach(a => { a.cp = cP(a.p); a.area = Math.abs(cArea(a.cp)); });
    polys.forEach(a => { a.depth = polys.filter(b => b !== a && inPaths(a.p[0], [cArea(b.cp) < 0 ? b.cp.slice().reverse() : b.cp])).length; });
    const outers = polys.filter(a => a.depth % 2 === 0), islands = polys.filter(a => a.depth % 2 === 1);
    for (const o of outers) {
      const mine = islands.filter(i => inPaths(i.p[0], [cArea(o.cp) < 0 ? o.cp.slice().reverse() : o.cp]) && !outers.some(o2 => o2 !== o && o2.area < o.area && o2.area > i.area && inPaths(i.p[0], [o2.cp])));
      out.push({ area: [orient(o.cp, true), ...mine.map(i => orient(i.cp, false))], floor: (op.depthMode === 'below' ? o.c.z - (op.depth || 0) : o.c.z) + (op.leaveFloor || 0) });
    }
    if ((op.faces || []).length) {
      for (const f of resolveCamFaces(op.faces).sort((a, b) => b.z - a.z)) {
        const all = faceRegion(f.mesh, f.fid);
        if (!all) continue;
        for (const rg of all.parts) {
          if (!floorPartMachinable(rg, f.z) || !loopRises(rg.outer, f.z, true)) continue;          // closed pockets only; an open step is the Pocket's job
          let area = [orient(cP(rg.outer), true)];
          const isl = rg.holes.filter(h => loopRises(h, f.z, false));
          if (isl.length) area = cDiff(area, isl.map(h => orient(cP(h), true)));
          out.push({ area, floor: f.z + (op.leaveFloor || 0) });
        }
      }
    }
    return out;
  }
  const sideAndBottom = (op, c, pts, part) => {
    const auto = chainAutoSide(c, pts), side = op.side && op.side !== 'auto' ? op.side : auto.side, ts = side === 'on' ? auto.side : side, dm = op.depthMode || 'auto';
    let bottom;
    if (dm === 'below') bottom = c.z - (op.depth || 0);
    else if (dm === 'chain') bottom = c.z;
    else if (dm === 'through') bottom = part.z0 - (op.through == null ? 0.5 : op.through);
    else { const fl = chainSideFloor(c, pts, ts); bottom = Math.min(c.z, fl === -Infinity ? part.z0 - (op.through == null ? 0.5 : op.through) : fl); }
    return { side: ts, bottom };
  };
  // Chip thinning: a cut narrower than half the tool lets the feed go up and keep the same chip.
  const thinning = (ae, d, cap) => { const k = 1 - 2 * Math.min(0.5, ae / d); return Math.min(cap || 2.5, 1 / Math.sqrt(Math.max(1e-3, 1 - k * k))); };
  const ringsOf = (tArea, so) => {
    const rings = [];
    for (let k = 0; k < 3000; k++) { const cur = k ? cOffset(tArea, -so * k) : tArea; if (!cur.length) break; rings.push(ClipperLib.Clipper.CleanPolygons(cur, 0.005 * CS).filter(p => p.length >= 3 && Math.abs(cArea(p)) > 1e-4)); }
    return rings;
  };

  // One level of rings, cut from the middle out: the tool goes down at the innermost loop it cannot reach straight from where it is,
  // then works out ring by ring. zFrom is where the level above left the floor.
  function clearLevel(P, st, tool, items, link, z, zFrom, fe) {
    const r = tool.d / 2, safe = st.z1 + cam().safe, ret = st.z1 + cam().retract, left = items.slice();
    let first = true;
    while (left.length) {
      let bi = -1;
      if (!first) for (let i = 0; i < left.length; i++) if (!segHitsPaths(P2(P.cur[0], P.cur[1]), left[i].pts[0], link) && (bi < 0 || left[i].k > left[bi].k)) bi = i;
      const goDown = bi < 0;
      if (goDown) { bi = 0; left.forEach((q, i) => { if (q.k > left[bi].k) bi = i; }); }
      const L = left.splice(bi, 1)[0], s = L.pts[0];
      if (goDown) {
        if (!P.cur) P.rapid(s.x, s.y, safe); else P.rapid(P.cur[0], P.cur[1], ret);
        P.rapid(s.x, s.y, ret); P.rapid(s.x, s.y, Math.min(ret, zFrom + 0.5));
        rampLoop(P, L.pts, zFrom, z, 3, 0.35 * r);
      } else {
        if (Math.abs(P.cur[2] - z) > 1e-9) P.feed(P.cur[0], P.cur[1], z);
        P.feed(s.x, s.y, z, fe);
        for (let j = 1; j <= L.pts.length; j++) P.feed(L.pts[j % L.pts.length].x, L.pts[j % L.pts.length].y, z, fe);
      }
      first = false;
    }
  }
  const itemsOf = rings => { const items = []; rings.forEach((rg, k) => rg.forEach(q => items.push({ k, pts: uP(q) }))); return items; };
  // The rings are cut level by level (the engine behind Dynamic Mill and the Corner Rest Mill).
  function clearRings(P, st, tool, tArea, rings, floor, ap, fe) {
    const items = itemsOf(rings);
    if (!items.length) return 0;
    const link = cOffset(tArea, 0.002), zs = levels(st.z1, floor, ap);
    zs.forEach((z, li) => clearLevel(P, st, tool, items, link, z, li ? zs[li - 1] : st.z1, fe));
    return zs.length;
  }

  // shared: where the floor is
  function mcFloor(op) {
    return `<div class="field"><span>Floor</span>${seg('depthMode', [['chain', 'At the chain'], ['below', 'Below it']], op.depthMode === 'below' ? 'below' : 'chain')}</div>${op.depthMode === 'below' ? `<div class="row2">${num('opDepth', op.depth || 0, 'Depth below chain', 0.1)}</div>` : ''}`;
  }
  const noArea = (op, P) => { if (!P.warn.length) P.warn.push((op.faces || []).length ? 'No closed pocket floor in the picked faces.' : 'Click a closed chain (the outline, with any islands) in the model.'); };

  // ── Dynamic Mill ──────────────────────────────────────────────────────────
  // High-speed clearing: deep axial cuts with a light radial bite, corners rounded so the tool never meets a sudden wall of
  // material, and the feed raised to match the thin chip. (Offset rings, not a true engagement-controlled path.)
  function genDynamic(op, tool, st, part, P, chains) {
    const r = tool.d / 2, so = Math.max(0.03, op.stepover || 0.12) * tool.d, lw = op.leaveWall == null ? 0.25 : op.leaveWall, ap = Math.max(0.1, op.stepdown || 1.5 * tool.d);
    const fm = op.chipThin === false ? 1 : thinning(so, tool.d, op.maxFeedMul), fe = fm > 1.01 ? tool.feed * fm : undefined, sm = Math.max(0, op.corner == null ? 0.3 : op.corner) * tool.d;
    const areas = mcAreas(op, st, part, P, chains);
    if (!areas.length) { noArea(op, P); return; }
    let n = 0;
    for (const a of areas) {
      let tArea = cOffset(a.area, -(r + lw));
      if (sm > 0.01) tArea = cOffset(cOffset(tArea, -sm), sm).filter(p => Math.abs(cArea(p)) > 1e-4);
      if (!tArea.length) { P.warn.push(`The ${fmtToolD(tool.d)} tool does not fit this area.`); continue; }
      clearRings(P, st, tool, tArea, ringsOf(tArea, so), a.floor, ap, fe); n++;
    }
    if (P.cur) P.rapid(P.cur[0], P.cur[1], st.z1 + cam().safe);
    if (n) P.info = `${n} area${n > 1 ? 's' : ''}, ${fmtLs(so)} radial bite (${Math.round(so / tool.d * 100)}% of Ø), ${fmtLs(ap)} per level${fe ? `, feed ×${fm.toFixed(2)} for chip thinning` : ''}`;
  }
  const dynamicFields = op => {
    const t = toolOf(op.tool), so = op.stepover || 0.12;
    return mcFloor(op) + `<div class="row3">${num('opSo', so, 'Radial bite ×Ø', 0.01)}${num('opMcAp', op.stepdown || 1.5 * t.d, 'Depth per level', 0.1)}${num('opLw', op.leaveWall == null ? 0.25 : op.leaveWall, 'Leave on walls', 0.05)}</div>
      <div class="row2">${num('opLf', op.leaveFloor || 0, 'Leave on floor', 0.05)}${num('opMcCorner', op.corner == null ? 0.3 : op.corner, 'Corner rounding ×Ø', 0.05)}</div>
      <label class="chk"><input type="checkbox" id="opMcThin" ${op.chipThin !== false ? 'checked' : ''}> Raise the feed for the thin chip (${thinning(so * t.d, t.d, op.maxFeedMul).toFixed(2)}×)</label>
      <p class="note">Cuts deep with a light side bite. Roughing: the walls are left for a Contour or Pocket finish.</p>`;
  };

  // ── Peel Mill ─────────────────────────────────────────────────────────────
  // Full-depth passes at a light side bite, from the stock side in toward the chain (the wall), so the tool is only ever
  // engaged on one side. Good for taking a band of stock off round a boss or along a wall.
  function rampPoly(P, pts, zFrom, zTo, deg) {
    const need = (zFrom - zTo) / Math.tan(deg * Math.PI / 180);
    let total = 0; for (let i = 1; i < pts.length; i++) total += dst2(pts[i - 1], pts[i]);
    if (!(total > 1e-6) || zFrom <= zTo + 1e-9) { P.feed(pts[0].x, pts[0].y, zTo); for (let i = 1; i < pts.length; i++) P.feed(pts[i].x, pts[i].y, zTo); return; }
    let acc = 0, fwd = true, guard = 0;
    P.feed(pts[0].x, pts[0].y, zFrom);
    while (acc < need - 1e-9 && guard++ < 200) {
      const seq = fwd ? pts : pts.slice().reverse();
      for (let i = 1; i < seq.length; i++) {
        const L = dst2(seq[i - 1], seq[i]);
        if (acc + L >= need) { const q = lerp2(seq[i - 1], seq[i], (need - acc) / (L || 1)); P.feed(q.x, q.y, zTo); acc = need; break; }
        acc += L; P.feed(seq[i].x, seq[i].y, zFrom - (zFrom - zTo) * acc / need);
      }
      if (acc < need) fwd = !fwd;
    }
    // finish the stroke at full depth, to whichever end the tool is not at
    const e = P2(P.cur[0], P.cur[1]), a = pts[0], b = pts[pts.length - 1], seq = dst2(e, b) < dst2(e, a) ? pts.slice().reverse() : pts;
    for (let i = 0; i < seq.length; i++) P.feed(seq[i].x, seq[i].y, zTo);
  }
  function genPeel(op, tool, st, part, P, chains) {
    const r = tool.d / 2, so = Math.max(0.03, op.stepover || 0.1) * tool.d, lw = op.leave || 0, W = op.peelW > 0 ? op.peelW : 2 * tool.d, ap = Math.max(0.1, op.stepdown || 1.5 * tool.d);
    const safe = st.z1 + cam().safe, ret = st.z1 + cam().retract;
    let did = 0;
    for (const c of chains) {
      const pts = chainTravel(c);
      if (pts.length < 2) continue;
      const { side, bottom } = sideAndBottom(op, c, pts, part), ds = [];
      for (let d = lw + r + W; d > lw + r + 1e-6; d -= so) ds.push(d);
      ds.push(lw + r);
      const paths = [];                                       // outer pass first, the wall pass last
      for (const d of ds) {
        if (c.closed) {
          const ccw = cArea(cP(pts)) > 0, inside = (side === 'left') === ccw, base = ccw ? cP(pts) : cP(pts.slice().reverse());
          for (const q of cOffset([base], inside ? -d : d)) { if (cArea(q) <= 1e-4) continue; let u = uP(q); if (!ccw) u = u.reverse(); let bi = 0; u.forEach((p, i) => { if (dst2(p, pts[0]) < dst2(u[bi], pts[0])) bi = i; }); paths.push({ pts: startAt(u, bi), closed: true }); }
        } else paths.push({ pts: offsetOpen(pts, d, side === 'left' ? 1 : -1), closed: false });
      }
      if (!paths.length) { P.warn.push(`The ${fmtToolD(tool.d)} tool does not fit this chain.`); continue; }
      const zs = levels(st.z1, bottom, ap);
      zs.forEach((z, li) => {
        const zFrom = li ? zs[li - 1] : st.z1;
        for (const p of paths) {
          const L = p.pts, s = L[0];
          if (!P.cur) P.rapid(s.x, s.y, safe); else P.rapid(P.cur[0], P.cur[1], ret);
          P.rapid(s.x, s.y, ret); P.rapid(s.x, s.y, Math.min(ret, zFrom + 0.5));
          if (p.closed) rampLoop(P, L, zFrom, z, op.rampAngle || 3, 0); else rampPoly(P, L, zFrom, z, op.rampAngle || 3);
        }
      });
      did++;
    }
    if (P.cur) P.rapid(P.cur[0], P.cur[1], safe);
    if (did) P.info = `${did} chain${did > 1 ? 's' : ''}, ${fmtLs(W)} band peeled with ${fmtLs(so)} side bite, ${fmtLs(ap)} per level`;
  }
  const peelFields = op => {
    const t = toolOf(op.tool);
    return `<div class="field"><span>Stock side (looking along the arrow)</span>${seg('side', [['auto', 'Auto', 'Finds the open side of the chain'], ['left', 'Left'], ['right', 'Right']], op.side || 'auto')}</div>
      <div class="field"><span>Cut down to</span>${seg('depthMode', [['auto', 'Auto'], ['chain', 'The chain'], ['through', 'Through'], ['below', 'Below it']], op.depthMode || 'auto')}</div>
      <div class="row3">${num('opMcPeelW', op.peelW > 0 ? op.peelW : 2 * t.d, 'Band to peel', 0.5)}${num('opSo', op.stepover || 0.1, 'Side bite ×Ø', 0.01)}${num('opMcAp', op.stepdown || 1.5 * t.d, 'Depth per level', 0.1)}</div>
      <div class="row3">${num('opLeave', op.leave || 0, 'Leave on wall', 0.05)}${op.depthMode === 'below' ? num('opDepth', op.depth || 0, 'Depth below chain', 0.1) : num('opThrough', op.through == null ? 0.5 : op.through, 'Below bottom', 0.1)}${num('opMcRamp', op.rampAngle || 3, 'Ramp angle °', 1)}</div>
      <p class="note">Takes a band of stock off along the chain: full depth, a light bite, working in toward the wall. The tool ramps in at the start of each pass.</p>`;
  };

  // ── Area Mill ─────────────────────────────────────────────────────────────
  // Parallel (zigzag) clearing of an area at each level, then a pass round the walls. Straight strokes, no rings, so it suits
  // wide or open areas and leaves a clean floor.
  function rasterSegs(tArea, ang, so) {
    const u = P2(Math.cos(ang), Math.sin(ang)), n = P2(-u.y, u.x);
    let nmin = Infinity, nmax = -Infinity, cx = 0, cy = 0, cnt = 0, R = 0;
    for (const p of tArea) for (const q of p) { const x = q.X / CS, y = q.Y / CS, v = x * n.x + y * n.y; nmin = Math.min(nmin, v); nmax = Math.max(nmax, v); cx += x; cy += y; cnt++; }
    cx /= cnt; cy /= cnt;
    for (const p of tArea) for (const q of p) R = Math.max(R, Math.hypot(q.X / CS - cx, q.Y / CS - cy));
    const count = Math.max(1, Math.ceil((nmax - nmin) / so - 1e-9)), out = [], cv = cx * n.x + cy * n.y;
    for (let k = 0; k <= count; k++) {
      const v = nmin + (nmax - nmin) * k / count, bx = cx + n.x * (v - cv), by = cy + n.y * (v - cv);
      const line = [{ X: Math.round((bx - u.x * (R + 1)) * CS), Y: Math.round((by - u.y * (R + 1)) * CS) }, { X: Math.round((bx + u.x * (R + 1)) * CS), Y: Math.round((by + u.y * (R + 1)) * CS) }];
      const cl = new ClipperLib.Clipper(), tree = new ClipperLib.PolyTree();
      cl.AddPath(line, ClipperLib.PolyType.ptSubject, false); cl.AddPaths(tArea, ClipperLib.PolyType.ptClip, true);
      cl.Execute(ClipperLib.ClipType.ctIntersection, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftEvenOdd);
      let row = ClipperLib.Clipper.OpenPathsFromPolyTree(tree).filter(s => s.length >= 2).map(s => s.map(q => P2(q.X / CS, q.Y / CS)));
      row = row.map(s => ((s[s.length - 1].x - s[0].x) * u.x + (s[s.length - 1].y - s[0].y) * u.y) < 0 ? s.slice().reverse() : s);      // every stroke runs along +u
      row.sort((a, b) => (a[0].x * u.x + a[0].y * u.y) - (b[0].x * u.x + b[0].y * u.y));
      if (k % 2) { row.reverse(); row = row.map(s => s.slice().reverse()); }
      for (const s of row) if (dst2(s[0], s[s.length - 1]) > 0.01) out.push([s[0], s[s.length - 1]]);
    }
    return out;
  }
  function genArea(op, tool, st, part, P, chains) {
    const r = tool.d / 2, so = Math.max(0.05, op.stepover || 0.6) * tool.d, lw = op.leaveWall || 0, ap = Math.max(0.1, op.stepdown || 1.5), ang = (op.angle || 0) * Math.PI / 180;
    const safe = st.z1 + cam().safe, ret = st.z1 + cam().retract, areas = mcAreas(op, st, part, P, chains);
    if (!areas.length) { noArea(op, P); return; }
    let n = 0, strokes = 0;
    for (const a of areas) {
      const tArea = cOffset(a.area, -(r + lw));
      if (!tArea.length) { P.warn.push(`The ${fmtToolD(tool.d)} tool does not fit this area.`); continue; }
      const segs = rasterSegs(tArea, ang, so), link = cOffset(tArea, 0.002), zs = levels(st.z1, a.floor, ap), walls = op.walls === false ? [] : tArea.map(q => uP(q));
      if (!segs.length) continue;
      zs.forEach((z, li) => {
        const zFrom = li ? zs[li - 1] : st.z1;
        // false when the tool can stay down and go straight there; true when it has to lift (and re-enter)
        const needLift = q => !(P.cur && Math.abs(P.cur[2] - z) < 1e-9 && !segHitsPaths(P2(P.cur[0], P.cur[1]), q, link));
        const enter = (q, along) => {
          if (!P.cur) P.rapid(q.x, q.y, safe); else P.rapid(P.cur[0], P.cur[1], ret);
          P.rapid(q.x, q.y, ret); P.rapid(q.x, q.y, Math.min(ret, zFrom + 0.5));
          if (along) rampPoly(P, along, zFrom, z, op.rampAngle || 3); else P.plunge(q.x, q.y, z);
        };
        let first = true;
        for (const s of segs) {
          if (first || needLift(s[0])) enter(s[0], s);
          else { P.feed(s[0].x, s[0].y, z); P.feed(s[1].x, s[1].y, z); }
          first = false; strokes++;
        }
        for (const w of walls) {
          const pts = startAt(w, nearestIdx(w, P2(P.cur[0], P.cur[1])));
          if (needLift(pts[0])) enter(pts[0], null); else P.feed(pts[0].x, pts[0].y, z);
          for (let i = 1; i <= pts.length; i++) P.feed(pts[i % pts.length].x, pts[i % pts.length].y, z);
        }
      });
      n++;
    }
    if (P.cur) P.rapid(P.cur[0], P.cur[1], safe);
    if (n) P.info = `${n} area${n > 1 ? 's' : ''}, ${strokes} zigzag strokes at ${op.angle || 0}°, ${fmtLs(so)} stepover, ${fmtLs(ap)} per level${op.walls === false ? '' : ', then a pass round the walls'}`;
  }
  const areaFields = op => `${mcFloor(op)}<div class="row3">${num('opSo', op.stepover || 0.6, 'Stepover ×Ø', 0.05)}${num('opSd', op.stepdown || 1.5, 'Stepdown', 0.1)}${num('opMcAngle', op.angle || 0, 'Stroke angle °', 5)}</div>
      <div class="row2">${num('opLw', op.leaveWall || 0, 'Leave on walls', 0.05)}${num('opLf', op.leaveFloor || 0, 'Leave on floor', 0.05)}</div>
      <label class="chk"><input type="checkbox" id="opMcWalls" ${op.walls !== false ? 'checked' : ''}> Finish the walls at every level</label>
      <p class="note">Straight zigzag strokes at the chosen angle. Good for wide or open areas, and for a clean floor.</p>`;

  // ── Corner Rest Mill ───────────────────────────────────────────────────────
  // Clears only what a bigger tool left in the corners of a closed chain (or the picked pocket floors).
  function genRest(op, tool, st, part, P, chains) {
    const r = tool.d / 2, so = Math.max(0.05, op.stepover || 0.4) * tool.d, lw = op.leaveWall || 0, D0 = op.restD || 0, ap = Math.max(0.1, op.stepdown || 1.5);
    if (!(D0 > tool.d + 1e-6)) { P.warn.push(`Set the diameter of the tool that did the roughing, bigger than this ${fmtToolD(tool.d)} tool.`); return; }
    const areas = mcAreas(op, st, part, P, chains);
    if (!areas.length) { noArea(op, P); return; }
    let n = 0, none = 0;
    for (const a of areas) {
      const tArea = cOffset(a.area, -(r + lw)), left = restLeft(a.area, D0 + 2 * lw);
      if (!tArea.length) { P.warn.push(`The ${fmtToolD(tool.d)} tool does not fit this area.`); continue; }
      const ringArea = left.length ? cInter(tArea, cOffset(left, r + 0.3)) : [];
      if (!ringArea.length) { none++; continue; }
      clearRings(P, st, tool, ringArea, ringsOf(ringArea, so), a.floor, ap); n++;
    }
    if (P.cur) P.rapid(P.cur[0], P.cur[1], st.z1 + cam().safe);
    if (none && !n) P.warn.push(`Nothing left: a Ø${fmtD(D0)} tool already reached everything.`);
    if (n) P.info = `${n} area${n > 1 ? 's' : ''}: only the corners the Ø${fmtD(D0)} tool could not reach`;
  }
  const restFields = op => `${mcFloor(op)}<div class="row3">${num('opMcRestD', op.restD || 0, 'Roughing tool Ø', 1)}${num('opSo', op.stepover || 0.4, 'Stepover ×Ø', 0.05)}${num('opSd', op.stepdown || 1.5, 'Stepdown', 0.1)}</div>
      <div class="row2">${num('opLw', op.leaveWall || 0, 'Leave on walls', 0.05)}${num('opLf', op.leaveFloor || 0, 'Leave on floor', 0.05)}</div>
      <p class="note">Set the Ø of the tool that cleared the area before. Only the corners it could not reach are cut, with this smaller tool.</p>`;

  Object.assign(MC_CM, {
    dynamic: { name: 'Dynamic Mill', group: '2D high speed', tools: ['flat', 'bull'], mrr: true, floorMode: 'chain', gen: genDynamic, fields: dynamicFields,
      tip: 'Roughs an area with deep cuts and a light side bite, corners rounded, feed raised for the thin chip. Click a closed chain, or let Auto Detect offer it for pockets.',
      defaults: t => ({ stepover: 0.12, stepdown: +(1.5 * t.d).toFixed(2), leaveWall: 0.25, leaveFloor: 0, corner: 0.3, chipThin: true }) },
    peel: { name: 'Peel Mill', group: '2D high speed', tools: ['flat', 'bull'], gen: genPeel, fields: peelFields,
      tip: 'Takes a band of stock off along a chain in full-depth passes with a light side bite, working in toward the wall.',
      defaults: t => ({ stepover: 0.1, stepdown: +(1.5 * t.d).toFixed(2), leave: 0, peelW: +(2 * t.d).toFixed(2), side: 'auto', through: 0.5, rampAngle: 3 }) },
    area: { name: 'Area Mill', group: '2D', tools: ['flat', 'bull'], mrr: true, floorMode: 'chain', gen: genArea, fields: areaFields,
      tip: 'Clears a closed area with straight zigzag strokes at any angle, level by level, then a pass round the walls.',
      defaults: () => ({ stepover: 0.6, stepdown: 1.5, leaveWall: 0, leaveFloor: 0, angle: 0, walls: true, rampAngle: 3 }) },
    rest: { name: 'Corner Rest Mill', group: '2D', tools: ['flat', 'bull'], mrr: true, floorMode: 'chain', gen: genRest, fields: restFields,
      tip: 'After a bigger tool, clears only the corners it left, with a smaller tool.',
      defaults: () => ({ stepover: 0.4, stepdown: 1.5, leaveWall: 0, leaveFloor: 0, restD: 0 }) },
  });

  // ── 3D roughing ──────────────────────────────────────────────────────────
  // Levels from the stock top down, with extra levels at the part's flat floors (plus the floor stock) so they are cut to size.
  function levelsWith(top, bottom, step, must) {
    const zs = [...new Set(must.filter(z => z < top - 1e-6 && z > bottom + 1e-6).map(z => +z.toFixed(3)))].sort((a, b) => b - a);
    zs.push(bottom);
    const out = []; let prev = top;
    for (const z of zs) { const n = Math.max(1, Math.ceil((prev - z) / step - 1e-9)); for (let i = 1; i <= n; i++) out.push(prev - (prev - z) * i / n); prev = z; }
    return out;
  }
  // Heights of the part's flat, upward-facing areas bigger than minArea.
  function flatLevels(minArea) {
    const g = camGeom(), T = (g.fineG || g.G).T, acc = new Map();
    for (const t of T) {
      if (!(t.n[2] > 0.9995)) continue;
      const a = t.a, b = t.b, c = t.c;
      if (Math.abs(a[2] - b[2]) > 1e-4 || Math.abs(a[2] - c[2]) > 1e-4) continue;
      const area = 0.5 * Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])), k = Math.round(a[2] * 100) / 100;
      acc.set(k, (acc.get(k) || 0) + area);
    }
    return [...acc].filter(([, a]) => a >= minArea).map(([z]) => z);
  }
  // 3D Rough Pocket: at each level the cutter goes everywhere the part does not rise above that height, from the middle of each area out.
  GEN.zrough = function (op, tool, st, part, P) {
    const r = tool.d / 2, dyn = !!op.dynamic, so = Math.max(0.03, dyn ? (op.dynBite || 0.12) : (op.stepover || 0.5)) * tool.d, lw = op.leaveWall == null ? 0.5 : op.leaveWall, lf = op.leaveFloor == null ? 0.5 : op.leaveFloor, step = Math.max(0.1, op.stepdown || 2);
    const fm = dyn ? thinning(so, tool.d, 2.5) : 1, fe = fm > 1.01 ? tool.feed * fm : undefined, restD = op.restD > tool.d + 1e-6 ? op.restD : 0;
    const bottom = (op.bottom != null && op.bottom > -1e8 ? op.bottom : part.z0) + lf;
    if (st.z1 - bottom < 0.05) { P.warn.push('The stock is not above the part: nothing to rough.'); return; }
    const flats = op.flats === false ? [] : flatLevels(Math.max(25, tool.d * tool.d * 0.5)).map(z => z + lf);
    const zs = levelsWith(st.z1, bottom, step, flats), rect = [orient(cP([P2(st.x0, st.y0), P2(st.x1, st.y0), P2(st.x1, st.y1), P2(st.x0, st.y1)]), true)];
    let did = 0, areas = 0;
    zs.forEach((z, li) => {
      const forbid = silhouetteAbove(z - 1e-3, true);
      let tArea = (forbid.length ? cDiff(rect, cOffset(forbid, r + lw)) : rect).filter(q => Math.abs(cArea(q)) > 1e-3);
      if (restD && tArea.length) {                                   // rest: only what the bigger tool could not reach at this level
        const free = forbid.length ? cDiff(rect, cOffset(forbid, lw)) : rect, left = restLeft(free, restD);
        tArea = left.length ? cInter(tArea, cOffset(left, r + 0.3)) : [];
      }
      if (!tArea.length) return;
      const rings = ringsOf(tArea, so), items = itemsOf(rings);
      if (!items.length) return;
      clearLevel(P, st, tool, items, cOffset(tArea, 0.002), z, li ? zs[li - 1] : st.z1, fe);
      did++; areas += rings[0].length;
    });
    if (P.cur) P.rapid(P.cur[0], P.cur[1], st.z1 + cam().safe);
    if (!did) P.warn.push('Nothing to cut: the part fills the stock at every level.');
    else P.info = `${dyn ? 'dynamic, ' : ''}${restD ? `rest after Ø${fmtD(restD)}, ` : ''}${did} of ${zs.length} levels, ${fmtLs(step)} apart (extra levels at ${flats.length} flat floor${flats.length === 1 ? '' : 's'}), ${fmtLs(lw)} left on walls, ${fmtLs(lf)} on floors`;
  };
  OP_INFO.zrough = { name: '3D Rough Pocket', icon: 'campocket', tip: 'Roughs the whole part from the stock in levels: at each height the tool clears everywhere the part does not rise above that height, from the middle of every area out. Extra levels land on the flat floors so they are cut to size. Leaves stock on walls and floors for the finishing operations.' };
  window.zroughFields = op => `<div class="row3">${num('opSo', op.stepover || 0.5, 'Stepover ×Ø', 0.05)}${num('opSd', op.stepdown || 2, 'Stepdown', 0.1)}${num('opWlBot', op.bottom != null && op.bottom > -1e8 ? op.bottom : (camPart() || { z0: 0 }).z0, 'Down to Z', 0.5)}</div>
    <div class="row2">${num('opLw', op.leaveWall == null ? 0.5 : op.leaveWall, 'Leave on walls', 0.05)}${num('opLf', op.leaveFloor == null ? 0.5 : op.leaveFloor, 'Leave on floors', 0.05)}</div>
    <div class="row2">${num('opMcRestD', op.restD || 0, 'Rest after tool Ø (0 = off)', 1)}${op.dynamic ? num('opMcDynBite', op.dynBite || 0.12, 'Side bite ×Ø', 0.01) : '<span></span>'}</div>
    <label class="chk"><input type="checkbox" id="opMcDyn" ${op.dynamic ? 'checked' : ''}> Dynamic: light side bite, raised feed for the thin chip</label>
    <label class="chk"><input type="checkbox" id="opMcFlats" ${op.flats !== false ? 'checked' : ''}> Cut a level at every flat floor</label>
    <p class="note">Steep walls come out as steps the height of the stepdown; a finishing operation (Waterline, 3D Parallel) takes them off.</p>`;

  // Rough mode for any set of 3D paths: level by level from the stock top, cutting only the runs where the surface lies at or below the level.
  function roughPaths(P, st, tool, paths, op) {
    const safe = st.z1 + cam().safe, ret = st.z1 + cam().retract, step = Math.max(0.1, op.stepdown || 2);
    let lo = Infinity; for (const q of paths) for (const p of q) lo = Math.min(lo, p[2]);
    if (!isFinite(lo)) { P.warn.push('Nothing to machine.'); return 0; }
    const zs = levelsWith(st.z1, Math.min(lo, st.z1 - 0.1), step, []);
    let runsN = 0;
    zs.forEach((z, li) => {
      const zFrom = li ? zs[li - 1] : st.z1;
      for (const q of paths) {
        let run = [];
        const flush = () => {
          if (run.length > 1) {
            if (!P.cur) P.rapid(run[0].x, run[0].y, safe); else P.rapid(P.cur[0], P.cur[1], ret);
            P.rapid(run[0].x, run[0].y, ret); P.rapid(run[0].x, run[0].y, Math.min(ret, zFrom + 0.5));
            rampPoly(P, run, zFrom, z, op.rampAngle || 3); runsN++;
          }
          run = [];
        };
        for (const p of q) { if (p[2] <= z + 1e-6) run.push(P2(p[0], p[1])); else flush(); }
        flush();
      }
    });
    if (P.cur) P.rapid(P.cur[0], P.cur[1], safe);
    if (!runsN) P.warn.push('Nothing to cut at these levels.');
    P.roughInfo = `rough: ${runsN} strokes over ${zs.length} levels, ${fmtLs(step)} apart, ${fmtLs(op.leave || 0)} left`;
    return runsN;
  }
  const parallelRough = function (op, tool, st, part, P, res) {
    const pts = res.pts, q = [];
    for (let i = 0; i < pts.length; i += 3) q.push([pts[i], pts[i + 1], pts[i + 2]]);
    if (q.length < 2) { P.warn.push('Nothing to machine.'); return; }
    if (roughPaths(P, st, tool, [q], op)) P.info = `${P.roughInfo} (${res.lines} passes over ${res.tris.toLocaleString()} triangles)`;
  };
  window.mcParallelRough = parallelRough;
  window.mcParallelFields = op => `<label class="chk"><input type="checkbox" id="opMcRough" ${op.rough ? 'checked' : ''}> Rough: cut in levels, leaving stock</label>${op.rough ? `<div class="row2">${num('opSd', op.stepdown || 2, 'Stepdown', 0.1)}</div>` : ''}`;

  // ── 3D surface finishing: a path in plan view, then the height of the tool above each point from the drop-cutter ──
  // (the same drop-cutter the 3D Parallel worker uses, run on the page's own copy of the part)
  function dropper(tool, leave, zmin) {
    const g = camGeom(), G = g.fineG || g.G, R = tool.d / 2, ball = tool.type === 'ball';
    if (!G.mcStamp || G.mcStamp.length !== G.T.length) G.mcStamp = new Int32Array(G.T.length);
    G.q = G.q || 0;
    return (x, y) => { G.q++; return Math.max(dropCutter(G, x, y, R, ball, G.mcStamp), zmin) + leave; };
  }
  // A polyline with its heights: sampled every `step`, then split wherever the true cutter height leaves the straight move by more than tol.
  function dropPoly(pts, closed, drop, step, tol) {
    const seq = resamplePoly(closed ? [...pts, pts[0]] : pts, false, step), out = [], c = seq.map(p => [p.x, p.y, drop(p.x, p.y)]);
    out.push(c[0]);
    const refine = (p, q, d) => { const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], zm = drop(m[0], m[1]); if (d < 7 && Math.abs(zm - (p[2] + q[2]) / 2) > tol) { const mid = [m[0], m[1], zm]; refine(p, mid, d + 1); out.push(mid); refine(mid, q, d + 1); } };
    for (let i = 1; i < c.length; i++) { refine(c[i - 1], c[i], 0); out.push(c[i]); }
    return out;
  }
  // Cut each 3D polyline: lift clear, move over, go down onto the surface and follow it.
  function emitSurface(P, st, paths, tool) {
    const safe = st.z1 + cam().safe, ret = st.z1 + cam().retract;
    let n = 0;
    for (const q of paths) {
      if (q.length < 2) continue;
      const a = q[0];
      if (!P.cur) P.rapid(a[0], a[1], safe); else P.rapid(P.cur[0], P.cur[1], ret);
      P.rapid(a[0], a[1], ret); P.rapid(a[0], a[1], Math.min(ret, a[2] + 1)); P.plunge(a[0], a[1], a[2]);
      for (let i = 1; i < q.length; i++) P.feed(q[i][0], q[i][1], q[i][2]);
      n++;
    }
    if (P.cur) P.rapid(P.cur[0], P.cur[1], safe);
    return n;
  }
  const surfStep = tool => Math.max(0.1, Math.min(0.5, tool.d / 6));
  // part's plan box, grown by the tool radius when it may run past the edges
  const planBox = (op, part, r) => { const o = op.overrun === false ? 0 : r; return [part.x0 - o, part.y0 - o, part.x1 + o, part.y1 + o]; };
  const clipBox = (p, b) => p.x >= b[0] - 1e-9 && p.x <= b[2] + 1e-9 && p.y >= b[1] - 1e-9 && p.y <= b[3] + 1e-9;
  // runs of consecutive points that stay inside the box
  const runsIn = (pts, b) => { const out = []; let cur = []; for (const p of pts) { if (clipBox(p, b)) cur.push(p); else { if (cur.length > 1) out.push(cur); cur = []; } } if (cur.length > 1) out.push(cur); return out; };

  function surfRadial(op, tool, st, part, P, drop, step, tol) {
    const r = tool.d / 2, so = Math.max(0.05, op.stepover || 0.5), b = planBox(op, part, r), cx = op.cx != null ? op.cx : (part.x0 + part.x1) / 2, cy = op.cy != null ? op.cy : (part.y0 + part.y1) / 2;
    const Rm = Math.max(...[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]].map(c => Math.hypot(c[0] - cx, c[1] - cy))), n = Math.max(8, Math.ceil(TAU * Rm / so)), paths = [];
    for (let k = 0; k < n; k++) {
      const a = TAU * k / n, ray = []; const m = Math.max(2, Math.ceil(Rm / step));
      for (let i = 0; i <= m; i++) ray.push(P2(cx + Math.cos(a) * Rm * i / m, cy + Math.sin(a) * Rm * i / m));
      for (const run of runsIn(ray, b)) { const q = dropPoly(run, false, drop, step, tol); paths.push(k % 2 ? q.reverse() : q); }
    }
    P.info = `${paths.length} spokes about (${fmtLs(cx)}, ${fmtLs(cy)}), ${fmtLs(so)} apart at the rim`;
    return paths;
  }
  function surfSpiral(op, tool, st, part, P, drop, step, tol) {
    const r = tool.d / 2, so = Math.max(0.05, op.stepover || 0.5), b = planBox(op, part, r), cx = op.cx != null ? op.cx : (part.x0 + part.x1) / 2, cy = op.cy != null ? op.cy : (part.y0 + part.y1) / 2;
    const Rm = Math.max(...[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]].map(c => Math.hypot(c[0] - cx, c[1] - cy))), pts = [];
    for (let th = 0; ; ) { const rr = so * th / TAU; if (rr > Rm) break; pts.push(P2(cx + rr * Math.cos(th), cy + rr * Math.sin(th))); th += step / Math.max(rr, step); if (pts.length > 400000) break; }
    const paths = runsIn(pts, b).map(run => dropPoly(run, false, drop, step, tol));
    P.info = `spiral about (${fmtLs(cx)}, ${fmtLs(cy)}), ${fmtLs(so)} per turn`;
    return paths;
  }
  // Scallop: rings of the part's outline stepping inward by the stepover, each followed over the surface. Spacing is the stepover in plan view,
  // so it is true on flat and gentle areas and wider on steep walls (use Waterline there).
  function surfScallop(op, tool, st, part, P, drop, step, tol) {
    const so = Math.max(0.05, op.stepover || 0.5), sil = silhouetteAbove(part.z0 + 0.01, false), paths = [];
    if (!sil.length) { P.warn.push('No part outline to follow.'); return paths; }
    for (let k = 0; k < 2000; k++) {
      const rings = (k ? cOffset(sil, -so * k) : sil).filter(q => q.length >= 3 && Math.abs(cArea(q)) > 1e-3);
      if (!rings.length) break;
      for (const q of rings) paths.push(dropPoly(uP(q), true, drop, step, tol));
    }
    P.info = `${paths.length} rings from the part outline inward, ${fmtLs(so)} apart in plan view`;
    return paths;
  }
  // Pencil: along the inside corners where two faces meet at more than the minimum angle, with the ball resting in the crease.
  function pencilEdges(minDeg) {
    const g = camGeom(), T = (g.fineG || g.G).T, key = v => Math.round(v[0] * 1000) + ',' + Math.round(v[1] * 1000) + ',' + Math.round(v[2] * 1000), em = new Map(), cosMin = Math.cos(minDeg * Math.PI / 180);
    T.forEach((t, ti) => { const vs = [t.a, t.b, t.c]; for (let e = 0; e < 3; e++) { const p = vs[e], q = vs[(e + 1) % 3], k1 = key(p), k2 = key(q), k = k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1; const r = vs[(e + 2) % 3]; (em.get(k) || em.set(k, []).get(k)).push({ ti, p, q, r }); } });
    const segs = [];
    for (const l of em.values()) {
      if (l.length !== 2) continue;
      const [A, B] = l, n1 = T[A.ti].n, n2 = T[B.ti].n;
      if (!(n1[2] > -0.1 && n2[2] > -0.1)) continue;
      if (dot3(n1, n2) > cosMin) continue;                                                    // too flat a join
      if (dot3(n1, sub3(B.r, A.p)) <= 1e-4 * (1 + Math.abs(B.r[2]))) continue;               // the far corner of the neighbor is not above this face: a ridge, not a crease
      segs.push([A.p, A.q]);
    }
    return segs;
  }
  function surfPencil(op, tool, st, part, P, drop, step, tol) {
    if (tool.type !== 'ball') P.warn.push('Pencil uses a ball mill: it is the ball that rests in the corner.');
    const segs = pencilEdges(clamp(op.minAngle || 25, 5, 85)), end = new Map(), key = v => Math.round(v[0] * 500) + ',' + Math.round(v[1] * 500) + ',' + Math.round(v[2] * 500);
    segs.forEach((sg, i) => { for (const v of sg) (end.get(key(v)) || end.set(key(v), []).get(key(v))).push(i); });
    const used = new Set(), paths = [];
    for (let i = 0; i < segs.length; i++) {
      if (used.has(i)) continue;
      used.add(i);
      let line = [segs[i][0], segs[i][1]];
      for (const dir of [1, 0]) {
        for (let guard = 0; guard < 20000; guard++) {
          const tip = dir ? line[line.length - 1] : line[0], nx = (end.get(key(tip)) || []).find(j => !used.has(j));
          if (nx == null) break;
          used.add(nx);
          const [a, b] = segs[nx], far = key(a) === key(tip) ? b : a;
          if (dir) line.push(far); else line.unshift(far);
        }
      }
      const pl = line.map(v => P2(v[0], v[1]));
      let L = 0; for (let k = 1; k < pl.length; k++) L += dst2(pl[k - 1], pl[k]);
      if (L < Math.max(1, tool.d * 0.5)) continue;
      paths.push(dropPoly(pl, false, drop, step, tol));
    }
    if (!paths.length) P.warn.push('No inside corners sharper than the minimum angle.');
    else P.info = `${paths.length} corner run${paths.length > 1 ? 's' : ''}, the ball resting in each crease`;
    return paths;
  }
  // Raster over the part's plan box at one angle: the strokes, each followed over the surface.
  function rasterPaths(op, tool, part, drop, step, tol, angDeg) {
    const r = tool.d / 2, so = Math.max(0.05, op.stepover || 0.5), b = planBox(op, part, r), box = [orient(cP([P2(b[0], b[1]), P2(b[2], b[1]), P2(b[2], b[3]), P2(b[0], b[3])]), true)];
    return rasterSegs(box, angDeg * Math.PI / 180, so).map(sg => dropPoly(sg, false, drop, step, tol));
  }
  // Cut a path into runs by the slope of each move (degrees from horizontal): keep(slope) decides which stay.
  function sliceBySlope(paths, keep) {
    const out = [];
    for (const q of paths) {
      let run = [];
      for (let i = 1; i < q.length; i++) {
        const a = q[i - 1], b = q[i], sl = Math.atan2(Math.abs(b[2] - a[2]), Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-9) * 180 / Math.PI;
        if (keep(sl)) { if (!run.length) run.push(a); run.push(b); } else { if (run.length > 1) out.push(run); run = []; }
      }
      if (run.length > 1) out.push(run);
    }
    return out;
  }
  // Steep: crossed rasters, only the parts of each stroke that climb at the slope angle or more. Shallow: the strokes that stay below it.
  function surfSteep(op, tool, st, part, P, drop, step, tol) {
    const A = clamp(op.slopeAngle || 45, 5, 85), runs = sliceBySlope([...rasterPaths(op, tool, part, drop, step, tol, 0), ...rasterPaths(op, tool, part, drop, step, tol, 90)], s => s >= A);
    P.info = `${runs.length} strokes on slopes of ${A}° or more (crossed rasters, ${fmtLs(op.stepover || 0.5)} apart)`;
    return runs;
  }
  function surfShallow(op, tool, st, part, P, drop, step, tol) {
    const A = clamp(op.slopeAngle || 45, 5, 85), runs = sliceBySlope(rasterPaths(op, tool, part, drop, step, tol, op.angle || 0), s => s < A);
    P.info = `${runs.length} strokes on slopes under ${A}° (raster, ${fmtLs(op.stepover || 0.5)} apart)`;
    return runs;
  }
  // Horizontal areas: every flat floor of the part, zigzagged at its own height (clear of the walls by the tool radius).
  function surfFlats(op, tool, st, part, P, drop, step, tol) {
    const r = tool.d / 2, so = Math.max(0.05, op.stepover || 0.5), paths = [], zs = flatLevels(Math.max(4, tool.d * tool.d * 0.25));
    for (const z of zs) {
      const above = silhouetteAbove(z + 1e-3, true), onOrAbove = silhouetteAbove(z - 1e-3, true);
      if (!onOrAbove.length) continue;
      const region = above.length ? cDiff(onOrAbove, above) : onOrAbove, allowed = (above.length ? cDiff(region, cOffset(above, r)) : region).filter(q => Math.abs(cArea(q)) > 1e-3);
      if (!allowed.length) continue;
      for (const sg of rasterSegs(allowed, (op.angle || 0) * Math.PI / 180, so)) paths.push([[sg[0].x, sg[0].y, z + (op.leave || 0)], [sg[1].x, sg[1].y, z + (op.leave || 0)]]);
    }
    if (!paths.length) P.warn.push('No flat floors big enough for this tool.');
    else P.info = `${zs.length} flat level${zs.length > 1 ? 's' : ''}, zigzag ${fmtLs(so)} apart`;
    return paths;
  }
  const SURF = { radial: surfRadial, spiral: surfSpiral, scallop: surfScallop, pencil: surfPencil, flats: surfFlats, steep: surfSteep, shallow: surfShallow };
  GEN.surf = function (op, tool, st, part, P) {
    const strat = SURF[op.strategy] ? op.strategy : 'radial', drop = dropper(tool, op.leave || 0, part.z0), step = surfStep(tool);
    const paths = SURF[strat](op, tool, st, part, P, drop, step, 0.02) || [];
    if (op.rough && strat !== 'flats') { const info = P.info; if (roughPaths(P, st, tool, paths, op)) P.info = `${P.roughInfo} · ${info || ''}`; return; }
    if (!emitSurface(P, st, paths, tool) && !P.warn.length) P.warn.push('Nothing to cut.');
  };
  OP_INFO.surf = { name: '3D Finish', icon: 'camparallel', tip: 'Finishes curved surfaces with a ball mill, following the surface exactly: radial spokes, a spiral, rings from the outline inward (scallop), or a pencil pass along the inside corners.' };
  const SURF_NAMES = { radial: 'Radial', spiral: 'Spiral', scallop: 'Scallop', pencil: 'Pencil', flats: 'Horizontal', steep: 'Steep', shallow: 'Shallow' };
  window.surfFields = op => {
    const st = SURF[op.strategy] ? op.strategy : 'radial', part = camPart() || { x0: 0, x1: 0, y0: 0, y1: 0 }, round = st === 'radial' || st === 'spiral';
    return `<div class="field"><span>Strategy</span><div class="seg" style="flex-wrap:wrap">${Object.entries(SURF_NAMES).map(([k, n]) => `<button data-opset="strategy:${k}" data-tipkey="mc:${k}" class="${st === k ? 'on' : ''}">${n}</button>`).join('')}</div></div>
      <div class="row2">${st === 'pencil' ? num('opMcMinAng', op.minAngle || 25, 'Smallest corner °', 5) : num('opSoL', op.stepover || 0.5, 'Stepover', 0.05)}${num('opLeave', op.leave || 0, 'Leave', 0.05)}</div>
      ${st === 'steep' || st === 'shallow' ? `<div class="row2">${num('opMcSlope', op.slopeAngle || 45, 'Slope angle °', 5)}</div>` : ''}
      ${st !== 'flats' ? `<label class="chk"><input type="checkbox" id="opMcRough" ${op.rough ? 'checked' : ''}> Rough: cut in levels, leaving stock</label>${op.rough ? `<div class="row2">${num('opSd', op.stepdown || 2, 'Stepdown', 0.1)}</div>` : ''}` : ''}
      ${round ? `<div class="row2">${num('opMcCx', op.cx != null ? op.cx : (part.x0 + part.x1) / 2, 'Center X', 1)}${num('opMcCy', op.cy != null ? op.cy : (part.y0 + part.y1) / 2, 'Center Y', 1)}</div>` : ''}
      <label class="chk"><input type="checkbox" id="opMcOverrun" ${op.overrun !== false ? 'checked' : ''}> Run the tool past the part edges</label>
      <p class="note">${{ radial: 'Spokes from the center, each followed over the surface. Good for round parts.', spiral: 'One continuous spiral out from the center: no lifts. Good for round parts.', scallop: 'Rings from the part outline inward, a stepover apart in plan view; true on flat and gentle areas.', flats: 'Every flat floor of the part, zigzagged at its own height and kept clear of the walls by the tool radius.', steep: 'Crossed rasters, keeping only the parts that climb at the slope angle or more. Pair it with Shallow.', shallow: 'A raster, keeping only the parts under the slope angle. Pair it with Steep.', pencil: 'Follows the inside corners where faces meet at the angle or more, with the ball resting in the crease.' }[st]}</p>`;
  };

  // Project (3D contour): a chain followed over the part's surface by the tool tip.
  function genProject(op, tool, st, part, P, chains) {
    const drop = dropper(tool, op.leave || 0, part.z0), step = surfStep(tool), paths = [];
    for (const c of chains) { const pts = chainTravel(c); if (pts.length > 1) paths.push(dropPoly(pts, !!c.closed, drop, step, 0.02)); }
    if (op.rough) { if (roughPaths(P, st, tool, paths, op)) P.info = P.roughInfo; return; }
    const n = emitSurface(P, st, paths, tool);
    if (n) P.info = `${n} chain${n > 1 ? 's' : ''} projected onto the surface${tool.type === 'ball' ? '' : ' (a ball mill follows a curve most closely)'}`;
  }
  const projectFields = op => `<div class="row2">${num('opLeave', op.leave || 0, 'Leave', 0.05)}</div><label class="chk"><input type="checkbox" id="opMcRough" ${op.rough ? 'checked' : ''}> Rough: cut in levels, leaving stock</label>${op.rough ? `<div class="row2">${num('opSd', op.stepdown || 2, 'Stepdown', 0.1)}</div>` : ''}<p class="note">The chain is followed over the part's surface: the tool tip rests on it all along the way.</p>`;
  window.mcFinish3d = op => (op.type === 'parallel' && !op.rough) || op.type === 'surf' || (op.type === 'chain' && op.cm === 'project');
  MC_CM.project = { name: 'Project (3D contour)', group: '3D', tools: ['ball'], gen: genProject, fields: projectFields,
    tip: 'Follows a chain over the part\'s surface with the tool tip. Click an edge or a chain, then pick a ball mill.',
    defaults: () => ({ leave: 0 }) };

  // Morph between two chains: passes that blend from the first chain into the second, each followed over the surface.
  function resampleN(pts, closed, n) {
    const seq = closed ? [...pts, pts[0]] : pts, cum = [0];
    for (let i = 1; i < seq.length; i++) cum.push(cum[i - 1] + dst2(seq[i - 1], seq[i]));
    const L = cum[cum.length - 1] || 1, out = []; let k = 1;
    for (let i = 0; i < n; i++) { const d = L * i / (n - 1); while (k < cum.length - 1 && cum[k] < d) k++; const f = (d - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1); out.push(lerp2(seq[k - 1], seq[k], clamp(f, 0, 1))); }
    return out;
  }
  function genMorph(op, tool, st, part, P, chains) {
    if (chains.length < 2) { P.warn.push('Click two chains (Shift-click to add the second): the passes blend from the first into the second.'); return; }
    const A = chainTravel(chains[0]), B = chainTravel(chains[1]), closed = !!(chains[0].closed && chains[1].closed), N = 240, a = resampleN(A, closed, N), b = resampleN(B, closed, N);
    const drop = dropper(tool, op.leave || 0, part.z0), step = surfStep(tool), cnt = clamp(op.mcPasses || 10, 1, 200), paths = [];
    for (let k = 0; k < cnt; k++) { const t = cnt > 1 ? k / (cnt - 1) : 0, line = a.map((p, i) => lerp2(p, b[i], t)), q = dropPoly(line, closed, drop, step, 0.02); paths.push(k % 2 && !closed ? q.reverse() : q); }
    if (op.rough) { if (roughPaths(P, st, tool, paths, op)) P.info = P.roughInfo; return; }
    const n = emitSurface(P, st, paths, tool);
    if (n) P.info = `${n} passes blending from the first chain into the second`;
  }
  MC_CM.morph = { name: 'Morph between curves', group: '3D', tools: ['ball'], gen: genMorph, fields: op => `<div class="row2">${num('opMcPasses', op.mcPasses || 10, 'Passes', 1)}${num('opLeave', op.leave || 0, 'Leave', 0.05)}</div><p class="note">Pick two chains: each pass is a blend of the two, followed over the surface.</p>`,
    tip: 'Passes that blend from one chain into another, followed over the surface.', defaults: () => ({ leave: 0, mcPasses: 10 }) };

  // Keyseat / T-slot: a straight pass along the chain at a depth below it, entering from outside the stock. (The tool is drawn as an end mill
  // of the cutter diameter; the cutter's thickness is the slot width.)
  function genTslot(op, tool, st, part, P, chains) {
    const r = tool.d / 2, safe = st.z1 + cam().safe, ret = st.z1 + cam().retract, inBox = p => p.x > st.x0 - r && p.x < st.x1 + r && p.y > st.y0 - r && p.y < st.y1 + r;
    let n = 0;
    for (const c of chains) {
      const pts = chainTravel(c);
      if (pts.length < 2) continue;
      const z = c.z - Math.max(0.1, op.depth > 0 ? op.depth : tool.d * 0.5);
      const out = (from, to) => { let d = nrm2(sub2(to, from)), p = from; for (let i = 0; i < 4000 && inBox(p); i++) p = add2(p, mul2(d, 1)); return p; };
      const s0 = out(pts[1], pts[0]), e1 = out(pts[pts.length - 2], pts[pts.length - 1]), L = [s0, ...pts, e1];
      if (!P.cur) P.rapid(s0.x, s0.y, safe); else P.rapid(P.cur[0], P.cur[1], ret);
      P.rapid(s0.x, s0.y, ret); P.rapid(s0.x, s0.y, Math.min(ret, z + 1)); P.plunge(s0.x, s0.y, z);
      for (let i = 1; i < L.length; i++) P.feed(L[i].x, L[i].y, z);
      n++;
    }
    if (P.cur) P.rapid(P.cur[0], P.cur[1], safe);
    if (n) P.info = `${n} slot${n > 1 ? 's' : ''}, ${fmtLs(op.slotT || 3)} thick, centered ${fmtLs(op.depth > 0 ? op.depth : tool.d * 0.5)} below the chain, entering from outside the stock`;
  }
  MC_CM.tslot = { name: 'Keyseat / T-slot', group: '2D', tools: ['flat'], gen: genTslot, fields: op => `<div class="row3">${num('opDepth', op.depth > 0 ? op.depth : toolOf(op.tool).d * 0.5, 'Depth below chain', 0.1)}${num('opMcSlotT', op.slotT || 3, 'Cutter thickness', 0.1)}</div><p class="note">A straight pass along the chain with a slotting cutter, entering from outside the stock. Pick the cutter's diameter as the tool Ø.</p>`,
    tip: 'A straight pass with a keyseat or T-slot cutter, entering from outside the stock.', defaults: () => ({ depth: 0, slotT: 3 }) };

  // ── Hover tip cards: a before and an after picture for each mode (tip-anim.js morphs one into the other) ──
  if (typeof TipArt === 'object' && typeof TIP_ART === 'object' && typeof TIP_TXT === 'object') {
    const { C, P, poly, line, box, ell, cyl } = TipArt, iso = f => () => { TipArt.at(60, 48, 1.55); return f(); };
    const blk = () => box(-16, -12, 0, 32, 24, 12);
    const pocket = (hx, hy) => poly([P(-hx, -hy, 12), P(hx, -hy, 12), P(hx, hy, 12), P(-hx, hy, 12)], '#7d8896');
    const oct = (hx, hy, c, z = 12.3) => line([P(-hx + c, -hy, z), P(hx - c, -hy, z), P(hx, -hy + c, z), P(hx, hy - c, z), P(hx - c, hy, z), P(-hx + c, hy, z), P(-hx, hy - c, z), P(-hx, -hy + c, z), P(-hx + c, -hy, z)], C.acc, 1.1);
    const rect = (hx, hy, z = 12.3, col = C.acc, w = 1.1) => line([P(-hx, -hy, z), P(hx, -hy, z), P(hx, hy, z), P(-hx, hy, z), P(-hx, -hy, z)], col, w);
    Object.assign(TIP_ART, {
      'mc:dynamic': [iso(() => blk() + pocket(10, 7)), iso(() => blk() + pocket(10, 7) + [0, 1, 2, 3].map(k => oct(8.4 - 2.1 * k, 5.4 - 1.7 * k, 2.2 - 0.4 * k)).join(''))],
      'mc:peel': [iso(() => blk() + box(-6, -4, 12, 12, 8, 5)), iso(() => blk() + box(-6, -4, 12, 12, 8, 5) + [0, 1, 2].map(k => rect(8 + 2.6 * (2 - k) + 0, 6 + 2.6 * (2 - k), 12.3, k === 2 ? C.warn : C.acc, 1.2)).join(''))],
      'mc:area': [iso(() => blk() + pocket(10, 7)), iso(() => blk() + pocket(10, 7) + [-5.5, -2.75, 0, 2.75, 5.5].map((y, i) => line(i % 2 ? [P(8.6, y, 12.3), P(-8.6, y, 12.3)] : [P(-8.6, y, 12.3), P(8.6, y, 12.3)], C.acc, 1.2)).join('') + rect(8.6, 6.4, 12.3, C.warn, 1))],
      'add:zrough': [iso(() => box(-16, -12, 0, 32, 24, 14, 's') + box(-6, -4, 0, 12, 8, 8, 'a')), iso(() => box(-16, -12, 0, 32, 24, 5) + box(-16, -12, 5, 32, 24, 3).replace(/fill="[^"]+"/g, 'fill="rgba(47,123,232,.15)"') + box(-6, -4, 0, 12, 8, 8, 'a') + [0, 1].map(k => rect(14 - 3 * k, 10 - 3 * k, 8.3, C.acc, 1.1)).join('') + rect(14, 10, 12.3, C.warn, 0.8))],
      'add:surf': [iso(() => box(-16, -12, 0, 32, 24, 6) + ell(0, 0, 6, 11, C.top)), iso(() => box(-16, -12, 0, 32, 24, 6) + ell(0, 0, 6, 11, C.top) + [0, 1, 2, 3, 4, 5].map(k => { const a = k * Math.PI / 3; return line([P(0, 0, 17), P(Math.cos(a) * 15, Math.sin(a) * 15, 7)], C.acc, 1.1); }).join(''))],
      'mc:radial': [iso(() => box(-16, -12, 0, 32, 24, 6) + ell(0, 0, 6, 11, C.top)), iso(() => box(-16, -12, 0, 32, 24, 6) + ell(0, 0, 6, 11, C.top) + [0, 1, 2, 3, 4, 5, 6, 7].map(k => { const a = k * Math.PI / 4; return line([P(0, 0, 17), P(Math.cos(a) * 14, Math.sin(a) * 14, 7)], C.acc, 1.1); }).join(''))],
      'mc:spiral': [iso(() => box(-16, -12, 0, 32, 24, 6) + ell(0, 0, 6, 11, C.top)), iso(() => { let pts = []; for (let t = 0; t < 4 * Math.PI; t += 0.3) { const r = 1 + t * 1.05; pts.push(P(Math.cos(t) * r, Math.sin(t) * r, 7 + Math.max(0, 10 - r * 0.9))); } return box(-16, -12, 0, 32, 24, 6) + ell(0, 0, 6, 11, C.top) + line(pts, C.acc, 1.2); })],
      'mc:scallop': [iso(() => box(-16, -12, 0, 32, 24, 6) + ell(0, 0, 6, 11, C.top)), iso(() => box(-16, -12, 0, 32, 24, 6) + ell(0, 0, 6, 11, C.top) + [11, 8, 5, 2].map(r => ell(0, 0, 6 + Math.sqrt(Math.max(0, 121 - r * r)) * 0.9, r, 'none', C.acc, 1.1)).join(''))],
      'mc:pencil': [iso(() => box(-16, -12, 0, 32, 24, 6) + box(-6, -4, 6, 12, 8, 6, 'a')), iso(() => box(-16, -12, 0, 32, 24, 6) + box(-6, -4, 6, 12, 8, 6, 'a') + line([P(-6.4, -4.4, 6.3), P(6.4, -4.4, 6.3), P(6.4, 4.4, 6.3), P(-6.4, 4.4, 6.3), P(-6.4, -4.4, 6.3)], C.warn, 2))],
      'mc:flats': [iso(() => box(-16, -12, 0, 32, 24, 6) + box(-6, -4, 6, 12, 8, 5, 'a')), iso(() => box(-16, -12, 0, 32, 24, 6) + box(-6, -4, 6, 12, 8, 5, 'a') + [-8, -5, 5, 8].map((y, i) => line([P(-14, y, 6.3), P(14, y, 6.3)], C.acc, 1.2)).join(''))],
      'mc:steep': [iso(() => box(-16, -12, 0, 32, 24, 6) + ell(0, 0, 6, 11, C.top)), iso(() => box(-16, -12, 0, 32, 24, 6) + ell(0, 0, 6, 11, C.top) + [-6, -2, 2, 6].map(y => line([P(-9, y, 8), P(-6, y, 12)], C.acc, 1.6) + line([P(6, y, 12), P(9, y, 8)], C.acc, 1.6)).join(''))],
      'mc:shallow': [iso(() => box(-16, -12, 0, 32, 24, 6) + ell(0, 0, 6, 11, C.top)), iso(() => box(-16, -12, 0, 32, 24, 6) + ell(0, 0, 6, 11, C.top) + [-6, -2, 2, 6].map(y => line([P(-4, y, 16.5), P(4, y, 16.5)], C.acc, 1.6)).join(''))],
      'mc:morph': [iso(() => box(-16, -12, 0, 32, 24, 6) + line([P(-12, -8, 6.2), P(12, -8, 6.2)], C.acc, 1.8) + line([P(-12, 8, 6.2), P(0, 10, 6.2), P(12, 8, 6.2)], C.warn, 1.8)), iso(() => box(-16, -12, 0, 32, 24, 6) + [0, 1, 2, 3, 4].map(k => { const t = k / 4; return line([P(-12, -8 + 16 * t, 6.2), P(0, -8 + 18 * t, 6.2), P(12, -8 + 16 * t, 6.2)], k === 0 ? C.acc : k === 4 ? C.warn : '#7aa6e6', 1.4); }).join(''))],
      'mc:tslot': [iso(() => box(-16, -12, 0, 32, 24, 12)), iso(() => box(-16, -12, 0, 32, 24, 12) + line([P(-16, 0, 6), P(16, 0, 6)], C.acc, 3.2) + cyl(-10, 0, 3, 5, 6, 'a'))],
      'mc:project': [iso(() => box(-16, -12, 0, 32, 24, 6) + ell(0, 0, 6, 11, C.top) + line([P(-12, -9, 6.2), P(12, -9, 6.2), P(12, 9, 6.2), P(-12, 9, 6.2), P(-12, -9, 6.2)], '#9aa6b4', 1.2, 'stroke-dasharray="3 2"')), iso(() => { let pts = []; for (let t = 0; t <= 1; t += 0.05) { const x = -12 + 24 * t, h = 6 + Math.sqrt(Math.max(0, 121 - x * x * 0.9)) * 0.5; pts.push(P(x, -3, h)); } return box(-16, -12, 0, 32, 24, 6) + ell(0, 0, 6, 11, C.top) + line(pts, C.acc, 1.8); })],
      'mc:rest': [iso(() => blk() + pocket(10, 7) + rect(7.4, 4.4, 12.3, '#9aa6b4', 1) + oct(7.4, 4.4, 2.6, 12.3).replace(C.acc, '#9aa6b4')), iso(() => blk() + pocket(10, 7) + [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([a, b]) => line([P(a * 9.2, b * 4.4, 12.3), P(a * 9.2, b * 6.2, 12.3), P(a * 7.4, b * 6.2, 12.3)], C.warn, 2.2)).join(''))],
    });
    Object.assign(TIP_TXT, {
      'mc:flats': ['Finish every flat floor at its own height, clear of the walls.', ['Pick the tool.', 'Set the stepover and the zigzag angle.']],
      'mc:steep': ['Finish only the steep parts of the surface, with crossed passes.', ['Set the slope angle (steeper than this is cut).', 'Pair it with Shallow.']],
      'mc:shallow': ['Finish only the gentle parts of the surface.', ['Set the slope angle (flatter than this is cut).', 'Pair it with Steep.']],
      'mc:morph': ['Passes that blend from one chain into another, followed over the surface.', ['Click the first chain, then Shift-click the second.', 'Set how many passes.']],
      'mc:tslot': ['A straight pass with a keyseat or T-slot cutter, entering from outside the stock.', ['Click the chain along the slot.', 'Set the depth and the cutter thickness.']],
      'add:surf': ['Finish curved surfaces with a ball mill, following the surface exactly.', ['Pick the ball mill.', 'Pick radial, spiral, scallop or pencil.', 'Set the stepover and what to leave.']],
      'mc:radial': ['Spokes from a center point, each followed over the surface. Good for round parts.', ['Set the center (the middle of the part by default).', 'Set the stepover at the rim.']],
      'mc:spiral': ['One unbroken spiral from the center out, with no lifts between passes.', ['Set the center.', 'Set the stepover per turn.']],
      'mc:scallop': ['Rings from the part outline inward, an even stepover apart in plan view.', ['Set the stepover.', 'Use Waterline on steep walls.']],
      'mc:pencil': ['Clean up the inside corners: the ball rests in the crease and runs along it.', ['Pick a ball mill.', 'Set the smallest corner angle to follow.']],
      'mc:project': ['Follow a chain over the part\'s surface with the tool tip.', ['Click an edge, or double-click for the whole chain.', 'Pick a ball mill and what to leave.']],
      'add:zrough': ['Rough the whole part from the stock in levels, from the middle of every area out, leaving stock for finishing.', ['Pick the roughing end mill.', 'Set the stepover and the stepdown.', 'Set how much to leave on walls and floors.']],
      'mc:dynamic': ['Rough an area fast: deep cuts with a light side bite, rounded corners, and a raised feed for the thin chip.', ['Click a closed chain (the pocket outline), with any islands.', 'Set the radial bite and the depth per level.', 'Leave stock on the walls for a Contour or Pocket finish.']],
      'mc:peel': ['Take a band of stock off along a chain in full-depth passes, working in toward the wall.', ['Click the chain along the wall.', 'Pick the stock side and how wide a band to peel.', 'Set the side bite and the depth per level.']],
      'mc:area': ['Clear a closed area with straight zigzag strokes at any angle, then a pass round the walls.', ['Click a closed chain, with any islands.', 'Set the stroke angle, stepover and stepdown.']],
      'mc:rest': ['After a bigger tool, clear only the corners it left, with a smaller tool.', ['Click the same closed chain.', 'Set the diameter of the roughing tool that went first.', 'Pick the smaller tool; only the leftover corners are cut.']],
    });
  }

  // ── Panel wiring ──
  window.mcRampPoly = rampPoly;
  window.mcBind = function (op, setN) {
    const set = (k, lo) => v => camEdit(op, k, Math.max(lo, v));
    setN('opShift', set('shift', 0.01)); setN('opMcAp', set('stepdown', 0.1)); setN('opMcPeelW', set('peelW', 0.1)); setN('opMcCorner', set('corner', 0));
    setN('opMcAngle', v => camEdit(op, 'angle', ((v % 180) + 180) % 180)); setN('opMcRestD', set('restD', 0)); setN('opMcRamp', v => camEdit(op, 'rampAngle', clamp(v, 0.5, 30)));
    const ck = (id, k) => { const el = document.getElementById(id); if (el) el.addEventListener('change', () => camEdit(op, k, el.checked)); };
    ck('opMcFlats', 'flats'); ck('opMcDyn', 'dynamic'); setN('opMcDynBite', set('dynBite', 0.03)); setN('opMcSlotT', set('slotT', 0.1)); setN('opMcPasses', v => camEdit(op, 'mcPasses', clamp(Math.round(v), 1, 200))); setN('opMcSlope', v => camEdit(op, 'slopeAngle', clamp(v, 5, 85))); ck('opMcOverrun', 'overrun'); setN('opMcCx', v => camEdit(op, 'cx', v)); setN('opMcCy', v => camEdit(op, 'cy', v)); setN('opMcMinAng', v => camEdit(op, 'minAngle', clamp(v, 5, 85)));
    const rg = document.getElementById('opMcRough');
    if (rg) rg.addEventListener('change', () => {
      const before = snap(), t = toolOf(op.tool); op.rough = rg.checked;
      if (rg.checked) { op.stepdown = op.stepdown > 0 ? op.stepdown : 2; if (!(op.leave > 0)) op.leave = 0.5; op.stepover = Math.max(op.stepover || 0, 0.5 * t.d); delete op.ra; }
      record(`${op.name}: ${rg.checked ? 'rough' : 'finish'}`, before); camRefresh();
    });
    ck('opMcThin', 'chipThin'); ck('opMcWalls', 'walls'); ck('opMcRamping', 'ramp');
  };
})();
