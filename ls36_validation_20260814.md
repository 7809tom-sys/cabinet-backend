# LS36 Live Validation — 2026-08-14

The live Ashford Corner palette exposes the affected cabinet as **LS3612 — 36-inch Lazy Susan Base Cabinet**. The card describes it as a lazy-Susan corner base, and its configured dimensions are 36 inches wide by 34.5 inches high. The earlier shared geometry implementation classified this family as a generic `l-shape`, which drew it through the CDB/easy-reach L-notch path.

The corrected shared contract now treats `LS36` / `LS3612` as a **36 × 36 diagonal-front Lazy Susan**, preserving the lazy-Susan mechanism label while using the same clipped diagonal plan and 3D conversion path as its saved footprint. The currently reported remaining issue is the price shown in the user's live design; price diagnosis must use the active cabinet-and-style price row rather than infer an amount from geometry or other SKUs.

## Persisted 3D mesh root cause and correction

The saved LS3612 record already reached the 3D mapper as a `diagonal-corner` with a 36 × 36 body. The visible issue remained because both door meshes and their Shaker frames were placed in the **center plane of the square body** (`z≈0`), not on the actual 45° clipped face. From the mobile camera, that made the correct body read as a regular rectangular base.

The published correction places the two doors and physical Shaker rails directly along the diagonal face plane, using the shared 36-inch footprint’s face center, normal offset, and tangent direction. A direct Three.js regression now verifies the persisted LS3612 door positions occupy the two ends of that diagonal plane and retain Shaker frames.
