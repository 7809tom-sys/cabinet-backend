import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { resolveAffiliateAccess } from "../lib/affiliateAccess";
import {
  affiliates,
  crmActivities,
  crmDealDesigns,
  crmDeals,
  customerNotices,
  customerProjectDesigns,
  kitchenDesignRevisions,
  kitchenDesigns,
  users,
} from "../../drizzle/schema";
import { canDeleteCustomerDesign, decideAssistAccess } from "@shared/customerDirectory";
import { planAssistedRevision, planSuggestedCopy, snapshotDesign, type DesignSnapshot } from "@shared/designAssist";

const designFields = {
  name: z.string().min(1).max(255),
  roomData: z.unknown(),
  placedCabinets: z.unknown(),
  selectedSurfaces: z.unknown().optional(),
  threeDPresentation: z.unknown().optional(),
  selectedStyleId: z.number().int().nullable().optional(),
  selectedDistributorId: z.number().int().nullable().optional(),
  projectName: z.string().max(255).nullable().optional(),
  roomLabel: z.string().max(255).nullable().optional(),
  roomType: z.string().max(32).nullable().optional(),
};

function insertId(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  return Number((header as { insertId?: number } | undefined)?.insertId ?? 0);
}

function nextSnapshot(input: z.infer<z.ZodObject<typeof designFields>>): DesignSnapshot {
  return snapshotDesign({
    name: input.name,
    roomData: input.roomData,
    placedCabinets: input.placedCabinets,
    selectedSurfaces: input.selectedSurfaces ?? null,
    threeDPresentation: input.threeDPresentation ?? null,
    selectedStyleId: input.selectedStyleId ?? null,
    selectedDistributorId: input.selectedDistributorId ?? null,
    projectName: input.projectName ?? null,
    roomLabel: input.roomLabel ?? null,
    roomType: input.roomType ?? null,
  });
}

async function loadAssistTarget(user: { id: number; email: string | null; role: string; name?: string | null }, designId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  const [design] = await db.select().from(kitchenDesigns).where(eq(kitchenDesigns.id, designId)).limit(1);
  if (!design) throw new TRPCError({ code: "NOT_FOUND", message: "Design not found." });
  const access = user.role === "admin" ? null : await resolveAffiliateAccess(db, user);
  const decision = decideAssistAccess({ role: user.role, access, designAffiliateId: design.affiliateId });
  if (!decision.ok) throw new TRPCError({ code: "FORBIDDEN", message: decision.message });
  if (canDeleteCustomerDesign(user.id, design.userId) && user.role !== "admin" && !access) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Open your own design from My Account. Assisted editing is for the store's designer." });
  }
  const storeName = design.affiliateId == null
    ? "Cabinet Dealz"
    : (await db.select({ storeName: affiliates.storeName }).from(affiliates).where(eq(affiliates.id, design.affiliateId)).limit(1))[0]?.storeName ?? "your designer";
  return { db, design, storeName };
}

async function logAssist(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, args: {
  designId: number;
  affiliateId: number | null;
  userId: number;
  ownerUserId: number | null;
  body: string;
  noticeTitle: string;
  noticeKind: "design_assisted" | "design_suggested";
  projectId?: number | null;
}) {
  const links = await db.select({ dealId: crmDealDesigns.dealId }).from(crmDealDesigns).where(eq(crmDealDesigns.designId, args.designId));
  let dealId = links[0]?.dealId ?? null;
  if (dealId == null && args.ownerUserId != null) {
    const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, args.ownerUserId)).limit(1);
    if (owner?.email) {
      const [deal] = await db.select({ id: crmDeals.id }).from(crmDeals).where(and(
        eq(crmDeals.contactEmail, owner.email),
        args.affiliateId == null ? isNull(crmDeals.affiliateId) : eq(crmDeals.affiliateId, args.affiliateId),
      )).limit(1);
      dealId = deal?.id ?? null;
    }
  }
  if (dealId != null) {
    await db.insert(crmActivities).values({
      dealId,
      authorUserId: args.userId,
      kind: "note",
      body: args.body,
    });
  }
  if (args.ownerUserId != null) {
    await db.insert(customerNotices).values({
      userId: args.ownerUserId,
      affiliateId: args.affiliateId,
      kind: args.noticeKind,
      title: args.noticeTitle,
      body: args.body,
      designId: args.designId,
      projectId: args.projectId ?? null,
    });
  }
}

