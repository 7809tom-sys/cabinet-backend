export type FlooringAccessoryMatchProduct = {
  id: number;
  category: string;
  subCategory?: string | null;
  pelicanCode?: string | null;
  name?: string | null;
};

const GENERIC_FAMILY_TOKENS = new Set([
  "vinyl", "flooring", "floor", "plank", "planks", "lvp", "lvt", "spc", "rigid", "core",
  "molding", "moulding", "trim", "transition", "transitions", "t", "reducer", "reducers",
  "end", "cap", "caps", "stair", "stairs", "nose", "nosing", "quarter", "round", "baseboard",
  "baseboards", "accessory", "accessories", "piece", "pieces",
]);

const TRIM_TERMS = /\b(?:transition|t[\s-]?molding|reducer|end[\s-]?cap|stair[\s-]?nose|quarter[\s-]?round|baseboard|molding|moulding|trim)\b/i;

function normalizedText(product: Pick<FlooringAccessoryMatchProduct, "pelicanCode" | "name">): string {
  return `${product.pelicanCode ?? ""} ${product.name ?? ""}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/(\d+(?:\.\d+)?)\s*(mil|mm)\b/g, "$1$2")
    .replace(/[^a-z0-9.]+/g, " ")
    .trim();
}

function sourceVariantTokens(product: Pick<FlooringAccessoryMatchProduct, "pelicanCode" | "name">): string[] {
  return Array.from(new Set(normalizedText(product).match(/\b\d+(?:\.\d+)?(?:mil|mm)\b/g) ?? []));
}

function familyTokens(product: Pick<FlooringAccessoryMatchProduct, "pelicanCode" | "name">): string[] {
  return Array.from(new Set(
    normalizedText(product)
      .split(/\s+/)
      .filter((token) => token.length > 1)
      .filter((token) => !GENERIC_FAMILY_TOKENS.has(token))
      .filter((token) => !/^\d+(?:\.\d+)?(?:mil|mm)$/.test(token)),
  )).sort();
}

function sameTokens(left: readonly string[], right: readonly string[]): boolean {
  return left.length > 0 && left.length === right.length && left.every((token, index) => token === right[index]);
}

function isFloor(product: FlooringAccessoryMatchProduct): boolean {
  return product.category === "Flooring" && product.subCategory === "Planks & Flooring";
}

function isTrim(product: FlooringAccessoryMatchProduct): boolean {
  return product.category === "Flooring"
    && product.subCategory === "Moldings & Trim"
    && TRIM_TERMS.test(`${product.pelicanCode ?? ""} ${product.name ?? ""}`);
}

/**
 * Returns only source-identical optional trim/transition pieces for an installed
 * floor. It deliberately rejects fuzzy family matches and ambiguous accessories;
 * any product returned still requires an explicit customer "Add to design" action.
 */
export function matchingFlooringAccessories<T extends FlooringAccessoryMatchProduct>(
  selectedFloor: T,
  allProducts: readonly T[],
): T[] {
  if (!isFloor(selectedFloor)) return [];
  const selectedFamily = familyTokens(selectedFloor);
  const selectedVariants = sourceVariantTokens(selectedFloor);
  if (selectedFamily.length === 0) return [];

  const familyFloors = allProducts.filter((product) => isFloor(product) && sameTokens(familyTokens(product), selectedFamily));
  const familyVariants = new Set(familyFloors.flatMap(sourceVariantTokens));

  return allProducts.filter((candidate) => {
    if (!isTrim(candidate) || !sameTokens(familyTokens(candidate), selectedFamily)) return false;
    const candidateVariants = sourceVariantTokens(candidate);
    if (candidateVariants.length > 0) {
      return sameTokens(candidateVariants, selectedVariants);
    }
    // A generic family trim can only be safe when the source exposes one floor
    // variant for that collection. Multiple wear layers are intentionally not
    // guessed from a photograph or a loose title.
    return familyVariants.size <= 1;
  });
}
