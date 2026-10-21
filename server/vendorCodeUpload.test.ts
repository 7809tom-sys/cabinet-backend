import { afterAll, describe, expect, it } from "vitest";
import { and, eq, like, sql } from "drizzle-orm";
import { appRouter } from "./routers";
import { getDb } from "./db";
import type { TrpcContext } from "./_core/context";
import { cabinets, distributorSkus, doorStyles } from "../drizzle/schema";

function ctxFor(user: Record<string, unknown> | null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as unknown as TrpcContext;
}

const LINE = 270001; // AEF - has many active door styles
const OTHER_LINE = 180001; // Skyline
// Unique per run, letters+digits only so it is a legal master code, "ZZ" so it
// infers the harmless Accessory category, and a prefix the cleanup is limited to.
const RUN = Date.now().toString(36).toUpperCase();
const PREFIX = "ZZVUT";
const CODE = `${PREFIX}${RUN}`;
const ALIAS = `${PREFIX}${RUN}ALT`;

const plain = ctxFor({ id: 990301, openId: "vu-user", name: "U", email: "vu-user@example.invalid", role: "user" });
const admin = ctxFor({ id: 990302, openId: "vu-admin", name: "A", email: "vu-admin@example.invalid", role: "admin" });
const vendor = ctxFor({ id: 990303, openId: "vu-vendor", name: "V", email: "vu-vendor@example.invalid", role: "distributor", distributorId: LINE });
const unlinked = ctxFor({ id: 990304, openId: "vu-none", name: "N", email: "vu-none@example.invalid", role: "distributor", distributorId: null });

afterAll(async () => {
  const db = await getDb();
  if (!db) return;
  // Case-insensitive: a lower-cased code is stored as typed, and a case-sensitive
  // collation would otherwise let LIKE miss it.
  const mine = await db.select({ id: cabinets.id }).from(cabinets).where(sql`UPPER(${cabinets.masterCode}) LIKE ${`${PREFIX}%`}`);
  for (const m of mine) await db.delete(distributorSkus).where(eq(distributorSkus.cabinetId, m.id));
  await db.delete(distributorSkus).where(sql`UPPER(${distributorSkus.distributorSku}) LIKE ${`${PREFIX}%`}`);
  await db.delete(cabinets).where(sql`UPPER(${cabinets.masterCode}) LIKE ${`${PREFIX}%`}`);
});

async function twoDoors() {
  const db = await getDb();
  if (!db) return null;
  const styles = await db
    .select({ id: doorStyles.id, name: doorStyles.ourName, alias: doorStyles.aliasName })
    .from(doorStyles)
    .where(and(eq(doorStyles.distributorId, LINE), eq(doorStyles.isActive, true)))
    .limit(40);
  const names = styles.map((s) => s.alias || s.name);
  const unique = styles.filter((s) => names.filter((n) => n === (s.alias || s.name)).length === 1 && !/^\s|\s$/.test(s.alias || s.name));
  return unique.length >= 2 ? [unique[0], unique[1]].map((s) => ({ id: s.id, name: s.alias || s.name })) : null;
}

const countMasters = async () => {
  const db = await getDb();
  if (!db) return 0;
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(cabinets);
  return Number(r.n);
};

describe("vendorCodeUpload access control", () => {
  const rows = [{ rowNumber: 2, code: "B24", door: "Anything", price: 10 }];
  it("rejects signed-out users, plain users, and vendor accounts with no supply line", async () => {
    await expect(appRouter.createCaller(ctxFor(null)).vendorCodeUpload.preview({ rows })).rejects.toThrow();
    await expect(appRouter.createCaller(plain).vendorCodeUpload.preview({ rows })).rejects.toThrow();
    await expect(appRouter.createCaller(unlinked).vendorCodeUpload.commit({ rows })).rejects.toThrow();
  });
  it("makes an admin name the line", async () => {
    await expect(appRouter.createCaller(admin).vendorCodeUpload.preview({ rows })).rejects.toThrow(/choose a supply line/i);
  });
  it("keeps a vendor on its own line even when it names another one", async () => {
    const doors = await twoDoors();
    if (!doors) return;
    const out = await appRouter.createCaller(vendor).vendorCodeUpload.preview({
      distributorId: OTHER_LINE,
      rows: [{ rowNumber: 2, code: CODE, door: doors[0].name, price: 10 }],
    });
    expect(out.line.id).toBe(LINE);
    expect(out.rows[0].action).toBe("add");
  });
});

