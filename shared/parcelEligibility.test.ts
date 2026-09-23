import { describe, expect, it } from "vitest";
import {
  evaluateParcelEligibility,
  normalizeParcelPackage,
  resolveParcelShipmentMode,
} from "./parcelEligibility";

describe("carrier-backed parcel eligibility", () => {
  it("allows a verified compact cabinet carton through UPS, FedEx, and USPS", () => {
    const result = evaluateParcelEligibility({
      lengthIn: 36,
      widthIn: 24,
      heightIn: 7,
      weightLbs: 48.2,
      hasAuthoritativePackage: true,
      label: "B12",
    });

    expect(result.package).toMatchObject({
      lengthIn: 36,
      widthIn: 24,
      heightIn: 7,
      weightLbs: 49,
      lengthPlusGirthIn: 98,
    });
    expect(result.eligibleCarriers).toEqual(["ups", "fedex", "usps"]);
    expect(result.requiresFreight).toBe(false);
  });

  it("keeps a 96-inch trim carton eligible while flagging USPS oversized handling", () => {
    const result = evaluateParcelEligibility({
      lengthIn: 96,
      widthIn: 4,
      heightIn: 4,
      weightLbs: 18,
      hasAuthoritativePackage: true,
    });

    expect(result.eligibleCarriers).toEqual(["ups", "fedex", "usps"]);
    expect(result.package?.uspsOversized).toBe(true);
  });

  it("excludes USPS when a verified carton exceeds its 70-pound ceiling", () => {
    const result = evaluateParcelEligibility({
      lengthIn: 48,
      widthIn: 24,
      heightIn: 7,
      weightLbs: 90,
      hasAuthoritativePackage: true,
    });

    expect(result.eligibleCarriers).toEqual(["ups", "fedex"]);
    expect(result.carriers.find((carrier) => carrier.carrier === "usps")?.reasons.join(" ")).toMatch(/70 lb/i);
  });

  it("requires freight for a carton above UPS and FedEx parcel length limits", () => {
    const result = evaluateParcelEligibility({
      lengthIn: 109,
      widthIn: 12,
      heightIn: 12,
      weightLbs: 80,
      hasAuthoritativePackage: true,
    });

    expect(result.eligibleCarriers).toEqual([]);
    expect(result.requiresFreight).toBe(true);
  });

  it("never creates parcel eligibility from missing package data", () => {
    const result = evaluateParcelEligibility({
      lengthIn: null,
      widthIn: 24,
      heightIn: 7,
      weightLbs: null,
      hasAuthoritativePackage: false,
    });

    expect(result.eligibleCarriers).toEqual([]);
    expect(result.requiresFreight).toBe(true);
    expect(result.reasons.join(" ")).toMatch(/authoritative carton/i);
  });

  it("rounds all carton dimensions up and treats USPS 108–130 length-plus-girth cartons as oversized", () => {
    const normalized = normalizeParcelPackage({
      lengthIn: 95.1,
      widthIn: 6.01,
      heightIn: 6.01,
      weightLbs: 14.1,
      hasAuthoritativePackage: true,
    });

    expect(normalized.package).toMatchObject({
      lengthIn: 96,
      widthIn: 7,
      heightIn: 7,
      weightLbs: 15,
      lengthPlusGirthIn: 124,
      uspsOversized: true,
    });
  });

  it("requires all cartons in a shipment group to share an eligible parcel carrier", () => {
    const result = resolveParcelShipmentMode([
      { lengthIn: 36, widthIn: 24, heightIn: 7, weightLbs: 48, hasAuthoritativePackage: true },
      { lengthIn: 96, widthIn: 4, heightIn: 4, weightLbs: 18, hasAuthoritativePackage: true },
    ]);
    expect(result.mode).toBe("parcel");
    expect(result.eligibleCarriers).toEqual(["ups", "fedex", "usps"]);

    const freight = resolveParcelShipmentMode([
      { lengthIn: 36, widthIn: 24, heightIn: 7, weightLbs: 48, hasAuthoritativePackage: true },
      { lengthIn: null, widthIn: 24, heightIn: 7, weightLbs: null, hasAuthoritativePackage: false },
    ]);
    expect(freight.mode).toBe("freight");
    expect(freight.eligibleCarriers).toEqual([]);
  });
});
