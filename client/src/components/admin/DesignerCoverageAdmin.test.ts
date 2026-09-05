import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Designer Coverage administration", () => {
  it("provides a direct Cabinet Config edit action for every displayed cabinet", () => {
    const source = readFileSync(new URL("./DesignerCoverageAdmin.tsx", import.meta.url), "utf8");

    expect(source).toContain("cabinetConfigQuickEditUrl");
    expect(source).toContain("Edit Cabinet Config for ${cab.masterCode}");
    expect(source).toContain("<Pencil className=");
  });
});
