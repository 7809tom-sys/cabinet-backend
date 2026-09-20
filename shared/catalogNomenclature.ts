export type CatalogNomenclatureFamily =
  | "wall-skin-veneer"
  | "base"
  | "blind-corner-base"
  | "wall"
  | "angle-wall"
  | "diagonal-corner-wall"
  | "wall-blind-corner"
  | "wall-plate-rack"
  | "chrome-tray"
  | "tall"
  | "ada"
  | "unknown";

export type CatalogNomenclature = {
  code: string;
  normalizedCode: string;
  /** One durable code identity used for aliases and master creation when normalized. */
  canonicalMasterCode?: string;
  family: CatalogNomenclatureFamily;
  expectedCategory?: string;
  expectedSubCategory?: string;
  expectedPlacement?: "base" | "wall" | "tall" | "accessory";
  expectedWidth?: number;
  expectedHeight?: number;
  expectedDepth?: number;
  /** Roll-out shelf count encoded by a #RS suffix, when present. */
  rollOutShelfCount?: number;
  /** Full-height bases intentionally omit the normal utility drawer. */
  isFullHeightBase?: boolean;
  /** Exact drawer count when the nomenclature unambiguously defines one. */
  expectedDrawerCount?: number;
  /** ADA may be written before or after the structural cabinet code. */
  isAdaAccessible?: boolean;
  /** Structural code after removing the positional ADA marker. */
  adaCoreCode?: string;
  /** Only confirmed ADA core patterns receive a product-specific description. */
  adaProductKind?: "base" | "three-drawer-base" | "three-drawer-vanity-base" | "vanity-sink-base" | "sink-base";
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
  numberOfDrawers?: number | null | undefined;
  catalogImageUrl?: string | null | undefined;
};

export type DesignerFriendlyDescriptionInput = Pick<
  CatalogTruthInput,
  "masterCode" | "width" | "height" | "depth"
> & {
  numberOfDoors?: number | null | undefined;
  numberOfDrawers?: number | null | undefined;
  numberOfFixedShelves?: number | null | undefined;
  numberOfAdjShelves?: number | null | undefined;
};

export type CatalogTruthIssue =
  | "description-mismatch"
  | "category-mismatch"
  | "subcategory-mismatch"
  | "placement-mismatch"
  | "width-mismatch"
  | "height-mismatch"
  | "depth-mismatch"
  | "drawer-layout-mismatch";

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

function displayDimension(value: number | string | null | undefined): string | null {
  const parsed = numeric(value);
  if (parsed == null) return null;
  return Number.isInteger(parsed) ? String(parsed) : String(parsed);
}

function dimensionLabel(values: Array<number | string | null | undefined>): string | null {
  const dimensions = values.map(displayDimension);
  return dimensions.every((value): value is string => value != null)
    ? `${dimensions.map((value) => `${value}\"`).join(" × ")}`
    : null;
}

function countLabel(
  count: number | null | undefined,
  singular: string,
  plural = `${singular}s`,
): string | null {
  if (count == null || !Number.isFinite(count) || count <= 0) return null;
  return `${count} ${count === 1 ? singular : plural}`;
}

function joinProductDetails(details: Array<string | null>): string {
  const present = details.filter((detail): detail is string => Boolean(detail));
  return present.length > 0 ? ` — ${present.join(", ")}` : "";
}

/**
 * ADA is a positional marker, not a different physical cabinet code. The
 * canonical platform form always places it first, so ADA-B12 and B12ADA resolve
 * to the same master identity while the distributor's original SKU stays on its
 * supplier line.
 */
export function canonicalCatalogMasterCode(masterCode: string): string {
  const code = masterCode.trim().toUpperCase();
  const normalized = code.replace(/[^A-Z0-9]/g, "");
  const adaCore = normalized.startsWith("ADA") && normalized.length > 3
    ? normalized.slice(3)
    : normalized.endsWith("ADA") && normalized.length > 3
      ? normalized.slice(0, -3)
      : null;
  return adaCore ? `ADA-${adaCore}` : code;
}

