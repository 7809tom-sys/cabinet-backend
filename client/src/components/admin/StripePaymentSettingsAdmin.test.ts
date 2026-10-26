import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (relative: string) => readFileSync(resolve(process.cwd(), relative), "utf8");

describe("Stripe Payment settings", () => {
  it("is exposed under Administration Settings and mounted as its own panel", () => {
    const tabs = source("client/src/components/admin/AdminGroupedTabs.tsx");
    expect(tabs).toContain('{ value: "stripe-payment", label: "Stripe Payment" }');
    expect(tabs).toContain('<TabsContent value="stripe-payment"');
    expect(tabs).toContain("<StripePaymentSettingsAdmin />");
  });

  it("provides a secure operations dashboard without credential inputs or secret values", () => {
    const panel = source("client/src/components/admin/StripePaymentSettingsAdmin.tsx");
    expect(panel).toContain("adminGetStripeDashboard.useQuery");
    expect(panel).toContain("Open Stripe Dashboard");
    expect(panel).toContain("Live activation checklist");
    expect(panel).toContain("Hosted Checkout activity");
    expect(panel).toContain("Copy live webhook URL");
    expect(panel).toContain("secret keys stay in Stripe or protected project secrets");
    expect(panel).not.toContain('type="password"');
    expect(panel).not.toContain("setSecret");
    expect(panel).not.toContain("setPublishable");
  });

  it("keeps dashboard activity admin-only and does not render Stripe identifiers", () => {
    const router = source("server/routers/payments.ts");
    const dashboard = router.slice(router.indexOf("adminGetStripeDashboard:"), router.indexOf("adminSaveSettings:"));
    const panel = source("client/src/components/admin/StripePaymentSettingsAdmin.tsx");
    expect(dashboard).toContain("adminGetStripeDashboard: adminProcedure");
    expect(dashboard).toContain("stripeSessionId" );
    expect(dashboard).toContain("stripeDashboardUrl: \"https://dashboard.stripe.com/\"");
    expect(dashboard).toContain("webhookUrl: \"https://www.cabinetdealz.com/api/stripe/webhook\"");
    expect(panel).not.toContain("stripeSessionId");
    expect(panel).not.toContain("stripePaymentIntentId");
    expect(panel).not.toContain("originatorEmail");
  });
});
