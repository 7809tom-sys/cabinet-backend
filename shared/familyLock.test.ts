import { describe, it, expect } from "vitest";
import { validateFamilyLock } from "./familyLock";

describe("validateFamilyLock", () => {
  it("passes when all priced lines share one style", () => {
    const r = validateFamilyLock([
      { styleId: 5, masterCode: "B-24" },
      { styleId: 5, masterCode: "W-30-30" },
    ]);
    expect(r.ok).toBe(true);
    expect(r.styleId).toBe(5);
    expect(r.distinctStyleIds).toEqual([5]);
  });

  it("rejects when lines mix two styles", () => {
    const r = validateFamilyLock([
      { styleId: 5, masterCode: "B-24" },
      { styleId: 8, masterCode: "W-30-30" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.styleId).toBeNull();
    expect(r.distinctStyleIds).toEqual([5, 8]);
    expect(r.reason).toMatch(/single door-style family/i);
  });

  it("ignores unmatched (null styleId) lines when locking", () => {
    const r = validateFamilyLock([
      { styleId: 5, masterCode: "B-24" },
      { styleId: null, masterCode: "???-7" }, // still in review
    ]);
    expect(r.ok).toBe(true);
    expect(r.styleId).toBe(5);
  });

  it("passes (locks to order style) when no priced line carries a style yet", () => {
    const r = validateFamilyLock([{ styleId: null }], 9);
    expect(r.ok).toBe(true);
    expect(r.styleId).toBe(9);
    expect(r.distinctStyleIds).toEqual([]);
  });

  it("rejects when priced lines disagree with the order-level style", () => {
    const r = validateFamilyLock(
      [{ styleId: 5, masterCode: "B-24" }],
      9 // order claims style 9 but the line is style 5
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/style 5/);
    expect(r.reason).toMatch(/style 9/);
  });

  it("passes when priced lines agree with the order-level style", () => {
    const r = validateFamilyLock([{ styleId: 7 }, { styleId: 7 }], 7);
    expect(r.ok).toBe(true);
    expect(r.styleId).toBe(7);
  });

  it("treats an empty order as a no-op pass", () => {
    const r = validateFamilyLock([]);
    expect(r.ok).toBe(true);
    expect(r.styleId).toBeNull();
  });
});
