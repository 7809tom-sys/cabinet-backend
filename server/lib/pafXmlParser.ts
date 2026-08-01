/**
 * 20/20 ProKitchen PAF XML Parser
 * 
 * Deterministically parses paf.xml files from 20/20 catalog zip exports.
 * Extracts product codes, descriptions, dimensions, and pricing without AI interference.
 * 
 * Structure:
 * - <PAF> root contains <PRODUCT> elements
 * - Each <PRODUCT> has code, description, dimensions, pricing tiers
 * - <OPTION> elements define door styles, finishes, colors
 * - <IMAGE> elements reference product photos
 */

import { parseStringPromise } from "xml2js";

export interface PafProduct {
  code: string; // e.g., "3DB24" — the distributor's SKU
  description: string; // e.g., "3 Drawer Base 24"
  category: string; // e.g., "Base Cabinet", "Wall Cabinet"
  width?: number; // in inches
  height?: number; // in inches
  depth?: number; // in inches
  numberOfDoors?: number;
  numberOfDrawers?: number;
  listPrice?: number;
  imageUrl?: string; // relative path in zip
  catalogImageUrl?: string; // S3 URL after upload
  options?: PafOption[];
  cabinetStyle?: string; // closedDoors | openShelf | glass | etc
  productType?: string; // standard | endCap | corner | specialty | accessory
}

export interface PafOption {
  code: string; // e.g., "DOOR_STYLE"
  name: string; // e.g., "Door Style"
  values: PafOptionValue[];
}

export interface PafOptionValue {
  code: string; // e.g., "SHAKER"
  name: string; // e.g., "Shaker"
  priceModifier?: number; // price delta for this option
}

export interface PafParseResult {
  products: PafProduct[];
  errors: Array<{ code: string; message: string; details?: string }>;
}

/**
 * Parse a 20/20 paf.xml file and extract product data
 * Deterministic: no AI, pure XML structure parsing
 */
export async function parsePafXml(xmlContent: string): Promise<PafParseResult> {
  const errors: Array<{ code: string; message: string; details?: string }> = [];
  const products: PafProduct[] = [];

  try {
    // Parse XML with minimal options to preserve structure
    const parsed = await parseStringPromise(xmlContent, {
      mergeAttrs: true,
      explicitArray: false,
      trim: true,
    });

    const paf = parsed.PAF || parsed.paf;
    if (!paf) {
      errors.push({
        code: "INVALID_XML",
        message: "No PAF root element found in XML",
      });
      return { products, errors };
    }

    // Extract products
    const productElements = Array.isArray(paf.PRODUCT) ? paf.PRODUCT : [paf.PRODUCT];
    if (!productElements) {
      errors.push({
        code: "NO_PRODUCTS",
        message: "No PRODUCT elements found in PAF",
      });
      return { products, errors };
    }

    for (const elem of productElements) {
      try {
        const product = parsePafProduct(elem);
        if (product) {
          products.push(product);
        }
      } catch (err) {
        errors.push({
          code: "PRODUCT_PARSE_ERROR",
          message: `Failed to parse product: ${err instanceof Error ? err.message : String(err)}`,
          details: JSON.stringify(elem).slice(0, 200),
        });
      }
    }

    return { products, errors };
  } catch (err) {
    errors.push({
      code: "XML_PARSE_ERROR",
      message: `Failed to parse XML: ${err instanceof Error ? err.message : String(err)}`,
    });
    return { products, errors };
  }
}

/**
 * Parse a single PRODUCT element from PAF XML
 */
function parsePafProduct(elem: Record<string, unknown>): PafProduct | null {
  // Extract required fields
  const code = extractString(elem, "CODE");
  const description = extractString(elem, "DESCRIPTION");

  if (!code || !description) {
    return null; // Skip products without code/description
  }

  const product: PafProduct = {
    code: code.toUpperCase(),
    description,
    category: extractString(elem, "CATEGORY") || "Cabinet",
    cabinetStyle: detectCabinetStyle(description),
    productType: detectProductType(code, description),
  };

  // Dimensions (optional)
  const width = extractNumber(elem, "WIDTH");
  if (width) product.width = width;

  const height = extractNumber(elem, "HEIGHT");
  if (height) product.height = height;

  const depth = extractNumber(elem, "DEPTH");
  if (depth) product.depth = depth;

  // Counts (optional)
  const doors = extractNumber(elem, "DOORS");
  if (doors) product.numberOfDoors = doors;

  const drawers = extractNumber(elem, "DRAWERS");
  if (drawers) product.numberOfDrawers = drawers;

  // Pricing (optional)
  const listPrice = extractNumber(elem, "LIST_PRICE");
  if (listPrice) product.listPrice = listPrice;

  // Image (optional)
  const imageUrl = extractString(elem, "IMAGE_URL");
  if (imageUrl) product.imageUrl = imageUrl;

  // Options (optional)
  const options = extractOptions(elem);
  if (options.length > 0) {
    product.options = options;
  }

  return product;
}

