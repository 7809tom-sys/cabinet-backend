import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { siteSettings } from "../../drizzle/schema";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

export const PRICING_VISIBILITY_VALUES = ["public", "logged_in", "dealer", "admin", "hidden"] as const;
export type PricingVisibility = (typeof PRICING_VISIBILITY_VALUES)[number];

async function getOrCreateSettings() {
  const db = await getDb();
  if (!db) return { id: 1, pricingVisibility: "public" as PricingVisibility, updatedAt: new Date() };
  const rows = await db.select().from(siteSettings).limit(1);
  if (rows.length > 0) return rows[0];
  // Seed the default row if it doesn't exist
  await db.insert(siteSettings).values({ pricingVisibility: "public" });
  const created = await db.select().from(siteSettings).limit(1);
  return created[0];
}

export const siteSettingsRouter = router({
  /** Public: returns just the pricingVisibility so the storefront can decide whether to show prices */
  getPublicSettings: publicProcedure.query(async () => {
    return getOrCreateSettings();
  }),

  /** Admin only: update the pricingVisibility setting */
  updateSettings: protectedProcedure
    .input(
      z.object({
        pricingVisibility: z.enum(PRICING_VISIBILITY_VALUES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      // Ensure the row exists
      await getOrCreateSettings();
      await db
        .update(siteSettings)
        .set({ pricingVisibility: input.pricingVisibility })
        .where(eq(siteSettings.id, 1));
      return getOrCreateSettings();
    }),
});
