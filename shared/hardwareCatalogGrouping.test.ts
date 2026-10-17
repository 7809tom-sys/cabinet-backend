import { describe, expect, it } from "vitest";
import { groupHardwareConfigurations, type HardwareCatalogRow } from "./hardwareCatalogGrouping";

function row(overrides: Partial<HardwareCatalogRow>): HardwareCatalogRow {
  return {
    id: 1,
    sku: "435MB",
    name: "Pillow Top Cabinet Knob",
    description: "1-1/4 in Overall Length Pillow Top Cabinet Knob",
    collection: "Annadale",
    productType: "Knob",
    finish: "Matte Black",
    configurationKey: "annadale-knob-1-25",
    configurationLabel: "1-1/4 in Overall Length Pillow Top Cabinet Knob",
    imageUrl: "/manus-storage/435MB.jpg",
    unitPriceCents: 1274,
    ...overrides,
  };
}

describe("Hardware Resources style configuration grouping", () => {
  it("renders a source configuration once with its exact selected-finish SKU variants", () => {
    const groups = groupHardwareConfigurations([
      row({ id: 10, sku: "435MB", finish: "Matte Black", unitPriceCents: 1274 }),
      row({ id: 11, sku: "435SN", finish: "Satin Nickel", imageUrl: "/manus-storage/435SN.jpg", unitPriceCents: 1274 }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ collection: "Annadale", productType: "Knob" });
    expect(groups[0]?.variants).toEqual([
      expect.objectContaining({ id: 10, sku: "435MB", finish: "Matte Black" }),
      expect.objectContaining({ id: 11, sku: "435SN", finish: "Satin Nickel" }),
    ]);
  });

  it("finds one configuration when a customer searches one exact SKU or an available finish", () => {
    const rows = [
      row({ id: 10, sku: "435MB", finish: "Matte Black" }),
      row({ id: 11, sku: "435SN", finish: "Satin Nickel" }),
    ];
    expect(groupHardwareConfigurations(rows, "435SN")).toHaveLength(1);
    expect(groupHardwareConfigurations(rows, "satin nickel")).toHaveLength(1);
  });

  it("does not merge two reviewed source configurations that happen to share visible wording or finish", () => {
    const groups = groupHardwareConfigurations([
      row({ id: 20, sku: "745-128BLK", configurationKey: "belfast-745", collection: "Belfast", finish: "Matte Black" }),
      row({ id: 21, sku: "776-128BLK", configurationKey: "belfast-776", collection: "Belfast", finish: "Matte Black" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.variants[0]?.sku)).toEqual(["745-128BLK", "776-128BLK"]);
  });

  it("skips incomplete metadata rather than creating an unsafe guessed group", () => {
    expect(groupHardwareConfigurations([row({ configurationKey: null })])).toEqual([]);
  });
});
