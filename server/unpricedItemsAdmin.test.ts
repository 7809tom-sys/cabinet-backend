import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const catalogRouter = readFileSync(new URL("./routers/catalog.ts", import.meta.url), "utf8");
const genericCatalog = readFileSync(new URL("./routers/genericCabinets.ts", import.meta.url), "utf8");
const unpricedPanel = readFileSync(new URL("../client/src/components/admin/UnpricedCabinetsAdmin.tsx", import.meta.url), "utf8");
const adminTabs = readFileSync(new URL("../client/src/components/admin/AdminGroupedTabs.tsx", import.meta.url), "utf8");

describe("unpriced catalog item controls", () => {
  it("requires an available positive-priced supplier source before a Catalog item can be saved", () => {
    expect(genericCatalog).toContain("Every catalog item needs an available supplier source with a positive List Price or Your Cost before it can be saved.");
    expect(genericCatalog).not.toContain("if (publish && (!input.source");
  });

  it("separates price-needed linked masters from safely removable unlinked masters", () => {
    expect(catalogRouter).toContain("adminListUnpricedCabinets");
    expect(catalogRouter).toContain("adminDeleteUnlinkedUnpricedCabinet");
    expect(catalogRouter).toContain("A positive published supplier price is required before this item can be active in Catalog or Designer.");
    expect(catalogRouter).toContain("This item has a distributor link. Add a positive supplier price instead of deleting it.");
    expect(catalogRouter).toContain("This item is referenced by an order, cart, saved design, audit record, or product view and cannot be deleted.");
    expect(catalogRouter).toContain("tx.delete(cabinetAliases)");
    expect(catalogRouter).toContain("tx.delete(codeAliases)");
  });

  it("makes the price queue and guarded delete action available in Products & Catalog", () => {
    expect(adminTabs).toContain('value: "unpriced-items", label: "⚠ Unpriced Items"');
    expect(adminTabs).toContain('<UnpricedCabinetsAdmin />');
    expect(unpricedPanel).toContain("Unpriced Items");
    expect(unpricedPanel).toContain("Show unlinked only");
    expect(unpricedPanel).toContain("Delete unlinked item");
    expect(unpricedPanel).toContain("Add price");
  });
});
