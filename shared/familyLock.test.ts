import { describe, it, expect } from "vitest";
import { validateFamilyLock, canAddToCart } from "./familyLock";

describe("validateFamilyLock (submit lock = one supplier, colors mix freely)", () => {
  it("passes when all cabinet lines share one supplier and one style", () => {
    const r = validateFamilyLock([
      { styleId: 5, distributorId: 180001, masterCode: "B-24" },
      { styleId: 5, distributorId: 180001, masterCode: "W-30-30" },
    ]);
    expect(r.ok).toBe(true);
    expect(r.distributorId).toBe(180001);
    expect(r.styleId).toBe(5);
    expect(r.distinctStyleIds).toEqual([5]);
  });

  it("passes when two styles belong to the same supplier", () => {
    const r = validateFamilyLock([
      { styleId: 390001, distributorId: 180001, masterCode: "B-24" },
      { styleId: 390009, distributorId: 180001, masterCode: "W-30-30" },
    ]);
    expect(r.ok).toBe(true);
    expect(r.distributorId).toBe(180001);
    expect(r.styleId).toBeNull();
    expect(r.distinctStyleIds).toEqual([390001, 390009]);
    expect(r.distinctDistributorIds).toEqual([180001]);
  });

  it("rejects when lines mix two suppliers", () => {
    const r = validateFamilyLock([
      { styleId: 390001, distributorId: 180001, masterCode: "B-24" },
      { styleId: 330005, distributorId: 210001, masterCode: "W-30-30" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.distributorId).toBeNull();
    expect(r.distinctDistributorIds).toEqual([180001, 210001]);
    expect(r.reason).toMatch(/single supplier/i);
    expect(r.reason).toMatch(/180001, 210001/);
  });

  it("ignores Pelican and hardware lines that carry no style or supplier", () => {
    const r = validateFamilyLock([
      { styleId: 390001, distributorId: 180001, masterCode: "B-24" },
      { styleId: 390009, distributorId: 180001, masterCode: "W3030" },
      { styleId: null, distributorId: null, productKind: "surface", masterCode: "PEL-1" },
      { styleId: null, distributorId: null, productKind: "hardware", masterCode: "PULL" },
    ]);
    expect(r.ok).toBe(true);
    expect(r.distributorId).toBe(180001);
    expect(r.distinctStyleIds).toEqual([390001, 390009]);
  });

  it("does not let a null-style accessory line with a stray supplier fail the order", () => {
    const r = validateFamilyLock([
      { styleId: 390001, distributorId: 180001 },
      { styleId: null, distributorId: 999, productKind: "hardware" },
    ]);
    expect(r.ok).toBe(true);
    expect(r.distributorId).toBe(180001);
  });

  it("passes when no cabinet line has a supplier yet", () => {
    const r = validateFamilyLock([{ styleId: null, distributorId: null, masterCode: "???" }]);
    expect(r.ok).toBe(true);
    expect(r.distributorId).toBeNull();
    expect(r.styleId).toBeNull();
  });

  it("treats an empty order as a no-op pass", () => {
    const r = validateFamilyLock([]);
    expect(r.ok).toBe(true);
    expect(r.distributorId).toBeNull();
    expect(r.styleId).toBeNull();
  });
});

describe("canAddToCart (add-time lock = DISTRIBUTOR scope, colors mix freely)", () => {
  it("accepts any item into an empty cart (sets the distributor lock)", () => {
    expect(canAddToCart(null, 5)).toEqual({ ok: true, blockedByLock: false });
    expect(canAddToCart(undefined, 5)).toEqual({ ok: true, blockedByLock: false });
  });

  it("accepts an item from the SAME distributor", () => {
    expect(canAddToCart(5, 5)).toEqual({ ok: true, blockedByLock: false });
  });

  it("ALLOWS mixing colors/styles within the same distributor (two-tone)", () => {
    // Same distributor (1), different door-style/color rows still go in: the
    // lock is by distributor, not by style/color, so two-tone designs work.
    expect(canAddToCart(1, 1)).toEqual({ ok: true, blockedByLock: false });
  });

  it("rejects an item from a DIFFERENT distributor", () => {
    expect(canAddToCart(5, 8)).toEqual({ ok: false, blockedByLock: true });
  });

  it("allows an item with an unknown (null) distributor", () => {
    expect(canAddToCart(5, null)).toEqual({ ok: true, blockedByLock: false });
    expect(canAddToCart(5, undefined)).toEqual({ ok: true, blockedByLock: false });
  });

  it("coerces numeric-string ids consistently", () => {
    expect(canAddToCart(5, Number("5"))).toEqual({ ok: true, blockedByLock: false });
    expect(canAddToCart(5, Number("9"))).toEqual({ ok: false, blockedByLock: true });
  });
});
