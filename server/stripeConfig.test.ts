import { describe, expect, it } from "vitest";
import { resolveStripeCredentials } from "./stripeConfig";

describe("resolveStripeCredentials", () => {
  const sandbox = {
    STRIPE_SECRET_KEY: "sk_test_managed_sandbox",
    VITE_STRIPE_PUBLISHABLE_KEY: "pk_test_managed_sandbox",
    STRIPE_WEBHOOK_SECRET: "whsec_managed_sandbox",
  };

  it("uses the managed test sandbox when no protected direct-live entries exist", () => {
    const result = resolveStripeCredentials(sandbox);
    expect(result.source).toBe("managed_sandbox");
    expect(result.environment).toBe("test");
    expect(result.liveReady).toBe(false);
    expect(result.matchingKeyModes).toBe(true);
  });

  it("uses all matching protected live entries when they are present", () => {
    const result = resolveStripeCredentials({
      ...sandbox,
      CABINETDEALZ_STRIPE_LIVE_SECRET_KEY: "sk_live_project_only",
      CABINETDEALZ_STRIPE_LIVE_PUBLISHABLE_KEY: "pk_live_project_only",
      CABINETDEALZ_STRIPE_LIVE_WEBHOOK_SECRET: "whsec_project_only",
    });
    expect(result.source).toBe("protected_live_override");
    expect(result.environment).toBe("production");
    expect(result.liveReady).toBe(true);
    expect(result.validationMessage).toBeNull();
  });

  it("does not fall back to the sandbox when a direct live entry is incomplete or mismatched", () => {
    const incomplete = resolveStripeCredentials({
      ...sandbox,
      CABINETDEALZ_STRIPE_LIVE_SECRET_KEY: "sk_live_project_only",
    });
    expect(incomplete.source).toBe("protected_live_override");
    expect(incomplete.liveReady).toBe(false);
    expect(incomplete.secretKey).toBe("sk_live_project_only");
    expect(incomplete.validationMessage).toContain("all three");

    const mismatched = resolveStripeCredentials({
      ...sandbox,
      CABINETDEALZ_STRIPE_LIVE_SECRET_KEY: "sk_test_wrong",
      CABINETDEALZ_STRIPE_LIVE_PUBLISHABLE_KEY: "pk_test_wrong",
      CABINETDEALZ_STRIPE_LIVE_WEBHOOK_SECRET: "whsec_project_only",
    });
    expect(mismatched.source).toBe("protected_live_override");
    expect(mismatched.liveReady).toBe(false);
    expect(mismatched.validationMessage).toContain("sk_live_");
  });
});
