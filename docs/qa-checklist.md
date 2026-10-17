# QA checklist: 3-axis milling and Design

A pass / fail record of one QA sweep, written so that anything marked partial or open is stated as such. Re-run it before a release: the scripts and tests named below are in `test/`.

Legend: PASS = checked and correct · FIXED = a bug was found, fixed and has an automated test · PARTIAL = works with the limit noted · OPEN = a known problem that is not fixed · NOT RUN = not exercised in this sweep

## Free and Premium Manufacture, ribbon fit, dev tool

| Area | What is true now | Test |
|---|---|---|
| Free for everyone | Nothing in Manufacture. (The early-access build also hides the Manufacture tab; `?dev=1` shows it.) | `cam.premium.e2e.js` |
| Premium, coming soon | Everything in Manufacture: Setup, Tool Library, Set Origin, New Toolpath, 2D and 3D toolpaths, Drill cycles, Engrave, Thread mill, Clean-up, Auto Program, Auto Detect, Verify, **Simulate**, **G-code**, Measure, Setup Sheet, Wire EDM, the 5-axis machine. A locked control is dimmed, carries a lock badge, its hover card adds the Premium line, a click only shows the notice, and the panel shows only the notice | `cam.premium.e2e.js` |
| The switch | One constant, `isPremium` at the top of `cam-premium.js` (false until accounts exist). Tests set `window.DATUM_PREMIUM = true` to lift every lock | |
| Ribbon fit | An icon-only small button (labels dropped to save room) is centered to the pixel; the lock badge keeps its own size; the scroll arrows move by whole groups so a click never leaves a group cut in half. Checked on every tab at 900, 1100, 1280, 1400 and 1920 px | `ui.layout.e2e.js` |
| Dev tool | Press the backtick key. Until then nothing of it exists in the page (no element, no style), the address cannot start it, and the key is ignored while typing in a field. It reaches the House, Drawing, Graphics and Setup Sheet tabs from inside their frames too | `dev.mode.e2e.js` |
| Debug log | File → Debug log, or automatically while dev mode runs (on at its start, off after, not saved). When on, the browser console gets every click, key and typed character; every value change as `from → to` with its unit and the same in mm, the model values that moved (`command.f.dist: 10 → 190.5`), the overall model size X × Y × Z after each rebuild, and a check that the field still shows what was typed; the 3D view (zoom, pan, orbit with azimuth / elevation, visible area, canvas size, and what caused it); resizes of the window, canvases, panels and frames; drags, wheel turns, scrolls and drops; workspace, command, sketch, selection and simulation changes; panels, dialogs, menus and toasts opening and closing. While off, nothing is written | `debug.log.e2e.js` |
| Status tracker | On by default (no setting needed). Do a few things (click a tool, type a value, orbit and zoom the view, resize the window), press ` to open dev mode and click **Export status**: a `datum-status-….txt` downloads with the state now and every step numbered in order (typed text, `from → to` changes, view moves, resizes, panels), with nothing in the browser console. **JSON** gives the same steps as JSON. Passwords stay out. The **Status tracker** box switches it off and on. Steps done by a dev mode run are marked `dev`. After a reload the earlier steps are listed first. |
| Dev tool steering | Press ` and look at the panel: it lists only **Sketching & 3D modeling** (and its flows). Tick **Don't review working things** (on by default) and **Aim more for mistakes**, pick the Quick run and press Start: the summary says how many controls worked and ran smooth the first time and were not tried again, and which areas got extra attention and why. Pick **Endless** and press Start: random runs keep going, good or bad, until you press Stop. |
| Sketching and modeling only, import and export previews | Open the page with no `?dev=1`: only the Design tab shows, with sketching and modeling, and no physics, fasteners, workholding, Manufacture or Blueprint. Add `?dev=1` and everything is back. Open **Import** (OBJ, STL or STEP) and **Export** (STEP, STL or OBJ): both show the model with **Solid**, **Shaded** and **Wireframe** buttons and a line saying whether it is sound or has open edges, flipped faces or loose pieces. Import a broken file and the line says so. STEP import needs the network (the reader loads from a CDN). |
| Sharpness | Press ` and look at the **Sharpness** line in the dev panel: a grade (Sharp / Soft / Blurry) with the findings under it, refreshed every few seconds while the panel is open (**Live**) or when you press **Check now**. Try browser zoom (Ctrl +), a small window and a long orbit on a slow machine: the grade should drop to Soft or Blurry and say why (a stretched canvas, the 3D view lowered its pixel ratio, a fractional screen pixel ratio, text under 9 screen pixels, edges spread over more than 2 pixels). **Export status** includes a SHARPNESS section with the same readings, and the step list gets a `blur` step when the sharpness changes. |
| Ribbon fit | Resize the window from 2560 px down to 640 px, and try browser zoom 125% to 200%, in Design (also with a sketch open and with Extrude open), Manufacture, Setup Sheet and Print. Every ribbon button is shown whole or not at all: nothing is cut by the right or left edge, nothing is under an arrow or fading out, icons stay centered, labels are whole. When the ribbon is wider than the window the arrows (or the mouse wheel) page it by whole groups, and a group the edge would cut in half stays hidden until paged in. `node test/ribbon.fit.e2e.js` does this sweep; the dev tool also reports `ribbon clipped` during a run. |

## Third sweep (added tests)

| Test | What it checks |
|---|---|
| `test/cam.wire.e2e.js` | All 17 wire EDM samples: the posted program starts with %, sets units, absolute mode and the G92 start point, threads the wire (M60) before every cut and cuts it (M45) after, turns compensation on before using it and off again, stays inside the stock, and ends with M30 |
| `test/cam.ops.e2e.js` (added) | Chamfer swarf on the faces Auto Program picks (Flanged boss): moves below the stock top, none below the stock bottom, valid G-code |
| `test/design.qa.e2e.js` (added) | Two-distance chamfer (both ways round) and distance + angle chamfer against d1·d2/2·L |
| `test/design.fusion4.e2e.js` | Boundary Fill volumes (a void, a cup closed by a lid, remove the tools, nothing enclosed), its ribbon button and panel, the three chamfer types in the panel |

## Second sweep (added tests)

| Test | What it checks |
|---|---|
| `test/design.qa2.e2e.js` | Volumes of sweep, loft, coil, patterns, gear, deform, offset plane |
| `test/ui.buttons.e2e.js` | Clicks every Design (63) and Manufacture (56) ribbon button on a fresh sample part: no exception, and the next UI refresh still works. Found and fixed a crash in the Guided Setup panel when no part was left |
| `test/cam.ops.e2e.js` | Every toolpath type on its own: face (two patterns), contour, pocket, spot, peck, drill, counterbore, tap, 3D parallel, waterline, Z-level rough, seven 3D finish strategies, engraving, thread mill, chamfer swarf with no pick, wire operation can be added |

## How it was checked

| Check | What it does | Where |
|---|---|---|
| G-code check | Reads the posted program as a machine would: units (G20/G21), absolute mode, work offset, tool change before cut, G43 H matches T, spindle and feed state before cutting, canned cycles have R and Z, arcs have matching radii, S never above 12000 rpm, M30 at the end, G28 safe retract | `test/lib/gcode-check.js` (`gcheck`) |
| G-code replay | Plays the posted G-code back into 3D lines and compares each operation's toolpath with it, both ways (toolpath to G-code and G-code to toolpath), and checks the drilled holes against the model | `test/lib/gcode-check.js` (`gDeviation`, `gDrills`) |
| Verify | The app's own Verify: gouge, holder, shank, rapid through stock, plunge, vise and parallel collisions, then a coverage check of every face of the part against the machined stock, and measurement of overall size, holes and floors | `verifyAndFix()` |
| Design volumes | Builds features from JSON and compares the body volume with the exact formula | `test/design.qa.e2e.js` |
| Sample parts | Every sample part rebuilds from its history without a feature error | `test/design.qa.e2e.js` |
| CAM regressions | Each CAM fix below has a browser test | `test/cam.qa.e2e.js` |

The sweeps that found most of the bugs ran Auto Program followed by Verify on every 3-axis sample part (70 parts), with the G-code check and replay on each program. A second sweep ran individual toolpaths one at a time (drill, pocket, face, contour, chain modes, 3D finishing) on three sample parts.

## Result in one view

Final run of Auto Program followed by Verify on all 70 three-axis sample parts, on the merged branch:

| Measure | Result |
|---|---|
| G-code check problems (units, offsets, tool changes, canned cycles, arcs, S above 12000, M30) | 0 of 70 programs |
| Posted G-code differs from the toolpath by more than 0.03 mm | 3 of 70 parts, all at or under 0.05 mm on through contours (a rounding of arc fitting) |
| Verify (gouge, holder, shank, rapid, vise, plunge, coverage, size, holes, floors) passes | 61 of 70 |
| Verify fails | 9 of 70: see Open items. Every one is a real limit of cutting that part with 3-axis round tools, not a program error |
| Crashes, NaN moves, empty toolpaths | 0 |
| Full test suite (`test/*.js`, 38 files) | all pass. `print-ui.e2e.js` prints nothing and is stopped by its 10 minute timeout on `main` too |

Before the fixes, 6 parts posted a wrong or missing G12 finish cycle, and several correct programs were reported red by Verify (blind holes, ring grooves, shallow wells, a channel that was never cut).

## Bugs found and fixed

| # | Bug | Effect on the machine | Test |
|---|---|---|---|
| 1 | After the air-move optimizer lowered hops, the circular-pocket finish cycle (G12) lost its link to its end move | The finish pass of a round pocket was skipped and the arcs after it posted from the wrong place ("arc radius mismatch" in the G-code check). Seen on 6 sample parts | `cam.qa.e2e.js` "round pockets" |
| 2 | A sliver face (under 3 mm²) was planned as a pocket floor | A "Could not read a floor face" warning and an extra operation for nothing | `cam.qa.e2e.js` "degenerate sliver" |
| 3 | Spindle speed was computed up to 18000 rpm for small tools | An S word above the machine's spindle. Now capped at 12000 (`doc.cam.maxRpm` changes it) and the post says so in a comment when it clamps | `cam.qa.e2e.js` "tiny features" |
| 4 | Features narrower than a 1/8" end mill got a tool that did not fit | A failed Verify on tiny slots and pockets. 1/32" and 1/16" end mills are now in the library, used only when no 1/8" or larger tool fits, and the outside profile uses a sturdier tool | `cam.qa.e2e.js` "tiny features" |
| 5 | A narrow channel between two deeper holes was classed as open ground outside the stock | The channel was never cut and the tool chosen was far too big (Battery tray: a 4 mm channel with a 3/4" end mill). The planner now clears the enclosed opening and chooses a tool that reaches every part of the floor | `cam.qa.e2e.js` "narrow channel" |
| 6 | Blind holes shallower than the drill point were drilled | A Ø16 hole 3 mm deep cannot reach full size with a 118° drill (the point is about 5 mm). Such wells are now milled as pockets | covered by "narrow channel" part sweep (Pen tray, Control knob blank) |
| 7 | The outer wall of a ring groove was treated as a drillable hole | A drill, a hole row in the measurement table and a red Verify for a part that was fine (Coaster, Control knob) | part sweep |
| 8 | The floor of a ring pocket was read as its inner disc when a long triangle's centre fell in the hole | Measurement probed the wrong spot and reported a floor "not cut" | part sweep (Soft jaw) |
| 9 | The coverage check flagged the bottom of a drilled blind hole red (flat in the model, a cone in the cut) and the wall down to the point | A correct drilled program was reported as not machined. A flat bottom or wall that a drill of that size goes down is now accepted | `cam.qa.e2e.js` "shoulder and blind holes" |
| 10 | The floor measurement probed a point on the edge of a fin or outside the floor face | Heat sink floor "20 deep measured 0" on a correct program | part sweep |

## Design (Fusion-style modeling)

The status column is the app's own claim in `docs/fusion-coverage.md`. "Volume" means a test compares the body with an exact formula. "Existing tests" are `design.model`, `design.fusion1` to `3` and `design.sketch`. "Opens" means the command opens, takes its default input and cancels without changing the model (a smoke check that does not prove the geometry).

| Tool | Result | Evidence |
|---|---|---|
| Extrude: new, join, cut, intersect, symmetric | PASS | Volume |
| Revolve | PASS | Volume (tube) |
| Hole: simple, through, counterbore, countersink, 118° point | PASS | Volume |
| Fillet (constant radius) | PASS | Volume |
| Chamfer (equal distance, two distances, distance + angle) | PASS | Volume |
| Shell | PASS | Volume |
| Combine: join, cut, intersect | PASS | Volume |
| Split body | PASS | Volume |
| Move, copy, rotate, scale | PASS | Volume |
| Rectangular pattern | PASS | Volume |
| Box, cylinder, cone, sphere, torus | PASS | Existing tests, volume |
| Push / pull, draft, align, stretch, delete body | PASS | Existing tests |
| Pipe, pattern on path, rib, web | PASS | Existing tests, volume |
| Slot, ellipse, spline, text, trim | PASS | Existing tests |
| Midplane, plane at angle, plane through three points | PASS | Existing tests |
| Physical properties, interference, section analysis | PASS | Existing tests |
| Undo, redo, save and reload | PASS | Volume test steps back and forward and round-trips the JSON |
| Sweep, loft, coil, mirror, circular pattern, offset plane, spur gear, deform | PASS | `test/design.qa2.e2e.js`: loft prism and frustum, sweep along a straight path, coil by Pappus (circle and square), mirror and circular pattern volumes, offset-plane extrude height, gear volume against the pitch cylinder, bend / taper / twist stay one valid solid |
| Thread (modeled), hardware (screws, nuts), other gear types | PARTIAL | Rebuild without error in every sample part; no separate volume formula |
| Fillet equal to the convex corner radius | FIXED | The Game controller fillets (radius 8 on corner arcs of radius 8) reported "Edge no longer exists". The cause was not the rolling ball: the boolean left a few-micron sliver on the body's top face, which put four polygons on one real edge, and the edge finder only accepted edges with exactly two. Edges whose polygons belong to two faces are now accepted, and the sample builder no longer leaves slivers between corner arcs. The sample is back to its original 8 mm corner. Radius 8 on an 8 mm corner builds without error; a larger fillet still says "Size is larger than the edge allows" |
| Boundary Fill | PASS | `test/design.fusion4.e2e.js`: a void in a block, a cup closed by a lid, remove the tools, nothing enclosed. Bodies that only touch (shared faces) are not tested and may need a small overlap |
| Variable and setback fillets, Thicken, surface tools, sheet metal, T-spline form, assemble joints | NOT RUN | Not in the app (see `fusion-coverage.md`): variable and setback fillets need a face that is not a cylinder or torus; Thicken and surfaces need open surface bodies |

**Sample parts.** All 159 sample parts rebuild from their feature history; 158 without error and positive volume, and the one exception is noted above. `test/design.qa.e2e.js` fails if that number changes.

## Manufacture (Mastercam-style toolpaths, 3-axis)

The status column is the app's claim in `docs/mastercam-toolpaths.md`. "Auto" means the toolpath is made by Auto Program in the part sweep. "Scenario" means it was run alone on up to three sample parts and its G-code checked. The existing tests are `test/cam.*.e2e.js`.

| Toolpath | Result | Evidence and limits |
|---|---|---|
| Facing | PASS | Auto, scenario (zigzag and one-way) |
| Contour (outside, inside, on line, ramp, tabs, lead in and out, stock to leave) | PASS | Auto, scenario. G-code matches the toolpath within 0.05 mm |
| Pocket (faces) and finish pass | PASS | Auto. Fixed: enclosed channel, shallow wells, tool choice (bugs 4 to 6) |
| Round pocket (G12) | PASS | Fixed bug 1. The cycle plunges at the centre: the program says so in a comment and Verify marks it, because the tool must be a centre-cutting end mill |
| Slot, circle mill, area, peel, dynamic, rest, deburr, chamfer | PASS (chain modes) | Existing tests; scenario sweep ran each on three parts with no crash, no NaN and valid G-code. Several scenarios show gouge counts: those are the scenario's depth settings, not program faults (the same cuts verified clean when Auto Program made them) |
| Drill: spot, drill, peck, chip break, ream, counterbore, back spot face | PASS | Auto, scenario. Canned cycle X, Y, Z checked against the model's holes |
| Tap (G84), bore (G86, G89, G76), back bore (G87) | PASS | Existing tests, scenario for tap |
| Thread mill | PASS | `test/cam.ops.e2e.js`: Auto-detect threads on the Flanged boss makes thread-mill paths and posts helical arcs with no G-code check problems |
| Engraving | PASS | `test/cam.ops.e2e.js`: plans, finite moves inside the stock, valid G-code. Verify reports gouge and holder counts on an engraving because it cuts into the part by design |
| 3D parallel, waterline, rough pocket (Z-level), radial, spiral, scallop, pencil, project | PASS | Scenario on three parts, G-code matches within 0.05 mm. Verify reports a few rapid-through-stock moves on pencil, waterline and parallel rough when run alone; the Verify and fix step lifts them (Auto Program results show none) |
| Chamfer swarf | PASS | With no face picked the app says so and posts valid G-code; with the faces Auto Program picks (Flanged boss) it makes moves and valid G-code (`cam.ops.e2e.js`). One swarf end can stop short where the cone would touch (the app warns) |
| Clean-up (rest) | PASS | Auto Program adds it; "Nothing to clean up" when nothing is left |
| Work offsets, origin choices, units | PASS | 4 origins × in and mm on one part: G-code consistent, no deviation. Existing `cam.origin` and `cam.vise` tests |
| Save, load, undo, redo of a program | PASS | Same G-code and operations after a file round trip |
| Setup sheet, inspection sheet | PASS | Tools, program number and origin match the G-code |
| Wire EDM G-code | PASS | `test/cam.wire.e2e.js`: all 17 wire samples |
| Multiaxis, lathe | NOT RUN | Not 3-axis, outside this sweep |

## Open items

These nine parts still fail Verify. In each case the program is what a 3-axis machinist would run, and Verify names what is left.

| Part | What Verify finds | Why it is not fixed |
|---|---|---|
| Flanged boss | 18 faces and a ring of material 22 mm high at the thread relief | An undercut and an external thread. The plan lists "Thread Ø32 external" as a manual step; it needs a lathe or a thread mill from the side |
| Mold cavity insert | Two narrow areas left (2.8 mm wide) and 3 plunge warnings | The round pockets use the G12 cycle, which plunges at the centre. The warnings tell the machinist to use a centre-cutting end mill |
| Serpentine coolant plate | Four corner slivers at the ends of the channel measure "not cut" | The Ø8 port hole leaves 0.4 mm corner wedges that no round tool can reach |
| Gear blank, Star slot disc, Honeycomb plate, Board tray | Wall faces within a tool radius of sharp inside corners (keyway, star points, hexagon corners) | Round tools leave their own radius in sharp corners. The plan lists these as "sharp inside corners" to fillet in the design or finish by EDM or broaching. The coverage check counts them as red rather than excusing them |
| Mold half insert | Four 28 mm² corner areas 2.2 mm high | Corners that the finishing ball mill does not reach |
| Gusset bracket | Window planned and cut as a through cut-out since this sweep; Verify still lists the window's three sharp corners | Two causes were fixed: the sample had a hole through its edge and a 1.7 mm wall, and the cut-out check sampled a point exactly on the window's own wall (a triangle's diagonal) and read it as material. A triangle's sharp corners keep the tool radius |

Other open items:

- **Verify on long 3D paths:** a program with more than about 100k moves takes several minutes to verify. The performance thread owns this.
- **`autoApply` straight after loading a part:** it can use the quick display mesh and pick a different tool than Auto Program does, which waits for the exact mesh. Auto Program is the one-click path and is correct; the Auto Detect panel updates as soon as the exact mesh arrives.
- **Engraving:** Verify reports gouges and holder hits on it by design.
- **Verify "plunge" warnings** on pockets that start where a flat end mill cannot ramp: shown as a warning, not a failure.
- **Not 3-axis, not run:** multiaxis, lathe.
