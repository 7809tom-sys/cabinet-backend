import { z } from "zod";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, publicProcedure, supplierProfileProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { catalogImports, distributorSkus, distributors, emailSettings, vendorApplications, vendorLines, vendorProducts, orders, orderItems } from "../../drizzle/schema";
import { pelicanProducts } from "../../drizzle/pelicanSchema";
import { storagePut } from "../storage";
import { approvedVendorLinkedDistributorIds, approvedVendorMatchesDistributor, approvedVendorSourceDistributorId } from "../lib/approvedVendorAccess";
import { buildPendingVendorReview } from "../lib/pendingVendorReview";
import { emailSettingsReady, sendEmailViaSettings } from "../email";
import { buildSupplierPortalInvite } from "../supplierPortalInvite";
import { featuresForVendor, vendorApprovalChoiceError } from "../../shared/vendorFeatures";

// Approved Vendors scorecard.
//
// Each row in vendor_lines represents one approved supplier profile (e.g.
// "US Cabinet Depot"). Profiles may list companion catalog lines without
// merging their SKU, price, availability, or fulfillment identities.
// totalSalesCents is a stored, admin-recomputable figure.
// "Recompute" sums matching, non-cancelled order lines and writes the total back.
//
// Sales attribution:
//  - sourceKey "pelican": order lines whose platformSku matches a known
//    pelican_products.pelicanCode. (Zero until Pelican items are ordered — no
//    fabricated sales.)
//  - sourceKey "dist:<id>" plus linkedDistributorIds: orders whose
//    distributorId is any configured line for that supplier profile.
//  - Any other/empty sourceKey: not auto-computed; admin can set manually.

/**
 * Portal readiness for one approved-vendor record.
 * An approved Pelican catalog (sourceKey "pelican") with a contact email is
 * ready even though Pelican has no cabinet supply line. Other approved
 * records without a linked line stay profile-only.
 */
export function vendorPortalReadiness(
  line: { isApproved: boolean; contactEmail?: string | null; sourceKey?: string | null },
  hasLinkedDistributor: boolean,
): "not-approved" | "email-required" | "profile-only" | "ready" {
  if (!line.isApproved) return "not-approved";
  if (!line.contactEmail?.trim()) return "email-required";
  if (hasLinkedDistributor || line.sourceKey?.trim().toLowerCase() === "pelican") return "ready";
  return "profile-only";
}

