import { z } from "zod";
import { inArray, and, eq, desc, asc, isNotNull, ne } from "drizzle-orm";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { pelicanProducts } from "../../drizzle/pelicanSchema";
import { pelicanCategoryMarkups, surfacePreviews } from "../../drizzle/schema";
import { positiveAuthorizedSurfaceBase } from "../../shared/surfacePricing";
import { generateImage } from "../_core/imageGeneration";
import { storageGetSignedUrl } from "../storage";
import { isPelicanDesignerSelectable, pelicanDesignerRole } from "../lib/pelicanDesignerReadiness";
import { isPelicanVanityFaucetCode, isPelicanVanitySinkCode } from "../lib/pelicanFixtureRole";

// --- pricing helpers (mirror pelican router) ---
const DEFAULT_MARKUP_BPS: Record<string, number> = {
  Flooring: 6500,
  "Tile & Mosaic": 5500,
  "Sinks & Faucets": 3800,
  "Toilets & Bidets": 3500,
  "Shower & Bath": 2200,
  "Quartz Slabs (Countertops)": 1800,
};
type MarkupMap = Record<string, number>;
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
export function sellPriceOf(
  p: { listPrice: string | null; yourCost: string | null; category: string },
  map: MarkupMap
): number | null {
  const cost = positiveAuthorizedSurfaceBase(p);
  if (cost == null) return null;
  const bps = markupBpsFor(map, p.category);
  return Math.round(cost * (1 + bps / 10000) * 100) / 100;
}

