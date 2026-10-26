import { describe, expect, it } from "vitest";
import { generateInventoryApiKey, hashInventoryApiKey } from "./vendorInventoryApiKey";

describe("inventory api keys", () => {
  it("stores a hash that is not the raw key", () => {
    const key = generateInventoryApiKey();
    expect(key.raw.startsWith("vif_")).toBe(true);
    expect(key.hash).toBe(hashInventoryApiKey(key.raw));
    expect(key.hash).not.toBe(key.raw);
    expect(key.prefix).toBe(key.raw.slice(0, 12));
  });
});
