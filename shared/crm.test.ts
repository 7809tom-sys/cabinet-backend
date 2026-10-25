import { describe, expect, it } from "vitest";
import { CRM_PIPELINE_STAGES, CRM_SOURCES, CRM_STAGE_LABELS, CRM_STAGES } from "./crm";

describe("CRM Image Review workflow constants", () => {
  it("keeps verified image requests in their own active pipeline lane", () => {
    expect(CRM_STAGES).toContain("image_review");
    expect(CRM_PIPELINE_STAGES).toContain("image_review");
    expect(CRM_STAGE_LABELS.image_review.en).toBe("Image Review");
    expect(CRM_SOURCES).toContain("verified_plan_image_request");
  });
});
