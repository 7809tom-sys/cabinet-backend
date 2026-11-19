/**
 * Damage claim validation (Tom, Nov 19 2026, PR 3).
 *
 * These are the rules a phone at the job site can break: a text file renamed .jpg, a
 * quantity above what was ordered, two rows for the same item, or a submission with no
 * photo at all. All of them must be refused before anything is written.
 */
import { describe, expect, it } from "vitest";
import { MAX_PHOTOS_PER_CLAIM, PHOTO_TYPES, validateClaim } from "./damageClaim";

const png = Buffer.from("89504e470d0a1a0a", "hex").toString("base64");
const base = {
  invoiceNumber: "INV-1",
  emailOrZip: "33013",
  description: "Two doors arrived crushed at the corner.",
  discoveredStage: "During unloading",
  items: [{ orderItemId: 12, damagedQuantity: 2 }],
  photos: [{ name: "a.jpg", type: "image/jpeg", data: png }],
};

describe("validateClaim", () => {
  it("accepts a complete claim and normalises it", () => {
    const result = validateClaim(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.description).toContain("crushed");
    expect(result.value.items).toEqual([{ orderItemId: 12, damagedQuantity: 2, itemNotes: null }]);
    expect(result.value.photos).toHaveLength(1);
    expect(PHOTO_TYPES["image/jpeg"]).toBe("jpg");
  });

  it("refuses a claim with no items", () => {
    expect(validateClaim({ ...base, items: [] }).ok).toBe(false);
  });

  it("refuses the same item twice", () => {
    const result = validateClaim({
      ...base,
      items: [
        { orderItemId: 12, damagedQuantity: 1 },
        { orderItemId: 12, damagedQuantity: 1 },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it("refuses a zero or fractional quantity", () => {
    expect(validateClaim({ ...base, items: [{ orderItemId: 12, damagedQuantity: 0 }] }).ok).toBe(false);
    expect(validateClaim({ ...base, items: [{ orderItemId: 12, damagedQuantity: 1.5 }] }).ok).toBe(false);
  });

  it("refuses a missing or too-short description", () => {
    expect(validateClaim({ ...base, description: "   " }).ok).toBe(false);
    expect(validateClaim({ ...base, description: "broken" }).ok).toBe(false);
  });

  it("refuses an unknown stage", () => {
    expect(validateClaim({ ...base, discoveredStage: "Some time later" }).ok).toBe(false);
  });

  it("refuses a claim with no photo", () => {
    expect(validateClaim({ ...base, photos: [] }).ok).toBe(false);
  });

  it("refuses more photos than the limit", () => {
    const photos = Array.from({ length: MAX_PHOTOS_PER_CLAIM + 1 }, () => ({ type: "image/png", data: png }));
    expect(validateClaim({ ...base, photos }).ok).toBe(false);
  });

  it("refuses a non-image type and an empty payload", () => {
    expect(validateClaim({ ...base, photos: [{ name: "x.pdf", type: "application/pdf", data: png }] }).ok).toBe(false);
    expect(validateClaim({ ...base, photos: [{ type: "image/png", data: "" }] }).ok).toBe(false);
  });

  it("accepts a data: URL prefix, which is what the file picker produces", () => {
    const result = validateClaim({ ...base, photos: [{ type: "image/png", data: "data:image/png;base64," + png }] });
    expect(result.ok).toBe(true);
  });
});