import { describe, expect, it } from "vitest";
import {
  PELICAN_COMPARISON_ORIGIN,
  comparablePackagingRuleForPelicanProduct,
  comparisonProfileForPelicanProduct,
} from "./pelicanComparablePackaging";

const examples = [
  ["Sinks & Faucets", "Sinks", "PL-SINK"],
  ["Sinks & Faucets", "Faucets", "PL-FAUCET"],
  ["Sinks & Faucets", "Sink & Faucet Accessories", "PL-ACCESSORY"],
  ["Sinks & Faucets", "Disposals & Accessories", "PL-DISPOSAL"],
  ["Shower & Bath", "Shower & Tub Doors", "PL-DOOR"],
  ["Shower & Bath", "Shower Accessories", "PL-ACCESSORY"],
  ["Shower & Bath", "Shower Surrounds", "PL-SURROUND"],
  ["Shower & Bath", "Shower Valves & Systems", "PL-VALVE"],
  ["Flooring", "Planks & Flooring", "PL-PLANK"],
  ["Flooring", "Moldings & Trim", "PL-TRIM"],
  ["Flooring", "Underlayment", "PL-UNDERLAY"],
  ["Marketing & Merchandise", "Merchandise", "PL-DISPLAY"],
  ["Quartz Slabs (Countertops)", "Quartz Slab", "PL-QUARTZ"],
  ["Range Tops", "Electric", "PL-RANGE"],
  ["Samples", "Sample Chips", "PL-SAMPLE"],
  ["Tile & Mosaic", "Mosaic", "PL-MOSAIC"],
  ["Tile & Mosaic", "Tile", "PL-TILE"],
  ["Toilets & Bidets", "Commercial Flush Valves", "PL-FLUSH"],
  ["Toilets & Bidets", "Toilets & Bidets", "PL-TOILET"],
] as const;

describe("Pelican comparable package profiles", () => {
  it("covers every active Pelican catalog category/subcategory with a cited conservative rule", () => {
    for (const [category, subCategory, name] of examples) {
      const rule = comparablePackagingRuleForPelicanProduct({ category, subCategory, name });
      expect(rule, `${category} / ${subCategory}`).not.toBeNull();
      expect(rule?.sourceUrl).toMatch(/^https:\/\//);
      expect(rule?.sourceReference).toMatch(/comparison estimate|not Pelican/i);
      expect(rule?.lengthIn).toBeGreaterThan(0);
      expect(rule?.widthIn).toBeGreaterThan(0);
      expect(rule?.heightIn).toBeGreaterThan(0);
      expect(rule?.weightLbs).toBeGreaterThan(0);
    }
  });

  it("keeps quartz separate as LTL and uses the official Pelican pickup origin", () => {
    const quartz = comparisonProfileForPelicanProduct({
      id: 1,
      category: "Quartz Slabs (Countertops)",
      subCategory: "Quartz Slab",
      name: "PL-QUARTZ",
      pelicanCode: "PL-QUARTZ",
    });
    expect(quartz).toMatchObject({
      transportMode: "ltl",
      evidenceType: "comparable_estimate",
      originZip: PELICAN_COMPARISON_ORIGIN.zip,
      originName: PELICAN_COMPARISON_ORIGIN.name,
    });
    expect(quartz?.sourceReference).toContain(PELICAN_COMPARISON_ORIGIN.sourceUrl);
  });

  it("returns no fabricated package profile for an unknown category", () => {
    expect(comparisonProfileForPelicanProduct({
      id: 99,
      category: "Unmapped category",
      subCategory: "Unknown",
      name: "Unknown item",
      pelicanCode: "UNKNOWN",
    })).toBeNull();
  });
});
