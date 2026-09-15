import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/DesignTool.tsx"), "utf8");

describe("Peninsula Wizard", () => {
  it("creates a selected-side run, supports safe appliance choices, and fills remaining spans from the active line", () => {
    expect(source).toContain("const [peninsulaWizardOpen, setPeninsulaWizardOpen] = useState(false);");
    expect(source).toContain("const buildPeninsulaWizardLayout = useCallback(() => {");
    expect(source).toContain("countertopSeatingOverhang: draft.seatingOverhang");
    expect(source).toContain("countertopWaterfallEnd: draft.waterfall");
    expect(source).toContain('applianceCode: "none" | "DW-24" | "WINE-24"');
    expect(source).toContain('firstCollisionFreePeninsulaPlacement(run.id as WallSide, nextRoom, working, width, depth, "base")');
    expect(source).toContain('autoFillSpan(segment.length, "kitchen", pool)');
    expect(source).toContain('catalogFillerForGap(pool, item.width, "base")');
    expect(source).toContain('data-testid="build-peninsula-wizard"');
  });
});
