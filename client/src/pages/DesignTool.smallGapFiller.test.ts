import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");

describe("Design Tool small-gap filler workflow", () => {
  it("queues a catalog-backed opportunity after successful normal placement", () => {
    expect(source).toContain("queueSmallGapFillerOpportunity(normalizedRun, finalCab.uid)");
    expect(source).toContain("findSmallGapFillerOpportunity(room, nextPlaced, openings, cabinetUid)");
    const queueStart = source.indexOf("const queueSmallGapFillerOpportunity");
    const queueEnd = source.indexOf("// Always-on wall cabinet pool", queueStart);
    const queueSource = source.slice(queueStart, queueEnd);
    expect(queueSource).toContain("setSmallGapFillerPrompt(opportunity)");
    expect(queueSource).not.toContain("catalogFillerForGap");
  });

  it("offers leave-open, split, left, and right outcomes", () => {
    expect(source).toContain("Fill the remaining");
    expect(source).toContain("Split left / right");
    expect(source).toContain("All on left");
    expect(source).toContain("All on right");
    expect(source).toContain("Leave space open");
  });

  it("preserves exact placement and one purchased filler identity", () => {
    expect(source).toContain("smallGapFillerLayout(opportunity, mode)");
    expect(source).toContain('fillerBillingRole: index === 0 ? "primary" : "secondary"');
    expect(source).toContain("appendCollisionFreePlacements(base, pieces)");
    expect(source).toContain("removePlacedCabinetGroup(prev, selectedUid)");
  });
});