describe("vendorCodeUpload end to end (self-cleaning synthetic cabinet)", () => {
  it("previews without writing, creates one hidden master for two doors, then re-uploads idempotently", async () => {
    const db = await getDb();
    const doors = await twoDoors();
    if (!db || !doors) return;
    const caller = appRouter.createCaller(vendor);
    const rows = [
      { rowNumber: 2, code: CODE, door: doors[0].name, price: 111.5 },
      { rowNumber: 3, code: CODE.toLowerCase(), door: doors[1].name, price: 222 },
    ];

    // Preview is read-only.
    const before = await countMasters();
    const preview = await caller.vendorCodeUpload.preview({ rows });
    expect(preview.summary).toMatchObject({ total: 2, added: 2, errors: 0, newMasters: 1 });
    expect(await countMasters()).toBe(before);
    expect(await db.select().from(distributorSkus).where(sql`UPPER(${distributorSkus.distributorSku}) LIKE ${`${PREFIX}%`}`)).toHaveLength(0);

    // Commit: one master, two pending unpublished SKUs with distinct platform SKUs.
    const committed = await caller.vendorCodeUpload.commit({ rows });
    expect(committed).toMatchObject({ added: 2, updated: 0, mastersCreated: 1, skipped: 0, failures: [] });
    const [master] = await db.select().from(cabinets).where(eq(cabinets.masterCode, CODE));
    expect(master).toMatchObject({ category: "Accessory", showInCatalog: false, showInDesigner: false, showIn2020: false, descriptionSource: "Vendor Upload" });
    expect(master.width).toBeNull(); // no dimensions are ever invented
    const skus = await db.select().from(distributorSkus).where(eq(distributorSkus.cabinetId, master.id));
    expect(skus).toHaveLength(2);
    expect(new Set(skus.map((s) => s.platformSku)).size).toBe(2);
    for (const sku of skus) expect(sku).toMatchObject({ distributorId: LINE, status: "pending", isPublished: false });
    expect(skus.map((s) => s.listPrice).sort()).toEqual(["111.50", "222.00"]);

    // Same file again: nothing to do, nothing duplicated.
    const again = await caller.vendorCodeUpload.commit({ rows });
    expect(again).toMatchObject({ added: 0, updated: 0, mastersCreated: 0, unchanged: 2 });
    expect(await db.select().from(distributorSkus).where(eq(distributorSkus.cabinetId, master.id))).toHaveLength(2);

    // A new price updates in place.
    const repriced = await caller.vendorCodeUpload.commit({ rows: [{ rowNumber: 2, code: CODE, door: doors[0].name, price: 120 }] });
    expect(repriced).toMatchObject({ added: 0, updated: 1, mastersCreated: 0 });
    const [first] = await db.select().from(distributorSkus).where(and(eq(distributorSkus.cabinetId, master.id), eq(distributorSkus.styleId, doors[0].id)));
    expect(first.listPrice).toBe("120.00");

    // An alias of that master updates the same SKU and never mints a second master.
    await db.update(cabinets).set({ altSku1: ALIAS }).where(eq(cabinets.id, master.id));
    const viaAlias = await caller.vendorCodeUpload.commit({ rows: [{ rowNumber: 2, code: ALIAS, door: doors[0].name, price: 130 }] });
    expect(viaAlias).toMatchObject({ added: 0, updated: 1, mastersCreated: 0 });
    const [after] = await db.select().from(distributorSkus).where(and(eq(distributorSkus.cabinetId, master.id), eq(distributorSkus.styleId, doors[0].id)));
    expect(after.listPrice).toBe("130.00");
    expect(await db.select().from(cabinets).where(like(cabinets.masterCode, `${PREFIX}%`))).toHaveLength(1);
  });

  it("skips bad rows but still saves the good ones", async () => {
    const db = await getDb();
    const doors = await twoDoors();
    if (!db || !doors) return;
    const code = `${PREFIX}${RUN}B`;
    const out = await appRouter.createCaller(vendor).vendorCodeUpload.commit({
      rows: [
        { rowNumber: 2, code, door: doors[0].name, price: 5 },
        { rowNumber: 3, code: `${PREFIX}${RUN}C`, door: "No Such Door Anywhere", price: 5 },
        { rowNumber: 4, code: "bad code!", door: doors[0].name, price: 5 },
      ],
    });
    expect(out).toMatchObject({ added: 1, mastersCreated: 1, skipped: 2 });
    expect(out.rows.map((r) => r.rowNumber)).toEqual([3, 4]);
    expect(await db.select().from(cabinets).where(eq(cabinets.masterCode, `${PREFIX}${RUN}C`))).toHaveLength(0);
  });
});
