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
  type FreightQuoteLine,
} from "@shared/freight";
import {
  buildPallets,
  packagedCubicFt,
  applyKitchenFloor,
  isKitchenOrder,
  totalPackagedLoad,
  type PalletCaps,
  type FreightItemPackage,
} from "@shared/liveFreight";
import { easypostQuote } from "../_core/easypost";

// ─── Settings loading + defaults ────────────────────────────────────────────────
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

function rowToPalletCaps(row: ShippingSettings): PalletCaps {
  return {
    palletLengthIn: Number(row.palletLengthIn),
    palletWidthIn: Number(row.palletWidthIn),
    palletHeightIn: Number(row.palletHeightIn),
    palletMaxWeightLbs: Number(row.palletMaxWeightLbs),
    palletMaxCubicFt: Number(row.palletMaxCubicFt),
    palletTareLbs: Number(row.palletTareLbs),
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

const accessorialsSchema = z
  .object({
    liftgate: z.boolean().optional(),
    residential: z.boolean().optional(),
    insideDelivery: z.boolean().optional(),
  })
  .optional();

const itemsSchema = z
  .array(
    z.object({
      cabinetId: z.number().int().positive().nullable(),
      masterCode: z.string().max(64).nullable().optional(),
      qty: z.number().int().min(1).max(999),
      weightLbs: z.number().min(0).max(5000).nullable().optional(),
    })
  )
  .max(500)
  .default([]);

type FreightItemInput = {
  cabinetId: number | null;
  masterCode?: string | null;
  qty: number;
  weightLbs?: number | null;
};

// Resolve packaged weight + cubic feet per order line from the catalog, with the
// configured fallbacks. Returns both the per-line packages (for pallet building)
// and the flat per-line weights (for the legacy estimator).
async function resolvePackages(
  items: FreightItemInput[],
  row: ShippingSettings | null,
  fallbackWeight: number
): Promise<{ packages: FreightItemPackage[]; weighted: { weightLbs: number | null; qty: number }[] }> {
  const fallbackCubicFt = row ? Number(row.defaultCabinetCubicFt) : 8;

  const ids = items
    .map((i) => i.cabinetId)
    .filter((id): id is number => typeof id === "number");
  const codes = items
    .map((i) => i.masterCode)
    .filter((c): c is string => typeof c === "string" && c.length > 0);

  type Pkg = { weight: number | null; l: number | null; w: number | null; h: number | null };
  const byId = new Map<number, Pkg>();
  const byCode = new Map<string, Pkg>();

  if (ids.length > 0 || codes.length > 0) {
    const db = await getDb();
    if (db) {
      if (ids.length > 0) {
        const rows = await db
          .select({
            id: cabinets.id,
            weight: cabinets.weight,
            l: cabinets.pkgLength,
            w: cabinets.pkgWidth,
            h: cabinets.pkgHeight,
          })
          .from(cabinets)
          .where(inArray(cabinets.id, ids));
        for (const r of rows) {
          byId.set(r.id, {
            weight: r.weight != null ? Number(r.weight) : null,
            l: r.l != null ? Number(r.l) : null,
            w: r.w != null ? Number(r.w) : null,
            h: r.h != null ? Number(r.h) : null,
          });
        }
      }
      if (codes.length > 0) {
        const rows = await db
          .select({
            code: cabinets.masterCode,
            weight: cabinets.weight,
            l: cabinets.pkgLength,
            w: cabinets.pkgWidth,
            h: cabinets.pkgHeight,
          })
          .from(cabinets)
          .where(inArray(cabinets.masterCode, codes));
        for (const r of rows) {
          byCode.set(r.code, {
            weight: r.weight != null ? Number(r.weight) : null,
            l: r.l != null ? Number(r.l) : null,
            w: r.w != null ? Number(r.w) : null,
            h: r.h != null ? Number(r.h) : null,
          });
        }
      }
    }
  }

  const packages: FreightItemPackage[] = [];
  const weighted: { weightLbs: number | null; qty: number }[] = [];

  for (const it of items) {
    const pkg =
      it.cabinetId != null
        ? byId.get(it.cabinetId)
        : it.masterCode
          ? byCode.get(it.masterCode)
          : undefined;

    const resolvedWeight =
      it.weightLbs != null ? it.weightLbs : pkg?.weight ?? null;
    weighted.push({ weightLbs: resolvedWeight, qty: it.qty });

    const cubicFt = packagedCubicFt(
      pkg?.l ?? null,
      pkg?.w ?? null,
      pkg?.h ?? null,
      fallbackCubicFt
    );
    packages.push({
      weightLbs: resolvedWeight != null && resolvedWeight > 0 ? resolvedWeight : fallbackWeight,
      cubicFt,
      qty: it.qty,
    });
  }

  return { packages, weighted };
}

// Build a stable FreightQuote from a live carrier amount.
function liveQuoteToFreightQuote(
  carrierCents: number,
  settings: FreightSettings,
  merchandiseSubtotalCents: number,
  isKitchen: boolean,
  kitchenFloorCents: number,
  billableWeightLbs: number,
  palletCount: number,
  carrierLabel: string | null
): FreightQuote {
  const lines: FreightQuoteLine[] = [];
  lines.push({
    label: `LTL freight${carrierLabel ? ` — ${carrierLabel}` : ""} (${palletCount} pallet${palletCount === 1 ? "" : "s"})`,
    amountCents: carrierCents,
  });

  if (settings.handlingFeeCents > 0) {
    lines.push({ label: "Handling", amountCents: settings.handlingFeeCents });
  }

  let freightBeforeMarkupCents = lines.reduce((s, l) => s + l.amountCents, 0);
  const markupCents = Math.round((freightBeforeMarkupCents * settings.markupBps) / 10000);
  const damageFeeCents = Math.round((freightBeforeMarkupCents * settings.damageFeeBps) / 10000);

  let totalCents = freightBeforeMarkupCents + markupCents + damageFeeCents;

  // Kitchen floor (raise up to $800 for kitchen-scale orders).
  const floor = applyKitchenFloor({
    ratedFreightCents: totalCents,
    isKitchen,
    kitchenFreightFloorCents: kitchenFloorCents,
  });
  if (floor.floorApplied) {
    lines.push({
      label: "Kitchen freight minimum",
      amountCents: floor.finalCents - totalCents,
    });
    totalCents = floor.finalCents;
  }

  // Free-freight threshold on merchandise subtotal.
  const freeFreightApplied =
    settings.freeFreightThresholdCents > 0 &&
    merchandiseSubtotalCents >= settings.freeFreightThresholdCents;
  if (freeFreightApplied) totalCents = 0;

  return {
    available: true,
    zoneName: carrierLabel,
    billableWeightLbs,
    lines,
    freightBeforeMarkupCents,
    markupCents,
    damageFeeCents,
    totalCents,
    freeFreightApplied,
  };
}

export const freightRouter = router({
  // ─── Public: estimate/quote freight for a cart ──────────────────────────────
  estimate: publicProcedure
    .input(
      z.object({
        destinationZip: z.string().min(3).max(16),
        items: itemsSchema,
        merchandiseSubtotalCents: z.number().int().min(0).default(0),
        accessorials: accessorialsSchema,
      })
    )
    .query(async ({ input }): Promise<FreightQuote> => {
      const settingsRow = await loadSettingsRow();
      const settings = settingsRow ? rowToSettings(settingsRow) : DEFAULT_SETTINGS;

      const { packages, weighted } = await resolvePackages(
        input.items,
        settingsRow,
        settings.defaultCabinetWeightLbs
      );

      const quoteMode = settingsRow?.quoteMode ?? "estimator";
      const liveProvider = settingsRow?.liveProvider ?? "estimator";
      const liveKey = settingsRow?.liveApiKey ?? "";

      // ── LIVE MODE: real carrier rate, no guessing ──────────────────────────
      if (quoteMode === "live" && liveProvider !== "estimator" && liveKey) {
        const caps = rowToPalletCaps(settingsRow!);
        const plan = buildPallets(packages, caps);
        const load = totalPackagedLoad(packages);
        const isKitchen = isKitchenOrder(load.units, settingsRow!.kitchenMinCabinets);
        const kitchenFloorCents = settingsRow!.kitchenFreightFloorCents;

        if (plan.palletCount === 0) {
          return {
            available: false,
            zoneName: null,
            billableWeightLbs: 0,
            lines: [],
            freightBeforeMarkupCents: 0,
            markupCents: 0,
            damageFeeCents: 0,
            totalCents: 0,
            freeFreightApplied: false,
            reason: "Add cabinets to get a live shipping quote.",
          };
        }

        const live = await easypostQuote(liveKey, {
          fromZip: settings.originZip,
          toZip: input.destinationZip,
          pallets: plan.pallets.map((p) => ({
            lengthIn: p.lengthIn,
            widthIn: p.widthIn,
            heightIn: p.heightIn,
            weightLbs: p.weightLbs,
          })),
          freightClass: settingsRow!.freightClass,
          residential: input.accessorials?.residential,
        });

        if (!live.ok) {
          // No fabricated number — tell the UI freight is quoted at the order.
          return {
            available: false,
            zoneName: null,
            billableWeightLbs: plan.totalWeightLbs,
            lines: [],
            freightBeforeMarkupCents: 0,
            markupCents: 0,
            damageFeeCents: 0,
            totalCents: 0,
            freeFreightApplied: false,
            reason:
              "Live shipping will be quoted on your order. (" +
              (live.error ?? "carrier unavailable") +
              ")",
          };
        }

        const carrierLabel = [live.carrier, live.service].filter(Boolean).join(" ") || null;
        return liveQuoteToFreightQuote(
          live.amountCents,
          settings,
          input.merchandiseSubtotalCents,
          isKitchen,
          kitchenFloorCents,
          plan.totalWeightLbs,
          plan.palletCount,
          carrierLabel
        );
      }

      // ── ESTIMATOR MODE (legacy, table-driven) ──────────────────────────────
      const zones = await loadZones();
      const totalWeightLbs = totalCartWeight(weighted, settings.defaultCabinetWeightLbs);
      return estimateFreight(
        {
          destinationZip: input.destinationZip,
          totalWeightLbs,
          merchandiseSubtotalCents: input.merchandiseSubtotalCents,
          accessorials: input.accessorials,
        },
        settings,
        zones
      );
    }),

  // ─── Admin: read current settings + zones ───────────────────────────────────
  adminGet: adminProcedure.query(async () => {
    const settingsRow = await loadSettingsRow();
    const db = await getDb();
    const zoneRows = db
      ? await db.select().from(freightZones).orderBy(asc(freightZones.sortOrder))
      : [];
    // Never leak the raw API key to the client; report only whether one is set.
    const safeSettings = settingsRow
      ? { ...settingsRow, liveApiKey: null, hasLiveApiKey: !!settingsRow.liveApiKey }
      : null;
    return { settings: safeSettings, zones: zoneRows };
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
        // Live-quote / pallet / floor controls.
        quoteMode: z.enum(["estimator", "live"]),
        liveProvider: z.enum(["estimator", "easypost", "shippo"]),
        // Optional: only set the key when provided (keeps existing if omitted).
        liveApiKey: z.string().max(255).nullable().optional(),
        kitchenFreightFloorCents: z.number().int().min(0).max(100000000),
        kitchenMinCabinets: z.number().int().min(1).max(100),
        palletLengthIn: z.number().min(12).max(240),
        palletWidthIn: z.number().min(12).max(120),
        palletHeightIn: z.number().min(12).max(120),
        palletMaxWeightLbs: z.number().min(50).max(10000),
        palletMaxCubicFt: z.number().min(5).max(2000),
        palletTareLbs: z.number().min(0).max(500),
        freightClass: z.string().min(1).max(8),
        defaultCabinetCubicFt: z.number().min(0.5).max(200),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const existing = await loadSettingsRow();

      const { liveApiKey, ...rest } = input;
      const values: Record<string, unknown> = {
        ...rest,
        defaultCabinetWeightLbs: String(input.defaultCabinetWeightLbs),
        palletLengthIn: String(input.palletLengthIn),
        palletWidthIn: String(input.palletWidthIn),
        palletHeightIn: String(input.palletHeightIn),
        palletMaxWeightLbs: String(input.palletMaxWeightLbs),
        palletMaxCubicFt: String(input.palletMaxCubicFt),
        palletTareLbs: String(input.palletTareLbs),
        defaultCabinetCubicFt: String(input.defaultCabinetCubicFt),
        updatedAt: new Date(),
      };
      // Only overwrite the key when a non-empty value is explicitly provided.
      if (typeof liveApiKey === "string" && liveApiKey.length > 0) {
        values.liveApiKey = liveApiKey;
      }

      if (existing) {
        await db.update(shippingSettings).set(values).where(eq(shippingSettings.id, existing.id));
      } else {
        await db.insert(shippingSettings).values(values as typeof shippingSettings.$inferInsert);
      }
      return { ok: true };
    }),

  // ─── Admin: test a live quote with the stored key + an example shipment ──────
  testLiveQuote: adminProcedure
    .input(
      z.object({
        destinationZip: z.string().min(3).max(16),
        // Example pallet load to test with (defaults to one full 8 ft pallet).
        testWeightLbs: z.number().min(50).max(10000).default(900),
        testCubicFt: z.number().min(5).max(2000).default(80),
        residential: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      const row = await loadSettingsRow();
      if (!row) {
        return { ok: false, error: "Shipping settings have not been saved yet." };
      }
      if (!row.liveApiKey) {
        return { ok: false, error: "No live API key is set. Add your carrier key first." };
      }
      if (!row.originZip) {
        return { ok: false, error: "Set an origin ZIP before testing a live quote." };
      }

      const caps = rowToPalletCaps(row);
      const plan = buildPallets(
        [{ weightLbs: input.testWeightLbs, cubicFt: input.testCubicFt, qty: 1 }],
        caps
      );

      const live = await easypostQuote(row.liveApiKey, {
        fromZip: row.originZip,
        toZip: input.destinationZip,
        pallets: plan.pallets.map((p) => ({
          lengthIn: p.lengthIn,
          widthIn: p.widthIn,
          heightIn: p.heightIn,
          weightLbs: p.weightLbs,
        })),
        freightClass: row.freightClass,
        residential: input.residential,
      });

      if (!live.ok) return { ok: false, error: live.error ?? "Live quote failed." };

      const carrierLabel = [live.carrier, live.service].filter(Boolean).join(" ") || null;
      return {
        ok: true,
        amountCents: live.amountCents,
        carrier: carrierLabel,
        palletCount: plan.palletCount,
        billableWeightLbs: plan.totalWeightLbs,
      };
    }),

  // ─── Admin: replace the full estimator zone table (legacy) ──────────────────
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
      await db.delete(freightZones);
      if (input.zones.length > 0) {
        await db.insert(freightZones).values(
          input.zones.map((zone, i) => ({
            zoneName: zone.zoneName,
            zipPrefixes: zone.zipPrefixes,
            rateCents: zone.rateCents,
            sortOrder: i,
          }))
        );
      }
      return { ok: true, count: input.zones.length };
    }),
});
