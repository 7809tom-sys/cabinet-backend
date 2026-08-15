# BEC-24 Visual Verification Notes

The supplied `bec24.jpg` reference defines the cabinet as a **24-inch by 24-inch floor-standing end return**. It has two exposed rectangular faces meeting at the outside corner, a 34½-inch overall cabinet height, and a recessed base/toe-kick line. It is not a 36-inch lazy-Susan, a diagonal corner, or a triangle wedge.

The nearby historical mobile screenshot `Screenshot_20260813_122610_Chrome.jpg` shows the earlier BA-24 placement as a floating catalog drawing image on the right of an elevation rather than a measured live end-return geometry. That historical state is the exact artifact addressed by the completed BEC-24 geometry and thumbnail-suppression regressions. It does not itself confirm the current live elevation after the repair, so the user-screenshot comparison checklist remains appropriately open.

| Required visual contract | Current automated coverage | Remaining evidence needed |
| --- | --- | --- |
| 24×24 end-return footprint | Plan and geometry regression | Current live plan screenshot |
| Two true 12-inch exposed return faces | Elevation and specialty-profile regression | Current live elevation screenshot |
| 34½-inch cabinet height with 4½-inch toe kick | Shared base/elevation regression | Current live mobile comparison |
| No floating catalog thumbnail | Elevation renderer regression | Current live mobile comparison |

The deterministic 3D regression now also measures both legacy `BA-24` and canonical `BEC-24` as two 11.04-inch visible return faces at opposing 45-degree poses, one 4½-inch base toe kick, one 24¼-inch countertop surface, and a 24-by-24-inch carcass. This protects the shared renderer against an accidental fallback to a standard rectangular cabinet, a 36-inch corner profile, a missing toe kick, or a surface-less end return while the final live mobile comparison remains pending.

The shared 2D geometry suite now separately asserts that both canonical `BEC-24` and legacy `BA-24` normalize to the `base-end` placement kind, a 24-by-24-inch plan footprint, and a floor-mounted 34½-inch elevation box. Together with the existing angled-face markup, this protects the 12-inch left/right doors and center seam without requiring a customer-design mutation. The current live mobile comparison remains the only open BEC evidence item.
