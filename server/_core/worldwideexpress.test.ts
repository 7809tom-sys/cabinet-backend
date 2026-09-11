import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSpeedshipShopFlowPayload,
  clearWorldwideExpressTokenCache,
  normalizeSpeedshipFreightClass,
  parseSpeedshipRates,
  requireWwexHttpsEndpoint,
  worldwideexpressQuote,
} from "./worldwideexpress";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("requireWwexHttpsEndpoint", () => {
  it("accepts only credential-free HTTPS URLs supplied by the WWEX representative", () => {
    expect(requireWwexHttpsEndpoint("https://sandbox.example.test/oauth/token", "sandbox token"))
      .toBe("https://sandbox.example.test/oauth/token");
    expect(() => requireWwexHttpsEndpoint("", "sandbox token")).toThrow(/not configured/i);
    expect(() => requireWwexHttpsEndpoint("http://sandbox.example.test/token", "sandbox token")).toThrow(/HTTPS/i);
    expect(() => requireWwexHttpsEndpoint("https://user:pass@sandbox.example.test/token", "sandbox token")).toThrow(/credential-free/i);
  });
});

describe("normalizeSpeedshipFreightClass", () => {
  it("accepts only documented Speedship LTL freight classes", () => {
    expect(normalizeSpeedshipFreightClass("175")).toBe("175");
    expect(normalizeSpeedshipFreightClass("77.5")).toBe("77.5");
    expect(normalizeSpeedshipFreightClass("75")).toBeNull();
  });
});

