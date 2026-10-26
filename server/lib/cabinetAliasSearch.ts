import { eq, inArray } from "drizzle-orm";
import { cabinetAliases, cabinets, skuMasterAliases } from "../../drizzle/schema";
import {
  aliasesByVisibleCabinet,
  filterByAliasSearchRank,
  rankCabinetAliasMatches,
  type CabinetAliasMatchRank,
} from "../../shared/cabinetAliasSearch";
import type { getDb } from "../db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

type VisibleCabinet = {
  id: number;
  masterCode: string;
  description?: string | null;
};

/**
 * Rank cabinets already loaded for a catalog or Designer response.
 * Returns null when there is no query so the caller keeps its existing order.
 * Does not write to the database.
 */
export async function rankLoadedCabinetSearch<T extends VisibleCabinet>(
  db: Db,
  rows: readonly T[],
  query: string | undefined,
  skuAliases?: ReadonlyArray<{ aliasCode: string | null; masterCode: string | null }>,
): Promise<Map<number, CabinetAliasMatchRank> | null> {
  const trimmed = query?.trim() ?? "";
  if (!trimmed) return null;
  if (rows.length === 0) return new Map();

  const ids = Array.from(new Set(rows.map((row) => row.id)));
  const [fieldRows, cabinetAliasRows, masterAliases] = await Promise.all([
    db
      .select({
        id: cabinets.id,
        masterCode: cabinets.masterCode,
        sku: cabinets.sku,
        vendorSku: cabinets.vendorSku,
        altSku1: cabinets.altSku1,
        altSku2: cabinets.altSku2,
        altSku3: cabinets.altSku3,
      })
      .from(cabinets)
      .where(inArray(cabinets.id, ids)),
    db
      .select({
        cabinetId: cabinetAliases.cabinetId,
        alias: cabinetAliases.alias,
        ownerMasterCode: cabinets.masterCode,
      })
      .from(cabinetAliases)
      .innerJoin(cabinets, eq(cabinets.id, cabinetAliases.cabinetId)),
    skuAliases
      ? Promise.resolve(skuAliases)
      : db
          .select({ aliasCode: skuMasterAliases.aliasCode, masterCode: skuMasterAliases.masterCode })
          .from(skuMasterAliases)
          .where(eq(skuMasterAliases.conflictStatus, "ok")),
  ]);

  const aliasMap = aliasesByVisibleCabinet({
    visible: rows.map((row) => ({ id: row.id, masterCode: row.masterCode })),
    fieldRows,
    cabinetAliasRows,
    skuMasterAliases: masterAliases,
  });
  const ranks = rankCabinetAliasMatches(
    rows.map((row) => ({
      id: row.id,
      itemCode: row.masterCode,
      description: row.description ?? null,
      aliases: aliasMap.get(row.id) ?? [],
    })),
    trimmed,
  );
  return ranks as Map<number, CabinetAliasMatchRank> | null;
}

export function orderCabinetsByAliasRank<T extends { id: number }>(
  rows: readonly T[],
  ranks: Map<number, CabinetAliasMatchRank> | null,
  tieBreak?: (left: T, right: T) => number,
): T[] {
  return filterByAliasSearchRank(rows, ranks, tieBreak);
}
