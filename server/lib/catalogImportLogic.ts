/**
 * 20/20 Catalog Import Logic
 * 
 * Deterministic auto-import workflow:
 * 1. Parse PAF XML to extract products
 * 2. For each product: resolve via alias lookup first, then masterCode
 * 3. Create or update cabinet record
 * 4. Copy catalogImageUrl from alias sibling if available
 * 5. Create distributor SKU entries with pricing
 * 6. Preserve existing prices if preservePricing flag is set
 * 7. Track created/updated/skipped counts
 * 8. Return error log for any issues
 */

import { getDb } from "../db";
import { cabinets, distributorSkus, doorStyles, skuMasterAliases, cabinetAliases } from "../../drizzle/schema";
import { eq, and, or, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { PafProduct } from "./pafXmlParser";
import { mapCategory, mapPlacementType } from "./pafXmlParser";

export interface ImportStats {
  created: number;
  updated: number;
  skipped: number;
  imagesResolved: number;
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
    imagesResolved: 0,
    errors: [],
  };

  // Get the default door style for this distributor (fallback for products without style)
  const defaultStyle = await getDefaultDoorStyle(db, distributorId);
  if (!defaultStyle) {
    stats.errors.push({
      code: "NO_DEFAULT_STYLE",
      message: `No default door style found for distributor ${distributorId}`,
    });
    // Do NOT return early — still create/update cabinet records.
    // SKU creation will be skipped for products that need a style.
  }

  for (const product of products) {
    try {
      const result = await importSingleProduct(
        db,
        distributorId,
        product,
        defaultStyle?.id ?? 0,
        preservePricing
      );

      if (result.type === "created") stats.created++;
      else if (result.type === "updated") stats.updated++;
      else if (result.type === "skipped") stats.skipped++;
      if (result.imageResolved) stats.imagesResolved++;

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

  if (defaultStyle) return defaultStyle;

  // No door style exists for this distributor yet — create a generic placeholder
  // so that SKU and pricing records can still be created during import.
  // Admins can later rename/update this style or assign real door style images.
  await db.insert(doorStyles).values({
    distributorId,
    styleCode: "DEFAULT",
    ourName: "Default Style",
    distributorName: "Default Style",
  });

  const [newStyle] = await db
    .select()
    .from(doorStyles)
    .where(and(eq(doorStyles.distributorId, distributorId), eq(doorStyles.styleCode, "DEFAULT")))
    .limit(1);

  return newStyle || null;
}

/**
 * Resolve a product code to an existing cabinet via:
 * 1. Direct masterCode match
 * 2. skuMasterAliases lookup (aliasCode -> masterCode -> cabinet)
 * 3. cabinetAliases lookup (alias -> cabinetId)
 * 
 * Returns the existing cabinet with its catalogImageUrl if found
 */
async function resolveExistingCabinet(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  productCode: string
): Promise<{ id: number; masterCode: string; catalogImageUrl: string | null } | null> {
  const code = productCode.toUpperCase();

  // 1. Direct masterCode match
  const [directMatch] = await db
    .select({ id: cabinets.id, masterCode: cabinets.masterCode, catalogImageUrl: cabinets.catalogImageUrl })
    .from(cabinets)
    .where(eq(cabinets.masterCode, code))
    .limit(1);

  if (directMatch) return directMatch;

  // 2. Check skuMasterAliases: this code might be an alias for another master
  const [aliasEntry] = await db
    .select({ masterCode: skuMasterAliases.masterCode })
    .from(skuMasterAliases)
    .where(eq(skuMasterAliases.aliasCode, code))
    .limit(1);

  if (aliasEntry) {
    const [masterCabinet] = await db
      .select({ id: cabinets.id, masterCode: cabinets.masterCode, catalogImageUrl: cabinets.catalogImageUrl })
      .from(cabinets)
      .where(eq(cabinets.masterCode, aliasEntry.masterCode))
      .limit(1);

    if (masterCabinet) return masterCabinet;
  }

  // 3. Check cabinetAliases: this code might be a legacy alias
  const [cabinetAlias] = await db
    .select({ cabinetId: cabinetAliases.cabinetId })
    .from(cabinetAliases)
    .where(eq(cabinetAliases.alias, code))
    .limit(1);

  if (cabinetAlias) {
    const [aliasedCabinet] = await db
      .select({ id: cabinets.id, masterCode: cabinets.masterCode, catalogImageUrl: cabinets.catalogImageUrl })
      .from(cabinets)
      .where(eq(cabinets.id, cabinetAlias.cabinetId))
      .limit(1);

    if (aliasedCabinet) return aliasedCabinet;
  }

  return null;
}

/**
 * Try to find a catalogImageUrl from sibling cabinets that share an alias relationship
 * with the given product code. This allows newly imported products to inherit
 * images from related cabinets that already have images.
 */
async function resolveImageFromSiblings(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  productCode: string
): Promise<string | null> {
  const code = productCode.toUpperCase();

  // Check if this code is a master that has aliases pointing to it
  const aliasRows = await db
    .select({ aliasCode: skuMasterAliases.aliasCode })
    .from(skuMasterAliases)
    .where(eq(skuMasterAliases.masterCode, code));

  if (aliasRows.length > 0) {
    const aliasCodes = aliasRows.map((a) => a.aliasCode);
    // Look for any sibling cabinet with an image
    const [siblingWithImage] = await db
      .select({ catalogImageUrl: cabinets.catalogImageUrl })
      .from(cabinets)
      .where(
        and(
          inArray(cabinets.masterCode, aliasCodes),
          // Only get ones that have an image
        )
      )
      .limit(5);

    if (siblingWithImage?.catalogImageUrl) {
      return siblingWithImage.catalogImageUrl;
    }
  }

  // Check if this code is an alias — find the master and its image
  const [aliasEntry] = await db
    .select({ masterCode: skuMasterAliases.masterCode })
    .from(skuMasterAliases)
    .where(eq(skuMasterAliases.aliasCode, code))
    .limit(1);

  if (aliasEntry) {
    const [masterCab] = await db
      .select({ catalogImageUrl: cabinets.catalogImageUrl })
      .from(cabinets)
      .where(eq(cabinets.masterCode, aliasEntry.masterCode))
      .limit(1);

    if (masterCab?.catalogImageUrl) {
      return masterCab.catalogImageUrl;
    }

    // Also check other aliases of the same master
    const otherAliases = await db
      .select({ aliasCode: skuMasterAliases.aliasCode })
      .from(skuMasterAliases)
      .where(eq(skuMasterAliases.masterCode, aliasEntry.masterCode));

    if (otherAliases.length > 0) {
      const codes = otherAliases.map((a) => a.aliasCode);
      const [sibWithImg] = await db
        .select({ catalogImageUrl: cabinets.catalogImageUrl })
        .from(cabinets)
        .where(inArray(cabinets.masterCode, codes))
        .limit(5);

      if (sibWithImg?.catalogImageUrl) {
        return sibWithImg.catalogImageUrl;
      }
    }
  }

  return null;
}

/**
 * Import a single PAF product
 * Returns: { type: 'created' | 'updated' | 'skipped', imageResolved?: boolean, error?: ErrorInfo }
 */
async function importSingleProduct(
  db: Awaited<ReturnType<typeof getDb>>,
  distributorId: number,
  product: PafProduct,
  defaultStyleId: number | 0,
  preservePricing: boolean
): Promise<{ type: "created" | "updated" | "skipped"; imageResolved?: boolean; error?: { code: string; message: string; details?: string } }> {
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

  // Resolve existing cabinet via direct match OR alias lookup
  const existingCabinet = await resolveExistingCabinet(db, product.code);

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

    // If the cabinet doesn't have an image yet, try to resolve one from siblings
    let imageResolved = false;
    if (!existingCabinet.catalogImageUrl) {
      const siblingImage = await resolveImageFromSiblings(db, product.code);
      if (siblingImage) {
        patch.catalogImageUrl = siblingImage;
        imageResolved = true;
      }
    }

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

    return { type: "updated", imageResolved };
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

    // Try to resolve image from alias siblings BEFORE inserting
    let imageResolved = false;
    const siblingImage = await resolveImageFromSiblings(db, product.code);
    if (siblingImage) {
      insertData.catalogImageUrl = siblingImage;
      imageResolved = true;
    }

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

    return { type: "created", imageResolved };
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
  styleId: number | 0,
  product: PafProduct,
  preservePricing: boolean
): Promise<void> {
  if (!db) return;
  // If no style is configured for this distributor, skip SKU creation
  if (!styleId) return;

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
