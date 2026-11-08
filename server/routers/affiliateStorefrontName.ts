import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { affiliates } from "../../drizzle/schema";
import { resolveAffiliateAccess } from "../lib/affiliateAccess";
import { loadMembershipSnapshot } from "../lib/affiliateMembership";
import {
  claimStorefrontName,
  loadStorefrontClaimState,
  checkStorefrontAvailability,
  type ClaimableAffiliate,
  type StorefrontClaimState,
} from "../lib/affiliateStorefrontName";
import {
  STOREFRONT_NAME_MAX_LENGTH,
  checkStorefrontName,
} from "@shared/affiliateStorefrontName";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const nameInput = z.object({ name: z.string().max(STOREFRONT_NAME_MAX_LENGTH * 4) });

const CLAIMABLE_COLUMNS = {
  id: affiliates.id,
  slug: affiliates.slug,
  storeName: affiliates.storeName,
  status: affiliates.status,
  membershipStatus: affiliates.membershipStatus,
  membershipExpiresAt: affiliates.membershipExpiresAt,
  storefrontEnabled: affiliates.storefrontEnabled,
};

/**
 * Resolve the storefront name the signed-in owner may publish.
 *
 * Team members are refused: the storefront name is the store's public address,
 * and only its owner may set it. Affiliate ownership comes from the same
 * membership resolution every other partner route uses.
 */
async function requireOwnedStorefront(
  ctx: { user: { id: number; email: string | null; role: string } },
): Promise<{ db: Database; affiliate: ClaimableAffiliate }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  const access = await resolveAffiliateAccess(db, ctx.user);
  if (!access) throw new TRPCError({ code: "FORBIDDEN", message: "No affiliate account linked to you." });
  if (!access.isOwner) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the affiliate owner can publish the storefront name.",
    });
  }
  const [row] = await db
    .select(CLAIMABLE_COLUMNS)
    .from(affiliates)
    .where(eq(affiliates.id, access.affiliateId))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Affiliate account not found." });
  // membershipCancelledAt is added by hand, so it is read through the snapshot
  // loader, which falls back to the legacy columns instead of throwing when the
  // membership-plan SQL has not been run yet.
  const snapshot = await loadMembershipSnapshot(db, access.affiliateId);
  return { db, affiliate: { ...row, membershipCancelledAt: snapshot?.cancelledAt ?? null } };
}

function claimedState(state: StorefrontClaimState) {
  return {
    claimed: state.claimed,
    slug: state.slug,
    path: state.path,
    claimedSlug: state.claimedSlug,
    slugChangedByAdmin: state.slugChangedByAdmin,
    storefrontEnabled: state.storefrontEnabled,
  };
}

/**
 * Self-serve storefront name for the last onboarding step.
 *
 * `checkName` is safe to call on every keystroke: it reads and never writes.
 * `claimName` is the single write that publishes /store/<slug>; it refuses
 * unless the membership gate passes and the name is still free.
 */
export const affiliateStorefrontNameRouter = router({
  /** Where this affiliate stands: name set or not, and what is still blocking. */
  status: protectedProcedure.query(async ({ ctx }) => {
    const { db, affiliate } = await requireOwnedStorefront(ctx);
    const state = await loadStorefrontClaimState(db, affiliate);
    return {
      storeName: affiliate.storeName,
      storeSlug: state.storeSlug,
      ...claimedState(state),
      gate: state.gate,
    };
  }),

  /**
   * Availability of a typed website name. Returns the slug it would claim, so the
   * form can show the exact /store/<slug> address before the affiliate commits.
   * When the affiliate already owns a name, `currentSlug` is included so the form
   * can say "this is already yours" instead of "taken".
   */
  checkName: protectedProcedure.input(nameInput).query(async ({ ctx, input }) => {
    const { db, affiliate } = await requireOwnedStorefront(ctx);
    const state = await loadStorefrontClaimState(db, affiliate);
    const ruled = checkStorefrontName(input.name);
    if (!ruled.ok) {
      return {
        name: input.name,
        slug: ruled.slug,
        path: null as string | null,
        available: false,
        blocker: ruled.problem,
        message: ruled.message,
        currentSlug: affiliate.slug,
        claimed: state.claimed,
        alreadyYours: false,
      };
    }
    const availability = await checkStorefrontAvailability(db, input.name, {
      ignoreAffiliateId: affiliate.id,
    });
    const alreadyYours = availability.available && state.claimed && state.claimedSlug === availability.slug;
    return {
      name: input.name,
      slug: availability.slug,
      path: availability.available ? availability.path : null,
      available: availability.available,
      blocker: availability.available ? (null as string | null) : availability.blocker,
      message: availability.available ? null : availability.message,
      currentSlug: affiliate.slug,
      claimed: state.claimed,
      alreadyYours,
    };
  }),

  /**
   * Claim the name and publish the storefront. The slug is set once; after this
   * succeeds only an admin can change it.
   */
  claimName: protectedProcedure.input(nameInput).mutation(async ({ ctx, input }) => {
    const { db, affiliate } = await requireOwnedStorefront(ctx);
    const result = await claimStorefrontName(db, affiliate, input.name, {
      userId: ctx.user.id,
    });
    if (!result.ok) {
      if (result.reason === "gate") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: result.message,
          cause: { blocker: result.blocker, gate: result.gate },
        });
      }
      if (result.reason === "already_claimed" || result.reason === "store_changed") {
        throw new TRPCError({ code: "CONFLICT", message: result.message });
      }
      if (result.reason === "schema") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: result.message });
      }
      throw new TRPCError({
        code: result.blocker === "taken" ? "CONFLICT" : "BAD_REQUEST",
        message: result.message,
        cause: { blocker: result.blocker },
      });
    }
    // Not re-read from the stale row: the write above decided all three values.
    return {
      ok: true as const,
      slug: result.slug,
      path: result.path,
      storefrontEnabled: true as const,
      claimed: true,
      claimedSlug: result.slug,
      slugChangedByAdmin: false,
    };
  }),
});