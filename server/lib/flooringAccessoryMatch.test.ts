import { describe, expect, it } from "vitest";
import { matchingFlooringAccessories, type FlooringAccessoryMatchProduct } from "./flooringAccessoryMatch";

const floor = (id: number, code: string, name = code): FlooringAccessoryMatchProduct => ({
  id,
  category: "Flooring",
  subCategory: "Planks & Flooring",
  pelicanCode: code,
  name,
});

const trim = (id: number, code: string, name = code): FlooringAccessoryMatchProduct => ({
  id,
  category: "Flooring",
  subCategory: "Moldings & Trim",
  pelicanCode: code,
  name,
});

describe("matchingFlooringAccessories", () => {
  it("matches only the exact source family and wear layer", () => {
    const selected = floor(1, "Aveline 20mil Vinyl Flooring");
    const matches = matchingFlooringAccessories(selected, [
      selected,
      floor(2, "Aveline 12mil Vinyl Flooring"),
      trim(11, "Aveline 20mil Stair Nose"),
      trim(12, "Aveline 12mil Stair Nose"),
      trim(13, "Bahia 20mil Stair Nose"),
    ]);

    expect(matches.map((item) => item.id)).toEqual([11]);
  });

  it("does not guess that an unspecified trim fits a multi-variant flooring family", () => {
    const selected = floor(1, "Astoria 20mil Vinyl Flooring");
    const matches = matchingFlooringAccessories(selected, [
      selected,
      floor(2, "Astoria 22mil Vinyl Flooring"),
      trim(11, "Astoria T-Molding"),
    ]);

    expect(matches).toEqual([]);
  });

  it("permits an unspecified accessory only for an exactly single-variant family", () => {
    const selected = floor(1, "Legacy Oak Vinyl Flooring");
    const matches = matchingFlooringAccessories(selected, [
      selected,
      trim(11, "Legacy Oak T-Molding"),
      trim(12, "Generic Baseboard"),
    ]);

    expect(matches.map((item) => item.id)).toEqual([11]);
  });

  it("rejects unrelated trim, generic baseboard, and non-trim flooring rows", () => {
    const selected = floor(1, "Madeira 20mil Vinyl Flooring");
    const matches = matchingFlooringAccessories(selected, [
      selected,
      trim(11, "Tigertail 20mil Reducer Molding"),
      trim(12, "Baseboards"),
      { ...floor(13, "Madeira 20mil Stair Nose"), subCategory: "Planks & Flooring" },
    ]);

    expect(matches).toEqual([]);
  });

  it("normalizes punctuation and case without fuzzy family matching", () => {
    const selected = floor(1, "Coastal-Oak 20MIL Vinyl Flooring", "Coastal Oak");
    const matches = matchingFlooringAccessories(selected, [
      selected,
      trim(11, "coastal oak 20 mil t molding"),
      trim(12, "coast 20 mil t molding"),
    ]);

    expect(matches.map((item) => item.id)).toEqual([11]);
  });
});
