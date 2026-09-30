"""
Build Doctor Strange's Sling Ring: geometry -> UVs -> procedural shading -> baked PBR textures
-> studio scene (with shadows) -> .blend / .glb / .fbx / .obj.

Run with a Python that has `bpy` (pip install bpy, or Blender's own: blender -b -P build_sling_ring.py):

    python build_sling_ring.py [--size 2048] [--out .] [--fast]
"""
import os
import sys
import math
import argparse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import bpy
import numpy as np
from mathutils import Vector
import ring_geometry as G
import ring_uv as U
import ring_materials as M

ap = argparse.ArgumentParser()
ap.add_argument('--size', type=int, default=2048)
ap.add_argument('--out', default=HERE)
ap.add_argument('--fast', action='store_true', help='low-sample bake for quick iteration')
args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
OUT = os.path.abspath(args.out)
TEX = os.path.join(OUT, 'textures')
os.makedirs(TEX, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.unit_settings.system = 'METRIC'; sc.unit_settings.scale_length = 1.0; sc.unit_settings.length_unit = 'MILLIMETERS'

# ───────────────────────────── 1. geometry + hierarchy ──────────────────────────
ring_col = bpy.data.collections.new('SlingRing'); sc.collection.children.link(ring_col)
root = bpy.data.objects.new('SlingRing', None)
root.empty_display_type = 'PLAIN_AXES'; root.empty_display_size = 0.02
ring_col.objects.link(root)

parts = [G.make_outer_hoop(), G.make_inner_hoop(), G.make_band(),
         G.make_spokes(), G.make_mount(), G.make_studs()]
for ob in parts:
    ring_col.objects.link(ob)
    ob.parent = root
    ob.data.validate(verbose=False)
    ob.data.update()
gold_objs = [p for p in parts if p.name.endswith('Studs')]
bronze_objs = [p for p in parts if p not in gold_objs]

# ───────────────────────────────── 2. UVs ───────────────────────────────────────
U.unwrap_and_pack(parts, margin=0.0035)
print('texel density p1/median/p99, coverage:', U.uv_stats(parts))
U.dump_uv_png(parts, os.path.join(OUT, 'previews', 'uv_layout.png')) if os.makedirs(os.path.join(OUT, 'previews'), exist_ok=True) is None else None

# ─────────────────────────────── 3. shading + bake ──────────────────────────────
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.use_denoising = False
world = bpy.data.worlds.new('BakeWorld'); world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.8, 0.8, 0.8, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
sc.world = world
world.light_settings.distance = 0.006          # AO bake distance (6 mm)

mats = {}
shaders = {}
for kind, label in (('bronze', 'SlingRing_AgedBronze'), ('gold', 'SlingRing_PolishedGold')):
    m = bpy.data.materials.new(label + '_bake'); m.use_nodes = True
    mats[kind] = m
    shaders[kind] = M.build_shader(m, kind)
for ob in bronze_objs: ob.data.materials.append(mats['bronze'])
for ob in gold_objs: ob.data.materials.append(mats['gold'])

S = args.size
k = 0.25 if args.fast else 1.0
im_col = M.new_image('SlingRing_BaseColor', S, True)
im_nrm = M.new_image('SlingRing_Normal', S, False)
im_rgh = M.new_image('tmp_rough', S, False)
im_met = M.new_image('tmp_metal', S, False)
im_ao = M.new_image('tmp_ao', S, False)
sh_by_obj = shaders
print('baking base colour...')
M.bake_pass(parts, sh_by_obj, im_col, 'EMIT', 'col', samples=int(64 * k) or 8)
print('baking roughness...')
M.bake_pass(parts, sh_by_obj, im_rgh, 'EMIT', 'rough', samples=int(24 * k) or 8)
print('baking metallic...')
M.bake_pass(parts, sh_by_obj, im_met, 'EMIT', 'metal', samples=int(24 * k) or 8)
print('baking normal...')
M.bake_pass(parts, sh_by_obj, im_nrm, 'NORMAL', samples=int(16 * k) or 4)
print('baking ambient occlusion...')
M.bake_pass(parts, sh_by_obj, im_ao, 'AO', samples=int(128 * k) or 16)

col = M.img_to_np(im_col); rgh = M.img_to_np(im_rgh); met = M.img_to_np(im_met)
nrm = M.img_to_np(im_nrm); ao = M.img_to_np(im_ao)
orm = np.ones_like(col)
orm[..., 0] = ao[..., 0]; orm[..., 1] = rgh[..., 0]; orm[..., 2] = met[..., 0]
orm[..., 3] = 1.0
# Byte images already hold display-encoded (sRGB) values in .pixels, so the colour map is written verbatim.
col_disk = col.copy(); col_disk[..., 3] = 1
paths = dict(col=os.path.join(TEX, 'SlingRing_BaseColor.png'), nrm=os.path.join(TEX, 'SlingRing_Normal.png'),
             orm=os.path.join(TEX, 'SlingRing_OcclusionRoughnessMetallic.png'),
             ao=os.path.join(TEX, 'SlingRing_AmbientOcclusion.png'))
M.save_array(col_disk, paths['col'], srgb=False)    # values already display-encoded -> write verbatim
nrm[..., 3] = 1
M.save_array(nrm, paths['nrm'], srgb=False)
M.save_array(orm, paths['orm'], srgb=False)
aog = np.ones_like(col); aog[..., :3] = ao[..., :1]
M.save_array(aog, paths['ao'], srgb=False)
for n in ('tmp_rough', 'tmp_metal', 'tmp_ao', 'SlingRing_BaseColor', 'SlingRing_Normal'):
    bpy.data.images.remove(bpy.data.images[n])

# ─────────────────────── 4. final single PBR material ───────────────────────────
for ob in parts:
    ob.data.materials.clear()
for m in list(bpy.data.materials): bpy.data.materials.remove(m)

def load(path, srgb):
    im = bpy.data.images.load(path)
    im.colorspace_settings.name = 'sRGB' if srgb else 'Non-Color'
    im.pack()
    return im

mat = bpy.data.materials.new('SlingRing_Bronze_PBR'); mat.use_nodes = True
t = mat.node_tree; nd = t.nodes; ln = t.links
bsdf = nd['Principled BSDF']
def tex(img, loc):
    n = nd.new('ShaderNodeTexImage'); n.image = img; n.location = loc; n.interpolation = 'Smart'
    return n
uvn = nd.new('ShaderNodeUVMap'); uvn.uv_map = 'UVMap'; uvn.location = (-1000, 0)
t_col = tex(load(paths['col'], True), (-700, 300)); t_col.label = 'BaseColor'
t_orm = tex(load(paths['orm'], False), (-700, 0)); t_orm.label = 'Occlusion / Roughness / Metallic'
t_nrm = tex(load(paths['nrm'], False), (-700, -300)); t_nrm.label = 'Normal (tangent)'
for n in (t_col, t_orm, t_nrm): ln.new(uvn.outputs[0], n.inputs[0])
sep = nd.new('ShaderNodeSeparateColor'); sep.location = (-400, 0)
ln.new(t_orm.outputs['Color'], sep.inputs[0])
nm = nd.new('ShaderNodeNormalMap'); nm.location = (-400, -300); nm.uv_map = 'UVMap'
ln.new(t_nrm.outputs['Color'], nm.inputs['Color'])
ln.new(t_col.outputs['Color'], bsdf.inputs['Base Color'])
ln.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
ln.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
ln.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
# glTF exporter reads ambient occlusion from this named group
grp = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
grp.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
gn = nd.new('ShaderNodeGroup'); gn.node_tree = grp; gn.location = (-100, -500); gn.label = 'glTF Material Output'
ln.new(sep.outputs['Red'], gn.inputs['Occlusion'])
for ob in parts:
    ob.data.materials.append(mat)

# ───────────────────── 5. studio scene: floor, lights, camera ───────────────────
studio = bpy.data.collections.new('Studio'); sc.collection.children.link(studio)
FLOOR_Z = -0.074
mesh = bpy.data.meshes.new('Floor')
mesh.from_pydata([(-.6, -.6, 0), (.6, -.6, 0), (.6, .6, 0), (-.6, .6, 0)], [], [(0, 1, 2, 3)])
floor = bpy.data.objects.new('Studio_Floor', mesh); floor.location = (0, 0, FLOOR_Z); studio.objects.link(floor)
fm = bpy.data.materials.new('Studio_Floor'); fm.use_nodes = True
fb = fm.node_tree.nodes['Principled BSDF']
fb.inputs['Base Color'].default_value = (0.02, 0.021, 0.024, 1); fb.inputs['Roughness'].default_value = 0.8
mesh.materials.append(fm)

def area(name, loc, target, size, energy, color=(1, 1, 1), shape='RECTANGLE', sy=None):
    ld = bpy.data.lights.new(name, 'AREA'); ld.shape = shape; ld.size = size
    if sy: ld.size_y = sy
    ld.energy = energy; ld.color = color
    lo = bpy.data.objects.new(name, ld); lo.location = loc
    lo.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    studio.objects.link(lo); return lo
area('Key_Softbox', (-0.30, -0.32, 0.26), (0, 0, -0.005), 0.14, 14, (1.0, 0.93, 0.84), sy=0.20)
area('Rim_Strip', (0.30, 0.22, 0.10), (0, 0, 0), 0.06, 26, (0.85, 0.92, 1.0), sy=0.34)
area('Fill_Card', (0.34, -0.30, 0.04), (0, 0, -0.01), 0.22, 3, (1.0, 0.97, 0.94), sy=0.22)
area('Top_Kicker', (0.0, 0.05, 0.36), (0, 0, 0), 0.16, 6, (1, 1, 1))

def panel(name, loc, size, strength):                 # emissive reflector cards: give the metal something to mirror
    me = bpy.data.meshes.new(name)
    sx, sy = size
    me.from_pydata([(-sx/2, 0, -sy/2), (sx/2, 0, -sy/2), (sx/2, 0, sy/2), (-sx/2, 0, sy/2)], [], [(0, 1, 2, 3)])
    ob = bpy.data.objects.new(name, me); ob.location = loc
    ob.rotation_euler = (Vector((0, 0, 0.0)) - Vector(loc)).to_track_quat('Y', 'Z').to_euler()
    mt = bpy.data.materials.new(name); mt.use_nodes = True
    mt.node_tree.nodes.clear()
    em = mt.node_tree.nodes.new('ShaderNodeEmission'); em.inputs['Strength'].default_value = strength
    o = mt.node_tree.nodes.new('ShaderNodeOutputMaterial'); mt.node_tree.links.new(em.outputs[0], o.inputs[0])
    me.materials.append(mt); ob.visible_camera = False; studio.objects.link(ob)
panel('Refl_Card_L', (-0.55, -0.25, 0.03), (0.05, 0.22), 9.0)
panel('Refl_Card_R', (0.55, -0.30, 0.04), (0.04, 0.24), 6.0)
panel('Refl_Card_Top', (0.0, -0.10, 0.45), (0.30, 0.06), 7.0)

world = bpy.data.worlds.new('Studio'); world.use_nodes = True
wt = world.node_tree; bgn = wt.nodes['Background']
tc = wt.nodes.new('ShaderNodeTexCoord'); gr = wt.nodes.new('ShaderNodeTexGradient'); gr.gradient_type = 'SPHERICAL'
rp = wt.nodes.new('ShaderNodeValToRGB')
rp.color_ramp.elements[0].color = (0.10, 0.105, 0.12, 1); rp.color_ramp.elements[1].color = (0.004, 0.004, 0.006, 1)
mp = wt.nodes.new('ShaderNodeMapping'); mp.inputs['Rotation'].default_value = (math.radians(90), 0, 0)
wt.links.new(tc.outputs['Generated'], mp.inputs[0]); wt.links.new(mp.outputs[0], gr.inputs[0])
wt.links.new(gr.outputs['Fac'], rp.inputs[0]); wt.links.new(rp.outputs[0], bgn.inputs['Color'])
bgn.inputs['Strength'].default_value = 1.0
sc.world = world

cam_d = bpy.data.cameras.new('Camera'); cam_d.lens = 100; cam_d.sensor_width = 36
cam_d.dof.use_dof = True; cam_d.dof.aperture_fstop = 16
cam = bpy.data.objects.new('Camera', cam_d); studio.objects.link(cam); sc.camera = cam
cam.location = (0.20, -0.62, 0.11)
tgt = Vector((0, 0, -0.012))
cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam_d.dof.focus_distance = (tgt - cam.location).length
root.rotation_euler = (0, 0, math.radians(-14))

sc.render.resolution_x, sc.render.resolution_y = 1600, 1000
sc.cycles.samples = 128; sc.cycles.use_denoising = True
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
sc.render.film_transparent = False
sc.cycles.caustics_reflective = False; sc.cycles.caustics_refractive = False
sc.cycles.max_bounces = 10; sc.cycles.glossy_bounces = 8
sc.frame_start = sc.frame_end = 1

# ───────────────────────────────── 6. save + export ─────────────────────────────
blend = os.path.join(OUT, 'SlingRing.blend')
bpy.ops.wm.save_as_mainfile(filepath=blend)
print('saved', blend)

def select_model():
    bpy.ops.object.select_all(action='DESELECT')
    root.rotation_euler = (0, 0, 0)        # export in the neutral pose, not the showcase yaw
    root.select_set(True)
    for ob in parts: ob.select_set(True)
    bpy.context.view_layer.objects.active = root

select_model()
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'SlingRing.glb'), export_format='GLB', use_selection=True,
                          export_apply=False, export_yup=True, export_cameras=False, export_lights=False,
                          export_image_format='AUTO')
bpy.ops.export_scene.fbx(filepath=os.path.join(OUT, 'SlingRing.fbx'), use_selection=True, path_mode='COPY',
                         embed_textures=True, mesh_smooth_type='EDGE', apply_scale_options='FBX_SCALE_ALL',
                         add_leaf_bones=False, object_types={'MESH', 'EMPTY'})
objdir = os.path.join(OUT, 'obj'); os.makedirs(objdir, exist_ok=True)
bpy.ops.wm.obj_export(filepath=os.path.join(objdir, 'SlingRing.obj'), export_selected_objects=True,
                      export_materials=True, path_mode='COPY', export_uv=True, export_normals=True,
                      export_smooth_groups=False, apply_modifiers=False)
import shutil
for p in paths.values():                      # OBJ has no packed textures: ship the maps next to the .obj/.mtl
    shutil.copy(p, objdir)
root.rotation_euler = (0, 0, math.radians(-14))
print('exports done')
