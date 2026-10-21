import { describe, expect, it } from "vitest";
import {
  PELICAN_SCOPE,
  carrierNeedsTracking,
  fulfillmentStage,
  groupLinesByVendorScope,
  isValidTrackingNumber,
  lineVendorScope,
  normalizeTrackingNumber,
  parseVendorScope,
  trackingUrl,
  upcomingStageLabel,
  validateShipment,
} from "./vendorFulfillment";

const ctx = { orderDistributorId: 180001, hardwareDistributorId: 300001 };

describe("vendor scopes", () => {
  it("accepts only pelican or dist:<positive id>", () => {
    expect(parseVendorScope("pelican")).toBe("pelican");
    expect(parseVendorScope("dist:300001")).toBe("dist:300001");
    for (const bad of ["", "PELICAN", "dist:", "dist:0", "dist:-1", "dist:1.5", "dist:12345678901", "dist:1 OR 1=1", null, 7, undefined]) {
      expect(parseVendorScope(bad)).toBeNull();
    }
  });
});

describe("which vendor supplies a line", () => {
  it("routes surfaces to Pelican, hardware to Hardware Resources, cabinets to their line", () => {
    expect(lineVendorScope({ productKind: "surface" }, ctx)).toBe(PELICAN_SCOPE);
    expect(lineVendorScope({ productKind: "hardware" }, ctx)).toBe("dist:300001");
    expect(lineVendorScope({ productKind: null, distributorId: 210001 }, ctx)).toBe("dist:210001");
  });

  it("falls back to the order's resolved distributor for a cabinet line without one", () => {
    expect(lineVendorScope({ productKind: null, distributorId: null }, ctx)).toBe("dist:180001");
  });

  it("never guesses: an unresolved line belongs to nobody", () => {
    const none = { orderDistributorId: null, hardwareDistributorId: null };
    expect(lineVendorScope({ productKind: null }, none)).toBeNull();
    expect(lineVendorScope({ productKind: "hardware" }, none)).toBeNull();
  });

  it("splits a mixed order so each vendor sees only its own items", () => {
    const grouped = groupLinesByVendorScope(
      [
        { masterCode: "B30", description: "Base 30", qty: 2, distributorId: 180001, doorStyle: "Shaker" },
        { masterCode: "Apollo 3cm", description: "Quartz slab", qty: 1, productKind: "surface" },
        { masterCode: "HW-1", description: "Pull", qty: 12, productKind: "hardware" },
        { masterCode: "W3030", description: "Wall 30", qty: 1, distributorId: 180001 },
      ],
      ctx,
    );
    expect(grouped.get("pelican")?.map((i) => i.sku)).toEqual(["Apollo 3cm"]);
    expect(grouped.get("dist:300001")?.map((i) => i.sku)).toEqual(["HW-1"]);
    expect(grouped.get("dist:180001")?.map((i) => i.sku)).toEqual(["B30", "W3030"]);
    expect(grouped.get("dist:180001")?.[0]).toEqual({ sku: "B30", description: "Base 30", qty: 2, doorStyle: "Shaker" });
  });

  it("never exposes prices to a vendor", () => {
    const grouped = groupLinesByVendorScope(
      [{ masterCode: "X", description: "d", qty: 1, productKind: "surface", ...({ unitPrice: 99, linePrice: 99 } as object) }],
      ctx,
    );
    expect(Object.keys(grouped.get("pelican")![0]).sort()).toEqual(["description", "doorStyle", "qty", "sku"]);
  });

  it("repairs a missing or invalid quantity to a whole number of at least one", () => {
    const grouped = groupLinesByVendorScope(
      [{ masterCode: "A", qty: 0, productKind: "surface" }, { masterCode: "B", qty: 2.9, productKind: "surface" }, { masterCode: "C", productKind: "surface" }],
      ctx,
    );
    expect(grouped.get("pelican")?.map((i) => i.qty)).toEqual([1, 2, 1]);
  });
});

