import { z } from "zod";
import { and, eq, inArray, desc, gte, lte, isNotNull, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { adminProcedure, distributorProcedure, router, supplierProfileProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
	  distributors,
	  catalogImports,
	  cabinets,
	  distributorSkus,
	  vendorProducts,
	  doorStyles,
	  doorStyleMeasurementSubmissions,
	  doorStyleMeasurementDrafts,
	  doorStyleRoomScenes,
	  vendorLines,
	  users,
  orderRequests,
  kitchenDesigns,
	  aiServiceRequests,
	  skuMasterAliases,
	  distributorIntegrations,
	  distributorIntegrationEvents,
	  shippingSettings,
	} from "../../drizzle/schema";
import { storagePut } from "../storage";
import { encryptDistributorSecret } from "../lib/distributorIntegrationCrypto";
import { decryptDistributorSecret } from "../lib/distributorIntegrationCrypto";
import { generateImage } from "../_core/imageGeneration";
import { upsTestConnection } from "../_core/ups";
import { fedexTestConnection } from "../_core/fedex";
import { normalizeCode } from "../../shared/cabinetCodeMatch";
import { matchVendorCabinetBySku, hasVendorPrice, buildUnmatchedPlatformSku } from "../vendorProductSubmission";
import {
  inventoryForecastRow,
  isForecastRateBps,
  type ForecastRateBand,
} from "@shared/inventoryForecast";
import {
	  normalizeDistributorZipRates,
  shippingRuleCanQuote,
  type DistributorShippingRuleMode,
} from "@shared/distributorShipping";
import { approvedVendorLinkedDistributorIds, approvedVendorMatchesDistributor } from "../lib/approvedVendorAccess";
import { designerCabinetReadinessBySku } from "../lib/designerCabinetReadiness";

/**
 * Resolve the supply line this request operates on.
 * - distributor role → their own linked line (input distributorId ignored)
 * - admin → must pass a distributorId in input (acts on behalf of that line)
 */
function resolveLineId(
  ctxDistributorId: number | null,
  isAdmin: boolean,
  inputDistributorId?: number | null
): number {
  if (!isAdmin) {
    if (ctxDistributorId == null) {
      throw new TRPCError({ code: "FORBIDDEN", message: "No supply line linked to your account." });
    }
    return ctxDistributorId;
  }
  if (inputDistributorId == null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Admins must specify a distributorId to act on a supply line.",
    });
  }
  return inputDistributorId;
}

async function resolveApprovedVendorProfile(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  ctx: { isAdmin: boolean; distributorId: number | null; approvedVendorLineId: number | null },
  requestedDistributorId?: number,
  requestedApprovedVendorLineId?: number
) {
  if (ctx.isAdmin && requestedApprovedVendorLineId != null) {
    const [vendor] = await db
      .select({ id: vendorLines.id })
      .from(vendorLines)
      .where(and(eq(vendorLines.id, requestedApprovedVendorLineId), eq(vendorLines.isApproved, true)))
      .limit(1);
    if (!vendor) throw new TRPCError({ code: "NOT_FOUND", message: "Approved vendor record not found" });
    return vendor;
  }
  if (!ctx.isAdmin && ctx.approvedVendorLineId != null) {
    const [vendor] = await db
      .select({ id: vendorLines.id })
      .from(vendorLines)
      .where(and(eq(vendorLines.id, ctx.approvedVendorLineId), eq(vendorLines.isApproved, true)))
      .limit(1);
    if (!vendor) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Your approved vendor record is no longer active." });
    }
    return vendor;
  }

  const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, requestedDistributorId);
  const [line] = await db
    .select({ id: distributors.id, code: distributors.code, isActive: distributors.isActive })
    .from(distributors)
    .where(and(eq(distributors.id, lineId), eq(distributors.isActive, true)))
    .limit(1);
  if (!line) throw new TRPCError({ code: "NOT_FOUND", message: "Supply line not found" });

  const approvedVendors = await db
    .select({ id: vendorLines.id, sourceKey: vendorLines.sourceKey })
    .from(vendorLines)
    .where(eq(vendorLines.isApproved, true));
  const vendor = approvedVendors.find((candidate) => approvedVendorMatchesDistributor(candidate, line));
  if (!vendor) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No approved vendor record is linked to this supply line. Contact an administrator to link it.",
    });
  }
  return vendor;
}

const MAX_DESIGN_TOOL_PICKS = 8;

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}


const sampleDoorMeasurementSchema = z.object({
  doorStyle: z.enum(["Shaker", "Slim Shaker", "Double Shaker", "Raised Panel", "Beaded", "Slab", "Other"]).optional(),
  doorStyleOther: z.string().trim().max(128).optional(),
  colorFinish: z.string().trim().max(128).optional(),
  sampleWidth: z.number().positive().max(120).nullable().optional(),
  sampleHeight: z.number().positive().max(120).nullable().optional(),
  doorThickness: z.number().positive().max(12).nullable().optional(),
  topRailWidth: z.number().positive().max(24).nullable().optional(),
  bottomRailWidth: z.number().positive().max(24).nullable().optional(),
  leftStileWidth: z.number().positive().max(24).nullable().optional(),
  rightStileWidth: z.number().positive().max(24).nullable().optional(),
  centerRailWidth: z.number().positive().max(24).nullable().optional(),
  panel: z.enum(["Flat", "Raised", "Beadboard"]).optional(),
  outsideEdgeProfile: z.string().trim().max(256).optional(),
  insideFrameProfile: z.string().trim().max(256).optional(),
  drawerConstruction: z.enum(["5-piece (frame and panel)", "Slab"]).optional(),
  drawerRailWidth: z.number().positive().max(24).nullable().optional(),
  drawerStileWidth: z.number().positive().max(24).nullable().optional(),
  slabBelowHeight: z.number().positive().max(120).nullable().optional(),
  drawerFrontThickness: z.number().positive().max(12).nullable().optional(),
  cabinetConstruction: z.enum(["Face frame", "Frameless"]).optional(),
  overlay: z.enum(["Full overlay", "Partial overlay", "Inset"]).optional(),
  doorGap: z.number().min(0).max(12).nullable().optional(),
  faceFrameWidth: z.number().positive().max(24).nullable().optional(),
	  doorPhotoProvided: z.boolean().optional(),
	  drawerPhotoProvided: z.boolean().optional(),
	  edgeProfilePhotoProvided: z.boolean().optional(),
	  backPhotoProvided: z.boolean().optional(),
	  referencePhotos: z.array(z.object({
	    photoType: z.enum(["door", "drawer", "edge", "back"]),
	    url: z.string().max(512),
	    fileName: z.string().max(256),
	    uploadedAt: z.string().max(40),
	  })).max(4).optional(),
});

const monthOffset = (months: number) => {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date;
};

function placedCabinetQuantity(value: unknown): number {
  if (!value || typeof value !== "object") return 1;
  const source = value as { quantity?: unknown; qty?: unknown };
  const qty = Number(source.quantity ?? source.qty ?? 1);
  return Number.isFinite(qty) && qty > 0 ? Math.max(1, Math.round(qty)) : 1;
}

function formatForecastRates(line: {
  inventoryForecastCloseRateBps: number | null;
  inventoryForecastLowRateBps: number | null;
  inventoryForecastHighRateBps: number | null;
}): ForecastRateBand {
  return {
    baseRateBps: line.inventoryForecastCloseRateBps,
    lowRateBps: line.inventoryForecastLowRateBps,
    highRateBps: line.inventoryForecastHighRateBps,
  };
}

