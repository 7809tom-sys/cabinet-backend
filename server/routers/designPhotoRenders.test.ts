import { describe, expect, it } from "vitest";
import { exactPlanPrompt } from "./designPhotoRenders";

describe("design photo render safeguards", () => {
  it("treats the captured Designer scene as a locked plan and camera reference", () => {
    const prompt = exactPlanPrompt("12 exact placed items. Countertop: Calacatta Oro.");
    expect(prompt).toContain("exact locked CabinetDealz Designer plan and camera composition");
    expect(prompt).toContain("do not add, remove, move, rotate, resize, substitute, merge, hide, or invent");
    expect(prompt).toContain("Do not change the camera angle, crop, viewpoint, or room dimensions");
    expect(prompt).toContain("Use the following reference images only to improve physically plausible surface appearance");
    expect(prompt).toContain("12 exact placed items. Countertop: Calacatta Oro.");
  });
});
