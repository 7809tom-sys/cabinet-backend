import { z } from "zod";
import { eq, and, inArray, gte, desc, sql } from "drizzle-orm";
import { getDb } from "../db";
import { publicProcedure, adminProcedure, router } from "../_core/trpc";
import {
  distributorCabinetOverrides,
  distributors,
  cabinets,
  distributorSkus,
  cabinetConfigChangeLog,
} from "../../drizzle/schema";
import {
  DISTRIBUTOR_OVERRIDE_DIM_KEYS,
  distributorCabinetConfigSchema,
  parseDistributorCabinetConfig,
} from "../lib/distributorCabinetConfig";
import {
  CONFIG_REVERT_WINDOW_DAYS,
  logCabinetConfigChanges,
  parseLoggedValue,
  recentCabinetConfigChanges,
} from "../lib/cabinetConfigHistory";

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
        .select()
        .from(cabinets)
        .where(eq(cabinets.id, input.cabinetId))
        .limit(1);
      if (!cab) throw new Error("Cabinet not found");
      // Baseline for the history log: whatever this distributor effectively had
      // before (its previous rule layered over the master), so a first-time rule
      // only records the fields the admin actually changed.
      const masterBaseline: Record<string, unknown> = {};
      for (const key of Object.keys(input.config)) {
        if (key in cab) masterBaseline[key] = (cab as Record<string, unknown>)[key];
      }
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
        const previous = parseDistributorCabinetConfig(current?.configJson);
        const merged = { ...previous, ...input.config };
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
        await logCabinetConfigChanges(db, {
          cabinetId: input.cabinetId,
          masterCode: cab.masterCode ?? "",
          scope: "distributor",
          distributorId,
          before: { ...masterBaseline, ...(previous as Record<string, unknown>) },
          after: input.config as Record<string, unknown>,
          actor: { id: ctx.user?.id ?? null, name: ctx.user?.name ?? null },
        });
      }
      return { success: true, distributorIds, updated, created };
    }),
  /**
   * Per-distributor configuration rules stored for one cabinet (parsed).
   */
  /**
   * The rule one distributor has for one cabinet (public: the catalog page
   * shows a distributor's own description/spec values when a shopper is
   * viewing that distributor's door style). Price/SKU fields are never here.
   */
  configForDistributor: publicProcedure
    .input(z.object({ cabinetId: z.number().int().positive(), distributorId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [row] = await db
        .select({ configJson: distributorCabinetOverrides.configJson, updatedAt: distributorCabinetOverrides.updatedAt })
        .from(distributorCabinetOverrides)
        .where(and(eq(distributorCabinetOverrides.cabinetId, input.cabinetId), eq(distributorCabinetOverrides.distributorId, input.distributorId)))
        .limit(1);
      if (!row?.configJson) return null;
      const config = parseDistributorCabinetConfig(row.configJson);
      return Object.keys(config).length > 0 ? { config, updatedAt: row.updatedAt } : null;
    }),

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
          hasConfigRule: sql<number>`IF(${distributorCabinetOverrides.configJson} IS NULL, 0, 1)`,
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
  /**
   * Cabinet configuration history: every field an admin actually changed
   * (master row or one distributor's rule) in the last N days, newest first.
   * Also includes older saves that predate the per-field log (from
   * cabinets.configuredAt / overrides.updatedAt) so the panel never hides real activity.
   */
  configHistory: adminProcedure
    .input(
      z
        .object({
          cabinetId: z.number().int().positive().optional(),
          days: z.number().int().min(1).max(60).optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const days = input?.days ?? CONFIG_REVERT_WINDOW_DAYS;
      const changes = await recentCabinetConfigChanges(db, { cabinetId: input?.cabinetId, days, includeReverted: true });
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      // Saves recorded before the per-field log existed: show them as "saved" rows.
      const savedMaster = await db
        .select({ id: cabinets.id, masterCode: cabinets.masterCode, at: cabinets.configuredAt, by: cabinets.configVerifiedByName })
        .from(cabinets)
        .where(input?.cabinetId ? and(gte(cabinets.configuredAt, since), eq(cabinets.id, input.cabinetId)) : gte(cabinets.configuredAt, since))
        .orderBy(desc(cabinets.configuredAt))
        .limit(300);
      const savedOverrides = await db
        .select({
          cabinetId: distributorCabinetOverrides.cabinetId,
          masterCode: cabinets.masterCode,
          distributorId: distributorCabinetOverrides.distributorId,
          distributorName: distributors.name,
          at: distributorCabinetOverrides.updatedAt,
        })
        .from(distributorCabinetOverrides)
        .innerJoin(cabinets, eq(cabinets.id, distributorCabinetOverrides.cabinetId))
        .leftJoin(distributors, eq(distributors.id, distributorCabinetOverrides.distributorId))
        .where(
          input?.cabinetId
            ? and(gte(distributorCabinetOverrides.updatedAt, since), eq(distributorCabinetOverrides.cabinetId, input.cabinetId))
            : gte(distributorCabinetOverrides.updatedAt, since)
        )
        .orderBy(desc(distributorCabinetOverrides.updatedAt))
        .limit(300);
      const logged = new Set(changes.map((c) => `${c.scope}:${c.cabinetId}:${c.distributorId ?? ""}:${new Date(c.createdAt).getTime() / 60000 | 0}`));
      const saves = [
        ...savedMaster
          .filter((r) => r.at && !logged.has(`master:${r.id}::${new Date(r.at).getTime() / 60000 | 0}`))
          .map((r) => ({
            scope: "master" as const,
            cabinetId: r.id,
            masterCode: r.masterCode,
            distributorId: null as number | null,
            distributorName: null as string | null,
            at: r.at as Date,
            byName: r.by,
          })),
        ...savedOverrides
          .filter((r) => !logged.has(`distributor:${r.cabinetId}:${r.distributorId}:${new Date(r.at).getTime() / 60000 | 0}`))
          .map((r) => ({
            scope: "distributor" as const,
            cabinetId: r.cabinetId,
            masterCode: r.masterCode,
            distributorId: r.distributorId,
            distributorName: r.distributorName,
            at: r.at,
            byName: null as string | null,
          })),
      ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      return { days, revertWindowDays: CONFIG_REVERT_WINDOW_DAYS, changes, saves };
    }),

  /** Revert one logged change (within the revert window): writes the old value back for that scope only. */
  revertConfigChange: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [row] = await db.select().from(cabinetConfigChangeLog).where(eq(cabinetConfigChangeLog.id, input.id)).limit(1);
      if (!row) throw new Error("Change not found");
      if (row.revertedAt) throw new Error("Already reverted");
      const ageDays = (Date.now() - new Date(row.createdAt).getTime()) / 86400000;
      if (ageDays > CONFIG_REVERT_WINDOW_DAYS) throw new Error(`Revert window is ${CONFIG_REVERT_WINDOW_DAYS} days`);
      const oldValue = parseLoggedValue(row.oldValueJson);
      const newValue = parseLoggedValue(row.newValueJson);
      const actor = { id: ctx.user?.id ?? null, name: ctx.user?.name ?? null };
      if (row.scope === "master") {
        if (!(row.field in cabinets)) throw new Error(`Unknown field ${row.field}`);
        const col = (cabinets as unknown as Record<string, unknown>)[row.field];
        if (!col) throw new Error(`Unknown field ${row.field}`);
        const [before] = await db.select().from(cabinets).where(eq(cabinets.id, row.cabinetId)).limit(1);
        if (!before) throw new Error("Cabinet not found");
        const restore = row.field.endsWith("At") && typeof oldValue === "string" ? new Date(oldValue) : oldValue;
        await db
          .update(cabinets)
          .set({ [row.field]: restore, configuredAt: new Date() } as Record<string, unknown>)
          .where(eq(cabinets.id, row.cabinetId));
        await logCabinetConfigChanges(db, {
          cabinetId: row.cabinetId,
          masterCode: row.masterCode,
          scope: "master",
          before: { [row.field]: (before as Record<string, unknown>)[row.field] },
          after: { [row.field]: restore },
          actor,
        });
      } else {
        if (!row.distributorId) throw new Error("Distributor missing on change");
        const [current] = await db
          .select()
          .from(distributorCabinetOverrides)
          .where(and(eq(distributorCabinetOverrides.cabinetId, row.cabinetId), eq(distributorCabinetOverrides.distributorId, row.distributorId)))
          .limit(1);
        const previous = parseDistributorCabinetConfig(current?.configJson);
        const merged: Record<string, unknown> = { ...previous };
        if (oldValue === null || oldValue === undefined) delete merged[row.field];
        else merged[row.field] = oldValue;
        const configJson = Object.keys(merged).length > 0 ? JSON.stringify(merged) : null;
        if (current) {
          await db
            .update(distributorCabinetOverrides)
            .set({ configJson, updatedBy: ctx.user.id })
            .where(eq(distributorCabinetOverrides.id, current.id));
        } else if (configJson) {
          await db
            .insert(distributorCabinetOverrides)
            .values({ cabinetId: row.cabinetId, distributorId: row.distributorId, configJson, updatedBy: ctx.user.id });
        }
        await logCabinetConfigChanges(db, {
          cabinetId: row.cabinetId,
          masterCode: row.masterCode,
          scope: "distributor",
          distributorId: row.distributorId,
          before: { [row.field]: (previous as Record<string, unknown>)[row.field] ?? null },
          after: { [row.field]: oldValue ?? null },
          actor,
        });
      }
      await db
        .update(cabinetConfigChangeLog)
        .set({ revertedAt: new Date(), revertedBy: ctx.user?.id ?? null })
        .where(eq(cabinetConfigChangeLog.id, row.id));
      return { ok: true, field: row.field, restored: oldValue, undone: newValue };
    }),
});
