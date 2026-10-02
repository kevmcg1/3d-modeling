# Stress studies: toe clamps and screws

Generated with the app's **Alloy & setup study** (Stress → *Compare alloys* / *All setups*). Safety factor = yield ÷ von Mises, away from supports and loads, and the lower of the solver and a hand check where one exists (brittle cast iron: solver only). **Bold = below 1 (yields).** Screening numbers on a voxel mesh: confirm critical parts with a body-fitted mesh and test.

## Method

- One solve per setup; each alloy is read off that stress field (stress does not depend on stiffness when the loads are forces — checked: steel, 6061, cast iron, brass, Ti and nylon give the same peak von Mises within 1 %), so yield sets the safety factor, modulus the movement, density the mass.
- Toe clamp: the cap screw preload (torque ÷ (0.2 × d)) bears on the counterbore seat; the toe pad is frictionless, the heel pad fixed. Fine mesh. Hand check: beam between the pads, section under the counterbore. Solver and hand check agree within 3 % for the M10 and M12 clamps.
- Cap screw: engaged thread (1.5 d) held, load through the head; thread modeled as a smooth cylinder of the ISO 898 tensile stress area. Normal mesh. Solver peaks at the held thread top and inside the singular edge are mesh-dependent; the hand check on the thread's stress diameter is the bound there.

## M10 toe clamp (50×28×22)

| Alloy | Yield MPa | 1 | 2 | 3 | 4 |
|---|---:|---:|---:|---:|---:|
| Aluminum 6061-T6 | 276 | 3.58 | 1.19 | **0.72** | 1.19 |
| Aluminum 7075-T6 | 503 | 6.53 | 2.18 | 1.31 | 2.18 |
| Steel 1018, cold drawn | 370 | 4.80 | 1.60 | **0.96** | 1.60 |
| Steel 4140, heat treated | 655 | 8.50 | 2.83 | 1.70 | 2.83 |
| Stainless steel 304 | 215 | 2.79 | **0.93** | **0.56** | **0.93** |
| Cast iron, gray | 130 | 6.71 | 2.24 | 1.34 | 2.69 |
| Ductile iron 65-45-12 | 310 | 4.02 | 1.34 | **0.80** | 1.34 |
| Titanium Ti-6Al-4V | 880 | 11.42 | 3.81 | 2.28 | 3.81 |
| Brass C360 | 310 | 4.02 | 1.34 | **0.80** | 1.34 |

1. Light clamping, 5 kN (10 N·m on the M10)
2. Normal clamping, 15 kN (30 N·m on the M10)
3. Wrench-tight, 25 kN (50 N·m on the M10)
4. Normal clamping, 15 kN (30 N·m on the M10) + 3 kN cutting load

## M8 toe clamp (40×24×18)

| Alloy | Yield MPa | 1 | 2 | 3 | 4 |
|---|---:|---:|---:|---:|---:|
| Aluminum 6061-T6 | 276 | 1.93 | **0.64** | **0.39** | **0.65** |
| Aluminum 7075-T6 | 503 | 3.53 | 1.18 | **0.71** | 1.19 |
| Steel 1018, cold drawn | 370 | 2.59 | **0.86** | **0.52** | **0.88** |
| Steel 4140, heat treated | 655 | 4.59 | 1.53 | **0.92** | 1.55 |
| Stainless steel 304 | 215 | 1.51 | **0.50** | **0.30** | **0.51** |
| Cast iron, gray | 130 | 4.82 | 1.61 | **0.96** | 1.73 |
| Ductile iron 65-45-12 | 310 | 2.17 | **0.72** | **0.43** | **0.74** |
| Titanium Ti-6Al-4V | 880 | 6.17 | 2.06 | 1.23 | 2.09 |
| Brass C360 | 310 | 2.17 | **0.72** | **0.43** | **0.74** |

1. Light clamping, 6 kN (10 N·m on the M8)
2. Normal clamping, 19 kN (30 N·m on the M8)
3. Wrench-tight, 31 kN (50 N·m on the M8)
4. Normal clamping, 19 kN (30 N·m on the M8) + 3 kN cutting load

## M12 toe clamp (60×34×26)

