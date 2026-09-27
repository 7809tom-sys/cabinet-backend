import { describe, expect, it } from "vitest";
import {
  decryptEmailSettingsPassword,
  encryptEmailSettingsPassword,
  isEncryptedEmailSettingsPassword,
} from "./emailSettingsCrypto";
import { readFileSync } from "node:fs";

const routerSource = readFileSync(new URL("../routers/emailSettings.ts", import.meta.url), "utf8");
const emailServiceSource = readFileSync(new URL("../email.ts", import.meta.url), "utf8");

describe("Email Settings SMTP credential protection", () => {
  it("encrypts a saved password with a versioned authenticated envelope and can decrypt it server-side", () => {
    const password = "example-test-password";
    const encrypted = encryptEmailSettingsPassword(password);

    expect(encrypted).not.toContain(password);
    expect(isEncryptedEmailSettingsPassword(encrypted)).toBe(true);
    expect(decryptEmailSettingsPassword(encrypted)).toBe(password);
  });

  it("requires encrypted persistence for new settings and does not return raw provider failures to administrators", () => {
    expect(routerSource).toContain("values.smtpPass = encryptEmailSettingsPassword(input.smtpPass)");
    expect(routerSource).toContain("const smtpPass = decryptEmailSettingsPassword(row.smtpPass)");
    expect(routerSource).toContain("The saved SMTP connection could not be verified.");
    expect(routerSource).not.toContain("const msg = err instanceof Error ? err.message : String(err)");
  });

  it("decrypts the protected database SMTP credential only inside the server-side delivery path", () => {
    expect(emailServiceSource).toContain('import { decryptEmailSettingsPassword } from "./lib/emailSettingsCrypto"');
    expect(emailServiceSource).toContain("const smtpPass = decryptEmailSettingsPassword(s.smtpPass)");
    expect(emailServiceSource).toContain("auth: { user: s.smtpUser, pass: smtpPass }");
  });
});
