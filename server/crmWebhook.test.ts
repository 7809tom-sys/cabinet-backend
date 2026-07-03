import { describe, it, expect } from "vitest";
import {
  buildCrmWebhookPayload,
  CRM_EVENT_LABELS,
  HOUSE_DEALER,
  type CrmDealerRef,
  type CrmContactRef,
} from "@shared/crmWebhook";

const dealer: CrmDealerRef = {
  affiliateId: 42,
  referralCode: "PELICAN42",
  dealerName: "Pelican Kitchens",
};

const contact: CrmContactRef = {
  userId: 7,
  name: "Jane Homeowner",
  email: "jane@example.com",
  phone: "555-1212",
};

describe("buildCrmWebhookPayload", () => {
  it("produces a flat, versioned payload with the right label", () => {
    const p = buildCrmWebhookPayload({
      event: "lead",
      dealer,
      contact,
      occurredAt: new Date("2026-01-02T03:04:05.000Z"),
    });
    expect(p.version).toBe(1);
    expect(p.event).toBe("lead");
    expect(p.eventLabel).toBe(CRM_EVENT_LABELS.lead);
    expect(p.occurredAt).toBe("2026-01-02T03:04:05.000Z");
  });

  it("flattens white-label attribution so a CRM can map it directly", () => {
    const p = buildCrmWebhookPayload({ event: "design_saved", dealer, contact });
    expect(p.affiliateId).toBe(42);
    expect(p.referralCode).toBe("PELICAN42");
    expect(p.dealer).toBe("Pelican Kitchens");
  });

  it("flattens the contact fields", () => {
    const p = buildCrmWebhookPayload({ event: "order_submitted", dealer, contact });
    expect(p.userId).toBe(7);
    expect(p.contactName).toBe("Jane Homeowner");
    expect(p.contactEmail).toBe("jane@example.com");
    expect(p.contactPhone).toBe("555-1212");
  });

  it("falls back to the house pipeline when no affiliate is attributed", () => {
    const p = buildCrmWebhookPayload({ event: "lead", dealer: HOUSE_DEALER, contact });
    expect(p.affiliateId).toBeNull();
    expect(p.referralCode).toBeNull();
    expect(p.dealer).toBe("Cabinet Dealz");
  });

  it("passes through event-specific data and link, defaulting sensibly", () => {
    const withData = buildCrmWebhookPayload({
      event: "order_submitted",
      dealer,
      contact,
      data: { orderNumber: "CD-1001", total: 12345 },
      link: "https://app/orders/1001",
    });
    expect(withData.data.orderNumber).toBe("CD-1001");
    expect(withData.data.total).toBe(12345);
    expect(withData.link).toBe("https://app/orders/1001");

    const bare = buildCrmWebhookPayload({ event: "lead", dealer, contact });
    expect(bare.data).toEqual({});
    expect(bare.link).toBeNull();
  });
});
