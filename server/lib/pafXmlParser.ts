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
  options?: PafOption[];
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
export function mapCategory(pafCategory: string): string {
  const cat = (pafCategory || "").toLowerCase().trim();

  if (cat.includes("wall")) return "Wall";
  if (cat.includes("tall") || cat.includes("pantry") || cat.includes("utility") || cat.includes("oven")) return "Tall";
  if (cat.includes("base") || cat.includes("sink") || cat.includes("drawer")) return "Base";
  if (cat.includes("island")) return "Island";
  if (cat.includes("vanity")) return "Vanity";
  if (cat.includes("accessory") || cat.includes("trim") || cat.includes("molding") || cat.includes("filler")) return "Accessory";

  return "Base"; // Default fallback
}

/**
 * Map a 20/20 product code to our internal placementType
 * Deterministic: code-based pattern matching
 */
export function mapPlacementType(code: string, category: string): string {
  const codeUpper = (code || "").toUpperCase();
  const catLower = (category || "").toLowerCase();

  if (catLower.includes("wall")) return "wall";
  if (catLower.includes("tall") || catLower.includes("pantry") || catLower.includes("utility") || catLower.includes("oven")) return "tall";
  if (catLower.includes("island")) return "island";
  if (catLower.includes("accessory") || catLower.includes("trim") || catLower.includes("molding") || catLower.includes("filler")) return "accessory";

  return "base"; // Default fallback
}