/**
 * Detect cabinet style from description (openShelf vs closedDoors, etc.)
 */
function detectCabinetStyle(description: string): string {
  const desc = description.toLowerCase();
  if (desc.includes("open") || desc.includes("shelf")) return "openShelf";
  if (desc.includes("glass")) return "glass";
  if (desc.includes("drawer")) return "closedDoors"; // drawers imply closed
  return "closedDoors"; // default
}

/**
 * Detect product type from code and description (endCap, corner, specialty, etc.)
 */
function detectProductType(code: string, description: string): string {
  const codeUpper = code.toUpperCase();
  const descLower = description.toLowerCase();

  // End-cap cabinets: BES (open shelf), BEC (corner), etc.
  if (codeUpper.startsWith("BE")) return "endCap";
  if (codeUpper.startsWith("ES")) return "endCap";
  if (codeUpper.startsWith("EC")) return "endCap";

  // Corner cabinets
  if (codeUpper.includes("CORNER") || codeUpper.includes("COR") || descLower.includes("corner")) return "corner";

  // Specialty items: glass holders, spice racks, etc.
  if (codeUpper.includes("SGH") || codeUpper.includes("SG")) return "specialty"; // stem glass holder
  if (codeUpper.includes("SPICE") || descLower.includes("spice")) return "specialty";
  if (codeUpper.includes("KNEE") || descLower.includes("knee")) return "specialty";
  if (codeUpper.includes("DRAWER") && descLower.includes("knee")) return "specialty";
  if (descLower.includes("glass holder") || descLower.includes("stem glass")) return "specialty";
  if (descLower.includes("open shelf") && !descLower.includes("base")) return "specialty";

  // Accessories
  if (codeUpper.includes("ACC") || descLower.includes("accessory")) return "accessory";

  return "standard";
}

/**
 * Extract a string value from an element by key
 */
function extractString(elem: Record<string, unknown>, key: string): string | null {
  const value = elem[key];
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
    return (value[0] as string).trim();
  }
  return null;
}

/**
 * Extract a number value from an element by key
 */
function extractNumber(elem: Record<string, unknown>, key: string): number | null {
  const value = elem[key];
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  }
  if (Array.isArray(value) && value.length > 0) {
    const num = parseFloat(String(value[0]));
    return isNaN(num) ? null : num;
  }
  return null;
}

/**
 * Extract OPTION elements from a PRODUCT
 */
function extractOptions(elem: Record<string, unknown>): PafOption[] {
  const options: PafOption[] = [];
  const optionElements = elem.OPTION;

  if (!optionElements) return options;

  const optElems = Array.isArray(optionElements) ? optionElements : [optionElements];

  for (const optElem of optElems) {
    const opt = parsePafOption(optElem);
    if (opt) {
      options.push(opt);
    }
  }

  return options;
}

/**
 * Parse a single OPTION element
 */
function parsePafOption(elem: Record<string, unknown>): PafOption | null {
  const code = extractString(elem, "CODE");
  const name = extractString(elem, "NAME");

  if (!code || !name) return null;

  const option: PafOption = {
    code: code.toUpperCase(),
    name,
    values: [],
  };

  // Extract option values
  const valueElements = elem.VALUE;
  if (valueElements) {
    const valElems = Array.isArray(valueElements) ? valueElements : [valueElements];
    for (const valElem of valElems) {
      const val = parsePafOptionValue(valElem);
      if (val) {
        option.values.push(val);
      }
    }
  }

  return option;
}

/**
 * Parse a single VALUE element within an OPTION
 */
function parsePafOptionValue(elem: Record<string, unknown>): PafOptionValue | null {
  const code = extractString(elem, "CODE");
  const name = extractString(elem, "NAME");

  if (!code || !name) return null;

  const value: PafOptionValue = {
    code: code.toUpperCase(),
    name,
  };

  const priceModifier = extractNumber(elem, "PRICE_MODIFIER");
  if (priceModifier !== null) {
    value.priceModifier = priceModifier;
  }

  return value;
}

/**
 * Map a 20/20 product category string to our internal category
 * Deterministic: no AI, pure string matching
 */
/**
 * Map product code and category to our internal category.
 * Applies intelligent rules:
 * - W* prefix → Wall
 * - B* prefix → Base
 * - Molding/trim keywords → Accessory
 * - Small items (height ≤96" AND width <5") → Accessory
 * - Then standard category mapping
 */
/**
 * Map product code and category to our internal category.
 * LEARNED RULES (from admin recategorization) have the HIGHEST priority and can never be overridden.
 * Then apply default rules.
 */
