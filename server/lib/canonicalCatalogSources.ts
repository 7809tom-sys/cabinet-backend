/**
 * Supplier rows stay attached to their original imported cabinet record so their
 * distributor SKU, door style, price, availability, and historical references
 * are never rewritten.  When a source code is an approved alias, storefront and
 * Designer queries project that row onto its active canonical master instead.
 *
 * This preserves the catalog law:
 *   canonical master = identity, dimensions, description, generic drawing
 *   supplier row      = SKU, style/finish, price, availability, fulfillment
 */
export interface CanonicalSourceRow {
  sourceMasterCode: string | null;
}

export interface CanonicalMasterRow {
  masterCode: string | null;
}

export interface ApprovedMasterAlias {
  aliasCode: string | null;
  masterCode: string | null;
}

function codeKey(code: string | null | undefined): string {
  return code?.trim().toUpperCase() ?? "";
}

/**
 * Pair each positive, available supplier source row with the active canonical
 * master it should describe. Rows without a valid eligible master are omitted;
 * callers therefore cannot accidentally surface a conflicted, retired, or
 * hidden product by way of an alias.
 */
export function resolveCanonicalCatalogSources<
  TSource extends CanonicalSourceRow,
  TMaster extends CanonicalMasterRow,
>(
  sourceRows: readonly TSource[],
  aliases: readonly ApprovedMasterAlias[],
  eligibleMasters: readonly TMaster[],
): Array<{ source: TSource; master: TMaster }> {
  const masterByCode = new Map<string, TMaster>();
  for (const master of eligibleMasters) {
    const key = codeKey(master.masterCode);
    if (key) masterByCode.set(key, master);
  }

  const canonicalCodeByAlias = new Map<string, string>();
  for (const alias of aliases) {
    const aliasKey = codeKey(alias.aliasCode);
    const canonicalKey = codeKey(alias.masterCode);
    if (aliasKey && canonicalKey) canonicalCodeByAlias.set(aliasKey, canonicalKey);
  }

  const resolved: Array<{ source: TSource; master: TMaster }> = [];
  for (const source of sourceRows) {
    const sourceKey = codeKey(source.sourceMasterCode);
    if (!sourceKey) continue;
    const canonicalKey = canonicalCodeByAlias.get(sourceKey) ?? sourceKey;
    const master = masterByCode.get(canonicalKey);
    if (master) resolved.push({ source, master });
  }
  return resolved;
}
