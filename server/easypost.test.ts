import { describe, it, expect, vi } from "vitest";
import {
  easypostParcelQuote,
  easypostQuote,
  type LiveParcelQuoteRequest,
  type LiveQuoteRequest,
} from "./_core/easypost";

const REQ: LiveQuoteRequest = {
  fromZip: "30303",
  toZip: "90210",
  pallets: [{ lengthIn: 96, widthIn: 40, heightIn: 60, weightLbs: 950 }],
  freightClass: "175",
};

const PARCEL_REQ: LiveParcelQuoteRequest = {
  fromZip: "30303",
  toZip: "90210",
  residential: true,
  parcels: [
    { lengthIn: 36, widthIn: 24, heightIn: 7, weightLbs: 48, label: "B12" },
    { lengthIn: 24, widthIn: 24, heightIn: 7, weightLbs: 36, label: "B24" },
  ],
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("easypostQuote", () => {
  it("returns the lowest rate in cents on success", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        rates: [
          { rate: "612.50", carrier: "FedExFreight", service: "PRIORITY" },
          { rate: "548.00", carrier: "ODFL", service: "STANDARD" },
        ],
      })
    );
    const r = await easypostQuote("EZTK_test", REQ, fetchMock as unknown as typeof fetch);
    expect(r.ok).toBe(true);
    expect(r.amountCents).toBe(54800);
    expect(r.carrier).toBe("ODFL");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("fails clearly when no API key is provided", async () => {
    const r = await easypostQuote("", REQ);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/api key/i);
  });

  it("reports the carrier error message on HTTP failure", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ error: { message: "invalid freight class" } }, false, 422)
    );
    const r = await easypostQuote("EZTK_test", REQ, fetchMock as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/invalid freight class/i);
  });

  it("returns a clear message when the carrier returns no rates", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ rates: [] }));
    const r = await easypostQuote("EZTK_test", REQ, fetchMock as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no carrier rates/i);
  });

  it("handles network errors without throwing", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    const r = await easypostQuote("EZTK_test", REQ, fetchMock as unknown as typeof fetch);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/ECONNRESET/);
  });
});

describe("easypostParcelQuote", () => {
  it("rates each verified carton and selects the lowest UPS, FedEx, or USPS result", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        rates: [
          { rate: "42.60", carrier: "UPS", service: "Ground", delivery_days: 4 },
          { rate: "37.20", carrier: "USPS", service: "GroundAdvantage", delivery_days: 5 },
          { rate: "12.00", carrier: "DHL", service: "Ground", delivery_days: 4 },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({
        rates: [
          { rate: "39.40", carrier: "FedEx", service: "Ground", delivery_days: 3, delivery_date: "2026-09-30" },
          { rate: "45.10", carrier: "UPS", service: "Ground", delivery_days: 4 },
        ],
      }));

    const result = await easypostParcelQuote("EZTK_test", PARCEL_REQ, fetchMock as unknown as typeof fetch);

    expect(result).toMatchObject({
      ok: true,
      amountCents: 7660,
      carrier: "USPS, FedEx",
      service: "GroundAdvantage, Ground",
      transitDays: 5,
      estimatedDeliveryDate: "2026-09-30",
    });
    expect(result.packages).toEqual([
      expect.objectContaining({ label: "B12", carrier: "USPS", amountCents: 3720 }),
      expect.objectContaining({ label: "B24", carrier: "FedEx", amountCents: 3940 }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstPayload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(firstPayload.shipment.parcel).toMatchObject({ length: 36, width: 24, height: 7, weight: 768 });
    expect(firstPayload.shipment.to_address.residential).toBe(true);
  });

  it("does not silently fall back to an unsupported carrier", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      rates: [{ rate: "10.00", carrier: "DHL", service: "Ground" }],
    }));

    const result = await easypostParcelQuote("EZTK_test", {
      ...PARCEL_REQ,
      parcels: [PARCEL_REQ.parcels[0]],
    }, fetchMock as unknown as typeof fetch);

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/UPS, FedEx, or USPS/i);
    expect(result.packages).toEqual([]);
  });
});
