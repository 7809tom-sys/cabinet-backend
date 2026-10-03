import { eq, ne, and, or, isNotNull, sql } from "drizzle-orm";
import { cabinetAliases, cabinetCodeEquivalences, cabinets, skuMasterAliases } from "../../drizzle/schema";
import type { getDb } from "../db";
import { CodeEquivalenceGroups, type CodeAliasLink } from "../../shared/codeEquivalence";
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
const CACHE_TTL_MS = 30_000;
let cache: { builtAt: number; groups: CodeEquivalenceGroups; linkCount: number } | null = null;
/**
 * Build undirected equivalence groups from every alias store the catalog
 * keeps. All three tables are small (hundreds of rows) so one load per
 * request window is cheaper than per-code transitive queries, and it makes
 * chains (B-36FH -> B36FH -> BFH36) and reversed pairs (ERB36 <-> BER36)
 * resolve regardless of which direction an admin typed them.
 *
 * Only `conflictStatus = 'ok'` sku_master_aliases rows participate, and
 * cabinet_aliases / altSku rows that point at a cabinet held in conflict are
 * skipped — a conflicted record is never a price authority.
 */
export async function loadCodeEquivalenceGroups(db: Db, options?: { force?: boolean }): Promise<CodeEquivalenceGroups> {
  const now = Date.now();
  if (!options?.force && cache && now - cache.builtAt < CACHE_TTL_MS) return cache.groups;
  const links: CodeAliasLink[] = [];
  const masterRows = await db
    .select({ aliasCode: skuMasterAliases.aliasCode, masterCode: skuMasterAliases.masterCode })
    .from(skuMasterAliases)
    .where(eq(skuMasterAliases.conflictStatus, "ok"));
  for (const row of masterRows) links.push(row);
  const cabinetAliasRows = await db
    .select({ aliasCode: cabinetAliases.alias, masterCode: cabinets.masterCode })
    .from(cabinetAliases)
    .innerJoin(cabinets, eq(cabinets.id, cabinetAliases.cabinetId))
    .where(ne(cabinets.conflictStatus, "conflict"));
  for (const row of cabinetAliasRows) links.push(row);
  const altRows = await db
    .select({ masterCode: cabinets.masterCode, alt1: cabinets.altSku1, alt2: cabinets.altSku2, alt3: cabinets.altSku3 })
    .from(cabinets)
    .where(and(
      ne(cabinets.conflictStatus, "conflict"),
      sql`${cabinets.masterCode} NOT LIKE 'ARCHIVE-%'`,
      or(isNotNull(cabinets.altSku1), isNotNull(cabinets.altSku2), isNotNull(cabinets.altSku3))!,
    ));
  for (const row of altRows) {
    for (const alt of [row.alt1, row.alt2, row.alt3]) {
      const aliasCode = alt?.trim();
      if (aliasCode) links.push({ aliasCode, masterCode: row.masterCode });
    }
  }
  // Explicit two-way equivalences (ERB36 <-> BER36). These are undirected by
  // definition; neither side is retired or re-coded.
  const equivalenceRows = await db
    .select({ aliasCode: cabinetCodeEquivalences.codeA, masterCode: cabinetCodeEquivalences.codeB })
    .from(cabinetCodeEquivalences)
    .where(eq(cabinetCodeEquivalences.isActive, true));
  for (const row of equivalenceRows) links.push(row);
  const groups = new CodeEquivalenceGroups().addLinks(links);
  cache = { builtAt: now, groups, linkCount: links.length };
  return groups;
}
export function invalidateCodeEquivalenceCache() {
  cache = null;
}
export function codeEquivalenceCacheStats() {
  return cache ? { builtAt: cache.builtAt, linkCount: cache.linkCount } : null;
}
