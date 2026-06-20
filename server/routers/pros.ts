import { z } from "zod";
import { eq, desc, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { proApplications } from "../../drizzle/schema";
import { notifyOwner } from "../_core/notification";

// Supported trades and materials kept in one place so the frontend and backend
// share the same vocabulary.
export const PRO_TRADES = ["installation", "countertop_fabrication"] as const;
export const PRO_MATERIALS = [
  "Quartz",
  "Granite",
  "Marble",
  "Quartzite",
  "Laminate",
  "Butcher Block",
  "Solid Surface",
] as const;

const tradeEnum = z.enum(PRO_TRADES);

export const prosRouter = router({
  // ─── Public signup ─────────────────────────────────────────────────────────
  submitApplication: publicProcedure
    .input(
      z.object({
        companyName: z.string().min(1).max(256),
        contactName: z.string().min(1).max(256),
        email: z.string().email().max(320),
        phone: z.string().max(32).optional(),
        website: z.string().max(512).optional(),
        trades: z.array(tradeEnum).min(1, "Select at least one trade"),
        materials: z.array(z.string().max(64)).optional(),
        serviceZips: z.array(z.string().max(16)).optional(),
        baseZip: z.string().max(16).optional(),
        serviceRadiusMiles: z.number().int().min(0).max(500).optional(),
        licenseNumber: z.string().max(128).optional(),
        insured: z.boolean().default(false),
        yearsInBusiness: z.number().int().min(0).max(200).optional(),
        leadTimeDays: z.number().int().min(0).max(365).optional(),
        notes: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });

      // Normalize ZIPs to 5-digit tokens where possible.
      const cleanZips = (input.serviceZips ?? [])
        .map((z) => z.trim())
        .filter(Boolean);

      const result = await db.insert(proApplications).values({
        companyName: input.companyName,
        contactName: input.contactName,
        email: input.email,
        phone: input.phone ?? null,
        website: input.website ?? null,
        trades: input.trades,
        materials: input.materials ?? null,
        serviceZips: cleanZips.length ? cleanZips : null,
        baseZip: input.baseZip ?? null,
        serviceRadiusMiles: input.serviceRadiusMiles ?? 50,
        licenseNumber: input.licenseNumber ?? null,
        insured: input.insured,
        yearsInBusiness: input.yearsInBusiness ?? null,
        leadTimeDays: input.leadTimeDays ?? null,
        notes: input.notes ?? null,
      });
      const insertId = (result as unknown as [{ insertId: number }])[0].insertId;

      // Owner email notifications are intentionally DISABLED per owner request
      // (was flooding the owner inbox). Applications are still saved to
      // pro_applications and reviewable in the Admin area. To re-enable,
      // restore the notifyOwner(...) call here.
      void notifyOwner; // referenced to avoid unused-import error

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
        .from(proApplications)
        .orderBy(desc(proApplications.createdAt));
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
        .update(proApplications)
        .set({
          status: input.status,
          reviewNotes: input.reviewNotes ?? null,
          reviewedBy: ctx.user.id,
          reviewedAt: new Date(),
        })
        .where(eq(proApplications.id, input.id));
      return { id: input.id, status: input.status };
    }),

  // ─── Lead matching by service area ─────────────────────────────────────────
  // Returns approved pros that cover the given ZIP for the requested trade.
  // A pro "covers" a ZIP if it appears in their explicit serviceZips list, or
  // (fallback) if they share the same 3-digit ZIP prefix as their base ZIP —
  // a coarse proximity heuristic until real geocoding is wired in.
  matchByArea: protectedProcedure
    .input(
      z.object({
        zip: z.string().min(3).max(16),
        trade: tradeEnum.optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];
      const approved = await db
        .select()
        .from(proApplications)
        .where(eq(proApplications.status, "approved"));
      return approved.filter((p) =>
        proCoversZip(
          { serviceZips: p.serviceZips, baseZip: p.baseZip, trades: p.trades },
          input.zip,
          input.trade
        )
      );
    }),
});

// Exported pure helper so it can be unit-tested without a database.
export function proCoversZip(
  pro: { serviceZips: string[] | null; baseZip: string | null; trades: string[] },
  zip: string,
  trade?: string
): boolean {
  if (trade && !pro.trades.includes(trade)) return false;
  const target = zip.trim();
  if (pro.serviceZips && pro.serviceZips.includes(target)) return true;
  // Coarse proximity: same 3-digit ZIP prefix as the pro's base ZIP.
  if (pro.baseZip && pro.baseZip.slice(0, 3) === target.slice(0, 3)) return true;
  return false;
}
