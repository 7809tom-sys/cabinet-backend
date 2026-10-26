# Persist selected surfaces in saved designs

- [x] Add `selectedSurfaces` JSON column to kitchen_designs (schema + migration 0054 applied)
- [x] Extend design.save input + create/update writes to include selectedSurfaces
- [x] byId returns full row (selectedSurfaces included via select())
- [x] Client save mutation payload includes selectedSurfaces (DesignActions)
- [x] Saved-design load (?id/?load) hydrates selectedSurfaces via loadSavedDesign + applySurfaceRenderMaterials
- [x] Local draft snapshot + restore includes selectedSurfaces
- [x] Tests for design.save round-trip of selectedSurfaces (design.selectedSurfaces.test.ts, 2 tests passing)
- [x] Typecheck clean (tsc --noEmit) after wiring; full suite + browser verify pending combined checkpoint with 3D view

# Geometry-based 3D room view (replaces looping AI render as the DEFAULT)

- [x] Investigate current AI 3D render loop (PhotorealPreview / buildPhotorealSceneInput / render request) + why it loops
- [x] Add three.js (+ OrbitControls) dependency
- [x] Build Room3DView component: floor, 4 walls, base/wall/tall cabinet boxes, countertop slab, backsplash strip, sink cutout — from room + placed cabinets
- [x] Color by selected door style + Pelican surface picks (floor/counter/backsplash colors)
- [x] Open facing the active wall's elevation by default; orbit + zoom (OrbitControls)
- [x] Make this the default "3D View" button; keep AI photoreal as an optional "AI Preview" button
- [x] Handle empty/partial designs gracefully (no loop, clear message)
- [x] Test, typecheck, browser-verify, checkpoint, deliver

# Remove broken AI PhotorealPreview from Designer

- [x] Remove all 3 PhotorealPreview JSX instances (desktop toolbar, mobile More menu, headless controlled)
- [x] Remove render3dOpen/setRender3dOpen state
- [x] Remove openAiPreview callback
- [x] Remove onOpenAiPreview prop from Room3DView
- [x] Remove buildPhotorealSceneInput useCallback
- [x] Remove unused imports (PhotorealPreview, PhotorealSceneInput, buildPhotorealScene)
- [x] Remove renderReadiness/computeRenderReadiness (only used by AI preview gate)
- [x] Fix stale comment fragment ("Drives the mobile bottom-bar '3D View' button, which opens the same AI")
- [x] TypeScript clean (tsc --noEmit passes)
- [x] Full test suite green (1,303 tests passing)
- [x] Save checkpoint
