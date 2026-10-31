import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { distributors, distributorSkus, doorStyles } from "../../drizzle/schema";
import { PREVIEW_ORDER_BLOCKED_MESSAGE } from "@shared/distributorPreview";

export {
  PREVIEW_BADGE_TEXT, PREVIEW_ORDER_BLOCKED_MESSAGE, GO_LIVE_TERMS_VERSION,
  canSeePreviewSuppliers, isPreviewSupplier, buildGoLiveTerms,
  type GoLiveTerms, type GoLiveTermsInput,
} from "@shared/distributorPreview";

/**
 * SKU visibility for a Designer query that already joins `distributors`.
 * Everyone else: published SKUs of live suppliers. Admins: published SKUs, plus every SKU of an offline supplier (published or not),
 * plus the staged-AEF rows that the Designer already showed to admins before this rule existed.
 */
export function skuVisibleToViewer(viewerIsAdmin: boolean): SQL {
  if (!viewerIsAdmin) return and(eq(distributorSkus.isPublished, true), eq(distributors.isActive, true))!;
  return or(
    eq(distributorSkus.isPublished, true),
    eq(distributors.isActive, false),
    and(eq(distributorSkus.isPublished, false), eq(distributors.code, "AEF")),
  )!;
}

/** Throws if any of these suppliers or door styles belongs to an offline supplier. Applies to admins too. */
export async function assertNoPreviewSuppliers(
  db: { select: (...args: any[]) => any },
  refs: { distributorIds?: Array<number | null | undefined>; styleIds?: Array<number | null | undefined> },
): Promise<void> {
  const distributorIds = Array.from(new Set((refs.distributorIds ?? []).filter((id): id is number => typeof id === "number")));
  const styleIds = Array.from(new Set((refs.styleIds ?? []).filter((id): id is number => typeof id === "number")));
  if (distributorIds.length === 0 && styleIds.length === 0) return;
  const matches: SQL[] = [];
  if (distributorIds.length > 0) matches.push(inArray(distributors.id, distributorIds));
  if (styleIds.length > 0) matches.push(inArray(doorStyles.id, styleIds));
  const offline: Array<{ id: number }> = await db
    .select({ id: distributors.id })
    .from(distributors)
    .leftJoin(doorStyles, eq(doorStyles.distributorId, distributors.id))
    .where(and(eq(distributors.isActive, false), or(...matches)))
    .limit(1);
  if (offline.length > 0) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: PREVIEW_ORDER_BLOCKED_MESSAGE });
  }
}
