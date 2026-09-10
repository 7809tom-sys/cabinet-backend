import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./DesignTool.tsx", import.meta.url), "utf8");
const mobileSaveSection = source.slice(
  source.indexOf("{/* Save / open plans"),
  source.indexOf("{/* Section popup launchers"),
);

describe("mobile Kitchen Package save action", () => {
  it("offers administrators the same Save as Kitchen Package action as desktop", () => {
    expect(mobileSaveSection).toContain("{isAdmin && (");
    expect(mobileSaveSection).toContain("Save as Kitchen Package");
    expect(mobileSaveSection).toContain("setBundleDialogOpen(true)");
  });
});
