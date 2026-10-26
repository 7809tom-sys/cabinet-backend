import { and, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  affiliateHiddenCatalogProducts,
  cabinets,
  distributorSkus,
  distributors,
  vendorProducts,
} from "../../drizzle/schema";
import { pelicanProducts } from "../../drizzle/pelicanSchema";
import { HARDWARE_LINE_CODE } from "@shared/hardwareCommerce";
import {
  cabinetProductKey,
  parseCatalogVendorKey,
  type CatalogKind,
} from "@shared/affiliateStorefrontControls";
import { masterTracPublicReferenceCatalog } from "../../client/src/lib/closet";

type Database = NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;

export type CatalogProductRow = {
  key: string;
  name: string;
  sku: string;
  detail: string;
  shown: boolean;
};

const PAGE_CAP = 100;

function page<T>(items: T[], offset: number, limit: number) {
  return { items: items.slice(offset, offset + limit), total: items.length };
}

async function hiddenKeySet(db: Database, affiliateId: number, kind: CatalogKind): Promise<Set<string>> {
  const rows = await db.select({ productKey: affiliateHiddenCatalogProducts.productKey })
    .from(affiliateHiddenCatalogProducts)
    .where(and(
      eq(affiliateHiddenCatalogProducts.affiliateId, affiliateId),
      eq(affiliateHiddenCatalogProducts.catalogKind, kind),
    ));
  return new Set(rows.map((row) => row.productKey));
}

async function cabinetProducts(db: Database, distributorId: number, search: string): Promise<Omit<CatalogProductRow, "shown">[]> {
  const rows = await db.select({
    masterCode: cabinets.masterCode,
    description: cabinets.description,
    distributorId: distributorSkus.distributorId,
  }).from(distributorSkus)
    .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
    .innerJoin(distributors, eq(distributors.id, distributorSkus.distributorId))
    .where(and(
      eq(distributorSkus.distributorId, distributorId),
      eq(distributorSkus.isPublished, true),
      eq(distributorSkus.isAvailable, true),
      eq(distributors.isActive, true),
      sql`${cabinets.conflictStatus} <> 'conflict'`,
    ))
    .limit(4000);
  const seen = new Map<string, Omit<CatalogProductRow, "shown">>();
  const needle = search.trim().toLowerCase();
  for (const row of rows) {
    const code = row.masterCode?.trim();
    if (!code || seen.has(code)) continue;
    const name = row.description?.trim() || code;
    if (needle && !`${code} ${name}`.toLowerCase().includes(needle)) continue;
    seen.set(code, {
      key: cabinetProductKey(distributorId, code),
      name,
      sku: code,
      detail: "Cabinet",
    });
  }
  return Array.from(seen.values()).sort((a, b) => a.sku.localeCompare(b.sku));
}

async function hardwareProducts(db: Database, search: string): Promise<Omit<CatalogProductRow, "shown">[]> {
  const rows = await db.select({
    id: vendorProducts.id,
    sku: vendorProducts.vendorSku,
    name: vendorProducts.name,
    category: vendorProducts.category,
  }).from(vendorProducts)
    .innerJoin(distributors, eq(vendorProducts.distributorId, distributors.id))
    .where(and(
      eq(distributors.code, HARDWARE_LINE_CODE),
      eq(distributors.isActive, true),
      eq(vendorProducts.status, "approved"),
      eq(vendorProducts.isPublished, true),
      eq(vendorProducts.isAvailable, true),
    ))
    .limit(4000);
  const needle = search.trim().toLowerCase();
  return rows.flatMap((row) => {
    const name = row.name?.trim() || row.sku;
    if (needle && !`${row.sku} ${name} ${row.category ?? ""}`.toLowerCase().includes(needle)) return [];
    return [{
      key: String(row.id),
      name,
      sku: row.sku,
      detail: row.category?.trim() || "Hardware",
    }];
  }).sort((a, b) => a.name.localeCompare(b.name));
}

