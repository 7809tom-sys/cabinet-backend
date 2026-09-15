import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const editorSource = readFileSync(resolve(root, "client/src/components/design/PolygonRoomEditor.tsx"), "utf8");
const designToolSource = readFileSync(resolve(root, "client/src/pages/DesignTool.tsx"), "utf8");
const planCanvasSource = readFileSync(resolve(root, "client/src/components/design/PlanCanvas.tsx"), "utf8");
const threeDSource = readFileSync(resolve(root, "client/src/components/design/InteractiveRoom3D.tsx"), "utf8");
const roomSizeSource = readFileSync(resolve(root, "client/src/components/design/RoomSizeControl.tsx"), "utf8");

describe("selected-wall Compass editor", () => {
  it("uses tap-to-select as the default and presents a Compass on the selected wall", () => {
    expect(editorSource).toContain('useState<Mode>("select")');
    expect(editorSource).toContain("Edit selected wall with Compass");
    expect(editorSource).toContain("Edit ${wall.label ?? \"selected wall\"} with Compass");
  });

  it("uses one draggable Compass on the selected normal-plan wall and direct mobile entry", () => {
    expect(planCanvasSource).toContain("Drag Compass along ${wallLabel[side]} wall to set the peninsula split point");
    expect(planCanvasSource).toContain('onWallCompassDrop?: (side: WallSide, startIn: number) => void;');
    expect(planCanvasSource).toContain("onCompassPointerUp");
    expect(roomSizeSource).toContain('data-testid="mobile-wall-compass-entry"');
    expect(roomSizeSource).toContain("Drag 45° on selected wall");
    expect(designToolSource).toContain('data-testid="compact-workspace-wall-compass"');
    expect(designToolSource).toContain("const activateSelectedWallCompassDrag = useCallback");
    expect(designToolSource).toContain("onOpenWallCompass={() => {");
    expect(designToolSource).toContain("activateSelectedWallCompassDrag();");
    expect(designToolSource).not.toContain("openSelectedWallCompass");
    expect(editorSource).toContain("showCanvasEditor = true");
    expect(designToolSource).toContain("onDone={() => setPolygonEditMode(false)}");
  });

  it("wires the draggable Compass drop into both full and compact split-plan canvases", () => {
    expect((designToolSource.match(/wallCompassStartIn=\{compassWallStartIn\}/g) ?? []).length).toBe(2);
    expect((designToolSource.match(/onWallCompassDrop=\{beginPeninsulaFromCompass\}/g) ?? []).length).toBe(2);
    expect(designToolSource).toContain("const beginPeninsulaFromCompass = useCallback");
    expect(designToolSource).toContain("setPeninsulaDraft({");
    expect(designToolSource).toContain("const commitPeninsulaDraft = useCallback");
    expect(planCanvasSource).toContain('onWallCompassDrop?: (side: WallSide, startIn: number) => void;');
    expect(planCanvasSource).toContain("handle establishes a real peninsula split point");
  });

  it("keeps a normal-plan wall touch select-only and reserves room changes for explicit controls", () => {
    expect(planCanvasSource).toContain("const onWallPointerDown = (e: React.PointerEvent, side: WallSide) => {");
    expect(planCanvasSource).toContain("onSelectWall?.(side);");
    expect(planCanvasSource).toContain("Moving a pointer while selecting");
    expect(planCanvasSource).not.toContain("onResizeWall");
    expect(planCanvasSource).not.toContain("wallDrag");
    expect(planCanvasSource).not.toContain("wallPreview");
    expect(designToolSource).not.toContain("resizeRoomByWall");
    expect(designToolSource).not.toContain("onResizeWall={resizeWall}");
  });

  it("keeps the direct Compass activation popup-free", () => {
    expect(designToolSource).toContain("const activateSelectedWallCompassDrag = useCallback");
    expect(designToolSource).toContain("Drag the gold 45° Compass");
    expect(designToolSource).toContain('onClick={activateSelectedWallCompassDrag}');
    expect(designToolSource).not.toContain("openSelectedWallCompass");
    expect(designToolSource).not.toContain("setCompassWallRequestId((current) => current + 1);");
  });

  it("keeps the plan uncluttered by removing base and wall opening chips while retaining the Compass", () => {
    expect(planCanvasSource).toContain("selected-wall Compass is the sole persistent wall-editing affordance");
    expect(planCanvasSource).toContain("Drag Compass along ${wallLabel[side]} wall to set the peninsula split point");
    expect(planCanvasSource).not.toContain('aria-label={`Select ${formatInches(g.length)} ${g.layer}-cabinet opening for best-fit options`}');
    expect(planCanvasSource).not.toContain('{g.layer === "wall" ? "W " : "B "}{formatInches(g.length)}');
  });

  it("keeps wall-measurement logic separate from the direct Compass gesture", () => {
    expect(editorSource).toContain("Wall height (inches)");
    expect(editorSource).toContain("Wall length (inches)");
    expect(designToolSource).toContain("setCompassWallStartIn(exactStart);");
    expect(designToolSource).toContain("Choose its angle, height, and pull length.");
    expect(planCanvasSource).toContain("Math.abs(movement) < 0.5");
  });

  it("keeps the new peninsula continuation inline, popup-free, and pull-to-length", () => {
    expect(designToolSource).toContain('data-testid="peninsula-inline-builder"');
    expect(designToolSource).toContain("Create peninsula run");
    expect(planCanvasSource).toContain('data-testid="peninsula-run-draft"');
    expect(planCanvasSource).toContain('data-testid="peninsula-run-segment"');
    expect(planCanvasSource).toContain("onPeninsulaDraftLengthChange");
    expect(designToolSource).toContain("const activePeninsulaRun = peninsulaRunById(room, targetWall ?? activeWall);");
    expect(planCanvasSource).toContain("peninsulaRunHitAtPoint(room, point");
    expect(designToolSource).toContain("peninsulaSide: spot.peninsulaSide");
    expect(designToolSource).toContain('data-testid="edit-selected-wall-trigger"');
    expect(designToolSource).toContain("Edit selected wall");
    expect(designToolSource).toContain("Move or remove cabinets on this peninsula before changing its split point, angle, direction, or length.");
  });

  it("lets the selected-cabinet Snap to wall action target the selected peninsula run", () => {
    expect(designToolSource).toContain("const snapSelectedToWall = useCallback");
    expect(designToolSource).toContain("const peninsula = peninsulaRunById(room, side);");
    expect(designToolSource).toContain("const segments = freeSegmentsOnWall(");
    expect(designToolSource).toContain("const along = nearestAvailableWallStart(segments, requestedAlong, selected.width);");
    expect(designToolSource).toContain("wallId: peninsula.id");
    expect(designToolSource).toContain("onPickPeninsula={snapSelectedToWall}");
  });

  it("provides direct joined-end dragging, far-end resizing, and right-click settings for committed peninsula walls", () => {
    expect(planCanvasSource).toContain('onPeninsulaAttachmentChange?: (runId: string, startOffset: number) => void;');
    expect(planCanvasSource).toContain('onPeninsulaRunLengthChange?: (runId: string, length: number) => void;');
    expect(planCanvasSource).toContain("const onPeninsulaAttachmentPointerDown");
    expect(planCanvasSource).toContain("const onPeninsulaLengthPointerDown");
    expect(planCanvasSource).toContain('aria-label="Drag joined peninsula end along adjoining wall"');
    expect(planCanvasSource).toContain("onOpenWallSettings?.(run.id as WallSide);");
    expect(designToolSource).toContain("const movePeninsulaAttachment = useCallback");
    expect(designToolSource).toContain("const resizePeninsulaRun = useCallback");
    expect(designToolSource).toContain('cabinetSide: peninsula?.cabinetSide ?? "left"');
  });

  it("blocks a geometry edit before a cabinet can become orphaned", () => {
    expect(editorSource).toContain("Move or remove the");
    expect(editorSource).toContain("The wall was not changed.");
    expect(designToolSource).toContain("cabinetUidsByWall={cabinetUidsByCustomWall}");
  });

  it("uses the selected custom wall height in 3D while retaining cardinal wall-height fallback", () => {
    expect(threeDSource).toContain("const customWallHeight = roomOverride?.customWalls?.[index]?.height");
    expect(threeDSource).toContain("typeof customWallHeight === \"number\" ? customWallHeight : wallHeights[side]");
  });
});
