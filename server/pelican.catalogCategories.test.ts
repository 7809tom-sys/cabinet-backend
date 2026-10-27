import { describe, expect, it, vi } from "vitest";
import { Column, getTableName, is, Param, SQL, StringChunk } from "drizzle-orm";
import type { TrpcContext } from "./_core/context";
import { catalogCategoryKey } from "@shared/catalogCategory";
import { vendorPortalReadiness } from "./routers/vendors";

/**
 * In-memory stand-in for the drizzle calls these catalog procedures make.
 * Tests never open a database connection and never write.
 */
const harness = vi.hoisted(() => ({ getDb: vi.fn(async () => null as unknown) }));

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getDb: harness.getDb };
});

import { appRouter } from "./routers";

type Row = Record<string, unknown>;
type Joined = Record<string, Row | null>;

function ctx(user: Record<string, unknown> | null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

const admin = ctx({ id: 1, openId: "admin", name: "Admin", email: "admin@example.test", role: "admin", distributorId: null, approvedVendorLineId: null });
const shopper = ctx(null);
const plainUser = ctx({ id: 2, openId: "user", name: "User", email: "user@example.test", role: "user", distributorId: null, approvedVendorLineId: null });

function classify(chunk: unknown):
  | { kind: "text"; text: string }
  | { kind: "sql"; node: SQL }
  | { kind: "col"; column: Column }
  | { kind: "param"; value: unknown } {
  if (is(chunk, StringChunk)) return { kind: "text", text: chunk.value.join("") };
  if (is(chunk, SQL)) return { kind: "sql", node: chunk };
  if (is(chunk, Column)) return { kind: "col", column: chunk };
  if (is(chunk, Param)) return { kind: "param", value: chunk.value };
  if (typeof chunk === "string" || typeof chunk === "number" || typeof chunk === "boolean" || chunk == null) {
    return { kind: "param", value: chunk };
  }
  if (chunk && typeof chunk === "object" && "getSQL" in chunk && typeof chunk.getSQL === "function") {
    return { kind: "sql", node: chunk.getSQL() };
  }
  throw new Error(`Unsupported SQL chunk: ${chunk && typeof chunk === "object" ? chunk.constructor.name : typeof chunk}`);
}

function valueOf(column: Column, joined: Joined): unknown {
  return joined[getTableName(column.table)]?.[column.name] ?? null;
}

function likeMatch(value: unknown, pattern: unknown): boolean {
  const source = String(pattern ?? "");
  const expression = source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
  return new RegExp(`^${expression}$`, "i").test(String(value ?? ""));
}

function compareValues(left: unknown, right: unknown): number {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  if (typeof left === "number" && typeof right === "number") return left - right;
  if (typeof left === "boolean" || typeof right === "boolean") return Number(left) - Number(right);
  return String(left).localeCompare(String(right));
}

function numericDelta(left: unknown, right: unknown): number | null {
  const a = Number(left);
  const b = Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a - b;
}

function evalSql(node: SQL, joined: Joined): boolean {
  const parts = node.queryChunks.map(classify);
  const nested = parts.filter((part): part is { kind: "sql"; node: SQL } => part.kind === "sql");
  if (parts.some((part) => part.kind === "text" && part.text === " and ")) return nested.every((part) => evalSql(part.node, joined));
  if (parts.some((part) => part.kind === "text" && part.text === " or ")) return nested.some((part) => evalSql(part.node, joined));
  if (nested.length === 1 && parts.every((part) => part.kind === "text" || part.kind === "sql")) return evalSql(nested[0].node, joined);

  const columns = parts.filter((part): part is { kind: "col"; column: Column } => part.kind === "col").map((part) => part.column);
  const params = parts.filter((part) => part.kind === "param").map((part) => part.value);
  const op = parts.filter((part) => part.kind === "text").map((part) => part.text).join("");
  if (op.includes("is not null")) return valueOf(columns[0], joined) != null;
  if (op.includes("is null")) return valueOf(columns[0], joined) == null;
  if (columns.length === 2 && params.length === 0) {
    const left = valueOf(columns[0], joined);
    const right = valueOf(columns[1], joined);
    return op.includes("<>") ? left !== right : left === right;
  }
  const left = columns[0] ? valueOf(columns[0], joined) : null;
  const right = params[0];
  if (op.includes(">=")) return (numericDelta(left, right) ?? Number.NEGATIVE_INFINITY) >= 0;
  if (op.includes("<=")) return (numericDelta(left, right) ?? Number.POSITIVE_INFINITY) <= 0;
  if (op.includes(">")) return (numericDelta(left, right) ?? -1) > 0;
  if (op.includes("<")) return (numericDelta(left, right) ?? 1) < 0;
  if (op.toLowerCase().includes("like")) return likeMatch(left, right);
  if (op.includes("=")) return left === right;
  throw new Error(`Unsupported SQL predicate: ${JSON.stringify(op)}`);
}

function sqlText(value: unknown): string {
  if (is(value, StringChunk)) return value.value.join("");
  if (!is(value, SQL)) return "";
  return value.queryChunks.map(sqlText).join("");
}

function isCountSql(value: unknown): boolean {
  return sqlText(value).toLowerCase().includes("count(");
}

function findColumn(value: unknown): Column | null {
  if (is(value, Column)) return value;
  if (!is(value, SQL)) return null;
  for (const chunk of value.queryChunks) {
    const found = findColumn(chunk);
    if (found) return found;
  }
  return null;
}

function parseOrder(entry: unknown): { column: Column | null; count: boolean; dir: "asc" | "desc" } {
  if (is(entry, Column)) return { column: entry, count: false, dir: "asc" };
  if (!is(entry, SQL)) throw new Error("Unsupported order expression");
  const text = sqlText(entry).toLowerCase();
  return { column: findColumn(entry), count: text.includes("count("), dir: text.includes("desc") ? "desc" : "asc" };
}

class MemoryQuery {
  private filters: SQL[] = [];
  private joins: { table: string; on: SQL }[] = [];
  private groups: Column[] = [];
  private orders: unknown[] = [];
  private limitN: number | undefined;
  private offsetN = 0;
  private fromTable = "";

  constructor(private readonly tables: Record<string, Row[]>, private readonly shape: Record<string, unknown> | undefined, private readonly distinct: boolean) {}

  from(table: unknown) {
    this.fromTable = getTableName(table as Parameters<typeof getTableName>[0]);
    return this;
  }

  leftJoin(table: unknown, on: SQL) {
    this.joins.push({ table: getTableName(table as Parameters<typeof getTableName>[0]), on });
    return this;
  }

  where(condition?: SQL) {
    if (condition) this.filters.push(condition);
    return this;
  }

  groupBy(...columns: Column[]) {
    this.groups.push(...columns);
    return this;
  }

  orderBy(...entries: unknown[]) {
    this.orders.push(...entries);
    return this;
  }

  limit(count: number) {
    this.limitN = count;
    return this;
  }

  offset(count: number) {
    this.offsetN = count;
    return this;
  }

  then<TResult1 = Row[], TResult2 = never>(
    onFulfilled?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve().then(() => this.execute()).then(onFulfilled, onRejected);
  }

  private project(joined: Joined, count?: number): Row {
    const projected: Row = {};
    for (const [key, value] of Object.entries(this.shape ?? {})) {
      if (isCountSql(value)) projected[key] = count ?? 0;
      else if (is(value, Column)) projected[key] = valueOf(value, joined);
    }
    return projected;
  }

  private sortJoined(rows: Joined[]): Joined[] {
    const orders = this.orders.map(parseOrder).filter((order) => !order.count && order.column);
    if (orders.length === 0) return rows;
    return [...rows].sort((left, right) => {
      for (const order of orders) {
        const delta = compareValues(valueOf(order.column as Column, left), valueOf(order.column as Column, right));
        if (delta !== 0) return order.dir === "desc" ? -delta : delta;
      }
      return 0;
    });
  }

  private execute(): Row[] {
    let joined: Joined[] = (this.tables[this.fromTable] ?? []).map((row) => ({ [this.fromTable]: row }));
    for (const join of this.joins) {
      const rightRows = this.tables[join.table] ?? [];
      const next: Joined[] = [];
      for (const left of joined) {
        const matches = rightRows.filter((right) => evalSql(join.on, { ...left, [join.table]: right }));
        if (matches.length === 0) next.push({ ...left, [join.table]: null });
        else for (const match of matches) next.push({ ...left, [join.table]: match });
      }
      joined = next;
    }
    joined = joined.filter((row) => this.filters.every((filter) => evalSql(filter, row)));

    if (this.shape && this.groups.length === 0) {
      const entries = Object.entries(this.shape);
      if (entries.length === 1 && isCountSql(entries[0][1])) return [{ [entries[0][0]]: joined.length }];
    }

    if (this.groups.length > 0) {
      const groups = new Map<string, { sample: Joined; count: number }>();
      for (const row of joined) {
        const key = JSON.stringify(this.groups.map((column) => valueOf(column, row)));
        const existing = groups.get(key);
        if (existing) existing.count += 1;
        else groups.set(key, { sample: row, count: 1 });
      }
      let aggregated = [...groups.values()];
      const countOrder = this.orders.map(parseOrder).find((order) => order.count);
      if (countOrder) aggregated.sort((left, right) => countOrder.dir === "desc" ? right.count - left.count : left.count - right.count);
      return aggregated.map((group) => this.project(group.sample, group.count));
    }

    const sorted = this.sortJoined(joined);
    let projected = this.shape ? sorted.map((row) => this.project(row)) : sorted.map((row) => ({ ...(row[this.fromTable] ?? {}) }));
    if (this.distinct) {
      const seen = new Set<string>();
      projected = projected.filter((row) => {
        const key = JSON.stringify(row);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    const start = this.offsetN;
    const end = this.limitN == null ? undefined : start + this.limitN;
    return projected.slice(start, end);
  }
}

function memoryDb(tables: Record<string, Row[]>) {
  return {
    select: (shape?: Record<string, unknown>) => new MemoryQuery(tables, shape, false),
    selectDistinct: (shape?: Record<string, unknown>) => new MemoryQuery(tables, shape, true),
  };
}

function useTables(tables: Record<string, Row[]>) {
  harness.getDb.mockResolvedValue(memoryDb(tables));
}

function product(overrides: Row): Row {
  const id = Number(overrides.id);
  return {
    pelicanCode: `PL-${id}`,
    slug: `p-${id}`,
    description: overrides.name,
    subCategory: null,
    listPrice: "10.00",
    yourCost: "5.00",
    retailPrice: null,
    msrp: null,
    isPopular: false,
    popularRank: 0,
    imageUrl: null,
    materialImageUrl: null,
    showInDesigner: false,
    showInCatalog: true,
    isActive: true,
    ...overrides,
  };
}

const rangeTops = Array.from({ length: 8 }, (_, index) => product({
  id: index + 1,
  name: `Range Top ${String(index + 1).padStart(2, "0")}`,
  category: "Range Tops",
  subCategory: "Gas",
  ...(index === 0 ? { showInDesigner: true, materialImageUrl: "/range.webp" } : {}),
}));

const flooring = [
  product({
    id: 101,
    name: "Flooring Visible",
    category: "Flooring",
    subCategory: "Planks & Flooring",
    showInDesigner: true,
    materialImageUrl: "/floor.webp",
  }),
  product({ id: 102, name: "Flooring Hidden", category: "Flooring", isActive: false }),
  product({ id: 103, name: "Flooring Unpriced", category: "Flooring", listPrice: null, yourCost: null, msrp: null }),
];

const samples = Array.from({ length: 100 }, (_, index) => product({
  id: 200 + index,
  name: index < 2 ? "Alpha Tie" : `Sample ${String(index).padStart(3, "0")}`,
  category: "Samples",
  isActive: index < 96,
}));

const products = [...rangeTops, ...flooring, ...samples];

const pelicanTables = () => ({
  pelican_products: products,
  pelican_category_markups: [],
  pelican_shipping_profiles: [{
    id: 50,
    pelicanProductId: 1,
    originName: "Pelican Warehouse",
    originZip: "75201",
    transportMode: "parcel",
    packageLengthIn: "10.00",
    packageWidthIn: "8.00",
    packageHeightIn: "6.00",
    packageWeightLbs: "4.00",
    freightClass: null,
    evidenceType: "supplier_verified",
    comparisonRuleId: null,
    sourceUrl: "https://example.test/pack",
    sourceReference: "carton",
    verifiedAt: new Date("2026-01-15T00:00:00.000Z"),
    isEnabled: true,
    updatedAt: new Date("2026-01-15T00:00:00.000Z"),
  }],
  vendor_lines: [{ id: 1, sourceKey: "pelican", isApproved: true }],
  distributors: [],
});

describe("Pelican stored categories", () => {
  it("accepts Range Tops in adminList and byCategory, and returns no rows for an unknown name", async () => {
    useTables(pelicanTables());
    const caller = appRouter.createCaller(admin);
    const shop = appRouter.createCaller(shopper);

    const adminPage = await caller.pelican.adminList({ category: "  Range Tops  ", limit: 100, offset: 0 });
    expect(adminPage.total).toBe(8);
    expect(adminPage.items.map((item) => item.category)).toEqual(Array(8).fill("Range Tops"));

    const shopPage = await shop.pelican.byCategory({ category: "Range Tops", scope: "catalog", limit: 20, offset: 0 });
    expect(shopPage.total).toBe(8);
    expect(shopPage.items).toHaveLength(8);

    const unknownAdmin = await caller.pelican.adminList({ category: "No Such Category" });
    expect(unknownAdmin).toMatchObject({ items: [], total: 0 });
    const unknownShop = await shop.pelican.byCategory({ category: "No Such Category", scope: "catalog" });
    expect(unknownShop).toMatchObject({ items: [], total: 0, suggested: [] });

    await expect(caller.pelican.adminList({ category: "   " })).rejects.toThrow();
    await expect(shop.pelican.byCategory({ category: "x".repeat(65) })).rejects.toThrow();
    const maxLength = await caller.pelican.adminList({ category: "x".repeat(64) });
    expect(maxLength).toMatchObject({ items: [], total: 0 });
  });

  it("counts every stored row for the admin scope and keeps the shopper catalog scope filtered", async () => {
    useTables(pelicanTables());
    const shop = appRouter.createCaller(shopper);
    const catalog = await shop.pelican.categories({ scope: "catalog" });
    expect(catalog.find((row) => row.category === "Range Tops")?.count).toBe(8);
    expect(catalog.find((row) => row.category === "Flooring")?.count).toBe(1);

    await expect(shop.pelican.categories({ scope: "admin" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(appRouter.createCaller(plainUser).pelican.categories({ scope: "admin" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const cabinetVendor = ctx({
      id: 4,
      openId: "cabinet",
      name: "Cabinet",
      email: "cabinet@example.test",
      role: "distributor",
      distributorId: 9,
      approvedVendorLineId: 5,
    });
    useTables({
      ...pelicanTables(),
      vendor_lines: [
        { id: 1, sourceKey: "pelican", isApproved: true },
        { id: 5, sourceKey: "dist:9", isApproved: true },
      ],
      distributors: [{ id: 9, code: "USCD", name: "US Cabinet Depot", isActive: true }],
    });
    await expect(appRouter.createCaller(cabinetVendor).pelican.categories({ scope: "admin" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const pelicanVendor = ctx({
      id: 3,
      openId: "pelican",
      name: "Pelican",
      email: "pelican@example.test",
      role: "distributor",
      distributorId: null,
      approvedVendorLineId: 1,
    });
    const adminCaller = appRouter.createCaller(admin);
    const vendorCaller = appRouter.createCaller(pelicanVendor);
    for (const caller of [adminCaller, vendorCaller]) {
      const rows = await caller.pelican.categories({ scope: "admin" });
      expect(rows.find((row) => row.category === "Range Tops")?.count).toBe(8);
      expect(rows.find((row) => row.category === "Flooring")?.count).toBe(3);
      expect(rows.findIndex((row) => row.category === "Samples")).toBeLessThan(rows.findIndex((row) => row.category === "Range Tops"));
    }

    const designer = await appRouter.createCaller(shopper).pelican.categories({ scope: "designer" });
    expect(designer).toEqual([{ category: "Flooring", count: 1 }]);
    const designerRange = await appRouter.createCaller(shopper).pelican.byCategory({ category: "Range Tops", scope: "designer", limit: 20, offset: 0 });
    expect(designerRange.total).toBe(0);
    expect(designerRange.items).toEqual([]);
  });

  it("sorts adminList by product name, pages 100 at a time, and totals the active subset", async () => {
    useTables(pelicanTables());
    const caller = appRouter.createCaller(admin);
    const expected = [...products].sort((left, right) => String(left.name).localeCompare(String(right.name)) || Number(left.id) - Number(right.id));

    const first = await caller.pelican.adminList({});
    const second = await caller.pelican.adminList({ offset: 100 });
    expect(first.items).toHaveLength(100);
    expect(first.total).toBe(products.length);
    expect(second.items).toHaveLength(products.length - 100);
    expect(second.total).toBe(products.length);
    expect([...first.items, ...second.items].map((item) => item.id)).toEqual(expected.map((item) => item.id));
    expect(first.items.slice(0, 2).map((item) => item.id)).toEqual([200, 201]);

    const active = await caller.pelican.adminList({ isActive: true, limit: 500, offset: 0 });
    const inactive = await caller.pelican.adminList({ isActive: false, limit: 500, offset: 0 });
    expect(active.total).toBe(products.filter((item) => item.isActive).length);
    expect(active.items.every((item) => item.isActive)).toBe(true);
    expect(inactive.total).toBe(products.filter((item) => !item.isActive).length);
    expect(inactive.total).toBeGreaterThan(0);
  });

  it("pages shipping profiles and returns items with a total", async () => {
    useTables(pelicanTables());
    const caller = appRouter.createCaller(admin);
    const all = await caller.pelican.adminShippingProfiles({ limit: 500, offset: 0 });
    expect(Array.isArray(all)).toBe(false);
    expect(all.total).toBe(products.length);
    expect(all.items).toHaveLength(products.length);
    expect(all.items[0]?.category).toBe("Flooring");
    expect(all.items.find((item) => item.productId === 1)).toMatchObject({ originName: "Pelican Warehouse", profileId: 50 });
    expect(all.items.find((item) => item.productId === 2)?.profileId).toBeNull();

    const page = await caller.pelican.adminShippingProfiles({ limit: 2, offset: 2 });
    expect(page.total).toBe(products.length);
    expect(page.items.map((item) => item.productId)).toEqual(all.items.slice(2, 4).map((item) => item.productId));

    const range = await caller.pelican.adminShippingProfiles({ search: "Range Top", limit: 2, offset: 6 });
    expect(range.total).toBe(8);
    expect(range.items).toHaveLength(2);
  });
});

describe("vendor portal readiness", () => {
  it("marks an approved Pelican line with an email ready, and leaves other unlinked lines profile-only", () => {
    expect(vendorPortalReadiness({ isApproved: true, contactEmail: "orders@pelican.test", sourceKey: "pelican" }, false)).toBe("ready");
    expect(vendorPortalReadiness({ isApproved: true, contactEmail: "orders@pelican.test", sourceKey: " PELICAN " }, false)).toBe("ready");
    expect(vendorPortalReadiness({ isApproved: true, contactEmail: "   ", sourceKey: "pelican" }, false)).toBe("email-required");
    expect(vendorPortalReadiness({ isApproved: false, contactEmail: "off@pelican.test", sourceKey: "pelican" }, false)).toBe("not-approved");
    expect(vendorPortalReadiness({ isApproved: true, contactEmail: "profile@example.test", sourceKey: null }, false)).toBe("profile-only");
    expect(vendorPortalReadiness({ isApproved: true, contactEmail: "cab@example.test", sourceKey: "dist:9" }, true)).toBe("ready");
  });

  it("reports that readiness from vendors.list without requiring a Pelican supply line", async () => {
    useTables({
      vendor_lines: [
        { id: 1, name: "Pelican", sourceKey: "pelican", contactEmail: "orders@pelican.test", contactName: "", contactPhone: "", category: "", isApproved: true, totalSalesCents: 0, linkedDistributorIds: null },
        { id: 2, name: "Pelican Needs Email", sourceKey: "Pelican", contactEmail: "  ", contactName: "", contactPhone: "", category: "", isApproved: true, totalSalesCents: 0, linkedDistributorIds: null },
        { id: 3, name: "Pelican Unapproved", sourceKey: "pelican", contactEmail: "off@pelican.test", contactName: "", contactPhone: "", category: "", isApproved: false, totalSalesCents: 0, linkedDistributorIds: null },
        { id: 4, name: "Profile Only", sourceKey: null, contactEmail: "profile@example.test", contactName: "", contactPhone: "", category: "", isApproved: true, totalSalesCents: 0, linkedDistributorIds: null },
        { id: 6, name: "Pelican Mixed Case", sourceKey: " PELICAN ", contactEmail: "mixed@pelican.test", contactName: "", contactPhone: "", category: "", isApproved: true, totalSalesCents: 0, linkedDistributorIds: null },
        { id: 5, name: "Cabinet Co", sourceKey: "dist:9", contactEmail: "cab@example.test", contactName: "", contactPhone: "", category: "", isApproved: true, totalSalesCents: 0, linkedDistributorIds: null },
      ],
      distributors: [{ id: 9, code: "USCD", name: "US Cabinet Depot", isActive: true }],
    });
    const rows = await appRouter.createCaller(admin).vendors.list();
    const readiness = Object.fromEntries(rows.map((row) => [row.id, { portalReadiness: row.portalReadiness, linked: row.linkedDistributor?.id ?? null }]));
    expect(readiness[1]).toEqual({ portalReadiness: "ready", linked: null });
    expect(readiness[6]).toEqual({ portalReadiness: "ready", linked: null });
    expect(readiness[2]).toEqual({ portalReadiness: "email-required", linked: null });
    expect(readiness[3]).toEqual({ portalReadiness: "not-approved", linked: null });
    expect(readiness[4]).toEqual({ portalReadiness: "profile-only", linked: null });
    expect(readiness[5]).toEqual({ portalReadiness: "ready", linked: 9 });
  });
});

describe("cabinet My Catalog categories", () => {
  it("keeps the stored category text, including spaces", () => {
    expect(catalogCategoryKey("Range Tops")).toBe("Range Tops");
    expect(catalogCategoryKey("  Sinks & Faucets ")).toBe("Sinks & Faucets");
    expect(catalogCategoryKey("Quartz Slabs (Countertops)")).toBe("Quartz Slabs (Countertops)");
    expect(catalogCategoryKey("   ")).toBeNull();
    expect(catalogCategoryKey(null)).toBeNull();
  });

  it("returns the line's full category list beside a paged, filtered catalog", async () => {
    useTables({
      cabinets: [
        { id: 10, category: "Wall", masterCode: "W1", description: "Wall one" },
        { id: 11, category: "Wall", masterCode: "W2", description: "Wall two" },
        { id: 12, category: "Base", masterCode: "B1", description: "Base" },
        { id: 13, category: "  Base ", masterCode: "B2", description: "Padded base" },
        { id: 14, category: "Tall", masterCode: "T1", description: "Tall" },
        { id: 15, category: "   ", masterCode: "X1", description: "Blank" },
        { id: 16, category: "Vanity", masterCode: "V1", description: "Other line" },
      ],
      distributor_skus: [
        { id: 1, distributorId: 7, cabinetId: 10, styleId: 1, platformSku: "W1", distributorSku: "W1", status: "approved", isPublished: true },
        { id: 2, distributorId: 7, cabinetId: 11, styleId: 1, platformSku: "W2", distributorSku: "W2", status: "approved", isPublished: true },
        { id: 3, distributorId: 7, cabinetId: 12, styleId: 1, platformSku: "B1", distributorSku: "B1", status: "approved", isPublished: true },
        { id: 4, distributorId: 7, cabinetId: 13, styleId: 1, platformSku: "B2", distributorSku: "B2", status: "approved", isPublished: true },
        { id: 5, distributorId: 7, cabinetId: 14, styleId: 1, platformSku: "T1", distributorSku: "T1", status: "approved", isPublished: true },
        { id: 6, distributorId: 7, cabinetId: 15, styleId: 1, platformSku: "X1", distributorSku: "X1", status: "approved", isPublished: true },
        { id: 7, distributorId: 7, cabinetId: null, styleId: 1, platformSku: "UNMAPPED", distributorSku: "UNMAPPED", status: "pending", isPublished: false },
        { id: 8, distributorId: 8, cabinetId: 16, styleId: 1, platformSku: "V1", distributorSku: "V1", status: "approved", isPublished: true },
      ],
      door_styles: [{ id: 1, ourName: "Shaker" }],
      distributors: [{ id: 7, code: "LINE", name: "Line", isActive: true }],
      vendor_lines: [{ id: 70, sourceKey: "dist:7", isApproved: true, isCabinetVendor: true, linkedDistributorIds: null }],
    });
    const caller = appRouter.createCaller(ctx({
      id: 7,
      openId: "line",
      name: "Line",
      email: "line@example.test",
      role: "distributor",
      distributorId: 7,
      approvedVendorLineId: 70,
    }));
    const page = await caller.distributorPortal.catalog({ category: "Wall", limit: 1, offset: 0 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.category).toBe("Wall");
    expect(page.total).toBe(2);
    expect(page.categories).toEqual(["Base", "Tall", "Wall"]);

    const next = await caller.distributorPortal.catalog({ category: "Wall", limit: 1, offset: 1 });
    expect(next.items).toHaveLength(1);
    expect(next.categories).toEqual(["Base", "Tall", "Wall"]);
  });
});