async function surfaceProducts(db: Database, search: string): Promise<Omit<CatalogProductRow, "shown">[]> {
  const rows = await db.select({
    id: pelicanProducts.id,
    sku: pelicanProducts.pelicanCode,
    name: pelicanProducts.name,
    category: pelicanProducts.category,
  }).from(pelicanProducts)
    .where(and(eq(pelicanProducts.isActive, true), eq(pelicanProducts.showInCatalog, true)))
    .limit(4000);
  const needle = search.trim().toLowerCase();
  return rows.flatMap((row) => {
    if (needle && !`${row.sku} ${row.name} ${row.category}`.toLowerCase().includes(needle)) return [];
    return [{
      key: String(row.id),
      name: row.name,
      sku: row.sku,
      detail: row.category,
    }];
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function closetProducts(search: string): Omit<CatalogProductRow, "shown">[] {
  const needle = search.trim().toLowerCase();
  return masterTracPublicReferenceCatalog().flatMap((part) => {
    if (needle && !`${part.sku} ${part.description} ${part.category}`.toLowerCase().includes(needle)) return [];
    return [{
      key: part.sku,
      name: part.description,
      sku: part.sku,
      detail: part.category,
    }];
  });
}

export async function listAffiliateVendorProducts(
  db: Database,
  affiliateId: number,
  vendorKey: string,
  options: { search?: string; visibility?: "all" | "shown" | "hidden"; limit?: number; offset?: number },
) {
  const vendor = parseCatalogVendorKey(vendorKey);
  if (!vendor) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown catalog." });
  const search = options.search ?? "";
  const kind: CatalogKind = vendor.kind;
  const products = vendor.kind === "cabinet"
    ? await cabinetProducts(db, vendor.distributorId, search)
    : vendor.kind === "hardware"
      ? await hardwareProducts(db, search)
      : vendor.kind === "surface"
        ? await surfaceProducts(db, search)
        : closetProducts(search);
  const hidden = await hiddenKeySet(db, affiliateId, kind);
  const withShown = products.map((product) => ({ ...product, shown: !hidden.has(product.key) }));
  const filtered = options.visibility === "shown"
    ? withShown.filter((product) => product.shown)
    : options.visibility === "hidden"
      ? withShown.filter((product) => !product.shown)
      : withShown;
  const limit = Math.min(PAGE_CAP, Math.max(1, options.limit ?? 40));
  const offset = Math.max(0, options.offset ?? 0);
  const paged = page(filtered, offset, limit);
  return {
    vendorKey,
    kind,
    shownCount: withShown.filter((product) => product.shown).length,
    hiddenCount: withShown.length - withShown.filter((product) => product.shown).length,
    total: paged.total,
    products: paged.items,
  };
}

export async function setAffiliateProductVisibility(
  db: Database,
  affiliateId: number,
  kind: CatalogKind,
  productKeys: string[],
  shown: boolean,
) {
  const unique = Array.from(new Set(productKeys.map((key) => key.trim()).filter(Boolean))).slice(0, 500);
  if (unique.length === 0) return { updated: 0 };
  if (shown) {
    await db.delete(affiliateHiddenCatalogProducts).where(and(
      eq(affiliateHiddenCatalogProducts.affiliateId, affiliateId),
      eq(affiliateHiddenCatalogProducts.catalogKind, kind),
      inArray(affiliateHiddenCatalogProducts.productKey, unique),
    ));
  } else {
    await db.insert(affiliateHiddenCatalogProducts).values(unique.map((productKey) => ({
      affiliateId,
      catalogKind: kind,
      productKey,
    }))).onDuplicateKeyUpdate({ set: { productKey: sql`productKey` } });
  }
  return { updated: unique.length };
}

export async function setAffiliateVendorVisibility(
  db: Database,
  affiliateId: number,
  vendorKey: string,
  shown: boolean,
) {
  const listed = await listAffiliateVendorProducts(db, affiliateId, vendorKey, { visibility: "all", limit: 1, offset: 0, search: "" });
  const vendor = parseCatalogVendorKey(vendorKey);
  if (!vendor) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown catalog." });
  const products = vendor.kind === "cabinet"
    ? await cabinetProducts(db, vendor.distributorId, "")
    : vendor.kind === "hardware"
      ? await hardwareProducts(db, "")
      : vendor.kind === "surface"
        ? await surfaceProducts(db, "")
        : closetProducts("");
  let updated = 0;
  for (let index = 0; index < products.length; index += 400) {
    const chunk = products.slice(index, index + 400).map((product) => product.key);
    const result = await setAffiliateProductVisibility(db, affiliateId, vendor.kind, chunk, shown);
    updated += result.updated;
  }
  return { updated, kind: listed.kind };
}
