import { afterEach, describe, expect, it, vi } from "vitest";
import { clearUpsTokenCache, upsParcelQuote } from "./ups";

afterEach(() => {
  clearUpsTokenCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const credentials = {
  clientId: "ups-client-id",
  clientSecret: "ups-client-secret",
  accountNumber: "22V1B8",
  environment: "sandbox" as const,
};

const request = {
  fromZip: "30303",
  toZip: "75219",
  fromAddress: { locality: "Atlanta", region: "GA", countryCode: "US" as const },
  toAddress: { locality: "Dallas", region: "TX", countryCode: "US" as const },
  parcels: [{ lengthIn: 20, widthIn: 15, heightIn: 10, weightLbs: 30, label: "B24" }],
};

describe("upsParcelQuote", () => {
  it("uses official UPS CIE OAuth and Shop endpoints with the linked shipper number", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "test-token", expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        RateResponse: {
          RatedShipment: [
            {
              Service: { Code: "03", Description: "UPS Ground" },
              TotalCharges: { MonetaryValue: "34.00", CurrencyCode: "USD" },
              NegotiatedRateCharges: { TotalCharge: { MonetaryValue: "29.50", CurrencyCode: "USD" } },
              TimeInTransit: { ServiceSummaryEstimatedArrival: { BusinessDaysInTransit: "2", Date: "20260930" } },
            },
            {
              Service: { Code: "02", Description: "UPS 2nd Day Air" },
              TotalCharges: { MonetaryValue: "48.00", CurrencyCode: "USD" },
            },
          ],
        },
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await upsParcelQuote(credentials, request);

    expect(result).toMatchObject({
      ok: true,
      amountCents: 2950,
      carrier: "UPS",
      service: "UPS Ground",
      transitDays: 2,
      estimatedDeliveryDate: "2026-09-30",
      packages: [{ label: "B24", amountCents: 2950, carrier: "UPS", service: "UPS Ground" }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://wwwcie.ups.com/security/v1/oauth/token");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        Authorization: `Basic ${Buffer.from("ups-client-id:ups-client-secret").toString("base64")}`,
      }),
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://wwwcie.ups.com/api/rating/v2409/Shop");
    const payload = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(payload.RateRequest.Shipment).toMatchObject({
      Shipper: { ShipperNumber: "22V1B8", Address: { PostalCode: "30303", CountryCode: "US" } },
      ShipTo: { Address: { PostalCode: "75219", CountryCode: "US" } },
      PaymentDetails: { ShipmentCharge: [{ BillShipper: { AccountNumber: "22V1B8" } }] },
      Package: {
        Dimensions: { Length: "20", Width: "15", Height: "10", UnitOfMeasurement: { Code: "IN" } },
        PackageWeight: { Weight: "30", UnitOfMeasurement: { Code: "LBS" } },
      },
    });
  });

  it("uses the documented UPS production host only when production is selected", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const production = await upsParcelQuote({ ...credentials, environment: "production" }, request);
    expect(production.ok).toBe(false); // second mocked response is intentionally not a valid rate response
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://onlinetools.ups.com/security/v1/oauth/token");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://onlinetools.ups.com/api/rating/v2409/Shop");
  });

  it("refuses missing or invented carton data before contacting UPS", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await upsParcelQuote(credentials, {
      ...request,
      parcels: [{ lengthIn: 0, widthIn: 15, heightIn: 10, weightLbs: 30, label: "missing source carton" }],
    });
    expect(result).toMatchObject({ ok: false, amountCents: 0 });
    expect(result.error).toMatch(/verified positive carton dimensions/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sanitizes an unsuccessful UPS Rate response without exposing its body", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response("private UPS diagnostic", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await upsParcelQuote(credentials, request);
    expect(result).toMatchObject({ ok: false, amountCents: 0 });
    expect(result.error).toMatch(/request failed \(401\)/i);
    expect(result.error).not.toContain("private UPS diagnostic");
  });
});