export const distributorPortalRouter = router({
  /** The line this user manages: neutral label, counts, lead time. No real brand leaks. */
  myLine: distributorProcedure
    .input(z.object({ distributorId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input?.distributorId);

      const rows = await db
        .select({
          id: distributors.id,
          code: distributors.code,
          name: distributors.name,
          initials: distributors.initials,
          leadTimeDays: distributors.leadTimeDays,
          warehouseZips: distributors.warehouseZips,
          isActive: distributors.isActive,
          designToolPicks: distributors.designToolPicks,
        })
        .from(distributors)
        .where(eq(distributors.id, lineId))
        .limit(1);
      const line = rows[0];
      if (!line) throw new TRPCError({ code: "NOT_FOUND", message: "Supply line not found" });

      const approvedVendorRows = await db
        .select({
          id: vendorLines.id,
          name: vendorLines.name,
          sourceKey: vendorLines.sourceKey,
          category: vendorLines.category,
          contactName: vendorLines.contactName,
          contactEmail: vendorLines.contactEmail,
          contactPhone: vendorLines.contactPhone,
          websiteUrl: vendorLines.websiteUrl,
          notes: vendorLines.notes,
          catalogPdfUrl: vendorLines.catalogPdfUrl,
          specBookPdfUrl: vendorLines.specBookPdfUrl,
        })
        .from(vendorLines)
        .where(eq(vendorLines.isApproved, true))
        .orderBy(desc(vendorLines.updatedAt));
      const approvedVendor = approvedVendorRows.find((vendor) =>
        approvedVendorMatchesDistributor(vendor, line)
      ) ?? null;

      // SKU counts for this line.
      const [counts] = await db
        .select({
          total: sql<number>`count(*)`,
          published: sql<number>`sum(case when ${distributorSkus.isPublished} = true then 1 else 0 end)`,
          available: sql<number>`sum(case when ${distributorSkus.isAvailable} = true then 1 else 0 end)`,
          pending: sql<number>`sum(case when ${distributorSkus.status} = 'pending' then 1 else 0 end)`,
        })
        .from(distributorSkus)
        .where(eq(distributorSkus.distributorId, lineId));

      // Door styles carried by this line — deduplicated by ourName so that
      // rows with the same display name (e.g. from a re-import) only appear once.
      const rawStyles = await db
	        .select({
	          id: doorStyles.id,
	          styleCode: doorStyles.styleCode,
	          ourName: doorStyles.ourName,
	          distributorName: doorStyles.distributorName,
	          doorStyle: doorStyles.doorStyle,
          doorSampleImageUrl: doorStyles.doorSampleImageUrl,
          roomSceneImageUrl: doorStyles.roomSceneImageUrl,
          thumbnailImageUrl: doorStyles.thumbnailImageUrl,
        })
        .from(doorStyles)
        .where(and(eq(doorStyles.distributorId, lineId), eq(doorStyles.isActive, true)))
        .orderBy(doorStyles.ourName);
      // Keep only the first occurrence of each ourName (lowest id wins).
      const seenNames = new Set<string>();
      const styles = rawStyles.filter((s) => {
        if (seenNames.has(s.ourName)) return false;
        seenNames.add(s.ourName);
        return true;
      });

      return {
        // Keep all joins and mutations keyed to the real distributor row, but
        // show the approved supplier's customer-facing name in the portal.
        line: approvedVendor ? { ...line, name: approvedVendor.name } : line,
        approvedVendor,
        counts: {
          total: Number(counts?.total ?? 0),
          published: Number(counts?.published ?? 0),
          available: Number(counts?.available ?? 0),
          pending: Number(counts?.pending ?? 0),
        },
        styles,
	      };
	    }),

	  /**
	   * Archive a vendor-supplied catalog file in first-party storage. This is
	   * intentionally separate from SKU mutation: a distributor can upload the
	   * source workbook/CSV for audit, then use the validated spreadsheet flow.
	   */
	  uploadCatalogFile: distributorProcedure
	    .input(z.object({
	      distributorId: z.number().optional(),
	      fileName: z.string().trim().min(1).max(255),
	      contentType: z.string().trim().max(128).default("text/csv"),
	      fileBase64: z.string().min(1).max(32_000_000),
	      preservePricing: z.boolean().default(true),
	    }))
	    .mutation(async ({ ctx, input }) => {
	      const db = await getDb();
	      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
	      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
	      const [line] = await db.select({ id: distributors.id }).from(distributors).where(eq(distributors.id, lineId)).limit(1);
	      if (!line) throw new TRPCError({ code: "NOT_FOUND", message: "Supply line not found" });
      const buffer = Buffer.from(input.fileBase64, "base64");
      if (buffer.length > 24 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "Catalog files must be 24 MB or smaller." });
      const safeName = input.fileName.replace(/[^a-z0-9._-]/gi, "-");
      const key = `distributor-catalogs/${lineId}/${Date.now()}-${safeName}`;
      const stored = await storagePut(key, buffer, input.contentType);
      const result = await db.insert(catalogImports).values({
        distributorId: lineId,
        fileName: input.fileName,
        fileSize: buffer.length,
        status: "completed",
        preservePricing: input.preservePricing,
        isRollbackable: false,
        uploadedByUserId: ctx.user.id,
        uploadedByName: ctx.user.name ?? null,
        fileKey: stored.key,
        fileUrl: stored.url,
      });
      return { ok: true, importId: Number((result as { insertId?: number }).insertId ?? 0), fileUrl: stored.url };
    }),

	  /** Most-recent-first archive list; file URLs are only returned to the owning line. */
	  catalogFileHistory: distributorProcedure
	    .input(z.object({ distributorId: z.number().optional(), limit: z.number().int().min(1).max(100).default(25) }).optional())
	    .query(async ({ ctx, input }) => {
	      const db = await getDb();
	      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
	      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input?.distributorId);
	      return db.select({
	        id: catalogImports.id, fileName: catalogImports.fileName, fileSize: catalogImports.fileSize,
	        status: catalogImports.status, preservePricing: catalogImports.preservePricing,
	        uploadedAt: catalogImports.uploadedAt, uploadedByName: catalogImports.uploadedByName,
	        fileUrl: catalogImports.fileUrl,
	      }).from(catalogImports).where(eq(catalogImports.distributorId, lineId)).orderBy(desc(catalogImports.uploadedAt)).limit(input?.limit ?? 25);
	    }),

	  /** Export the complete current distributor SKU view as a portable CSV. */
	  exportCatalog: distributorProcedure
	    .input(z.object({ distributorId: z.number().optional() }).optional())
	    .query(async ({ ctx, input }) => {
	      const db = await getDb();
	      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
	      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input?.distributorId);
      const rows = await db.select({
	        distributorSku: distributorSkus.distributorSku,
	        platformSku: distributorSkus.platformSku,
	        masterCode: cabinets.masterCode,
	        styleCode: doorStyles.styleCode,
	        styleName: doorStyles.ourName,
	        description: cabinets.description,
	        category: cabinets.category,
	        listPrice: distributorSkus.listPrice,
	        wholesalePrice: distributorSkus.wholesalePrice,
	        contractorPrice: distributorSkus.contractorPrice,
	        homeownerPrice: distributorSkus.homeownerPrice,
	        onHandQty: distributorSkus.onHandQty,
	        isAvailable: distributorSkus.isAvailable,
	        isPublished: distributorSkus.isPublished,
	        imageUrl: distributorSkus.imageUrl,
	      }).from(distributorSkus)
	        .leftJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
	        .leftJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
	        .where(eq(distributorSkus.distributorId, lineId))
	        .orderBy(distributorSkus.distributorSku);
      const headers = ["distributorSku", "platformSku", "masterCode", "styleCode", "styleName", "description", "category", "listPrice", "wholesalePrice", "contractorPrice", "homeownerPrice", "onHandQty", "isAvailable", "isPublished", "imageUrl"];
      const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => csvCell((row as Record<string, unknown>)[header])).join(","))].join("\n") + "\n";
      return { fileName: `catalog-${lineId}-${new Date().toISOString().slice(0, 10)}.csv`, rowCount: rows.length, csv };
    }),

	  /** Return only redacted integration metadata; encrypted values never cross the API. */
	  listIntegrations: distributorProcedure
	    .input(z.object({ distributorId: z.number().optional() }).optional())
	    .query(async ({ ctx, input }) => {
	      const db = await getDb();
	      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
	      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input?.distributorId);
	      const rows = await db.select({
	        id: distributorIntegrations.id, integrationType: distributorIntegrations.integrationType,
	        provider: distributorIntegrations.provider, displayName: distributorIntegrations.displayName,
	        baseUrl: distributorIntegrations.baseUrl, accountNumber: distributorIntegrations.accountNumber,
	        clientId: distributorIntegrations.clientId, authHeaderName: distributorIntegrations.authHeaderName,
	        environment: distributorIntegrations.environment, isEnabled: distributorIntegrations.isEnabled,
	        adminEnabled: distributorIntegrations.adminEnabled,
	        lastVerifiedAt: distributorIntegrations.lastVerifiedAt, lastError: distributorIntegrations.lastError,
	        hasApiKey: sql<boolean>`${distributorIntegrations.apiKeyEncrypted} is not null`,
	        hasClientSecret: sql<boolean>`${distributorIntegrations.clientSecretEncrypted} is not null`,
	        hasPassword: sql<boolean>`${distributorIntegrations.passwordEncrypted} is not null`,
	      }).from(distributorIntegrations).where(eq(distributorIntegrations.distributorId, lineId)).orderBy(distributorIntegrations.integrationType, distributorIntegrations.provider);
      return rows;
    }),

	  saveIntegration: distributorProcedure
	    .input(z.object({
	      distributorId: z.number().optional(), id: z.number().int().positive().optional(),
	      integrationType: z.enum(["inventory", "shipping"]), provider: z.string().trim().min(1).max(64),
	      displayName: z.string().trim().min(1).max(128), baseUrl: z.string().trim().max(512).nullable().optional(),
	      accountNumber: z.string().trim().max(128).nullable().optional(), clientId: z.string().trim().max(255).nullable().optional(),
	      apiKey: z.string().max(2000).optional(), clientSecret: z.string().max(2000).optional(),
	      username: z.string().trim().max(255).nullable().optional(), password: z.string().max(2000).optional(),
	      authHeaderName: z.string().trim().max(128).nullable().optional(), environment: z.enum(["sandbox", "production"]).default("production"), isEnabled: z.boolean().default(false),
	    }))
	    .mutation(async ({ ctx, input }) => {
	      const db = await getDb();
	      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
	      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
	      const secretPatch = {
	        apiKeyEncrypted: input.apiKey?.trim() ? encryptDistributorSecret(input.apiKey) : undefined,
	        clientSecretEncrypted: input.clientSecret?.trim() ? encryptDistributorSecret(input.clientSecret) : undefined,
	        passwordEncrypted: input.password?.trim() ? encryptDistributorSecret(input.password) : undefined,
	      };
		      const shared = {
		        distributorId: lineId, integrationType: input.integrationType, provider: input.provider.trim(), displayName: input.displayName.trim(),
		        baseUrl: input.baseUrl?.trim() || null, accountNumber: input.accountNumber?.trim() || null, clientId: input.clientId?.trim() || null,
		        username: input.username?.trim() || null, authHeaderName: input.authHeaderName?.trim() || null,
		        environment: input.environment, isEnabled: input.isEnabled, lastError: null,
		      };
		      // NetSuite must be more than a saved credential card: enabling it also
		      // selects the existing distributor fulfillment route used by order
		      // dispatch. The account number is the NetSuite account ID; token and
		      // consumer secrets remain encrypted in distributorIntegrations.
		      if (input.integrationType === "inventory" && input.provider.trim() === "netsuite") {
		        await db.update(distributors).set({
		          fulfillmentMode: input.isEnabled ? "netsuite_api" : "email",
		          netsuiteAccountId: input.accountNumber?.trim() || null,
		        }).where(eq(distributors.id, lineId));
		      }
		      if (input.id) {
	        const [owned] = await db.select({ id: distributorIntegrations.id }).from(distributorIntegrations).where(and(eq(distributorIntegrations.id, input.id), eq(distributorIntegrations.distributorId, lineId))).limit(1);
	        if (!owned) throw new TRPCError({ code: "FORBIDDEN", message: "That integration is not in your distributor account." });
        await db.update(distributorIntegrations).set({ ...shared, ...secretPatch } as any).where(eq(distributorIntegrations.id, input.id));
        return { ok: true, id: input.id };
      }
      const existing = await db.select({ id: distributorIntegrations.id }).from(distributorIntegrations).where(and(eq(distributorIntegrations.distributorId, lineId), eq(distributorIntegrations.integrationType, input.integrationType), eq(distributorIntegrations.provider, input.provider.trim()))).limit(1);
      if (existing[0]) {
        await db.update(distributorIntegrations).set({ ...shared, ...secretPatch } as any).where(eq(distributorIntegrations.id, existing[0].id));
        return { ok: true, id: existing[0].id };
      }
	      const result = await db.insert(distributorIntegrations).values({ ...shared, apiKeyEncrypted: secretPatch.apiKeyEncrypted ?? null, clientSecretEncrypted: secretPatch.clientSecretEncrypted ?? null, passwordEncrypted: secretPatch.passwordEncrypted ?? null });
	      return { ok: true, id: Number((result as { insertId?: number }).insertId ?? 0) };
	    }),

	  /** Return redacted connection-test history for one owned integration. */
	  integrationHistory: distributorProcedure
	    .input(z.object({ distributorId: z.number().optional(), integrationId: z.number().int().positive().optional(), limit: z.number().int().min(1).max(50).default(20) }).optional())
	    .query(async ({ ctx, input }) => {
	      const db = await getDb();
	      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
	      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input?.distributorId);
	      const conditions = [eq(distributorIntegrationEvents.distributorId, lineId)];
	      if (input?.integrationId != null) conditions.push(eq(distributorIntegrationEvents.integrationId, input.integrationId));
	      return db.select({
	        id: distributorIntegrationEvents.id,
	        integrationId: distributorIntegrationEvents.integrationId,
	        eventType: distributorIntegrationEvents.eventType,
	        status: distributorIntegrationEvents.status,
	        message: distributorIntegrationEvents.message,
	        responseMs: distributorIntegrationEvents.responseMs,
	        createdAt: distributorIntegrationEvents.createdAt,
	      }).from(distributorIntegrationEvents).where(and(...conditions)).orderBy(desc(distributorIntegrationEvents.createdAt)).limit(input?.limit ?? 20);
	    }),

	  /** Test an owned distributor connection without returning any saved secret. */
	  testIntegrationConnection: distributorProcedure
	    .input(z.object({ distributorId: z.number().optional(), integrationId: z.number().int().positive() }))
	    .mutation(async ({ ctx, input }) => {
	      const db = await getDb();
	      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
	      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
	      const [integration] = await db.select().from(distributorIntegrations).where(and(eq(distributorIntegrations.id, input.integrationId), eq(distributorIntegrations.distributorId, lineId))).limit(1);
	      if (!integration) throw new TRPCError({ code: "NOT_FOUND", message: "Integration not found." });
      const startedAt = Date.now();
      let result: { ok: boolean; error?: string };
      try {
        if (integration.provider === "ups") {
          result = await upsTestConnection({
            clientId: integration.clientId ?? "",
            clientSecret: decryptDistributorSecret(integration.clientSecretEncrypted) ?? "",
            accountNumber: integration.accountNumber ?? "",
            environment: integration.environment,
          });
        } else if (integration.provider === "fedex") {
          result = await fedexTestConnection({
            clientId: integration.clientId ?? "",
            clientSecret: decryptDistributorSecret(integration.clientSecretEncrypted) ?? "",
            accountNumber: integration.accountNumber ?? "",
            environment: integration.environment,
          });
        } else if (!integration.baseUrl) {
          result = { ok: false, error: "Add an API base URL before testing this connection." };
        } else {
          const headers: Record<string, string> = {};
          const apiKey = decryptDistributorSecret(integration.apiKeyEncrypted);
          const authHeader = integration.authHeaderName?.trim() || "Authorization";
          if (apiKey) headers[authHeader] = authHeader === "Authorization" ? `Bearer ${apiKey}` : apiKey;
          const response = await fetch(integration.baseUrl, { method: "HEAD", headers, signal: AbortSignal.timeout(15_000) });
          result = response.ok ? { ok: true } : { ok: false, error: `Endpoint returned HTTP ${response.status}.` };
        }
      } catch (error) {
        result = { ok: false, error: error instanceof Error ? error.message : "Connection test failed." };
      }
      const responseMs = Date.now() - startedAt;
      const message = result.ok ? "Connection test passed." : (result.error ?? "Connection test failed.");
      await db.insert(distributorIntegrationEvents).values({ integrationId: integration.id, distributorId: lineId, eventType: "connection_test", status: result.ok ? "success" : "failure", message, responseMs });
      await db.update(distributorIntegrations).set({ lastVerifiedAt: result.ok ? new Date() : integration.lastVerifiedAt, lastError: result.ok ? null : message }).where(eq(distributorIntegrations.id, integration.id));
      return { ok: result.ok, message, responseMs } as const;
    }),

	  /** Read the admin-managed warehouse origins copied to newly created lines. */
	  warehouseTemplate: adminProcedure.query(async () => {
	    const db = await getDb();
	    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
	    const [row] = await db.select({ warehouseTemplateZips: shippingSettings.warehouseTemplateZips }).from(shippingSettings).limit(1);
	    return { warehouseTemplateZips: row?.warehouseTemplateZips ?? [] };
	  }),

	  /** Save verified warehouse origins used only for future distributor creation. */
	  saveWarehouseTemplate: adminProcedure
	    .input(z.object({ warehouseTemplateZips: z.array(z.string().trim().regex(/^\d{5}$/, "Each warehouse ZIP must be exactly 5 digits")).max(12) }))
	    .mutation(async ({ input }) => {
	      const db = await getDb();
	      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
	      const warehouseTemplateZips = Array.from(new Set(input.warehouseTemplateZips.map((zip) => zip.trim())));
	      const [existing] = await db.select({ id: shippingSettings.id }).from(shippingSettings).limit(1);
	      if (existing) await db.update(shippingSettings).set({ warehouseTemplateZips }).where(eq(shippingSettings.id, existing.id));
	      else await db.insert(shippingSettings).values({ warehouseTemplateZips });
	      return { ok: true, warehouseTemplateZips } as const;
	    }),

	  /**
   * Supplier-owned details on the approved vendor record. Supply-line identity,
   * approval, and catalog mappings remain administrative controls; this mutation
   * never accepts a caller-selected vendor ID.
   */
  updateSupplierProfile: supplierProfileProcedure
    .input(z.object({
      distributorId: z.number().optional(),
      approvedVendorLineId: z.number().optional(),
      contactName: z.string().trim().max(191),
      contactEmail: z.string().trim().email().max(255),
      contactPhone: z.string().trim().max(64),
      websiteUrl: z.string().trim().max(512).refine(
        (value) => !value || /^https?:\/\//i.test(value),
        "Website must be an http or https URL."
      ),
      notes: z.string().trim().max(2000),
      // storagePut returns a first-party /manus-storage/... path. A supplier
      // must be able to save an existing uploaded catalog/spec book without
      // re-uploading it or replacing it with an external URL.
      catalogPdfUrl: z.string().trim().max(512).refine(
        (value) => !value || /^https?:\/\//i.test(value) || value.startsWith("/manus-storage/"),
        "Catalog resource must be an http(s) URL or a CabinetDealz storage path."
      ),
      specBookPdfUrl: z.string().trim().max(512).refine(
        (value) => !value || /^https?:\/\//i.test(value) || value.startsWith("/manus-storage/"),
        "Spec-book resource must be an http(s) URL or a CabinetDealz storage path."
      ),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const approvedVendor = await resolveApprovedVendorProfile(db, ctx, input.distributorId, input.approvedVendorLineId);

      const nextEmailLower = input.contactEmail.toLowerCase();
      const shouldUpdateLoginEmail = !ctx.isAdmin && ctx.user.emailLower !== nextEmailLower;
      if (shouldUpdateLoginEmail) {
        const [existing] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.emailLower, nextEmailLower))
          .limit(1);
        if (existing && existing.id !== ctx.user.id) {
          throw new TRPCError({ code: "CONFLICT", message: "That email is already used by another account." });
        }
      }

      await db
        .update(vendorLines)
        .set({
          contactName: input.contactName,
          contactEmail: input.contactEmail,
          contactPhone: input.contactPhone,
          websiteUrl: input.websiteUrl || null,
          notes: input.notes || null,
          catalogPdfUrl: input.catalogPdfUrl || null,
          specBookPdfUrl: input.specBookPdfUrl || null,
        })
        .where(eq(vendorLines.id, approvedVendor.id));
      // A supplier editing its own contact email should be able to use that
      // exact address at the next password sign-in. Admin preview never alters
      // the administrator's account.
      if (shouldUpdateLoginEmail) {
        await db
          .update(users)
          .set({ email: input.contactEmail, emailLower: nextEmailLower })
          .where(eq(users.id, ctx.user.id));
      }
      return { success: true, vendorId: approvedVendor.id } as const;
    }),

  /** Upload a catalog or specification PDF to the caller's own approved vendor record. */
  uploadSupplierResourcePdf: supplierProfileProcedure
    .input(z.object({
      distributorId: z.number().optional(),
      approvedVendorLineId: z.number().optional(),
      resource: z.enum(["catalog", "specBook"]),
      fileBase64: z.string().min(1).max(16 * 1024 * 1024),
      contentType: z.literal("application/pdf"),
      fileName: z.string().trim().min(1).max(256),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const approvedVendor = await resolveApprovedVendorProfile(db, ctx, input.distributorId, input.approvedVendorLineId);

      const buffer = Buffer.from(input.fileBase64, "base64");
      const maxBytes = 12 * 1024 * 1024;
      if (buffer.length === 0 || buffer.length > maxBytes) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "PDF files must be between 1 byte and 12 MB." });
      }
      if (buffer.subarray(0, 4).toString("ascii") !== "%PDF") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only valid PDF files can be uploaded." });
      }

      const safeName = input.fileName
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .replace(/\.pdf$/i, "")
        .slice(0, 96) || input.resource;
      const { url } = await storagePut(
        `vendor-resources/${approvedVendor.id}/${input.resource}-${Date.now()}-${safeName}.pdf`,
        buffer,
        "application/pdf"
      );
      const field = input.resource === "catalog" ? "catalogPdfUrl" : "specBookPdfUrl";
      await db.update(vendorLines).set({ [field]: url }).where(eq(vendorLines.id, approvedVendor.id));
      return { success: true, resource: input.resource, url } as const;
    }),

  /** The authenticated supplier profile, including vendors still awaiting a catalog line. */
  supplierProfile: supplierProfileProcedure
    .input(z.object({ distributorId: z.number().optional(), approvedVendorLineId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const resolved = await resolveApprovedVendorProfile(db, ctx, input?.distributorId, input?.approvedVendorLineId);
      const [vendor] = await db
        .select({
          id: vendorLines.id,
          name: vendorLines.name,
          sourceKey: vendorLines.sourceKey,
          linkedDistributorIds: vendorLines.linkedDistributorIds,
          category: vendorLines.category,
          contactName: vendorLines.contactName,
          contactEmail: vendorLines.contactEmail,
          contactPhone: vendorLines.contactPhone,
          websiteUrl: vendorLines.websiteUrl,
          notes: vendorLines.notes,
          catalogPdfUrl: vendorLines.catalogPdfUrl,
          specBookPdfUrl: vendorLines.specBookPdfUrl,
        })
        .from(vendorLines)
        .where(eq(vendorLines.id, resolved.id))
        .limit(1);
      if (!vendor) throw new TRPCError({ code: "NOT_FOUND", message: "Approved vendor record not found" });
      const supplierLines = await db
        .select({ id: distributors.id, code: distributors.code, name: distributors.name, isActive: distributors.isActive })
        .from(distributors);
      const linkedIds = approvedVendorLinkedDistributorIds(vendor, supplierLines);
      const linkedDistributors = supplierLines
        .filter((line) => linkedIds.includes(line.id))
        .map((line) => ({ id: line.id, code: line.code, name: line.name }));
      return { vendor, linkedDistributors };
    }),

	/**
	 * The Featured Door Styles manager is intentionally scoped to the vendor's
	 * actual cabinet line. A style must have at least one catalog row for this
	 * distributor before it appears here; a vendor can never browse another
	 * supplier's styles or cabinets through this surface. Search and category
	 * filters are applied against the vendor's cabinet records, not merely a
	 * door-style label, so a vendor can find a specific cabinet SKU.
	 */
	featuredStyles: distributorProcedure
	  .input(z.object({
	    distributorId: z.number().optional(),
	    search: z.string().trim().max(120).optional(),
	    categories: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
	  }).optional())
	  .query(async ({ ctx, input }) => {
	    const db = await getDb();
	    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
	    const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input?.distributorId);
	    const catalogRows = await db
	      .select({
	        skuId: distributorSkus.id,
	        styleId: distributorSkus.styleId,
	        cabinetId: cabinets.id,
	        masterCode: cabinets.masterCode,
	        description: cabinets.description,
	        category: cabinets.category,
	        platformSku: distributorSkus.platformSku,
	        distributorSku: distributorSkus.distributorSku,
	        isAvailable: distributorSkus.isAvailable,
	        isPublished: distributorSkus.isPublished,
	        listPrice: distributorSkus.listPrice,
	        yourCost: distributorSkus.yourCost,
	        sourceConflictStatus: cabinets.conflictStatus,
	      })
	      .from(distributorSkus)
	      .innerJoin(cabinets, eq(cabinets.id, distributorSkus.cabinetId))
	      .where(and(eq(distributorSkus.distributorId, lineId), isNotNull(distributorSkus.styleId)));

	    const categoryCounts = new Map<string, Set<number>>();
	    const categoriesByStyle = new Map<number, Set<string>>();
	    for (const row of catalogRows) {
	      if (row.styleId == null) continue;
	      const category = row.category.trim();
	      if (!category) continue;
	      const cabinetIds = categoryCounts.get(category) ?? new Set<number>();
	      cabinetIds.add(row.cabinetId);
	      categoryCounts.set(category, cabinetIds);
	      const categories = categoriesByStyle.get(row.styleId) ?? new Set<string>();
	      categories.add(category);
	      categoriesByStyle.set(row.styleId, categories);
	    }
	    const categories = Array.from(categoryCounts.entries())
	      .map(([category, cabinetIds]) => ({ category, cabinetCount: cabinetIds.size }))
	      .sort((left, right) => left.category.localeCompare(right.category));

	    const requestedCategories = new Set((input?.categories ?? []).map((category) => category.trim()).filter(Boolean));
	    const term = input?.search?.trim().toLowerCase() ?? "";
	    const normalizedTerm = term.replace(/[\s_-]/g, "");
	    const matchesSearch = (row: typeof catalogRows[number]) => {
	      if (!term) return true;
	      const fields = [row.masterCode, row.description, row.platformSku ?? "", row.distributorSku ?? ""];
	      return fields.some((value) => {
	        const normalized = value.toLowerCase();
	        return normalized.includes(term) || (normalizedTerm.length > 0 && normalized.replace(/[\s_-]/g, "").includes(normalizedTerm));
	      });
	    };
	    const matchingCatalogRows = catalogRows.filter((row) =>
	      (requestedCategories.size === 0 || requestedCategories.has(row.category))
	      && matchesSearch(row),
	    );
	    const styleIds = Array.from(new Set(matchingCatalogRows
	      .map((row) => row.styleId)
	      .filter((id): id is number => id != null)));
	    if (styleIds.length === 0) return { styles: [], categories };

	    const [styles, scenes, aliases, masters] = await Promise.all([
	      db
	        .select({
	          id: doorStyles.id,
	          distributorId: doorStyles.distributorId,
	          styleCode: doorStyles.styleCode,
	          ourName: doorStyles.ourName,
	          aliasName: doorStyles.aliasName,
	          featuredLabel: doorStyles.featuredLabel,
	          distributorName: doorStyles.distributorName,
	          doorStyle: doorStyles.doorStyle,
	          color: doorStyles.color,
	          finish: doorStyles.finish,
	          woodSpecies: doorStyles.woodSpecies,
	          doorSampleImageUrl: doorStyles.doorSampleImageUrl,
	          drawerSampleImageUrl: doorStyles.drawerSampleImageUrl,
	          roomSceneImageUrl: doorStyles.roomSceneImageUrl,
	          thumbnailImageUrl: doorStyles.thumbnailImageUrl,
	          cornerSwatchImageUrl: doorStyles.cornerSwatchImageUrl,
	          doorSampleVerified: doorStyles.doorSampleVerified,
	          isFeatured: doorStyles.isFeatured,
	          featuredRank: doorStyles.featuredRank,
	          warehouseZips: doorStyles.warehouseZips,
	          flatFreightFeeCents: doorStyles.flatFreightFeeCents,
	          railWidth: doorStyles.railWidth,
	          stileWidth: doorStyles.stileWidth,
	          centerRailWidth: doorStyles.centerRailWidth,
	          profileNotes: doorStyles.profileNotes,
	          profileDescription: doorStyles.profileDescription,
	          sourceSpecification: doorStyles.sourceSpecification,
	          isActive: doorStyles.isActive,
	        })
	        .from(doorStyles)
	        .where(and(eq(doorStyles.distributorId, lineId), inArray(doorStyles.id, styleIds)))
	        .orderBy(doorStyles.featuredRank, doorStyles.ourName),
	      db
	        .select({
	          id: doorStyleRoomScenes.id,
	          styleId: doorStyleRoomScenes.styleId,
	          imageUrl: doorStyleRoomScenes.imageUrl,
	          sortOrder: doorStyleRoomScenes.sortOrder,
	          isVerified: doorStyleRoomScenes.isVerified,
	          isActive: doorStyleRoomScenes.isActive,
	          sourceNote: doorStyleRoomScenes.sourceNote,
	          sourceDistributorId: doorStyleRoomScenes.sourceDistributorId,
	        })
	        .from(doorStyleRoomScenes)
	        .where(inArray(doorStyleRoomScenes.styleId, styleIds))
	        .orderBy(doorStyleRoomScenes.sortOrder, doorStyleRoomScenes.id),
	      db
	        .select({ aliasCode: skuMasterAliases.aliasCode, masterCode: skuMasterAliases.masterCode })
	        .from(skuMasterAliases)
	        .where(eq(skuMasterAliases.conflictStatus, "ok")),
	      db
	        .select({
	          masterCode: cabinets.masterCode,
	          isActive: cabinets.isActive,
	          showInDesigner: cabinets.showInDesigner,
	          conflictStatus: cabinets.conflictStatus,
	        })
	        .from(cabinets),
	    ]);
	    const readinessBySku = designerCabinetReadinessBySku(
	      catalogRows.map((row) => ({
	        skuId: row.skuId,
	        sourceMasterCode: row.masterCode,
	        isAvailable: row.isAvailable,
	        isPublished: row.isPublished,
	        listPrice: row.listPrice,
	        yourCost: row.yourCost,
	        sourceConflictStatus: row.sourceConflictStatus,
	      })),
	      aliases,
	      masters,
	    );

	    const catalogByStyle = new Map<number, typeof catalogRows>();
	    const matchingByStyle = new Map<number, typeof matchingCatalogRows>();
	    for (const row of catalogRows) {
	      if (row.styleId == null) continue;
	      const current = catalogByStyle.get(row.styleId) ?? [];
	      current.push(row);
	      catalogByStyle.set(row.styleId, current);
	    }
	    for (const row of matchingCatalogRows) {
	      if (row.styleId == null) continue;
	      const current = matchingByStyle.get(row.styleId) ?? [];
	      current.push(row);
	      matchingByStyle.set(row.styleId, current);
	    }
    return {
	      categories,
	      styles: styles.map((style) => {
	        const allCatalog = catalogByStyle.get(style.id) ?? [];
	        const matchingCatalog = matchingByStyle.get(style.id) ?? [];
	        const matchingCabinets = Array.from(new Map(matchingCatalog.map((row) => [row.cabinetId, row])).values())
	          .slice(0, 3)
	          .map((row) => ({ masterCode: row.masterCode, description: row.description, category: row.category }));
	        const designerCabinetsByMaster = new Map<string, {
	          masterCode: string;
	          description: string;
	          category: string;
	          distributorSku: string;
	          platformSku: string;
	          isCompliant: boolean;
	          reason: string | null;
	          canonicalMasterCode: string | null;
	        }>();
	        for (const row of allCatalog) {
	          const readiness = readinessBySku.get(row.skuId) ?? {
	            isCompliant: false,
	            reason: "Designer readiness could not be verified",
	            canonicalMasterCode: null,
	          };
	          const masterCode = readiness.canonicalMasterCode ?? row.masterCode;
	          const existing = designerCabinetsByMaster.get(masterCode);
	          // A canonical cabinet is selectable when any one exact SKU for this
	          // style can supply it; a stale alias does not make it falsely red.
	          if (!existing || (!existing.isCompliant && readiness.isCompliant)) {
	            designerCabinetsByMaster.set(masterCode, {
	              masterCode,
	              description: row.description,
	              category: row.category,
	              distributorSku: row.distributorSku,
	              platformSku: row.platformSku,
	              ...readiness,
	            });
	          }
	        }
	        const designerCabinets = Array.from(designerCabinetsByMaster.values())
	          .sort((left, right) => left.masterCode.localeCompare(right.masterCode));
	        return {
	          ...style,
	          skuCount: allCatalog.length,
	          catalogCategories: Array.from(categoriesByStyle.get(style.id) ?? []).sort((left, right) => left.localeCompare(right)),
	          matchingCabinetCount: new Set(matchingCatalog.map((row) => row.cabinetId)).size,
	          matchingCabinets,
	          designerCabinets,
	          designerNoncompliantCabinetCount: designerCabinets.filter((cabinet) => !cabinet.isCompliant).length,
	          roomScenes: scenes.filter((scene) => scene.styleId === style.id),
	        };
	      }),
	    };
	  }),

	/** Toggle a featured style, with both line ownership and cabinet evidence enforced on the server. */
	setFeaturedStyle: distributorProcedure
	  .input(z.object({ distributorId: z.number().optional(), styleId: z.number().int().positive(), featured: z.boolean() }))
	  .mutation(async ({ ctx, input }) => {
	    const db = await getDb();
	    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
	    const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
	    const [style] = await db
	      .select({ id: doorStyles.id, isActive: doorStyles.isActive, isFeatured: doorStyles.isFeatured })
	      .from(doorStyles)
	      .where(and(eq(doorStyles.id, input.styleId), eq(doorStyles.distributorId, lineId)))
	      .limit(1);
	    if (!style) throw new TRPCError({ code: "FORBIDDEN", message: "That style does not belong to your cabinet line." });

	    if (!input.featured) {
	      await db.update(doorStyles).set({ isFeatured: false }).where(eq(doorStyles.id, input.styleId));
	      return { ok: true };
	    }
	    if (!style.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Restore this door style before featuring it." });

	    const [catalogItem] = await db
	      .select({ id: distributorSkus.id })
	      .from(distributorSkus)
	      .where(and(eq(distributorSkus.distributorId, lineId), eq(distributorSkus.styleId, input.styleId)))
	      .limit(1);
	    if (!catalogItem) throw new TRPCError({ code: "BAD_REQUEST", message: "Only styles with cabinets in your catalog can be featured." });

	    const [{ sceneCount }] = await db
	      .select({ sceneCount: sql<number>`count(*)` })
	      .from(doorStyleRoomScenes)
	      .where(and(
	        eq(doorStyleRoomScenes.styleId, input.styleId),
	        eq(doorStyleRoomScenes.isActive, true),
	        eq(doorStyleRoomScenes.isVerified, true),
	      ));
	    if (Number(sceneCount) === 0) {
	      throw new TRPCError({ code: "BAD_REQUEST", message: "Add a verified matching room scene in Door Styles before featuring this cabinet line." });
	    }

	    if (!style.isFeatured) {
	      const [{ maxRank }] = await db
	        .select({ maxRank: sql<number>`coalesce(max(${doorStyles.featuredRank}), 0)` })
	        .from(doorStyles)
	        .where(eq(doorStyles.isFeatured, true));
	      await db.update(doorStyles).set({ isFeatured: true, featuredRank: Number(maxRank) + 10 }).where(eq(doorStyles.id, input.styleId));
	    }
	    return { ok: true };
	  }),

	/** Reorder only this vendor's featured styles while preserving other vendors' rank slots. */
	reorderFeaturedStyles: distributorProcedure
	  .input(z.object({ distributorId: z.number().optional(), orderedIds: z.array(z.number().int().positive()).min(1) }))
	  .mutation(async ({ ctx, input }) => {
	    const db = await getDb();
	    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
	    const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
	    const current = await db
	      .select({ id: doorStyles.id, featuredRank: doorStyles.featuredRank })
	      .from(doorStyles)
	      .where(and(eq(doorStyles.distributorId, lineId), eq(doorStyles.isFeatured, true)))
	      .orderBy(doorStyles.featuredRank, doorStyles.id);
	    const currentIds = current.map((style) => style.id);
	    const sameMembers = input.orderedIds.length === currentIds.length
	      && new Set(input.orderedIds).size === input.orderedIds.length
	      && input.orderedIds.every((id) => currentIds.includes(id));
	    if (!sameMembers) throw new TRPCError({ code: "BAD_REQUEST", message: "Featured style order must contain every style in your cabinet line exactly once." });

	    await Promise.all(input.orderedIds.map((id, index) =>
	      db.update(doorStyles).set({ featuredRank: current[index]!.featuredRank }).where(eq(doorStyles.id, id)),
	    ));
	    return { ok: true };
	  }),

	/**
	 * Vendor-side equivalent of the Featured Styles merchandising editor. The
	 * editable fields match the internal featured-style editor, but the target
	 * must be both owned by the current vendor and represented by that vendor's
	 * cabinet catalog. This deliberately does not expose global/admin records.
	 */
	updateFeaturedStyleMaterials: distributorProcedure
	  .input(z.object({
	    distributorId: z.number().optional(),
	    styleId: z.number().int().positive(),
	    featuredLabel: z.string().max(128).nullable().optional(),
	    aliasName: z.string().max(128).nullable().optional(),
	    doorStyle: z.string().max(64).nullable().optional(),
	    color: z.string().max(64).nullable().optional(),
	    finish: z.string().max(128).nullable().optional(),
	    woodSpecies: z.string().max(64).nullable().optional(),
	    warehouseZips: z.array(z.string().regex(/^\d{5}$/, "Each shipping origin ZIP must be exactly 5 digits")).max(20).nullable().optional(),
	    flatFreightFeeCents: z.number().int().min(0).max(10_000_000).nullable().optional(),
	    doorSampleImageUrl: z.string().max(512).nullable().optional(),
	    drawerSampleImageUrl: z.string().max(512).nullable().optional(),
	    roomSceneImageUrl: z.string().max(512).nullable().optional(),
	    thumbnailImageUrl: z.string().max(512).nullable().optional(),
	    cornerSwatchImageUrl: z.string().max(512).nullable().optional(),
	    railWidth: z.number().min(0).max(99).nullable().optional(),
	    stileWidth: z.number().min(0).max(99).nullable().optional(),
	    centerRailWidth: z.number().min(0).max(99).nullable().optional(),
	    profileNotes: z.string().max(256).nullable().optional(),
	    profileDescription: z.string().nullable().optional(),
	    sourceSpecification: z.string().max(512).nullable().optional(),
	  }))
	  .mutation(async ({ ctx, input }) => {
	    const db = await getDb();
	    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
	    const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
	    const [style] = await db
		      .select({ id: doorStyles.id, isFeatured: doorStyles.isFeatured, doorSampleImageUrl: doorStyles.doorSampleImageUrl, thumbnailImageUrl: doorStyles.thumbnailImageUrl })
	      .from(doorStyles)
	      .where(and(eq(doorStyles.id, input.styleId), eq(doorStyles.distributorId, lineId)))
	      .limit(1);
	    if (!style) throw new TRPCError({ code: "FORBIDDEN", message: "That Door Style does not belong to your cabinet line." });
	    const [catalogEvidence] = await db
	      .select({ id: distributorSkus.id })
	      .from(distributorSkus)
	      .where(and(eq(distributorSkus.distributorId, lineId), eq(distributorSkus.styleId, input.styleId)))
	      .limit(1);
		    if (!catalogEvidence) throw new TRPCError({ code: "BAD_REQUEST", message: "Only Door Styles linked to your cabinets can be edited here." });

		    const { distributorId: _distributorId, styleId: _styleId, ...fields } = input;
		    const measurementFieldsSubmitted = fields.railWidth !== undefined
		      || fields.stileWidth !== undefined
		      || fields.centerRailWidth !== undefined
		      || fields.sourceSpecification !== undefined;
		    if (measurementFieldsSubmitted && !ctx.isAdmin) {
		      throw new TRPCError({
		        code: "BAD_REQUEST",
		        message: "Submit sample-door measurements for CabinetDealz verification instead of editing Designer frame data directly.",
		      });
		    }
		    const patch: Record<string, unknown> = {};
	    if (fields.featuredLabel !== undefined) patch.featuredLabel = fields.featuredLabel?.trim() || null;
	    if (fields.aliasName !== undefined) patch.aliasName = fields.aliasName?.trim() || null;
	    if (fields.doorStyle !== undefined) patch.doorStyle = fields.doorStyle?.trim() || null;
	    if (fields.color !== undefined) patch.color = fields.color?.trim() || null;
	    if (fields.finish !== undefined) patch.finish = fields.finish?.trim() || null;
	    if (fields.woodSpecies !== undefined) patch.woodSpecies = fields.woodSpecies?.trim() || null;
	    if (fields.warehouseZips !== undefined) {
	      const origins = Array.from(new Set((fields.warehouseZips ?? []).map((zip) => zip.trim()).filter(Boolean)));
	      patch.warehouseZips = origins.length > 0 ? origins : null;
	      patch.warehouseZip = origins[0] ?? null;
	    }
	    if (fields.flatFreightFeeCents !== undefined) patch.flatFreightFeeCents = fields.flatFreightFeeCents;
	    if (fields.doorSampleImageUrl !== undefined) patch.doorSampleImageUrl = fields.doorSampleImageUrl?.trim() || null;
	    if (fields.drawerSampleImageUrl !== undefined) patch.drawerSampleImageUrl = fields.drawerSampleImageUrl?.trim() || null;
		    if (fields.roomSceneImageUrl !== undefined) patch.roomSceneImageUrl = fields.roomSceneImageUrl?.trim() || null;
		    if (fields.thumbnailImageUrl !== undefined) patch.thumbnailImageUrl = fields.thumbnailImageUrl?.trim() || null;
		    const submittedDoorSample = fields.doorSampleImageUrl?.trim() || style.doorSampleImageUrl || null;
		    if (submittedDoorSample && !style.thumbnailImageUrl && !fields.thumbnailImageUrl) patch.thumbnailImageUrl = submittedDoorSample;
		    if (fields.cornerSwatchImageUrl !== undefined) patch.cornerSwatchImageUrl = fields.cornerSwatchImageUrl?.trim() || null;
	    if (fields.railWidth !== undefined) patch.railWidth = fields.railWidth ?? null;
	    if (fields.stileWidth !== undefined) patch.stileWidth = fields.stileWidth ?? null;
	    if (fields.centerRailWidth !== undefined) patch.centerRailWidth = fields.centerRailWidth ?? null;
	    if (fields.profileNotes !== undefined) patch.profileNotes = fields.profileNotes?.trim() || null;
	    if (fields.profileDescription !== undefined) patch.profileDescription = fields.profileDescription?.trim() || null;
	    if (fields.sourceSpecification !== undefined) patch.sourceSpecification = fields.sourceSpecification?.trim() || null;
	    const submittedRoomScene = fields.roomSceneImageUrl?.trim() || null;
	    if (fields.roomSceneImageUrl !== undefined && !submittedRoomScene && style.isFeatured) {
	      throw new TRPCError({ code: "BAD_REQUEST", message: "Remove this style from Featured Styles before clearing its room scene." });
	    }
	    if (submittedRoomScene) {
	      const existing = await db
	        .select({ id: doorStyleRoomScenes.id })
	        .from(doorStyleRoomScenes)
	        .where(and(eq(doorStyleRoomScenes.styleId, input.styleId), eq(doorStyleRoomScenes.sourceDistributorId, lineId)))
	        .orderBy(doorStyleRoomScenes.sortOrder, doorStyleRoomScenes.id)
	        .limit(1);
	      if (existing[0]) {
	        await db.update(doorStyleRoomScenes).set({ imageUrl: submittedRoomScene, isActive: true, isVerified: true, sourceNote: "Vendor-provided Featured Styles room scene" }).where(eq(doorStyleRoomScenes.id, existing[0].id));
	      } else {
	        const [{ sceneCount }] = await db.select({ sceneCount: sql<number>`count(*)` }).from(doorStyleRoomScenes).where(eq(doorStyleRoomScenes.styleId, input.styleId));
	        if (Number(sceneCount) >= 6) throw new TRPCError({ code: "BAD_REQUEST", message: "This Door Style already has the maximum of six room scenes." });
	        const [{ maxRank }] = await db.select({ maxRank: sql<number>`coalesce(max(${doorStyleRoomScenes.sortOrder}), 0)` }).from(doorStyleRoomScenes).where(eq(doorStyleRoomScenes.styleId, input.styleId));
	        await db.insert(doorStyleRoomScenes).values({ styleId: input.styleId, imageUrl: submittedRoomScene, sortOrder: Number(maxRank) + 10, isVerified: true, isActive: true, sourceDistributorId: lineId, sourceNote: "Vendor-provided Featured Styles room scene" });
	      }
	    }
		    if (Object.keys(patch).length > 0) await db.update(doorStyles).set(patch).where(eq(doorStyles.id, input.styleId));
		    return { ok: true };
		  }),

		/**
		 * Load the current user's in-progress sheet for one door style. Drafts are
		 * deliberately separate from submissions and are never visible to admins
		 * or other supplier accounts.
		 */
		doorMeasurementDraft: distributorProcedure
		  .input(z.object({ distributorId: z.number().optional(), styleId: z.number().int().positive() }))
		  .query(async ({ ctx, input }) => {
		    const db = await getDb();
		    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
		    const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
		    const [draft] = await db.select().from(doorStyleMeasurementDrafts)
		      .where(and(
		        eq(doorStyleMeasurementDrafts.styleId, input.styleId),
		        eq(doorStyleMeasurementDrafts.distributorId, lineId),
		        eq(doorStyleMeasurementDrafts.savedBy, ctx.user.id),
		      )).limit(1);
		    return draft ?? null;
		  }),

		/** Save incomplete sheet work without entering the CabinetDealz review queue. */
		saveDoorMeasurementDraft: distributorProcedure
		  .input(z.object({
		    distributorId: z.number().optional(),
		    styleId: z.number().int().positive(),
		    appliesToStyleIds: z.array(z.number().int().positive()).min(1).max(100),
		    measuredBy: z.string().trim().max(255).optional(),
		    measuredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD for the measurement date"),
		    measurements: sampleDoorMeasurementSchema,
		  }))
		  .mutation(async ({ ctx, input }) => {
		    const db = await getDb();
		    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
		    const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
		    const [style] = await db.select({ id: doorStyles.id }).from(doorStyles)
		      .where(and(eq(doorStyles.id, input.styleId), eq(doorStyles.distributorId, lineId))).limit(1);
		    if (!style) throw new TRPCError({ code: "FORBIDDEN", message: "That Door Style does not belong to your cabinet line." });
		    const appliesToStyleIds = Array.from(new Set([style.id, ...input.appliesToStyleIds]));
		    const linkedStyles = await db.select({ id: doorStyles.id }).from(doorStyles)
		      .where(and(eq(doorStyles.distributorId, lineId), inArray(doorStyles.id, appliesToStyleIds)));
		    if (linkedStyles.length !== appliesToStyleIds.length) {
		      throw new TRPCError({ code: "FORBIDDEN", message: "Every checked Door Style must belong to your own cabinet line." });
		    }
		    const draftValues = {
		      styleId: style.id,
		      distributorId: lineId,
		      savedBy: ctx.user.id,
		      savedByName: ctx.user.name ?? null,
		      appliesToStyleIds,
		      measuredBy: input.measuredBy?.trim() ?? "",
		      measuredOn: input.measuredOn,
		      measurementData: input.measurements,
		    };
		    const [existing] = await db.select({ id: doorStyleMeasurementDrafts.id }).from(doorStyleMeasurementDrafts)
		      .where(and(
		        eq(doorStyleMeasurementDrafts.styleId, style.id),
		        eq(doorStyleMeasurementDrafts.distributorId, lineId),
		        eq(doorStyleMeasurementDrafts.savedBy, ctx.user.id),
		      )).limit(1);
		    if (existing) {
		      await db.update(doorStyleMeasurementDrafts).set({
		        savedByName: draftValues.savedByName,
		        appliesToStyleIds: draftValues.appliesToStyleIds,
		        measuredBy: draftValues.measuredBy,
		        measuredOn: draftValues.measuredOn,
		        measurementData: draftValues.measurementData,
		        updatedAt: new Date(),
		      }).where(eq(doorStyleMeasurementDrafts.id, existing.id));
		      return { id: existing.id, saved: true as const };
		    }
		    const [result] = await db.insert(doorStyleMeasurementDrafts).values(draftValues);
		    return { id: Number((result as { insertId?: number }).insertId), saved: true as const };
		  }),

		/** Remove a draft after it has been submitted, or when the owner discards it. */
		deleteDoorMeasurementDraft: distributorProcedure
		  .input(z.object({ distributorId: z.number().optional(), styleId: z.number().int().positive() }))
		  .mutation(async ({ ctx, input }) => {
		    const db = await getDb();
		    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
		    const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
		    await db.delete(doorStyleMeasurementDrafts).where(and(
		      eq(doorStyleMeasurementDrafts.styleId, input.styleId),
		      eq(doorStyleMeasurementDrafts.distributorId, lineId),
		      eq(doorStyleMeasurementDrafts.savedBy, ctx.user.id),
		    ));
		    return { deleted: true as const };
		  }),

		/** Attach or replace one of the four reference images on an existing draft. */
		uploadDoorMeasurementDraftPhoto: distributorProcedure
		  .input(z.object({
		    distributorId: z.number().optional(),
		    styleId: z.number().int().positive(),
		    photoType: z.enum(["door", "drawer", "edge", "back"]),
		    imageBase64: z.string().min(1).max(11_000_000),
		    contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
		    fileName: z.string().trim().min(1).max(256),
		  }))
		  .mutation(async ({ ctx, input }) => {
		    const db = await getDb();
		    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
		    const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
		    const [draft] = await db.select().from(doorStyleMeasurementDrafts).where(and(
		      eq(doorStyleMeasurementDrafts.styleId, input.styleId),
		      eq(doorStyleMeasurementDrafts.distributorId, lineId),
		      eq(doorStyleMeasurementDrafts.savedBy, ctx.user.id),
		    )).limit(1);
		    if (!draft) throw new TRPCError({ code: "BAD_REQUEST", message: "Save the measuring-sheet draft before attaching a photo." });
		    const buffer = Buffer.from(input.imageBase64, "base64");
		    if (buffer.length === 0 || buffer.length > 8 * 1024 * 1024) {
		      throw new TRPCError({ code: "BAD_REQUEST", message: "Reference images must be smaller than 8 MB." });
		    }
		    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "reference.jpg";
		    const { url } = await storagePut(
		      `door-measurement-drafts/${ctx.user.id}/${lineId}/${input.styleId}/${Date.now()}-${input.photoType}-${safeName}`,
		      buffer,
		      input.contentType,
		    );
		    const currentData = draft.measurementData ?? {};
		    const currentPhotos = Array.isArray(currentData.referencePhotos) ? currentData.referencePhotos : [];
		    const photo = { photoType: input.photoType, url, fileName: input.fileName, uploadedAt: new Date().toISOString() };
		    const referencePhotos = [...currentPhotos.filter((item) => item && typeof item === "object" && (item as { photoType?: string }).photoType !== input.photoType), photo];
		    await db.update(doorStyleMeasurementDrafts).set({
		      measurementData: { ...currentData, referencePhotos },
		      updatedAt: new Date(),
		    }).where(eq(doorStyleMeasurementDrafts.id, draft.id));
		    return { photo, saved: true as const };
		  }),

		/**
		 * Record the exact measurements a vendor took from a supplied sample door.
		 * This is an official first-party source record, but it is intentionally
		 * pending until CabinetDealz confirms the physical sample before Designer
		 * frame geometry is changed.
		 */
		submitDoorMeasurement: distributorProcedure
		  .input(z.object({
		    distributorId: z.number().optional(),
		    styleId: z.number().int().positive(),
		    appliesToStyleIds: z.array(z.number().int().positive()).min(1).max(100),
		    measuredBy: z.string().trim().min(1).max(255),
		    measuredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD for the measurement date"),
		    measurements: sampleDoorMeasurementSchema,
		  }))
		  .mutation(async ({ ctx, input }) => {
		    const db = await getDb();
		    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
		    const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
		    const [style] = await db
		      .select({ id: doorStyles.id, styleCode: doorStyles.styleCode, ourName: doorStyles.ourName })
		      .from(doorStyles)
		      .where(and(eq(doorStyles.id, input.styleId), eq(doorStyles.distributorId, lineId)))
		      .limit(1);
		    if (!style) throw new TRPCError({ code: "FORBIDDEN", message: "That Door Style does not belong to your cabinet line." });
		    const appliesToStyleIds = Array.from(new Set([style.id, ...input.appliesToStyleIds]));
		    const linkedStyles = await db.select({ id: doorStyles.id }).from(doorStyles)
		      .where(and(eq(doorStyles.distributorId, lineId), inArray(doorStyles.id, appliesToStyleIds)));
		    if (linkedStyles.length !== appliesToStyleIds.length) {
		      throw new TRPCError({ code: "FORBIDDEN", message: "Every checked Door Style must belong to your own cabinet line." });
		    }
		    const styleEvidence = await db.selectDistinct({ styleId: distributorSkus.styleId }).from(distributorSkus)
		      .where(and(eq(distributorSkus.distributorId, lineId), inArray(distributorSkus.styleId, appliesToStyleIds)));
		    if (styleEvidence.length !== appliesToStyleIds.length) {
		      throw new TRPCError({ code: "BAD_REQUEST", message: "Every checked Door Style must be linked to at least one cabinet in your catalog." });
		    }
		    const [line] = await db
		      .select({ name: distributors.name })
		      .from(distributors)
		      .where(eq(distributors.id, lineId))
		      .limit(1);
		    if (!line) throw new TRPCError({ code: "NOT_FOUND", message: "Supply line not found." });
		    const citation = `Measured from sample door: ${line.name} ${style.styleCode}, measured by ${input.measuredBy} on ${input.measuredOn}.${appliesToStyleIds.length > 1 ? ` Same profile submitted for ${appliesToStyleIds.length} checked styles.` : ""}`;
		    const [result] = await db.insert(doorStyleMeasurementSubmissions).values({
		      styleId: style.id,
		      distributorId: lineId,
		      vendorLineName: line.name,
		      vendorStyleCode: style.styleCode,
		      vendorStyleName: style.ourName,
		      appliesToStyleIds,
		      measuredBy: input.measuredBy,
		      measuredOn: input.measuredOn,
		      measurementData: input.measurements,
		      citation,
		      submittedBy: ctx.user.id,
		      submittedByName: ctx.user.name ?? null,
		    });
		    await db.delete(doorStyleMeasurementDrafts).where(and(
		      eq(doorStyleMeasurementDrafts.styleId, style.id),
		      eq(doorStyleMeasurementDrafts.distributorId, lineId),
		      eq(doorStyleMeasurementDrafts.savedBy, ctx.user.id),
		    ));
		    return { id: Number((result as { insertId?: number }).insertId), status: "pending" as const, citation };
		  }),

		/** CabinetDealz-only queue for confirming physical sample measurements. */
		listDoorMeasurementSubmissions: adminProcedure
		  .input(z.object({ status: z.enum(["pending", "approved", "rejected", "all"]).default("pending"), limit: z.number().int().min(1).max(200).default(100) }).optional())
		  .query(async ({ input }) => {
		    const db = await getDb();
		    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
		    const args = input ?? { status: "pending" as const, limit: 100 };
		    const base = db.select().from(doorStyleMeasurementSubmissions).orderBy(desc(doorStyleMeasurementSubmissions.submittedAt)).limit(args.limit);
		    return args.status === "all"
		      ? await base
		      : await db.select().from(doorStyleMeasurementSubmissions)
		        .where(eq(doorStyleMeasurementSubmissions.status, args.status))
		        .orderBy(desc(doorStyleMeasurementSubmissions.submittedAt)).limit(args.limit);
		  }),

		/** Apply the team-measured values only after the physical sample was checked. */
		reviewDoorMeasurementSubmission: adminProcedure
		  .input(z.object({
		    id: z.number().int().positive(),
		    approve: z.boolean(),
		    physicalSampleMeasured: z.boolean(),
		    railWidth: z.number().positive().max(24).nullable().optional(),
		    stileWidth: z.number().positive().max(24).nullable().optional(),
		    centerRailWidth: z.number().positive().max(24).nullable().optional(),
		    reviewNote: z.string().trim().max(512).optional(),
		  }))
		  .mutation(async ({ ctx, input }) => {
		    const db = await getDb();
		    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
		    const [submission] = await db.select().from(doorStyleMeasurementSubmissions)
		      .where(eq(doorStyleMeasurementSubmissions.id, input.id)).limit(1);
		    if (!submission) throw new TRPCError({ code: "NOT_FOUND", message: "Measurement submission not found." });
		    if (submission.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: "This measurement submission was already reviewed." });
		    if (input.approve && !input.physicalSampleMeasured) {
		      throw new TRPCError({ code: "BAD_REQUEST", message: "Confirm that CabinetDealz measured the physical sample before approving it for Designer." });
		    }
		    if (input.approve && (input.railWidth == null || input.stileWidth == null)) {
		      throw new TRPCError({ code: "BAD_REQUEST", message: "Enter both team-measured rail and stile widths before approving Designer geometry." });
		    }
		    const now = new Date();
		    await db.update(doorStyleMeasurementSubmissions).set({
		      status: input.approve ? "approved" : "rejected",
		      reviewedBy: ctx.user.id,
		      reviewedByName: ctx.user.name ?? null,
		      reviewedAt: now,
		      reviewNote: input.reviewNote?.trim() || null,
		    }).where(eq(doorStyleMeasurementSubmissions.id, submission.id));
		    if (input.approve) {
		      await db.update(doorStyles).set({
		        railWidth: String(input.railWidth),
		        stileWidth: String(input.stileWidth),
		        centerRailWidth: input.centerRailWidth == null ? null : String(input.centerRailWidth),
		        sourceSpecification: submission.citation,
		        doorSampleVerified: true,
		      }).where(inArray(doorStyles.id, submission.appliesToStyleIds));
		    }
		    return { ok: true, approved: input.approve };
		  }),

		/** Add a vendor-owned, verified merchandising scene without granting access to other vendors' libraries. */
	addFeaturedStyleScene: distributorProcedure
	  .input(z.object({ distributorId: z.number().optional(), styleId: z.number().int().positive(), imageUrl: z.string().trim().min(1).max(512), sourceNote: z.string().max(512).nullable().optional() }))
	  .mutation(async ({ ctx, input }) => {
	    const db = await getDb();
	    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
	    const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
	    const [style] = await db.select({ id: doorStyles.id }).from(doorStyles).where(and(eq(doorStyles.id, input.styleId), eq(doorStyles.distributorId, lineId))).limit(1);
	    if (!style) throw new TRPCError({ code: "FORBIDDEN", message: "That Door Style does not belong to your cabinet line." });
	    const [{ sceneCount }] = await db.select({ sceneCount: sql<number>`count(*)` }).from(doorStyleRoomScenes).where(eq(doorStyleRoomScenes.styleId, input.styleId));
	    if (Number(sceneCount) >= 6) throw new TRPCError({ code: "BAD_REQUEST", message: "Each Door Style can have up to six room scenes." });
	    const [{ maxRank }] = await db.select({ maxRank: sql<number>`coalesce(max(${doorStyleRoomScenes.sortOrder}), 0)` }).from(doorStyleRoomScenes).where(eq(doorStyleRoomScenes.styleId, input.styleId));
	    await db.insert(doorStyleRoomScenes).values({ styleId: input.styleId, imageUrl: input.imageUrl.trim(), sortOrder: Number(maxRank) + 10, isVerified: true, isActive: true, sourceDistributorId: lineId, sourceNote: input.sourceNote?.trim() || "Vendor-provided Featured Styles room scene" });
	    return { ok: true };
	  }),

	/** A vendor may remove only its own submitted room scenes, never another supplier's or admin's assets. */
	deleteFeaturedStyleScene: distributorProcedure
	  .input(z.object({ distributorId: z.number().optional(), sceneId: z.number().int().positive() }))
	  .mutation(async ({ ctx, input }) => {
	    const db = await getDb();
	    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
	    const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
	    const [scene] = await db
	      .select({ id: doorStyleRoomScenes.id })
	      .from(doorStyleRoomScenes)
	      .innerJoin(doorStyles, eq(doorStyles.id, doorStyleRoomScenes.styleId))
	      .where(and(eq(doorStyleRoomScenes.id, input.sceneId), eq(doorStyles.distributorId, lineId), eq(doorStyleRoomScenes.sourceDistributorId, lineId)))
	      .limit(1);
	    if (!scene) throw new TRPCError({ code: "FORBIDDEN", message: "Only your own room-scene submission can be removed." });
	    await db.delete(doorStyleRoomScenes).where(eq(doorStyleRoomScenes.id, input.sceneId));
	    return { ok: true };
	  }),

	/**
	 * Shipping readiness for one vendor line. The green coverage check is based
	 * only on durable shipping-origin assignments: it confirms that a style's
	 * cabinets use every configured warehouse origin (or inherit all of them).
	 * It deliberately does not claim live warehouse inventory, which is not a
	 * field in the current supplier feed.
	 */
	shippingOverview: distributorProcedure
	  .input(z.object({ distributorId: z.number().optional() }).optional())
	  .query(async ({ ctx, input }) => {
	    const db = await getDb();
	    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
	    const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input?.distributorId);
	    const [line] = await db
	      .select({
	        id: distributors.id,
	        name: distributors.name,
	        code: distributors.code,
	        warehouseName: distributors.warehouseName,
	        warehouseAddress: distributors.warehouseAddress,
	        warehouseZips: distributors.warehouseZips,
	        leadTimeDays: distributors.leadTimeDays,
	        shippingRuleMode: distributors.shippingRuleMode,
	        shippingFlatFreightFeeCents: distributors.shippingFlatFreightFeeCents,
	        shippingFreeFreightThresholdCents: distributors.shippingFreeFreightThresholdCents,
	        shippingZipRates: distributors.shippingZipRates,
	        shippingExceptions: distributors.shippingExceptions,
	        pickupEnabled: distributors.pickupEnabled,
	        pickupZip: distributors.pickupZip,
	        pickupAddress: distributors.pickupAddress,
	        pickupRadiusMiles: distributors.pickupRadiusMiles,
	      })
	      .from(distributors)
	      .where(eq(distributors.id, lineId))
	      .limit(1);
	    if (!line) throw new TRPCError({ code: "NOT_FOUND", message: "Supply line not found" });

	    const warehouses = Array.from(new Set((line.warehouseZips ?? [])
	      .filter((zip): zip is string => typeof zip === "string")
	      .map((zip) => zip.trim())
	      .filter((zip) => /^\d{5}$/.test(zip))));
	    const styleRows = await db
	      .select({
	        id: doorStyles.id,
	        ourName: doorStyles.ourName,
	        distributorName: doorStyles.distributorName,
	        doorStyle: doorStyles.doorStyle,
	        color: doorStyles.color,
	        finish: doorStyles.finish,
	        roomSceneImageUrl: doorStyles.roomSceneImageUrl,
	        doorSampleImageUrl: doorStyles.doorSampleImageUrl,
	        thumbnailImageUrl: doorStyles.thumbnailImageUrl,
	        warehouseZip: doorStyles.warehouseZip,
	        warehouseZips: doorStyles.warehouseZips,
	        flatFreightFeeCents: doorStyles.flatFreightFeeCents,
	        isFeatured: doorStyles.isFeatured,
	        featuredRank: doorStyles.featuredRank,
	        isActive: doorStyles.isActive,
	      })
	      .from(doorStyles)
	      .where(eq(doorStyles.distributorId, lineId))
	      .orderBy(doorStyles.featuredRank, doorStyles.ourName);
	    const styleIds = styleRows.map((style) => style.id);
	    const skuRows = styleIds.length === 0 ? [] : await db
	      .select({
	        styleId: distributorSkus.styleId,
	        catalogCount: sql<number>`count(*)`,
	        availableCount: sql<number>`sum(case when ${distributorSkus.isAvailable} = true then 1 else 0 end)`,
	        publishedCount: sql<number>`sum(case when ${distributorSkus.isPublished} = true then 1 else 0 end)`,
	      })
	      .from(distributorSkus)
	      .where(and(eq(distributorSkus.distributorId, lineId), inArray(distributorSkus.styleId, styleIds)))
	      .groupBy(distributorSkus.styleId);
	    const counts = new Map(skuRows.map((row) => [row.styleId, {
	      catalogCount: Number(row.catalogCount),
	      availableCount: Number(row.availableCount),
	      publishedCount: Number(row.publishedCount),
	    }]));

	    const styles = styleRows.map((style) => {
	      const explicitOrigins = Array.from(new Set([...(style.warehouseZips ?? []), style.warehouseZip ?? ""]
	        .filter((zip): zip is string => typeof zip === "string")
	        .map((zip) => zip.trim())
	        .filter((zip) => /^\d{5}$/.test(zip))));
	      const originZips = explicitOrigins.length > 0 ? explicitOrigins : warehouses;
	      const allWarehousesCovered = warehouses.length > 0 && warehouses.every((zip) => originZips.includes(zip));
	      return {
	        ...style,
	        originZips,
	        originMode: explicitOrigins.length > 0 ? "style" as const : "line" as const,
	        allWarehousesCovered,
	        ...(counts.get(style.id) ?? { catalogCount: 0, availableCount: 0, publishedCount: 0 }),
	      };
	    }).filter((style) => style.catalogCount > 0);
	    const allCabinetsCovered = styles.length > 0 && styles.every((style) => style.allWarehousesCovered);

	    return { line: { ...line, warehouseZips: warehouses }, styles, allCabinetsCovered };
	  }),

	/** Vendor-owned shipping configuration. Pricing/catalog controls stay outside this surface. */
	updateShippingSettings: distributorProcedure
	  .input(z.object({
	    distributorId: z.number().optional(),
	    warehouseName: z.string().trim().max(128).nullable().optional(),
	    warehouseAddress: z.string().trim().max(512).nullable().optional(),
	    warehouseZips: z.array(z.string().trim().regex(/^\d{5}$/, "Each warehouse ZIP must be exactly 5 digits")).min(1).max(12),
	    leadTimeDays: z.number().int().min(0).max(365).nullable().optional(),
	    shippingRuleMode: z.enum(["live", "fixed", "threshold"]),
	    shippingFlatFreightFeeCents: z.number().int().min(0).max(100_000_000).nullable(),
	    shippingFreeFreightThresholdCents: z.number().int().min(0).max(100_000_000).nullable(),
	    shippingZipRates: z.array(z.object({ zipPrefix: z.string().trim().regex(/^\d{3,5}$/), feeCents: z.number().int().min(0).max(100_000_000) })).max(100),
	    shippingExceptions: z.string().trim().max(2000).nullable().optional(),
	    pickupEnabled: z.boolean(),
	    pickupZip: z.string().trim().regex(/^\d{5}$/, "Pickup ZIP must be exactly 5 digits").nullable(),
	    pickupAddress: z.string().trim().max(512).nullable().optional(),
	    pickupRadiusMiles: z.number().int().min(1).max(1000).nullable(),
	  }))
	  .mutation(async ({ ctx, input }) => {
	    const db = await getDb();
	    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
	    const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
	    const warehouseZips = Array.from(new Set(input.warehouseZips.map((zip) => zip.trim())));
	    const zipRates = normalizeDistributorZipRates(input.shippingZipRates);
	    const mode = input.shippingRuleMode as DistributorShippingRuleMode;
	    if (!shippingRuleCanQuote({ mode, flatFeeCents: input.shippingFlatFreightFeeCents, freeThresholdCents: input.shippingFreeFreightThresholdCents, zipRates, exceptions: input.shippingExceptions ?? null })) {
	      throw new TRPCError({ code: "BAD_REQUEST", message: "A fixed or threshold shipping rule needs a fixed fee or at least one ZIP rate." });
	    }
	    if (input.pickupEnabled && !(input.pickupZip ?? warehouseZips[0])) {
	      throw new TRPCError({ code: "BAD_REQUEST", message: "Enable pickup only after providing a pickup ZIP or warehouse origin." });
	    }
	    await db.update(distributors).set({
	      warehouseName: input.warehouseName?.trim() || null,
	      warehouseAddress: input.warehouseAddress?.trim() || null,
	      warehouseZips,
	      leadTimeDays: input.leadTimeDays,
	      shippingRuleMode: mode,
	      shippingFlatFreightFeeCents: input.shippingFlatFreightFeeCents,
	      shippingFreeFreightThresholdCents: input.shippingFreeFreightThresholdCents,
	      shippingZipRates: zipRates,
	      shippingExceptions: input.shippingExceptions?.trim() || null,
	      pickupEnabled: input.pickupEnabled,
	      pickupZip: input.pickupZip?.trim() || null,
	      pickupAddress: input.pickupAddress?.trim() || null,
	      pickupRadiusMiles: input.pickupRadiusMiles ?? 100,
	    }).where(eq(distributors.id, lineId));
	    return { ok: true };
	  }),

	/**
   * Active saved-design pipeline for a vendor line. Only 30/90/180-day views
   * capped at the six-month active window contribute demand. A linked confirmed
   * or paid order closes a design; a seven-month-old unsold design is listed
   * solely in the optional dead-design view and never affects inventory demand.
   */
  inventoryForecast: distributorProcedure
    .input(z.object({
      distributorId: z.number().optional(),
      days: z.union([z.literal(30), z.literal(90), z.literal(180)]).default(180),
      includeDead: z.boolean().default(false),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input?.distributorId);
      const days = input?.days ?? 180;
      const sixMonthsAgo = monthOffset(6);
      const requestedSince = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const activeSince = requestedSince > sixMonthsAgo ? requestedSince : sixMonthsAgo;
      const deadBefore = monthOffset(7);

      const [line, activeDesigns, deadCandidates, skuRows] = await Promise.all([
        db.select({
          id: distributors.id,
          name: distributors.name,
          inventoryForecastCloseRateBps: distributors.inventoryForecastCloseRateBps,
          inventoryForecastLowRateBps: distributors.inventoryForecastLowRateBps,
          inventoryForecastHighRateBps: distributors.inventoryForecastHighRateBps,
        }).from(distributors).where(eq(distributors.id, lineId)).limit(1),
        db.select({
          id: kitchenDesigns.id,
          name: kitchenDesigns.name,
          affiliateId: kitchenDesigns.affiliateId,
          selectedStyleId: kitchenDesigns.selectedStyleId,
          placedCabinets: kitchenDesigns.placedCabinets,
          updatedAt: kitchenDesigns.updatedAt,
        }).from(kitchenDesigns).where(and(
          eq(kitchenDesigns.selectedDistributorId, lineId),
          gte(kitchenDesigns.updatedAt, activeSince),
        )),
        input?.includeDead
          ? db.select({
              id: kitchenDesigns.id,
              name: kitchenDesigns.name,
              affiliateId: kitchenDesigns.affiliateId,
              selectedStyleId: kitchenDesigns.selectedStyleId,
              placedCabinets: kitchenDesigns.placedCabinets,
              updatedAt: kitchenDesigns.updatedAt,
            }).from(kitchenDesigns).where(and(
              eq(kitchenDesigns.selectedDistributorId, lineId),
              lte(kitchenDesigns.updatedAt, deadBefore),
            )).orderBy(desc(kitchenDesigns.updatedAt)).limit(250)
          : Promise.resolve([]),
        db.select({
          cabinetId: distributorSkus.cabinetId,
          styleId: distributorSkus.styleId,
          distributorSku: distributorSkus.distributorSku,
          masterCode: cabinets.masterCode,
          onHandQty: distributorSkus.onHandQty,
        }).from(distributorSkus)
          .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
          .where(and(eq(distributorSkus.distributorId, lineId), eq(distributorSkus.isAvailable, true))),
      ]);
      const lineRow = line[0];
      if (!lineRow) throw new TRPCError({ code: "NOT_FOUND", message: "Supply line not found" });

      const allDesignIds = activeDesigns.concat(deadCandidates).map((design) => design.id);
      const closedDesignIds = new Set<number>();
      if (allDesignIds.length > 0) {
        const sales = await db.select({ kitchenDesignId: orderRequests.kitchenDesignId })
          .from(orderRequests)
          .where(and(
            inArray(orderRequests.kitchenDesignId, allDesignIds),
            or(eq(orderRequests.status, "confirmed"), isNotNull(orderRequests.paidAt)),
          ));
        sales.forEach((sale) => { if (sale.kitchenDesignId != null) closedDesignIds.add(sale.kitchenDesignId); });
      }

      const exactSku = new Map<string, typeof skuRows[number]>();
      const fallbackSku = new Map<number, typeof skuRows[number]>();
      const stockByMaster = new Map<string, { known: boolean; total: number; vendorSkus: Set<string> }>();
      for (const sku of skuRows) {
        if (sku.cabinetId == null) continue;
        exactSku.set(`${sku.cabinetId}:${sku.styleId}`, sku);
        if (!fallbackSku.has(sku.cabinetId)) fallbackSku.set(sku.cabinetId, sku);
        const stock = stockByMaster.get(sku.masterCode) ?? { known: true, total: 0, vendorSkus: new Set<string>() };
        stock.known = stock.known && sku.onHandQty != null;
        stock.total += sku.onHandQty ?? 0;
        stock.vendorSkus.add(sku.distributorSku);
        stockByMaster.set(sku.masterCode, stock);
      }

      const demand = new Map<string, { masterCode: string; vendorSkus: Set<string>; qty: number; designs: Set<number>; affiliates: Set<number> }>();
      for (const design of activeDesigns) {
        if (closedDesignIds.has(design.id)) continue;
        for (const placed of design.placedCabinets ?? []) {
          const cabinetId = Number((placed as { cabinetId?: unknown }).cabinetId);
          if (!Number.isInteger(cabinetId) || cabinetId <= 0) continue;
          const sku = design.selectedStyleId == null
            ? fallbackSku.get(cabinetId)
            : (exactSku.get(`${cabinetId}:${design.selectedStyleId}`) ?? fallbackSku.get(cabinetId));
          if (!sku) continue;
          const row = demand.get(sku.masterCode) ?? { masterCode: sku.masterCode, vendorSkus: new Set<string>(), qty: 0, designs: new Set<number>(), affiliates: new Set<number>() };
          row.vendorSkus.add(sku.distributorSku);
          row.qty += placedCabinetQuantity(placed);
          row.designs.add(design.id);
          if (design.affiliateId != null) row.affiliates.add(design.affiliateId);
          demand.set(sku.masterCode, row);
        }
      }

      const rates = formatForecastRates(lineRow);
      const rows = Array.from(demand.values()).map((demandRow) => {
        const stock = stockByMaster.get(demandRow.masterCode);
        return inventoryForecastRow({
          masterCode: demandRow.masterCode,
          vendorSku: Array.from(demandRow.vendorSkus).sort().join(" / "),
          openDesignQty: demandRow.qty,
          openDesignCount: demandRow.designs.size,
          affiliateCount: demandRow.affiliates.size,
          onHandQty: stock?.known ? stock.total : null,
        }, rates);
      }).sort((a, b) => b.openDesignQty - a.openDesignQty || a.masterCode.localeCompare(b.masterCode));

      return {
        lineName: lineRow.name,
        days,
        activeSince,
        deadBefore,
        rates,
        rateConfigured: isForecastRateBps(rates.baseRateBps),
        openDesignCount: activeDesigns.filter((design) => !closedDesignIds.has(design.id)).length,
        closedDesignCount: activeDesigns.filter((design) => closedDesignIds.has(design.id)).length,
        rows,
        deadDesigns: input?.includeDead
          ? deadCandidates.filter((design) => !closedDesignIds.has(design.id)).map((design) => ({
              id: design.id,
              name: design.name,
              affiliateId: design.affiliateId,
              lastActivityAt: design.updatedAt,
              placedCabinetCount: (design.placedCabinets ?? []).length,
            }))
          : [],
      };
    }),

  /** Admin-owned close-rate controls. Null is intentionally shown as TBD. */
  updateInventoryForecastRates: distributorProcedure
    .input(z.object({
      distributorId: z.number().positive(),
      baseRateBps: z.number().int().min(0).max(10000).nullable(),
      lowRateBps: z.number().int().min(0).max(10000).nullable(),
      highRateBps: z.number().int().min(0).max(10000).nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.isAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "Only an administrator can set the inventory close-rate forecast." });
      if (input.baseRateBps == null && (input.lowRateBps != null || input.highRateBps != null)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Set a base close rate before using low or high forecast bands." });
      }
      if (input.baseRateBps != null && input.lowRateBps != null && input.lowRateBps > input.baseRateBps) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The low rate cannot exceed the base close rate." });
      }
      if (input.baseRateBps != null && input.highRateBps != null && input.highRateBps < input.baseRateBps) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "The high rate cannot be below the base close rate." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.update(distributors).set({
        inventoryForecastCloseRateBps: input.baseRateBps,
        inventoryForecastLowRateBps: input.baseRateBps == null ? null : input.lowRateBps,
        inventoryForecastHighRateBps: input.baseRateBps == null ? null : input.highRateBps,
      }).where(eq(distributors.id, input.distributorId));
      return { updated: true };
    }),

  /** This line's catalog: one row per SKU with cabinet info + visibility state. */
  catalog: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        styleId: z.number().optional(),
        category: z.string().max(64).optional(),
        search: z.string().max(64).optional(),
        onlyHidden: z.boolean().optional(),
        onlyPending: z.boolean().optional(),
        limit: z.number().int().min(1).max(500).default(100),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      const conds = [eq(distributorSkus.distributorId, lineId)];
      if (input.styleId) conds.push(eq(distributorSkus.styleId, input.styleId));
      if (input.onlyHidden) conds.push(eq(distributorSkus.isPublished, false));
      if (input.onlyPending) conds.push(eq(distributorSkus.status, "pending"));
      if (input.category) conds.push(eq(cabinets.category, input.category));
      const q = input.search?.trim();
      if (q) {
        const like = `%${q}%`;
        const normalizedCodeSearch = normalizeCode(q);
        const normalizedMasterCode = sql`UPPER(REPLACE(REPLACE(REPLACE(${cabinets.masterCode}, '-', ''), ' ', ''), '_', ''))`;
        const normalizedDistributorSku = sql`UPPER(REPLACE(REPLACE(REPLACE(${distributorSkus.distributorSku}, '-', ''), ' ', ''), '_', ''))`;
        const normalizedPlatformSku = sql`UPPER(REPLACE(REPLACE(REPLACE(${distributorSkus.platformSku}, '-', ''), ' ', ''), '_', ''))`;
        conds.push(
          sql`(${cabinets.masterCode} LIKE ${like} OR ${cabinets.description} LIKE ${like} OR ${distributorSkus.distributorSku} LIKE ${like} OR ${distributorSkus.supplierCabinetName} LIKE ${like} OR ${distributorSkus.platformSku} LIKE ${like} OR ${normalizedMasterCode} LIKE ${`%${normalizedCodeSearch}%`} OR ${normalizedDistributorSku} LIKE ${`%${normalizedCodeSearch}%`} OR ${normalizedPlatformSku} LIKE ${`%${normalizedCodeSearch}%`})`
        );
      }

      const base = db
        .select({
          skuId: distributorSkus.id,
          cabinetId: distributorSkus.cabinetId,
          masterCode: cabinets.masterCode,
          distributorSku: distributorSkus.distributorSku,
          supplierCabinetName: distributorSkus.supplierCabinetName,
          description: cabinets.description,
          category: cabinets.category,
          subCategory: cabinets.subCategory,
          styleId: distributorSkus.styleId,
          styleName: doorStyles.ourName,
          platformSku: distributorSkus.platformSku,
          listPrice: distributorSkus.listPrice,
          yourCost: distributorSkus.yourCost,
          wholesalePrice: distributorSkus.wholesalePrice,
          contractorPrice: distributorSkus.contractorPrice,
          homeownerPrice: distributorSkus.homeownerPrice,
          onHandQty: distributorSkus.onHandQty,
          isPublished: distributorSkus.isPublished,
          isAvailable: distributorSkus.isAvailable,
          imageUrl: distributorSkus.imageUrl,
          catalogImageUrl: cabinets.catalogImageUrl,
          status: distributorSkus.status,
        })
        .from(distributorSkus)
        .leftJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .leftJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
        .where(and(...conds));

      const rows = await base
        .orderBy(cabinets.category, cabinets.masterCode)
        .limit(input.limit)
        .offset(input.offset);

      // Total count for pagination — reflects the SAME filters (incl. search).
      const [tot] = await db
        .select({ n: sql<number>`count(*)` })
        .from(distributorSkus)
        .leftJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .leftJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
        .where(and(...conds));

      return { items: rows, total: Number(tot?.n ?? 0) };
    }),

  /** Toggle a single SKU's published (visible) state. Scoped to this line. */
  setVisibility: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        skuId: z.number(),
        isPublished: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      // Ownership guard: the SKU must belong to this line.
      const owned = await db
        .select({
          id: distributorSkus.id,
          cabinetId: distributorSkus.cabinetId,
          supplierDescription: distributorSkus.supplierDescription,
          pkgLength: distributorSkus.pkgLength,
          pkgWidth: distributorSkus.pkgWidth,
          pkgHeight: distributorSkus.pkgHeight,
          pkgWeight: distributorSkus.pkgWeight,
          listPrice: distributorSkus.listPrice,
          yourCost: distributorSkus.yourCost,
        })
        .from(distributorSkus)
        .where(and(eq(distributorSkus.id, input.skuId), eq(distributorSkus.distributorId, lineId)))
        .limit(1);
      if (!owned[0]) throw new TRPCError({ code: "FORBIDDEN", message: "That product is not in your line." });
      if (input.isPublished && owned[0].cabinetId == null) {
        const packageValues = [owned[0].pkgLength, owned[0].pkgWidth, owned[0].pkgHeight, owned[0].pkgWeight].map(Number);
        if (!owned[0].supplierDescription?.trim() || packageValues.some((value) => !Number.isFinite(value) || value <= 0) || !hasVendorPrice(owned[0].listPrice, owned[0].yourCost)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Complete the supplier description, package dimensions, weight, and source price before publishing an unmatched item." });
        }
      }

      await db
        .update(distributorSkus)
        .set({ isPublished: input.isPublished })
        .where(eq(distributorSkus.id, input.skuId));
      return { skuId: input.skuId, isPublished: input.isPublished };
    }),

  /** Bulk publish/unpublish a set of SKUs in this line. */
  bulkSetVisibility: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        skuIds: z.array(z.number()).min(1).max(1000),
        isPublished: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      // Only update rows that belong to this line.
      const owned = await db
        .select({ id: distributorSkus.id })
        .from(distributorSkus)
        .where(and(inArray(distributorSkus.id, input.skuIds), eq(distributorSkus.distributorId, lineId)));
      const ownedIds = owned.map((o) => o.id);
      if (ownedIds.length === 0) return { updated: 0 };

      await db
        .update(distributorSkus)
        .set({ isPublished: input.isPublished })
        .where(inArray(distributorSkus.id, ownedIds));
      return { updated: ownedIds.length };
    }),

  /** Administrator product list used by the direct draft/edit/publish workspace. */
  adminProductList: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        status: z.enum(["all", "pending", "approved", "rejected"]).default("all"),
        search: z.string().trim().max(128).optional(),
        limit: z.number().int().min(1).max(250).default(100),
        offset: z.number().int().min(0).default(0),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.isAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "Only administrators can manage supplier products." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const args = input ?? { status: "all" as const, limit: 100, offset: 0 };
      const conditions: any[] = [];
      if (args.distributorId) conditions.push(eq(distributorSkus.distributorId, args.distributorId));
      if (args.status !== "all") conditions.push(eq(distributorSkus.status, args.status));
      if (args.search) {
        const like = `%${args.search}%`;
        conditions.push(sql`(
          ${cabinets.masterCode} LIKE ${like}
          OR ${cabinets.description} LIKE ${like}
          OR ${distributorSkus.distributorSku} LIKE ${like}
          OR ${distributorSkus.supplierCabinetName} LIKE ${like}
          OR ${distributorSkus.platformSku} LIKE ${like}
        )`);
      }
      const where = conditions.length ? and(...conditions) : undefined;
      const select = {
        skuId: distributorSkus.id,
        cabinetId: distributorSkus.cabinetId,
        masterCode: cabinets.masterCode,
        description: cabinets.description,
        category: cabinets.category,
        distributorId: distributors.id,
        distributorName: distributors.name,
        distributorBrandName: distributors.brandName,
        styleId: doorStyles.id,
        styleName: doorStyles.ourName,
        styleCode: doorStyles.styleCode,
        distributorSku: distributorSkus.distributorSku,
        platformSku: distributorSkus.platformSku,
        supplierCabinetName: distributorSkus.supplierCabinetName,
        listPrice: distributorSkus.listPrice,
        yourCost: distributorSkus.yourCost,
        isAvailable: distributorSkus.isAvailable,
        isPublished: distributorSkus.isPublished,
        status: distributorSkus.status,
        imageUrl: distributorSkus.imageUrl,
        createdAt: distributorSkus.createdAt,
      };
      const [items, [totalRow]] = await Promise.all([
        db
          .select(select)
          .from(distributorSkus)
          .leftJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
          .innerJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
          .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
          .where(where)
          .orderBy(desc(distributorSkus.createdAt), distributorSkus.id)
          .limit(args.limit)
          .offset(args.offset),
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(distributorSkus)
          .leftJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
          .innerJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
          .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
          .where(where),
      ]);
      return { items, total: Number(totalRow?.count ?? 0) };
    }),

  /** Direct administrator editor for supplier products. Master mapping is optional. */
  adminSaveProduct: distributorProcedure
    .input(
      z.object({
        skuId: z.number().int().positive().optional(),
        distributorId: z.number().int().positive(),
        styleId: z.number().int().positive(),
        distributorSku: z.string().trim().min(1).max(128),
        supplierCabinetName: z.string().trim().max(255).optional(),
        masterCode: z.string().trim().max(64).optional(),
        listPrice: z.number().min(0).nullable().optional(),
        yourCost: z.number().min(0).nullable().optional(),
        isAvailable: z.boolean().default(true),
        mode: z.enum(["draft", "publish"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.isAdmin) throw new TRPCError({ code: "FORBIDDEN", message: "Only administrators can create or edit supplier products." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [style] = await db
        .select({ id: doorStyles.id })
        .from(doorStyles)
        .where(and(eq(doorStyles.id, input.styleId), eq(doorStyles.distributorId, input.distributorId)))
        .limit(1);
      if (!style) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a door style that belongs to the selected supplier line." });
      if (input.mode === "publish" && !hasVendorPrice(
        input.listPrice == null ? null : String(input.listPrice),
        input.yourCost == null ? null : String(input.yourCost),
      )) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Add a List Price or Your Cost before publishing." });
      }

      let resolvedCabinetId: number | null = null;
      let resolvedMasterCode: string | null = null;
      const requestedMasterCode = input.masterCode?.trim().toUpperCase();
      if (requestedMasterCode) {
        const [cabinet] = await db
          .select({ id: cabinets.id, masterCode: cabinets.masterCode })
          .from(cabinets)
          .where(eq(cabinets.masterCode, requestedMasterCode))
          .limit(1);
        if (!cabinet) {
          throw new TRPCError({ code: "NOT_FOUND", message: "That master product code does not exist. Leave it blank to save a standalone supplier product, or create the master cabinet first." });
        }
        resolvedCabinetId = cabinet.id;
        resolvedMasterCode = cabinet.masterCode;
      } else {
        const cabinetRows = await db
          .select({
            id: cabinets.id,
            masterCode: cabinets.masterCode,
            sku: cabinets.sku,
            vendorSku: cabinets.vendorSku,
            altSku1: cabinets.altSku1,
            altSku2: cabinets.altSku2,
            altSku3: cabinets.altSku3,
          })
          .from(cabinets);
        const match = matchVendorCabinetBySku(input.distributorSku, cabinetRows);
        if (match.kind === "matched") {
          resolvedCabinetId = match.cabinetId;
          resolvedMasterCode = match.masterCode;
        }
      }

      const matchingRows = await db
        .select({ id: distributorSkus.id, cabinetId: distributorSkus.cabinetId, distributorSku: distributorSkus.distributorSku })
        .from(distributorSkus)
        .where(and(eq(distributorSkus.distributorId, input.distributorId), eq(distributorSkus.styleId, input.styleId)));
      const normalizedSku = normalizeCode(input.distributorSku);
      const duplicate = matchingRows.find((row) => row.id !== input.skuId && (
        (resolvedCabinetId != null && row.cabinetId === resolvedCabinetId)
        || normalizeCode(row.distributorSku) === normalizedSku
      ));
      if (duplicate) {
        throw new TRPCError({ code: "CONFLICT", message: "A supplier product with this SKU or master connection already exists for the selected supplier line and door style." });
      }

      const status: "approved" | "pending" = input.mode === "publish" ? "approved" : "pending";
      const sharedValues = {
        distributorId: input.distributorId,
        styleId: input.styleId,
        distributorSku: input.distributorSku,
        supplierCabinetName: input.supplierCabinetName || null,
        listPrice: input.listPrice == null ? null : String(input.listPrice),
        yourCost: input.yourCost == null ? null : String(input.yourCost),
        isAvailable: input.isAvailable,
        status,
        isPublished: input.mode === "publish",
      };
      if (input.skuId) {
        const [existing] = await db
          .select({ id: distributorSkus.id, cabinetId: distributorSkus.cabinetId })
          .from(distributorSkus)
          .where(eq(distributorSkus.id, input.skuId))
          .limit(1);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });
        const cabinetId = resolvedCabinetId ?? existing.cabinetId;
        await db.update(distributorSkus).set({ ...sharedValues, cabinetId }).where(eq(distributorSkus.id, input.skuId));
        return { skuId: input.skuId, status, isPublished: input.mode === "publish", cabinetId };
      }

      const [result] = await db.insert(distributorSkus).values({
        ...sharedValues,
        cabinetId: resolvedCabinetId,
        platformSku: resolvedMasterCode
          ? `${resolvedMasterCode}-${input.distributorSku}-${input.distributorId}`.slice(0, 128)
          : buildUnmatchedPlatformSku(input.distributorId, input.styleId, input.distributorSku),
      });
      return { skuId: (result as { insertId: number }).insertId, status, isPublished: input.mode === "publish", cabinetId: resolvedCabinetId };
    }),

  // ─── Price Update (instant, no approval) ─────────────────────────────────────

  /** Vendor updates pricing on their own SKUs. Instant — no admin approval needed. */
  updatePrice: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        skuId: z.number(),
        listPrice: z.string().max(16).optional(),
        wholesalePrice: z.string().max(16).optional(),
        contractorPrice: z.string().max(16).optional(),
        homeownerPrice: z.string().max(16).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      // Ownership guard
      const owned = await db
        .select({ id: distributorSkus.id })
        .from(distributorSkus)
        .where(and(eq(distributorSkus.id, input.skuId), eq(distributorSkus.distributorId, lineId)))
        .limit(1);
      if (!owned[0]) throw new TRPCError({ code: "FORBIDDEN", message: "That product is not in your line." });

      const updates: Record<string, string | null> = {};
      if (input.listPrice !== undefined) updates.listPrice = input.listPrice || null;
      if (input.wholesalePrice !== undefined) updates.wholesalePrice = input.wholesalePrice || null;
      if (input.contractorPrice !== undefined) updates.contractorPrice = input.contractorPrice || null;
      if (input.homeownerPrice !== undefined) updates.homeownerPrice = input.homeownerPrice || null;

      if (Object.keys(updates).length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No price fields provided." });
      }

      await db
        .update(distributorSkus)
        .set(updates as any)
        .where(eq(distributorSkus.id, input.skuId));
      return { skuId: input.skuId, updated: Object.keys(updates) };
    }),

  /** Optional vendor-supplied stock feed for the inventory forecast. */
  updateOnHandInventory: distributorProcedure
    .input(z.object({
      distributorId: z.number().optional(),
      skuId: z.number().positive(),
      onHandQty: z.number().int().min(0).nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
      const [owned] = await db.select({ id: distributorSkus.id })
        .from(distributorSkus)
        .where(and(eq(distributorSkus.id, input.skuId), eq(distributorSkus.distributorId, lineId)))
        .limit(1);
      if (!owned) throw new TRPCError({ code: "FORBIDDEN", message: "That product is not in your line." });
      await db.update(distributorSkus).set({ onHandQty: input.onHandQty }).where(eq(distributorSkus.id, input.skuId));
      return { skuId: input.skuId, onHandQty: input.onHandQty };
    }),

  // ─── Image Upload (instant) ───────────────────────────────────────────────────

  /** Vendor uploads a product image (base64 encoded). Stored in S3, URL saved on SKU. */
  updateImage: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        skuId: z.number(),
        imageBase64: z.string().max(10_000_000), // ~7.5MB max
        contentType: z.string().max(64).default("image/jpeg"),
        fileName: z.string().max(256).default("product.jpg"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      // Ownership guard
      const owned = await db
        .select({ id: distributorSkus.id })
        .from(distributorSkus)
        .where(and(eq(distributorSkus.id, input.skuId), eq(distributorSkus.distributorId, lineId)))
        .limit(1);
      if (!owned[0]) throw new TRPCError({ code: "FORBIDDEN", message: "That product is not in your line." });

      // Upload to S3
      const buffer = Buffer.from(input.imageBase64, "base64");
      const ext = input.fileName.split(".").pop() || "jpg";
      const key = `vendor-products-source/${lineId}/${input.skuId}.${ext}`;
      const source = await storagePut(key, buffer, input.contentType);
      let imageUrl = source.url;
      let imageRerenderStatus: "completed" | "failed" = "failed";
      try {
        const normalized = await generateImage({
          model: "MODEL_GPT_IMAGE_2",
          quality: "medium",
          originalImages: [{ b64Json: input.imageBase64, mimeType: input.contentType }],
          prompt: "Create clean professional product catalog art from this vendor cabinet photo. Preserve the exact cabinet design, proportions, door count, finish color, hardware, and camera angle. Remove people, rooms, labels, price sheets, watermarks, clutter, and background distractions. Use a neutral light studio background and realistic even lighting. Do not invent or add any cabinets or accessories.",
        });
        if (normalized.url) { imageUrl = normalized.url; imageRerenderStatus = "completed"; }
      } catch (error) {
        console.warn(`[DistributorPortal] Image normalization failed for SKU ${input.skuId}:`, error instanceof Error ? error.message : error);
      }
      await db.update(distributorSkus).set({ imageUrl, sourceImageUrl: source.url, imageRerenderStatus, imageRerenderedAt: imageRerenderStatus === "completed" ? new Date() : null }).where(eq(distributorSkus.id, input.skuId));
      return { skuId: input.skuId, imageUrl, sourceImageUrl: source.url, imageRerenderStatus };
    }),

  /** Records the source information needed before a supplier-only cabinet item can be published. */
  completeUnmatchedProductDetails: distributorProcedure
    .input(z.object({
      distributorId: z.number().optional(),
      skuId: z.number().int().positive(),
      supplierDescription: z.string().trim().min(1).max(10_000),
      pkgLength: z.number().finite().positive().max(10000),
      pkgWidth: z.number().finite().positive().max(10000),
      pkgHeight: z.number().finite().positive().max(10000),
      pkgWeight: z.number().finite().positive().max(100000),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
      const [owned] = await db.select({ id: distributorSkus.id, cabinetId: distributorSkus.cabinetId })
        .from(distributorSkus)
        .where(and(eq(distributorSkus.id, input.skuId), eq(distributorSkus.distributorId, lineId)))
        .limit(1);
      if (!owned) throw new TRPCError({ code: "FORBIDDEN", message: "That product is not in your line." });
      if (owned.cabinetId != null) throw new TRPCError({ code: "BAD_REQUEST", message: "This mapped cabinet already uses its verified master-catalog specifications." });
      await db.update(distributorSkus).set({
        supplierDescription: input.supplierDescription,
        pkgLength: String(input.pkgLength),
        pkgWidth: String(input.pkgWidth),
        pkgHeight: String(input.pkgHeight),
        pkgWeight: String(input.pkgWeight),
      }).where(eq(distributorSkus.id, input.skuId));
      return { skuId: input.skuId, complete: true };
    }),

  // ─── Other vendor products (WooCommerce/Magento-style import) ───────────────

  /**
   * Lists a supplier's non-cabinet products. They stay separate from
   * distributor_skus so their records never acquire made-up cabinet geometry or
   * a door style simply to make an import fit the cabinet catalog.
   */
  vendorProducts: distributorProcedure
    .input(z.object({
      distributorId: z.number().optional(),
      search: z.string().trim().max(120).optional(),
      category: z.string().trim().max(128).optional(),
      status: z.enum(["all", "pending", "approved", "rejected"]).default("all"),
      limit: z.number().int().min(1).max(500).default(200),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const args = input ?? { status: "all" as const, limit: 200 };
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, args.distributorId);
      const conditions = [eq(vendorProducts.distributorId, lineId)];
      if (args.category) conditions.push(eq(vendorProducts.category, args.category));
      if (args.status !== "all") conditions.push(eq(vendorProducts.status, args.status));
      if (args.search) {
        const term = `%${args.search}%`;
        conditions.push(sql`(${vendorProducts.vendorSku} LIKE ${term} OR ${vendorProducts.name} LIKE ${term} OR ${vendorProducts.description} LIKE ${term} OR ${vendorProducts.category} LIKE ${term})`);
      }
      const [items, categoryRows] = await Promise.all([
        db.select().from(vendorProducts).where(and(...conditions)).orderBy(desc(vendorProducts.updatedAt), vendorProducts.id).limit(args.limit),
        db.selectDistinct({ category: vendorProducts.category }).from(vendorProducts).where(eq(vendorProducts.distributorId, lineId)).orderBy(vendorProducts.category),
      ]);
      return { items, categories: categoryRows.map((row) => row.category).filter((value): value is string => Boolean(value?.trim())) };
    }),

  /** Save one non-cabinet product as a draft or publish it after its source data is complete. */
  saveVendorProduct: distributorProcedure
    .input(z.object({
      distributorId: z.number().optional(),
      id: z.number().int().positive().optional(),
      vendorSku: z.string().trim().min(1).max(128),
      name: z.string().trim().min(1).max(255),
      description: z.string().trim().max(10_000).nullable().optional(),
      category: z.string().trim().max(128).nullable().optional(),
      listPrice: z.number().finite().min(0).max(10_000_000).nullable().optional(),
      yourCost: z.number().finite().min(0).max(10_000_000).nullable().optional(),
      pkgLength: z.number().finite().positive().max(10000).nullable().optional(),
      pkgWidth: z.number().finite().positive().max(10000).nullable().optional(),
      pkgHeight: z.number().finite().positive().max(10000).nullable().optional(),
      pkgWeight: z.number().finite().positive().max(100000).nullable().optional(),
      isAvailable: z.boolean().default(true),
      mode: z.enum(["draft", "publish"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
      const packageValues = [input.pkgLength, input.pkgWidth, input.pkgHeight, input.pkgWeight];
      if (input.mode === "publish") {
        if (input.listPrice == null && input.yourCost == null) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Add a List Price or Your Cost before publishing." });
        }
        if (!input.description?.trim() || packageValues.some((value) => value == null || value <= 0)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Add a source description and all package dimensions and weight before publishing." });
        }
      }
      const values = {
        distributorId: lineId,
        vendorSku: input.vendorSku,
        name: input.name,
        description: input.description?.trim() || null,
        category: input.category?.trim() || null,
        listPrice: input.listPrice == null ? null : String(input.listPrice),
        yourCost: input.yourCost == null ? null : String(input.yourCost),
        pkgLength: input.pkgLength == null ? null : String(input.pkgLength),
        pkgWidth: input.pkgWidth == null ? null : String(input.pkgWidth),
        pkgHeight: input.pkgHeight == null ? null : String(input.pkgHeight),
        pkgWeight: input.pkgWeight == null ? null : String(input.pkgWeight),
        isAvailable: input.isAvailable,
        status: input.mode === "publish" ? "approved" as const : "pending" as const,
        isPublished: input.mode === "publish",
      };
      if (input.id) {
        const [owned] = await db.select({ id: vendorProducts.id }).from(vendorProducts)
          .where(and(eq(vendorProducts.id, input.id), eq(vendorProducts.distributorId, lineId))).limit(1);
        if (!owned) throw new TRPCError({ code: "FORBIDDEN", message: "That product is not in your line." });
        await db.update(vendorProducts).set(values).where(eq(vendorProducts.id, input.id));
        return { id: input.id, status: values.status, isPublished: values.isPublished };
      }
      try {
        const [result] = await db.insert(vendorProducts).values(values);
        return { id: (result as { insertId: number }).insertId, status: values.status, isPublished: values.isPublished };
      } catch (error) {
        if (String(error).toLowerCase().includes("duplicate")) {
          throw new TRPCError({ code: "CONFLICT", message: "A product with this SKU already exists in your line. Edit the existing product instead." });
        }
        throw error;
      }
    }),

  /** Bulk import after client-side header mapping. Imports only create/update records—nothing is deleted. */
  importVendorProducts: distributorProcedure
    .input(z.object({
      distributorId: z.number().optional(),
      rows: z.array(z.object({
        vendorSku: z.string().trim().min(1).max(128),
        name: z.string().trim().min(1).max(255),
        description: z.string().trim().max(10_000).optional(),
        category: z.string().trim().max(128).optional(),
        listPrice: z.number().finite().min(0).max(10_000_000).optional(),
        yourCost: z.number().finite().min(0).max(10_000_000).optional(),
        pkgLength: z.number().finite().positive().max(10000).optional(),
        pkgWidth: z.number().finite().positive().max(10000).optional(),
        pkgHeight: z.number().finite().positive().max(10000).optional(),
        pkgWeight: z.number().finite().positive().max(100000).optional(),
        isAvailable: z.boolean().optional(),
      })).min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
      const existing = await db.select({ id: vendorProducts.id, vendorSku: vendorProducts.vendorSku })
        .from(vendorProducts).where(eq(vendorProducts.distributorId, lineId));
      const bySku = new Map(existing.map((row) => [normalizeCode(row.vendorSku), row]));
      let created = 0;
      let updated = 0;
      for (const row of input.rows) {
        const saved = bySku.get(normalizeCode(row.vendorSku));
        const values = {
          distributorId: lineId,
          vendorSku: row.vendorSku,
          name: row.name,
          description: row.description || null,
          category: row.category || null,
          listPrice: row.listPrice == null ? null : String(row.listPrice),
          yourCost: row.yourCost == null ? null : String(row.yourCost),
          pkgLength: row.pkgLength == null ? null : String(row.pkgLength),
          pkgWidth: row.pkgWidth == null ? null : String(row.pkgWidth),
          pkgHeight: row.pkgHeight == null ? null : String(row.pkgHeight),
          pkgWeight: row.pkgWeight == null ? null : String(row.pkgWeight),
          isAvailable: row.isAvailable ?? true,
        };
        if (saved) {
          await db.update(vendorProducts).set(values).where(eq(vendorProducts.id, saved.id));
          updated += 1;
        } else {
          await db.insert(vendorProducts).values({ ...values, status: "pending", isPublished: false });
          created += 1;
        }
      }
      return { total: input.rows.length, created, updated, pendingReview: created, deleted: 0 };
    }),

  /** Upload an exact supplier-provided product photo; missing images use a clearly generic placeholder. */
  updateVendorProductImage: distributorProcedure
    .input(z.object({
      distributorId: z.number().optional(),
      id: z.number().int().positive(),
      imageBase64: z.string().max(10_000_000),
      contentType: z.string().max(64).default("image/jpeg"),
      fileName: z.string().max(256).default("product.jpg"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
      const [owned] = await db.select({ id: vendorProducts.id }).from(vendorProducts)
        .where(and(eq(vendorProducts.id, input.id), eq(vendorProducts.distributorId, lineId))).limit(1);
      if (!owned) throw new TRPCError({ code: "FORBIDDEN", message: "That product is not in your line." });
      const extension = input.fileName.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "jpg";
      const { url } = await storagePut(`vendor-products/${lineId}/other-${input.id}.${extension}`, Buffer.from(input.imageBase64, "base64"), input.contentType);
      await db.update(vendorProducts).set({ imageUrl: url }).where(eq(vendorProducts.id, input.id));
      return { id: input.id, imageUrl: url };
    }),

  // ─── New Product Submission (pending approval) ────────────────────────────────

  /**
   * Vendor catalog spreadsheet intake. A row needs only the supplier's
   * nomenclature/SKU, one verified source price (list or cost), and the door
   * name carried by this line. Universal nomenclature is matched to the master
   * catalog automatically. Existing same-style SKUs receive the new source
   * price; the small set of unmatched products is retained as pending records
   * for specification completion, never discarded or published by the import.
   */
  importCatalogSpreadsheet: distributorProcedure
    .input(z.object({
      distributorId: z.number().optional(),
      rows: z.array(z.object({
        nomenclature: z.string().trim().min(1).max(128),
        doorName: z.string().trim().min(1).max(128),
        listPrice: z.number().finite().positive().max(10_000_000).optional(),
        cost: z.number().finite().positive().max(10_000_000).optional(),
      }).refine((row) => row.listPrice != null || row.cost != null, {
        message: "Each row needs a List Price or Cost.",
      })).min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
      const [styles, cabinetRows, existingRows] = await Promise.all([
        db.select({ id: doorStyles.id, ourName: doorStyles.ourName, aliasName: doorStyles.aliasName, styleCode: doorStyles.styleCode })
          .from(doorStyles).where(and(eq(doorStyles.distributorId, lineId), eq(doorStyles.isActive, true))),
        db.select({ id: cabinets.id, masterCode: cabinets.masterCode, sku: cabinets.sku, vendorSku: cabinets.vendorSku, altSku1: cabinets.altSku1, altSku2: cabinets.altSku2, altSku3: cabinets.altSku3 }).from(cabinets),
        db.select({ id: distributorSkus.id, distributorSku: distributorSkus.distributorSku, styleId: distributorSkus.styleId, cabinetId: distributorSkus.cabinetId })
          .from(distributorSkus).where(eq(distributorSkus.distributorId, lineId)),
      ]);
      const normalizeDoorName = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
      const sameSkuKey = (styleId: number, sku: string) => `${styleId}:${normalizeCode(sku)}`;
      const existingByStyleSku = new Map(existingRows.map((row) => [sameSkuKey(row.styleId, row.distributorSku), row]));
      const errors: string[] = [];
      let added = 0;
      let updated = 0;
      for (let index = 0; index < input.rows.length; index += 1) {
        const row = input.rows[index];
        const rowLabel = `Row ${index + 2} (${row.nomenclature})`;
        const requestedDoor = normalizeDoorName(row.doorName);
        const matchedStyles = styles.filter((style) => [style.ourName, style.aliasName, style.styleCode]
          .some((candidate) => candidate && normalizeDoorName(candidate) === requestedDoor));
        if (matchedStyles.length !== 1) {
          errors.push(`${rowLabel}: ${matchedStyles.length === 0 ? `door name "${row.doorName}" is not a style on this line` : `door name "${row.doorName}" matches more than one style`}.`);
          continue;
        }
        const styleId = matchedStyles[0].id;
        const existing = existingByStyleSku.get(sameSkuKey(styleId, row.nomenclature));
        const sourcePricing = {
          listPrice: row.listPrice == null ? undefined : String(row.listPrice),
          yourCost: row.cost == null ? undefined : String(row.cost),
        };
        if (existing) {
          await db.update(distributorSkus).set(sourcePricing).where(eq(distributorSkus.id, existing.id));
          updated += 1;
          continue;
        }
        const match = matchVendorCabinetBySku(row.nomenclature, cabinetRows);
        if (match.kind === "ambiguous") {
          errors.push(`${rowLabel}: nomenclature matches more than one master cabinet and needs administrator review.`);
          continue;
        }
        const platformSku = match.kind === "matched"
          ? `${match.masterCode}-${row.nomenclature}-${lineId}`.slice(0, 128)
          : buildUnmatchedPlatformSku(lineId, styleId, row.nomenclature);
        const result = await db.insert(distributorSkus).values({
          cabinetId: match.kind === "matched" ? match.cabinetId : null,
          distributorId: lineId,
          styleId,
          platformSku,
          distributorSku: row.nomenclature,
          listPrice: sourcePricing.listPrice ?? null,
          yourCost: sourcePricing.yourCost ?? null,
          status: "pending",
          isPublished: false,
          isAvailable: true,
        });
        existingByStyleSku.set(sameSkuKey(styleId, row.nomenclature), {
          id: (result as unknown as [{ insertId: number }])[0].insertId,
          distributorSku: row.nomenclature,
          styleId,
          cabinetId: match.kind === "matched" ? match.cabinetId : null,
        });
        added += 1;
      }
      return { added, updated, total: input.rows.length, needsReview: added, errors: errors.slice(0, 100) };
    }),

  /** Vendor submits a new product. Goes to pending status until admin approves. */
  submitNewProduct: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        /** Optional for backwards compatibility; new submissions resolve it from the vendor SKU. */
        cabinetId: z.number().int().positive().optional(),
        styleId: z.number().int().positive(),
        distributorSku: z.string().trim().min(1).max(128),
        listPrice: z.string().max(16).optional(),
        yourCost: z.string().max(16).optional(),
        supplierCabinetName: z.string().max(255).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      // Cabinet ID is an internal platform identity. A vendor does not need to
      // know it, and a supplier SKU may be new to the master catalog. Resolve a
      // unique match when one exists; otherwise keep the link null for admin
      // review instead of blocking the pending submission or guessing.
      let resolvedCabinetId: number | null = input.cabinetId ?? null;
      let resolvedMasterCode: string | null = null;
      if (resolvedCabinetId != null) {
        const cab = await db
          .select({ id: cabinets.id, masterCode: cabinets.masterCode })
          .from(cabinets)
          .where(eq(cabinets.id, resolvedCabinetId))
          .limit(1);
        if (!cab[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Cabinet not found." });
        resolvedMasterCode = cab[0].masterCode;
      } else {
        const cabinetRows = await db
          .select({
            id: cabinets.id,
            masterCode: cabinets.masterCode,
            sku: cabinets.sku,
            vendorSku: cabinets.vendorSku,
            altSku1: cabinets.altSku1,
            altSku2: cabinets.altSku2,
            altSku3: cabinets.altSku3,
          })
          .from(cabinets);
        const match = matchVendorCabinetBySku(input.distributorSku, cabinetRows);
        if (match.kind === "matched") {
          resolvedCabinetId = match.cabinetId;
          resolvedMasterCode = match.masterCode;
        }
      }

      // Verify the style belongs to this line
      const style = await db
        .select({ id: doorStyles.id })
        .from(doorStyles)
        .where(and(eq(doorStyles.id, input.styleId), eq(doorStyles.distributorId, lineId)))
        .limit(1);
      if (!style[0]) throw new TRPCError({ code: "FORBIDDEN", message: "That style does not belong to your line." });

      // A Designer Coverage gap means there is no published and available SKU;
      // it does not prove that no pending or unpublished connection exists. Do
      // not create a duplicate row when an administrator is reviewing a gap.
      const existing = resolvedCabinetId != null
        ? await db
            .select({ id: distributorSkus.id })
            .from(distributorSkus)
            .where(
              and(
                eq(distributorSkus.cabinetId, resolvedCabinetId),
                eq(distributorSkus.distributorId, lineId),
                eq(distributorSkus.styleId, input.styleId),
              ),
            )
            .limit(1)
        : (await db
            .select({ id: distributorSkus.id, distributorSku: distributorSkus.distributorSku })
            .from(distributorSkus)
            .where(
              and(
                eq(distributorSkus.distributorId, lineId),
                eq(distributorSkus.styleId, input.styleId),
              ),
            ))
            .filter((row) => normalizeCode(row.distributorSku) === normalizeCode(input.distributorSku));
      if (existing[0]) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A connection for this cabinet, line, and style already exists. Review that existing connection instead of adding another.",
        });
      }

      if (!hasVendorPrice(input.listPrice, input.yourCost)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a List Price or Your Cost." });
      }

      // Generate a stable platform identity even when no master cabinet exists.
      const platformSku = resolvedMasterCode
        ? `${resolvedMasterCode}-${input.distributorSku}-${lineId}`
        : buildUnmatchedPlatformSku(lineId, input.styleId, input.distributorSku);

      const result = await db.insert(distributorSkus).values({
        cabinetId: resolvedCabinetId,
        distributorId: lineId,
        styleId: input.styleId,
        platformSku,
        distributorSku: input.distributorSku,
        listPrice: input.listPrice || null,
        yourCost: input.yourCost || null,
        supplierCabinetName: input.supplierCabinetName || null,
        status: "pending",
        isPublished: false,
        isAvailable: true,
      });

      const insertId = (result as unknown as [{ insertId: number }])[0].insertId;
      return { skuId: insertId, status: "pending" as const };
    }),

  // ─── Admin Approve/Reject Product ─────────────────────────────────────────────

  /** Admin publishes, returns to draft, or rejects a supplier product. */
  adminSetProductStatus: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        skuId: z.number(),
        status: z.enum(["approved", "pending", "rejected"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can publish, draft, or reject products." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const sku = await db
        .select({
          id: distributorSkus.id,
          status: distributorSkus.status,
          cabinetId: distributorSkus.cabinetId,
          supplierDescription: distributorSkus.supplierDescription,
          pkgLength: distributorSkus.pkgLength,
          pkgWidth: distributorSkus.pkgWidth,
          pkgHeight: distributorSkus.pkgHeight,
          pkgWeight: distributorSkus.pkgWeight,
          listPrice: distributorSkus.listPrice,
          yourCost: distributorSkus.yourCost,
        })
        .from(distributorSkus)
        .where(eq(distributorSkus.id, input.skuId))
        .limit(1);
      if (!sku[0]) throw new TRPCError({ code: "NOT_FOUND", message: "SKU not found." });
      if (input.status === "approved" && sku[0].cabinetId == null) {
        const packageValues = [sku[0].pkgLength, sku[0].pkgWidth, sku[0].pkgHeight, sku[0].pkgWeight].map(Number);
        if (!sku[0].supplierDescription?.trim() || packageValues.some((value) => !Number.isFinite(value) || value <= 0) || !hasVendorPrice(sku[0].listPrice, sku[0].yourCost)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "The supplier description, package dimensions, package weight, and one source price are required before an unmatched item can go live." });
        }
      }

      await db
        .update(distributorSkus)
        .set({
          status: input.status,
          isPublished: input.status === "approved" ? true : false,
        })
        .where(eq(distributorSkus.id, input.skuId));

      return { skuId: input.skuId, status: input.status };
    }),

  // ─── Design Tool Picks (max 8) ───────────────────────────────────────────────

  /** Get the vendor's current design tool picks. */
  getDesignToolPicks: distributorProcedure
    .input(z.object({ distributorId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input?.distributorId);

      const rows = await db
        .select({ designToolPicks: distributors.designToolPicks })
        .from(distributors)
        .where(eq(distributors.id, lineId))
        .limit(1);

      const picks: number[] = (rows[0]?.designToolPicks as number[]) || [];

      // Fetch details for the picked SKUs
      if (picks.length === 0) return { picks: [], items: [] };

      const items = await db
        .select({
          skuId: distributorSkus.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          category: cabinets.category,
          styleName: doorStyles.ourName,
          imageUrl: distributorSkus.imageUrl,
          contractorPrice: distributorSkus.contractorPrice,
        })
        .from(distributorSkus)
        .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
        .where(and(inArray(distributorSkus.id, picks), eq(distributorSkus.distributorId, lineId)));

      return { picks, items };
    }),

  /** Vendor sets their design tool picks (max 8 SKU IDs). */
  setDesignToolPicks: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        skuIds: z.array(z.number()).max(MAX_DESIGN_TOOL_PICKS),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      if (input.skuIds.length > MAX_DESIGN_TOOL_PICKS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Maximum ${MAX_DESIGN_TOOL_PICKS} design tool picks allowed.`,
        });
      }

      // Verify all SKUs belong to this line
      if (input.skuIds.length > 0) {
        const owned = await db
          .select({ id: distributorSkus.id })
          .from(distributorSkus)
          .where(and(inArray(distributorSkus.id, input.skuIds), eq(distributorSkus.distributorId, lineId)));
        if (owned.length !== input.skuIds.length) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Some SKUs do not belong to your line." });
        }
      }

      await db
        .update(distributors)
        .set({ designToolPicks: input.skuIds.length > 0 ? input.skuIds : null })
        .where(eq(distributors.id, lineId));

      return { picks: input.skuIds };
    }),

  /** Order requests that reference a door style carried by this line. */
  orders: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      // Resolve the door-style ids that belong to this line.
      const styleRows = await db
        .select({ id: doorStyles.id })
        .from(doorStyles)
        .where(eq(doorStyles.distributorId, lineId));
      const styleIds = styleRows.map((s) => s.id);
      if (styleIds.length === 0) return [];

      const rows = await db
        .select({
          id: orderRequests.id,
          requestNumber: orderRequests.requestNumber,
          status: orderRequests.status,
          styleId: orderRequests.styleId,
          styleName: orderRequests.styleName,
          tier: orderRequests.tier,
          itemCount: orderRequests.itemCount,
          totalAmount: orderRequests.totalAmount,
          source: orderRequests.source,
          orderRailStatus: orderRequests.orderRailStatus,
          distributorInvoiceReference: orderRequests.distributorInvoiceReference,
          distributorInvoiceAmount: orderRequests.distributorInvoiceAmount,
          distributorInvoiceNotes: orderRequests.distributorInvoiceNotes,
          createdAt: orderRequests.createdAt,
        })
        .from(orderRequests)
        .where(and(eq(orderRequests.distributorId, lineId), eq(orderRequests.orderRailStatus, "distributor_inventory_check")))
        .orderBy(desc(orderRequests.createdAt))
        .limit(input.limit);
      return rows;
    }),

  /** Distributor confirms inventory and returns the updated invoice to the affiliate. */
  confirmInventoryAndInvoice: distributorProcedure
    .input(z.object({
      distributorId: z.number().optional(),
      orderId: z.number().int().positive(),
      invoiceReference: z.string().trim().min(1).max(128),
      invoiceAmount: z.number().nonnegative(),
      invoiceNotes: z.string().trim().max(4_000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
      const [order] = await db.select().from(orderRequests).where(and(eq(orderRequests.id, input.orderId), eq(orderRequests.distributorId, lineId))).limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "This order is not routed to your supply line." });
      if (order.orderRailStatus !== "distributor_inventory_check") {
        throw new TRPCError({ code: "CONFLICT", message: "This order is not awaiting an inventory check." });
      }
      const now = new Date();
      await db.update(orderRequests).set({
        orderRailStatus: "affiliate_invoice_review",
        distributorInventoryConfirmedAt: now,
        distributorInvoiceReference: input.invoiceReference,
        distributorInvoiceAmount: input.invoiceAmount.toFixed(2),
        distributorInvoiceNotes: input.invoiceNotes || null,
        distributorInvoiceReceivedAt: now,
      }).where(eq(orderRequests.id, order.id));
      return { id: order.id, orderRailStatus: "affiliate_invoice_review" as const };
    }),

  // ─── Door Style Image Update (instant) ────────────────────────────────────────

	/** Vendor updates one of its Door Style merchandising image slots. */
	  updateDoorStyleImage: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        styleId: z.number(),
	        imageType: z.enum(["doorSample", "drawerSample", "roomScene", "thumbnail", "cornerSwatch"]),
        imageBase64: z.string().max(10_000_000),
        contentType: z.string().max(64).default("image/jpeg"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);

      // Verify style belongs to this line
	      const style = await db
	        .select({ id: doorStyles.id, thumbnailImageUrl: doorStyles.thumbnailImageUrl })
	        .from(doorStyles)
        .where(and(eq(doorStyles.id, input.styleId), eq(doorStyles.distributorId, lineId)))
        .limit(1);
      if (!style[0]) throw new TRPCError({ code: "FORBIDDEN", message: "That style does not belong to your line." });

      const buffer = Buffer.from(input.imageBase64, "base64");
      const ext = input.contentType.split("/")[1] || "jpg";
      const key = `vendor-styles/${lineId}/${input.styleId}-${input.imageType}.${ext}`;
      const { url } = await storagePut(key, buffer, input.contentType);

	      const fieldMap = {
	        doorSample: "doorSampleImageUrl",
	        drawerSample: "drawerSampleImageUrl",
	        roomScene: "roomSceneImageUrl",
	        thumbnail: "thumbnailImageUrl",
	        cornerSwatch: "cornerSwatchImageUrl",
	      } as const;

		      const imagePatch: Record<string, string> = { [fieldMap[input.imageType]]: url };
		      if (input.imageType === "doorSample" && !style[0].thumbnailImageUrl) imagePatch.thumbnailImageUrl = url;
		      await db
		        .update(doorStyles)
		        .set(imagePatch as any)
	        .where(eq(doorStyles.id, input.styleId));

	      // A room scene uploaded by the owner of a supply line is first-party
	      // merchandising evidence. Keep the legacy style image in sync and also
	      // create/update the scene-library record used by Featured Styles.
	      if (input.imageType === "roomScene") {
	        const existingScenes = await db
	          .select({ id: doorStyleRoomScenes.id })
	          .from(doorStyleRoomScenes)
	          .where(and(
	            eq(doorStyleRoomScenes.styleId, input.styleId),
	            eq(doorStyleRoomScenes.sourceDistributorId, lineId),
	          ))
	          .orderBy(doorStyleRoomScenes.sortOrder, doorStyleRoomScenes.id)
	          .limit(1);
	        if (existingScenes[0]) {
	          await db.update(doorStyleRoomScenes).set({
	            imageUrl: url,
	            fileKey: key,
	            isActive: true,
	            isVerified: true,
	          }).where(eq(doorStyleRoomScenes.id, existingScenes[0].id));
	        } else {
	          const [{ maxRank }] = await db
	            .select({ maxRank: sql<number>`coalesce(max(${doorStyleRoomScenes.sortOrder}), 0)` })
	            .from(doorStyleRoomScenes)
	            .where(eq(doorStyleRoomScenes.styleId, input.styleId));
	          const [{ sceneCount }] = await db
	            .select({ sceneCount: sql<number>`count(*)` })
	            .from(doorStyleRoomScenes)
	            .where(eq(doorStyleRoomScenes.styleId, input.styleId));
	          if (Number(sceneCount) < 6) {
	            await db.insert(doorStyleRoomScenes).values({
	              styleId: input.styleId,
	              imageUrl: url,
	              fileKey: key,
	              sortOrder: Number(maxRank) + 10,
	              isVerified: true,
	              isActive: true,
	              sourceDistributorId: lineId,
	              sourceNote: "Vendor-provided featured room scene",
	            });
	          }
	        }
	      }

	      return { styleId: input.styleId, imageType: input.imageType, imageUrl: url };
    }),

  // ─── AI Service Requests ─────────────────────────────────────────────────────

  aiServiceHistory: distributorProcedure
    .input(z.object({ distributorId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input?.distributorId);
      const rows = await db
        .select()
        .from(aiServiceRequests)
        .where(eq(aiServiceRequests.distributorId, lineId))
        .orderBy(desc(aiServiceRequests.createdAt))
        .limit(50);
      return rows;
    }),

  aiServiceSubmit: distributorProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        serviceType: z.string().min(1).max(100),
        fileName: z.string().max(255).optional(),
        fileKey: z.string().max(512).optional(),
        fileUrl: z.string().max(1024).optional(),
        fileSizeBytes: z.number().int().min(0).optional(),
        details: z.string().max(5000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
      // Estimate: ~150 SKUs per hour based on file size heuristic
      const estimatedSkus = input.fileSizeBytes
        ? Math.max(10, Math.round(input.fileSizeBytes / 500))
        : 100;
      const estimatedHours = Math.max(0.25, Number((estimatedSkus / 150).toFixed(2)));
      const estimatedCost = Number((estimatedHours * 100).toFixed(2));
      const [result] = await db.insert(aiServiceRequests).values({
        distributorId: lineId,
        userId: ctx.user.id,
        serviceType: input.serviceType,
        fileName: input.fileName || null,
        fileKey: input.fileKey || null,
        fileUrl: input.fileUrl || null,
        fileSizeBytes: input.fileSizeBytes || null,
        details: input.details || null,
        estimatedSkus,
        estimatedHours: String(estimatedHours),
        estimatedCost: String(estimatedCost),
        status: "estimated",
      });
      return {
        id: result.insertId,
        estimatedSkus,
        estimatedHours,
        estimatedCost,
      };
    }),

  aiServiceApprove: distributorProcedure
    .input(z.object({ distributorId: z.number().optional(), requestId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
      await db
        .update(aiServiceRequests)
        .set({ status: "approved", approvedAt: new Date() })
        .where(
          and(
            eq(aiServiceRequests.id, input.requestId),
            eq(aiServiceRequests.distributorId, lineId),
            eq(aiServiceRequests.status, "estimated")
          )
        );
      return { success: true };
    }),

  aiServiceCancel: distributorProcedure
    .input(z.object({ distributorId: z.number().optional(), requestId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const lineId = resolveLineId(ctx.distributorId, ctx.isAdmin, input.distributorId);
      await db
        .update(aiServiceRequests)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(aiServiceRequests.id, input.requestId),
            eq(aiServiceRequests.distributorId, lineId)
          )
        );
      return { success: true };
    }),
});
