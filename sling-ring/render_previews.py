"""Render the preview images (shadowed beauty shots, close-ups, wireframe) from SlingRing.blend.
    python render_previews.py [--samples 160]
"""
import os, sys, math
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
samples = int(argv[argv.index('--samples') + 1]) if '--samples' in argv else 160
views = [a for a in argv if a in ('hero', 'front', 'macro', 'band', 'side', 'wire')] or ['hero', 'front', 'macro', 'band', 'side', 'wire']
out = os.path.join(HERE, 'previews'); os.makedirs(out, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=os.path.join(HERE, 'SlingRing.blend'))
sc = bpy.context.scene
sc.cycles.samples = samples
cam = sc.camera
VIEWS = {
    'hero':  ((0.20, -0.62, 0.11), (0, 0, -0.012), 100, (1600, 1000)),
    'front': ((0.0, -0.62, 0.0), (0, 0, -0.012), 100, (1600, 1000)),
    'side':  ((0.62, -0.10, 0.03), (0, 0, -0.012), 100, (1600, 1000)),
    'macro': ((0.07, -0.17, 0.055), (0.0, 0, 0.03), 100, (1600, 1000)),
    'band':  ((0.09, -0.15, -0.02), (0, 0, -0.045), 100, (1600, 1000)),
    'wire':  ((0.0, -0.56, -0.004), (0, 0, -0.012), 100, (1600, 1000)),
}

def shoot(name):
    loc, tgt, lens, (rx, ry) = VIEWS[name]
    sc.render.resolution_x, sc.render.resolution_y = rx, ry
    cam.location = Vector(loc); cam.data.lens = lens
    cam.rotation_euler = (Vector(tgt) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.dof.focus_distance = (Vector(tgt) - cam.location).length
    sc.render.filepath = os.path.join(out, f'SlingRing_{name}.png')
    bpy.ops.render.render(write_still=True)

for v in views:
    if v == 'wire':
        continue
    shoot(v)

if 'wire' in views:
    # True quad wireframe: project every polygon through the render camera, paint back-to-front
    # (hidden-surface), outline in gold. Shows the real edge flow rather than the renderer's triangulation.
    from PIL import Image, ImageDraw
    from bpy_extras.object_utils import world_to_camera_view
    loc, tgt, lens, (rx, ry) = VIEWS['wire']
    sc.render.resolution_x, sc.render.resolution_y = rx, ry
    cam.location = Vector(loc); cam.data.lens = lens
    cam.rotation_euler = (Vector(tgt) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.view_layer.update()
    SS = 2
    img = Image.new('RGB', (rx * SS, ry * SS), (14, 15, 18)); d = ImageDraw.Draw(img)
    polys = []
    cpos = cam.matrix_world.translation
    for ob in bpy.data.objects:
        if ob.type != 'MESH' or not ob.name.startswith('SlingRing'): continue
        me = ob.data; mw = ob.matrix_world
        P = [world_to_camera_view(sc, cam, mw @ v.co) for v in me.vertices]
        for p in me.polygons:
            c = mw @ p.center
            pts = [(P[i].x * rx * SS, (1 - P[i].y) * ry * SS) for i in p.vertices]
            n = (mw.to_3x3() @ p.normal)
            shade = max(0.0, n.dot((cpos - c).normalized()))
            polys.append(((c - cpos).length, pts, shade))
    polys.sort(key=lambda t: -t[0])
    for _, pts, shade in polys:
        d.polygon(pts, fill=(int(16 + 30 * shade), int(17 + 28 * shade), int(20 + 26 * shade)),
                  outline=(int(150 + 60 * shade), int(115 + 45 * shade), int(55 + 25 * shade)))
    img = img.resize((rx, ry), Image.LANCZOS)
    img.save(os.path.join(out, 'SlingRing_wire.png'))
    print('Saved wire')