describe("worldwideexpressQuote", () => {
  const addresses = {
    fromAddress: { locality: "Osprey", region: "FL", countryCode: "US" as const },
    toAddress: { locality: "Atlanta", region: "GA", countryCode: "US" as const },
  };

  it("sends the documented Speedship LTL envelope with each final pallet dimension and loaded weight", async () => {
    clearWorldwideExpressTokenCache();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token-1", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        rates: [{ carrier: "Test Carrier", service: "LTL", totalCharge: 812.34 }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await worldwideexpressQuote(
      {
        clientId: "client-pallet-test",
        clientSecret: "secret",
        accountNumber: "account",
        environment: "sandbox",
        tokenUrl: "https://sandbox.example.test/oauth/token",
        rateUrl: "https://sandbox.example.test/rates",
      },
      {
        fromZip: "30303",
        toZip: "32801",
        ...addresses,
        freightClass: "175",
        residential: true,
        liftgate: true,
        pallets: [
          { lengthIn: 48, widthIn: 40, heightIn: 60, weightLbs: 742 },
          { lengthIn: 96, widthIn: 40, heightIn: 60, weightLbs: 518 },
        ],
      },
    );

    expect(result).toMatchObject({ ok: true, amountCents: 81234, carrier: "Test Carrier", service: "LTL" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://sandbox.example.test/oauth/token");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://sandbox.example.test/rates");
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain("audience=staging-wwex-apig");
    const rateBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(rateBody.request.productType).toBe("LTL");
    expect(rateBody.request.shipment.totalWeight).toEqual({ value: 1260, unit: "LB" });
    expect(rateBody.request.shipment.handlingUnitList).toEqual(expect.arrayContaining([
      expect.objectContaining({ packagingType: "PLT", weight: { value: 742, unit: "LB" } }),
      expect.objectContaining({ packagingType: "PLT", weight: { value: 518, unit: "LB" } }),
    ]));
    expect(rateBody.request.shipment.handlingUnitList[0]).toMatchObject({
      billedDimension: {
        length: { value: "48", unit: "in" },
        width: { value: "40", unit: "in" },
        height: { value: "60", unit: "in" },
        dimensionType: "NET",
      },
      isMixedClass: false,
      isStackable: false,
      totalWeight: { value: 742, unit: "LB" },
      shippedItemList: [expect.objectContaining({ commodityType: "BOX", isHazMat: false, quantity: "1" })],
    });
    expect(rateBody.request.shipment.handlingUnitList[0]).not.toHaveProperty("dimensions");
    expect(rateBody.request.shipment.destinationAddress).toMatchObject({ locationType: "RESIDENTIAL" });
    expect(rateBody.request.shipment.originAddress.address.contactList).toEqual([
      expect.objectContaining({ contactType: "SENDER", phone: "2148888888" }),
    ]);
    expect(rateBody.request.shipment.destinationAddress.address.contactList).toEqual([
      expect.objectContaining({ contactType: "RECEIVER", phone: "9728888888" }),
    ]);
    expect(rateBody.request.shipment.liftgateDeliveryFlag).toBe(true);
    expect(rateBody.request.shipment).toMatchObject({
      insuranceRequestFlag: false,
      carrierTerminalPickupFlag: false,
      constructionSitePickupFlag: false,
      liftgatePickupFlag: false,
      insidePickupFlag: false,
      handlingCharge: { value: "0", unit: "AMOUNT" },
    });
  });

  it("uses the official production OAuth discovery token endpoint when the saved production token URL is blank", async () => {
    clearWorldwideExpressTokenCache();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "production-token", expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ rates: [{ carrier: "Test Carrier", totalCharge: 901.23 }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await worldwideexpressQuote(
      {
        clientId: "production-client",
        clientSecret: "secret",
        accountNumber: "account",
        environment: "production",
        tokenUrl: null,
        rateUrl: "https://rates.example.test/svc/shopFlow",
      },
      {
        fromZip: "30303",
        toZip: "32801",
        ...addresses,
        freightClass: "175",
        pallets: [{ lengthIn: 96, widthIn: 40, heightIn: 60, weightLbs: 900 }],
      },
    );

    expect(result).toMatchObject({ ok: true, amountCents: 90123 });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://auth.wwex.com/oauth/token");
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).not.toContain("audience=");
  });

  it("builds a ZIP-based Speedship request without claiming a customer street address", () => {
    const payload = buildSpeedshipShopFlowPayload({
      fromZip: "34229",
      toZip: "30303",
      ...addresses,
      freightClass: "175",
      pallets: [{ lengthIn: 96, widthIn: 40, heightIn: 60, weightLbs: 900 }],
    }, new Date("2026-09-10T12:00:00Z"));
    expect(payload.request.shipment.originAddress.address).toMatchObject({
      locality: "Osprey",
      region: "FL",
      postalCode: "34229",
      addressLineList: ["ZIP-based carrier rate inquiry"],
    });
    expect(payload.request.shipment.shipmentDate).toBe("2026-09-11 11:00:00");
    expect(payload.request.shipment.skipAddressVerification).toBe(true);
    expect(payload.request.shipment.originAddress.address.contactList[0]).toMatchObject({
      firstName: "CabinetDealz",
      contactType: "SENDER",
    });
  });

  it("uses the next-day pickup time instead of a past same-day time", () => {
    const payload = buildSpeedshipShopFlowPayload({
      fromZip: "30303",
      toZip: "32801",
      ...addresses,
      freightClass: "175",
      pallets: [{ lengthIn: 96, widthIn: 40, heightIn: 60, weightLbs: 900 }],
    }, new Date("2026-09-11T16:00:00Z"));

    expect(payload.request.shipment.shipmentDate).toBe("2026-09-12 11:00:00");
  });

  it("preserves a supplied verified address line when a carrier request requires one", () => {
    const payload = buildSpeedshipShopFlowPayload({
      fromZip: "90277",
      toZip: "75219",
      fromAddress: { locality: "REDONDO BEACH", region: "CA", countryCode: "US", addressLineList: ["620 CAMINO REAL"] },
      toAddress: { locality: "HIGHLAND PARK", region: "TX", countryCode: "US", addressLineList: ["3838 Oak Lawn Ave"] },
      freightClass: "175",
      pallets: [{ lengthIn: 48, widthIn: 48, heightIn: 48, weightLbs: 500 }],
    });

    expect(payload.request.shipment.originAddress.address.addressLineList).toEqual(["620 CAMINO REAL"]);
    expect(payload.request.shipment.destinationAddress.address.addressLineList).toEqual(["3838 Oak Lawn Ave"]);
  });

  it("recognizes documented direct and nested Speedship rate amount shapes", () => {
    expect(parseSpeedshipRates({ response: { quotes: [
      { carrierName: "Carrier A", serviceName: "Standard", totalCharge: 945.25 },
      { carrierName: "Carrier B", serviceName: "Economy", totalAmount: { amount: "901.10" } },
    ] } })).toEqual([
      { amountCents: 94525, carrier: "Carrier A", service: "Standard" },
      { amountCents: 90110, carrier: "Carrier B", service: "Economy" },
    ]);
  });

  it("uses each Speedship offer's complete offerPrice instead of an individual freight or fuel line", () => {
    expect(parseSpeedshipRates({
      response: {
        offerList: [{
          primaryVendor: { preferredName: "Central Transport" },
          offeredProductList: [{
            offerPrice: 585.32,
            chargeItemList: [
              { customerChargeCode: "FREIGHT", customerPrice: { value: 376.08 } },
              { customerChargeCode: "FSC", customerPrice: { value: 172.24 } },
              { customerChargeCode: "CARBFEE", customerPrice: { value: 37 } },
            ],
          }],
        }],
      },
    })).toEqual([{ amountCents: 58532, carrier: "Central Transport", service: undefined }]);
  });

  it("does not treat a partial charge line as a carrier offer when Speedship omits the full offerPrice", () => {
    expect(parseSpeedshipRates({
      response: {
        offerList: [{
          offeredProductList: [{
            chargeItemList: [{ customerPrice: { value: 376.08 } }],
          }],
        }],
      },
    })).toEqual([]);
  });

  it("fails before network access when a verified environment endpoint is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await worldwideexpressQuote(
      {
        clientId: "client-missing-endpoint",
        clientSecret: "secret",
        accountNumber: "",
        environment: "sandbox",
        tokenUrl: null,
        rateUrl: null,
      },
      {
        fromZip: "30303",
        toZip: "32801",
        freightClass: "175",
        pallets: [{ lengthIn: 48, widthIn: 40, heightIn: 60, weightLbs: 742 }],
      },
    );

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/sandbox rate URL is not configured/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns an actionable status without exposing a provider response body", async () => {
    clearWorldwideExpressTokenCache();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token-2" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response("private provider diagnostic", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await worldwideexpressQuote(
      {
        clientId: "client-sanitized-error",
        clientSecret: "secret",
        accountNumber: "",
        environment: "sandbox",
        tokenUrl: "https://sandbox.example.test/oauth/token-2",
        rateUrl: "https://sandbox.example.test/rates-2",
      },
      {
        fromZip: "30303",
        toZip: "32801",
        ...addresses,
        freightClass: "175",
        pallets: [{ lengthIn: 48, widthIn: 40, heightIn: 60, weightLbs: 742 }],
      },
    );

    expect(result.error).toMatch(/rate request failed \(500\)/i);
    expect(result.error).not.toContain("private provider diagnostic");
  });

  it("labels a temporary authentication throttle without blaming credentials or retrying OAuth", async () => {
    clearWorldwideExpressTokenCache();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 429, headers: { "retry-after": "120" } }));
    vi.stubGlobal("fetch", fetchMock);
    const creds = {
      clientId: "client-rate-limited",
      clientSecret: "secret",
      accountNumber: "account",
      environment: "sandbox" as const,
      tokenUrl: "https://sandbox.example.test/oauth/token",
      rateUrl: "https://sandbox.example.test/rates",
    };
    const request = {
      fromZip: "30303",
      toZip: "32801",
      ...addresses,
      freightClass: "175",
      pallets: [{ lengthIn: 48, widthIn: 40, heightIn: 60, weightLbs: 742 }],
    };

    const first = await worldwideexpressQuote(creds, request);
    const second = await worldwideexpressQuote(creds, request);

    expect(first).toMatchObject({ ok: false, amountCents: 0 });
    expect(first.error).toMatch(/temporarily rate-limited/i);
    expect(first.error).toMatch(/do not need to be replaced/i);
    expect(first.error).not.toMatch(/verify.*credentials/i);
    expect(second.error).toMatch(/temporarily rate-limited/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
