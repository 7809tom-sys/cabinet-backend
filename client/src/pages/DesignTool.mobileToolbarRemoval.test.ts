import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");

describe("mobile Designer toolbar simplification", () => {
  it("keeps desktop view modes and removes redundant mobile Plan/Elevation/3D/3D+Plan controls", () => {
    expect(source).toContain('className="hidden lg:flex items-center rounded-md');
    expect(source).not.toContain('className="lg:hidden flex shrink-0 items-center rounded-full');
    expect(source).not.toContain('title="Bird\'s-eye plan view"');
    expect(source).not.toContain('title="Front elevation view"');
    expect(source).not.toContain("3D+Plan");
  });
});
