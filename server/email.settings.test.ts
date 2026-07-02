import { describe, it, expect } from "vitest";
import { emailSettingsReady, type EmailSettingsRow } from "./email";

const base: EmailSettingsRow = {
  smtpHost: "smtp.example.com",
  smtpPort: 465,
  smtpUser: "user@example.com",
  smtpPass: "secret",
  smtpFrom: "orders@example.com",
  enabled: true,
};

describe("emailSettingsReady", () => {
  it("is true when enabled and host/user/pass are all present", () => {
    expect(emailSettingsReady(base)).toBe(true);
  });

  it("is false when the row is null/undefined", () => {
    expect(emailSettingsReady(null)).toBe(false);
    expect(emailSettingsReady(undefined)).toBe(false);
  });

  it("is false when sending is disabled even if fully configured", () => {
    expect(emailSettingsReady({ ...base, enabled: false })).toBe(false);
  });

  it("is false when any of host/user/pass is empty", () => {
    expect(emailSettingsReady({ ...base, smtpHost: "" })).toBe(false);
    expect(emailSettingsReady({ ...base, smtpUser: "" })).toBe(false);
    expect(emailSettingsReady({ ...base, smtpPass: "" })).toBe(false);
  });
});
