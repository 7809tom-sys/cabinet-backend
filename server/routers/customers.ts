import { z } from "zod";
import { and, eq, or, like, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { PRICING_TIERS } from "@shared/pricingTier";

const tierEnum = z.enum(["homeowner", "contractor", "wholesale"]);

/**
 * Customers admin router.
 *
 * The owner watches who is on the site (via the live-chat ping), then logs into
 * the admin and assigns each customer a pricing tier here. The assigned tier
 * controls which price column that user sees + checks out at everywhere.
 *
 * All procedures are admin-only.
 */
export const customersRouter = router({
  // Paginated list of customer accounts with their assigned tier + contact info.
  list: adminProcedure
    .input(
      z
        .object({
          search: z.string().trim().max(200).optional(),
          tier: tierEnum.optional(),
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(100).default(25),
        })
        .default({ page: 1, pageSize: 25 }),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rows: [], total: 0, page: 1, pageSize: 25, counts: {} };

      const conds = [] as any[];
      if (input.tier) conds.push(eq(users.pricingTier, input.tier));
      if (input.search) {
        const q = `%${input.search}%`;
        conds.push(
          or(
            like(users.name, q),
            like(users.email, q),
            like(users.companyName, q),
          ),
        );
      }
      const where = conds.length ? and(...conds) : undefined;

      const [{ total }] = await db
        .select({ total: sql<number>`count(*)` })
        .from(users)
        .where(where);

      const rows = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          companyName: users.companyName,
          role: users.role,
          pricingTier: users.pricingTier,
          createdAt: users.createdAt,
          lastSignedIn: users.lastSignedIn,
        })
        .from(users)
        .where(where)
        .orderBy(desc(users.lastSignedIn))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      // Tier counts across the whole table (not just the current page/filter).
      const tierRows = await db
        .select({ tier: users.pricingTier, n: sql<number>`count(*)` })
        .from(users)
        .groupBy(users.pricingTier);
      const counts: Record<string, number> = {};
      for (const t of PRICING_TIERS) counts[t] = 0;
      for (const r of tierRows) counts[r.tier as string] = Number(r.n);

      return {
        rows,
        total: Number(total),
        page: input.page,
        pageSize: input.pageSize,
        counts,
      };
    }),

  // Assign / change a customer's pricing tier.
  setTier: adminProcedure
    .input(z.object({ userId: z.number().int(), tier: tierEnum }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [target] = await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      await db
        .update(users)
        .set({ pricingTier: input.tier })
        .where(eq(users.id, input.userId));

      return { ok: true, userId: input.userId, tier: input.tier };
    }),

  // Grant / revoke the CRM-only "designer" role. Designers are internal sales
  // staff who can log into the admin backend but ONLY see the Sales CRM. The
  // owner never demotes an existing admin through here (guarded below).
  setRole: adminProcedure
    .input(z.object({ userId: z.number().int(), role: z.enum(["user", "designer"]) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [target] = await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      // Never repurpose an admin/distributor/partner account from this control.
      if (target.role !== "user" && target.role !== "designer") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot change role for a ${target.role} account here.`,
        });
      }

      await db
        .update(users)
        .set({ role: input.role })
        .where(eq(users.id, input.userId));

      return { ok: true, userId: input.userId, role: input.role };
    }),
});
