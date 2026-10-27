import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router, supplierProfileProcedure } from "../_core/trpc";
import { getDb, getPricingSettings } from "../db";
import { notifyOwner } from "../_core/notification";
import {
  cabinets,
  distributorSkus,
  distributors,
  doorStyles,
  vendorAdminUpdates,
  vendorCatalogEditLog,
  vendorInventoryApiKeys,
  vendorPriceIncreases,
  vendorProducts,
} from "../../drizzle/schema";
import { pelicanProducts } from "../../drizzle/pelicanSchema";
import { retailFromWholesale } from "../../shared/margins";
import {
  classifyInventoryRows,
  descriptiveEditAllowed,
  isLowStock,
  isOutOfStock,
  parseInventoryCsv,
  parseWholesaleCsv,
  priceChangeAllowed,
  wholesalePriceDisposition,
  type ParsedInventoryRow,
} from "../../shared/inventorySync";
import { parseVendorScope, type VendorScope } from "../../shared/vendorFulfillment";
import { assertVendorScope } from "../lib/vendorFulfillmentStore";
import { generateInventoryApiKey } from "../lib/vendorInventoryApiKey";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

type ProductRow = {
  table: "distributor_skus" | "vendor_products" | "pelican_products";
  id: number;
  sku: string;
  name: string;
  onHandQty: number | null;
  leadTimeDays: number | null;
  inventoryNotes: string | null;
  discontinued: boolean;
  backorder: boolean;
  minimumOrderQty: number | null;
  restockDate: string | null;
  outOfStock: boolean;
  inventoryUpdatedAt: Date | null;
  inventorySyncSource: string | null;
  importLockedFields: string[] | null;
  vendorWholesale: string | null;
  conflictStatus: string | null;
  supplierDescription: string | null;
  supplierCabinetName: string | null;
  category: string | null;
};

async function requireDb(): Promise<Db> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return db;
}

async function requireScope(user: { role: string; distributorId?: number | null; approvedVendorLineId?: number | null }, scope: string): Promise<VendorScope> {
  return assertVendorScope(await requireDb(), user, scope);
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function productsForScope(db: Db, scope: VendorScope): Promise<ProductRow[]> {
  if (scope === "pelican") {
    const rows = await db.select().from(pelicanProducts);
    return rows.map((row) => ({
      table: "pelican_products",
      id: row.id,
      sku: row.pelicanCode,
      name: row.name,
      onHandQty: row.onHandQty,
      leadTimeDays: row.leadTimeDays,
      inventoryNotes: row.inventoryNotes,
      discontinued: row.discontinued,
      backorder: row.backorder,
      minimumOrderQty: row.minimumOrderQty,
      restockDate: row.restockDate,
      outOfStock: row.outOfStock,
      inventoryUpdatedAt: row.inventoryUpdatedAt,
      inventorySyncSource: row.inventorySyncSource,
      importLockedFields: row.importLockedFields,
      vendorWholesale: row.vendorWholesale,
      conflictStatus: "none",
      supplierDescription: row.description,
      supplierCabinetName: row.name,
      category: row.category,
    }));
  }
  const distributorId = Number(scope.slice("dist:".length));
  const skuRows = await db.select({
    id: distributorSkus.id,
    sku: distributorSkus.distributorSku,
    name: cabinets.masterCode,
    onHandQty: distributorSkus.onHandQty,
    leadTimeDays: distributorSkus.leadTimeDays,
    inventoryNotes: distributorSkus.inventoryNotes,
    discontinued: distributorSkus.discontinued,
    backorder: distributorSkus.backorder,
    minimumOrderQty: distributorSkus.minimumOrderQty,
    restockDate: distributorSkus.restockDate,
    outOfStock: distributorSkus.outOfStock,
    inventoryUpdatedAt: distributorSkus.inventoryUpdatedAt,
    inventorySyncSource: distributorSkus.inventorySyncSource,
    importLockedFields: distributorSkus.importLockedFields,
    vendorWholesale: distributorSkus.vendorWholesale,
    conflictStatus: cabinets.conflictStatus,
    supplierDescription: distributorSkus.supplierDescription,
    supplierCabinetName: distributorSkus.supplierCabinetName,
    category: doorStyles.doorStyle,
  }).from(distributorSkus)
    .leftJoin(cabinets, eq(cabinets.id, distributorSkus.cabinetId))
    .leftJoin(doorStyles, eq(doorStyles.id, distributorSkus.styleId))
    .where(eq(distributorSkus.distributorId, distributorId));
  const other = await db.select().from(vendorProducts).where(eq(vendorProducts.distributorId, distributorId));
  return [
    ...skuRows.map((row) => ({ ...row, table: "distributor_skus" as const, name: row.name ?? row.sku, conflictStatus: row.conflictStatus ?? "none" })),
    ...other.map((row) => ({
      table: "vendor_products" as const,
      id: row.id,
      sku: row.vendorSku,
      name: row.name,
      onHandQty: row.onHandQty,
      leadTimeDays: row.leadTimeDays,
      inventoryNotes: row.inventoryNotes,
      discontinued: row.discontinued,
      backorder: row.backorder,
      minimumOrderQty: row.minimumOrderQty,
      restockDate: row.restockDate,
      outOfStock: row.outOfStock,
      inventoryUpdatedAt: row.inventoryUpdatedAt,
      inventorySyncSource: row.inventorySyncSource,
      importLockedFields: row.importLockedFields,
      vendorWholesale: row.vendorWholesale,
      conflictStatus: "none",
      supplierDescription: row.description,
      supplierCabinetName: row.name,
      category: row.category,
    })),
  ];
}

function definedFields<T extends Record<string, unknown>>(values: T): Partial<T> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as Partial<T>;
}

