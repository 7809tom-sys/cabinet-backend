import { sql, type AnyColumn, type SQL } from "drizzle-orm";
import { cabinetAliases, cabinets, skuMasterAliases } from "../../drizzle/schema";
import { normalizeCode } from "../../shared/cabinetCodeMatch";

function normalizedExpr(column: AnyColumn | SQL): SQL {
  return sql`UPPER(REPLACE(REPLACE(REPLACE(${column}, '-', ''), ' ', ''), '_', ''))`;
}

/** Exact code, partial code, or one semicolon-separated alias token. */
function aliasTokenMatch(column: AnyColumn | SQL, normalizedQuery: string): SQL {
  const normalized = normalizedExpr(column);
  const tokenNormalized = normalizedExpr(column);
  return sql`(
    ${normalized} = ${normalizedQuery}
    OR ${tokenNormalized} LIKE ${`%${normalizedQuery}%`}
    OR CONCAT(';', ${normalizedExpr(column)}, ';') LIKE ${`%;${normalizedQuery};%`}
  )`;
}

function exactAliasToken(column: AnyColumn | SQL, normalizedQuery: string): SQL {
  return sql`CONCAT(';', ${normalizedExpr(column)}, ';') LIKE ${`%;${normalizedQuery};%`}`;
}

/**
 * Extra predicate for cabinet searches that already match master code and
 * description. Covers sku, vendorSku, altSku1-3, cabinet_aliases, and
 * sku_master_aliases. Dashes and spaces are ignored.
 */
export function cabinetAliasFieldMatchSql(rawSearch: string): SQL | null {
  const normalizedQuery = normalizeCode(rawSearch);
  if (!normalizedQuery) return null;
  const like = `%${rawSearch.trim()}%`;
  const parts: SQL[] = [];
  for (const column of [cabinets.sku, cabinets.vendorSku, cabinets.altSku1, cabinets.altSku2, cabinets.altSku3]) {
    parts.push(sql`${column} LIKE ${like}`);
    parts.push(aliasTokenMatch(column, normalizedQuery));
  }
  parts.push(sql`EXISTS (
    SELECT 1 FROM ${cabinetAliases}
    WHERE ${cabinetAliases.cabinetId} = ${cabinets.id}
      AND (
        ${cabinetAliases.alias} LIKE ${like}
        OR ${aliasTokenMatch(cabinetAliases.alias, normalizedQuery)}
      )
  )`);
  parts.push(sql`EXISTS (
    SELECT 1 FROM ${skuMasterAliases}
    WHERE ${skuMasterAliases.conflictStatus} = 'ok'
      AND (
        ${skuMasterAliases.masterCode} = ${cabinets.masterCode}
        OR ${normalizedExpr(skuMasterAliases.masterCode)} = ${normalizedExpr(cabinets.masterCode)}
      )
      AND (
        ${skuMasterAliases.aliasCode} LIKE ${like}
        OR ${aliasTokenMatch(skuMasterAliases.aliasCode, normalizedQuery)}
      )
  )`);
  return sql`(${sql.join(parts, sql` OR `)})`;
}

/** OR an existing search predicate with alias-field matches. */
export function orCabinetAliasMatch(existing: SQL, rawSearch: string): SQL {
  const extra = cabinetAliasFieldMatchSql(rawSearch);
  if (!extra) return existing;
  return sql`(${existing} OR ${extra})`;
}

/** Exact item code, then exact alias, then the caller's existing order. */
export function aliasSearchOrder(rawSearch: string | undefined, ...rest: SQL[]): SQL[] {
  const trimmed = rawSearch?.trim() ?? "";
  if (!trimmed || !normalizeCode(trimmed)) return rest;
  return [cabinetAliasSearchRankSql(trimmed), ...rest];
}

/**
 * Exact alias-field match for code lookup. Partial codes stay out of this
 * predicate so a lookup for FH9 does not land on an unrelated BFH9 row.
 */
export function exactCabinetAliasOwnerSql(normalizedQuery: string): SQL {
  const parts: SQL[] = [
    exactAliasToken(cabinets.sku, normalizedQuery),
    exactAliasToken(cabinets.vendorSku, normalizedQuery),
    exactAliasToken(cabinets.altSku1, normalizedQuery),
    exactAliasToken(cabinets.altSku2, normalizedQuery),
    exactAliasToken(cabinets.altSku3, normalizedQuery),
  ];
  return sql`(${sql.join(parts, sql` OR `)})`;
}

/**
 * 0 exact item code, 1 exact alias that is not some other row's item code,
 * 2 every other hit. Exact alias therefore sorts immediately after the master.
 */
export function cabinetAliasSearchRankSql(rawSearch: string): SQL {
  const normalizedQuery = normalizeCode(rawSearch);
  if (!normalizedQuery) return sql`2`;
  const masterNorm = normalizedExpr(cabinets.masterCode);
  const exactAliasParts: SQL[] = [
    exactAliasToken(cabinets.sku, normalizedQuery),
    exactAliasToken(cabinets.vendorSku, normalizedQuery),
    exactAliasToken(cabinets.altSku1, normalizedQuery),
    exactAliasToken(cabinets.altSku2, normalizedQuery),
    exactAliasToken(cabinets.altSku3, normalizedQuery),
    sql`EXISTS (
      SELECT 1 FROM ${cabinetAliases}
      WHERE ${cabinetAliases.cabinetId} = ${cabinets.id}
        AND ${exactAliasToken(cabinetAliases.alias, normalizedQuery)}
    )`,
    sql`EXISTS (
      SELECT 1 FROM ${skuMasterAliases}
      WHERE ${skuMasterAliases.conflictStatus} = 'ok'
        AND (
          ${skuMasterAliases.masterCode} = ${cabinets.masterCode}
          OR ${normalizedExpr(skuMasterAliases.masterCode)} = ${normalizedExpr(cabinets.masterCode)}
        )
        AND ${exactAliasToken(skuMasterAliases.aliasCode, normalizedQuery)}
    )`,
  ];
  return sql`CASE
    WHEN ${masterNorm} = ${normalizedQuery} THEN 0
    WHEN (${sql.join(exactAliasParts, sql` OR `)})
      AND NOT EXISTS (
        SELECT 1 FROM ${cabinets} AS \`alias_master\`
        WHERE ${normalizedExpr(sql.raw("`alias_master`.`masterCode`"))} = ${normalizedQuery}
          AND ${sql.raw("`alias_master`.`id`")} <> ${cabinets.id}
      )
    THEN 1
    ELSE 2
  END`;
}
