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
| Change Parameters | ✅ | Parameters panel (Modify): named values with units and formulas; the ƒ beside any length or angle field takes an expression (batch 12). Sketch dimensions take expressions too: type text such as `w*2 + 3 mm` into a dimension box and the sketch is solved again when the parameter changes (batch 21) |

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
| Plane Through Two Edges, Tangent Plane | ✅ | construct.js (batch 18) |
| Plane Along Path | ✅ | reference.js (batch 23) |
| Axis (cylinder, edge, two points, perpendicular to face) | ✅ | Visible Axis feature (two points, two planes, normal to plane) that any axis picker can click; edges, cylinders and sketch lines also still work (batch 18) |
| Point (vertex, edge midpoint, center) | ✅ | Point feature with snapping |
| Point Through Two Edges | ✅ | batch 18 |
| Point Through Three Planes | ✅ | reference.js (batch 23) |

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
| Separate | ✅ | Splits a body into its unconnected pieces (batch 23) |
| Plane Cut, Combine, Shell | 🔜 8 | Through the existing boolean |

## Sheet Metal

| Fusion tool | Status | Notes |
|---|---|---|
| Flange (Base), Unfold / Flat Pattern | ✅ | batch 13: Base Flange from an open sketch profile with real bends; Flat Pattern body with true flat length and bend table |
| Edge Flange, Miter Flange, Hem, Jog | ✅ | batch 19 (sheet-flange.js): picks the thin end edge of a sheet; flange, miter corners, closed/open hem, stepped jog |
| Bend, Refold, Rip, Corner Relief | 🔜 | Needs a sheet-metal body type with bend allowance; the flat pattern would export to the 2D Drawing tab |

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
| Zebra Stripes, Curvature Map, Draft Analysis | ✅ | Zebra (shader on exact normals) and Curvature (radius table, cutter-reach flagging) in analysis.js (batch 22); Draft Analysis in batch 11 |
| Curvature Comb, Accessibility | 🔜 | Comb needs spline curves; free-form and cone faces are not measured |
| Stress / fixturing study | ✅ | Beyond Fusion's basic tools |
| Blueprint drawing | ✅ | Hands off to the 2D Drawing tab |

## Assemble

| Fusion tool | Status | Notes |
|---|---|---|
| Joint: rigid, revolute, slider, cylindrical, planar, ball | ✅ | batch 14 (assembly.js): the moving bodies sit at the joint position, with limits; no solver, so a joint moves its own bodies only |
| Drive Joints, Motion Study | ✅ | Animate drives a joint between its limits |
| As-built Joint | ✅ | A joint at value 0 leaves the bodies where they are |
| Rigid Group | ✅ | Pick several bodies in one Joint or Move |
| Pin-slot Joint, Motion Link, Contact Sets, Enable Contact | 🔜 10 | Interference shows overlaps; no contact solver |

## Environment

| Fusion feature | Status | Notes |
|---|---|---|
| Parametric timeline (rollback, reorder, edit any step, suppress) | ✅ | Timeline and History |
| Direct modeling alongside the history | ✅ | Push / Pull, Stretch, Align, Delete Body |
| Components and browser tree | 🟡 | Bodies, planes and sketches in a tree; no nested components (🔜 10) |
| User parameters and expressions in fields | ✅ | batch 12 (parameters.js) |
| Render, Animation, Simulation, Generative design | 🟡 | Render look modes exist; cloud simulation and generative design are ⛔. Manufacture is the CAM tab, tracked separately |

## Batch plan

