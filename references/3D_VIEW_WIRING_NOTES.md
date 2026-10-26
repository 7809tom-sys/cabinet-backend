# Geometry 3D View — wiring notes (in progress)

## New files
- `client/src/lib/room3d.ts` — pure geometry: `buildRoomBoxes({room, placed, surfaces, finishText, secondFinishText})` → `Box3D[]`. Also `surfaceColorsFromPicks`, `hasSinkPick`, `DEFAULT_SURFACE_COLORS`. World units = INCHES; plan (x,y)→world (x,z); y=up.
- `client/src/components/design/Room3DView.tsx` — three.js dialog. Props: open, onOpenChange, room, placed, surfaces, finishText, secondFinishText, activeWall, onOpenAiPreview. Uses OrbitControls, renders in feet (U=1/12).

## DesignTool.tsx wiring
- Import added (line ~110): `import { Room3DView } from "@/components/design/Room3DView";`
- State: `render3dOpen` = AI preview (existing), NEW `room3dOpen` = geometry view (line ~3475).
- `open3dView` → now `setRoom3dOpen(true)` (NO gate). NEW `openAiPreview` → gated, `setRender3dOpen(true)` (line ~3494-3508).
- `activeStyleName` (line ~1033) = finish text for cabinet color. `activeWall` state (line 373).
- `selectedSurfaces` = SelectedSurface[] state (surfaces picks).

## STILL TODO
- Desktop toolbar (~3688): add primary "3D View" button (calls open3dView) BEFORE the AI PhotorealPreview; change PhotorealPreview onBeforeOpen path to stay as "AI Preview".
- Mobile bottom bar (~5871): "3D View" button already calls open3dView (now geometry). Add an "AI Preview" entry to More menu if desired.
- Render `<Room3DView open={room3dOpen} onOpenChange={setRoom3dOpen} room={room} placed={placed} surfaces={selectedSurfaces} finishText={activeStyleName} activeWall={activeWall} onOpenAiPreview={openAiPreview} />` near the headless PhotorealPreview (~5885).
- Add a desktop headless/controlled AI PhotorealPreview driven by render3dOpen so openAiPreview works on desktop too (currently only mobile has headless instance). Simplest: make the existing mobile headless PhotorealPreview always-rendered (not inside mobile-only block) OR add a second controlled instance.
- Tests: room3d.test.ts (box math: floor/walls always present; base cabinet→box+counter; wall cabinet bottom=54; sink only when sink pick; surfaceColorsFromPicks mapping).
- typecheck + full suite + browser verify + checkpoint.
