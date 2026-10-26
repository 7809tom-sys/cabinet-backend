# Countertop regression on free-standing cabinets (2026-10-03 evening)

User screenshot /home/ubuntu/upload/Screenshot2026-10-03192849.png: 3 free-standing dark base cabinets in a row + one at 45°, in an empty room.
Symptoms: tops look like separate per-box slabs with a step; a long white slab floats along the back wall BEHIND the cabinets.

Root cause (found):
- Commit 3e50770e0 (11:32 today, a different session) made the 3D view suppress the per-cabinet countertop for EVERY counter-bearing base
  (`suppressCountertop: sharedCountertopSurface = bearsCountertop(cabinet)`) and render tops only from the shared `countertopSurfaces()` via new
  `addThreeDStandardCountertops()` in InteractiveRoom3D.tsx (~line 5969).
- `countertopSurfaces()` (design.ts ~11874) places surfaces by WALL: a cabinet with no wallId at (x=40..112, y=70) yields rect [40,118.5,72,25.5] (snapped to bottom wall),
  and the 45° one yields [166.5,74,25.5,34] (snapped to right wall). This was the same before/after (verified on 8b43948 design.ts); Floor Plan already had this.
- So in 3D, free-standing cabinets now get NO top (the white "slabs" are carcass tops) and the shared slab floats on the wall.

Fix plan: in InteractiveRoom3D, only suppress the per-cabinet top when a shared surface actually covers that cabinet's footprint (polygon/rect overlap with the cabinet centre);
and in addThreeDStandardCountertops skip surfaces that don't overlap any of the cabinets they were built from (or any base). Keep Floor Plan untouched.
Diag test file: client/src/lib/diag_free.test.ts (delete when done). Render script: /tmp/render_free.py + /tmp/inject_free.js (copy to client/public/__qa_inject.js, delete after).
Saved designs verified intact: 45 rows, carbon frost 12x16 = 22 cabinets.
