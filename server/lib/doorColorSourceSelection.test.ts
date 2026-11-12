import { describe, expect, it } from "vitest";
import {
  doorColorSourceSelectionInput,
  EMPTY_DOOR_COLOR_SOURCE_COLUMNS,
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
