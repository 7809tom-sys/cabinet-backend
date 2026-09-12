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
    expect(planCanvasSource).toContain("Drag Compass along ${wallLabel[side]} wall to make a 45 degree right or left turn");
    expect(planCanvasSource).toContain('onWallCompassDrop?: (side: WallSide, startIn: number, turn: "right" | "left") => void;');
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
    expect((designToolSource.match(/onWallCompassDrop=\{applyCompassTurnOnDrop\}/g) ?? []).length).toBe(2);
    expect(designToolSource).toContain("const applyCompassTurnOnDrop = useCallback");
    expect(designToolSource).toContain("applyCompassWallEdit(selectedWall.id");
    expect(designToolSource).toContain('angle: turn === "right" ? 45 : -45');
    expect(planCanvasSource).toContain('onWallCompassDrop?: (side: WallSide, startIn: number, turn: "right" | "left") => void;');
    expect(planCanvasSource).toContain('movement > 0 ? "right" : "left"');
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

  it("keeps wall-measurement logic separate from the direct Compass gesture", () => {
    expect(editorSource).toContain("Wall height (inches)");
    expect(editorSource).toContain("Wall length (inches)");
    expect(designToolSource).toContain("setCompassWallStartIn(startIn);");
    expect(designToolSource).toContain("45° ${turn} turn added");
    expect(planCanvasSource).toContain("Math.abs(movement) < 0.5");
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
