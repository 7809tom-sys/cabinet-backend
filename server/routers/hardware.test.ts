import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./hardware.ts", import.meta.url), "utf8");
const importer = readFileSync(new URL("../../scripts/import-hardware-resources-catalog.ts", import.meta.url), "utf8");
const policy = readFileSync(new URL("../../shared/hardwareCommerce.ts", import.meta.url), "utf8");

describe("public hardware catalog contract", () => {
  it("requires the dedicated line and every approved public-state predicate", () => {
    expect(policy).toContain('export const HARDWARE_LINE_CODE = "HRDW"');
    expect(source).toContain("eq(distributors.code, HARDWARE_LINE_CODE)");
    expect(source).toContain('eq(vendorProducts.status, "approved")');
    expect(source).toContain("eq(vendorProducts.isPublished, true)");
    expect(source).toContain("eq(vendorProducts.isAvailable, true)");
  });

  it("returns list price and supplier image without exposing dealer cost or package data", () => {
    const listSelect = source.slice(source.indexOf("db.select({\n        id: vendorProducts.id"), source.indexOf(".from(vendorProducts)", source.indexOf("db.select({\n        id: vendorProducts.id")));
    expect(listSelect).toContain("listPrice: vendorProducts.listPrice");
    expect(listSelect).toContain("imageUrl: vendorProducts.imageUrl");
    expect(listSelect).not.toContain("yourCost:");
    expect(listSelect).not.toContain("pkgWeight:");
    expect(listSelect).not.toContain("pkgLength:");
  });

  it("keeps standalone checkout profile-gated while signing a distinct bundled-free hardware quote", () => {
    expect(source).toContain("hardwareProfileIsComplete(profile)");
    expect(source).toContain("hardwareCheckoutEligibility");
    expect(source).toContain("vendorProductId: item.vendorProductId");
    expect(source).toContain('quoteKind: "hardware"');
    expect(source).toContain('hardwareShippingMode: eligibility.promotionApplied ? "bundled_free" : "standalone_profile"');
    expect(source).toContain("...(eligibility.promotionApplied ? {} : { profileRevision: profile?.profileRevision ?? 0 })");
  });

  it("uses the hardware vendor's profile ZIP and one package, without a per-handle package cap", () => {
    expect(source).toContain("warehouseZips: distributors.warehouseZips");
    expect(source).toContain("hardwareVendorOriginZip(line.warehouseZips)");
    expect(source).toContain("vendorOriginZip,");
    expect(source).toContain("originZip: vendorOriginZip ?? undefined");
    expect(source).toContain("packageCount: 1");
    expect(source).not.toContain("maxUnitsPerPackage: z.number");
    expect(source).not.toContain("originZip: z.string");
  });

  it("gives the hardware vendor a read-only view of every SKU on its own supplier profile", () => {
    expect(source).toContain("vendorCatalog: distributorProcedure");
    expect(source).toContain("eq(distributors.code, HARDWARE_LINE_CODE)");
    expect(source).toContain("eq(vendorProducts.distributorId, lineId)");
    expect(source).not.toContain("yourCost: vendorProducts.yourCost");
  });

  it("issues Hardware Resources shipping authorization only from a complete delivery address", () => {
    const quoteStart = source.indexOf("quote: publicProcedure");
    const quoteEnd = source.indexOf("\n  adminGetShippingProfile:", quoteStart);
    const quoteSource = source.slice(quoteStart, quoteEnd);
    expect(quoteSource).toContain("deliveryAddress: deliveryAddressInput");
    expect(quoteSource).toContain("deliveryAddress: input.deliveryAddress");
    expect(quoteSource).not.toContain("destinationZip: input.destinationZip");
  });

  it("recalculates from supplier list plus only the affiliate’s hardware markup", () => {
    expect(source).toContain("hardwareRetailCents(item.listPrice, affiliatePricing.markupBps)");
    expect(source).toContain("hardwareMarkupBps: affiliates.hardwareMarkupBps");
  });

  it("removes supplier-only asterisk markers before public names are saved", () => {
    expect(importer).toContain("function publicCopy");
    expect(importer).toContain("[A-Z]{2,16}");
    expect(importer).toContain("row.name = publicCopy");
    expect(importer).toContain("row.description = publicCopy");
  });

  it("keeps all exact SKUs but persists reviewed collection, type, finish, and configuration metadata", () => {
    expect(importer).toContain("const EXPECTED_COLLECTIONS = 57");
    expect(importer).toContain("const EXPECTED_CONFIGURATIONS = 236");
    expect(importer).toContain("CONFIGURATION_FAMILY_OVERRIDES");
    expect(importer).toContain("hardwareCollection = VALUES(hardwareCollection)");
    expect(importer).toContain("hardwareFinish = VALUES(hardwareFinish)");
    expect(importer).toContain("hardwareConfigurationKey = VALUES(hardwareConfigurationKey)");
  });

  it("lists shopper-facing configurations with exact finish variants without exposing dealer-only data", () => {
    const groupedStart = source.indexOf("listConfigurations:");
    const groupedEnd = source.indexOf("\n  list:", groupedStart);
    const groupedSource = source.slice(groupedStart, groupedEnd);
    expect(groupedSource).toContain("groupHardwareConfigurations");
    expect(groupedSource).toContain("collection: vendorProducts.hardwareCollection");
    expect(groupedSource).toContain("finish: vendorProducts.hardwareFinish");
    expect(groupedSource).toContain("configurationKey: vendorProducts.hardwareConfigurationKey");
    expect(groupedSource).toContain("unitPriceCents: hardwareRetailCents");
    expect(groupedSource).toContain("configurations.slice(input.offset, input.offset + input.limit)");
    expect(groupedSource).not.toContain("yourCost:");
    expect(groupedSource).not.toContain("pkgWeight:");
    expect(groupedSource).not.toContain("pkgLength:");
  });

  it("resolves one selected exact SKU at its current public price for the regular Designer material list", () => {
    const selectedStart = source.indexOf("selected:");
    const selectedEnd = source.indexOf("\n  listConfigurations:", selectedStart);
    const selectedSource = source.slice(selectedStart, selectedEnd);
    expect(selectedStart).toBeGreaterThan(-1);
    expect(selectedSource).toContain("vendorProductId");
    expect(selectedSource).toContain("eq(vendorProducts.id, input.vendorProductId)");
    expect(selectedSource).toContain("publicHardwareConditions()");
    expect(selectedSource).toContain("hardwareRetailCents(item.listPrice, affiliatePricing.markupBps)");
    expect(selectedSource).toContain("configurationLabel: vendorProducts.hardwareConfigurationLabel");
    expect(selectedSource).not.toContain("yourCost:");
    expect(selectedSource).not.toContain("pkgWeight:");
    expect(selectedSource).not.toContain("pkgLength:");
  });
});
