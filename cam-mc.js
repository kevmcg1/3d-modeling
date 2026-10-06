// Manufacture: Mastercam-style toolpaths, added to the Chain operation as extra toolpath modes (MC_CM, declared in
// index.html). Each mode has gen(op, tool, st, part, P, chains) and fields(op), and works from clicked chains (Manual)
// or from op.faces (Auto Detect). The coverage list is docs/mastercam-toolpaths.md.
// Batch 1, 2D high speed and area clearing: Dynamic Mill, Peel Mill, Area Mill, Corner Rest Mill (and Ramp Contour, an option
// on the Contour mode, see chainContour).
(function () {
  const seg = (k, items, cur) => `<div class="seg">${items.map(([v, l, t]) => `<button data-opset="${k}:${v}" class="${cur === v ? 'on' : ''}" ${t ? `data-tip="${t}"` : ''}>${l}</button>`).join('')}</div>`;
  ['opMcPeelW', 'opMcAp', 'opMcRestD'].forEach(k => CAM_LEN.add(k));

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

  // The rings are cut from the middle out, level by level (the engine behind Dynamic Mill and the Corner Rest Mill).
  function clearRings(P, st, tool, tArea, rings, floor, ap, fe) {
    const r = tool.d / 2, safe = st.z1 + cam().safe, ret = st.z1 + cam().retract, items = [];
    rings.forEach((rg, k) => rg.forEach(q => items.push({ k, pts: uP(q) })));
    if (!items.length) return 0;
    const link = cOffset(tArea, 0.002), zs = levels(st.z1, floor, ap);
    zs.forEach((z, li) => {
      const zFrom = li ? zs[li - 1] : st.z1, left = items.slice();
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
    });
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

  // ── Panel wiring ──
  window.mcBind = function (op, setN) {
    const set = (k, lo) => v => camEdit(op, k, Math.max(lo, v));
    setN('opMcAp', set('stepdown', 0.1)); setN('opMcPeelW', set('peelW', 0.1)); setN('opMcCorner', set('corner', 0));
    setN('opMcAngle', v => camEdit(op, 'angle', ((v % 180) + 180) % 180)); setN('opMcRestD', set('restD', 0)); setN('opMcRamp', v => camEdit(op, 'rampAngle', clamp(v, 0.5, 30)));
    const ck = (id, k) => { const el = document.getElementById(id); if (el) el.addEventListener('change', () => camEdit(op, k, el.checked)); };
    ck('opMcThin', 'chipThin'); ck('opMcWalls', 'walls'); ck('opMcRamping', 'ramp');
  };
})();
