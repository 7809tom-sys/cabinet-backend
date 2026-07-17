import { z } from "zod";
import { eq, and, or, like, inArray, isNotNull, sql, desc, asc, type SQL } from "drizzle-orm";
import * as XLSX from "xlsx";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import { TRPCError } from "@trpc/server";
import { getDb, notInConflict, getPricingSettings, updatePricingSettings, getPlatformPricingSettings, updatePlatformPricingSettings } from "../db";
import {
  cabinets,
  distributors,
  doorStyles,
  distributorSkus,
  costChangeLog,
  doorStyleCorrections,
  codeAliases,
  pricingSettings,
} from "../../drizzle/schema";
import { resolvePresentation, applyMarkup } from "../lib/presentation";
import { extractDominantColor } from "../lib/colorSampler";
import { resolveStorefrontTier, visiblePricesForViewer } from "../../shared/pricingTier";
import { sellPriceForTier } from "@shared/margins";
import { invokeLLM } from "../_core/llm";
import { rankDoorMatches, type DoorCandidate, type DoorVisionResult } from "@shared/doorPhotoMatch";
import { parsePriceAuditQuery } from "@shared/priceAuditLookup";
import { filterStylesByAvailability } from "@shared/styleAvailability";

// --- Supplier-identity scrubbing -----------------------------------------------
// Cabinet Dealz never exposes the underlying supplier. These helpers strip any
// supplier-identifying columns from rows before they leave a public procedure,
// so the door-style-first UI can present purely by style.
function scrubCabinet<T extends Record<string, unknown>>(row: T): Omit<T, "descriptionSource"> {
  if (!row) return row;
  const { descriptionSource: _drop, ...rest } = row as T & { descriptionSource?: unknown };
  return rest;
}
function scrubDoorStyle<T extends Record<string, unknown>>(row: T): Omit<T, "distributorName"> {
  if (!row) return row;
  const { distributorName: _drop, ...rest } = row as T & { distributorName?: unknown };
  return rest;
}

