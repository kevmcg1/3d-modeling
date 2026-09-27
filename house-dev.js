// ── Block kit: plan / elevation prisms, cylinders and turned parts, in a local frame (mm) ──
// Local axes x, y (up), z; plan outlines are [x, z], front elevations [x, y], side elevations [z, y].
// fr maps the local frame into the world: origin o and the world directions of local x, y, z
// (right-handed). kit.at(o, ex, ey) gives a kit for a frame placed inside this one.
function blockKit(K, fr = { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }) {
  const { C } = K;
  const R = v => add3(add3(mul3(fr.x, v[0]), mul3(fr.y, v[1])), mul3(fr.z, v[2]));
  const T = p => add3(fr.o, R(p));
  const pl = (o, u, v) => K.pl(T(o), R(u), R(v));
  const PLAN = y => pl([0, y, 0], [1, 0, 0], [0, 0, -1]);       // sketch (x, −z) at height y, normal +y
  const XY = z => pl([0, 0, z], [1, 0, 0], [0, 1, 0]);         // sketch (x, y) at depth z, normal +z
  const ZY = x => pl([x, 0, 0], [0, 0, -1], [0, 1, 0]);        // sketch (−z, y) at x, normal +x
  const pip = (p, poly) => { let ins = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) ins = !ins; } return ins; };
  const segD = (p, a, b) => { const ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey, t = l2 ? clamp(((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / l2, 0, 1) : 0; return Math.hypot(p[0] - a[0] - ex * t, p[1] - a[1] - ey * t); };
  const edgeD = (p, poly) => { let m = Infinity; for (let i = 0; i < poly.length; i++) m = Math.min(m, segD(p, poly[i], poly[(i + 1) % poly.length])); return m; };
  // a point well inside the outline and outside every hole
  function inner(outer, holes = []) {
    let best = null, bd = -1;
    const xs = outer.map(p => p[0]), ys = outer.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), N = 24;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const p = [x0 + (x1 - x0) * (0.013 + 0.974 * i / N), y0 + (y1 - y0) * (0.017 + 0.966 * j / N)];
      if (!pip(p, outer) || holes.some(h => pip(p, h))) continue;
      const d = Math.min(edgeD(p, outer), ...holes.map(h => edgeD(p, h)));
      if (d > bd) { bd = d; best = p; }
    }
    if (!best) throw new Error('No interior point');
    return P2(best[0], best[1]);
  }
  const rect = (a0, b0, a1, b1) => [[a0, b0], [a1, b0], [a1, b1], [a0, b1]];
  const circ = (cx, cy, r, n = 24) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos(TAU * i / n), cy + r * Math.sin(TAU * i / n)]);
  const multi = o => typeof o[0][0] === 'number' ? [o] : o;
  // extrude outline(s) on a plane; every outline is its own region, holes are cut from the ones around them
  function prism(plane, outlines, holes, dist, mode, col, nm, rad = 0) {
    const ents = [];
    for (const o of outlines) ents.push(...K.rpoly(o, rad));
    for (const h of holes) ents.push(...K.rpoly(h, 0));
    const sk = K.sketch(plane, ents);
    const pts = outlines.map(o => inner(o, holes.filter(h => pip(h[0], o))));
    const f = K.extrude(sk, pts, dist, 'new', { mode });
    if (col) K.color(f, col);
    if (nm) K.name(f, nm);
    return f;
  }
  const flipZ = o => o.map(([x, z]) => [x, -z]);
  // plan outline(s) [x, z] extruded up from y0 to y1
  const plan = (outlines, y0, y1, col, nm, rad, holes = []) => prism(PLAN(y0), multi(outlines).map(flipZ), holes.map(flipZ), y1 - y0, 'one', col, nm, rad);
  const box = (x0, x1, y0, y1, z0, z1, col, nm, rad = 0) => plan(rect(x0, z0, x1, z1), y0, y1, col, nm, rad);
  // elevation outline(s) [x, y] extruded from z0 to z1
  const elevX = (outlines, z0, z1, col, nm, holes = [], rad = 0) => prism(XY(z0), multi(outlines), holes, z1 - z0, 'one', col, nm, rad);
  // side outline(s) [z, y] extruded from x0 to x1
  const flipS = o => o.map(([z, y]) => [-z, y]);
  const elevZ = (outlines, x0, x1, col, nm, holes = [], rad = 0) => prism(ZY(x0), multi(outlines).map(flipS), holes.map(flipS), x1 - x0, 'one', col, nm, rad);
  const cyl = (plane, cx, cy, r, d, col, nm) => { const sk = K.sketch(plane, [C(cx, cy, r)]); const f = K.extrude(sk, [P2(cx, cy)], d, 'new'); if (col) K.color(f, col); if (nm) K.name(f, nm); return f; };
  const cylY = (cx, cz, r, y0, y1, col, nm) => cyl(PLAN(y0), cx, -cz, r, y1 - y0, col, nm);
  const cylZ = (cx, cy, r, z0, z1, col, nm) => cyl(XY(z0), cx, cy, r, z1 - z0, col, nm);
  const cylX = (cz, cy, r, x0, x1, col, nm) => cyl(ZY(x0), -cz, cy, r, x1 - x0, col, nm);
  // a solid of revolution about the local-y line through (cx, cz); profile [[r, y], ...] closed along the axis (r = 0)
  function revY(cx, cz, prof, col, nm) {
    const pts = prof.map(([r, y]) => [cx + r, y]), ents = K.rpoly(pts, 0);
    let ax = ents.find(e => e.type === 'line' && Math.abs(e.a.x - cx) < 1e-9 && Math.abs(e.b.x - cx) < 1e-9);
    if (!ax) { const ys = pts.map(p => p[1]); ax = K.cons(K.L(cx, Math.min(...ys) - 10, cx, Math.max(...ys) + 10)); ents.push(ax); }   // a profile off the axis (a ring)
    const sk = K.sketch(XY(cz), ents);
    const f = K.revolve(sk, [inner(pts)], ax, 'new');
    if (col) K.color(f, col); if (nm) K.name(f, nm);
    return f;
  }
  // arc points from a0 to a1 (radians) around (cx, cy)
  const arcPts = (cx, cy, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
  // body-scoped booleans: the target keeps its id (and color); the tools are used up
  const comb = (target, tools, op, nm) => { const f = { id: K.nid(), type: 'combine', name: nm || 'Combine', target: target.id, tools: tools.map(t => t.id), op }; K.features.push(f); return target; };
  const at = (o, ex, ey) => { const X = nrm3(R(ex)), Y = nrm3(R(ey)); return blockKit(K, { o: T(o), x: X, y: Y, z: crs3(X, Y) }); };
  return { K, T, R, pl, PLAN, XY, ZY, rect, circ, prism, plan, box, elevX, elevZ, cylY, cylX, cylZ, revY, arcPts, inner, at, comb };
}

