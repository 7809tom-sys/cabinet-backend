import { z } from "zod";
import { eq, inArray, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { publicProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  shippingSettings,
  freightZones,
  cabinets,
  type ShippingSettings,
} from "../../drizzle/schema";
import {
  estimateFreight,
  totalCartWeight,
  type FreightSettings,
  type FreightZoneRate,
  type FreightQuote,
} from "@shared/freight";

// ─── Settings loading + defaults ────────────────────────────────────────────────
// There is exactly one settings row. If it is missing (fresh DB), we fall back to
// safe in-memory defaults so the estimator still answers.
const DEFAULT_SETTINGS: FreightSettings = {
  enabled: true,
  originZip: "",
  rateModel: "per_cwt",
  handlingFeeCents: 0,
  minChargeCents: 8900,
  liftgateFeeCents: 7500,
  residentialFeeCents: 6500,
  insideDeliveryFeeCents: 5000,
  markupBps: 1500,
  damageFeeBps: 0,
  freeFreightThresholdCents: 0,
  defaultCabinetWeightLbs: 45,
};

function rowToSettings(row: ShippingSettings): FreightSettings {
  return {
    enabled: row.enabled,
    originZip: row.originZip,
    rateModel: row.rateModel,
    handlingFeeCents: row.handlingFeeCents,
    minChargeCents: row.minChargeCents,
    liftgateFeeCents: row.liftgateFeeCents,
    residentialFeeCents: row.residentialFeeCents,
    insideDeliveryFeeCents: row.insideDeliveryFeeCents,
    markupBps: row.markupBps,
    damageFeeBps: row.damageFeeBps,
    freeFreightThresholdCents: row.freeFreightThresholdCents,
    defaultCabinetWeightLbs: Number(row.defaultCabinetWeightLbs),
  };
}

async function loadSettingsRow(): Promise<ShippingSettings | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(shippingSettings).limit(1);
  return rows[0] ?? null;
}

async function loadZones(): Promise<FreightZoneRate[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(freightZones)
    .orderBy(asc(freightZones.sortOrder));
  return rows.map((r) => ({
    zoneName: r.zoneName,
    zipPrefixes: r.zipPrefixes,
    rateCents: r.rateCents,
  }));
}

// ─── Provider seam ──────────────────────────────────────────────────────────────
// Today the only provider is our table-driven estimator. A live carrier/broker
// API (Freightquote, C.H. Robinson, etc.) can be added here later WITHOUT changing
// the procedure signature or the client: implement it and switch on
// settings.liveProvider. Until then, "estimator" is always used.
async function quoteViaProvider(
  providerName: string,
  args: {
    destinationZip: string;
    totalWeightLbs: number;
    merchandiseSubtotalCents: number;
    accessorials?: { liftgate?: boolean; residential?: boolean; insideDelivery?: boolean };
  },
  settings: FreightSettings,
  zones: FreightZoneRate[]
): Promise<FreightQuote> {
  // Placeholder for future live integrations.
  // if (providerName === "freightquote") return await freightquoteQuote(...);
  return estimateFreight(args, settings, zones);
}

const accessorialsSchema = z
  .object({
    liftgate: z.boolean().optional(),
    residential: z.boolean().optional(),
    insideDelivery: z.boolean().optional(),
  })
  .optional();

