import { z } from "zod";
import { eq, and, or, like, inArray, isNotNull, sql, desc, asc, ne, type SQL } from "drizzle-orm";
import * as XLSX from "xlsx";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import { TRPCError } from "@trpc/server";
import { getDb, notInConflict, isCanonicalCabinetMaster, hasPositivePublishedCabinetPrice, getPricingSettings, updatePricingSettings, recalculateStoredTierPrices, getPlatformPricingSettings, updatePlatformPricingSettings } from "../db";
import {
  cabinets,
  cabinetAliases,
  affiliates,
  distributors,
  doorStyles,
  doorStyleRoomScenes,
  distributorSkus,
  cabinetDistributorEligibility,
  costChangeLog,
  doorStyleCorrections,
  distributorCabinetOverrides,
  designLayoutZoneSelections,
  codeAliases,
  cabinet3dPreviews,
  cartItems,
  orderItems,
  kitchenDesigns,
  productViews,
  skuMasterAliases,
  pantryBundles,
} from "../../drizzle/schema";
import { resolvePresentation, applyMarkup } from "../lib/presentation";
import { resolveStorefrontTier, visiblePricesForViewer } from "../../shared/pricingTier";
import { sellPriceForTier } from "@shared/margins";
import { invokeLLM } from "../_core/llm";
import sharp from "sharp";
import { generateImage } from "../_core/imageGeneration";
import { rankDoorMatches, type DoorCandidate, type DoorVisionResult } from "@shared/doorPhotoMatch";
import { parsePriceAuditQuery } from "@shared/priceAuditLookup";
import { filterStylesByAvailability } from "@shared/styleAvailability";
import { resolveAffiliateAccess } from "../lib/affiliateAccess";
import { canViewAffiliatePrivateCost } from "../lib/affiliatePrivateCost";
import { normalizeCode } from "../../shared/cabinetCodeMatch";
import { priceLadder } from "@shared/pricing";
import { resolveCanonicalCatalogSources } from "../lib/canonicalCatalogSources";

// ─── Trim / accessory detection ──────────────────────────────────────────────
// Mirrors the isAccessory() guard in design.ts so the Family page and the
// designer palette agree on what counts as trim vs. a placeable cabinet.
// Items that match are re-categorised to "accessory" before leaving the server
// so the client TYPE_FILTERS always route them to the Accessories & Trim tab.
function isTrimItem(r: {
  category: string | null;
  subCategory: string | null;
  description: string | null;
  placementType?: string | null;
}): boolean {
  const pt  = (r.placementType  || "").toLowerCase();
  const cat = (r.category       || "").toLowerCase();
  const sub = (r.subCategory    || "").toLowerCase();
  const desc = (r.description   || "").toLowerCase();
  if (pt.includes("accessory") || pt.includes("trim")) return true;
  if (cat === "accessory") return true;
  if (cat.includes("trim") || cat.includes("molding")) return true;
  if (cat.includes("filler") || cat.includes("panel")) return true;
  if (cat === "misc") return true;
  if (sub.includes("moulding") || sub.includes("molding") || sub.includes("crown")) return true;
  if (sub.includes("filler") || sub.includes("panel") || sub.includes("leg") || sub.includes("scribe")) return true;
  if (sub.includes("rail") || sub.includes("rope") || sub.includes("cove") || sub.includes("skin")) return true;
  const trimDescPattern = /\b(molding|moulding|scribe|light rail|crown|cove|rope|filler|end panel|skin panel|decorative leg|decorative panel|island panel|bead board|fluted filler|base filler|angle molding|inside corner molding|refrigerator end panel|shoe moulding|shoe molding|flat base molding|square decorative leg|outside corner molding|touch.?up|sample door|spray paint)\b/;
  if (trimDescPattern.test(desc)) return true;
  return false;
}

// ─── Supplier-identity scrubbing ───────────────────────────────────────────────
// Cabinet Dealz never exposes the underlying supplier. These helpers strip any
// supplier-identifying columns from rows before they leave a public procedure,
// so the door-style-first UI can present purely by style.
function scrubCabinet<T extends Record<string, unknown>>(row: T): Omit<T, "descriptionSource"> {
  if (!row) return row;
  const { descriptionSource: _drop, ...rest } = row as T & { descriptionSource?: unknown };
  return rest;
}
function scrubDoorStyle<T extends Record<string, unknown>>(
  row: T,
): Omit<T, "distributorName" | "warehouseZip" | "shippingRate" | "flatFreightFeeCents"> {
  if (!row) return row;
  const {
    distributorName: _dropDistributor,
    warehouseZip: _dropWarehouseZip,
    shippingRate: _dropShippingRate,
    flatFreightFeeCents: _dropFlatFreightFee,
    ...rest
  } = row as T & {
    distributorName?: unknown;
    warehouseZip?: unknown;
    shippingRate?: unknown;
    flatFreightFeeCents?: unknown;
  };
  return rest;
}

// Calendar-day key in UTC (YYYY-MM-DD) used to label the daily audit rotation.
function dayKeyUTC(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

// ─── Distributors ─────────────────────────────────────────────────────────────

export const distributorsRouter = router({
  list: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select()
      .from(distributors)
      .where(eq(distributors.isActive, true));
    // Resolve the customer-facing label per line; never leak hidden supplier names.
    return rows.map((d) => {
      const p = resolvePresentation(d);
      return {
        id: d.id,
        code: d.code,
        name: p.displayName,
        initials: p.displayInitials,
        displayMode: p.displayMode,
        seriesName: d.seriesName,
        leadTimeDays: d.leadTimeDays,
        isActive: d.isActive,
      };
    });
  }),
});

// ─── Door Styles ──────────────────────────────────────────────────────────────

// A style is only shown publicly if it has at least one *orderable* cabinet:
// a published + available SKU whose cabinet is active, shown in the designer,
// and not held in admin "conflict". This prevents empty lines/styles (e.g. a
// style whose SKUs were never imported) from appearing in the storefront or the
// Design Tool picker. Empty styles remain visible in the admin back office.
// Returns the SET of styleIds that qualify; callers intersect their result with it.
async function availableStyleIds(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>
): Promise<Set<number>> {
  const rows = await db
    .selectDistinct({ styleId: distributorSkus.styleId })
    .from(distributorSkus)
    .innerJoin(cabinets, eq(cabinets.id, distributorSkus.cabinetId))
    .where(
      and(
        eq(distributorSkus.isPublished, true),
        eq(distributorSkus.isAvailable, true),
        eq(cabinets.isActive, true),
        eq(cabinets.showInDesigner, true),
        notInConflict()
      )
    );
  return new Set(rows.map((r) => r.styleId));
}

