import { describe, expect, it } from "vitest";
import { isEmailConfigured } from "./email";

describe("transactional email configuration", () => {
  it("reports Resend readiness without opening an SMTP connection", () => {
    const ready = isEmailConfigured();
    expect(typeof ready).toBe("boolean");
    if (ready) {
      expect(process.env.RESEND_API_KEY?.trim()).toBeTruthy();
      expect(process.env.ORDER_EMAIL_FROM?.trim()).toBeTruthy();
    }
  });
});
