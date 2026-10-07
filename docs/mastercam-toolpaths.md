# Mastercam toolpath coverage (Manufacture tab)

What the Manufacture tab can cut compared with Mastercam's toolpath families, and what is planned next. Updated with every batch; the tests that guard each batch are in `test/cam.*.e2e.js`.

**Status words**

| Status | Meaning |
|---|---|
| Done | In the app, works from clicks or chains (Manual), shows in the operation list, simulation, G-code and the feeds-and-speeds heat map |
| Done (approx.) | In the app, but the strategy is an approximation of Mastercam's (the note says how) |
| Partial | Part of the feature exists; the note says what is missing |
| Batch N | Planned; the batch it ships in |
| Browser limit | Not realistic in a single-page browser app; the note says why and what stands in |

**How a new toolpath is built.** 2D chain toolpaths are extra modes of the Chain operation (`MC_CM` in `index.html`, defined in `cam-mc.js`), so every one of them has Manual chain/click selection for free. Each mode can also read `op.faces`, so Auto Detect can offer it for the faces it finds. Every move goes through the shared `Path` object, so simulation, G-code, Verify and the heat map (`feedsOf` / `moveLoad`) see it with no extra work. Each mode ships a before/after pair for the hover tip card (`TIP_ART` / `TIP_TXT`).

**Choosing the tool.** `camPickTool({ air, depth, kind, tools })` in `cam-autotool.js` returns the largest library tool that fits an internal feature (smallest inside radius, narrowest width, flute length for the depth) with a one-line reason. `air` is the space the cutter must fit into (Clipper paths, µm); `kind` is `wall` (square end mills), `pocket` (square, then bull nose) or `surface` (bull nose, then ball nose). A new toolpath mode calls it with its own region, and `camAutoTool(op)` / `op.autoTool` / `op.toolMan` give it the sidebar card and the one-click override.

**How a toolpath reaches the Manual flow.** The Manual flow (`cam-flow.js`, press **N** in Manufacture) reads its list of toolpaths from `OP_INFO`, `DRILL_KINDS` and `MC_CM` every time the picker opens, so a new `MC_CM` mode appears in the picker, the guided steps (geometry, tool, parameters), the parameter tabs and the hover tip with no change to `cam-flow.js`. Give the mode a `group` (`2D`, `3D`, `Drilling` or other), a `name`, the cutter types in `tools`, a `fields(op)` panel and, for a good hover card, `TIP_ART` / `TIP_TXT` under `mc:<key>`. Panel fields are sorted into the Tool, Cut, Depths, Lead in/out, Linking and Feeds & speeds tabs by their input ids (`DEPTH`, `LEAD`, `LINK` in `cam-flow.js`); anything else lands on Cut.

## 2D

| Mastercam toolpath | Status | Notes |
|---|---|---|
| Facing | Done | Face op: zigzag or one-way, rough and finish, auto in Auto Detect |
| Contour | Done | Chain or faces; inside, outside, on line; multi-pass depth; arc lead-in/out; holding tabs; ramp contour (spiral down a closed chain) added in batch 1 |
| Pocket | Done | Faces or chain with islands; rings from the middle out; finish pass; ramp or helix entry; round pockets post as the Haas G12 cycle |
| Slot Mill | Done | Straight slot; wider than the tool is cleared with trochoidal loops |
| Dynamic Mill | Done (approx.) | Batch 1. Deep cuts, light side bite, rounded corners, feed raised for chip thinning. Offset rings, not a true engagement-controlled path |
| Area Mill | Done | Batch 1. Zigzag strokes at any angle at each level, then a wall pass; islands respected |
| Peel Mill | Done | Batch 1. Full-depth passes at a light side bite, from the stock side in toward the wall; open or closed chains |
| Rest / remachining (corners) | Done | Batch 1 Corner Rest Mill: only the corners a bigger tool left. The Clean-up op and the Pocket "rest after tool Ø" option cover whole areas |
| Drill (G81, G82, G83, G73, G85) | Done | Spot, drill, peck, chip-break, ream |
| Rigid tap (G84) | Done | Tap matched to the drilled hole |
| Counterbore, back spot face | Done | Counterbore tool; back-spot-face blade cycle |
| Bore G86, bore with dwell G89, fine bore G76 | Done | Batch 2. Drill cycles in the Drill panel; G76 has a Q shift, the sim shows the shift and the rapid out. A boring bar is modeled by the reamer tool type |
| Back bore (G87) | Done | Batch 5. Drill cycle "Back bore": shifts off the wall, rapids through the hole, shifts back, bores upward to the top, shifts and lifts out. Posts G87 with R on the far side and Z at the top of the cut; needs a through hole (others are skipped with a warning) |
| Circle Mill / Helix Bore | Done | Hole or boss to size by helical interpolation |
| Thread Mill | Done | Helical, with tangent arc in and out (Threads panel) |
| Engraving | Done | Text (any font, on an arc or a wave) and image relief |
| Chamfer / Deburr | Done | Chamfer mill follows the chain at a set break size; Conical Swarf for sloped faces |
| Keyseat / T-slot | Done | Batch 4: T-slot chain mode. Straight pass at depth that starts and ends outside the stock, so the disc cutter enters from the side |
| Spiral / helical pocket entry | Done | Ramp and helix entries are built into Pocket, Dynamic, Area and Peel |
| 2D High-speed Hybrid | Done (approx.) | Dynamic Mill (light bite, chip-thinning feed) and Area Mill cover it; there is no live stock engagement model |
| Mill-turn | Browser limit | Needs a combined mill-turn machine model with live stock; see the Lathe table |

## 3D

