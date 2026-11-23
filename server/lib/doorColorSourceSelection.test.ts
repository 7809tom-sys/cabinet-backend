import { describe, expect, it } from "vitest";
import {
  doorColorSourceSelectionInput,
  EMPTY_DOOR_COLOR_SOURCE_COLUMNS,
  PAINT_BRAND_CODE_MAX,
  PAINT_BRAND_NAME_MAX,
  PAINT_BRANDS,
  parseDoorColorSourceSelection,
  selectionFromColumns,
  selectionToColumns,
} from "./doorColorSourceSelection";

const swColor = {
  finish: "paint" as const,
  code: "SW 7006",
  label: "Extra White",
  hex: "#F2F0EA",
  woodSpecies: null,
  grainDirection: "none" as const,
  profileImageUrl: null,
};

describe("doorColorSourceSelectionInput", () => {
  it("accepts the four confirmed sources and lowercases hex", () => {
    expect(parseDoorColorSourceSelection({ source: "original-image" })?.source).toBe("original-image");
    expect(parseDoorColorSourceSelection({ source: "approved-ai-image" })?.source).toBe("approved-ai-image");
    expect(parseDoorColorSourceSelection({ source: "hex", confirmed: true, hex: "#AABBCC" })).toMatchObject({
      source: "hex",
      hex: "#aabbcc",
    });
    expect(parseDoorColorSourceSelection({
      source: "sherwin-williams",
      confirmed: true,
      color: swColor,
    })).toMatchObject({
      source: "sherwin-williams",
      color: { ...swColor, hex: "#f2f0ea" },
    });
  });

  it("rejects an unconfirmed Sherwin-Williams or Hex pick", () => {
    expect(parseDoorColorSourceSelection({ source: "hex", hex: "#224466" })).toBeNull();
    expect(parseDoorColorSourceSelection({ source: "hex", confirmed: false, hex: "#224466" })).toBeNull();
    expect(parseDoorColorSourceSelection({ source: "sherwin-williams", color: swColor })).toBeNull();
    expect(doorColorSourceSelectionInput.safeParse({ source: "hex", hex: "#224466" }).success).toBe(false);
  });

  it("rejects a missing or invalid hex and an unknown mode", () => {
    expect(parseDoorColorSourceSelection({ source: "hex", confirmed: true, hex: "224466" })).toBeNull();
    expect(parseDoorColorSourceSelection({ source: "hex", confirmed: true, hex: "#xyzxyz" })).toBeNull();
    expect(parseDoorColorSourceSelection({ source: "library-color" })).toBeNull();
    expect(parseDoorColorSourceSelection(null)).toBeNull();
  });

  it("keeps a confirmed paint brand on the hex input, trimmed and length-limited", () => {
    const parsed = doorColorSourceSelectionInput.parse({
      source: "hex",
      confirmed: true,
      chosenAt: "2026-11-22T18:00:00.000Z",
      kind: "paint-brand",
      brand: "Sherwin-Williams",
      code: "  SW 7012  ",
      name: "  Alabaster  ",
      hex: "#F2F0EA",
    });
    expect(parsed).toEqual({
      source: "hex",
      confirmed: true,
      chosenAt: "2026-11-22T18:00:00.000Z",
      kind: "paint-brand",
      brand: "Sherwin-Williams",
      code: "SW 7012",
      name: "Alabaster",
      hex: "#f2f0ea",
    });
    for (const brand of PAINT_BRANDS) {
      expect(doorColorSourceSelectionInput.safeParse({
        source: "hex",
        confirmed: true,
        kind: "paint-brand",
        brand,
        code: "C1",
        name: "Name",
        hex: "#112233",
      }).success).toBe(true);
    }
    expect(doorColorSourceSelectionInput.safeParse({
      source: "hex",
      confirmed: true,
      kind: "paint-brand",
      brand: "Sherwin-Williams",
      code: "C".repeat(PAINT_BRAND_CODE_MAX),
      name: "N".repeat(PAINT_BRAND_NAME_MAX),
      hex: "#112233",
    }).success).toBe(true);
  });

  it("rejects a partial, unknown, or oversized paint brand and still accepts a plain hex", () => {
    const base = { source: "hex" as const, confirmed: true as const, hex: "#112233" };
    expect(doorColorSourceSelectionInput.safeParse(base).success).toBe(true);
    expect(doorColorSourceSelectionInput.safeParse({ ...base, kind: "paint-brand" }).success).toBe(false);
    expect(doorColorSourceSelectionInput.safeParse({ ...base, brand: "Behr", code: "MQ3-07", name: "Ultra Pure White" }).success).toBe(false);
    expect(doorColorSourceSelectionInput.safeParse({ ...base, kind: "paint-brand", brand: "Farrow & Ball", code: "1", name: "White" }).success).toBe(false);
    expect(doorColorSourceSelectionInput.safeParse({ ...base, kind: "library", brand: "Behr", code: "1", name: "White" }).success).toBe(false);
    expect(doorColorSourceSelectionInput.safeParse({
      ...base,
      kind: "paint-brand",
      brand: "PPG",
      code: "C".repeat(PAINT_BRAND_CODE_MAX + 1),
      name: "White",
    }).success).toBe(false);
    expect(doorColorSourceSelectionInput.safeParse({
      ...base,
      kind: "paint-brand",
      brand: "Valspar",
      code: "1",
      name: "N".repeat(PAINT_BRAND_NAME_MAX + 1),
    }).success).toBe(false);
    expect(doorColorSourceSelectionInput.safeParse({
      ...base,
      kind: "paint-brand",
      brand: "Behr",
      code: "   ",
      name: "White",
    }).success).toBe(false);
  });
});

