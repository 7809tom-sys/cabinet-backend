# Polygon Room Architecture Notes

## Current State

- `RoomData` = `{ width, depth, ceilingHeight?, wallCeilings? }` — a simple rectangle.
- `WallSide` = `"top" | "bottom" | "left" | "right"` — four fixed walls.
- `cabinetWall(p, room)` assigns a cabinet to a wall based on proximity/flush detection.
- `wallLength(side, room)` returns `room.width` or `room.depth`.
- `PlanCanvas.tsx` (1550 lines) renders the room as a single `<div data-room>` with `width: roomPxW, height: roomPxH`.
- `ElevationView.tsx` renders one wall at a time (the `activeWall`).
- `DesignTool.tsx` (7938 lines) orchestrates everything.
- `design.ts` (3505 lines) has all geometry helpers.
- Drafts persist `room` as JSON in localStorage and in `kitchenDesigns.roomData` (DB).
- The "Draw Room" button toggles `drawMode` which lets the user drag a rectangle on canvas.

## Design Decision: Additive Polygon via Wall Segments

Rather than replacing the entire room model (which would break 100+ functions), we'll add an **optional** `customWalls` array to `RoomData`. When present, the room is a polygon; when absent, it's the classic rectangle.

```ts
interface RoomVertex {
  id: string;   // stable ID for referencing
  x: number;    // inches from origin
  y: number;    // inches from origin
}

interface CustomWall {
  id: string;          // stable wall segment ID (replaces WallSide for polygon rooms)
  startVertexId: string;
  endVertexId: string;
  label?: string;      // user-facing name, e.g. "Back wall segment 1"
  ceilingOverride?: WallCeiling;
}

// Extended RoomData
interface RoomData {
  width: number;       // bounding box width (still used for ppi scaling)
  depth: number;       // bounding box depth
  ceilingHeight?: number;
  wallCeilings?: Partial<Record<WallSide, WallCeiling>>;
  // NEW: polygon room
  vertices?: RoomVertex[];
  customWalls?: CustomWall[];
}
```

## Backward Compatibility Strategy

- If `vertices` is undefined/empty → classic rectangle mode (all existing code works unchanged).
- If `vertices` is present → polygon mode. Helper functions will:
  - Compute bounding box for `width`/`depth` (for ppi scaling).
  - Map each `CustomWall` to a "virtual WallSide" for cabinet placement.
  - The elevation view shows one wall segment at a time.

## Wall-to-Cabinet Mapping for Polygon Rooms

Each `CustomWall` has an ID. Cabinets in polygon mode will store `wallId: string` instead of relying on proximity-based `cabinetWall()`. The `cabinetWall()` function will be extended:
- If room has `customWalls` and cabinet has `wallId` → return that wall's info.
- Otherwise fall back to classic proximity logic.

## Plan View Rendering

Instead of a single `<div>` rectangle, polygon rooms render as an SVG `<polygon>` with the vertices. Wall segments are clickable/draggable edges. Vertices are draggable handles.

## Split Tool

- User taps a wall segment → "Split" button appears.
- Clicking "Split" adds a new vertex at the midpoint of that segment, creating two new wall segments from the original one.
- The new vertex can then be dragged inward/outward.

## Elevation View

- Each `CustomWall` has a computed length (distance between its two vertices).
- The elevation view renders cabinets placed on that wall segment, using the segment length as the "wall width".
- Wall selector shows all custom wall segments (not just 4).

## Files to Modify

1. `client/src/lib/design.ts` — Add types, polygon helpers
2. `client/src/lib/polygonRoom.ts` — NEW: polygon-specific geometry (area, normals, point-in-polygon, split, vertex drag)
3. `client/src/components/design/PlanCanvas.tsx` — Render polygon shape, vertex handles, split tool
4. `client/src/components/design/RoomSizeControl.tsx` — Add "Custom Shape" entry point
5. `client/src/pages/DesignTool.tsx` — Wire polygon state, wall selector for N walls
6. `client/src/components/design/ElevationView.tsx` — Accept wall segment length instead of WallSide
