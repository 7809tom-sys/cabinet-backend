import { describe, expect, it, vi } from "vitest";
import { bumpImageGenerated, markOrderImageGeneratedWith, orderIdsForDesign } from "./orderImageGenerated";

describe("order image generated counter", () => {
  it("increments the count and stamps the latest time", () => {
    const at = new Date("2026-10-27T17:00:00.000Z");
    expect(bumpImageGenerated(0, at)).toEqual({ imageGeneratedCount: 1, lastImageGeneratedAt: at });
    expect(bumpImageGenerated(2, at).imageGeneratedCount).toBe(3);
    expect(bumpImageGenerated(null, at).imageGeneratedCount).toBe(1);
  });

  it("counts an order linked through the CRM design and an order saved on that design", () => {
    expect(orderIdsForDesign(15, [
      { designId: 15, orderRequestId: 8 },
      { designId: 15, orderRequestId: null },
      { designId: 4, orderRequestId: 9 },
    ], [
      { id: 8, kitchenDesignId: 15 },
      { id: 12, kitchenDesignId: 15 },
      { id: 13, kitchenDesignId: 4 },
    ])).toEqual([8, 12]);
  });

  it("does not throw when the image columns are missing", async () => {
    const execute = vi.fn(async () => { throw new Error("Unknown column 'imageGeneratedCount' in 'field list'"); });
    await expect(markOrderImageGeneratedWith(execute, 8)).resolves.toEqual({ updated: false, schemaMissing: true });
  });

  it("does not throw when the update fails for another reason", async () => {
    const execute = vi.fn(async () => { throw new Error("connection reset"); });
    await expect(markOrderImageGeneratedWith(execute, 8)).resolves.toEqual({ updated: false, schemaMissing: false });
  });
});
