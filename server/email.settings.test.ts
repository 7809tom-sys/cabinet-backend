import { describe, expect, it } from "vitest";
import { isEmailConfigured, resendConfigured } from "./email";

describe("email readiness", () => {
  it("depends on Resend configuration and ignores SMTP variables", () => {
    const ready = { RESEND_API_KEY: "re_test_key", ORDER_EMAIL_FROM: "Cabinet Dealz <orders@cabinetdealz.com>" } as NodeJS.ProcessEnv;
    expect(resendConfigured(ready)).toBe(true);
    expect(isEmailConfigured(ready)).toBe(true);
    expect(resendConfigured({ ...ready, RESEND_API_KEY: "  " })).toBe(false);
    expect(resendConfigured({ ...ready, ORDER_EMAIL_FROM: "" })).toBe(false);
    expect(isEmailConfigured({ SMTP_HOST: "smtp.example.com", SMTP_USER: "user@example.com", SMTP_PASS: "secret" } as NodeJS.ProcessEnv)).toBe(false);
  });
});
