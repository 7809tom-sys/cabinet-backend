import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  cabinetMasterChangeRequests,
  cabinets,
  distributorCabinetOverrides,
  distributorSkus,
  distributors,
} from "../../drizzle/schema";
import {
  DISTRIBUTOR_CONFIG_KEYS,
  distributorCabinetConfigSchema,
  parseDistributorCabinetConfig,
  type DistributorCabinetConfig,
} from "../lib/distributorCabinetConfig";
import { cabinetsRouter } from "./catalog";

/**
 * Master Changes approval workflow.
 *
 * "Save as master" in Cabinet Config files a request here instead of editing
 * the shared `cabinets` row. Nothing changes for any distributor until an admin
 * approves the request. Prices are never part of a request (the schema only
 * accepts configuration fields).
 */

const changeSchema = z.object({
  field: z.string().min(1).max(64),
  currentValue: z.unknown(),
  proposedValue: z.unknown(),
});
export type MasterChange = z.infer<typeof changeSchema>;

const UNDO_WINDOW_DAYS = 5;

function parseChanges(raw: string): MasterChange[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((c) => c && typeof c.field === "string") : [];
  } catch {
    return [];
  }
}
function parseValues(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Normalise a master row value for side-by-side comparison. */
function comparable(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === "string") {
    const n = Number(v);
    if (v.trim() !== "" && Number.isFinite(n)) return n;
  }
  return v;
}

function mentionsGlass(values: Record<string, unknown>): boolean {
  if (values.glassDoorAddonCode) return true;
  for (const key of ["description", "specNotes", "subCategory"]) {
    const v = values[key];
    if (typeof v === "string" && /glass/i.test(v)) return true;
  }
  return false;
}

/**
 * Every distributor that carries this cabinet, with a warning where the
 * proposed values do not fit that line.
 */
async function affectedDistributors(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  cabinetId: number,
  proposed: Record<string, unknown>,
) {
  const rows = await db
    .selectDistinct({
      id: distributors.id,
      name: distributors.name,
      glassIncluded: distributors.glassIncluded,
    })
    .from(distributorSkus)
    .innerJoin(distributors, eq(distributors.id, distributorSkus.distributorId))
    .where(eq(distributorSkus.cabinetId, cabinetId));
  const overrides = rows.length
    ? await db
        .select({
          distributorId: distributorCabinetOverrides.distributorId,
          configJson: distributorCabinetOverrides.configJson,
        })
        .from(distributorCabinetOverrides)
        .where(and(
          eq(distributorCabinetOverrides.cabinetId, cabinetId),
          inArray(distributorCabinetOverrides.distributorId, rows.map((r) => r.id)),
        ))
    : [];
  const ruleByDistributor = new Map(overrides.map((o) => [o.distributorId, parseDistributorCabinetConfig(o.configJson)]));
  const glass = mentionsGlass(proposed);
  return rows.map((row) => {
    const warnings: string[] = [];
    if (glass && !row.glassIncluded) {
      warnings.push("Includes glass, but this line does not offer glass doors.");
    }
    const rule = ruleByDistributor.get(row.id);
    if (rule) {
      const masked = Object.keys(proposed).filter((k) => k in rule && (rule as Record<string, unknown>)[k] !== undefined);
      if (masked.length > 0) {
        warnings.push(`This line keeps its own rule for: ${masked.join(", ")} (master value will not show there).`);
      }
    }
    return { id: row.id, name: row.name, glassIncluded: row.glassIncluded, warnings };
  });
}

async function applyMasterValues(
  ctx: { user: { id: number; role: string | null; name?: string | null } } & Record<string, unknown>,
  cabinetId: number,
  values: Record<string, unknown>,
) {
  // Re-use the existing master update (same validation, same side effects);
  // only configuration keys can reach it — never price fields.
  const caller = cabinetsRouter.createCaller(ctx as never);
  const payload: Record<string, unknown> = { id: cabinetId };
  for (const key of DISTRIBUTOR_CONFIG_KEYS) {
    if (key in values && values[key] !== undefined) payload[key] = values[key];
  }
  await caller.adminUpdateCabinet(payload as never);
}

async function snapshotMaster(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  cabinetId: number,
  keys: string[],
): Promise<Record<string, unknown>> {
  const [row] = await db.select().from(cabinets).where(eq(cabinets.id, cabinetId)).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Cabinet not found" });
  const snap: Record<string, unknown> = {};
  for (const key of keys) snap[key] = (row as Record<string, unknown>)[key] ?? null;
  return snap;
}

function reviewer(ctx: { user: { id: number; name?: string | null } }) {
  return { reviewedBy: ctx.user.id, reviewedByName: ctx.user.name ?? null, reviewedAt: new Date() };
}

