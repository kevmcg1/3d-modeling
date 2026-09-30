# Doctor Strange's Sling Ring

A hand-built hard-surface model of the sling ring: outer notched hoop, inner gripped hoop, eight
hourglass spokes, brass studs, a mount bracket and a finger band (bore 19.2 mm). Real-world scale:
**77 × 24 × 101 mm**, 1 Blender unit = 1 m.

## Files
| File | Use |
|---|---|
| `SlingRing.blend` | Full Blender scene: model, textures (packed), studio lights, camera, shadow-catching floor. Press F12 to render. |
| `SlingRing.glb` | Import via *File ▸ Import ▸ glTF*. Textures embedded; PBR (base colour, normal, occlusion/roughness/metal). |
| `SlingRing.fbx` | *File ▸ Import ▸ FBX*. Textures embedded (FBX cannot carry the roughness/metal pack). |
| `obj/SlingRing.obj` | *File ▸ Import ▸ Wavefront (.obj)*. Keep the PNGs beside the `.mtl`. |
| `textures/` | 2048² maps: BaseColor, Normal (tangent), OcclusionRoughnessMetallic (R/G/B), AmbientOcclusion |
| `previews/` | Shadowed renders, close-ups, quad wireframe, UV layout, import round-trip checks |

## Modelling notes
* 45,954 polygons, **all quads** (no tris, no n-gons), closed and manifold; 6 objects under one `SlingRing` empty.
* Hoops/band: lathed filleted profiles, every fillet has support loops; notches and grooves cut by moving existing
  vertices so the edge flow is continuous. Spokes, mount and studs: rounded boxes with quad-pole corners.
* UVs: hand-planned seams, one shared non-overlapping 0–1 atlas, uniform texel density.
* Material: procedural aged bronze + polished gold shaded with AO/edge-wear/patina, baked to PBR maps.
* glTF/OBJ/FBX store triangles or split vertices by format rules; the `.blend` and FBX/OBJ keep the quads.

## Rebuild
```
pip install bpy numpy pillow
python build_sling_ring.py -- --size 2048      # model, UVs, bake, scene, exports (~20 min on 4 cores)
python render_previews.py                        # previews
python verify_roundtrip.py                       # imports each export into a clean scene
```
