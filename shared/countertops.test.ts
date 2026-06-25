import { describe, it, expect } from "vitest";
import { COUNTERTOP_INFO, countertopInfo } from "./countertops";
import { COUNTERTOP_MATERIALS } from "../client/src/lib/design";

describe("countertop catalog (shared)", () => {
  it("exposes one info entry per render material, ids in sync with design.ts", () => {
    const renderIds = COUNTERTOP_MATERIALS.map((m) => m.id).sort();
    const infoIds = COUNTERTOP_INFO.map((m) => m.id).sort();
    expect(infoIds).toEqual(renderIds);
  });

  it("every material has a name, blurb, and at least 2 highlights", () => {
    for (const m of COUNTERTOP_INFO) {
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.blurb.length).toBeGreaterThan(10);
      expect(m.highlights.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("countertopInfo() looks up by id and returns undefined for unknown", () => {
    expect(countertopInfo("white-quartz")?.name).toBe("White Quartz");
    expect(countertopInfo("nope")).toBeUndefined();
    expect(countertopInfo(null)).toBeUndefined();
  });

  it("names match the render material names for the same id", () => {
    for (const m of COUNTERTOP_INFO) {
      const render = COUNTERTOP_MATERIALS.find((r) => r.id === m.id);
      expect(render?.name).toBe(m.name);
    }
  });
});