export const designAssistRouter = router({
  saveRevision: protectedProcedure
    .input(z.object({ designId: z.number().int().positive(), ...designFields }))
    .mutation(async ({ ctx, input }) => {
      const { db, design, storeName } = await loadAssistTarget(ctx.user, input.designId);
      const plan = planAssistedRevision(snapshotDesign(design), nextSnapshot(input), storeName);
      if (plan.mode !== "revision" || plan.deletesDesign || !plan.preservesPrevious) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Assisted save must keep the previous version." });
      }
      const [latest] = await db.select({ revisionNumber: kitchenDesignRevisions.revisionNumber }).from(kitchenDesignRevisions).where(eq(kitchenDesignRevisions.kitchenDesignId, design.id)).orderBy(desc(kitchenDesignRevisions.revisionNumber)).limit(1);
      await db.insert(kitchenDesignRevisions).values({
        kitchenDesignId: design.id,
        revisionNumber: (latest?.revisionNumber ?? 0) + 1,
        authorUserId: ctx.user.id,
        authorLabel: plan.authorLabel,
        kind: "assisted_edit",
        snapshot: plan.snapshot,
      });
      await db.update(kitchenDesigns).set({
        name: plan.live.name,
        roomData: plan.live.roomData as object | null,
        placedCabinets: plan.live.placedCabinets as object[] | null,
        selectedSurfaces: plan.live.selectedSurfaces as object[] | null,
        threeDPresentation: plan.live.threeDPresentation as object | null,
        selectedStyleId: plan.live.selectedStyleId,
        selectedDistributorId: plan.live.selectedDistributorId,
        projectName: plan.live.projectName,
        roomLabel: plan.live.roomLabel,
        roomType: plan.live.roomType,
        assistLabel: plan.assistLabel,
      }).where(eq(kitchenDesigns.id, design.id));
      await logAssist(db, {
        designId: design.id,
        affiliateId: design.affiliateId,
        userId: ctx.user.id,
        ownerUserId: design.userId,
        body: `${plan.authorLabel} saved a new revision of "${design.name}". The previous version can be restored.`,
        noticeTitle: plan.assistLabel,
        noticeKind: "design_assisted",
      });
      return { id: design.id, authorLabel: plan.authorLabel };
    }),

  suggestCopy: protectedProcedure
    .input(z.object({ designId: z.number().int().positive(), ...designFields }))
    .mutation(async ({ ctx, input }) => {
      const { db, design, storeName } = await loadAssistTarget(ctx.user, input.designId);
      const plan = planSuggestedCopy(snapshotDesign(design), nextSnapshot(input), design.id);
      if (plan.mode !== "suggestion" || plan.updatesOriginal || plan.deletesDesign) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A suggestion must leave the customer's design unchanged." });
      }
      const result = await db.insert(kitchenDesigns).values({
        userId: design.userId,
        affiliateId: design.affiliateId,
        name: plan.copy.name,
        roomData: plan.copy.roomData as object | null,
        placedCabinets: plan.copy.placedCabinets as object[] | null,
        selectedSurfaces: plan.copy.selectedSurfaces as object[] | null,
        threeDPresentation: plan.copy.threeDPresentation as object | null,
        selectedStyleId: plan.copy.selectedStyleId,
        selectedDistributorId: plan.copy.selectedDistributorId,
        projectName: plan.copy.projectName,
        roomLabel: plan.copy.roomLabel,
        roomType: plan.copy.roomType,
        recordKind: "suggested",
        suggestionOfDesignId: design.id,
        assistLabel: plan.copy.assistLabel,
      });
      const copyId = insertId(result);
      const links = await db.select().from(customerProjectDesigns).where(eq(customerProjectDesigns.kitchenDesignId, design.id));
      for (const link of links) {
        await db.insert(customerProjectDesigns).values({ projectId: link.projectId, kitchenDesignId: copyId });
      }
      await logAssist(db, {
        designId: design.id,
        affiliateId: design.affiliateId,
        userId: ctx.user.id,
        ownerUserId: design.userId,
        body: `${storeName} suggested a copy of "${design.name}" without changing the original.`,
        noticeTitle: "Suggested by your designer",
        noticeKind: "design_suggested",
        projectId: links[0]?.projectId ?? null,
      });
      return { id: copyId, originalId: design.id };
    }),
});