export const masterChangesRouter = router({
  /** File a pending master change request (used by Cabinet Config "Save as master"). */
  submit: adminProcedure
    .input(
      z.object({
        cabinetId: z.number().int().positive(),
        sourceDistributorId: z.number().int().positive().nullable().optional(),
        proposed: distributorCabinetConfigSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [master] = await db.select().from(cabinets).where(eq(cabinets.id, input.cabinetId)).limit(1);
      if (!master) throw new TRPCError({ code: "NOT_FOUND", message: "Cabinet not found" });
      const changes: MasterChange[] = [];
      for (const key of Object.keys(input.proposed) as Array<keyof DistributorCabinetConfig>) {
        const proposedValue = input.proposed[key];
        if (proposedValue === undefined) continue;
        const currentValue = (master as Record<string, unknown>)[key] ?? null;
        if (JSON.stringify(comparable(currentValue)) === JSON.stringify(comparable(proposedValue))) continue;
        changes.push({ field: key, currentValue, proposedValue });
      }
      if (changes.length === 0) {
        return { success: true, requestId: null as number | null, changes: 0, message: "No master field differs from the current value." };
      }
      const [result] = await db.insert(cabinetMasterChangeRequests).values({
        cabinetId: master.id,
        masterCode: master.masterCode,
        sourceDistributorId: input.sourceDistributorId ?? null,
        submittedBy: ctx.user.id,
        submittedByName: ctx.user.name ?? null,
        status: "pending",
        changesJson: JSON.stringify(changes),
      });
      return { success: true, requestId: Number(result.insertId), changes: changes.length, message: null as string | null };
    }),

  /** Pending requests with side-by-side values and affected distributors. */
  list: adminProcedure
    .input(z.object({ status: z.enum(["pending", "history"]).default("pending") }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const status = input?.status ?? "pending";
      const where =
        status === "pending"
          ? eq(cabinetMasterChangeRequests.status, "pending")
          : inArray(cabinetMasterChangeRequests.status, ["approved", "applied_to_distributor", "rejected", "undone"]);
      const rows = await db
        .select({
          request: cabinetMasterChangeRequests,
          cabinetDescription: cabinets.description,
          cabinetCategory: cabinets.category,
          sourceDistributorName: distributors.name,
        })
        .from(cabinetMasterChangeRequests)
        .leftJoin(cabinets, eq(cabinets.id, cabinetMasterChangeRequests.cabinetId))
        .leftJoin(distributors, eq(distributors.id, cabinetMasterChangeRequests.sourceDistributorId))
        .where(where)
        .orderBy(desc(cabinetMasterChangeRequests.createdAt))
        .limit(300);
      const undoCutoff = Date.now() - UNDO_WINDOW_DAYS * 24 * 60 * 60 * 1000;
      const out = [];
      for (const { request, cabinetDescription, cabinetCategory, sourceDistributorName } of rows) {
        const changes = parseChanges(request.changesJson);
        const proposed: Record<string, unknown> = {};
        for (const c of changes) proposed[c.field] = c.proposedValue;
        const affected = status === "pending" ? await affectedDistributors(db, request.cabinetId, proposed) : [];
        const reviewedAtMs = request.reviewedAt ? new Date(request.reviewedAt).getTime() : null;
        out.push({
          id: request.id,
          cabinetId: request.cabinetId,
          masterCode: request.masterCode,
          cabinetDescription,
          cabinetCategory,
          status: request.status,
          submittedBy: request.submittedBy,
          submittedByName: request.submittedByName,
          createdAt: request.createdAt,
          sourceDistributorId: request.sourceDistributorId,
          sourceDistributorName,
          changes,
          affectedDistributors: affected,
          appliedValues: parseValues(request.appliedValuesJson),
          previousValues: parseValues(request.previousValuesJson),
          appliedDistributorId: request.appliedDistributorId,
          reviewNote: request.reviewNote,
          reviewedByName: request.reviewedByName,
          reviewedAt: request.reviewedAt,
          undoneAt: request.undoneAt,
          canUndo:
            (request.status === "approved" || request.status === "applied_to_distributor") &&
            reviewedAtMs != null &&
            reviewedAtMs >= undoCutoff,
          withinRevertWindow: reviewedAtMs != null && reviewedAtMs >= undoCutoff,
        });
      }
      return out;
    }),

  /** Approve: apply to the master (all distributors). Optional edited values. */
  approve: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        editedValues: distributorCabinetConfigSchema.optional(),
        note: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [request] = await db.select().from(cabinetMasterChangeRequests).where(eq(cabinetMasterChangeRequests.id, input.id)).limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });
      if (request.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: `Request is already ${request.status}.` });
      const values: Record<string, unknown> = {};
      for (const c of parseChanges(request.changesJson)) values[c.field] = c.proposedValue;
      if (input.editedValues) {
        for (const [k, v] of Object.entries(input.editedValues)) if (v !== undefined) values[k] = v;
      }
      const keys = Object.keys(values);
      const previous = await snapshotMaster(db, request.cabinetId, keys);
      await applyMasterValues(ctx as never, request.cabinetId, values);
      await db
        .update(cabinetMasterChangeRequests)
        .set({
          status: "approved",
          previousValuesJson: JSON.stringify(previous),
          appliedValuesJson: JSON.stringify(values),
          reviewNote: input.note ?? null,
          ...reviewer(ctx as never),
        })
        .where(eq(cabinetMasterChangeRequests.id, input.id));
      return { success: true, applied: keys };
    }),

  /** Apply the proposed values to ONE distributor only (its own rule); master untouched. */
  applyToDistributor: adminProcedure
    .input(z.object({ id: z.number().int().positive(), distributorId: z.number().int().positive(), note: z.string().max(2000).optional() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [request] = await db.select().from(cabinetMasterChangeRequests).where(eq(cabinetMasterChangeRequests.id, input.id)).limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });
      if (request.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: `Request is already ${request.status}.` });
      const values: Record<string, unknown> = {};
      for (const c of parseChanges(request.changesJson)) values[c.field] = c.proposedValue;
      const parsed = distributorCabinetConfigSchema.safeParse(values);
      if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST", message: "Proposed values are not valid configuration fields." });
      const [existing] = await db
        .select({ id: distributorCabinetOverrides.id, configJson: distributorCabinetOverrides.configJson })
        .from(distributorCabinetOverrides)
        .where(and(
          eq(distributorCabinetOverrides.cabinetId, request.cabinetId),
          eq(distributorCabinetOverrides.distributorId, input.distributorId),
        ))
        .limit(1);
      const previousRule = parseDistributorCabinetConfig(existing?.configJson);
      const merged = { ...previousRule, ...parsed.data };
      if (existing) {
        await db
          .update(distributorCabinetOverrides)
          .set({ configJson: JSON.stringify(merged), updatedBy: ctx.user.id })
          .where(eq(distributorCabinetOverrides.id, existing.id));
      } else {
        await db.insert(distributorCabinetOverrides).values({
          cabinetId: request.cabinetId,
          distributorId: input.distributorId,
          configJson: JSON.stringify(merged),
          updatedBy: ctx.user.id,
        });
      }
      await db
        .update(cabinetMasterChangeRequests)
        .set({
          status: "applied_to_distributor",
          appliedDistributorId: input.distributorId,
          previousValuesJson: JSON.stringify(previousRule),
          appliedValuesJson: JSON.stringify(parsed.data),
          reviewNote: input.note ?? null,
          ...reviewer(ctx as never),
        })
        .where(eq(cabinetMasterChangeRequests.id, input.id));
      return { success: true };
    }),

  reject: adminProcedure
    .input(z.object({ id: z.number().int().positive(), note: z.string().min(1).max(2000) }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [request] = await db.select({ status: cabinetMasterChangeRequests.status }).from(cabinetMasterChangeRequests).where(eq(cabinetMasterChangeRequests.id, input.id)).limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });
      if (request.status !== "pending") throw new TRPCError({ code: "BAD_REQUEST", message: `Request is already ${request.status}.` });
      await db
        .update(cabinetMasterChangeRequests)
        .set({ status: "rejected", reviewNote: input.note, ...reviewer(ctx as never) })
        .where(eq(cabinetMasterChangeRequests.id, input.id));
      return { success: true };
    }),

  /** Undo an approved change: restore the values that were live before approval. */
  undo: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [request] = await db.select().from(cabinetMasterChangeRequests).where(eq(cabinetMasterChangeRequests.id, input.id)).limit(1);
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });
      const previous = parseValues(request.previousValuesJson);
      if (request.status === "approved") {
        const restore: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(previous)) restore[k] = v ?? null;
        // Decimal columns come back as strings from the snapshot; the update
        // path accepts strings for those and numbers for the rest.
        await applyMasterValues(ctx as never, request.cabinetId, restore);
      } else if (request.status === "applied_to_distributor" && request.appliedDistributorId) {
        await db
          .update(distributorCabinetOverrides)
          .set({ configJson: Object.keys(previous).length ? JSON.stringify(previous) : null, updatedBy: ctx.user.id })
          .where(and(
            eq(distributorCabinetOverrides.cabinetId, request.cabinetId),
            eq(distributorCabinetOverrides.distributorId, request.appliedDistributorId),
          ));
      } else {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Nothing to undo for a ${request.status} request.` });
      }
      await db
        .update(cabinetMasterChangeRequests)
        .set({ status: "undone", undoneBy: ctx.user.id, undoneAt: new Date() })
        .where(eq(cabinetMasterChangeRequests.id, input.id));
      return { success: true };
    }),

  /** Counts for the admin tab badge. */
  counts: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { pending: 0, recentApproved: 0 };
    const cutoff = new Date(Date.now() - UNDO_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const [[p], [a]] = await Promise.all([
      db.select({ n: sql<number>`count(*)` }).from(cabinetMasterChangeRequests).where(eq(cabinetMasterChangeRequests.status, "pending")),
      db
        .select({ n: sql<number>`count(*)` })
        .from(cabinetMasterChangeRequests)
        .where(and(
          inArray(cabinetMasterChangeRequests.status, ["approved", "applied_to_distributor"]),
          gte(cabinetMasterChangeRequests.reviewedAt, cutoff),
        )),
    ]);
    return { pending: Number(p?.n ?? 0), recentApproved: Number(a?.n ?? 0), undoWindowDays: UNDO_WINDOW_DAYS };
  }),
});
