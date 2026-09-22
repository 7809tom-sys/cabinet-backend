import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const designTool = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");
const planCanvas = readFileSync(new URL("../components/design/PlanCanvas.tsx", import.meta.url), "utf8");
const threeD = readFileSync(new URL("../components/design/InteractiveRoom3D.tsx", import.meta.url), "utf8");

describe("drywall pony wall behind a peninsula cabinet run", () => {
  it("provides an editable peninsula setting that creates or removes the attached drywall wall", () => {
    expect(designTool).toContain('data-testid="peninsula-drywall-back-pony-wall"');
    expect(designTool).toContain("Drywall pony wall behind cabinet run");
    expect(designTool).toContain("makePeninsulaDrywallBackPonyWall(savedRun, prospectiveRoom, { height })");
    expect(designTool).toContain('peninsulaPlacement === "behind-cabinets"');
    expect(designTool).toContain('finish === "drywall"');
    expect(designTool).toContain("would extend outside the measured room");
  });

  it("labels the drywall wall in plan and preserves its finish in 3D", () => {
    expect(planCanvas).toContain('data-testid={isDrywallBackedPeninsula ? "peninsula-drywall-back-pony-wall"');
    expect(planCanvas).toContain("DRYWALL PONY WALL");
    expect(threeD).toContain("const drywallFinished = ponyWall.peninsulaPlacement === \"behind-cabinets\" && ponyWall.finish === \"drywall\"");
    expect(threeD).toContain("drywallFinished");
  });
});
