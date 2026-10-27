import { normalizeCode } from "./cabinetCodeMatch";

/**
 * Catalog search over spreadsheet cabinet identity.
 *
 * A row's shopper-facing code is ReplacementMasterCode when that cell is set,
 * otherwise ItemCode. Aliases are semicolon-separated (one cell or many) and
 * match case-insensitively with dashes and spaces ignored. An exact item-code
 * hit outranks an exact alias hit. An alias that equals some row's
 * ReplacementMasterCode (or ItemCode, when no replacement is set) resolves to
 * that master instead of the row that merely lists it.
 */

export type CabinetAliasSearchRow = {
  id: number | string;
  itemCode: string;
  replacementMasterCode?: string | null;
  aliases?: ReadonlyArray<string | null | undefined>;
  description?: string | null;
};

export type CabinetAliasMatchRank = 0 | 1 | 2;

export type AliasOwnerFields = {
  id: number;
  masterCode: string;
  sku?: string | null;
  vendorSku?: string | null;
  altSku1?: string | null;
  altSku2?: string | null;
  altSku3?: string | null;
};

const RANK_EXACT_ITEM = 0;
const RANK_EXACT_ALIAS = 1;
const RANK_PARTIAL = 2;

/** Split spreadsheet alias cells. Blank and repeated codes are dropped. */
export function expandAliasValues(values: ReadonlyArray<string | null | undefined> | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values ?? []) {
    if (!value) continue;
    for (const part of value.split(";")) {
      const token = part.trim();
      const key = normalizeCode(token);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(token);
    }
  }
  return out;
}

type PreparedRow<T> = {
  row: T;
  id: number | string;
  masterCode: string;
  normalizedMaster: string;
  normalizedItem: string;
  description: string;
  normalizedAliases: Set<string>;
  index: number;
};

function resolvedMasterCode(row: CabinetAliasSearchRow): string {
  const replacement = row.replacementMasterCode?.trim() ?? "";
  return replacement || row.itemCode;
}

function prepareRows<T extends CabinetAliasSearchRow>(rows: readonly T[]): PreparedRow<T>[] {
  const prepared: PreparedRow<T>[] = rows.map((row, index) => {
    const masterCode = resolvedMasterCode(row);
    const replacement = row.replacementMasterCode?.trim() ?? "";
    const aliasTokens = expandAliasValues([
      ...(row.aliases ?? []),
      replacement && normalizeCode(row.itemCode) !== normalizeCode(replacement) ? row.itemCode : null,
    ]);
    return {
      row,
      id: row.id,
      masterCode,
      normalizedMaster: normalizeCode(masterCode),
      normalizedItem: normalizeCode(row.itemCode),
      description: row.description ?? "",
      normalizedAliases: new Set(aliasTokens.map((token) => normalizeCode(token)).filter(Boolean)),
      index,
    };
  });

  const masterIdsByNorm = new Map<string, Set<number | string>>();
  for (const row of prepared) {
    if (!row.normalizedMaster) continue;
    const ids = masterIdsByNorm.get(row.normalizedMaster) ?? new Set<number | string>();
    ids.add(row.id);
    masterIdsByNorm.set(row.normalizedMaster, ids);
  }

  for (const row of prepared) {
    for (const alias of Array.from(row.normalizedAliases)) {
      const owners = masterIdsByNorm.get(alias);
      if (!owners) continue;
      const pointsAtAnotherMaster = Array.from(owners).some((id) => id !== row.id);
      if (pointsAtAnotherMaster) row.normalizedAliases.delete(alias);
    }
  }
  return prepared;
}

/**
 * Rank one catalog against a shopper query.
 * 0 = exact item / replacement master code, 1 = exact alias, 2 = partial code,
 * alias, or description. Missing ids did not match.
 * An empty query returns null so callers keep their unfiltered order.
 */
export function rankCabinetAliasMatches<T extends CabinetAliasSearchRow>(
  rows: readonly T[],
  query: string,
): Map<T["id"], CabinetAliasMatchRank> | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const norm = normalizeCode(trimmed);
  const raw = trimmed.toLowerCase();
  const ranks = new Map<T["id"], CabinetAliasMatchRank>();

  for (const row of prepareRows(rows)) {
    let rank: CabinetAliasMatchRank | null = null;
    if (norm && row.normalizedMaster === norm) rank = RANK_EXACT_ITEM;
    else if (norm && row.normalizedAliases.has(norm)) rank = RANK_EXACT_ALIAS;
    else if (
      row.masterCode.toLowerCase().includes(raw)
      || row.normalizedItem.length > 0 && row.row.itemCode.toLowerCase().includes(raw)
      || row.description.toLowerCase().includes(raw)
      || (norm.length > 0 && (
        row.normalizedMaster.includes(norm)
        || row.normalizedItem.includes(norm)
        || Array.from(row.normalizedAliases).some((alias) => alias.includes(norm))
      ))
    ) rank = RANK_PARTIAL;
    if (rank != null) ranks.set(row.row.id, rank);
  }
  return ranks;
}

