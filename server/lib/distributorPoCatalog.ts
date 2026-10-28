// Loads the distributor catalog rows a purchase order needs. Mapping rules live
// in shared/distributorPoLine.ts so the email and the admin preview stay aligned.
// Alias tables are optional: a missing table skips that lookup and the line
// falls back to a direct cabinet or distributor SKU match.

import { and, eq, inArray, isNull, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import {
  cabinetAliases,
  cabinetCodeEquivalences,
  cabinets,
  codeAliases,
  distributorSkus,
  doorStyles,
  skuMasterAliases,
  vendorProducts,
} from "../../drizzle/schema";
import { normalizeCode } from "@shared/cabinetCodeMatch";
import {
  indexDistributorCatalog,
  type DistributorPoLineInput,
  type DistributorSkuRecord,
  type DistributorStyleRecord,
  type IndexedDistributorCatalog,
  type VendorProductRecord,
} from "@shared/distributorPoLine";
import { getDb } from "../db";
import { isMissingSchemaError, schemaErrorMessage } from "./orderSchemaGuard";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const CHUNK = 400;

function chunks<T>(values: T[]): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += CHUNK) out.push(values.slice(index, index + CHUNK));
  return out;
}

function unique(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = normalizeCode(value ?? "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function oneOf(filters: SQL[]): SQL {
  if (filters.length === 1) return filters[0];
  return or(...filters) as SQL;
}

function uniqueIds(values: Array<number | null | undefined>): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const value of values) {
    if (value == null || !Number.isInteger(value) || value <= 0 || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function codeSql(column: AnyColumn) {
  return sql`UPPER(REPLACE(REPLACE(REPLACE(REPLACE(${column}, '-', ''), ' ', ''), '_', ''), '.', ''))`;
}

async function optional<T>(label: string, query: () => Promise<T[]>): Promise<T[]> {
  try {
    return await query();
  } catch (error) {
    if (isMissingSchemaError(error)) {
      console.warn(`[OrderEmail] ${label} unavailable: ${schemaErrorMessage(error)}`);
      return [];
    }
    throw error;
  }
}

async function selectChunks<T>(ids: string[], load: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const rows: T[] = [];
  for (const chunk of chunks(ids)) rows.push(...await load(chunk));
  return rows;
}

export async function fetchDistributorPoCatalog(
  db: Database,
  lines: readonly DistributorPoLineInput[],
): Promise<IndexedDistributorCatalog> {
  const codes = unique(lines.flatMap((line) => [line.masterCode, line.rawCode, line.distributorSku]));
  const cabinetIds = new Set<number>(uniqueIds(lines.map((line) => line.cabinetId)));
  const styleIds = new Set<number>(uniqueIds(lines.map((line) => line.styleId)));

  const cabinetCodeRows: Array<{ cabinetId: number; code: string | null | undefined }> = [];
  const rememberCabinet = (cabinetId: number | null | undefined, ...aliases: Array<string | null | undefined>) => {
    if (cabinetId == null || cabinetId <= 0) return;
    cabinetIds.add(cabinetId);
    for (const code of aliases) {
      if (normalizeCode(code ?? "")) cabinetCodeRows.push({ cabinetId, code });
    }
  };

  if (codes.length || cabinetIds.size) {
    const cabinetSelect = {
      id: cabinets.id,
      masterCode: cabinets.masterCode,
      sku: cabinets.sku,
      vendorSku: cabinets.vendorSku,
      altSku1: cabinets.altSku1,
      altSku2: cabinets.altSku2,
      altSku3: cabinets.altSku3,
    };
    const loaded = new Map<number, { id: number; masterCode: string; sku: string | null; vendorSku: string | null; altSku1: string | null; altSku2: string | null; altSku3: string | null }>();
    const absorb = (rows: Array<typeof loaded extends Map<number, infer Row> ? Row : never>) => {
      for (const row of rows) loaded.set(row.id, row);
    };
    if (cabinetIds.size) {
      absorb(await db.select(cabinetSelect).from(cabinets).where(inArray(cabinets.id, Array.from(cabinetIds))));
    }
    if (codes.length) {
      absorb(await selectChunks(codes, (chunk) => db.select(cabinetSelect).from(cabinets).where(or(
        inArray(codeSql(cabinets.masterCode), chunk),
        inArray(codeSql(cabinets.sku), chunk),
        inArray(codeSql(cabinets.vendorSku), chunk),
        inArray(codeSql(cabinets.altSku1), chunk),
        inArray(codeSql(cabinets.altSku2), chunk),
        inArray(codeSql(cabinets.altSku3), chunk),
      ))));
    }
    for (const row of loaded.values()) {
      rememberCabinet(row.id, row.masterCode, row.sku, row.vendorSku, row.altSku1, row.altSku2, row.altSku3);
    }

    if (codes.length) {
      const aliasRows = await optional("cabinet aliases", () => selectChunks(codes, (chunk) => db.select({
        cabinetId: cabinetAliases.cabinetId,
        alias: cabinetAliases.alias,
      }).from(cabinetAliases).where(inArray(codeSql(cabinetAliases.alias), chunk))));
      for (const row of aliasRows) rememberCabinet(row.cabinetId, row.alias);

      const masterAliases = await optional("sku master aliases", () => selectChunks(codes, (chunk) => db.select({
        aliasCode: skuMasterAliases.aliasCode,
        masterCode: skuMasterAliases.masterCode,
      }).from(skuMasterAliases).where(and(
        inArray(codeSql(skuMasterAliases.aliasCode), chunk),
        eq(skuMasterAliases.conflictStatus, "ok"),
      ))));
      const masterCodes = unique(masterAliases.map((row) => row.masterCode));
      if (masterCodes.length) {
        const masters = await selectChunks(masterCodes, (chunk) => db.select({
          id: cabinets.id,
          masterCode: cabinets.masterCode,
        }).from(cabinets).where(inArray(codeSql(cabinets.masterCode), chunk)));
        const idByMaster = new Map(masters.map((row) => [normalizeCode(row.masterCode), row.id]));
        for (const row of masterAliases) {
          const cabinetId = idByMaster.get(normalizeCode(row.masterCode));
          if (cabinetId) rememberCabinet(cabinetId, row.aliasCode, row.masterCode);
        }
      }

      const privateAliases = await optional("code aliases", () => selectChunks(codes, (chunk) => db.select({
        cabinetId: codeAliases.cabinetId,
        rawCodeCanon: codeAliases.rawCodeCanon,
      }).from(codeAliases).where(and(
        inArray(codeAliases.rawCodeCanon, chunk),
        isNull(codeAliases.userId),
      ))));
      for (const row of privateAliases) rememberCabinet(row.cabinetId, row.rawCodeCanon);
    }
  }

  const equivalences = codes.length
    ? await optional("cabinet code equivalences", () => selectChunks(codes, (chunk) => db.select({
      codeA: cabinetCodeEquivalences.codeA,
      codeB: cabinetCodeEquivalences.codeB,
    }).from(cabinetCodeEquivalences).where(and(
      eq(cabinetCodeEquivalences.isActive, true),
      or(
        inArray(codeSql(cabinetCodeEquivalences.codeA), chunk),
        inArray(codeSql(cabinetCodeEquivalences.codeB), chunk),
      ),
    ))))
    : [];

  const skuFilters: SQL[] = [];
  if (cabinetIds.size) skuFilters.push(inArray(distributorSkus.cabinetId, Array.from(cabinetIds)));
  const skuRows: DistributorSkuRecord[] = [];
  if (skuFilters.length || codes.length) {
    const filters = [...skuFilters];
    const loaded = codes.length
      ? await selectChunks(codes, async (chunk) => {
        const where = filters.length
          ? oneOf([...filters, inArray(codeSql(distributorSkus.distributorSku), chunk)])
          : inArray(codeSql(distributorSkus.distributorSku), chunk);
        return db.select({
          distributorId: distributorSkus.distributorId,
          cabinetId: distributorSkus.cabinetId,
          styleId: distributorSkus.styleId,
          distributorSku: distributorSkus.distributorSku,
          supplierCabinetName: distributorSkus.supplierCabinetName,
          supplierDescription: distributorSkus.supplierDescription,
          isAvailable: distributorSkus.isAvailable,
          status: distributorSkus.status,
        }).from(distributorSkus).where(where);
      })
      : await db.select({
        distributorId: distributorSkus.distributorId,
        cabinetId: distributorSkus.cabinetId,
        styleId: distributorSkus.styleId,
        distributorSku: distributorSkus.distributorSku,
        supplierCabinetName: distributorSkus.supplierCabinetName,
        supplierDescription: distributorSkus.supplierDescription,
        isAvailable: distributorSkus.isAvailable,
        status: distributorSkus.status,
      }).from(distributorSkus).where(oneOf(skuFilters));
    for (const row of loaded) {
      skuRows.push(row);
      if (row.styleId) styleIds.add(row.styleId);
    }
  }

  const hardwareCodes = unique(lines.filter((line) => line.productKind === "hardware").flatMap((line) => [line.distributorSku, line.masterCode, line.rawCode]));
  const vendorIds = uniqueIds(lines.map((line) => line.vendorProductId));
  const vendorRows: VendorProductRecord[] = [];
  if (vendorIds.length || hardwareCodes.length) {
    const loaded = hardwareCodes.length
      ? await selectChunks(hardwareCodes, async (chunk) => {
        const filters: SQL[] = [];
        if (vendorIds.length) filters.push(inArray(vendorProducts.id, vendorIds));
        filters.push(inArray(codeSql(vendorProducts.vendorSku), chunk));
        return db.select({
          id: vendorProducts.id,
          distributorId: vendorProducts.distributorId,
          vendorSku: vendorProducts.vendorSku,
          name: vendorProducts.name,
          description: vendorProducts.description,
        }).from(vendorProducts).where(oneOf(filters));
      })
      : await db.select({
        id: vendorProducts.id,
        distributorId: vendorProducts.distributorId,
        vendorSku: vendorProducts.vendorSku,
        name: vendorProducts.name,
        description: vendorProducts.description,
      }).from(vendorProducts).where(inArray(vendorProducts.id, vendorIds));
    vendorRows.push(...loaded);
  }

  const styles: DistributorStyleRecord[] = styleIds.size
    ? await db.select({
      id: doorStyles.id,
      distributorName: doorStyles.distributorName,
      doorStyle: doorStyles.doorStyle,
      color: doorStyles.color,
      finish: doorStyles.finish,
      aliasName: doorStyles.aliasName,
      ourName: doorStyles.ourName,
    }).from(doorStyles).where(inArray(doorStyles.id, Array.from(styleIds)))
    : [];

  return indexDistributorCatalog({
    skus: skuRows,
    vendorProducts: vendorRows,
    styles,
    cabinetCodes: cabinetCodeRows,
    equivalences,
  });
}
