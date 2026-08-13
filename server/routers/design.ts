import { z } from "zod";
import { eq, and, inArray, desc, like, sql, or, isNull, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb, notInConflict } from "../db";
import { cabinets, kitchenDesigns, distributorSkus, doorStyles, distributors, countertopQuotes, designLeads, crmDeals, crmDealDesigns, affiliates, affiliateStyleBranding } from "../../drizzle/schema";
import { notifyOwner } from "../_core/notification";
import { emitCrmEvent } from "../_core/crmWebhook";
import { invokeLLM } from "../_core/llm";
import { generateImage } from "../_core/imageGeneration";
import { buildPhotorealPrompt } from "@shared/photorealPrompt";
import { autoFillSpan, type FillCabinet, type FillMode } from "../../shared/fillEngine";
import { sellPriceForTier } from "@shared/margins";
import { getPricingSettings } from "../db";
import { resolveStorefrontTier, visiblePricesForViewer } from "../../shared/pricingTier";
import { resolveAffiliateAccess } from "../lib/affiliateAccess";
import {
  relevantCategories,
  selectRecommendations,
  type CrossSellCategory,
  type CrossSellItem,
} from "../../shared/crossSell";
import {
  matchingSkinsForCabinet,
  normalizeSkinPlacement,
  requiresMandatorySkin,
  type ExposedSides,
} from "../../shared/skinMatch";

async function resolveAffiliateDesignOwner(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  affiliateSlug?: string,
) {
  const slug = affiliateSlug?.trim().toLowerCase();
  if (!slug) return null;
  const rows = await db
    .select({ id: affiliates.id, storeName: affiliates.storeName, referralCode: affiliates.referralCode })
    .from(affiliates)
    .where(and(eq(affiliates.slug, slug), eq(affiliates.status, "active"), eq(affiliates.storefrontEnabled, true)))
    .limit(1);
  if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Affiliate storefront not found." });
  return rows[0];
}

type DesignContext = {
  user?: { id: number; email: string | null; role: string } | null;
};

async function requireAffiliateDesignerAccess(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  ctx: DesignContext,
  affiliateId: number | null,
) {
  if (!ctx.user || ctx.user.role === "admin") return;
  const access = await resolveAffiliateAccess(db, ctx.user);
  if (!access) return;
  if (!access.accessDesigner) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Designer access has not been enabled for this team member.",
    });
  }
  if (affiliateId != null && access.affiliateId !== affiliateId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "This design belongs to another affiliate." });
  }
}

