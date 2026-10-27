import { z } from "zod";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { adminProcedure, distributorProcedure, router } from "../_core/trpc";
import { resolveVendorCatalogLineId } from "../lib/approvedVendorAccess";
import { getDb } from "../db";
import {
  cabinetAliases,
  cabinets,
  codeAliases,
  distributorSkus,
  distributors,
  doorStyles,
  skuMasterAliases,
  vendorOnboardingImports,
  vendorOnboardingRows,
} from "../../drizzle/schema";
import { normalizeCode } from "../../shared/cabinetCodeMatch";
import { PUBLIC_CATALOG_REVIEW_STATUS } from "../../shared/cabinetConflictFlags";
import { buildPlatformSku, MAX_PRICE } from "../../shared/vendorCodeUpload";
import {
  MAX_ONBOARDING_ROWS,
  applyFlaggedSubmission,
  enforcedDrawerCount,
  isTrimItem,
  parseOnboardingText,
  planOnboarding,
  type OnboardingAliasLink,
  type OnboardingMaster,
  type PlannedOnboardingRow,
  type SpecialField,
  type StoredOnboardingRow,
} from "../../shared/vendorOnboarding";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type OnboardingRow = typeof vendorOnboardingRows.$inferSelect;

const SPECIAL = ["distributorName", "style", "color", "price"] as const;

const sheetRow = z.object({
  rowNumber: z.number().int().positive(),
  sku: z.string().max(128),
  distributorName: z.string().max(128).nullable().optional(),
  style: z.string().max(128).nullable().optional(),
  color: z.string().max(64).nullable().optional(),
  price: z.union([z.number(), z.string().max(32)]).nullable().optional(),
  category: z.string().max(64).nullable().optional(),
  subCategory: z.string().max(128).nullable().optional(),
  width: z.union([z.number(), z.string().max(32)]).nullable().optional(),
  height: z.union([z.number(), z.string().max(32)]).nullable().optional(),
  depth: z.union([z.number(), z.string().max(32)]).nullable().optional(),
  description: z.string().max(10_000).nullable().optional(),
  numberOfDoors: z.union([z.number().int(), z.string().max(8)]).nullable().optional(),
  numberOfDrawers: z.union([z.number().int(), z.string().max(8)]).nullable().optional(),
});

function resolveLine(
  ctx: { isAdmin: boolean; distributorId: number | null; linkedDistributorIds?: readonly number[] | null },
  requested?: number,
): number {
  return resolveVendorCatalogLineId(ctx.isAdmin, ctx.distributorId, requested, ctx.linkedDistributorIds);
}

function requireDb(db: Db | null): Db {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}

function insertId(result: unknown): number {
  const header = (Array.isArray(result) ? result[0] : result) as { insertId?: number } | undefined;
  if (!header?.insertId) throw new Error("Insert did not return an id.");
  return header.insertId;
}

function isDuplicateKey(error: unknown): boolean {
  const err = error as { code?: string; errno?: number; cause?: { code?: string; errno?: number } };
  return err?.code === "ER_DUP_ENTRY" || err?.errno === 1062 || err?.cause?.code === "ER_DUP_ENTRY" || err?.cause?.errno === 1062;
}

function asNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asSpecial(value: unknown): SpecialField[] {
  if (!Array.isArray(value)) return [];
  return value.filter((field): field is SpecialField => (SPECIAL as readonly string[]).includes(String(field)));
}

function needsFullDetails(reason: string | null): boolean {
  return reason === "unknown_sku" || reason === "ambiguous";
}

