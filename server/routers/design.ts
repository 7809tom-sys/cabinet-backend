import { z } from "zod";
import { eq, and, inArray, desc, like } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb, notInConflict } from "../db";
import { cabinets, kitchenDesigns, distributorSkus, doorStyles, distributors, countertopQuotes } from "../../drizzle/schema";
import { notifyOwner } from "../_core/notification";
import { invokeLLM } from "../_core/llm";
import { autoFillSpan, type FillCabinet, type FillMode } from "../../shared/fillEngine";

export const designRouter = router({
  placeableCabinets: publicProcedure
    .input(
      z.object({
        placement: z.enum(["base", "wall", "tall"]).optional(),
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
          isCornerCabinet: cabinets.isCornerCabinet,
          catalogImageUrl: cabinets.catalogImageUrl,
        })
        .from(cabinets)
        .where(and(eq(cabinets.isActive, true), notInConflict()));

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
      // doors sold separately, decorative legs, etc.) are NOT placeable cabinet
      // boxes — they belong to the accessory area (storefront / add-on flow),
      // never the drag-and-drop placement palette. Exclude them up front so they
      // can't leak into a Base/Corner Base tab via the base-bucket fallback.
      const placeableRows = availableRows.filter((r) => {
        const pt = (r.placementType || "").toLowerCase();
        if (pt.includes("accessory") || pt.includes("trim")) return false;
        return true;
      });

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

  save: publicProcedure
    .input(
      z.object({
        id: z.number().optional(),
        name: z.string().min(1).max(255),
        email: z.string().email().optional(),
        roomData: z.any(),
        placedCabinets: z.any(),
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

      if (input.id) {
        await db
          .update(kitchenDesigns)
          .set({
            name: input.name,
            roomData: input.roomData,
            placedCabinets: input.placedCabinets,
            selectedStyleId: input.selectedStyleId,
            selectedDistributorId: input.selectedDistributorId,
            projectName: input.projectName ?? null,
            roomLabel: input.roomLabel ?? null,
            roomType: input.roomType ?? null,
          })
          .where(eq(kitchenDesigns.id, input.id));
        return { id: input.id };
      }

      const result = await db.insert(kitchenDesigns).values({
        userId,
        name: input.name,
        roomData: input.roomData,
        placedCabinets: input.placedCabinets,
        selectedStyleId: input.selectedStyleId,
        selectedDistributorId: input.selectedDistributorId,
        projectName: input.projectName ?? null,
        roomLabel: input.roomLabel ?? null,
        roomType: input.roomType ?? null,
      });
      // mysql2 returns a tuple: [ResultSetHeader, ...]; insertId lives on the header.
      const insertId = (result as unknown as [{ insertId: number }])[0].insertId;
      return { id: insertId };
    }),

  myDesigns: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(kitchenDesigns)
      .where(eq(kitchenDesigns.userId, ctx.user.id));
  }),

  byId: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select()
        .from(kitchenDesigns)
        .where(eq(kitchenDesigns.id, input.id))
        .limit(1);
      return rows[0] ?? null;
    }),

  // ─── Master Project roll-up ───────────────────────────────────────────────
  // Combined bill of materials for a whole job: every saved room sharing the
  // same projectName (owned by the caller) is priced with the SAME contractor
  // price path the Designer uses, returning per-room subtotals + a grand total.
  projectSummary: protectedProcedure
    .input(z.object({ projectName: z.string().min(1).max(255) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { projectName: input.projectName, rooms: [], grandTotal: 0, roomCount: 0 };

      const designs = await db
        .select()
        .from(kitchenDesigns)
        .where(
          and(
            eq(kitchenDesigns.userId, ctx.user.id),
            eq(kitchenDesigns.projectName, input.projectName),
          ),
        )
        .orderBy(kitchenDesigns.createdAt);

      // Look up the white-label style name for any styleId we encounter.
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
});
