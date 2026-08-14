import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const designToolSource = readFileSync(resolve(process.cwd(), "client/src/pages/DesignTool.tsx"), "utf8");

describe("DesignTool deterministic 3D preview routing", () => {
  it("routes all preview controls through InteractiveRoom3D rather than the simplified preview modal", () => {
    expect(designToolSource).toContain('onClick={() => setInteractive3dOpen(true)}');
    expect(designToolSource).toContain('setTimeout(() => setInteractive3dOpen(true), 150)');
    expect(designToolSource).toContain("<InteractiveRoom3D");
    expect(designToolSource).not.toContain("<DesignPreviewModal");
    expect(designToolSource).not.toContain("setPreviewModalOpen");
  });

  it("opens a loaded saved plan in the deterministic renderer even before a door style is selected", () => {
    expect(designToolSource).toContain("const hasPersistedTwoDPlan");
    expect(designToolSource).toContain("const savedPlanInteractive3dScene");
    expect(designToolSource).toContain("resolvedInteractive3dScene");
    expect(designToolSource).toContain("enabled: canLoadCatalogInteractive3d");
  });
});
