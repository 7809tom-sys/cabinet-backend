import { describe, expect, it } from "vitest";
import { emailSettingsReady, isEmailConfigured, resendConfigured, type EmailSettingsRow } from "./email";

const smtpRow: EmailSettingsRow = {
  smtpHost: "smtp.example.com",
  smtpPort: 465,
  smtpUser: "user@example.com",
  smtpPass: "secret",
  smtpFrom: "orders@example.com",
  enabled: true,
};

describe("email readiness", () => {
  it("is ready when Resend is configured", () => {
    const ready = { RESEND_API_KEY: "re_test_key", ORDER_EMAIL_FROM: "Cabinet Dealz <orders@cabinetdealz.com>" } as NodeJS.ProcessEnv;
    expect(resendConfigured(ready)).toBe(true);
    expect(isEmailConfigured(ready)).toBe(true);
  });

  it("falls back to SMTP env or saved settings when Resend is unset", () => {
    const smtpEnv = { SMTP_HOST: "smtp.example.com", SMTP_USER: "user@example.com", SMTP_PASS: "secret" } as NodeJS.ProcessEnv;
    expect(resendConfigured(smtpEnv)).toBe(false);
    expect(isEmailConfigured(smtpEnv)).toBe(true);
    expect(isEmailConfigured({} as NodeJS.ProcessEnv, smtpRow)).toBe(true);
    expect(isEmailConfigured({} as NodeJS.ProcessEnv, { ...smtpRow, enabled: false })).toBe(false);
    expect(emailSettingsReady({ ...smtpRow, smtpPass: "" })).toBe(false);
    expect(emailSettingsReady(null)).toBe(false);
  });
});
