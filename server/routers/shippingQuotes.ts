/**
 * Customer and vendor shipping quotes.
 * The encrypted secret is used only for an outbound vendor call and is never returned.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { adminProcedure, publicProcedure, router, supplierProfileProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { distributorIntegrations, distributors, vendorLines } from "../../drizzle/schema";
import { pelicanProducts, pelicanShippingProfiles } from "../../drizzle/pelicanSchema";
import { approvedVendorLinkedDistributorIds, approvedVendorMatchesDistributor } from "../lib/approvedVendorAccess";
import { encryptDistributorSecret } from "../lib/distributorIntegrationCrypto";
import {
  loadShippingQuoteLines,
  publicShippingQuotes,
  quoteLoadedLines,
  type ShippingQuoteRequestItem,
} from "../lib/shippingQuote/assemble";
import {
  PELICAN_SHOPIFY_PRODUCTS_URL,
  QUARTZ_WEIGHT_DATA_ISSUE,
  comparePelicanProfileWeights,
  parseShopifyProductWeights,
  type PelicanWeightProfile,
} from "../../shared/pelicanQuartzWeightAudit";
import {
  assertAuthHeaderName,
  assertPublicHttpsQuoteUrl,
  createShippingQuoteRateLimiter,
  normalizeServiceCodes,
  publicVendorQuoteConfig,
  vendorConfigAccess,
  type ShippingQuoteProviderKind,
} from "../../shared/shippingQuote";

const quoteLimiter = createShippingQuoteRateLimiter();

const quoteItemSchema = z.object({
  kind: z.enum(["pelican", "cabinet", "vendor_product"]),
  qty: z.number().int().min(1).max(999),
  pelicanProductId: z.number().int().positive().optional(),
  vendorProductId: z.number().int().positive().optional(),
  cabinetId: z.number().int().positive().optional(),
  masterCode: z.string().trim().max(64).optional(),
  styleId: z.number().int().positive().optional(),
  distributorId: z.number().int().positive().optional(),
  merchandiseCents: z.number().int().min(0).max(100_000_000).optional(),
});

const vendorTargetSchema = z.object({
  vendorLineId: z.number().int().positive().optional(),
  distributorId: z.number().int().positive().optional(),
});

function callerKey(req: { headers: Record<string, unknown>; ip?: string; socket?: { remoteAddress?: string } }): string {
  const header = req.headers["x-forwarded-for"];
  const raw = Array.isArray(header) ? header[0] : header;
  const first = typeof raw === "string" ? raw.split(",")[0]?.trim() : "";
  return first || req.ip || req.socket?.remoteAddress || "unknown";
}

function requireDb<T>(db: T | null): T {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}

type VendorContext = { isAdmin: boolean; distributorId: number | null; approvedVendorLineId: number | null };

async function resolveVendorLine(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  ctx: VendorContext,
  requested: { vendorLineId?: number; distributorId?: number },
) {
  const supplierLines = await db
    .select({ id: distributors.id, code: distributors.code, isActive: distributors.isActive })
    .from(distributors);
  const approved = await db.select().from(vendorLines).where(eq(vendorLines.isApproved, true));
  let vendor = approved.find((line) => {
    if (ctx.isAdmin && requested.vendorLineId != null) return line.id === requested.vendorLineId;
    if (!ctx.isAdmin && ctx.approvedVendorLineId != null) return line.id === ctx.approvedVendorLineId;
    return false;
  }) ?? null;
  const distributorId = ctx.isAdmin ? requested.distributorId : ctx.distributorId;
  if (!vendor && distributorId != null) {
    const line = supplierLines.find((candidate) => candidate.id === distributorId);
    vendor = line ? approved.find((candidate) => approvedVendorMatchesDistributor(candidate, line)) ?? null : null;
  }
  if (!vendor) {
    throw new TRPCError({
      code: ctx.isAdmin ? "BAD_REQUEST" : "FORBIDDEN",
      message: ctx.isAdmin
        ? "Choose the approved vendor whose shipping quote you want to open."
        : "Your account is not linked to an approved vendor record.",
    });
  }
  const distributorIds = approvedVendorLinkedDistributorIds(vendor, supplierLines);
  const access = vendorConfigAccess(
    { isAdmin: ctx.isAdmin, vendorLineId: ctx.isAdmin ? null : ctx.approvedVendorLineId, distributorId: ctx.isAdmin ? null : ctx.distributorId },
    { vendorLineId: vendor.id, distributorIds },
  );
  if (!access.ok) throw new TRPCError({ code: "FORBIDDEN", message: access.reason });
  const integrationDistributorId = distributorIds[0] ?? null;
  const integration = integrationDistributorId == null ? null : (await db.select({
    id: distributorIntegrations.id,
    baseUrl: distributorIntegrations.baseUrl,
    isEnabled: distributorIntegrations.isEnabled,
    adminEnabled: distributorIntegrations.adminEnabled,
  }).from(distributorIntegrations).where(and(
    eq(distributorIntegrations.distributorId, integrationDistributorId),
    eq(distributorIntegrations.integrationType, "shipping"),
    eq(distributorIntegrations.provider, "generic-shipping"),
  )).limit(1))[0] ?? null;
  return { vendor, distributorIds, integration };
}

function configView(resolved: Awaited<ReturnType<typeof resolveVendorLine>>) {
  const { vendor, integration } = resolved;
  return {
    ...publicVendorQuoteConfig({
      vendorLineId: vendor.id,
      serviceCodes: Array.isArray(vendor.shippingServiceCodes) ? vendor.shippingServiceCodes.filter((code): code is string => typeof code === "string") : [],
      freightClass: vendor.shippingFreightClass,
      shipFromZip: vendor.shipFromZip,
      provider: vendor.shippingQuoteProvider,
      quoteUrl: vendor.shippingQuoteUrl,
      authHeaderName: vendor.shippingQuoteAuthHeaderName,
      hasSecret: Boolean(vendor.shippingQuoteSecretEncrypted),
      adminEnabled: vendor.shippingQuoteAdminEnabled,
      vendorEnabled: vendor.shippingQuoteVendorEnabled,
      secret: vendor.shippingQuoteSecretEncrypted,
    }),
    customApiUrl: integration?.baseUrl ?? null,
    customApiAdminEnabled: Boolean(integration?.isEnabled && integration.adminEnabled),
  };
}

export const shippingQuotesRouter = router({
  getShippingQuote: publicProcedure
    .input(z.object({
      destinationZip: z.string().regex(/^\d{5}$/, "Enter a 5-digit ZIP code."),
      items: z.array(quoteItemSchema).min(1).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!quoteLimiter.allow(`public:${callerKey(ctx.req)}`, Date.now())) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many shipping quotes. Wait a minute and try again." });
      }
      const db = requireDb(await getDb());
      let loaded;
      try {
        loaded = await loadShippingQuoteLines(db, input.items as ShippingQuoteRequestItem[]);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "That product could not be quoted." });
      }
      const quotes = await quoteLoadedLines({ db, destinationZip: input.destinationZip, loaded });
      return { destinationZip: input.destinationZip, vendors: publicShippingQuotes(quotes) };
    }),

  vendorConfig: supplierProfileProcedure
    .input(vendorTargetSchema.optional())
    .query(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      return configView(await resolveVendorLine(db, ctx, input ?? {}));
    }),

  saveVendorConfig: supplierProfileProcedure
    .input(vendorTargetSchema.extend({
      serviceCodes: z.array(z.string().max(40)).max(20),
      freightClass: z.string().trim().max(8).nullable(),
      shipFromZip: z.string().regex(/^\d{5}$/).nullable(),
      provider: z.enum(["none", "http", "pelican", "carrier_ltl"]),
      quoteUrl: z.string().trim().max(512).nullable(),
      authHeaderName: z.string().trim().max(64).nullable(),
      secret: z.string().max(2000).optional(),
      vendorEnabled: z.boolean(),
      adminEnabled: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = requireDb(await getDb());
      const resolved = await resolveVendorLine(db, ctx, input);
      let quoteUrl: string | null = input.quoteUrl?.trim() || null;
      let authHeaderName: string | null = input.authHeaderName?.trim() || null;
      try {
        if (quoteUrl) quoteUrl = assertPublicHttpsQuoteUrl(quoteUrl).toString();
        if (authHeaderName) authHeaderName = assertAuthHeaderName(authHeaderName);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Quote connection is invalid." });
      }
      let secretEncrypted = resolved.vendor.shippingQuoteSecretEncrypted;
      if (input.secret?.trim()) {
        try {
          secretEncrypted = encryptDistributorSecret(input.secret);
        } catch (error) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: error instanceof Error ? error.message : "Server encryption key is unavailable. The quote secret was not saved.",
          });
        }
      }
      const provider = input.provider as ShippingQuoteProviderKind;
      if (input.vendorEnabled && provider === "http" && (!quoteUrl || !authHeaderName || !secretEncrypted)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A live HTTPS quote needs a public URL, an auth header name, and a saved secret." });
      }
      await db.update(vendorLines).set({
        shippingServiceCodes: normalizeServiceCodes(input.serviceCodes),
        shippingFreightClass: input.freightClass?.trim() || null,
        shipFromZip: input.shipFromZip,
        shippingQuoteProvider: provider,
        shippingQuoteUrl: quoteUrl,
        shippingQuoteAuthHeaderName: authHeaderName,
        shippingQuoteSecretEncrypted: secretEncrypted,
        shippingQuoteVendorEnabled: input.vendorEnabled,
        ...(ctx.isAdmin && input.adminEnabled !== undefined ? { shippingQuoteAdminEnabled: input.adminEnabled } : {}),
      }).where(eq(vendorLines.id, resolved.vendor.id));
      const fresh = await resolveVendorLine(db, ctx, { vendorLineId: resolved.vendor.id });
      return configView(fresh);
    }),

  testQuote: supplierProfileProcedure
    .input(vendorTargetSchema.extend({
      destinationZip: z.string().regex(/^\d{5}$/, "Enter a 5-digit ZIP code."),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!quoteLimiter.allow(`test:${ctx.user.id}`, Date.now())) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many test quotes. Wait a minute and try again." });
      }
      const db = requireDb(await getDb());
      const resolved = await resolveVendorLine(db, ctx, input);
      const pelican = resolved.vendor.sourceKey?.trim().toLowerCase() === "pelican";
      const distributorId = resolved.distributorIds[0] ?? null;
      const vendorScope = pelican ? "pelican" : distributorId != null ? `dist:${distributorId}` : `vendor:${resolved.vendor.id}`;
      const quotes = await quoteLoadedLines({
        db,
        destinationZip: input.destinationZip,
        loaded: [{
          index: 0,
          kind: pelican ? "pelican" : "cabinet",
          vendorScope,
          vendorName: resolved.vendor.name,
          distributorId: pelican ? null : distributorId,
          merchandiseCents: 0,
          line: {
            sku: "TEST-QUOTE",
            qty: 1,
            weightLbs: 10,
            lengthIn: 12,
            widthIn: 12,
            heightIn: 12,
            freightClass: resolved.vendor.shippingFreightClass,
            evidence: "missing",
            shipFromZip: resolved.vendor.shipFromZip,
            transportMode: null,
            comparisonRuleId: null,
          },
        }],
      });
      return { destinationZip: input.destinationZip, vendors: publicShippingQuotes(quotes) };
    }),

  setIntegrationAdminEnabled: adminProcedure
    .input(z.object({
      distributorId: z.number().int().positive(),
      enabled: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const db = requireDb(await getDb());
      const [row] = await db.select({ id: distributorIntegrations.id }).from(distributorIntegrations).where(and(
        eq(distributorIntegrations.distributorId, input.distributorId),
        eq(distributorIntegrations.integrationType, "shipping"),
        eq(distributorIntegrations.provider, "generic-shipping"),
      )).limit(1);
      if (!row) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Save a Custom Shipping API connection before an administrator enables it for customer quotes." });
      }
      await db.update(distributorIntegrations).set({ adminEnabled: input.enabled }).where(eq(distributorIntegrations.id, row.id));
      return { ok: true, adminEnabled: input.enabled } as const;
    }),

  /** Read-only. Compares saved Pelican profile weights with the public Shopify catalog. */
  comparePelicanCatalogWeights: adminProcedure.mutation(async () => {
    const db = requireDb(await getDb());
    const profiles = await db.select({
      pelicanCode: pelicanProducts.pelicanCode,
      name: pelicanProducts.name,
      category: pelicanProducts.category,
      weightLbs: pelicanShippingProfiles.packageWeightLbs,
      evidenceType: pelicanShippingProfiles.evidenceType,
    }).from(pelicanProducts).leftJoin(
      pelicanShippingProfiles,
      eq(pelicanShippingProfiles.pelicanProductId, pelicanProducts.id),
    );
    const saved: PelicanWeightProfile[] = profiles.map((row) => ({
      pelicanCode: row.pelicanCode,
      name: row.name,
      category: row.category,
      weightLbs: row.weightLbs == null ? null : Number(row.weightLbs),
      evidenceType: row.evidenceType,
    }));
    const catalog = [];
    let pagesRead = 0;
    for (let page = 1; page <= 4; page += 1) {
      const response = await fetch(`${PELICAN_SHOPIFY_PRODUCTS_URL}?limit=250&page=${page}`, {
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        throw new TRPCError({ code: "BAD_GATEWAY", message: `Pelican catalog returned HTTP ${response.status}. No weights were changed.` });
      }
      const payload: unknown = await response.json();
      catalog.push(...parseShopifyProductWeights(payload));
      pagesRead += 1;
      const products = (payload as { products?: unknown }).products;
      if (!Array.isArray(products) || products.length < 250) break;
    }
    return {
      readOnly: true,
      pagesRead,
      catalogSkus: catalog.length,
      quartzNote: QUARTZ_WEIGHT_DATA_ISSUE,
      mismatches: comparePelicanProfileWeights(saved, catalog).slice(0, 100),
    };
  }),
});