// ── A single-storey farmhouse with an attached garage ──────────────
// 16 × 10 m house, 6.2 × 7 m garage, 6:12 gable roofs, porch, deck, furnished rooms and a lot.
function sHouse(opts = {}) {
  const K = modelKit(), A = blockKit(K), { box, plan, elevX, elevZ, rect, cylY, cylX, cylZ, revY, arcPts, prism } = A;
  const H = 2700, TX = 200, TI = 100, P = 0.5, RT = 200 * Math.hypot(1, P);   // wall height, wall thicknesses, roof pitch, roof slab (vertical)
  const col = {
    siding: '#eceae4', trim: '#fbfbf8', frame: '#2a2d33', glass: '#9cc6de', roof: '#3b4048', found: '#a19f98',
    iwall: '#f3efe7', oak: '#c9a577', tile: '#d9dcde', door: '#2f5d50', brick: '#9c5a44', deck: '#9c6c48',
    lawn: '#6f9a4f', drive: '#bdb9b0', road: '#4a4d52', stone: '#b7ab98', white: '#f7f7f5', steel: '#b9bec4',
    dark: '#2e3136', fabric: '#6f7f8f', linen: '#e9e4da', accent: '#b5654a', wood: '#8a5a3c', counter: '#e6e2da', cab: '#5f7470', trunk: '#6b4a33', leaf: '#4f7d3a', pine: '#35613a', bush: '#5c8a45',
  };
  const hide = [], fasc = f => { hide.push(f); return f; };

  // ════ Walls — each wall is its elevation (openings included) pushed through its thickness ════
  // openings: { c: center along the wall, w, sill, head }; sill ≤ base makes a door (notched from the bottom)
  function wall(axis, pos, a0, a1, t, base, top, ops = [], gable = null, c = col.siding, nm) {
    const doors = ops.filter(o => o.sill <= base).sort((p, q) => p.c - q.c), wins = ops.filter(o => o.sill > base);
    const out = [[a0, base]];
    for (const d of doors) out.push([d.c - d.w / 2, base], [d.c - d.w / 2, d.head], [d.c + d.w / 2, d.head], [d.c + d.w / 2, base]);
    out.push([a1, base], [a1, top]);
    if (gable) out.push(...gable);
    out.push([a0, top]);
    const holes = wins.map(o => rect(o.c - o.w / 2, o.sill, o.c + o.w / 2, o.head));
    return axis === 'x' ? elevX(out, pos - t / 2, pos + t / 2, c, nm, holes) : elevZ(out, pos - t / 2, pos + t / 2, c, nm, holes);
  }
  // window frames (with a mullion on wide ones), glass, and exterior trim for the openings of one wall
  function glaze(axis, pos, t, out, ops) {
    const W = ops.filter(o => o.glass !== false);
    if (!W.length) return;
    const F = 55, rings = [], holes = [], trim = [], trimH = [];
    for (const o of W) {
      const x0 = o.c - o.w / 2, x1 = o.c + o.w / 2, y0 = Math.max(o.sill, 0), y1 = o.head;
      rings.push(rect(x0, y0, x1, y1));
      const split = o.w >= 1200 ? (o.w >= 2300 ? 3 : 2) : 1, iw = (o.w - 2 * F - (split - 1) * F) / split;
      for (let i = 0; i < split; i++) { const a = x0 + F + i * (iw + F); holes.push(rect(a, y0 + F, a + iw, y1 - F)); }
      if (o.sill > 0) { trim.push(rect(x0 - 90, y0 - 110, x1 + 90, y1 + 110)); trimH.push(rect(x0, y0, x1, y1)); }
    }
    const e = axis === 'x' ? elevX : elevZ, s = out;          // s: +1 when the outside is the + side of pos
    e(rings.map(r => r), pos - 45, pos + 45, col.frame, 'Window frames', holes);
    e(rings, pos - 6, pos + 6, col.glass, 'Glass');
    if (trim.length) e(trim, s > 0 ? pos + t / 2 : pos - t / 2 - 22, s > 0 ? pos + t / 2 + 22 : pos - t / 2, col.trim, 'Window trim', trimH);
  }
  const win = (c, w, sill = 900, head = 2200) => ({ c, w, sill, head });
  const door = (c, w, head = 2100, glass = false) => ({ c, w, sill: -1e9, head, glass });

  // exterior walls: front and back run the full width, the ends sit between them and carry the gables
  const roofUnder = z => H + (5000 - Math.abs(z)) * P;           // underside of the main roof over the wall's outer face
  const opsFront = [win(-6400, 1600), win(-1400, 1400), door(2200, 1000, 2200), win(2950, 360, 300, 2200), win(4700, 2400, 600), win(6900, 1000)];
  const opsBack = [win(-5700, 1800), win(-1800, 900, 1400), door(1600, 2400, 2200, true), win(4800, 1600, 1050)];
  const opsWest = [win(-2700, 1400), win(0, 700, 1000), win(3800, 1200)];
  const opsEast = [door(-800, 900, 2100), win(-3700, 900, 1000)];
  wall('x', 4900, -8000, 8000, TX, 0, H, opsFront, null, col.siding, 'Front wall');
  wall('x', -4900, -8000, 8000, TX, 0, H, opsBack, null, col.siding, 'Back wall');
  const gab = [[4800, roofUnder(4800) + 100], [0, roofUnder(0) + 100], [-4800, roofUnder(4800) + 100]];
  wall('z', -7900, -4800, 4800, TX, 0, H, opsWest, gab, col.siding, 'West wall');
  wall('z', 7900, -4800, 4800, TX, 0, H, opsEast, gab, col.siding, 'East wall');
  // gables reach up under the roof slab: extend the end walls' top edge along the slope
  // (the polygon above goes a0,top → apex → a1,top; the apex is the ridge)

  // garage: front and back carry the gables of its own roof (ridge running front to back)
  const GX0 = 8000, GX1 = 14200, GZ0 = -2000, GZ1 = 5000, GB = 0, GC = (GX0 + GX1) / 2, GH = H + (GX1 - GX0) / 2 * P;
  const opsGFront = [door(GC, 4800, 2300, false)];
  wall('x', GZ1 - TX / 2, GX0, GX1, TX, GB, H, opsGFront, [[GC, GH + 100]], col.siding, 'Garage front wall');
  wall('x', GZ0 + TX / 2, GX0, GX1, TX, GB, H, [door(12900, 900, 2100)], [[GC, GH + 100]], col.siding, 'Garage back wall');
  wall('z', GX1 - TX / 2, GZ0 + TX, GZ1 - TX, TX, GB, H, [win(1500, 1200, 1100, 2100)], null, col.siding, 'Garage side wall');

  // interior partitions
  const iw = (axis, pos, a0, a1, ops, nm) => wall(axis, pos, a0, a1, TI, 0, H, ops, null, col.iwall, nm);
  iw('x', -600, -7800, 0, [door(-4500, 900), door(-800, 700)], 'Hall wall (back)');
  iw('x', 600, -7800, 0, [door(-5600, 900), door(-3800, 800), door(-1400, 900)], 'Hall wall (front)');
  iw('z', 0, -4800, -650, [], 'Bath / dining wall');
  iw('z', 0, 650, 4800, [], 'Bedroom 3 / living wall');
  iw('z', -3600, -4800, -650, [door(-1500, 800)], 'Master bedroom wall');
  iw('x', -2400, -3550, -50, [door(-2600, 800)], 'Master bath wall');
  iw('z', -1600, -2350, -650, [], 'Closet wall');
  iw('z', -4800, 650, 4800, [], 'Bedroom 2 wall');
  iw('z', -2800, 650, 4800, [door(3900, 700)], 'Bath 2 / bedroom 3 wall');
  iw('x', 3000, -4750, -2850, [], 'Bath 2 back wall');
  iw('z', 6400, -4800, 600, [door(-3400, 800), door(0, 900)], 'Kitchen wall');
  iw('x', -2400, 6450, 7800, [], 'Pantry wall');
  iw('x', 600, 6450, 7800, [], 'Mudroom wall');
  iw('x', 3800, 50, 1200, [], 'Coat closet wall');
  iw('z', 1200, 3850, 4800, [door(4300, 700)], 'Coat closet side');

  // ════ Openings: frames, glass and trim ════
  glaze('x', 4900, TX, 1, opsFront);
  glaze('x', -4900, TX, -1, opsBack);
  glaze('z', -7900, TX, -1, opsWest);   // side walls: along-axis coordinate is z, outside is −x / +x
  glaze('z', 7900, TX, 1, opsEast.filter(o => o.sill > 0));
  glaze('z', GX1 - TX / 2, TX, 1, [win(1500, 1200, 1100, 2100)]);

  // ════ Slabs and floors ════
  box(-8000, 8000, -400, 0, -5000, 5000, col.found, 'Foundation');
  box(GX0, GX1, -400, GB, GZ0, GZ1, col.found, 'Garage slab');
  box(-7800, 7800, 0, 15, -4800, 4800, col.oak, 'Oak floor');
  box(-3550, -50, 15, 25, -4800, -2450, col.tile, 'Master bath tile');
  box(-4750, -2850, 15, 25, 650, 2950, col.tile, 'Bath 2 tile');
  box(6450, 7800, 15, 25, -2350, 550, col.tile, 'Mudroom tile');

  // ════ Roofs ════
  // main roof: a chevron slab drawn on the west gable, run east to the garage
  const eave = 5500, yE = roofUnder(eave), yR = roofUnder(0);
  const mainRoof = elevZ([[eave, yE], [0, yR], [-eave, yE], [-eave, yE + RT], [0, yR + RT], [eave, yE + RT]], -8500, 8000, col.roof, 'Main roof');
  hide.push(mainRoof);
  // fascia boards along both eaves and the rakes
  for (const s of [1, -1]) fasc(box(-8500, 8000, yE - 120, yE + RT, s > 0 ? eave : -eave - 40, s > 0 ? eave + 40 : -eave, col.trim, 'Fascia'));
  // garage roof: chevron on the front plane, butting the house's east wall on the west side
  const gE = GX1 + 450, gUnder = x => H + ((GX1 - GX0) / 2 - Math.abs(x - GC)) * P;
  const garRoof = elevX([[GX0, gUnder(GX0)], [GC, gUnder(GC)], [gE, gUnder(gE)], [gE, gUnder(gE) + RT], [GC, gUnder(GC) + RT], [GX0, gUnder(GX0) + RT]], GZ0 - 450, GZ1 + 450, col.roof, 'Garage roof');
  hide.push(garRoof);
  fasc(box(gE, gE + 40, gUnder(gE) - 120, gUnder(gE) + RT, GZ0 - 450, GZ1 + 450, col.trim, 'Fascia'));
  // chimney through the roof near the east gable (fireplace inside, facing the living room)
  box(7100, 7800, 0, 6300, 1900, 3100, col.brick, 'Chimney');
  box(7040, 7900, 6300, 6420, 1840, 3160, col.found, 'Chimney cap');
  box(7050, 7100, 300, 1100, 2150, 2850, col.dark, 'Firebox');
  box(6700, 7100, 15, 300, 1800, 3200, col.found, 'Hearth');
  box(7000, 7100, 1350, 1450, 1850, 3150, col.wood, 'Mantel');

  // ════ Front porch: slab, posts, beam, pediment and its own gable roof ════
  const PX0 = 200, PX1 = 4200, PC = (PX0 + PX1) / 2, PZ = 7000;
  box(PX0, PX1, -400, 0, 5000, PZ, col.found, 'Porch slab');
  box(PC - 700, PC + 700, -400, -125, PZ, PZ + 300, col.found, 'Porch step');
  for (const x of [PX0 + 150, PX1 - 150]) { box(x - 100, x + 100, 0, 2500, PZ - 300, PZ - 100, col.trim, 'Porch post'); box(x - 140, x + 140, 0, 180, PZ - 340, PZ - 60, col.trim, 'Post base'); }
  box(PX0, PX1, 2500, H, PZ - 320, PZ - 80, col.trim, 'Porch beam');
  const pUnder = x => H + ((PX1 - PX0) / 2 + 100 - Math.abs(x - PC)) * P, pE0 = PX0 - 300, pE1 = PX1 + 300;
  elevX([[PX0 - 100, H], [PX1 + 100, H], [PC, pUnder(PC)]], PZ - 320, PZ - 200, col.siding, 'Porch pediment');
  const porchRoof = elevX([[pE0, pUnder(pE0)], [PC, pUnder(PC)], [pE1, pUnder(pE1)], [pE1, pUnder(pE1) + RT], [PC, pUnder(PC) + RT], [pE0, pUnder(pE0) + RT]], 2800, PZ + 150, col.roof, 'Porch roof');
  hide.push(porchRoof);
  // front door leaf with a narrow lite, and its hardware
  elevX([[1720, 15], [2680, 15], [2680, 2185], [1720, 2185]], 4855, 4905, col.door, 'Front door', [rect(1950, 1300, 2450, 2000)]);
  elevX([rect(1950, 1300, 2450, 2000)], 4872, 4888, col.glass, 'Door glass');
  box(2560, 2600, 960, 1040, 4905, 4960, col.steel, 'Door handle');
  // porch light and house number plate
  box(1350, 1470, 1650, 1950, 5000, 5100, col.dark, 'Porch light');

  // ════ Garage door: raised panels ════
  const gd0 = GC - 2400, gd1 = GC + 2400;
  box(gd0, gd1, GB, 2300, GZ1 - 150, GZ1 - 110, col.white, 'Garage door');
  const panels = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) { const x = gd0 + 80 + c * 580, y = GB + 110 + r * 590; panels.push(rect(x, y, x + 500, y + 480)); }
  elevX(panels, GZ1 - 110, GZ1 - 95, col.white, 'Garage door panels');
  box(gd0 - 120, gd1 + 120, 2300, 2420, GZ1, GZ1 + 22, col.trim, 'Garage door trim');

  // ════ Back deck ════
  const DX0 = 200, DX1 = 6000, DZ = -8200;
  box(DX0, DX1, -150, 0, DZ, -5000, col.deck, 'Deck');
  for (const x of [DX0 + 50, (DX0 + DX1) / 2, DX1 - 50]) for (const z of [DZ + 50, -6600]) cylY(x, z, 90, -350, -150, col.wood, 'Deck post');
  const rail = (x0, x1, z0, z1) => { box(x0, x1, 950, 1000, z0, z1, col.white, 'Deck rail'); };
  rail(DX0, DX0 + 60, DZ, -5000); rail(DX1 - 60, DX1, DZ, -5000); rail(DX0, 2400, DZ, DZ + 60); rail(3800, DX1, DZ, DZ + 60);
  const bal = [];
  for (let z = DZ + 150; z < -5100; z += 300) for (const x of [DX0 + 30, DX1 - 30]) bal.push(rect(x - 20, z - 20, x + 20, z + 20));
  for (let x = DX0 + 150; x < DX1 - 100; x += 300) if (x < 2400 || x > 3800) bal.push(rect(x - 20, DZ + 10, x + 20, DZ + 50));
  plan(bal, 0, 950, col.white, 'Balusters');
  box(2400, 3800, -250, -75, DZ - 320, DZ, col.deck, 'Deck step');
  // outdoor table and grill
  cylY(1800, -6800, 550, 700, 740, col.dark, 'Patio table'); cylY(1800, -6800, 40, 0, 700, col.dark, 'Table stem');
  for (const a of [0, 1, 2, 3]) { const x = 1800 + Math.cos(a * Math.PI / 2 + 0.6) * 850, z = -6800 + Math.sin(a * Math.PI / 2 + 0.6) * 850; box(x - 230, x + 230, 0, 450, z - 230, z + 230, col.dark, 'Patio chair', 60); }
  box(4700, 5500, 0, 900, -7600, -7000, col.dark, 'Grill'); box(4750, 5450, 900, 1150, -7550, -7050, col.steel, 'Grill lid', 120);

  // ════ Furniture ════
  // beds: frame, mattress, duvet, pillows, headboard. (x0, z0) is the head end corner; dir: which way the bed runs from the head
  function bed(xh, zc, w, len, dir, nm) {
    // dir: +1 runs toward +x, −1 toward −x (head against a wall running along z)
    const xa = dir > 0 ? xh : xh - len, xb = dir > 0 ? xh + len : xh, xHead = dir > 0 ? xh : xh;
    box(xa, xb, 15, 330, zc - w / 2, zc + w / 2, col.wood, nm + ' frame');
    box(xa + 20, xb - 20, 330, 560, zc - w / 2 + 20, zc + w / 2 - 20, col.linen, nm + ' mattress', 60);
    const dz = dir > 0 ? [xh + len * 0.3, xb + 30] : [xa - 30, xh - len * 0.3];
    box(dz[0], dz[1], 300, 600, zc - w / 2 - 20, zc + w / 2 + 20, col.accent, nm + ' duvet', 40);
    const px = dir > 0 ? [xh + 70, xh + 470] : [xh - 470, xh - 70];
    for (const s of w > 1500 ? [-1, 1] : [0]) { const c = zc + s * w / 4; box(px[0], px[1], 560, 700, c - (w > 1500 ? w / 4 - 60 : w / 2 - 120), c + (w > 1500 ? w / 4 - 60 : w / 2 - 120), col.white, nm + ' pillow', 70); }
    box(dir > 0 ? xh : xh - 60, dir > 0 ? xh + 60 : xh, 15, 1250, zc - w / 2 - 40, zc + w / 2 + 40, col.wood, nm + ' headboard');
  }
  // master: head against the master-bedroom wall (x = −3650), running west
  bed(-3650, -2600, 1930, 2030, -1, 'King bed');
  for (const z of [-3900, -1300]) { box(-4150, -3650, 15, 550, z - 250, z + 250, col.wood, 'Nightstand'); cylY(-3900, z, 90, 550, 850, col.linen, 'Lamp'); }
  box(-7300, -5700, 15, 850, -1150, -650, col.wood, 'Dresser');
  box(-7750, -7650, 15, 1000, -4700, -3900, col.dark, 'Mirror'); // tall mirror
  box(-7700, -6300, 15, 25, -3800, -1400, col.fabric, 'Rug');
  // bedroom 2: head against the west wall
  bed(-7800, 1800, 1530, 2030, 1, 'Queen bed');
  box(-7750, -7300, 15, 550, 2650, 3100, col.wood, 'Nightstand');
  box(-6200, -5000, 15, 750, 4250, 4750, col.wood, 'Desk'); box(-5850, -5350, 15, 850, 3650, 4150, col.dark, 'Desk chair', 80);
  // bedroom 3: head against the partition at x = −2800? no — against the front wall, running back
  box(-2700, -1650, 15, 330, 2600, 4750, col.wood, 'Twin bed frame');
  box(-2680, -1670, 330, 560, 2620, 4730, col.linen, 'Twin mattress', 60);
  box(-2710, -1640, 300, 600, 2500, 3900, col.cab, 'Twin duvet', 40);
  box(-2600, -1750, 560, 700, 4300, 4650, col.white, 'Twin pillow', 70);
  box(-900, -100, 15, 1800, 700, 1100, col.wood, 'Bookshelf');
  // bathrooms: tub, toilet, vanity
  function toilet(x, z, face, nm) {   // face: direction the bowl points (+x / −x / +z / −z as [dx, dz])
    const [dx, dz] = face, t = (a, b) => [x + dx * a - dz * b, z + dz * a + dx * b];
    const tank = [t(0, -240), t(200, -240), t(200, 240), t(0, 240)];
    plan(tank, 15, 800, col.white, nm + ' tank', 30);
    const bowl = arcPts(0, 0, 1, -Math.PI / 2, Math.PI / 2, 16).map(([a, b]) => t(200 + 480 * a, 190 * b));
    plan([t(200, -190), ...bowl, t(200, 190)], 15, 420, col.white, nm + ' bowl');
  }
  box(-3550, -1850, 15, 560, -4800, -4050, col.white, 'Bathtub');
  box(-3450, -1950, 300, 570, -4720, -4130, col.glass, 'Bath water', 150);
  box(-600, -50, 15, 850, -4300, -2900, col.cab, 'Double vanity'); box(-620, -50, 850, 890, -4320, -2880, col.counter, 'Vanity top');
  for (const z of [-3950, -3250]) cylY(-330, z, 170, 860, 895, col.white, 'Sink');
  box(-80, -50, 1100, 1900, -4200, -3000, col.glass, 'Vanity mirror');
  toilet(-3550, -3300, [1, 0], 'Toilet');
  box(-4750, -3050, 15, 560, 2200, 2950, col.white, 'Tub'); box(-4650, -3150, 300, 570, 2280, 2870, col.glass, 'Tub water', 150);
  box(-4750, -4200, 15, 850, 800, 1600, col.cab, 'Vanity'); box(-4750, -4180, 850, 890, 780, 1620, col.counter, 'Vanity top'); cylY(-4480, 1200, 160, 860, 895, col.white, 'Sink');
  toilet(-2850, 1300, [-1, 0], 'Toilet');
  // closets
  box(-3500, -1700, 1650, 1680, -2330, -2000, col.wood, 'Closet shelf'); box(-3500, -3200, 15, 1400, -1400, -700, col.wood, 'Shoe rack');
  box(-1550, -60, 15, 2000, -2340, -1950, col.white, 'Linen shelves');
  box(-4700, -2900, 1650, 1680, 4400, 4750, col.wood, 'Closet shelf');
  // living room: sofa facing the fireplace, armchairs, coffee table, rug, TV over the mantel
  box(2900, 6500, 15, 25, 1100, 3900, col.linen, 'Living rug');
  box(3000, 3900, 15, 420, 1300, 3700, col.fabric, 'Sofa', 60);
  box(3000, 3200, 15, 850, 1300, 3700, col.fabric, 'Sofa back', 60);
  box(3000, 3900, 15, 650, 1100, 1300, col.fabric, 'Sofa arm', 60); box(3000, 3900, 15, 650, 3700, 3900, col.fabric, 'Sofa arm', 60);
  box(4300, 5500, 15, 420, 2100, 2900, col.wood, 'Coffee table', 80);
  box(4500, 5300, 15, 420, 700, 1500, col.accent, 'Armchair', 120); box(4500, 5300, 15, 850, 700, 900, col.accent, 'Armchair back', 60);
  box(4500, 5300, 15, 420, 3500, 4300, col.accent, 'Armchair', 120); box(4500, 5300, 15, 850, 4100, 4300, col.accent, 'Armchair back', 60);
  box(7050, 7100, 1650, 2400, 2000, 3000, col.dark, 'TV');
  box(6000, 6350, 15, 700, 4200, 4750, col.wood, 'Side table'); cylY(6175, 4475, 120, 700, 1300, col.linen, 'Table lamp');
  // plant by the window
  cylY(800, 4300, 220, 15, 450, col.brick, 'Planter'); revY(800, 4300, [[0, 450], [380, 900], [0, 1600]], col.leaf, 'Plant');
  // dining: table and six chairs, pendant
  box(700, 2500, 720, 760, -2700, -1700, col.wood, 'Dining table'); for (const [x, z] of [[800, -2600], [2400, -2600], [800, -1800], [2400, -1800]]) box(x - 40, x + 40, 15, 720, z - 40, z + 40, col.wood, 'Table leg');
  for (const x of [1000, 1600, 2200]) { box(x - 230, x + 230, 15, 460, -3230, -2770, col.dark, 'Dining chair'); box(x - 230, x + 230, 460, 950, -3230, -3170, col.dark, 'Chair back'); box(x - 230, x + 230, 15, 460, -1630, -1170, col.dark, 'Dining chair'); box(x - 230, x + 230, 460, 950, -1230, -1170, col.dark, 'Chair back'); }
  cylY(1600, -2200, 250, 1800, 2000, col.dark, 'Pendant'); cylY(1600, -2200, 10, 2000, H, col.dark, 'Pendant cord');
  // kitchen: counter run under the window, uppers, range, fridge, island with stools
  box(3050, 6350, 15, 870, -4800, -4200, col.cab, 'Base cabinets');
  box(3030, 6350, 870, 910, -4800, -4170, col.counter, 'Countertop');
  box(4400, 5200, 830, 911, -4700, -4300, col.steel, 'Sink basin');
  box(3300, 4000, 911, 925, -4750, -4250, col.dark, 'Cooktop');
  box(5550, 6350, 1500, 2300, -4800, -4450, col.cab, 'Upper cabinets');
  box(3250, 4050, 1700, 2300, -4800, -4300, col.steel, 'Range hood');
  box(5550, 6350, 15, 2000, -2300, -1450, col.steel, 'Fridge');
  box(3800, 5600, 15, 870, -2700, -1800, col.cab, 'Island'); box(3750, 5650, 870, 910, -2800, -1600, col.counter, 'Island top');
  for (const x of [4100, 4700, 5300]) { cylY(x, -1350, 180, 700, 760, col.dark, 'Stool'); cylY(x, -1350, 30, 15, 700, col.steel, 'Stool post'); }
  // pantry shelves, laundry, mudroom bench
  box(6450, 7800, 15, 2000, -4800, -4450, col.white, 'Pantry shelves'); box(7450, 7800, 15, 2000, -4450, -2450, col.white, 'Pantry shelves');
  box(6500, 7130, 15, 900, -2350, -1700, col.white, 'Washer'); box(7150, 7780, 15, 900, -2350, -1700, col.white, 'Dryer');
  for (const x of [6815, 7465]) cylZ(x, 600, 190, -1700, -1680, col.dark, 'Porthole');
  box(6450, 6900, 15, 450, -200, 500, col.wood, 'Mudroom bench');
  // coat closet rod shelf
  box(80, 1150, 1650, 1680, 3850, 4780, col.wood, 'Coat shelf');

  // ════ Garage contents: a car and a workbench ════
  const carX = GC - 400, cz0 = -900, cz1 = 3800, cw = 1850;
  const carSide = [[cz1, 250], [cz1, 700], [cz1 - 150, 850], [cz1 - 1100, 950], [cz1 - 1750, 1420], [cz0 + 1350, 1450], [cz0 + 250, 1000], [cz0, 900], [cz0, 250]];
  elevZ(carSide, carX - cw / 2, carX + cw / 2, '#b33a3a', 'Car body', [], 80);
  const glassSide = [[cz1 - 1150, 990], [cz1 - 1720, 1380], [cz0 + 1380, 1400], [cz0 + 480, 1010]];
  elevZ(glassSide, carX - cw / 2 + 30, carX + cw / 2 - 30, col.dark, 'Car windows');
  for (const z of [cz1 - 700, cz0 + 750]) cylX(z, 330, 330, carX - cw / 2 - 20, carX + cw / 2 + 20, col.dark, 'Tire');
  for (const z of [cz1 - 700, cz0 + 750]) for (const s of [-1, 1]) cylX(z, 330, 190, s < 0 ? carX - cw / 2 - 40 : carX + cw / 2 + 20, s < 0 ? carX - cw / 2 - 20 : carX + cw / 2 + 40, col.steel, 'Wheel');
  for (const s of [-1, 1]) box(carX + s * 650 - 180, carX + s * 650 + 180, 560, 680, cz1, cz1 + 15, col.linen, 'Headlight');
  box(GX0 + 300, GX0 + 2400, GB, 900, GZ0 + 200, GZ0 + 800, col.wood, 'Workbench'); box(GX0 + 300, GX0 + 2400, 1300, 2100, GZ0 + 200, GZ0 + 230, '#7a8b8f', 'Pegboard');
  box(GX1 - 800, GX1 - 200, GB, 1900, GZ0 + 300, GZ0 + 800, '#7a8b8f', 'Storage shelf');

  // ════ The lot: lawn, driveway, walk, street, trees and shrubs ════
  box(-19000, 21000, -700, -250, -17000, 16000, col.lawn, 'Lawn');
  box(GX0 + 200, GX1 - 200, -250, -120, GZ1, 16000, col.drive, 'Driveway');
  box(GX0 + 200, GX1 - 200, -400, -110, GZ1 - 5, GZ1 + 600, col.drive, 'Apron');
  box(-19000, 21000, -760, -300, 16000, 17600, col.drive, 'Sidewalk');
  box(-19000, 21000, -900, -420, 17600, 26000, col.road, 'Street');
  const dash = []; for (let x = -18000; x < 20000; x += 3000) dash.push(rect(x, -21900, x + 1500, -21700));
  prism(K.GROUND(-420), dash, [], 8, 'one', '#e8d27a', 'Lane markings');
  const pavers = []; for (let z = PZ + 450, i = 0; z < 15800; z += 650, i++) { const o = (i % 2 ? 60 : -60); pavers.push(rect(PC - 450 + o, -(z + 500), PC + 450 + o, -z)); }
  prism(K.GROUND(-250), pavers, [], 30, 'one', col.stone, 'Stepping stones');
  const tree = (x, z, h, r) => { cylY(x, z, r * 0.1, -250, h * 0.45, col.trunk, 'Trunk'); revY(x, z, [[0, h * 0.3], [r, h * 0.36], [r * 0.95, h * 0.62], [r * 0.6, h * 0.85], [0, h]], col.leaf, 'Tree canopy'); };
  const pine = (x, z, h, r) => { cylY(x, z, r * 0.12, -250, h * 0.3, col.trunk, 'Trunk'); revY(x, z, [[0, h * 0.2], [r, h * 0.25], [0, h * 0.7]], col.pine, 'Pine'); revY(x, z, [[0, h * 0.5], [r * 0.7, h * 0.55], [0, h]], col.pine, 'Pine top'); };
  tree(-12000, 9000, 8500, 3200); tree(17500, 11000, 7500, 2800); tree(-4500, -13000, 9000, 3400);
  pine(-15000, -6000, 10000, 2200); pine(-16500, 1500, 8500, 1900); pine(16500, -9000, 9500, 2100);
  const shrubs = [[-7000, 5800], [-5600, 5850], [-4200, 5800], [-2800, 5850], [-1300, 5800], [5200, 5800], [6600, 5850], [7600, 5800]];
  for (const [x, z] of shrubs) revY(x, z, [[0, -250], ...arcPts(0, 200, 520, -Math.PI / 2 + 0.5, Math.PI / 2, 6).map(([a, b]) => [a, b])], col.bush, 'Shrub');
  box(-8000, -500, -250, -170, 5250, 6400, '#5a4332', 'Mulch bed'); box(4300, 8000, -250, -170, 5250, 6400, '#5a4332', 'Mulch bed');
  // mailbox at the curb
  box(GX0 - 900, GX0 - 820, -250, 1000, 15500, 15580, col.wood, 'Mailbox post'); box(GX0 - 1000, GX0 - 720, 1000, 1220, 15250, 15700, col.dark, 'Mailbox', 100);

  const d = K.doc();
  d.hidden = {};
  if (opts.roofOff) for (const f of hide) d.hidden[f.id] = true;
  return d;
}