describe("selectionToColumns / selectionFromColumns", () => {
  const now = new Date("2026-11-12T19:00:00.000Z");

  it("stores original-image and approved-ai-image with a NULL value column", () => {
    const original = selectionToColumns({ source: "original-image", chosenAt: now.toISOString() }, now);
    expect(original).toEqual({
      doorColorSource: "original-image",
      doorColorSourceValue: null,
      doorColorSourceUpdatedAt: now,
    });
    expect(selectionFromColumns(original)).toMatchObject({ source: "original-image", chosenAt: now.toISOString() });

    const ai = selectionToColumns({ source: "approved-ai-image", chosenAt: now.toISOString() }, now);
    expect(ai.doorColorSource).toBe("approved-ai-image");
    expect(ai.doorColorSourceValue).toBeNull();
    expect(selectionFromColumns(ai)?.source).toBe("approved-ai-image");
  });

  it("stores a confirmed hex as { hex } and a confirmed Sherwin-Williams chip as the color object", () => {
    const hex = selectionToColumns({ source: "hex", confirmed: true, hex: "#224466", chosenAt: now.toISOString() }, now);
    expect(hex).toEqual({
      doorColorSource: "hex",
      doorColorSourceValue: { hex: "#224466" },
      doorColorSourceUpdatedAt: now,
    });
    expect(selectionFromColumns(hex)).toMatchObject({ source: "hex", confirmed: true, hex: "#224466" });

    const parsed = parseDoorColorSourceSelection({ source: "sherwin-williams", confirmed: true, color: swColor, chosenAt: now.toISOString() })!;
    const sw = selectionToColumns(parsed, now);
    expect(sw.doorColorSource).toBe("sherwin-williams");
    expect(sw.doorColorSourceValue).toMatchObject({ finish: "paint", code: "SW 7006", label: "Extra White", hex: "#f2f0ea" });
    expect(selectionFromColumns(sw)).toMatchObject({ source: "sherwin-williams", color: { code: "SW 7006", hex: "#f2f0ea" } });
  });

  it("stores a confirmed paint brand on the hex source and still reads old rows", () => {
    const parsed = parseDoorColorSourceSelection({
      source: "hex",
      confirmed: true,
      kind: "paint-brand",
      brand: "Clark + Kensington",
      code: " CK 001 ",
      name: " Swiss Coffee ",
      hex: "#E8E4D8",
      chosenAt: now.toISOString(),
    });
    expect(parsed).not.toBeNull();
    const stored = selectionToColumns(parsed!, now);
    expect(stored).toEqual({
      doorColorSource: "hex",
      doorColorSourceValue: {
        kind: "paint-brand",
        brand: "Clark + Kensington",
        code: "CK 001",
        name: "Swiss Coffee",
        hex: "#e8e4d8",
      },
      doorColorSourceUpdatedAt: now,
    });
    expect(Object.keys(stored.doorColorSourceValue!)).toEqual(["kind", "brand", "code", "name", "hex"]);

    const plain = selectionToColumns({ source: "hex", confirmed: true, hex: "#224466", chosenAt: now.toISOString() }, now);
    expect(plain.doorColorSourceValue).toEqual({ hex: "#224466" });
    expect(Object.keys(plain.doorColorSourceValue!)).toEqual(["hex"]);

    expect(selectionFromColumns(stored)).toEqual({
      source: "hex",
      confirmed: true,
      chosenAt: now.toISOString(),
      hex: "#e8e4d8",
    });
    expect(selectionFromColumns({
      doorColorSource: "sherwin-williams",
      doorColorSourceValue: { ...swColor, hex: "#f2f0ea" },
      doorColorSourceUpdatedAt: now,
    })).toMatchObject({ source: "sherwin-williams", color: { code: "SW 7006", hex: "#f2f0ea" } });
    expect(selectionFromColumns({
      doorColorSource: "hex",
      doorColorSourceValue: { hex: "#224466" },
      doorColorSourceUpdatedAt: now,
    })).toEqual({
      source: "hex",
      confirmed: true,
      chosenAt: now.toISOString(),
      hex: "#224466",
    });
  });

  it("reads a bare hex string in the value column, for a simple stored form", () => {
    expect(selectionFromColumns({
      doorColorSource: "hex",
      doorColorSourceValue: "#ABCDEF",
      doorColorSourceUpdatedAt: now,
    })).toMatchObject({ source: "hex", hex: "#abcdef" });
  });

  it("treats NULL, missing, or malformed columns as nothing chosen, and never throws", () => {
    expect(selectionFromColumns(null)).toBeNull();
    expect(selectionFromColumns({})).toBeNull();
    expect(selectionFromColumns({ doorColorSource: null, doorColorSourceValue: null, doorColorSourceUpdatedAt: null })).toBeNull();
    expect(selectionFromColumns({ doorColorSource: "hex", doorColorSourceValue: { hex: "nope" } })).toBeNull();
    expect(selectionFromColumns({ doorColorSource: "mystery-mode" })).toBeNull();
    expect(EMPTY_DOOR_COLOR_SOURCE_COLUMNS).toEqual({
      doorColorSource: null,
      doorColorSourceValue: null,
      doorColorSourceUpdatedAt: null,
    });
  });
});
