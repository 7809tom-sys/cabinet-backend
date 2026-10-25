import { count, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { distributors, vendorProducts } from "../../drizzle/schema";
import { getDb } from "../db";
import { HARDWARE_LINE_CODE } from "../../shared/hardwareCommerce";
import { hardwareRouter } from "./hardware";

describe("hardware.vendorCatalog", () => {
  it("returns the complete Hardware Resources supplier catalog through its own line-scoped read-only path", async () => {
    const db = await getDb();
    if (!db) return;
    const [line] = await db.select({ id: distributors.id })
      .from(distributors)
      .where(eq(distributors.code, HARDWARE_LINE_CODE))
      .limit(1);
    if (!line) return;

    const [{ total }] = await db.select({ total: count() })
      .from(vendorProducts)
      .where(eq(vendorProducts.distributorId, line.id));
    const caller = hardwareRouter.createCaller({
      user: { role: "distributor", distributorId: line.id },
    } as any);
    const firstPage = await caller.vendorCatalog({ limit: 500, offset: 0 });

    expect(firstPage.total).toBe(Number(total));
    expect(new Set(firstPage.items.map((item) => item.id)).size).toBe(firstPage.items.length);
    expect(firstPage.items.length).toBe(Math.min(500, Number(total)));
  });
});
