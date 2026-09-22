import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "client/src/pages/DesignTool.tsx"), "utf8");

describe("Designer door frame source binding", () => {
  it("uses the complete source-bound frame resolver for elevation and both 3D profile paths", () => {
    expect(source).toContain('import { completeDoorFrameMetrics } from "@/lib/doorFrameMetrics";');
    expect(source).toContain("const frame = completeDoorFrameMetrics(s);");
    expect(source).toContain("const frame = completeDoorFrameMetrics(frameStyle);");
    expect(source).toContain("partial record intentionally falls back to the neutral face");
  });
});
