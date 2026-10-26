# Blank-Slate Designer Comparison and Recommendation

## Access note

The exact link supplied for the Cabinets.com Blank Slate experience returned a **405 Not Allowed** response in this environment, so I could not run its live room-setup controls. The public Create-A-Kitchen overview states that its Blank Slate option is intended for smaller projects and lets customers draw a floor plan, choose a color palette, and select cabinets in any order.[^1]

> This recommendation therefore uses the public product description, the shared requirements already established for Cabinet Dealz, and the current Cabinet Dealz designer architecture. It does not claim to duplicate unobserved behavior from the blocked live flow.

## Practical comparison

| Area | Cabinets.com public Blank Slate positioning | Cabinet Dealz current strength | Recommended next step |
|---|---|---|---|
| Starting a project | Flexible draw-first, select-first workflow | Existing room-shape/layout starters and catalog-aware placement | Offer a short optional setup path before the canvas: room dimensions, ceiling height, openings, then layout starter. Keep **Skip to canvas** for experienced users. |
| Layout guidance | Blank-slate control plus guided alternative | Collision guard, snap-to-edge, room presets, and 2D/3D parity rules | Add a persistent **Design checks** panel that explains unresolved gaps, blocked microwave-over-range placement, missing fillers, and wall-run problems with one-click fixes. |
| Cabinet selection | User chooses cabinets and palette in the same project flow | Live catalog, door styles, finish-aware 3D range variants, materials, appliance rules | Keep Cabinet Dealz’s catalog source of truth, but surface a visual project summary showing selected style, finish, countertop, appliances, and room measurements. |
| Visualization | Virtual kitchen preview is a principal product promise | 2D plan, elevation, interactive 3D, and current appliance/cabinet realism work | Add named camera presets—**Front Elevation**, **Corner View**, **Walk-In View**, and **Appliance Detail**—so users can validate specific construction decisions quickly. |

## Recommended implementation order

| Priority | Improvement | Why it matters |
|---|---|---|
| 1 | **Optional Room Setup Wizard** | Makes the first blank-canvas action clear without removing expert flexibility. It should collect room width, depth, ceiling height, doors/windows, and an optional layout starter. |
| 2 | **Design Checks and Fix Actions** | Converts hard-to-understand placement errors into specific actions. This is especially valuable for microwave-over-range, corner cabinet orientation, fillers, appliance clearances, and wall-run gaps. |
| 3 | **Named 2D/3D Validation Views** | Lets customers inspect the exact issue they are working on instead of rotating a scene manually. It supports the current catalog-faithful rendering strategy. |
| 4 | **Selected Product/Finish Summary** | Keeps the chosen catalog cabinet and appliance variants visible, preventing a generic visual from being mistaken for the selected product. |

## Recommendation

> Start with **Design Checks and Fix Actions**. Cabinet Dealz already has stronger catalog integration and collision logic than a generic blank-slate tool. The greatest usability gain now is explaining the designer’s rules in plain language and offering a one-click correction rather than asking a customer to infer why a placement failed.

[^1]: [Cabinets.com, Create-A-Kitchen](https://www.cabinets.com/create-a-kitchen)
