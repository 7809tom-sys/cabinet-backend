import { z } from "zod";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import * as XLSX from "xlsx";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { distributors, cabinets, cabinetAliases, cabinetDistributorEligibility, distributorSkus, doorStyles, categoryAliases } from "../../drizzle/schema";
import {
  parseDistributorCsv,
  validateImport,
  parseMoney,
  parseDimension,
  VALID_CATEGORIES,
  IMPORT_TEMPLATE_CSV,
} from "@shared/distributorImport";
import { buildCatalogCsv, type CatalogExportRow } from "@shared/catalogExport";
import {
  buildDistributorRoundTripCsv,
  normalizeDistributorRoundTripCode,
  parseDistributorRoundTripCsv,
} from "@shared/distributorRoundTrip";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const execFileAsync = promisify(execFile);

/** Per-row plan describing what the commit will do (no writes during preview). */
interface PreviewRow {
  rowNumber: number;
  masterCode: string;
  /** The resolved platform master code (may differ from the raw code if alias matched). */
  resolvedMasterCode: string | null;
  /** How the code was matched: "exact" | "alias" | "none" */
  matchHow: "exact" | "alias" | "none";
  /** The door style name resolved from the styleCode column (if any). */
  resolvedStyleName: string | null;
  action: "create-info" | "update-info" | "price-only" | "error";
  description: string | null;
  category: string | null;
  fields: string[]; // which fields will change
  priceTouched: boolean;
  errors: string[];
  warnings: string[];
}

function normalizeCategory(raw: string | undefined): string | null {
  if (!raw) return null;
  const match = VALID_CATEGORIES.find(
    (c) => c.toLowerCase() === raw.toLowerCase()
  );
  return match ?? null;
}

/**
 * Build an alias lookup map from the cabinets table.
 * Returns a map from upper-cased alias value → { id, masterCode, description, category }.
 * Each cabinet can appear under multiple alias keys (sku, vendorSku, altSku1/2/3, masterCode).
 */
async function buildAliasMap(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  codes: string[]
): Promise<Map<string, { id: number; masterCode: string; description: string | null; category: string | null }>> {
  if (codes.length === 0) return new Map();
  const upper = codes.map((c) => c.toUpperCase());

  // Query all cabinets whose masterCode OR any alias field matches any of the codes.
  const rows = await db
    .select({
      id: cabinets.id,
      masterCode: cabinets.masterCode,
      description: cabinets.description,
      category: cabinets.category,
      sku: cabinets.sku,
      vendorSku: cabinets.vendorSku,
      altSku1: cabinets.altSku1,
      altSku2: cabinets.altSku2,
      altSku3: cabinets.altSku3,
    })
    .from(cabinets)
    .where(
      or(
        inArray(sql`UPPER(${cabinets.masterCode})`, upper),
        inArray(sql`UPPER(${cabinets.sku})`, upper),
        inArray(sql`UPPER(${cabinets.vendorSku})`, upper),
        inArray(sql`UPPER(${cabinets.altSku1})`, upper),
        inArray(sql`UPPER(${cabinets.altSku2})`, upper),
        inArray(sql`UPPER(${cabinets.altSku3})`, upper)
      )
    );

  const map = new Map<string, { id: number; masterCode: string; description: string | null; category: string | null }>();
  for (const row of rows) {
    const entry = { id: row.id, masterCode: row.masterCode, description: row.description, category: row.category };
    // Register under every alias (masterCode wins over aliases for the same key).
    for (const val of [row.sku, row.vendorSku, row.altSku1, row.altSku2, row.altSku3]) {
      if (val) {
        const key = val.toUpperCase();
        if (!map.has(key)) map.set(key, entry);
      }
    }
    // masterCode always wins.
    map.set(row.masterCode.toUpperCase(), entry);
  }
  return map;
}

/**
 * Build a door style lookup map for a distributor.
 * Returns a map from upper-cased style name/code → { id, ourName }.
 * Matches against styleCode, ourName, and distributorName.
 */
async function buildStyleMap(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  distributorId: number
): Promise<Map<string, { id: number; ourName: string }>> {
  const styles = await db
    .select({
      id: doorStyles.id,
      styleCode: doorStyles.styleCode,
      ourName: doorStyles.ourName,
      distributorName: doorStyles.distributorName,
    })
    .from(doorStyles)
    .where(eq(doorStyles.distributorId, distributorId));

  const map = new Map<string, { id: number; ourName: string }>();
  for (const s of styles) {
    const entry = { id: s.id, ourName: s.ourName };
    if (s.styleCode) map.set(s.styleCode.toUpperCase(), entry);
    if (s.ourName) map.set(s.ourName.toUpperCase(), entry);
    if (s.distributorName) map.set(s.distributorName.toUpperCase(), entry);
  }
  return map;
}

