# Manufacture compared with Fusion and Mastercam

What the Manufacture tab does compared with Fusion's Manufacture workspace and Mastercam Mill, stated plainly. The toolpath-by-toolpath list is in `mastercam-toolpaths.md`; the tests that guard each row are in `test/cam.*.e2e.js`.

| Status | Meaning |
|---|---|
| Done | In the app, simulated, posted, and covered by a test |
| Partial | Part of it exists; the note says what is missing |
| Locked | Built but switched off on purpose |
| Not here | Not in the app (the note says why or what stands in) |

## Setup, stock and tools

| Feature | Status | Notes |
|---|---|---|
| Setup with stock from the part, work origin, G54 to G59 | Done | `cam.origin`, `cam.post` |
| Stock model, rest machining, in-process stock | Done | `cam.stock` |
| Workholding (vise, parallels, soft jaws) and collision checks | Done | `cam.vise`, Verify |
| Tool library (milling, drilling, tapping, thread, dovetail, chamfer, face) with holders | Done | `cam.autotool` |
| Material library with feeds and speeds | Done | 11 materials: aluminum, brass, copper, mild steel, alloy steel, hardened tool steel, stainless, cast iron, titanium, Inconel, acetal. Carbide surface speeds and chip-load factors are starting points to tune at the machine. `cam.material` |
| Probing cycles | Not here | Probe macros are machine specific; a wrong one crashes a probe, so none are posted |
| Tool and operation templates | Partial | The tool list and the last-used values carry to the next operation (`cam.flow`) |

## Toolpaths

2D, 3D, drilling, thread, engrave, wire EDM: see `mastercam-toolpaths.md`. Not here: lathe (Mill-turn) and simultaneous 5-axis (Swarf, Flowline, Port, Tube); 3+2 indexing exists for drilling and the setups it supports.

| Contour option | Fusion | Mastercam | Here |
|---|---|---|---|
| Compensation in the computer | Computer | Computer | Done (default) |
| Compensation in the control | In control | Control | Done: part contour with G41 / G42 and a D register, G40 on a cancel move |
| Wear / reverse wear | In wear / Inverse wear | Wear / Reverse wear | Done: tool-center path with G41 / G42 (swapped for reverse) |
| Heidenhain | RL / RR | RL / RR | Done: RL / RR with R0 to cancel, radius from the tool table |
| Lead in / out | Line, arc, perpendicular | Line, arc | Partial: tangent arc with a start-up line, radius adjustable. Compensation needs an arc lead; the start moves to the middle of the longest side unless one is picked |
| Multiple stepovers / multi passes | Done | Done | Done: Rough passes N at Spacing, outermost first, the final pass at Leave |
| Stock to leave | Radial and axial | Wall and floor | Done |
| Ramp, tabs | Done | Done | Done (computer compensation only, with a warning that says so) |

Compensation in the control, rough passes and the lead radius are on the chain-based Contour (Manufacture > Chain, mode Contour). The older face-based 2D Contour (a picked face's outline, with its own roughing passes and corner leads) is still compensated in the computer only.

How compensation in the control works: the simulation keeps the tool-center path, so Verify, collision checks and the stock model are unchanged. The post replaces the stretch with the programmed contour (the chain itself, or the chain plus the stock left; the corners are exact because it is built from the model's edges, not by inverting an offset). The lead arc is one tool radius wider in the programmed path, and the start-up and cancel moves are straight lines tangent to it, at least a tool radius long. Every lead is checked against walls and bosses; if none fits, the path falls back to computer compensation with a warning. A control without compensation (Grbl) gets the tool-center path and a note.

## Post processing

| Feature | Status | Notes |
|---|---|---|
| Controllers | Done | Haas, Fanuc, Mach3 / Mach4, Grbl, Siemens Sinumerik, Heidenhain TNC. Not here: Mazak, Okuma, LinuxCNC |
| Z home before every tool change | Done | G91 G28 Z0 (Haas, Fanuc), G53 G0 Z0 (Mach3), G74 Z1=0 (Siemens); can be switched off |
| Tool list in the header | Done | T number, diameter, deepest Z, type, in order of use |
| Optional stop, line numbers | Done | |
| Coolant | Done | Off, flood M8, mist M7, flood and mist, through-spindle M88 (Haas; others get flood and a note); per-operation override |
| Canned cycles and their fallbacks | Done | A cycle a control lacks posts as moves with a note |
| Setup sheet | Done | |

## Verification

| Feature | Status | Notes |
|---|---|---|
| Simulation with stock removal and chips | Done | |
| Verify: gouge, holder, shank, rapids through stock, vise | Done | |
| Section view of the model, stock and toolpaths | Done | See below |
| Auto Program / Auto Detect | Locked | "Coming soon" for everyone while the 2D and 3D toolpaths are proven by hand. Tests turn it on with `window.DATUM_AUTO = true` |

## Section view

Cut the 3D view with a plane at any point along X, Y or Z, in Design and in Manufacture. The plane clips the model, the stock, the vise, the toolpaths and the simulation. The cut face of every solid is drawn as an engineering section: blueprint crosshatch at 45 degrees (each body at its own angle) with a bold outline. Position by slider, by typing in the display units, or by clicking the model. Opening sweeps the plane in and closing sweeps it out. `test/view.section.e2e.js` reads the rendered pixels to check it.

## Interface rules

Dark theme first with a light option; inches first with the metric value in parentheses; American spellings; every icon has a CSS tooltip (a long hover brings in the rich card) and its own hover motion; model changes play (extrude and friends grow, revolve turns, the rest dissolve) and anything hidden or deleted dissolves; every button is an outline, never a fill (ordinary, primary, the selected one of a group, toggles, ribbon icons, the embedded apps), with color swatches the one exception. Tests: `ui.defaults`, `ui.icons`, `ui.outlines`, `design.fx`.

## The dev tool tests all of it

Press the backtick key. "Modeling & page flows" now includes a check for each feature above (`dev-features.js`): section view, feature animation, icon tooltips and motion, outlined buttons, defaults, cutter compensation, post options, materials, the Auto lock, contour passes, a UX audit and a look at what the 3D view draws. The visual layer reads the 3D view back as pixels (what is drawn, in which colors, framed or not), measures text contrast against the color really behind it, finds text that is cut off, controls drawn over one another, targets under 18 px and icons with no name, in both themes and in Design and Manufacture, and uses the sharpness grade. It has already caught real faults (white text left on an outlined button, an unreadable key hint). Manufacture checks lift the Premium lock for their own length only; Auto Program stays locked. `window.__devFeatures.run()` runs them without the panel; `test/dev.features.e2e.js` runs them all.