export const designRouter = router({
  placeableCabinets: publicProcedure
    .input(
      z.object({
        placement: z.enum(["base", "wall", "tall", "accessory"]).optional(),
        search: z.string().optional(),
        // When the user has chosen a line + door style, narrow the palette to
        // only the cabinets that are actually purchasable for THAT combination.
        distributorId: z.number().optional(),
        styleId: z.number().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

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
          placementType: cabinets.placementType,
          numberOfDoors: cabinets.numberOfDoors,
          numberOfDrawers: cabinets.numberOfDrawers,
          numberOfFixedShelves: cabinets.numberOfFixedShelves,
          numberOfAdjShelves: cabinets.numberOfAdjShelves,
          isCornerCabinet: cabinets.isCornerCabinet,
          catalogImageUrl: cabinets.catalogImageUrl,
          specImageUrl: cabinets.specImageUrl,
          graphicType: cabinets.graphicType,
          minPull: cabinets.minPull,
          maxPull: cabinets.maxPull,
          openingType: cabinets.openingType,
          doorHeight: cabinets.doorHeight,
          drawerHeight: cabinets.drawerHeight,
          doorOrientation: cabinets.doorOrientation,
          doorsPerRow: cabinets.doorsPerRow,
          layoutSpec: cabinets.layoutSpec,
          drawerLayout: cabinets.drawerLayout,
          cornerType: cabinets.cornerType,
          facePattern: cabinets.facePattern,
          glassDoorAddonCode: cabinets.glassDoorAddonCode,
        })
        .from(cabinets)
        // showInDesigner=false hides a cabinet from the Kitchen Designer palette
        // without removing it from the public catalog or pricing.
        .where(and(eq(cabinets.isActive, true), notInConflict(), eq(cabinets.showInDesigner, true)));

      // Availability gate: a cabinet is only offered in the designer if it has
      // at least one published + available distributor SKU. If a specific
      // line/style is selected, the SKU must match that exact combination.
      const skuConditions = [
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true),
      ];
      if (input?.distributorId) {
        skuConditions.push(eq(distributorSkus.distributorId, input.distributorId));
      }
      // Door-style-first: a styleId alone is enough to gate the palette. The
      // supply line behind the style is resolved server-side and never exposed.
      if (input?.styleId) {
        skuConditions.push(eq(distributorSkus.styleId, input.styleId));
      }
      const availableSkuRows = await db
        .select({ cabinetId: distributorSkus.cabinetId })
        .from(distributorSkus)
        .where(and(...skuConditions));
      const availableCabinetIds = new Set(availableSkuRows.map((r) => r.cabinetId));
      const availableRows = rows.filter((r) => availableCabinetIds.has(r.id));

      // Accessories/trim (countertop support brackets, hardware, fillers, glass
      // doors sold separately, decorative legs, crown/light-rail molding, end
      // panels, roll-out trays, etc.) are NOT placeable cabinet boxes — they are
      // bill-of-materials add-ons. They live in their own "Accessories & Trim"
      // tab, never the drag-and-drop placement palette, so they can't leak into
      // a Base/Wall/Tall tab via the base-bucket fallback below.
      const isAccessory = (r: { category: string | null; placementType: string | null; description?: string | null; subCategory?: string | null }) => {
        const pt = (r.placementType || "").toLowerCase();
        const cat = (r.category || "").toLowerCase();
        const sub = (r.subCategory || "").toLowerCase();
        const desc = (r.description || "").toLowerCase();
        // Catch all trim/molding/filler/accessory categories across all cabinet lines.
        // DB categories include: "Accessory", "Trim and Molding", "Filler's and Panels", "Misc"
        // as well as placementType values like "accessory" and "trim".
        if (pt.includes("accessory") || pt.includes("trim")) return true;
        if (cat === "accessory") return true;
        if (cat.includes("trim") || cat.includes("molding")) return true;
        if (cat.includes("filler") || cat.includes("panel")) return true;
        if (cat === "misc") return true;
        // Many lines store trim items with category="Base" but their subCategory
        // or description reveals they are trim/molding/filler/panel items.
        if (sub.includes("moulding") || sub.includes("molding") || sub.includes("crown")) return true;
        if (sub.includes("filler") || sub.includes("panel") || sub.includes("leg") || sub.includes("scribe")) return true;
        if (sub.includes("rail") || sub.includes("rope") || sub.includes("cove") || sub.includes("skin")) return true;
        // Description-based fallback: items whose description contains trim keywords
        // but have no subCategory (e.g. ALRM, LRM, SCR, DCM, ICM, BF-*, BEP-*, etc.)
        const trimDescPattern = /\b(molding|moulding|scribe|light rail|crown|cove|rope|filler|end panel|skin panel|decorative leg|decorative panel|island panel|bead board|fluted filler|base filler|angle molding|inside corner molding|refrigerator end panel|shoe moulding|shoe molding|flat base molding|square decorative leg|outside corner molding|touch.?up|sample door|spray paint)\b/;
        if (trimDescPattern.test(desc)) return true;
        return false;
      };

      // Accessory tab: return ONLY accessory/trim items. These are added to the
      // design as BOM line items rather than placed on the canvas, so they skip
      // the base/wall/tall placement normalization entirely.
      if (input?.placement === "accessory") {
        let accessories = availableRows
          .filter(isAccessory)
          .map((r) => {
            const { minPull: _mp, maxPull: _xp, ...rest } = r;
            return { ...rest, pullMin: null as number | null, pullMax: null as number | null, placement: "accessory" as const };
          });
        if (input?.search) {
          const s = input.search.toLowerCase();
          accessories = accessories.filter(
            (r) =>
              r.masterCode.toLowerCase().includes(s) ||
              (r.description || "").toLowerCase().includes(s)
          );
        }
        return accessories;
      }

      // Map DB column names (minPull/maxPull) to client field names (pullMin/pullMax).
      // For blind corner cabinets without a manufacturer spec, apply defaults:
      // pullMin = width + 3, pullMax = width + 6.
      const isBlind = (code: string, desc: string | null) => {
        const c = (code || "").toUpperCase();
        if (/^(BBC|WBC|BBL|BBR|WBL|WBR)/.test(c)) return true;
        if (/-BLIND|BLIND/.test(c)) return true;
        return /blind\s*corner/.test((desc || "").toLowerCase());
      };
      const withPull = availableRows.map((r) => {
        let pullMin: number | null = r.minPull ? parseFloat(String(r.minPull)) : null;
        let pullMax: number | null = r.maxPull ? parseFloat(String(r.maxPull)) : null;
        // Default pull for blind corners when no manufacturer spec exists
        if (isBlind(r.masterCode, r.description) && (pullMin == null || pullMax == null)) {
          const w = parseFloat(String(r.width ?? "0"));
          if (Number.isFinite(w) && w > 0) {
            pullMin = pullMin ?? (w + 3);
            pullMax = pullMax ?? (w + 6);
          }
        }
        const { minPull: _mp, maxPull: _xp, ...rest } = r;
        return { ...rest, pullMin, pullMax };
      });

      const placeableRows = withPull.filter((r) => !isAccessory(r));

      const withPlacement = placeableRows.map((r) => {
        let placement = r.placementType;
        if (!placement) {
          const cat = (r.category || "").toLowerCase();
          if (cat.includes("wall")) placement = "wall";
          else if (cat.includes("tall")) placement = "tall";
          else placement = "base";
        }
        // Normalize placement into the three designer buckets (base/wall/tall).
        // ADA bases, vanity bases, and other floor-standing variants all live on
        // the floor, so they belong in the Base tab. Without this, items with a
        // distinct placementType like "ada base" or "vanity" never surfaced in
        // any palette tab (e.g. the corner Lazy Susan bases LSB33/LSB36).
        const p = (placement || "").toLowerCase();
        if (p === "base" || p === "wall" || p === "tall") {
          placement = p;
        } else if (p.includes("wall")) {
          placement = "wall";
        } else if (p.includes("tall") || p.includes("pantry") || p.includes("oven") || p.includes("utility")) {
          placement = "tall";
        } else {
          // ada base, vanity, sink base, corner base, etc. → floor (base)
          placement = "base";
        }
        return { ...r, placement };
      });

      let filtered = withPlacement;
      if (input?.placement) {
        filtered = filtered.filter((r) => r.placement === input.placement);
      }
      if (input?.search) {
        const s = input.search.toLowerCase();
        filtered = filtered.filter(
          (r) =>
            r.masterCode.toLowerCase().includes(s) ||
            (r.description || "").toLowerCase().includes(s)
        );
      }

      // Order every bucket small -> large by width so the palette reads the way
      // pros expect (B12, B15, B18, B21, B24, ...). Width can arrive as a numeric
      // string/decimal, so coerce to a number; unknown widths sink to the bottom.
      // Master code is the stable tie-break for equal widths.
      const widthNum = (w: unknown) => {
        const n = parseFloat(String(w ?? ""));
        return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
      };
      filtered = [...filtered].sort((a, b) => {
        const dw = widthNum(a.width) - widthNum(b.width);
        if (dw !== 0) return dw;
        return (a.masterCode || "").localeCompare(b.masterCode || "", undefined, { numeric: true });
      });

      return filtered;
    }),

  // Resolve design add-on recommendations (touch-up kit, roll-out trays) to the
  // actual buyable cabinet rows for the locked style. Returns whatever is
  // available; the UI only shows recommendations that resolve to a real item.
  findAddOns: publicProcedure
    .input(z.object({ styleId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { touchUpKit: null, rollOutTrays: [] as unknown[] };

      const cols = {
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
        isCornerCabinet: cabinets.isCornerCabinet,
      };
      const availabilityGate = and(
        eq(cabinets.isActive, true),
        notInConflict(),
        eq(distributorSkus.styleId, input.styleId),
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true)
      );

      // Touch-up kit (TUK). Always recommended when buyable in the line.
      const tukRows = await db
        .select(cols)
        .from(cabinets)
        .innerJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
        .where(and(availabilityGate, eq(cabinets.masterCode, "TUK")))
        .limit(1);

      // Roll-out trays (RS-* / subCategory "Roll-Out Tray").
      const trayRows = await db
        .select(cols)
        .from(cabinets)
        .innerJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
        .where(and(availabilityGate, eq(cabinets.subCategory, "Roll-Out Tray")))
        .orderBy(cabinets.masterCode);

      // Decorative end panels (subCategory "Decorative End Panel"): match the
      // exposed side of a cabinet to the chosen door style. Prefer the base
      // decorative end panel (BDEP/BEP-3) but return whatever is buyable.
      const endPanelRows = await db
        .select(cols)
        .from(cabinets)
        .innerJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
        .where(and(availabilityGate, eq(cabinets.subCategory, "Decorative End Panel")))
        .orderBy(cabinets.masterCode);

      // Crown molding (subCategory "Trim & Molding", CM-* codes) for finishing
      // the top of wall cabinets in the locked style.
      const crownRows = await db
        .select(cols)
        .from(cabinets)
        .innerJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
        .where(and(availabilityGate, like(cabinets.masterCode, "CM-%")))
        .orderBy(cabinets.masterCode);

      return {
        touchUpKit: tukRows[0] ?? null,
        rollOutTrays: trayRows,
        endPanels: endPanelRows,
        crownMoldings: crownRows,
      };
    }),

  // Resolve the pieces that surround a refrigerator to real, buyable-in-style
  // cabinet rows so the Refrigerator Options dialog can place priced items that
  // match the locked door style. Given the fridge width we return:
  //  - deepAbove:  the 24"-deep refrigerator WALL cabinet options (W-30-*-24 ...)
  //  - bridgeAbove: the 12"-deep short bridge wall cabinet options (W-30-12 ...)
  //  - endPanels:  tall/deep refrigerator end panels (REPV-24-96 / REPV-27-96)
  //  - smoothPanel: a plain smooth skin panel sheet (WSV-*) cut-to-fit
  // Each is availability-gated to the chosen style so it prices + colors right.
  surroundForFridge: publicProcedure
    .input(z.object({ styleId: z.number(), fridgeWidth: z.number().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db)
        return {
          deepAbove: [] as unknown[],
          bridgeAbove: [] as unknown[],
          endPanels: [] as unknown[],
          smoothPanels: [] as unknown[],
        };

      const cols = {
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
        isCornerCabinet: cabinets.isCornerCabinet,
        catalogImageUrl: cabinets.catalogImageUrl,
      };
      const gate = and(
        eq(cabinets.isActive, true),
        notInConflict(),
        eq(distributorSkus.styleId, input.styleId),
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true)
      );
      const sortByWidth = (rows: { width: unknown; masterCode: string }[]) =>
        [...rows].sort((a, b) => {
          const na = parseFloat(String(a.width ?? ""));
          const nb = parseFloat(String(b.width ?? ""));
          const da = Number.isFinite(na) ? na : Number.POSITIVE_INFINITY;
          const dbn = Number.isFinite(nb) ? nb : Number.POSITIVE_INFINITY;
          if (da !== dbn) return da - dbn;
          return (a.masterCode || "").localeCompare(b.masterCode || "", undefined, { numeric: true });
        });

      // Refrigerator / over-fridge wall cabinets — both 12" and 24" deep:
      //  - Clark & Sons 12" deep: W-(30|33|36)-(12|15|18|21|24)  e.g. W-36-12, W-36-18
      //  - Clark & Sons 24" deep: WR prefix (WR3315, WR3624 etc.) — always 24" deep
      //    Note: WRC% = wine rack wall cabinets — excluded
      //  - Skyline 24" deep: 8-char W[WW][HH]24 e.g. W361224, W362424
      //    (depth encoded as last 2 digits = 24; width 30/33/36; height 12/15/18/24)
      //  - Skyline 12" deep: 4-char W[WW][HH] e.g. W3012, W3315, W3618, W3624
      //  - Skyline 12" deep glass-door: W[WW][HH]GD e.g. W3012GD, W3612GD (stacker, NOT over-fridge)
      //  - USCD 12" deep bridge: 4-char W[WW][HH] e.g. W3012, W3612 (same pattern as Skyline)
      //  - USCD 24" deep fridge wall: 6-char W[WW][HH]24 e.g. W301224, W361824
      //    (same pattern as Skyline 24" deep — already matched by the 8-char regex below)
      const deepRows = await db
        .select(cols)
        .from(cabinets)
        .innerJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
        .where(and(gate, or(
          // Clark & Sons 12" deep fridge cabs: W-30-12 through W-36-24
          sql`${cabinets.masterCode} REGEXP '^W-(30|33|36)-(12|15|18|21|24)$'`,
          // Clark & Sons 24" deep fridge cabs: WR prefix (not wine rack WRC)
          and(like(cabinets.masterCode, "WR%"), sql`${cabinets.masterCode} NOT LIKE 'WRC%'`),
          // Skyline + USCD 24" deep: 6-8 char W[WW][HH]24 e.g. W361224, W362424, W301224
          sql`${cabinets.masterCode} REGEXP '^W(30|33|36)(12|15|18|21|24)24$'`,
          // Skyline + USCD 12" deep bridge: 4-char W[WW][HH] e.g. W3012, W3315, W3618, W3624
          sql`${cabinets.masterCode} REGEXP '^W(30|33|36)(12|15|18|24)$'`
        )));
      // Shallow bridge wall cabinets: short W-* that are NOT the deep "-24" or WR fridge boxes.
      const wallRows = await db
        .select(cols)
        .from(cabinets)
        .innerJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
        .where(and(gate, like(cabinets.masterCode, "W-%")));
      const bridgeRows = wallRows.filter((r) => {
        const h = parseFloat(String(r.height ?? ""));
        // A bridge is a short (≤ 18") wall cabinet, and NOT a deep 24" fridge box or WR cabinet.
        return !/-24$/.test(r.masterCode) && !/^WR/.test(r.masterCode) && Number.isFinite(h) && h <= 18;
      });
      // Refrigerator end panels + smooth skin panels.
      // Patterns by distributor:
      //  - Skyline (GR-): REPV-* end panels, WSV* smooth skin panels
      //  - Clark and Sons: REP2496 end panel (no smooth panel equivalent)
      //  - USCD: REPV30* end panels, WSV* smooth skin panels
      // Note: WS1542 (Clark and Sons wall skin) is NOT a refrigerator smooth panel — excluded.
      // REP2496 is the Clark & Sons fridge end panel (renamed from REP9624: REP=fridge panel, 24=depth, 96=height).
      const panelRows = await db
        .select(cols)
        .from(cabinets)
        .innerJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
        .where(and(gate, sql`(
          ${cabinets.masterCode} LIKE 'REPV%'
          OR ${cabinets.masterCode} LIKE 'REP9%'
          OR ${cabinets.masterCode} = 'REP2496'
          OR ${cabinets.masterCode} LIKE 'WSV%'
          OR ${cabinets.masterCode} = 'PLYEB42'
        )`));
      // Sort end panels: REP2496 (Clark & Sons) first, then REPV* (Skyline/USCD), then PLY panels.
      // REPVKIT is excluded from the display — only standard panels are shown.
      const endPanelsRaw = panelRows.filter((r) => (/^REPV/.test(r.masterCode) && r.masterCode !== 'REPVKIT') || /^REP9/.test(r.masterCode) || r.masterCode === 'REP2496' || r.masterCode === 'PLYEB42');
      const endPanels = endPanelsRaw.sort((a, b) => {
        const rank = (code: string) => {
          if (code === 'REP2496') return 0;          // Clark & Sons — always first
          if (/^REPV/.test(code)) return 1;          // Skyline/USCD standard panels
          if (/^REP9/.test(code)) return 2;          // legacy REP9* panels
          return 3;                                  // PLY panels
        };
        const diff = rank(a.masterCode) - rank(b.masterCode);
        if (diff !== 0) return diff;
        return (a.masterCode || '').localeCompare(b.masterCode || '', undefined, { numeric: true });
      });
      const smoothPanels = panelRows.filter((r) => /^WSV/.test(r.masterCode));

      // Dedupe helper (a cabinet can join multiple SKU rows).
      const uniq = <T extends { id: number }>(rows: T[]) => {
        const seen = new Set<number>();
        return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
      };

      return {
        deepAbove: sortByWidth(uniq(deepRows)),
        bridgeAbove: sortByWidth(uniq(bridgeRows)),
        endPanels: sortByWidth(uniq(endPanels)),
        smoothPanels: sortByWidth(uniq(smoothPanels)),
      };
    }),

  // Resolve the pieces for the one-click "Built-in Refrigerator + Pantry End"
  // preset to real, buyable-in-style cabinet rows: a 96" pantry (U-*-96-24), the
  // deep refrigerator wall cabinet over the fridge (W-*-*-24), refrigerator end
  // panels (REPV-*), and the standard wall cabinets used to fill the rest of the
  // run (W-*). The client composes these into a stepped run with wrapping crown.
  builtinFridgeRun: publicProcedure
    .input(z.object({ styleId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const empty = { pantry: [], deepAbove: [], endPanels: [], wallCabs: [] } as {
        pantry: unknown[]; deepAbove: unknown[]; endPanels: unknown[]; wallCabs: unknown[];
      };
      if (!db) return empty;

      const cols = {
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
        isCornerCabinet: cabinets.isCornerCabinet,
        catalogImageUrl: cabinets.catalogImageUrl,
      };
      const gate = and(
        eq(cabinets.isActive, true),
        notInConflict(),
        eq(distributorSkus.styleId, input.styleId),
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true)
      );
      const sortByWidth = (rows: { width: unknown; masterCode: string }[]) =>
        [...rows].sort((a, b) => {
          const na = parseFloat(String(a.width ?? ""));
          const nb = parseFloat(String(b.width ?? ""));
          const da = Number.isFinite(na) ? na : Number.POSITIVE_INFINITY;
          const dbn = Number.isFinite(nb) ? nb : Number.POSITIVE_INFINITY;
          if (da !== dbn) return da - dbn;
          return (a.masterCode || "").localeCompare(b.masterCode || "", undefined, { numeric: true });
        });
      const uniq = <T extends { id: number }>(rows: T[]) => {
        const seen = new Set<number>();
        return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
      };
      const run = async (cond: ReturnType<typeof and> | ReturnType<typeof like>) =>
        db
          .select(cols)
          .from(cabinets)
          .innerJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
          .where(and(gate, cond));

      // Pantry: 96"-tall utility (U-*-96-24). Fall back to any ≥ 84" utility.
      let pantryRows = await run(like(cabinets.masterCode, "U-%-96-24"));
      if (pantryRows.length === 0) pantryRows = await run(like(cabinets.masterCode, "UC%96"));
      // Deep fridge wall cabinets:
      //  - Skyline/USCD: end in "-24" (e.g. W-36-24-24)
      //  - Clark and Sons: WR prefix (WR3624 etc.) — WRC% wine rack excluded
      const deepRows = [
        ...(await run(like(cabinets.masterCode, "W-%-24"))),
        ...(await db.select(cols).from(cabinets).innerJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id)).where(and(gate, like(cabinets.masterCode, "WR%"), sql`${cabinets.masterCode} NOT LIKE 'WRC%'`))),
      ];
      // End panels: REPV-* (Skyline/USCD), REP9* (Clark and Sons), PLYEB42 (Clark and Sons plywood panel)
      const panelRows = [
        ...(await run(like(cabinets.masterCode, "REPV%"))),
        ...(await run(like(cabinets.masterCode, "REP9%"))),
        ...(await run(eq(cabinets.masterCode, "PLYEB42"))),
      ];
      // Standard wall cabinets (short/tall boxes) minus the deep "-24" fridge box and WR cabinets.
      const wallRows = (await run(like(cabinets.masterCode, "W-%"))).filter(
        (r) => !/-24$/.test(r.masterCode) && !/^WR/.test(r.masterCode)
      );

      return {
        pantry: sortByWidth(uniq(pantryRows)),
        deepAbove: sortByWidth(uniq(deepRows)),
        endPanels: sortByWidth(uniq(panelRows)),
        wallCabs: sortByWidth(uniq(wallRows)),
      };
    }),

  priceForCabinets: publicProcedure
    .input(
      z.object({
        cabinetIds: z.array(z.number()),
        distributorId: z.number().optional(),
        styleId: z.number(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db || input.cabinetIds.length === 0) return [];

      const conditions = [
        inArray(distributorSkus.cabinetId, input.cabinetIds),
        eq(distributorSkus.styleId, input.styleId),
        eq(distributorSkus.isAvailable, true),
      ];
      // distributorId is optional now — door-style-first pricing resolves the
      // supply line internally. When omitted we take the cheapest contractor
      // price per cabinet across whichever lines carry the chosen style.
      if (input.distributorId) {
        conditions.push(eq(distributorSkus.distributorId, input.distributorId));
      }

      const rows = await db
        .select({
          cabinetId: distributorSkus.cabinetId,
          platformSku: distributorSkus.platformSku,
          listPrice: distributorSkus.listPrice,
          wholesalePrice: distributorSkus.wholesalePrice,
          contractorPrice: distributorSkus.contractorPrice,
        })
        .from(distributorSkus)
        .where(and(...conditions));

      // Collapse to one priced row per cabinet (cheapest contractor price).
      const best = new Map<number, (typeof rows)[number]>();
      for (const r of rows) {
        const cur = best.get(r.cabinetId);
        if (!cur) { best.set(r.cabinetId, r); continue; }
        const a = Number(r.contractorPrice ?? r.wholesalePrice ?? Infinity);
        const b = Number(cur.contractorPrice ?? cur.wholesalePrice ?? Infinity);
        if (a < b) best.set(r.cabinetId, r);
      }
      return Array.from(best.values());
    }),

  // Multi-style pricing for TWO-TONE designs: price a set of (cabinetId,
  // styleId) pairs in one round-trip. Each placed cabinet may carry its own
  // finish override (see effectiveStyleId on the client), so we need the price
  // of each cabinet AT ITS OWN style. Returns one best (cheapest-contractor)
  // priced row per (cabinetId, styleId) pair, tagged with styleId so the client
  // can key its price map on cabinetId+styleId.
  priceForCabinetsByStyles: publicProcedure
    .input(
      z.object({
        pairs: z
          .array(z.object({ cabinetId: z.number(), styleId: z.number() }))
          .max(2000),
        distributorId: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db || input.pairs.length === 0) return [];

      // Collect the distinct ids so we can fetch in a single IN-query, then
      // filter back down to the exact requested pairs in memory.
      const cabinetIds = Array.from(new Set(input.pairs.map((p) => p.cabinetId)));
      const styleIds = Array.from(new Set(input.pairs.map((p) => p.styleId)));
      const wanted = new Set(input.pairs.map((p) => `${p.cabinetId}:${p.styleId}`));

      const conditions = [
        inArray(distributorSkus.cabinetId, cabinetIds),
        inArray(distributorSkus.styleId, styleIds),
        eq(distributorSkus.isAvailable, true),
      ];
      if (input.distributorId) {
        conditions.push(eq(distributorSkus.distributorId, input.distributorId));
      }

      const rows = await db
        .select({
          cabinetId: distributorSkus.cabinetId,
          styleId: distributorSkus.styleId,
          platformSku: distributorSkus.platformSku,
          listPrice: distributorSkus.listPrice,
          wholesalePrice: distributorSkus.wholesalePrice,
          contractorPrice: distributorSkus.contractorPrice,
          homeownerPrice: distributorSkus.homeownerPrice,
          adjustedListPrice: distributorSkus.adjustedListPrice,
          yourCost: distributorSkus.yourCost,
        })
        // NOTE: yourCost is required so sellPriceForTier can compute the
        // correct tier price (cost × markup).
        .from(distributorSkus)
        .where(and(...conditions));

      // Best (cheapest contractor) row per (cabinetId, styleId) pair, limited to
      // the exact pairs that were requested.
      const best = new Map<string, (typeof rows)[number]>();
      for (const r of rows) {
        const key = `${r.cabinetId}:${r.styleId}`;
        if (!wanted.has(key)) continue;
        const cur = best.get(key);
        if (!cur) { best.set(key, r); continue; }
        const a = Number(r.contractorPrice ?? r.wholesalePrice ?? Infinity);
        const b = Number(cur.contractorPrice ?? cur.wholesalePrice ?? Infinity);
        if (a < b) best.set(key, r);
      }
      // Compute tier prices from cost base × markup (same formula as the
      // product page and family catalog). Never return raw stored columns
      // because most SKUs only have listPrice set — the stored homeownerPrice
      // column is NULL for those rows, causing resolveTierPrice to fall back
      // to listPrice and show the full MSRP instead of the discounted price.
      const ps = await getPricingSettings();
      return Array.from(best.values()).map((r) => ({
        cabinetId: r.cabinetId,
        styleId: Number(r.styleId),
        listPrice: r.listPrice,
        adjustedListPrice: r.adjustedListPrice,
        wholesalePrice: sellPriceForTier(r, ps, "wholesale")?.toFixed(2) ?? null,
        contractorPrice: sellPriceForTier(r, ps, "contractor")?.toFixed(2) ?? null,
        homeownerPrice: sellPriceForTier(r, ps, "homeowner")?.toFixed(2) ?? null,
      }));
    }),

  // Batched roll-out shelf availability per door style, used by the BOM/cart to
  // resolve the matching same-line RS shelf for EVERY base cabinet at once
  // (instead of one round-trip per cabinet). Returns, per requested styleId, the
  // list of available + published RS shelves in that line with their priced row.
  // The client applies the same "largest width <= cabinet nominal width" rule
  // (matchRollOutTray) so the picker and the aggregate agree exactly.
  rollOutTraysForStyles: publicProcedure
    .input(
      z.object({
        styleIds: z.array(z.number()).max(50),
        distributorId: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db || input.styleIds.length === 0) {
        return [] as Array<{
          styleId: number;
          cabinetId: number;
          masterCode: string;
          description: string | null;
          width: number;
          listPrice: string | null;
          wholesalePrice: string | null;
          contractorPrice: string | null;
          homeownerPrice: string | null;
          adjustedListPrice: string | null;
        }>;
      }
      const conditions = [
        eq(cabinets.subCategory, "Roll Out Shelf"),
        eq(cabinets.isActive, true),
        notInConflict(),
        inArray(distributorSkus.styleId, input.styleIds),
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true),
      ];
      if (input.distributorId) {
        conditions.push(eq(distributorSkus.distributorId, input.distributorId));
      }
      const rows = await db
        .select({
          styleId: distributorSkus.styleId,
          cabinetId: cabinets.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          width: cabinets.width,
          listPrice: distributorSkus.listPrice,
          yourCost: distributorSkus.yourCost,
          wholesalePrice: distributorSkus.wholesalePrice,
          contractorPrice: distributorSkus.contractorPrice,
          homeownerPrice: distributorSkus.homeownerPrice,
          adjustedListPrice: distributorSkus.adjustedListPrice,
        })
        .from(cabinets)
        .innerJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
        .where(and(...conditions));
      // Dedup to ONE priced row per (styleId, cabinetId): keep the cheapest
      // contractor price across distributors in the same line.
      const best = new Map<string, (typeof rows)[number]>();
      for (const r of rows) {
        const key = `${r.styleId}:${r.cabinetId}`;
        const cur = best.get(key);
        if (!cur) {
          best.set(key, r);
          continue;
        }
        const a = Number(r.contractorPrice ?? r.wholesalePrice ?? Infinity);
        const b = Number(cur.contractorPrice ?? cur.wholesalePrice ?? Infinity);
        if (a < b) best.set(key, r);
      }
      // Tier prices are computed from our cost base × the per-tier markup (matches
      // the admin Margins tab), never from a pre-marked-up stored column.
      const ps = await getPricingSettings();
      return Array.from(best.values()).map((r) => ({
        styleId: Number(r.styleId),
        cabinetId: r.cabinetId,
        masterCode: r.masterCode,
        description: r.description,
        width: Number(r.width ?? 0),
        listPrice: r.listPrice,
        wholesalePrice: sellPriceForTier(r, ps, "wholesale")?.toFixed(2) ?? null,
        contractorPrice: sellPriceForTier(r, ps, "contractor")?.toFixed(2) ?? null,
        homeownerPrice: sellPriceForTier(r, ps, "homeowner")?.toFixed(2) ?? null,
        adjustedListPrice: r.adjustedListPrice,
      }));
    }),

  // Batched TRIM SKU availability per door style, used by the BOM/cart to price
  // trim (toe kick, light rail, batten, fillers, scribe) at the SELECTED door
  // style. Because each trim SKU is scoped to a styleId, resolving it against the
  // design's style makes the trim's finish/color inherit the cabinets. Returns,
  // per requested styleId, one tier-priced row per trim master code available in
  // that line. Master codes that have no SKU for a style are simply absent, and
  // the client leaves that trim as a quote-only (unpriced) line.
  trimSkusForStyles: publicProcedure
    .input(
      z.object({
        styleIds: z.array(z.number()).max(50),
        distributorId: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db || input.styleIds.length === 0) {
        return [] as Array<{
          styleId: number;
          cabinetId: number;
          masterCode: string;
          description: string | null;
          listPrice: string | null;
          wholesalePrice: string | null;
          contractorPrice: string | null;
          homeownerPrice: string | null;
          adjustedListPrice: string | null;
        }>;
      }
      // The trim master codes the designer can auto-add. Kept in sync with the
      // client TRIM_MASTER_CODES map in lib/trimCart.ts.
      const TRIM_CODES = ["TK-8", "LRM-8", "BAM", "SM-8", "BF-3", "BFF-3", "WFF-3-42", "VA-48"];
      // Trim items may be stored with a specific styleId OR with no styleId
      // (style-agnostic). Accept both: rows that match one of the requested
      // styleIds, or rows where styleId is NULL (applies to any style).
      const styleCondition = or(
        inArray(distributorSkus.styleId, input.styleIds),
        isNull(distributorSkus.styleId)
      );
      const conditions = [
        inArray(cabinets.masterCode, TRIM_CODES),
        eq(cabinets.isActive, true),
        notInConflict(),
        styleCondition!,
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true),
      ];
      if (input.distributorId) {
        conditions.push(eq(distributorSkus.distributorId, input.distributorId));
      }
      const rows = await db
        .select({
          styleId: distributorSkus.styleId,
          cabinetId: cabinets.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          listPrice: distributorSkus.listPrice,
          yourCost: distributorSkus.yourCost,
          wholesalePrice: distributorSkus.wholesalePrice,
          contractorPrice: distributorSkus.contractorPrice,
          homeownerPrice: distributorSkus.homeownerPrice,
          adjustedListPrice: distributorSkus.adjustedListPrice,
        })
        .from(cabinets)
        .innerJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
        .where(and(...conditions));
      // One priced row per (styleId, masterCode): keep the cheapest contractor
      // price across distributors in the same line.
      const best = new Map<string, (typeof rows)[number]>();
      for (const r of rows) {
        const key = `${r.styleId}:${r.masterCode}`;
        const cur = best.get(key);
        if (!cur) { best.set(key, r); continue; }
        const a = Number(r.contractorPrice ?? r.wholesalePrice ?? Infinity);
        const b = Number(cur.contractorPrice ?? cur.wholesalePrice ?? Infinity);
        if (a < b) best.set(key, r);
      }
      const psTrim = await getPricingSettings();
      return Array.from(best.values()).map((r) => ({
        styleId: Number(r.styleId),
        cabinetId: r.cabinetId,
        masterCode: r.masterCode,
        description: r.description,
        listPrice: r.listPrice,
        wholesalePrice: sellPriceForTier(r, psTrim, "wholesale")?.toFixed(2) ?? null,
        contractorPrice: sellPriceForTier(r, psTrim, "contractor")?.toFixed(2) ?? null,
        homeownerPrice: sellPriceForTier(r, psTrim, "homeowner")?.toFixed(2) ?? null,
        adjustedListPrice: r.adjustedListPrice,
      }));
    }),

  // Resolve the per-cabinet ROLL-OUT SHELF add-on for the edit panel. Each
  // distributor line carries its own RS-* shelves and you cannot mix lines, so
  // we only consider shelves AVAILABLE + PUBLISHED for the cabinet's effective
  // styleId. The shelf is sized to the cabinet: largest RS width <= the
  // cabinet's nominal width (see matchRollOutTray on the client; the same rule
  // is applied here against the same-line shelf set). Returns the matched shelf
  // with its priced row, or null when the cabinet is too narrow / the line has
  // no buyable shelf.
  resolveRollOutTray: publicProcedure
    .input(
      z.object({
        styleId: z.number(),
        // Cabinet nominal width in inches to size the shelf against.
        width: z.number(),
        distributorId: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db || !(input.width > 0)) return null;

      const conditions = [
        eq(cabinets.subCategory, "Roll Out Shelf"),
        eq(cabinets.isActive, true),
        notInConflict(),
        eq(distributorSkus.styleId, input.styleId),
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true),
      ];
      if (input.distributorId) {
        conditions.push(eq(distributorSkus.distributorId, input.distributorId));
      }

      const rows = await db
        .select({
          cabinetId: cabinets.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          width: cabinets.width,
          platformSku: distributorSkus.platformSku,
          listPrice: distributorSkus.listPrice,
          wholesalePrice: distributorSkus.wholesalePrice,
          contractorPrice: distributorSkus.contractorPrice,
        })
        .from(cabinets)
        .innerJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
        .where(and(...conditions));

      // Largest shelf whose width <= cabinet nominal width (0.25" rounding
      // tolerance). One priced row per shelf (cheapest contractor price).
      const limit = input.width + 0.25;
      let best:
        | {
            cabinetId: number;
            masterCode: string;
            description: string | null;
            width: number;
            platformSku: string | null;
            listPrice: string | null;
            wholesalePrice: string | null;
            contractorPrice: string | null;
          }
        | null = null;
      for (const r of rows) {
        const w = Number(r.width ?? 0);
        if (!(w > 0) || w > limit) continue;
        const cand = { ...r, width: w };
        if (best == null) {
          best = cand;
          continue;
        }
        if (w > best.width) {
          best = cand;
        } else if (w === best.width) {
          // Same width across lines: keep the cheaper contractor price.
          const a = Number(cand.contractorPrice ?? cand.wholesalePrice ?? Infinity);
          const b = Number(best.contractorPrice ?? best.wholesalePrice ?? Infinity);
          if (a < b) best = cand;
        }
      }
      return best;
    }),

  save: publicProcedure
    .input(
      z.object({
        id: z.number().optional(),
        name: z.string().min(1).max(255),
        email: z.string().email().optional(),
        affiliateSlug: z.string().max(255).optional(),
        roomData: z.any(),
        placedCabinets: z.any(),
        selectedSurfaces: z.any().optional(),
        threeDPresentation: z.any().optional(),
        selectedStyleId: z.number().optional(),
        selectedDistributorId: z.number().optional(),
        // Master Project grouping (all optional / backward-compatible).
        projectName: z.string().max(255).optional(),
        roomLabel: z.string().max(255).optional(),
        roomType: z.string().max(32).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const userId = ctx.user?.id ?? null;
      const affiliate = await resolveAffiliateDesignOwner(db, input.affiliateSlug);
      const affiliateId = affiliate?.id ?? null;
      await requireAffiliateDesignerAccess(db, ctx, affiliateId);

      if (input.id) {
        await db
          .update(kitchenDesigns)
          .set({
            name: input.name,
            roomData: input.roomData,
            placedCabinets: input.placedCabinets,
            selectedSurfaces: input.selectedSurfaces ?? null,
            threeDPresentation: input.threeDPresentation ?? null,
            selectedStyleId: input.selectedStyleId,
            selectedDistributorId: input.selectedDistributorId,
            projectName: input.projectName ?? null,
            roomLabel: input.roomLabel ?? null,
            roomType: input.roomType ?? null,
          })
          .where(and(
            eq(kitchenDesigns.id, input.id),
            affiliateId == null ? isNull(kitchenDesigns.affiliateId) : eq(kitchenDesigns.affiliateId, affiliateId),
          ));
        return { id: input.id };
      }

      const result = await db.insert(kitchenDesigns).values({
        userId,
        affiliateId,
        name: input.name,
        roomData: input.roomData,
        placedCabinets: input.placedCabinets,
        selectedSurfaces: input.selectedSurfaces ?? null,
        threeDPresentation: input.threeDPresentation ?? null,
        selectedStyleId: input.selectedStyleId,
        selectedDistributorId: input.selectedDistributorId,
        projectName: input.projectName ?? null,
        roomLabel: input.roomLabel ?? null,
        roomType: input.roomType ?? null,
      });
      // mysql2 returns a tuple: [ResultSetHeader, ...]; insertId lives on the header.
      const insertId = (result as unknown as [{ insertId: number }])[0].insertId;

      // An affiliate storefront design is linked only to that affiliate's CRM.
      // A normal design retains the existing house CRM behavior.
      let dealId: number | null = null;
      if (affiliateId != null) {
        const email = (input.email ?? ctx.user?.email ?? "").trim().toLowerCase();
        const matchingLead = email
          ? (await db
              .select()
              .from(designLeads)
              .where(and(eq(designLeads.affiliateId, affiliateId), eq(designLeads.email, email)))
              .orderBy(desc(designLeads.lastLaunchAt))
              .limit(1))[0]
          : undefined;
        dealId = matchingLead?.dealId ?? null;
        if (dealId == null) {
          const dealRes = await db.insert(crmDeals).values({
            affiliateId,
            ownerUserId: userId,
            title: `${input.projectName?.trim() || input.name}${input.roomLabel ? ` — ${input.roomLabel}` : ""}`.slice(0, 256),
            stage: "new",
            priority: "medium",
            contactName: ctx.user?.name ?? null,
            contactEmail: email || null,
            source: "storefront",
            notes: `Design saved from ${affiliate?.storeName ?? "affiliate"} designer.`,
          });
          dealId = (dealRes as unknown as [{ insertId: number }])[0].insertId;
          if (matchingLead) await db.update(designLeads).set({ dealId }).where(eq(designLeads.id, matchingLead.id));
        }
        await db.insert(crmDealDesigns).values({
          dealId,
          designId: insertId,
          designName: input.name,
          linkedByUserId: userId,
        });
      }

      // Push a CRM "design saved" event only for a NEW design (not every autosave).
      void emitCrmEvent({
        event: "design_saved",
        contact: {
          userId,
          name: ctx.user?.name ?? null,
          email: input.email ?? ctx.user?.email ?? null,
          phone: null,
        },
        data: {
          designId: insertId,
          designName: input.name,
          projectName: input.projectName ?? null,
          roomType: input.roomType ?? null,
          dealId,
        },
        affiliateId,
        referralCode: affiliate?.referralCode ?? null,
        link: affiliateId ? `/affiliate?section=crm&deal=${dealId ?? ""}` : `/design?id=${insertId}`,
      });

      return { id: insertId };
    }),

  rename: protectedProcedure
    .input(z.object({ id: z.number(), name: z.string().min(1).max(255) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Ensure the design belongs to the requesting user
      const rows = await db
        .select({ id: kitchenDesigns.id, affiliateId: kitchenDesigns.affiliateId })
        .from(kitchenDesigns)
        .where(and(eq(kitchenDesigns.id, input.id), eq(kitchenDesigns.userId, ctx.user.id)))
        .limit(1);
      if (!rows.length) throw new TRPCError({ code: "NOT_FOUND" });
      await requireAffiliateDesignerAccess(db, ctx, rows[0].affiliateId);
      await db.update(kitchenDesigns).set({ name: input.name }).where(eq(kitchenDesigns.id, input.id));
      return { ok: true };
    }),

  myDesigns: protectedProcedure
    .input(z.object({ affiliateSlug: z.string().max(255).optional() }).optional())
    .query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return [];
    const affiliate = await resolveAffiliateDesignOwner(db, input?.affiliateSlug);
    await requireAffiliateDesignerAccess(db, ctx, affiliate?.id ?? null);
    return db
      .select()
      .from(kitchenDesigns)
      .where(and(
        eq(kitchenDesigns.userId, ctx.user.id),
        affiliate ? eq(kitchenDesigns.affiliateId, affiliate.id) : isNull(kitchenDesigns.affiliateId),
      ));
    }),

  byId: publicProcedure
    .input(z.object({ id: z.number(), affiliateSlug: z.string().max(255).optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const affiliate = await resolveAffiliateDesignOwner(db, input.affiliateSlug);
      const rows = await db
        .select()
        .from(kitchenDesigns)
        .where(and(
          eq(kitchenDesigns.id, input.id),
          affiliate ? eq(kitchenDesigns.affiliateId, affiliate.id) : isNull(kitchenDesigns.affiliateId),
        ))
        .limit(1);
      return rows[0] ?? null;
    }),

  // ─── Lead capture at designer launch ──────────────────────────────────────
  // The launch gate captures a contact even if the visitor never saves a design
  // or requests a quote, so reps always have someone to follow up with. Email is
  // required; name + phone are optional. Repeat launches by the same email (per
  // user, or per email for guests) bump launchCount instead of inserting a new
  // row, keeping the leads list clean.
  captureLead: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        name: z.string().max(255).optional(),
        phone: z.string().max(32).optional(),
        roomType: z.string().max(32).optional(),
        affiliateSlug: z.string().max(255).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return { ok: false as const };

      const userId = ctx.user?.id ?? null;
      const emailLower = input.email.trim().toLowerCase();
      const name = input.name?.trim() || null;
      const phone = input.phone?.trim() || null;
      const roomType = input.roomType?.trim() || null;
      const affiliateSlug = input.affiliateSlug?.trim() || null;
      const affiliate = await resolveAffiliateDesignOwner(db, affiliateSlug ?? undefined);
      const affiliateId = affiliate?.id ?? null;

      // De-dupe: look for an existing lead for this email (scoped to the same
      // user when logged in). Update + bump the counter if found.
      const existing = await db
        .select({ id: designLeads.id, name: designLeads.name, phone: designLeads.phone })
        .from(designLeads)
        .where(
          userId
            ? and(
                eq(designLeads.userId, userId),
                eq(designLeads.email, emailLower),
                affiliateId == null ? isNull(designLeads.affiliateId) : eq(designLeads.affiliateId, affiliateId),
              )
            : and(
                eq(designLeads.email, emailLower),
                affiliateId == null ? isNull(designLeads.affiliateId) : eq(designLeads.affiliateId, affiliateId),
              ),
        )
        .limit(1);

      if (existing[0]) {
        await db
          .update(designLeads)
          .set({
            // Only overwrite name/phone when the new launch provides them, so we
            // never erase contact info captured on an earlier visit.
            name: name ?? existing[0].name,
            phone: phone ?? existing[0].phone,
            roomType: roomType ?? undefined,
            userId: userId ?? undefined,
            launchCount: sql`${designLeads.launchCount} + 1`,
            lastLaunchAt: new Date(),
          })
          .where(eq(designLeads.id, existing[0].id));
        return { ok: true as const, id: existing[0].id, deduped: true as const };
      }

      const result = await db.insert(designLeads).values({
        userId,
        email: emailLower,
        name,
        phone,
        roomType,
        affiliateSlug,
        affiliateId,
      });
      const insertId = (result as unknown as [{ insertId: number }])[0].insertId;

      // Auto-create a deal inside the design owner's CRM. Affiliate launches
      // never create a Cabinet Dealz house deal. Best-effort:
      // never block lead capture if deal creation fails. The dealId is stored
      // back on the lead so repeat launches reuse the same deal (D2 de-dupe).
      let dealId: number | null = null;
      try {
        const dealTitle = `Designer lead \u2014 ${name || input.email}`.slice(0, 256);
        const dealRes = await db.insert(crmDeals).values({
          affiliateId,
          ownerUserId: userId,
          title: dealTitle,
          stage: "new",
          priority: "medium",
          contactName: name,
          contactEmail: emailLower,
          contactPhone: phone,
          source: "storefront",
          notes: `Auto-created from the designer launch gate.${roomType ? ` Room type: ${roomType}.` : ""}`,
        });
        dealId = (dealRes as unknown as [{ insertId: number }])[0].insertId;
        await db.update(designLeads).set({ dealId }).where(eq(designLeads.id, insertId));
      } catch {
        // Lead is still captured even if the deal could not be created.
      }

      // House launches notify the platform owner. Affiliate launches stay in the
      // affiliate's own CRM without a platform-team notification.
      if (affiliateId == null) try {
        await notifyOwner({
          title: "New design lead",
          content: `${name || "(no name)"} · ${input.email}${phone ? ` · ${phone}` : ""}${roomType ? ` · ${roomType}` : ""} started a design.`,
        });
      } catch {
        // Never block lead capture on a notification failure.
      }

      // Push the lead to its owning CRM scope (best-effort).
      void emitCrmEvent({
        event: "lead",
        contact: { userId, name, email: emailLower, phone },
        data: { source: "design_tool_gate", roomType, dealId, leadId: insertId },
        affiliateId,
        referralCode: affiliate?.referralCode ?? null,
        link: dealId ? (affiliateId ? `/affiliate?section=crm&deal=${dealId}` : `/admin/crm?deal=${dealId}`) : null,
      });

      return { ok: true as const, id: insertId, deduped: false as const };
    }),

  // Admin: list captured design leads, newest engagement first.
  listLeads: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(500).default(200) }).optional())
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(designLeads)
        .orderBy(desc(designLeads.lastLaunchAt))
        .limit(input?.limit ?? 200);
    }),

  // ─── Master Project roll-up ───────────────────────────────────────────────
  // Combined bill of materials for a whole job: every saved room sharing the
  // same projectName (owned by the caller) is priced with the SAME contractor
  // price path the Designer uses, returning per-room subtotals + a grand total.
  projectSummary: protectedProcedure
    .input(z.object({ projectName: z.string().min(1).max(255), affiliateSlug: z.string().max(255).optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { projectName: input.projectName, rooms: [], grandTotal: 0, roomCount: 0 };
      const affiliate = await resolveAffiliateDesignOwner(db, input.affiliateSlug);
      await requireAffiliateDesignerAccess(db, ctx, affiliate?.id ?? null);

      const designs = await db
        .select()
        .from(kitchenDesigns)
        .where(
          and(
            eq(kitchenDesigns.userId, ctx.user.id),
            eq(kitchenDesigns.projectName, input.projectName),
            affiliate ? eq(kitchenDesigns.affiliateId, affiliate.id) : isNull(kitchenDesigns.affiliateId),
          ),
        )
        .orderBy(kitchenDesigns.createdAt);

      // Look up the master style names, then layer the active affiliate's
      // per-style aliases on top. The override is intentionally scoped to the
      // selected affiliate project and never changes the central catalog name.
      const styleIds = Array.from(
        new Set(designs.map((d) => d.selectedStyleId).filter((x): x is number => !!x)),
      );
      const styleNameById = new Map<number, string>();
      if (styleIds.length) {
        const sRows = await db
          .select({ id: doorStyles.id, ourName: doorStyles.ourName })
          .from(doorStyles)
          .where(inArray(doorStyles.id, styleIds));
        for (const s of sRows) styleNameById.set(s.id, s.ourName);
        if (affiliate) {
          const aliasRows = await db
            .select({ styleId: affiliateStyleBranding.styleId, brandName: affiliateStyleBranding.brandName })
            .from(affiliateStyleBranding)
            .where(and(eq(affiliateStyleBranding.affiliateId, affiliate.id), inArray(affiliateStyleBranding.styleId, styleIds)));
          for (const alias of aliasRows) {
            const name = alias.brandName?.trim();
            if (name) styleNameById.set(alias.styleId, name);
          }
        }
      }

      const rooms: {
        id: number;
        name: string;
        roomLabel: string | null;
        roomType: string | null;
        styleId: number | null;
        styleName: string | null;
        cabinetCount: number;
        subtotal: number;
      }[] = [];

      for (const d of designs) {
        const placed = (Array.isArray(d.placedCabinets) ? d.placedCabinets : []) as {
          cabinetId?: number;
          qty?: number;
          width?: number;
          depth?: number;
          height?: number;
          nominalWidth?: number | null;
          nominalHeight?: number | null;
          nominalDepth?: number | null;
        }[];
        const styleId = d.selectedStyleId ?? null;
        let subtotal = 0;
        let cabinetCount = 0;

        // Count placed cabinets and price them (only when a style is locked, as
        // pricing is door-style-specific — mirrors the Designer behavior).
        const ids = placed
          .map((p) => p.cabinetId)
          .filter((x): x is number => typeof x === "number");
        cabinetCount = ids.length;

        if (styleId && ids.length) {
          const skuRows = await db
            .select({
              cabinetId: distributorSkus.cabinetId,
              wholesalePrice: distributorSkus.wholesalePrice,
              contractorPrice: distributorSkus.contractorPrice,
            })
            .from(distributorSkus)
            .where(
              and(
                inArray(distributorSkus.cabinetId, ids),
                eq(distributorSkus.styleId, styleId),
                eq(distributorSkus.isAvailable, true),
              ),
            );
          // Cheapest contractor price per cabinet (matches priceForCabinets).
          const best = new Map<number, number>();
          for (const r of skuRows) {
            const price = Number(r.contractorPrice ?? r.wholesalePrice ?? 0);
            if (!price) continue;
            const cur = best.get(r.cabinetId);
            if (cur == null || price < cur) best.set(r.cabinetId, price);
          }
          for (const p of placed) {
            if (typeof p.cabinetId !== "number") continue;
            const unit = best.get(p.cabinetId) ?? 0;
            subtotal += unit * (p.qty ?? 1);
          }
        }

        // Custom size adjustment: flat $100 per cabinet resized in any dimension
        // (matches the Design Tool). Applies regardless of whether a style is
        // locked, since the surcharge is for manual sizing labor.
        const CUSTOM_SIZE_FEE = 100;
        const margin = 0.2; // inches; ignore sub-rounding drift
        const isCustomDim = (live?: number, nominal?: number | null) =>
          typeof live === "number" && typeof nominal === "number" && Math.abs(live - nominal) > margin;
        for (const p of placed) {
          const custom =
            isCustomDim(p.width, p.nominalWidth) ||
            isCustomDim(p.height, p.nominalHeight) ||
            isCustomDim(p.depth, p.nominalDepth);
          if (custom) subtotal += CUSTOM_SIZE_FEE * (p.qty ?? 1);
        }

        rooms.push({
          id: d.id,
          name: d.name,
          roomLabel: d.roomLabel,
          roomType: d.roomType,
          styleId,
          styleName: styleId ? styleNameById.get(styleId) ?? null : null,
          cabinetCount,
          subtotal: Math.round(subtotal * 100) / 100,
        });
      }

      const grandTotal =
        Math.round(rooms.reduce((s, r) => s + r.subtotal, 0) * 100) / 100;
      return { projectName: input.projectName, rooms, grandTotal, roomCount: rooms.length };
    }),

  // List the caller's distinct project names (for the project picker).
  myProjects: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    await requireAffiliateDesignerAccess(db, ctx, null);
    const rows = await db
      .select()
      .from(kitchenDesigns)
      .where(eq(kitchenDesigns.userId, ctx.user.id));
    const byProject = new Map<string, { projectName: string; roomCount: number; updatedAt: Date }>();
    for (const r of rows) {
      const p = (r.projectName ?? "").trim();
      if (!p) continue;
      const cur = byProject.get(p);
      const u = new Date(r.updatedAt);
      if (!cur) byProject.set(p, { projectName: p, roomCount: 1, updatedAt: u });
      else {
        cur.roomCount += 1;
        if (u > cur.updatedAt) cur.updatedAt = u;
      }
    }
    return Array.from(byProject.values()).sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
    );
  }),

  // ─── Countertop quote requests ───────────────────────────────────────────
  // Countertops are not auto-priced. The contractor submits the design plus
  // measured square/linear footage and we (or a supplier) quote it back.
  requestCountertopQuote: publicProcedure
    .input(
      z.object({
        contactName: z.string().max(256).optional(),
        contactEmail: z.string().email(),
        contactPhone: z.string().max(32).optional(),
        zip: z.string().max(16).optional(),
        material: z.string().max(128).optional(),
        squareFeet: z.number().nonnegative(),
        linearFeet: z.number().nonnegative(),
        hasIsland: z.boolean().default(false),
        roomData: z.any().optional(),
        placedCabinets: z.any().optional(),
        notes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const result = await db.insert(countertopQuotes).values({
        userId: ctx.user?.id ?? null,
        contactName: input.contactName ?? null,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone ?? null,
        zip: input.zip ?? null,
        material: input.material ?? null,
        squareFeet: String(input.squareFeet),
        linearFeet: String(input.linearFeet),
        hasIsland: input.hasIsland,
        roomData: input.roomData ?? null,
        placedCabinets: input.placedCabinets ?? null,
        notes: input.notes ?? null,
      });
      const insertId = (result as unknown as [{ insertId: number }])[0].insertId;

      // Owner email notifications are intentionally DISABLED per owner request
      // (was flooding the owner inbox). The quote is still saved to
      // countertop_quotes and is reviewable in the Admin area. To re-enable,
      // restore the notifyOwner(...) call here.
      void notifyOwner; // referenced to avoid unused-import error

      return { id: insertId };
    }),

  // ───────────────────────────────────────────────────────────────────────
  // AI design consultant.
  //
  // The visitor describes what they want in plain language ("8-foot closet,
  // hanging on the left, drawers on the right" / "fill this 10-foot wall with
  // base cabinets and a sink"). We give the LLM the wall lengths they have
  // marked plus a short summary of the available catalog, and ask it ONLY to
  // choose a strategy: which wall, which mode (kitchen/closet), and a short
  // human explanation. The deterministic fill engine then tiles the chosen
  // span with REAL catalog cabinets, so the AI can never invent a SKU or a
  // size that does not add up. The response carries both the prose reply and a
  // machine-applicable `plan` the client drops straight onto the canvas.
  //
  // Learns from the network in the safe sense: it is fed the live catalog +
  // standard sizes + design rules as context (retrieval), never trained on any
  // member's private data. Designs are layout-only (codes + measurements).
  // ───────────────────────────────────────────────────────────────────────
  consult: publicProcedure
    .input(
      z.object({
        message: z.string().min(1).max(2000),
        // Walls the user has in their room, with usable span lengths (inches).
        walls: z
          .array(
            z.object({
              id: z.string(),
              label: z.string(),
              lengthInches: z.number().positive(),
            }),
          )
          .min(1)
          .max(8),
        roomType: z.enum(["kitchen", "bathroom", "laundry", "closet", "other"]).default("kitchen"),
        styleId: z.number().nullish(),
        distributorId: z.number().nullish(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      // 1) Pull the placeable, purchasable cabinets for the chosen style.
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
          placementType: cabinets.placementType,
          numberOfDoors: cabinets.numberOfDoors,
          numberOfDrawers: cabinets.numberOfDrawers,
          isCornerCabinet: cabinets.isCornerCabinet,
          catalogImageUrl: cabinets.catalogImageUrl,
        })
        .from(cabinets)
        .where(and(eq(cabinets.isActive, true), notInConflict()));

      const skuConditions = [
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true),
      ];
      if (input.distributorId) skuConditions.push(eq(distributorSkus.distributorId, input.distributorId));
      if (input.styleId) skuConditions.push(eq(distributorSkus.styleId, input.styleId));
      const availableSkuRows = await db
        .select({ cabinetId: distributorSkus.cabinetId })
        .from(distributorSkus)
        .where(and(...skuConditions));
      const availableIds = new Set(availableSkuRows.map((r) => r.cabinetId));

      const catalog: FillCabinet[] = rows
        .filter((r) => availableIds.has(r.id))
        .map((r) => {
          let placement = r.placementType as FillCabinet["placement"] | null;
          if (!placement) {
            const cat = (r.category || "").toLowerCase();
            placement = cat.includes("wall") ? "wall" : cat.includes("tall") ? "tall" : "base";
          }
          return {
            id: r.id,
            masterCode: r.masterCode,
            description: r.description,
            category: r.category,
            subCategory: r.subCategory,
            width: r.width,
            height: r.height,
            depth: r.depth,
            placement,
            numberOfDoors: r.numberOfDoors,
            numberOfDrawers: r.numberOfDrawers,
            isCornerCabinet: r.isCornerCabinet,
            catalogImageUrl: r.catalogImageUrl,
          };
        });

      // 2) Ask the LLM to pick a STRATEGY only (which wall + mode + reason).
      const wallList = input.walls
        .map((w) => `- id "${w.id}": ${w.label} wall, ${Math.round(w.lengthInches)}\" long`)
        .join("\n");
      const baseWidths = Array.from(
        new Set(
          catalog
            .filter((c) => c.placement === "base")
            .map((c) => parseFloat(c.width || "0"))
            .filter((n) => n > 0),
        ),
      )
        .sort((a, b) => a - b)
        .join(", ");

      const SYSTEM = `You are a helpful kitchen & closet design consultant for a cabinet platform.
The user describes what they want; you choose a fill STRATEGY. You DO NOT pick individual cabinet SKUs or widths — a separate deterministic engine tiles the wall with real catalog cabinets after you choose.

IMPORTANT: This platform lets BOTH kitchens AND closets use the full cabinet catalog (base cabinets, drawer banks, tall cabinets, etc.). A closet can absolutely be filled with base cabinets and drawer towers. NEVER refuse a layout because the room is a closet. Whenever the user asks to fill, design, or lay out a wall, you MUST return at least one action.

Design rules to honor: cabinets default to 12\" deep (24\" for refrigerator cabinets); a layout stays within one door-style line; keep runs flush along the chosen wall; blind-corner cabinets always need a corner filler.

The user's walls (use the exact id):
${wallList}

Available base cabinet widths (inches): ${baseWidths || "standard sizes"}.
Room type context: ${input.roomType} (you may still use \"mode\":\"kitchen\" or \"closet\" per action — prefer \"${input.roomType}\" unless the user clearly asks otherwise).
If the user does not name a wall, pick the most sensible one (usually the longest, or the \"Back\" wall).

Return STRICT JSON only, no prose, matching:
{
  \"reply\": string,            // 2-4 friendly sentences explaining the plan to the user
  \"actions\": [                // 0-4 fill actions to apply, in order
    { \"wallId\": string, \"mode\": \"kitchen\"|\"closet\", \"intent\": string }
  ]
}
Return an empty actions array ONLY if the user asked a pure question with no wall to build. Never name a supplier/brand.`;

      let parsed: { reply?: string; actions?: Array<{ wallId?: string; mode?: string; intent?: string }> } = {};
      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: input.message },
          ],
          maxTokens: 700,
          responseFormat: { type: "json_object" },
        });
        const content = result.choices?.[0]?.message?.content;
        const text =
          typeof content === "string"
            ? content
            : Array.isArray(content)
              ? content.map((c) => ("text" in c ? c.text : "")).join("")
              : "";
        const jsonStart = text.indexOf("{");
        const jsonEnd = text.lastIndexOf("}");
        parsed = jsonStart >= 0 && jsonEnd > jsonStart ? JSON.parse(text.slice(jsonStart, jsonEnd + 1)) : {};
      } catch {
        parsed = {};
      }

      // 3) Turn each chosen action into a deterministic fill via the engine.
      const wallById = new Map(input.walls.map((w) => [w.id, w]));
      const plan: Array<{
        wallId: string;
        wallLabel: string;
        mode: FillMode;
        intent: string;
        items: Array<{ masterCode: string; description: string; width: number; placement: string; isFiller: boolean; cabinetId: number }>;
        usedInches: number;
        leftoverInches: number;
      }> = [];

      for (const action of (parsed.actions ?? []).slice(0, 4)) {
        const wall = action.wallId ? wallById.get(action.wallId) : undefined;
        if (!wall) continue;
        const mode: FillMode = action.mode === "closet" ? "closet" : "kitchen";
        const fill = autoFillSpan(wall.lengthInches, mode, catalog);
        if (fill.items.length === 0) continue;
        plan.push({
          wallId: wall.id,
          wallLabel: wall.label,
          mode,
          intent: String(action.intent ?? ""),
          items: fill.items.map((it) => ({
            masterCode: it.cabinet.masterCode,
            description: it.cabinet.description,
            width: it.width,
            placement: it.cabinet.placement,
            isFiller: it.isFiller,
            cabinetId: it.cabinet.id,
          })),
          usedInches: fill.usedInches,
          leftoverInches: fill.leftoverInches,
        });
      }

      // Deterministic safety net: if the user clearly asked to build/fill a wall
      // but the LLM returned nothing usable, fill a sensible wall anyway so the
      // consultant always produces a layout for build requests.
      const msg = input.message.toLowerCase();
      const wantsBuild = /\b(fill|design|lay ?out|build|add|put|place|cabinet|drawer|sink|hang|shelf|shelv|closet|kitchen|wall)\b/.test(msg);
      if (plan.length === 0 && wantsBuild) {
        // Prefer a wall named in the message, else the longest wall.
        const named = input.walls.find((w) => msg.includes(w.label.toLowerCase()));
        const target =
          named ?? [...input.walls].sort((a, b) => b.lengthInches - a.lengthInches)[0];
        if (target) {
          const mode: FillMode = input.roomType === "closet" ? "closet" : "kitchen";
          const fill = autoFillSpan(target.lengthInches, mode, catalog);
          if (fill.items.length > 0) {
            plan.push({
              wallId: target.id,
              wallLabel: target.label,
              mode,
              intent: input.message,
              items: fill.items.map((it) => ({
                masterCode: it.cabinet.masterCode,
                description: it.cabinet.description,
                width: it.width,
                placement: it.cabinet.placement,
                isFiller: it.isFiller,
                cabinetId: it.cabinet.id,
              })),
              usedInches: fill.usedInches,
              leftoverInches: fill.leftoverInches,
            });
          }
        }
      }

      const reply =
        (typeof parsed.reply === "string" && parsed.reply.trim() && plan.length > 0
          ? parsed.reply.trim()
          : "") ||
        (plan.length > 0
          ? `I laid out the ${plan.map((p) => p.wallLabel).join(" and ")} wall${plan.length > 1 ? "s" : ""} with ${plan.reduce((n, p) => n + p.items.length, 0)} cabinets — you can drag, swap, or delete anything.`
          : "Tell me which wall to work on and what you'd like there (hanging space, drawers, a sink run), and I'll lay it out.");

      return { reply, plan };
    }),

  listCountertopQuotes: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    const db = await getDb();
    if (!db) return [];
    return db.select().from(countertopQuotes).orderBy(desc(countertopQuotes.createdAt));
  }),

  updateCountertopQuote: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["new", "quoted", "won", "lost"]).optional(),
        quotedPrice: z.number().nonnegative().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const patch: Record<string, unknown> = {};
      if (input.status) patch.status = input.status;
      if (input.quotedPrice !== undefined) patch.quotedPrice = String(input.quotedPrice);
      if (Object.keys(patch).length > 0) {
        await db.update(countertopQuotes).set(patch).where(eq(countertopQuotes.id, input.id));
      }
      return { id: input.id };
    }),

  // ─── Checkout cross-sell ──────────────────────────────────────────────────
  // Given the cabinets in the cart + the locked door style + tier, recommend
  // relevant accessories (roll-out trays, end panels, crown molding, fillers,
  // touch-up kit) that are actually buyable in that style, priced in the
  // caller's tier, and excluding anything already in the cart.
  crossSell: publicProcedure
    .input(
      z.object({
        styleId: z.number(),
        tier: z.enum(["homeowner", "contractor", "wholesale"]).default("contractor"),
        codes: z.array(z.string()).max(200),
      }),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db || input.codes.length === 0) return { items: [] as CrossSellItem[] };

      // Resolve placement + door count for the cart's cabinets so relevance is
      // based on real catalog data, not client-supplied hints.
      const cartCabRows = await db
        .select({
          masterCode: cabinets.masterCode,
          placementType: cabinets.placementType,
          category: cabinets.category,
          numberOfDoors: cabinets.numberOfDoors,
          isCornerCabinet: cabinets.isCornerCabinet,
        })
        .from(cabinets)
        .where(inArray(cabinets.masterCode, input.codes));

      const lines = cartCabRows.map((r) => {
        let placement = (r.placementType || "").toLowerCase();
        if (!placement) {
          const cat = (r.category || "").toLowerCase();
          if (cat.includes("wall")) placement = "wall";
          else if (cat.includes("tall")) placement = "tall";
          else placement = "base";
        }
        return {
          masterCode: r.masterCode,
          placement,
          numberOfDoors: r.numberOfDoors,
          isCornerCabinet: !!r.isCornerCabinet,
        };
      });

      const relevant = relevantCategories(lines);
      if (relevant.length === 0) return { items: [] as CrossSellItem[] };

      // Accessory unit prices are computed from cost base × per-tier markup.
      const csPs = await getPricingSettings();

      // Pull candidate accessory SKUs buyable in the chosen style, with the
      // tier price columns needed to resolve a unit price.
      const rows = await db
        .select({
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          subCategory: cabinets.subCategory,
          yourCost: distributorSkus.yourCost,
          wholesalePrice: distributorSkus.wholesalePrice,
          contractorPrice: distributorSkus.contractorPrice,
          homeownerPrice: distributorSkus.homeownerPrice,
          adjustedListPrice: distributorSkus.adjustedListPrice,
          listPrice: distributorSkus.listPrice,
        })
        .from(cabinets)
        .innerJoin(distributorSkus, eq(distributorSkus.cabinetId, cabinets.id))
        .where(
          and(
            eq(cabinets.isActive, true),
            notInConflict(),
            eq(cabinets.category, "Accessory"),
            eq(distributorSkus.styleId, input.styleId),
            eq(distributorSkus.isAvailable, true),
            eq(distributorSkus.isPublished, true),
          ),
        );

      // Map an accessory subCategory → a cross-sell category + reason.
      const classify = (
        sub: string | null,
        code: string,
      ): { category: CrossSellCategory; reason: string } | null => {
        const s = (sub || "").toLowerCase();
        const c = code.toUpperCase();
        if (c === "TUK" || s.includes("touch")) {
          return { category: "touchUpKit", reason: "Match factory finish for field cuts and nicks" };
        }
        if (s.includes("roll-out") || s.includes("tray")) {
          return { category: "rollOutTray", reason: "Add pull-out access inside base cabinets" };
        }
        if (s.includes("end panel") || s.includes("skin") || s.includes("full height panel")) {
          return { category: "endPanel", reason: "Finish an exposed cabinet side in your door style" };
        }
        if (s.includes("molding") || s.includes("trim") || c.startsWith("CM-")) {
          return { category: "crownMolding", reason: "Crown the top of wall cabinets" };
        }
        if (s.includes("filler") || c.startsWith("FILL") || c.includes("FILLER")) {
          return { category: "filler", reason: "Close gaps against walls and between cabinets" };
        }
        return null;
      };

      const candidates: CrossSellItem[] = [];
      for (const r of rows) {
        const cls = classify(r.subCategory, r.masterCode);
        if (!cls) continue;
        const unitPrice = sellPriceForTier(r, csPs, input.tier);
        candidates.push({
          category: cls.category,
          masterCode: r.masterCode,
          name: r.description || r.masterCode,
          unitPrice,
          reason: cls.reason,
        });
      }

      const items = selectRecommendations(candidates, input.codes, relevant, {
        perCategory: 2,
        max: 6,
      });
      return { items };
    }),

  // ── Resolve required skins / decorative end panels for exposed cabinet sides ──
  // Given placed cabinets (each with its exposed sides) and the chosen door
  // style, return the matching skin product(s) per cabinet, whether that skin is
  // actually buyable in the chosen style (priced SKU exists), and a clear
  // "mandatory" flag for unfinished-exterior lines (Hickory). The pricing/
  // buyability lookup means the BOM lights up automatically once the missing
  // Hickory skin SKUs are loaded — no code change needed.
  resolveSkins: publicProcedure
    .input(
      z.object({
        styleId: z.number(),
        items: z
          .array(
            z.object({
              cabinetId: z.number(),
              exposedLeft: z.boolean().optional(),
              exposedRight: z.boolean().optional(),
              exposedBack: z.boolean().optional(),
              qty: z.number().int().positive().optional(),
            }),
          )
          .max(200),
      }),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db || input.items.length === 0) {
        return { mandatory: false, styleCode: null as string | null, lines: [] };
      }

      const styleRow = (
        await db
          .select({ id: doorStyles.id, styleCode: doorStyles.styleCode, ourName: doorStyles.ourName })
          .from(doorStyles)
          .where(eq(doorStyles.id, input.styleId))
          .limit(1)
      )[0];
      const styleCode = styleRow?.styleCode ?? null;
      const mandatory = requiresMandatorySkin(styleCode);

      // Look up placement + width for the placed cabinets.
      const cabIds = Array.from(new Set(input.items.map((i) => i.cabinetId)));
      const cabRows = await db
        .select({
          id: cabinets.id,
          masterCode: cabinets.masterCode,
          placementType: cabinets.placementType,
          category: cabinets.category,
          width: cabinets.width,
        })
        .from(cabinets)
        .where(inArray(cabinets.id, cabIds));
      const cabById = new Map(cabRows.map((c) => [c.id, c]));

      // Which skin masterCodes are buyable (priced) in this style?
      const requiredSkinCodes = new Set<string>();
      const computed = input.items.map((item) => {
        const cab = cabById.get(item.cabinetId);
        const placement = normalizeSkinPlacement(cab?.placementType || cab?.category);
        const exposed: ExposedSides = {
          left: item.exposedLeft,
          right: item.exposedRight,
          back: item.exposedBack,
        };
        const reqs = matchingSkinsForCabinet({
          placement,
          exposed,
          widthIn: cab?.width ? Number(cab.width) : 0,
        }).map((r) => ({ ...r, qty: r.qty * (item.qty ?? 1) }));
        reqs.forEach((r) => requiredSkinCodes.add(r.skinCode));
        return { cabinetId: item.cabinetId, cabinetCode: cab?.masterCode ?? null, reqs };
      });

      // Buyable skin SKUs for the required codes in this style.
      const buyable = new Map<string, { wholesalePrice: string | null; homeownerPrice: string | null }>();
      if (requiredSkinCodes.size > 0) {
        const skinCabs = await db
          .select({ id: cabinets.id, masterCode: cabinets.masterCode })
          .from(cabinets)
          .where(inArray(cabinets.masterCode, Array.from(requiredSkinCodes)));
        const skinCabIdToCode = new Map(skinCabs.map((c) => [c.id, c.masterCode]));
        if (skinCabs.length > 0) {
          const skuRows = await db
            .select({
              cabinetId: distributorSkus.cabinetId,
              wholesalePrice: distributorSkus.wholesalePrice,
              homeownerPrice: distributorSkus.homeownerPrice,
            })
            .from(distributorSkus)
            .where(
              and(
                inArray(distributorSkus.cabinetId, skinCabs.map((c) => c.id)),
                eq(distributorSkus.styleId, input.styleId),
                eq(distributorSkus.isPublished, true),
              ),
            );
          for (const s of skuRows) {
            const code = skinCabIdToCode.get(s.cabinetId);
            if (code && !buyable.has(code)) {
              buyable.set(code, { wholesalePrice: s.wholesalePrice, homeownerPrice: s.homeownerPrice });
            }
          }
        }
      }

      const lines = computed
        .filter((c) => c.reqs.length > 0)
        .map((c) => ({
          cabinetId: c.cabinetId,
          cabinetCode: c.cabinetCode,
          skins: c.reqs.map((r) => ({
            skinCode: r.skinCode,
            qty: r.qty,
            reason: r.reason,
            available: buyable.has(r.skinCode),
            wholesalePrice: buyable.get(r.skinCode)?.wholesalePrice ?? null,
            homeownerPrice: buyable.get(r.skinCode)?.homeownerPrice ?? null,
          })),
        }));

      return { mandatory, styleCode, lines };
    }),

  // ---------------------------------------------------------------------------
  // Photoreal Preview (AI): turn the current in-tool layout + chosen finish into
  // a single photographic kitchen render. This is a "money shot" preview — it is
  // NOT live-editable and does not affect pricing; it simply visualizes the
  // design the customer built so far. The client passes a compact, already-
  // resolved description of the scene (finish name, door style, counter, and the
  // cabinet runs per wall) so the server does not need to re-derive geometry.
  photorealPreview: publicProcedure
    .input(
      z.object({
        roomWidthFt: z.number().min(1).max(60),
        roomDepthFt: z.number().min(1).max(60),
        ceilingFt: z.number().min(6).max(20).optional(),
        // Human-readable finish, e.g. "Aspen White" / "Repose Gray".
        finishName: z.string().max(80).optional(),
        // Door style label, e.g. "Shaker", "Raised Panel", "Slim Shaker".
        doorStyle: z.string().max(80).optional(),
        // Optional second finish for two-tone designs.
        secondFinishName: z.string().max(80).optional(),
        // Countertop material name, e.g. "White Quartz".
        countertop: z.string().max(80).optional(),
        // Hardware finish/type, e.g. "brushed nickel bar pulls".
        hardware: z.string().max(80).optional(),
        // Surfaces & fixtures carried from the Surfaces wizard so the render
        // reflects the whole room, not just cabinets + countertop.
        flooring: z.string().max(120).optional(),
        backsplash: z.string().max(120).optional(),
        sink: z.string().max(120).optional(),
        faucet: z.string().max(120).optional(),
        // Ordered summary of what is on each wall so the render matches layout.
        // e.g. ["Back wall: 12ft run of base + wall cabinets with a sink and
        // range", "Left wall: tall pantry column"].
        wallSummaries: z.array(z.string().max(300)).max(8).optional(),
        // Human names of walls that actually carry cabinetry, e.g. ["Back wall"].
        cabinetWalls: z.array(z.string().max(40)).max(4).optional(),
        // Appliances/fixtures actually present, e.g. ["a range", "a sink"].
        appliances: z.array(z.string().max(60)).max(12).optional(),
        // Overall footprint so the render matches the true geometry.
        layoutType: z
          .enum(["one-wall", "galley", "L-shaped", "U-shaped", "peninsula", "multi-wall"])
          .optional(),
        // Whether the design includes an island.
        hasIsland: z.boolean().optional(),
        // Free-form extra notes (appliances, open shelving, etc.).
        notes: z.string().max(400).optional(),
        // Camera framing + lighting mood for a consistent photographic look.
        cameraAngle: z.enum(["three-quarter", "straight-on", "wide"]).optional(),
        timeOfDay: z.enum(["daylight", "golden-hour", "evening"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const prompt = buildPhotorealPrompt(input);
      try {
        const { url } = await generateImage({ prompt });
        if (!url) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No image was returned." });
        }
        return { url, prompt };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Image generation failed.";
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
      }
    }),

  // Live tier-priced lookup for cart items. Accepts (masterCode, styleId) pairs
  // (what the cart stores) and returns the current tier-computed unit price for
  // each. Used by the Cart page to show live prices instead of the stored
  // unitPrice (which may be stale if the user's tier changed since adding).
  priceForCartItems: publicProcedure
    .input(
      z.object({
        items: z.array(z.object({ masterCode: z.string(), styleId: z.number() })).max(200),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db || input.items.length === 0) return [];

      const masterCodes = Array.from(new Set(input.items.map((i) => i.masterCode)));
      const styleIds = Array.from(new Set(input.items.map((i) => i.styleId)));
      const wanted = new Set(input.items.map((i) => `${i.masterCode}:${i.styleId}`));

      const rows = await db
        .select({
          masterCode: cabinets.masterCode,
          styleId: distributorSkus.styleId,
          listPrice: distributorSkus.listPrice,
          yourCost: distributorSkus.yourCost,
          wholesalePrice: distributorSkus.wholesalePrice,
          contractorPrice: distributorSkus.contractorPrice,
          homeownerPrice: distributorSkus.homeownerPrice,
          adjustedListPrice: distributorSkus.adjustedListPrice,
        })
        .from(distributorSkus)
        .innerJoin(cabinets, eq(cabinets.id, distributorSkus.cabinetId))
        .where(
          and(
            inArray(cabinets.masterCode, masterCodes),
            inArray(distributorSkus.styleId, styleIds),
            eq(distributorSkus.isAvailable, true),
          )
        );

      // Best (cheapest contractor) row per (masterCode, styleId).
      const best = new Map<string, (typeof rows)[number]>();
      for (const r of rows) {
        const key = `${r.masterCode}:${r.styleId}`;
        if (!wanted.has(key)) continue;
        const cur = best.get(key);
        if (!cur) { best.set(key, r); continue; }
        const a = Number(r.contractorPrice ?? r.wholesalePrice ?? Infinity);
        const b = Number(cur.contractorPrice ?? cur.wholesalePrice ?? Infinity);
        if (a < b) best.set(key, r);
      }

      const ps = await getPricingSettings();
      return Array.from(best.values()).map((r) => ({
        masterCode: r.masterCode,
        styleId: Number(r.styleId),
        ...visiblePricesForViewer(
          {
            listPrice: r.listPrice,
            adjustedListPrice: r.adjustedListPrice,
            wholesalePrice: sellPriceForTier(r, ps, "wholesale")?.toFixed(2) ?? null,
            contractorPrice: sellPriceForTier(r, ps, "contractor")?.toFixed(2) ?? null,
            homeownerPrice: sellPriceForTier(r, ps, "homeowner")?.toFixed(2) ?? null,
          },
          resolveStorefrontTier(ctx.user),
          ctx.user?.role === "admin",
        ),
      }));
    }),
});
