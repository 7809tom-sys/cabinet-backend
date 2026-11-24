import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("door style label lookup", () => {
  it("selects name, color, and finish and does not read the 0280 color-source columns", () => {
    const source = readFileSync(resolve(process.cwd(), "server/lib/doorStyleLabels.ts"), "utf8");
    expect(source).toContain("ourName: doorStyles.ourName");
    expect(source).toContain("aliasName: doorStyles.aliasName");
    expect(source).toContain("color: doorStyles.color");
    expect(source).toContain("finish: doorStyles.finish");
    expect(source).toContain("doorStyle: doorStyles.doorStyle");
    expect(source).not.toContain("doorStyles.doorColorSource");
    expect(source).not.toMatch(/select\(\)/);
  });
});
