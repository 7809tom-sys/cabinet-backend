/**
 * Server half of the self-serve storefront name claim: availability checks and
 * the one write that publishes /store/<slug>.
 *
 * The name rules themselves (slugify, reserved words, length) live in
 * @shared/affiliateStorefrontName so the client can show the same message the
 * server will refuse with. This module adds the parts that need the database:
 * whether the slug is free, and whether the affiliate has finished onboarding.
 */
import { and, eq } from "drizzle-orm";
import { affiliates, affiliateStorefrontClaims } from "../../drizzle/schema";
import { isMissingSchemaError } from "./orderSchemaGuard";
import {
  checkStorefrontName,
  storefrontPath,
  type StorefrontNameProblem,
} from "@shared/affiliateStorefrontName";
import {
  DEFAULT_ONBOARDING_GATE_CHECKS,
  evaluateOnboardingGate,
  type OnboardingGateBlocker,
  type OnboardingGateChecks,
  type OnboardingGateInput,
} from "./affiliateOnboardingGate";

type Database = NonNullable<Awaited<ReturnType<typeof import("../db").getDb>>>;

/** Why a name cannot be claimed. Reserved words are refused before any query. */
export type StorefrontNameBlocker = StorefrontNameProblem | "taken";

export type StorefrontAvailability =
  | { available: true; slug: string; path: string; message: null }
  | { available: false; slug: string; blocker: StorefrontNameBlocker; message: string };

export type StorefrontClaimState = {
  claimed: boolean;
  /** Live public path when a slug is set, otherwise null. */
  slug: string | null;
  path: string | null;
  /** affiliates.slug, whether or not this affiliate claimed it themselves. */
  storeSlug: string;
  /** The name this affiliate claimed, when a claim row exists. */
  claimedSlug: string | null;
  /** True when an admin changed the slug after the claim. */
  slugChangedByAdmin: boolean;
  storefrontEnabled: boolean;
  gate: {
    ok: boolean;
    blockers: OnboardingGateBlocker[];
    checks: { membership: boolean; legalDocuments: boolean; requiredDocuments: boolean };
    messages: string[];
  };
};

/** An affiliate's live row, reduced to what the gate needs. */
export type ClaimableAffiliate = {
  id: number;
  slug: string;
  storeName: string;
  status: string;
  membershipStatus: string;
  membershipExpiresAt: Date | string | number | null;
  /**
   * Set when a member cancels. A cancelled member keeps access until the period
   * they paid for ends. Loaded through loadMembershipSnapshot(), which tolerates
   * the hand-run column missing, so it is absent on a legacy row.
   */
  membershipCancelledAt?: Date | string | number | null;
  storefrontEnabled: boolean;
};

export function gateInputFor(affiliate: ClaimableAffiliate): OnboardingGateInput {
  return {
    affiliateId: affiliate.id,
    status: affiliate.status,
    membershipStatus: affiliate.membershipStatus,
    membershipExpiresAt: affiliate.membershipExpiresAt,
    membershipCancelledAt: affiliate.membershipCancelledAt ?? null,
  };
}

export type ClaimRecord = {
  claimedSlug: string;
  claimedByName: string | null;
  claimedAt: Date | null;
};

/**
 * Read the affiliate's claim row. A missing table (the hand-run SQL has not
 * been pasted yet) is reported as "no claim" rather than an error: the caller
 * then knows only the store's own row, and the claim write will fail loudly.
 * Returns `schemaMissing` so the caller can say so instead of pretending.
 */
export async function loadStorefrontClaim(
  db: Database,
  affiliateId: number,
): Promise<{ claim: ClaimRecord | null; schemaMissing: boolean }> {
  try {
    const [row] = await db
      .select({
        claimedSlug: affiliateStorefrontClaims.claimedSlug,
        claimedByName: affiliateStorefrontClaims.claimedByName,
        claimedAt: affiliateStorefrontClaims.claimedAt,
      })
      .from(affiliateStorefrontClaims)
      .where(eq(affiliateStorefrontClaims.affiliateId, affiliateId))
      .limit(1);
    return { claim: row ?? null, schemaMissing: false };
  } catch (error) {
    if (isMissingSchemaError(error)) {
      console.error(
        "[Affiliate storefront claim] affiliate_storefront_claims is missing. Run docs/sql/0271_affiliate_storefront_name_claim.tidb.sql.",
      );
      return { claim: null, schemaMissing: true };
    }
    throw error;
  }
}