async function writeProduct(db: Db, row: ProductRow, patch: Partial<ProductRow>) {
  const inventory = definedFields({
    onHandQty: patch.onHandQty,
    leadTimeDays: patch.leadTimeDays,
    inventoryNotes: patch.inventoryNotes,
    discontinued: patch.discontinued,
    backorder: patch.backorder,
    minimumOrderQty: patch.minimumOrderQty,
    restockDate: patch.restockDate,
    outOfStock: patch.outOfStock,
    inventoryUpdatedAt: patch.inventoryUpdatedAt,
    inventorySyncSource: patch.inventorySyncSource,
    vendorWholesale: patch.vendorWholesale,
  });
  if (row.table === "distributor_skus") {
    await db.update(distributorSkus).set({
      ...inventory,
      ...definedFields({
        supplierDescription: patch.supplierDescription,
        supplierCabinetName: patch.supplierCabinetName,
      }),
    }).where(eq(distributorSkus.id, row.id));
    return;
  }
  const descriptive = definedFields({
    description: patch.supplierDescription === null ? undefined : patch.supplierDescription,
    name: patch.supplierCabinetName == null ? undefined : patch.supplierCabinetName,
  });
  if (row.table === "vendor_products") {
    await db.update(vendorProducts).set({ ...inventory, ...descriptive }).where(eq(vendorProducts.id, row.id));
    return;
  }
  await db.update(pelicanProducts).set({ ...inventory, ...descriptive }).where(eq(pelicanProducts.id, row.id));
}

async function noteAdmin(db: Db, scope: VendorScope, type: "inventory_sync" | "low_stock" | "price_increase" | "out_of_stock", title: string, body: string, sku?: string) {
  await db.insert(vendorAdminUpdates).values({ vendorScope: scope, type, title, body, sku: sku ?? null });
  try {
    await notifyOwner({ title, content: body });
  } catch {
    // Best-effort. Inventory and price changes still save when email is unavailable.
  }
}

const scopeInput = z.object({ scope: z.string().min(1).max(32) });

const inventoryPatch = z.object({
  onHandQty: z.number().int().min(0).nullable().optional(),
  leadTimeDays: z.number().int().min(0).nullable().optional(),
  inventoryNotes: z.string().max(512).nullable().optional(),
  discontinued: z.boolean().optional(),
  backorder: z.boolean().optional(),
  minimumOrderQty: z.number().int().min(0).nullable().optional(),
  restockDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  outOfStock: z.boolean().optional(),
});