async function loadCatalog(db: Db, lineId: number) {
  const [styleRows, masterRows, masterAliasRows, cabinetAliasRows, savedAliasRows, lineRows] = await Promise.all([
    db.select({
      id: doorStyles.id,
      styleCode: doorStyles.styleCode,
      ourName: doorStyles.ourName,
      aliasName: doorStyles.aliasName,
      distributorName: doorStyles.distributorName,
      color: doorStyles.color,
      doorStyle: doorStyles.doorStyle,
    }).from(doorStyles).where(and(eq(doorStyles.distributorId, lineId), eq(doorStyles.isActive, true))),
    db.select({
      id: cabinets.id,
      masterCode: cabinets.masterCode,
      sku: cabinets.sku,
      vendorSku: cabinets.vendorSku,
      altSku1: cabinets.altSku1,
      altSku2: cabinets.altSku2,
      altSku3: cabinets.altSku3,
      description: cabinets.description,
      category: cabinets.category,
      subCategory: cabinets.subCategory,
      width: cabinets.width,
      height: cabinets.height,
      depth: cabinets.depth,
      numberOfDoors: cabinets.numberOfDoors,
      numberOfDrawers: cabinets.numberOfDrawers,
      placementType: cabinets.placementType,
      conflictStatus: cabinets.conflictStatus,
    }).from(cabinets),
    db.select({ alias: skuMasterAliases.aliasCode, masterCode: skuMasterAliases.masterCode })
      .from(skuMasterAliases).where(eq(skuMasterAliases.conflictStatus, "ok")),
    db.select({ alias: cabinetAliases.alias, cabinetId: cabinetAliases.cabinetId })
      .from(cabinetAliases)
      .innerJoin(cabinets, eq(cabinets.id, cabinetAliases.cabinetId))
      .where(ne(cabinets.conflictStatus, "conflict")),
    db.select({ alias: codeAliases.rawCodeSample, cabinetId: codeAliases.cabinetId })
      .from(codeAliases).where(isNull(codeAliases.userId)),
    db.select({ id: distributors.id, code: distributors.code, name: distributors.name })
      .from(distributors).where(eq(distributors.id, lineId)).limit(1),
  ]);
  const line = lineRows[0];
  if (!line) throw new TRPCError({ code: "NOT_FOUND", message: "Supply line not found." });
  const trimIds = masterRows.filter((master) => isTrimItem(master)).map((master) => master.id);
  const suppliers = new Map<number, number[]>();
  if (trimIds.length > 0) {
    const links = await db.select({
      cabinetId: distributorSkus.cabinetId,
      distributorId: distributorSkus.distributorId,
    }).from(distributorSkus).where(inArray(distributorSkus.cabinetId, trimIds));
    for (const link of links) {
      if (link.cabinetId == null) continue;
      const list = suppliers.get(link.cabinetId) ?? [];
      list.push(link.distributorId);
      suppliers.set(link.cabinetId, list);
    }
  }
  const masters: OnboardingMaster[] = masterRows.map((master) => ({
    ...master,
    supplierIds: suppliers.get(master.id),
  }));
  const aliases: OnboardingAliasLink[] = [...masterAliasRows, ...cabinetAliasRows, ...savedAliasRows];
  return { styles: styleRows, masters, aliases, line };
}

function rowValues(importId: number, lineId: number, row: PlannedOnboardingRow) {
  return {
    importId,
    distributorId: lineId,
    rowNumber: row.rowNumber,
    rawSku: row.sku,
    normalizedSku: row.normalizedSku,
    status: row.status,
    flagReason: row.flagReason,
    missingFields: row.missingFields,
    cabinetId: row.cabinetId,
    masterCode: row.masterCode,
    matchedVia: row.matchedVia,
    candidateMasterCodes: row.candidateMasterCodes,
    distributorName: row.distributorName,
    styleName: row.style,
    colorName: row.color,
    price: row.price == null ? null : row.price.toFixed(2),
    styleId: row.styleId,
    category: row.draft.category,
    subCategory: row.draft.subCategory,
    width: row.draft.width == null ? null : row.draft.width.toFixed(3),
    height: row.draft.height == null ? null : row.draft.height.toFixed(3),
    depth: row.draft.depth == null ? null : row.draft.depth.toFixed(3),
    description: row.draft.description,
    numberOfDoors: row.draft.numberOfDoors,
    numberOfDrawers: row.draft.numberOfDrawers,
    trimSupplierId: row.trimSupplierId,
    trimHeld: row.trimHeld,
    message: row.message.slice(0, 500),
  };
}

