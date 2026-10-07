# Fusion-style modeling coverage (Design tab)

Which of Autodesk Fusion's 3D modeling methods the Design tab has, which are partial, and which are planned or not feasible in a browser app. The kernel is a polygon B-rep with exact analytic faces (planes, cylinders, cones, tori) and a BSP boolean, so tools that rebuild faces exactly are cheap, while true NURBS surfaces, T-splines and a full assembly solver are not.

Legend: ✅ done · 🟡 partial (what is missing is noted) · 🔜 planned (batch number) · ⛔ not feasible in this kernel (reason noted)

Batches ship one PR at a time. Batch 0 is what existed before this work plus the "More 3D modeling tools" PR (#39).

## Solid → Create

| Fusion tool | Status | Notes |
|---|---|---|
| Extrude (distance, symmetric, to object, through all, to next) | ✅ | New / Join / Cut / Intersect, drag arrow |
| Revolve | ✅ | Angle, symmetric, axis from a line or edge |
| Sweep | 🟡 | Twist and scale along the path; guide rails 🔜 5 |
| Loft | 🟡 | Smooth or ruled; rails and centerline 🔜 5 |
| Coil | ✅ | Circle, square, triangle sections |
| Hole | ✅ | Simple, counterbore, countersink, tapped |
| Thread | ✅ | Modeled threads, metric and inch |
| Box / Cylinder / Sphere / Torus / Cone | ✅ | Primitive (PR #39) |
| Pipe | ✅ | Round or square section along a sketch path, solid or hollow; closed paths make rings; corners are mitered (batch 2) |
| Rib | 🟡 | Thin wall from an open or closed sketch curve, distance, symmetric or through-all, join/cut/new (batch 3). No auto-fit to the walls of the body |
| Web | 🟡 | Same tool: pick several curves and they fuse into one web (batch 3) |
| Emboss / Deboss | 🟡 | Text → "Convert to curves" → extrude cut/join works today; wrapping onto curved faces is ⛔ (needs face-parametric projection), planar-face emboss 🔜 4 |
| Boundary Fill | 🟡 | Every closed space between the picked bodies, or inside one, becomes a body; optional removal of the tools. Bodies that only touch need a small overlap to seal; no cell picking and no planes as boundaries (batch 4) |
| Thicken | ⛔ | Needs surface bodies, which this kernel does not have |
| Gears (spur, helical, herringbone, internal, rack, bevel, worm) | ✅ | Beyond Fusion's stock tools |
| Hardware (screws, nuts, washers) | ✅ | Parametric |

## Solid → Modify

| Fusion tool | Status | Notes |
|---|---|---|
| Press Pull / Offset Face | ✅ | Push / Pull (PR #39) |
| Fillet | 🟡 | Constant radius, including a radius equal to a corner arc's. Variable radius, setback, rule fillet, full round 🔜 4 (they need a surface that is not a cylinder or torus: ruled and blended faces) |
| Chamfer | 🟡 | Equal distance, two distances and distance + angle, each with a Flip to choose which face gets distance 1 (batch 4). Chamfers on edges that meet at a vertex are cut one by one |
| Shell | ✅ | Open faces, uniform wall |
| Draft | ✅ | Neutral plane (PR #39) |
| Scale | 🟡 | Uniform only. Non-uniform scale breaks exact cylinders; a mesh-only fallback is 🔜 5 |
| Combine (join, cut, intersect, keep tools) | ✅ | |
| Split Body | ✅ | By plane or face |
| Split Face | 🔜 4 | |
| Silhouette Split | 🔜 6 | |
| Move / Copy | ✅ | Translate, rotate, scale in one command |
| Align | ✅ | PR #39 |
| Stretch | ✅ | PR #39 |
| Delete Body | ✅ | PR #39 |
| Delete Face | 🔜 4 | Healing by extending the neighbours is the hard part |
| Replace Face | 🔜 6 | |
| Physical Material | 🟡 | Per-body color exists; materials with density arrive with Physical Properties (batch 1) |
| Change Parameters | 🟡 | Every feature keeps its own numbers and the history re-evaluates; no named parameter table (🔜 7) |

## Solid → Pattern and Mirror

| Fusion tool | Status | Notes |
|---|---|---|
| Rectangular Pattern | ✅ | |
| Circular Pattern | ✅ | |
| Mirror | ✅ | Bodies and features |
| Pattern on Path | ✅ | Bodies along a sketch path: even or fixed spacing, optional turning to follow the path, join option. Feature patterns on a path are not supported (batch 2) |

## Construct

| Fusion tool | Status | Notes |
|---|---|---|
| Offset Plane | ✅ | |
| Midplane | ✅ | Two parallel planes or flat faces (batch 1) |
| Plane at Angle | ✅ | About any edge, cylinder axis, sketch line or world axis, from a chosen plane or face (batch 1) |
| Plane Through Three Points | ✅ | Points snap to vertices, midpoints and centers; fixed where placed, so it does not follow later edits (batch 1) |
| Plane Through Two Edges, Tangent Plane, Plane Along Path | 🔜 6 | |
| Axis (cylinder, edge, two points, perpendicular to face) | 🟡 | Edges, cylinders and sketch lines already act as axes inside other tools; a standalone visible axis feature is 🔜 6 |
| Point (vertex, edge midpoint, center) | ✅ | Point feature with snapping |
| Point Through Two Edges / Three Planes | 🔜 6 | |

## Sketch

| Fusion tool | Status | Notes |
|---|---|---|
| Line, Polyline, Rectangle (2 point, center), Circle, 3-point arc, Center arc, Polygon, Text | ✅ | |
| Fillet, Chamfer, Trim, Extend, Offset, Mirror, Pattern, Move, Rotate, Scale, Copy / Paste | ✅ | |
| Project / Include | ✅ | |
| Dimension | ✅ | Driving dimensions with Update |
| Slot | ✅ | Center-to-center, Overall and Center Point slots (batches 2 and 3). Arc slots 🔜 6 |
| Ellipse | 🟡 | Center, major and minor radius, drawn as 16 arcs: within 0.3% of the true curve for axis ratios up to 3:1, so it extrudes and machines like any profile; not a true conic (batch 2) |
| Conic curve | 🔜 3 | Alongside Spline |
| Spline (fit point) | 🟡 | Smooth curve through clicked points, stored as tangent-continuous arcs, so it trims, offsets and extrudes like any sketch curve. Points are not editable by dragging afterwards; control-point splines 🔜 7 |
| Geometric constraints (coincident, tangent, parallel, perpendicular, equal, symmetric, fix) | 🔜 7 | Needs a real constraint solver; today only shared endpoints and dimensions |
| Sketch on a plane, face or construction plane | ✅ | |
| 3D sketch | 🟡 | 3D polyline exists; no full 3D sketch environment |
| Insert SVG / DXF | 🔜 6 | The Graphics and 2D Drawing tabs can already author the shapes |

## Surface

| Fusion tool | Status | Notes |
|---|---|---|
| Extrude, Revolve, Sweep, Loft, Patch, Offset, Trim, Extend, Stitch, Unstitch, Ruled, Thicken | ⛔ | Bodies are closed solids: there are no open shell or NURBS surface bodies. Adding them is a separate kernel project |
| Deform | ✅ | Bend, twist, taper and more on solids |

## Mesh

| Fusion tool | Status | Notes |
|---|---|---|
| Insert Mesh (STL / OBJ) | ✅ | Imported as a body |
| Convert Mesh | 🟡 | Imports are triangle bodies that can be combined and cut; face-group reconstruction to a B-rep is ⛔ at useful quality in a browser |
| Reduce, Remesh, Repair, Smooth, Reverse Normal | 🔜 8 | Decimation and normal repair are feasible |
| Plane Cut, Combine, Shell, Separate | 🔜 8 | Through the existing boolean |

## Sheet Metal

| Fusion tool | Status | Notes |
|---|---|---|
| Flange, Bend, Unfold, Refold, Flat Pattern, Rip, Corner Relief | 🔜 9 | Needs a sheet-metal body type with bend allowance; the flat pattern would export to the 2D Drawing tab |

## Form (T-spline sculpt)

| Fusion tool | Status | Notes |
|---|---|---|
| Box / Sphere / Cylinder forms, Edit Form, Subdivide, Crease | ⛔ | T-splines are proprietary. A Catmull-Clark sculpt mode is possible later as a separate feature |

## Inspect

| Fusion tool | Status | Notes |
|---|---|---|
| Measure | ✅ | Two-point distance with snapping |
| Physical Properties (mass, volume, area, center of mass, bounding box) | ✅ | Eleven materials with density; per-body table (batch 1) |
| Interference | ✅ | Pairwise overlap with volume, overlaps drawn in red; no "create body from overlap" yet (batch 1) |
| Section Analysis | ✅ | Top / Front / Side cut plane with slider, outline and cut area; no filled cap (batch 1) |
| Zebra, Curvature Comb, Curvature Map, Draft Analysis, Accessibility | 🔜 6 | Draft and curvature come from face normals; zebra and curvature on analytic faces only |
| Stress / fixturing study | ✅ | Beyond Fusion's basic tools |
| Blueprint drawing | ✅ | Hands off to the 2D Drawing tab |

## Assemble

| Fusion tool | Status | Notes |
|---|---|---|
| Joint (rigid, revolute, slider, cylindrical, pin-slot, planar, ball), As-built Joint, Motion Link, Drive Joints, Contact Sets, Motion Study | 🔜 10 | Needs bodies as components with a transform plus a small joint solver |
| Rigid Group, Enable Contact | 🔜 10 | |

## Environment

| Fusion feature | Status | Notes |
|---|---|---|
| Parametric timeline (rollback, reorder, edit any step, suppress) | ✅ | Timeline and History |
| Direct modeling alongside the history | ✅ | Push / Pull, Stretch, Align, Delete Body |
| Components and browser tree | 🟡 | Bodies, planes and sketches in a tree; no nested components (🔜 10) |
| User parameters and expressions in fields | 🔜 7 | |
| Render, Animation, Simulation, Generative design | 🟡 | Render look modes exist; cloud simulation and generative design are ⛔. Manufacture is the CAM tab, tracked separately |

## Batch plan

| Batch | Tools |
|---|---|
| 0 ✅ | Everything marked ✅ above, including PR #39 |
| 1 ✅ | Physical Properties, Interference, Section Analysis, Midplane, Plane at Angle, Plane Through Three Points (PR #42) |
| 2 ✅ | Pipe, Pattern on Path, Ellipse, Slot |
| 3 ✅ | Rib, Web, Spline, Overall Slot, Center Point Slot |
| 4 | ✅ two-distance chamfer, Boundary Fill. Still open: variable and setback fillets, Split Face, Delete Face, planar Emboss |
| 5 | Sweep and Loft rails, mesh-only non-uniform Scale |
| 6 | Standalone axes, tangent and two-edge planes, analysis overlays, Silhouette Split, Replace Face, Insert SVG / DXF |
| 7 | Sketch constraints and user parameters |
| 8 | Mesh tools |
| 9 | Sheet metal |
| 10 | Components and joints |
