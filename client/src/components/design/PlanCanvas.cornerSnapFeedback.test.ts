import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./PlanCanvas.tsx", import.meta.url), "utf8");

describe("PlanCanvas ERB36 corner snap feedback", () => {
  it("renders a green confirmed-snap treatment and explanatory hover text for a flush ERB36", () => {
    expect(source).toContain('const isSeatedErb36 = p.masterCode.toUpperCase().replace(/[^A-Z0-9]/g, "") === "ERB36"');
    expect(source).toContain('ERB36 corner snap confirmed');
    expect(source).toContain('data-corner-snap-confirmed={isSeatedErb36 ? "true" : undefined}');
    expect(source).toContain('"2.5px solid #16a34a"');
    expect(source).toContain('rgba(34,197,94,0.58)');
    expect(source).toContain('"ERB36 · locked"');
  });

  it("uses room-aware collision geometry for the visible conflict state", () => {
    expect(source).toContain("cabinetPlacementCollisionDetail(p, cabinets, room) != null");
  });
});