| Alloy | Yield MPa | 1 | 2 | 3 | 4 |
|---|---:|---:|---:|---:|---:|
| Aluminum 6061-T6 | 276 | 5.63 | 1.88 | 1.13 | 1.88 |
| Aluminum 7075-T6 | 503 | 10.26 | 3.42 | 2.05 | 3.42 |
| Steel 1018, cold drawn | 370 | 7.55 | 2.52 | 1.51 | 2.52 |
| Steel 4140, heat treated | 655 | 13.37 | 4.46 | 2.67 | 4.46 |
| Stainless steel 304 | 215 | 4.39 | 1.46 | **0.88** | 1.46 |
| Cast iron, gray | 130 | 11.03 | 3.68 | 2.21 | 4.46 |
| Ductile iron 65-45-12 | 310 | 6.33 | 2.11 | 1.27 | 2.11 |
| Titanium Ti-6Al-4V | 880 | 17.96 | 5.99 | 3.59 | 5.99 |
| Brass C360 | 310 | 6.33 | 2.11 | 1.27 | 2.11 |

1. Light clamping, 4 kN (10 N·m on the M12)
2. Normal clamping, 12 kN (30 N·m on the M12)
3. Wrench-tight, 21 kN (50 N·m on the M12)
4. Normal clamping, 12 kN (30 N·m on the M12) + 3 kN cutting load

## M6×24 socket head cap screw

| Alloy | Yield MPa | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Bolt steel, class 8.8 | 640 | 1.29 | **0.52** | 1.08 | **0.90** | **0.47** | **0.51** |
| Bolt steel, class 10.9 | 940 | 1.89 | **0.76** | 1.58 | 1.33 | **0.69** | **0.74** |
| Bolt steel, class 12.9 | 1100 | 2.21 | **0.89** | 1.85 | 1.55 | **0.81** | **0.87** |
| Stainless A2-70 (304) | 450 | **0.91** | **0.36** | **0.76** | **0.64** | **0.33** | **0.36** |
| Stainless A4-80 (316) | 600 | 1.21 | **0.48** | 1.01 | **0.85** | **0.44** | **0.47** |
| Stainless 17-4 PH, H1025 | 1000 | 2.01 | **0.80** | 1.68 | 1.41 | **0.74** | **0.79** |
| Titanium Ti-6Al-4V | 880 | 1.77 | **0.71** | 1.48 | 1.24 | **0.65** | **0.70** |
| Aluminum 7075-T73 | 435 | **0.88** | **0.35** | **0.73** | **0.61** | **0.32** | **0.34** |
| Brass C360 | 310 | **0.62** | **0.25** | **0.52** | **0.44** | **0.23** | **0.25** |

Hand-check von Mises on the thread's stress diameter, MPa: 1: 497, 2: 1242, 3: 595, 4: 708, 5: 1360, 6: 1264

1. Axial tension 10 kN
2. Axial tension 25 kN (about 75 % of proof load, class 8.8)
3. Sideways 1 kN along the grip (shear and bending)
4. Bending: 500 N sideways on the head
5. Tightening torque 20 N·m
6. Tightening: 15 kN preload + 15 N·m torque

## M8×32 socket head cap screw

| Alloy | Yield MPa | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Bolt steel, class 8.8 | 640 | 2.34 | **0.94** | 1.98 | 1.66 | 1.15 | 1.10 |
| Bolt steel, class 10.9 | 940 | 3.44 | 1.38 | 2.91 | 2.44 | 1.70 | 1.61 |
| Bolt steel, class 12.9 | 1100 | 4.03 | 1.61 | 3.40 | 2.86 | 1.98 | 1.88 |
| Stainless A2-70 (304) | 450 | 1.65 | **0.66** | 1.39 | 1.17 | **0.81** | **0.77** |
| Stainless A4-80 (316) | 600 | 2.20 | **0.88** | 1.85 | 1.56 | 1.08 | 1.03 |
| Stainless 17-4 PH, H1025 | 1000 | 3.66 | 1.46 | 3.09 | 2.60 | 1.80 | 1.71 |
| Titanium Ti-6Al-4V | 880 | 3.22 | 1.29 | 2.72 | 2.29 | 1.59 | 1.51 |
| Aluminum 7075-T73 | 435 | 1.59 | **0.64** | 1.34 | 1.13 | **0.78** | **0.75** |
| Brass C360 | 310 | 1.13 | **0.45** | **0.96** | **0.81** | **0.56** | **0.53** |

