/**
 * 20/20 Catalog Import Logic
 * 
 * Deterministic auto-import workflow:
 * 1. Parse PAF XML to extract products
 * 2. For each product: create or update cabinet record
 * 3. Create distributor SKU entries with pricing
 * 4. Preserve existing prices if preservePricing flag is set
 * 5. Track created/updated/skipped counts
 * 6. Return error log for any issues
 */

import { getDb } from "../db";
import { cabinets, distributorSkus, doorStyles, distributorCabinetOverrides } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { PafProduct } from "./pafXmlParser";
import { mapCategory, mapPlacementType } from "./pafXmlParser";

export interface ImportStats {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ code: string; message: string; details?: string }>;
}

/**
 * Process parsed PAF products and create/update cabinet records
 * Deterministic: no AI, pure data mapping
 */
export async function importPafProducts(
  distributorId: number,
  products: PafProduct[],
  preservePricing: boolean
): Promise<ImportStats> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

  const stats: ImportStats = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  // Get the default door style for this distributor (fallback for products without style)
  const defaultStyle = await getDefaultDoorStyle(db, distributorId);
  if (!defaultStyle) {
    stats.errors.push({
      code: "NO_DEFAULT_STYLE",
      message: `No default door style found for distributor ${distributorId}`,
    });
    return stats;
  }

  for (const product of products) {
    try {
      const result = await importSingleProduct(
        db,
        distributorId,
        product,
        defaultStyle.id,
        preservePricing
      );

      if (result.type === "created") stats.created++;
      else if (result.type === "updated") stats.updated++;
      else if (result.type === "skipped") stats.skipped++;

      if (result.error) {
        stats.errors.push(result.error);
      }
    } catch (err) {
      stats.errors.push({
        code: "IMPORT_ERROR",
        message: `Failed to import product ${product.code}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return stats;
}

/**
 * Get the default door style for a distributor
 * Falls back to the first available style if none is marked as default
 */
async function getDefaultDoorStyle(
  db: Awaited<ReturnType<typeof getDb>>,
  distributorId: number
) {
  if (!db) return null;

  // Try to find a style marked as default for this distributor
  const [defaultStyle] = await db
    .select()
    .from(doorStyles)
    .where(and(eq(doorStyles.distributorId, distributorId)))
    .limit(1);

  return defaultStyle || null;
}

/**
 * Import a single PAF product
 * Returns: { type: 'created' | 'updated' | 'skipped', error?: ErrorInfo }
 */
async function importSingleProduct(
  db: Awaited<ReturnType<typeof getDb>>,
  distributorId: number,
  product: PafProduct,
  defaultStyleId: number,
  preservePricing: boolean
): Promise<{ type: "created" | "updated" | "skipped"; error?: { code: string; message: string; details?: string } }> {
  if (!db) {
    return {
      type: "skipped",
      error: { code: "DB_ERROR", message: "Database not available" },
    };
  }

  // Validate required fields
  if (!product.code || !product.description) {
    return {
      type: "skipped",
      error: {
        code: "MISSING_FIELDS",
        message: `Product missing code or description`,
        details: JSON.stringify(product).slice(0, 100),
      },
    };
  }

  // Map category and placement type
  const mappedCategory = mapCategory(product.category);
  const mappedPlacementType = mapPlacementType(product.code, product.category);

  // Check if cabinet already exists by masterCode
  const [existingCabinet] = await db
    .select({ id: cabinets.id })
    .from(cabinets)
    .where(eq(cabinets.masterCode, product.code.toUpperCase()))
    .limit(1);

  if (existingCabinet) {
    // Update existing cabinet
    const patch: Record<string, unknown> = {
      description: product.description,
      category: mappedCategory,
      placementType: mappedPlacementType,
      descriptionSource: "20/20 Catalog Import",
    };

    // Update dimensions if provided
    if (product.width) patch.width = product.width;
    if (product.height) patch.height = product.height;
    if (product.depth) patch.depth = product.depth;

    // Update counts if provided
    if (product.numberOfDoors !== undefined) patch.numberOfDoors = product.numberOfDoors;
    if (product.numberOfDrawers !== undefined) patch.numberOfDrawers = product.numberOfDrawers;

    await db.update(cabinets).set(patch).where(eq(cabinets.id, existingCabinet.id));

    // Create or update distributor SKU
    await createOrUpdateDistributorSku(
      db,
      existingCabinet.id,
      distributorId,
      defaultStyleId,
      product,
      preservePricing
    );

    return { type: "updated" };
  } else {
    // Create new cabinet
    const insertData: any = {
      masterCode: product.code.toUpperCase(),
      description: product.description,
      category: mappedCategory,
      placementType: mappedPlacementType,
      descriptionSource: "20/20 Catalog Import",
      isActive: true,
      showInCatalog: true,
      showInDesigner: true,
      showIn2020: true,
    };

    // Add dimensions if provided
    if (product.width) insertData.width = product.width;
    if (product.height) insertData.height = product.height;
    if (product.depth) insertData.depth = product.depth;

    // Add counts if provided
    if (product.numberOfDoors !== undefined) insertData.numberOfDoors = product.numberOfDoors;
    if (product.numberOfDrawers !== undefined) insertData.numberOfDrawers = product.numberOfDrawers;

    await db.insert(cabinets).values(insertData);

    // Get the newly inserted cabinet
    const [newCabinet] = await db
      .select({ id: cabinets.id })
      .from(cabinets)
      .where(eq(cabinets.masterCode, product.code.toUpperCase()))
      .limit(1);

    if (!newCabinet) {
      return {
        type: "skipped",
        error: { code: "INSERT_FAILED", message: `Failed to insert cabinet ${product.code}` },
      };
    }

    const cabinetId = newCabinet.id;

    // Create distributor SKU
    await createOrUpdateDistributorSku(
      db,
      cabinetId,
      distributorId,
      defaultStyleId,
      product,
      preservePricing
    );

    return { type: "created" };
  }
}

/**
 * Create or update distributor SKU with pricing
 * Preserves existing prices if preservePricing flag is set
 */
async function createOrUpdateDistributorSku(
  db: Awaited<ReturnType<typeof getDb>>,
  cabinetId: number,
  distributorId: number,
  styleId: number,
  product: PafProduct,
  preservePricing: boolean
): Promise<void> {
  if (!db) return;

  // Generate platform SKU: masterCode-DIST
  const platformSku = `${product.code.toUpperCase()}-${distributorId}`;

  // Check if SKU already exists
  const [existingSku] = await db
    .select()
    .from(distributorSkus)
    .where(
      and(
        eq(distributorSkus.cabinetId, cabinetId),
        eq(distributorSkus.distributorId, distributorId),
        eq(distributorSkus.styleId, styleId)
      )
    )
    .limit(1);

  if (existingSku) {
    // Update existing SKU (preserve prices if flag is set)
    const patch: Record<string, unknown> = {
      distributorSku: product.code.toUpperCase(),
    };

    if (!preservePricing && product.listPrice) {
      patch.listPrice = product.listPrice;
    }

    await db
      .update(distributorSkus)
      .set(patch)
      .where(eq(distributorSkus.id, existingSku.id));
  } else {
    // Create new SKU
    const skuData: any = {
      cabinetId,
      distributorId,
      styleId,
      platformSku,
      distributorSku: product.code.toUpperCase(),
      isAvailable: true,
      isPublished: true,
      status: "approved",
    };

    if (product.listPrice) {
      skuData.listPrice = product.listPrice;
    }

    await db.insert(distributorSkus).values(skuData);
  }
}
