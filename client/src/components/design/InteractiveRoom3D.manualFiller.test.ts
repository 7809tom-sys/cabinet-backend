import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./InteractiveRoom3D.tsx", import.meta.url), "utf8");

describe("InteractiveRoom3D manual filler action", () => {
  it("places Add filler beside the selected cabinet actions and delegates to the host workflow", () => {
    expect(source).toContain("onRequestFiller?: (uid: string) => void");
    expect(source).toContain('data-testid="three-d-add-filler"');
    expect(source).toContain("onRequestFiller(selectedCabinet.uid!)");
    expect(source).toContain("Add filler</button>");
  });

  it("keeps the manual action off fitted filler pieces and island members", () => {
    expect(source).toContain("!selectedPlacedCabinet.islandFace");
    expect(source).toContain("!fittedFillerWidthText");
    expect(source).toContain('["base", "wall", "tall"].includes(selectedPlacedCabinet.placement)');
  });
});
