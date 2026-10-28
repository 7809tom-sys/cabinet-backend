import { describe, expect, it } from "vitest";
import {
  NO_DISTRIBUTOR_SKU_MAPPED,
  distributorFacingName,
  indexDistributorCatalog,
  resolveDistributorPoLine,
  type DistributorPoLineInput,
  type IndexedDistributorCatalog,
} from "./distributorPoLine";

function catalog(): IndexedDistributorCatalog {
  return indexDistributorCatalog({
    skus: [
      {
        distributorId: 4,
        cabinetId: 9,
        styleId: 3,
        distributorSku: "3DB24",
        supplierCabinetName: "3 Drawer Base 24",
        supplierDescription: "Three drawer base cabinet, 24 inch",
        isAvailable: true,
        status: "approved",
      },
      {
        distributorId: 8,
        cabinetId: 9,
        styleId: 3,
        distributorSku: "USD-OTHER",
        supplierCabinetName: "Other line base",
        isAvailable: true,
        status: "approved",
      },
    ],
    vendorProducts: [
      { id: 50, distributorId: 4, vendorSku: "HR-441", name: "Bar pull 128mm", description: "Satin nickel pull" },
    ],
    styles: [
      {
        id: 3,
        distributorName: "Aspen White",
        doorStyle: "Shaker",
        color: "White",
        aliasName: "Lumina White",
        ourName: "Lumina Blanc",
      },
    ],
    cabinetCodes: [
      { cabinetId: 9, code: "B24" },
      { cabinetId: 9, code: "DB-24-3" },
    ],
    equivalences: [{ codeA: "B24", codeB: "BER24" }],
  });
}

const whiteLabelLine: DistributorPoLineInput = {
  cabinetId: 9,
  styleId: 3,
  masterCode: "B24",
  rawCode: "B-24",
  description: "Lumina 3 Drawer Base",
  doorStyle: "Lumina White",
  qty: 2,
  distributorSku: "usd-sw-3db24",
};

describe("resolveDistributorPoLine", () => {
  it("uses the assigned distributor's SKU, supplier name, and door name", () => {
    const view = resolveDistributorPoLine(whiteLabelLine, 4, catalog());
    expect(view.mapped).toBe(true);
    expect(view.sku).toBe("3DB24");
    expect(view.distributorItemName).toBe("3 Drawer Base 24");
    expect(view.supplierDescription).toBe("Three drawer base cabinet, 24 inch");
    expect(view.doorStyle).toBe("Aspen White");
    expect(JSON.stringify(view)).not.toContain("Lumina");
    expect(JSON.stringify(view)).not.toContain("usd-sw-3db24");
  });

  it("does not borrow another distributor's nomenclature for the same cabinet", () => {
    const view = resolveDistributorPoLine(whiteLabelLine, 8, catalog());
    expect(view.sku).toBe("USD-OTHER");
    expect(view.distributorItemName).toBe("Other line base");
  });

  it("resolves an alias code to the distributor SKU when the line has no cabinet id", () => {
    const view = resolveDistributorPoLine({
      cabinetId: null,
      styleId: 3,
      masterCode: "BER24",
      description: "Generic base",
      qty: 1,
    }, 4, catalog());
    expect(view.mapped).toBe(true);
    expect(view.sku).toBe("3DB24");
    expect(view.distributorItemName).toBe("3 Drawer Base 24");
    expect(JSON.stringify(view)).not.toContain("Generic base");
  });

  it("falls back to the catalog code and flags a line with no distributor mapping", () => {
    const view = resolveDistributorPoLine({
      cabinetId: 44,
      styleId: 3,
      masterCode: "W3030",
      rawCode: "W-3030",
      description: "Lumina Wall 30",
      doorStyle: "Lumina White",
      qty: 1,
    }, 4, catalog());
    expect(view.mapped).toBe(false);
    expect(view.sku).toBe("W3030");
    expect(view.catalogCode).toBe("W3030");
    expect(view.distributorItemName).toBe(NO_DISTRIBUTOR_SKU_MAPPED);
    expect(view.supplierDescription).toBe("");
    expect(view.doorStyle).toBe("Aspen White");
    expect(JSON.stringify(view)).not.toContain("Lumina Wall");
  });

  it("uses the supplier description when the distributor did not store a separate cabinet name", () => {
    const indexed = indexDistributorCatalog({
      skus: [{
        distributorId: 4,
        cabinetId: 1,
        styleId: 3,
        distributorSku: "B12",
        supplierCabinetName: "  ",
        supplierDescription: "Base cabinet 12 inch",
      }],
      styles: [{ id: 3, distributorName: "Aspen White" }],
    });
    const view = resolveDistributorPoLine({ cabinetId: 1, styleId: 3, masterCode: "B12", description: "Shopper base", qty: 1 }, 4, indexed);
    expect(view.distributorItemName).toBe("Base cabinet 12 inch");
    expect(view.supplierDescription).toBe("");
  });

  it("uses the hardware vendor SKU and product name", () => {
    const view = resolveDistributorPoLine({
      productKind: "hardware",
      vendorProductId: 50,
      masterCode: "HW-1",
      description: "Cabinet Dealz pull",
      qty: 4,
    }, 4, catalog());
    expect(view.mapped).toBe(true);
    expect(view.sku).toBe("HR-441");
    expect(view.distributorItemName).toBe("Bar pull 128mm");
    expect(view.supplierDescription).toBe("Satin nickel pull");
    expect(JSON.stringify(view)).not.toContain("Cabinet Dealz pull");
  });

  it("does not guess when one code matches two cabinets", () => {
    const indexed = indexDistributorCatalog({
      skus: [
        { distributorId: 4, cabinetId: 1, styleId: 3, distributorSku: "B12", supplierCabinetName: "Base 12" },
        { distributorId: 4, cabinetId: 2, styleId: 3, distributorSku: "B12", supplierCabinetName: "Base twelve" },
      ],
    });
    const view = resolveDistributorPoLine({ masterCode: "B12", description: "Base", qty: 1 }, 4, indexed);
    expect(view.mapped).toBe(false);
    expect(view.sku).toBe("B12");
    expect(view.distributorItemName).toBe(NO_DISTRIBUTOR_SKU_MAPPED);
  });
});

describe("distributorFacingName", () => {
  it("uses the real brand and never the white-label line name", () => {
    expect(distributorFacingName({ id: 4, brandName: "US Cabinet Depot", code: "UCD" })).toBe("US Cabinet Depot");
    expect(distributorFacingName({ id: 4, brandName: "  ", code: "UCD" })).toBe("UCD");
    expect(distributorFacingName({ id: 4, brandName: null, code: null })).toBe("Distributor 4");
  });
});
