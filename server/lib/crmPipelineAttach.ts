import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { crmDeals } from "../../drizzle/schema";
import type { getDb } from "../db";
import { pickPipelineDeal, type PipelineCandidate } from "@shared/crmMailbox";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type PipelineDealDraft = {
  affiliateId: number | null;
  ownerUserId: number | null;
  title: string;
  stage?: "new" | "contacted" | "qualified" | "image_review" | "quoted" | "won" | "lost";
  priority?: "low" | "medium" | "high";
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  location?: string | null;
  estimatedValue?: string | null;
  source: "manual" | "order_request" | "pro_application" | "storefront" | "referral" | "verified_plan_image_request";
  orderRequestId?: number | null;
  referralCode?: string | null;
  notes?: string | null;
  match: "order" | "email";
};

function scopeCondition(affiliateId: number | null) {
  return affiliateId == null ? isNull(crmDeals.affiliateId) : eq(crmDeals.affiliateId, affiliateId);
}

/**
 * Create a deal in the owning pipeline, or return an existing one.
 * Orders dedupe on orderRequestId. Design leads and quotes dedupe on the
 * open deal with the same email inside that affiliate (or house) scope.
 */
export async function ensureAffiliatePipelineDeal(db: Db, draft: PipelineDealDraft): Promise<{ id: number; created: boolean }> {
  const email = draft.contactEmail?.trim().toLowerCase() || null;
  if (draft.match === "order" && draft.orderRequestId != null) {
    const rows = await db
      .select({
        id: crmDeals.id,
        affiliateId: crmDeals.affiliateId,
        contactEmail: crmDeals.contactEmail,
        orderRequestId: crmDeals.orderRequestId,
        stage: crmDeals.stage,
      })
      .from(crmDeals)
      .where(and(eq(crmDeals.orderRequestId, draft.orderRequestId), scopeCondition(draft.affiliateId)))
      .limit(5);
    const picked = pickPipelineDeal(rows, { affiliateId: draft.affiliateId, match: "order", orderRequestId: draft.orderRequestId });
    if (picked) return { id: picked.id, created: false };
  }
  if (draft.match === "email" && email) {
    const rows = await db
      .select({
        id: crmDeals.id,
        affiliateId: crmDeals.affiliateId,
        contactEmail: crmDeals.contactEmail,
        orderRequestId: crmDeals.orderRequestId,
        stage: crmDeals.stage,
      })
      .from(crmDeals)
      .where(and(scopeCondition(draft.affiliateId), sql`lower(${crmDeals.contactEmail}) = ${email}`))
      .orderBy(desc(crmDeals.updatedAt))
      .limit(20);
    const picked = pickPipelineDeal(rows as PipelineCandidate[], {
      affiliateId: draft.affiliateId,
      match: "email",
      contactEmail: email,
    });
    if (picked) return { id: picked.id, created: false };
  }

  const result = await db.insert(crmDeals).values({
    affiliateId: draft.affiliateId,
    ownerUserId: draft.ownerUserId,
    title: draft.title.slice(0, 256),
    stage: draft.stage ?? "new",
    priority: draft.priority ?? "medium",
    contactName: draft.contactName ?? null,
    contactEmail: email,
    contactPhone: draft.contactPhone ?? null,
    location: draft.location ?? null,
    estimatedValue: draft.estimatedValue ?? null,
    source: draft.source,
    orderRequestId: draft.orderRequestId ?? null,
    referralCode: draft.referralCode ?? null,
    notes: draft.notes ?? null,
  });
  return { id: (result as unknown as [{ insertId: number }])[0].insertId, created: true };
}
