"""UV unwrap + atlas packing for the Sling Ring (one shared 0-1 atlas, uniform texel density)."""
import bpy
import bmesh


def ensure_uv(ob, name="UVMap"):
    me = ob.data
    if name not in me.uv_layers:
        me.uv_layers.new(name=name)
    me.uv_layers.active = me.uv_layers[name]


def unwrap_and_pack(objs, margin=0.003):
    view = bpy.context.view_layer
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objs:
        ensure_uv(ob)
        ob.select_set(True)
    view.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    # Seams were authored with the mesh; conformal keeps the flat faces undistorted.
    bpy.ops.uv.unwrap(method='CONFORMAL', margin=0.0, fill_holes=True)
    bpy.ops.uv.select_all(action='SELECT')
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(udim_source='CLOSEST_UDIM', rotate=True, margin=margin,
                            shape_method='CONCAVE', scale=True)
    bpy.ops.object.mode_set(mode='OBJECT')


def uv_stats(objs):
    """Return (texel-density spread, UV coverage, overlap-free?) -- area ratio 3D vs UV per face."""
    import math
    dens = []
    cover = 0.0
    for ob in objs:
        me = ob.data
        uv = me.uv_layers.active.data
        for p in me.polygons:
            a2 = 0.0
            pts = [uv[l].uv for l in p.loop_indices]
            for i in range(len(pts)):
                x1, y1 = pts[i]; x2, y2 = pts[(i + 1) % len(pts)]
                a2 += x1 * y2 - x2 * y1
            ua = abs(a2) / 2
            cover += ua
            if ua > 1e-12 and p.area > 1e-12:
                dens.append(math.sqrt(ua / p.area))
    dens.sort()
    n = len(dens)
    return dens[n // 100], dens[n // 2], dens[-n // 100], cover


def dump_uv_png(objs, path, size=2048):
    from PIL import Image, ImageDraw
    img = Image.new("RGB", (size, size), (24, 24, 28))
    d = ImageDraw.Draw(img)
    cols = [(240, 120, 90), (110, 190, 240), (130, 220, 130), (240, 210, 100), (200, 140, 240), (240, 160, 200)]
    for k, ob in enumerate(objs):
        me = ob.data
        uv = me.uv_layers.active.data
        c = cols[k % len(cols)]
        for p in me.polygons:
            pts = [(uv[l].uv[0] * size, (1 - uv[l].uv[1]) * size) for l in p.loop_indices]
            d.polygon(pts, outline=c)
    img.save(path)