| Mastercam toolpath | Status | Notes |
|---|---|---|
| Surface Finish Parallel | Done | 3D Parallel (drop-cutter raster, worker, surface-finish target) |
| Surface Finish Waterline (Constant Z) | Done | Level-by-level contours; ramp or plunge entry |
| Surface Rough Pocket (Z-level rough) | Done | Batch 2: 3D Rough Pocket. Levels from the stock top, an extra level at every flat floor, stock left on walls and floors. Steep walls come out as steps |
| Surface Rough Parallel | Done | Batch 2: the "Rough" option on 3D Parallel cuts the drop-cutter raster level by level, only where the surface is at or below the level |
| Surface Rough Project / Radial | Done | Batch 4: the "Rough" option on 3D Finish (radial, spiral, scallop, pencil) and Project cuts the pattern level by level with stock left |
| Surface Rough / Finish Flowline | Done (approx.) | The Morph chain mode: passes spread evenly between two picked boundary curves and follow the surface by drop-cutter. A triangle mesh has no surface UV grid, so the flow comes from the two curves you pick, not from the surface's own edges |
| Surface High Speed: Dynamic OptiRough, Area Rough, Hybrid | Done (approx.) | Batch 4: "Dynamic" option on 3D Rough Pocket (light side bite, chip-thinning feed). Offset rings, not a true engagement-controlled path |
| Rest Mill (3D leftover) | Done | Batch 4: "Rest after tool Ø" on 3D Rough Pocket, level by level from the part silhouette |
| Horizontal Area / Flat finish | Done | Batch 4: 3D Finish strategy Flats, strokes on flat floors at their own heights |
| Steep and Shallow | Done | Batch 4: 3D Finish strategies Steep (waterline on faces over the slope angle) and Shallow (raster on the rest) |
| Scallop (constant step-over) | Done (approx.) | Batch 3: rings of the outline inward, stepover true in plan view (wider on steep walls) |
| Pencil / Corner | Done | Batch 3: along concave creases found from the mesh, ball resting in the crease |
| Spiral, Radial finish | Done | Batch 3: 3D Finish, strategies Radial and Spiral about a center you set; ball mill follows the surface by drop-cutter |
| Contour / Project (curves on a surface) | Done | Batch 3: Project (3D contour) chain mode; chain followed over the surface by the tool tip |
| Morph between curves | Done (approx.) | Batch 4: Morph chain mode, linear blend of two chains, followed over the surface |

## Multiaxis

| Mastercam toolpath | Status | Notes |
|---|---|---|
| Indexed (3+2) / Positional | Partial | Indexed drilling on a rotary exists (UMC-400 setup); Batch 6 extends it to any 2D or 3D toolpath at an indexed orientation |
| Swarf (5-axis) | Browser limit | The Conical Swarf toolpath (3-axis) is done. True 5-axis swarf needs tool-axis kinematics and a machine collision model that a browser sim does not have yet |
| Flowline, Curve, Morph, Port, Tube (5-axis) | Browser limit | Same reason; the 3D equivalents in batches 3 to 5 are the stand-ins |

## Lathe

| Mastercam toolpath | Status | Notes |
|---|---|---|
| Face, Rough, Finish, Groove, Thread, Drill, Part-off | Batch 7, partial | Needs a Turn setup (round stock, profile from a revolve). The toolpath generators and the turning simulation are new |

## Wire EDM

| Mastercam toolpath | Status | Notes |
|---|---|---|
| 2-axis Contour | Done | Openings first from start holes, outside from the stock edge, rough pass and skims |
| 4-axis taper / No-core | Batch 7 | Taper from the face angle; no-core for round holes |

## Infrastructure

| Feature | Status | Notes |
|---|---|---|
| Tool library | Done | Metric and inch tools, catalog, feeds and speeds by material |
| Feeds and speeds card, heat map | Done | Shared math (`feedsOf`); each new toolpath is picked up automatically |
| Work offsets | Done | G54 is the Setup origin. Setup adds G55 to G59, each a chosen origin plus an X Y Z shift (several parts or vises on one table); each operation picks its offset and the program posts the G55 line before it, with coordinates relative to that origin |
| Stock model | Partial | Stock box, simulation removal and "rest after tool Ø" exist; an in-process stock model between operations is Batch 5 |
| Collision checks | Done | Verify checks gouge, shank, holder, rapids through stock and the vise; Batch 5 adds holders for 3D toolpaths |
| Post processors | Partial | Controller picker in the G-code panel: Haas, Fanuc, Mach3 / Mach4, Grbl and Siemens Sinumerik (own CYCLE81 to 85 calls, `;` comments, `.mpf`), plus optional line numbers. A cycle a control lacks posts as plain moves with a note. Heidenhain TNC conversational (BLK FORM, TOOL CALL, L / CC + C blocks, cycles 200 / 201 / 202 / 205 / 207 called with M99, datum shift #1 to #6 for G54 to G59). Mazak and LinuxCNC later |

## Batches

1. Done (PR #43): Dynamic Mill, Peel Mill, Area Mill, Corner Rest Mill, Ramp Contour.
2. Done: bore G86, bore with dwell G89, fine bore G76, 3D Rough Pocket, rough 3D Parallel.
3. Done: 3D Finish (radial, spiral, scallop, pencil) and Project.
4. Done: Flats, Steep and Shallow finish; Rough option for 3D Finish and Project; dynamic and rest 3D Rough Pocket; Morph; Keyseat / T-slot.
4b. Done (the 2D and 3D tables have no open rows): G87 back bore; flowline (via Morph) and hybrid rows settled as approximations.
5. In-process stock model; holder checks for 3D; remaining 2D items.
6. Multiaxis: indexed 3+2 on any toolpath; work offsets G55 to G59; posts.
7. Lathe and 4-axis wire.
