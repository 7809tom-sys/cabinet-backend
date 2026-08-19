import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");
const mobileSaveSection = source.slice(
  source.indexOf("{/* Save / open plans"),
  source.indexOf("{/* Section popup launchers"),
);

describe("mobile Bundle Deal save action", () => {
  it("offers administrators the same Save as Bundle Deal action as desktop", () => {
    expect(mobileSaveSection).toContain("{isAdmin && (");
    expect(mobileSaveSection).toContain("Save as Bundle Deal");
    expect(mobileSaveSection).toContain("setBundleDialogOpen(true)");
  });
});
