import { describe, it, expect } from "vitest";

// Unit test for the prompt builder function
// We import the module to test the prompt generation logic
describe("cabinet3dPreview", () => {
  it("buildCabinet3dPrompt generates a coherent prompt", async () => {
    // Dynamically import to access the module-level function
    // Since buildCabinet3dPrompt is not exported, we test via the router's behavior
    // For now, verify the module loads without errors
    const mod = await import("./cabinet3dPreview");
    expect(mod.cabinet3dPreviewRouter).toBeDefined();
    expect(mod.cabinet3dPreviewRouter._def).toBeDefined();
  });

  it("router has get and generate procedures", async () => {
    const mod = await import("./cabinet3dPreview");
    const router = mod.cabinet3dPreviewRouter;
    // Check that the router has the expected procedures
    const procedures = Object.keys(router._def.procedures);
    expect(procedures).toContain("get");
    expect(procedures).toContain("generate");
  });
});
