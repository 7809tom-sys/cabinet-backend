import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/DesignTool.tsx"), "utf8");

describe("Peninsula Wizard", () => {
  it("creates a straight selected-side run with an optional connected 45-degree end from the active line", () => {
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
    expect(source).toContain('const spot = firstCollisionFreePeninsulaPlacement(');
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

  it("requires the user’s ordered cabinet sequence on each leg and never auto-fills a cabinet", () => {
    expect(source).toContain('primaryCabinetIds: number[];');
    expect(source).toContain('returnCabinetIds: number[];');
    expect(source).toContain('data-testid="peninsula-wizard-primary-cabinet-add"');
    expect(source).toContain('data-testid="peninsula-wizard-return-cabinet-add"');
    expect(source).toContain('data-testid="peninsula-wizard-primary-sequence-list"');
    expect(source).toContain('selectedPeninsulaCabinetSequencePlan(segment.length, selectedCabinets as PeninsulaWizardCabinet[], selectedLineFillers)');
    expect(source).toContain('The Wizard will not auto-fill it.');
    expect(source).not.toContain('Automatic fit from this line');
  });

  it("shows the selected cabinet total and measured remaining space before building", () => {
    expect(source).toContain('const peninsulaWizardSpacePreview = useMemo(() => {');
    expect(source).toContain('selectedPeninsulaCabinetTotalIn(selectedCabinets)');
    expect(source).toContain('freeSegmentsOnWall(layoutRun.id as WallSide, nextRoom, placed, [], 9)');
    expect(source).toContain('data-testid="peninsula-wizard-space-preview"');
    expect(source).toContain('Cabinet totals &amp; remaining space');
    expect(source).toContain('data-testid={`peninsula-wizard-${leg.id.endsWith("_45_end") ? "return" : "primary"}-cabinet-total`}');
    expect(source).toContain('data-testid={`peninsula-wizard-${leg.id.endsWith("_45_end") ? "return" : "primary"}-remaining-space`}');
    expect(source).toContain('The {formatEighthInches(leg.remainingIn ?? 0)} joint remainder is reserved');
  });

  it("adds a real mitered filler pair at the 135-degree joint of every Wizard 45-degree return", () => {
    expect(source).toContain('const hasChildFortyFiveReturn = Boolean((nextRoom.peninsulaRuns ?? []).some((candidate) => (');
    expect(source).toContain('const itemsForSegment = hasChildFortyFiveReturn && plan.items.at(-1)?.isFiller');
    expect(source).toContain('const miterRepair = repairMissingAngledWallFillers(working, nextRoom, catalogFillers, makeUid, styleIdRef.current ?? null);');
    expect(source).toContain('The 135° joint needs a matching catalog filler pair on this line. No peninsula was added;');
    expect(source).toContain('At the 135° joint formed by this 45° return, the Wizard adds the required pair of real selected-line filler boards');
  });

  it("offers a regular or 42-inch split-level countertop treatment through the shared peninsula data model", () => {
    expect(source).toContain('countertopTreatment: "regular" | "split-level"');
    expect(source).toContain('data-testid="peninsula-wizard-countertop-treatment"');
    expect(source).toContain('countertopRaisedBar: draft.countertopTreatment === "split-level"');
    expect(source).toContain('makePeninsulaDrywallBackPonyWall(');
  });
});
