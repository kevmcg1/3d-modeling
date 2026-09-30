"""
Doctor Strange's Sling Ring - geometry.

Every part is built as a clean, all-quad, closed (manifold) mesh with deliberate edge flow:

  * Hoops and finger band  -> lathe/sweep of a hand-authored, filleted cross-section profile.
                              Loops run around the ring, every fillet carries its own support loops,
                              and notches are cut by moving existing vertices (topology never changes).
  * Spokes, mount, studs   -> "rounded boxes": a subdivided cube projected onto a rounded-box surface,
                              so corners are proper 3-edge quad poles (no triangles, no n-gons).

Units are metres (1 Blender unit = 1 m); dimensions below are written in millimetres.
World: Z up. The hoop stands in the XZ plane facing -Y, the finger band hangs below it with its
axis along X, so the ring reads correctly from the front and the finger passes through the band.
"""
import math
import bmesh
import bpy
from mathutils import Vector, Matrix

MM = 0.001

# ─────────────────────────────── dimensions (mm) ────────────────────────────────
OUTER_R0, OUTER_R1 = 31.0, 38.5         # outer hoop inner / outer radius
INNER_R0, INNER_R1 = 17.5, 22.5         # inner hoop
BAND_R0, BAND_R1 = 9.6, 12.0            # finger band (bore 19.2 mm = US size ~9)
BAND_HALF_W = 5.5
BAND_Z = -(OUTER_R1 + BAND_R1)          # band axis height: band just touches the hoop's underside
SPOKES = 8
SPOKE_PHASE = 22.5                      # degrees; keeps the mount directly below a gap, not a spoke
SHARP_ANGLE = math.radians(38)

# ───────────────────────────── small math helpers ───────────────────────────────

def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def fillet_profile(pts, radii, labels):
    """Round the corners of a closed 2D polygon.

    pts    : [(a, b)] closed polygon
    radii  : fillet radius per vertex (0 keeps the corner sharp)
    labels : UV-island label per polygon *edge* i (pts[i] -> pts[i+1])
    Returns (points, edge_labels); edge_labels[k] belongs to the edge points[k] -> points[k+1].
    """
    n = len(pts)
    out, out_lab = [], []
    for i in range(n):
        cur = Vector(pts[i])
        prv, nxt = Vector(pts[i - 1]), Vector(pts[(i + 1) % n])
        r = radii[i]
        lab_in, lab_out = labels[i - 1], labels[i]
        if r <= 0:
            out.append(cur)
            out_lab.append(lab_out)
            continue
        u, v = (prv - cur), (nxt - cur)
        lu, lv = u.length, v.length
        u.normalize(); v.normalize()
        ang = math.acos(max(-1.0, min(1.0, u.dot(v))))
        t = r / math.tan(ang / 2)
        tmax = 0.5 * min(lu, lv) if radii[i - 1] > 0 or radii[(i + 1) % n] > 0 else min(lu, lv)
        if t > tmax:                       # shrink the fillet rather than overlap a neighbour
            t = tmax
            r = t * math.tan(ang / 2)
        a_pt, b_pt = cur + u * t, cur + v * t
        c = cur + (u + v).normalized() * (r / math.sin(ang / 2))
        a0 = math.atan2(a_pt.y - c.y, a_pt.x - c.x)
        a1 = math.atan2(b_pt.y - c.y, b_pt.x - c.x)
        d = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
        segs = 4 if r >= 0.45 else 3 if r >= 0.2 else 2
        arc_lab = lab_in if lab_in in ("front", "back") else lab_out
        for k in range(segs + 1):
            a = a0 + d * k / segs
            out.append(Vector((c.x + r * math.cos(a), c.y + r * math.sin(a))))
            out_lab.append(arc_lab if k < segs else lab_out)
    return [(p.x, p.y) for p in out], out_lab


def theta_pattern(count, fracs, depths):
    """Angles (radians) and notch depth (0..1) for `count` repeats of a per-period pattern."""
    th, dp = [], []
    for k in range(count):
        for f, d in zip(fracs, depths):
            th.append(2 * math.pi * (k + f) / count)
            dp.append(d)
    return th, dp


def even_theta(n):
    return [2 * math.pi * i / n for i in range(n)], [0.0] * n


# ─────────────────────────────── ring sweeps ────────────────────────────────────