async function publishPlannedSku(
  db: Db,
  args: {
    lineId: number;
    lineCode: string;
    cabinetId: number;
    masterCode: string;
    styleId: number;
    styleCode: string;
    rawSku: string;
    price: number;
    taken: Set<string>;
  },
): Promise<number> {
  const [existing] = await db.select({ id: distributorSkus.id })
    .from(distributorSkus)
    .where(and(
      eq(distributorSkus.distributorId, args.lineId),
      eq(distributorSkus.cabinetId, args.cabinetId),
      eq(distributorSkus.styleId, args.styleId),
    ))
    .limit(1);
  const listPrice = args.price.toFixed(2);
  if (existing) {
    await db.update(distributorSkus).set({ listPrice }).where(eq(distributorSkus.id, existing.id));
    return existing.id;
  }
  let platformSku = buildPlatformSku(args.masterCode, args.styleCode, args.lineCode, args.taken, args.styleId, normalizeCode(args.rawSku));
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const result = await db.insert(distributorSkus).values({
        cabinetId: args.cabinetId,
        distributorId: args.lineId,
        styleId: args.styleId,
        platformSku,
        distributorSku: args.rawSku.slice(0, 128),
        listPrice,
        status: "approved",
        isPublished: true,
        isAvailable: true,
      });
      args.taken.add(platformSku);
      return insertId(result);
    } catch (error) {
      if (!isDuplicateKey(error) || attempt === 3) throw error;
      args.taken.add(platformSku);
      platformSku = `${platformSku}-${attempt + 2}`.slice(0, 128);
    }
  }
  throw new Error("Could not save the supplier price.");
}

async function takenPlatformSkus(db: Db, lineId: number): Promise<Set<string>> {
  const rows = await db.select({ platformSku: distributorSkus.platformSku })
    .from(distributorSkus)
    .where(eq(distributorSkus.distributorId, lineId));
  return new Set(rows.map((row) => row.platformSku));
}

async function refreshCounts(db: Db, importId: number) {
  const grouped = await db.select({
    status: vendorOnboardingRows.status,
    n: sql<number>`count(*)`,
  }).from(vendorOnboardingRows)
    .where(eq(vendorOnboardingRows.importId, importId))
    .groupBy(vendorOnboardingRows.status);
  const counts = { total: 0, matched: 0, flagged: 0, completed: 0, trimHeld: 0, styleUnmapped: 0 };
  for (const row of grouped) {
    const count = Number(row.n);
    counts.total += count;
    if (row.status === "matched" || row.status === "flagged" || row.status === "completed") counts[row.status] = count;
  }
  const [extra] = await db.select({
    trimHeld: sql<number>`coalesce(sum(case when ${vendorOnboardingRows.trimHeld} = 1 then 1 else 0 end), 0)`,
    styleUnmapped: sql<number>`coalesce(sum(case when ${vendorOnboardingRows.status} = 'matched' and ${vendorOnboardingRows.styleId} is null and ${vendorOnboardingRows.trimHeld} = 0 then 1 else 0 end), 0)`,
  }).from(vendorOnboardingRows).where(eq(vendorOnboardingRows.importId, importId));
  counts.trimHeld = Number(extra?.trimHeld ?? 0);
  counts.styleUnmapped = Number(extra?.styleUnmapped ?? 0);
  await db.update(vendorOnboardingImports).set({
    matchedCount: counts.matched,
    flaggedCount: counts.flagged,
    completedCount: counts.completed,
  }).where(eq(vendorOnboardingImports.id, importId));
  return counts;
}

