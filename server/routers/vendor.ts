import { z } from "zod";
import { eq, desc, and, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { invalidatePublicCatalogCache } from "../lib/publicCatalogCache";
import { vendorApplications, users, distributors, distributorSkus, doorStyles } from "../../drizzle/schema";
import { notifyOwner } from "../_core/notification";
import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 10;

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

  // ─── Admin: Provision a vendor account ───────────────────────────────────────
  /** Create a user with role=distributor linked to a distributor record. */
  adminProvisionVendor: protectedProcedure
    .input(
      z.object({
        email: z.string().email().max(320),
        password: z.string().min(8).max(128),
        name: z.string().min(1).max(256),
        distributorId: z.number().int(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Verify distributor exists
      const dist = await db.select({ id: distributors.id, name: distributors.name })
        .from(distributors).where(eq(distributors.id, input.distributorId)).limit(1);
      if (!dist[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Distributor line not found." });

      // Check email not already taken
      const emailLower = input.email.toLowerCase();
      const existing = await db.select({ id: users.id }).from(users)
        .where(eq(users.emailLower, emailLower)).limit(1);
      if (existing[0]) {
        // If user exists, just update their role and distributorId
        await db.update(users).set({
          role: "distributor",
          distributorId: input.distributorId,
        }).where(eq(users.id, existing[0].id));
        return { userId: existing[0].id, distributorId: input.distributorId, created: false };
      }

      // Create new user
      const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
      const openId = `email_${crypto.randomUUID()}`;
      await db.insert(users).values({
        openId,
        name: input.name,
        email: input.email,
        emailLower,
        passwordHash,
        loginMethod: "password",
        role: "distributor",
        distributorId: input.distributorId,
        lastSignedIn: new Date(),
      });

      const created = await db.select({ id: users.id }).from(users)
        .where(eq(users.emailLower, emailLower)).limit(1);

      return { userId: created[0]?.id ?? 0, distributorId: input.distributorId, created: true };
    }),

  // ─── Vendor: Bulk CSV catalog upload ────────────────────────────────────────
  /** Parse a CSV payload and bulk-update prices/availability for existing SKUs. */
  bulkCatalogUpdate: protectedProcedure
    .input(
      z.object({
        distributorId: z.number().int().optional(),
        /** CSV rows: each must have distributorSku, plus optional price columns */
        rows: z.array(
          z.object({
            distributorSku: z.string().min(1),
            listPrice: z.string().max(16).optional(),
            wholesalePrice: z.string().max(16).optional(),
            contractorPrice: z.string().max(16).optional(),
            homeownerPrice: z.string().max(16).optional(),
            isAvailable: z.boolean().optional(),
          })
        ).min(1).max(5000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Allow distributor role or admin
      if (ctx.user.role !== "admin" && ctx.user.role !== "distributor") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      let lineId: number;
      if (ctx.user.role === "distributor") {
        if (!ctx.user.distributorId) throw new TRPCError({ code: "FORBIDDEN", message: "No supply line linked." });
        lineId = ctx.user.distributorId;
      } else {
        if (!input.distributorId) throw new TRPCError({ code: "BAD_REQUEST", message: "Admin must specify distributorId." });
        lineId = input.distributorId;
      }

      // Get all SKUs for this line keyed by distributorSku
      const allSkus = await db.select({
        id: distributorSkus.id,
        distributorSku: distributorSkus.distributorSku,
      }).from(distributorSkus).where(eq(distributorSkus.distributorId, lineId));

      const skuMap = new Map(allSkus.map(s => [s.distributorSku, s.id]));

      let updated = 0;
      let notFound = 0;
      const errors: string[] = [];

      for (const row of input.rows) {
        const skuId = skuMap.get(row.distributorSku);
        if (!skuId) {
          notFound++;
          errors.push(`SKU not found: ${row.distributorSku}`);
          continue;
        }

        const setFields: Record<string, unknown> = {};
        if (row.listPrice !== undefined) setFields.listPrice = row.listPrice || null;
        if (row.wholesalePrice !== undefined) setFields.wholesalePrice = row.wholesalePrice || null;
        if (row.contractorPrice !== undefined) setFields.contractorPrice = row.contractorPrice || null;
        if (row.homeownerPrice !== undefined) setFields.homeownerPrice = row.homeownerPrice || null;
        if (row.isAvailable !== undefined) setFields.isAvailable = row.isAvailable;

        if (Object.keys(setFields).length > 0) {
          await db.update(distributorSkus).set(setFields as any).where(eq(distributorSkus.id, skuId));
          updated++;
        }
      }

      if (updated > 0) invalidatePublicCatalogCache();
      return { updated, notFound, total: input.rows.length, errors: errors.slice(0, 20) };
    }),
});
