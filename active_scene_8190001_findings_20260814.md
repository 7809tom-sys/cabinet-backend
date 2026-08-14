# Active Scene 8190001 Findings

The public saved-design payload confirms that the live Aspin kitchen persists its range, hood, and refrigerator as actual appliance placements, rather than legacy base-cabinet fallbacks. The range is `RANGE-30` at `(x: 0, y: 45)` with a 90-degree rotation, the hood is `HOOD-30` at `(x: 3.5, y: 45)` with a 90-degree rotation and a 66-inch mount bottom, and the refrigerator is `FRIDGE-36` at `(x: 0.75, y: 108)` with a 90-degree rotation. The design also carries the refrigerator-wall cabinet `WR3624` and a 96-inch refrigerator end panel.

The floor run includes CDB36, DB-18-3, SB-36, DB-30-3, and B-33 base records, all saved at 34.5 inches high. These records establish the real persisted scene to use for 4.5-inch toe-kick and appliance-alignment regression coverage; any remaining live mismatch is therefore in the shared transform or mesh construction, not in absent 2D placement data.

## Live preview access check

On 2026-08-14, the direct URL `/design?load=8190001&preview=3d` reached the public design-verification form rather than the saved scene because the current browser session is not verified for the design owner. The saved scene remains covered by the deterministic renderer regression; a visual mobile-scene review requires the owner session or the verification email associated with the design.

On a subsequent 2026-08-14 review attempt through the production domain, the page reached the Design Tool route but remained in its loading state without an authenticated session. The complete visual audit therefore remains pending the owner or signed-in administrator browser context; no saved-scene geometry was changed by this access check.

The managed project preview was subsequently able to load the active saved design’s mobile 3D modal. At a 390-by-1500 viewport it reported 20 synchronized cabinet items and rendered the complete kitchen scene with the saved countertop, appliance, and cabinet run. This confirms that the current 3D route reaches a rendered scene rather than a fallback screen. It does not by itself visually cover every catalog corner family, so the all-family visual-review checklist item remains open while the cross-family mesh regression supplies deterministic coverage.
