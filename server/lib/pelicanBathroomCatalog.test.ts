import { describe, expect, it } from "vitest";
import {
  isSourceVerifiedPelicanBathtub,
  isSourceVerifiedPelicanToiletOrBidet,
  normalizedPelicanBathroomCatalogCode,
  officialPelicanBathroomCatalogImage,
} from "./pelicanBathroomCatalog";

describe("Pelican bathroom catalog source map", () => {
  it("keeps only supplier-verified toilet and bidet model codes in the bathroom palette", () => {
    expect(isSourceVerifiedPelicanToiletOrBidet("PL-12005")).toBe(true);
    expect(isSourceVerifiedPelicanToiletOrBidet("PL-12005 MB")).toBe(true);
    expect(isSourceVerifiedPelicanToiletOrBidet("PL-A249 ADA")).toBe(true);
    expect(isSourceVerifiedPelicanToiletOrBidet("PL-12249")).toBe(true);

    // This retained catalog row is not in the current Pelican collection/search
    // and stays out of the customer-facing picker until its official source is known.
    expect(isSourceVerifiedPelicanToiletOrBidet("PL-12243")).toBe(false);
    expect(isSourceVerifiedPelicanToiletOrBidet("Aura Accessories Set MB")).toBe(false);
    expect(isSourceVerifiedPelicanToiletOrBidet("Special Order PL-8835 CHR")).toBe(false);
  });

  it("recognizes only complete source-backed tubs, never drain or trim accessory codes", () => {
    expect(isSourceVerifiedPelicanBathtub('PL-02138 59"')).toBe(true);
    expect(isSourceVerifiedPelicanBathtub('PL-02563 67"')).toBe(true);
    expect(isSourceVerifiedPelicanBathtub("PL-02849L")).toBe(true);
    expect(isSourceVerifiedPelicanBathtub("PL-02851R")).toBe(true);

    expect(isSourceVerifiedPelicanBathtub("PL-02849LNSO")).toBe(false);
    expect(isSourceVerifiedPelicanBathtub("PL-02852LBSO")).toBe(false);
    expect(isSourceVerifiedPelicanBathtub("PL-36 Tub Drain White")).toBe(false);
  });

  it("returns a verified stored official image where Pelican source imagery was collected", () => {
    expect(officialPelicanBathroomCatalogImage("PL-12005", null)).toBe(
      "/manus-storage/toilet-pl-12005_48351c94.png",
    );
    expect(officialPelicanBathroomCatalogImage('PL-02146 67"', null)).toBe(
      "/manus-storage/tub-pl-02146_56111d69.png",
    );
    expect(officialPelicanBathroomCatalogImage("PL-02849L", null)).toBe(
      "/manus-storage/tub-pl-02849-left_d193333e.png",
    );
    // PL-02850 is source-verified as a tub but Pelican's current page did not
    // yield a gallery URL during the audit; retain any existing imported image.
    expect(officialPelicanBathroomCatalogImage("PL-02850L", "/manus-storage/imported-tub.png")).toBe(
      "/manus-storage/imported-tub.png",
    );
  });

  it("normalizes cosmetic source-code whitespace without inventing a new SKU", () => {
    expect(normalizedPelicanBathroomCatalogCode("  pl-12005   mb ")).toBe("PL-12005 MB");
  });
});
