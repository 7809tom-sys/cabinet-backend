import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/DesignTool.tsx"), "utf8");

describe("connected peninsula countertop continuity", () => {
  it("inherits the parent overhang for a new return and applies later overhang edits to the entire connected chain", () => {
    expect(source).toContain("countertopSeatingOverhang: peninsulaCountertopSeatingOverhang(parent, room)");
    expect(source).toContain("const rootId = rootIdFor(current);");
    expect(source).toContain("if (rootIdFor(run) !== rootId) return run;");
    expect(source).toContain("const withContinuousCountertop = { ...run, countertopSeatingOverhang: draft.countertopSeatingOverhang, countertopWaterfallEnd: draft.countertopWaterfallEnd };");
  });
});
