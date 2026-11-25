import { describe, expect, it } from "vitest";
import type { CabinetShopDealValues, ExistingCabinetShop } from "@shared/crmCabinetShopImport";
import { importCabinetShops, type CabinetShopImportStore } from "./cabinetShopImport";

function memoryStore(initial: ExistingCabinetShop[] = []) {
  const rows: ExistingCabinetShop[] = [...initial];
  const inserts: CabinetShopDealValues[][] = [];
  const store: CabinetShopImportStore = {
    async loadExisting() { return rows.map((r) => ({ ...r })); },
    async insert(chunk) { inserts.push(chunk); rows.push(...chunk); },
  };
  return { store, rows, inserts };
}

const upload = [
  { name: "Acme Cabinets", city: "Tampa", address: "1 Main St, Tampa, FL 33601", website: "acme.com" },
  { name: "Peach Cabinets", state: "GA" },
  { name: "Old Shop", state: "FL" },
];
const now = new Date("2026-11-25T19:30:00Z");

describe("importCabinetShops", () => {
  it("previews without writing", async () => {
    const { store, inserts } = memoryStore([{ contactName: "Old Shop", notes: "cabinet_shop_list_2026-11-24\nState: FL" }]);
    const result = await importCabinetShops(store, { rows: upload, sourceDoc: "Cabinet Shops in Florida", dryRun: true, now });
    expect(inserts).toHaveLength(0);
    expect(result).toMatchObject({ dryRun: true, inserted: 0, toImport: 2, marker: "cabinet_shop_list_2026-11-25" });
    expect(result.byState).toEqual([{ state: "FL", toImport: 1, duplicates: 1 }, { state: "GA", toImport: 1, duplicates: 0 }]);
  });

  it("inserts on confirm, and a second upload of the same file adds nothing", async () => {
    const { store, rows } = memoryStore();
    const first = await importCabinetShops(store, { rows: upload, sourceDoc: "Cabinet Shops in Florida", dryRun: false, now });
    expect(first.inserted).toBe(3);
    expect(rows.every((r) => (r.notes ?? "").startsWith("cabinet_shop_list_2026-11-25\n"))).toBe(true);
    const second = await importCabinetShops(store, { rows: upload, sourceDoc: "Cabinet Shops in Florida", dryRun: false, now });
    expect(second.inserted).toBe(0);
    expect(second.duplicates).toHaveLength(3);
    expect(rows).toHaveLength(3);
  });

  it("inserts in chunks of 200", async () => {
    const { store, inserts } = memoryStore();
    const many = Array.from({ length: 450 }, (_, i) => ({ name: `Shop ${i}`, state: "FL" }));
    const result = await importCabinetShops(store, { rows: many, sourceDoc: "x", dryRun: false, now });
    expect(result.inserted).toBe(450);
    expect(inserts.map((c) => c.length)).toEqual([200, 200, 50]);
  });
});
