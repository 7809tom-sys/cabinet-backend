import { describe, it, expect, vi } from "vitest";
import { fedexParcelQuote, fedexTestConnection, parseFedexRateReply } from "./_core/fedex";

const creds = { clientId: "id", clientSecret: "secret", accountNumber: "123456789", environment: "sandbox" as const };
const addr = { locality: "Madison", region: "WI", countryCode: "US" };
const req = { fromZip: "53703", toZip: "53186", fromAddress: addr, toAddress: addr, parcels: [{ lengthIn: 20, widthIn: 14, heightIn: 14, weightLbs: 30, label: "B12" }] };

function mockFetch(rateStatus = 200, rateBody: unknown = { output: { rateReplyDetails: [{ serviceName: "FedEx Ground", ratedShipmentDetails: [{ totalNetCharge: 18.4 }] }, { serviceName: "FedEx Express Saver", ratedShipmentDetails: [{ totalNetCharge: 41.2 }] }] } }) {
  return vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.endsWith("/oauth/token")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
    return new Response(JSON.stringify(rateBody), { status: rateStatus });
  }) as unknown as typeof fetch;
}

describe("FedEx parcel client", () => {
  it("picks the cheapest service and sums per-carton rates in cents", async () => {
    const r = await fedexParcelQuote({ ...creds, clientId: "id-a" }, req, mockFetch());
    expect(r.ok).toBe(true);
    expect(r.amountCents).toBe(1840);
    expect(r.carrier).toBe("FedEx");
  });
  it("refuses to rate without keys or without a real carton", async () => {
    expect((await fedexParcelQuote({ ...creds, clientSecret: "" }, req, mockFetch())).ok).toBe(false);
    expect((await fedexParcelQuote(creds, { ...req, parcels: [{ ...req.parcels[0], weightLbs: 0 }] }, mockFetch())).ok).toBe(false);
  });
  it("reports an API failure instead of inventing a rate", async () => {
    const r = await fedexParcelQuote({ ...creds, clientId: "id-b" }, req, mockFetch(403, {}));
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/403/);
  });
  it("test connection only needs a token and explains a rejected key", async () => {
    const bad = vi.fn(async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    const r = await fedexTestConnection({ ...creds, clientId: "id-c" }, bad);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/401/);
    expect((await fedexTestConnection({ ...creds, clientId: "id-d" }, mockFetch())).ok).toBe(true);
  });
  it("parseFedexRateReply ignores zero or missing charges", () => {
    expect(parseFedexRateReply({ output: { rateReplyDetails: [{ ratedShipmentDetails: [{ totalNetCharge: 0 }] }] } })).toBeNull();
    expect(parseFedexRateReply({})).toBeNull();
  });
});
