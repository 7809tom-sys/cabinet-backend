import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Stripe Payment settings", () => {
  it("is exposed under Administration Settings and mounted as its own panel", () => {
    const tabs = readFileSync(resolve(process.cwd(), "client/src/components/admin/AdminGroupedTabs.tsx"), "utf8");
    expect(tabs).toContain('{ value: "stripe-payment", label: "Stripe Payment" }');
    expect(tabs).toContain('<TabsContent value="stripe-payment"');
    expect(tabs).toContain("<StripePaymentSettingsAdmin />");
  });

  it("reports status without rendering credential fields or secret values", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/components/admin/StripePaymentSettingsAdmin.tsx"), "utf8");
    expect(source).toContain("adminGetStripeStatus.useQuery");
    expect(source).toContain("server-side");
    expect(source).toContain("secret keys are never displayed");
    expect(source).not.toContain('type="password"');
    expect(source).not.toContain("setSecret");
    expect(source).not.toContain("setPublishable");
  });
});
