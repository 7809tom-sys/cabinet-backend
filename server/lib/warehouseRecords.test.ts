import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  closedWarehouseZipsByDistributor,
  resetWarehouseTableProbeCache,
} from "./warehouseRecords";

const source = readFileSync(new URL("./warehouseRecords.ts", import.meta.url), "utf8");

function missingTable(code = "ER_NO_SUCH_TABLE") {
  return Object.assign(new Error("Table 'cabinet_dealz.warehouses' doesn't exist"), { code, errno: 1146 });
}

describe("warehouse open/closed before migration 0287", () => {
  it("treats a missing warehouses table as all open", async () => {
    resetWarehouseTableProbeCache();
    const db = {
      execute: async () => {
        throw missingTable();
      },
      select: () => {
        throw new Error("origin selection must not query warehouses when the table is missing");
      },
    };
    await expect(closedWarehouseZipsByDistributor(db, [180001])).resolves.toEqual(new Map());
  });

  it("treats a missing-table select as all open when the probe could not run", async () => {
    resetWarehouseTableProbeCache();
    const db = {
      select: () => ({
        from: () => ({
          where: () => Promise.reject(missingTable()),
        }),
      }),
    };
    await expect(closedWarehouseZipsByDistributor(db, [180001])).resolves.toEqual(new Map());
  });

  it("does not write origin ZIP lists when a warehouse is opened or closed", () => {
    expect(source).not.toContain("update(distributors)");
    expect(source).not.toContain("update(doorStyles)");
    expect(source).toContain("isOpen: input.isOpen");
  });
});
