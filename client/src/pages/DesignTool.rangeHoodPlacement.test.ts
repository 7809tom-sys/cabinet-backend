import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");

describe("Design Tool range hood placement wiring", () => {
  it("resolves a catalog hood against the actual saved range before ordinary wall-run placement", () => {
    const addStart = source.indexOf("const addCabinet = useCallback");
    const hoodStart = source.indexOf("const rangeHoodPlacement = isRangeHoodPlacement", addStart);
    const runStart = source.indexOf("const followsCabinetRun", hoodStart);
    const addSource = source.slice(addStart, source.indexOf("const addAppliance", addStart));

    expect(hoodStart).toBeGreaterThan(addStart);
    expect(hoodStart).toBeLessThan(runStart);
    expect(addSource).toContain("resolveRangeHoodPlacement(");
    expect(addSource).toContain("spot = rangeHoodPlacement.spot");
    expect(addSource).toContain("mountBottom: rangeHoodPlacement.mountBottom");
    expect(addSource).toContain("setPlacementWarning(rangeHoodPlacement.message)");
  });

  it("does not announce a successful 3D hood add until the shared placement transaction succeeds", () => {
    const shortcutStart = source.indexOf("const addRangeHoodFromInteractive3d");
    const shortcutEnd = source.indexOf("// ── Ceiling Filler", shortcutStart);
    const shortcutSource = source.slice(shortcutStart, shortcutEnd);

    expect(shortcutSource).toContain("addCabinet(hood, range?.x, range?.y)");
    expect(shortcutSource).not.toContain("Range hood added to the 2D plan above the saved range");
  });
});