export async function mapCategory(pafCategory: string, productCode?: string, width?: number, height?: number): Promise<string> {
  // Import here to avoid circular dependency
  const { checkLearnedRules } = await import("./learnedCategorization");
  
  // CHECK LEARNED RULES FIRST (highest priority - can never be overridden)
  const learnedCategory = await checkLearnedRules(productCode, width, height);
  if (learnedCategory) return learnedCategory;

  // Fall back to default rules
  const code = (productCode || "").toUpperCase();
  const cat = (pafCategory || "").toLowerCase().trim();

  // CODE-BASED RULES (highest priority in default rules)
  // Wall cabinets
  if (code.startsWith("W")) return "Wall";
  
  // Base cabinets
  if (code.startsWith("B")) return "Base";
  
  // Molding/trim items - check both code and description
  if (code.includes("MOLDING") || code.includes("TRIM") || code.includes("TOE") || 
      code.includes("COLD") || code.includes("PROM") || code.includes("CMA")) return "Accessory";
  
  if (cat.includes("molding") || cat.includes("trim") || cat.includes("toe kick") || 
      cat.includes("cold bay") || cat.includes("prom")) return "Accessory";
  
  // DIMENSIONAL RULES (height ≤96" AND width <5" = molding/trim)
  if (height !== undefined && width !== undefined && height <= 96 && width < 5) return "Accessory";

  // CATEGORY-BASED RULES (fallback)
  // Check for pantry/tall items FIRST before base items
  // This prevents "pantry drawer" from being miscategorized as Base
  if (cat.includes("tall") || cat.includes("pantry") || cat.includes("utility") || cat.includes("oven")) return "Tall";
  if (cat.includes("wall")) return "Wall";
  
  // Base cabinets: only if it explicitly says "base" or "sink"
  // Don't use "drawer" alone as it's too ambiguous (pantry drawers, specialty drawers, etc.)
  if (cat.includes("base") || cat.includes("sink")) return "Base";
  if (cat.includes("island")) return "Island";
  if (cat.includes("vanity")) return "Vanity";
  if (cat.includes("accessory") || cat.includes("trim") || cat.includes("molding") || cat.includes("filler")) return "Accessory";

  // Non-cabinet product types
  if (cat.includes("appliance") || cat.includes("refrigerator") || cat.includes("dishwasher") || cat.includes("range") || cat.includes("microwave") || cat.includes("hood")) return "Appliance";
  if (cat.includes("flooring") || cat.includes("hardwood") || cat.includes("laminate") || cat.includes("vinyl") || cat.includes("lvp") || cat.includes("lvt")) return "Flooring";
  if (cat.includes("tile") || cat.includes("backsplash") || cat.includes("mosaic") || cat.includes("porcelain") || cat.includes("ceramic")) return "Tile";
  if (cat.includes("faucet") || cat.includes("fixture")) return "Fixture";
  if (cat.includes("countertop") || cat.includes("quartz") || cat.includes("granite") || cat.includes("marble")) return "Countertop";
  if (cat.includes("shower") || cat.includes("toilet") || cat.includes("bidet") || cat.includes("tub") || cat.includes("bath")) return "Bath";
  if (cat.includes("lighting") || cat.includes("light")) return "Lighting";
  if (cat.includes("hardware") || cat.includes("pull") || cat.includes("knob") || cat.includes("hinge")) return "Hardware";

  // If the category string is non-empty and unrecognized, preserve it with title casing
  if (cat.length > 0) {
    return pafCategory.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  }

  return "Base"; // Default fallback for empty/missing category
}

/**
 * Map a 20/20 product code to our internal placementType
 * Deterministic: code-based pattern matching
 */
export function mapPlacementType(code: string, category: string): string {
  const codeUpper = (code || "").toUpperCase();
  const catLower = (category || "").toLowerCase();

  // Specialty items that sit on top of base cabinets (knee drawers, spice racks, etc.)
  // These are marked as 'baseTop' so the designer knows to position them at 24.5" height
  if (codeUpper.includes("KNEE") || catLower.includes("knee")) return "baseTop";
  if (codeUpper.includes("SPICE") || catLower.includes("spice")) return "baseTop";
  if (codeUpper.includes("SGH") || codeUpper.includes("SG") || catLower.includes("stem glass")) return "underCabinet";

  if (catLower.includes("wall")) return "wall";
  if (catLower.includes("tall") || catLower.includes("pantry") || catLower.includes("utility") || catLower.includes("oven")) return "tall";
  if (catLower.includes("island")) return "island";
  if (catLower.includes("accessory") || catLower.includes("trim") || catLower.includes("molding") || catLower.includes("filler")) return "accessory";
  if (catLower.includes("appliance") || catLower.includes("flooring") || catLower.includes("tile") || catLower.includes("faucet") || catLower.includes("fixture") || catLower.includes("countertop") || catLower.includes("bath") || catLower.includes("lighting") || catLower.includes("hardware")) return "other";

  return "base"; // Default fallback
}
