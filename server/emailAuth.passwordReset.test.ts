import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./routers/emailAuth.ts", import.meta.url), "utf8");

describe("emailAuth password reset security contract", () => {
  it("uses a random secret, stores only its hash, and persists it only after mail delivery", () => {
    expect(source).toContain("requestPasswordReset: publicProcedure");
    expect(source).toContain("randomBytes(32).toString(\"hex\")");
    expect(source).toContain("hashPasswordResetToken(rawToken)");
    expect(source).toContain("buildPasswordResetEmail");
    expect(source).toContain("sendEmailViaSettings");
    expect(source).toContain("sendEmail({");

    const delivery = source.indexOf("const delivery =");
    const persist = source.indexOf("tx.insert(passwordResetTokens)");
    expect(delivery).toBeGreaterThan(-1);
    expect(persist).toBeGreaterThan(delivery);
  });

  it("requires a live, unconsumed token before updating a password and clearing a lockout", () => {
    expect(source).toContain("completePasswordReset: publicProcedure");
    expect(source).toContain("hashPasswordResetToken(input.token)");
    expect(source).toContain("isNull(passwordResetTokens.consumedAt)");
    expect(source).toContain("gt(passwordResetTokens.expiresAt, now)");
    expect(source).toContain("failedLoginAttempts: 0");
    expect(source).toContain("lockedUntil: null");
  });
});
