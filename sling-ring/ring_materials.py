"""Procedural aged-bronze / polished-gold shaders and the bake-to-PBR-textures pipeline."""
import math
import bpy
import numpy as np


class NB:
    """Tiny node-building helper."""
    def __init__(self, mat):
        self.t = mat.node_tree
        self.t.nodes.clear()
        self.x = -1400
        self.y = 0

    def n(self, kind, **props):
        node = self.t.nodes.new(kind)
        for k, v in props.items():
            setattr(node, k, v)
        node.location = (self.x, self.y)
        self.y -= 160
        if self.y < -1600:
            self.y = 0; self.x += 260
        return node

    def link(self, out, inp):
        self.t.links.new(out, inp)

    def val(self, v):
        node = self.n('ShaderNodeValue'); node.outputs[0].default_value = v
        return node.outputs[0]

    def math(self, op, a, b=None, clamp=False):
        m = self.n('ShaderNodeMath', operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): m.inputs[i].default_value = v
            else: self.link(v, m.inputs[i])
        return m.outputs[0]

    def mapr(self, v, a0, a1, b0=0.0, b1=1.0):
        m = self.n('ShaderNodeMapRange', clamp=True)
        self.link(v, m.inputs[0])
        for i, x in zip((1, 2, 3, 4), (a0, a1, b0, b1)):
            m.inputs[i].default_value = x
        return m.outputs[0]

    def mix(self, fac, a, b):
        m = self.n('ShaderNodeMix', data_type='RGBA')
        if isinstance(fac, (int, float)): m.inputs[0].default_value = fac
        else: self.link(fac, m.inputs[0])
        for idx, v in ((6, a), (7, b)):
            if isinstance(v, (tuple, list)): m.inputs[idx].default_value = (*v, 1.0) if len(v) == 3 else v
            else: self.link(v, m.inputs[idx])
        return m.outputs[2]

    def noise(self, vec, scale, detail=5.0, rough=0.55, dist=0.0):
        nn = self.n('ShaderNodeTexNoise')
        self.link(vec, nn.inputs['Vector'])
        nn.inputs['Scale'].default_value = scale
        nn.inputs['Detail'].default_value = detail
        nn.inputs['Roughness'].default_value = rough
        nn.inputs['Distortion'].default_value = dist
        return nn.outputs['Fac']

    def ramp(self, fac, stops):
        r = self.n('ShaderNodeValToRGB')
        r.color_ramp.elements[0].position = stops[0][0]
        r.color_ramp.elements[0].color = (*stops[0][1], 1)
        r.color_ramp.elements[1].position = stops[-1][0]
        r.color_ramp.elements[1].color = (*stops[-1][1], 1)
        for p, c in stops[1:-1]:
            e = r.color_ramp.elements.new(p); e.color = (*c, 1)
        self.link(fac, r.inputs[0])
        return r.outputs[0]


def tick_mask(b, pos, nrm, rows):
    """Engraved radial tick marks on faces that look along +/-Y, in world (x, z) polar coordinates."""
    sep = b.n('ShaderNodeSeparateXYZ'); b.link(pos, sep.inputs[0])
    x, z = sep.outputs[0], sep.outputs[2]
    r = b.math('SQRT', b.math('ADD', b.math('MULTIPLY', x, x), b.math('MULTIPLY', z, z)))
    ang = b.math('ARCTAN2', z, x)
    ny = b.n('ShaderNodeSeparateXYZ'); b.link(nrm, ny.inputs[0])
    face = b.mapr(b.math('ABSOLUTE', ny.outputs[1]), 0.80, 0.95)
    total = None
    for count, r0, r1 in rows:
        f = b.math('FRACT', b.math('MULTIPLY', ang, count / (2 * math.pi)))
        stripe = b.mapr(b.math('ABSOLUTE', b.math('SUBTRACT', f, 0.5)), 0.045, 0.085, 1.0, 0.0)
        band = b.math('MULTIPLY', b.mapr(r, r0 - 0.0002, r0, 0, 1), b.mapr(r, r1, r1 + 0.0002, 1, 0))
        m = b.math('MULTIPLY', stripe, band)
        total = m if total is None else b.math('MAXIMUM', total, m)
    # no ticks under the mount bracket (x within +-7.5 mm, below z = -33.5 mm)
    mz = b.mapr(z, -0.0335, -0.0345, 0, 1)
    mx_ = b.mapr(b.math('ABSOLUTE', x), 0.0075, 0.0085, 1, 0)
    free = b.math('SUBTRACT', 1.0, b.math('MULTIPLY', mz, mx_))
    return b.math('MULTIPLY', b.math('MULTIPLY', total, face), free)


PALETTES = {
    'bronze': dict(stops=[(0.0, (0.15, 0.072, 0.016)), (0.5, (0.40, 0.23, 0.045)), (1.0, (0.62, 0.41, 0.10))],
                   polish=(0.92, 0.68, 0.26), rough=0.30, wear_gain=0.85, tick=True),
    'gold':   dict(stops=[(0.0, (0.80, 0.52, 0.12)), (0.5, (0.90, 0.62, 0.17)), (1.0, (0.96, 0.72, 0.26))],
                   polish=(1.0, 0.80, 0.40), rough=0.20, wear_gain=0.6, tick=False),
}
TICK_ROWS = [(96, 0.0314, 0.0326), (48, 0.0336, 0.0350), (64, 0.0184, 0.0191), (64, 0.0209, 0.0217)]


