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

/** Hyphen/space/underscore variants are one nomenclature identity. */
function normalizedIdentityKey(code: string): string {
  return code.replace(/[\s_-]/g, "");
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
    // Imported catalogs occasionally contain an approved format chain such as
    // `B-24 → B24 → B24CANONICAL`. Follow it to the final master rather than
    // silently dropping the priced source because the intermediate record is
    // correctly retired from public visibility. The visited set makes a bad
    // circular mapping safe: it is quarantined rather than ever turned into a
    // public product.
    let canonicalKey = sourceKey;
    const visited = new Set<string>();
    let encounteredCycle = false;
    while (true) {
      visited.add(canonicalKey);
      const next = canonicalCodeByAlias.get(canonicalKey);
      if (!next) break;
      if (visited.has(next)) {
        // B12 ↔ B-12 (and equivalent punctuation-only variants) are one
        // nomenclature identity, not a structural alias loop. Preserve the
        // valid active source master in that case. A loop across genuinely
        // different identity keys remains unsafe and is quarantined.
        const sourceIdentity = normalizedIdentityKey(sourceKey);
        encounteredCycle = !Array.from(visited).every(
          (code) => normalizedIdentityKey(code) === sourceIdentity,
        );
        if (!encounteredCycle) canonicalKey = sourceKey;
        break;
      }
      canonicalKey = next;
    }
    const master = encounteredCycle
      ? undefined
      : masterByCode.get(canonicalKey) ?? masterByCode.get(sourceKey);
    if (master) resolved.push({ source, master });
  }
  return resolved;
}
