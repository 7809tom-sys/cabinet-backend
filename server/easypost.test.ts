import { describe, it, expect, vi } from "vitest";
import { easypostQuote, type LiveQuoteRequest } from "./_core/easypost";

const REQ: LiveQuoteRequest = {
  fromZip: "30303",
  toZip: "90210",
  pallets: [{ lengthIn: 96, widthIn: 40, heightIn: 60, weightLbs: 950 }],
  freightClass: "175",
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