export const doorStylesRouter = router({
  list: publicProcedure
    .input(z.object({ distributorId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      // Explicit projection: include distributorId (needed for client-side warehouse
      // lock filtering in the design tool) but NEVER include distributorName (supplier
      // identity is private). Using an explicit select instead of scrubDoorStyle so
      // the TypeScript return type carries distributorId correctly.
      const projection = {
        id: doorStyles.id,
        distributorId: doorStyles.distributorId,
        styleCode: doorStyles.styleCode,
        ourName: doorStyles.ourName,
        aliasName: doorStyles.aliasName,
        doorStyle: doorStyles.doorStyle,
        woodSpecies: doorStyles.woodSpecies,
        finish: doorStyles.finish,
        color: doorStyles.color,
        boxConstruction: doorStyles.boxConstruction,
        drawerConstruction: doorStyles.drawerConstruction,
        hardware: doorStyles.hardware,
        frameSize: doorStyles.frameSize,
        overlayType: doorStyles.overlayType,
        doorPanelType: doorStyles.doorPanelType,
        doorSampleImageUrl: doorStyles.doorSampleImageUrl,
        drawerSampleImageUrl: doorStyles.drawerSampleImageUrl,
        doorSampleVerified: doorStyles.doorSampleVerified,
        roomSceneImageUrl: doorStyles.roomSceneImageUrl,
        thumbnailImageUrl: doorStyles.thumbnailImageUrl,
        isFeatured: doorStyles.isFeatured,
        featuredRank: doorStyles.featuredRank,
        featuredLabel: doorStyles.featuredLabel,
        isBuilderGrade: doorStyles.isBuilderGrade,
        isActive: doorStyles.isActive,
        createdAt: doorStyles.createdAt,
        railWidth: doorStyles.railWidth,
        stileWidth: doorStyles.stileWidth,
        centerRailWidth: doorStyles.centerRailWidth,
        profileNotes: doorStyles.profileNotes,
        profileDescription: doorStyles.profileDescription,
        cornerSwatchImageUrl: doorStyles.cornerSwatchImageUrl,
      };
      const available = await availableStyleIds(db);
      const rows = input?.distributorId
        ? await db
            .select(projection)
            .from(doorStyles)
            .where(
              and(
                eq(doorStyles.distributorId, input.distributorId),
                eq(doorStyles.isActive, true)
              )
            )
        : await db.select(projection).from(doorStyles).where(eq(doorStyles.isActive, true));
      // Hide active-but-empty styles from every public surface (storefront +
      // Design Tool picker). Admin back-office queries do not use this router.
      return filterStylesByAvailability(rows, available);
    }),

  // Manufacturer specification references are intentionally separate from the
  // sellable style list. They educate shoppers about documented future or
  // price-pending finishes without making them selectable in Catalog, cart, or
  // the Designer before a positive published supplier source exists.
  specificationReferences: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({
        id: doorStyles.id,
        distributorId: doorStyles.distributorId,
        styleCode: doorStyles.styleCode,
        ourName: doorStyles.ourName,
        aliasName: doorStyles.aliasName,
        doorStyle: doorStyles.doorStyle,
        woodSpecies: doorStyles.woodSpecies,
        finish: doorStyles.finish,
        color: doorStyles.color,
        doorSampleImageUrl: doorStyles.doorSampleImageUrl,
        roomSceneImageUrl: doorStyles.roomSceneImageUrl,
        thumbnailImageUrl: doorStyles.thumbnailImageUrl,
        railWidth: doorStyles.railWidth,
        stileWidth: doorStyles.stileWidth,
        centerRailWidth: doorStyles.centerRailWidth,
        profileNotes: doorStyles.profileNotes,
        profileDescription: doorStyles.profileDescription,
        specificationStatus: doorStyles.specificationStatus,
        sourceSpecification: doorStyles.sourceSpecification,
      })
      .from(doorStyles)
      .where(and(
        ne(doorStyles.specificationStatus, "purchasable"),
        isNotNull(doorStyles.sourceSpecification),
      ))
      .orderBy(asc(doorStyles.doorStyle), asc(doorStyles.ourName));
  }),

  byId: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select()
        .from(doorStyles)
        .where(eq(doorStyles.id, input.id))
        .limit(1);
      return rows[0] ? scrubDoorStyle(rows[0]) : null;
    }),

  byCode: publicProcedure
    .input(z.object({ styleCode: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      // Style codes are not guaranteed unique across supply lines; return the
      // first active match (we collapse duplicates to one family in the UI).
      const rows = await db
        .select()
        .from(doorStyles)
        .where(
          and(
            eq(doorStyles.styleCode, input.styleCode),
            eq(doorStyles.isActive, true)
          )
        )
        .limit(1);
      return rows[0] ? scrubDoorStyle(rows[0]) : null;
    }),

  // Color variations within the SAME door profile (e.g. all Slim Shaker colors).
  // Powers the in-place finish picker on the Family page so a shopper can switch
  // the color without leaving the family. Returns active styles sharing this
  // style's doorStyle profile, the current one first, deduped by display name.
  siblings: publicProcedure
    .input(z.object({ styleCode: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const current = await db
        .select()
        .from(doorStyles)
        .where(and(eq(doorStyles.styleCode, input.styleCode), eq(doorStyles.isActive, true)))
        .limit(1);
      const cur = current[0];
      if (!cur || !cur.doorStyle) return cur ? [scrubDoorStyle(cur)] : [];
      const rows = await db
        .select()
        .from(doorStyles)
        .where(and(eq(doorStyles.doorStyle, cur.doorStyle), eq(doorStyles.isActive, true)))
        .orderBy(asc(doorStyles.ourName));
      // Dedupe by display name; keep the current style at the front.
      const seen = new Set<string>();
      const out: typeof rows = [];
      const keyOf = (r: (typeof rows)[number]) =>
        (r.ourName || r.styleCode || String(r.id)).toLowerCase();
      out.push(cur);
      seen.add(keyOf(cur));
      for (const r of rows) {
        const k = keyOf(r);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(r);
      }
      return out.map(scrubDoorStyle);
    }),

  // ── Featured door styles ────────────────────────────────────────────────────
  // Public scenes are centrally curated per Door Style and shared by every
  // storefront. Supplier/source information is deliberately never selected here.
  featured: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select()
      .from(doorStyles)
      .where(and(eq(doorStyles.isActive, true), eq(doorStyles.isFeatured, true)))
      .orderBy(asc(doorStyles.featuredRank), asc(doorStyles.ourName));
    const ids = rows.map((row) => row.id);
    const scenes = ids.length === 0 ? [] : await db
      .select({ id: doorStyleRoomScenes.id, styleId: doorStyleRoomScenes.styleId, imageUrl: doorStyleRoomScenes.imageUrl, sortOrder: doorStyleRoomScenes.sortOrder })
      .from(doorStyleRoomScenes)
      .where(and(inArray(doorStyleRoomScenes.styleId, ids), eq(doorStyleRoomScenes.isActive, true), eq(doorStyleRoomScenes.isVerified, true)))
      .orderBy(asc(doorStyleRoomScenes.sortOrder), asc(doorStyleRoomScenes.id));
    return rows.map((row) => ({
      ...scrubDoorStyle(row),
      roomScenes: scenes.filter((scene) => scene.styleId === row.id).slice(0, 6),
    }));
  }),

  // Admin: every style (active + inactive) with its featured flag/rank, for the manager UI.
  listForAdmin: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    // Join distributors so the admin can see the REAL brand name (brandName) alongside
    // the neutral white-label name. brandName is the actual supplier (e.g. "US Cabinet Depot");
    // name is the neutral internal label (e.g. "Line A"). Admin always sees the real name.
    const rows = await db
      .select({
        id: doorStyles.id,
        distributorId: doorStyles.distributorId,
        styleCode: doorStyles.styleCode,
        ourName: doorStyles.ourName,
        aliasName: doorStyles.aliasName,
        featuredLabel: doorStyles.featuredLabel,
        distributorName: doorStyles.distributorName,
        doorStyle: doorStyles.doorStyle,
        woodSpecies: doorStyles.woodSpecies,
        finish: doorStyles.finish,
        color: doorStyles.color,
        boxConstruction: doorStyles.boxConstruction,
        drawerConstruction: doorStyles.drawerConstruction,
        hardware: doorStyles.hardware,
        frameSize: doorStyles.frameSize,
        overlayType: doorStyles.overlayType,
        doorPanelType: doorStyles.doorPanelType,
        warehouseZip: doorStyles.warehouseZip,
        warehouseZips: doorStyles.warehouseZips,
        shippingRate: doorStyles.shippingRate,
        flatFreightFeeCents: doorStyles.flatFreightFeeCents,
        doorSampleImageUrl: doorStyles.doorSampleImageUrl,
        drawerSampleImageUrl: doorStyles.drawerSampleImageUrl,
        doorSampleVerified: doorStyles.doorSampleVerified,
        roomSceneImageUrl: doorStyles.roomSceneImageUrl,
        thumbnailImageUrl: doorStyles.thumbnailImageUrl,
        isFeatured: doorStyles.isFeatured,
        featuredRank: doorStyles.featuredRank,
        railWidth: doorStyles.railWidth,
        stileWidth: doorStyles.stileWidth,
        centerRailWidth: doorStyles.centerRailWidth,
        profileNotes: doorStyles.profileNotes,
        profileDescription: doorStyles.profileDescription,
        cornerSwatchImageUrl: doorStyles.cornerSwatchImageUrl,
        isBuilderGrade: doorStyles.isBuilderGrade,
        isActive: doorStyles.isActive,
        createdAt: doorStyles.createdAt,
        // Real supplier name — admin-only, never exposed to public
        supplierBrandName: distributors.brandName,
        supplierName: distributors.name,
      })
      .from(doorStyles)
      .leftJoin(distributors, eq(doorStyles.distributorId, distributors.id))
      .orderBy(asc(doorStyles.ourName));
    const ids = rows.map((row) => row.id);
    const scenes = ids.length === 0 ? [] : await db.select().from(doorStyleRoomScenes)
      .where(inArray(doorStyleRoomScenes.styleId, ids))
      .orderBy(asc(doorStyleRoomScenes.sortOrder), asc(doorStyleRoomScenes.id));
    return rows.map((row) => ({ ...row, roomScenes: scenes.filter((scene) => scene.styleId === row.id) }));
  }),

  // Admin: toggle a style into the featured homepage set. Each style has its own
  // independently ordered library of up to six matching verified scenes.
  setFeatured: adminProcedure
    .input(z.object({ id: z.number(), featured: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (input.featured) {
        const target = await db
          .select({ id: doorStyles.id, isFeatured: doorStyles.isFeatured })
          .from(doorStyles)
          .where(eq(doorStyles.id, input.id))
          .limit(1);
        const style = target[0];
        if (!style) throw new TRPCError({ code: "NOT_FOUND", message: "Door style not found." });
        const [{ cnt }] = await db.select({ cnt: sql<number>`count(*)` }).from(doorStyleRoomScenes)
          .where(and(eq(doorStyleRoomScenes.styleId, input.id), eq(doorStyleRoomScenes.isActive, true), eq(doorStyleRoomScenes.isVerified, true)));
        if (Number(cnt) === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Add a style-matched room scene before adding this style to the homepage set.",
          });
        }
        // New featured items go to the end of the order by default.
        const [{ maxRank }] = await db
          .select({ maxRank: sql<number>`coalesce(max(featuredRank), 0)` })
          .from(doorStyles)
          .where(eq(doorStyles.isFeatured, true));
        await db
          .update(doorStyles)
          .set({ isFeatured: true, featuredRank: Number(maxRank) + 10 })
          .where(eq(doorStyles.id, input.id));
      } else {
        await db
          .update(doorStyles)
          .set({ isFeatured: false })
          .where(eq(doorStyles.id, input.id));
      }
      return { ok: true };
    }),

  // Admin: set (or clear) the white-label display name for a featured style.
  // Pass null / empty string to revert to the default ourName.
  setFeaturedLabel: adminProcedure
    .input(z.object({ id: z.number(), label: z.string().max(128).nullable() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const label = input.label?.trim() || null;
      await db
        .update(doorStyles)
        .set({ featuredLabel: label })
        .where(eq(doorStyles.id, input.id));
      return { ok: true };
    }),

  // Admin: quick-edit key fields of a door style (from the featured list editor).
  adminUpdateDoorStyle: adminProcedure
    .input(
      z.object({
        id: z.number(),
        featuredLabel: z.string().max(128).nullable().optional(),
        aliasName: z.string().max(128).nullable().optional(),
        ourName: z.string().min(1).max(128).optional(),
        doorStyle: z.string().max(64).nullable().optional(),
        color: z.string().max(64).nullable().optional(),
        finish: z.string().max(128).nullable().optional(),
        woodSpecies: z.string().max(64).nullable().optional(),
        warehouseZip: z.string().regex(/^\d{5}$/, "Shipping origin ZIP must be exactly 5 digits").nullable().optional(),
        warehouseZips: z.array(z.string().regex(/^\d{5}$/, "Each shipping origin ZIP must be exactly 5 digits")).max(20).nullable().optional(),
        flatFreightFeeCents: z.number().int().min(0).max(10_000_000).nullable().optional(),
        doorSampleImageUrl: z.string().max(512).nullable().optional(),
        drawerSampleImageUrl: z.string().max(512).nullable().optional(),
        roomSceneImageUrl: z.string().max(512).nullable().optional(),
        thumbnailImageUrl: z.string().max(512).nullable().optional(),
        railWidth: z.number().min(0).max(99).nullable().optional(),
        stileWidth: z.number().min(0).max(99).nullable().optional(),
        centerRailWidth: z.number().min(0).max(99).nullable().optional(),
        profileNotes: z.string().max(256).nullable().optional(),
        profileDescription: z.string().nullable().optional(),
        cornerSwatchImageUrl: z.string().max(512).nullable().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...fields } = input;
      const patch: Record<string, unknown> = {};
      if (fields.featuredLabel !== undefined) patch.featuredLabel = fields.featuredLabel?.trim() || null;
      if (fields.aliasName !== undefined) patch.aliasName = fields.aliasName?.trim() || null;
      if (fields.ourName !== undefined) patch.ourName = fields.ourName.trim();
      if (fields.doorStyle !== undefined) patch.doorStyle = fields.doorStyle?.trim() || null;
      if (fields.color !== undefined) patch.color = fields.color?.trim() || null;
      if (fields.finish !== undefined) patch.finish = fields.finish?.trim() || null;
      if (fields.woodSpecies !== undefined) patch.woodSpecies = fields.woodSpecies?.trim() || null;
      if (fields.warehouseZip !== undefined) patch.warehouseZip = fields.warehouseZip?.trim() || null;
      if (fields.warehouseZips !== undefined) {
        const normalizedOrigins = Array.from(new Set((fields.warehouseZips ?? []).map((zip) => zip.trim()).filter(Boolean)));
        patch.warehouseZips = normalizedOrigins.length > 0 ? normalizedOrigins : null;
        // Retain a primary legacy origin for existing integrations and saved data.
        patch.warehouseZip = normalizedOrigins[0] ?? null;
      }
      if (fields.flatFreightFeeCents !== undefined) patch.flatFreightFeeCents = fields.flatFreightFeeCents;
      if (fields.doorSampleImageUrl !== undefined) patch.doorSampleImageUrl = fields.doorSampleImageUrl?.trim() || null;
      if (fields.drawerSampleImageUrl !== undefined) patch.drawerSampleImageUrl = fields.drawerSampleImageUrl?.trim() || null;
      if (fields.roomSceneImageUrl !== undefined) patch.roomSceneImageUrl = fields.roomSceneImageUrl?.trim() || null;
      if (fields.thumbnailImageUrl !== undefined) patch.thumbnailImageUrl = fields.thumbnailImageUrl?.trim() || null;
      if (fields.railWidth !== undefined) patch.railWidth = fields.railWidth ?? null;
      if (fields.stileWidth !== undefined) patch.stileWidth = fields.stileWidth ?? null;
      if (fields.centerRailWidth !== undefined) patch.centerRailWidth = fields.centerRailWidth ?? null;
      if (fields.profileNotes !== undefined) patch.profileNotes = fields.profileNotes?.trim() || null;
      if (fields.profileDescription !== undefined) patch.profileDescription = fields.profileDescription?.trim() || null;
      if (fields.cornerSwatchImageUrl !== undefined) patch.cornerSwatchImageUrl = fields.cornerSwatchImageUrl?.trim() || null;
      if (fields.isActive !== undefined) patch.isActive = fields.isActive;
      if (Object.keys(patch).length === 0) return { ok: true };
      const needsCurrentStyle =
        (fields.roomSceneImageUrl !== undefined && !fields.roomSceneImageUrl?.trim()) ||
        fields.isActive === false;
      if (needsCurrentStyle) {
        const current = await db
          .select({ isFeatured: doorStyles.isFeatured })
          .from(doorStyles)
          .where(eq(doorStyles.id, id))
          .limit(1);
        if (fields.roomSceneImageUrl !== undefined && !fields.roomSceneImageUrl?.trim() && current[0]?.isFeatured) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Remove this style from the curated homepage scenes before clearing its room scene.",
          });
        }
        if (fields.isActive === false && current[0]?.isFeatured) patch.isFeatured = false;
      }
      await db.update(doorStyles).set(patch).where(eq(doorStyles.id, id));
      return { ok: true };
    }),

  // Admin: add one scene to a Door Style's shared library. The cap is per style,
  // not a global storefront cap.
  addRoomScene: adminProcedure
    .input(z.object({ styleId: z.number(), imageUrl: z.string().min(1).max(512), fileKey: z.string().max(512).nullable().optional(), sourceNote: z.string().max(512).nullable().optional(), sourceDistributorId: z.number().nullable().optional(), isVerified: z.boolean().default(true) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [{ cnt }] = await db.select({ cnt: sql<number>`count(*)` }).from(doorStyleRoomScenes).where(eq(doorStyleRoomScenes.styleId, input.styleId));
      if (Number(cnt) >= 6) throw new TRPCError({ code: "BAD_REQUEST", message: "Each Door Style can have up to 6 room scenes." });
      const [{ maxRank }] = await db.select({ maxRank: sql<number>`coalesce(max(sortOrder), 0)` }).from(doorStyleRoomScenes).where(eq(doorStyleRoomScenes.styleId, input.styleId));
      const result = await db.insert(doorStyleRoomScenes).values({ ...input, imageUrl: input.imageUrl.trim(), fileKey: input.fileKey?.trim() || null, sourceNote: input.sourceNote?.trim() || null, sortOrder: Number(maxRank) + 10 });
      return { ok: true, id: Number((result as { insertId?: number }).insertId) };
    }),

  updateRoomScene: adminProcedure
    .input(z.object({ id: z.number(), imageUrl: z.string().min(1).max(512).optional(), fileKey: z.string().max(512).nullable().optional(), sourceNote: z.string().max(512).nullable().optional(), sourceDistributorId: z.number().nullable().optional(), isVerified: z.boolean().optional(), isActive: z.boolean().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...fields } = input;
      await db.update(doorStyleRoomScenes).set({ ...fields, imageUrl: fields.imageUrl?.trim(), fileKey: fields.fileKey?.trim() || null, sourceNote: fields.sourceNote?.trim() || null }).where(eq(doorStyleRoomScenes.id, id));
      return { ok: true };
    }),

  deleteRoomScene: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(doorStyleRoomScenes).where(eq(doorStyleRoomScenes.id, input.id));
    return { ok: true };
  }),

  reorderRoomScenes: adminProcedure.input(z.object({ styleId: z.number(), orderedIds: z.array(z.number()).min(1).max(6) })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const owned = await db.select({ id: doorStyleRoomScenes.id }).from(doorStyleRoomScenes).where(eq(doorStyleRoomScenes.styleId, input.styleId));
    if (owned.length !== input.orderedIds.length || new Set(input.orderedIds).size !== input.orderedIds.length || !input.orderedIds.every((id) => owned.some((scene) => scene.id === id))) throw new TRPCError({ code: "BAD_REQUEST", message: "Room-scene order must contain every scene for this Door Style exactly once." });
    await Promise.all(input.orderedIds.map((id, index) => db.update(doorStyleRoomScenes).set({ sortOrder: (index + 1) * 10 }).where(eq(doorStyleRoomScenes.id, id))));
    return { ok: true };
  }),

  // Admin: persist a new order for the curated homepage scenes (array of ids, in order).
  reorderFeatured: adminProcedure
    .input(z.object({ orderedIds: z.array(z.number()) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      let rank = 10;
      for (const id of input.orderedIds) {
        await db.update(doorStyles).set({ featuredRank: rank }).where(eq(doorStyles.id, id));
        rank += 10;
      }
      return { ok: true };
    }),

  // ── Door sample-photo corrections (two-way photo tool) ──────────────────────
  // Submit a real photo to correct a door style's on-file sample. Admins apply
  // it to the live sample immediately (logged as approved + verified). Everyone
  // else creates a pending correction for an admin to review. Reuses S3.
  submitCorrection: protectedProcedure
    .input(
      z.object({
        styleId: z.number(),
        // base64 data URL, e.g. "data:image/jpeg;base64,...."
        imageDataUrl: z
          .string()
          .min(16)
          .refine((s) => s.startsWith("data:image/"), "Must be a data:image/* URL"),
        note: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const styleRows = await db
        .select()
        .from(doorStyles)
        .where(eq(doorStyles.id, input.styleId))
        .limit(1);
      const style = styleRows[0];
      if (!style) throw new TRPCError({ code: "NOT_FOUND", message: "Door style not found." });

      // Decode + upload to S3.
      const m = input.imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!m) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid image data." });
      const [, mime, b64] = m;
      const ext = mime.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
      const buf = Buffer.from(b64, "base64");
      if (buf.length > 10 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Image too large (max 10MB)." });
      }
      const { url, key } = await storagePut(
        `door-corrections/s${input.styleId}-u${ctx.user.id}.${ext}`,
        buf,
        mime,
      );

      const isAdmin = ctx.user.role === "admin";
      const previousImageUrl = style.doorSampleImageUrl ?? null;

      const [inserted] = await db.insert(doorStyleCorrections).values({
        styleId: input.styleId,
        imageUrl: url,
        fileKey: key,
        previousImageUrl,
        note: input.note ?? null,
        status: isAdmin ? "approved" : "pending",
        submittedBy: ctx.user.id,
        submittedByName: ctx.user.name ?? null,
        reviewedBy: isAdmin ? ctx.user.id : null,
        reviewedAt: isAdmin ? new Date() : null,
      });

      // Admin submissions update the live sample immediately + mark verified.
      // Also clear any stale room-scene override so the room picture refreshes to
      // the generated scene that matches the corrected door's family + finish.
      if (isAdmin) {
        await db
          .update(doorStyles)
          .set({ doorSampleImageUrl: url, doorSampleVerified: true, roomSceneImageUrl: null })
          .where(eq(doorStyles.id, input.styleId));
      }

      return {
        ok: true,
        applied: isAdmin,
        status: isAdmin ? ("approved" as const) : ("pending" as const),
        correctionId: (inserted as { insertId?: number }).insertId ?? null,
        imageUrl: url,
      };
    }),

  // Admin: list corrections, optionally filtered by status (default pending).
  listCorrections: adminProcedure
    .input(z.object({ status: z.enum(["pending", "approved", "rejected", "all"]).default("pending") }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const status = input?.status ?? "pending";
      const base = db
        .select({
          id: doorStyleCorrections.id,
          styleId: doorStyleCorrections.styleId,
          styleName: doorStyles.ourName,
          styleCode: doorStyles.styleCode,
          imageUrl: doorStyleCorrections.imageUrl,
          previousImageUrl: doorStyleCorrections.previousImageUrl,
          note: doorStyleCorrections.note,
          status: doorStyleCorrections.status,
          submittedBy: doorStyleCorrections.submittedBy,
          submittedByName: doorStyleCorrections.submittedByName,
          reviewedBy: doorStyleCorrections.reviewedBy,
          reviewedAt: doorStyleCorrections.reviewedAt,
          createdAt: doorStyleCorrections.createdAt,
        })
        .from(doorStyleCorrections)
        .leftJoin(doorStyles, eq(doorStyles.id, doorStyleCorrections.styleId))
        .orderBy(desc(doorStyleCorrections.createdAt))
        .limit(200);
      const rows =
        status === "all"
          ? await base
          : await db
              .select({
                id: doorStyleCorrections.id,
                styleId: doorStyleCorrections.styleId,
                styleName: doorStyles.ourName,
                styleCode: doorStyles.styleCode,
                imageUrl: doorStyleCorrections.imageUrl,
                previousImageUrl: doorStyleCorrections.previousImageUrl,
                note: doorStyleCorrections.note,
                status: doorStyleCorrections.status,
                submittedBy: doorStyleCorrections.submittedBy,
                submittedByName: doorStyleCorrections.submittedByName,
                reviewedBy: doorStyleCorrections.reviewedBy,
                reviewedAt: doorStyleCorrections.reviewedAt,
                createdAt: doorStyleCorrections.createdAt,
              })
              .from(doorStyleCorrections)
              .leftJoin(doorStyles, eq(doorStyles.id, doorStyleCorrections.styleId))
              .where(eq(doorStyleCorrections.status, status))
              .orderBy(desc(doorStyleCorrections.createdAt))
              .limit(200);
      return rows;
    }),

  // Admin: approve (apply to live sample + verify) or reject a pending correction.
  reviewCorrection: adminProcedure
    .input(z.object({ id: z.number(), approve: z.boolean(), reviewNote: z.string().max(500).optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db
        .select()
        .from(doorStyleCorrections)
        .where(eq(doorStyleCorrections.id, input.id))
        .limit(1);
      const corr = rows[0];
      if (!corr) throw new TRPCError({ code: "NOT_FOUND" });
      if (corr.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This correction was already reviewed." });
      }
      await db
        .update(doorStyleCorrections)
        .set({
          status: input.approve ? "approved" : "rejected",
          reviewedBy: ctx.user.id,
          reviewedAt: new Date(),
          reviewNote: input.reviewNote ?? null,
        })
        .where(eq(doorStyleCorrections.id, input.id));
      if (input.approve) {
        // Apply the corrected door image and clear any stale room-scene override so
        // the room picture refreshes to the generated scene matching the door.
        await db
          .update(doorStyles)
          .set({ doorSampleImageUrl: corr.imageUrl, doorSampleVerified: true, roomSceneImageUrl: null })
          .where(eq(doorStyles.id, corr.styleId));
      }
      return { ok: true, approved: input.approve };
    }),

  // Public: upload a real-world door photo and let the vision model rank the
  // closest active door styles in the live catalog.
  matchFromPhoto: publicProcedure
    .input(
      z.object({
        imageDataUrl: z
          .string()
          .min(16)
          .refine((s) => s.startsWith("data:image/"), "Must be a data:image/* URL"),
        filename: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const candidates = await db
        .select({
          id: doorStyles.id,
          styleCode: doorStyles.styleCode,
          ourName: doorStyles.ourName,
          doorStyle: doorStyles.doorStyle,
          color: doorStyles.color,
          finish: doorStyles.finish,
          woodSpecies: doorStyles.woodSpecies,
          doorSampleImageUrl: doorStyles.doorSampleImageUrl,
          thumbnailImageUrl: doorStyles.thumbnailImageUrl,
          roomSceneImageUrl: doorStyles.roomSceneImageUrl,
        })
        .from(doorStyles)
        .where(eq(doorStyles.isActive, true))
        .orderBy(asc(doorStyles.ourName));

      if (candidates.length === 0) {
        return { storedUrl: null, matches: [] };
      }

      let storedUrl: string | null = null;
      try {
        const m = input.imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (m) {
          const [, mime, b64] = m;
          const ext = mime.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
          const buf = Buffer.from(b64, "base64");
          if (buf.length <= 10 * 1024 * 1024) {
            const safeName = (input.filename || `door-photo-${Date.now()}.${ext}`).replace(/[^a-zA-Z0-9._-]/g, "_");
            const stored = await storagePut(`door-match-uploads/${safeName}`, buf, mime);
            storedUrl = stored.url;
          }
        }
      } catch {
        // Keep matching available even if storage is temporarily unavailable.
      }

      const catalogContext = candidates
        .map(
          (style) =>
            `- ${style.id}: ${style.ourName || style.styleCode} | code=${style.styleCode} | profile=${style.doorStyle || "unknown"} | color=${style.color || "unknown"} | finish=${style.finish || "unknown"} | wood=${style.woodSpecies || "unknown"}`,
        )
        .join("\n");

      try {
        const result = await invokeLLM({
          messages: [
            {
              role: "system",
              content:
                "You are a cabinet door-style matcher. Compare the uploaded door photo to the live door-style catalog. Return exactly the top 3 style IDs from the provided catalog, ranked best to worst. Use only IDs from the catalog. Confidence must be between 0 and 1. Keep reasoning short and visual.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    "Match this real-world door photo against the active door-style catalog below. Rank the best 3 matches using only the listed style IDs.\n\nCatalog:\n" + catalogContext,
                },
                { type: "image_url", image_url: { url: input.imageDataUrl } },
              ],
            },
          ],
          responseFormat: {
            type: "json_schema",
            json_schema: {
              name: "door_photo_match",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  matches: {
                    type: "array",
                    minItems: 0,
                    maxItems: 3,
                    items: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        styleId: { type: "integer" },
                        confidence: { type: "number" },
                        reasoning: { type: "string" },
                      },
                      required: ["styleId", "confidence", "reasoning"],
                    },
                  },
                },
                required: ["matches"],
              },
            },
          },
          maxTokens: 1200,
        });

        const raw = result.choices?.[0]?.message?.content;
        const text = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((p: any) => (p.type === "text" ? p.text : "")).join("") : "";
        const parsed = JSON.parse(text || "{}") as DoorVisionResult;
        return {
          storedUrl,
          matches: rankDoorMatches(candidates as DoorCandidate[], parsed),
        };
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not compare that photo to the door-style catalog. Try a clearer, straight-on photo.",
        });
      }
    }),

  // ── Family catalog (the door-style-FAMILY-first shopping view) ──────────────

  // ── Family catalog (the door-style-FAMILY-first shopping view) ──────────────
  // Given one door style, return EVERY cabinet available in that style (base,
  // wall, tall, vanity, accessory — all together) collapsed to one priced row
  // per cabinet. This powers the /family/:styleCode page so a shopper picks a
  // family first and then sees all cabinet types in that one look.
  familyCatalog: publicProcedure
    .input(z.object({ styleId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { style: null, items: [] };

      // Price entitlement: guests/homeowners see retail; approved pros see the
      // tier the owner assigned them; admin sees all. Retail is normally cost ×
      // homeowner markup, but a distributor may explicitly designate its verified
      // source list as the customer retail price. Trade tiers remain cost-based.
      const viewerTier = resolveStorefrontTier(ctx.user);
      const isAdmin = ctx.user?.role === "admin";
      const ps = await getPricingSettings();

      const styleRows = await db
        .select()
        .from(doorStyles)
        .where(eq(doorStyles.id, input.styleId))
        .limit(1);
      const style = styleRows[0];
      if (!style) return { style: null, items: [] };

      const rows = await db
        .select({
          sourceMasterCode: cabinets.masterCode,
          listPrice: distributorSkus.listPrice,
          adjustedListPrice: distributorSkus.adjustedListPrice,
          wholesalePrice: distributorSkus.wholesalePrice,
          contractorPrice: distributorSkus.contractorPrice,
          homeownerPrice: distributorSkus.homeownerPrice,
          yourCost: distributorSkus.yourCost,
          platformSku: distributorSkus.platformSku,
          skuImageUrl: distributorSkus.imageUrl,
          distributorId: distributorSkus.distributorId,
          retailPriceBasis: distributors.retailPriceBasis,
        })
        .from(distributorSkus)
        .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .innerJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
        .where(
          and(
            eq(distributorSkus.styleId, input.styleId),
            eq(distributorSkus.isAvailable, true),
            eq(distributorSkus.isPublished, true),
            sql`(COALESCE(${distributorSkus.listPrice}, 0) > 0 OR COALESCE(${distributorSkus.yourCost}, 0) > 0)`,
            ne(cabinets.conflictStatus, "conflict"),
          )
        );

      // A supplier row may be attached to a retired punctuation/format alias
      // such as B12 while the canonical product is B-12. Keep the row's
      // style/finish/SKU/price attributes intact, but project it onto the
      // canonical master for catalog identity, dimensions, and line art.
      const [aliases, masters] = await Promise.all([
        db
          .select({ aliasCode: skuMasterAliases.aliasCode, masterCode: skuMasterAliases.masterCode })
          .from(skuMasterAliases)
          .where(eq(skuMasterAliases.conflictStatus, "ok")),
        db
          .select({
            cabinetId: cabinets.id,
            masterCode: cabinets.masterCode,
            description: cabinets.description,
            category: cabinets.category,
            subCategory: cabinets.subCategory,
            width: cabinets.width,
            height: cabinets.height,
            depth: cabinets.depth,
            numberOfDoors: cabinets.numberOfDoors,
            numberOfDrawers: cabinets.numberOfDrawers,
            graphicType: cabinets.graphicType,
            catalogImageUrl: cabinets.catalogImageUrl,
          })
          .from(cabinets)
          .where(and(
            eq(cabinets.isActive, true),
            eq(cabinets.showInCatalog, true),
            ne(cabinets.conflictStatus, "conflict"),
          )),
      ]);

      const canonicalRows = resolveCanonicalCatalogSources(rows, aliases, masters).map(({ source, master }) => ({
        ...source,
        ...master,
      }));

      // Collapse to one row per cabinet (a cabinet may be carried by multiple
      // supply lines in the same style). Prefer the lowest contractor price.
      const byCabinet = new Map<number, (typeof canonicalRows)[number]>();
      for (const r of canonicalRows) {
        const existing = byCabinet.get(r.cabinetId);
        if (!existing) {
          byCabinet.set(r.cabinetId, r);
          continue;
        }
        const a = Number(r.contractorPrice ?? r.wholesalePrice ?? Infinity);
        const b = Number(
          existing.contractorPrice ?? existing.wholesalePrice ?? Infinity
        );
        if (a < b) byCabinet.set(r.cabinetId, r);
      }

      const items = Array.from(byCabinet.values())
        .sort((a, b) =>
          (a.masterCode || "").localeCompare(b.masterCode || "", undefined, {
            numeric: true,
          })
        )
        .map((r) => {
          // Normalise trim/molding/filler items to category="accessory" so the
          // client TYPE_FILTERS always route them to the Accessories & Trim tab,
          // regardless of which DB category the distributor originally assigned.
          const normCategory = isTrimItem(r) ? "accessory" : r.category;
          // Cost base precedence (yourCost first) MUST match stylesForCabinet
          // so the Family page and the Cabinet Detail page price identically.
          const costRow = {
            yourCost: r.yourCost,
            wholesalePrice: r.wholesalePrice,
            adjustedListPrice: r.adjustedListPrice,
            listPrice: r.listPrice,
            retailPriceBasis: r.retailPriceBasis,
          };
          const sellHomeowner = sellPriceForTier(costRow, ps, "homeowner");
          const sellContractor = sellPriceForTier(costRow, ps, "contractor");
          const sellWholesale = sellPriceForTier(costRow, ps, "wholesale");
          const gated = visiblePricesForViewer(
            {
              listPrice: r.listPrice,
              adjustedListPrice: r.adjustedListPrice,
              wholesalePrice: sellWholesale?.toFixed(2) ?? null,
              contractorPrice: sellContractor?.toFixed(2) ?? null,
              homeownerPrice: sellHomeowner?.toFixed(2) ?? null,
            },
            viewerTier,
            isAdmin,
          );
          return {
            ...r,
            // The catalog card must carry the master cabinet ID, not only the
            // human-readable code. Several legacy records share normalized
            // code text; the exact ID preserves the card's own style and price.
            id: r.cabinetId,
            // Override category so trim/molding/filler items always land in
            // the Accessories & Trim tab on the Family page.
            category: normCategory,
            listPrice: gated.listPrice,
            adjustedListPrice: gated.adjustedListPrice,
            wholesalePrice: gated.wholesalePrice,
            contractorPrice: gated.contractorPrice,
            homeownerPrice: gated.homeownerPrice,
          };
        });

            return { style: scrubDoorStyle(style), items };
    }),

  // Admin: SKU count per door style (how many line items each style carries).
  skuCountsByStyle: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select({
        styleId: distributorSkus.styleId,
        skuCount: sql<number>`count(distinct ${distributorSkus.id})`,
        cabinetCount: sql<number>`count(distinct ${distributorSkus.cabinetId})`,
      })
      .from(distributorSkus)
      .groupBy(distributorSkus.styleId);
    return rows;
  }),

  // Admin: quick catalog preview for a door style — returns all SKUs with cost/retail prices.
  // Used by the "N SKUs" clickable badge on the Featured Styles admin page.
  styleSkuPreview: adminProcedure
    .input(z.object({
      styleId: z.number().int(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(200).default(100),
      search: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rows: [], total: 0 };
      const offset = (input.page - 1) * input.pageSize;

      const baseWhere = eq(distributorSkus.styleId, input.styleId);
      const search = input.search?.trim();
      const normalizedCodeSearch = search ? normalizeCode(search) : "";
      const normalizedMasterCode = sql`UPPER(REPLACE(REPLACE(REPLACE(${cabinets.masterCode}, '-', ''), ' ', ''), '_', ''))`;
      const searchFilter = search
        ? sql`(${cabinets.masterCode} LIKE ${`%${search}%`} OR ${cabinets.description} LIKE ${`%${search}%`} OR ${normalizedMasterCode} LIKE ${`%${normalizedCodeSearch}%`})`
        : undefined;
      const whereClause = searchFilter ? and(baseWhere, searchFilter) : baseWhere;

      const [{ total }] = await db
        .select({ total: sql<number>`count(*)` })
        .from(distributorSkus)
        .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .where(whereClause);

      const rows = await db
        .select({
          skuId: distributorSkus.id,
          platformSku: distributorSkus.platformSku,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          category: cabinets.category,
          width: cabinets.width,
          height: cabinets.height,
          depth: cabinets.depth,
          yourCost: distributorSkus.yourCost,
          listPrice: distributorSkus.listPrice,
          wholesalePrice: distributorSkus.wholesalePrice,
          contractorPrice: distributorSkus.contractorPrice,
          homeownerPrice: distributorSkus.homeownerPrice,
          isAvailable: distributorSkus.isAvailable,
          isPublished: distributorSkus.isPublished,
        })
        .from(distributorSkus)
        .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .where(whereClause)
        .orderBy(asc(cabinets.masterCode))
        .limit(input.pageSize)
        .offset(offset);

      return { rows, total: Number(total) };
    }),

  // Admin: permanently delete a door style. Only allowed if no SKUs reference it.
  deleteDoorStyle: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Safety check: block deletion if SKUs reference this style
      const [{ cnt: skuCnt }] = await db
        .select({ cnt: sql<number>`count(*)` })
        .from(distributorSkus)
        .where(eq(distributorSkus.styleId, input.id));
      if (Number(skuCnt) > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot delete: ${skuCnt} SKUs still reference this door style. Remove or reassign them first.`,
        });
      }
      // Also check pantry bundles
      const [{ cnt: pantryCnt }] = await db
        .select({ cnt: sql<number>`count(*)` })
        .from(pantryBundles)
        .where(eq(pantryBundles.styleId, input.id));
      if (Number(pantryCnt) > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot delete: ${pantryCnt} pantry bundles still reference this door style.`,
        });
      }
      // Clean up secondary references (corrections, branding) then delete
      await db.delete(doorStyleCorrections).where(eq(doorStyleCorrections.styleId, input.id));
      await db.delete(doorStyles).where(eq(doorStyles.id, input.id));
      return { ok: true };
    }),

  // Admin: create a new door style from scratch.
  createDoorStyle: adminProcedure
    .input(
      z.object({
        distributorId: z.number(),
        styleCode: z.string().min(1).max(32),
        ourName: z.string().min(1).max(128),
        distributorName: z.string().max(128).optional(),
        doorStyle: z.string().max(64).nullable().optional(),
        color: z.string().max(64).nullable().optional(),
        finish: z.string().max(128).nullable().optional(),
        woodSpecies: z.string().max(64).nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Check for duplicate (same distributorId + styleCode)
      const existing = await db
        .select({ id: doorStyles.id })
        .from(doorStyles)
        .where(
          and(
            eq(doorStyles.distributorId, input.distributorId),
            eq(doorStyles.styleCode, input.styleCode)
          )
        )
        .limit(1);
      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A door style with code "${input.styleCode}" already exists for this distributor (id=${existing[0].id}).`,
        });
      }
      const [result] = await db.insert(doorStyles).values({
        distributorId: input.distributorId,
        styleCode: input.styleCode,
        ourName: input.ourName,
        distributorName: input.distributorName ?? input.ourName,
        doorStyle: input.doorStyle ?? null,
        color: input.color ?? null,
        finish: input.finish ?? null,
        woodSpecies: input.woodSpecies ?? null,
        isActive: true,
      });
      return { id: (result as any).insertId as number, ourName: input.ourName, ok: true };
    }),
});
// ─── Cabinets ─────────────────────────────────────────────────────────────────

export const cabinetsRouter = router({
  list: publicProcedure
    .input(
      z.object({
        category: z.string().optional(),
        subCategory: z.string().optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const conditions = [eq(cabinets.isActive, true), notInConflict()];
      if (input?.category) {
        conditions.push(eq(cabinets.category, input.category));
      }
      if (input?.subCategory) {
        conditions.push(eq(cabinets.subCategory, input.subCategory));
      }
      if (input?.search) {
        const raw = input.search.trim();
        // Canonical key: strip everything but alphanumerics so glued user codes
        // (e.g. "w31824", "W2736", "WDC2430R") match dashed master codes
        // ("W-318-24", "W-27-36", "WDC-24-30-R").
        const canon = normalizeCode(raw);
        // SQL-side canonicalization of masterCode removes every supported separator.
        const canonCol = sql`UPPER(REPLACE(REPLACE(REPLACE(${cabinets.masterCode}, '-', ''), ' ', ''), '_', ''))`;
        const orParts = [
          sql`${cabinets.masterCode} LIKE ${`%${raw}%`}`,
          sql`${cabinets.description} LIKE ${`%${raw}%`}`,
        ];
        if (canon) {
          orParts.push(sql`${canonCol} LIKE ${`%${canon}%`}`);
        }
        conditions.push(sql`(${sql.join(orParts, sql` OR `)})`);
      }

      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;

      const [items, countResult] = await Promise.all([
        db
          .select()
          .from(cabinets)
          .where(and(...conditions))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(cabinets)
          .where(and(...conditions)),
      ]);

      return {
        items: items.map(scrubCabinet),
        total: Number(countResult[0]?.count ?? 0),
      };
    }),

  // Style-scoped catalog list: only returns cabinets that have a published +
  // available SKU for the SELECTED door style. This makes the storefront
  // Catalog reflect true per-door-style availability (each style carries its
  // own cabinet set), matching the Design Tool's placeableCabinets gate.
  listForStyle: publicProcedure
    .input(
      z.object({
        styleId: z.number(),
        category: z.string().optional(),
        subCategory: z.string().optional(),
        search: z.string().optional(),
        adaOnly: z.boolean().optional(),
        sort: z.enum(["sku-asc", "width-asc", "width-desc", "height-asc", "height-desc", "type-asc"]).default("sku-asc"),
        limit: z.number().min(1).max(1000).default(48),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0, categoryCounts: {} as Record<string, number> };

      const sourceConds = [
        eq(distributorSkus.styleId, input.styleId),
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true),
        sql`(COALESCE(${distributorSkus.listPrice}, 0) > 0 OR COALESCE(${distributorSkus.yourCost}, 0) > 0)`,
        ne(cabinets.conflictStatus, "conflict"),
      ];

      // Pull all viable source rows for this style. A source can sit under a
      // retired format alias; it is resolved to its canonical master below so
      // the style keeps its own price/SKU while the shopper sees one product.
      const sourceRows = await db
        .select({
          sourceMasterCode: cabinets.masterCode,
          // Policy is a distributor overlay: canonical product facts stay on
          // the master while this selected supply line defines whether its
          // glass insert is included in the cabinet price.
          glassIncluded: distributors.glassIncluded,
        })
        .from(distributorSkus)
        .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .innerJoin(distributors, eq(distributors.id, distributorSkus.distributorId))
        .where(and(...sourceConds));

      const [aliases, masters] = await Promise.all([
        db
          .select({ aliasCode: skuMasterAliases.aliasCode, masterCode: skuMasterAliases.masterCode })
          .from(skuMasterAliases)
          .where(eq(skuMasterAliases.conflictStatus, "ok")),
        db
          .select({
            id: cabinets.id,
            masterCode: cabinets.masterCode,
            description: cabinets.description,
            category: cabinets.category,
            subCategory: cabinets.subCategory,
            width: cabinets.width,
            height: cabinets.height,
            depth: cabinets.depth,
            numberOfDoors: cabinets.numberOfDoors,
            numberOfDrawers: cabinets.numberOfDrawers,
            numberOfAdjShelves: cabinets.numberOfAdjShelves,
            graphicType: cabinets.graphicType,
            catalogImageUrl: cabinets.catalogImageUrl,
            placementType: cabinets.placementType,
            isCornerCabinet: cabinets.isCornerCabinet,
          })
          .from(cabinets)
          .where(and(
            eq(cabinets.isActive, true),
            eq(cabinets.showInCatalog, true),
            ne(cabinets.conflictStatus, "conflict"),
          )),
      ]);

      const search = input.search?.trim() ?? "";
      const normalizedSearch = normalizeCode(search);
      const aliasMatchedMasterCodes = new Set(
        aliases
          .filter((alias) => normalizedSearch.length > 0 && normalizeCode(alias.aliasCode).includes(normalizedSearch))
          .map((alias) => alias.masterCode),
      );
      const matchesFilters = (row: (typeof masters)[number]) => {
        if (input.category && row.category !== input.category) return false;
        if (input.subCategory && row.subCategory !== input.subCategory) return false;
        if (input.adaOnly) {
          const code = normalizeCode(row.masterCode);
          const haystack = `${row.category ?? ""} ${row.subCategory ?? ""} ${row.description ?? ""}`.toLowerCase();
          if (!code.startsWith("ADA") && !haystack.includes("ada") && !haystack.includes("accessible")) return false;
        }
        if (!search) return true;
        return row.masterCode.includes(search)
          || (row.description ?? "").toLowerCase().includes(search.toLowerCase())
          || normalizeCode(row.masterCode).includes(normalizedSearch)
          || aliasMatchedMasterCodes.has(row.masterCode);
      };

      const resolved = resolveCanonicalCatalogSources(sourceRows, aliases, masters)
        .map(({ master }) => master);
      const allByCabinet = new Map<number, (typeof resolved)[number]>();
      for (const row of resolved) if (!allByCabinet.has(row.id)) allByCabinet.set(row.id, row);

      // Category pills are scoped to this exact door style's currently
      // sellable catalog. An empty category must never appear as a dead tab.
      const categoryCounts: Record<string, number> = {};
      for (const row of Array.from(allByCabinet.values())) {
        const category = row.category?.trim();
        if (category) categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
      }

      const numericDimension = (value: string | null) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };
      const skuCompare = (a: (typeof resolved)[number], b: (typeof resolved)[number]) =>
        (a.masterCode || "").localeCompare(b.masterCode || "", undefined, { numeric: true });
      const dimensionCompare = (
        a: (typeof resolved)[number],
        b: (typeof resolved)[number],
        field: "width" | "height",
        descending = false,
      ) => {
        const left = numericDimension(a[field]);
        const right = numericDimension(b[field]);
        if (left == null && right == null) return skuCompare(a, b);
        if (left == null) return 1;
        if (right == null) return -1;
        const compared = left - right;
        return compared === 0 ? skuCompare(a, b) : (descending ? -compared : compared);
      };
      const sortItems = (a: (typeof resolved)[number], b: (typeof resolved)[number]) => {
        if (input.sort === "width-asc") return dimensionCompare(a, b, "width");
        if (input.sort === "width-desc") return dimensionCompare(a, b, "width", true);
        if (input.sort === "height-asc") return dimensionCompare(a, b, "height");
        if (input.sort === "height-desc") return dimensionCompare(a, b, "height", true);
        if (input.sort === "type-asc") {
          const type = `${a.category ?? ""} ${a.subCategory ?? ""}`.localeCompare(`${b.category ?? ""} ${b.subCategory ?? ""}`);
          return type === 0 ? skuCompare(a, b) : type;
        }
        return skuCompare(a, b);
      };

      const distinct = Array.from(allByCabinet.values())
        .filter(matchesFilters)
        .sort(sortItems);

      const total = distinct.length;
      const page = distinct.slice(input.offset, input.offset + input.limit);
      return { items: page, total, categoryCounts };
    }),

  categories: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .selectDistinct({ category: cabinets.category })
      .from(cabinets)
      .where(and(eq(cabinets.isActive, true), notInConflict()));
    return rows.map((r) => r.category).filter(Boolean);
  }),

  subCategories: publicProcedure
    .input(z.object({ category: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .selectDistinct({ subCategory: cabinets.subCategory })
        .from(cabinets)
        .where(
          and(
            eq(cabinets.isActive, true),
            notInConflict(),
            eq(cabinets.category, input.category),
            isNotNull(cabinets.subCategory)
          )
        );
      return rows.map((r) => r.subCategory).filter(Boolean);
    }),

  byId: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select()
        .from(cabinets)
        .where(and(eq(cabinets.id, input.id), notInConflict()))
        .limit(1);
      return rows[0] ? scrubCabinet(rows[0]) : null;
    }),

  byCode: publicProcedure
    .input(z.object({ masterCode: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const normalizedCode = normalizeCode(input.masterCode);

      // A deliberate legacy alias must win over a duplicate direct master-code
      // record. This keeps an old route such as 3DB12 on its configured
      // canonical product 3-DB12 instead of reviving the retired duplicate.
      const aliasCanon = sql`UPPER(REPLACE(REPLACE(REPLACE(${cabinetAliases.alias}, '-', ''), ' ', ''), '_', ''))`;
      const [alias] = await db
        .select({ cabinetId: cabinetAliases.cabinetId })
        .from(cabinetAliases)
        .where(or(
          eq(cabinetAliases.alias, input.masterCode),
          eq(cabinetAliases.alias, normalizedCode),
          sql`${aliasCanon} = ${normalizedCode}`,
        ))
        .limit(1);
      if (alias) {
        const [canonical] = await db
          .select()
          .from(cabinets)
          .where(and(eq(cabinets.id, alias.cabinetId), notInConflict()))
          .limit(1);
        if (canonical) return scrubCabinet(canonical);
      }

      // Master-code aliases are structural catalog routes (for example,
      // B12ADA → ADA-B12). Resolve them before any direct legacy master row so
      // the public catalog never reintroduces a second product identity.
      const masterAliasCanon = sql`UPPER(REPLACE(REPLACE(REPLACE(${skuMasterAliases.aliasCode}, '-', ''), ' ', ''), '_', ''))`;
      const [masterAlias] = await db
        .select({ masterCode: skuMasterAliases.masterCode })
        .from(skuMasterAliases)
        .where(and(
          eq(skuMasterAliases.conflictStatus, "ok"),
          or(
            eq(skuMasterAliases.aliasCode, input.masterCode),
            eq(skuMasterAliases.aliasCode, normalizedCode),
            sql`${masterAliasCanon} = ${normalizedCode}`,
          ),
        ))
        .limit(1);
      if (masterAlias) {
        const [canonical] = await db
          .select()
          .from(cabinets)
          .where(and(eq(cabinets.masterCode, masterAlias.masterCode), notInConflict()))
          .limit(1);
        if (canonical) return scrubCabinet(canonical);
      }

      const rows = await db
        .select()
        .from(cabinets)
        .where(and(
          or(
            eq(cabinets.masterCode, input.masterCode),
            eq(cabinets.masterCode, normalizedCode),
            sql`REPLACE(REPLACE(REPLACE(UPPER(${cabinets.masterCode}), '-', ''), ' ', ''), '_', '') = ${normalizedCode}`,
          ),
          notInConflict(),
        ))
        .limit(1);
      if (rows[0]) return scrubCabinet(rows[0]);

      return null;
    }),

  // ── Admin: Conflict / Needs-Review back office ───────────────────────────
  // Lists every product currently held in conflict status, together with the
  // info we DO know: distributor name(s) and door style(s) it is carried under
  // (resolved from its SKUs). Admin-only — supplier identity is allowed here.
  conflicts: adminProcedure.query(async () => {
    type ConflictItem = {
      id: number;
      masterCode: string;
      description: string;
      category: string;
      subCategory: string | null;
      width: string | null;
      height: string | null;
      depth: string | null;
      conflictReason: string | null;
      conflictedAt: Date | null;
      skuCount: number;
      distributorNames: string[];
      doorStyleNames: string[];
      styleIds: number[];
    };
    const db = await getDb();
    if (!db) return [] as ConflictItem[];
    const items = await db
      .select()
      .from(cabinets)
      .where(eq(cabinets.conflictStatus, "conflict"))
      .orderBy(asc(cabinets.masterCode));
    if (items.length === 0) return [];
    const ids = items.map((c) => c.id);
    // Resolve the distributor names + door styles each conflict item is
    // carried under, so the admin can identify it against the catalog book.
    const skuRows = await db
      .select({
        cabinetId: distributorSkus.cabinetId,
        styleId: distributorSkus.styleId,
        distributorName: distributors.name,
        styleName: doorStyles.ourName,
        styleCode: doorStyles.styleCode,
        distributorSku: distributorSkus.distributorSku,
        platformSku: distributorSkus.platformSku,
        listPrice: distributorSkus.listPrice,
      })
      .from(distributorSkus)
      .leftJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
      .leftJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
      .where(inArray(distributorSkus.cabinetId, ids));
    const byCab = new Map<number, typeof skuRows>();
    for (const r of skuRows) {
      if (r.cabinetId == null) continue;
      const arr = byCab.get(r.cabinetId) ?? [];
      arr.push(r);
      byCab.set(r.cabinetId, arr);
    }
    const result: ConflictItem[] = items.map((c) => {
      const skus = byCab.get(c.id) ?? [];
      const distributorNames = Array.from(
        new Set(skus.map((s) => s.distributorName).filter((v): v is string => Boolean(v)))
      );
      const doorStyleNames = Array.from(
        new Set(
          skus
            .map((s) => (s.styleName ? `${s.styleName}${s.styleCode ? ` (${s.styleCode})` : ""}` : null))
            .filter((v): v is string => Boolean(v))
        )
      );
      const styleIds = Array.from(
        new Set(skus.map((s) => s.styleId).filter((v): v is number => typeof v === "number"))
      );
      return {
        id: c.id,
        masterCode: c.masterCode,
        description: c.description,
        category: c.category,
        subCategory: c.subCategory,
        width: c.width,
        height: c.height,
        depth: c.depth,
        conflictReason: c.conflictReason,
        conflictedAt: c.conflictedAt,
        skuCount: skus.length,
        distributorNames,
        doorStyleNames,
        styleIds,
      };
    });
    return result;
  }),

  // Admin: every distinct category INCLUDING conflict items, so the conflict
  // editor can offer the full real category list (the public `categories` query
  // deliberately hides conflicts).
  allCategories: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [] as string[];
    const rows = await db.selectDistinct({ category: cabinets.category }).from(cabinets);
    return rows
      .map((r) => r.category)
      .filter((v): v is string => Boolean(v))
      .sort((a, b) => a.localeCompare(b));
  }),

  // Admin: door-style options for the conflict editor's style picker. Returns a
  // flat, labeled list (supplier identity is allowed in the admin back office).
  doorStyleOptions: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [] as { id: number; label: string }[];
    const rows = await db
      .select({
        id: doorStyles.id,
        ourName: doorStyles.ourName,
        styleCode: doorStyles.styleCode,
        doorStyle: doorStyles.doorStyle,
        isActive: doorStyles.isActive,
      })
      .from(doorStyles)
      .orderBy(asc(doorStyles.ourName));
    return rows.map((r) => ({
      id: r.id,
      label: `${r.ourName}${r.styleCode ? ` (${r.styleCode})` : ""}${r.doorStyle ? ` \u2014 ${r.doorStyle}` : ""}${r.isActive ? "" : " [inactive]"}`,
    }));
  }),

  // Admin: flag a product into conflict status (hold in back office).
  setConflict: adminProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      await db
        .update(cabinets)
        .set({
          conflictStatus: "conflict",
          conflictReason: input.reason ?? "Flagged for review by admin.",
          conflictedAt: new Date(),
        })
        .where(eq(cabinets.id, input.id));
      return { ok: true };
    }),

  // Admin: EDIT a conflicting product's data so the reviewer can fix what
  // caused the conflict (wrong description / category / size) directly from the
  // Conflicts tab, plus amend the review note. Only provided fields are written.
  // Optionally clears the conflict in the same call (clearAfter=true).
  updateConflictCabinet: adminProcedure
    .input(
      z.object({
        id: z.number(),
        description: z.string().min(1).optional(),
        category: z.string().min(1).optional(),
        subCategory: z.string().nullable().optional(),
        width: z.string().nullable().optional(),
        height: z.string().nullable().optional(),
        depth: z.string().nullable().optional(),
        conflictReason: z.string().nullable().optional(),
        // Re-assign this product to the correct door style. When provided, ALL of
        // the item's distributor SKUs are re-pointed to this styleId so the
        // product appears under the right door style once it's live again.
        styleId: z.number().int().positive().optional(),
        clearAfter: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const patch: Record<string, unknown> = {};
      if (input.description !== undefined) patch.description = input.description;
      if (input.category !== undefined) {
        patch.category = input.category;
        // Auto-derive placementType from category so the design tool tab matches
        const catLower = (input.category || "").toLowerCase();
        if (catLower.includes("wall")) patch.placementType = "wall";
        else if (catLower.includes("tall") || catLower.includes("pantry") || catLower.includes("utility") || catLower.includes("oven")) patch.placementType = "tall";
        else if (catLower.includes("accessory") || catLower.includes("trim") || catLower.includes("molding") || catLower.includes("filler")) patch.placementType = "accessory";
        else patch.placementType = "base";
      }
      if (input.subCategory !== undefined) patch.subCategory = input.subCategory;
      if (input.width !== undefined) patch.width = input.width;
      if (input.height !== undefined) patch.height = input.height;
      if (input.depth !== undefined) patch.depth = input.depth;
      if (input.conflictReason !== undefined) patch.conflictReason = input.conflictReason;
      if (input.clearAfter) {
        patch.conflictStatus = "none";
        patch.conflictReason = null;
        patch.conflictedAt = null;
      }

      // Re-assign door style across all of the item's SKUs, if requested.
      if (input.styleId !== undefined) {
        const styleRow = await db
          .select({ id: doorStyles.id, distributorId: doorStyles.distributorId })
          .from(doorStyles)
          .where(eq(doorStyles.id, input.styleId))
          .limit(1);
        if (!styleRow[0]) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Selected door style was not found." });
        }
        // Point every SKU of this cabinet at the chosen style. We also align the
        // SKU's distributorId to the style's distributor so the SKU stays
        // internally consistent (a style belongs to one supply line).
        await db
          .update(distributorSkus)
          .set({ styleId: input.styleId, distributorId: styleRow[0].distributorId })
          .where(eq(distributorSkus.cabinetId, input.id));
      }

      if (Object.keys(patch).length > 0) {
        await db.update(cabinets).set(patch).where(eq(cabinets.id, input.id));
      }
      return { ok: true };
    }),

  // Admin: clear a conflict once reviewed, returning the product to live status.
  clearConflict: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      await db
        .update(cabinets)
        .set({ conflictStatus: "none", conflictReason: null, conflictedAt: null })
        .where(eq(cabinets.id, input.id));
      return { ok: true };
    }),

  // ── Admin: Cabinet spreadsheet export ────────────────────────────────────
  // Returns a base64-encoded XLSX workbook containing every cabinet row so
  // the admin can correct descriptions, dimensions, categories, etc. in Excel
  // and re-upload via adminImport.
  adminExport: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { xlsx: "", filename: "cabinets.xlsx", count: 0 };

    const rows = await db
      .select({
        masterCode: cabinets.masterCode,
        description: cabinets.description,
        category: cabinets.category,
        subCategory: cabinets.subCategory,
        placementType: cabinets.placementType,
        width: cabinets.width,
        height: cabinets.height,
        depth: cabinets.depth,
        numberOfDoors: cabinets.numberOfDoors,
        numberOfDrawers: cabinets.numberOfDrawers,
        hingeSide: cabinets.hingeSide,
        isCornerCabinet: cabinets.isCornerCabinet,
        cornerSide: cabinets.cornerSide,
        graphicType: cabinets.graphicType,
        isActive: cabinets.isActive,
        // Alias columns
        sku: cabinets.sku,
        vendorSku: cabinets.vendorSku,
        altSku1: cabinets.altSku1,
        altSku2: cabinets.altSku2,
        altSku3: cabinets.altSku3,
        stainColor: cabinets.stainColor,
        constructionMethod: cabinets.constructionMethod,
      })
      .from(cabinets)
      .orderBy(asc(cabinets.category), asc(cabinets.masterCode));

    const sheetData = [
      [
        "masterCode", "description", "category", "subCategory", "placementType",
        "width", "height", "depth", "numberOfDoors", "numberOfDrawers",
        "hingeSide", "isCornerCabinet", "cornerSide", "graphicType", "isActive",
        "sku", "vendorSku", "altSku1", "altSku2", "altSku3",
        "stainColor", "constructionMethod",
      ],
      ...rows.map((r) => [
        r.masterCode,
        r.description,
        r.category,
        r.subCategory ?? "",
        r.placementType ?? "",
        r.width != null ? Number(r.width) : "",
        r.height != null ? Number(r.height) : "",
        r.depth != null ? Number(r.depth) : "",
        r.numberOfDoors ?? 0,
        r.numberOfDrawers ?? 0,
        r.hingeSide ?? "",
        r.isCornerCabinet ? "TRUE" : "FALSE",
        r.cornerSide ?? "",
        r.graphicType ?? "",
        r.isActive ? "TRUE" : "FALSE",
        r.sku ?? "",
        r.vendorSku ?? "",
        r.altSku1 ?? "",
        r.altSku2 ?? "",
        r.altSku3 ?? "",
        r.stainColor ?? "",
        r.constructionMethod ?? "",
      ]),
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    XLSX.utils.book_append_sheet(wb, ws, "Cabinets");
    const buf = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
    const date = new Date().toISOString().slice(0, 10);
    return { xlsx: buf as string, filename: `cabinet-dealz-cabinets-${date}.xlsx`, count: rows.length };
  }),

  // ── Admin: Cabinet spreadsheet import ────────────────────────────────────
  // Accepts a base64-encoded XLSX workbook (same format as adminExport),
  // parses every row, and upserts changes to the cabinets table.
  // Only the editable columns are updated; masterCode is the lookup key.
  // Returns per-row results so the UI can show a summary.
  adminImport: adminProcedure
    .input(z.object({ xlsx: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      let wb: XLSX.WorkBook;
      try {
        wb = XLSX.read(input.xlsx, { type: "base64" });
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Could not parse the uploaded file. Make sure it is a valid .xlsx workbook." });
      }

      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new TRPCError({ code: "BAD_REQUEST", message: "Workbook has no sheets." });

      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      if (rawRows.length === 0) return { updated: 0, skipped: 0, errors: [] as string[] };

      let updated = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        const masterCode = String(row["masterCode"] ?? "").trim();
        if (!masterCode) { skipped++; continue; }

        // Build the patch — only include fields that are present and non-empty.
        const patch: Record<string, unknown> = {};

        const desc = String(row["description"] ?? "").trim();
        if (desc) patch.description = desc;

        const cat = String(row["category"] ?? "").trim();
        if (cat) patch.category = cat;

        const sub = String(row["subCategory"] ?? "").trim();
        patch.subCategory = sub || null;

        const pt = String(row["placementType"] ?? "").trim();
        if (pt) patch.placementType = pt;

        const w = parseFloat(String(row["width"] ?? ""));
        if (!isNaN(w)) patch.width = String(w);

        const h = parseFloat(String(row["height"] ?? ""));
        if (!isNaN(h)) patch.height = String(h);

        const d = parseFloat(String(row["depth"] ?? ""));
        if (!isNaN(d)) patch.depth = String(d);

        const doors = parseInt(String(row["numberOfDoors"] ?? ""), 10);
        if (!isNaN(doors)) patch.numberOfDoors = doors;

        const drawers = parseInt(String(row["numberOfDrawers"] ?? ""), 10);
        if (!isNaN(drawers)) patch.numberOfDrawers = drawers;

        const hinge = String(row["hingeSide"] ?? "").trim();
        if (hinge) patch.hingeSide = hinge;

        const cornerRaw = String(row["isCornerCabinet"] ?? "").trim().toUpperCase();
        if (cornerRaw === "TRUE" || cornerRaw === "1") patch.isCornerCabinet = true;
        else if (cornerRaw === "FALSE" || cornerRaw === "0") patch.isCornerCabinet = false;

        const cornerSide = String(row["cornerSide"] ?? "").trim();
        patch.cornerSide = cornerSide || null;

        const gt = String(row["graphicType"] ?? "").trim();
        if (gt) patch.graphicType = gt;

        const activeRaw = String(row["isActive"] ?? "").trim().toUpperCase();
        if (activeRaw === "TRUE" || activeRaw === "1") patch.isActive = true;
        else if (activeRaw === "FALSE" || activeRaw === "0") patch.isActive = false;

        // Alias columns — empty string clears the field (sets to null)
        if ("sku" in row) patch.sku = String(row["sku"] ?? "").trim() || null;
        if ("vendorSku" in row) patch.vendorSku = String(row["vendorSku"] ?? "").trim() || null;
        if ("altSku1" in row) patch.altSku1 = String(row["altSku1"] ?? "").trim() || null;
        if ("altSku2" in row) patch.altSku2 = String(row["altSku2"] ?? "").trim() || null;
        if ("altSku3" in row) patch.altSku3 = String(row["altSku3"] ?? "").trim() || null;
        if ("stainColor" in row) patch.stainColor = String(row["stainColor"] ?? "").trim() || null;
        if ("constructionMethod" in row) patch.constructionMethod = String(row["constructionMethod"] ?? "").trim() || null;

        if (Object.keys(patch).length === 0) { skipped++; continue; }

        try {
          const result = await db
            .update(cabinets)
            .set(patch)
            .where(eq(cabinets.masterCode, masterCode));
          const affected = (result as unknown as { rowsAffected?: number })?.rowsAffected ?? 0;
          if (affected > 0) updated++;
          else { skipped++; errors.push(`Row ${i + 2}: masterCode "${masterCode}" not found — skipped.`); }
        } catch (err) {
          errors.push(`Row ${i + 2}: ${masterCode} — ${err instanceof Error ? err.message : String(err)}`);
          skipped++;
        }
      }

      return { updated, skipped, errors };
    }),

  // ── Admin: Inline storefront edit ──────────────────────────────────────────
  // Called from the CabinetDetail page when an admin clicks the pencil button.
  // Only the fields provided are written; omitted fields are left unchanged.
  adminUpdateCabinet: adminProcedure
    .input(
      z.object({
        id: z.number(),
        description: z.string().min(1).optional(),
        category: z.string().min(1).optional(),
        subCategory: z.string().nullable().optional(),
        catalogImageUrl: z.string().nullable().optional(),
        showInCatalog: z.boolean().optional(),
        showInDesigner: z.boolean().optional(),
        showIn2020: z.boolean().optional(),
        isActive: z.boolean().optional(),
        // Dimensions & weight
        width: z.string().nullable().optional(),
        height: z.string().nullable().optional(),
        depth: z.string().nullable().optional(),
        physicalWidth: z.string().nullable().optional(),
        weight: z.string().nullable().optional(),
        // Package dimensions & weight
        pkgLength: z.string().nullable().optional(),
        pkgWidth: z.string().nullable().optional(),
        pkgHeight: z.string().nullable().optional(),
        pkgWeight: z.string().nullable().optional(),
        // Door / drawer / shelf counts
        numberOfDoors: z.number().int().min(0).max(4).nullable().optional(),
        numberOfDrawers: z.number().int().min(0).max(8).nullable().optional(),
        numberOfFixedShelves: z.number().int().min(0).max(8).nullable().optional(),
        numberOfAdjShelves: z.number().int().min(0).max(8).nullable().optional(),
        isNotCabinet: z.boolean().optional(),
        // Alias SKUs
        altSku1: z.string().nullable().optional(),
        altSku2: z.string().nullable().optional(),
        altSku3: z.string().nullable().optional(),
        // Blind corner pull spec
        minPull: z.number().positive().nullable().optional(),
        maxPull: z.number().positive().nullable().optional(),
        openingWidth: z.number().positive().nullable().optional(),
        openingHeight: z.number().positive().nullable().optional(),
        // Appliance opening (oven cutout) position: null = none, 'top' | 'middle' | 'bottom'
        openingType: z.enum(["top", "middle", "bottom"]).nullable().optional(),
        // Door height in inches (used with openingType to calculate opening size)
        doorHeight: z.number().positive().nullable().optional(),
        drawerHeight: z.number().positive().nullable().optional(),
        // Corner cabinet type: null = standard, or one of the corner types
        cornerType: z.enum(["lazy-susan", "blind-corner", "diagonal", "pie-cut", "l-shape", "triangle"]).nullable().optional(),
        // Lazy Susan specific
        shelfRadius: z.number().positive().nullable().optional(),
        shelfCount: z.number().int().positive().nullable().optional(),
        // Corner cabinet shared (Lazy Susan + Diagonal)
        cabinetSquare: z.number().positive().nullable().optional(),
        // Diagonal corner specific
        faceWidth: z.number().positive().nullable().optional(),
        legWidth: z.number().positive().nullable().optional(),
        // Config verified
        configVerified: z.boolean().optional(),
        // Door orientation for multi-door cabinets
        doorOrientation: z.enum(["side-by-side", "stacked"]).nullable().optional(),
        // How many doors appear side-by-side in a single row (null = auto-detect)
        doorsPerRow: z.number().int().min(1).max(4).nullable().optional(),
        // Drawer layout JSON: array of rows [{count, height?}]
        drawerLayout: z.string().nullable().optional(),
        // Panel grain direction: vertical | horizontal | null
        grainDirection: z.enum(["vertical", "horizontal"]).nullable().optional(),
        // Whether this panel uses the door style image (decorative door panel)
        isDecorativeDoor: z.boolean().optional(),
        // Visual layout spec JSON: {baseType, sections:[{type,count,height}]}
        layoutSpec: z.string().nullable().optional(),
        // Generic line-drawing image from spec book
        specImageUrl: z.string().nullable().optional(),
        // Configured Custom Cabinet Rule profile. "standard" keeps automatic geometry.
        graphicType: z.string().max(64).nullable().optional(),
        // Spec notes from spec book
        specNotes: z.string().nullable().optional(),
        // Face pattern for specialty open-front cabinets
        facePattern: z.enum(["slats", "criss-cross", "lattice", "open"]).nullable().optional(),
        // Glass door add-on: masterCode of the separate glass door SKU (same distributor only)
        glassDoorAddonCode: z.string().max(64).nullable().optional(),
        // Master code rename — old code is automatically saved as an alias
        masterCode: z.string().min(1).max(64).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const patch: Record<string, unknown> = {};
      // If masterCode is being changed, save the old code as an alias first
      if (input.masterCode !== undefined) {
        const requestedMasterCode = input.masterCode.trim().toUpperCase();
        const [occupiedMaster] = await db
          .select({ id: cabinets.id, masterCode: cabinets.masterCode })
          .from(cabinets)
          .where(and(eq(cabinets.masterCode, requestedMasterCode), ne(cabinets.id, input.id)))
          .limit(1);
        if (occupiedMaster) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Master SKU ${requestedMasterCode} already belongs to another cabinet. Keep this legacy code unchanged and add it as a Master Alias on ${occupiedMaster.masterCode ?? requestedMasterCode}.`,
          });
        }
        const [existing] = await db.select({ masterCode: cabinets.masterCode }).from(cabinets).where(eq(cabinets.id, input.id)).limit(1);
        if (existing && existing.masterCode && existing.masterCode !== requestedMasterCode) {
          // Upsert alias: ignore if the old code is already an alias for this cabinet
          await db.insert(cabinetAliases)
            .values({ cabinetId: input.id, alias: existing.masterCode })
            .onDuplicateKeyUpdate({ set: { cabinetId: input.id } });
        }
        patch.masterCode = requestedMasterCode;
      }
      if (input.description !== undefined) patch.description = input.description;
      if (input.category !== undefined) {
        patch.category = input.category;
        // Auto-derive placementType from category so the design tool tab matches
        const catLower = (input.category || "").toLowerCase();
        if (catLower.includes("wall")) patch.placementType = "wall";
        else if (catLower.includes("tall") || catLower.includes("pantry") || catLower.includes("utility") || catLower.includes("oven")) patch.placementType = "tall";
        else if (catLower.includes("accessory") || catLower.includes("trim") || catLower.includes("molding") || catLower.includes("filler")) patch.placementType = "accessory";
        else patch.placementType = "base";
      }
      if (input.subCategory !== undefined) patch.subCategory = input.subCategory;
      if (input.catalogImageUrl !== undefined) patch.catalogImageUrl = input.catalogImageUrl;
      if (input.showInCatalog !== undefined) patch.showInCatalog = input.showInCatalog;
      if (input.showInDesigner !== undefined) patch.showInDesigner = input.showInDesigner;
      if (input.showIn2020 !== undefined) patch.showIn2020 = input.showIn2020;
      // Helper: empty string → null, fraction strings → decimal for decimal columns
      const decOrNull = (v: string | null | undefined): string | null => {
        if (!v || !v.trim()) return null;
        const s = v.trim();
        // Handle fractions like "7/16" or mixed like "1 7/16"
        const mixedMatch = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
        if (mixedMatch) {
          const whole = parseInt(mixedMatch[1]);
          const num = parseInt(mixedMatch[2]);
          const den = parseInt(mixedMatch[3]);
          return den > 0 ? String(+(whole + num / den).toFixed(4)) : null;
        }
        const fracMatch = s.match(/^(\d+)\/(\d+)$/);
        if (fracMatch) {
          const num = parseInt(fracMatch[1]);
          const den = parseInt(fracMatch[2]);
          return den > 0 ? String(+(num / den).toFixed(4)) : null;
        }
        // If it's a valid number, return it; otherwise null
        const n = parseFloat(s);
        return isNaN(n) ? null : s;
      };
      if (input.width !== undefined) patch.width = decOrNull(input.width);
      if (input.height !== undefined) patch.height = decOrNull(input.height);
      if (input.depth !== undefined) patch.depth = decOrNull(input.depth);
      if (input.physicalWidth !== undefined) patch.physicalWidth = decOrNull(input.physicalWidth);
      if (input.weight !== undefined) patch.weight = decOrNull(input.weight);
      if (input.pkgLength !== undefined) patch.pkgLength = decOrNull(input.pkgLength);
      if (input.pkgWidth !== undefined) patch.pkgWidth = decOrNull(input.pkgWidth);
      if (input.pkgHeight !== undefined) patch.pkgHeight = decOrNull(input.pkgHeight);
      if (input.pkgWeight !== undefined) patch.pkgWeight = decOrNull(input.pkgWeight);
      if (input.numberOfDoors !== undefined) patch.numberOfDoors = input.numberOfDoors;
      if (input.numberOfDrawers !== undefined) patch.numberOfDrawers = input.numberOfDrawers;
      if (input.numberOfFixedShelves !== undefined) patch.numberOfFixedShelves = input.numberOfFixedShelves;
      if (input.numberOfAdjShelves !== undefined) patch.numberOfAdjShelves = input.numberOfAdjShelves;
      if (input.isNotCabinet !== undefined) patch.isNotCabinet = input.isNotCabinet;
      if (input.isActive !== undefined) patch.isActive = input.isActive;
      if (input.altSku1 !== undefined) patch.altSku1 = input.altSku1;
      if (input.altSku2 !== undefined) patch.altSku2 = input.altSku2;
      if (input.altSku3 !== undefined) patch.altSku3 = input.altSku3;
      if (input.minPull !== undefined) patch.minPull = input.minPull != null ? String(input.minPull) : null;
      if (input.maxPull !== undefined) patch.maxPull = input.maxPull != null ? String(input.maxPull) : null;
      if (input.openingWidth !== undefined) patch.openingWidth = input.openingWidth != null ? String(input.openingWidth) : null;
      if (input.openingHeight !== undefined) patch.openingHeight = input.openingHeight != null ? String(input.openingHeight) : null;
      if (input.openingType !== undefined) patch.openingType = input.openingType;
      if (input.doorHeight !== undefined) patch.doorHeight = input.doorHeight != null ? String(input.doorHeight) : null;
      if (input.drawerHeight !== undefined) patch.drawerHeight = input.drawerHeight != null ? String(input.drawerHeight) : null;
      if (input.cornerType !== undefined) patch.cornerType = input.cornerType;
      if (input.shelfRadius !== undefined) patch.shelfRadius = input.shelfRadius != null ? String(input.shelfRadius) : null;
      if (input.shelfCount !== undefined) patch.shelfCount = input.shelfCount;
      if (input.cabinetSquare !== undefined) patch.cabinetSquare = input.cabinetSquare != null ? String(input.cabinetSquare) : null;
      if (input.faceWidth !== undefined) patch.faceWidth = input.faceWidth != null ? String(input.faceWidth) : null;
      if (input.legWidth !== undefined) patch.legWidth = input.legWidth != null ? String(input.legWidth) : null;
      if (input.doorOrientation !== undefined) patch.doorOrientation = input.doorOrientation;
      if (input.doorsPerRow !== undefined) patch.doorsPerRow = input.doorsPerRow;
      if (input.drawerLayout !== undefined) patch.drawerLayout = input.drawerLayout;
      if (input.grainDirection !== undefined) patch.grainDirection = input.grainDirection;
      if (input.isDecorativeDoor !== undefined) patch.isDecorativeDoor = input.isDecorativeDoor;
      if (input.layoutSpec !== undefined) patch.layoutSpec = input.layoutSpec;
      if (input.specImageUrl !== undefined) patch.specImageUrl = input.specImageUrl;
      if (input.graphicType !== undefined) patch.graphicType = input.graphicType;
      if (input.specNotes !== undefined) patch.specNotes = input.specNotes;
      if (input.facePattern !== undefined) patch.facePattern = input.facePattern;
      if (input.glassDoorAddonCode !== undefined) patch.glassDoorAddonCode = input.glassDoorAddonCode;
      if (input.configVerified !== undefined) {
        if (input.configVerified) {
          const [distributorConnection] = await db
            .select({ id: distributorSkus.id })
            .from(distributorSkus)
            .where(eq(distributorSkus.cabinetId, input.id))
            .limit(1);
          if (!distributorConnection) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Connect a distributor line and enter its supplier SKU before marking this cabinet verified.",
            });
          }
        }
        patch.configVerified = input.configVerified;
        if (input.configVerified) {
          patch.configVerifiedAt = new Date();
          // configVerifiedByName will be set from ctx if we add it later
        } else {
          patch.configVerifiedAt = null;
          patch.configVerifiedByName = null;
        }
      }
      const requiresPublicPrice = input.isActive === true
        || input.showInCatalog === true
        || input.showInDesigner === true
        || input.showIn2020 === true;
      if (requiresPublicPrice) {
        const [sellableSource] = await db
          .select({ id: distributorSkus.id })
          .from(distributorSkus)
          .where(and(
            eq(distributorSkus.cabinetId, input.id),
            eq(distributorSkus.isAvailable, true),
            eq(distributorSkus.isPublished, true),
            sql`(COALESCE(${distributorSkus.listPrice}, 0) > 0 OR COALESCE(${distributorSkus.yourCost}, 0) > 0)`,
          ))
          .limit(1);
        if (!sellableSource) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A positive published supplier price is required before this item can be active in Catalog or Designer.",
          });
        }
      }
      if (Object.keys(patch).length === 0) return { ok: true };
      // Always stamp configuredAt so the admin list shows when this cabinet was last saved.
      patch.configuredAt = new Date();
      await db.update(cabinets).set(patch).where(eq(cabinets.id, input.id));
      // Aliases are purely informational cross-references.
      // Visibility is controlled exclusively by admin via showInCatalog/showInDesigner toggles.
      return { ok: true };
    }),

  // ── Admin: Upload catalog image for a cabinet ────────────────────────────
  // Accepts a base64 data URL (from a file picker), resizes to the target
  // dimensions for the given slot, uploads to storage, and returns the URL.
  //
  // Slot dimensions:
  //   thumbnail   → 300×300 square (cover crop, WebP)
  //   door-sample → 400×300 rectangular (cover crop, WebP)
  //   room-scene  → 1200×800 rectangular (cover crop, WebP)
  adminUploadCatalogImage: adminProcedure
    .input(
      z.object({
        filename: z.string().min(1),
        dataBase64: z.string().min(1),
        contentType: z.string().default("image/jpeg"),
        slot: z.enum(["thumbnail", "door-sample", "room-scene"]).default("thumbnail"),
      })
    )
    .mutation(async ({ input }) => {
      const raw = input.dataBase64.includes(",")
        ? input.dataBase64.slice(input.dataBase64.indexOf(",") + 1)
        : input.dataBase64;
      const buf = Buffer.from(raw, "base64");

      // Determine target dimensions per slot
      const slotDims: Record<string, { w: number; h: number }> = {
        "thumbnail":   { w: 300,  h: 300  },
        "door-sample": { w: 400,  h: 300  },
        "room-scene":  { w: 1200, h: 800  },
      };
      const { w, h } = slotDims[input.slot];

      // Resize + convert to WebP
      const resized = await sharp(buf)
        .resize(w, h, { fit: "cover", position: "centre" })
        .webp({ quality: 85 })
        .toBuffer();

      const safe = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.[^.]+$/, "");
      const folder = input.slot === "room-scene" ? "room-scenes" : input.slot === "door-sample" ? "door-samples" : "catalog-images";
      const { url } = await storagePut(`${folder}/${Date.now()}_${safe}.webp`, resized, "image/webp");
      return { url };
    }),

  // ── AI Catalog Image Generation ─────────────────────────────────────────────
  // Generates a clean catalog illustration for a generic cabinet based on its
  // configuration (type, dimensions, doors, drawers, shelves), uploads the
  // result to S3, saves the URL on the cabinet record, and returns the URL.
  adminGenerateCatalogImage: adminProcedure
    .input(
      z.object({
        id: z.number(),
        viewMode: z.enum(["3d", "2d"]).default("3d"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [cab] = await db
        .select({
          id: cabinets.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          category: cabinets.category,
          width: cabinets.width,
          height: cabinets.height,
          depth: cabinets.depth,
          numberOfDoors: cabinets.numberOfDoors,
          numberOfDrawers: cabinets.numberOfDrawers,
          numberOfFixedShelves: cabinets.numberOfFixedShelves,
          numberOfAdjShelves: cabinets.numberOfAdjShelves,
        })
        .from(cabinets)
        .where(eq(cabinets.id, input.id))
        .limit(1);

      if (!cab) throw new TRPCError({ code: "NOT_FOUND", message: "Cabinet not found" });

      // Build a detailed prompt for a clean catalog-style illustration
      const parts: string[] = [];
      parts.push(`Clean technical catalog illustration of a kitchen cabinet.`);
      if (cab.category) parts.push(`Cabinet type: ${cab.category}.`);
      if (cab.description) parts.push(`Description: ${cab.description}.`);

      const dims: string[] = [];
      if (cab.width) dims.push(`${parseFloat(cab.width)}" wide`);
      if (cab.height) dims.push(`${parseFloat(cab.height)}" tall`);
      if (cab.depth) dims.push(`${parseFloat(cab.depth)}" deep`);
      if (dims.length) parts.push(`Dimensions: ${dims.join(", ")}.`);

      if (cab.numberOfDoors != null) {
        parts.push(cab.numberOfDoors === 0 ? "No doors (open cabinet)." : `${cab.numberOfDoors} door${cab.numberOfDoors > 1 ? "s" : ""}.`);
      }
      if (cab.numberOfDrawers != null && cab.numberOfDrawers > 0) {
        parts.push(`${cab.numberOfDrawers} drawer${cab.numberOfDrawers > 1 ? "s" : ""}.`);
      }
      const shelves: string[] = [];
      if (cab.numberOfFixedShelves != null && cab.numberOfFixedShelves > 0)
        shelves.push(`${cab.numberOfFixedShelves} fixed shelf${cab.numberOfFixedShelves > 1 ? "ves" : ""}`);
      if (cab.numberOfAdjShelves != null && cab.numberOfAdjShelves > 0)
        shelves.push(`${cab.numberOfAdjShelves} adjustable shelf${cab.numberOfAdjShelves > 1 ? "ves" : ""}`);
      if (shelves.length) parts.push(`Interior: ${shelves.join(" and ")}.`);

      if (input.viewMode === "2d") {
        parts.push(
          "Style: technical architectural line drawing, like a cabinet manufacturer's catalog illustration.",
          "View: flat 2D front-facing elevation, perfectly straight-on, no perspective or depth.",
          "Rendering: thin clean black outlines only, no fill, no shading, no color, no gradients, no shadows, no textures.",
          "Background: pure white (#FFFFFF).",
          "Dimension annotations: red dimension lines with arrows and measurements in inches on the left side and top, matching standard cabinet shop drawing style.",
          "Square image, cabinet fills 80% of the frame. No room context, no countertop, no decorative elements."
        );
      } else {
        parts.push(
          "Style: technical architectural line drawing, like a cabinet manufacturer's catalog illustration.",
          "View: isometric 3D perspective view from slightly above and to the right, showing front face and right side.",
          "Rendering: thin clean black outlines only, no fill, no shading, no color, no gradients, no shadows, no textures.",
          "Background: pure white (#FFFFFF).",
          "Dimension annotations: red dimension lines with arrows and measurements in inches (e.g. '34 1/2', '24') on the left side and top, matching standard cabinet shop drawing style.",
          "One door shown open on the right side to reveal interior.",
          "Square image, cabinet fills 80% of the frame. No room context, no countertop, no decorative elements."
        );
      }

      const prompt = parts.join(" ");

      const result = await generateImage({ prompt });
      const generatedUrl = result.url;
      if (!generatedUrl) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Image generation returned no URL" });

      // Fetch the generated image and re-upload to our own S3 bucket
      const imgResp = await fetch(generatedUrl);
      if (!imgResp.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch generated image" });
      const imgBuf = Buffer.from(await imgResp.arrayBuffer());
      const key = `catalog-images/ai_${cab.masterCode ?? cab.id}_${Date.now()}.png`;
      const { url } = await storagePut(key, imgBuf, "image/png");

      // Persist on the cabinet record
      await db.update(cabinets).set({ catalogImageUrl: url }).where(eq(cabinets.id, input.id));

      return { url };
    }),

  // Smart Measurement Auto-Fill
  // Three-tier strategy:
  //   1. Master sheet data — pull from existing DB rows for this cabinet
  //      (cabinets table + distributor overrides for the same masterCode)
  //   2. Alias cross-reference — look up sibling cabinets via sku_master_aliases
  //      and borrow their stored dimensions if available
  //   3. AI fallback — LLM estimates based on cabinet code, description, and
  //      assembled dimensions (uses industry knowledge + any public specs)
  // The response includes a `source` field so the UI can show where data came from.
  adminEstimateMeasurements: adminProcedure
    .input(
      z.object({
        id: z.number(),
        // Current assembled dims from the modal draft (may be partially filled)
        width: z.string().nullable().optional(),
        height: z.string().nullable().optional(),
        depth: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Load the full cabinet record including all measurement fields
      const [cab] = await db
        .select({
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          category: cabinets.category,
          subCategory: cabinets.subCategory,
          width: cabinets.width,
          height: cabinets.height,
          depth: cabinets.depth,
          physicalWidth: cabinets.physicalWidth,
          weight: cabinets.weight,
          pkgLength: cabinets.pkgLength,
          pkgWidth: cabinets.pkgWidth,
          pkgHeight: cabinets.pkgHeight,
          pkgWeight: cabinets.pkgWeight,
        })
        .from(cabinets)
        .where(eq(cabinets.id, input.id))
        .limit(1);
      if (!cab) throw new TRPCError({ code: "NOT_FOUND" });

      // ── Tier 1: Master sheet data ──────────────────────────────────────────
      // Check if the cabinet already has measurement data stored in the DB.
      const hasStoredMeasurements =
        cab.weight != null ||
        cab.pkgLength != null ||
        cab.pkgWidth != null ||
        cab.pkgHeight != null ||
        cab.pkgWeight != null;

      if (hasStoredMeasurements) {
        return {
          weight: cab.weight ?? null,
          pkgLength: cab.pkgLength ?? null,
          pkgWidth: cab.pkgWidth ?? null,
          pkgHeight: cab.pkgHeight ?? null,
          pkgWeight: cab.pkgWeight ?? null,
          source: "master_sheet" as const,
          sourceLabel: "Filled from master sheet data",
        };
      }

      // ── Tier 2: Distributor overrides for this cabinet ─────────────────────
      // Check if any distributor has dimension overrides for this cabinet.
      const overrides = await db
        .select({
          weight: distributorCabinetOverrides.weight,
          pkgLength: distributorCabinetOverrides.pkgLength,
          pkgWidth: distributorCabinetOverrides.pkgWidth,
          pkgHeight: distributorCabinetOverrides.pkgHeight,
          pkgWeight: distributorCabinetOverrides.pkgWeight,
        })
        .from(distributorCabinetOverrides)
        .where(eq(distributorCabinetOverrides.cabinetId, input.id))
        .limit(5);

      const overrideData = overrides.find(
        (o) => o.weight != null || o.pkgLength != null || o.pkgWeight != null
      );
      if (overrideData) {
        return {
          weight: overrideData.weight ?? null,
          pkgLength: overrideData.pkgLength ?? null,
          pkgWidth: overrideData.pkgWidth ?? null,
          pkgHeight: overrideData.pkgHeight ?? null,
          pkgWeight: overrideData.pkgWeight ?? null,
          source: "distributor_override" as const,
          sourceLabel: "Filled from distributor data",
        };
      }

      // ── Tier 2b: Alias sibling lookup ──────────────────────────────────────
      // If this cabinet has alias codes pointing to it, check if any of those
      // sibling cabinets have measurement data we can borrow.
      if (cab.masterCode) {
        const aliasRows = await db
          .select({ aliasCode: skuMasterAliases.aliasCode })
          .from(skuMasterAliases)
          .where(eq(skuMasterAliases.masterCode, cab.masterCode));

        if (aliasRows.length > 0) {
          const aliasCodes = aliasRows.map((a) => a.aliasCode);
          const siblings = await db
            .select({
              weight: cabinets.weight,
              pkgLength: cabinets.pkgLength,
              pkgWidth: cabinets.pkgWidth,
              pkgHeight: cabinets.pkgHeight,
              pkgWeight: cabinets.pkgWeight,
              masterCode: cabinets.masterCode,
            })
            .from(cabinets)
            .where(inArray(cabinets.masterCode, aliasCodes))
            .limit(5);

          const siblingData = siblings.find(
            (s) => s.weight != null || s.pkgLength != null || s.pkgWeight != null
          );
          if (siblingData) {
            return {
              weight: siblingData.weight ?? null,
              pkgLength: siblingData.pkgLength ?? null,
              pkgWidth: siblingData.pkgWidth ?? null,
              pkgHeight: siblingData.pkgHeight ?? null,
              pkgWeight: siblingData.pkgWeight ?? null,
              source: "alias_sibling" as const,
              sourceLabel: `Filled from alias sibling (${siblingData.masterCode})`,
            };
          }
        }
      }

      // ── Tier 3: AI estimation ──────────────────────────────────────────────
      // No stored data found anywhere. Fall back to LLM estimation based on
      // cabinet code, description, category, and assembled dimensions.
      const w = input.width ?? cab.width;
      const h = input.height ?? cab.height;
      const d = input.depth ?? cab.depth;

      const dimStr = [
        w && `${parseFloat(w)}"W`,
        h && `${parseFloat(h)}"H`,
        d && `${parseFloat(d)}"D`,
      ]
        .filter(Boolean)
        .join(" x ");

      const prompt = [
        `You are a cabinet industry expert. Estimate the assembled weight and flat-pack shipping box dimensions for a Ready-To-Assemble (RTA) kitchen cabinet.`,
        `Cabinet code: ${cab.masterCode ?? "unknown"}.`,
        cab.description ? `Description: ${cab.description}.` : "",
        cab.category
          ? `Category: ${cab.category}${cab.subCategory ? ` / ${cab.subCategory}` : ""}.`
          : "",
        dimStr ? `Assembled dimensions: ${dimStr}.` : "",
        `Use your knowledge of RTA cabinet industry standards and any publicly available specifications for this cabinet code to provide the most accurate estimates possible.`,
        `IMPORTANT: This is a flat-pack RTA cabinet. The package is flat -- typically only 6 to 8 inches thick -- NOT a full-depth box.`,
        `The box length and width roughly match the cabinet face dimensions (assembled width x assembled height), and the box thickness is 6-8 inches.`,
        `For an 8-foot (96-inch) tall cabinet the box length will be approximately 96 inches.`,
        `Respond ONLY with a JSON object (no markdown, no explanation) with these exact keys:`,
        `{ "weight": "<assembled weight in lbs>", "pkgLength": "<box longest side in inches>", "pkgWidth": "<box second side in inches>", "pkgHeight": "<box thickness in inches, typically 6-8>", "pkgWeight": "<shipping weight in lbs, typically 5-10% more than assembled>" }`,
        `All values must be numeric strings only (no units, no extra text).`,
      ]
        .filter(Boolean)
        .join(" ");

      const result = await invokeLLM({
        messages: [{ role: "user", content: prompt }],
        maxTokens: 200,
        responseFormat: { type: "json_object" },
      });

      const raw = result.choices[0]?.message?.content;
      const text =
        typeof raw === "string"
          ? raw
          : Array.isArray(raw)
          ? raw
              .map((c) =>
                typeof c === "object" && "text" in c ? (c as { text: string }).text : ""
              )
              .join("")
          : "";

      let parsed: Record<string, string> = {};
      try {
        parsed = JSON.parse(text) as Record<string, string>;
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AI returned invalid JSON",
        });
      }

      return {
        weight: parsed.weight ?? null,
        pkgLength: parsed.pkgLength ?? null,
        pkgWidth: parsed.pkgWidth ?? null,
        pkgHeight: parsed.pkgHeight ?? null,
        pkgWeight: parsed.pkgWeight ?? null,
        source: "ai_estimate" as const,
        sourceLabel: "AI estimate — review and adjust as needed",
      };
    }),

  // ── Cabinet Line Export ───────────────────────────────────────────────────
  // Returns an XLSX workbook with all cabinets available for a given door style,
  // including description, dimensions, pricing, and catalog image URL.
  // The caller can optionally pass a list of cabinetIds to restrict the export.
  cabinetLineExport: adminProcedure
    .input(
      z.object({
        styleId: z.number(),
        cabinetIds: z.array(z.number()).optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { xlsx: "", filename: "cabinet-line.xlsx", count: 0 };

      // Load the Margins tab settings so we can compute correct tier prices.
      const ps = await getPricingSettings();

      // Fetch all cabinets for this style with pricing.
      const rows = await db
        .select({
          id: cabinets.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          category: cabinets.category,
          subCategory: cabinets.subCategory,
          placement: cabinets.placementType,
          width: cabinets.width,
          height: cabinets.height,
          depth: cabinets.depth,
          numberOfDoors: cabinets.numberOfDoors,
          numberOfDrawers: cabinets.numberOfDrawers,
          catalogImageUrl: cabinets.catalogImageUrl,
          wholesalePrice: distributorSkus.wholesalePrice,
          adjustedListPrice: distributorSkus.adjustedListPrice,
          listPrice: distributorSkus.listPrice,
          yourCost: distributorSkus.yourCost,
          retailPriceBasis: distributors.retailPriceBasis,
        })
        .from(cabinets)
        .innerJoin(
          distributorSkus,
          and(
            eq(distributorSkus.cabinetId, cabinets.id),
            eq(distributorSkus.styleId, input.styleId),
            eq(distributorSkus.isPublished, true),
            eq(distributorSkus.isAvailable, true)
          )
        )
        .innerJoin(distributors, eq(distributors.id, distributorSkus.distributorId))
        .where(
          and(
            eq(cabinets.isActive, true),
            input.cabinetIds && input.cabinetIds.length > 0
              ? inArray(cabinets.id, input.cabinetIds)
              : undefined
          )
        )
        .orderBy(cabinets.category, cabinets.masterCode);

      // Build XLSX — compute contractor/homeowner prices from Margins tab markup settings.
      const { sellPriceForTier } = await import("../../shared/margins");
      const XLSX = await import("xlsx");
      const wsData = [
        ["masterCode", "description", "category", "subCategory", "placement",
         "width", "height", "depth", "doors", "drawers",
         "yourCost", "wholesalePrice", "contractorPrice", "homeownerPrice", "imageUrl"],
        ...rows.map((r) => {
          const costRow = {
            yourCost: r.yourCost,
            wholesalePrice: r.wholesalePrice,
            adjustedListPrice: r.adjustedListPrice,
            listPrice: r.listPrice,
            retailPriceBasis: r.retailPriceBasis,
          };
          const contractorPrice = sellPriceForTier(costRow, ps, "contractor");
          const homeownerPrice = sellPriceForTier(costRow, ps, "homeowner");
          return [
            r.masterCode ?? "",
            r.description ?? "",
            r.category ?? "",
            r.subCategory ?? "",
            r.placement ?? "",
            r.width ?? "",
            r.height ?? "",
            r.depth ?? "",
            r.numberOfDoors ?? "",
            r.numberOfDrawers ?? "",
            r.yourCost != null ? Number(r.yourCost) : "",
            r.wholesalePrice != null ? Number(r.wholesalePrice) : "",
            contractorPrice ?? "",
            homeownerPrice ?? "",
            r.catalogImageUrl ?? "",
          ];
        }),
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Cabinets");
      const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      const xlsx = buf.toString("base64");
      const filename = `cabinet-line-style-${input.styleId}.xlsx`;
      return { xlsx, filename, count: rows.length };
    }),

  // ── Admin: Bulk Dimensions & Weight editor ────────────────────────────────
  // Returns all cabinets with their assembled + package dimensions and weight
  // so the admin can review and correct them in a table view.
  adminListDimensions: adminProcedure
    .input(
      z.object({
        page: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(200).default(100),
        missingOnly: z.boolean().default(false),
        search: z.string().optional(),
        category: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rows: [], total: 0 };
      const conditions = [];
      if (input.missingOnly) {
        conditions.push(
          sql`(${cabinets.weight} IS NULL OR ${cabinets.weight} = 0 OR ${cabinets.pkgLength} IS NULL OR ${cabinets.pkgWidth} IS NULL OR ${cabinets.pkgHeight} IS NULL OR ${cabinets.pkgWeight} IS NULL)`
        );
      }
      if (input.search) {
        const search = input.search.trim();
        const like = `%${search}%`;
        const normalizedCodeSearch = normalizeCode(search);
        const normalizedMasterCode = sql`UPPER(REPLACE(REPLACE(REPLACE(${cabinets.masterCode}, '-', ''), ' ', ''), '_', ''))`;
        conditions.push(
          sql`(${cabinets.masterCode} LIKE ${like} OR ${cabinets.description} LIKE ${like} OR ${normalizedMasterCode} LIKE ${`%${normalizedCodeSearch}%`})`
        );
      }
      if (input.category) {
        conditions.push(eq(cabinets.category, input.category));
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const [rows, countRows] = await Promise.all([
        db
          .select({
            id: cabinets.id,
            masterCode: cabinets.masterCode,
            description: cabinets.description,
            category: cabinets.category,
            subCategory: cabinets.subCategory,
            width: cabinets.width,
            height: cabinets.height,
            depth: cabinets.depth,
            weight: cabinets.weight,
            pkgLength: cabinets.pkgLength,
            pkgWidth: cabinets.pkgWidth,
            pkgHeight: cabinets.pkgHeight,
            pkgWeight: cabinets.pkgWeight,
            catalogImageUrl: cabinets.catalogImageUrl,
            // Pull the first available SKU image as a thumbnail fallback
            skuImageUrl: sql<string | null>`(SELECT imageUrl FROM distributor_skus WHERE cabinetId = ${cabinets.id} AND imageUrl IS NOT NULL AND isAvailable = 1 AND isPublished = 1 LIMIT 1)`,
          })
          .from(cabinets)
          .where(where)
          .orderBy(asc(cabinets.masterCode))
          .limit(input.limit)
          .offset(input.page * input.limit),
        db
          .select({ count: sql<number>`count(*)` })
          .from(cabinets)
          .where(where),
      ]);
      // Merge: prefer catalogImageUrl, fall back to first SKU image
      const enriched = rows.map((r) => ({
        ...r,
        catalogImageUrl: r.catalogImageUrl || r.skuImageUrl || null,
      }));
      return { rows: enriched, total: Number(countRows[0]?.count ?? 0) };
    }),

  // ── Admin: Cabinet Configuration editor ─────────────────────────────────
  // Returns all cabinets with their depth, door, drawer, and shelf counts for
  // bulk editing in the /admin/cabinet-config page.
  adminListCabinetConfig: adminProcedure
    .input(
      z.object({
        page: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(200).default(100),
        search: z.string().optional(),
        category: z.string().optional(),
        unconfiguredOnly: z.boolean().default(false),
        verifiedFilter: z.enum(["all", "verified", "unverified"]).default("all"),
        attentionOnly: z.boolean().default(false),
        distributorId: z.number().int().positive().optional(),
        cabinetId: z.number().int().positive().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rows: [], total: 0 };
	      const conditions: SQL[] = [
	        // Retired duplicates remain in the database for price/order history, but
	        // appear only as aliases under the canonical master in every admin list.
	        isCanonicalCabinetMaster(),
	      ];
      if (input.unconfiguredOnly) {
        conditions.push(
          sql`(${cabinets.numberOfDoors} IS NULL AND ${cabinets.numberOfDrawers} IS NULL AND ${cabinets.numberOfFixedShelves} IS NULL AND ${cabinets.numberOfAdjShelves} IS NULL)`
        );
      }
      if (input.verifiedFilter === "verified") {
        conditions.push(eq(cabinets.configVerified, true));
      } else if (input.verifiedFilter === "unverified") {
        conditions.push(eq(cabinets.configVerified, false));
      }
      if (input.attentionOnly) {
        conditions.push(hasPositivePublishedCabinetPrice());
        conditions.push(sql`(
          ${cabinets.isActive} = false
          OR ${cabinets.configVerified} = false
        )`);
      }
      if (input.distributorId) {
        conditions.push(sql`EXISTS (
          SELECT 1
          FROM distributor_skus attention_distributor_skus
          WHERE attention_distributor_skus.cabinetId = ${cabinets.id}
            AND attention_distributor_skus.distributorId = ${input.distributorId}
        )`);
      }
      if (input.cabinetId) {
        conditions.push(eq(cabinets.id, input.cabinetId));
      }
      const search = input.search?.trim();
      if (search) {
        const like = `%${search}%`;
        const normalizedCodeSearch = normalizeCode(search);
        conditions.push(sql`(
          ${cabinets.masterCode} LIKE ${like}
          OR UPPER(REPLACE(REPLACE(REPLACE(${cabinets.masterCode}, '-', ''), ' ', ''), '_', '')) LIKE ${`%${normalizedCodeSearch}%`}
          OR ${cabinets.sku} LIKE ${like}
          OR UPPER(REPLACE(REPLACE(REPLACE(${cabinets.sku}, '-', ''), ' ', ''), '_', '')) LIKE ${`%${normalizedCodeSearch}%`}
          OR ${cabinets.vendorSku} LIKE ${like}
          OR UPPER(REPLACE(REPLACE(REPLACE(${cabinets.vendorSku}, '-', ''), ' ', ''), '_', '')) LIKE ${`%${normalizedCodeSearch}%`}
          OR ${cabinets.altSku1} LIKE ${like}
          OR UPPER(REPLACE(REPLACE(REPLACE(${cabinets.altSku1}, '-', ''), ' ', ''), '_', '')) LIKE ${`%${normalizedCodeSearch}%`}
          OR ${cabinets.altSku2} LIKE ${like}
          OR UPPER(REPLACE(REPLACE(REPLACE(${cabinets.altSku2}, '-', ''), ' ', ''), '_', '')) LIKE ${`%${normalizedCodeSearch}%`}
          OR ${cabinets.altSku3} LIKE ${like}
          OR UPPER(REPLACE(REPLACE(REPLACE(${cabinets.altSku3}, '-', ''), ' ', ''), '_', '')) LIKE ${`%${normalizedCodeSearch}%`}
          OR ${cabinets.description} LIKE ${like}
          OR EXISTS (
            SELECT 1
            FROM cabinet_aliases cabinet_config_aliases
            WHERE cabinet_config_aliases.cabinetId = ${cabinets.id}
              AND (
                cabinet_config_aliases.alias LIKE ${like}
                OR UPPER(REPLACE(REPLACE(REPLACE(cabinet_config_aliases.alias, '-', ''), ' ', ''), '_', '')) LIKE ${`%${normalizedCodeSearch}%`}
              )
          )
          OR EXISTS (
            SELECT 1
            FROM sku_master_aliases cabinet_master_aliases
            WHERE cabinet_master_aliases.masterCode = ${cabinets.masterCode}
              AND (
                cabinet_master_aliases.aliasCode LIKE ${like}
                OR UPPER(REPLACE(REPLACE(REPLACE(cabinet_master_aliases.aliasCode, '-', ''), ' ', ''), '_', '')) LIKE ${`%${normalizedCodeSearch}%`}
              )
          )
        )`);
      }
      if (input.category) {
        conditions.push(eq(cabinets.category, input.category));
      }
      const where = and(...conditions);
      const [rows, countRows] = await Promise.all([
        db
          .select({
            id: cabinets.id,
            masterCode: cabinets.masterCode,
            description: cabinets.description,
            category: cabinets.category,
            subCategory: cabinets.subCategory,
            width: cabinets.width,
            height: cabinets.height,
            depth: cabinets.depth,
            numberOfDoors: cabinets.numberOfDoors,
            numberOfDrawers: cabinets.numberOfDrawers,
            numberOfFixedShelves: cabinets.numberOfFixedShelves,
            numberOfAdjShelves: cabinets.numberOfAdjShelves,
            isNotCabinet: cabinets.isNotCabinet,
            catalogImageUrl: cabinets.catalogImageUrl,
            weight: cabinets.weight,
            physicalWidth: cabinets.physicalWidth,
            pkgLength: cabinets.pkgLength,
            pkgWidth: cabinets.pkgWidth,
            pkgHeight: cabinets.pkgHeight,
            pkgWeight: cabinets.pkgWeight,
            altSku1: cabinets.altSku1,
            altSku2: cabinets.altSku2,
            altSku3: cabinets.altSku3,
            showInCatalog: cabinets.showInCatalog,
            showInDesigner: cabinets.showInDesigner,
            showIn2020: cabinets.showIn2020,
            isActive: cabinets.isActive,
            hasPositivePublishedPrice: hasPositivePublishedCabinetPrice(),
            distributorNames: sql<string | null>`(
              SELECT GROUP_CONCAT(
                DISTINCT COALESCE(NULLIF(d.brandName, ''), d.name)
                ORDER BY COALESCE(NULLIF(d.brandName, ''), d.name)
                SEPARATOR ' | '
              )
              FROM distributor_skus ds
              INNER JOIN distributors d ON d.id = ds.distributorId
              WHERE ds.cabinetId = cabinets.id
            )`,
            // Blind corner pull spec
            minPull: cabinets.minPull,
            maxPull: cabinets.maxPull,
            openingWidth: cabinets.openingWidth,
            openingHeight: cabinets.openingHeight,
            // Appliance opening type
            openingType: cabinets.openingType,
            // Door height for opening calculation
            doorHeight: cabinets.doorHeight,
            drawerHeight: cabinets.drawerHeight,
            // Corner cabinet type
            cornerType: cabinets.cornerType,
            // Corner measurement fields
            shelfRadius: cabinets.shelfRadius,
            shelfCount: cabinets.shelfCount,
            cabinetSquare: cabinets.cabinetSquare,
            faceWidth: cabinets.faceWidth,
            legWidth: cabinets.legWidth,
            // Timestamps
            configuredAt: cabinets.configuredAt,
            // Verified status
            configVerified: cabinets.configVerified,
            configVerifiedAt: cabinets.configVerifiedAt,
            // Door orientation
            doorOrientation: cabinets.doorOrientation,
            // Doors per row (side-by-side count)
            doorsPerRow: cabinets.doorsPerRow,
            // Drawer layout JSON
            drawerLayout: cabinets.drawerLayout,
            // Panel fields
            grainDirection: cabinets.grainDirection,
            isDecorativeDoor: cabinets.isDecorativeDoor,
            // Visual layout spec
            layoutSpec: cabinets.layoutSpec,
            // Spec book line drawing + notes
            specImageUrl: cabinets.specImageUrl,
            specNotes: cabinets.specNotes,
            // Face pattern for specialty open-front cabinets
            facePattern: cabinets.facePattern,
            // Glass door add-on SKU (same distributor only)
            glassDoorAddonCode: cabinets.glassDoorAddonCode,
          })
          .from(cabinets)
          .where(where)
          .orderBy(asc(cabinets.category), asc(cabinets.masterCode))
          .limit(input.limit)
          .offset(input.page * input.limit),
        db.select({ count: sql<number>`count(*)` }).from(cabinets).where(where),
      ]);
      return { rows, total: Number(countRows[0]?.count ?? 0) };
    }),

  // ── Admin: Unpriced master records ───────────────────────────────────────
  // This is deliberately separate from Cabinet Attention: an item with a
  // distributor connection needs a price entered; an item with no distributor
  // connection is invalid master data and can be removed safely from this queue.
  adminListUnpricedCabinets: adminProcedure
    .input(z.object({
      page: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(200).default(100),
      search: z.string().trim().optional(),
      unlinkedOnly: z.boolean().default(false),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rows: [], total: 0 };

      const conditions: SQL[] = [
        isCanonicalCabinetMaster(),
        sql`NOT ${hasPositivePublishedCabinetPrice()}`,
      ];
      if (input.unlinkedOnly) {
        conditions.push(sql`NOT EXISTS (
          SELECT 1 FROM distributor_skus unpriced_supplier_link
          WHERE unpriced_supplier_link.cabinetId = ${cabinets.id}
        )`);
      }
      const search = input.search?.trim();
      if (search) {
        const like = `%${search}%`;
        const normalizedCodeSearch = normalizeCode(search);
        conditions.push(sql`(
          ${cabinets.masterCode} LIKE ${like}
          OR ${cabinets.description} LIKE ${like}
          OR UPPER(REPLACE(REPLACE(REPLACE(${cabinets.masterCode}, '-', ''), ' ', ''), '_', '')) LIKE ${`%${normalizedCodeSearch}%`}
        )`);
      }
      const where = and(...conditions);
      const [rows, countRows] = await Promise.all([
        db.select({
          id: cabinets.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          category: cabinets.category,
          width: cabinets.width,
          height: cabinets.height,
          catalogImageUrl: cabinets.catalogImageUrl,
          isActive: cabinets.isActive,
          supplierSkuCount: sql<number>`(
            SELECT COUNT(*) FROM distributor_skus unpriced_supplier_count
            WHERE unpriced_supplier_count.cabinetId = \`cabinets\`.\`id\`
          )`,
          distributorNames: sql<string | null>`(
            SELECT GROUP_CONCAT(
              DISTINCT COALESCE(NULLIF(unpriced_distributors.brandName, ''), unpriced_distributors.name)
              ORDER BY COALESCE(NULLIF(unpriced_distributors.brandName, ''), unpriced_distributors.name)
              SEPARATOR ' | '
            )
            FROM distributor_skus unpriced_skus
            INNER JOIN distributors unpriced_distributors ON unpriced_distributors.id = unpriced_skus.distributorId
            WHERE unpriced_skus.cabinetId = \`cabinets\`.\`id\`
          )`,
        })
          .from(cabinets)
          .where(where)
          .orderBy(asc(cabinets.category), asc(cabinets.masterCode))
          .limit(input.limit)
          .offset(input.page * input.limit),
        db.select({ count: sql<number>`COUNT(*)` }).from(cabinets).where(where),
      ]);
      return { rows, total: Number(countRows[0]?.count ?? 0) };
    }),

  /**
   * Removes only an invalid, unpriced master with no distributor SKU connection.
   * Orders, carts, saved layout zones, and any now-linked supplier item are hard
   * stops, so this action cannot erase a historical or sellable product.
   */
  adminDeleteUnlinkedUnpricedCabinet: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [cabinet] = await db
        .select({ id: cabinets.id, masterCode: cabinets.masterCode })
        .from(cabinets)
        .where(eq(cabinets.id, input.id))
        .limit(1);
      if (!cabinet) throw new TRPCError({ code: "NOT_FOUND", message: "Catalog item not found" });

      const [supplierLink, orderReference, cartReference, zoneReference, savedDesignReference, costLogReference, productViewReference] = await Promise.all([
        db.select({ id: distributorSkus.id }).from(distributorSkus).where(eq(distributorSkus.cabinetId, input.id)).limit(1),
        db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.cabinetId, input.id)).limit(1),
        db.select({ id: cartItems.id }).from(cartItems).where(eq(cartItems.cabinetId, input.id)).limit(1),
        db.select({ id: designLayoutZoneSelections.id }).from(designLayoutZoneSelections).where(eq(designLayoutZoneSelections.cabinetId, input.id)).limit(1),
        db.select({ id: kitchenDesigns.id }).from(kitchenDesigns).where(
          sql`JSON_SEARCH(COALESCE(${kitchenDesigns.placedCabinets}, JSON_ARRAY()), 'one', ${String(input.id)}) IS NOT NULL`,
        ).limit(1),
        db.select({ id: costChangeLog.id }).from(costChangeLog).where(eq(costChangeLog.cabinetId, input.id)).limit(1),
        db.select({ id: productViews.id }).from(productViews).where(eq(productViews.cabinetId, input.id)).limit(1),
      ]);
      if (supplierLink) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This item has a distributor link. Add a positive supplier price instead of deleting it." });
      }
      if (orderReference || cartReference || zoneReference || savedDesignReference || costLogReference || productViewReference) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This item is referenced by an order, cart, saved design, audit record, or product view and cannot be deleted." });
      }

      await db.transaction(async (tx) => {
        await tx.delete(cabinetAliases).where(eq(cabinetAliases.cabinetId, input.id));
        await tx.delete(codeAliases).where(eq(codeAliases.cabinetId, input.id));
        await tx.delete(distributorCabinetOverrides).where(eq(distributorCabinetOverrides.cabinetId, input.id));
        await tx.delete(cabinetDistributorEligibility).where(eq(cabinetDistributorEligibility.cabinetId, input.id));
        await tx.delete(cabinet3dPreviews).where(eq(cabinet3dPreviews.cabinetId, input.id));
        await tx.delete(skuMasterAliases).where(eq(skuMasterAliases.masterCode, cabinet.masterCode));
        await tx.delete(cabinets).where(eq(cabinets.id, input.id));
      });

      return { ok: true, masterCode: cabinet.masterCode };
    }),

  // ── Admin: Distributor lines represented in the Cabinet Attention queue ──
  // Price-missing records are intentionally absent here; Unpriced Items owns
  // all pricing remediation so it cannot be mistaken for a config issue.
  adminListAttentionDistributors: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    return db
      .selectDistinct({
        id: distributors.id,
        name: sql<string>`COALESCE(NULLIF(${distributors.brandName}, ''), ${distributors.name})`,
      })
      .from(distributorSkus)
      .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
      .innerJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
      .where(
        and(
	          isCanonicalCabinetMaster(),
          hasPositivePublishedCabinetPrice(),
          sql`(
            ${cabinets.isActive} = false
            OR ${cabinets.configVerified} = false
          )`
        )
      )
      .orderBy(sql`COALESCE(NULLIF(${distributors.brandName}, ''), ${distributors.name})`);
  }),

  // Returns a coverage matrix: for each cabinet, which door styles have at least
  // one published+available SKU, and which are missing. Used in the Designer
  // Coverage admin view to spot gaps.
  adminDesignerCoverage: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        category: z.string().optional(),
        gapsOnly: z.boolean().default(false),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { cabinets: [], styles: [] };

      // 1. All active door styles
      const allStyles = await db
        .select({
          id: doorStyles.id,
          ourName: doorStyles.ourName,
          styleCode: doorStyles.styleCode,
          featuredLabel: doorStyles.featuredLabel,
          distributorId: doorStyles.distributorId,
        })
        .from(doorStyles)
        .where(eq(doorStyles.isActive, true))
        .orderBy(asc(doorStyles.ourName));

      // 2. All cabinets matching filters
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const conditions: any[] = [eq(cabinets.isActive, true)];
      if (input.search) {
        const search = input.search.trim();
        const like = `%${search}%`;
        const normalizedCodeSearch = normalizeCode(search);
        const normalizedMasterCode = sql`UPPER(REPLACE(REPLACE(REPLACE(${cabinets.masterCode}, '-', ''), ' ', ''), '_', ''))`;
        conditions.push(
          sql`(${cabinets.masterCode} LIKE ${like} OR ${cabinets.description} LIKE ${like} OR ${normalizedMasterCode} LIKE ${`%${normalizedCodeSearch}%`})`
        );
      }
      if (input.category) {
        conditions.push(eq(cabinets.category, input.category));
      }
      const cabinetRows = await db
        .select({
          id: cabinets.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          category: cabinets.category,
          showInDesigner: cabinets.showInDesigner,
        })
        .from(cabinets)
        .where(and(...conditions))
        .orderBy(asc(cabinets.masterCode));

      if (cabinetRows.length === 0) return { cabinets: [], styles: allStyles };

      // 3. All coverage rows: which (cabinetId, styleId) pairs have a SKU
      const cabinetIds = cabinetRows.map((c) => c.id);
      const coverageRows = await db
        .select({
          cabinetId: distributorSkus.cabinetId,
          styleId: distributorSkus.styleId,
        })
        .from(distributorSkus)
        .where(
          and(
            inArray(distributorSkus.cabinetId, cabinetIds),
            eq(distributorSkus.isAvailable, true),
            eq(distributorSkus.isPublished, true)
          )
        );

      // Build a Set of "cabinetId:styleId" for O(1) lookup
      const covered = new Set(coverageRows.map((r) => `${r.cabinetId}:${r.styleId}`));

      // 4. Enrich each cabinet with per-style coverage flags
      const styleIds = allStyles.map((s) => s.id);
      const enrichedCabinets = cabinetRows.map((cab) => {
        const coverage: Record<number, boolean> = {};
        let coveredCount = 0;
        for (const sid of styleIds) {
          const has = covered.has(`${cab.id}:${sid}`);
          coverage[sid] = has;
          if (has) coveredCount++;
        }
        return {
          ...cab,
          coverage,
          coveredCount,
          totalStyles: styleIds.length,
          hasGaps: coveredCount < styleIds.length,
        };
      });

      const result = input.gapsOnly
        ? enrichedCabinets.filter((c) => c.hasGaps)
        : enrichedCabinets;

      return { cabinets: result, styles: allStyles };
    }),

  // ─── Admin cabinet management stubs ─────────────────────────────────────────────
  adminCreateCabinet: adminProcedure
    .input(z.object({
      masterCode: z.string(),
      description: z.string().optional(),
      ourName: z.string().optional(),
      category: z.string(),
      subCategory: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      depth: z.number().optional(),
      placementType: z.string().optional(),
      numberOfDoors: z.number().optional(),
      numberOfDrawers: z.number().optional(),
      hingeSide: z.string().optional(),
      isActive: z.boolean().optional(),
      doorStyleId: z.number().optional(),
      distributorId: z.number().optional(),
      distributorSku: z.object({
        distributorId: z.number(),
        styleId: z.number(),
        distributorSku: z.string(),
        listPrice: z.number().optional(),
        yourCost: z.number().optional(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (input.isActive === true) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Create the item as a Draft, then publish it through Catalog after an available positive supplier price is saved.",
        });
      }
      const [result] = await db.insert(cabinets).values({
        masterCode: input.masterCode,
        category: input.category,
        subCategory: input.subCategory ?? null,
        description: input.description ?? "",
        isActive: false,
        showInCatalog: false,
        showInDesigner: false,
        showIn2020: false,
      });
      const cabinetId = (result as any).insertId as number;
      let skuId: number | undefined;
      if (input.distributorSku) {
        const [skuResult] = await db.insert(distributorSkus).values({
          cabinetId,
          distributorId: input.distributorSku.distributorId,
          styleId: input.distributorSku.styleId,
          distributorSku: input.distributorSku.distributorSku,
          platformSku: `${input.masterCode}-${input.distributorSku.distributorSku}`,
          listPrice: input.distributorSku.listPrice != null ? String(input.distributorSku.listPrice) : null,
          yourCost: input.distributorSku.yourCost != null ? String(input.distributorSku.yourCost) : null,
          isAvailable: true,
          isPublished: false,
        });
        skuId = (skuResult as any).insertId;
      }
      return { id: cabinetId, masterCode: input.masterCode, skuId, ok: true };
    }),

  adminListFlaggedDescriptions: adminProcedure
    .input(z.object({ limit: z.number().optional(), offset: z.number().optional() }).optional())
    .query(async () =>
      [] as Array<{ id: number; masterCode: string; original: string; suggested: string; matchedBrands: string[] }>
    ),

  adminSaveCleanedDescriptions: adminProcedure
    .input(z.array(z.object({ id: z.number(), description: z.string() })))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      for (const item of input) {
        await db.update(cabinets).set({ description: item.description }).where(eq(cabinets.id, item.id));
      }
      return { updated: input.length };
    }),

  adminListMissingImages: adminProcedure
    .input(z.object({ page: z.number().optional(), pageSize: z.number().optional(), search: z.string().optional(), limit: z.number().optional(), offset: z.number().optional() }).optional())
    .query(async () => ({
      items: [] as Array<{
        id: number;
        masterCode: string;
        description: string;
        category: string;
        subCategory: string | null;
        conflictStatus: string;
        catalogImageUrl: string | null;
      }>,
      total: 0,
    })),

  adminFixCabinetImage: adminProcedure
    .input(z.object({ id: z.number(), imageUrl: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(cabinets).set({ catalogImageUrl: input.imageUrl }).where(eq(cabinets.id, input.id));
      return { ok: true, conflictCleared: false };
    }),

  adminBulkFixCabinetImages: adminProcedure
    .input(z.object({ ids: z.array(z.number()), imageUrl: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      for (const id of input.ids) {
        await db.update(cabinets).set({ catalogImageUrl: input.imageUrl }).where(eq(cabinets.id, id));
      }
      return { updated: input.ids.length, conflictsCleared: 0 };
    }),

  /** List unpublished SKUs for admin review (Pending Review tab). */
  adminListPendingReview: adminProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        category: z.string().optional(),
        search: z.string().optional(),
        isRollout: z.boolean().optional(), // filter to rollout-shelf items
        limit: z.number().int().min(1).max(500).default(100),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const conds: SQL[] = [eq(distributorSkus.isPublished, false), eq(cabinets.isActive, true)];
      if (input.distributorId) conds.push(eq(distributorSkus.distributorId, input.distributorId));
      if (input.category) conds.push(eq(cabinets.category, input.category));
      if (input.isRollout === true) {
        conds.push(sql`(${cabinets.masterCode} REGEXP '(1RS|2RS|3RS|FH1RS|FH2RS|FH3RS)$')`);
      } else if (input.isRollout === false) {
        conds.push(sql`(${cabinets.masterCode} NOT REGEXP '(1RS|2RS|3RS|FH1RS|FH2RS|FH3RS)$')`);
      }
      if (input.search) {
        const search = input.search.trim();
        const like = `%${search}%`;
        const normalizedCodeSearch = normalizeCode(search);
        const normalizedMasterCode = sql`UPPER(REPLACE(REPLACE(REPLACE(${cabinets.masterCode}, '-', ''), ' ', ''), '_', ''))`;
        conds.push(sql`(${cabinets.masterCode} LIKE ${like} OR ${cabinets.description} LIKE ${like} OR ${normalizedMasterCode} LIKE ${`%${normalizedCodeSearch}%`})`);
      }

      const where = and(...conds);

      const [items, [tot]] = await Promise.all([
        db
          .select({
            skuId: distributorSkus.id,
            cabinetId: cabinets.id,
            masterCode: cabinets.masterCode,
            description: cabinets.description,
            category: cabinets.category,
            subCategory: cabinets.subCategory,
            width: cabinets.width,
            height: cabinets.height,
            distributorId: distributorSkus.distributorId,
            distributorBrandName: distributors.brandName,
            styleId: distributorSkus.styleId,
            styleName: doorStyles.ourName,
            styleCode: doorStyles.styleCode,
            platformSku: distributorSkus.platformSku,
            distributorSku: distributorSkus.distributorSku,
            listPrice: distributorSkus.listPrice,
            isAvailable: distributorSkus.isAvailable,
            isPublished: distributorSkus.isPublished,
          })
          .from(distributorSkus)
          .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
          .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
          .innerJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
          .where(where)
          .orderBy(asc(cabinets.category), asc(cabinets.masterCode), asc(doorStyles.styleCode))
          .limit(input.limit)
          .offset(input.offset),
        db
          .select({ n: sql<number>`count(*)` })
          .from(distributorSkus)
          .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
          .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
          .innerJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
          .where(where),
      ]);

      return { items, total: Number(tot?.n ?? 0) };
    }),

  /** Pending supplier links created while configuring a cabinet. These stay unpublished until pricing is approved. */
  adminListPendingDistributorConnections: adminProcedure
    .input(
      z.object({
        distributorId: z.number().optional(),
        search: z.string().trim().max(128).optional(),
        limit: z.number().int().min(1).max(200).default(100),
        offset: z.number().int().min(0).default(0),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const args: { distributorId?: number; search?: string; limit?: number; offset?: number } = input ?? {};
      const conditions: SQL[] = [
        eq(distributorSkus.status, "pending"),
        eq(distributorSkus.isPublished, false),
      ];
      if (args.distributorId) conditions.push(eq(distributorSkus.distributorId, args.distributorId));
      if (args.search) {
        const search = args.search.trim();
        const like = `%${search}%`;
        const normalizedCodeSearch = normalizeCode(search);
        const normalizedMasterCode = sql`UPPER(REPLACE(REPLACE(REPLACE(${cabinets.masterCode}, '-', ''), ' ', ''), '_', ''))`;
        const normalizedSupplierCode = sql`UPPER(REPLACE(REPLACE(REPLACE(${distributorSkus.distributorSku}, '-', ''), ' ', ''), '_', ''))`;
        const normalizedPlatformCode = sql`UPPER(REPLACE(REPLACE(REPLACE(${distributorSkus.platformSku}, '-', ''), ' ', ''), '_', ''))`;
        conditions.push(sql`(
          ${cabinets.masterCode} LIKE ${like}
          OR ${cabinets.description} LIKE ${like}
          OR ${distributorSkus.distributorSku} LIKE ${like}
          OR ${distributorSkus.platformSku} LIKE ${like}
          OR ${normalizedMasterCode} LIKE ${`%${normalizedCodeSearch}%`}
          OR ${normalizedSupplierCode} LIKE ${`%${normalizedCodeSearch}%`}
          OR ${normalizedPlatformCode} LIKE ${`%${normalizedCodeSearch}%`}
        )`);
      }
      const where = and(...conditions);
      const [items, [totalRow]] = await Promise.all([
        db
          .select({
            skuId: distributorSkus.id,
            cabinetId: cabinets.id,
            masterCode: cabinets.masterCode,
            description: cabinets.description,
            catalogImageUrl: cabinets.catalogImageUrl,
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
            createdAt: distributorSkus.createdAt,
          })
          .from(distributorSkus)
          .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
          .innerJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
          .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
          .where(where)
          .orderBy(asc(distributorSkus.createdAt), asc(cabinets.masterCode))
          .limit(args.limit ?? 100)
          .offset(args.offset ?? 0),
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(distributorSkus)
          .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
          .innerJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
          .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
          .where(where),
      ]);
      return { items, total: Number(totalRow?.count ?? 0) };
    }),

  /**
   * Apply spec book images and notes to all matching cabinets based on SKU pattern rules.
   * This re-runs the same REGEXP-based population logic from populate_specs.py.
   * Only updates cabinets where specImageUrl is currently NULL or empty.
   * Pass force=true to overwrite existing values.
   */
  adminApplySpecsToAll: adminProcedure
    .input(z.object({ force: z.boolean().default(false) })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Family → image URL + notes
      const families: Array<{ conditions: string[]; imageUrl: string; notes: string }> = [
        { conditions: ["masterCode REGEXP '^B[0-9]{1,2}FH$'", "masterCode REGEXP '^BT9'", "masterCode REGEXP '^B[0-9]+FH[0-9]*RS'", "masterCode REGEXP '^B[0-9]+FH[0-9]*TCPO'", "masterCode REGEXP '^B[0-9]+FH[0-9]*TD'"], imageUrl: "/manus-storage/base_full_height_single_ab045451.png", notes: 'Full height single door base. Cabinet dimensions: H 34½", D 24". Door height 29". Soft-close hinges standard.' },
        { conditions: ["masterCode REGEXP '^B[2-9][0-9]FH'"], imageUrl: "/manus-storage/base_full_height_double_f2b59f0c.png", notes: 'Full height double door base. Cabinet dimensions: H 34½", D 24". Door height 29". Two boxes will be received when ordering this cabinet kit flat pack. Soft-close hinges standard.' },
        { conditions: ["masterCode IN ('B12','B15','B18','B21')", "masterCode REGEXP '^B[0-9]+TD$'", "masterCode REGEXP '^B[0-9]+RS$'", "masterCode REGEXP '^B[0-9]+2RS$'", "masterCode REGEXP '^B[0-9]{2}ADA$'", "masterCode REGEXP '^B[0-9]{2}ADA[0-9]'"], imageUrl: "/manus-storage/base_single_door_drawer_789c695c.png", notes: 'Single door / single drawer base. Cabinet dimensions: H 34½", D 24". Door height 22½", drawer height 6¼". Soft-close hinges and drawer glides standard.' },
        { conditions: ["masterCode IN ('B24','B27','B30','B33','B36','B39','B42')"], imageUrl: "/manus-storage/base_double_door_drawer_e2ff68eb.png", notes: 'Double door / single drawer base. Cabinet dimensions: H 34½", D 24". Door height 22½", drawer height 6¼". Soft-close hinges and drawer glides standard.' },
        { conditions: ["masterCode REGEXP '^B[0-9]+2D$'", "masterCode IN ('B36ADA','B33ADA','B30ADA')"], imageUrl: "/manus-storage/base_double_door_2drawer_02f898ee.png", notes: 'Double door / double drawer base. Cabinet dimensions: H 34½", D 24". Door height 22½", drawer height 6¼". Soft-close hinges and full-extension drawer glides standard.' },
        { conditions: ["masterCode REGEXP '^SB[0-9]+S$'"], imageUrl: "/manus-storage/base_sink_single_44b34ec1.png", notes: 'Sink base — single door with false drawer front. Cabinet dimensions: H 34½", D 24". Door height 22½", false drawer height 6¼". Open interior for plumbing access.' },
        { conditions: ["masterCode REGEXP '^SB[0-9]+'", "masterCode REGEXP '^DCSF'", "masterCode REGEXP '^SBF'"], imageUrl: "/manus-storage/base_sink_double_85d06f63.png", notes: 'Sink base — double door with false drawer front. Cabinet dimensions: H 34½", D 24". Door height 22½", false drawer height 6¼". Open interior for plumbing access.' },
        { conditions: ["masterCode REGEXP '^FSB'"], imageUrl: "/manus-storage/base_farm_sink_6f1168b0.png", notes: 'Farm/apron sink base. Cabinet dimensions: H 34½", D 24". Designed to accommodate apron-front farm sinks. Open front frame; no false drawer front.' },
        { conditions: ["masterCode REGEXP '^2DB'"], imageUrl: "/manus-storage/base_drawer_2_66bf87f5.png", notes: 'Two-drawer base. Cabinet dimensions: H 34½", D 24". Full-extension BLUMOTION soft-close drawer glides (110 lb weight capacity). Dovetail drawer box construction.' },
        { conditions: ["masterCode REGEXP '^3DB'"], imageUrl: "/manus-storage/base_drawer_3_51f0ed59.png", notes: 'Three-drawer base. Cabinet dimensions: H 34½", D 24". Full-extension BLUMOTION soft-close drawer glides (110 lb weight capacity). Dovetail drawer box construction.' },
        { conditions: ["masterCode REGEXP '^BER'", "masterCode REGEXP '^LSB'"], imageUrl: "/manus-storage/base_corner_easy_reach_080d052c.png", notes: 'Corner easy-reach base with lazy susan. Cabinet dimensions: H 34½", D 24". Rotating kidney-shaped shelves for full corner access. Soft-close hinges standard.' },
        { conditions: ["masterCode REGEXP '^BBC'"], imageUrl: "/manus-storage/base_blind_58ca8f93.png", notes: 'Blind corner base. Cabinet dimensions: H 34½", D 24". Adjustable interior shelf. Minimum pull distance required — see spec sheet for model-specific pull dimensions.' },
        { conditions: ["masterCode REGEXP '^W(09|12|15|18|21)[0-9]{2}$'", "masterCode REGEXP '^W(09|12|15|18|21)[0-9]{2}[A-Z]'"], imageUrl: "/manus-storage/wall_single_door_30h_1015d79a.png", notes: 'Single door wall cabinet — 30" high. Cabinet dimensions: H 30", D 12". Two adjustable shelves. Soft-close hinges standard.' },
        { conditions: ["masterCode REGEXP '^W[2-4][0-9]30'"], imageUrl: "/manus-storage/wall_double_door_30h_ff555b31.png", notes: 'Double door wall cabinet — 30" high. Cabinet dimensions: H 30", D 12". Two adjustable shelves. Soft-close hinges standard.' },
        { conditions: ["masterCode REGEXP '^W(09|12|15|18|21)[0-9]{2}36'"], imageUrl: "/manus-storage/wall_single_door_36h_f13c8abb.png", notes: 'Single door wall cabinet — 36" high. Cabinet dimensions: H 36", D 12". Two adjustable shelves. Soft-close hinges standard.' },
        { conditions: ["masterCode REGEXP '^W[2-4][0-9]36'"], imageUrl: "/manus-storage/wall_double_door_36h_1c7babde.png", notes: 'Double door wall cabinet — 36" high. Cabinet dimensions: H 36", D 12". Two adjustable shelves. Soft-close hinges standard.' },
        { conditions: ["masterCode REGEXP '^W(09|12|15|18|21)[0-9]{2}42'"], imageUrl: "/manus-storage/wall_single_door_42h_23bd15d2.png", notes: 'Single door wall cabinet — 42" high. Cabinet dimensions: H 42", D 12". Three adjustable shelves. Soft-close hinges standard.' },
        { conditions: ["masterCode REGEXP '^W[2-4][0-9]42'"], imageUrl: "/manus-storage/wall_double_door_42h_bc6b3aac.png", notes: 'Double door wall cabinet — 42" high. Cabinet dimensions: H 42", D 12". Three adjustable shelves. Soft-close hinges standard.' },
        { conditions: ["masterCode REGEXP '^DCW'", "masterCode REGEXP '^WER'", "masterCode REGEXP '^WBC'"], imageUrl: "/manus-storage/wall_corner_diagonal_ae4e62f3.png", notes: 'Diagonal corner wall cabinet. Cabinet dimensions: H 30"/36"/42", D 12". Angled face for corner placement. One adjustable shelf. Soft-close hinges standard.' },
        { conditions: ["masterCode REGEXP '^W[0-9]{2}(12|15|18|24)$'", "masterCode REGEXP '^W[0-9]{4}(12|15|18|24)$'"], imageUrl: "/manus-storage/wall_bridge_cfcb5d77.png", notes: 'Bridge wall cabinet (short). Available in 12", 15", 18", and 24" heights. D 12". Designed for use over ranges, refrigerators, and windows.' },
        { conditions: ["masterCode REGEXP '^W[0-9]{4}24$'"], imageUrl: "/manus-storage/wall_refrigerator_a84893ce.png", notes: 'Refrigerator wall cabinet — 24" deep. Available in 12", 15", 18", and 24" heights. D 24". Designed to sit above standard refrigerators.' },
        { conditions: ["masterCode REGEXP 'GD$'"], imageUrl: "/manus-storage/wall_glass_door_9b15d5f8.png", notes: 'Glass door wall cabinet — routed for glass with finished interior. Available in 30", 36", and 42" heights. D 12". Glass inclusion follows the selected distributor policy.' },
        { conditions: ["masterCode REGEXP '^U18'"], imageUrl: "/manus-storage/tall_utility_2door_12857557.png", notes: 'Tall utility cabinet — two doors. Cabinet dimensions: H 84"/90"/96", D 24". Five adjustable shelves. Soft-close hinges standard. Two boxes will be received when ordering this cabinet kit flat pack.' },
        { conditions: ["masterCode REGEXP '^U(24|30)'"], imageUrl: "/manus-storage/tall_utility_4door_cfc52263.png", notes: 'Tall utility cabinet — four doors (upper and lower). Cabinet dimensions: H 84"/90"/96", D 24". Adjustable shelves in upper and lower sections. Soft-close hinges standard. Three boxes will be received when ordering this cabinet kit flat pack.' },
        { conditions: ["masterCode REGEXP '^OC'"], imageUrl: "/manus-storage/tall_oven_31fe6884.png", notes: 'Oven/microwave tall cabinet. Cabinet dimensions: H 84"/90"/96", D 24". Designed for built-in oven and microwave combo. Upper and lower door sections. Three boxes will be received when ordering this cabinet kit flat pack.' },
        { conditions: ["masterCode REGEXP '^VB(12|15|18|21)$'"], imageUrl: "/manus-storage/vanity_sink_base_single_6eca1ab0.png", notes: 'Vanity sink base — single door. Cabinet dimensions: H 34½", D 21". Open interior for plumbing access. Soft-close hinges standard.' },
        { conditions: ["masterCode REGEXP '^VB(24|27|30|33|36|42|48)$'", "masterCode REGEXP '^VB[0-9]+ADA'"], imageUrl: "/manus-storage/vanity_sink_base_double_5131bf00.png", notes: 'Vanity sink base — double door. Cabinet dimensions: H 34½", D 21". Open interior for plumbing access. Soft-close hinges standard.' },
        { conditions: ["masterCode REGEXP '^VDB'"], imageUrl: "/manus-storage/vanity_drawer_04a49ab5.png", notes: 'Vanity drawer base. Cabinet dimensions: H 34½", D 21". Full-extension BLUMOTION soft-close drawer glides. Dovetail drawer box construction.' },
        { conditions: ["masterCode REGEXP '^VSD'", "masterCode REGEXP '^VDDB'", "masterCode REGEXP '^VKD'"], imageUrl: "/manus-storage/vanity_combo_0cb94a6d.png", notes: 'Vanity combo base — door and drawer combination. Cabinet dimensions: H 34½", D 21". Soft-close hinges and drawer glides standard.' },
      ];
      let totalUpdated = 0;
      for (const family of families) {
        const whereClause = input.force
          ? sql.raw(`(${family.conditions.join(" OR ")})`)
          : sql.raw(`(${family.conditions.join(" OR ")}) AND (specImageUrl IS NULL OR specImageUrl = '')`);
        const result = await db
          .update(cabinets)
          .set({ specImageUrl: family.imageUrl, specNotes: family.notes })
          .where(whereClause);
        totalUpdated += (result as unknown as { affectedRows?: number })?.affectedRows ?? 0;
      }
      return { ok: true, updated: totalUpdated };
    }),

  /** Bulk publish (or unpublish) a set of SKU IDs — admin only. */
  adminBulkPublishSkus: adminProcedure
    .input(
      z.object({
        skuIds: z.array(z.number()).min(1).max(2000),
        isPublished: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(distributorSkus)
        .set({ isPublished: input.isPublished })
        .where(inArray(distributorSkus.id, input.skuIds));
      return { updated: input.skuIds.length };
    }),

  // ─── Remove a cabinet from a distributor line without deleting either record ───────
  // Distributor SKU history remains in place for audit and future re-imports. The
  // relationship is removed from customer-facing availability by disabling every
  // currently active SKU for this cabinet/distributor pair and dropping the separate
  // eligibility marker.
  adminRemoveCabinetDistributor: adminProcedure
    .input(z.object({
      cabinetId: z.number().int().positive(),
      distributorId: z.number().int().positive(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const [cabinet] = await db
        .select({ id: cabinets.id, masterCode: cabinets.masterCode })
        .from(cabinets)
        .where(eq(cabinets.id, input.cabinetId))
        .limit(1);
      if (!cabinet) throw new TRPCError({ code: "NOT_FOUND", message: "Cabinet not found." });

      const [distributor] = await db
        .select({ id: distributors.id, name: distributors.name })
        .from(distributors)
        .where(eq(distributors.id, input.distributorId))
        .limit(1);
      if (!distributor) throw new TRPCError({ code: "NOT_FOUND", message: "Distributor not found." });

      const activeSkus = await db
        .select({ id: distributorSkus.id })
        .from(distributorSkus)
        .where(and(
          eq(distributorSkus.cabinetId, input.cabinetId),
          eq(distributorSkus.distributorId, input.distributorId),
          sql`(${distributorSkus.isAvailable} = true OR ${distributorSkus.isPublished} = true)`,
        ));

      const [eligibility] = await db
        .select({ id: cabinetDistributorEligibility.id })
        .from(cabinetDistributorEligibility)
        .where(and(
          eq(cabinetDistributorEligibility.cabinetId, input.cabinetId),
          eq(cabinetDistributorEligibility.distributorId, input.distributorId),
        ))
        .limit(1);

      if (activeSkus.length === 0 && !eligibility) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This distributor is not currently connected to the selected cabinet.",
        });
      }

      await db.transaction(async (tx) => {
        if (activeSkus.length > 0) {
          await tx
            .update(distributorSkus)
            .set({ isAvailable: false, isPublished: false })
            .where(and(
              eq(distributorSkus.cabinetId, input.cabinetId),
              eq(distributorSkus.distributorId, input.distributorId),
            ));
        }
        if (eligibility) {
          await tx
            .delete(cabinetDistributorEligibility)
            .where(eq(cabinetDistributorEligibility.id, eligibility.id));
        }
      });

      return {
        cabinetId: cabinet.id,
        masterCode: cabinet.masterCode,
        distributorId: distributor.id,
        distributorName: distributor.name,
        disabledSkuCount: activeSkus.length,
        removedEligibility: Boolean(eligibility),
      };
    }),

  // ─── Get distributors that have this cabinet active (published + available SKUs) ───
  getDistributorsForCabinet: publicProcedure
    .input(z.object({ cabinetId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      
      // Get all distributors that have published+available SKUs for this cabinet
      const rows = await db
        .selectDistinct({
          id: distributors.id,
          name: distributors.name,
        })
        .from(distributorSkus)
        .innerJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
        .where(
          and(
            eq(distributorSkus.cabinetId, input.cabinetId),
            eq(distributorSkus.isPublished, true),
            eq(distributorSkus.isAvailable, true)
          )
        )
        .orderBy(asc(distributors.name));
      
      return rows.map(r => ({ id: r.id, name: r.name }));
    }),

  // ─── Admin: Merge two cabinets (one becomes alias of the other) ───────────────
  mergeCabinets: adminProcedure
    .input(
      z.object({
        masterCabinetId: z.number().int().positive(),
        aliasCabinetId: z.number().int().positive(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      if (input.masterCabinetId === input.aliasCabinetId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot merge a cabinet with itself" });
      }

      // Get both cabinets
      const [master, alias] = await Promise.all([
        db.select({ id: cabinets.id, masterCode: cabinets.masterCode }).from(cabinets).where(eq(cabinets.id, input.masterCabinetId)).limit(1),
        db.select({ id: cabinets.id, masterCode: cabinets.masterCode }).from(cabinets).where(eq(cabinets.id, input.aliasCabinetId)).limit(1),
      ]);

      if (!master || !master[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Master cabinet not found" });
      if (!alias || !alias[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Alias cabinet not found" });

      const masterCode = master[0].masterCode;
      const aliasCode = alias[0].masterCode;

      if (!masterCode || !aliasCode) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Both cabinets must have master codes" });
      }

	      // Record the approved master relationship as well as the route alias. Both
	      // layers are needed: Catalog lists suppress the retired master row, while
	      // old design/order links continue to resolve to the canonical cabinet.
	      const [existingMasterAlias] = await db
	        .select({ id: skuMasterAliases.id, masterCode: skuMasterAliases.masterCode })
	        .from(skuMasterAliases)
	        .where(eq(skuMasterAliases.aliasCode, aliasCode))
	        .limit(1);
	      if (existingMasterAlias && existingMasterAlias.masterCode !== masterCode) {
	        throw new TRPCError({
	          code: "CONFLICT",
	          message: `${aliasCode} already resolves to ${existingMasterAlias.masterCode}; resolve that alias conflict before merging.`,
	        });
	      }
	      if (!existingMasterAlias) {
	        await db.insert(skuMasterAliases).values({
	          aliasCode,
	          masterCode,
	          conflictStatus: "ok",
	          notes: `Approved cabinet merge: ${aliasCode} → ${masterCode}`,
	        });
	      }

	      await db.insert(cabinetAliases)
	        .values({ cabinetId: input.masterCabinetId, alias: aliasCode })
	        .onDuplicateKeyUpdate({ set: { cabinetId: input.masterCabinetId } });

	      // Keep the historical cabinet and supplier price rows untouched, but prevent
	      // the retired source from appearing as an independently selectable product.
	      await db.update(cabinets)
	        .set({ isActive: false, showInCatalog: false, showInDesigner: false })
	        .where(eq(cabinets.id, input.aliasCabinetId));

      return { 
        ok: true,
        masterCode,
        aliasCode,
        message: `${aliasCode} is now an alias of ${masterCode}`,
      };
    }),

});

// ─── Pricing ──────────────────────────────────────────────────────────────────

export const pricingRouter = router({
  // ── Door-style-first pricing ──────────────────────────────────────────────
  // Returns ONE priced row per unique door style for a cabinet. Internally we
  // pick the best (lowest contractor price) available + published SKU per style
  // and surface ONLY style metadata + prices. No distributor name/SKU ever
  // leaves the server, so the UI can present purely by door style.
  stylesForCabinet: publicProcedure
    .input(z.object({ cabinetId: z.number(), affiliateSlug: z.string().min(1).max(160).optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      // Price-column entitlement: never ship a trade/base cost to a viewer who
      // isn't entitled to it. Admin/owner sees all; everyone else is gated by
      // their assigned tier (guests default to homeowner/retail).
      const viewerTier = resolveStorefrontTier(ctx.user);
      const isAdmin = ctx.user?.role === "admin";
      let requestedAffiliateId: number | null = null;
      let affiliateAccess: Awaited<ReturnType<typeof resolveAffiliateAccess>> | null = null;
      if (!isAdmin && ctx.user && input.affiliateSlug) {
        affiliateAccess = await resolveAffiliateAccess(db, ctx.user);
        if (affiliateAccess?.isOwner && affiliateAccess.affiliateId != null) {
          const storefront = await db
            .select({ id: affiliates.id })
            .from(affiliates)
            .where(eq(affiliates.slug, input.affiliateSlug))
            .limit(1);
          requestedAffiliateId = storefront[0]?.id ?? null;
        }
      }
      const canSeePrivateCost = canViewAffiliatePrivateCost({
        isAdmin,
        requestedAffiliateSlug: input.affiliateSlug,
        requestedAffiliateId,
        access: affiliateAccess,
      });
      const ps = await getPricingSettings();
      // The Administration fee stack sets the real amount an affiliate owes
      // Cabinet Dealz. Administration retains the raw supplier cost as My Cost;
      // an affiliate owner receives only a separately named, adjusted Affiliate
      // Cost. Never send the raw supplier cost to an affiliate storefront.
      const isAffiliateOwnerViewingOwnStore = canSeePrivateCost && !isAdmin;
      const affiliateFeeSettings = isAffiliateOwnerViewingOwnStore
        ? await getPlatformPricingSettings()
        : null;

      // ── Alias resolution ────────────────────────────────────────────────────
      // The Master SKU Alias Program maps supplier-variant codes (e.g. "VS-24")
      // to canonical master codes (e.g. "VS24"). When a distributor's price rows
      // are linked to a cabinet whose masterCode is an alias of this cabinet's
      // masterCode, we want those rows to appear on this product page too.
      //
      // Steps:
      //   1. Look up the masterCode string for the requested cabinetId.
      //   2. Find all alias codes that map TO this masterCode.
      //   3. Find all cabinet IDs whose masterCode is one of those alias codes.
      //   4. Include those cabinet IDs in the WHERE clause alongside the direct match.
      const masterCabinetRow = await db
        .select({ masterCode: cabinets.masterCode })
        .from(cabinets)
        .where(eq(cabinets.id, input.cabinetId))
        .limit(1);
      const masterCode = masterCabinetRow[0]?.masterCode ?? null;

      // Collect all cabinet IDs to include (direct + aliased)
      let allCabinetIds: number[] = [input.cabinetId];
      if (masterCode) {
        // Find alias codes that point to this master code
        const aliasRows = await db
          .select({ aliasCode: skuMasterAliases.aliasCode })
          .from(skuMasterAliases)
          .where(and(
            eq(skuMasterAliases.masterCode, masterCode),
            eq(skuMasterAliases.conflictStatus, "ok"),
          ));

        if (aliasRows.length > 0) {
          const aliasCodes = aliasRows.map((a) => a.aliasCode);
          // Find cabinet IDs whose masterCode is one of those alias codes
          const aliasCabinets = await db
            .select({ id: cabinets.id })
            .from(cabinets)
            .where(inArray(cabinets.masterCode, aliasCodes));
          const aliasIds = aliasCabinets.map((c) => c.id);
          allCabinetIds = Array.from(new Set(allCabinetIds.concat(aliasIds)));
        }
      }
      // ── End alias resolution ────────────────────────────────────────────────

      const rows = await db
        .select({
          styleId: distributorSkus.styleId,
          styleCode: doorStyles.styleCode,
          ourName: doorStyles.ourName,
          doorStyle: doorStyles.doorStyle,
          finish: doorStyles.finish,
          color: doorStyles.color,
          doorSampleImageUrl: doorStyles.doorSampleImageUrl,
          roomSceneImageUrl: doorStyles.roomSceneImageUrl,
          thumbnailImageUrl: doorStyles.thumbnailImageUrl,
          listPrice: distributorSkus.listPrice,
          adjustedListPrice: distributorSkus.adjustedListPrice,
          wholesalePrice: distributorSkus.wholesalePrice,
          contractorPrice: distributorSkus.contractorPrice,
          homeownerPrice: distributorSkus.homeownerPrice,
          yourCost: distributorSkus.yourCost,
          platformSku: distributorSkus.platformSku,
          skuImageUrl: distributorSkus.imageUrl,
          leadTimeDays: distributors.leadTimeDays,
          distributorId: distributorSkus.distributorId,
          retailPriceBasis: distributors.retailPriceBasis,
          glassIncluded: distributors.glassIncluded,
          // Shipping pkg dims: distributor override first, fall back to master cabinet
          pkgLength: sql<string | null>`COALESCE(${distributorCabinetOverrides.pkgLength}, ${cabinets.pkgLength})`,
          pkgWidth: sql<string | null>`COALESCE(${distributorCabinetOverrides.pkgWidth}, ${cabinets.pkgWidth})`,
          pkgHeight: sql<string | null>`COALESCE(${distributorCabinetOverrides.pkgHeight}, ${cabinets.pkgHeight})`,
          pkgWeight: sql<string | null>`COALESCE(${distributorCabinetOverrides.pkgWeight}, ${cabinets.pkgWeight})`,
          // Line-specific image override (null = use master catalogImageUrl)
          distributorImageUrl: distributorCabinetOverrides.imageUrl,
        })
        .from(distributorSkus)
        .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
        .innerJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
        .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .leftJoin(
          distributorCabinetOverrides,
          and(
            eq(distributorCabinetOverrides.distributorId, distributorSkus.distributorId),
            eq(distributorCabinetOverrides.cabinetId, distributorSkus.cabinetId)
          )
        )
        .where(
          and(
            allCabinetIds.length === 1
              ? eq(distributorSkus.cabinetId, allCabinetIds[0])
              : inArray(distributorSkus.cabinetId, allCabinetIds),
            eq(distributorSkus.isAvailable, true),
            eq(distributorSkus.isPublished, true),
            sql`(COALESCE(${distributorSkus.listPrice}, 0) > 0 OR COALESCE(${distributorSkus.yourCost}, 0) > 0)`,
            eq(doorStyles.isActive, true),
            eq(distributors.isActive, true),
            // Alias source records are deliberately retired from product
            // listings, but their exact supplier price/style overlays remain
            // valid for the active canonical detail page.
            ne(cabinets.conflictStatus, "conflict"),
          )
        );

      // Keep one row per (style code × distributor) pair so that the same
      // door style offered by different supply lines shows as distinct options.
      // Within the same distributor+style pair, prefer the lowest contractor price.
      const byStyle = new Map<string, (typeof rows)[number]>();
      for (const r of rows) {
        const styleKey = (r.styleCode || r.ourName || String(r.styleId)).toUpperCase();
        const key = `${styleKey}__DIST_${r.distributorId ?? 0}`;
        const existing = byStyle.get(key);
        if (!existing) {
          byStyle.set(key, r);
          continue;
        }
        const a = Number(r.contractorPrice ?? r.wholesalePrice ?? Infinity);
        const b = Number(existing.contractorPrice ?? existing.wholesalePrice ?? Infinity);
        if (a < b) byStyle.set(key, r);
      }

      return Array.from(byStyle.values())
        .map((r) => {
          // Trade tiers are computed from cost. Homeowner retail is computed the
          // same way unless this source line explicitly uses its verified list.
          const costRow = {
            wholesalePrice: r.wholesalePrice,
            adjustedListPrice: r.adjustedListPrice,
            yourCost: r.yourCost,
            listPrice: r.listPrice,
            retailPriceBasis: r.retailPriceBasis,
          };
          const sellHomeowner = sellPriceForTier(costRow, ps, "homeowner");
          const sellContractor = sellPriceForTier(costRow, ps, "contractor");
          const sellWholesale = sellPriceForTier(costRow, ps, "wholesale");
          const gated = visiblePricesForViewer(
            {
              listPrice: r.listPrice,
              adjustedListPrice: r.adjustedListPrice,
              wholesalePrice: sellWholesale?.toFixed(2) ?? null,
              contractorPrice: sellContractor?.toFixed(2) ?? null,
              homeownerPrice: sellHomeowner?.toFixed(2) ?? null,
            },
            viewerTier,
            isAdmin,
          );
          const rawCost = r.yourCost == null ? null : Number(r.yourCost);
          const affiliateAdjustedCost =
            rawCost != null && Number.isFinite(rawCost) && affiliateFeeSettings
              ? (priceLadder(Math.round(rawCost * 100), affiliateFeeSettings).affiliateCents / 100).toFixed(2)
              : null;
          return {
            styleId: r.styleId,
            styleCode: r.styleCode,
            name: r.ourName,
            doorStyle: r.doorStyle,
            finish: r.finish,
            color: r.color,
            doorSampleImageUrl: r.doorSampleImageUrl,
            roomSceneImageUrl: r.roomSceneImageUrl,
            thumbnailImageUrl: r.thumbnailImageUrl,
            listPrice: gated.listPrice,
            adjustedListPrice: gated.adjustedListPrice,
            wholesalePrice: gated.wholesalePrice,
            contractorPrice: gated.contractorPrice,
            homeownerPrice: gated.homeownerPrice,
            // Keep the two private values distinct. Administration sees its raw
            // supplier acquisition cost as My Cost. An affiliate owner sees only
            // the Administration-adjusted amount as Affiliate Cost. Neither
            // private value leaves the server for customers, staff, or another
            // affiliate's storefront.
            yourCost: isAdmin ? r.yourCost : null,
            affiliateCost: isAffiliateOwnerViewingOwnStore ? affiliateAdjustedCost : null,
            platformSku: r.platformSku,
            skuImageUrl: r.skuImageUrl,
            leadTimeDays: r.leadTimeDays,
            distributorId: r.distributorId,
            glassIncluded: r.glassIncluded,
            // Resolved pkg dims (override ?? master fallback)
            pkgLength: r.pkgLength ?? null,
            pkgWidth: r.pkgWidth ?? null,
            pkgHeight: r.pkgHeight ?? null,
            pkgWeight: r.pkgWeight ?? null,
            distributorImageUrl: r.distributorImageUrl ?? null,
          };
        })
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }),

  // ── Margins control center (admin) ────────────────────────────────────────
  // Single source of truth for the platform-wide selling margins surfaced in
  // the "Pricing & Margins" admin tab. globalMarkupBps is guidance/default for
  // supply lines; the per-tier bps nudge a whole tier up/down. 10000 = no change.
  adminGetMargins: adminProcedure.query(async () => {
    const s = await getPricingSettings();
    const distRows = await (async () => {
      const db = await getDb();
      if (!db) return [] as { id: number; name: string | null; markupPercent: string | null; displayMode: string | null; seriesName: string | null }[];
      return db
        .select({
          id: distributors.id,
          name: distributors.name,
          markupPercent: distributors.markupPercent,
          displayMode: distributors.displayMode,
          seriesName: distributors.seriesName,
        })
        .from(distributors)
        .where(eq(distributors.isActive, true))
        .orderBy(asc(distributors.name));
    })();
    return { settings: s, distributors: distRows };
  }),

  adminUpdateMargins: adminProcedure
    .input(
      z.object({
        globalMarkupBps: z.number().int().min(0).max(110000).optional(),
        homeownerMarkupBps: z.number().int().min(0).max(110000).optional(),
        contractorMarkupBps: z.number().int().min(0).max(110000).optional(),
        wholesaleMarkupBps: z.number().int().min(0).max(110000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await updatePricingSettings(input, ctx.user?.openId);
      const settings = await getPricingSettings();
      const recalculation = await recalculateStoredTierPrices(settings);
      return { ...settings, recalculation };
    }),

  // ─── Platform fee system (price ladder + order fee stack) ────────────────
  // Single source of truth for the Cabinet Dealz fee stack: ladder markups +
  // damage / tech / card fees. All values basis points except techFeeCapCents.
  adminGetFeeSettings: adminProcedure.query(async () => {
    return await getPlatformPricingSettings();
  }),

  adminUpdateFeeSettings: adminProcedure
    .input(
      z.object({
        wholesaleMarkupBps: z.number().int().min(0).max(1000000).optional(),
        affiliateMarkupBps: z.number().int().min(0).max(1000000).optional(),
        retailMarkupBps: z.number().int().min(0).max(1000000).optional(),
        damageFeeBps: z.number().int().min(0).max(100000).optional(),
        techFeeBps: z.number().int().min(0).max(100000).optional(),
        techFeeCapCents: z.number().int().min(0).max(100000000).optional(),
        cardFeeBps: z.number().int().min(0).max(100000).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await updatePlatformPricingSettings(input, ctx.user?.openId);
      return await getPlatformPricingSettings();
    }),

  // Per-distributor markup override. Reuses the distributor.markupPercent lever
  // (decimal fraction, e.g. 0.15 = +15%) so the margins tab can edit it inline.
  adminSetDistributorMarkup: adminProcedure
    .input(z.object({ distributorId: z.number().int(), markupPercent: z.number().min(0).max(10) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No database" });
      await db
        .update(distributors)
        .set({ markupPercent: String(input.markupPercent) })
        .where(eq(distributors.id, input.distributorId));
      return { success: true } as const;
    }),

  // ─── Per-distributor cost Multiplier tab ─────────────────────────────────────
  // ONE list-price multiplier per distributor line, applied to EVERY cabinet
  // that line carries. Our true cost = listPrice × multiplier (stored in
  // distributor_skus.yourCost), and every sell price is cost × the per-tier
  // markup. This is the single lever for cost: when a supplier's list changes,
  // the owner just updates the multiplier here and all costs/sell prices follow.
  adminListDistributorMultipliers: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { rows: [] as unknown[] };
    const rows = await db
      .select({
        id: distributors.id,
        code: distributors.code,
        name: distributors.name,
        brandName: distributors.brandName,
        costMultiplier: distributors.costMultiplier,
        baseMultiplier: distributors.baseMultiplier,
        freightMultiplier: distributors.freightMultiplier,
        retailPriceBasis: distributors.retailPriceBasis,
        skuCount: sql<number>`COUNT(${distributorSkus.id})`,
        avgListPrice: sql<number | null>`AVG(${distributorSkus.listPrice})`,
      })
      .from(distributors)
      .leftJoin(distributorSkus, eq(distributorSkus.distributorId, distributors.id))
      .where(eq(distributors.isActive, true))
      .groupBy(
        distributors.id,
        distributors.code,
        distributors.name,
        distributors.brandName,
        distributors.costMultiplier,
        distributors.baseMultiplier,
        distributors.freightMultiplier,
        distributors.retailPriceBasis
      )
      .orderBy(asc(distributors.name));
    return { rows };
  }),

  adminSetDistributorMultiplier: adminProcedure
    .input(
      z.object({
        distributorId: z.number().int(),
        // Two-part cost multiplier. base = the distributor's core cost fraction of
        // list; freight = the freight/tariff add-on (can change independently, e.g.
        // a tariff is lowered). Effective = base + freight, and cost = list × effective.
        baseMultiplier: z.number().min(0).max(1),
        freightMultiplier: z.number().min(0).max(1),
        retailPriceBasis: z.enum(["cost_plus_tier", "source_list"]).default("cost_plus_tier"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No database" });
      const base = Math.round(input.baseMultiplier * 10000) / 10000;
      const freight = Math.round(input.freightMultiplier * 10000) / 10000;
      const mult = Math.round((base + freight) * 10000) / 10000;
      if (mult < 0.01 || mult > 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Effective multiplier (base + freight) must be between 0.01 and 1.00.",
        });
      }
      // 1) Persist the line's base/freight split and the computed effective multiplier.
      await db
        .update(distributors)
        .set({
          baseMultiplier: String(base),
          freightMultiplier: String(freight),
          costMultiplier: String(mult),
          retailPriceBasis: input.retailPriceBasis,
        })
        .where(eq(distributors.id, input.distributorId));
      // 2) Recompute our cost for EVERY SKU on the line: yourCost = listPrice × multiplier.
      //    Sell prices are derived at read time from yourCost, so nothing else
      //    needs backfilling. Rows without a listPrice are left untouched.
      const res = await db
        .update(distributorSkus)
        .set({ yourCost: sql`ROUND(${distributorSkus.listPrice} * ${mult}, 2)` })
        .where(
          and(
            eq(distributorSkus.distributorId, input.distributorId),
            sql`${distributorSkus.listPrice} IS NOT NULL`
          )
        );
      const updated =
        (res as unknown as { rowsAffected?: number; affectedRows?: number })
          ?.rowsAffected ??
        (res as unknown as { affectedRows?: number })?.affectedRows ??
        0;
      await recalculateStoredTierPrices();
      return {
        success: true,
        baseMultiplier: base,
        freightMultiplier: freight,
        multiplier: mult,
        retailPriceBasis: input.retailPriceBasis,
        skusRecomputed: updated,
      } as const;
    }),

  // ─── Cost Lookup / Verify & Correct (admin / owner) ──────────────────────────
  // Search a cabinet number (masterCode) and see every stored SKU across lines /
  // door styles with the full price ladder, so the owner can compare what's in
  // the system against the real distributor paperwork and correct any field
  // inline. Every correction is written to cost_change_log for traceability.
  // OWNER-ONLY: this exposes raw cost (yourCost / wholesale floor) and supplier
  // identity, so it is gated behind adminProcedure and never reachable publicly.
  adminLookupCost: adminProcedure
    .input(z.object({ query: z.string().trim().min(1).max(64) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { cabinets: [] as unknown[] };
      // A queue number is the cabinet's own record id. Accept either a bare
      // number ("123") or a hash-prefixed queue number ("#123") and resolve it
      // directly by id; otherwise treat the term as a model / master code.
      const parsed = parsePriceAuditQuery(input.query);
      if (!parsed) return { cabinets: [] as unknown[] };
      const asId = parsed.kind === "id" ? parsed.id : null;
      const upper = parsed.kind === "code" ? parsed.code : "";

      const selectCols = {
        id: cabinets.id,
        masterCode: cabinets.masterCode,
        description: cabinets.description,
        category: cabinets.category,
        subCategory: cabinets.subCategory,
        conflictStatus: cabinets.conflictStatus,
        priceVerified: cabinets.priceVerified,
        priceVerifiedAt: cabinets.priceVerifiedAt,
        priceVerifiedByName: cabinets.priceVerifiedByName,
      };

      // Match a cabinet by queue number (id) when numeric, else by masterCode:
      // exact first, then partial (LIKE).
      const matched =
        asId !== null
          ? await db.select(selectCols).from(cabinets).where(eq(cabinets.id, asId)).limit(25)
          : await db
              .select(selectCols)
              .from(cabinets)
              .where(like(cabinets.masterCode, `%${upper}%`))
              .orderBy(
                // Exact match floats to the top.
                sql`CASE WHEN UPPER(${cabinets.masterCode}) = ${upper} THEN 0 ELSE 1 END`,
                asc(cabinets.masterCode),
              )
              .limit(25);

      if (matched.length === 0) return { cabinets: [] as unknown[] };

      const cabinetIds = matched.map((c) => c.id);
      const skuRows = await db
        .select({
          skuId: distributorSkus.id,
          cabinetId: distributorSkus.cabinetId,
          distributorId: distributorSkus.distributorId,
          styleId: distributorSkus.styleId,
          platformSku: distributorSkus.platformSku,
          distributorSku: distributorSkus.distributorSku,
          supplierCabinetName: distributorSkus.supplierCabinetName,
          isAvailable: distributorSkus.isAvailable,
          isPublished: distributorSkus.isPublished,
          yourCost: distributorSkus.yourCost,
          listPrice: distributorSkus.listPrice,
          adjustedListPrice: distributorSkus.adjustedListPrice,
          wholesalePrice: distributorSkus.wholesalePrice,
          contractorPrice: distributorSkus.contractorPrice,
          homeownerPrice: distributorSkus.homeownerPrice,
          distributorName: distributors.name,
          distributorBrandName: distributors.brandName,
          styleOurName: doorStyles.ourName,
          styleCode: doorStyles.styleCode,
          styleDistributorName: doorStyles.distributorName,
        })
        .from(distributorSkus)
        .leftJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
        .leftJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
        .where(inArray(distributorSkus.cabinetId, cabinetIds))
        .orderBy(asc(distributorSkus.cabinetId), asc(doorStyles.ourName));

      const skusByCabinet = new Map<number, typeof skuRows>();
      for (const r of skuRows) {
        if (r.cabinetId == null) continue;
        const list = skusByCabinet.get(r.cabinetId) ?? ([] as unknown as typeof skuRows);
        (list as unknown[]).push(r);
        skusByCabinet.set(r.cabinetId, list);
      }

      return {
        cabinets: matched.map((c) => ({
          ...c,
          skus: (skusByCabinet.get(c.id) ?? []) as typeof skuRows,
        })),
      };
    }),

  // Update one or more price-ladder fields on a single SKU. Writes one audit row
  // per actually-changed field (old -> new) tagged with the admin who did it.
  adminUpdateSkuCost: adminProcedure
    .input(
      z.object({
        skuId: z.number().int(),
        yourCost: z.number().min(0).max(1000000).nullable().optional(),
        listPrice: z.number().min(0).max(1000000).nullable().optional(),
        wholesalePrice: z.number().min(0).max(1000000).nullable().optional(),
        contractorPrice: z.number().min(0).max(1000000).nullable().optional(),
        homeownerPrice: z.number().min(0).max(1000000).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No database" });

      const existingRows = await db
        .select({
          id: distributorSkus.id,
          cabinetId: distributorSkus.cabinetId,
          yourCost: distributorSkus.yourCost,
          listPrice: distributorSkus.listPrice,
          wholesalePrice: distributorSkus.wholesalePrice,
          contractorPrice: distributorSkus.contractorPrice,
          homeownerPrice: distributorSkus.homeownerPrice,
          masterCode: cabinets.masterCode,
        })
        .from(distributorSkus)
        .leftJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .where(eq(distributorSkus.id, input.skuId))
        .limit(1);
      const existing = existingRows[0];
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "SKU not found" });
      if (existing.cabinetId == null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Map this pending supplier SKU to a master cabinet before editing its audited price ladder.",
        });
      }

      // Normalize a decimal db value to a canonical string for comparison.
      const norm = (v: string | null | undefined): string | null => {
        if (v === null || v === undefined) return null;
        const n = Number(v);
        return Number.isFinite(n) ? String(n) : null;
      };
      const fields = [
        "yourCost",
        "listPrice",
        "wholesalePrice",
        "contractorPrice",
        "homeownerPrice",
      ] as const;
      type Field = (typeof fields)[number];

      const set: Record<string, string | null> = {};
      const auditRows: (typeof costChangeLog.$inferInsert)[] = [];
      for (const f of fields) {
        if (!(f in input)) continue; // field not part of this update
        const incoming = input[f as Field];
        const newVal = incoming === null || incoming === undefined ? null : String(incoming);
        const oldVal = norm(existing[f as Field] as string | null);
        if (norm(newVal) === oldVal) continue; // unchanged
        set[f] = newVal;
        auditRows.push({
          skuId: existing.id,
          cabinetId: existing.cabinetId,
          masterCode: existing.masterCode ?? "",
          field: f,
          oldValue: oldVal,
          newValue: norm(newVal),
          changedByOpenId: ctx.user?.openId ?? null,
          changedByName: ctx.user?.name ?? null,
        });
      }

      if (Object.keys(set).length === 0) {
        return { success: true, changed: 0 } as const;
      }

      await db.update(distributorSkus).set(set).where(eq(distributorSkus.id, input.skuId));
      if (auditRows.length > 0) await db.insert(costChangeLog).values(auditRows);
      return { success: true, changed: auditRows.length } as const;
    }),

  // Mark a cabinet's prices as audited (or clear the audit). Set true once the
  // owner has compared the system prices to the master price list and confirmed
  // they are correct; this drives the "Audited" badge in the Price Audit tool.
  adminSetPriceVerified: adminProcedure
    .input(z.object({ cabinetId: z.number().int(), verified: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No database" });
      await db
        .update(cabinets)
        .set({
          priceVerified: input.verified,
          priceVerifiedAt: input.verified ? new Date() : null,
          priceVerifiedByName: input.verified ? (ctx.user?.name ?? null) : null,
        })
        .where(eq(cabinets.id, input.cabinetId));
      return { success: true, verified: input.verified } as const;
    }),

  // ─── Price Audit: cascading dropdowns (no SKU typing required) ────────────────
  // Step 1: distributors that actually have SKUs, with audit progress counts so
  // the owner can pick the original distributor by name. OWNER-ONLY (real names).
  adminAuditDistributors: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [] as unknown[];
    const rows = await db
      .select({
        id: distributors.id,
        code: distributors.code,
        name: distributors.name,
        brandName: distributors.brandName,
        skuCount: sql<number>`count(distinct ${distributorSkus.id})`,
        cabinetCount: sql<number>`count(distinct ${distributorSkus.cabinetId})`,
        auditedCount: sql<number>`count(distinct case when ${cabinets.priceVerified} = true then ${distributorSkus.cabinetId} end)`,
      })
      .from(distributorSkus)
      .innerJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
      .leftJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
      .groupBy(distributors.id, distributors.code, distributors.name, distributors.brandName)
      .orderBy(asc(distributors.name));
    // Owner tool: surface the real distributor name (brandName) so it matches the
    // owner's paperwork; fall back to the neutral name when no brand is stored.
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      label: r.brandName || r.name,
      skuCount: Number(r.skuCount),
      cabinetCount: Number(r.cabinetCount),
      auditedCount: Number(r.auditedCount),
      unauditedCount: Number(r.cabinetCount) - Number(r.auditedCount),
    }));
  }),

  // Step 2: door styles that have SKUs for the chosen distributor.
  adminAuditStyles: adminProcedure
    .input(z.object({ distributorId: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [] as unknown[];
      const rows = await db
        .select({
          id: doorStyles.id,
          ourName: doorStyles.ourName,
          distributorName: doorStyles.distributorName,
          styleCode: doorStyles.styleCode,
          itemCount: sql<number>`count(distinct ${distributorSkus.cabinetId})`,
        })
        .from(distributorSkus)
        .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
        .where(eq(distributorSkus.distributorId, input.distributorId))
        .groupBy(doorStyles.id, doorStyles.ourName, doorStyles.distributorName, doorStyles.styleCode)
        .orderBy(asc(doorStyles.ourName));
      // Owner tool: include the original distributor's door name so it matches the
      // paperwork, alongside our name + code.
      return rows.map((r) => ({
        id: r.id,
        label: r.distributorName || r.ourName,
        ourName: r.ourName,
        styleCode: r.styleCode,
        itemCount: Number(r.itemCount),
      }));
    }),

  // Step 3: items (cabinets) for the chosen distributor + door style, each with
  // its single matching SKU + price ladder + audited flag, so the owner can pick
  // an item from a dropdown and audit it without ever knowing the SKU string.
  adminAuditItems: adminProcedure
    .input(z.object({ distributorId: z.number().int(), styleId: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [] as unknown[];
      const rows = await db
        .select({
          cabinetId: cabinets.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          category: cabinets.category,
          subCategory: cabinets.subCategory,
          priceVerified: cabinets.priceVerified,
          priceVerifiedAt: cabinets.priceVerifiedAt,
          priceVerifiedByName: cabinets.priceVerifiedByName,
          skuId: distributorSkus.id,
          distributorId: distributorSkus.distributorId,
          styleId: distributorSkus.styleId,
          platformSku: distributorSkus.platformSku,
          distributorSku: distributorSkus.distributorSku,
          supplierCabinetName: distributorSkus.supplierCabinetName,
          isAvailable: distributorSkus.isAvailable,
          isPublished: distributorSkus.isPublished,
          yourCost: distributorSkus.yourCost,
          listPrice: distributorSkus.listPrice,
          wholesalePrice: distributorSkus.wholesalePrice,
          contractorPrice: distributorSkus.contractorPrice,
          homeownerPrice: distributorSkus.homeownerPrice,
          distributorName: distributors.name,
          distributorBrandName: distributors.brandName,
          styleOurName: doorStyles.ourName,
          styleCode: doorStyles.styleCode,
          styleDistributorName: doorStyles.distributorName,
        })
        .from(distributorSkus)
        .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .leftJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
        .leftJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
        .where(
          and(
            eq(distributorSkus.distributorId, input.distributorId),
            eq(distributorSkus.styleId, input.styleId),
          ),
        )
        .orderBy(asc(cabinets.masterCode));
      return rows;
    }),

  // "Today's 4 to audit": a deterministic daily rotation through the cabinets
  // that still need price verification. Stable for the whole calendar day so the
  // same 4 show up on every refresh, then rotates the next day. Returns the
  // cabinet + its SKUs (same shape as adminLookupCost) so the UI can verify
  // inline. OWNER-ONLY.
  adminDailyAuditPicks: adminProcedure
    .input(z.object({ count: z.number().int().min(1).max(20).optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { day: "", picks: [] as unknown[], remaining: 0 };
      const count = input?.count ?? 4;
      // All unaudited cabinets that have at least one SKU (nothing to audit
      // otherwise), ordered stably by id so the rotation window is deterministic.
      const unaudited = await db
        .select({ id: cabinets.id })
        .from(cabinets)
        .innerJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
        .where(eq(cabinets.priceVerified, false))
        .groupBy(cabinets.id)
        .orderBy(asc(cabinets.id));
      const ids = unaudited.map((r) => r.id);
      const remaining = ids.length;
      if (remaining === 0) return { day: dayKeyUTC(), picks: [] as unknown[], remaining: 0 };

      // Deterministic per-day window: advance the start offset by `count` each
      // day so we cycle through the whole backlog over time.
      const epochDay = Math.floor(Date.now() / 86_400_000);
      const start = (epochDay * count) % remaining;
      const pickedIds: number[] = [];
      for (let i = 0; i < Math.min(count, remaining); i++) {
        pickedIds.push(ids[(start + i) % remaining]);
      }

      const selectCols = {
        id: cabinets.id,
        masterCode: cabinets.masterCode,
        description: cabinets.description,
        category: cabinets.category,
        subCategory: cabinets.subCategory,
        conflictStatus: cabinets.conflictStatus,
        priceVerified: cabinets.priceVerified,
        priceVerifiedAt: cabinets.priceVerifiedAt,
        priceVerifiedByName: cabinets.priceVerifiedByName,
      };
      const matched = await db.select(selectCols).from(cabinets).where(inArray(cabinets.id, pickedIds));
      // Preserve the picked order.
      const orderMap = new Map(pickedIds.map((id, i) => [id, i]));
      matched.sort((a, b) => (orderMap.get(a.id)! - orderMap.get(b.id)!));

      const skuRows = await db
        .select({
          skuId: distributorSkus.id,
          cabinetId: distributorSkus.cabinetId,
          distributorId: distributorSkus.distributorId,
          styleId: distributorSkus.styleId,
          platformSku: distributorSkus.platformSku,
          distributorSku: distributorSkus.distributorSku,
          supplierCabinetName: distributorSkus.supplierCabinetName,
          isAvailable: distributorSkus.isAvailable,
          isPublished: distributorSkus.isPublished,
          yourCost: distributorSkus.yourCost,
          listPrice: distributorSkus.listPrice,
          wholesalePrice: distributorSkus.wholesalePrice,
          contractorPrice: distributorSkus.contractorPrice,
          homeownerPrice: distributorSkus.homeownerPrice,
          distributorName: distributors.name,
          distributorBrandName: distributors.brandName,
          styleOurName: doorStyles.ourName,
          styleCode: doorStyles.styleCode,
          styleDistributorName: doorStyles.distributorName,
        })
        .from(distributorSkus)
        .leftJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
        .leftJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
        .where(inArray(distributorSkus.cabinetId, pickedIds))
        .orderBy(asc(distributorSkus.cabinetId), asc(doorStyles.ourName));
      const byCab = new Map<number, typeof skuRows>();
      for (const r of skuRows) {
        if (r.cabinetId == null) continue;
        const list = byCab.get(r.cabinetId) ?? ([] as unknown as typeof skuRows);
        (list as unknown[]).push(r);
        byCab.set(r.cabinetId, list);
      }
      return {
        day: dayKeyUTC(),
        remaining,
        picks: matched.map((c) => ({ ...c, skus: (byCab.get(c.id) ?? []) as typeof skuRows })),
      };
    }),

  // Published products without any customer-price source must be corrected in
  // the owner audit tool before they can become sellable. This data is never
  // returned through public catalog procedures.
  adminMissingCustomerPriceQueue: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { cabinets: [] as unknown[], remaining: 0 };
      const limit = input?.limit ?? 25;
      const rows = await db
        .select({
          cabinetId: cabinets.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          category: cabinets.category,
          subCategory: cabinets.subCategory,
          priceVerified: cabinets.priceVerified,
          priceVerifiedAt: cabinets.priceVerifiedAt,
          priceVerifiedByName: cabinets.priceVerifiedByName,
          skuId: distributorSkus.id,
          distributorId: distributorSkus.distributorId,
          styleId: distributorSkus.styleId,
          platformSku: distributorSkus.platformSku,
          distributorSku: distributorSkus.distributorSku,
          supplierCabinetName: distributorSkus.supplierCabinetName,
          isAvailable: distributorSkus.isAvailable,
          isPublished: distributorSkus.isPublished,
          yourCost: distributorSkus.yourCost,
          listPrice: distributorSkus.listPrice,
          wholesalePrice: distributorSkus.wholesalePrice,
          contractorPrice: distributorSkus.contractorPrice,
          homeownerPrice: distributorSkus.homeownerPrice,
          distributorName: distributors.name,
          distributorBrandName: distributors.brandName,
          styleOurName: doorStyles.ourName,
          styleCode: doorStyles.styleCode,
          styleDistributorName: doorStyles.distributorName,
        })
        .from(distributorSkus)
        .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .leftJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
        .leftJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
        .where(
          and(
            eq(distributorSkus.isAvailable, true),
            eq(distributorSkus.isPublished, true),
            sql`COALESCE(${distributorSkus.homeownerPrice}, ${distributorSkus.yourCost}, ${distributorSkus.wholesalePrice}, ${distributorSkus.adjustedListPrice}, ${distributorSkus.listPrice}) IS NULL`,
          ),
        )
        .orderBy(asc(cabinets.masterCode), asc(doorStyles.ourName));

      const grouped = new Map<number, {
        id: number;
        masterCode: string;
        description: string;
        category: string;
        subCategory: string | null;
        priceVerified: boolean;
        priceVerifiedAt: Date | null;
        priceVerifiedByName: string | null;
        skus: typeof rows;
      }>();
      for (const row of rows) {
        const current = grouped.get(row.cabinetId);
        if (current) {
          current.skus.push(row);
        } else {
          grouped.set(row.cabinetId, {
            id: row.cabinetId,
            masterCode: row.masterCode,
            description: row.description,
            category: row.category,
            subCategory: row.subCategory,
            priceVerified: row.priceVerified,
            priceVerifiedAt: row.priceVerifiedAt,
            priceVerifiedByName: row.priceVerifiedByName,
            skus: [row] as unknown as typeof rows,
          });
        }
      }
      const all = Array.from(grouped.values());
      return { cabinets: all.slice(0, limit), remaining: all.length };
    }),

  // Recent audit rows for a SKU or a cabinet number, newest first.
  adminCostHistory: adminProcedure
    .input(
      z
        .object({
          skuId: z.number().int().optional(),
          masterCode: z.string().trim().max(64).optional(),
          limit: z.number().int().min(1).max(200).optional(),
        })
        .refine((v) => v.skuId !== undefined || (v.masterCode && v.masterCode.length > 0), {
          message: "Provide skuId or masterCode",
        }),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [] as (typeof costChangeLog.$inferSelect)[];
      const conds = [] as ReturnType<typeof eq>[];
      if (input.skuId !== undefined) conds.push(eq(costChangeLog.skuId, input.skuId));
      if (input.masterCode)
        conds.push(eq(costChangeLog.masterCode, input.masterCode.trim().toUpperCase()));
      return db
        .select()
        .from(costChangeLog)
        .where(conds.length === 1 ? conds[0] : and(...conds))
        .orderBy(desc(costChangeLog.createdAt))
        .limit(input.limit ?? 50);
    }),

  // ── Admin: Full database export (filtered) ──────────────────────────────────
  // Returns a multi-sheet XLSX workbook with all product data needed to rebuild
  // the database. Supports filtering by category, distributor, and/or door style.
  fullExport: adminProcedure
    .input(
      z.object({
        category: z.string().optional(),
        distributorId: z.number().optional(),
        styleId: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { xlsx: "", filename: "export.xlsx", counts: {} as Record<string, number> };

      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const counts: Record<string, number> = {};

      // ── Build WHERE conditions ──────────────────────────────────────────────
      const cabinetConds: SQL[] = [eq(cabinets.isActive, true)];
      if (input.category) cabinetConds.push(eq(cabinets.category, input.category));

      const skuConds: SQL[] = [
        eq(distributorSkus.isAvailable, true),
      ];
      if (input.distributorId) skuConds.push(eq(distributorSkus.distributorId, input.distributorId));
      if (input.styleId) skuConds.push(eq(distributorSkus.styleId, input.styleId));

      // ── Sheet 1: Cabinets ───────────────────────────────────────────────────
      let cabinetRows: any[];
      if (input.distributorId || input.styleId) {
        cabinetRows = await db
          .selectDistinct({
            id: cabinets.id,
            masterCode: cabinets.masterCode,
            description: cabinets.description,
            category: cabinets.category,
            subCategory: cabinets.subCategory,
            placementType: cabinets.placementType,
            width: cabinets.width,
            height: cabinets.height,
            depth: cabinets.depth,
            weight: cabinets.weight,
            numberOfDoors: cabinets.numberOfDoors,
            numberOfDrawers: cabinets.numberOfDrawers,
            hingeSide: cabinets.hingeSide,
            isCornerCabinet: cabinets.isCornerCabinet,
            cornerSide: cabinets.cornerSide,
            graphicType: cabinets.graphicType,
            catalogImageUrl: cabinets.catalogImageUrl,
            pkgLength: cabinets.pkgLength,
            pkgWidth: cabinets.pkgWidth,
            pkgHeight: cabinets.pkgHeight,
            pkgWeight: cabinets.pkgWeight,
          })
          .from(cabinets)
          .innerJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
          .where(and(...cabinetConds, ...skuConds))
          .orderBy(cabinets.category, cabinets.masterCode);
      } else {
        cabinetRows = await db
          .select({
            id: cabinets.id,
            masterCode: cabinets.masterCode,
            description: cabinets.description,
            category: cabinets.category,
            subCategory: cabinets.subCategory,
            placementType: cabinets.placementType,
            width: cabinets.width,
            height: cabinets.height,
            depth: cabinets.depth,
            weight: cabinets.weight,
            numberOfDoors: cabinets.numberOfDoors,
            numberOfDrawers: cabinets.numberOfDrawers,
            hingeSide: cabinets.hingeSide,
            isCornerCabinet: cabinets.isCornerCabinet,
            cornerSide: cabinets.cornerSide,
            graphicType: cabinets.graphicType,
            catalogImageUrl: cabinets.catalogImageUrl,
            pkgLength: cabinets.pkgLength,
            pkgWidth: cabinets.pkgWidth,
            pkgHeight: cabinets.pkgHeight,
            pkgWeight: cabinets.pkgWeight,
          })
          .from(cabinets)
          .where(cabinetConds.length === 1 ? cabinetConds[0] : and(...cabinetConds))
          .orderBy(cabinets.category, cabinets.masterCode);
      }

      const cabSheet = [
        ["id", "masterCode", "description", "category", "subCategory", "placementType",
         "width", "height", "depth", "weight", "numberOfDoors", "numberOfDrawers",
         "hingeSide", "isCornerCabinet", "cornerSide", "graphicType", "catalogImageUrl",
         "pkgLength", "pkgWidth", "pkgHeight", "pkgWeight"],
        ...cabinetRows.map((r: any) => [
          r.id, r.masterCode, r.description, r.category, r.subCategory ?? "",
          r.placementType ?? "", r.width ?? "", r.height ?? "", r.depth ?? "",
          r.weight ?? "", r.numberOfDoors ?? 0, r.numberOfDrawers ?? 0,
          r.hingeSide ?? "", r.isCornerCabinet ? "TRUE" : "FALSE",
          r.cornerSide ?? "", r.graphicType ?? "", r.catalogImageUrl ?? "",
          r.pkgLength ?? "", r.pkgWidth ?? "", r.pkgHeight ?? "", r.pkgWeight ?? "",
        ]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cabSheet), "Cabinets");
      counts.cabinets = cabinetRows.length;

      // ── Sheet 2: Distributor SKUs (pricing) ─────────────────────────────────
      const skuQuery = db
        .select({
          id: distributorSkus.id,
          cabinetId: distributorSkus.cabinetId,
          distributorId: distributorSkus.distributorId,
          styleId: distributorSkus.styleId,
          platformSku: distributorSkus.platformSku,
          distributorSku: distributorSkus.distributorSku,
          listPrice: distributorSkus.listPrice,
          yourCost: distributorSkus.yourCost,
          adjustedListPrice: distributorSkus.adjustedListPrice,
          wholesalePrice: distributorSkus.wholesalePrice,
          contractorPrice: distributorSkus.contractorPrice,
          homeownerPrice: distributorSkus.homeownerPrice,
          isAvailable: distributorSkus.isAvailable,
          isPublished: distributorSkus.isPublished,
          imageUrl: distributorSkus.imageUrl,
          supplierCabinetName: distributorSkus.supplierCabinetName,
          masterCode: cabinets.masterCode,
        })
        .from(distributorSkus)
        .innerJoin(cabinets, eq(cabinets.id, distributorSkus.cabinetId));

      const allSkuConds: SQL[] = [...skuConds];
      if (input.category) allSkuConds.push(eq(cabinets.category, input.category));

      const skuRows = await skuQuery
        .where(allSkuConds.length > 0 ? and(...allSkuConds) : undefined)
        .orderBy(cabinets.masterCode);

      const skuSheet = [
        ["id", "cabinetId", "masterCode", "distributorId", "styleId", "platformSku",
         "distributorSku", "listPrice", "yourCost", "adjustedListPrice",
         "wholesalePrice", "contractorPrice", "homeownerPrice",
         "isAvailable", "isPublished", "imageUrl", "supplierCabinetName"],
        ...skuRows.map((r: any) => [
          r.id, r.cabinetId, r.masterCode, r.distributorId, r.styleId,
          r.platformSku, r.distributorSku,
          r.listPrice != null ? Number(r.listPrice) : "",
          r.yourCost != null ? Number(r.yourCost) : "",
          r.adjustedListPrice != null ? Number(r.adjustedListPrice) : "",
          r.wholesalePrice != null ? Number(r.wholesalePrice) : "",
          r.contractorPrice != null ? Number(r.contractorPrice) : "",
          r.homeownerPrice != null ? Number(r.homeownerPrice) : "",
          r.isAvailable ? "TRUE" : "FALSE",
          r.isPublished ? "TRUE" : "FALSE",
          r.imageUrl ?? "",
          r.supplierCabinetName ?? "",
        ]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(skuSheet), "Distributor SKUs");
      counts.skus = skuRows.length;

      // ── Sheet 3: Door Styles ────────────────────────────────────────────────
      const styleConds: SQL[] = [];
      if (input.distributorId) styleConds.push(eq(doorStyles.distributorId, input.distributorId));
      if (input.styleId) styleConds.push(eq(doorStyles.id, input.styleId));

      const styleRows = await db
        .select({
          id: doorStyles.id,
          distributorId: doorStyles.distributorId,
          styleCode: doorStyles.styleCode,
          ourName: doorStyles.ourName,
          aliasName: doorStyles.aliasName,
          distributorName: doorStyles.distributorName,
          doorStyle: doorStyles.doorStyle,
          woodSpecies: doorStyles.woodSpecies,
          finish: doorStyles.finish,
          color: doorStyles.color,
          boxConstruction: doorStyles.boxConstruction,
          drawerConstruction: doorStyles.drawerConstruction,
          hardware: doorStyles.hardware,
          frameSize: doorStyles.frameSize,
          overlayType: doorStyles.overlayType,
          doorSampleImageUrl: doorStyles.doorSampleImageUrl,
          roomSceneImageUrl: doorStyles.roomSceneImageUrl,
          isActive: doorStyles.isActive,
          isFeatured: doorStyles.isFeatured,
          isBuilderGrade: doorStyles.isBuilderGrade,
        })
        .from(doorStyles)
        .where(styleConds.length > 0 ? and(...styleConds) : undefined)
        .orderBy(doorStyles.ourName);

      const styleSheet = [
        ["id", "distributorId", "styleCode", "ourName", "aliasName", "distributorName",
         "doorStyle", "woodSpecies", "finish", "color", "boxConstruction",
         "drawerConstruction", "hardware", "frameSize", "overlayType",
         "doorSampleImageUrl", "roomSceneImageUrl", "isActive", "isFeatured", "isBuilderGrade"],
        ...styleRows.map((r: any) => [
          r.id, r.distributorId, r.styleCode, r.ourName, r.aliasName ?? "",
          r.distributorName, r.doorStyle ?? "", r.woodSpecies ?? "",
          r.finish ?? "", r.color ?? "", r.boxConstruction ?? "",
          r.drawerConstruction ?? "", r.hardware ?? "", r.frameSize ?? "",
          r.overlayType ?? "", r.doorSampleImageUrl ?? "",
          r.roomSceneImageUrl ?? "", r.isActive ? "TRUE" : "FALSE",
          r.isFeatured ? "TRUE" : "FALSE", r.isBuilderGrade ? "TRUE" : "FALSE",
        ]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(styleSheet), "Door Styles");
      counts.doorStyles = styleRows.length;

      // ── Sheet 4: Distributors ───────────────────────────────────────────────
      const distConds: SQL[] = [];
      if (input.distributorId) distConds.push(eq(distributors.id, input.distributorId));

      const distRows = await db
        .select({
          id: distributors.id,
          code: distributors.code,
          name: distributors.name,
          brandName: distributors.brandName,
          costMultiplier: distributors.costMultiplier,
          baseMultiplier: distributors.baseMultiplier,
          freightMultiplier: distributors.freightMultiplier,
          tariffRate: distributors.tariffRate,
          shippingRate: distributors.shippingRate,
          leadTimeDays: distributors.leadTimeDays,
          isActive: distributors.isActive,
          orderEmail: distributors.orderEmail,
        })
        .from(distributors)
        .where(distConds.length > 0 ? and(...distConds) : undefined)
        .orderBy(distributors.name);

      const distSheet = [
        ["id", "code", "name", "brandName", "costMultiplier", "baseMultiplier",
         "freightMultiplier", "tariffRate", "shippingRate", "leadTimeDays", "isActive", "orderEmail"],
        ...distRows.map((r: any) => [
          r.id, r.code, r.name, r.brandName ?? "",
          r.costMultiplier != null ? Number(r.costMultiplier) : "",
          r.baseMultiplier != null ? Number(r.baseMultiplier) : "",
          r.freightMultiplier != null ? Number(r.freightMultiplier) : "",
          r.tariffRate != null ? Number(r.tariffRate) : "",
          r.shippingRate != null ? Number(r.shippingRate) : "",
          r.leadTimeDays ?? "", r.isActive ? "TRUE" : "FALSE", r.orderEmail ?? "",
        ]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(distSheet), "Distributors");
      counts.distributors = distRows.length;

      // ── Serialize ───────────────────────────────────────────────────────────
      const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      const xlsx = buf.toString("base64");
      const date = new Date().toISOString().slice(0, 10);
      const parts: string[] = [];
      if (input.category) parts.push(input.category.toLowerCase());
      if (input.distributorId) parts.push(`dist${input.distributorId}`);
      if (input.styleId) parts.push(`style${input.styleId}`);
      const suffix = parts.length > 0 ? parts.join("-") : "full";
      const filename = `cabinet-dealz-export-${suffix}-${date}.xlsx`;
      return { xlsx, filename, counts };
    }),

});
