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

  it("uses one draggable Compass on the selected normal-plan wall and retains the mobile entry", () => {
    expect(planCanvasSource).toContain("Drag Compass along ${wallLabel[side]} wall to make a 45 degree right or left turn");
    expect(planCanvasSource).toContain('onWallCompassDrop?: (side: WallSide, startIn: number, turn: "right" | "left") => void;');
    expect(planCanvasSource).toContain("onCompassPointerUp");
    expect(roomSizeSource).toContain('data-testid="mobile-wall-compass-entry"');
    expect(roomSizeSource).toContain("Edit selected wall with Compass");
    expect(designToolSource).toContain('data-testid="compact-workspace-wall-compass"');
    expect(designToolSource).toContain("const openSelectedWallCompass = useCallback");
    expect(designToolSource).toContain("onOpenWallCompass={() => {");
    expect(designToolSource).toContain("setPolygonEditMode(false);");
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

  it("resolves a concrete selected wall and increments a request counter before opening Compass", () => {
    expect(designToolSource).toContain('from "@/lib/polygonRoom";');
    expect(designToolSource).toContain("closestWall");
    expect(designToolSource).toContain("positionAlongWall");
    expect(designToolSource).toContain("rectToPolygon");
    expect(designToolSource).toContain("const selectedWallId = room.customWalls?.find((wall) => wall.id === activeWall)?.id");
    expect(designToolSource).toContain("setCompassWallRequestId((current) => current + 1);");
    expect(designToolSource).not.toContain('import("@/lib/polygonRoom").then(({ rectToPolygon }) =>');
    expect(editorSource).toContain("customWalls.find((wall, index) => {");
    expect(editorSource).toContain("activeWallId === ([\"top\", \"right\", \"bottom\", \"left\"] as const)[index]");
  });

  it("provides one explicit attributes popup with supported angle, drag-set corner start, height, and length inputs", () => {
    expect(editorSource).toContain("45° corner start:");
    expect(editorSource).toContain("Drag the Compass along the selected wall in the plan to move this point.");
    expect(editorSource).not.toContain("Distance from corner where angle starts (inches)");
    expect(editorSource).toContain("Wall height (inches)");
    expect(editorSource).toContain("Wall length (inches)");
    expect(editorSource).toContain("90° straight wall");
    expect(editorSource).toContain("+45° diagonal wall");
    expect(editorSource).toContain("−45° diagonal wall");
    expect(editorSource).toContain("[34.5, 42, 84, 96]");
    expect(editorSource).toContain("Save wall");
    expect(editorSource).toContain("Cancel");
    expect(designToolSource).toContain("setCompassWallStartIn(startIn);");
    expect(designToolSource).toContain("45° ${turn} turn added");
    expect(designToolSource).not.toContain("openSelectedWallCompass(startIn);");
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