// Calendar-day key in UTC (YYYY-MM-DD) used to label the daily audit rotation.
function dayKeyUTC(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

// --- Distributors -------------------------------------------------------------

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

// --- Door Styles --------------------------------------------------------------

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
        warehouseZip: doorStyles.warehouseZip,
        shippingRate: doorStyles.shippingRate,
        doorSampleImageUrl: doorStyles.doorSampleImageUrl,
        doorSampleVerified: doorStyles.doorSampleVerified,
        roomSceneImageUrl: doorStyles.roomSceneImageUrl,
        thumbnailImageUrl: doorStyles.thumbnailImageUrl,
        isFeatured: doorStyles.isFeatured,
        featuredRank: doorStyles.featuredRank,
        featuredLabel: doorStyles.featuredLabel,
        isBuilderGrade: doorStyles.isBuilderGrade,
        isActive: doorStyles.isActive,
        dominantColor: doorStyles.dominantColor,
        createdAt: doorStyles.createdAt,
        pricingVerifiedAt: doorStyles.pricingVerifiedAt,
        // Series name fields from distributors table (for "ourName (seriesName)" display)
        seriesName: distributors.seriesName,
        displayMode: distributors.displayMode,
      };
      const available = await availableStyleIds(db);
      const rows = input?.distributorId
        ? await db
            .select(projection)
            .from(doorStyles)
            .leftJoin(distributors, eq(doorStyles.distributorId, distributors.id))
            .where(
              and(
                eq(doorStyles.distributorId, input.distributorId),
                eq(doorStyles.isActive, true)
              )
            )
        : await db
            .select(projection)
            .from(doorStyles)
            .leftJoin(distributors, eq(doorStyles.distributorId, distributors.id))
            .where(eq(doorStyles.isActive, true));
      // Hide active-but-empty styles from every public surface (storefront +
      // Design Tool picker). Admin back-office queries do not use this router.
      return filterStylesByAvailability(rows, available);
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

  // -- Featured door styles (admin-curated 80/20 merchandising) ----------------
  // Public: the curated set pushed on the storefront, ordered by rank, hard
  // capped at 30 so the affiliate/homeowner sees a focused selection.
  featured: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select()
      .from(doorStyles)
      .where(and(eq(doorStyles.isActive, true), eq(doorStyles.isFeatured, true)))
      .orderBy(asc(doorStyles.featuredRank), asc(doorStyles.ourName))
      .limit(30);
    return rows.map(scrubDoorStyle);
  }),

  // Admin: every active style with its featured flag/rank, for the manager UI.
  listForAdmin: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select()
      .from(doorStyles)
      .where(eq(doorStyles.isActive, true))
      .orderBy(asc(doorStyles.ourName));
    return rows; // admin sees full rows (incl. distributorName) intentionally
  }),

  // Admin: every active style with per-distributor SKU counts, for the manager UI.
  listForAdminWithSkuCounts: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select()
      .from(doorStyles)
      .where(eq(doorStyles.isActive, true))
      .orderBy(asc(doorStyles.ourName));
    // For each style, get SKU counts per distributor
    const skuRows = await db
      .select({
        styleId: distributorSkus.styleId,
        distributorId: distributors.id,
        distributorName: distributors.name,
        skuCount: sql<number>`COUNT(${distributorSkus.id})`,
      })
      .from(distributorSkus)
      .innerJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
      .where(eq(distributorSkus.isAvailable, true))
      .groupBy(distributorSkus.styleId, distributors.id, distributors.name);
    // Build a map: styleId -> [{distributorName, skuCount}]
    const skuMap = new Map<number, { distributorName: string; skuCount: number }[]>();
    for (const r of skuRows) {
      const existing = skuMap.get(r.styleId) ?? [];
      existing.push({ distributorName: r.distributorName, skuCount: Number(r.skuCount) });
      skuMap.set(r.styleId, existing);
    }
    return rows.map((s) => ({
      ...s,
      distributorSkuBreakdown: skuMap.get(s.id) ?? [],
    }));
  }),

  // Admin: toggle a style's featured state. Enforces the MAX 30 cap on enable.
  setFeatured: adminProcedure
    .input(z.object({ id: z.number(), featured: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      if (input.featured) {
        const [{ cnt }] = await db
          .select({ cnt: sql<number>`count(*)` })
          .from(doorStyles)
          .where(and(eq(doorStyles.isActive, true), eq(doorStyles.isFeatured, true)));
        // Allow re-featuring an already-featured row without tripping the cap.
        const already = await db
          .select({ isFeatured: doorStyles.isFeatured })
          .from(doorStyles)
          .where(eq(doorStyles.id, input.id))
          .limit(1);
        const isAlready = already[0]?.isFeatured === true;
        if (!isAlready && Number(cnt) >= 30) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You can feature up to 30 door styles. Remove one before adding another.",
          });
        }
        // New featured items go to the end of the order by default.
        const [{ maxRank }] = await db
          .select({ maxRank: sql<number>`coalesce(max(featuredRank), 0)` })
          .from(doorStyles)
          .where(and(eq(doorStyles.isActive, true), eq(doorStyles.isFeatured, true)));
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
        doorSampleImageUrl: z.string().max(512).nullable().optional(),
        roomSceneImageUrl: z.string().max(512).nullable().optional(),
        thumbnailImageUrl: z.string().max(512).nullable().optional(),
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
      if (fields.doorSampleImageUrl !== undefined) patch.doorSampleImageUrl = fields.doorSampleImageUrl?.trim() || null;
      if (fields.roomSceneImageUrl !== undefined) patch.roomSceneImageUrl = fields.roomSceneImageUrl?.trim() || null;
      if (fields.thumbnailImageUrl !== undefined) patch.thumbnailImageUrl = fields.thumbnailImageUrl?.trim() || null;
      if (Object.keys(patch).length === 0) return { ok: true };
      await db.update(doorStyles).set(patch).where(eq(doorStyles.id, id));
      return { ok: true };
    }),

  // Admin: persist a new order for the featured styles (array of ids, in order).
  reorderFeatured: adminProcedure
    .input(z.object({ orderedIds: z.array(z.number()).max(30) }))
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

  // -- Door sample-photo corrections (two-way photo tool) ----------------------
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

  // -- Family catalog (the door-style-FAMILY-first shopping view) --------------

  // -- Family catalog (the door-style-FAMILY-first shopping view) --------------
  // Given one door style, return EVERY cabinet available in that style (base,
  // wall, tall, vanity, accessory -- all together) collapsed to one priced row
  // per cabinet. This powers the /family/:styleCode page so a shopper picks a
  // family first and then sees all cabinet types in that one look.
  familyCatalog: publicProcedure
    .input(z.object({ styleId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { style: null, items: [] };

      // Simplified pricing: storefront shows listPrice directly (what the
      // distributor uploaded). No tier math, no markup stacking.
      const isAdmin = ctx.user?.role === "admin";

      const styleRows = await db
        .select()
        .from(doorStyles)
        .where(eq(doorStyles.id, input.styleId))
        .limit(1);
      const style = styleRows[0];
      if (!style) return { style: null, items: [] };

      const rows = await db
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
          listPrice: distributorSkus.listPrice,
          adjustedListPrice: distributorSkus.adjustedListPrice,
          wholesalePrice: distributorSkus.wholesalePrice,
          contractorPrice: distributorSkus.contractorPrice,
          homeownerPrice: distributorSkus.homeownerPrice,
          yourCost: distributorSkus.yourCost,
          platformSku: distributorSkus.platformSku,
          skuImageUrl: distributorSkus.imageUrl,
          distributorId: distributorSkus.distributorId,
          skuId: distributorSkus.id,
        })
        .from(distributorSkus)
        .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .where(
          and(
            eq(distributorSkus.styleId, input.styleId),
            eq(distributorSkus.isAvailable, true),
            eq(distributorSkus.isPublished, true),
            eq(cabinets.isActive, true),
            notInConflict()
          )
        );

      // Collapse to one row per cabinet (a cabinet may be carried by multiple
      // supply lines in the same style). Prefer the lowest list price.
      const byCabinet = new Map<number, (typeof rows)[number]>();
      for (const r of rows) {
        const existing = byCabinet.get(r.cabinetId);
        if (!existing) {
          byCabinet.set(r.cabinetId, r);
          continue;
        }
        const a = Number(r.listPrice ?? Infinity);
        const b = Number(existing.listPrice ?? Infinity);
        if (a < b) byCabinet.set(r.cabinetId, r);
      }

      const items = Array.from(byCabinet.values())
        .sort((a, b) =>
          (a.masterCode || "").localeCompare(b.masterCode || "", undefined, {
            numeric: true,
          })
        )
        .map((r) => ({
          ...r,
          // Admins see cost; customers never see it
          yourCost: isAdmin ? r.yourCost : null,
        }));

      return { style: scrubDoorStyle(style), items };
    }),

  // Admin: upload an image for a door style (room scene, door sample, or thumbnail).
  // Accepts a base64 data URL, uploads to storage, and returns the URL so the
  // client can save it via adminUpdateDoorStyle.
  adminUploadDoorStyleImage: adminProcedure
    .input(
      z.object({
        filename: z.string().min(1),
        dataBase64: z.string().min(1),
        contentType: z.string().default("image/jpeg"),
      })
    )
    .mutation(async ({ input }) => {
      const raw = input.dataBase64.includes(",")
        ? input.dataBase64.slice(input.dataBase64.indexOf(",") + 1)
        : input.dataBase64;
      const buf = Buffer.from(raw, "base64");
      const safe = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const { url } = await storagePut(`door-style-images/${Date.now()}_${safe}`, buf, input.contentType);
      return { url };
    }),

  // Admin: reassign a door style to a different distributor.
  adminUpdateDoorStyleDistributor: adminProcedure
    .input(z.object({ id: z.number(), distributorId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(doorStyles).set({ distributorId: input.distributorId }).where(eq(doorStyles.id, input.id));
      return { ok: true };
    }),

  // Admin: update the series name for a distributor.
  adminUpdateDistributorSeriesName: adminProcedure
    .input(z.object({ distributorId: z.number(), seriesName: z.string().max(128).nullable() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.update(distributors).set({ seriesName: input.seriesName?.trim() || null }).where(eq(distributors.id, input.distributorId));
      return { ok: true };
    }),

  // Admin: create a new door style entry for a distributor.
  adminCreateDoorStyle: adminProcedure
    .input(
      z.object({
        distributorId: z.number(),
        styleCode: z.string().min(1).max(32),
        ourName: z.string().min(1).max(128),
        distributorName: z.string().max(128).optional(),
        doorStyle: z.string().max(64).nullable().optional(),
        color: z.string().max(64).nullable().optional(),
        finish: z.string().max(128).nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [result] = await db.insert(doorStyles).values({
        distributorId: input.distributorId,
        styleCode: input.styleCode.trim().toUpperCase(),
        ourName: input.ourName.trim(),
        distributorName: input.distributorName?.trim() || input.ourName.trim(),
        doorStyle: input.doorStyle?.trim() || null,
        color: input.color?.trim() || null,
        finish: input.finish?.trim() || null,
        isActive: true,
        isFeatured: false,
        featuredRank: 0,
        doorSampleVerified: false,
        isBuilderGrade: false,
      });
            return { ok: true, id: (result as { insertId: number }).insertId };
    }),

  /** Admin: list all distributor SKUs for a door style with cabinet info. */
  adminListSkusForStyle: adminProcedure
    .input(z.object({ styleId: z.number().int() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db
        .select({
          id: distributorSkus.id,
          platformSku: distributorSkus.platformSku,
          distributorSku: distributorSkus.distributorSku,
          listPrice: distributorSkus.listPrice,
          yourCost: distributorSkus.yourCost,
          wholesalePrice: distributorSkus.wholesalePrice,
          contractorPrice: distributorSkus.contractorPrice,
          homeownerPrice: distributorSkus.homeownerPrice,
          isAvailable: distributorSkus.isAvailable,
          isPublished: distributorSkus.isPublished,
          cabinetId: distributorSkus.cabinetId,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          category: cabinets.category,
          subCategory: cabinets.subCategory,
          width: cabinets.width,
          height: cabinets.height,
          depth: cabinets.depth,
          conflictStatus: cabinets.conflictStatus,
          conflictReason: cabinets.conflictReason,
        })
        .from(distributorSkus)
        .leftJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .where(eq(distributorSkus.styleId, input.styleId))
        .orderBy(
          // Conflict items bubble to the top so admin sees them first
          sql`case when ${cabinets.conflictStatus} = 'conflict' then 0 else 1 end`,
          asc(cabinets.category),
          asc(cabinets.masterCode)
        );
      return rows;
    }),

  /** Admin: count duplicate SKU rows system-wide (same cabinetId+styleId+distributorId, keep highest id). */
  adminCountDuplicateSkus: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Find groups with more than one row
    const groups = await db
      .select({
        cabinetId: distributorSkus.cabinetId,
        styleId: distributorSkus.styleId,
        distributorId: distributorSkus.distributorId,
        cnt: sql<number>`count(*)`,
        maxId: sql<number>`max(${distributorSkus.id})`,
      })
      .from(distributorSkus)
      .groupBy(distributorSkus.cabinetId, distributorSkus.styleId, distributorSkus.distributorId)
      .having(sql`count(*) > 1`);
    // Total rows that would be deleted = sum of (cnt - 1) for each group
    const toDelete = groups.reduce((acc, g) => acc + (Number(g.cnt) - 1), 0);
    return { duplicateGroups: groups.length, rowsToDelete: toDelete };
  }),

  /** Admin: delete duplicate SKU rows system-wide, keeping the latest upload (highest id) per cabinetId+styleId+distributorId. */
  adminDeduplicateAllSkus: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Find all groups with duplicates and collect the ids to delete
    const groups = await db
      .select({
        cabinetId: distributorSkus.cabinetId,
        styleId: distributorSkus.styleId,
        distributorId: distributorSkus.distributorId,
        maxId: sql<number>`max(${distributorSkus.id})`,
      })
      .from(distributorSkus)
      .groupBy(distributorSkus.cabinetId, distributorSkus.styleId, distributorSkus.distributorId)
      .having(sql`count(*) > 1`);
    if (groups.length === 0) return { deleted: 0 };
    // For each duplicate group, delete all rows except the one with the highest id
    let deleted = 0;
    for (const g of groups) {
      const result = await db
        .delete(distributorSkus)
        .where(
          and(
            eq(distributorSkus.cabinetId, g.cabinetId),
            eq(distributorSkus.styleId, g.styleId),
            eq(distributorSkus.distributorId, g.distributorId),
            sql`${distributorSkus.id} != ${g.maxId}`
          )
        );
      deleted += (result as unknown as { rowsAffected?: number }).rowsAffected ?? 0;
    }
    return { deleted };
  }),

  /** Admin: delete a single distributor SKU row. */
  adminDeleteSku: adminProcedure
    .input(z.object({ skuId: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(distributorSkus).where(eq(distributorSkus.id, input.skuId));
      return { ok: true };
    }),

  /** Admin: toggle isPublished for a single SKU. */
  adminToggleSkuPublished: adminProcedure
    .input(z.object({ skuId: z.number().int(), isPublished: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(distributorSkus)
        .set({ isPublished: input.isPublished })
        .where(eq(distributorSkus.id, input.skuId));
      return { ok: true };
    }),

  /** Admin: bulk toggle isPublished for ALL SKUs of a door style. */
  adminToggleAllSkusPublished: adminProcedure
    .input(z.object({ styleId: z.number().int(), isPublished: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(distributorSkus)
        .set({ isPublished: input.isPublished })
        .where(eq(distributorSkus.styleId, input.styleId));
      return { ok: true };
    }),
});
// --- Cabinets -----------------------------------------------------------------

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
        const canon = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
        // SQL-side canonicalization of masterCode: remove dashes and spaces.
        const canonCol = sql`UPPER(REPLACE(REPLACE(${cabinets.masterCode}, '-', ''), ' ', ''))`;
        // Also search alias raw_code_sample so distributor codes like BEP3 find their master.
        const orParts = [
          sql`${cabinets.masterCode} LIKE ${`%${raw}%`}`,
          sql`${cabinets.description} LIKE ${`%${raw}%`}`,
          sql`EXISTS (SELECT 1 FROM code_aliases ca WHERE ca.cabinet_id = ${cabinets.id} AND (ca.raw_code_sample LIKE ${`%${raw}%`} OR UPPER(REPLACE(REPLACE(ca.raw_code_sample, '-', ''), ' ', '')) LIKE ${`%${canon}%`}))`,
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
        limit: z.number().min(1).max(1000).default(48),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const conds = [
        eq(distributorSkus.styleId, input.styleId),
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true),
        eq(cabinets.isActive, true),
        notInConflict(),
      ];
      if (input.category) conds.push(eq(cabinets.category, input.category));
      if (input.subCategory) conds.push(eq(cabinets.subCategory, input.subCategory));
      if (input.search) {
        conds.push(
          sql`(${cabinets.masterCode} LIKE ${`%${input.search}%`} OR ${cabinets.description} LIKE ${`%${input.search}%`})`
        );
      }

      // Pull all matching cabinet rows for this style (a cabinet may have
      // multiple SKUs across lines in the same style) then collapse to one row
      // per cabinet before paginating, so counts/pages reflect distinct items.
      const rows = await db
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
          graphicType: cabinets.graphicType,
          catalogImageUrl: cabinets.catalogImageUrl,
          placementType: cabinets.placementType,
          isCornerCabinet: cabinets.isCornerCabinet,
        })
        .from(distributorSkus)
        .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .where(and(...conds));

      const byCabinet = new Map<number, (typeof rows)[number]>();
      for (const r of rows) if (!byCabinet.has(r.id)) byCabinet.set(r.id, r);
      const distinct = Array.from(byCabinet.values()).sort((a, b) =>
        (a.masterCode || "").localeCompare(b.masterCode || "", undefined, { numeric: true })
      );

      const total = distinct.length;
      const page = distinct.slice(input.offset, input.offset + input.limit);
      return { items: page, total };
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
      const rows = await db
        .select()
        .from(cabinets)
        .where(and(eq(cabinets.masterCode, input.masterCode), notInConflict()))
        .limit(1);
      return rows[0] ? scrubCabinet(rows[0]) : null;
    }),

  // -- Admin: Missing Image dashboard ----------------------------------------
  // Lists every active cabinet that has no catalogImageUrl, so the admin can
  // assign one from the media library or upload a new one. Does NOT require
  // conflictStatus = 'image_missing'; it surfaces any cabinet missing an image
  // regardless of status, giving the admin a full picture.
  adminListMissingImages: adminProcedure
    .input(
      z.object({
        page: z.number().int().min(0).default(0),
        pageSize: z.number().int().min(1).max(200).default(50),
        search: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };
      const p = input ?? { page: 0, pageSize: 50 };
      const conds = [eq(cabinets.isActive, true), sql`(${cabinets.catalogImageUrl} IS NULL OR ${cabinets.catalogImageUrl} = '')` as SQL];
      if (p.search?.trim()) {
        const q = `%${p.search.trim()}%`;
        conds.push(sql`(${cabinets.masterCode} LIKE ${q} OR ${cabinets.description} LIKE ${q})` as SQL);
      }
      const where = and(...conds);
      const [countRow] = await db.select({ n: sql<number>`count(*)` }).from(cabinets).where(where);
      const total = Number(countRow?.n ?? 0);
      const items = await db
        .select({
          id: cabinets.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          category: cabinets.category,
          subCategory: cabinets.subCategory,
          conflictStatus: cabinets.conflictStatus,
          catalogImageUrl: cabinets.catalogImageUrl,
        })
        .from(cabinets)
        .where(where)
        .orderBy(asc(cabinets.category), asc(cabinets.masterCode))
        .limit(p.pageSize)
        .offset(p.page * p.pageSize);
      return { items, total };
    }),

  // -- Admin: Fix a cabinet's catalog image ------------------------------------
  // Assigns a new image URL to a cabinet. If the cabinet's conflictStatus is
  // 'image_missing', it is automatically cleared back to 'none'.
  adminFixCabinetImage: adminProcedure
    .input(z.object({ id: z.number().int(), imageUrl: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const [cab] = await db.select({ conflictStatus: cabinets.conflictStatus }).from(cabinets).where(eq(cabinets.id, input.id)).limit(1);
      if (!cab) throw new TRPCError({ code: "NOT_FOUND", message: "Cabinet not found." });
      const patch: Record<string, unknown> = { catalogImageUrl: input.imageUrl };
      if (cab.conflictStatus === "image_missing") {
        patch.conflictStatus = "none";
        patch.conflictReason = null;
        patch.conflictedAt = null;
      }
      await db.update(cabinets).set(patch).where(eq(cabinets.id, input.id));
      return { ok: true, conflictCleared: cab.conflictStatus === "image_missing" };
    }),

  // -- Admin: Bulk-assign the same image to multiple cabinets ----------------
  // Assigns a single imageUrl to every cabinet in the ids array. Cabinets whose
  // conflictStatus is 'image_missing' are automatically cleared back to 'none'.
  adminBulkFixCabinetImages: adminProcedure
    .input(
      z.object({
        ids: z.array(z.number().int()).min(1).max(500),
        imageUrl: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Single UPDATE for all ids — set image and clear image_missing flags in one pass
      const CHUNK = 200;
      let updated = 0;
      let conflictsCleared = 0;
      for (let i = 0; i < input.ids.length; i += CHUNK) {
        const chunk = input.ids.slice(i, i + CHUNK);
        // Fetch current conflict statuses for this chunk so we can count clears
        const rows = await db
          .select({ id: cabinets.id, conflictStatus: cabinets.conflictStatus })
          .from(cabinets)
          .where(inArray(cabinets.id, chunk));
        const imageMissingIds = rows
          .filter((r) => r.conflictStatus === "image_missing")
          .map((r) => r.id);
        // Update all in chunk: set image
        await db
          .update(cabinets)
          .set({ catalogImageUrl: input.imageUrl })
          .where(inArray(cabinets.id, chunk));
        updated += chunk.length;
        // Clear image_missing flags for the subset that had them
        if (imageMissingIds.length > 0) {
          await db
            .update(cabinets)
            .set({ conflictStatus: "none", conflictReason: null, conflictedAt: null })
            .where(inArray(cabinets.id, imageMissingIds));
          conflictsCleared += imageMissingIds.length;
        }
      }
      return { ok: true, updated, conflictsCleared };
    }),

  // -- Admin: Conflict / Needs-Review back office ---------------------------
  // Lists every product currently held in conflict status, together with the
  // info we DO know: distributor name(s) and door style(s) it is carried under
  // (resolved from its SKUs). Admin-only -- supplier identity is allowed here.
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
      weight: string | null;
      pkgLength: string | null;
      pkgWidth: string | null;
      pkgHeight: string | null;
      pkgWeight: string | null;
      catalogImageUrl: string | null;
      conflictReason: string | null;
      conflictedAt: Date | null;
      skuCount: number;
      distributorNames: string[];
      doorStyleNames: string[];
      styleIds: number[];
      aliases: string[];
      skus: Array<{
        id: number;
        distributorSku: string | null;
        platformSku: string | null;
        yourCost: string | null;
        listPrice: string | null;
        wholesalePrice: string | null;
        contractorPrice: string | null;
        homeownerPrice: string | null;
        isAvailable: boolean;
        isPublished: boolean;
        styleName: string | null;
        distributorName: string | null;
      }>;
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
        id: distributorSkus.id,
        styleId: distributorSkus.styleId,
        distributorName: distributors.name,
        styleName: doorStyles.ourName,
        styleCode: doorStyles.styleCode,
        distributorSku: distributorSkus.distributorSku,
        platformSku: distributorSkus.platformSku,
        listPrice: distributorSkus.listPrice,
        yourCost: distributorSkus.yourCost,
        wholesalePrice: distributorSkus.wholesalePrice,
        contractorPrice: distributorSkus.contractorPrice,
        homeownerPrice: distributorSkus.homeownerPrice,
        isAvailable: distributorSkus.isAvailable,
        isPublished: distributorSkus.isPublished,
      })
      .from(distributorSkus)
      .leftJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
      .leftJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
      .where(inArray(distributorSkus.cabinetId, ids));
    const byCab = new Map<number, typeof skuRows>();
    for (const r of skuRows) {
      const arr = byCab.get(r.cabinetId) ?? [];
      arr.push(r);
      byCab.set(r.cabinetId, arr);
    }
    // Fetch aliases for all conflict cabinets
    const aliasRows = await db
      .select({ cabinetId: codeAliases.cabinetId, rawCodeSample: codeAliases.rawCodeSample })
      .from(codeAliases)
      .where(inArray(codeAliases.cabinetId, ids));
    const aliasesByCab = new Map<number, string[]>();
    for (const a of aliasRows) {
      if (a.cabinetId == null) continue;
      const arr = aliasesByCab.get(a.cabinetId) ?? [];
      arr.push(a.rawCodeSample);
      aliasesByCab.set(a.cabinetId, arr);
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
        weight: c.weight ?? null,
        pkgLength: c.pkgLength ?? null,
        pkgWidth: c.pkgWidth ?? null,
        pkgHeight: c.pkgHeight ?? null,
        pkgWeight: c.pkgWeight ?? null,
        catalogImageUrl: c.catalogImageUrl ?? null,
        conflictReason: c.conflictReason,
        conflictedAt: c.conflictedAt,
        skuCount: skus.length,
        distributorNames,
        doorStyleNames,
        styleIds,
        aliases: aliasesByCab.get(c.id) ?? [],
        skus: skus.map((s) => ({
          id: s.id,
          distributorSku: s.distributorSku,
          platformSku: s.platformSku,
          yourCost: s.yourCost,
          listPrice: s.listPrice,
          wholesalePrice: s.wholesalePrice,
          contractorPrice: s.contractorPrice,
          homeownerPrice: s.homeownerPrice,
          isAvailable: s.isAvailable ?? false,
          isPublished: s.isPublished ?? false,
          styleName: s.styleName ? `${s.styleName}${s.styleCode ? ` (${s.styleCode})` : ""}` : null,
          distributorName: s.distributorName,
        })),
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
        weight: z.string().nullable().optional(),
        pkgLength: z.string().nullable().optional(),
        pkgWidth: z.string().nullable().optional(),
        pkgHeight: z.string().nullable().optional(),
        pkgWeight: z.string().nullable().optional(),
        catalogImageUrl: z.string().nullable().optional(),
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
      if (input.category !== undefined) patch.category = input.category;
      if (input.subCategory !== undefined) patch.subCategory = input.subCategory;
      if (input.width !== undefined) patch.width = input.width;
      if (input.height !== undefined) patch.height = input.height;
      if (input.depth !== undefined) patch.depth = input.depth;
      if (input.weight !== undefined) patch.weight = input.weight;
      if (input.pkgLength !== undefined) patch.pkgLength = input.pkgLength;
      if (input.pkgWidth !== undefined) patch.pkgWidth = input.pkgWidth;
      if (input.pkgHeight !== undefined) patch.pkgHeight = input.pkgHeight;
      if (input.pkgWeight !== undefined) patch.pkgWeight = input.pkgWeight;
      if (input.catalogImageUrl !== undefined) patch.catalogImageUrl = input.catalogImageUrl;
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

  // -- Admin: Promote conflict item to a brand-new master cabinet -----------
  // Fills in all required fields on the conflict cabinet and clears the
  // conflict status in one step. The cabinet gets a new master code.
  adminPromoteToNewMaster: adminProcedure
    .input(
      z.object({
        id: z.number(),
        masterCode: z.string().min(1),
        description: z.string().min(1),
        category: z.string().min(1),
        subCategory: z.string().optional().nullable(),
        width: z.string().optional().nullable(),
        height: z.string().optional().nullable(),
        depth: z.string().optional().nullable(),
        weight: z.string().optional().nullable(),
        pkgLength: z.string().optional().nullable(),
        pkgWidth: z.string().optional().nullable(),
        pkgHeight: z.string().optional().nullable(),
        pkgWeight: z.string().optional().nullable(),
        catalogImageUrl: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      // Ensure the new master code is not already taken by a different cabinet
      const existing = await db
        .select({ id: cabinets.id })
        .from(cabinets)
        .where(eq(cabinets.masterCode, input.masterCode))
        .limit(1);
      if (existing.length > 0 && existing[0].id !== input.id) {
        throw new TRPCError({ code: "CONFLICT", message: `Master code "${input.masterCode}" is already in use by another cabinet.` });
      }
      await db.update(cabinets).set({
        masterCode: input.masterCode,
        description: input.description,
        category: input.category,
        subCategory: input.subCategory ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        depth: input.depth ?? null,
        weight: input.weight ?? null,
        pkgLength: input.pkgLength ?? null,
        pkgWidth: input.pkgWidth ?? null,
        pkgHeight: input.pkgHeight ?? null,
        pkgWeight: input.pkgWeight ?? null,
        catalogImageUrl: input.catalogImageUrl ?? null,
        conflictStatus: "none",
        conflictReason: null,
        conflictedAt: null,
      }).where(eq(cabinets.id, input.id));
      return { ok: true, masterCode: input.masterCode };
    }),

  // -- Admin: Map conflict item to an existing master cabinet ---------------
  // Re-points all SKUs from the conflict cabinet to an existing master, then
  // deactivates the conflict cabinet record so it no longer appears anywhere.
  adminMapConflictToExisting: adminProcedure
    .input(z.object({ conflictId: z.number(), targetMasterCode: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const target = await db
        .select({ id: cabinets.id, masterCode: cabinets.masterCode })
        .from(cabinets)
        .where(eq(cabinets.masterCode, input.targetMasterCode))
        .limit(1);
      if (!target[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Cabinet "${input.targetMasterCode}" not found in master catalog.` });
      }
      if (target[0].id === input.conflictId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot map a cabinet to itself." });
      }
      // Move all SKUs from the conflict cabinet to the target
      await db
        .update(distributorSkus)
        .set({ cabinetId: target[0].id })
        .where(eq(distributorSkus.cabinetId, input.conflictId));
      // Deactivate the conflict cabinet (it is now a duplicate)
      await db
        .update(cabinets)
        .set({ isActive: false, conflictStatus: "none", conflictReason: null, conflictedAt: null })
        .where(eq(cabinets.id, input.conflictId));
      return { ok: true, targetMasterCode: target[0].masterCode };
    }),

  // -- Admin: Cabinet spreadsheet export ------------------------------------
  // Returns a base64-encoded XLSX workbook containing every cabinet row so
  // the admin can correct descriptions, dimensions, categories, etc. in Excel
  // and re-upload via adminImport.
  adminExport: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { xlsx: "", filename: "cabinets.xlsx", count: 0 };

    // Fetch all distributor color names so we can exclude style-specific accessories
    // (e.g. "ANTIQUE WHITE-F342", "Cashmere-10") from the generic cabinets export.
    const styleNames = await db
      .select({ distributorName: doorStyles.distributorName })
      .from(doorStyles);
    const styleNameList = styleNames.map((s) => s.distributorName.toUpperCase());

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
      })
      .from(cabinets)
      .orderBy(asc(cabinets.category), asc(cabinets.masterCode));

    // Filter out style-specific accessories: any row whose masterCode starts with
    // a known distributor color name followed by a hyphen (e.g. "ANTIQUE WHITE-F342").
    const genericRows = rows.filter((r) => {
      const code = r.masterCode.toUpperCase();
      // Check if this masterCode starts with any style distributorName + "-"
      for (const name of styleNameList) {
        if (code.startsWith(name + "-")) return false;
      }
      return true;
    });

    const sheetData = [
      [
        "masterCode", "description", "category", "subCategory", "placementType",
        "width", "height", "depth", "numberOfDoors", "numberOfDrawers",
        "hingeSide", "isCornerCabinet", "cornerSide", "graphicType", "isActive",
      ],
      ...genericRows.map((r) => [
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
      ]),
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    XLSX.utils.book_append_sheet(wb, ws, "Cabinets");
    const buf = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
    const date = new Date().toISOString().slice(0, 10);
    return { xlsx: buf as string, filename: `cabinet-dealz-cabinets-${date}.xlsx`, count: genericRows.length };
  }),

  // -- Admin: Cabinet spreadsheet import ------------------------------------
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

        // Build the patch -- only include fields that are present and non-empty.
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

        if (Object.keys(patch).length === 0) { skipped++; continue; }

        try {
          // Verify the masterCode exists first — TiDB/MySQL rowsAffected is unreliable
          // (returns 0 even for real updates when CLIENT_FOUND_ROWS flag is not set).
          const existing = await db
            .select({ id: cabinets.id })
            .from(cabinets)
            .where(eq(cabinets.masterCode, masterCode))
            .limit(1);
          if (existing.length === 0) {
            skipped++;
            errors.push(`Row ${i + 2}: masterCode "${masterCode}" not found -- skipped.`);
            continue;
          }
          await db
            .update(cabinets)
            .set(patch)
            .where(eq(cabinets.masterCode, masterCode));
          updated++;
        } catch (err) {
          errors.push(`Row ${i + 2}: ${masterCode} -- ${err instanceof Error ? err.message : String(err)}`);
          skipped++;
        }
      }

      return { updated, skipped, errors };
    }),

  // -- Admin: Inline storefront edit ------------------------------------------
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
        weight: z.string().nullable().optional(),
        // Package dimensions & weight
        pkgLength: z.string().nullable().optional(),
        pkgWidth: z.string().nullable().optional(),
        pkgHeight: z.string().nullable().optional(),
        pkgWeight: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const patch: Record<string, unknown> = {};
      if (input.description !== undefined) patch.description = input.description;
      if (input.category !== undefined) patch.category = input.category;
      if (input.subCategory !== undefined) patch.subCategory = input.subCategory;
      if (input.catalogImageUrl !== undefined) patch.catalogImageUrl = input.catalogImageUrl;
      if (input.showInCatalog !== undefined) patch.showInCatalog = input.showInCatalog;
      if (input.showInDesigner !== undefined) patch.showInDesigner = input.showInDesigner;
      if (input.showIn2020 !== undefined) patch.showIn2020 = input.showIn2020;
      if (input.width !== undefined) patch.width = input.width;
      if (input.height !== undefined) patch.height = input.height;
      if (input.depth !== undefined) patch.depth = input.depth;
      if (input.weight !== undefined) patch.weight = input.weight;
      if (input.pkgLength !== undefined) patch.pkgLength = input.pkgLength;
      if (input.pkgWidth !== undefined) patch.pkgWidth = input.pkgWidth;
      if (input.pkgHeight !== undefined) patch.pkgHeight = input.pkgHeight;
      if (input.pkgWeight !== undefined) patch.pkgWeight = input.pkgWeight;
      if (input.isActive !== undefined) patch.isActive = input.isActive;
      if (Object.keys(patch).length === 0) return { ok: true };
      await db.update(cabinets).set(patch).where(eq(cabinets.id, input.id));
      return { ok: true };
    }),

  // -- Admin: Upload catalog image for a cabinet ----------------------------
  // Accepts a base64 data URL (from a file picker), uploads to storage, and
  // returns the /manus-storage/ URL so the client can save it via adminUpdateCabinet.
  adminUploadCatalogImage: adminProcedure
    .input(
      z.object({
        filename: z.string().min(1),
        dataBase64: z.string().min(1),
        contentType: z.string().default("image/jpeg"),
      })
    )
    .mutation(async ({ input }) => {
      const raw = input.dataBase64.includes(",")
        ? input.dataBase64.slice(input.dataBase64.indexOf(",") + 1)
        : input.dataBase64;
      const buf = Buffer.from(raw, "base64");
      const safe = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const { url } = await storagePut(`catalog-images/${Date.now()}_${safe}`, buf, input.contentType);
      return { url };
    }),

  // -- Cabinet Line Export ---------------------------------------------------
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

      // Fetch the door style name + distributor name for the filename.
      const styleRows = await db
        .select({
          ourName: doorStyles.ourName,
          styleCode: doorStyles.styleCode,
          distributorName: distributors.name,
          distributorSeriesName: distributors.seriesName,
        })
        .from(doorStyles)
        .leftJoin(distributors, eq(doorStyles.distributorId, distributors.id))
        .where(eq(doorStyles.id, input.styleId))
        .limit(1);
      const style = styleRows[0];
      const brandName = style?.distributorSeriesName || style?.distributorName || "Cabinet Line";
      const styleName = style?.ourName || style?.styleCode || `Style ${input.styleId}`;
      // Sanitize for filename: replace chars that are invalid in filenames.
      const safe = (s: string) => s.replace(/[/\\:*?"<>|]/g, "-").trim();
      const filename = `${safe(brandName)} - ${safe(styleName)}.xlsx`;

      // Fetch all cabinets for this style with pricing.
      // Image URL comes from the master cabinet record (not the SKU).
      const rows = await db
        .select({
          id: cabinets.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          category: cabinets.category,
          subCategory: cabinets.subCategory,
          width: cabinets.width,
          height: cabinets.height,
          depth: cabinets.depth,
          catalogImageUrl: cabinets.catalogImageUrl,  // image from master cabinet
          listPrice: distributorSkus.listPrice,
          yourCost: distributorSkus.yourCost,
          platformSku: distributorSkus.platformSku,
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
        .where(
          and(
            eq(cabinets.isActive, true),
            input.cabinetIds && input.cabinetIds.length > 0
              ? inArray(cabinets.id, input.cabinetIds)
              : undefined
          )
        )
        .orderBy(cabinets.category, cabinets.masterCode);

      // Build XLSX with headers that exactly match the importer's HEADER_ALIASES
      // so a downloaded file can be re-uploaded without any column errors.
      const XLSX = await import("xlsx");
      const wsData = [
        // These headers are accepted verbatim by parseDistributorCsv / HEADER_ALIASES.
        ["Master Code", "Description", "Category", "Sub Category",
         "Width", "Height", "Depth",
         "List Price", "Your Cost", "Style Code", "Image URL"],
        ...rows.map((r) => [
          r.masterCode ?? "",
          r.description ?? "",
          r.category ?? "",
          r.subCategory ?? "",
          r.width != null ? Number(r.width) : "",
          r.height != null ? Number(r.height) : "",
          r.depth != null ? Number(r.depth) : "",
          r.listPrice != null ? Number(r.listPrice) : "",
          r.yourCost != null ? Number(r.yourCost) : "",
          style?.styleCode ?? "",
          r.catalogImageUrl ?? "",
        ]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Cabinets");
      const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      const xlsx = buf.toString("base64");
      return { xlsx, filename, count: rows.length };
    }),

  // -- Admin: Bulk Dimensions & Weight editor --------------------------------
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
          sql`(${cabinets.width} IS NULL OR ${cabinets.height} IS NULL OR ${cabinets.depth} IS NULL OR ${cabinets.weight} IS NULL OR ${cabinets.weight} = 0 OR ${cabinets.pkgLength} IS NULL OR ${cabinets.pkgWidth} IS NULL OR ${cabinets.pkgHeight} IS NULL OR ${cabinets.pkgWeight} IS NULL)`
        );
      }
      if (input.search) {
        const like = `%${input.search}%`;
        conditions.push(
          sql`(${cabinets.masterCode} LIKE ${like} OR ${cabinets.description} LIKE ${like})`
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
        const like = `%${input.search}%`;
        conditions.push(
          sql`(${cabinets.masterCode} LIKE ${like} OR ${cabinets.description} LIKE ${like})`
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


  // -- Parse XLSX columns (for column mapping UI) ----------------------------
  // Returns sheet names and column headers for a given XLSX/CSV file so the
  // admin can map arbitrary spreadsheet columns to known cabinet fields.
  parseXlsxColumns: adminProcedure
    .input(
      z.object({
        fileBase64: z.string().min(1),
        filename: z.string().default("upload.xlsx"),
      })
    )
    .mutation(async ({ input }) => {
      const isCsv = input.filename.toLowerCase().endsWith(".csv");
      let wb: XLSX.WorkBook;
      try {
        if (isCsv) {
          const text = Buffer.from(input.fileBase64, "base64").toString("utf-8");
          wb = XLSX.read(text, { type: "string" });
        } else {
          wb = XLSX.read(input.fileBase64, { type: "base64" });
        }
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Could not parse the file. Make sure it is a valid .xlsx or .csv file." });
      }
      const sheets: Array<{ name: string; headers: string[]; previewRows: Array<Record<string, string>> }> = [];
      for (const name of wb.SheetNames) {
        const ws = wb.Sheets[name];
        if (!ws) continue;
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
        if (rows.length === 0) { sheets.push({ name, headers: [], previewRows: [] }); continue; }
        const headers = Object.keys(rows[0]);
        const previewRows = rows.slice(0, 3).map((r) =>
          Object.fromEntries(headers.map((h) => [h, String(r[h] ?? "")]))
        );
        sheets.push({ name, headers, previewRows });
      }
      return { sheets };
    }),

  // -- Import cabinets with explicit column mapping --------------------------
  // Like adminImport but accepts an arbitrary spreadsheet with a user-chosen
  // column mapping instead of requiring exact column names.
  adminImportWithMapping: adminProcedure
    .input(
      z.object({
        fileBase64: z.string().min(1),
        filename: z.string().default("upload.xlsx"),
        sheetName: z.string().optional(),
        mapping: z.record(
          z.string(),
          z.enum(["masterCode", "description", "category", "subCategory",
                  "width", "height", "depth", "isActive", "placementType",
                  "numberOfDoors", "numberOfDrawers", "hingeSide", "graphicType"])
        ),
        dryRun: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const isCsv = input.filename.toLowerCase().endsWith(".csv");
      let wb: XLSX.WorkBook;
      try {
        if (isCsv) {
          const text = Buffer.from(input.fileBase64, "base64").toString("utf-8");
          wb = XLSX.read(text, { type: "string" });
        } else {
          wb = XLSX.read(input.fileBase64, { type: "base64" });
        }
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Could not parse the file." });
      }
      const sheetName = input.sheetName ?? wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      if (!ws) throw new TRPCError({ code: "BAD_REQUEST", message: `Sheet "${sheetName}" not found.` });
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
      const fieldToCol: Partial<Record<string, string>> = {};
      for (const [col, field] of Object.entries(input.mapping)) fieldToCol[field] = col;
      if (!fieldToCol["masterCode"]) throw new TRPCError({ code: "BAD_REQUEST", message: "masterCode column mapping is required." });
      let updated = 0, skipped = 0;
      const errors: string[] = [];
      const preview: Array<{ masterCode: string; changes: Record<string, unknown> }> = [];
      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        const masterCode = String(row[fieldToCol["masterCode"]!] ?? "").trim();
        if (!masterCode) { skipped++; continue; }
        const patch: Record<string, unknown> = {};
        for (const [field, col] of Object.entries(fieldToCol)) {
          if (field === "masterCode" || !col) continue;
          const raw = String(row[col] ?? "").trim();
          if (!raw) continue;
          if (field === "width" || field === "height" || field === "depth") {
            const n = parseFloat(raw); if (!isNaN(n)) patch[field] = String(n);
          } else if (field === "numberOfDoors" || field === "numberOfDrawers") {
            const n = parseInt(raw, 10); if (!isNaN(n)) patch[field] = n;
          } else if (field === "isActive") {
            const up = raw.toUpperCase();
            if (up === "TRUE" || up === "1" || up === "YES") patch[field] = true;
            else if (up === "FALSE" || up === "0" || up === "NO") patch[field] = false;
          } else {
            patch[field] = raw;
          }
        }
        if (Object.keys(patch).length === 0) { skipped++; continue; }
        if (input.dryRun) { preview.push({ masterCode, changes: patch }); continue; }
        try {
          const existing = await db.select({ id: cabinets.id }).from(cabinets)
            .where(eq(cabinets.masterCode, masterCode)).limit(1);
          if (existing.length === 0) {
            skipped++; errors.push(`Row ${i + 2}: masterCode "${masterCode}" not found — skipped.`); continue;
          }
          await db.update(cabinets).set(patch).where(eq(cabinets.masterCode, masterCode));
          updated++;
        } catch (err) {
          errors.push(`Row ${i + 2}: ${masterCode} — ${err instanceof Error ? err.message : String(err)}`);
          skipped++;
        }
      }
      return { updated, skipped, errors, preview };
    }),

  // -- Admin: Create a new cabinet (single-item form) -------------------------
  adminCreateCabinet: adminProcedure
    .input(
      z.object({
        masterCode: z.string().min(1).max(64),
        description: z.string().min(1),
        category: z.string().min(1),
        subCategory: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        depth: z.number().optional(),
        placementType: z.string().optional(),
        numberOfDoors: z.number().int().optional(),
        numberOfDrawers: z.number().int().optional(),
        hingeSide: z.string().optional(),
        isCornerCabinet: z.boolean().optional(),
        graphicType: z.string().optional(),
        isActive: z.boolean().default(true),
        distributorSku: z.object({
          distributorId: z.number().int(),
          styleId: z.number().int(),
          distributorSku: z.string().min(1),
          listPrice: z.number().optional(),
          yourCost: z.number().optional(),
        }).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const existing = await db.select({ id: cabinets.id }).from(cabinets).where(eq(cabinets.masterCode, input.masterCode)).limit(1);
      if (existing.length > 0) throw new TRPCError({ code: "CONFLICT", message: `A cabinet with masterCode "${input.masterCode}" already exists.` });
      const patch: Record<string, unknown> = {
        masterCode: input.masterCode,
        description: input.description,
        category: input.category,
        subCategory: input.subCategory ?? null,
        isActive: input.isActive,
      };
      if (input.width !== undefined) patch.width = String(input.width);
      if (input.height !== undefined) patch.height = String(input.height);
      if (input.depth !== undefined) patch.depth = String(input.depth);
      if (input.placementType) patch.placementType = input.placementType;
      if (input.numberOfDoors !== undefined) patch.numberOfDoors = input.numberOfDoors;
      if (input.numberOfDrawers !== undefined) patch.numberOfDrawers = input.numberOfDrawers;
      if (input.hingeSide) patch.hingeSide = input.hingeSide;
      if (input.isCornerCabinet !== undefined) patch.isCornerCabinet = input.isCornerCabinet;
      if (input.graphicType) patch.graphicType = input.graphicType;
      const [result] = await db.insert(cabinets).values(patch as typeof cabinets.$inferInsert);
      const cabinetId = (result as { insertId: number }).insertId;
      let skuId: number | undefined;
      if (input.distributorSku) {
        const { distributorId, styleId, distributorSku: dSku, listPrice, yourCost } = input.distributorSku;
        const platformSku = `${input.masterCode}-DS${styleId}-D${distributorId}`;
        const skuPatch: Record<string, unknown> = { cabinetId, distributorId, styleId, platformSku, distributorSku: dSku, isAvailable: true, isPublished: true, status: "approved" };
        if (listPrice !== undefined) skuPatch.listPrice = String(listPrice);
        if (yourCost !== undefined) skuPatch.yourCost = String(yourCost);
        const [skuResult] = await db.insert(distributorSkus).values(skuPatch as typeof distributorSkus.$inferInsert);
        skuId = (skuResult as { insertId: number }).insertId;
      }
      return { cabinetId, skuId, masterCode: input.masterCode };
    }),

  // -- Admin: Description Cleanup -------------------------------------------
  // Returns just the count of flagged descriptions (for the tab badge).
  adminFlaggedDescriptionCount: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return 0;
    const BRAND_NAMES = [
      "Castleberry", "Aspen", "Skyline", "Spring Forest", "Floral",
      "Lumina", "Milestone", "Clark & Son", "Clark and Son",
      "US Cabinet Depot", "Cabinet Depot", "Forevermark", "Fabuwood",
      "Wolf Classic", "Kraftmaid", "Merillat", "Waypoint", "Diamond",
      "Aristokraft", "Medallion",
    ];
    const rows = await db
      .select({ id: cabinets.id })
      .from(cabinets)
      .where(or(...BRAND_NAMES.map((b) => like(cabinets.description, `%${b}%`))));
    return rows.length;
  }),

  // Returns cabinets whose description contains a known brand/style name.
  adminListFlaggedDescriptions: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const BRAND_NAMES = [
      "Castleberry", "Aspen", "Skyline", "Spring Forest", "Floral",
      "Lumina", "Milestone", "Clark & Son", "Clark and Son",
      "US Cabinet Depot", "Cabinet Depot", "Forevermark", "Fabuwood",
      "Wolf Classic", "Kraftmaid", "Merillat", "Waypoint", "Diamond",
      "Aristokraft", "Medallion",
    ];
    const rows = await db
      .select({ id: cabinets.id, masterCode: cabinets.masterCode, description: cabinets.description })
      .from(cabinets)
      .where(or(...BRAND_NAMES.map((b) => like(cabinets.description, `%${b}%`))));
    return rows.map((row) => {
      let suggested = row.description ?? "";
      for (const brand of BRAND_NAMES) {
        const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`\\b${escaped}\\s*`, "gi");
        suggested = suggested.replace(re, "").trim();
      }
      suggested = suggested.replace(/\s{2,}/g, " ").trim();
      const matchedBrands = BRAND_NAMES.filter((b) =>
        (row.description ?? "").toLowerCase().includes(b.toLowerCase())
      );
      return { id: row.id, masterCode: row.masterCode, original: row.description ?? "", suggested, matchedBrands };
    });
  }),

  // -- Admin: Save cleaned descriptions (bulk) --------------------------------
  adminSaveCleanedDescriptions: adminProcedure
    .input(z.array(z.object({ id: z.number().int(), description: z.string().min(1) })))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      let updated = 0;
      for (const item of input) {
        await db.update(cabinets).set({ description: item.description }).where(eq(cabinets.id, item.id));
        updated++;
      }
      return { updated };
    }),

});

// --- Pricing ------------------------------------------------------------------

/**
 * Recompute wholesalePrice, contractorPrice, homeownerPrice for every SKU
 * (or just one distributor's SKUs) using the current tier BPS settings.
 *
 * Formula: ROUND(yourCost * bps / 10000, 2)
 * Falls back to listPrice when yourCost is NULL.
 * Respects manual overrides: if a *PriceOverride column is set, the stored
 * tier price is still updated (the override takes precedence at read time).
 *
 * Returns the number of SKU rows updated.
 */
async function recalcAllTierPrices(
  s: { wholesaleMarkupBps: number; contractorMarkupBps: number; homeownerMarkupBps: number },
  distributorId?: number,
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const wBps = s.wholesaleMarkupBps / 10000;
  const cBps = s.contractorMarkupBps / 10000;
  const hBps = s.homeownerMarkupBps / 10000;

  // costBase = COALESCE(yourCost, listPrice) — mirrors resolveCostBase() in shared/margins.ts
  const costBase = sql`COALESCE(${distributorSkus.yourCost}, ${distributorSkus.listPrice})`;

  const whereClause = distributorId
    ? and(
        sql`${costBase} IS NOT NULL`,
        eq(distributorSkus.distributorId, distributorId),
      )
    : sql`${costBase} IS NOT NULL`;

  const res = await db
    .update(distributorSkus)
    .set({
      wholesalePrice: sql`ROUND(${costBase} * ${wBps}, 2)`,
      contractorPrice: sql`ROUND(${costBase} * ${cBps}, 2)`,
      homeownerPrice: sql`ROUND(${costBase} * ${hBps}, 2)`,
    })
    .where(whereClause);

  const count =
    (res as unknown as { rowsAffected?: number })?.rowsAffected ??
    (res as unknown as { affectedRows?: number })?.affectedRows ??
    0;

  // Only stamp the global recalc timestamp when we updated ALL distributors
  // (not a per-distributor subset), so the timestamp reflects a full catalog pass.
  if (!distributorId) {
    const settingsRows = await db.select({ id: pricingSettings.id }).from(pricingSettings).limit(1);
    if (settingsRows.length > 0) {
      await db
        .update(pricingSettings)
        .set({ tierPricesRecalcAt: new Date() })
        .where(eq(pricingSettings.id, settingsRows[0].id));
    }
  }

  return count;
}

export const pricingRouter = router({
  // -- Door-style-first pricing ----------------------------------------------
  // Returns ONE priced row per unique door style for a cabinet. Internally we
  // pick the best (lowest contractor price) available + published SKU per style
  // and surface ONLY style metadata + prices. No distributor name/SKU ever
  // leaves the server, so the UI can present purely by door style.
  stylesForCabinet: publicProcedure
    .input(z.object({ cabinetId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      // Simplified pricing: sell price = listPrice x distributor.markupPercent
      // (falls back to yourCost if listPrice is absent). No tier stacking.
      const isAdmin = ctx.user?.role === "admin";
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
          woodSpecies: doorStyles.woodSpecies,
          boxConstruction: doorStyles.boxConstruction,
          drawerConstruction: doorStyles.drawerConstruction,
          hardware: doorStyles.hardware,
          frameSize: doorStyles.frameSize,
          overlayType: doorStyles.overlayType,
          isBuilderGrade: doorStyles.isBuilderGrade,
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
        })
        .from(distributorSkus)
        .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
        .innerJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
        .innerJoin(cabinets, eq(distributorSkus.cabinetId, cabinets.id))
        .where(
          and(
            eq(distributorSkus.cabinetId, input.cabinetId),
            eq(distributorSkus.isAvailable, true),
            eq(distributorSkus.isPublished, true),
            eq(doorStyles.isActive, true),
            eq(distributors.isActive, true),
            notInConflict()
          )
        );

            // Collapse to one row per style code (prefer lowest list price).
      const byStyle = new Map<string, (typeof rows)[number]>();
      for (const r of rows) {
        const key = (r.styleCode || r.ourName || String(r.styleId)).toUpperCase();
        const existing = byStyle.get(key);
        if (!existing) {
          byStyle.set(key, r);
          continue;
        }
        const a = Number(r.listPrice ?? r.yourCost ?? Infinity);
        const b = Number(existing.listPrice ?? existing.yourCost ?? Infinity);
        if (a < b) byStyle.set(key, r);
      }
      return Array.from(byStyle.values())
        .map((r) => ({
          styleId: r.styleId,
          styleCode: r.styleCode,
          name: r.ourName,
          doorStyle: r.doorStyle,
          finish: r.finish,
          color: r.color,
          doorSampleImageUrl: r.doorSampleImageUrl,
          roomSceneImageUrl: r.roomSceneImageUrl,
          thumbnailImageUrl: r.thumbnailImageUrl,
          woodSpecies: r.woodSpecies,
          boxConstruction: r.boxConstruction,
          drawerConstruction: r.drawerConstruction,
          hardware: r.hardware,
          frameSize: r.frameSize,
          overlayType: r.overlayType,
          isBuilderGrade: r.isBuilderGrade,
          // Simplified: show listPrice directly; fall back to yourCost
          listPrice: r.listPrice ?? r.yourCost ?? null,
          adjustedListPrice: r.adjustedListPrice,
          wholesalePrice: r.wholesalePrice,
          contractorPrice: r.contractorPrice,
          homeownerPrice: r.homeownerPrice,
          yourCost: isAdmin ? r.yourCost : null,
          platformSku: r.platformSku,
          skuImageUrl: r.skuImageUrl,
          leadTimeDays: r.leadTimeDays,
          distributorId: r.distributorId,
        }))
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }),

  // -- Margins control center (admin) ----------------------------------------
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
      // After saving new BPS values, immediately recompute all stored tier prices
      // so every SKU row reflects the new multipliers right away.
      const updated = await getPricingSettings();
      await recalcAllTierPrices(updated);
      // Re-fetch so the returned settings include the fresh tierPricesRecalcAt stamp.
      return await getPricingSettings();
    }),

  // Manually trigger a full tier-price recalculation for all SKUs (or a single
  // distributor). Useful after bulk imports or multiplier changes.
  adminRecalcAllTierPrices: adminProcedure
    .input(z.object({ distributorId: z.number().int().optional() }))
    .mutation(async ({ input }) => {
      const s = await getPricingSettings();
      const count = await recalcAllTierPrices(s, input.distributorId);
      // Re-fetch to get the updated tierPricesRecalcAt timestamp.
      const fresh = await getPricingSettings();
      return { success: true, skusRecomputed: count, tierPricesRecalcAt: fresh.tierPricesRecalcAt };
    }),

  // --- Platform fee system (price ladder + order fee stack) ----------------
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

  // --- Per-distributor cost Multiplier tab -------------------------------------
  // ONE list-price multiplier per distributor line, applied to EVERY cabinet
  // that line carries. Our true cost = listPrice x multiplier (stored in
  // distributor_skus.yourCost), and every sell price is cost x the per-tier
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
        distributors.freightMultiplier
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
        // a tariff is lowered). Effective = base + freight, and cost = list x effective.
        baseMultiplier: z.number().min(0).max(1),
        freightMultiplier: z.number().min(0).max(1),
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
      // Only persist the multiplier on the distributor record.
      // yourCost values on existing SKUs are NOT touched here — they come directly
      // from the uploaded spreadsheet. Use adminRecalcDistributorCosts to explicitly
      // recompute all costs from listPrice × multiplier when needed.
      await db
        .update(distributors)
        .set({
          baseMultiplier: String(base),
          freightMultiplier: String(freight),
          costMultiplier: String(mult),
        })
        .where(eq(distributors.id, input.distributorId));
      return {
        success: true,
        baseMultiplier: base,
        freightMultiplier: freight,
        multiplier: mult,
        skusRecomputed: 0,
      } as const;
    }),

  // Explicitly recompute yourCost = listPrice × costMultiplier for every SKU on
  // a distributor line. Only call this when the admin intentionally wants to
  // override uploaded cost values with the multiplier-derived value.
  adminRecalcDistributorCosts: adminProcedure
    .input(z.object({ distributorId: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No database" });
      const [dist] = await db
        .select({ costMultiplier: distributors.costMultiplier })
        .from(distributors)
        .where(eq(distributors.id, input.distributorId))
        .limit(1);
      if (!dist) throw new TRPCError({ code: "NOT_FOUND", message: "Distributor not found" });
      const mult = Number(dist.costMultiplier);
      if (!mult || mult <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Distributor has no valid costMultiplier set" });
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
      // After updating yourCost, immediately recalculate tier sell prices for
      // this distributor so the stored wholesalePrice/contractorPrice/homeownerPrice
      // values reflect the new cost base.
      const s = await getPricingSettings();
      await recalcAllTierPrices(s, input.distributorId);
      return { success: true, skusRecomputed: updated } as const;
    }),

  // --- Cost Lookup / Verify & Correct (admin / owner) --------------------------
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

  /** Admin: toggle isAvailable on a single SKU. */
  adminUpdateSkuAvailability: adminProcedure
    .input(z.object({ skuId: z.number().int(), isAvailable: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .update(distributorSkus)
        .set({ isAvailable: input.isAvailable })
        .where(eq(distributorSkus.id, input.skuId));
      return { ok: true };
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

  // --- Price Audit: cascading dropdowns (no SKU typing required) ----------------
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

  // -- Admin: Full database export (filtered) ----------------------------------
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

      // -- Build WHERE conditions ----------------------------------------------
      const cabinetConds: SQL[] = [eq(cabinets.isActive, true)];
      if (input.category) cabinetConds.push(eq(cabinets.category, input.category));

      const skuConds: SQL[] = [
        eq(distributorSkus.isAvailable, true),
      ];
      if (input.distributorId) skuConds.push(eq(distributorSkus.distributorId, input.distributorId));
      if (input.styleId) skuConds.push(eq(distributorSkus.styleId, input.styleId));

      // -- Sheet 1: Cabinets ---------------------------------------------------
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

      // -- Sheet 2: Distributor SKUs (pricing) ---------------------------------
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

      // -- Sheet 3: Door Styles ------------------------------------------------
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

      // -- Sheet 4: Distributors -----------------------------------------------
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

      // -- Serialize -----------------------------------------------------------
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

  /**
   * Quick master-cabinet search for the import Fix dialog.
   * Returns up to 30 cabinets matching the query by masterCode or description.
   * Used by the import review table to let admins manually assign unmatched SKUs.
   */
  // Sample dominant face color from each door style's sample photo or room scene
  // image. Uses server-side fetch + canvas-free pixel sampling via the built-in
  // fetch API + a simple median-cut on the raw image buffer. Stores the result
  // as a 6-digit hex string in dominantColor. Called from the admin UI.
  adminSampleDoorColors: adminProcedure
    .input(z.object({ styleIds: z.array(z.number().int()).optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Fetch all styles that have a door sample or room scene image.
      const rows = await db
        .select({
          id: doorStyles.id,
          ourName: doorStyles.ourName,
          doorSampleImageUrl: doorStyles.doorSampleImageUrl,
          roomSceneImageUrl: doorStyles.roomSceneImageUrl,
        })
        .from(doorStyles)
        .where(
          input.styleIds && input.styleIds.length > 0
            ? inArray(doorStyles.id, input.styleIds)
            : sql`(${doorStyles.doorSampleImageUrl} IS NOT NULL OR ${doorStyles.roomSceneImageUrl} IS NOT NULL)`
        );

      let updated = 0;
      let failed = 0;

      for (const row of rows) {
        const imageUrl = row.doorSampleImageUrl || row.roomSceneImageUrl;
        if (!imageUrl) continue;
        try {
          // Fetch the image as a buffer.
          const res = await fetch(imageUrl, { signal: AbortSignal.timeout(10000) });
          if (!res.ok) { failed++; continue; }
          const buf = Buffer.from(await res.arrayBuffer());
          // Detect format from magic bytes and decode pixels manually.
          // We use a simple approach: parse JPEG/PNG headers to get raw pixel data.
          // For speed, we sample every Nth pixel from the center 40% of the image.
          const hex = await extractDominantColor(buf);
          if (!hex) { failed++; continue; }
          await db.update(doorStyles).set({ dominantColor: hex }).where(eq(doorStyles.id, row.id));
          updated++;
        } catch {
          failed++;
        }
      }
      return { total: rows.length, updated, failed };
    }),

  adminSearchMasterCabinets: adminProcedure
    .input(z.object({ query: z.string().trim().min(1).max(64) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [] as { id: number; masterCode: string; description: string | null; category: string | null }[];
      const q = `%${input.query}%`;
      const rows = await db
        .select({
          id: cabinets.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          category: cabinets.category,
          subCategory: cabinets.subCategory,
        })
        .from(cabinets)
        .where(
          and(
            eq(cabinets.isActive, true),
            sql`(${cabinets.masterCode} LIKE ${q} OR ${cabinets.description} LIKE ${q})`
          )
        )
        .orderBy(
          sql`CASE WHEN UPPER(${cabinets.masterCode}) = UPPER(${input.query}) THEN 0 ELSE 1 END`,
          asc(cabinets.masterCode)
        )
        .limit(30);
      return rows;
    }),
});
