# Live Verification Notes

## 2026-08-19 — 3D Cabinet Edit Panel

The available browser session reaches the Design Tool launch form but is not authenticated and has no active design record. It therefore cannot open a placed cabinet’s 3D edit panel to verify linked aliases, similar-master candidates, merge controls, or administrator confirmation controls. This remaining check requires an authenticated account with a saved design containing at least one placed cabinet.

## 2026-08-19 — Physical Room Measurement Route

The new `/measure` route loads the standalone camera/photo physical-measurement interface in the development preview instead of falling through to a not-found route. Completing a protected session transfer still requires an authenticated designer session and a phone measurement submission.

## 2026-08-19 — Bundle-to-Designer Price Path

The development preview accepts the Onyx Shadow bundle URL (`/design?bundleId=30001`) and reaches the Design Tool contact gate. The available browser session is not authenticated, so it cannot proceed through the saved-design flow to visually inspect the verified bundle price inside the designer, cart, or checkout. The public bundle API was separately verified to return the persisted `homeownerPrice` of `$4,116.84` while retaining the previous `$13,722.76` value only as non-displayed diagnostic metadata.