export const vendorInventoryRouter = router({
  list: supplierProfileProcedure.input(scopeInput).query(async ({ ctx, input }) => {
    const scope = await requireScope(ctx.user, input.scope);
    const db = await requireDb();
    const settings = await getPricingSettings();
    const [line] = scope === "pelican" ? [] : await db.select({ leadTimeDays: distributors.leadTimeDays }).from(distributors).where(eq(distributors.id, Number(scope.slice(5)))).limit(1);
    const products = await productsForScope(db, scope);
    return {
      scope,
      defaultLeadTimeDays: line?.leadTimeDays ?? null,
      multiplierBps: settings.homeownerMarkupBps,
      multiplierEffectiveAt: settings.updatedAt,
      wholesaleIncreaseRequiresApproval: settings.wholesaleIncreaseRequiresApproval,
      products: products.map((row) => ({
        ...row,
        retail: retailFromWholesale(num(row.vendorWholesale), settings.homeownerMarkupBps),
      })),
    };
  }),

  adminList: adminProcedure.query(async () => {
    const db = await requireDb();
    const lines = await db.select({
      id: distributors.id,
      name: distributors.name,
      leadTimeDays: distributors.leadTimeDays,
      inventoryLastSyncAt: distributors.inventoryLastSyncAt,
      inventoryLastSyncSource: distributors.inventoryLastSyncSource,
    }).from(distributors);
    const skuRows = await db.select({
      distributorId: distributorSkus.distributorId,
      sku: distributorSkus.distributorSku,
      onHandQty: distributorSkus.onHandQty,
      leadTimeDays: distributorSkus.leadTimeDays,
      discontinued: distributorSkus.discontinued,
      backorder: distributorSkus.backorder,
      minimumOrderQty: distributorSkus.minimumOrderQty,
      restockDate: distributorSkus.restockDate,
      outOfStock: distributorSkus.outOfStock,
      conflictStatus: cabinets.conflictStatus,
    }).from(distributorSkus).leftJoin(cabinets, eq(cabinets.id, distributorSkus.cabinetId));
    return { lines, skus: skuRows };
  }),

  updateInventory: supplierProfileProcedure.input(scopeInput.extend({
    table: z.enum(["distributor_skus", "vendor_products", "pelican_products"]),
    id: z.number().int().positive(),
    patch: inventoryPatch,
  })).mutation(async ({ ctx, input }) => {
    const scope = await requireScope(ctx.user, input.scope);
    const db = await requireDb();
    const products = await productsForScope(db, scope);
    const row = products.find((product) => product.table === input.table && product.id === input.id);
    if (!row) throw new TRPCError({ code: "FORBIDDEN", message: "That product is not in your line." });
    const outOfStock = input.patch.outOfStock ?? (input.patch.onHandQty === 0 ? true : row.outOfStock);
    await writeProduct(db, row, {
      ...input.patch,
      outOfStock,
      inventoryUpdatedAt: new Date(),
      inventorySyncSource: "manual",
    });
    if (isOutOfStock({ quantityOnHand: input.patch.onHandQty ?? row.onHandQty, outOfStock })) {
      await noteAdmin(db, scope, "out_of_stock", `Out of stock: ${row.sku}`, `${row.sku} is out of stock.`, row.sku);
    } else if (isLowStock(input.patch.onHandQty ?? row.onHandQty)) {
      await noteAdmin(db, scope, "low_stock", `Low stock: ${row.sku}`, `${row.sku} is at ${input.patch.onHandQty ?? row.onHandQty} on hand.`, row.sku);
    }
    return { ok: true as const };
  }),

  previewInventory: supplierProfileProcedure.input(scopeInput.extend({ csv: z.string().max(2_000_000) })).mutation(async ({ ctx, input }) => {
    const scope = await requireScope(ctx.user, input.scope);
    const db = await requireDb();
    const parsed = parseInventoryCsv(input.csv);
    const products = await productsForScope(db, scope);
    const classified = classifyInventoryRows(parsed.rows, new Set(products.map((row) => row.sku)));
    return { applicable: classified.applicable, unknown: classified.unknown, issues: parsed.issues };
  }),

  applyInventory: supplierProfileProcedure.input(scopeInput.extend({
    rows: z.array(z.object({
      sku: z.string().min(1).max(128),
      quantityOnHand: z.number().int().min(0).nullable().optional(),
      leadTimeDays: z.number().int().min(0).nullable().optional(),
      notes: z.string().max(512).nullable().optional(),
      discontinued: z.boolean().nullable().optional(),
      backorder: z.boolean().nullable().optional(),
      minimumOrderQty: z.number().int().min(0).nullable().optional(),
      restockDate: z.string().nullable().optional(),
      outOfStock: z.boolean().nullable().optional(),
    })).max(5000),
    source: z.enum(["upload", "api"]).default("upload"),
  })).mutation(async ({ ctx, input }) => {
    const scope = await requireScope(ctx.user, input.scope);
    const db = await requireDb();
    const products = await productsForScope(db, scope);
    const bySku = new Map(products.map((row) => [row.sku.trim().toUpperCase(), row]));
    let applied = 0;
    const unknown: string[] = [];
    for (const row of input.rows) {
      const product = bySku.get(row.sku.trim().toUpperCase());
      if (!product) {
        unknown.push(row.sku);
        continue;
      }
      const quantity = row.quantityOnHand ?? product.onHandQty;
      await writeProduct(db, product, {
        onHandQty: row.quantityOnHand ?? undefined,
        leadTimeDays: row.leadTimeDays ?? undefined,
        inventoryNotes: row.notes ?? undefined,
        discontinued: row.discontinued ?? undefined,
        backorder: row.backorder ?? undefined,
        minimumOrderQty: row.minimumOrderQty ?? undefined,
        restockDate: row.restockDate ?? undefined,
        outOfStock: row.outOfStock ?? quantity === 0,
        inventoryUpdatedAt: new Date(),
        inventorySyncSource: input.source,
      });
      applied += 1;
    }
    if (scope !== "pelican") {
      await db.update(distributors).set({ inventoryLastSyncAt: new Date(), inventoryLastSyncSource: input.source }).where(eq(distributors.id, Number(scope.slice(5))));
    }
    await noteAdmin(db, scope, "inventory_sync", `Inventory ${input.source}`, `${applied} SKUs updated. ${unknown.length} unknown SKUs were not created.`, undefined);
    return { applied, unknown };
  }),

  setWholesale: supplierProfileProcedure.input(scopeInput.extend({
    table: z.enum(["distributor_skus", "vendor_products", "pelican_products"]),
    id: z.number().int().positive(),
    wholesale: z.number().min(0),
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    note: z.string().max(512).optional(),
  })).mutation(async ({ ctx, input }) => {
    const scope = await requireScope(ctx.user, input.scope);
    const db = await requireDb();
    const settings = await getPricingSettings();
    const products = await productsForScope(db, scope);
    const row = products.find((product) => product.table === input.table && product.id === input.id);
    if (!row) throw new TRPCError({ code: "FORBIDDEN", message: "That product is not in your line." });
    const locked = priceChangeAllowed({ lockedFields: row.importLockedFields, conflictStatus: row.conflictStatus, field: "vendorWholesale" });
    if (locked) throw new TRPCError({ code: "PRECONDITION_FAILED", message: locked });
    const current = num(row.vendorWholesale);
    const disposition = wholesalePriceDisposition(current, input.wholesale, settings.wholesaleIncreaseRequiresApproval);
    if (disposition === "noop") return { disposition };
    if (disposition === "queue") {
      await db.insert(vendorPriceIncreases).values({
        vendorScope: scope,
        productTable: row.table,
        productId: row.id,
        sku: row.sku,
        currentWholesale: current == null ? null : current.toFixed(2),
        nextWholesale: input.wholesale.toFixed(2),
        effectiveDate: input.effectiveDate ?? null,
        note: input.note ?? null,
        createdByUserId: ctx.user.id,
      });
      await noteAdmin(db, scope, "price_increase", `Upcoming price increase: ${row.sku}`, `${row.sku} wholesale ${current ?? "unset"} → ${input.wholesale}. It does not change the live price until an admin applies it.`, row.sku);
      return { disposition };
    }
    await writeProduct(db, row, { vendorWholesale: input.wholesale.toFixed(2) });
    return { disposition };
  }),

  previewWholesale: supplierProfileProcedure.input(scopeInput.extend({ csv: z.string().max(2_000_000) })).mutation(async ({ ctx, input }) => {
    const scope = await requireScope(ctx.user, input.scope);
    const db = await requireDb();
    const settings = await getPricingSettings();
    const parsed = parseWholesaleCsv(input.csv);
    const products = await productsForScope(db, scope);
    const known = new Set(products.map((row) => row.sku.trim().toUpperCase()));
    const preview = parsed.rows.map((row) => {
      if (!known.has(row.sku.trim().toUpperCase())) return { ...row, disposition: "unknown" as const };
      const product = products.find((item) => item.sku.trim().toUpperCase() === row.sku.trim().toUpperCase())!;
      const blocked = priceChangeAllowed({ lockedFields: product.importLockedFields, conflictStatus: product.conflictStatus, field: "vendorWholesale" });
      if (blocked) return { ...row, disposition: "blocked" as const, message: blocked };
      return { ...row, disposition: wholesalePriceDisposition(num(product.vendorWholesale), row.wholesale, settings.wholesaleIncreaseRequiresApproval) };
    });
    return { preview, issues: parsed.issues };
  }),

  createKey: supplierProfileProcedure.input(scopeInput).mutation(async ({ ctx, input }) => {
    const scope = await requireScope(ctx.user, input.scope);
    const db = await requireDb();
    const key = generateInventoryApiKey();
    await db.insert(vendorInventoryApiKeys).values({
      vendorScope: scope,
      keyPrefix: key.prefix,
      keyHash: key.hash,
      createdByUserId: ctx.user.id,
    });
    return { token: key.raw, prefix: key.prefix };
  }),

  listKeys: supplierProfileProcedure.input(scopeInput).query(async ({ ctx, input }) => {
    const scope = await requireScope(ctx.user, input.scope);
    const db = await requireDb();
    const rows = await db.select({
      id: vendorInventoryApiKeys.id,
      keyPrefix: vendorInventoryApiKeys.keyPrefix,
      createdAt: vendorInventoryApiKeys.createdAt,
      revokedAt: vendorInventoryApiKeys.revokedAt,
      lastUsedAt: vendorInventoryApiKeys.lastUsedAt,
    }).from(vendorInventoryApiKeys).where(eq(vendorInventoryApiKeys.vendorScope, scope)).orderBy(desc(vendorInventoryApiKeys.createdAt));
    return rows;
  }),

  revokeKey: supplierProfileProcedure.input(scopeInput.extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const scope = await requireScope(ctx.user, input.scope);
    const db = await requireDb();
    await db.update(vendorInventoryApiKeys).set({ revokedAt: new Date() }).where(and(eq(vendorInventoryApiKeys.id, input.id), eq(vendorInventoryApiKeys.vendorScope, scope)));
    return { ok: true as const };
  }),

  priceIncreases: supplierProfileProcedure.input(scopeInput).query(async ({ ctx, input }) => {
    const scope = await requireScope(ctx.user, input.scope);
    const db = await requireDb();
    return db.select().from(vendorPriceIncreases).where(eq(vendorPriceIncreases.vendorScope, scope)).orderBy(desc(vendorPriceIncreases.createdAt));
  }),

  adminPriceIncreases: adminProcedure.query(async () => {
    const db = await requireDb();
    return db.select().from(vendorPriceIncreases).orderBy(vendorPriceIncreases.effectiveDate);
  }),

  reviewPriceIncrease: adminProcedure.input(z.object({
    id: z.number().int().positive(),
    action: z.enum(["acknowledge", "apply", "dismiss"]),
  })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const [increase] = await db.select().from(vendorPriceIncreases).where(eq(vendorPriceIncreases.id, input.id)).limit(1);
    if (!increase) throw new TRPCError({ code: "NOT_FOUND" });
    if (input.action === "apply") {
      const scope = parseVendorScope(increase.vendorScope);
      if (!scope) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown vendor." });
      const products = await productsForScope(db, scope);
      const row = products.find((product) => product.table === increase.productTable && product.id === increase.productId);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Product no longer in that vendor line." });
      const locked = priceChangeAllowed({ lockedFields: row.importLockedFields, conflictStatus: row.conflictStatus, field: "vendorWholesale" });
      if (locked) throw new TRPCError({ code: "PRECONDITION_FAILED", message: locked });
      await writeProduct(db, row, { vendorWholesale: String(increase.nextWholesale) });
    }
    await db.update(vendorPriceIncreases).set({
      status: input.action === "apply" ? "applied" : input.action === "dismiss" ? "dismissed" : "acknowledged",
      reviewedByUserId: ctx.user.id,
      reviewedAt: new Date(),
    }).where(eq(vendorPriceIncreases.id, increase.id));
    return { ok: true as const };
  }),

  inbox: adminProcedure.input(z.object({
    vendorScope: z.string().optional(),
    type: z.enum(["inventory_sync", "low_stock", "price_increase", "out_of_stock"]).optional(),
    unreadOnly: z.boolean().optional(),
  }).optional()).query(async ({ input }) => {
    const db = await requireDb();
    const rows = await db.select().from(vendorAdminUpdates).orderBy(desc(vendorAdminUpdates.createdAt)).limit(300);
    return rows.filter((row) => {
      if (input?.vendorScope && row.vendorScope !== input.vendorScope) return false;
      if (input?.type && row.type !== input.type) return false;
      if (input?.unreadOnly && row.readAt) return false;
      return true;
    });
  }),

  inboxCount: adminProcedure.query(async () => {
    const db = await requireDb();
    const rows = await db.select({ id: vendorAdminUpdates.id }).from(vendorAdminUpdates).where(isNull(vendorAdminUpdates.readAt));
    return { unread: rows.length };
  }),

  markRead: adminProcedure.input(z.object({ id: z.number().int().positive(), acknowledge: z.boolean().optional() })).mutation(async ({ input }) => {
    const db = await requireDb();
    await db.update(vendorAdminUpdates).set({
      readAt: new Date(),
      acknowledgedAt: input.acknowledge ? new Date() : undefined,
    }).where(eq(vendorAdminUpdates.id, input.id));
    return { ok: true as const };
  }),

  editDescription: supplierProfileProcedure.input(scopeInput.extend({
    table: z.enum(["distributor_skus", "vendor_products", "pelican_products"]),
    id: z.number().int().positive(),
    field: z.enum(["supplierCabinetName", "supplierDescription", "inventoryNotes"]),
    value: z.string().max(2000),
  })).mutation(async ({ ctx, input }) => {
    const scope = await requireScope(ctx.user, input.scope);
    const db = await requireDb();
    const products = await productsForScope(db, scope);
    const row = products.find((product) => product.table === input.table && product.id === input.id);
    if (!row) throw new TRPCError({ code: "FORBIDDEN", message: "That product is not in your line." });
    const blocked = descriptiveEditAllowed({ field: input.field, lockedFields: row.importLockedFields });
    if (blocked) throw new TRPCError({ code: "PRECONDITION_FAILED", message: blocked });
    if (row.conflictStatus === "conflict") {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This product is in conflict review and is read-only." });
    }
    const previous = input.field === "supplierCabinetName" ? row.supplierCabinetName : input.field === "supplierDescription" ? row.supplierDescription : row.inventoryNotes;
    await writeProduct(db, row, { [input.field]: input.value } as Partial<ProductRow>);
    await db.insert(vendorCatalogEditLog).values({
      vendorScope: scope,
      productTable: row.table,
      productId: row.id,
      field: input.field,
      oldValue: previous,
      newValue: input.value,
      userId: ctx.user.id,
    });
    return { ok: true as const };
  }),

  setDefaultLeadTime: supplierProfileProcedure.input(scopeInput.extend({
    leadTimeDays: z.number().int().min(0).max(365),
  })).mutation(async ({ ctx, input }) => {
    const scope = await requireScope(ctx.user, input.scope);
    if (scope === "pelican") throw new TRPCError({ code: "BAD_REQUEST", message: "Set lead time on each Pelican product." });
    const db = await requireDb();
    await db.update(distributors).set({ leadTimeDays: input.leadTimeDays }).where(eq(distributors.id, Number(scope.slice(5))));
    return { ok: true as const };
  }),
});

