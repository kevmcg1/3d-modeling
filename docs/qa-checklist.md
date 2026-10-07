# QA checklist: 3-axis milling and Design

A pass / fail record of one QA sweep, written so that anything marked partial or open is stated as such. Re-run it before a release: the scripts and tests named below are in `test/`.

Legend: PASS = checked and correct · FIXED = a bug was found, fixed and has an automated test · PARTIAL = works with the limit noted · OPEN = a known problem that is not fixed · NOT RUN = not exercised in this sweep

## How it was checked

| Check | What it does | Where |
|---|---|---|
| G-code check | Reads the posted program as a machine would: units (G20/G21), absolute mode, work offset, tool change before cut, G43 H matches T, spindle and feed state before cutting, canned cycles have R and Z, arcs have matching radii, S never above 12000 rpm, M30 at the end, G28 safe retract | `test/lib/gcode-check.js` (`gcheck`) |
| G-code replay | Plays the posted G-code back into 3D lines and compares each operation's toolpath with it, both ways (toolpath to G-code and G-code to toolpath), and checks the drilled holes against the model | `test/lib/gcode-check.js` (`gDeviation`, `gDrills`) |
| Verify | The app's own Verify: gouge, holder, shank, rapid through stock, plunge, vise and parallel collisions, then a coverage check of every face of the part against the machined stock, and measurement of overall size, holes and floors | `verifyAndFix()` |
| Design volumes | Builds features from JSON and compares the body volume with the exact formula | `test/design.qa.e2e.js` |
| Sample parts | Every sample part rebuilds from its history without a feature error | `test/design.qa.e2e.js` |
| CAM regressions | Each CAM fix below has a browser test | `test/cam.qa.e2e.js` |

The sweeps that found most of the bugs ran Auto Program followed by Verify on every 3-axis sample part (47 parts), with the G-code check and replay on each program. A second sweep ran individual toolpaths one at a time (drill, pocket, face, contour, chain modes, 3D finishing) on three sample parts.

## Result in one view

[[RESULT]]

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
| Chamfer (equal distance) | PASS | Volume |
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
| Sweep, loft, coil, thread, gears, hardware, deform, mirror, circular pattern, offset plane | PARTIAL | Opens; and every sample part built from them rebuilds without error (see below). No separate volume check |
| Fillet, chamfer on lofted parts | OPEN | The Game controller sample (DualSense) has two fillets on a loft that report "Edge no longer exists" on a rebuild. Every other sample part (158 of 159) rebuilds with no feature error |
| Thicken, surface tools, sheet metal, T-spline form, assemble joints | NOT RUN | Not in the app (see `fusion-coverage.md`) |

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
| Thread mill | PARTIAL | Scenario returns an empty path with the message "No threads chosen" when no thread is picked, as designed. Run with a picked thread in the existing tests |
| Engraving | PARTIAL | Runs; Verify reports gouge and holder counts on an engraving, because it cuts into the part by design. Not treated as a fault |
| 3D parallel, waterline, rough pocket (Z-level), radial, spiral, scallop, pencil, project | PASS | Scenario on three parts, G-code matches within 0.05 mm. Verify reports a few rapid-through-stock moves on pencil, waterline and parallel rough when run alone; the Verify and fix step lifts them (Auto Program results show none) |
| Chamfer swarf | PARTIAL | Runs. 1 swarf end can stop short where the cone would touch (the app warns) |
| Clean-up (rest) | PASS | Auto Program adds it; "Nothing to clean up" when nothing is left |
| Work offsets, origin choices, units | PASS | 4 origins × in and mm on one part: G-code consistent, no deviation. Existing `cam.origin` and `cam.vise` tests |
| Save, load, undo, redo of a program | PASS | Same G-code and operations after a file round trip |
| Setup sheet, inspection sheet | PASS | Tools, program number and origin match the G-code |
| Multiaxis, lathe, wire | NOT RUN | Not 3-axis, outside this sweep |

## Open items

[[OPEN]]
