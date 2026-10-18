import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  PASSWORD_RESET_TTL_MS,
  hashPasswordResetToken,
  passwordResetUrl,
  passwordResetExpiry,
} from "./passwordReset.logic";

describe("password reset token contract", () => {
  it("hashes the raw one-time token before persistence", () => {
    const rawToken = "a".repeat(64);
    expect(hashPasswordResetToken(rawToken)).toBe(
      createHash("sha256").update(rawToken).digest("hex"),
    );
    expect(hashPasswordResetToken(rawToken)).not.toContain(rawToken);
    expect(hashPasswordResetToken(rawToken)).toHaveLength(64);
  });

  it("creates an HTTPS reset URL containing only the raw email-delivery token", () => {
    const rawToken = "b".repeat(64);
    expect(passwordResetUrl("https://www.cabinetdealz.com/", rawToken)).toBe(
      `https://www.cabinetdealz.com/reset-password?token=${rawToken}`,
    );
  });

  it("expires reset links exactly one hour after creation", () => {
    const now = new Date("2026-10-18T17:00:00.000Z");
    expect(PASSWORD_RESET_TTL_MS).toBe(60 * 60 * 1000);
    expect(passwordResetExpiry(now)).toEqual(
      new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
    );
  });
});
