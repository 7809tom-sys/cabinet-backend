import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(__dirname, "DesignTool.tsx"), "utf8");

describe("DesignTool island countertop deletion lifecycle", () => {
  it("rebuilds the island countertop state inside the shared cabinet-removal helper", () => {
    const start = source.indexOf("const removeCabinetsAndReleaseVoid = useCallback");
    const end = source.indexOf("const removeCabinetAndReleaseVoid", start);
    const handler = source.slice(start, end);

    expect(handler).toContain("islandAfterCountertopSupportRemoval(island, committed, next)");
    expect(handler).toContain("if (nextIsland && nextIsland !== island) setIsland(nextIsland);");
    expect(handler).toContain("placedRef.current = next;");
  });

  it("uses that same lifecycle helper when Materials & Parts removes island cabinets", () => {
    const materialsStart = source.indexOf("<DesignMaterialsListDialog");
    const materials = source.slice(materialsStart, source.indexOf("{/* Rename design dialog", materialsStart));

    expect(materials).toContain("removeCabinetsAndReleaseVoid(Array.from(sources), true);");
    expect(materials).not.toContain("for (const uid of Array.from(sources)) next = removePlacedCabinetGroup(next, uid);");
  });
});