function storedFrom(row: OnboardingRow): StoredOnboardingRow {
  return {
    status: row.status,
    flagReason: row.flagReason,
    missingFields: asSpecial(row.missingFields),
    sku: row.rawSku,
    cabinetId: row.cabinetId,
    masterCode: row.masterCode,
    matchedVia: row.matchedVia === "master" || row.matchedVia === "alias" ? row.matchedVia : null,
    distributorName: row.distributorName,
    style: row.styleName,
    color: row.colorName,
    price: asNumber(row.price),
    styleId: row.styleId,
    inherited: null,
    draft: {
      category: row.category,
      subCategory: row.subCategory,
      width: asNumber(row.width),
      height: asNumber(row.height),
      depth: asNumber(row.depth),
      description: row.description,
      numberOfDoors: row.numberOfDoors,
      numberOfDrawers: row.numberOfDrawers,
    },
    trimHeld: row.trimHeld,
    trimSupplierId: row.trimSupplierId,
  };
}

function publicRow(row: OnboardingRow, inherited: StoredOnboardingRow["inherited"] = null) {
  return {
    id: row.id,
    importId: row.importId,
    distributorId: row.distributorId,
    rowNumber: row.rowNumber,
    sku: row.rawSku,
    status: row.status,
    flagReason: row.flagReason,
    missingFields: asSpecial(row.missingFields),
    needsFullDetails: needsFullDetails(row.flagReason),
    cabinetId: row.cabinetId,
    masterCode: row.masterCode,
    matchedVia: row.matchedVia,
    candidateMasterCodes: row.candidateMasterCodes ?? [],
    reviewCabinetId: row.reviewCabinetId,
    distributorName: row.distributorName,
    style: row.styleName,
    color: row.colorName,
    price: row.price,
    styleId: row.styleId,
    skuId: row.skuId,
    category: row.category,
    subCategory: row.subCategory,
    width: row.width,
    height: row.height,
    depth: row.depth,
    description: row.description,
    numberOfDoors: row.numberOfDoors,
    numberOfDrawers: row.numberOfDrawers,
    trimHeld: row.trimHeld,
    trimSupplierId: row.trimSupplierId,
    message: row.message,
    inherited,
  };
}

async function inheritedFor(db: Db, rows: OnboardingRow[]) {
  const ids = Array.from(new Set(rows.map((row) => row.cabinetId).filter((id): id is number => id != null)));
  const found = new Map<number, StoredOnboardingRow["inherited"]>();
  if (ids.length === 0) return found;
  const cabinetsRows = await db.select({
    id: cabinets.id,
    masterCode: cabinets.masterCode,
    description: cabinets.description,
    category: cabinets.category,
    subCategory: cabinets.subCategory,
    width: cabinets.width,
    height: cabinets.height,
    depth: cabinets.depth,
    numberOfDoors: cabinets.numberOfDoors,
    numberOfDrawers: cabinets.numberOfDrawers,
    placementType: cabinets.placementType,
  }).from(cabinets).where(inArray(cabinets.id, ids));
  for (const cabinet of cabinetsRows) {
    found.set(cabinet.id, {
      cabinetId: cabinet.id,
      masterCode: cabinet.masterCode,
      description: cabinet.description,
      category: cabinet.category,
      subCategory: cabinet.subCategory,
      width: cabinet.width,
      height: cabinet.height,
      depth: cabinet.depth,
      numberOfDoors: cabinet.numberOfDoors,
      numberOfDrawers: enforcedDrawerCount(cabinet),
    });
  }
  return found;
}

async function ownImport(db: Db, lineId: number, importId: number) {
  const [found] = await db.select().from(vendorOnboardingImports)
    .where(and(eq(vendorOnboardingImports.id, importId), eq(vendorOnboardingImports.distributorId, lineId)))
    .limit(1);
  if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Import not found." });
  return found;
}

