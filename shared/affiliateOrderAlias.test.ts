import { describe, expect, it } from "vitest";
import { applyAffiliateOrderAliases, buildAffiliateOrderPersistence, resolveAffiliateOrderStyleName } from "./affiliateOrderAlias";
import { buildCrmWebhookPayload } from "./crmWebhook";

describe("affiliate order alias resolution", () => {
  it("overrides only the matching affiliate style in saved order data", () => {
    const aliases = new Map([[330007, "Reeves Alias Test 2026 Hickory"]]);
    const lines = applyAffiliateOrderAliases(
      [
        { styleId: 330007, doorStyle: "Silva Shaker (Ashford)" },
        { styleId: 330008, doorStyle: "Central White" },
      ],
      aliases,
    );
    expect(lines[0].doorStyle).toBe("Reeves Alias Test 2026 Hickory");
    expect(lines[1].doorStyle).toBe("Central White");
    expect(resolveAffiliateOrderStyleName(330007, "Silva Shaker (Ashford)", aliases)).toBe("Reeves Alias Test 2026 Hickory");
  });

  it("leaves non-affiliate submissions on their central name", () => {
    expect(resolveAffiliateOrderStyleName(330007, "Silva Shaker (Ashford)", new Map())).toBe("Silva Shaker (Ashford)");
  });

  it("keeps the resolved alias in the downstream CRM order summary payload", () => {
    const aliases = new Map([[330007, "Reeves Alias Test 2026 Hickory"]]);
    const styleName = resolveAffiliateOrderStyleName(330007, "Hickory Shaker", aliases);
    const payload = buildCrmWebhookPayload({
      event: "order_submitted",
      dealer: { affiliateId: 5730001, referralCode: "REAVESWAYCABINETSHOP", dealerName: "Reaves Way Cabinet Shop." },
      contact: { userId: null, name: "Alias Verification", email: "alias@example.test", phone: null },
      data: { styleName, itemCount: 1 },
      link: "/admin/orders/123",
    });
    expect(payload.data.styleName).toBe("Reeves Alias Test 2026 Hickory");
    expect(payload.dealer).toBe("Reaves Way Cabinet Shop.");
  });

  it("builds the exact submitted-order values used by order persistence", () => {
    const aliases = new Map([[330007, "Reeves Alias Test 2026 Hickory"]]);
    const persisted = buildAffiliateOrderPersistence({
      styleId: 330007,
      submittedStyleName: "Hickory Shaker",
      lines: [{ styleId: 330007, doorStyle: "Hickory Shaker", masterCode: "CBLPN2" }],
      aliases,
    });
    expect(persisted.styleName).toBe("Reeves Alias Test 2026 Hickory");
    expect(persisted.lineItems[0].doorStyle).toBe("Reeves Alias Test 2026 Hickory");
    expect(persisted.crmData.styleName).toBe("Reeves Alias Test 2026 Hickory");
  });
});
