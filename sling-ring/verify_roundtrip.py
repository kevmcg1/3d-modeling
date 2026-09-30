"""Import each exported file into a clean Blender scene, report its contents, and render a check image.
    python verify_roundtrip.py
"""
import os, sys, math
import bpy, bmesh
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(HERE, 'previews'); os.makedirs(out, exist_ok=True)
FILES = [('glb', 'SlingRing.glb'), ('fbx', 'SlingRing.fbx'), ('obj', 'obj/SlingRing.obj')]

def clean():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def report(tag):
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    tq = tt = tn = nm = 0
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for o in meshes:
        bm = bmesh.new(); bm.from_mesh(o.data)
        tq += sum(1 for f in bm.faces if len(f.verts) == 4); tt += sum(1 for f in bm.faces if len(f.verts) == 3)
        tn += sum(1 for f in bm.faces if len(f.verts) > 4); nm += sum(1 for e in bm.edges if not e.is_manifold)
        bm.free()
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    dim = (hi - lo) * 1000
    mats = sorted({s.material.name for o in meshes for s in o.material_slots if s.material})
    imgs = sorted(i.name for i in bpy.data.images if i.name != 'Render Result')
    print(f'[{tag}] meshes={len(meshes)} quads={tq} tris={tt} ngons={tn} non-manifold-edges={nm}')
    print(f'[{tag}] size(mm, world)= {dim.x:.1f} x {dim.y:.1f} x {dim.z:.1f}   materials={mats}')
    print(f'[{tag}] images={imgs}  uv={all(len(o.data.uv_layers) for o in meshes)}')

def studio():
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 32; sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = 800, 600
    w = bpy.data.worlds.new('w'); w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6; sc.world = w
    L = bpy.data.objects.new('L', bpy.data.lights.new('L', 'AREA')); L.data.energy = 25; L.data.size = 0.25
    L.location = (-0.3, -0.3, 0.3); L.rotation_euler = (Vector((0, 0, 0)) - L.location).to_track_quat('-Z', 'Y').to_euler()
    sc.collection.objects.link(L)
    cam = bpy.data.objects.new('C', bpy.data.cameras.new('C')); cam.data.lens = 100; sc.collection.objects.link(cam); sc.camera = cam
    return sc, cam

for tag, rel in FILES:
    clean()
    p = os.path.join(HERE, rel)
    if tag == 'glb': bpy.ops.import_scene.gltf(filepath=p)
    elif tag == 'fbx': bpy.ops.import_scene.fbx(filepath=p)
    else: bpy.ops.wm.obj_import(filepath=p)
    report(tag)
    sc, cam = studio()
    # Re-centre: look at the middle of whatever was imported.
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    ctr = sum(pts, Vector()) / len(pts); size = max((max(p[i] for p in pts) - min(p[i] for p in pts)) for i in range(3))
    # Views: Blender-native Z-up for glb/fbx; OBJ importer (default settings) also converts to Z-up.
    cam.location = ctr + Vector((0.25, -0.75, 0.15)) * (size / 0.1)
    cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(out, f'roundtrip_{tag}.png')
    bpy.ops.render.render(write_still=True)