export async function applyInventorySync(scope: VendorScope, rows: ParsedInventoryRow[], source: "api" | "upload") {
  const db = await requireDb();
  const products = await productsForScope(db, scope);
  const classified = classifyInventoryRows(rows, new Set(products.map((row) => row.sku)));
  const bySku = new Map(products.map((row) => [row.sku.trim().toUpperCase(), row]));
  for (const row of classified.applicable) {
    const product = bySku.get(row.sku.trim().toUpperCase());
    if (!product) continue;
    await writeProduct(db, product, {
      onHandQty: row.quantityOnHand ?? undefined,
      leadTimeDays: row.leadTimeDays ?? undefined,
      inventoryNotes: row.notes ?? undefined,
      discontinued: row.discontinued ?? undefined,
      backorder: row.backorder ?? undefined,
      minimumOrderQty: row.minimumOrderQty ?? undefined,
      restockDate: row.restockDate ?? undefined,
      outOfStock: row.outOfStock ?? row.quantityOnHand === 0,
      inventoryUpdatedAt: new Date(),
      inventorySyncSource: source,
    });
  }
  if (scope !== "pelican") {
    await db.update(distributors).set({ inventoryLastSyncAt: new Date(), inventoryLastSyncSource: source }).where(eq(distributors.id, Number(scope.slice(5))));
  }
  await noteAdmin(db, scope, "inventory_sync", "Inventory API sync", `${classified.applicable.length} SKUs updated. ${classified.unknown.length} unknown SKUs were not created.`);
  return classified;
}