export const vendorsRouter = router({
  list: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const [lines, supplierLines] = await Promise.all([
      db.select().from(vendorLines).orderBy(asc(vendorLines.name)),
      db
        .select({ id: distributors.id, code: distributors.code, name: distributors.name, isActive: distributors.isActive })
        .from(distributors),
    ]);

    return lines.map((line) => {
      const distributorId = approvedVendorSourceDistributorId(line.sourceKey, supplierLines);
      const distributor = supplierLines.find((candidate) => candidate.id === distributorId) ?? null;
      const linkedDistributorIds = approvedVendorLinkedDistributorIds(line, supplierLines);
      const linkedDistributors = supplierLines
        .filter((candidate) => linkedDistributorIds.includes(candidate.id))
        .map((candidate) => ({ id: candidate.id, code: candidate.code, name: candidate.name }));
      const portalReadiness = vendorPortalReadiness(line, Boolean(distributor));
      return {
        ...line,
        linkedDistributorIds,
        linkedDistributors,
        portalReadiness,
        linkedDistributor: distributor
          ? { id: distributor.id, code: distributor.code, name: distributor.name }
          : null,
      };
    });
  }),

  upsert: adminProcedure
    .input(
      z.object({
        id: z.number().optional(),
        name: z.string().min(1).max(191),
        sourceKey: z.string().max(64).nullable().optional(),
        linkedDistributorIds: z.array(z.number().int().positive()).max(12).optional(),
        category: z.string().max(128).optional(),
        contactName: z.string().max(191).optional(),
        contactEmail: z.string().max(255).optional(),
        contactPhone: z.string().max(64).optional(),
        isApproved: z.boolean().optional(),
        isCabinetVendor: z.boolean().nullable().optional(),
        totalSalesCents: z.number().int().min(0).optional(),
        notes: z.string().nullable().optional(),
        websiteUrl: z.string().max(512).nullable().optional(),
        catalogPdfUrl: z.string().max(512).nullable().optional(),
        specBookPdfUrl: z.string().max(512).nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const choiceError = vendorApprovalChoiceError({
        isApproved: input.isApproved,
        isCabinetVendor: input.isCabinetVendor,
      });
      if (choiceError) throw new TRPCError({ code: "BAD_REQUEST", message: choiceError });
      const db = await getDb();
      if (!db) return { success: false } as const;
      const { id, ...rest } = input;
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      if (input.linkedDistributorIds !== undefined) {
        const requestedIds = Array.from(new Set(input.linkedDistributorIds));
        if (requestedIds.length > 0) {
          const activeLines = await db
            .select({ id: distributors.id })
            .from(distributors)
            .where(and(inArray(distributors.id, requestedIds), eq(distributors.isActive, true)));
          if (activeLines.length !== requestedIds.length) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Every linked supplier line must be active." });
          }
        }
        patch.linkedDistributorIds = requestedIds;
      }
      if (id) {
        await db.update(vendorLines).set(patch).where(eq(vendorLines.id, id));
        return { success: true, id } as const;
      }
      const res = await db.insert(vendorLines).values({ name: input.name, ...patch });
      const insertId = (res as unknown as [{ insertId: number }])[0]?.insertId ?? 0;
      return { success: true, id: Number(insertId) } as const;
    }),

  /** Store a source catalog or specification book for one approved vendor line. */
  uploadResourcePdf: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        resource: z.enum(["catalog", "specBook"]),
        fileBase64: z.string().min(1).max(16 * 1024 * 1024),
        contentType: z.literal("application/pdf"),
        fileName: z.string().min(1).max(256),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const [vendor] = await db
        .select({ id: vendorLines.id })
        .from(vendorLines)
        .where(eq(vendorLines.id, input.id))
        .limit(1);
      if (!vendor) throw new Error("Vendor line not found");

      const buffer = Buffer.from(input.fileBase64, "base64");
      const maxBytes = 12 * 1024 * 1024;
      if (buffer.length === 0 || buffer.length > maxBytes) {
        throw new Error("PDF files must be between 1 byte and 12 MB.");
      }
      if (buffer.subarray(0, 4).toString("ascii") !== "%PDF") {
        throw new Error("Only a valid PDF catalog or specification book can be uploaded.");
      }

      const safeName = input.fileName
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .replace(/\.pdf$/i, "")
        .slice(0, 96) || input.resource;
      const { url } = await storagePut(
        `vendor-resources/${vendor.id}/${input.resource}-${Date.now()}-${safeName}.pdf`,
        buffer,
        "application/pdf"
      );
      const field = input.resource === "catalog" ? "catalogPdfUrl" : "specBookPdfUrl";
      await db.update(vendorLines).set({ [field]: url }).where(eq(vendorLines.id, vendor.id));
      return { url, resource: input.resource };
    }),

  remove: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false } as const;
      await db.delete(vendorLines).where(eq(vendorLines.id, input.id));
      return { success: true } as const;
    }),

  // Generate a unique invite token for a vendor line. Returns the full invite URL.
  generateInvite: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false, url: "" } as const;
      const [vendor] = await db
        .select({ id: vendorLines.id, name: vendorLines.name, isApproved: vendorLines.isApproved })
        .from(vendorLines)
        .where(eq(vendorLines.id, input.id))
        .limit(1);
      if (!vendor) throw new Error("Approved vendor record not found.");
      if (!vendor.isApproved) throw new Error("Approve this vendor before generating a supplier portal setup link.");
      const crypto = await import("crypto");
      const token = crypto.randomBytes(24).toString("hex"); // 48-char hex token
      await db
        .update(vendorLines)
        .set({ inviteToken: token, inviteCreatedAt: new Date() })
        .where(and(eq(vendorLines.id, input.id), eq(vendorLines.isApproved, true)));
      return { success: true, token } as const;
    }),

  /**
   * Delivers a private, one-time Supplier Portal setup link. The token is only
   * persisted after the saved SMTP service accepts the message, so a failed
   * email attempt never creates an active credential.
   */
  emailPortalInvite: adminProcedure
    .input(z.object({
      id: z.number().int().positive(),
      toEmail: z.string().trim().email().max(320),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [vendor] = await db
        .select({
          id: vendorLines.id,
          name: vendorLines.name,
          contactName: vendorLines.contactName,
          contactEmail: vendorLines.contactEmail,
          isApproved: vendorLines.isApproved,
        })
        .from(vendorLines)
        .where(eq(vendorLines.id, input.id))
        .limit(1);
      if (!vendor) throw new TRPCError({ code: "NOT_FOUND", message: "Approved vendor record not found." });
      if (!vendor.isApproved) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Approve this vendor before sending a Supplier Portal invitation." });
      }

      const [settings] = await db.select().from(emailSettings).limit(1);
      if (!emailSettingsReady(settings)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Email sending is not configured. Enable SMTP in Admin → Email Settings before sending a Supplier Portal invitation.",
        });
      }

      const token = (await import("crypto")).randomBytes(24).toString("hex");
      const origin = ctx.req.headers.origin ?? `${ctx.req.protocol}://${ctx.req.get("host")}`;
      const invite = buildSupplierPortalInvite({
        vendorName: vendor.name,
        recipientName: vendor.contactName,
        recipientEmail: input.toEmail,
        inviteToken: token,
        origin,
      });
      const delivery = await sendEmailViaSettings(settings, {
        to: input.toEmail,
        subject: invite.subject,
        text: invite.text,
        html: invite.html,
      });
      if (!delivery.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "The Supplier Portal invitation could not be sent. Verify SMTP in Admin → Email Settings and try again.",
        });
      }

      await db
        .update(vendorLines)
        .set({
          inviteToken: token,
          inviteCreatedAt: new Date(),
          ...(vendor.contactEmail?.trim() ? {} : { contactEmail: input.toEmail }),
        })
        .where(and(eq(vendorLines.id, vendor.id), eq(vendorLines.isApproved, true)));

      return { success: true, sentTo: input.toEmail, setupUrl: invite.setupUrl } as const;
    }),

  // Look up a vendor line by invite token (public — used by the registration page)
  getByInvite: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [line] = await db
        .select({ id: vendorLines.id, name: vendorLines.name })
        .from(vendorLines)
        .where(and(eq(vendorLines.inviteToken, input.token), eq(vendorLines.isApproved, true)))
        .limit(1);
      return line ?? null;
    }),

  // Recompute lifetime dollar sales for one vendor line from real order data and
  // persist the result. Returns the computed figure in cents.
  recomputeSales: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false, totalSalesCents: 0 } as const;
      const [line] = await db.select().from(vendorLines).where(eq(vendorLines.id, input.id)).limit(1);
      if (!line) return { success: false, totalSalesCents: 0 } as const;

      let totalDollars = 0;
      const key = line.sourceKey ?? "";

      if (key === "pelican") {
        // Sum non-cancelled order lines whose platformSku matches a Pelican code.
        const [row] = await db
          .select({
            total: sql<number>`coalesce(sum(${orderItems.lineTotal}), 0)`,
          })
          .from(orderItems)
          .innerJoin(orders, eq(orderItems.orderId, orders.id))
          .innerJoin(pelicanProducts, eq(orderItems.platformSku, pelicanProducts.pelicanCode))
          .where(sql`${orders.status} <> 'cancelled'`);
        totalDollars = Number(row?.total ?? 0);
      } else {
        const supplierLines = await db
          .select({ id: distributors.id, code: distributors.code, isActive: distributors.isActive })
          .from(distributors);
        const linkedIds = approvedVendorLinkedDistributorIds(line, supplierLines);
        if (linkedIds.length > 0) {
          const [row] = await db
            .select({ total: sql<number>`coalesce(sum(${orders.total}), 0)` })
            .from(orders)
            .where(and(inArray(orders.distributorId, linkedIds), sql`${orders.status} <> 'cancelled'`));
          totalDollars = Number(row?.total ?? 0);
        } else {
          // No automatic attribution rule — leave the stored figure untouched.
          return { success: true, totalSalesCents: line.totalSalesCents, autoComputed: false } as const;
        }
      }

      const totalSalesCents = Math.round(totalDollars * 100);
      await db
        .update(vendorLines)
        .set({ totalSalesCents, salesUpdatedAt: new Date() })
        .where(eq(vendorLines.id, input.id));
      return { success: true, totalSalesCents, autoComputed: true } as const;
    }),

  /**
   * The signed-in supplier's cabinet choice, or the vendor an administrator is
   * previewing. The portal uses this for its menu. Administrators can open any
   * vendor; the returned flag is still that vendor's flag.
   */
  portalFeatures: supplierProfileProcedure
    .input(z.object({ approvedVendorLineId: z.number().int().positive().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;
      const requestedId = ctx.isAdmin ? input?.approvedVendorLineId ?? null : ctx.approvedVendorLineId ?? null;
      const vendorColumns = {
        id: vendorLines.id,
        name: vendorLines.name,
        sourceKey: vendorLines.sourceKey,
        linkedDistributorIds: vendorLines.linkedDistributorIds,
        contactEmail: vendorLines.contactEmail,
        isApproved: vendorLines.isApproved,
        isCabinetVendor: vendorLines.isCabinetVendor,
      };
      let vendor: {
        id: number;
        name: string;
        sourceKey: string | null;
        isApproved: boolean;
        isCabinetVendor: boolean | null;
      } | null = null;
      if (requestedId != null) {
        const [row] = await db.select(vendorColumns).from(vendorLines).where(eq(vendorLines.id, requestedId)).limit(1);
        vendor = row ?? null;
      } else if (!ctx.isAdmin && ctx.distributorId != null) {
        const [line] = await db
          .select({ id: distributors.id, code: distributors.code, isActive: distributors.isActive })
          .from(distributors)
          .where(eq(distributors.id, ctx.distributorId))
          .limit(1);
        if (line) {
          const rows = await db.select(vendorColumns).from(vendorLines);
          vendor = rows.find((candidate) => candidate.isApproved && approvedVendorMatchesDistributor(candidate, line)) ?? null;
        }
      }
      if (!vendor) return null;
      return {
        id: vendor.id,
        name: vendor.name,
        sourceKey: vendor.sourceKey,
        isApproved: vendor.isApproved,
        isCabinetVendor: vendor.isCabinetVendor,
        features: featuresForVendor(vendor),
      };
    }),

  /** Vendors that still need an administrator. This never approves anyone. */
  pendingReview: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { count: 0, items: [] as const };
    const [vendorRows, supplierLines, applications, imports, skus, products, pelicanSample] = await Promise.all([
      db.select({
        id: vendorLines.id,
        name: vendorLines.name,
        sourceKey: vendorLines.sourceKey,
        linkedDistributorIds: vendorLines.linkedDistributorIds,
        contactEmail: vendorLines.contactEmail,
        isApproved: vendorLines.isApproved,
        isCabinetVendor: vendorLines.isCabinetVendor,
      }).from(vendorLines),
      db.select({
        id: distributors.id,
        code: distributors.code,
        name: distributors.name,
        isActive: distributors.isActive,
      }).from(distributors),
      db.select({
        id: vendorApplications.id,
        companyName: vendorApplications.companyName,
        contactName: vendorApplications.contactName,
        email: vendorApplications.email,
        phone: vendorApplications.phone,
        website: vendorApplications.website,
        categories: vendorApplications.categories,
        status: vendorApplications.status,
      }).from(vendorApplications).where(eq(vendorApplications.status, "pending")),
      db.selectDistinct({ distributorId: catalogImports.distributorId }).from(catalogImports),
      db.selectDistinct({ distributorId: distributorSkus.distributorId }).from(distributorSkus),
      db.selectDistinct({ distributorId: vendorProducts.distributorId }).from(vendorProducts),
      db.select({ id: pelicanProducts.id }).from(pelicanProducts).limit(1),
    ]);
    const referencedDistributorIds = [...imports, ...skus, ...products]
      .map((row) => row.distributorId)
      .filter((id): id is number => typeof id === "number");
    return buildPendingVendorReview({
      vendors: vendorRows,
      distributors: supplierLines,
      applications,
      referencedDistributorIds,
      pelicanProductCount: pelicanSample.length,
    });
  }),
});