function positionalAdaCore(normalizedCode: string): string | null {
  if (normalizedCode.startsWith("ADA") && normalizedCode.length > 3) return normalizedCode.slice(3);
  if (normalizedCode.endsWith("ADA") && normalizedCode.length > 3) return normalizedCode.slice(0, -3);
  return null;
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

  // ADA is a position-only code marker: ADA-B12 and B12ADA identify the same
  // accessible cabinet. The structural core controls geometry while the ADA
  // marker controls category, public wording, and the canonical alias route.
  const adaCoreCode = positionalAdaCore(normalizedCode);
  if (adaCoreCode) {
    const adaBase = {
      code,
      normalizedCode,
      canonicalMasterCode: `ADA-${adaCoreCode}`,
      isAdaAccessible: true,
      adaCoreCode,
      expectedCategory: "ADA",
      expectedPlacement: "base" as const,
    };
    const adaThreeDrawerBase = adaCoreCode.match(/^3DB(\d{2})$/);
    if (adaThreeDrawerBase) {
      return {
        ...adaBase,
        family: "ada",
        expectedSubCategory: "ADA Base",
        expectedWidth: Number(adaThreeDrawerBase[1]),
        expectedHeight: 32.5,
        expectedDepth: 24,
        expectedDrawerCount: 3,
        adaProductKind: "three-drawer-base",
        expectedDescriptionTerms: ["ada", "three", "drawer", "base"],
      };
    }

    const adaVanityDrawerBase = adaCoreCode.match(/^3VDB(\d{2})$/);
    if (adaVanityDrawerBase) {
      return {
        ...adaBase,
        family: "ada",
        expectedSubCategory: "ADA Vanity",
        expectedWidth: Number(adaVanityDrawerBase[1]),
        expectedHeight: 32.5,
        expectedDepth: 21,
        expectedDrawerCount: 3,
        adaProductKind: "three-drawer-vanity-base",
        expectedDescriptionTerms: ["ada", "three", "drawer", "vanity", "base"],
      };
    }

    const adaBaseCabinet = adaCoreCode.match(/^B(\d{2})$/);
    if (adaBaseCabinet) {
      return {
        ...adaBase,
        family: "ada",
        expectedSubCategory: "ADA Base",
        expectedWidth: Number(adaBaseCabinet[1]),
        expectedHeight: 32.5,
        expectedDepth: 24,
        adaProductKind: "base",
        expectedDescriptionTerms: ["ada", "base", "cabinet"],
      };
    }

    const adaVanitySinkBase = adaCoreCode.match(/^VS(\d{2})$/);
    if (adaVanitySinkBase) {
      return {
        ...adaBase,
        family: "ada",
        expectedSubCategory: "ADA Vanity",
        expectedWidth: Number(adaVanitySinkBase[1]),
        expectedHeight: 32.5,
        expectedDepth: 21,
        adaProductKind: "vanity-sink-base",
        expectedDescriptionTerms: ["ada", "vanity", "sink", "base"],
      };
    }

    const adaSinkBase = adaCoreCode.match(/^SB(\d{2})R$/);
    if (adaSinkBase) {
      return {
        ...adaBase,
        family: "ada",
        expectedSubCategory: "ADA Sink Base",
        expectedWidth: Number(adaSinkBase[1]),
        expectedHeight: 32.5,
        expectedDepth: 24,
        adaProductKind: "sink-base",
        expectedDescriptionTerms: ["ada", "removable", "sink", "base"],
      };
    }

    // Preserve the canonical ADA identity for a new specialty core without
    // guessing dimensions, doors, shelves, category, or artwork.
    return {
      ...adaBase,
      family: "ada",
      expectedDescriptionTerms: ["ada"],
    };
  }

  // Full-height base: B18FH2RS = 18-inch base, no utility drawer, two
  // roll-out shelves. Width is optional so the generic BFH2RS notation can be
  // described without inventing a size.
  const fullHeightRollOutBase = normalizedCode.match(/^B(?:(\d{2}))?FH([1-9]\d*)RS$/);
  if (fullHeightRollOutBase) {
    const width = fullHeightRollOutBase[1] == null ? undefined : Number(fullHeightRollOutBase[1]);
    const rollOutShelfCount = Number(fullHeightRollOutBase[2]);
    return {
      code,
      normalizedCode,
      family: "base",
      expectedCategory: "Base",
      expectedSubCategory: "Full Height",
      expectedPlacement: "base",
      expectedWidth: width,
      expectedDrawerCount: 0,
      isFullHeightBase: true,
      rollOutShelfCount,
      expectedDescriptionTerms: ["full-height", "base", "no drawer", "roll-out", "shelf"],
    };
  }

  // Regular base: B121RS = B12 standard drawer base with one roll-out shelf.
  // The #RS suffix adds shelves; it does not remove the regular utility drawer.
  const regularRollOutBase = normalizedCode.match(/^B(\d{2})([1-9]\d*)RS$/);
  if (regularRollOutBase) {
    const rollOutShelfCount = Number(regularRollOutBase[2]);
    return {
      code,
      normalizedCode,
      family: "base",
      expectedCategory: "Base",
      expectedPlacement: "base",
      expectedWidth: Number(regularRollOutBase[1]),
      expectedDrawerCount: 1,
      isFullHeightBase: false,
      rollOutShelfCount,
      expectedDescriptionTerms: ["base", "drawer", "roll-out", "shelf"],
    };
  }

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

  const chromeTray = normalizedCode.match(/^CHROMETRAY(33|36)$/);
  if (chromeTray) {
    return {
      code,
      normalizedCode,
      family: "chrome-tray",
      expectedCategory: "Accessory",
      expectedSubCategory: "Lazy Susan Insert",
      expectedPlacement: "accessory",
      expectedDescriptionTerms: ["chrome", "tray", `erb${chromeTray[1]}`],
    };
  }

  const diagonalWall = normalizedCode.match(/^DCW(\d{2})(\d{2})$/);
  if (diagonalWall) {
    return {
      code,
      normalizedCode,
      family: "diagonal-corner-wall",
      expectedCategory: "Wall",
      expectedPlacement: "wall",
      expectedWidth: Number(diagonalWall[1]),
      expectedHeight: Number(diagonalWall[2]),
      expectedDepth: 12,
      expectedDescriptionTerms: ["diagonal", "corner", "wall"],
    };
  }

  const wallBlindCorner = normalizedCode.match(/^WBC(\d{2})(\d{2})$/);
  if (wallBlindCorner) {
    return {
      code,
      normalizedCode,
      family: "wall-blind-corner",
      expectedCategory: "Wall",
      expectedPlacement: "wall",
      expectedWidth: Number(wallBlindCorner[1]),
      expectedHeight: Number(wallBlindCorner[2]),
      expectedDepth: 12,
      expectedDescriptionTerms: ["wall", "blind", "corner"],
    };
  }

  const plateRack = normalizedCode.match(/^PR(\d{2})(\d{2})$/);
  if (plateRack) {
    return {
      code,
      normalizedCode,
      family: "wall-plate-rack",
      expectedCategory: "Wall",
      expectedPlacement: "wall",
      expectedWidth: Number(plateRack[1]),
      expectedHeight: Number(plateRack[2]),
      expectedDepth: 12,
      expectedDescriptionTerms: ["wall", "plate", "rack"],
    };
  }

  const angleWall = normalizedCode.match(/^AW(\d{2})(\d{2})$/);
  if (angleWall) {
    return {
      code,
      normalizedCode,
      family: "angle-wall",
      expectedCategory: "Wall",
      expectedPlacement: "wall",
      expectedWidth: Number(angleWall[1]),
      expectedHeight: Number(angleWall[2]),
      expectedDepth: 12,
      expectedDescriptionTerms: ["angle", "wall"],
    };
  }

  const utilityTall = normalizedCode.match(/^U(\d{2})(\d{2})(\d{2})$/);
  if (utilityTall) {
    return {
      code,
      normalizedCode,
      family: "tall",
      expectedCategory: "Tall",
      expectedPlacement: "tall",
      expectedWidth: Number(utilityTall[1]),
      expectedHeight: Number(utilityTall[2]),
      expectedDepth: Number(utilityTall[3]),
      expectedDescriptionTerms: ["tall", "pantry"],
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

/**
 * Returns a concise designer-facing description when a code unambiguously
 * identifies the item. It intentionally leaves unknown nomenclature alone rather
 * than guessing at product structure, dimensions, doors, or shelves.
 */
export function designerFriendlyDescription(input: DesignerFriendlyDescriptionInput): string | null {
  const nomenclature = parseCatalogNomenclature(input.masterCode);
  const width = nomenclature.expectedWidth ?? numeric(input.width);
  const height = nomenclature.expectedHeight ?? numeric(input.height);
  const depth = nomenclature.expectedDepth ?? numeric(input.depth);
  const dimensions = dimensionLabel([width, height, depth]);
  const door = countLabel(input.numberOfDoors, "Door");
  const shelfCount = Math.max(0, input.numberOfFixedShelves ?? 0) + Math.max(0, input.numberOfAdjShelves ?? 0);
  const shelves = countLabel(shelfCount, "Shelf", "Shelves");

  switch (nomenclature.family) {
    case "ada": {
      if (!nomenclature.adaProductKind) return null;
      const doorDetail = countLabel(input.numberOfDoors, "Door");
      const drawerDetail = countLabel(input.numberOfDrawers, "Drawer");
      const adaDetails = [doorDetail, drawerDetail, shelves];
      switch (nomenclature.adaProductKind) {
        case "three-drawer-base":
          return `${dimensions ?? ""}${dimensions ? " " : ""}ADA Three-Drawer Base Cabinet`;
        case "three-drawer-vanity-base":
          return `${dimensions ?? ""}${dimensions ? " " : ""}ADA Three-Drawer Vanity Base Cabinet`;
        case "base":
          return `${dimensions ?? ""}${dimensions ? " " : ""}ADA Accessible Base Cabinet${joinProductDetails(adaDetails)}`;
        case "vanity-sink-base":
          return `${dimensions ?? ""}${dimensions ? " " : ""}ADA Vanity Sink Base Cabinet${joinProductDetails([doorDetail, shelves])}`;
        case "sink-base":
          return `${dimensions ?? ""}${dimensions ? " " : ""}ADA Removable Sink Base Cabinet`;
        default:
          return null;
      }
    }
    case "base": {
      if (nomenclature.rollOutShelfCount == null) return null;
      const rollOutShelves = countLabel(nomenclature.rollOutShelfCount, "Roll-Out Shelf", "Roll-Out Shelves");
      const baseName = nomenclature.isFullHeightBase ? "Full-Height Base Cabinet" : "Base Cabinet";
      const drawerDetail = nomenclature.isFullHeightBase ? "No Drawer" : "1 Drawer";
      return `${dimensions ?? ""}${dimensions ? " " : ""}${baseName}${joinProductDetails([drawerDetail, rollOutShelves])}`;
    }
    case "wall-skin-veneer":
      return dimensions ? `${dimensions} Wall Skin / Scribe Veneer Panel` : "Wall Skin / Scribe Veneer Panel";
    case "chrome-tray": {
      const size = nomenclature.normalizedCode.replace("CHROMETRAY", "");
      return `Chrome Tray Insert for ERB${size} Easy-Reach Corner Cabinet`;
    }
    case "diagonal-corner-wall":
      return `${dimensions ?? ""}${dimensions ? " " : ""}Diagonal Corner Wall Cabinet${joinProductDetails([door, shelves])}`;
    case "wall-blind-corner":
      return `${dimensions ?? ""}${dimensions ? " " : ""}Wall Blind Corner Cabinet${joinProductDetails([door, shelves])}`;
    case "wall-plate-rack":
      return `${dimensions ?? ""}${dimensions ? " " : ""}Wall Plate Rack Cabinet`;
    case "angle-wall":
      return `${dimensions ?? ""}${dimensions ? " " : ""}Angle Wall Cabinet${joinProductDetails([door, shelves])}`;
    case "wall":
      return `${dimensions ?? ""}${dimensions ? " " : ""}Wall Cabinet${joinProductDetails([door, shelves])}`;
    case "tall":
      if (nomenclature.normalizedCode.startsWith("U")) {
        return `${dimensions ?? ""}${dimensions ? " " : ""}Tall Pantry Cabinet${joinProductDetails([door, shelves])}`;
      }
      return null;
    default:
      return null;
  }
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
  if (nomenclature.expectedDrawerCount != null && input.numberOfDrawers != null && input.numberOfDrawers !== nomenclature.expectedDrawerCount) {
    issues.push("drawer-layout-mismatch");
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
    "drawer-layout-mismatch": "drawer layout conflicts with the nomenclature code",
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
