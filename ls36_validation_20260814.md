# LS36 Live Validation — 2026-08-14

The live Ashford Corner palette exposes the affected cabinet as **LS3612 — 36-inch Lazy Susan Base Cabinet**. The card describes it as a lazy-Susan corner base, and its configured dimensions are 36 inches wide by 34.5 inches high. The earlier shared geometry implementation classified this family as a generic `l-shape`, which drew it through the CDB/easy-reach L-notch path.

The corrected shared contract now treats `LS36` / `LS3612` as a **36 × 36 diagonal-front Lazy Susan**, preserving the lazy-Susan mechanism label while using the same clipped diagonal plan and 3D conversion path as its saved footprint. The currently reported remaining issue is the price shown in the user's live design; price diagnosis must use the active cabinet-and-style price row rather than infer an amount from geometry or other SKUs.
