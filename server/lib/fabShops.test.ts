import { describe, expect, it } from "vitest";
import { importFabShops, isMissingTableError, liveMatches, stateForZip, type FabShopImportStore } from "./fabShops";
import type { FabricationShop } from "../../drizzle/schema";

function memoryStore(existing: Awaited<ReturnType<FabShopImportStore["loadExisting"]>> = []) {
  const inserted: unknown[] = [];
  const store: FabShopImportStore = {
    async loadExisting() { return existing; },
    async insert(rows) { inserted.push(...rows); },
  };
  return { store, inserted };
}

const rows = [
  { name: "Edge Stone", city: "Apopka", address: "2525 Clarcona Rd, Apopka, FL 32703" },
  { name: "Gallery of Stone", city: "Apopka", address: "1 Main St, Apopka, FL" },
];

describe("fabrication shop import", () => {
  it("previews without writing", async () => {
    const { store, inserted } = memoryStore();
    const result = await importFabShops(store, { rows, sourceDoc: "FL list", dryRun: true });
    expect(result).toMatchObject({ dryRun: true, inserted: 0, toImport: 2, zipFromCity: 1, noZip: 0 });
    expect(inserted).toHaveLength(0);
  });

  it("imports only new shops", async () => {
    const { store, inserted } = memoryStore([{ name: "Edge Stone", zip: "32703", city: "Apopka", state: "FL", website: null }]);
    const result = await importFabShops(store, { rows, sourceDoc: "FL list", dryRun: false });
    expect(result).toMatchObject({ inserted: 1, toImport: 1 });
    expect(inserted).toHaveLength(1);
  });
});

describe("helpers", () => {
  it("spots a missing table", () => {
    expect(isMissingTableError({ message: "Table 'cabinet_dealz.fabrication_shops' doesn't exist" })).toBe(true);
    expect(isMissingTableError({ cause: { code: "ER_NO_SUCH_TABLE" } })).toBe(true);
    expect(isMissingTableError(new Error("timeout"))).toBe(false);
  });

  it("knows the state of a ZIP", () => {
    expect(stateForZip("33602")).toBe("FL");
    expect(stateForZip("30301")).toBe("GA");
    expect(stateForZip("nope")).toBeNull();
  });

  it("falls back to same-state shops using the ZIP's own state", () => {
    const shop = (id: number, zip: string) => ({ id, name: `S${id}`, state: "FL", zip, lat: null, lng: null, confidence: "high", isActive: true }) as unknown as FabricationShop;
    const matches = liveMatches([shop(1, "32301"), shop(2, "33602")], "34102", { radiusMiles: 10 });
    expect(matches.map((m) => m.method)).toEqual(["state", "state"]);
    expect(matches[0]!.shop.id).toBe(2); // Tampa is nearer Naples than Tallahassee
  });
});
