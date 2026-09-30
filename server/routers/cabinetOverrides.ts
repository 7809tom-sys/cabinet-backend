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
import {
  DISTRIBUTOR_OVERRIDE_DIM_KEYS,
  distributorCabinetConfigSchema,
  parseDistributorCabinetConfig,
} from "../lib/distributorCabinetConfig";

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
   * Save a cabinet configuration rule for the SELECTED distributors only.
   * The master `cabinets` row is never touched here; each ticked distributor
   * gets (or updates) its own distributor_cabinet_overrides row with the rule
   * stored in configJson (dimension keys are mirrored into the real columns so
   * freight/packaging readers keep working). Unticked distributors keep
   * whatever they had before.
   */
  setConfig: adminProcedure
    .input(
      z.object({
        cabinetId: z.number().int().positive(),
        distributorIds: z.array(z.number().int().positive()).min(1),
        config: distributorCabinetConfigSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [cab] = await db
        .select({ id: cabinets.id })
        .from(cabinets)
        .where(eq(cabinets.id, input.cabinetId))
        .limit(1);
      if (!cab) throw new Error("Cabinet not found");
      const distributorIds = Array.from(new Set(input.distributorIds));
      const activeDistributors = await db
        .select({ id: distributors.id })
        .from(distributors)
        .where(inArray(distributors.id, distributorIds));
      const known = new Set(activeDistributors.map((d) => d.id));
      const missing = distributorIds.filter((id) => !known.has(id));
      if (missing.length > 0) throw new Error(`Unknown distributor id(s): ${missing.join(", ")}`);
      const existing = await db
        .select({
          id: distributorCabinetOverrides.id,
          distributorId: distributorCabinetOverrides.distributorId,
          configJson: distributorCabinetOverrides.configJson,
        })
        .from(distributorCabinetOverrides)
        .where(
          and(
            eq(distributorCabinetOverrides.cabinetId, input.cabinetId),
            inArray(distributorCabinetOverrides.distributorId, distributorIds),
          ),
        );
      const existingByDistributor = new Map(existing.map((row) => [row.distributorId, row]));
      const dims: Record<string, string | null> = {};
      for (const key of DISTRIBUTOR_OVERRIDE_DIM_KEYS) {
        if (key in input.config && input.config[key] !== undefined) dims[key] = input.config[key] ?? null;
      }
      let updated = 0;
      let created = 0;
      for (const distributorId of distributorIds) {
        const current = existingByDistributor.get(distributorId);
        // Merge with the distributor's previous rule so a partial save does not
        // silently drop keys saved earlier for that same distributor.
        const merged = { ...parseDistributorCabinetConfig(current?.configJson), ...input.config };
        const payload = {
          distributorId,
          cabinetId: input.cabinetId,
          configJson: JSON.stringify(merged),
          updatedBy: ctx.user.id,
          ...dims,
        };
        if (current) {
          await db
            .update(distributorCabinetOverrides)
            .set(payload)
            .where(eq(distributorCabinetOverrides.id, current.id));
          updated += 1;
        } else {
          await db.insert(distributorCabinetOverrides).values(payload);
          created += 1;
        }
      }
      return { success: true, distributorIds, updated, created };
    }),
  /**
   * Per-distributor configuration rules stored for one cabinet (parsed).
   */
  configForCabinet: adminProcedure
    .input(z.object({ cabinetId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({
          distributorId: distributorCabinetOverrides.distributorId,
          distributorName: distributors.name,
          configJson: distributorCabinetOverrides.configJson,
          updatedAt: distributorCabinetOverrides.updatedAt,
        })
        .from(distributorCabinetOverrides)
        .innerJoin(distributors, eq(distributors.id, distributorCabinetOverrides.distributorId))
        .where(eq(distributorCabinetOverrides.cabinetId, input.cabinetId));
      return rows
        .filter((row) => row.configJson)
        .map((row) => ({
          distributorId: row.distributorId,
          distributorName: row.distributorName,
          config: parseDistributorCabinetConfig(row.configJson),
          updatedAt: row.updatedAt,
        }));
    }),
  /**
   * Remove a distributor's configuration rule (keeps its dimension/image overrides).
   */
  clearConfig: adminProcedure
    .input(z.object({ cabinetId: z.number().int().positive(), distributorId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db
        .update(distributorCabinetOverrides)
        .set({ configJson: null, updatedBy: ctx.user.id })
        .where(
          and(
            eq(distributorCabinetOverrides.cabinetId, input.cabinetId),
            eq(distributorCabinetOverrides.distributorId, input.distributorId),
          ),
        );
      return { success: true };
    }),
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
      let cabinetIds: number[] = cabinetRows
        .map((r) => r.cabinetId)
        .filter((id): id is number => id != null);
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
