import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { savedPhotoPlanFingerprint } from "./designPhotoRenders";

describe("verified customer plan-image safeguards", () => {
  it("requires a saved owned design, a server-stored verified request, and the same saved revision before image creation", () => {
    const source = readFileSync(new URL("./designPhotoRenders.ts", import.meta.url), "utf8");

    expect(source).toContain("loadOwnedSavedDesign(db, ctx.user.id, input.provenance.designId)");
    expect(source).toContain('request.verificationStatus !== "verified"');
    expect(source).toContain("request.designRevision !== revision || request.planFingerprint !== fingerprint");
  });

  it("derives the plan fingerprint only from the persisted saved-plan payload", () => {
    const savedPlan = {
      id: 42,
      userId: 7,
      roomData: { width: 144, depth: 120 },
      placedCabinets: [{ uid: "b24", masterCode: "B24" }],
      selectedSurfaces: [{ id: 11, name: "Selected Countertop" }],
      threeDPresentation: { backsplashHeightMode: "standard" },
      selectedStyleId: 19,
      selectedDistributorId: 3,
      updatedAt: new Date("2026-09-04T00:00:00.000Z"),
    };
    const expected = createHash("sha256").update(JSON.stringify({
      roomData: savedPlan.roomData,
      placedCabinets: savedPlan.placedCabinets,
      selectedSurfaces: savedPlan.selectedSurfaces,
      threeDPresentation: savedPlan.threeDPresentation,
      selectedStyleId: savedPlan.selectedStyleId,
      selectedDistributorId: savedPlan.selectedDistributorId,
    })).digest("hex");

    expect(savedPhotoPlanFingerprint(savedPlan)).toBe(expected);
  });

  it("records only essential Twilio state and never persists the one-time code or provider secret", () => {
    const schema = readFileSync(new URL("../../drizzle/schema.ts", import.meta.url), "utf8");
    const router = readFileSync(new URL("./designPhotoRenders.ts", import.meta.url), "utf8");

    expect(schema).toContain('verificationSid: varchar("verificationSid"');
    expect(schema).not.toContain('verificationCode:');
    expect(router).toContain("checkTwilioVerification(request.phoneE164, input.code)");
    expect(router).not.toContain("input.code, verificationCode");
  });

  it("forwards the qualified lead only after verification and retains every selected rendering input", () => {
    const source = readFileSync(new URL("./designPhotoRenders.ts", import.meta.url), "utf8");

    expect(source).toContain('phoneVerification: "verified_twilio"');
    expect(source).toContain("selectedProducts: args.provenance.materials");
    expect(source).toContain("provenance: request.provenance");
    expect(source).toContain("crmDeliveredAt: verifiedAt");
  });
});
