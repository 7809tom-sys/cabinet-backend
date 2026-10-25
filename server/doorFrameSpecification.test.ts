import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { verifiedDoorFrameSpecification } from "./routers/designPhotoRenders";

const handoffSource = readFileSync(new URL("./routers/designPhotoRenders.ts", import.meta.url), "utf8");

describe("verified door-frame specification", () => {
  it("includes only source-entered stile, rail, center-rail, and profile details", () => {
    expect(verifiedDoorFrameSpecification({ stileWidth: "3.00", railWidth: "3", centerRailWidth: "2.5", profileNotes: "Slight stepped bevel" }))
      .toBe('Verified door frame: 3" stiles · 3" rails · 2.5" center rail · Slight stepped bevel');
  });

  it("does not invent measurements when no verified frame details exist", () => {
    expect(verifiedDoorFrameSpecification({ railWidth: null, stileWidth: null, centerRailWidth: null, profileNotes: null })).toBeNull();
  });

  it("keeps a single locked-plan board with the explicit no-plan-change instruction and selected product references", () => {
    expect(handoffSource).toContain("Please design the kitchen. Do not alter or change the plan.");
    expect(handoffSource).toContain("1. Exact locked kitchen plan");
    expect(handoffSource).toContain("The remaining numbered cards are the exact selected CabinetDealz and Pelican product references.");
  });
});