| Batch | Tools |
|---|---|
| 0 ✅ | Everything marked ✅ above, including PR #39 |
| 1 ✅ | Physical Properties, Interference, Section Analysis, Midplane, Plane at Angle, Plane Through Three Points (PR #42) |
| 2 ✅ | Pipe, Pattern on Path, Ellipse, Slot |
| 3 ✅ | Rib, Web, Spline, Overall Slot, Center Point Slot |
| 4 | ✅ two-distance chamfer, Boundary Fill. Still open: variable and setback fillets, Split Face, Delete Face, planar Emboss |
| 23 ✅ | Plane Along Path, Point Through Three Planes, Separate, Check (reference.js) |
| 24 ✅ | Table Driven Pattern, Fill Pattern, Configurations (patterns2.js) |
| 22 ✅ | Zebra Stripes and Curvature analysis (analysis.js) |
| 21 ✅ | Sketch dimensions take expressions (parameters.js) |
| 20 ✅ | Gusset (extras.js) |
| 19 ✅ | Edge Flange, Miter Flange, Hem, Jog (sheet-flange.js) |
| 18 ✅ | Axis, Tangent Plane, Plane/Point Through Two Edges (construct.js) |
| 17 ✅ | Mates: coincident, flush, parallel, concentric between two bodies (mates.js) |
| 16 ✅ | Dome, end caps, Cut List (extras.js) |
| 15 ✅ | Weldment structural members (weldment.js) |
| 14 ✅ | Joints and motion study (assembly.js) |
| 13 ✅ | Sheet metal Base Flange and Flat Pattern (sheet-metal.js) |
| 12 ✅ | User parameters and expressions (parameters.js) |
| 11 ✅ | Bounding Box, Cavity, Sketch Driven Pattern, Draft Analysis, Wall Thickness, Undercut Analysis (more-tools.js) |
| 5 | Sweep and Loft rails, mesh-only non-uniform Scale |
| 6 | Standalone axes, tangent and two-edge planes, analysis overlays, Silhouette Split, Replace Face, Insert SVG / DXF |
| 7 | Sketch constraints and user parameters |
| 8 | Mesh tools |
| 9 | Sheet metal |
| 10 | Components and joints |

## SolidWorks 3D modeling: coverage

Same legend as above. SolidWorks tools that are the same as a Fusion tool above point to it. "New" marks tools added in batch 11 (`more-tools.js`).

| SolidWorks feature | Status | Notes |
|---|---|---|
| Extruded Boss/Base, Extruded Cut | ✅ | Extrude (New / Join / Cut / Intersect, to object, through all) |
| Revolved Boss/Base, Revolved Cut | ✅ | Revolve |
| Swept Boss/Base, Swept Cut | 🟡 | Sweep, no guide curves yet (batch 5) |
| Lofted Boss/Base, Lofted Cut | 🟡 | Loft, no guide curves yet (batch 5) |
| Boundary Boss/Base | ⛔ | Needs surface bodies |
| Fillet (constant) | ✅ | Variable, face and full-round fillets 🔜 4 |
| Chamfer | ✅ | Distance-distance and distance-angle |
| Shell | ✅ | Open faces, uniform wall; multi-thickness 🔜 4 |
| Draft | ✅ | Neutral plane |
| Rib | ✅ | Rib / Web |
| Wrap | ⛔ | Needs face-parametric projection onto curved faces |
| Dome | ✅ **new** | Spherical cap over a flat face, cut to the face outline (batch 16, extras.js) |
| Hole Wizard | ✅ | Simple, counterbore, countersink, tapped (Hole) |
| Simple Hole | ✅ | Hole |
| Thread | ✅ | Modeled threads |
| Linear Pattern, Circular Pattern | ✅ | Rectangular and Circular Pattern |
| Curve Driven Pattern | ✅ | Pattern on Path |
| Sketch Driven Pattern | ✅ **new** | Copies to every circle center (or corner) of a sketch |
| Table Driven Pattern, Fill Pattern | ✅ **new** | patterns2.js (batch 24) |
| Variable Pattern | 🔜 6 | |
| Mirror (features, bodies) | ✅ | |
| Move/Copy Body, Rotate Body | ✅ | Move / Copy, Rotate |
| Scale | 🟡 | Uniform only |
| Indent, Flex | 🟡 | Deform covers bend, twist, taper and warp; Indent 🔜 6 |
| Cavity | ✅ **new** | Tool bodies cut from a target, with a % scale for clearance or shrink |
| Combine (Add, Subtract, Common) | ✅ | Combine |
| Split | ✅ | Split Body by plane or face; Split Line 🔜 4 |
| Intersect | ✅ | Combine → Intersect, Boundary Fill |
| Delete Face, Delete/Keep Body | 🟡 | Delete Body ✅; Delete Face 🔜 4 |
| Move Face, Offset Face | ✅ | Push / Pull |
| Replace Face | 🔜 6 | |
| Reference Geometry: Plane (offset, angle, 3 points, mid-plane) | ✅ | |
| Reference Geometry: Plane (tangent, on surface, two edges), Axis, Coordinate System | 🔜 6 | |
| Reference Geometry: Point | ✅ | |
| Bounding Box | ✅ **new** | Box body enclosing the picked bodies, with padding |
| Curves: Projected, Composite, Split Line, Through XYZ, Helix/Spiral | 🟡 | Coil makes helical solids; curve features 🔜 6 |
| Surfaces (extruded, revolved, lofted, planar, offset, knit, trim, extend) | ⛔ | No surface bodies in this kernel |
| Sheet Metal: Base Flange (open profile, bend radius), Unfold / Flat Pattern with K-factor | ✅ **new** | batch 13 (sheet-metal.js) |
| Sheet Metal: edge flange, miter flange, hem, jog | ✅ **new** | batch 19 (sheet-flange.js) |
| Sheet Metal: fold, corner relief | 🔜 | |
| Weldments: structural members | ✅ **new** | Rectangular tube, bar, angle, channel, I-beam, T and round tube along a sketch path with mitered corners (batch 15, weldment.js) |
| Weldments: end caps, cut list | ✅ **new** | End caps are options on Structural Member; Cut List groups identical bodies and copies as CSV |
| Weldments: gussets | ✅ **new** | Gusset between two flat faces (batch 20, extras.js) |
| Weldments: trim/extend | 🟡 | Trim with Combine → Cut today |
| Mold tools (parting line, shut-off, core/cavity split) | 🟡 | Cavity, Split Body, Boundary Fill and Draft Analysis cover the main steps |
| Mates (angle, distance, hinge, slider, cylindrical, planar, ball) | 🟡 | Joint feature positions the moving bodies; Mate feature solves coincident / flush / parallel / concentric between two bodies ✅ 17 |
| Assemblies | 🟡 | Bodies in one model; no nested components | |
| Evaluate: Measure | ✅ | |
| Evaluate: Mass Properties | ✅ | Physical Properties |
| Evaluate: Interference Detection | ✅ | |
| Evaluate: Section View | ✅ | Section Analysis |
| Evaluate: Draft Analysis | ✅ **new** | Positive, negative and needs-draft faces for a pull direction; one-way or two-part mold |
| Evaluate: Thickness Analysis | ✅ **new** | Ray-based wall thickness with a flag limit |
| Evaluate: Undercut Analysis | ✅ **new** | Faces hidden from both ends of the pull line |
| Evaluate: Curvature, Zebra Stripes | ✅ **new** | batch 22 (analysis.js) |
| Evaluate: Check | ✅ **new** | Closed / outward / pieces / sliver faces per body (batch 23, reference.js) |
| Evaluate: Geometry Analysis | 🔜 | |
| Simulation, Flow Simulation | 🟡 | Stress / fixturing study ✅; fluid flow ⛔ |
| Equations, Global Variables | ✅ | Parameters panel |
| Configurations, Design Tables | ✅ **new** | Named parameter sets, CSV copy/load (batch 24, patterns2.js) |

Honest status: this app does not yet have every Fusion and SolidWorks 3D tool. The ⛔ rows need a different kernel (surface bodies, NURBS, T-splines), and the 🔜 rows are queued in the batch plan above.