/**
 * Is the slug free? The reserved list is checked first (it is free), then one
 * query covers both the live storefront and a claim that an admin released.
 *
 * `ignoreAffiliateId` lets an affiliate re-check the name they already own
 * without it reading as taken by themselves.
 */
export async function checkStorefrontAvailability(
  db: Database,
  rawName: string,
  options: { ignoreAffiliateId?: number } = {},
): Promise<StorefrontAvailability> {
  const ruled = checkStorefrontName(rawName);
  if (!ruled.ok) {
    return { available: false, slug: ruled.slug, blocker: ruled.problem, message: ruled.message };
  }
  // checkStorefrontName() already refused reserved words, so the only remaining
  // question is whether a live storefront holds the slug.
  const slug = ruled.slug;

  // affiliates.slug is the only name authority: one row per public address, and
  // a unique key in the database. A claim row is history, so a slug an admin
  // renamed away from is released here for anyone to claim. Nothing else needs
  // checking, which keeps two affiliates from ever both believing they own a name.
  const live = await db
    .select({ id: affiliates.id })
    .from(affiliates)
    .where(eq(affiliates.slug, slug))
    .limit(1);
  if (live[0] && live[0].id !== options.ignoreAffiliateId) {
    return {
      available: false,
      slug,
      blocker: "taken",
      message: `The website name "${slug}" is already in use. Try another one.`,
    };
  }

  return { available: true, slug, path: storefrontPath(slug), message: null };
}

/**
 * Write the claim and republish the storefront at the claimed slug.
 *
 * The slug is written only when the affiliate has no claim row yet. The row is
 * inserted before the slug is updated and its UNIQUE(affiliateId) key is what
 * makes the claim one-shot: two tabs submitting at once produce one row and one
 * rejected claim, so neither can move an already-claimed slug. An affiliate
 * created by an admin (slug from the store name, no claim row) may still claim,
 * and that first claim is the only write that changes their slug.
 */
export type ClaimStorefrontResult =
  | { ok: true; slug: string; path: string; storefrontEnabled: true }
  | {
      ok: false;
      reason: "name" | "gate" | "already_claimed" | "store_changed" | "schema";
      message: string;
      blocker?: StorefrontNameBlocker;
      gate?: StorefrontClaimState["gate"];
    };

