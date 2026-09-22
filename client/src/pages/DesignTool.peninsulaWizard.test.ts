import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/DesignTool.tsx"), "utf8");

describe("Peninsula Wizard", () => {
  it("creates a straight selected-side run with an optional connected 45-degree end, then fills each safe span from the active line", () => {
    expect(source).toContain("const [peninsulaWizardOpen, setPeninsulaWizardOpen] = useState(false);");
    expect(source).toContain("const buildPeninsulaWizardLayout = useCallback(() => {");
    expect(source).toContain('turn: 90,');
    expect(source).toContain('label: "Peninsula · straight",');
    expect(source).toContain('parentRunId: run.id,');
    expect(source).toContain('turn: 45,');
    expect(source).toContain('const layoutRuns = angledRun ? [run, angledRun] : [run];');
    expect(source).toContain("countertopSeatingOverhang: draft.seatingOverhang");
    expect(source).toContain("countertopWaterfallEnd: draft.waterfall");
    expect(source).toContain('applianceCode: "none" | "DW-24" | "WINE-24"');
    expect(source).toContain('firstCollisionFreePeninsulaPlacement(\n              layoutRun.id as WallSide,');
    expect(source).toContain('autoFillSpan(segment.length, "kitchen", pool)');
    expect(source).toContain('catalogFillerForGap(pool, item.width, "base")');
    expect(source).toContain('data-testid="build-peninsula-wizard"');
    expect(source).toContain('45° end from the straight run');
  });

  it("defaults ordinary peninsula cabinets to the 1½-inch finished edge and limits new seating choices to 12 or 15 inches", () => {
    expect(source).toContain('seatingOverhang: 0,');
    expect(source).toContain('Standard 1½ in. cabinet edge');
    expect(source).toContain('12 in. seating');
    expect(source).toContain('15 in. seating');
    expect(source).toContain('Regular base cabinets receive the standard 1½ in. finished edge');
  });

  it("offers a snapped pony wall at the final peninsula endpoint instead of requiring a loose plan rectangle", () => {
    expect(source).toContain('addPonyWall: boolean;');
    expect(source).toContain('data-testid="peninsula-pony-wall-option"');
    expect(source).toContain('Add pony wall at the far end.');
    expect(source).toContain('const ponyWallOwner = angledRun ?? run;');
    expect(source).toContain('makePeninsulaPonyWall(ponyWallOwner, nextRoom, {');
    expect(source).toContain('ponyWallFitsRoom(builtPonyWall, nextRoom)');
    expect(source).toContain('and a snapped pony wall');
  });
});