def build_shader(mat, kind):
    pal = PALETTES[kind]
    b = NB(mat)
    geo = b.n('ShaderNodeNewGeometry')
    pos, nrm = geo.outputs['Position'], geo.outputs['Normal']

    ao = b.n('ShaderNodeAmbientOcclusion', samples=12, inside=False)
    ao.inputs['Distance'].default_value = 0.0025
    crev = b.mapr(ao.outputs['AO'], 0.97, 0.45)                      # 0 open .. 1 deep crevice
    bev = b.n('ShaderNodeBevel', samples=8); bev.inputs['Radius'].default_value = 0.00035
    dot = b.n('ShaderNodeVectorMath', operation='DOT_PRODUCT')
    b.link(bev.outputs['Normal'], dot.inputs[0]); b.link(nrm, dot.inputs[1])
    edge = b.mapr(dot.outputs['Value'], 0.998, 0.94)
    wear = b.math('MULTIPLY', edge, b.mapr(ao.outputs['AO'], 0.55, 0.9))   # only convex edges

    nl = b.noise(pos, 260, 6, 0.6, 0.3)
    nf = b.noise(pos, 3200, 8, 0.6)
    nv = b.noise(pos, 700, 4, 0.5, 0.4)

    col = b.ramp(nl, pal['stops'])
    col = b.mix(b.math('MULTIPLY', b.math('ADD', wear, b.math('MULTIPLY', nf, 0.25)), pal['wear_gain'], clamp=True),
                col, pal['polish'])
    if kind == 'bronze':                                      # low-frequency tarnish blotches
        tarn = b.math('MULTIPLY', b.mapr(b.noise(pos, 95, 5, 0.6, 0.6), 0.52, 0.72), 0.65)
        col = b.mix(tarn, col, (0.070, 0.032, 0.010))
    col = b.mix(b.math('MULTIPLY', crev, 0.95), col, (0.022, 0.013, 0.007))
    if kind == 'bronze':
        verd = b.math('MULTIPLY', b.mapr(crev, 0.55, 1.0), b.mapr(nv, 0.52, 0.66))
        col = b.mix(b.math('MULTIPLY', verd, 0.55), col, (0.045, 0.135, 0.105))
    tick = tick_mask(b, pos, nrm, TICK_ROWS) if pal['tick'] else None
    if tick is not None:
        col = b.mix(b.math('MULTIPLY', tick, 0.92), col, (0.014, 0.009, 0.005))

    rough = b.math('ADD', pal['rough'], b.math('SUBTRACT', b.math('MULTIPLY', crev, 0.32), b.math('MULTIPLY', wear, 0.15)))
    rough = b.math('ADD', rough, b.math('MULTIPLY', b.math('SUBTRACT', nf, 0.5), 0.14), clamp=True)
    rough = b.math('MAXIMUM', rough, 0.12)
    metal = b.math('SUBTRACT', 1.0, b.math('MULTIPLY', b.math('MULTIPLY', crev, crev), 0.5))

    bump = b.n('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.18; bump.inputs['Distance'].default_value = 0.00018
    h = b.math('MULTIPLY', nf, 0.55)
    h = b.math('ADD', h, b.math('MULTIPLY', nv, 0.25))
    if tick is not None:
        h = b.math('SUBTRACT', h, b.math('MULTIPLY', tick, 2.2))
    b.link(h, bump.inputs['Height'])

    bsdf = b.n('ShaderNodeBsdfPrincipled')
    b.link(col, bsdf.inputs['Base Color']); b.link(rough, bsdf.inputs['Roughness'])
    b.link(metal, bsdf.inputs['Metallic']); b.link(bump.outputs['Normal'], bsdf.inputs['Normal'])
    out = b.n('ShaderNodeOutputMaterial')
    b.link(bsdf.outputs['BSDF'], out.inputs['Surface'])
    emit = b.n('ShaderNodeEmission')
    img = b.n('ShaderNodeTexImage')
    mat['_bake'] = dict()
    return dict(col=col, rough=rough, metal=metal, bsdf=bsdf, out=out, emit=emit, img=img, tree=b.t)


def new_image(name, size, srgb):
    if name in bpy.data.images: bpy.data.images.remove(bpy.data.images[name])
    im = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
    im.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    return im


def bake_pass(objs, shaders, image, kind, source=None, samples=32):
    """Bake one map for every selected object into `image`.
    kind: 'EMIT' (source = socket name 'col'/'rough'/'metal'), 'NORMAL' or 'AO'."""
    sc = bpy.context.scene
    sc.cycles.samples = samples
    for sh in shaders.values():
        t = sh['tree']
        sh['img'].image = image
        t.nodes.active = sh['img']
        if kind == 'EMIT':
            sock = sh[source]
            for l in list(sh['emit'].inputs[0].links): t.links.remove(l)
            t.links.new(sock, sh['emit'].inputs[0])
            t.links.new(sh['emit'].outputs[0], sh['out'].inputs['Surface'])
        else:
            t.links.new(sh['bsdf'].outputs['BSDF'], sh['out'].inputs['Surface'])
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objs: ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bk = sc.render.bake
    bk.margin = 16; bk.margin_type = 'EXTEND'; bk.use_clear = True
    bk.use_selected_to_active = False
    if kind == 'NORMAL':
        bk.normal_space = 'TANGENT'
    bpy.ops.object.bake(type=kind)


def img_to_np(im):
    a = np.empty(len(im.pixels), dtype=np.float32)
    im.pixels.foreach_get(a)
    return a.reshape(im.size[1], im.size[0], 4)


def save_array(arr, path, srgb):
    """arr float RGBA in image-space values -> PNG."""
    im = bpy.data.images.new('tmp_save', arr.shape[1], arr.shape[0], alpha=False)
    im.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    im.pixels.foreach_set(arr.astype(np.float32).ravel())
    im.filepath_raw = path; im.file_format = 'PNG'
    im.save()
    bpy.data.images.remove(im)