export const distributorImportRouter = router({
  /**
   * Master catalog export: one row per cabinet with the review columns
   * (code, description, category, subCategory, dims, doors/drawers, graphicType,
   * and how many supply lines carry it). Returns a CSV string + a filename.
   */
  catalogExport: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { csv: "", filename: "master-catalog.csv", count: 0 };

    const rows = await db
      .select({
        masterCode: cabinets.masterCode,
        description: cabinets.description,
        category: cabinets.category,
        subCategory: cabinets.subCategory,
        width: cabinets.width,
        height: cabinets.height,
        depth: cabinets.depth,
        numberOfDoors: cabinets.numberOfDoors,
        numberOfDrawers: cabinets.numberOfDrawers,
        graphicType: cabinets.graphicType,
        linesWithSku: sql<number>`count(distinct ${distributorSkus.distributorId})`,
      })
      .from(cabinets)
      .leftJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
      .groupBy(cabinets.id)
      .orderBy(cabinets.category, cabinets.masterCode);

    const csv = buildCatalogCsv(rows as CatalogExportRow[]);
    const date = new Date().toISOString().slice(0, 10);
    return { csv, filename: `cabinet-dealz-master-catalog-${date}.csv`, count: rows.length };
  }),

  /**
   * Versioned, round-trip safe catalog file. One row identifies a master item,
   * all known aliases, and each active distributor that is eligible to carry
   * it. It intentionally excludes prices and detailed SKU/style records.
   */
  roundTripExport: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { csv: "", filename: "cabinet-dealz-distributor-connections.csv", count: 0 };

    const [masterRows, aliasRows, skuConnections, manualConnections] = await Promise.all([
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
      }).from(cabinets).orderBy(cabinets.category, cabinets.masterCode),
      db.select({ cabinetId: cabinetAliases.cabinetId, alias: cabinetAliases.alias }).from(cabinetAliases),
      db.select({ cabinetId: distributorSkus.cabinetId, distributorCode: distributors.code })
        .from(distributorSkus)
        .innerJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
        .where(and(eq(distributorSkus.isAvailable, true), eq(distributorSkus.isPublished, true), eq(distributorSkus.status, "approved"), eq(distributors.isActive, true))),
      db.select({ cabinetId: cabinetDistributorEligibility.cabinetId, distributorCode: distributors.code })
        .from(cabinetDistributorEligibility)
        .innerJoin(distributors, eq(cabinetDistributorEligibility.distributorId, distributors.id))
        .where(eq(distributors.isActive, true)),
    ]);

    const aliasesByCabinet = new Map<number, string[]>();
    const eligibleByCabinet = new Map<number, string[]>();
    const add = (map: Map<number, string[]>, cabinetId: number, value: string | null) => {
      if (!value?.trim()) return;
      map.set(cabinetId, [...(map.get(cabinetId) ?? []), value]);
    };
    for (const row of aliasRows) add(aliasesByCabinet, row.cabinetId, row.alias);
    for (const row of skuConnections) {
      if (row.cabinetId == null) continue;
      add(eligibleByCabinet, row.cabinetId, row.distributorCode);
    }
    for (const row of manualConnections) add(eligibleByCabinet, row.cabinetId, row.distributorCode);

    const csv = buildDistributorRoundTripCsv(masterRows.map((row) => ({
      templateVersion: "1",
      itemCode: row.masterCode,
      replacementMasterCode: null,
      aliases: [row.sku, row.vendorSku, row.altSku1, row.altSku2, row.altSku3, ...(aliasesByCabinet.get(row.id) ?? [])].filter((value): value is string => Boolean(value?.trim())),
      eligibleDistributorCodes: eligibleByCabinet.get(row.id) ?? [],
      description: row.description ?? "",
      category: row.category ?? "",
      subCategory: row.subCategory ?? "",
    })));
    const date = new Date().toISOString().slice(0, 10);
    return { csv, filename: `cabinet-dealz-distributor-connections-${date}.csv`, count: masterRows.length };
  }),

  /** Dry-run for the exact versioned download format. No writes occur here. */
  roundTripPreview: adminProcedure
    .input(z.object({ csv: z.string().min(1).max(2_000_000) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No database" });
      const parsed = parseDistributorRoundTripCsv(input.csv);
      if (parsed.errors.length > 0) return { ...parsed, rows: [], summary: { total: 0, matched: 0, masterCodesToReplace: 0, aliasesToAdd: 0, distributorLinksToAdd: 0 } };

      const allCabinets = await db.select({ id: cabinets.id, masterCode: cabinets.masterCode, sku: cabinets.sku, vendorSku: cabinets.vendorSku, altSku1: cabinets.altSku1, altSku2: cabinets.altSku2, altSku3: cabinets.altSku3 }).from(cabinets);
      const allAliases = await db.select({ id: cabinetAliases.id, cabinetId: cabinetAliases.cabinetId, alias: cabinetAliases.alias }).from(cabinetAliases);
      const activeDistributors = await db.select({ id: distributors.id, code: distributors.code }).from(distributors).where(eq(distributors.isActive, true));
      const cabinetByCode = new Map<string, { id: number; masterCode: string }>();
      for (const cabinet of allCabinets) {
        for (const code of [cabinet.masterCode, cabinet.sku, cabinet.vendorSku, cabinet.altSku1, cabinet.altSku2, cabinet.altSku3]) {
          if (code?.trim()) cabinetByCode.set(normalizeDistributorRoundTripCode(code), { id: cabinet.id, masterCode: cabinet.masterCode });
        }
      }
      for (const alias of allAliases) {
        const master = allCabinets.find((cabinet) => cabinet.id === alias.cabinetId);
        const aliasCode = normalizeDistributorRoundTripCode(alias.alias);
        if (master && aliasCode && !cabinetByCode.has(aliasCode)) cabinetByCode.set(aliasCode, { id: master.id, masterCode: master.masterCode });
      }
      const activeByCode = new Map(activeDistributors.map((distributor) => [normalizeDistributorRoundTripCode(distributor.code), distributor]));
      const currentLinks = await db.select({ cabinetId: cabinetDistributorEligibility.cabinetId, distributorId: cabinetDistributorEligibility.distributorId }).from(cabinetDistributorEligibility);
      const currentLinkKeys = new Set(currentLinks.map((row) => `${row.cabinetId}:${row.distributorId}`));
      const replacementOwners = new Map<string, number>();

      const rows = parsed.rows.map((row) => {
        const master = cabinetByCode.get(row.itemCode);
        const errors: string[] = [];
        if (!master) errors.push(`ItemCode ${row.itemCode} does not match a master code or known alias.`);
        const replacementMasterCode = row.replacementMasterCode;
        const replacesMasterCode = Boolean(master && replacementMasterCode && replacementMasterCode !== normalizeDistributorRoundTripCode(master.masterCode));
        if (master && replacementMasterCode && replacesMasterCode) {
          const occupied = cabinetByCode.get(replacementMasterCode);
          if (occupied && occupied.id !== master.id) errors.push(`ReplacementMasterCode ${replacementMasterCode} already belongs to ${occupied.masterCode}.`);
          const priorOwner = replacementOwners.get(replacementMasterCode);
          if (priorOwner !== undefined && priorOwner !== master.id) errors.push(`ReplacementMasterCode ${replacementMasterCode} is requested for more than one item.`);
          replacementOwners.set(replacementMasterCode, master.id);
        }
        const aliasConflicts = row.aliases.filter((alias) => {
          const matched = cabinetByCode.get(alias);
          return Boolean(matched && master && matched.id !== master.id);
        });
        if (aliasConflicts.length) errors.push(`Alias already belongs to another cabinet: ${aliasConflicts.join(", ")}.`);
        const unknownDistributors = row.eligibleDistributorCodes.filter((code) => !activeByCode.has(code));
        if (unknownDistributors.length) errors.push(`Unknown or inactive distributor code: ${unknownDistributors.join(", ")}.`);
        const distributorLinksToAdd = master
          ? row.eligibleDistributorCodes.filter((code) => {
              const distributor = activeByCode.get(code);
              return distributor && !currentLinkKeys.has(`${master.id}:${distributor.id}`);
            }).length
          : 0;
        return {
          rowNumber: row.rowNumber ?? 0,
          itemCode: row.itemCode,
          resolvedMasterCode: master?.masterCode ?? null,
          replacementMasterCode,
          replacesMasterCode,
          aliases: row.aliases,
          eligibleDistributorCodes: row.eligibleDistributorCodes,
          aliasesToAdd: master ? row.aliases.filter((alias) => !cabinetByCode.has(alias) && alias !== normalizeDistributorRoundTripCode(master.masterCode)).length : 0,
          distributorLinksToAdd,
          errors,
        };
      });
      return {
        errors: [],
        rows,
        summary: {
          total: rows.length,
          matched: rows.filter((row) => !row.errors.length).length,
          masterCodesToReplace: rows.filter((row) => row.replacesMasterCode).length,
          aliasesToAdd: rows.reduce((total, row) => total + row.aliasesToAdd, 0),
          distributorLinksToAdd: rows.reduce((total, row) => total + row.distributorLinksToAdd, 0),
        },
      };
    }),

  /** Apply only reviewed aliases and internal eligibility links. Prices never change here. */
  roundTripCommit: adminProcedure
    .input(z.object({ csv: z.string().min(1).max(2_000_000) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No database" });
      const parsed = parseDistributorRoundTripCsv(input.csv);
      if (parsed.errors.length) throw new TRPCError({ code: "BAD_REQUEST", message: parsed.errors.join(" ") });

      const preview = await (async () => {
        const allCabinets = await db.select({ id: cabinets.id, masterCode: cabinets.masterCode, sku: cabinets.sku, vendorSku: cabinets.vendorSku, altSku1: cabinets.altSku1, altSku2: cabinets.altSku2, altSku3: cabinets.altSku3 }).from(cabinets);
        const allAliases = await db.select({ id: cabinetAliases.id, cabinetId: cabinetAliases.cabinetId, alias: cabinetAliases.alias }).from(cabinetAliases);
        const activeDistributors = await db.select({ id: distributors.id, code: distributors.code }).from(distributors).where(eq(distributors.isActive, true));
        const cabinetByCode = new Map<string, { id: number; masterCode: string }>();
        for (const cabinet of allCabinets) for (const code of [cabinet.masterCode, cabinet.sku, cabinet.vendorSku, cabinet.altSku1, cabinet.altSku2, cabinet.altSku3]) if (code?.trim()) cabinetByCode.set(normalizeDistributorRoundTripCode(code), { id: cabinet.id, masterCode: cabinet.masterCode });
        for (const alias of allAliases) {
          const master = allCabinets.find((cabinet) => cabinet.id === alias.cabinetId);
          const aliasCode = normalizeDistributorRoundTripCode(alias.alias);
          if (master && aliasCode && !cabinetByCode.has(aliasCode)) cabinetByCode.set(aliasCode, { id: master.id, masterCode: master.masterCode });
        }
        return { cabinetByCode, allAliases, activeByCode: new Map(activeDistributors.map((distributor) => [normalizeDistributorRoundTripCode(distributor.code), distributor])) };
      })();
      const validationErrors: string[] = [];
      const replacementOwners = new Map<string, number>();
      for (const row of parsed.rows) {
        const master = preview.cabinetByCode.get(row.itemCode);
        if (!master) validationErrors.push(`Row ${row.rowNumber}: ItemCode ${row.itemCode} is not recognized.`);
        const replacementMasterCode = row.replacementMasterCode;
        if (master && replacementMasterCode && replacementMasterCode !== normalizeDistributorRoundTripCode(master.masterCode)) {
          const occupied = preview.cabinetByCode.get(replacementMasterCode);
          if (occupied && occupied.id !== master.id) validationErrors.push(`Row ${row.rowNumber}: replacement master code ${replacementMasterCode} belongs to ${occupied.masterCode}.`);
          const priorOwner = replacementOwners.get(replacementMasterCode);
          if (priorOwner !== undefined && priorOwner !== master.id) validationErrors.push(`Row ${row.rowNumber}: replacement master code ${replacementMasterCode} is requested more than once.`);
          replacementOwners.set(replacementMasterCode, master.id);
        }
        for (const alias of row.aliases) {
          const existing = preview.cabinetByCode.get(alias);
          if (existing && master && existing.id !== master.id) validationErrors.push(`Row ${row.rowNumber}: alias ${alias} belongs to another cabinet.`);
        }
        for (const code of row.eligibleDistributorCodes) if (!preview.activeByCode.has(code)) validationErrors.push(`Row ${row.rowNumber}: distributor ${code} is unknown or inactive.`);
      }
      if (validationErrors.length) throw new TRPCError({ code: "BAD_REQUEST", message: validationErrors.join(" ") });

      let aliasesAdded = 0;
      let distributorLinksAdded = 0;
      let masterCodesReplaced = 0;
      for (const row of parsed.rows) {
        const master = preview.cabinetByCode.get(row.itemCode)!;
        const replacementMasterCode = row.replacementMasterCode;
        if (replacementMasterCode && replacementMasterCode !== normalizeDistributorRoundTripCode(master.masterCode)) {
          const formerMasterCode = normalizeDistributorRoundTripCode(master.masterCode);
          const existingReplacementAlias = preview.allAliases.find((alias) => normalizeDistributorRoundTripCode(alias.alias) === replacementMasterCode && alias.cabinetId === master.id);
          if (existingReplacementAlias) await db.delete(cabinetAliases).where(eq(cabinetAliases.id, existingReplacementAlias.id));
          await db.insert(cabinetAliases)
            .values({ cabinetId: master.id, alias: formerMasterCode })
            .onDuplicateKeyUpdate({ set: { cabinetId: master.id } });
          await db.update(cabinets).set({ masterCode: replacementMasterCode }).where(eq(cabinets.id, master.id));
          master.masterCode = replacementMasterCode;
          preview.cabinetByCode.set(formerMasterCode, master);
          preview.cabinetByCode.set(replacementMasterCode, master);
          masterCodesReplaced += 1;
        }
        for (const alias of row.aliases) {
          if (alias === normalizeDistributorRoundTripCode(master.masterCode) || preview.cabinetByCode.has(alias)) continue;
          await db.insert(cabinetAliases).values({ cabinetId: master.id, alias });
          preview.cabinetByCode.set(alias, master);
          aliasesAdded += 1;
        }
        for (const distributorCode of row.eligibleDistributorCodes) {
          const distributor = preview.activeByCode.get(distributorCode)!;
          const existing = await db.select({ id: cabinetDistributorEligibility.id }).from(cabinetDistributorEligibility).where(and(eq(cabinetDistributorEligibility.cabinetId, master.id), eq(cabinetDistributorEligibility.distributorId, distributor.id))).limit(1);
          if (existing.length) continue;
          await db.insert(cabinetDistributorEligibility).values({ cabinetId: master.id, distributorId: distributor.id, source: "Round-trip catalog import" });
          distributorLinksAdded += 1;
        }
      }
      return { rowsImported: parsed.rows.length, masterCodesReplaced, aliasesAdded, distributorLinksAdded };
    }),

  /** Active distributors (lines) for the import picker + branding editor. */
  adminList: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({
        id: distributors.id,
        code: distributors.code,
        name: distributors.name,
        initials: distributors.initials,
        brandName: distributors.brandName,
        brandInitials: distributors.brandInitials,
        whiteLabel: distributors.whiteLabel,
        displayMode: distributors.displayMode,
        seriesName: distributors.seriesName,
        isActive: distributors.isActive,
        leadTimeDays: distributors.leadTimeDays,
        warehouseZips: distributors.warehouseZips,
        orderEmail: distributors.orderEmail,
        ccEmails: distributors.ccEmails,
        fulfillmentMode: distributors.fulfillmentMode,
        netsuiteAccountId: distributors.netsuiteAccountId,
        pickupEnabled: distributors.pickupEnabled,
        pickupZip: distributors.pickupZip,
        pickupAddress: distributors.pickupAddress,
        pickupRadiusMiles: distributors.pickupRadiusMiles,
      })
      .from(distributors)
      .orderBy(distributors.name);
  }),

  /**
   * Update the fulfillment / order-routing + pickup settings for one supply
   * line. All fields optional so the admin form can patch a subset. Emails are
   * lightly validated; blank strings clear the field.
   */
  updateFulfillment: adminProcedure
    .input(
      z.object({
        distributorId: z.number().int().positive(),
        orderEmail: z.string().trim().max(320).optional(),
        ccEmails: z.string().trim().max(1024).optional(),
        fulfillmentMode: z.enum(["email", "netsuite_email", "netsuite_api"]).optional(),
        netsuiteAccountId: z.string().trim().max(64).optional(),
        pickupEnabled: z.boolean().optional(),
        pickupZip: z.string().trim().max(16).optional(),
        pickupAddress: z.string().trim().max(512).optional(),
        pickupRadiusMiles: z.number().int().min(1).max(1000).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No database" });

      const normEmail = (v: string | undefined): string | null | undefined => {
        if (v === undefined) return undefined;
        const t = v.trim();
        return t.length ? t : null;
      };
      // Validate a plain single email when provided (non-empty).
      const oe = normEmail(input.orderEmail);
      if (typeof oe === "string" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(oe)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Order email is not a valid address." });
      }

      const patch: Partial<typeof distributors.$inferInsert> = {};
      if (oe !== undefined) patch.orderEmail = oe;
      if (input.ccEmails !== undefined) patch.ccEmails = normEmail(input.ccEmails) ?? null;
      if (input.fulfillmentMode !== undefined) patch.fulfillmentMode = input.fulfillmentMode;
      if (input.netsuiteAccountId !== undefined)
        patch.netsuiteAccountId = normEmail(input.netsuiteAccountId) ?? null;
      if (input.pickupEnabled !== undefined) patch.pickupEnabled = input.pickupEnabled;
      if (input.pickupZip !== undefined) patch.pickupZip = input.pickupZip.trim() || null;
      if (input.pickupAddress !== undefined) patch.pickupAddress = input.pickupAddress.trim() || null;
      if (input.pickupRadiusMiles !== undefined) patch.pickupRadiusMiles = input.pickupRadiusMiles;

      if (Object.keys(patch).length === 0) return { id: input.distributorId, updated: false };
      await db.update(distributors).set(patch).where(eq(distributors.id, input.distributorId));
      return { id: input.distributorId, updated: true };
    }),

  /**
   * White-label a cabinet line from the Admin panel (no direct DB edits).
   */
  setBranding: adminProcedure
    .input(
      z.object({
        distributorId: z.number().int().positive(),
        displayMode: z.enum(["neutral", "branded", "series"]),
        label: z.string().trim().min(1).max(128),
        initials: z.string().trim().max(8).optional(),
        seriesName: z.string().trim().max(128).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No database" });

      const [row] = await db
        .select({ id: distributors.id, name: distributors.name })
        .from(distributors)
        .where(eq(distributors.id, input.distributorId))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Line not found" });

      const initials =
        (input.initials && input.initials.trim()) ||
        input.label.trim().slice(0, 2).toUpperCase();

      const patch: Partial<typeof distributors.$inferInsert> = {
        displayMode: input.displayMode,
      };

      if (input.displayMode === "branded") {
        patch.brandName = input.label.trim();
        patch.brandInitials = initials;
        patch.whiteLabel = false;
      } else if (input.displayMode === "series") {
        patch.seriesName = input.label.trim();
        patch.whiteLabel = true;
      } else {
        patch.name = input.label.trim();
        patch.initials = initials;
        patch.whiteLabel = true;
      }

      await db.update(distributors).set(patch).where(eq(distributors.id, input.distributorId));
      return { id: input.distributorId, ...patch };
    }),

  /**
   * Toggle a cabinet line on or off. When isActive = false the line's SKUs are
   * hidden from the storefront and the design tool; flip back to true to restore.
   */
  setActive: adminProcedure
    .input(
      z.object({
        distributorId: z.number().int().positive(),
        isActive: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No database" });
      await db
        .update(distributors)
        .set({ isActive: input.isActive })
        .where(eq(distributors.id, input.distributorId));
      return { id: input.distributorId, isActive: input.isActive };
    }),

  /** Door styles for a given distributor (used to map pricing rows to a style). */
  adminStyles: adminProcedure
    .input(z.object({ distributorId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select({
          id: doorStyles.id,
          styleCode: doorStyles.styleCode,
          ourName: doorStyles.ourName,
        })
        .from(doorStyles)
        .where(eq(doorStyles.distributorId, input.distributorId))
        .orderBy(doorStyles.ourName);
    }),

  /** The CSV template distributors fill in. */
  importTemplate: adminProcedure.query(() => ({ csv: IMPORT_TEMPLATE_CSV })),

  /**
   * Dry-run: parse the pasted CSV, validate it, and diff each row against the
   * existing catalog so the admin sees exactly what will be created/updated.
   *
   * Cabinet lookup: the row's code is matched against masterCode first, then
   * against all alias fields (sku, vendorSku, altSku1/2/3).
   *
   * Door style lookup: the row's styleCode value is matched against the
   * selected distributor's door styles (styleCode, ourName, distributorName).
   * If styleId is provided in input it overrides per-row style resolution.
   *
   * No database writes happen here.
   */
  importPreview: adminProcedure
    .input(
      z.object({
        distributorId: z.number(),
        /** Override style for all rows. If omitted, each row's styleCode column is used. */
        styleId: z.number().optional(),
        csv: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const parsed = parseDistributorCsv(input.csv);
      const { fatalErrors, rowResults } = validateImport(parsed);
      const hasPricing =
        parsed.columns.includes("listPrice") ||
        parsed.columns.includes("yourCost");
      const hasStyleCol = parsed.columns.includes("styleCode");

      // If pricing is present and no style override and no styleCode column, warn.
      if (hasPricing && !input.styleId && !hasStyleCol) {
        fatalErrors.push(
          "Pricing columns detected — either add a Door Style column to the spreadsheet or choose a door style from the dropdown."
        );
      }

      // Build alias map for all codes in the file.
      const codes = parsed.rows
        .map((r) => (r.cells.masterCode ?? "").trim())
        .filter(Boolean);
      const aliasMap = await buildAliasMap(db, codes);

      // Build style map for this distributor (for per-row style resolution).
      const styleMap = await buildStyleMap(db, input.distributorId);

      const rows: PreviewRow[] = parsed.rows.map((row, i) => {
        const v = rowResults[i];
        const code = (row.cells.masterCode ?? "").trim();
        const found = aliasMap.get(code.toUpperCase());
        const matchHow: PreviewRow["matchHow"] = !found
          ? "none"
          : found.masterCode.toUpperCase() === code.toUpperCase()
          ? "exact"
          : "alias";

        // Resolve door style for this row.
        let resolvedStyleId: number | null = input.styleId ?? null;
        let resolvedStyleName: string | null = null;
        if (!resolvedStyleId && row.cells.styleCode) {
          const styleHit = styleMap.get(row.cells.styleCode.toUpperCase());
          if (styleHit) {
            resolvedStyleId = styleHit.id;
            resolvedStyleName = styleHit.ourName;
          }
        } else if (resolvedStyleId) {
          // Find the name for the override style.
          const styleEntries = Array.from(styleMap.values());
          const hit = styleEntries.find((s) => s.id === resolvedStyleId);
          if (hit) resolvedStyleName = hit.ourName;
        }

        const fields: string[] = [];
        if (row.cells.description) fields.push("description");
        if (normalizeCategory(row.cells.category)) fields.push("category");
        if (row.cells.subCategory) fields.push("subCategory");
        if (parseDimension(row.cells.width)) fields.push("width");
        if (parseDimension(row.cells.height)) fields.push("height");
        if (parseDimension(row.cells.depth)) fields.push("depth");

        const priceTouched = hasPricing && Boolean(resolvedStyleId) && Boolean(found);

        let action: PreviewRow["action"];
        if (!v.ok) action = "error";
        else if (!found) action = "create-info";
        else if (fields.length > 0) action = "update-info";
        else action = "price-only";

        // Creating a brand-new cabinet requires a description + a category.
        const errors = [...v.errors];
        if (action === "create-info") {
          if (!row.cells.description)
            errors.push("New item needs a Description to be created.");
          if (!normalizeCategory(row.cells.category))
            errors.push(
              "New item needs a valid Category (Base/Wall/Tall/ADA/Vanity/Accessory)."
            );
        }
        const warnings = [...(v.warnings ?? [])];
        if (hasPricing && !found && v.ok)
          warnings.push(
            "Pricing skipped: cabinet not found in catalog (will be created first, then prices applied on next import)."
          );
        if (hasPricing && found && !resolvedStyleId)
          warnings.push(
            row.cells.styleCode
              ? `Door style "${row.cells.styleCode}" not found for this distributor — pricing skipped.`
              : "No door style specified for this row — pricing skipped."
          );
        if (matchHow === "alias")
          warnings.push(`Matched via alias → platform code: ${found!.masterCode}`);

        return {
          rowNumber: row.rowNumber,
          masterCode: code,
          resolvedMasterCode: found?.masterCode ?? null,
          matchHow,
          resolvedStyleName,
          action: errors.length ? "error" : action,
          description: row.cells.description ?? found?.description ?? null,
          category:
            normalizeCategory(row.cells.category) ?? found?.category ?? null,
          fields,
          priceTouched,
          errors,
          warnings,
        };
      });

      const summary = {
        total: rows.length,
        toCreate: rows.filter((r) => r.action === "create-info").length,
        toUpdate: rows.filter((r) => r.action === "update-info").length,
        priceOnly: rows.filter((r) => r.action === "price-only").length,
        errors: rows.filter((r) => r.action === "error").length,
        aliasMatched: rows.filter((r) => r.matchHow === "alias").length,
      };

      return {
        columns: parsed.columns,
        unknownHeaders: parsed.unknownHeaders,
        hasPricing,
        hasStyleCol,
        fatalErrors,
        summary,
        rows,
      };
    }),

  /**
   * Commit the import: upsert cabinet info (create new / update existing) and,
   * when a style is resolvable (per-row styleCode column or styleId override),
   * upsert the per-style SKU price for the chosen distributor.
   *
   * Cabinet lookup uses alias matching (sku, vendorSku, altSku1/2/3, masterCode).
   * Door style lookup uses the row's styleCode column against the distributor's styles,
   * falling back to the styleId override if provided.
   *
   * Rows with validation errors are skipped.
   */
  importCommit: adminProcedure
    .input(
      z.object({
        distributorId: z.number(),
        /** Override style for all rows. If omitted, each row's styleCode column is used. */
        styleId: z.number().optional(),
        csv: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const dist = await db
        .select({ id: distributors.id })
        .from(distributors)
        .where(eq(distributors.id, input.distributorId))
        .limit(1);
      if (dist.length === 0)
        throw new TRPCError({ code: "NOT_FOUND", message: "Unknown distributor." });

      const parsed = parseDistributorCsv(input.csv);
      const { rowResults } = validateImport(parsed);
      const hasPricing =
        parsed.columns.includes("listPrice") ||
        parsed.columns.includes("yourCost");

      // Build lookup maps once.
      const codes = parsed.rows
        .map((r) => (r.cells.masterCode ?? "").trim())
        .filter(Boolean);
      const aliasMap = await buildAliasMap(db, codes);
      const styleMap = await buildStyleMap(db, input.distributorId);

      let created = 0;
      let updated = 0;
      let priced = 0;
      let skipped = 0;

      for (let i = 0; i < parsed.rows.length; i++) {
        const row = parsed.rows[i];
        const v = rowResults[i];
        const code = (row.cells.masterCode ?? "").trim();
        if (!v.ok || !code) {
          skipped++;
          continue;
        }

        // Resolve cabinet via alias map.
        const found = aliasMap.get(code.toUpperCase());

        // Resolve door style: per-row column first, then override.
        let resolvedStyleId: number | null = input.styleId ?? null;
        if (!resolvedStyleId && row.cells.styleCode) {
          const styleHit = styleMap.get(row.cells.styleCode.toUpperCase());
          if (styleHit) resolvedStyleId = styleHit.id;
        }

        const category = normalizeCategory(row.cells.category);
        const width = parseDimension(row.cells.width);
        const height = parseDimension(row.cells.height);
        const depth = parseDimension(row.cells.depth);

        let cabinetId: number;
        if (!found) {
          // Create requires description + category.
          if (!row.cells.description || !category) {
            skipped++;
            continue;
          }
          const res = await db.insert(cabinets).values({
            masterCode: code,
            description: row.cells.description,
            descriptionSource: "Distributor Import",
            category,
            subCategory: row.cells.subCategory ?? null,
            width: width != null ? String(width) : null,
            height: height != null ? String(height) : null,
            depth: depth != null ? String(depth) : null,
            isActive: true,
          });
          cabinetId = (res as unknown as [{ insertId: number }])[0].insertId;
          // Add to alias map so subsequent rows with the same code resolve correctly.
          aliasMap.set(code.toUpperCase(), { id: cabinetId, masterCode: code, description: row.cells.description, category });
          created++;
        } else {
          cabinetId = found.id;
          const patch: Record<string, unknown> = {};
          if (row.cells.description) patch.description = row.cells.description;
          if (category) patch.category = category;
          if (row.cells.subCategory) patch.subCategory = row.cells.subCategory;
          if (width != null) patch.width = String(width);
          if (height != null) patch.height = String(height);
          if (depth != null) patch.depth = String(depth);
          if (Object.keys(patch).length > 0) {
            await db
              .update(cabinets)
              .set(patch)
              .where(eq(cabinets.id, cabinetId));
            updated++;
          }
        }

        // Optional pricing upsert (needs a resolved style).
        if (hasPricing && resolvedStyleId) {
          const listPrice = parseMoney(row.cells.listPrice);
          const yourCost = parseMoney(row.cells.yourCost);
          if (
            (listPrice != null && !Number.isNaN(listPrice)) ||
            (yourCost != null && !Number.isNaN(yourCost))
          ) {
            const sku = await db
              .select({ id: distributorSkus.id })
              .from(distributorSkus)
              .where(
                and(
                  eq(distributorSkus.cabinetId, cabinetId),
                  eq(distributorSkus.distributorId, input.distributorId),
                  eq(distributorSkus.styleId, resolvedStyleId)
                )
              )
              .limit(1);
            const pricePatch: Record<string, unknown> = {};
            if (listPrice != null && !Number.isNaN(listPrice))
              pricePatch.listPrice = String(listPrice);
            if (yourCost != null && !Number.isNaN(yourCost))
              pricePatch.yourCost = String(yourCost);
            if (sku.length > 0) {
              await db
                .update(distributorSkus)
                .set(pricePatch)
                .where(eq(distributorSkus.id, sku[0].id));
              priced++;
            } else {
              await db.insert(distributorSkus).values({
                cabinetId,
                distributorId: input.distributorId,
                styleId: resolvedStyleId,
                platformSku: `${found?.masterCode ?? code}-S${resolvedStyleId}-D${input.distributorId}`,
                distributorSku: code,
                listPrice:
                  listPrice != null && !Number.isNaN(listPrice)
                    ? String(listPrice)
                    : null,
                yourCost:
                  yourCost != null && !Number.isNaN(yourCost)
                    ? String(yourCost)
                    : null,
                isAvailable: true,
                isPublished: false, // new prices start unpublished for review
              });
              priced++;
            }
          }
        }
      }

      return { created, updated, priced, skipped };
    }),

  // ─── Quick-create helpers ──────────────────────────────────────────────────
  addDistributor: adminProcedure
    .input(z.object({ name: z.string(), brandName: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const code = input.name.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 8);
      const [result] = await db.insert(distributors).values({
        name: input.name,
        code,
        initials: code.slice(0, 2),
        brandName: input.brandName ?? input.name,
        costMultiplier: "0.30",
        baseMultiplier: "0.30",
      });
      return { id: (result as any).insertId as number, name: input.name, brandName: input.brandName ?? input.name, ok: true };
    }),

  addDoorStyle: adminProcedure
    .input(z.object({ distributorId: z.number(), ourName: z.string(), styleCode: z.string(), distributorName: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(doorStyles).values({
        distributorId: input.distributorId,
        ourName: input.ourName,
        styleCode: input.styleCode,
        distributorName: input.distributorName ?? input.ourName,
        isActive: true,
      });
      return { id: (result as any).insertId as number, ourName: input.ourName, ok: true };
    }),

  // ─── XLSX column-mapping import ─────────────────────────────────────────────

  /**
   * Step 1: Parse an uploaded XLSX/CSV file and return sheet names + detected
   * column headers with auto-suggested roles.
   *
   * Role detection heuristics (case-insensitive):
   *   sku       → Item Code, SKU, Code, Part #, Model, Item
   *   category  → Category
   *   subCat    → Sub-Category, Sub Category, SubCategory
   *   description → Description, Desc, Name
   *   dimensions  → Dimensions, Dim, Size, W×H×D
   *   priceStyle  → any column whose header contains a style code fragment
   *                 (e.g. "ASP\nAspen White" → styleCode=ASP, label=Aspen White)
   *   ignore    → #, Min Price, Max Price, Available Styles, Notes
   */
  parseXlsxColumns: adminProcedure
    .input(z.object({
      fileBase64: z.string(),
      filename: z.string(),
      distributorId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Decode base64 → buffer → workbook
      const buf = Buffer.from(input.fileBase64, "base64");
      const wb = XLSX.read(buf, { type: "buffer" });

      // Load this distributor's door styles for style-column matching
      const distStyles = await db
        .select({ id: doorStyles.id, styleCode: doorStyles.styleCode, ourName: doorStyles.ourName, distributorName: doorStyles.distributorName })
        .from(doorStyles)
        .where(eq(doorStyles.distributorId, input.distributorId));

      // Build a set of known style codes (upper) for quick lookup
      const styleCodeSet = new Set(distStyles.map((s) => s.styleCode.toUpperCase()));

      const IGNORE_PATTERNS = /^(#|min price|max price|available styles|notes?)$/i;
      const SKU_PATTERNS = /item.?code|sku|part.?#|model|^item$|^code$|^sku$/i;
      const CAT_PATTERNS = /^category$/i;
      const SUBCAT_PATTERNS = /sub.?cat/i;
      const DESC_PATTERNS = /description|^desc$|^name$/i;
      const DIM_PATTERNS = /dimension|^dim$|^size$|w.?h.?d/i;
      const WIDTH_PATTERNS = /^width$|^w$|^wd$/i;
      const HEIGHT_PATTERNS = /^height$|^h$|^ht$/i;
      const DEPTH_PATTERNS = /^depth$|^d$|^dp$/i;
      const ASSEMBLE_PATTERNS = /^assemble$|^assembled$|^assembly$/i;
      const WEIGHT_PATTERNS = /^weight$|^wt$|^lbs?$|^weight.?lbs?$/i;

      const sheets = wb.SheetNames.map((sheetName) => {
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" }) as string[][];
        if (rows.length === 0) return { name: sheetName, headers: [], columns: [] };

        const rawHeaders = rows[0].map((h) => String(h ?? ""));
        const sampleRows = rows.slice(1, 4);

        const columns = rawHeaders.map((rawHeader, colIdx) => {
          // Normalize: strip newlines, trim
          const normalized = rawHeader.replace(/\n/g, " ").trim();
          const upper = normalized.toUpperCase();

          // Detect role
          let role: string = "ignore";
          let styleId: number | null = null;
          let styleCode: string | null = null;
          let styleLabel: string | null = null;

          if (IGNORE_PATTERNS.test(normalized)) {
            role = "ignore";
          } else if (SKU_PATTERNS.test(normalized)) {
            role = "sku";
          } else if (CAT_PATTERNS.test(normalized)) {
            role = "category";
          } else if (SUBCAT_PATTERNS.test(normalized)) {
            role = "subCategory";
          } else if (DESC_PATTERNS.test(normalized)) {
            role = "description";
          } else if (DIM_PATTERNS.test(normalized)) {
            role = "dimensions";
          } else if (WIDTH_PATTERNS.test(normalized)) {
            role = "dimWidth";
          } else if (HEIGHT_PATTERNS.test(normalized)) {
            role = "dimHeight";
          } else if (DEPTH_PATTERNS.test(normalized)) {
            role = "dimDepth";
          } else if (ASSEMBLE_PATTERNS.test(normalized)) {
            role = "assemble";
          } else if (WEIGHT_PATTERNS.test(normalized)) {
            role = "weight";
          } else {
            // Check if this header contains a known style code
            // Header format: "ASP\nAspen White" or "ASP - Aspen White" or just "ASP"
            const parts = rawHeader.split(/\n|\s*[-–]\s*/);
            const firstPart = (parts[0] ?? "").trim().toUpperCase();
            const restPart = parts.slice(1).join(" ").trim();

            if (styleCodeSet.has(firstPart)) {
              const match = distStyles.find((s) => s.styleCode.toUpperCase() === firstPart);
              if (match) {
                role = "priceStyle";
                styleId = match.id;
                styleCode = match.styleCode;
                styleLabel = match.ourName || match.distributorName;
              }
            } else {
              // Try matching against distributorName
              const nameMatch = distStyles.find(
                (s) =>
                  s.distributorName.toUpperCase() === upper ||
                  s.ourName.toUpperCase() === upper
              );
              if (nameMatch) {
                role = "priceStyle";
                styleId = nameMatch.id;
                styleCode = nameMatch.styleCode;
                styleLabel = nameMatch.ourName || nameMatch.distributorName;
              }
            }
          }

          // Sample values from first 3 data rows
          const sampleValues = sampleRows
            .map((r) => String(r[colIdx] ?? "").trim())
            .filter(Boolean)
            .slice(0, 3);

          return {
            colIdx,
            rawHeader,
            label: normalized,
            role,
            styleId,
            styleCode,
            styleLabel,
            sampleValues,
          };
        });

        return { name: sheetName, headers: rawHeaders, columns };
      });

      // Also return the list of distributor styles so the UI can let admin
      // manually assign unmatched columns to a style.
      return {
        sheets,
        distributorStyles: distStyles.map((s) => ({
          id: s.id,
          styleCode: s.styleCode,
          ourName: s.ourName,
          distributorName: s.distributorName,
        })),
      };
    }),

  /**
   * Step 2: Commit the XLSX import using the admin-confirmed column mapping.
   *
   * columnMapping is an array of { colIdx, role, styleId? } objects.
   * Roles: "sku" | "category" | "subCategory" | "description" | "dimensions" | "priceStyle" | "ignore"
   *
   * For each data row:
   *   1. Extract the SKU from the sku column.
   *   2. Resolve the cabinet via alias map (masterCode, sku, vendorSku, altSku1-3).
   *   3. If not found and description+category present → create new cabinet.
   *   4. For each priceStyle column with a non-null, non-N/A value → upsert distributor_skus row.
   *      Upsert = update if (cabinetId, distributorId, styleId) exists, else insert.
   *
   * dryRun=true returns a preview without writing to DB.
   */
  importWithMapping: adminProcedure
    .input(z.object({
      fileBase64: z.string(),
      filename: z.string(),
      sheetName: z.string(),
      distributorId: z.number(),
      columnMapping: z.array(z.object({
        colIdx: z.number(),
        role: z.enum(["sku", "category", "subCategory", "description", "dimensions", "dimWidth", "dimHeight", "dimDepth", "priceStyle", "assemble", "weight", "ignore"]),
        styleId: z.number().optional(),
      })),
      // Admin-selected cabinet overrides: rowNum (1-based, same as previewRows.rowNum) → cabinetId
      matchOverrides: z.record(z.string(), z.number()).optional(),
      // Admin inline cell edits: "rowNum:field" → corrected string value
      // field is one of: "dimensions", "price:<styleCode>"
      cellEdits: z.record(z.string(), z.string()).optional(),
      dryRun: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Decode and parse XLSX
      const buf = Buffer.from(input.fileBase64, "base64");
      const wb = XLSX.read(buf, { type: "buffer" });
      const ws = wb.Sheets[input.sheetName];
      if (!ws) throw new TRPCError({ code: "BAD_REQUEST", message: `Sheet "${input.sheetName}" not found.` });

      const allRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, defval: null }) as (string | number | null)[][];
      const dataRows = allRows.slice(1).filter((r) => r.some((c) => c != null && String(c).trim() !== ""));

      // Load this distributor's door styles for display labels in preview rows
      const distStyles = await db
        .select({ id: doorStyles.id, styleCode: doorStyles.styleCode, ourName: doorStyles.ourName })
        .from(doorStyles)
        .where(eq(doorStyles.distributorId, input.distributorId));

      // Build column index maps
      const skuCol = input.columnMapping.find((c) => c.role === "sku")?.colIdx ?? -1;
      const catCol = input.columnMapping.find((c) => c.role === "category")?.colIdx ?? -1;
      const subCatCol = input.columnMapping.find((c) => c.role === "subCategory")?.colIdx ?? -1;
      const descCol = input.columnMapping.find((c) => c.role === "description")?.colIdx ?? -1;
      const dimCol = input.columnMapping.find((c) => c.role === "dimensions")?.colIdx ?? -1;
      const dimWidthCol = input.columnMapping.find((c) => c.role === "dimWidth")?.colIdx ?? -1;
      const dimHeightCol = input.columnMapping.find((c) => c.role === "dimHeight")?.colIdx ?? -1;
      const dimDepthCol = input.columnMapping.find((c) => c.role === "dimDepth")?.colIdx ?? -1;
      const assembleCol = input.columnMapping.find((c) => c.role === "assemble")?.colIdx ?? -1;
      const weightCol = input.columnMapping.find((c) => c.role === "weight")?.colIdx ?? -1;
      const priceCols = input.columnMapping.filter((c) => c.role === "priceStyle" && c.styleId != null);
      // Build override map: rowNum (string key from z.record) → cabinetId
      const overrideMap = new Map<number, number>();
      for (const [k, v] of Object.entries(input.matchOverrides ?? {})) {
        overrideMap.set(Number(k), v);
      }
      // Build cell-edit map: "rowNum:field" → corrected string value
      const cellEditMap = new Map<string, string>();
      for (const [k, v] of Object.entries(input.cellEdits ?? {})) {
        cellEditMap.set(k, v);
      }

      // SKU-prefix → category inference (used when no category column is present)
      function inferCategoryFromSku(sku: string): string | null {
        const u = sku.toUpperCase();
        if (u.startsWith("ADA-")) return "ADA";
        if (u.startsWith("3VDB") || u.startsWith("2VDB") || u.startsWith("VDB") || u.startsWith("VS") || u.startsWith("VSD") || u.startsWith("WD")) return "Vanity";
        if (/^(W|AW|BW|EW|OW|UW)\d/.test(u)) return "Wall";
        if (/^(T|P|U|TP)\d/.test(u) || u.startsWith("TALL") || u.startsWith("PANTRY") || u.startsWith("UTIL")) return "Tall";
        if (/^(B|DB|BBC|BEC|BES|BFH|BT|SB|SINK|CB|FB|LB|RB|OB|UB)\d/.test(u) || /^(2DB|3DB|4DB)/.test(u)) return "Base";
        return null;
      }

      // Extract dimensions embedded in description: "12"W x 34-1/2"H x 24"D"
      function parseDimsFromDesc(desc: string | null | undefined): { width: string | null; height: string | null; depth: string | null } {
        if (!desc) return { width: null, height: null, depth: null };
        // Match patterns like: 12"W x 34-1/2"H x 24"D  or  12W x 34.5H x 24D
        const m = desc.match(/(\d[\d\s\-\/\.]*?)(?:")?\s*W\s*[xX×]\s*(\d[\d\s\-\/\.]*?)(?:")?\s*H\s*[xX×]\s*(\d[\d\s\-\/\.]*?)(?:")?\s*D/i);
        if (m) return { width: m[1].trim(), height: m[2].trim(), depth: m[3].trim() };
        return { width: null, height: null, depth: null };
      }

      if (skuCol === -1) throw new TRPCError({ code: "BAD_REQUEST", message: "No SKU column mapped." });

      // Category normalisation: built-in map + DB aliases (distributor-specific overrides global)
      const BUILTIN_CAT_MAP: Record<string, string> = {
        "wall cabinets": "Wall",
        "wall": "Wall",
        "upper cabinets": "Wall",
        "upper": "Wall",
        "uppers": "Wall",
        "base cabinets": "Base",
        "base": "Base",
        "lower cabinets": "Base",
        "lower": "Base",
        "lowers": "Base",
        "tall cabinets": "Tall",
        "tall": "Tall",
        "pantry": "Tall",
        "pantry cabinets": "Tall",
        "utility": "Tall",
        "utility cabinets": "Tall",
        "oven cabinets": "Tall",
        "vanity": "Vanity",
        "vanity cabinets": "Vanity",
        "bathroom": "Vanity",
        "ada": "ADA",
        "ada cabinets": "ADA",
        "accessory": "Accessory",
        "accessories": "Accessory",
        "trim": "Accessory",
        "molding": "Accessory",
        "moulding": "Accessory",
        "corner": "Corner",
        "corner cabinets": "Corner",
        "specialty": "Specialty",
        "glass door": "Accessory",
        "glass doors": "Accessory",
      };
      // Load DB aliases (global ones where distributorId IS NULL, plus distributor-specific)
      const dbAliasRows = await db
        .select({ rawCategory: categoryAliases.rawCategory, platformCategory: categoryAliases.platformCategory, distributorId: categoryAliases.distributorId })
        .from(categoryAliases);
      // Build merged map: built-in first, then global DB aliases, then distributor-specific (highest priority)
      const CAT_MAP: Record<string, string> = { ...BUILTIN_CAT_MAP };
      for (const row of dbAliasRows.filter((r) => r.distributorId === null)) {
        CAT_MAP[row.rawCategory.toLowerCase().trim()] = row.platformCategory;
      }
      for (const row of dbAliasRows.filter((r) => r.distributorId === input.distributorId)) {
        CAT_MAP[row.rawCategory.toLowerCase().trim()] = row.platformCategory;
      }
      // Track which raw category strings couldn't be normalised (for preview UI)
      const unknownCategories = new Set<string>();
      function normalCat(raw: string | null | undefined): string | null {
        if (!raw) return null;
        const key = raw.toLowerCase().trim();
        const mapped = CAT_MAP[key] ?? null;
        if (!mapped && raw.trim()) unknownCategories.add(raw.trim());
        return mapped;
      }

      // Parse "9x30x12" or "9 x 30 x 12" → { width, height, depth }
      function parseDims(raw: string | null | undefined): { width: string | null; height: string | null; depth: string | null } {
        if (!raw) return { width: null, height: null, depth: null };
        const parts = String(raw).split(/[x×\s]+/).map((p) => p.trim()).filter(Boolean);
        return {
          width: parts[0] ?? null,
          height: parts[1] ?? null,
          depth: parts[2] ?? null,
        };
      }

      // Collect all SKU codes to build alias map
      const codes = dataRows
        .map((r) => String(r[skuCol] ?? "").trim())
        .filter(Boolean);
      const aliasMap = await buildAliasMap(db, codes);

      let created = 0;
      let updated = 0;
      let priced = 0;
      let skipped = 0;
      let aliasMatched = 0;
      const unmatchedCodes: string[] = [];
      const previewRows: Array<{
        rowNum: number;
        code: string;
        resolvedCode: string | null;
        matchHow: string;
        action: string;
        stylesPriced: number;
        warnings: string[];
        // Validation fields
        severity: "ok" | "warning" | "error";
        issues: Array<{ field: string; message: string; severity: "warning" | "error" }>;
        dimsParsed: boolean;
        missingPriceCount: number;
        invalidPriceCount: number;
        stylePrices: Array<{ styleId: number; styleCode: string; price: number | null; raw: string; valid: boolean }>;
      }> = [];

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const code = String(row[skuCol] ?? "").trim();
        if (!code) { skipped++; continue; }

        // Check for admin override first
        const rowNum = i + 2;
        const overrideCabinetId = overrideMap.get(rowNum);
        let found = aliasMap.get(code.toUpperCase());
        let matchHow: string;
        if (overrideCabinetId != null) {
          // Admin manually selected a cabinet — look it up
          const overrideRow = await db.select({ id: cabinets.id, masterCode: cabinets.masterCode, description: cabinets.description, category: cabinets.category }).from(cabinets).where(eq(cabinets.id, overrideCabinetId)).limit(1);
          if (overrideRow.length > 0) {
            found = overrideRow[0] as typeof found;
            matchHow = "override";
          } else {
            matchHow = !found ? "none" : found.masterCode.toUpperCase() === code.toUpperCase() ? "exact" : "alias";
          }
        } else {
          matchHow = !found ? "none" : found.masterCode.toUpperCase() === code.toUpperCase() ? "exact" : "alias";
        }
        if (matchHow === "alias") aliasMatched++;

        const rawCat = catCol >= 0 ? String(row[catCol] ?? "").trim() : null;
        const description = descCol >= 0 ? String(row[descCol] ?? "").trim() || null : null;
        // Category: explicit column first, then SKU-prefix inference
        const category = normalCat(rawCat) ?? inferCategoryFromSku(code);
        const subCategory = subCatCol >= 0 ? String(row[subCatCol] ?? "").trim() || null : null;
        // Dimensions: explicit dim column first, then extract from description
        // Apply admin cell edit override for dimensions if present
        const dimCellEdit = cellEditMap.get(`${rowNum}:dimensions`);
        const dims = dimCellEdit
          ? parseDims(dimCellEdit)
          : dimCol >= 0
          ? parseDims(String(row[dimCol] ?? ""))
          : (dimWidthCol >= 0 || dimHeightCol >= 0 || dimDepthCol >= 0)
          ? {
              width: dimWidthCol >= 0 ? String(row[dimWidthCol] ?? "").trim() || null : null,
              height: dimHeightCol >= 0 ? String(row[dimHeightCol] ?? "").trim() || null : null,
              depth: dimDepthCol >= 0 ? String(row[dimDepthCol] ?? "").trim() || null : null,
            }
          : parseDimsFromDesc(description);
        // Assemble flag
        const assembleVal = assembleCol >= 0 ? String(row[assembleCol] ?? "").trim() : null;
        const isAssembled = assembleVal === "1" || /^(yes|true|y)$/i.test(assembleVal ?? "");
        const weightRaw = weightCol >= 0 ? String(row[weightCol] ?? "").trim() : null;
        const weightParsed = weightRaw ? parseFloat(weightRaw) : null;

        const warnings: string[] = [];
        const issues: Array<{ field: string; message: string; severity: "warning" | "error" }> = [];
        let cabinetId: number;
        let action = "price-only";

        // Validate dimensions
        const dimsParsed = !!(dims.width || dims.height || dims.depth);
        const hasDimSource = dimCol >= 0 || descCol >= 0;
        if (hasDimSource && !dimsParsed) {
          issues.push({ field: "dimensions", message: "Dimensions could not be parsed", severity: "warning" });
        }

        if (!found) {
          if (!description || !category) {
            unmatchedCodes.push(code);
            warnings.push("No match — needs Description + Category to create");
            if (!input.dryRun) { skipped++; }
            issues.push({ field: "sku", message: `SKU "${code}" not found — needs Description + Category to create new cabinet`, severity: "error" });
            previewRows.push({ rowNum: i + 2, code, resolvedCode: null, matchHow: "none", action: "error", stylesPriced: 0, warnings, severity: "error", issues, dimsParsed: false, missingPriceCount: priceCols.length, invalidPriceCount: 0, stylePrices: [] });
            continue;
          }
          action = "create";
          if (!input.dryRun) {
            const res = await db.insert(cabinets).values({
              masterCode: code,
              description,
              descriptionSource: "Distributor Import",
              category,
              subCategory,
              width: dims.width,
              height: dims.height,
              depth: dims.depth,
              sku: code, // store the distributor's item code as the primary SKU alias
              isActive: true,
              ...(assembleCol >= 0 ? { isAssembled } : {}),
            });
            cabinetId = (res as unknown as [{ insertId: number }])[0].insertId;
            aliasMap.set(code.toUpperCase(), { id: cabinetId, masterCode: code, description, category });
            created++;
          } else {
            cabinetId = -1;
          }
        } else {
          cabinetId = found.id;
          const patch: Record<string, unknown> = {};
          // Only fill empty fields — never overwrite existing data
          if (description && !found.description) patch.description = description;
          if (category && !found.category) patch.category = category;
          if (subCategory) patch.subCategory = subCategory;
          if (dims.width) patch.width = dims.width;
          if (dims.height) patch.height = dims.height;
          if (dims.depth) patch.depth = dims.depth;
          if (assembleCol >= 0) patch.isAssembled = isAssembled;
          if (weightParsed != null && !isNaN(weightParsed)) patch.weight = String(weightParsed);
          // Backfill alias: if the import code is not already stored in any alias slot, write it to the first empty slot
          const aliasFields = ["sku", "vendorSku", "altSku1", "altSku2", "altSku3"] as const;
          const codeUpper = code.toUpperCase();
          const alreadyStored = aliasFields.some((f) => {
            const v = (found as Record<string, unknown>)[f];
            return typeof v === "string" && v.toUpperCase() === codeUpper;
          });
          if (!alreadyStored && code.toUpperCase() !== found.masterCode.toUpperCase()) {
            const emptySlot = aliasFields.find((f) => !(found as Record<string, unknown>)[f]);
            if (emptySlot) patch[emptySlot] = code;
          }
          if (Object.keys(patch).length > 0) {
            if (action !== "create") action = "update";
            if (!input.dryRun) {
              await db.update(cabinets).set(patch).where(eq(cabinets.id, cabinetId));
              updated++;
            }
          }
        }

        // Price columns — one upsert per style column
        let stylesPriced = 0;
        let missingPriceCount = 0;
        let invalidPriceCount = 0;
        const stylePrices: Array<{ styleId: number; styleCode: string; price: number | null; raw: string; valid: boolean }> = [];
        for (const pc of priceCols) {
          const rawVal = row[pc.colIdx];
          // Apply admin cell edit override for this price column if present
          const styleEntry0 = distStyles.find((s) => s.id === pc.styleId);
          const styleCode0 = styleEntry0?.styleCode ?? String(pc.styleId);
          const priceCellEdit = cellEditMap.get(`${rowNum}:price:${styleCode0}`);
          const strVal = priceCellEdit !== undefined ? priceCellEdit : String(rawVal ?? "").trim();
          // Use the already-resolved style code for display
          const styleEntry = styleEntry0;
          const styleCode = styleCode0;
          if (!strVal || strVal.toUpperCase() === "N/A" || strVal === "-") {
            missingPriceCount++;
            stylePrices.push({ styleId: pc.styleId!, styleCode, price: null, raw: strVal, valid: false });
            continue;
          }
          const price = parseFloat(strVal);
          if (isNaN(price) || price <= 0) {
            invalidPriceCount++;
            issues.push({ field: `price:${styleCode}`, message: `Invalid price "${strVal}" for style ${styleCode}`, severity: "error" });
            stylePrices.push({ styleId: pc.styleId!, styleCode, price: null, raw: strVal, valid: false });
            continue;
          }
          stylePrices.push({ styleId: pc.styleId!, styleCode, price, raw: strVal, valid: true });

          stylesPriced++;
          if (!input.dryRun && cabinetId > 0) {
            // Check for existing row
            const existing = await db
              .select({ id: distributorSkus.id })
              .from(distributorSkus)
              .where(
                and(
                  eq(distributorSkus.cabinetId, cabinetId),
                  eq(distributorSkus.distributorId, input.distributorId),
                  eq(distributorSkus.styleId, pc.styleId!)
                )
              )
              .limit(1);

            if (existing.length > 0) {
              // Update — only update listPrice (preserve yourCost if already set)
              await db
                .update(distributorSkus)
                .set({ listPrice: String(price) })
                .where(eq(distributorSkus.id, existing[0].id));
            } else {
              // Insert new SKU row
              const platformSku = `${found?.masterCode ?? code}-S${pc.styleId}-D${input.distributorId}`;
              await db.insert(distributorSkus).values({
                cabinetId,
                distributorId: input.distributorId,
                styleId: pc.styleId!,
                platformSku,
                distributorSku: code,
                listPrice: String(price),
                isAvailable: true,
                isPublished: false, // start unpublished for review
              });
            }
            priced++;
          }
        }

        // Determine overall row severity
        const hasErrors = issues.some((i) => i.severity === "error") || matchHow === "none";
        const hasWarnings = issues.some((i) => i.severity === "warning") || missingPriceCount > 0;
        const severity: "ok" | "warning" | "error" = hasErrors ? "error" : hasWarnings ? "warning" : "ok";

        previewRows.push({
          rowNum: i + 2,
          code,
          resolvedCode: found?.masterCode ?? null,
          matchHow,
          action,
          stylesPriced,
          warnings,
          severity,
          issues,
          dimsParsed,
          missingPriceCount,
          invalidPriceCount,
          stylePrices,
        });
      }

      const errorCount = previewRows.filter((r) => r.severity === "error").length;
      const warningCount = previewRows.filter((r) => r.severity === "warning").length;

      return {
        dryRun: input.dryRun ?? false,
        created,
        updated,
        priced,
        skipped,
        aliasMatched,
        unmatchedCount: unmatchedCodes.length,
        unmatchedCodes: unmatchedCodes.slice(0, 50),
        errorCount,
        warningCount,
        previewRows: input.dryRun ? previewRows.slice(0, 200) : [],
        unknownCategories: Array.from(unknownCategories),
      };
    }),

  /**
   * Convert a PDF pricing sheet (base64-encoded) to an XLSX file.
   * Uses the server/scripts/pdf_to_xlsx.py script via child_process.
   * Returns the XLSX as a base64 string plus metadata about what was extracted.
   */
  pdfToXlsx: adminProcedure
    .input(
      z.object({
        fileBase64: z.string().min(1),
        filename: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      // Write PDF to a temp file
      const tmpDir = os.tmpdir();
      const pdfPath = path.join(tmpDir, `cabinet_pdf_${Date.now()}.pdf`);
      const xlsxPath = path.join(tmpDir, `cabinet_pdf_${Date.now()}_out.xlsx`);

      try {
        const pdfBuffer = Buffer.from(input.fileBase64, "base64");
        fs.writeFileSync(pdfPath, pdfBuffer);

        // Run the Python extraction script
        const scriptPath = path.join(__dirname, "../scripts/pdf_to_xlsx.py");
        const { stdout, stderr } = await execFileAsync("python3", [scriptPath, pdfPath, xlsxPath], {
          timeout: 60_000,
        });

        if (!fs.existsSync(xlsxPath)) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `PDF conversion failed: ${stderr || stdout || "no output"}`,
          });
        }

        // Parse stdout for metadata: "Converted N rows, M style codes: [...]"
        const rowsMatch = stdout.match(/(\d+) rows/);
        const stylesMatch = stdout.match(/style codes: \[([^\]]+)\]/);
        const rowCount = rowsMatch ? parseInt(rowsMatch[1], 10) : 0;
        const styleCodes = stylesMatch
          ? stylesMatch[1].split(",").map((s) => s.trim().replace(/'/g, ""))
          : [];

        // Read the XLSX and return as base64
        const xlsxBuffer = fs.readFileSync(xlsxPath);
        const xlsxBase64 = xlsxBuffer.toString("base64");

        return {
          xlsxBase64,
          filename: input.filename.replace(/\.pdf$/i, ".xlsx"),
          rowCount,
          styleCodes,
        };
      } finally {
        // Clean up temp files
        try { fs.unlinkSync(pdfPath); } catch {}
        try { fs.unlinkSync(xlsxPath); } catch {}
      }
    }),

  /**
   * Returns ALL door styles across all distributors — used by the column
   * mapping UI so admins can assign a price column to a style that doesn't
   * yet exist for the current distributor.
   */
  adminAllStyles: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({
        id: doorStyles.id,
        styleCode: doorStyles.styleCode,
        ourName: doorStyles.ourName,
        distributorName: doorStyles.distributorName,
        distributorId: doorStyles.distributorId,
      })
      .from(doorStyles)
      .where(eq(doorStyles.isActive, true))
      .orderBy(doorStyles.ourName);
  }),

  /**
   * Copy an existing door style into a new distributor's style list.
   * Used when the admin picks a style from another distributor during column
   * mapping — the style is cloned with the same name/code for the target
   * distributor and the new ID is returned so the column mapping can use it.
   *
   * If the style already exists for this distributor (same styleCode), returns
   * the existing ID instead of creating a duplicate.
   */
  adminCreateStyleForDistributor: adminProcedure
    .input(
      z.object({
        /** The source style to clone. */
        sourceStyleId: z.number(),
        /** The distributor to create the style for. */
        distributorId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Load source style
      const [src] = await db
        .select()
        .from(doorStyles)
        .where(eq(doorStyles.id, input.sourceStyleId))
        .limit(1);
      if (!src) throw new TRPCError({ code: "NOT_FOUND", message: "Source style not found." });

      // Check if a style with the same styleCode already exists for this distributor
      const existing = await db
        .select({ id: doorStyles.id })
        .from(doorStyles)
        .where(
          and(
            eq(doorStyles.distributorId, input.distributorId),
            eq(doorStyles.styleCode, src.styleCode)
          )
        )
        .limit(1);
      if (existing.length > 0) {
        return { id: existing[0].id, created: false };
      }

      // Clone the style for the new distributor
      const res = await db.insert(doorStyles).values({
        distributorId: input.distributorId,
        styleCode: src.styleCode,
        ourName: src.ourName,
        aliasName: src.aliasName,
        distributorName: src.distributorName,
        doorStyle: src.doorStyle,
        woodSpecies: src.woodSpecies,
        finish: src.finish,
        color: src.color,
        doorSampleImageUrl: src.doorSampleImageUrl,
        roomSceneImageUrl: src.roomSceneImageUrl,
        thumbnailImageUrl: src.thumbnailImageUrl,
        isActive: true,
        isFeatured: false,
        featuredRank: 0,
        isBuilderGrade: src.isBuilderGrade,
      });
      const insertResult = res as unknown as { insertId: number };
      return { id: Number(insertResult.insertId), created: true };
    }),

  // ── Category alias management ────────────────────────────────────────────

  /** List all category aliases (optionally filtered to a distributor). */
  adminListCategoryAliases: adminProcedure
    .input(z.object({ distributorId: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db.select().from(categoryAliases).orderBy(categoryAliases.rawCategory);
      return rows.filter((r) =>
        input.distributorId == null ? true : r.distributorId === null || r.distributorId === input.distributorId
      );
    }),

  /** Upsert a category alias. distributorId=null means global (applies to all distributors). */
  adminSaveCategoryAlias: adminProcedure
    .input(
      z.object({
        rawCategory: z.string().min(1),
        platformCategory: z.string().min(1),
        distributorId: z.number().nullable().default(null),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // MySQL NULL != NULL in unique indexes, so onDuplicateKeyUpdate never fires
      // for global aliases (distributorId = NULL). Use a manual check-then-upsert.
      const distId = input.distributorId ?? null;
      const existing = await db
        .select({ id: categoryAliases.id })
        .from(categoryAliases)
        .where(
          and(
            eq(categoryAliases.rawCategory, input.rawCategory),
            distId === null
              ? sql`${categoryAliases.distributorId} IS NULL`
              : eq(categoryAliases.distributorId, distId)
          )
        )
        .limit(1);
      if (existing.length > 0) {
        await db
          .update(categoryAliases)
          .set({ platformCategory: input.platformCategory })
          .where(eq(categoryAliases.id, existing[0].id));
      } else {
        await db.insert(categoryAliases).values({
          rawCategory: input.rawCategory,
          platformCategory: input.platformCategory,
          distributorId: distId ?? undefined,
        });
      }
      return { ok: true };
    }),

  /** Delete a category alias by id. */
  adminDeleteCategoryAlias: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(categoryAliases).where(eq(categoryAliases.id, input.id));
      return { ok: true };
    }),
});
