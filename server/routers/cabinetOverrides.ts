import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { adminProcedure, router } from "../_core/trpc";
import {
  distributorCabinetOverrides,
  distributors,
  cabinets,
  distributorSkus,
} from "../../drizzle/schema";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const overrideInput = z.object({
  distributorId: z.number().int().positive(),
  cabinetId: z.number().int().positive(),
  width: z.string().nullable().optional(),
  height: z.string().nullable().optional(),
  depth: z.string().nullable().optional(),
  physicalWidth: z.string().nullable().optional(),
  weight: z.string().nullable().optional(),
  pkgLength: z.string().nullable().optional(),
  pkgWidth: z.string().nullable().optional(),
  pkgHeight: z.string().nullable().optional(),
  pkgWeight: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

// ─── Router ──────────────────────────────────────────────────────────────────

export const cabinetOverridesRouter = router({
  /**
   * Get all overrides for a specific cabinet (across all distributors).
   * Used in the Generic Catalog admin panel to show per-distributor overrides.
   */
  forCabinet: adminProcedure
    .input(z.object({ cabinetId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({
          id: distributorCabinetOverrides.id,
          distributorId: distributorCabinetOverrides.distributorId,
          distributorName: distributors.name,
          distributorCode: distributors.code,
          cabinetId: distributorCabinetOverrides.cabinetId,
          width: distributorCabinetOverrides.width,
          height: distributorCabinetOverrides.height,
          depth: distributorCabinetOverrides.depth,
          physicalWidth: distributorCabinetOverrides.physicalWidth,
          weight: distributorCabinetOverrides.weight,
          pkgLength: distributorCabinetOverrides.pkgLength,
          pkgWidth: distributorCabinetOverrides.pkgWidth,
          pkgHeight: distributorCabinetOverrides.pkgHeight,
          pkgWeight: distributorCabinetOverrides.pkgWeight,
          note: distributorCabinetOverrides.note,
          updatedAt: distributorCabinetOverrides.updatedAt,
        })
        .from(distributorCabinetOverrides)
        .innerJoin(
          distributors,
          eq(distributors.id, distributorCabinetOverrides.distributorId)
        )
        .where(eq(distributorCabinetOverrides.cabinetId, input.cabinetId));
      return rows;
    }),

  /**
   * Get all overrides for a specific distributor (across all cabinets).
   * Used in the Distributor admin panel.
   */
  forDistributor: adminProcedure
    .input(z.object({ distributorId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({
          id: distributorCabinetOverrides.id,
          distributorId: distributorCabinetOverrides.distributorId,
          cabinetId: distributorCabinetOverrides.cabinetId,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          category: cabinets.category,
          subCategory: cabinets.subCategory,
          // Master values
          masterWidth: cabinets.width,
          masterHeight: cabinets.height,
          masterDepth: cabinets.depth,
          masterPhysicalWidth: cabinets.physicalWidth,
          masterWeight: cabinets.weight,
          // Override values
          width: distributorCabinetOverrides.width,
          height: distributorCabinetOverrides.height,
          depth: distributorCabinetOverrides.depth,
          physicalWidth: distributorCabinetOverrides.physicalWidth,
          weight: distributorCabinetOverrides.weight,
          pkgLength: distributorCabinetOverrides.pkgLength,
          pkgWidth: distributorCabinetOverrides.pkgWidth,
          pkgHeight: distributorCabinetOverrides.pkgHeight,
          pkgWeight: distributorCabinetOverrides.pkgWeight,
          note: distributorCabinetOverrides.note,
          updatedAt: distributorCabinetOverrides.updatedAt,
        })
        .from(distributorCabinetOverrides)
        .innerJoin(
          cabinets,
          eq(cabinets.id, distributorCabinetOverrides.cabinetId)
        )
        .where(
          eq(distributorCabinetOverrides.distributorId, input.distributorId)
        );
      return rows;
    }),

  /**
   * Set (upsert) an override for a single cabinet + distributor combination.
   * Pass null for a field to clear that override (revert to master value).
   */
  set: adminProcedure
    .input(overrideInput)
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { distributorId, cabinetId, note, ...dims } = input;

      // Check if override already exists
      const existing = await db
        .select({ id: distributorCabinetOverrides.id })
        .from(distributorCabinetOverrides)
        .where(
          and(
            eq(distributorCabinetOverrides.distributorId, distributorId),
            eq(distributorCabinetOverrides.cabinetId, cabinetId)
          )
        )
        .limit(1);

      const payload = {
        distributorId,
        cabinetId,
        note: note ?? null,
        updatedBy: ctx.user.id,
        ...dims,
      };

      if (existing.length > 0) {
        await db
          .update(distributorCabinetOverrides)
          .set(payload)
          .where(eq(distributorCabinetOverrides.id, existing[0].id));
      } else {
        await db.insert(distributorCabinetOverrides).values(payload);
      }

      return { success: true };
    }),

  /**
   * Set the catalog image for a cabinet at a specific scope:
   * - scope "line": saves to distributor_cabinet_overrides.imageUrl for this distributor only
   * - scope "global": saves to cabinets.catalogImageUrl (master record, all lines)
   */
  setImage: adminProcedure
    .input(
      z.object({
        cabinetId: z.number().int().positive(),
        distributorId: z.number().int().positive(),
        imageUrl: z.string().min(1),
        scope: z.enum(["line", "global"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      if (input.scope === "global") {
        // Update master cabinet record
        await db
          .update(cabinets)
          .set({ catalogImageUrl: input.imageUrl })
          .where(eq(cabinets.id, input.cabinetId));
        return { scope: "global" };
      }

      // scope = "line" — upsert into distributor_cabinet_overrides
      const existing = await db
        .select({ id: distributorCabinetOverrides.id })
        .from(distributorCabinetOverrides)
        .where(
          and(
            eq(distributorCabinetOverrides.distributorId, input.distributorId),
            eq(distributorCabinetOverrides.cabinetId, input.cabinetId)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(distributorCabinetOverrides)
          .set({ imageUrl: input.imageUrl, updatedBy: ctx.user.id })
          .where(eq(distributorCabinetOverrides.id, existing[0].id));
      } else {
        await db.insert(distributorCabinetOverrides).values({
          distributorId: input.distributorId,
          cabinetId: input.cabinetId,
          imageUrl: input.imageUrl,
          updatedBy: ctx.user.id,
        });
      }
      return { scope: "line" };
    }),

  /**
   * Delete an override (revert to master values for this distributor + cabinet).
   */
  delete: adminProcedure
    .input(
      z.object({
        distributorId: z.number().int().positive(),
        cabinetId: z.number().int().positive(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db
        .delete(distributorCabinetOverrides)
        .where(
          and(
            eq(distributorCabinetOverrides.distributorId, input.distributorId),
            eq(distributorCabinetOverrides.cabinetId, input.cabinetId)
          )
        );
      return { success: true };
    }),

  /**
   * Bulk-apply dimension overrides to ALL cabinets in a distributor's catalog.
   * Only the fields that are non-null in the template override are applied.
   * scope = "single" | "all_in_distributor"
   *
   * Used from the product detail page admin overlay when you want to apply
   * a dimension correction to every cabinet in a distributor's line.
   */
  bulkApply: adminProcedure
    .input(
      z.object({
        distributorId: z.number().int().positive(),
        // Template override values to apply to all cabinets
        width: z.string().nullable().optional(),
        height: z.string().nullable().optional(),
        depth: z.string().nullable().optional(),
        physicalWidth: z.string().nullable().optional(),
        weight: z.string().nullable().optional(),
        pkgLength: z.string().nullable().optional(),
        pkgWidth: z.string().nullable().optional(),
        pkgHeight: z.string().nullable().optional(),
        pkgWeight: z.string().nullable().optional(),
        note: z.string().nullable().optional(),
        // Optional: restrict to specific category
        category: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { distributorId, note, category, ...dims } = input;

      // Get all cabinets that have SKUs for this distributor
      const cabinetRows = await db
        .selectDistinct({ cabinetId: distributorSkus.cabinetId })
        .from(distributorSkus)
        .innerJoin(cabinets, eq(cabinets.id, distributorSkus.cabinetId))
        .where(eq(distributorSkus.distributorId, distributorId));

      if (cabinetRows.length === 0) return { updated: 0 };

      // Filter by category if specified
      let cabinetIds: number[] = cabinetRows.map(
        (r: { cabinetId: number }) => r.cabinetId
      );
      if (category) {
        const catRows = await db
          .select({ id: cabinets.id })
          .from(cabinets)
          .where(
            and(
              inArray(cabinets.id, cabinetIds),
              eq(cabinets.category, category)
            )
          );
        cabinetIds = catRows.map((r: { id: number }) => r.id);
      }

      if (cabinetIds.length === 0) return { updated: 0 };

      // Upsert overrides for each cabinet
      let updated = 0;
      for (const cabinetId of cabinetIds) {
        const existing = await db
          .select({ id: distributorCabinetOverrides.id })
          .from(distributorCabinetOverrides)
          .where(
            and(
              eq(distributorCabinetOverrides.distributorId, distributorId),
              eq(distributorCabinetOverrides.cabinetId, cabinetId)
            )
          )
          .limit(1);

        const payload = {
          distributorId,
          cabinetId,
          note: note ?? null,
          updatedBy: ctx.user.id,
          ...dims,
        };

        if (existing.length > 0) {
          await db
            .update(distributorCabinetOverrides)
            .set(payload)
            .where(eq(distributorCabinetOverrides.id, existing[0].id));
        } else {
          await db.insert(distributorCabinetOverrides).values(payload);
        }
        updated++;
      }

      return { updated };
    }),
});
