import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("door swatch tint panel", () => {
  it("reads a swatch in the editor and waits for Save before writing", () => {
    const panel = readFileSync("client/src/components/admin/DoorSwatchTintPanel.tsx", "utf8");
    const editor = readFileSync("client/src/components/admin/FeaturedStylesAdmin.tsx", "utf8");
    expect(panel).toContain("Nothing is saved until you click Save");
    expect(panel).toContain("analyzeSwatchPixels");
    expect(panel).toContain("planDoorFinish");
    expect(panel).toContain("Stain");
    expect(panel).toContain("Paint");
    expect(editor).toContain("DoorSwatchTintPanel");
    expect(editor).toContain("finishCategory");
    expect(editor).toContain("grainLightHex");
    expect(editor).toContain("grainDarkHex");
  });
});
