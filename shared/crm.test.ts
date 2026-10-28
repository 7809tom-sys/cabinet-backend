import { describe, expect, it } from "vitest";
import { CRM_PIPELINE_STAGES, CRM_SOURCES, CRM_STAGE_LABELS, CRM_STAGES, isClosedStage, isWonRevenueStage } from "./crm";

describe("CRM Image Review workflow constants", () => {
  it("keeps verified image requests in their own active pipeline lane", () => {
    expect(CRM_STAGES).toContain("image_review");
    expect(CRM_PIPELINE_STAGES).toContain("image_review");
    expect(CRM_STAGE_LABELS.image_review.en).toBe("Image Review");
    expect(CRM_STAGES.slice(0, 2)).toEqual(["new", "new_sale"]);
    expect(CRM_PIPELINE_STAGES[1]).toBe("new_sale");
    expect(CRM_STAGE_LABELS.new_sale.en).toBe("New Sale");
    expect(isClosedStage("new_sale")).toBe(true);
    expect(isWonRevenueStage("new_sale")).toBe(true);
    expect(isWonRevenueStage("qualified")).toBe(false);
    expect(CRM_SOURCES).toContain("verified_plan_image_request");
  });
});
