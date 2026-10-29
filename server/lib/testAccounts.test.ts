import { describe, expect, it } from "vitest";
import { readTestAccountUserId, signTestAccountToken, testAccountProfile, testAccountsEnabled } from "./testAccounts";

describe("test account gate", () => {
  it("stays off unless the env flag is exactly true", () => {
    expect(testAccountsEnabled(undefined)).toBe(false);
    expect(testAccountsEnabled("")).toBe(false);
    expect(testAccountsEnabled("1")).toBe(false);
    expect(testAccountsEnabled("TRUE")).toBe(false);
    expect(testAccountsEnabled("true")).toBe(true);
  });

  it("maps the two usernames and signs a token that dies without the secret", async () => {
    expect(testAccountProfile("customer")?.role).toBe("user");
    expect(testAccountProfile("contractor")?.role).toBe("contractor");
    expect(testAccountProfile("admin")).toBeNull();
    const token = await signTestAccountToken(42, "test-secret");
    expect(await readTestAccountUserId(token, "test-secret")).toBe(42);
    expect(await readTestAccountUserId(token, "other-secret")).toBeNull();
    expect(await readTestAccountUserId(token, "")).toBeNull();
  });
});