export async function claimStorefrontName(
  db: Database,
  affiliate: ClaimableAffiliate,
  rawName: string,
  options: {
    userId?: number | null;
    checks?: OnboardingGateChecks;
    now?: Date;
  } = {},
): Promise<ClaimStorefrontResult> {
  const now = options.now ?? new Date();
  const existing = await loadStorefrontClaim(db, affiliate.id);
  if (existing.schemaMissing) {
    return {
      ok: false,
      reason: "schema",
      message:
        "Storefront publishing is not set up yet. Run docs/sql/0271_affiliate_storefront_name_claim.tidb.sql and try again.",
    };
  }

  const gate = await evaluateOnboardingGate(
    gateInputFor(affiliate),
    options.checks ?? DEFAULT_ONBOARDING_GATE_CHECKS,
    now,
  );

  // Order matters for what the affiliate is told. A name that can never be
  // claimed (already claimed, reserved, or taken) is reported before a gate
  // failure, so nobody is asked to finish legal paperwork for a name that would
  // still be refused. Nothing is written on any of these paths.
  if (existing.claim) {
    return {
      ok: false,
      reason: "already_claimed",
      message:
        "Your website name is already set. Ask Cabinet Dealz if it needs to change; affiliates cannot rename their own storefront.",
      gate,
    };
  }

  const availability = await checkStorefrontAvailability(db, rawName, { ignoreAffiliateId: affiliate.id });
  if (!availability.available) {
    return {
      ok: false,
      reason: "name",
      message: availability.message,
      blocker: availability.blocker,
      gate,
    };
  }

  if (!gate.ok) {
    return {
      ok: false,
      reason: "gate",
      message: gate.messages[0] ?? "Finish onboarding before publishing your website.",
      gate,
    };
  }

  const slug = availability.slug;

  // Reserve the one-shot right to a name first. UNIQUE(affiliateId) means a
  // second claim (or a second tab) cannot also reserve it; the loser fails here
  // before any slug is touched.
  try {
    await db.insert(affiliateStorefrontClaims).values({
      affiliateId: affiliate.id,
      claimedSlug: slug,
      claimedByName: rawName.trim().slice(0, 256) || null,
      claimedByUserId: options.userId ?? null,
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return {
        ok: false,
        reason: "already_claimed",
        message:
          "Your website name is already set. Ask Cabinet Dealz if it needs to change; affiliates cannot rename their own storefront.",
        gate,
      };
    }
    if (isMissingSchemaError(error)) {
      return {
        ok: false,
        reason: "schema",
        message:
          "Storefront publishing is not set up yet. Run docs/sql/0271_affiliate_storefront_name_claim.tidb.sql and try again.",
      };
    }
    throw error;
  }

  // The slug is written only while it is still the value this affiliate started
  // from: an admin rename between the read and this update must not be silently
  // overwritten. A zero-row update releases the reservation so the affiliate can
  // retry instead of being locked out of a name they never got.
  const updated = await db
    .update(affiliates)
    .set({ slug, storefrontEnabled: true })
    .where(and(eq(affiliates.id, affiliate.id), eq(affiliates.slug, affiliate.slug)));
  if (affectedRows(updated) === 0) {
    try {
      await db
        .delete(affiliateStorefrontClaims)
        .where(
          and(
            eq(affiliateStorefrontClaims.affiliateId, affiliate.id),
            eq(affiliateStorefrontClaims.claimedSlug, slug),
          ),
        );
    } catch (error) {
      console.error(
        "[Affiliate storefront claim] could not release the reservation after a lost race:",
        error instanceof Error ? error.message : String(error),
      );
    }
    return {
      ok: false,
      reason: "store_changed",
      message: "Your store changed while this was saving. Reload and try again.",
      gate,
    };
  }

  return { ok: true, slug, path: storefrontPath(slug), storefrontEnabled: true };
}

function isDuplicateKeyError(error: unknown): boolean {
  const record = error as { code?: string; errno?: number; cause?: { code?: string; errno?: number } };
  return record?.code === "ER_DUP_ENTRY"
    || record?.errno === 1062
    || record?.cause?.code === "ER_DUP_ENTRY"
    || record?.cause?.errno === 1062;
}

function affectedRows(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  const count = (header as { affectedRows?: number } | undefined)?.affectedRows;
  return typeof count === "number" ? count : 0;
}

/**
 * Everything the final onboarding step needs to render: whether the name is set,
 * what blocks it if not, and the public address once it is.
 */
export async function loadStorefrontClaimState(
  db: Database,
  affiliate: ClaimableAffiliate,
  checks: OnboardingGateChecks = DEFAULT_ONBOARDING_GATE_CHECKS,
  now: Date = new Date(),
): Promise<StorefrontClaimState> {
  const { claim } = await loadStorefrontClaim(db, affiliate.id);
  const gate = await evaluateOnboardingGate(gateInputFor(affiliate), checks, now);
  const claimed = claim != null;
  return {
    claimed,
    slug: affiliate.slug || null,
    path: affiliate.slug ? storefrontPath(affiliate.slug) : null,
    storeSlug: affiliate.slug,
    claimedSlug: claim?.claimedSlug ?? null,
    slugChangedByAdmin: claim != null && Boolean(affiliate.slug) && claim.claimedSlug !== affiliate.slug,
    storefrontEnabled: affiliate.storefrontEnabled,
    gate: {
      ok: gate.ok,
      blockers: gate.blockers,
      checks: gate.checks,
      messages: gate.messages,
    },
  };
}
