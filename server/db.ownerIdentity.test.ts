import { describe, expect, it } from "vitest";
import { isOwnerIdentity } from "./db";

describe("owner identity role preservation", () => {
  it("treats the configured owner email as an administrator even when OAuth provides a different open ID", () => {
    expect(isOwnerIdentity(
      { openId: "google-owner-open-id", email: " 7809TOM@GMAIL.COM " },
      { ownerOpenId: "manus-owner-open-id", ownerEmail: "7809tom@gmail.com" },
    )).toBe(true);
  });

  it("does not promote another email merely because it uses a different identity provider", () => {
    expect(isOwnerIdentity(
      { openId: "google-other-open-id", email: "owner-lookalike@example.com" },
      { ownerOpenId: "manus-owner-open-id", ownerEmail: "7809tom@gmail.com" },
    )).toBe(false);
  });
});