def sweep_ring(name, prof, labels, thetas, depth, weight, place):
    """Lathe a closed profile around an axis -> torus-topology quad mesh.

    prof   : [(radius, axial)]  profile points (mm)
    labels : per-profile-edge island label (for UV seams)
    thetas : sample angles; depth[i] is the notch depth factor at thetas[i]
    weight : per-profile-point signed radial displacement (mm) applied x depth[i]
    place  : fn(rho_mm, axial_mm, theta) -> Vector (metres), local to the object origin
    """
    nt, npf = len(thetas), len(prof)
    bm = bmesh.new()
    grid = [[None] * npf for _ in range(nt)]
    for i, th in enumerate(thetas):
        for j, (r, h) in enumerate(prof):
            rho = r + depth[i] * weight[j]
            grid[i][j] = bm.verts.new(place(rho, h, th))
    bm.verts.ensure_lookup_table()
    for i in range(nt):
        i2 = (i + 1) % nt
        for j in range(npf):
            j2 = (j + 1) % npf
            bm.faces.new((grid[i][j], grid[i2][j], grid[i2][j2], grid[i][j2]))
    # UV seams: island boundaries at label changes, plus one radial cut through wall strips.
    for j in range(npf):
        if labels[j - 1] != labels[j]:
            for i in range(nt):
                e = bm.edges.get((grid[i][j], grid[(i + 1) % nt][j]))
                if e: e.seam = True
    for j in range(npf):                       # wall strips are cut into four quarter-strips so they pack tightly
        if labels[j] in ("outer", "inner"):
            for i in (0, nt // 4, nt // 2, 3 * nt // 4):
                e = bm.edges.get((grid[i][j], grid[i][(j + 1) % npf]))
                if e: e.seam = True
    return finish(bm, name)


# ──────────────────────────────── rounded boxes ─────────────────────────────────

def _axis_nodes(h, r, flats, m):
    """Lattice coordinates along one axis of a rounded box (half extent h, corner radius r)."""
    t = [math.tan(math.radians(45.0 * k / m)) for k in range(1, m + 1)]   # t[-1] == 1
    hi = h - r
    pos = [hi + r * tk for tk in t[:-1]] + [h]
    inner = [-hi + 2 * hi * k / (flats + 1) for k in range(flats + 2)] if hi > 1e-9 else [0.0]
    neg = [-p for p in reversed(pos)]
    return neg + inner + pos


def rounded_box(name, half, radius, flats=(1, 1, 1), arc=3, extra=None, warp=None):
    """Quad rounded box. half = (hx, hy, hz), radius = corner radius, flats = interior loops per axis,
    arc = segments per 45 degrees of corner (total 2*arc per corner), extra = optional dict axis-> node list."""
    hx, hy, hz = half
    ax = [_axis_nodes(hx, radius, flats[0], arc), _axis_nodes(hy, radius, flats[1], arc),
          _axis_nodes(hz, radius, flats[2], arc)]
    if extra:
        for k, v in extra.items():
            ax[k] = sorted(set(ax[k]) | set(v))
    n = [len(a) for a in ax]
    bm = bmesh.new()
    vm = {}

    def vert(i, j, k):
        key = (i, j, k)
        if key not in vm:
            q = Vector((ax[0][i], ax[1][j], ax[2][k]))
            c = Vector((max(-(hx - radius), min(hx - radius, q.x)),
                        max(-(hy - radius), min(hy - radius, q.y)),
                        max(-(hz - radius), min(hz - radius, q.z))))
            d = q - c
            p = c + d.normalized() * radius if d.length > 1e-12 else q
            if warp:
                p = warp(p)
            vm[key] = bm.verts.new(p)
        return vm[key]

    for a in range(3):                          # the two faces perpendicular to each axis
        b, c = [x for x in range(3) if x != a]
        for end in (0, n[a] - 1):
            for ib in range(n[b] - 1):
                for ic in range(n[c] - 1):
                    def idx(pb, pc):
                        t = [0, 0, 0]
                        t[a], t[b], t[c] = end, pb, pc
                        return vert(*t)
                    bm.faces.new((idx(ib, ic), idx(ib + 1, ic), idx(ib + 1, ic + 1), idx(ib, ic + 1)))
    # Cross-net UV seams: cut the four edges around the +Z "top" sides, and three edges of the -Z bottom.
    bm.verts.ensure_lookup_table()
    inv = {v: key for key, v in vm.items()}
    def ext(key, k):
        return 0 if key[k] == 0 else 1 if key[k] == n[k] - 1 else None
    for e in bm.edges:
        ka, kb = inv[e.verts[0]], inv[e.verts[1]]
        # an edge lies on a cube edge when two coordinates are at extremes for both ends
        ext_a = [ext(ka, k) for k in range(3)]
        ext_b = [ext(kb, k) for k in range(3)]
        shared = [k for k in range(3) if ext_a[k] is not None and ext_a[k] == ext_b[k]]
        if len(shared) != 2:
            continue
        free = [k for k in range(3) if k not in shared][0]
        s = {k: ext_a[k] for k in shared}
        if free == 2:                       # vertical edges between the four side faces
            e.seam = True
        elif 2 in s and s[2] == 0:          # bottom-face edges: keep the one toward -Y attached
            other = [k for k in shared if k != 2][0]
            if not (other == 1 and s[1] == 0):
                e.seam = True
    return finish(bm, name)


# ─────────────────────────────────── finishing ──────────────────────────────────

def finish(bm, name):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > SHARP_ANGLE:
            e.smooth = False
    for f in bm.faces:
        f.smooth = True
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    return ob


def transform_mesh(ob, matrix):
    ob.data.transform(matrix)
    ob.data.update()


def join_objects(name, objs):
    bm = bmesh.new()
    for ob in objs:
        bm.from_mesh(ob.data)
        bpy.data.objects.remove(ob)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return bpy.data.objects.new(name, me)


# ──────────────────────────────────── the parts ─────────────────────────────────

def make_outer_hoop():
    P = [(OUTER_R0, 2.2),
         (32.7, 2.2), (32.7, 1.9), (33.3, 1.9), (33.3, 2.2),
         (35.4, 2.2), (35.4, 3.1), (OUTER_R1, 3.1),
         (OUTER_R1, -3.1), (35.4, -3.1), (35.4, -2.2),
         (33.3, -2.2), (33.3, -1.9), (32.7, -1.9), (32.7, -2.2),
         (OUTER_R0, -2.2)]
    R = [0.5, 0.1, 0.1, 0.1, 0.1, 0.15, 0.3, 0.7, 0.7, 0.3, 0.15, 0.1, 0.1, 0.1, 0.1, 0.5]
    L = ["front"] * 7 + ["outer"] + ["back"] * 7 + ["inner"]
    prof, lab = fillet_profile(P, R, L)
    weight = [-0.7 * smoothstep(37.55, 38.5, r) for r, h in prof]      # notches cut into the outer rim
    th, dp = theta_pattern(24,
                           [0.0, 0.10, 0.20, 0.29, 0.31, 0.33, 0.50, 0.67, 0.69, 0.71, 0.80, 0.90],
                           [0, 0, 0, 0, 0.5, 1, 1, 1, 0.5, 0, 0, 0])
    place = lambda rho, h, t: Vector((rho * math.cos(t), h, rho * math.sin(t))) * MM
    return sweep_ring("SlingRing_Hoop_Outer", prof, lab, th, dp, weight, place)


def make_inner_hoop():
    P = [(INNER_R0, 1.5), (18.2, 2.2), (19.3, 2.2), (19.3, 1.9), (20.7, 1.9), (20.7, 2.2), (21.9, 2.2),
         (INNER_R1, 1.9), (INNER_R1, -1.9), (21.9, -2.2), (20.7, -2.2), (20.7, -1.9), (19.3, -1.9),
         (19.3, -2.2), (18.2, -2.2), (INNER_R0, -1.5)]
    R = [0.25, 0.35, 0.1, 0.1, 0.1, 0.1, 0.3, 0.2, 0.2, 0.3, 0.1, 0.1, 0.1, 0.1, 0.35, 0.25]
    L = ["front"] * 7 + ["outer"] + ["back"] * 7 + ["inner"]
    prof, lab = fillet_profile(P, R, L)
    weight = [0.4 * smoothstep(18.25, 17.5, r) for r, h in prof]       # grip teeth on the bore
    th, dp = theta_pattern(32, [0.0, 0.18, 0.36, 0.42, 0.50, 0.58, 0.64, 0.82], [0, 0, 0, 1, 1, 1, 0, 0])
    place = lambda rho, h, t: Vector((rho * math.cos(t), h, rho * math.sin(t))) * MM
    return sweep_ring("SlingRing_Hoop_Inner", prof, lab, th, dp, weight, place)


def make_band():
    P = [(BAND_R0, -BAND_HALF_W), (BAND_R0, BAND_HALF_W), (BAND_R1, BAND_HALF_W), (BAND_R1, 3.4),
         (11.6, 3.4), (11.6, -3.4), (BAND_R1, -3.4), (BAND_R1, -BAND_HALF_W)]
    R = [0.5, 0.5, 0.6, 0.15, 0.1, 0.1, 0.15, 0.6]
    L = ["inner", "front", "outer", "outer", "outer", "outer", "outer", "back"]
    prof, lab = fillet_profile(P, R, L)
    weight = [(-0.4 if (r < 11.72 and abs(h) < 3.45) else 0.0) for r, h in prof]
    th, dp = theta_pattern(10, [0.0, 0.17, 0.33, 0.35, 0.37, 0.50, 0.63, 0.65, 0.67, 0.83],
                           [0, 0, 0, 0.5, 1, 1, 1, 0.5, 0, 0])
    place = lambda rho, h, t: Vector((h, rho * math.cos(t), rho * math.sin(t))) * MM
    ob = sweep_ring("SlingRing_Band", prof, lab, th, dp, weight, place)
    ob.location = Vector((0, 0, BAND_Z * MM))
    return ob


def make_spokes():
    r0, r1 = INNER_R1 - 0.9, OUTER_R0 + 0.9         # ends tucked inside the hoops
    L = r1 - r0
    rc = 0.5 * (r0 + r1)

    def warp(p):                                     # hourglass taper: wide at the joints, slim in the middle
        s = abs(p.x) / (0.5 * L * 1.0)
        w = 1.0 - 0.42 * max(0.0, 1.0 - s * s) ** 1.2
        return Vector((p.x, p.y, p.z * w))

    parts = []
    for k in range(SPOKES):
        ang = math.radians(SPOKE_PHASE + 360.0 * k / SPOKES)
        ob = rounded_box("spoke", (0.5 * L, 1.4, 1.9), 0.55, flats=(6, 1, 1), arc=3, warp=warp)
        # local X = radial, Y = thickness, Z = tangential  ->  world XZ plane
        rot = Matrix.Rotation(-ang, 4, 'Y')
        ob.data.transform(Matrix.Translation((rc, 0, 0)))
        ob.data.transform(rot)
        ob.data.transform(Matrix.Scale(MM, 4))
        ob.data.update()
        parts.append(ob)
    return join_objects("SlingRing_Spokes", parts)


def make_mount():
    def warp(p):
        t = (p.z + 3.1) / 6.2                        # 0 at the band side, 1 at the hoop
        return Vector((p.x * (5.0 + 2.0 * t) / 6.0, p.y, p.z))

    ob = rounded_box("SlingRing_Mount", (6.0, 3.6, 3.1), 0.9, flats=(2, 1, 2), arc=3, warp=warp)
    ob.data.transform(Matrix.Translation((0, 0, -37.1)))
    ob.data.transform(Matrix.Scale(MM, 4))
    ob.data.update()
    return ob


def make_studs():
    parts = []
    def add(x, y, z, side):
        ob = rounded_box("stud", (1.0, 1.0, 1.0), 1.0, flats=(0, 0, 0), arc=4,
                         warp=lambda p: Vector((p.x, p.y, p.z * 0.72)))
        rot = Matrix.Rotation(math.radians(-90), 4, 'X') if side > 0 else Matrix.Rotation(math.radians(90), 4, 'X')
        # local +Z (dome axis) -> world +/-Y
        ob.data.transform(rot)
        ob.data.transform(Matrix.Translation((x, y, z)))
        ob.data.transform(Matrix.Scale(MM, 4))
        ob.data.update()
        parts.append(ob)
    r = 36.55
    for k in range(SPOKES):
        a = math.radians(SPOKE_PHASE + 360.0 * k / SPOKES)
        for side in (1, -1):
            add(r * math.cos(a), side * 3.1, r * math.sin(a), side)
    for side in (1, -1):                              # the two studs on the mount
        add(0.0, side * 3.6, -37.1, side)
    return join_objects("SlingRing_Studs", parts)