/** Keep matches, exact item code first, then exact alias, then partial. */
export function filterByAliasSearchRank<T extends { id: number | string }>(
  rows: readonly T[],
  ranks: Map<T["id"], CabinetAliasMatchRank> | null,
  tieBreak: (left: T, right: T) => number = () => 0,
): T[] {
  if (!ranks) return [...rows];
  return rows
    .filter((row) => ranks.has(row.id))
    .sort((left, right) => (ranks.get(left.id)! - ranks.get(right.id)!) || tieBreak(left, right));
}

function addAlias(map: Map<number, string[]>, cabinetId: number, value: string | null | undefined) {
  const token = value?.trim();
  if (!token) return;
  const list = map.get(cabinetId) ?? [];
  list.push(token);
  map.set(cabinetId, list);
}

/**
 * Attach stored alias fields to the cabinets a search is allowed to return.
 * `sku` / `vendorSku` / `altSku1-3` may each be a single code or a semicolon list.
 * Alias-table rows stored on a punctuation variant of the same item code are
 * included. A cabinet's own item code is not repeated as an alias.
 */
export function aliasesByVisibleCabinet(input: {
  visible: ReadonlyArray<{ id: number; masterCode: string }>;
  fieldRows: ReadonlyArray<AliasOwnerFields>;
  cabinetAliasRows: ReadonlyArray<{ cabinetId: number; alias: string | null; ownerMasterCode: string | null }>;
  skuMasterAliases: ReadonlyArray<{ aliasCode: string | null; masterCode: string | null }>;
}): Map<number, string[]> {
  const visibleByNorm = new Map<string, number[]>();
  const visibleIds = new Set<number>();
  for (const cabinet of input.visible) {
    visibleIds.add(cabinet.id);
    const key = normalizeCode(cabinet.masterCode);
    if (!key) continue;
    const ids = visibleByNorm.get(key) ?? [];
    ids.push(cabinet.id);
    visibleByNorm.set(key, ids);
  }
  // A code that already aliases a visible master (BT-09 -> BT9) carries any
  // alias list stored on that variant row back to the master.
  const visibleIdsByAliasNorm = new Map<string, number[]>();
  const rememberAlias = (aliasCode: string | null | undefined, masterCode: string | null | undefined, ownerId?: number) => {
    const aliasKey = normalizeCode(aliasCode ?? "");
    if (!aliasKey) return;
    const targets = new Set<number>(visibleByNorm.get(normalizeCode(masterCode ?? "")) ?? []);
    if (ownerId != null && visibleIds.has(ownerId)) targets.add(ownerId);
    if (targets.size === 0) return;
    const ids = visibleIdsByAliasNorm.get(aliasKey) ?? [];
    for (const id of Array.from(targets)) if (!ids.includes(id)) ids.push(id);
    visibleIdsByAliasNorm.set(aliasKey, ids);
  };
  for (const row of input.skuMasterAliases) rememberAlias(row.aliasCode, row.masterCode);
  for (const row of input.cabinetAliasRows) rememberAlias(row.alias, row.ownerMasterCode, row.cabinetId);
  const targetsFor = (id: number, masterCode: string | null | undefined): number[] => {
    const targets = new Set<number>();
    if (visibleIds.has(id)) targets.add(id);
    const key = normalizeCode(masterCode ?? "");
    for (const visibleId of visibleByNorm.get(key) ?? []) targets.add(visibleId);
    for (const visibleId of visibleIdsByAliasNorm.get(key) ?? []) targets.add(visibleId);
    return Array.from(targets);
  };
  const aliases = new Map<number, string[]>();
  const add = (id: number, masterCode: string, value: string | null | undefined) => {
    if (!value?.trim()) return;
    if (normalizeCode(value) === normalizeCode(masterCode)) return;
    for (const targetId of targetsFor(id, masterCode)) {
      const target = input.visible.find((cabinet) => cabinet.id === targetId);
      if (target && normalizeCode(value) === normalizeCode(target.masterCode)) continue;
      addAlias(aliases, targetId, value);
    }
  };
  for (const row of input.fieldRows) {
    add(row.id, row.masterCode, row.sku);
    add(row.id, row.masterCode, row.vendorSku);
    add(row.id, row.masterCode, row.altSku1);
    add(row.id, row.masterCode, row.altSku2);
    add(row.id, row.masterCode, row.altSku3);
  }
  for (const row of input.cabinetAliasRows) {
    add(row.cabinetId, row.ownerMasterCode ?? "", row.alias);
  }
  for (const row of input.skuMasterAliases) {
    const key = normalizeCode(row.masterCode ?? "");
    for (const visibleId of visibleByNorm.get(key) ?? []) {
      const target = input.visible.find((cabinet) => cabinet.id === visibleId);
      if (!target || !row.aliasCode?.trim()) continue;
      if (normalizeCode(row.aliasCode) === normalizeCode(target.masterCode)) continue;
      addAlias(aliases, visibleId, row.aliasCode);
    }
  }
  return aliases;
}
