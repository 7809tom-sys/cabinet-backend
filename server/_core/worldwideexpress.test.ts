import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSpeedshipShopFlowPayload,
  clearWorldwideExpressTokenCache,
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
    expect(rateBody.request.shipment.destinationAddress).toMatchObject({ locationType: "RESIDENTIAL" });
    expect(rateBody.request.shipment.liftgateDeliveryFlag).toBe(true);
  });

  it("builds a Speedship request from verified ZIP-derived location data without inventing a street address", () => {
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
      addressLineList: [],
    });
    expect(payload.request.shipment.skipAddressVerification).toBe(true);
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
});
