import { describe, it, expect } from "vitest";
import {
  haversineMiles,
  normalizeZip,
  approxZipCentroid,
  nearestWarehouseMiles,
  isWithinRadius,
  DEFAULT_SERVICE_RADIUS_MI,
} from "./availability";

describe("normalizeZip", () => {
  it("extracts a 5-digit zip from various inputs", () => {
    expect(normalizeZip("75234")).toBe("75234");
    expect(normalizeZip("75234-1234")).toBe("75234");
    expect(normalizeZip("Dallas, TX 75234")).toBe("75234");
    expect(normalizeZip("  33054  ")).toBe("33054");
  });
  it("returns null for non-zip input", () => {
    expect(normalizeZip("")).toBeNull();
    expect(normalizeZip("abc")).toBeNull();
    expect(normalizeZip(null)).toBeNull();
  });
});

describe("haversineMiles", () => {
  it("is ~0 for identical points", () => {
    expect(haversineMiles({ lat: 32.8, lng: -96.8 }, { lat: 32.8, lng: -96.8 })).toBeLessThan(0.01);
  });
  it("approximates a known distance (Dallas → Houston ≈ 225 mi)", () => {
    const d = haversineMiles({ lat: 32.78, lng: -96.8 }, { lat: 29.76, lng: -95.37 });
    expect(d).toBeGreaterThan(200);
    expect(d).toBeLessThan(260);
  });
});

describe("approxZipCentroid", () => {
  it("resolves seeded warehouse prefixes", () => {
    expect(approxZipCentroid("75234")).not.toBeNull(); // Dallas
    expect(approxZipCentroid("32401")).not.toBeNull(); // Panama City
    expect(approxZipCentroid("30024")).not.toBeNull(); // Suwanee GA
  });
});

describe("availability radius", () => {
  it("a Dallas customer is in range of a Dallas warehouse", () => {
    const cust = approxZipCentroid("75201"); // Dallas
    const dallasWh = approxZipCentroid("75247");
    expect(isWithinRadius(cust, [dallasWh])).toBe(true);
  });

  it("a Dallas customer is OUT of range of only a Seattle warehouse", () => {
    const cust = approxZipCentroid("75201"); // Dallas
    const seattleWh = approxZipCentroid("98032");
    expect(isWithinRadius(cust, [seattleWh])).toBe(false);
  });

  it("nearestWarehouseMiles picks the closest of several", () => {
    const cust = approxZipCentroid("75201");
    const d = nearestWarehouseMiles(cust, [
      approxZipCentroid("98032"), // Seattle (far)
      approxZipCentroid("75247"), // Dallas (near)
      approxZipCentroid("33054"), // Miami (far)
    ]);
    expect(d).not.toBeNull();
    expect(d!).toBeLessThan(50);
  });

  it("returns false when customer location can't be resolved", () => {
    expect(isWithinRadius(null, [approxZipCentroid("75247")])).toBe(false);
  });

  it("default radius is a sane positive number", () => {
    expect(DEFAULT_SERVICE_RADIUS_MI).toBeGreaterThan(0);
  });
});
