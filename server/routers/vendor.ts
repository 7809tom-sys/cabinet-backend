import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { vendorApplications } from "../../drizzle/schema";
import { notifyOwner } from "../_core/notification";

export const vendorRouter = router({
  // ─── Public application ──────────────────────────────────────────────────────
  submitApplication: publicProcedure
    .input(
      z.object({
        companyName: z.string().min(1, "Company name is required").max(256),
        contactName: z.string().min(1, "Your name is required").max(256),
        email: z.string().email("A valid email is required").max(320),
        phone: z.string().max(32).optional(),
        website: z.string().max(512).optional(),
        headquarters: z.string().max(256).optional(),
        categories: z.array(z.string().max(64)).max(20).optional(),
        productLines: z.string().max(512).optional(),
        doorStyleCount: z.number().int().min(0).max(100000).optional(),
        hasCatalogImages: z.boolean().default(false),
        offersTradePricing: z.boolean().default(false),
        leadTimeDays: z.number().int().min(0).max(365).optional(),
        message: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });

      const result = await db.insert(vendorApplications).values({
        companyName: input.companyName.trim(),
        contactName: input.contactName.trim(),
        email: input.email.trim(),
        phone: input.phone?.trim() || null,
        website: input.website?.trim() || null,
        headquarters: input.headquarters?.trim() || null,
        categories:
          input.categories && input.categories.length
            ? input.categories.join(", ")
            : null,
        productLines: input.productLines?.trim() || null,
        doorStyleCount: input.doorStyleCount ?? null,
        hasCatalogImages: input.hasCatalogImages,
        offersTradePricing: input.offersTradePricing,
        leadTimeDays: input.leadTimeDays ?? null,
        message: input.message?.trim() || null,
      });
      const insertId = (result as unknown as [{ insertId: number }])[0].insertId;

      // Notify the owner so a new vendor lead is never missed. Best-effort:
      // failures are swallowed so the applicant still gets a success response.
      try {
        await notifyOwner({
          title: "New Cabinet Dealz vendor application",
          content: `${input.companyName} (${input.contactName}, ${input.email}) applied to become a vendor partner.${
            input.categories && input.categories.length
              ? ` Categories: ${input.categories.join(", ")}.`
              : ""
          }${
            input.productLines ? ` Lines: ${input.productLines}.` : ""
          } Review it in the Admin → Vendors area.`,
        });
      } catch {
        // ignore notification failures
      }

      return { id: insertId };
    }),

  // ─── Admin review ────────────────────────────────────────────────────────────
  adminList: protectedProcedure
    .input(
      z
        .object({
          status: z.enum(["pending", "approved", "rejected"]).optional(),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select()
        .from(vendorApplications)
        .orderBy(desc(vendorApplications.createdAt));
      if (input?.status) return rows.filter((r) => r.status === input.status);
      return rows;
    }),

  adminSetStatus: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["pending", "approved", "rejected"]),
        reviewNotes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      await db
        .update(vendorApplications)
        .set({
          status: input.status,
          reviewNotes: input.reviewNotes ?? null,
          reviewedBy: ctx.user.id,
          reviewedAt: new Date(),
        })
        .where(eq(vendorApplications.id, input.id));
      return { id: input.id, status: input.status };
    }),
});
