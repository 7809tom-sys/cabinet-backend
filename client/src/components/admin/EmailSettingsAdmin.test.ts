import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./EmailSettingsAdmin.tsx", import.meta.url), "utf8");

describe("Email Settings administration UX", () => {
  it("shows Resend readiness instead of treating saved SMTP as the sender", () => {
    expect(source).toContain('resendReady ? "Resend active" : "Resend not configured"');
    expect(source).toContain("This switch is not used for delivery. Mail sends whenever Resend is configured.");
    expect(source).toContain('aria-label="Enable email sending"');
  });

  it("sends a test email through Resend without waiting for saved SMTP", () => {
    expect(source).toContain("const canSendTest = Boolean(testEmail.trim() && !testing)");
    expect(source).toContain("disabled={!canSendTest}");
    expect(source).toContain("This test sends through Resend and does not use the SMTP fields above.");
  });

  it("preserves in-progress SMTP entries through a background refetch and offers a Hostinger preset", () => {
    expect(source).toContain("const savedSettingsKeyRef = useRef<string | null>(null)");
    expect(source).toContain("const previousSavedKey = savedSettingsKeyRef.current");
    expect(source).toContain("previousSavedKey !== savedKey");
    expect(source).toContain('const HOSTINGER_SMTP_HOST = "smtp.hostinger.com"');
    expect(source).toContain('const HOSTINGER_SMTP_PORT = "465"');
    expect(source).toContain("Use Hostinger preset");
    expect(source).toContain("The SMTP fields below are not used for delivery.");
  });

  it("does not claim that database persistence itself is the security feature", () => {
    expect(source).toContain("Saved passwords are never returned to this page.");
    expect(source).not.toContain("Credentials are stored securely in the database; you never need to touch environment variables.");
    expect(source).not.toContain("Titan Email SMTP Quick Reference");
  });
});
