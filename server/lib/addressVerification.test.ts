import { describe, expect, it, vi, beforeEach } from "vitest";

const { makeRequest } = vi.hoisted(() => ({ makeRequest: vi.fn() }));
vi.mock("../_core/map", () => ({ makeRequest }));

import { verifyUsAddress, formatEnteredAddress } from "./addressVerification";

const addr = { line1: "100 Main St", city: "Sarasota", state: "FL", zip: "34236" };
const geo = (over: Record<string, unknown> = {}, comps?: Array<{ long_name: string; short_name: string; types: string[] }>) => ({
  status: "OK",
  results: [{
    formatted_address: "100 Main St, Sarasota, FL 34236, USA",
    address_components: comps ?? [
      { long_name: "100", short_name: "100", types: ["street_number"] },
      { long_name: "Main Street", short_name: "Main St", types: ["route"] },
      { long_name: "Sarasota", short_name: "Sarasota", types: ["locality"] },
      { long_name: "Florida", short_name: "FL", types: ["administrative_area_level_1"] },
      { long_name: "34236", short_name: "34236", types: ["postal_code"] },
    ],
    geometry: { location: { lat: 1, lng: 2 } },
    ...over,
  }],
});

describe("verifyUsAddress", () => {
  beforeEach(() => makeRequest.mockReset());

  it("verifies a street-level match whose state and ZIP agree", async () => {
    makeRequest.mockResolvedValue(geo());
    const r = await verifyUsAddress(addr);
    expect(r.verified).toBe(true);
    expect(r.status).toBe("verified");
    expect(r.normalized).toMatchObject({ line1: "100 Main Street", state: "FL", zip: "34236" });
  });

  it("rejects incomplete input without calling the geocoder", async () => {
    const r = await verifyUsAddress({ ...addr, line1: "" });
    expect(r.verified).toBe(false);
    expect(makeRequest).not.toHaveBeenCalled();
  });

  it("flags a ZIP that disagrees with the street address", async () => {
    makeRequest.mockResolvedValue(geo());
    const r = await verifyUsAddress({ ...addr, zip: "90210" });
    expect(r.verified).toBe(false);
    expect(r.status).toBe("partial");
    expect(r.reason).toMatch(/34236/);
  });

  it("flags a state mismatch", async () => {
    makeRequest.mockResolvedValue(geo());
    const r = await verifyUsAddress({ ...addr, state: "TX" });
    expect(r.verified).toBe(false);
    expect(r.reason).toMatch(/FL/);
  });

  it("does not verify a partial match with no street number", async () => {
    makeRequest.mockResolvedValue(geo({}, [
      { long_name: "Sarasota", short_name: "Sarasota", types: ["locality"] },
      { long_name: "Florida", short_name: "FL", types: ["administrative_area_level_1"] },
      { long_name: "34236", short_name: "34236", types: ["postal_code"] },
    ]));
    const r = await verifyUsAddress(addr);
    expect(r.verified).toBe(false);
    expect(r.status).toBe("partial");
  });

  it("reports unverified, never throws, when the geocoder fails", async () => {
    makeRequest.mockImplementationOnce(() => Promise.reject(new Error("down")).catch((e) => { throw e; }));
    const r = await verifyUsAddress(addr);
    expect(r.verified).toBe(false);
    expect(r.status).toBe("unverified");
  });

  it("reports unverified when nothing is found", async () => {
    makeRequest.mockResolvedValue({ status: "ZERO_RESULTS", results: [] });
    const r = await verifyUsAddress(addr);
    expect(r.verified).toBe(false);
  });

  it("formats the entered address for CRM storage", () => {
    expect(formatEnteredAddress({ ...addr, line2: "Suite 4", state: "fl" })).toBe("100 Main St, Suite 4, Sarasota, FL 34236");
  });
});
