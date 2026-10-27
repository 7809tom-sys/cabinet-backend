import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { affiliates } from "../../drizzle/schema";
import { resolveAffiliateAccess } from "../lib/affiliateAccess";
import { assertAffiliateSocialEditor } from "../lib/affiliateSocialAccess";
import {
  AFFILIATE_SOCIAL_PLATFORMS,
  editorSocialLinks,
  legacySocialColumns,
  sanitizeSocialLinkDrafts,
} from "@shared/affiliateSocialLinks";

const draftSchema = z.object({
  id: z.string().max(64).optional(),
  platform: z.enum(AFFILIATE_SOCIAL_PLATFORMS),
  label: z.string().max(40).optional(),
  url: z.string().max(512).optional(),
  handle: z.string().max(80).nullable().optional(),
  enabled: z.boolean().optional(),
});

async function readableAffiliateId(
  user: { id: number; email: string | null; role: string },
  affiliateId?: number,
) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  if (user.role === "admin") {
    if (!affiliateId) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose which affiliate store to edit." });
    await assertAffiliateSocialEditor(db, user, affiliateId);
    return { db, affiliateId, canEdit: true };
  }
  const access = await resolveAffiliateAccess(db, user);
  if (!access || (affiliateId && affiliateId !== access.affiliateId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Affiliate access required." });
  }
  return {
    db,
    affiliateId: access.affiliateId,
    canEdit: access.isOwner || access.accessMarketing,
  };
}

export const affiliateSocialRouter = router({
  get: protectedProcedure
    .input(z.object({ affiliateId: z.number().int().positive().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const scope = await readableAffiliateId(ctx.user, input?.affiliateId);
      const [row] = await scope.db
        .select({
          socialLinks: affiliates.socialLinks,
          facebookUrl: affiliates.facebookUrl,
          instagramUrl: affiliates.instagramUrl,
        })
        .from(affiliates)
        .where(eq(affiliates.id, scope.affiliateId))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Affiliate not found." });
      return {
        affiliateId: scope.affiliateId,
        canEdit: scope.canEdit,
        links: editorSocialLinks(row.socialLinks, row),
      };
    }),

  update: protectedProcedure
    .input(z.object({
      affiliateId: z.number().int().positive().optional(),
      links: z.array(draftSchema).max(24),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const affiliateId = input.affiliateId ?? (await readableAffiliateId(ctx.user)).affiliateId;
      await assertAffiliateSocialEditor(db, ctx.user, affiliateId);
      const cleaned = sanitizeSocialLinkDrafts(input.links);
      if (!cleaned.ok) throw new TRPCError({ code: "BAD_REQUEST", message: cleaned.message });
      const mirrored = legacySocialColumns(cleaned.links);
      await db.update(affiliates).set({
        socialLinks: cleaned.links,
        facebookUrl: mirrored.facebookUrl,
        instagramUrl: mirrored.instagramUrl,
      }).where(eq(affiliates.id, affiliateId));
      return { affiliateId, links: cleaned.links, ...mirrored };
    }),
});
