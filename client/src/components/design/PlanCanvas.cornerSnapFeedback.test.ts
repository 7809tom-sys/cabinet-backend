import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./PlanCanvas.tsx", import.meta.url), "utf8");

describe("PlanCanvas protected-corner snap feedback", () => {
  it("renders a green confirmed-snap treatment and explanatory hover text for a flush ERB36", () => {
    expect(source).toContain('const isSeatedErb36 = p.masterCode.toUpperCase().replace(/[^A-Z0-9]/g, "") === "ERB36"');
    expect(source).toContain('ERB36 corner snap confirmed');
    expect(source).toContain('const isSeatedProtectedCorner = isSeatedErb36 || isSeatedBlindCorner;');
    expect(source).toContain('data-corner-snap-confirmed={isSeatedProtectedCorner ? "true" : undefined}');
    expect(source).toContain('"2.5px solid #16a34a"');
    expect(source).toContain('rgba(34,197,94,0.58)');
    expect(source).toContain('"ERB36 · locked"');
  });

  it("uses the same confirmed-snap treatment for a locked blind corner such as BBC42", () => {
    expect(source).toContain("blindCornerSnapInfo(p, room)");
    expect(source).toContain("blind-corner snap confirmed");
    expect(source).toContain("`${p.masterCode} · locked`");
  });

  it("uses room-aware collision geometry for the visible conflict state", () => {
    expect(source).toContain("cabinetPlacementCollisionDetail(p, cabinets, room) != null");
  });
});
