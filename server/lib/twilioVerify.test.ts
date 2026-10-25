import { describe, expect, it } from "vitest";
import { hashPhoneE164, normalizePhoneE164 } from "./twilioVerify";

describe("Twilio Verify phone normalization", () => {
  it("normalizes a U.S./Canada mobile number to E.164 before provider handling", () => {
    expect(normalizePhoneE164("(555) 555-0199")).toBe("+15555550199");
    expect(normalizePhoneE164("+1 (555) 555-0199")).toBe("+15555550199");
  });

  it("rejects malformed numbers before any verification service request", () => {
    expect(() => normalizePhoneE164("555")).toThrow("valid mobile number");
  });

  it("uses a one-way phone hash for lookup state", () => {
    const phone = normalizePhoneE164("(555) 555-0199");
    const hash = hashPhoneE164(phone);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(phone);
  });
});
