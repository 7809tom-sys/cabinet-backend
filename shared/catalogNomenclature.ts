export type CatalogNomenclatureFamily =
  | "wall-skin-veneer"
  | "base"
  | "blind-corner-base"
  | "wall"
  | "tall"
  | "unknown";

export type CatalogNomenclature = {
  code: string;
  normalizedCode: string;
  family: CatalogNomenclatureFamily;
  expectedCategory?: string;
  expectedSubCategory?: string;
  expectedPlacement?: "base" | "wall" | "tall" | "accessory";
  expectedWidth?: number;
  expectedHeight?: number;
  expectedDepth?: number;
  expectedDescriptionTerms: string[];
};

export type CatalogTruthInput = {
  masterCode: string;
  description: string | null | undefined;
  category: string | null | undefined;
  subCategory?: string | null | undefined;
  placementType?: string | null | undefined;
  width?: number | string | null | undefined;
  height?: number | string | null | undefined;
  depth?: number | string | null | undefined;
  catalogImageUrl?: string | null | undefined;
};

export type CatalogTruthIssue =
  | "description-mismatch"
  | "category-mismatch"
  | "subcategory-mismatch"
  | "placement-mismatch"
  | "width-mismatch"
  | "height-mismatch"
  | "depth-mismatch"
  | "generic-image-required";

const EPSILON = 0.01;

function numeric(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function matches(value: number | string | null | undefined, expected: number | undefined): boolean {
  if (expected == null) return true;
  const parsed = numeric(value);
  return parsed != null && Math.abs(parsed - expected) <= EPSILON;
}

/**
 * Recognizes product-family facts encoded directly in a master code. The parsed
 * facts are deliberately conservative: only families with an unambiguous code
 * convention impose fixed dimensions or category rules. Unknown codes remain
 * editable rather than receiving guessed product specs.
 */
export function parseCatalogNomenclature(masterCode: string): CatalogNomenclature {
  const code = masterCode.trim().toUpperCase();
  const normalizedCode = code.replace(/[^A-Z0-9]/g, "");

  const wsvMatch = normalizedCode.match(/^WSV(24|30|36|42)$/);
  if (wsvMatch) {
    const height = Number(wsvMatch[1]);
    return {
      code,
      normalizedCode,
      family: "wall-skin-veneer",
      expectedCategory: "Wall Skin / Scribe Veneer",
      expectedSubCategory: "Wall Skin / Scribe Veneer",
      expectedPlacement: "accessory",
      expectedWidth: 15,
      expectedHeight: height,
      expectedDepth: 0.25,
      expectedDescriptionTerms: ["wall", "skin", "veneer"],
    };
  }

  const ovenTall = normalizedCode.match(/^OC(\d{2})(\d{2})$/);
  if (ovenTall) {
    return {
      code,
      normalizedCode,
      family: "tall",
      expectedCategory: "Tall",
      expectedPlacement: "tall",
      expectedWidth: Number(ovenTall[1]),
      expectedHeight: Number(ovenTall[2]),
      expectedDescriptionTerms: ["oven", "cabinet"],
    };
  }

  const blindCorner = normalizedCode.match(/^BBC(\d{2,3})/);
  if (blindCorner) {
    return {
      code,
      normalizedCode,
      family: "blind-corner-base",
      expectedCategory: "Base",
      expectedPlacement: "base",
      expectedWidth: Number(blindCorner[1]),
      expectedDescriptionTerms: ["blind", "corner", "base"],
    };
  }

  const base = normalizedCode.match(/^B(\d{2})(?:[A-Z].*)?$/);
  if (base) {
    return {
      code,
      normalizedCode,
      family: "base",
      expectedCategory: "Base",
      expectedPlacement: "base",
      expectedWidth: Number(base[1]),
      expectedDescriptionTerms: ["base"],
    };
  }

  const wall = normalizedCode.match(/^W(\d{2})(\d{2})$/);
  if (wall) {
    return {
      code,
      normalizedCode,
      family: "wall",
      expectedCategory: "Wall",
      expectedPlacement: "wall",
      expectedWidth: Number(wall[1]),
      expectedHeight: Number(wall[2]),
      expectedDescriptionTerms: ["wall"],
    };
  }

  const wallWidthOnly = normalizedCode.match(/^W(\d{2})(?:[A-Z].*)?$/);
  if (wallWidthOnly) {
    return {
      code,
      normalizedCode,
      family: "wall",
      expectedCategory: "Wall",
      expectedPlacement: "wall",
      expectedWidth: Number(wallWidthOnly[1]),
      expectedDescriptionTerms: ["wall"],
    };
  }

  if (/^(T|PAN|OV|UTILITY)/.test(normalizedCode)) {
    return {
      code,
      normalizedCode,
      family: "tall",
      expectedCategory: "Tall",
      expectedPlacement: "tall",
      expectedDescriptionTerms: ["tall"],
    };
  }

  return { code, normalizedCode, family: "unknown", expectedDescriptionTerms: [] };
}

/** Returns publish-blocking metadata issues inferred from a known code family. */
export function catalogNomenclatureIssues(input: CatalogTruthInput): CatalogTruthIssue[] {
  const nomenclature = parseCatalogNomenclature(input.masterCode);
  if (nomenclature.family === "unknown") return [];

  const issues: CatalogTruthIssue[] = [];
  const description = (input.description ?? "").trim().toLowerCase();
  if (!description || !nomenclature.expectedDescriptionTerms.every((term) => description.includes(term))) {
    issues.push("description-mismatch");
  }
  if (nomenclature.expectedCategory && input.category?.trim().toLowerCase() !== nomenclature.expectedCategory.toLowerCase()) {
    issues.push("category-mismatch");
  }
  if (nomenclature.expectedSubCategory && input.subCategory?.trim().toLowerCase() !== nomenclature.expectedSubCategory.toLowerCase()) {
    issues.push("subcategory-mismatch");
  }
  if (nomenclature.expectedPlacement && input.placementType?.trim().toLowerCase() !== nomenclature.expectedPlacement) {
    issues.push("placement-mismatch");
  }
  if (!matches(input.width, nomenclature.expectedWidth)) issues.push("width-mismatch");
  if (!matches(input.height, nomenclature.expectedHeight)) issues.push("height-mismatch");
  if (!matches(input.depth, nomenclature.expectedDepth)) issues.push("depth-mismatch");
  if (nomenclature.family === "wall-skin-veneer" && !input.catalogImageUrl?.trim()) {
    issues.push("generic-image-required");
  }
  return issues;
}

export function catalogNomenclatureIssueMessage(issues: CatalogTruthIssue[]): string {
  const labels: Record<CatalogTruthIssue, string> = {
    "description-mismatch": "description does not match the nomenclature code",
    "category-mismatch": "category does not match the nomenclature code",
    "subcategory-mismatch": "sub-category does not match the nomenclature code",
    "placement-mismatch": "placement does not match the nomenclature code",
    "width-mismatch": "width conflicts with the nomenclature code",
    "height-mismatch": "height conflicts with the nomenclature code",
    "depth-mismatch": "depth conflicts with the nomenclature code",
    "generic-image-required": "a matching generic image is required",
  };
  return issues.map((issue) => labels[issue]).join("; ");
}

export function isPositiveCatalogPrice(value: number | string | null | undefined): boolean {
  const parsed = numeric(value);
  return parsed != null && parsed > 0;
}

export function hasPositiveCatalogPrice(values: Array<number | string | null | undefined>): boolean {
  return values.some(isPositiveCatalogPrice);
}