// Convert a stored imageUrl (/manus-storage/<key> or absolute) into an absolute, fetchable URL
// suitable for passing to the image generator as a reference.
async function toReferenceUrl(imageUrl: string | null | undefined): Promise<string | null> {
  if (!imageUrl) return null;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
  const relKey = imageUrl.replace(/^\/?manus-storage\//, "").replace(/^\/+/, "");
  if (!relKey) return null;
  try {
    return await storageGetSignedUrl(relKey);
  } catch {
    return null;
  }
}

const SelectionItem = z.object({
  id: z.number().int().positive(),
  category: z.string(),
  role: z.enum(["flooring", "tile", "countertop", "sink", "faucet", "vanity-sink", "vanity-faucet", "pot-filler", "range-top"]).optional(),
});

// Roles the Designer surfaces into: each maps to a real Pelican category (and
// subCategory where a category is shared, e.g. Sinks & Faucets). This is the
// single server-side source of truth for the Designer's recommended lists.
const RECOMMENDED_ROLE = z.enum([
  "flooring",
  "backsplash",
  "countertop",
  "sink",
  "faucet",
  "vanity-sink",
  "vanity-faucet",
  "bathroom-sink",
  "bathroom-faucet",
  "toilet-bidet",
  "bathtub",
  "shower-door",
  "shower-surround",
  "shower-system",
  "pot-filler",
  "range-top",
]);
type RecommendedRole = z.infer<typeof RECOMMENDED_ROLE>;

const BATHROOM_CATALOG_ROLES = new Set<RecommendedRole>([
  "bathroom-sink",
  "bathroom-faucet",
  "toilet-bidet",
  "bathtub",
  "shower-door",
  "shower-surround",
  "shower-system",
]);

function isBathroomCatalogRole(role: RecommendedRole): boolean {
  return BATHROOM_CATALOG_ROLES.has(role);
}

function bathroomSourceText(product: { name?: string | null; description?: string | null }): string {
  return `${product.name ?? ""} ${product.description ?? ""}`.toLowerCase();
}

/**
 * Imported categories are not reliable bathroom families: tubs are historically
 * stored under Sink & Faucet Accessories and a few vanity basins are misnamed.
 * These predicates preserve the source records while keeping kitchen products
 * out of the bathroom palette.
 */
function matchesBathroomCatalogRole(
  product: { category: string; subCategory?: string | null; pelicanCode?: string | null; name?: string | null; description?: string | null },
  role: RecommendedRole,
): boolean {
  const text = bathroomSourceText(product);
  switch (role) {
    case "bathroom-sink":
      return isPelicanVanitySinkCode(product.pelicanCode)
        || (product.category === "Sinks & Faucets"
          && /\b(?:bathroom|vanity|vessel|lavatory)\b/.test(text)
          && /\b(?:sink|basin|vanity top)\b/.test(text));
    case "bathroom-faucet":
      return product.category === "Sinks & Faucets"
        && (isPelicanVanityFaucetCode(product.pelicanCode)
          || (/\b(?:bathroom|vanity|vessel|tub)\b/.test(text) && /\bfaucet\b/.test(text)));
    case "toilet-bidet":
      return product.category === "Toilets & Bidets";
    case "bathtub":
      return product.category === "Sinks & Faucets"
        && /\b(?:bathtub|soaking tub)\b/.test(text)
        // A complete Pelican tub correctly mentions its included drain
        // assembly; only stand-alone faucet products are excluded here.
        && !/\bfaucet\b/.test(text);
    case "shower-door":
      return product.category === "Shower & Bath" && product.subCategory === "Shower & Tub Doors";
    case "shower-surround":
      return product.category === "Shower & Bath" && product.subCategory === "Shower Surrounds";
    case "shower-system":
      return product.category === "Shower & Bath" && product.subCategory === "Shower Valves & Systems";
    default:
      return false;
  }
}

function roleFilter(role: RecommendedRole) {
  switch (role) {
    case "flooring":
      // Only actual floor planks/tile — exclude moldings/trim & underlayment.
      return and(
        eq(pelicanProducts.category, "Flooring"),
        eq(pelicanProducts.subCategory, "Planks & Flooring")
      );
    case "backsplash":
      return eq(pelicanProducts.category, "Tile & Mosaic");
    case "countertop":
      return eq(pelicanProducts.category, "Quartz Slabs (Countertops)");
    case "sink":
    case "faucet":
    case "vanity-sink":
    case "vanity-faucet":
    case "bathroom-sink":
    case "bathroom-faucet":
    case "bathtub":
    case "pot-filler":
      // Imported subcategories contain historical misclassifications. The
      // response below derives the final placement family from product text.
      return eq(pelicanProducts.category, "Sinks & Faucets");
    case "toilet-bidet":
      return eq(pelicanProducts.category, "Toilets & Bidets");
    case "shower-door":
    case "shower-surround":
    case "shower-system":
      return eq(pelicanProducts.category, "Shower & Bath");
    case "range-top":
      return eq(pelicanProducts.category, "Range Tops");
  }
}

export const surfacesRouter = router({
  // A source-priced, designer-enabled set of real Pelican products per role.
  // Callers may request the full palette (up to 200) when an attribute editor
  // needs every countertop option; compact suggestion areas keep a smaller
  // limit. Popular-first, then items with a real photo, then by name.
  recommended: publicProcedure
    .input(
      z.object({
        role: RECOMMENDED_ROLE,
        limit: z.number().int().min(1).max(200).default(8),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [] as Array<Record<string, unknown>>;
      const map = await loadMarkupMap(db);
      const rows = await db
        .select()
        .from(pelicanProducts)
        .where(
          and(
            roleFilter(input.role),
            eq(pelicanProducts.isActive, true),
            // Pot fillers are intentionally excluded from the generic Designer
            // palette until this explicit range-wall workflow attaches them to
            // an eligible range/cooktop and records a project mount datum.
            // Pelican's bathroom rows predate the kitchen-only Designer flag.
            // Filter them by active source identity and documented family below,
            // rather than hiding valid tubs or shower items because they were
            // never intended for the original kitchen palette.
            input.role === "pot-filler" || isBathroomCatalogRole(input.role)
              ? undefined
              : eq(pelicanProducts.showInDesigner, true),
            // Bathroom catalog selections are still source-priced and active
            // when the supplier has not delivered a card image. The UI shows a
            // labeled fallback rather than hiding a real toilet, tub, or door.
            isBathroomCatalogRole(input.role) ? undefined : isNotNull(pelicanProducts.imageUrl),
            isBathroomCatalogRole(input.role) ? undefined : ne(pelicanProducts.imageUrl, "")
          )
        )
        .orderBy(
          desc(pelicanProducts.isPopular),
          asc(pelicanProducts.popularRank),
          asc(pelicanProducts.name)
        )
        // Sink/faucet source labels need post-query classification; request
        // sufficient candidates so misplaced fixtures do not get starved.
        .limit(input.role === "sink" || input.role === "faucet" || input.role === "vanity-sink" || input.role === "vanity-faucet" || input.role === "pot-filler" || isBathroomCatalogRole(input.role) ? 480 : input.limit + 12);
      const recommendations = rows
        .map((r) => ({
          id: r.id,
          pelicanCode: r.pelicanCode,
          slug: r.slug,
          name: r.name,
          description: r.description,
          category: r.category,
          subCategory: r.subCategory,
          size: r.size,
          coverageSqFt: r.coverageSqFt ? parseFloat(String(r.coverageSqFt)) : null,
          unsupportedOverhangLimitIn: r.unsupportedOverhangLimitIn == null ? null : Number(r.unsupportedOverhangLimitIn),
          imageUrl: r.imageUrl,
          materialImageUrl: r.materialImageUrl,
          sellPrice: sellPriceOf(r, map),
        }))
        .filter((r) => r.sellPrice != null && r.sellPrice > 0)
        .filter((r) => isBathroomCatalogRole(input.role)
          ? matchesBathroomCatalogRole(r, input.role)
          : input.role === "vanity-sink"
            ? isPelicanVanitySinkCode(r.pelicanCode)
            : input.role === "vanity-faucet"
              ? isPelicanVanityFaucetCode(r.pelicanCode)
              : pelicanDesignerRole(r) === input.role)
        .filter((r) => isBathroomCatalogRole(input.role) || input.role === "vanity-sink" || input.role === "vanity-faucet" || input.role === "pot-filler" ? true : isPelicanDesignerSelectable(r));
      return recommendations.slice(0, input.limit);
    }),

  // Fetch full product records (with sell price) for a set of ids — used by the wizard summary.
  byIds: publicProcedure
    .input(z.object({ ids: z.array(z.number().int().positive()).max(40) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db || input.ids.length === 0) return [];
      const map = await loadMarkupMap(db);
      const rows = await db
        .select()
        .from(pelicanProducts)
        .where(inArray(pelicanProducts.id, input.ids));
      return rows
        .map((r) => ({ ...r, sellPrice: sellPriceOf(r, map) }))
        .filter((r) => r.sellPrice != null && r.sellPrice > 0);
    }),

  /**
   * Resolves saved favorites through the same source-priced, Designer-enabled
   * selection gate as the Designer palette. Exact material rendering still
   * requires an approved repeatable swatch; a selectable countertop without
   * one is explicitly rendered with the neutral preview rather than its photo.
   */
  designerByIds: publicProcedure
    .input(z.object({ ids: z.array(z.number().int().positive()).max(40) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db || input.ids.length === 0) return [];
      const map = await loadMarkupMap(db);
      const rows = await db
        .select()
        .from(pelicanProducts)
        .where(and(
          inArray(pelicanProducts.id, input.ids),
          eq(pelicanProducts.isActive, true),
          eq(pelicanProducts.showInDesigner, true),
        ));
      return rows
        .map((row) => ({ ...row, sellPrice: sellPriceOf(row, map) }))
        .filter((row) => row.sellPrice != null && row.sellPrice > 0)
        .filter(isPelicanDesignerSelectable);
    }),

  // Save the customer's Surfaces & Fixtures profile so they can explicitly load it
  // into the Design Tool LATER (no auto-advance). One live profile per user: we
  // upsert by keeping only the newest row of kind="profile". Requires sign-in so
  // the profile survives across devices/sessions.
  saveProfile: protectedProcedure
    .input(
      z.object({
        // The full wizard selection blob (picks + areas + layout + optional preview).
        selection: z.any(),
        previewUrl: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const openId = ctx.user.openId;
      const res = await db.insert(surfacePreviews).values({
        ownerOpenId: openId,
        selections: input.selection,
        previewUrl: input.previewUrl ?? null,
        kind: "profile",
      });
      const id = (res as unknown as [{ insertId: number }])[0]?.insertId ?? null;
      // Prune older profile rows for this user so "my saved profile" is unambiguous.
      try {
        const olds = await db
          .select({ id: surfacePreviews.id })
          .from(surfacePreviews)
          .where(and(eq(surfacePreviews.ownerOpenId, openId), eq(surfacePreviews.kind, "profile")))
          .orderBy(desc(surfacePreviews.id));
        const stale = olds.map((r) => r.id).filter((rid) => rid !== id);
        for (const rid of stale) {
          await db.delete(surfacePreviews).where(eq(surfacePreviews.id, rid));
        }
      } catch {
        /* pruning is best-effort */
      }
      return { id, ok: true as const };
    }),

  // Load the current user's saved Surfaces & Fixtures profile, if any.
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const rows = await db
      .select()
      .from(surfacePreviews)
      .where(and(eq(surfacePreviews.ownerOpenId, ctx.user.openId), eq(surfacePreviews.kind, "profile")))
      .orderBy(desc(surfacePreviews.id))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      selection: row.selections,
      previewUrl: row.previewUrl,
      savedAt: row.updatedAt ?? row.createdAt,
    };
  }),

  // Clear the current user's saved profile.
  clearProfile: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { ok: true as const };
    await db
      .delete(surfacePreviews)
      .where(and(eq(surfacePreviews.ownerOpenId, ctx.user.openId), eq(surfacePreviews.kind, "profile")));
    return { ok: true as const };
  }),

  // Generate an on-demand photoreal kitchen preview using the customer's actual selected
  // product photos as image references.
  previewKitchen: publicProcedure
    .input(
      z.object({
        items: z.array(SelectionItem).min(1).max(6),
        // Optional cabinet door style reference photo (absolute or /manus-storage path)
        doorStyleImageUrl: z.string().optional(),
        doorStyleName: z.string().optional(),
        layout: z.enum(["l-shape", "u-shape", "galley", "island", "straight"]).default("l-shape"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      // Load the selected products to build an accurate prompt + gather their photos.
      const ids = input.items.map((i) => i.id);
      const products = await db
        .select()
        .from(pelicanProducts)
        .where(inArray(pelicanProducts.id, ids));
      const byId = new Map(products.map((p) => [p.id, p]));

      // Build reference image list (door style first, then products that have a photo).
      const references: Array<{ url: string; mimeType?: string }> = [];
      const doorRef = await toReferenceUrl(input.doorStyleImageUrl);
      if (doorRef) references.push({ url: doorRef, mimeType: "image/png" });

      const descLines: string[] = [];
      for (const sel of input.items) {
        const p = byId.get(sel.id);
        if (!p) continue;
        const role = sel.role ?? roleFromCategory(p.category);
        descLines.push(`- ${roleLabel(role)}: ${p.name}${p.size ? ` (${p.size})` : ""} — ${shorten(p.description)}`);
        if (references.length < 6) {
          const ref = await toReferenceUrl(p.imageUrl);
          if (ref) references.push({ url: ref, mimeType: "image/png" });
        }
      }

      const layoutText: Record<string, string> = {
        "l-shape": "an L-shaped kitchen layout",
        "u-shape": "a U-shaped kitchen layout",
        galley: "a galley (two parallel runs) kitchen layout",
        island: "a kitchen layout with a large central island",
        straight: "a single-wall straight kitchen layout",
      };

      const doorText = input.doorStyleName
        ? `Cabinets use the "${input.doorStyleName}" door style shown in the first reference image — match its color, wood/paint finish, and door profile precisely.`
        : "Use warm, realistic shaker-style cabinets consistent with the reference photos.";

      const prompt = [
        "A photorealistic, professionally photographed modern-transitional kitchen interior,",
        "wide-angle real-estate photography, bright natural daylight, warm inviting mood.",
        `Compose ${layoutText[input.layout]} with base cabinets 34.5 inches tall and countertops resting on top for a ~36 inch finished counter height.`,
        "Build the scene FAITHFULLY from the attached product reference photos, matching each material's color, pattern, texture and finish exactly:",
        doorText,
        ...descLines,
        "Photorealistic materials, accurate reflections and shadows, no text, no watermark, no people. Ultra-detailed, magazine-quality kitchen photography.",
      ].join("\n");

      const { url } = await generateImage({
        prompt,
        originalImages: references.map((r) => ({ url: r.url, mimeType: r.mimeType })),
      });
      if (!url) throw new Error("Preview generation returned no image");

      // Persist the preview + selection snapshot.
      const map = await loadMarkupMap(db);
      const snapshot = {
        items: input.items.map((i) => {
          const p = byId.get(i.id);
          return p
            ? { id: p.id, name: p.name, category: p.category, role: i.role ?? roleFromCategory(p.category), sellPrice: sellPriceOf(p, map), imageUrl: p.imageUrl }
            : { id: i.id, role: i.role };
        }),
        doorStyleName: input.doorStyleName ?? null,
        layout: input.layout,
      };
      let previewId: number | null = null;
      try {
        const res = await db
          .insert(surfacePreviews)
          .values({ ownerOpenId: ctx.user?.openId ?? null, selections: snapshot, previewUrl: url });
        previewId = (res as unknown as [{ insertId: number }])[0]?.insertId ?? null;
      } catch {
        previewId = null;
      }

      return { url, previewId };
    }),
});

function roleFromCategory(category: string): "flooring" | "tile" | "countertop" | "sink" | "faucet" | "range-top" {
  if (category === "Flooring") return "flooring";
  if (category === "Tile & Mosaic") return "tile";
  if (category === "Quartz Slabs (Countertops)") return "countertop";
  if (category === "Sinks & Faucets") return "sink";
  if (category === "Range Tops") return "range-top";
  return "tile";
}
function roleLabel(role: string): string {
  switch (role) {
    case "flooring":
      return "FLOORING";
    case "tile":
      return "BACKSPLASH / TILE";
    case "countertop":
      return "COUNTERTOPS";
    case "sink":
      return "SINK";
    case "faucet":
      return "FAUCET";
    case "range-top":
      return "RANGE TOP";
    default:
      return role.toUpperCase();
  }
}
function shorten(s: string, n = 100): string {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}