export const freightRouter = router({
  // ─── Public: estimate freight for a cart ───────────────────────────────────
  // Accepts cart lines as {cabinetId, qty}; weight is looked up server-side from
  // the catalog (with the configured default fallback) so the client can't spoof
  // it. Returns a transparent breakdown including the markup line.
  estimate: publicProcedure
    .input(
      z.object({
        destinationZip: z.string().min(3).max(16),
        items: z
          .array(
            z.object({
              cabinetId: z.number().int().positive().nullable(),
              // optional master code (cart stores codes, not ids)
              masterCode: z.string().max(64).nullable().optional(),
              qty: z.number().int().min(1).max(999),
              // optional explicit weight for non-catalog/custom lines
              weightLbs: z.number().min(0).max(5000).nullable().optional(),
            })
          )
          .max(500)
          .default([]),
        merchandiseSubtotalCents: z.number().int().min(0).default(0),
        accessorials: accessorialsSchema,
      })
    )
    .query(async ({ input }) => {
      const settingsRow = await loadSettingsRow();
      const settings = settingsRow ? rowToSettings(settingsRow) : DEFAULT_SETTINGS;
      const zones = await loadZones();

      // Resolve catalog weights for the referenced cabinets, by id and/or code.
      const ids = input.items
        .map((i) => i.cabinetId)
        .filter((id): id is number => typeof id === "number");
      const codes = input.items
        .map((i) => i.masterCode)
        .filter((c): c is string => typeof c === "string" && c.length > 0);
      const weightById = new Map<number, number | null>();
      const weightByCode = new Map<string, number | null>();
      if (ids.length > 0 || codes.length > 0) {
        const db = await getDb();
        if (db) {
          if (ids.length > 0) {
            const rows = await db
              .select({ id: cabinets.id, weight: cabinets.weight })
              .from(cabinets)
              .where(inArray(cabinets.id, ids));
            for (const r of rows) {
              weightById.set(r.id, r.weight != null ? Number(r.weight) : null);
            }
          }
          if (codes.length > 0) {
            const rows = await db
              .select({ code: cabinets.masterCode, weight: cabinets.weight })
              .from(cabinets)
              .where(inArray(cabinets.masterCode, codes));
            for (const r of rows) {
              weightByCode.set(r.code, r.weight != null ? Number(r.weight) : null);
            }
          }
        }
      }

      const weighted = input.items.map((it) => ({
        weightLbs:
          it.weightLbs != null
            ? it.weightLbs
            : it.cabinetId != null
              ? weightById.get(it.cabinetId) ?? null
              : it.masterCode
                ? weightByCode.get(it.masterCode) ?? null
                : null,
        qty: it.qty,
      }));
      const totalWeightLbs = totalCartWeight(weighted, settings.defaultCabinetWeightLbs);

      const provider = settingsRow?.liveProvider ?? "estimator";
      const quote = await quoteViaProvider(
        provider,
        {
          destinationZip: input.destinationZip,
          totalWeightLbs,
          merchandiseSubtotalCents: input.merchandiseSubtotalCents,
          accessorials: input.accessorials,
        },
        settings,
        zones
      );
      return quote;
    }),

  // ─── Admin: read current settings + zones ───────────────────────────────────
  adminGet: adminProcedure.query(async () => {
    const settingsRow = await loadSettingsRow();
    const db = await getDb();
    const zoneRows = db
      ? await db.select().from(freightZones).orderBy(asc(freightZones.sortOrder))
      : [];
    return {
      settings: settingsRow,
      zones: zoneRows,
    };
  }),

  // ─── Admin: update settings (upserts the single row) ────────────────────────
  adminUpdateSettings: adminProcedure
    .input(
      z.object({
        enabled: z.boolean(),
        originZip: z.string().max(16),
        rateModel: z.enum(["per_cwt", "flat"]),
        handlingFeeCents: z.number().int().min(0).max(100000),
        minChargeCents: z.number().int().min(0).max(1000000),
        liftgateFeeCents: z.number().int().min(0).max(100000),
        residentialFeeCents: z.number().int().min(0).max(100000),
        insideDeliveryFeeCents: z.number().int().min(0).max(100000),
        markupBps: z.number().int().min(0).max(20000),
        damageFeeBps: z.number().int().min(0).max(10000),
        freeFreightThresholdCents: z.number().int().min(0).max(100000000),
        defaultCabinetWeightLbs: z.number().min(1).max(1000),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const existing = await loadSettingsRow();
      const values = {
        ...input,
        defaultCabinetWeightLbs: String(input.defaultCabinetWeightLbs),
        updatedAt: new Date(),
      };
      if (existing) {
        await db.update(shippingSettings).set(values).where(eq(shippingSettings.id, existing.id));
      } else {
        await db.insert(shippingSettings).values(values);
      }
      return { ok: true };
    }),

  // ─── Admin: replace the full zone table ─────────────────────────────────────
  adminSaveZones: adminProcedure
    .input(
      z.object({
        zones: z
          .array(
            z.object({
              zoneName: z.string().min(1).max(64),
              zipPrefixes: z.string().min(1).max(255),
              rateCents: z.number().int().min(0).max(10000000),
            })
          )
          .max(100),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      // Simple full-replace: clear then re-insert with sort order by position.
      await db.delete(freightZones);
      if (input.zones.length > 0) {
        await db.insert(freightZones).values(
          input.zones.map((z, i) => ({
            zoneName: z.zoneName,
            zipPrefixes: z.zipPrefixes,
            rateCents: z.rateCents,
            sortOrder: i,
          }))
        );
      }
      return { ok: true, count: input.zones.length };
    }),
});
