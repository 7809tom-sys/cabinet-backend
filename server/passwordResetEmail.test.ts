import { describe, expect, it } from "vitest";
import { buildPasswordResetEmail } from "./passwordResetEmail";

describe("buildPasswordResetEmail", () => {
  it("creates a one-time reset link without including a password", () => {
    const token = "c".repeat(64);
    const email = buildPasswordResetEmail({
      recipientName: "Rich",
      token,
      origin: "https://www.cabinetdealz.com/",
    });

    expect(email.subject).toBe("Cabinet Dealz — reset your password");
    expect(email.resetUrl).toBe(`https://www.cabinetdealz.com/reset-password?token=${token}`);
    expect(email.text).toContain("expires in one hour");
    expect(email.text).toContain("one-time link");
    expect(email.text).not.toContain("Temporary password");
    expect(email.text).not.toContain("Your password is");
  });
});
