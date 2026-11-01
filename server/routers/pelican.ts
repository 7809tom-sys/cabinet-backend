import { randomUUID } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gt, isNull, like, lte, not, notInArray, or, sql } from "drizzle-orm";
import sharp from "sharp";
import { UNAUTHED_ERR_MSG } from "@shared/const";
import { hiddenNumericIds, loadAffiliateCatalogGate } from "../lib/affiliateCatalogGate";
import { router, publicProcedure, adminProcedure, supplierProfileProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { CATALOG_TAGS, servePublicCatalog } from "../lib/publicCatalogCache";
import { storagePut } from "../storage";
import { pelicanProducts, pelicanShippingProfiles } from "../../drizzle/pelicanSchema";
import { distributors, pelicanCategoryMarkups, vendorLines } from "../../drizzle/schema";
import { normalizeCode } from "../../shared/cabinetCodeMatch";
import { positiveAuthorizedSurfaceBase } from "../../shared/surfacePricing";
import { auditPelicanDesignerReadiness, isPelicanDesignerSelectable, pelicanDesignerRenderFlags } from "../lib/pelicanDesignerReadiness";
import { comparisonProfileForPelicanProduct } from "../../shared/pelicanComparablePackaging";
import { loadAffiliateStorefrontPricing } from "../lib/affiliateStorefrontPricing";
import { resolveAffiliateRetail, resolveMarkupBps } from "../../shared/affiliateBranding";
import { isAttachProductCategory, resolveAffiliateTierCost } from "../../shared/affiliatePricingTier";
import { dollarsToCents } from "../lib/affiliateTierPricing";

const PELICAN_PRODUCT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const PELICAN_PRODUCT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
/** Base64 is 4/3 of the decoded size, plus a short data-URL prefix. */
const PELICAN_PRODUCT_IMAGE_MAX_BASE64_CHARS = 14_000_000;
const PELICAN_PRODUCT_IMAGE_MAX_EDGE = 4096;
/** Sharp's near-white distance. 12 sits in the requested 10–15 range. */
const PELICAN_WHITE_TRIM_THRESHOLD = 12;
/** Drop the trim when it would remove more than this fraction of either side. */
const PELICAN_WHITE_TRIM_MAX_FRACTION = 0.4;
const SHARP_FORMAT_FOR_CONTENT_TYPE = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

/**
 * Catalog rows store either an absolute http(s) address or a first-party
 * `/manus-storage/...` path. The Designer already renders the latter.
 */
function isStoredOrHttpImageReference(value: string): boolean {
  if (value.startsWith("/manus-storage/")) {
    const rest = value.slice("/manus-storage/".length);
    return rest.length > 0 && !rest.includes("..") && !/[\s?#\\]/.test(rest);
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * `null` and a blank string clear the stored photo. Anything else must be an
 * http(s) URL or a `/manus-storage/...` path. Callers omit the field entirely
 * when the stored value should stay unchanged.
 */
function storedImageReferenceOrThrow(value: string | null, label: string): string | null {
  if (value == null || value.trim() === "") return null;
  const trimmed = value.trim();
  if (!isStoredOrHttpImageReference(trimmed)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${label} must be an http(s) URL or a stored /manus-storage/ path.`,
    });
  }
  return trimmed;
}

function materialImageUrlOrThrow(value: string | null): string | null {
  return storedImageReferenceOrThrow(value, "Material image");
}

function decodePelicanProductImage(dataBase64: string): Buffer {
  const comma = dataBase64.indexOf(",");
  const raw = dataBase64.startsWith("data:") && comma !== -1 ? dataBase64.slice(comma + 1) : dataBase64;
  const normalized = raw.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!normalized || normalized.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Image data must be base64." });
  }
  const bytes = Buffer.from(normalized, "base64");
  if (bytes.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Image data is empty." });
  }
  if (bytes.length > PELICAN_PRODUCT_IMAGE_MAX_BYTES) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Image must be 10 MB or smaller." });
  }
  return bytes;
}

/**
 * `target` wins when present. Otherwise the original boolean flags apply.
 * `roomScene` writes only the room-scene column.
 */
function pelicanProductImageWrites(input: {
  target?: "catalog" | "designer" | "both" | "roomScene";
  useAsDesignerPhoto: boolean;
  alsoSetCatalogImage: boolean;
}): { designer: boolean; catalog: boolean; roomScene: boolean } {
  if (input.target === "catalog") return { designer: false, catalog: true, roomScene: false };
  if (input.target === "designer") return { designer: true, catalog: false, roomScene: false };
  if (input.target === "both") return { designer: true, catalog: true, roomScene: false };
  if (input.target === "roomScene") return { designer: false, catalog: false, roomScene: true };
  return { designer: input.useAsDesignerPhoto, catalog: input.alsoSetCatalogImage, roomScene: false };
}

/**
 * Crop a uniform white or near-white frame. A failed trim, or one that would
 * remove more than 40% of either dimension, keeps the untrimmed pixels.
 * This is local sharp processing of the uploaded file, not image generation.
 */
async function withoutExcessiveWhiteFrame(bytes: Buffer, width: number, height: number): Promise<Buffer> {
  if (width < 1 || height < 1) return bytes;
  try {
    const trimmed = await sharp(bytes, { failOn: "none", animated: false, limitInputPixels: 100_000_000 })
      .trim({ background: "#ffffff", threshold: PELICAN_WHITE_TRIM_THRESHOLD })
      .toBuffer({ resolveWithObject: true });
    const nextWidth = trimmed.info.width;
    const nextHeight = trimmed.info.height;
    if (nextWidth < 1 || nextHeight < 1) return bytes;
    const removedWidth = (width - nextWidth) / width;
    const removedHeight = (height - nextHeight) / height;
    if (removedWidth > PELICAN_WHITE_TRIM_MAX_FRACTION || removedHeight > PELICAN_WHITE_TRIM_MAX_FRACTION) return bytes;
    return trimmed.data;
  } catch {
    return bytes;
  }
}

async function toPelicanProductWebp(
  bytes: Buffer,
  contentType: (typeof PELICAN_PRODUCT_IMAGE_TYPES)[number],
): Promise<{ bytes: Buffer; width: number; height: number }> {
  const sharpOptions = { failOn: "none" as const, animated: false, limitInputPixels: 100_000_000 };
  const unreadable = () => new TRPCError({
    code: "BAD_REQUEST" as const,
    message: "Image could not be read. Upload a JPEG, PNG, or WebP file.",
  });
  const meta = await sharp(bytes, sharpOptions).metadata().catch(() => null);
  if (!meta) throw unreadable();
  if (meta.format !== SHARP_FORMAT_FOR_CONTENT_TYPE[contentType]) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Image contents do not match the declared file type. Upload a JPEG, PNG, or WebP file.",
    });
  }
  let oriented: Buffer;
  try {
    oriented = await sharp(bytes, sharpOptions).rotate().toBuffer();
  } catch {
    throw unreadable();
  }
  const orientedMeta = await sharp(oriented, sharpOptions).metadata();
  const orientedWidth = orientedMeta.width ?? 0;
  const orientedHeight = orientedMeta.height ?? 0;
  if (orientedWidth < 1 || orientedHeight < 1) throw unreadable();
  const framed = await withoutExcessiveWhiteFrame(oriented, orientedWidth, orientedHeight);
  try {
    // fit "inside" never pads. WebP keeps an alpha channel when the source has one.
    const output = await sharp(framed, sharpOptions)
      .resize({
        width: PELICAN_PRODUCT_IMAGE_MAX_EDGE,
        height: PELICAN_PRODUCT_IMAGE_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 85, alphaQuality: 100 })
      .toBuffer({ resolveWithObject: true });
    return { bytes: output.data, width: output.info.width, height: output.info.height };
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw unreadable();
  }
}

/**
 * Any stored pelican_products.category. The value is trimmed and capped at the
 * column length (64). Names outside the original storefront list, including
 * "Range Tops", are valid filters. A name that is not stored matches no rows.
 * Designer placement is unchanged: designer scope still keeps only products
 * with an exact supported Designer role.
 */
const StoredPelicanCategory = z.string().trim().min(1).max(64);

const DEFAULT_MARKUP_BPS: Record<string, number> = {
  Flooring: 6500,
  "Tile & Mosaic": 5500,
  "Sinks & Faucets": 3800,
  "Toilets & Bidets": 3500,
  "Shower & Bath": 2200,
  "Quartz Slabs (Countertops)": 1800,
};

type MarkupMap = Record<string, number>;

/**
 * Pelican has no supply-line (distributors) row; its vendor identity is the
 * approved vendor record whose sourceKey is "pelican". A vendor account passes
 * only when its approvedVendorLineId points at that approved record, so a
 * cabinet distributor or hardware vendor can never edit Pelican products.
 * A legacy account linked to a supply line coded "PEL" is still accepted.
 */
async function requirePelicanVendor(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  ctx: { user: { role: string }; distributorId: number | null; approvedVendorLineId?: number | null },
) {
  if (ctx.user.role === "admin") return;
  if (ctx.approvedVendorLineId != null) {
    const [vendor] = await db
      .select({ sourceKey: vendorLines.sourceKey, isApproved: vendorLines.isApproved })
      .from(vendorLines)
      .where(eq(vendorLines.id, ctx.approvedVendorLineId))
      .limit(1);
    if (vendor?.isApproved && vendor.sourceKey?.trim().toLowerCase() === "pelican") return;
  }
  if (ctx.distributorId != null) {
    const [line] = await db
      .select({ code: distributors.code, isActive: distributors.isActive })
      .from(distributors)
      .where(eq(distributors.id, ctx.distributorId))
      .limit(1);
    if (line?.isActive && line.code === "PEL") return;
  }
  throw new TRPCError({ code: "FORBIDDEN", message: "This catalog is only available to the Pelican vendor." });
}
async function loadMarkupMap(db: NonNullable<Awaited<ReturnType<typeof getDb>>>): Promise<MarkupMap> {
  const rows = await db
    .select({ category: pelicanCategoryMarkups.category, markupBps: pelicanCategoryMarkups.markupBps })
    .from(pelicanCategoryMarkups);
  const map: MarkupMap = {};
  for (const r of rows) map[r.category] = r.markupBps;
  return map;
}

function markupBpsFor(map: MarkupMap, category: string): number {
  if (map[category] !== undefined) return map[category];
  return DEFAULT_MARKUP_BPS[category] ?? 0;
}

const PELICAN_SLUG_MAX = 160;
const PELICAN_CODE_MAX = 191;

/** URL slug from a product name. Empty when the name has no letters or digits. */
function catalogSlugBase(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, PELICAN_SLUG_MAX);
}

function normalizeCatalogName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** First unused lowercase key, adding -2, -3, … when `base` is already taken. */
function firstFreeKey(base: string, taken: ReadonlySet<string>, maxLength: number): string | null {
  const root = base.toLowerCase().slice(0, maxLength);
  if (!root) return null;
  if (!taken.has(root)) return root;
  for (let n = 2; n <= taken.size + 2; n += 1) {
    const suffix = `-${n}`;
    const room = maxLength - suffix.length;
    if (room < 1) return null;
    const candidate = `${root.slice(0, room)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return null;
}

function decimalOrNull(value: number | null | undefined): string | null {
  if (value == null) return null;
  return value.toFixed(2);
}

function mysqlInsertId(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  const insertId = (header as { insertId?: number } | null)?.insertId;
  return Number(insertId ?? 0);
}

function isDuplicateEntry(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as { code?: unknown; errno?: unknown; message?: unknown; cause?: unknown };
    if (record.code === "ER_DUP_ENTRY" || record.errno === 1062) return true;
    if (typeof record.message === "string" && /duplicate entry/i.test(record.message)) return true;
    current = record.cause;
  }
  return false;
}

/**
 * Resolve the verified source basis without letting a legacy zero placeholder
 * suppress a positive authorized list price. A positive landed cost wins; when
 * it is absent or zero, a positive supplier list price is the lawful fallback.
 */
export const positivePelicanPriceBase = positiveAuthorizedSurfaceBase;

export function computeSellPrice(
  product: { listPrice: string | null; yourCost: string | null; retailPrice?: string | null; category: string },
  map: MarkupMap
): number | null {
  const retailPrice = product.retailPrice == null ? null : Number(product.retailPrice);
  if (retailPrice != null && Number.isFinite(retailPrice) && retailPrice > 0) {
    return Math.round(retailPrice * 100) / 100;
  }
  const cost = positivePelicanPriceBase(product);
  if (cost == null) return null;
  const bps = markupBpsFor(map, product.category);
  return Math.round(cost * (1 + bps / 10000) * 100) / 100;
}

function withDesignerRenderFlags<T extends { category: string; subCategory?: string | null; pelicanCode?: string | null; name?: string | null; description?: string | null; materialImageUrl?: string | null }>(product: T) {
  return { ...product, ...pelicanDesignerRenderFlags(product) };
}

/** Designer flooring keeps the catalog-photo requirement. The swatch is separate. */
function isDesignerFlooringCard(row: { category: string; imageUrl?: string | null }): boolean {
  return row.category !== "Flooring" || Boolean(row.imageUrl?.trim());
}

function withPricing<T extends { listPrice: string | null; yourCost: string | null; retailPrice?: string | null; category: string }>(
  product: T,
  map: MarkupMap,
  affiliateMarkupBps?: number,
): T & { sellPrice: number | null; markupBps: number; platformSellPrice: number | null; affiliateMarkupBps: number } {
  const platformSellPrice = computeSellPrice(product, map);
  let sellPrice = platformSellPrice;
  if (platformSellPrice != null && affiliateMarkupBps != null) {
    if (isAttachProductCategory(product.category)) {
      const cost = resolveAffiliateTierCost({
        yourCostCents: dollarsToCents(product.yourCost),
        listPriceCents: dollarsToCents(product.listPrice),
        referenceRetailCents: Math.round(platformSellPrice * 100),
        productClass: "attach",
        tier: null,
        platformAffiliateMarkupBps: 0,
      });
      sellPrice = cost.affiliateCostCents == null
        ? Math.round(platformSellPrice * (1 + affiliateMarkupBps / 10000) * 100) / 100
        : resolveAffiliateRetail(cost.affiliateCostCents, { globalMarkupBps: affiliateMarkupBps }).retailCents / 100;
    } else {
      sellPrice = Math.round(platformSellPrice * (1 + affiliateMarkupBps / 10000) * 100) / 100;
    }
  }
  return {
    ...product,
    sellPrice,
    markupBps: affiliateMarkupBps ?? markupBpsFor(map, product.category),
    platformSellPrice,
    affiliateMarkupBps: affiliateMarkupBps ?? 0,
  };
}

/**
 * SQL condition: product has a positive cost (yourCost > 0 OR listPrice > 0).
 * Products with NULL/zero cost would compute to a $0 sell price and must not
 * appear on public-facing pages.
 */
function hasPriceData() {
  return or(
    gt(pelicanProducts.yourCost, "0"),
    gt(pelicanProducts.listPrice, "0")
  );
}

/** SQL-safe inverse of hasPriceData(), including legacy NULL values. */
function lacksPriceData() {
  return and(
    or(isNull(pelicanProducts.yourCost), lte(pelicanProducts.yourCost, "0")),
    or(isNull(pelicanProducts.listPrice), lte(pelicanProducts.listPrice, "0")),
  );
}

/**
 * A public source MSRP is not an authorized sell-price basis and must never be
 * marked up. It does, however, let a current supplier SKU remain findable as a
 * clear quote-only catalog item instead of disappearing from the catalog.
 */
function hasCatalogPriceOrQuoteReference() {
  return or(
    hasPriceData() as any,
    gt(pelicanProducts.msrp, "0"),
  );
}

export const pelicanRouter = router({
  categories: publicProcedure
    .input(z.object({ scope: z.enum(["designer", "catalog", "all", "admin"]).default("catalog") }).optional())
    .query(async (opts) => {
      const scope = opts.input?.scope ?? "catalog";
      // Admin counts every stored row, including inactive and unpriced products,
      // so Overview and My Catalog share one list. Shopper scopes stay public
      // and are the only scope stored in the public catalog cache.
      if (scope === "admin") {
        const { ctx } = opts;
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
        const db = await getDb();
        if (!db) return [] as { category: string; count: number }[];
        await requirePelicanVendor(db, {
          user: ctx.user,
          distributorId: ctx.user.distributorId,
          approvedVendorLineId: ctx.user.approvedVendorLineId,
        });
        const rows = await db
          .select({ category: pelicanProducts.category, count: sql<number>`count(*)` })
          .from(pelicanProducts)
          .groupBy(pelicanProducts.category)
          .orderBy(desc(sql`count(*)`));
        return rows.map((r) => ({ category: r.category, count: Number(r.count) }));
      }
      return servePublicCatalog({
        procedure: "pelican.categories",
        ctx: opts.ctx,
        input: { scope },
        tags: [CATALOG_TAGS.pelican],
        fallback: [] as { category: string; count: number }[],
        load: async () => {
          const db = await getDb();
          if (!db) return [] as { category: string; count: number }[];
          const conds = [
            eq(pelicanProducts.isActive, true),
            (scope === "catalog" ? hasCatalogPriceOrQuoteReference() : hasPriceData()) as any,
          ];
          if (scope === "designer") conds.push(eq(pelicanProducts.showInDesigner, true));
          if (scope === "catalog") conds.push(eq(pelicanProducts.showInCatalog, true));
          if (scope === "designer") {
            const readyRows = await db
              .select()
              .from(pelicanProducts)
              .where(and(...conds));
            const counts = new Map<string, number>();
            for (const row of readyRows) {
              if (!isPelicanDesignerSelectable(row) || !isDesignerFlooringCard(row)) continue;
              counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
            }
            return Array.from(counts, ([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);
          }
          const rows = await db
            .select({ category: pelicanProducts.category, count: sql<number>`count(*)` })
            .from(pelicanProducts)
            .where(and(...conds))
            .groupBy(pelicanProducts.category)
            .orderBy(desc(sql`count(*)`));
          return rows.map((r) => ({ category: r.category, count: Number(r.count) }));
        },
      });
    }),
  byCategory: publicProcedure
    .input(
      z.object({
        category: StoredPelicanCategory,
        scope: z.enum(["designer", "catalog", "all"]).default("catalog"),
        search: z.string().trim().optional(),
        subCategory: z.string().trim().optional(),
        affiliateSlug: z.string().trim().optional(),
        limit: z.number().min(1).max(200).default(60),
        offset: z.number().min(0).default(0),
      })
    )
    .query((opts) => servePublicCatalog({
      procedure: "pelican.byCategory",
      ctx: opts.ctx,
      input: opts.input,
      tags: [CATALOG_TAGS.pelican],
      fallback: { suggested: [], items: [], total: 0, subCategories: [] as string[] },
      load: async () => {
      const { input } = opts;
      const db = await getDb();
      if (!db) return { suggested: [], items: [], total: 0, subCategories: [] as string[] };
      // Markup, affiliate pricing, and the product reads do not depend on each
      // other. Running them together keeps a category page to one database
      // round trip instead of five.
      const markupPromise = loadMarkupMap(db);
      const affiliatePricingPromise = loadAffiliateStorefrontPricing(input.affiliateSlug);
      const gate = await loadAffiliateCatalogGate(db, input.affiliateSlug);
      const conds = [
        eq(pelicanProducts.category, input.category),
        eq(pelicanProducts.isActive, true),
        (input.scope === "catalog" ? hasCatalogPriceOrQuoteReference() : hasPriceData()) as any,
      ];
      if (input.scope === "designer") conds.push(eq(pelicanProducts.showInDesigner, true));
      if (input.scope === "catalog") conds.push(eq(pelicanProducts.showInCatalog, true));
      if (input.subCategory) conds.push(eq(pelicanProducts.subCategory, input.subCategory));
      const hiddenSurfaces = hiddenNumericIds(gate, "surface");
      if (hiddenSurfaces.length > 0) conds.push(notInArray(pelicanProducts.id, hiddenSurfaces));
      if (input.search) {
        const search = input.search.trim();
        const q = `%${search}%`;
        const normalizedCodeSearch = normalizeCode(search);
        const normalizedPelicanCode = sql`UPPER(REPLACE(REPLACE(REPLACE(${pelicanProducts.pelicanCode}, '-', ''), ' ', ''), '_', ''))`;
        conds.push(
          or(
            like(pelicanProducts.name, q),
            like(pelicanProducts.description, q),
            like(pelicanProducts.pelicanCode, q),
            sql`${normalizedPelicanCode} LIKE ${`%${normalizedCodeSearch}%`}`
          ) as any
        );
      }
      const where = and(...conds);
      if (input.scope === "designer") {
        const [markupMap, affiliatePricing, designerRows] = await Promise.all([
          markupPromise,
          affiliatePricingPromise,
          db
            .select()
            .from(pelicanProducts)
            .where(where)
            .orderBy(desc(pelicanProducts.isPopular), asc(pelicanProducts.popularRank), asc(pelicanProducts.name)),
        ]);
        const affiliateBps = (category: string) => affiliatePricing
          ? resolveMarkupBps(affiliatePricing.markup, { categoryKey: category })
          : undefined;
        const readyRows = designerRows.filter((row) => isPelicanDesignerSelectable(row) && isDesignerFlooringCard(row));
        const suggested = input.search || input.subCategory || input.offset > 0
          ? []
          : readyRows.filter((row) => row.isPopular).slice(0, 12);
        const page = readyRows.slice(input.offset, input.offset + input.limit);
        const subCategories = Array.from(new Set(readyRows.map((row) => row.subCategory).filter((value): value is string => Boolean(value))));
        return {
          suggested: suggested.map((r) => withDesignerRenderFlags(withPricing(r, markupMap, affiliateBps(r.category)))),
          items: page.map((r) => withDesignerRenderFlags(withPricing(r, markupMap, affiliateBps(r.category)))),
          total: readyRows.length,
          subCategories,
        };
      }
      const suggestedQuery = input.search || input.subCategory || input.offset > 0
        ? Promise.resolve([] as never[])
        : db
            .select()
            .from(pelicanProducts)
            .where(and(where, eq(pelicanProducts.isPopular, true)))
            .orderBy(asc(pelicanProducts.popularRank))
            .limit(12);
      const [markupMap, affiliatePricing, suggestedRows, itemRows, counted, subs] = await Promise.all([
        markupPromise,
        affiliatePricingPromise,
        suggestedQuery,
        db
          .select()
          .from(pelicanProducts)
          .where(where)
          .orderBy(desc(pelicanProducts.isPopular), asc(pelicanProducts.popularRank), asc(pelicanProducts.name))
          .limit(input.limit)
          .offset(input.offset),
        db
          .select({ total: sql<number>`count(*)` })
          .from(pelicanProducts)
          .where(where),
        db
          .selectDistinct({ subCategory: pelicanProducts.subCategory })
          .from(pelicanProducts)
          .where(and(
            eq(pelicanProducts.category, input.category),
            eq(pelicanProducts.isActive, true),
            hasPriceData() as any,
            eq(pelicanProducts.showInCatalog, true),
          )),
      ]);
      const affiliateBps = (category: string) => affiliatePricing
        ? resolveMarkupBps(affiliatePricing.markup, { categoryKey: category })
        : undefined;
      const [{ total }] = counted;
      return {
        suggested: suggestedRows.map((r) => withDesignerRenderFlags(withPricing(r, markupMap, affiliateBps(r.category)))),
        items: itemRows.map((r) => withDesignerRenderFlags(withPricing(r, markupMap, affiliateBps(r.category)))),
        total: Number(total),
        subCategories: subs.map((s) => s.subCategory).filter(Boolean) as string[],
      };
      },
    })),
  bySlug: publicProcedure
    .input(z.object({ slug: z.string(), affiliateSlug: z.string().trim().optional() }))
    .query((opts) => servePublicCatalog({
      procedure: "pelican.bySlug",
      ctx: opts.ctx,
      input: opts.input,
      tags: [CATALOG_TAGS.pelican],
      fallback: null,
      load: async () => {
      const { input } = opts;
      const db = await getDb();
      if (!db) return null;
      const [row] = await db
        .select()
        .from(pelicanProducts)
        .where(and(
          eq(pelicanProducts.slug, input.slug),
          eq(pelicanProducts.isActive, true),
          eq(pelicanProducts.showInCatalog, true),
          hasCatalogPriceOrQuoteReference() as any,
        ))
        .limit(1);
      if (!row) return null;
      const [gate, markupMap, affiliatePricing] = await Promise.all([
        loadAffiliateCatalogGate(db, input.affiliateSlug),
        loadMarkupMap(db),
        loadAffiliateStorefrontPricing(input.affiliateSlug),
      ]);
      if (hiddenNumericIds(gate, "surface").includes(row.id)) return null;
      const priced = withPricing(row, markupMap, affiliatePricing
        ? resolveMarkupBps(affiliatePricing.markup, { categoryKey: row.category })
        : undefined);
      return priced;
      },
    })),
  // Returns related products for "Complete this look" pairing (sink ↔ faucet).
  // For a faucet, returns matching sinks in the same category. For a sink, returns faucets.
  relatedProducts: publicProcedure
    .input(z.object({ slug: z.string(), affiliateSlug: z.string().trim().optional(), limit: z.number().min(1).max(12).default(4) }))
    .query((opts) => servePublicCatalog({
      procedure: "pelican.relatedProducts",
      ctx: opts.ctx,
      input: opts.input,
      tags: [CATALOG_TAGS.pelican],
      fallback: [],
      load: async () => {
      const { input } = opts;
      const db = await getDb();
      if (!db) return [];
      const [row] = await db
        .select()
        .from(pelicanProducts)
        .where(eq(pelicanProducts.slug, input.slug))
        .limit(1);
      if (!row) return [];
      // Determine the paired subCategory
      let pairedSub: string | null = null;
      if (row.subCategory === "Faucets") pairedSub = "Sinks";
      else if (row.subCategory === "Sinks") pairedSub = "Faucets";
      else return [];
      const [markupMap, affiliatePricing, gate, rows] = await Promise.all([
        loadMarkupMap(db),
        loadAffiliateStorefrontPricing(input.affiliateSlug),
        loadAffiliateCatalogGate(db, input.affiliateSlug),
        db
          .select()
          .from(pelicanProducts)
          .where(
            and(
              eq(pelicanProducts.category, row.category),
              eq(pelicanProducts.subCategory, pairedSub),
              eq(pelicanProducts.isActive, true),
              eq(pelicanProducts.showInCatalog, true),
              hasPriceData() as any,
            )
          )
          .orderBy(desc(pelicanProducts.isPopular), asc(pelicanProducts.popularRank))
          .limit(input.limit),
      ]);
      const hiddenSurfaces = new Set(hiddenNumericIds(gate, "surface"));
      return rows
        .filter((r) => !hiddenSurfaces.has(r.id))
        .map((r) => withPricing(r, markupMap, affiliatePricing
          ? resolveMarkupBps(affiliatePricing.markup, { categoryKey: r.category })
          : undefined))
        .filter((r) => r.sellPrice && r.sellPrice > 0);
      },
    })),

  adminList: supplierProfileProcedure
    .input(
      z.object({
        category: StoredPelicanCategory.optional(),
        search: z.string().trim().optional(),
        unpricedOnly: z.boolean().default(false),
        isActive: z.boolean().optional(),
        limit: z.number().min(1).max(500).default(100),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      await requirePelicanVendor(db, ctx);
      const markupMap = await loadMarkupMap(db);
      const conds = [] as any[];
      if (input.category) conds.push(eq(pelicanProducts.category, input.category));
      if (input.isActive !== undefined) conds.push(eq(pelicanProducts.isActive, input.isActive));
      if (input.unpricedOnly) conds.push(lacksPriceData() as any);
      if (input.search) {
        const search = input.search.trim();
        const q = `%${search}%`;
        const normalizedCodeSearch = normalizeCode(search);
        const normalizedPelicanCode = sql`UPPER(REPLACE(REPLACE(REPLACE(${pelicanProducts.pelicanCode}, '-', ''), ' ', ''), '_', ''))`;
        conds.push(
          or(
            like(pelicanProducts.name, q),
            like(pelicanProducts.description, q),
            like(pelicanProducts.pelicanCode, q),
            sql`${normalizedPelicanCode} LIKE ${`%${normalizedCodeSearch}%`}`
          ) as any
        );
      }
      const where = conds.length ? and(...conds) : undefined;
      const items = await db
        .select()
        .from(pelicanProducts)
        .where(where)
        .orderBy(asc(pelicanProducts.name), asc(pelicanProducts.id))
        .limit(input.limit)
        .offset(input.offset);
      const [{ total }] = await db
        .select({ total: sql<number>`count(*)` })
        .from(pelicanProducts)
        .where(where);
      return { items: items.map((r) => withPricing(r, markupMap)), total: Number(total) };
    }),

  /**
   * Shipping evidence is deliberately administered separately from selling
   * price/catalog visibility. A Pelican SKU cannot enter a carrier quote until
   * Operations has recorded a verified ship-from origin, package facts and a
   * source reference for that exact catalog row.
   */
  adminShippingProfiles: supplierProfileProcedure
    .input(z.object({
      search: z.string().trim().optional(),
      limit: z.number().min(1).max(500).default(200),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      await requirePelicanVendor(db, ctx);
      const query = input.search?.trim();
      const q = query ? `%${query}%` : null;
      const where = q
        ? or(like(pelicanProducts.name, q), like(pelicanProducts.pelicanCode, q), like(pelicanProducts.category, q))
        : undefined;
      const items = await db
        .select({
          productId: pelicanProducts.id,
          pelicanCode: pelicanProducts.pelicanCode,
          name: pelicanProducts.name,
          category: pelicanProducts.category,
          profileId: pelicanShippingProfiles.id,
          originName: pelicanShippingProfiles.originName,
          originZip: pelicanShippingProfiles.originZip,
          transportMode: pelicanShippingProfiles.transportMode,
          packageLengthIn: pelicanShippingProfiles.packageLengthIn,
          packageWidthIn: pelicanShippingProfiles.packageWidthIn,
          packageHeightIn: pelicanShippingProfiles.packageHeightIn,
          packageWeightLbs: pelicanShippingProfiles.packageWeightLbs,
          freightClass: pelicanShippingProfiles.freightClass,
          evidenceType: pelicanShippingProfiles.evidenceType,
          comparisonRuleId: pelicanShippingProfiles.comparisonRuleId,
          sourceUrl: pelicanShippingProfiles.sourceUrl,
          sourceReference: pelicanShippingProfiles.sourceReference,
          verifiedAt: pelicanShippingProfiles.verifiedAt,
          isEnabled: pelicanShippingProfiles.isEnabled,
          updatedAt: pelicanShippingProfiles.updatedAt,
        })
        .from(pelicanProducts)
        .leftJoin(pelicanShippingProfiles, eq(pelicanShippingProfiles.pelicanProductId, pelicanProducts.id))
        .where(where)
        .orderBy(asc(pelicanProducts.category), asc(pelicanProducts.pelicanCode))
        .limit(input.limit)
        .offset(input.offset);
      const [{ total }] = await db
        .select({ total: sql<number>`count(*)` })
        .from(pelicanProducts)
        .where(where);
      return { items, total: Number(total) };
    }),

  saveShippingProfile: supplierProfileProcedure
    .input(z.object({
      productId: z.number().int().positive(),
      originName: z.string().trim().min(2).max(191),
      originZip: z.string().trim().regex(/^\d{5}(?:-\d{4})?$/, "Enter a valid ship-from ZIP."),
      transportMode: z.enum(["parcel", "ltl"]),
      packageLengthIn: z.number().positive().max(999),
      packageWidthIn: z.number().positive().max(999),
      packageHeightIn: z.number().positive().max(999),
      packageWeightLbs: z.number().positive().max(5000),
      freightClass: z.string().trim().max(8).nullable(),
      evidenceType: z.enum(["supplier_verified", "comparable_estimate"]).default("supplier_verified"),
      comparisonRuleId: z.string().trim().max(96).nullable(),
      sourceUrl: z.string().trim().url().max(512),
      sourceReference: z.string().trim().min(2).max(512),
      verifiedAt: z.coerce.date(),
      isEnabled: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Shipping profiles are unavailable." });
      await requirePelicanVendor(db, ctx);
      const [product] = await db
        .select({ id: pelicanProducts.id })
        .from(pelicanProducts)
        .where(eq(pelicanProducts.id, input.productId))
        .limit(1);
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Pelican product not found." });
      if (input.transportMode === "ltl" && !input.freightClass?.trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "An LTL shipping profile requires a freight class." });
      }
      const record = {
        pelicanProductId: input.productId,
        originName: input.originName,
        originZip: input.originZip.slice(0, 5),
        transportMode: input.transportMode,
        packageLengthIn: String(input.packageLengthIn),
        packageWidthIn: String(input.packageWidthIn),
        packageHeightIn: String(input.packageHeightIn),
        packageWeightLbs: String(input.packageWeightLbs),
        freightClass: input.transportMode === "ltl" ? input.freightClass?.trim() || null : null,
        evidenceType: input.evidenceType,
        comparisonRuleId: input.evidenceType === "comparable_estimate" ? input.comparisonRuleId?.trim() || null : null,
        sourceUrl: input.sourceUrl,
        sourceReference: input.sourceReference,
        verifiedAt: input.verifiedAt,
        isEnabled: input.isEnabled,
      };
      await db.insert(pelicanShippingProfiles).values(record).onDuplicateKeyUpdate({
        set: { ...record, updatedAt: new Date() },
      });
      return { success: true } as const;
    }),

  /**
   * Applies the owner-authorized comparison profiles to active catalog SKUs.
   * A supplier-verified profile always wins and is never changed here.
   */
  applyComparableShippingEstimates: adminProcedure
    .mutation(async () => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Shipping profiles are unavailable." });
      const products = await db
        .select({
          id: pelicanProducts.id,
          category: pelicanProducts.category,
          subCategory: pelicanProducts.subCategory,
          name: pelicanProducts.name,
          pelicanCode: pelicanProducts.pelicanCode,
        })
        .from(pelicanProducts)
        .where(eq(pelicanProducts.isActive, true));
      const existing = await db
        .select({ productId: pelicanShippingProfiles.pelicanProductId, evidenceType: pelicanShippingProfiles.evidenceType })
        .from(pelicanShippingProfiles);
      const existingByProduct = new Map(existing.map((row) => [row.productId, row.evidenceType]));
      let applied = 0;
      let skippedVerified = 0;
      let needsManualReview = 0;
      for (const product of products) {
        if (existingByProduct.get(product.id) === "supplier_verified") {
          skippedVerified += 1;
          continue;
        }
        const profile = comparisonProfileForPelicanProduct(product);
        if (!profile) {
          needsManualReview += 1;
          continue;
        }
        await db.insert(pelicanShippingProfiles).values(profile).onDuplicateKeyUpdate({
          set: { ...profile, updatedAt: new Date() },
        });
        applied += 1;
      }
      return { applied, skippedVerified, needsManualReview } as const;
    }),

  /** Evidence-only audit of every row configured for the Designer palette. */
  designerReadinessAudit: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      return auditPelicanDesignerReadiness([]);
    }
    const rows = await db
      .select()
      .from(pelicanProducts)
      .where(eq(pelicanProducts.showInDesigner, true))
      .orderBy(asc(pelicanProducts.category), asc(pelicanProducts.subCategory), asc(pelicanProducts.name));
    return auditPelicanDesignerReadiness(rows);
  }),

  getMarkups: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db)
      return [] as {
        category: string;
        markupBps: number;
        isDefault: boolean;
        productCount: number;
        avgCost: number | null;
      }[];
    const markupMap = await loadMarkupMap(db);
    const stats = await db
      .select({
        category: pelicanProducts.category,
        productCount: sql<number>`count(*)`,
        avgCost: sql<number>`avg(case when ${pelicanProducts.yourCost} > 0 then ${pelicanProducts.yourCost} when ${pelicanProducts.listPrice} > 0 then ${pelicanProducts.listPrice} else null end)`,
      })
      .from(pelicanProducts)
      .where(eq(pelicanProducts.isActive, true))
      .groupBy(pelicanProducts.category)
      .orderBy(desc(sql`count(*)`));
    return stats.map((s) => ({
      category: s.category,
      markupBps: markupBpsFor(markupMap, s.category),
      isDefault: markupMap[s.category] === undefined,
      productCount: Number(s.productCount),
      avgCost: s.avgCost == null ? null : Number(s.avgCost),
    }));
  }),
  setMarkup: adminProcedure
    .input(z.object({ category: z.string().min(1), markupBps: z.number().int().min(0).max(100000) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { success: false } as const;
      await db
        .insert(pelicanCategoryMarkups)
        .values({ category: input.category, markupBps: input.markupBps, updatedByOpenId: ctx.user.openId })
        .onDuplicateKeyUpdate({ set: { markupBps: input.markupBps, updatedByOpenId: ctx.user.openId } });
      return { success: true } as const;
    }),

  setPopular: supplierProfileProcedure
    .input(z.object({ id: z.number(), isPopular: z.boolean(), popularRank: z.number().min(0).default(0) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { success: false } as const;
      await requirePelicanVendor(db, ctx);
      await db
        .update(pelicanProducts)
        .set({ isPopular: input.isPopular, popularRank: input.popularRank })
        .where(eq(pelicanProducts.id, input.id));
      return { success: true } as const;
    }),
  setVisibility: supplierProfileProcedure
    .input(
      z.object({
        id: z.number(),
        showInCatalog: z.boolean().optional(),
        showInDesigner: z.boolean().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { success: false } as const;
      await requirePelicanVendor(db, ctx);
      const patch: Record<string, boolean> = {};
      if (input.showInCatalog !== undefined) patch.showInCatalog = input.showInCatalog;
      if (input.showInDesigner !== undefined) patch.showInDesigner = input.showInDesigner;
      if (input.isActive !== undefined) patch.isActive = input.isActive;
      if (Object.keys(patch).length) {
        const [existing] = await db
          .select({ listPrice: pelicanProducts.listPrice, yourCost: pelicanProducts.yourCost, msrp: pelicanProducts.msrp })
          .from(pelicanProducts)
          .where(eq(pelicanProducts.id, input.id))
          .limit(1);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Surface product not found." });
        const requestsPublicAvailability = patch.isActive === true || patch.showInCatalog === true || patch.showInDesigner === true;
        const permitsCatalogQuoteOnly = Number(existing.msrp) > 0 && patch.showInDesigner !== true;
        if (requestsPublicAvailability && positiveAuthorizedSurfaceBase(existing) == null && !permitsCatalogQuoteOnly) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "An item without a positive authorized cost or list price can only remain catalog-visible as a quote-only SKU; it cannot enter the Designer.",
          });
        }
        await db.update(pelicanProducts).set(patch).where(eq(pelicanProducts.id, input.id));
      }
      return { success: true } as const;
    }),
  setPricing: supplierProfileProcedure
    .input(
      z.object({
        id: z.number(),
        listPrice: z.number().nonnegative().nullable().optional(),
        yourCost: z.number().nonnegative().nullable().optional(),
        retailPrice: z.number().nonnegative().nullable().optional(),
        markupPercent: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { success: false } as const;
      await requirePelicanVendor(db, ctx);
      const [existing] = await db
        .select({ listPrice: pelicanProducts.listPrice, yourCost: pelicanProducts.yourCost })
        .from(pelicanProducts)
        .where(eq(pelicanProducts.id, input.id))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Surface product not found." });
      const patch: Record<string, string | boolean | null> = {};
      if (input.listPrice !== undefined) patch.listPrice = input.listPrice == null ? null : String(input.listPrice);
      if (input.yourCost !== undefined) patch.yourCost = input.yourCost == null ? null : String(input.yourCost);
      if (input.retailPrice !== undefined) patch.retailPrice = input.retailPrice == null ? null : String(input.retailPrice);
      if (input.markupPercent !== undefined) patch.markupPercent = String(input.markupPercent);
      const resultingBase = positiveAuthorizedSurfaceBase({
        listPrice: input.listPrice === undefined ? existing.listPrice : input.listPrice == null ? null : String(input.listPrice),
        yourCost: input.yourCost === undefined ? existing.yourCost : input.yourCost == null ? null : String(input.yourCost),
      });
      if (resultingBase == null) {
        patch.isActive = false;
        patch.showInCatalog = false;
        patch.showInDesigner = false;
        patch.isPopular = false;
      }
      if (Object.keys(patch).length) {
        await db.update(pelicanProducts).set(patch).where(eq(pelicanProducts.id, input.id));
      }
      return { success: true, unpublished: resultingBase == null } as const;
    }),
  updateProduct: supplierProfileProcedure
    .input(z.object({
      id: z.number().int().positive(),
      name: z.string().trim().min(1).max(255),
      description: z.string().trim().max(10000),
      /**
       * Catalog photo. Omit it to leave the stored imageUrl unchanged, including
       * a relative `/manus-storage/...` path written by uploadProductImage.
       * `null` (or a blank string) clears it. A value must be an http(s) URL or
       * a `/manus-storage/...` path, the same rules as materialImageUrl.
       */
      imageUrl: z.string().trim().max(512).nullable().optional(),
      materialImageUrl: z.string().trim().max(512).nullable().optional(),
      /**
       * Room-scene photo. Omit it to leave the stored roomSceneImageUrl unchanged.
       * `null` (or a blank string) clears it. A value must be an http(s) URL or
       * a `/manus-storage/...` path, the same rules as materialImageUrl.
       */
      roomSceneImageUrl: z.string().trim().max(512).nullable().optional(),
      yourCost: z.number().nonnegative().nullable(),
      retailPrice: z.number().nonnegative().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pelican catalog is unavailable." });
      await requirePelicanVendor(db, ctx);
      const [existing] = await db.select({ id: pelicanProducts.id, listPrice: pelicanProducts.listPrice }).from(pelicanProducts).where(eq(pelicanProducts.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Pelican product not found." });
      const patch: Record<string, string | boolean | null> = {
        name: input.name,
        description: input.description,
        yourCost: input.yourCost == null ? null : String(input.yourCost),
        retailPrice: input.retailPrice == null ? null : String(input.retailPrice),
      };
      if (input.imageUrl !== undefined) {
        patch.imageUrl = storedImageReferenceOrThrow(input.imageUrl, "Catalog image");
      }
      if (input.materialImageUrl !== undefined) {
        patch.materialImageUrl = materialImageUrlOrThrow(input.materialImageUrl);
      }
      if (input.roomSceneImageUrl !== undefined) {
        patch.roomSceneImageUrl = storedImageReferenceOrThrow(input.roomSceneImageUrl, "Room scene image");
      }
      if (positiveAuthorizedSurfaceBase({ listPrice: existing.listPrice, yourCost: input.yourCost == null ? null : String(input.yourCost) }) == null) {
        patch.isActive = false;
        patch.showInCatalog = false;
        patch.showInDesigner = false;
        patch.isPopular = false;
      }
      await db.update(pelicanProducts).set(patch).where(eq(pelicanProducts.id, input.id));
      return { success: true } as const;
    }),
  /**
   * Store a photo the vendor uploaded. This does not generate or fetch an
   * image. Each call writes a new object key so the long-lived storage cache
   * cannot keep serving the previous file.
   *
   * Catalog, Designer, and room-scene photos are separate files. Pass `target`
   * to write one column, or both catalog and Designer columns. `roomScene`
   * writes only roomSceneImageUrl and never imageUrl or materialImageUrl.
   * When `target` is omitted, `useAsDesignerPhoto` and `alsoSetCatalogImage`
   * still apply and both default to true; the room scene stays unchanged.
   * A uniform near-white frame is cropped before the chosen target is saved.
   */
  uploadProductImage: supplierProfileProcedure
    .input(z.object({
      id: z.number().int().positive(),
      dataBase64: z.string().min(1).max(PELICAN_PRODUCT_IMAGE_MAX_BASE64_CHARS),
      contentType: z.enum(PELICAN_PRODUCT_IMAGE_TYPES),
      target: z.enum(["catalog", "designer", "both", "roomScene"]).optional(),
      useAsDesignerPhoto: z.boolean().default(true),
      alsoSetCatalogImage: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pelican catalog is unavailable." });
      await requirePelicanVendor(db, ctx);
      const [existing] = await db
        .select({
          id: pelicanProducts.id,
          imageUrl: pelicanProducts.imageUrl,
          materialImageUrl: pelicanProducts.materialImageUrl,
          roomSceneImageUrl: pelicanProducts.roomSceneImageUrl,
        })
        .from(pelicanProducts)
        .where(eq(pelicanProducts.id, input.id))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Pelican product not found." });

      const writes = pelicanProductImageWrites(input);
      const decoded = decodePelicanProductImage(input.dataBase64);
      const prepared = await toPelicanProductWebp(decoded, input.contentType);
      const key = `pelican/products/${input.id}/${Date.now()}-${randomUUID().replace(/-/g, "").slice(0, 8)}.webp`;
      const stored = await storagePut(key, prepared.bytes, "image/webp");
      if (stored.url.length > 512) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Stored image address exceeds the catalog column length." });
      }

      const patch: { materialImageUrl?: string; imageUrl?: string; roomSceneImageUrl?: string } = {};
      if (writes.designer) patch.materialImageUrl = stored.url;
      if (writes.catalog) patch.imageUrl = stored.url;
      if (writes.roomScene) patch.roomSceneImageUrl = stored.url;
      if (Object.keys(patch).length > 0) {
        await db.update(pelicanProducts).set(patch).where(eq(pelicanProducts.id, input.id));
      }
      return {
        url: stored.url,
        materialImageUrl: writes.designer ? stored.url : existing.materialImageUrl ?? null,
        imageUrl: writes.catalog ? stored.url : existing.imageUrl ?? null,
        roomSceneImageUrl: writes.roomScene ? stored.url : existing.roomSceneImageUrl ?? null,
        width: prepared.width,
        height: prepared.height,
      };
    }),
  /**
   * Add one Pelican catalog row. Photos are uploaded afterward with
   * uploadProductImage, which needs the new id.
   *
   * Auth is the same gate as uploadProductImage: an administrator, or the
   * approved vendor who owns the Pelican catalog. Role `admin` is owner
   * authority. The products table has no owner column, and this procedure
   * does not assign one.
   *
   * Sell price is not stored. It is the positive list price marked up with
   * the category markup (computeSellPrice), the same path the catalog uses.
   * Category and subCategory are required because the portal fills them from
   * the area the vendor is browsing.
   */
  createProduct: supplierProfileProcedure
    .input(z.object({
      category: StoredPelicanCategory,
      subCategory: z.string().trim().min(1).max(128),
      name: z.string().trim().min(1).max(255),
      pelicanCode: z.string().trim().max(PELICAN_CODE_MAX).nullish(),
      description: z.string().trim().max(10000).nullish(),
      size: z.string().trim().max(128).nullish(),
      listPrice: z.number().finite().nonnegative().max(99_999_999.99).nullish(),
      msrp: z.number().finite().nonnegative().max(99_999_999.99).nullish(),
      coverageSqFt: z.number().finite().positive().max(999_999.99).nullish(),
      isActive: z.boolean().default(true),
      showInCatalog: z.boolean().default(true),
      showInDesigner: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pelican catalog is unavailable." });
      await requirePelicanVendor(db, ctx);

      const category = input.category;
      const name = input.name;
      const identities = await db
        .select({
          name: pelicanProducts.name,
          slug: pelicanProducts.slug,
          category: pelicanProducts.category,
          pelicanCode: pelicanProducts.pelicanCode,
        })
        .from(pelicanProducts);

      const sameCategory = identities.filter((row) => row.category === category);
      if (sameCategory.some((row) => normalizeCatalogName(row.name) === normalizeCatalogName(name))) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A product named "${name}" already exists in ${category}. Edit that item instead of adding another.`,
        });
      }

      const slugBase = catalogSlugBase(name);
      if (!slugBase) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Product name needs a letter or number so a catalog link can be created.",
        });
      }
      if (sameCategory.some((row) => row.slug.trim().toLowerCase() === slugBase)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A product in ${category} already uses the catalog link "${slugBase}". Choose a different name.`,
        });
      }

      const slug = firstFreeKey(slugBase, new Set(identities.map((row) => row.slug.trim().toLowerCase())), PELICAN_SLUG_MAX);
      if (!slug) {
        throw new TRPCError({ code: "CONFLICT", message: "Could not create a unique catalog link for this name." });
      }

      const requestedCode = input.pelicanCode?.trim() ?? "";
      const codeTaken = new Set(identities.map((row) => row.pelicanCode.trim().toLowerCase()));
      let pelicanCode = requestedCode;
      if (!pelicanCode) {
        const generated = firstFreeKey(slugBase, codeTaken, PELICAN_CODE_MAX);
        if (!generated) {
          throw new TRPCError({ code: "CONFLICT", message: "Could not create a unique SKU for this product." });
        }
        pelicanCode = generated;
      } else if (codeTaken.has(pelicanCode.toLowerCase())) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A product with SKU "${pelicanCode}" already exists. Use a different SKU or edit that item.`,
        });
      }

      const values = {
        pelicanCode,
        slug,
        name,
        description: input.description?.trim() ?? "",
        category,
        subCategory: input.subCategory,
        size: input.size?.trim() ? input.size.trim() : null,
        listPrice: decimalOrNull(input.listPrice),
        msrp: decimalOrNull(input.msrp),
        coverageSqFt: decimalOrNull(input.coverageSqFt),
        isActive: input.isActive,
        showInCatalog: input.showInCatalog,
        showInDesigner: input.showInDesigner,
      };

      let id = 0;
      try {
        const inserted = await db.insert(pelicanProducts).values(values);
        id = mysqlInsertId(inserted);
      } catch (error) {
        if (isDuplicateEntry(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A product with this name, catalog link, or SKU already exists. Edit that item instead of adding another.",
          });
        }
        throw error;
      }
      if (!Number.isInteger(id) || id <= 0) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pelican product was not created." });
      }

      const markupMap = await loadMarkupMap(db);
      const priced = withPricing(
        { listPrice: values.listPrice, yourCost: null, retailPrice: null, category },
        markupMap,
      );
      return {
        id,
        pelicanCode,
        slug,
        name,
        description: values.description,
        category,
        subCategory: values.subCategory,
        size: values.size,
        listPrice: values.listPrice,
        msrp: values.msrp,
        coverageSqFt: values.coverageSqFt,
        isActive: values.isActive,
        showInCatalog: values.showInCatalog,
        showInDesigner: values.showInDesigner,
        sellPrice: priced.sellPrice,
        markupBps: priced.markupBps,
      };
    }),
  updateProductDetails: adminProcedure
    .input(z.object({
      id: z.number().int().positive(),
      name: z.string().trim().min(1).max(255),
      description: z.string().trim().max(10000),
      imageUrl: z.string().trim().url().max(512).nullable(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pelican catalog is unavailable." });
      const [existing] = await db.select({ id: pelicanProducts.id }).from(pelicanProducts).where(eq(pelicanProducts.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Pelican product not found." });
      await db.update(pelicanProducts).set({
        name: input.name,
        description: input.description,
        imageUrl: input.imageUrl,
      }).where(eq(pelicanProducts.id, input.id));
      return { success: true } as const;
    }),
  /** Set the box coverage (sq ft per box) for tile/flooring products. */
  setCoverage: supplierProfileProcedure
    .input(
      z.object({
        id: z.number(),
        coverageSqFt: z.number().positive().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { success: false } as const;
      await requirePelicanVendor(db, ctx);
      await db
        .update(pelicanProducts)
        .set({ coverageSqFt: input.coverageSqFt != null ? String(input.coverageSqFt) : null })
        .where(eq(pelicanProducts.id, input.id));
      return { success: true } as const;
    }),
  /** Store only a supplier/fabricator-verified unsupported overhang limit. */
  setUnsupportedOverhangLimit: supplierProfileProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        unsupportedOverhangLimitIn: z.number().min(0).max(36).nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { success: false } as const;
      await requirePelicanVendor(db, ctx);
      if (input.unsupportedOverhangLimitIn != null) {
        const eighths = input.unsupportedOverhangLimitIn * 8;
        if (Math.abs(eighths - Math.round(eighths)) > 0.000001) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Structural overhang limits must use 1/8-inch increments." });
        }
      }
      await db
        .update(pelicanProducts)
        .set({ unsupportedOverhangLimitIn: input.unsupportedOverhangLimitIn == null ? null : String(input.unsupportedOverhangLimitIn) })
        .where(eq(pelicanProducts.id, input.id));
      return { success: true } as const;
    }),
  /**
   * Catalog images are displayed to shoppers. This separate URL is an
   * administrator-approved, repeatable material swatch for the 3D Designer.
   */
  setMaterialImage: supplierProfileProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        materialImageUrl: z.string().url().max(512).nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { success: false } as const;
      await requirePelicanVendor(db, ctx);
      await db
        .update(pelicanProducts)
        .set({ materialImageUrl: input.materialImageUrl?.trim() || null })
        .where(eq(pelicanProducts.id, input.id));
      return { success: true } as const;
    }),
});
