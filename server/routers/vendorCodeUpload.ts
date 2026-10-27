import { z } from "zod";
import { and, eq, ne, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { distributorProcedure, router } from "../_core/trpc";
import { resolveVendorCatalogLineId } from "../lib/approvedVendorAccess";
import { getDb } from "../db";
import {
  cabinetAliases,
  cabinets,
  codeAliases,
  distributorSkus,
  distributors,
  doorStyles,
  skuMasterAliases,
} from "../../drizzle/schema";
import { normalizeCode } from "../../shared/cabinetCodeMatch";
import {
  MAX_PRICE,
  MAX_UPLOAD_ROWS,
  buildPlatformSku,
  planCodeUpload,
  summarizePlan,
  type PlanAliasLink,
  type PlannedRow,
} from "../../shared/vendorCodeUpload";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const rowsInput = z.object({
  distributorId: z.number().int().positive().optional(),
  rows: z.array(z.object({
    rowNumber: z.number().int().positive(),
    code: z.string().trim().min(1).max(128),
    door: z.string().trim().min(1).max(128),
    price: z.number().finite().positive().max(MAX_PRICE).optional(),
    cost: z.number().finite().positive().max(MAX_PRICE).optional(),
  })).min(1).max(MAX_UPLOAD_ROWS),
});

/** A vendor acts only on its own supply line; an admin names the line. */
function resolveLine(
  ctx: { isAdmin: boolean; distributorId: number | null; linkedDistributorIds?: readonly number[] | null },
  requested?: number,
): number {
  return resolveVendorCatalogLineId(ctx.isAdmin, ctx.distributorId, requested, ctx.linkedDistributorIds);
}

async function loadPlanContext(db: Db, lineId: number) {
  const [styles, masters, skus, masterAliasRows, cabinetAliasRows, savedAliasRows, line] = await Promise.all([
    db.select({
      id: doorStyles.id, styleCode: doorStyles.styleCode, ourName: doorStyles.ourName,
      aliasName: doorStyles.aliasName, distributorName: doorStyles.distributorName,
    }).from(doorStyles).where(and(eq(doorStyles.distributorId, lineId), eq(doorStyles.isActive, true))),
    db.select({
      id: cabinets.id, masterCode: cabinets.masterCode, sku: cabinets.sku, vendorSku: cabinets.vendorSku,
      altSku1: cabinets.altSku1, altSku2: cabinets.altSku2, altSku3: cabinets.altSku3, conflictStatus: cabinets.conflictStatus,
    }).from(cabinets),
    db.select({
      id: distributorSkus.id, cabinetId: distributorSkus.cabinetId, styleId: distributorSkus.styleId,
      distributorSku: distributorSkus.distributorSku, listPrice: distributorSkus.listPrice, yourCost: distributorSkus.yourCost,
      platformSku: distributorSkus.platformSku,
    }).from(distributorSkus).where(eq(distributorSkus.distributorId, lineId)),
    db.select({ alias: skuMasterAliases.aliasCode, masterCode: skuMasterAliases.masterCode })
      .from(skuMasterAliases).where(eq(skuMasterAliases.conflictStatus, "ok")),
    db.select({ alias: cabinetAliases.alias, cabinetId: cabinetAliases.cabinetId })
      .from(cabinetAliases).innerJoin(cabinets, eq(cabinets.id, cabinetAliases.cabinetId)).where(ne(cabinets.conflictStatus, "conflict")),
    // Only global (administrator-approved) saved aliases; private customer aliases never apply to a vendor.
    db.select({ alias: codeAliases.rawCodeSample, cabinetId: codeAliases.cabinetId }).from(codeAliases).where(isNull(codeAliases.userId)),
    db.select({ id: distributors.id, code: distributors.code, name: distributors.name }).from(distributors).where(eq(distributors.id, lineId)).limit(1),
  ]);
  if (!line[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Supply line not found." });
  const links: PlanAliasLink[] = [...masterAliasRows, ...cabinetAliasRows, ...savedAliasRows];
  return { styles, masters, skus, links, line: line[0] };
}

function publicRow(r: PlannedRow) {
  // Strip execution-only fields; the vendor sees what happened, not our keys.
  return {
    rowNumber: r.rowNumber, code: r.code, door: r.door, action: r.action, message: r.message, largeChange: r.largeChange,
    matchedVia: r.matchedVia, masterCode: r.masterCode, createsMaster: r.createsMaster,
    styleName: r.styleName, oldPrice: r.oldPrice, newPrice: r.newPrice, oldCost: r.oldCost, newCost: r.newCost,
  };
}

const fmt = (n: number | null | undefined) => (n == null ? null : n.toFixed(2));
const isDuplicateKey = (e: unknown) => {
  const err = e as { code?: string; errno?: number; cause?: { code?: string; errno?: number } };
  return err?.code === "ER_DUP_ENTRY" || err?.errno === 1062 || err?.cause?.code === "ER_DUP_ENTRY" || err?.cause?.errno === 1062;
};

export const vendorCodeUploadRouter = router({
  /** Read-only: shows exactly what a commit of the same rows would do. */
  preview: distributorProcedure.input(rowsInput).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    const lineId = resolveLine(ctx, input.distributorId);
    const plan = await loadPlanContext(db, lineId);
    const planned = planCodeUpload({ rows: input.rows, styles: plan.styles, masters: plan.masters, links: plan.links, skus: plan.skus });
    return {
      line: { id: plan.line.id, name: plan.line.name },
      summary: summarizePlan(planned),
      rows: planned.map(publicRow),
      doors: plan.styles.map((s) => s.aliasName || s.ourName).slice(0, 80),
    };
  }),

  /**
   * Writes the plan. The server re-plans from the raw rows so a client can never
   * submit a plan of its own. New cabinets are created hidden from customers and
   * the Designer, and every added SKU stays pending and unpublished.
   */
  commit: distributorProcedure.input(rowsInput).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
    const lineId = resolveLine(ctx, input.distributorId);
    const plan = await loadPlanContext(db, lineId);
    const planned = planCodeUpload({ rows: input.rows, styles: plan.styles, masters: plan.masters, links: plan.links, skus: plan.skus });

    const styleCodeById = new Map(plan.styles.map((s) => [s.id, s.styleCode]));
    const takenPlatformSkus = new Set(plan.skus.map((s) => s.platformSku));
    const createdMasterId = new Map<string, number>(); // "new:CANON" → cabinets.id
    const skuIdByKey = new Map<string, number>(); // planner skuKey → distributor_skus.id
    const failures: { rowNumber: number; message: string }[] = [];
    let added = 0, updated = 0, mastersCreated = 0;

    for (const row of planned) {
      if (row.action === "error" || row.action === "unchanged") continue;
      try {
        // 1. Cabinet id (create the master once, hidden, when the code was not recognised).
        let cabinetId: number | null = null;
        if (row.cabinetKey?.startsWith("id:")) cabinetId = Number(row.cabinetKey.slice(3));
        else if (row.cabinetKey?.startsWith("new:")) {
          cabinetId = createdMasterId.get(row.cabinetKey) ?? null;
          if (cabinetId == null) {
            try {
              const res = await db.insert(cabinets).values({
                masterCode: row.newMasterCode!,
                description: `New cabinet ${row.newMasterCode} - uploaded by ${plan.line.name}; specification pending review`,
                descriptionSource: "Vendor Upload",
                category: row.newMasterCategory ?? "Accessory",
                isActive: true,
                showInCatalog: false,
                showInDesigner: false,
                showIn2020: false,
              });
              cabinetId = (res as unknown as [{ insertId: number }])[0].insertId;
              mastersCreated += 1;
            } catch (e) {
              if (!isDuplicateKey(e)) throw e;
              // Another upload created it a moment ago; use that master.
              const found = await db.select({ id: cabinets.id }).from(cabinets).where(eq(cabinets.masterCode, row.newMasterCode!)).limit(1);
              if (!found[0]) throw e;
              cabinetId = found[0].id;
            }
            createdMasterId.set(row.cabinetKey, cabinetId);
          }
        }
        if (cabinetId == null || row.styleId == null) throw new Error("Row could not be resolved.");

        // 2. SKU: update the one we know, or one added earlier in this same upload.
        const knownSkuId = row.existingSkuId ?? (row.skuKey ? skuIdByKey.get(row.skuKey) ?? null : null);
        const prices: { listPrice?: string; yourCost?: string } = {};
        if (row.newPrice != null) prices.listPrice = fmt(row.newPrice)!;
        if (row.newCost != null) prices.yourCost = fmt(row.newCost)!;
        if (knownSkuId != null) {
          // An item that was waiting for a cabinet is attached to this row's master now.
          const attach = row.linksOrphan ? { cabinetId } : {};
          await db.update(distributorSkus).set({ ...prices, ...attach }).where(eq(distributorSkus.id, knownSkuId));
          if (row.action === "update") updated += 1; else added += 1;
          continue;
        }
        const masterCode = row.masterCode ?? row.newMasterCode ?? "UNKNOWN";
        let platformSku = buildPlatformSku(masterCode, styleCodeById.get(row.styleId) ?? String(row.styleId), plan.line.code, takenPlatformSkus, row.styleId, normalizeCode(row.code));
        let insertId = 0;
        for (let attempt = 0; attempt < 4; attempt += 1) {
          try {
            const res = await db.insert(distributorSkus).values({
              cabinetId, distributorId: lineId, styleId: row.styleId, platformSku, distributorSku: row.code,
              ...prices, status: "pending", isPublished: false, isAvailable: true,
            });
            insertId = (res as unknown as [{ insertId: number }])[0].insertId;
            break;
          } catch (e) {
            if (!isDuplicateKey(e) || attempt === 3) throw e;
            takenPlatformSkus.add(platformSku);
            platformSku = `${platformSku}-${attempt + 2}`.slice(0, 128);
          }
        }
        takenPlatformSkus.add(platformSku);
        if (row.skuKey) skuIdByKey.set(row.skuKey, insertId);
        added += 1;
      } catch (e) {
        failures.push({ rowNumber: row.rowNumber, message: e instanceof Error ? e.message.slice(0, 160) : "Could not save this row." });
      }
    }

    const summary = summarizePlan(planned);
    return {
      added, updated, mastersCreated,
      unchanged: summary.unchanged,
      skipped: summary.errors,
      failures,
      rows: planned.filter((r) => r.action === "error").map(publicRow),
    };
  }),
});
