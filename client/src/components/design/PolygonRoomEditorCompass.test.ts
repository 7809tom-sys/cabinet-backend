import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const editorSource = readFileSync(resolve(root, "client/src/components/design/PolygonRoomEditor.tsx"), "utf8");
const designToolSource = readFileSync(resolve(root, "client/src/pages/DesignTool.tsx"), "utf8");
const threeDSource = readFileSync(resolve(root, "client/src/components/design/InteractiveRoom3D.tsx"), "utf8");

describe("selected-wall Compass editor", () => {
  it("uses tap-to-select as the default and presents a Compass on the selected wall", () => {
    expect(editorSource).toContain('useState<Mode>("select")');
    expect(editorSource).toContain("Edit selected wall with Compass");
    expect(editorSource).toContain("Edit ${wall.label ?? \"selected wall\"} with Compass");
  });

  it("provides the one popup with only supported angle, start, height, and length inputs", () => {
    expect(editorSource).toContain("Distance from corner where angle starts (inches)");
    expect(editorSource).toContain("Wall height (inches)");
    expect(editorSource).toContain("Wall length (inches)");
    expect(editorSource).toContain("90° straight wall");
    expect(editorSource).toContain("+45° diagonal wall");
    expect(editorSource).toContain("−45° diagonal wall");
    expect(editorSource).toContain("[34.5, 42, 84, 96]");
    expect(editorSource).toContain("Save wall");
    expect(editorSource).toContain("Cancel");
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