describe("when a vendor may ship", () => {
  const paid = new Date();
  it("only after payment AND the order rail authorized fulfillment", () => {
    expect(fulfillmentStage({ status: "confirmed", paidAt: paid, orderRailStatus: "fulfillment_authorized" })).toBe("ready");
  });

  it("shows paid orders still in review as upcoming, read-only", () => {
    for (const rail of ["affiliate_review", "distributor_inventory_check", "affiliate_invoice_review"]) {
      expect(fulfillmentStage({ status: "confirmed", paidAt: paid, orderRailStatus: rail })).toBe("upcoming");
    }
  });

  it("hides unpaid, draft, submitted and cancelled orders entirely", () => {
    expect(fulfillmentStage({ status: "confirmed", paidAt: null, orderRailStatus: "fulfillment_authorized" })).toBe("hidden");
    for (const status of ["draft", "submitted", "cancelled"]) {
      expect(fulfillmentStage({ status, paidAt: paid, orderRailStatus: "fulfillment_authorized" })).toBe("hidden");
    }
  });

  it("explains each waiting step in plain words", () => {
    expect(upcomingStageLabel("affiliate_review")).toMatch(/affiliate approval/);
    expect(upcomingStageLabel("distributor_inventory_check")).toMatch(/inventory/);
    expect(upcomingStageLabel("something_new")).toBe("Waiting for release");
  });

  it("does not blame an affiliate that does not exist", () => {
    expect(upcomingStageLabel("affiliate_review", { hasAffiliate: false })).toBe("Waiting for Cabinet Dealz to release this order");
    expect(upcomingStageLabel("affiliate_review", { hasAffiliate: true })).toBe("Waiting for affiliate approval");
    expect(upcomingStageLabel("distributor_inventory_check", { hasAffiliate: false })).toMatch(/inventory/);
  });
});

describe("tracking numbers and carrier links", () => {
  it("normalizes pasted numbers", () => {
    expect(normalizeTrackingNumber(" 1z 999 aa1 0123 456 784 ")).toBe("1Z999AA10123456784");
    expect(isValidTrackingNumber("1z 999 aa1 0123 456 784")).toBe(true);
    for (const bad of ["", "abc", "12 3", "bad number!", "x".repeat(41)]) expect(isValidTrackingNumber(bad)).toBe(false);
  });

  it("builds public tracking links for the big four carriers only", () => {
    expect(trackingUrl("UPS", "1Z999AA10123456784")).toBe("https://www.ups.com/track?tracknum=1Z999AA10123456784");
    expect(trackingUrl("FedEx", "123456789012")).toContain("fedex.com/fedextrack/?trknbr=123456789012");
    expect(trackingUrl("USPS", "9400111899223856928499")).toContain("tools.usps.com");
    expect(trackingUrl("DHL", "1234567890")).toContain("dhl.com");
    expect(trackingUrl("LTL freight", "1234567890")).toBeNull();
    expect(trackingUrl("UPS", "")).toBeNull();
    expect(trackingUrl("UPS", "bad number!")).toBeNull();
  });

  it("cannot be turned into a script or foreign link by a hostile tracking number", () => {
    expect(trackingUrl("UPS", "javascript:alert(1)")).toBeNull();
    expect(trackingUrl("UPS", "1Z999&evil=1")).toBeNull();
  });
});

describe("marking an order shipped", () => {
  it("requires a carrier and a tracking number for carriers that have one", () => {
    expect(validateShipment({ carrier: "", trackingNumber: "1Z999AA10123456784" })).toMatchObject({ ok: false });
    expect(validateShipment({ carrier: "UPS", trackingNumber: "" })).toMatchObject({ ok: false, message: expect.stringMatching(/tracking number/i) });
    expect(validateShipment({ carrier: "UPS", trackingNumber: "ab" })).toMatchObject({ ok: false });
  });

  it("allows own-truck delivery and pickup without a tracking number", () => {
    expect(carrierNeedsTracking("Customer pickup")).toBe(false);
    expect(carrierNeedsTracking("Vendor truck / own delivery")).toBe(false);
    expect(carrierNeedsTracking("UPS")).toBe(true);
    expect(validateShipment({ carrier: "Customer pickup" })).toEqual({ ok: true, carrier: "Customer pickup", trackingNumber: null, packageCount: 1 });
  });

  it("returns clean values and defaults package count to one", () => {
    expect(validateShipment({ carrier: " UPS ", trackingNumber: " 1z 999 aa1 0123 456 784 ", packageCount: 3 })).toEqual({
      ok: true,
      carrier: "UPS",
      trackingNumber: "1Z999AA10123456784",
      packageCount: 3,
    });
    expect(validateShipment({ carrier: "UPS", trackingNumber: "1Z999AA10123456784" })).toMatchObject({ ok: true, packageCount: 1 });
  });

  it("rejects absurd package counts", () => {
    expect(validateShipment({ carrier: "UPS", trackingNumber: "1Z999AA10123456784", packageCount: 0 })).toMatchObject({ ok: false });
    expect(validateShipment({ carrier: "UPS", trackingNumber: "1Z999AA10123456784", packageCount: 100 })).toMatchObject({ ok: false });
  });
});
