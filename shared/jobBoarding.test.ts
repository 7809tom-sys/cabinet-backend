import { describe, expect, it } from "vitest";
import {
  DEFAULT_NON_COMPETE_TERM_YEARS,
  NON_COMPETE_PLACEHOLDER,
  buildJobBoardingSignerExternalId,
  evaluateJobBoarding,
  identityFileView,
  isNonCompetePlaceholder,
  jobBoardingTinView,
  maskTaxId,
  nonCompeteTermLabel,
  normalizeTaxId,
  parseJobBoardingSignerExternalId,
} from "./jobBoarding";

describe("job boarding gate", () => {
  it("stays unverified until information, the non-compete, the W-9, and an ID are all done", () => {
    expect(evaluateJobBoarding({
      informationComplete: true,
      nonCompeteSigned: true,
      w9Submitted: true,
      identityUploaded: false,
    })).toEqual({ verified: false, blockers: ["identity"] });

    expect(evaluateJobBoarding({
      informationComplete: true,
      nonCompeteSigned: true,
      w9Submitted: true,
      identityUploaded: true,
    }).verified).toBe(true);
  });

  it("keeps the two-year term and the placeholder body distinguishable from a replacement", () => {
    expect(DEFAULT_NON_COMPETE_TERM_YEARS).toBe(2);
    expect(nonCompeteTermLabel(2)).toBe("2 years");
    expect(isNonCompetePlaceholder(NON_COMPETE_PLACEHOLDER)).toBe(true);
    expect(isNonCompetePlaceholder("A replacement document supplied by an admin.")).toBe(false);
  });
});

describe("job boarding signer tag", () => {
  it("round-trips the salesperson and the document version", () => {
    const tag = buildJobBoardingSignerExternalId({ userId: 14, documentVersionId: 3 });
    expect(tag).toBe("cd-job:u14:v3");
    expect(parseJobBoardingSignerExternalId(tag)).toEqual({ userId: 14, documentVersionId: 3 });
    expect(parseJobBoardingSignerExternalId("cd-legal:a14:v3")).toBeNull();
  });
});

describe("job boarding tax id access", () => {
  const plaintext = "123456789";

  it("masks the salesperson's own TIN and refuses to reveal it", () => {
    const masked = jobBoardingTinView({
      viewerRole: "sales_rep",
      viewerId: 4,
      ownerUserId: 4,
      last4: "6789",
      plaintext,
      reveal: false,
    });
    expect(masked).toEqual({ ok: true, masked: "***-**-6789", tin: null });
    expect(JSON.stringify(masked)).not.toContain(plaintext);

    expect(jobBoardingTinView({
      viewerRole: "sales_rep",
      viewerId: 4,
      ownerUserId: 4,
      last4: "6789",
      plaintext,
      reveal: true,
    })).toEqual({ ok: false, reason: "forbidden" });
  });

  it("reveals the TIN only to an admin and hides it from everyone else", () => {
    expect(jobBoardingTinView({
      viewerRole: "admin",
      viewerId: 1,
      ownerUserId: 4,
      last4: "6789",
      plaintext,
      reveal: true,
    })).toEqual({ ok: true, masked: "***-**-6789", tin: plaintext });

    expect(jobBoardingTinView({
      viewerRole: "user",
      viewerId: 9,
      ownerUserId: 4,
      last4: "6789",
      plaintext,
      reveal: false,
    })).toEqual({ ok: false, reason: "forbidden" });
    expect(maskTaxId("12")).toBeNull();
  });

  it("rejects a tax id that is not 9 digits without echoing the value", () => {
    const result = normalizeTaxId("12-34", "ssn");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).not.toContain("12");
  });

  it("drops the storage key from an ID the screen is allowed to list", () => {
    const view = identityFileView({
      id: 8,
      label: "front",
      originalName: "license.jpg",
      mimeType: "image/jpeg",
      createdAt: "2026-11-10T00:00:00.000Z",
    });
    expect(view).toEqual({
      id: 8,
      label: "front",
      originalName: "license.jpg",
      mimeType: "image/jpeg",
      uploadedAt: "2026-11-10T00:00:00.000Z",
    });
    expect(JSON.stringify(view)).not.toContain("salesperson-identity/");
  });
});