Hand-check von Mises on the thread's stress diameter, MPa: 1: 273, 2: 683, 3: 324, 4: 385, 5: 554, 6: 584

1. Axial tension 10 kN
2. Axial tension 25 kN (about 75 % of proof load, class 8.8)
3. Sideways 1 kN along the grip (shear and bending)
4. Bending: 500 N sideways on the head
5. Tightening torque 20 N·m
6. Tightening: 15 kN preload + 15 N·m torque

## M10×40 socket head cap screw

| Alloy | Yield MPa | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Bolt steel, class 8.8 | 640 | 3.71 | 1.48 | 3.15 | 2.65 | 2.30 | 1.93 |
| Bolt steel, class 10.9 | 940 | 5.45 | 2.18 | 4.63 | 3.90 | 3.38 | 2.83 |
| Bolt steel, class 12.9 | 1100 | 6.38 | 2.55 | 5.42 | 4.56 | 3.96 | 3.31 |
| Stainless A2-70 (304) | 450 | 2.61 | 1.04 | 2.22 | 1.86 | 1.62 | 1.35 |
| Stainless A4-80 (316) | 600 | 3.48 | 1.39 | 2.96 | 2.49 | 2.16 | 1.81 |
| Stainless 17-4 PH, H1025 | 1000 | 5.80 | 2.32 | 4.93 | 4.14 | 3.60 | 3.01 |
| Titanium Ti-6Al-4V | 880 | 5.10 | 2.04 | 4.34 | 3.65 | 3.16 | 2.65 |
| Aluminum 7075-T73 | 435 | 2.52 | 1.01 | 2.14 | 1.80 | 1.56 | 1.31 |
| Brass C360 | 310 | 1.80 | **0.72** | 1.53 | 1.28 | 1.11 | **0.93** |

Hand-check von Mises on the thread's stress diameter, MPa: 1: 172, 2: 431, 3: 203, 4: 241, 5: 278, 6: 332

1. Axial tension 10 kN
2. Axial tension 25 kN (about 75 % of proof load, class 8.8)
3. Sideways 1 kN along the grip (shear and bending)
4. Bending: 500 N sideways on the head
5. Tightening torque 20 N·m
6. Tightening: 15 kN preload + 15 N·m torque

## M12×48 socket head cap screw

| Alloy | Yield MPa | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Bolt steel, class 8.8 | 640 | 4.24 | 1.70 | 4.60 | 3.87 | 4.03 | 2.32 |
| Bolt steel, class 10.9 | 940 | 6.23 | 2.49 | 6.76 | 5.69 | 5.92 | 3.40 |
| Bolt steel, class 12.9 | 1100 | 7.28 | 2.91 | 7.91 | 6.65 | 6.93 | 3.98 |
| Stainless A2-70 (304) | 450 | 2.98 | 1.19 | 3.24 | 2.72 | 2.83 | 1.63 |
| Stainless A4-80 (316) | 600 | 3.97 | 1.59 | 4.32 | 3.63 | 3.78 | 2.17 |
| Stainless 17-4 PH, H1025 | 1000 | 6.62 | 2.65 | 7.19 | 6.05 | 6.30 | 3.62 |
| Titanium Ti-6Al-4V | 880 | 5.83 | 2.33 | 6.33 | 5.32 | 5.54 | 3.18 |
| Aluminum 7075-T73 | 435 | 2.88 | 1.15 | 3.13 | 2.63 | 2.74 | 1.57 |
| Brass C360 | 310 | 2.05 | **0.82** | 2.23 | 1.88 | 1.95 | 1.12 |

Hand-check von Mises on the thread's stress diameter, MPa: 1: 119, 2: 297, 3: 139, 4: 165, 5: 159, 6: 214

1. Axial tension 10 kN
2. Axial tension 25 kN (about 75 % of proof load, class 8.8)
3. Sideways 1 kN along the grip (shear and bending)
4. Bending: 500 N sideways on the head
5. Tightening torque 20 N·m
6. Tightening: 15 kN preload + 15 N·m torque