const doorList = (styles: { id: number; ourName: string; aliasName: string | null; color: string | null }[]) =>
  styles.slice(0, 80).map((style) => ({ id: style.id, name: style.aliasName || style.ourName, color: style.color }));

export const vendorOnboardingRouter = router({
  /**
   * Match a spreadsheet and store every row. Fully matched rows are priced
   * from the master cabinet. The response list is only the flagged exceptions.
   */
  ingest: distributorProcedure.input(z.object({
    distributorId: z.number().int().positive().optional(),
    fileName: z.string().trim().max(255).optional(),
    text: z.string().max(2_000_000).optional(),
    rows: z.array(sheetRow).max(MAX_ONBOARDING_ROWS).optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = requireDb(await getDb());
    const lineId = resolveLine(ctx, input.distributorId);
    const parsed = input.rows && input.rows.length > 0
      ? { rows: input.rows, notes: [] as string[] }
      : parseOnboardingText(input.text ?? "");
    if (parsed.rows.length === 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The spreadsheet has no data rows." });
    }
    const seen = new Set<number>();
    for (const row of parsed.rows) {
      if (seen.has(row.rowNumber)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Row ${row.rowNumber} appears more than once.` });
      }
      seen.add(row.rowNumber);
    }
    const catalog = await loadCatalog(db, lineId);
    const planned = planOnboarding({
      rows: parsed.rows,
      masters: catalog.masters,
      aliases: catalog.aliases,
      styles: catalog.styles,
      lineName: catalog.line.name,
      lineId,
    });
    const created = await db.insert(vendorOnboardingImports).values({
      distributorId: lineId,
      fileName: input.fileName ?? null,
      uploadedByUserId: ctx.user.id,
    });
    const importId = insertId(created);
    for (let offset = 0; offset < planned.length; offset += 100) {
      await db.insert(vendorOnboardingRows).values(planned.slice(offset, offset + 100).map((row) => rowValues(importId, lineId, row)));
    }
    const stored = await db.select().from(vendorOnboardingRows)
      .where(eq(vendorOnboardingRows.importId, importId))
      .orderBy(vendorOnboardingRows.rowNumber);
    const styleCode = new Map(catalog.styles.map((style) => [style.id, style.styleCode]));
    const taken = await takenPlatformSkus(db, lineId);
    const byNumber = new Map(planned.map((row) => [row.rowNumber, row]));
    for (const row of stored) {
      const planRow = byNumber.get(row.rowNumber);
      if (!planRow || planRow.status !== "matched" || planRow.trimHeld || planRow.cabinetId == null || planRow.styleId == null || planRow.price == null) continue;
      try {
        const skuId = await publishPlannedSku(db, {
          lineId,
          lineCode: catalog.line.code,
          cabinetId: planRow.cabinetId,
          masterCode: planRow.masterCode ?? planRow.sku,
          styleId: planRow.styleId,
          styleCode: styleCode.get(planRow.styleId) ?? String(planRow.styleId),
          rawSku: planRow.sku,
          price: planRow.price,
          taken,
        });
        await db.update(vendorOnboardingRows).set({ skuId }).where(eq(vendorOnboardingRows.id, row.id));
        row.skuId = skuId;
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 160) : "Could not save the price.";
        await db.update(vendorOnboardingRows).set({ message }).where(eq(vendorOnboardingRows.id, row.id));
        row.message = message;
      }
    }
    const counts = await refreshCounts(db, importId);
    const flagged = stored.filter((row) => row.status === "flagged");
    const inherited = await inheritedFor(db, flagged);
    return {
      importId,
      line: { id: catalog.line.id, name: catalog.line.name },
      notes: parsed.notes,
      summary: counts,
      flagged: flagged.map((row) => publicRow(row, row.cabinetId == null ? null : inherited.get(row.cabinetId) ?? null)),
      doors: doorList(catalog.styles),
    };
  }),

  /** Counts for one import, or the latest import on the supply line. */
  summary: distributorProcedure.input(z.object({
    distributorId: z.number().int().positive().optional(),
    importId: z.number().int().positive().optional(),
  }).optional()).query(async ({ ctx, input }) => {
    const db = requireDb(await getDb());
    const lineId = resolveLine(ctx, input?.distributorId);
    const found = input?.importId
      ? await ownImport(db, lineId, input.importId)
      : (await db.select().from(vendorOnboardingImports)
        .where(eq(vendorOnboardingImports.distributorId, lineId))
        .orderBy(desc(vendorOnboardingImports.id))
        .limit(1))[0];
    if (!found) {
      return {
        importId: null,
        distributorId: lineId,
        fileName: null,
        createdAt: null,
        counts: { total: 0, matched: 0, flagged: 0, completed: 0, trimHeld: 0, styleUnmapped: 0 },
      };
    }
    const counts = await refreshCounts(db, found.id);
    return {
      importId: found.id,
      distributorId: found.distributorId,
      fileName: found.fileName,
      createdAt: found.createdAt,
      counts,
    };
  }),

  /** The short exception list: unknown SKUs, ambiguous SKUs, and missing vendor fields. */
  flagged: distributorProcedure.input(z.object({
    distributorId: z.number().int().positive().optional(),
    importId: z.number().int().positive(),
  })).query(async ({ ctx, input }) => {
    const db = requireDb(await getDb());
    const lineId = resolveLine(ctx, input.distributorId);
    await ownImport(db, lineId, input.importId);
    const rows = await db.select().from(vendorOnboardingRows)
      .where(and(eq(vendorOnboardingRows.importId, input.importId), eq(vendorOnboardingRows.status, "flagged")))
      .orderBy(vendorOnboardingRows.rowNumber);
    const inherited = await inheritedFor(db, rows);
    const styles = await db.select({
      id: doorStyles.id,
      ourName: doorStyles.ourName,
      aliasName: doorStyles.aliasName,
      color: doorStyles.color,
    }).from(doorStyles).where(and(eq(doorStyles.distributorId, lineId), eq(doorStyles.isActive, true)));
    return {
      importId: input.importId,
      rows: rows.map((row) => publicRow(row, row.cabinetId == null ? null : inherited.get(row.cabinetId) ?? null)),
      doors: doorList(styles),
    };
  }),

  /**
   * Vendor details for one flagged row. A missing price (or style, color, or
   * distributor) completes as a master match. An unknown or ambiguous SKU
   * becomes a public conflict review, not a verified master.
   */
  submitDetails: distributorProcedure.input(z.object({
    distributorId: z.number().int().positive().optional(),
    rowId: z.number().int().positive(),
    distributorName: z.string().trim().max(128).optional(),
    style: z.string().trim().max(128).optional(),
    color: z.string().trim().max(64).optional(),
    price: z.number().finite().positive().max(MAX_PRICE).optional(),
    category: z.string().trim().max(64).optional(),
    subCategory: z.string().trim().max(128).nullable().optional(),
    width: z.number().finite().positive().max(1000).optional(),
    height: z.number().finite().positive().max(1000).optional(),
    depth: z.number().finite().positive().max(1000).optional(),
    description: z.string().trim().max(10_000).optional(),
    numberOfDoors: z.number().int().min(0).max(20).optional(),
    numberOfDrawers: z.number().int().min(0).max(20).optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = requireDb(await getDb());
    const lineId = resolveLine(ctx, input.distributorId);
    const [owned] = await db.select().from(vendorOnboardingRows)
      .where(and(eq(vendorOnboardingRows.id, input.rowId), eq(vendorOnboardingRows.distributorId, lineId)))
      .limit(1);
    if (!owned) throw new TRPCError({ code: "NOT_FOUND", message: "Flagged row not found." });
    const catalog = await loadCatalog(db, lineId);
    const outcome = applyFlaggedSubmission(storedFrom(owned), input, {
      styles: catalog.styles,
      lineName: catalog.line.name,
      lineId,
    });
    if (!outcome.ok) throw new TRPCError({ code: "BAD_REQUEST", message: outcome.message });

    let reviewCabinetId: number | null = owned.reviewCabinetId;
    let skuId: number | null = owned.skuId;
    if (outcome.opensReview && outcome.review) {
      const draft = outcome.review;
      let masterCode = draft.masterCode;
      let cabinetId = 0;
      try {
        const result = await db.insert(cabinets).values({
          masterCode,
          description: draft.description,
          descriptionSource: "Vendor onboarding",
          category: draft.category,
          subCategory: draft.subCategory,
          width: draft.width.toFixed(3),
          height: draft.height.toFixed(3),
          depth: draft.depth.toFixed(3),
          numberOfDoors: draft.numberOfDoors,
          numberOfDrawers: draft.numberOfDrawers,
          placementType: draft.placementType,
          isActive: true,
          showInCatalog: true,
          showInDesigner: false,
          showIn2020: false,
          designerEligible: false,
          configVerified: false,
          conflictStatus: PUBLIC_CATALOG_REVIEW_STATUS,
          conflictReason: draft.conflictReason,
          conflictedAt: new Date(),
        });
        cabinetId = insertId(result);
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
        masterCode = `${draft.masterCode}-ONB`.slice(0, 64);
        const result = await db.insert(cabinets).values({
          masterCode,
          description: draft.description,
          descriptionSource: "Vendor onboarding",
          category: draft.category,
          subCategory: draft.subCategory,
          width: draft.width.toFixed(3),
          height: draft.height.toFixed(3),
          depth: draft.depth.toFixed(3),
          numberOfDoors: draft.numberOfDoors,
          numberOfDrawers: draft.numberOfDrawers,
          placementType: draft.placementType,
          isActive: true,
          showInCatalog: true,
          showInDesigner: false,
          showIn2020: false,
          designerEligible: false,
          configVerified: false,
          conflictStatus: PUBLIC_CATALOG_REVIEW_STATUS,
          conflictReason: draft.conflictReason,
          conflictedAt: new Date(),
        });
        cabinetId = insertId(result);
      }
      reviewCabinetId = cabinetId;
      if (outcome.styleId != null && outcome.price != null) {
        const styleCode = catalog.styles.find((style) => style.id === outcome.styleId)?.styleCode ?? String(outcome.styleId);
        const taken = await takenPlatformSkus(db, lineId);
        skuId = await publishPlannedSku(db, {
          lineId,
          lineCode: catalog.line.code,
          cabinetId,
          masterCode,
          styleId: outcome.styleId,
          styleCode,
          rawSku: owned.rawSku,
          price: outcome.price,
          taken,
        });
      }
    } else if (outcome.status === "matched" && owned.cabinetId != null && outcome.styleId != null && outcome.price != null && !owned.trimHeld) {
      const styleCode = catalog.styles.find((style) => style.id === outcome.styleId)?.styleCode ?? String(outcome.styleId);
      const taken = await takenPlatformSkus(db, lineId);
      skuId = await publishPlannedSku(db, {
        lineId,
        lineCode: catalog.line.code,
        cabinetId: owned.cabinetId,
        masterCode: owned.masterCode ?? owned.rawSku,
        styleId: outcome.styleId,
        styleCode,
        rawSku: owned.rawSku,
        price: outcome.price,
        taken,
      });
    }

    await db.update(vendorOnboardingRows).set({
      status: outcome.status,
      flagReason: outcome.flagReason,
      missingFields: outcome.missingFields,
      distributorName: outcome.distributorName,
      styleName: outcome.style,
      colorName: outcome.color,
      price: outcome.price == null ? null : outcome.price.toFixed(2),
      styleId: outcome.styleId,
      category: outcome.draft.category,
      subCategory: outcome.draft.subCategory,
      width: outcome.draft.width == null ? null : outcome.draft.width.toFixed(3),
      height: outcome.draft.height == null ? null : outcome.draft.height.toFixed(3),
      depth: outcome.draft.depth == null ? null : outcome.draft.depth.toFixed(3),
      description: outcome.draft.description,
      numberOfDoors: outcome.draft.numberOfDoors,
      numberOfDrawers: outcome.draft.numberOfDrawers,
      reviewCabinetId,
      skuId,
      message: outcome.message.slice(0, 500),
    }).where(eq(vendorOnboardingRows.id, owned.id));
    const counts = await refreshCounts(db, owned.importId);
    const [updated] = await db.select().from(vendorOnboardingRows).where(eq(vendorOnboardingRows.id, owned.id)).limit(1);
    return {
      row: publicRow(updated ?? owned),
      summary: counts,
      conflictStatus: outcome.opensReview ? PUBLIC_CATALOG_REVIEW_STATUS : null,
      staysPublic: outcome.opensReview ? true : null,
    };
  }),

  /**
   * Admin onboarding review. Defaults to flagged and completed rows so the
   * screen stays on exceptions. Completed rows are the same cabinets listed
   * in Cabinet Conflicts with conflictStatus "review".
   */
  adminList: adminProcedure.input(z.object({
    distributorId: z.number().int().positive().optional(),
    importId: z.number().int().positive().optional(),
    status: z.enum(["matched", "flagged", "completed"]).optional(),
    limit: z.number().int().min(1).max(500).default(100),
  }).optional()).query(async ({ input }) => {
    const db = requireDb(await getDb());
    const args = input ?? { limit: 100 };
    const importConditions = [];
    if (args.distributorId) importConditions.push(eq(vendorOnboardingImports.distributorId, args.distributorId));
    if (args.importId) importConditions.push(eq(vendorOnboardingImports.id, args.importId));
    const imports = await db.select({
      id: vendorOnboardingImports.id,
      distributorId: vendorOnboardingImports.distributorId,
      distributorName: distributors.name,
      fileName: vendorOnboardingImports.fileName,
      createdAt: vendorOnboardingImports.createdAt,
      matched: vendorOnboardingImports.matchedCount,
      flagged: vendorOnboardingImports.flaggedCount,
      completed: vendorOnboardingImports.completedCount,
    }).from(vendorOnboardingImports)
      .leftJoin(distributors, eq(distributors.id, vendorOnboardingImports.distributorId))
      .where(importConditions.length ? and(...importConditions) : undefined)
      .orderBy(desc(vendorOnboardingImports.id))
      .limit(50);

    const rowConditions = [];
    if (args.distributorId) rowConditions.push(eq(vendorOnboardingRows.distributorId, args.distributorId));
    if (args.importId) rowConditions.push(eq(vendorOnboardingRows.importId, args.importId));
    if (args.status) rowConditions.push(eq(vendorOnboardingRows.status, args.status));
    else rowConditions.push(inArray(vendorOnboardingRows.status, ["flagged", "completed"]));
    const rows = await db.select({
      row: vendorOnboardingRows,
      conflictStatus: cabinets.conflictStatus,
      conflictReason: cabinets.conflictReason,
    }).from(vendorOnboardingRows)
      .leftJoin(cabinets, eq(cabinets.id, vendorOnboardingRows.reviewCabinetId))
      .where(and(...rowConditions))
      .orderBy(desc(vendorOnboardingRows.importId), vendorOnboardingRows.rowNumber)
      .limit(args.limit ?? 100);
    return {
      imports,
      rows: rows.map(({ row, conflictStatus, conflictReason }) => ({
        ...publicRow(row),
        conflictStatus,
        conflictReason,
        staysPublic: conflictStatus != null && conflictStatus !== "conflict",
      })),
    };
  }),
});
