import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  DESIGNER_SUBSCRIPTION_TIER_IDS,
  DESIGNER_SUBSCRIPTION_TIERS,
  designerSubscriptionTierChoices,
  formatTierPrice,
} from "@shared/designerSubscriptionTiers";
import {
  cancelDesignerSubscriptionAtPeriodEnd,
  createDesignerSubscriptionCheckout,
  loadMyDesignerSubscription,
} from "../lib/designerSubscription";

const ALLOWED_ORIGINS = /^https:\/\/([a-z0-9-]+\.)*(cabinetdealz\.com|vercel\.app)$|^http:\/\/localhost(:\d+)?$/i;

/** Stripe returns the customer here. Only our own origins; anything else falls back to the main site. */
function requestOrigin(ctx: { req?: { headers?: Record<string, unknown> } }): string {
  const origin = (ctx.req?.headers?.origin as string | undefined) ?? "";
  return ALLOWED_ORIGINS.test(origin) ? origin : "https://www.cabinetdealz.com";
}

export const designerSubscriptionRouter = router({
  /** The two tiers, from the one shared constant, so the site never types a price. */
  plans: publicProcedure.query(() =>
    designerSubscriptionTierChoices().map((option) => ({
      ...option,
      priceLabel: formatTierPrice(option.id),
    })),
  ),

  mine: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const current = await loadMyDesignerSubscription(db, ctx.user.id);
    if (!current) return null;
    const { stripeSubscriptionId: _hidden, ...view } = current;
    return view;
  }),

  startCheckout: protectedProcedure
    .input(z.object({ tier: z.enum(DESIGNER_SUBSCRIPTION_TIER_IDS) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (db) {
        const current = await loadMyDesignerSubscription(db, ctx.user.id);
        if (current && current.status !== "cancelled" && !current.cancelAtPeriodEnd) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `You already have the ${DESIGNER_SUBSCRIPTION_TIERS[current.tier].name} plan.`,
          });
        }
      }
      const origin = requestOrigin(ctx);
      try {
        return await createDesignerSubscriptionCheckout({
          userId: ctx.user.id,
          tier: input.tier,
          customerEmail: ctx.user.email,
          successUrl: `${origin}/plans?subscription=success&tier=${input.tier}&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${origin}/plans?subscription=cancelled&tier=${input.tier}`,
        });
      } catch (error) {
        console.error(
          "[Designer subscription] Stripe checkout could not start:",
          error instanceof Error ? error.message : String(error),
        );
        throw new TRPCError({ code: "BAD_GATEWAY", message: "Stripe checkout could not start. Please try again." });
      }
    }),

  cancel: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available." });
    const result = await cancelDesignerSubscriptionAtPeriodEnd(db, ctx.user.id);
    if (!result.ok) throw new TRPCError({ code: "NOT_FOUND", message: "No active plan to cancel." });
    return result;
  }),
});
