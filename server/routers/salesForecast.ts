import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router, supplierProfileProcedure } from "../_core/trpc";
import { getDb, getPricingSettings } from "../db";
import { validateCloseRateBrackets } from "../../shared/closeRateBrackets";
import { projectForecastForScopes, type ForecastFilters } from "../../shared/salesForecast";
import { listVendorScopes } from "../lib/vendorFulfillmentStore";
import { loadCloseBrackets, replaceCloseBrackets, runSalesForecast } from "../salesForecast/load";

const filtersInput = z.object({
  doorStyles: z.array(z.string()).optional(),
  colors: z.array(z.string()).optional(),
  series: z.array(z.string()).optional(),
  supplierScopes: z.array(z.string()).optional(),
  savedFrom: z.string().nullable().optional(),
  savedTo: z.string().nullable().optional(),
  statuses: z.array(z.string()).optional(),
  customerTypes: z.array(z.string()).optional(),
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(100).default(25),
}).optional();

function toFilters(input: z.infer<typeof filtersInput>): ForecastFilters {
  return {
    doorStyles: input?.doorStyles,
    colors: input?.colors,
    series: input?.series,
    supplierScopes: input?.supplierScopes,
    savedFrom: input?.savedFrom,
    savedTo: input?.savedTo,
    statuses: input?.statuses,
    customerTypes: input?.customerTypes,
  };
}

export const salesForecastRouter = router({
  adminQuery: adminProcedure.input(filtersInput).query(async ({ input }) => {
    const settings = await getPricingSettings();
    return runSalesForecast({
      filters: toFilters(input),
      page: input?.page ?? 0,
      pageSize: input?.pageSize ?? 25,
      homeownerMarkupBps: settings.homeownerMarkupBps,
    });
  }),

  brackets: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return loadCloseBrackets(db);
  }),

  saveBrackets: adminProcedure.input(z.object({
    brackets: z.array(z.object({
      minDays: z.number().int().min(0),
      maxDays: z.number().int().min(0).nullable(),
      closePercent: z.number().min(0).max(100),
    })).min(1).max(12),
  })).mutation(async ({ input }) => {
    const problem = validateCloseRateBrackets(input.brackets);
    if (problem) throw new TRPCError({ code: "BAD_REQUEST", message: problem });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    await replaceCloseBrackets(db, input.brackets);
    return { ok: true as const };
  }),

  /**
   * Vendor forecast. The signed-in vendor, or an admin viewing as that vendor,
   * sees only their scopes. Customer names are removed.
   */
  vendorQuery: supplierProfileProcedure.input(z.object({
    distributorId: z.number().int().positive().optional(),
    approvedVendorLineId: z.number().int().positive().optional(),
    page: z.number().int().min(0).default(0),
    pageSize: z.number().int().min(1).max(100).default(25),
  }).optional()).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return null;
    const scopes = await listVendorScopes(db, ctx.user, {
      distributorId: ctx.isAdmin ? input?.distributorId ?? null : ctx.distributorId,
      approvedVendorLineId: ctx.isAdmin ? input?.approvedVendorLineId ?? null : ctx.approvedVendorLineId,
    });
    const settings = await getPricingSettings();
    const full = await runSalesForecast({
      filters: { supplierScopes: scopes.map((scope) => scope.scope) },
      page: input?.page ?? 0,
      pageSize: input?.pageSize ?? 25,
      homeownerMarkupBps: settings.homeownerMarkupBps,
    });
    return projectForecastForScopes(full, scopes.map((scope) => scope.scope));
  }),
});
