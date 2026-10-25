import { describe, expect, it } from "vitest";
import { decryptDistributorSecret, encryptDistributorSecret } from "./distributorIntegrationCrypto";

describe("distributor integration credential encryption", () => {
  it("round-trips secrets without storing plaintext", () => {
    const secret = "vendor-secret-for-test";
    const encrypted = encryptDistributorSecret(secret);
    expect(encrypted).toBeTruthy();
    expect(encrypted).not.toContain(secret);
    expect(decryptDistributorSecret(encrypted)).toBe(secret);
  });

  it("treats blank optional credentials as absent", () => {
    expect(encryptDistributorSecret("   ")).toBeNull();
    expect(decryptDistributorSecret(null)).toBeNull();
  });
});
