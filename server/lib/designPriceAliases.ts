export type DesignPriceAlias = {
  alias: string;
  canonicalMasterCode: string;
};

export const verifiedLegacyDesignPriceAliases: readonly DesignPriceAlias[] = [
  { alias: "WFR2442", canonicalMasterCode: "W-24-42" },
];

export function normalizedDesignPriceCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function canonicalizeDesignPriceItems<T extends { masterCode: string }>(
  items: readonly T[],
  aliases: readonly DesignPriceAlias[],
): Array<T & { requestedMasterCode: string }> {
  const exactCanonicalByAlias = new Map<string, string>();
  const normalizedTargets = new Map<string, Set<string>>();
  for (const entry of aliases) {
    exactCanonicalByAlias.set(entry.alias.trim().toUpperCase(), entry.canonicalMasterCode);
    const normalizedAlias = normalizedDesignPriceCode(entry.alias);
    const targets = normalizedTargets.get(normalizedAlias) ?? new Set<string>();
    targets.add(entry.canonicalMasterCode);
    normalizedTargets.set(normalizedAlias, targets);
  }
  const canonicalByNormalizedAlias = new Map<string, string>();
  normalizedTargets.forEach((targets, alias) => {
    let onlyTarget: string | undefined;
    targets.forEach((target) => { onlyTarget = target; });
    if (targets.size === 1 && onlyTarget) canonicalByNormalizedAlias.set(alias, onlyTarget);
  });
  return items.map((item) => ({
    ...item,
    requestedMasterCode: item.masterCode,
    masterCode: exactCanonicalByAlias.get(item.masterCode.trim().toUpperCase())
      ?? canonicalByNormalizedAlias.get(normalizedDesignPriceCode(item.masterCode))
      ?? item.masterCode,
  }));
}
