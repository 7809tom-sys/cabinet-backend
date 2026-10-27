import { desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { affiliates, vendorReferrals } from "../../drizzle/schema";
import { notifyOwner } from "../_core/notification";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { resolveAffiliateAccess } from "../lib/affiliateAccess";

const VENDOR_REFERRAL_LIMIT = 10;
const VENDOR_REFERRAL_WINDOW_MS = 60 * 60 * 1000;

const referralHits = new Map<string, number[]>();

/** In-memory window limiter, same shape as the shipping-quote limiter. */
export function allowVendorReferral(key: string, nowMs = Date.now()): boolean {
  const recent = (referralHits.get(key) ?? []).filter((stamp) => nowMs - stamp < VENDOR_REFERRAL_WINDOW_MS);
  if (recent.length >= VENDOR_REFERRAL_LIMIT) {
    referralHits.set(key, recent);
    return false;
  }
  recent.push(nowMs);
  referralHits.set(key, recent);
  return true;
}

export function resetVendorReferralRateLimitForTests(): void {
  referralHits.clear();
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined));

export const vendorReferralSubmitInput = z
  .object({
    vendorName: z.string().trim().min(1, "Vendor name is required.").max(200),
    contactName: optionalText(200),
    email: optionalText(320),
    phone: optionalText(32),
    notes: optionalText(2000),
  })
  .superRefine((value, ctx) => {
    if (value.email) {
      const parsed = z.string().email().safeParse(value.email);
      if (!parsed.success) {
        ctx.addIssue({ code: "custom", message: "Enter a valid email.", path: ["email"] });
      }
    }
    if (!value.email && !value.phone) {
      ctx.addIssue({
        code: "custom",
        message: "Enter an email or a phone number.",
        path: ["email"],
      });
    }
  });

export const vendorReferralStatusInput = z.enum(["new", "contacted", "onboarded", "declined"]);

function requireDb<T>(db: T | null): T {
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return db;
}

function insertIdOf(result: unknown): number {
  const header = (Array.isArray(result) ? result[0] : result) as { insertId?: number } | undefined;
  const id = Number(header?.insertId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Vendor referral was not saved." });
  }
  return id;
}

async function notifyAdminOfVendorReferral(input: {
  id: number;
  affiliateId: number;
  affiliateName: string;
  vendorName: string;
  contactName?: string;
  email?: string;
  phone?: string;
  notes?: string;
}): Promise<void> {
  // notifyOwner delivers to OWNER_EMAIL. Skip when that variable is unset so
  // this path does not fall back to a hardcoded address.
  const recipient = (process.env.OWNER_EMAIL ?? "").trim();
  if (!recipient) {
    console.info("[vendorReferrals] Admin notification skipped: no admin recipient is configured.");
    return;
  }
  const lines = [
    `Referral #${input.id}`,
    `Affiliate: ${input.affiliateName} (#${input.affiliateId})`,
    `Vendor: ${input.vendorName}`,
    `Contact: ${input.contactName || "—"}`,
    `Email: ${input.email || "—"}`,
    `Phone: ${input.phone || "—"}`,
    input.notes ? `Notes: ${input.notes}` : null,
    "Review it in Admin → Vendor Referrals.",
  ].filter((line): line is string => Boolean(line));
  try {
    const delivered = await notifyOwner({
      title: `Vendor referral: ${input.vendorName}`,
      content: lines.join("\n"),
    });
    if (!delivered) {
      console.info("[vendorReferrals] Admin notification was not sent.");
    }
  } catch (error) {
    console.warn("[vendorReferrals] Admin notification failed:", error);
  }
}

export const vendorReferralsRouter = router({
  submit: protectedProcedure.input(vendorReferralSubmitInput).mutation(async ({ ctx, input }) => {
    const db = requireDb(await getDb());
    const access = await resolveAffiliateAccess(db, ctx.user);
    if (!access) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Affiliate access required" });
    }
    if (!allowVendorReferral(`affiliate:${access.affiliateId}`)) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Too many vendor referrals. Wait an hour and try again.",
      });
    }

    const [affiliate] = await db
      .select({ storeName: affiliates.storeName })
      .from(affiliates)
      .where(eq(affiliates.id, access.affiliateId))
      .limit(1);

    const result = await db.insert(vendorReferrals).values({
      affiliateId: access.affiliateId,
      submittedByUserId: ctx.user.id,
      vendorName: input.vendorName,
      contactName: input.contactName ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      notes: input.notes ?? null,
    });
    const id = insertIdOf(result);

    await notifyAdminOfVendorReferral({
      id,
      affiliateId: access.affiliateId,
      affiliateName: affiliate?.storeName || `Affiliate ${access.affiliateId}`,
      vendorName: input.vendorName,
      contactName: input.contactName,
      email: input.email,
      phone: input.phone,
      notes: input.notes,
    });

    return { id };
  }),

  adminList: adminProcedure.query(async () => {
    const db = requireDb(await getDb());
    const rows = await db
      .select({
        id: vendorReferrals.id,
        affiliateId: vendorReferrals.affiliateId,
        affiliateName: affiliates.storeName,
        vendorName: vendorReferrals.vendorName,
        contactName: vendorReferrals.contactName,
        email: vendorReferrals.email,
        phone: vendorReferrals.phone,
        notes: vendorReferrals.notes,
        status: vendorReferrals.status,
        createdAt: vendorReferrals.createdAt,
      })
      .from(vendorReferrals)
      .leftJoin(affiliates, eq(affiliates.id, vendorReferrals.affiliateId))
      .orderBy(desc(vendorReferrals.createdAt));
    return rows.map((row) => ({
      ...row,
      affiliateName: row.affiliateName ?? "",
    }));
  }),

  adminUpdateStatus: adminProcedure
    .input(z.object({ id: z.number().int().positive(), status: vendorReferralStatusInput }))
    .mutation(async ({ input }) => {
      const db = requireDb(await getDb());
      const existing = await db
        .select({ id: vendorReferrals.id })
        .from(vendorReferrals)
        .where(eq(vendorReferrals.id, input.id))
        .limit(1);
      if (!existing[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Vendor referral not found." });
      }
      await db.update(vendorReferrals).set({ status: input.status }).where(eq(vendorReferrals.id, input.id));
      return { id: input.id, status: input.status };
    }),
});
