import { describe, expect, it } from "vitest";
import { stripeEnvironmentFromKeys } from "./stripeMode";

describe("stripeEnvironmentFromKeys", () => {
  it("classifies live key prefixes without exposing a credential", () => {
    expect(stripeEnvironmentFromKeys("sk_live_example", "pk_live_example")).toBe("production");
    expect(stripeEnvironmentFromKeys("", "pk_live_example")).toBe("production");
  });

  it("classifies test key prefixes and missing credentials", () => {
    expect(stripeEnvironmentFromKeys("sk_test_example", "pk_test_example")).toBe("test");
    expect(stripeEnvironmentFromKeys(undefined, undefined)).toBe("unknown");
  });
});
