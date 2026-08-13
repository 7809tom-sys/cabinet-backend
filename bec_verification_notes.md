# BEC-24 live verification

On the public Cabinet Config/catalog route for `BEC-24`, the current page still labels the cabinet as **Diagonal Corner Base** and displays a diagonal-corner drawing, despite the intended Base End Cabinet classification. This confirms the public catalog/renderer is still resolving stale or inferred corner metadata and requires a correction before the BEC end-cabinet task can be closed.

After the end-angle resolver correction, the same public route was rechecked. It now shows **Base End Angle Cabinet**, uses the accessible description **base end cabinet with angled outer face**, and renders a normal end-of-run door-box elevation rather than a diagonal room-corner drawing. The live route verification was captured at `2026-08-13_01-17-57_6147.webp`.

The main designer route was reopened for a BEC plan/elevation check. It loaded the standard design launch gate, ready for a controlled test session. The next verification step is to launch the session, place `BEC-24`, and compare its plan and elevation against a diagonal corner fixture.

The controlled Zenith Sage designer session launched successfully. Its current line-specific catalog does not include `BEC-24`, so it cannot be placed live under Zenith Sage until a compatible BEC SKU is associated with that finish line. The session did confirm that `BA-24` remains a distinct **right-triangle** specialty cabinet, which must not be confused with the reclassified BEC end cabinet.

The live Ashford/Faircrest source was subsequently verified as cabinet `BA-24` (id `9390014`), described as **24-inch Base End Angle Cabinet**. Its 13 active, published Ashford style mappings were copied to `BEC-24` (id `9450022`) with the same available cost data and the supplier's verified `*-BA24` ordering SKU retained. The BEC-24 Cabinet Config record is now active, Base placement, `endCap` product type, explicitly non-corner, designer-visible, and has a **null corner type**; the obsolete `triangle` corner setting was cleared. The designer integration regression confirms it is returned for Ashford style `330001`.

The browser reached the designer at `2026-08-13 03:03 CDT`, but the public route requires a customer email to launch a live design session. No test lead was created. A final visual place-and-compare check therefore remains pending a real design session, while automated catalog and drawing-type coverage is passing.

Automated coverage now verifies the full non-corner route: the Ashford palette returns active `BEC-24`; the plan geometry keeps its normal 24-by-24 end-of-run footprint instead of a diagonal or blind-corner footprint; and the elevation renderer keeps its full rectangular cabinet front without a clipped roof or corner face. A normal `DCB-36` diagonal corner remains excluded from the end-angle route.
