import { z } from "zod";
import { and, eq, or, like, desc, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { users, carts, cartItems, kitchenDesigns } from "../../drizzle/schema";
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

  // Assign one of the owner-manageable roles to a user account:
  //   - user      → regular member (default)
  //   - designer  → internal sales staff; admin backend but only the Sales CRM
  //   - partner   → affiliate account (links to an affiliates record via userId)
  //   - admin     → full platform administrator
  //
  // Guardrails: you cannot change your own role here, you cannot demote the
  // last remaining admin, and you cannot repurpose specialized accounts
  // (distributor / dealer / sales_rep) from this control.
  setRole: adminProcedure
    .input(
      z.object({
        userId: z.number().int(),
        role: z.enum(["user", "designer", "partner", "admin"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
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

      // You can't change your own role (prevents accidental self-lockout).
      if (ctx.user.id === input.userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You can't change your own role.",
        });
      }

      // Only user/designer/partner/admin accounts are manageable here. Specialized
      // accounts (distributor/dealer/sales_rep) are provisioned elsewhere.
      const manageable = ["user", "designer", "partner", "admin"];
      if (!manageable.includes(target.role)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot change role for a ${target.role} account here.`,
        });
      }

      // No-op if unchanged.
      if (target.role === input.role) {
        return { ok: true, userId: input.userId, role: input.role };
      }

      // Never strip the last admin (avoid locking everyone out of the backend).
      if (target.role === "admin" && input.role !== "admin") {
        const [{ cnt }] = await db
          .select({ cnt: sql<number>`count(*)` })
          .from(users)
          .where(eq(users.role, "admin"));
        if (Number(cnt) <= 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This is the only admin. Promote someone else to admin first.",
          });
        }
      }

      await db
        .update(users)
        .set({ role: input.role })
        .where(eq(users.id, input.userId));

      return { ok: true, userId: input.userId, role: input.role };
    }),

  // Permanently delete a member account and all their associated data.
  // Guardrails: cannot delete your own account, cannot delete the last admin.
  delete: adminProcedure
    .input(z.object({ userId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
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

      // Cannot delete your own account.
      if (ctx.user.id === input.userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "You cannot delete your own account.",
        });
      }

      // Never delete the last admin.
      if (target.role === "admin") {
        const [{ cnt }] = await db
          .select({ cnt: sql<number>`count(*)` })
          .from(users)
          .where(eq(users.role, "admin"));
        if (Number(cnt) <= 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This is the only admin account. Promote another user to admin first.",
          });
        }
      }

      // Delete cart items → carts → saved designs → user (cascade-safe order).
      const userCarts = await db
        .select({ id: carts.id })
        .from(carts)
        .where(eq(carts.userId, input.userId));
      if (userCarts.length > 0) {
        const cartIds = userCarts.map(c => c.id);
        await db.delete(cartItems).where(inArray(cartItems.cartId, cartIds));
        await db.delete(carts).where(eq(carts.userId, input.userId));
      }

      await db.delete(users).where(eq(users.id, input.userId));

      return { ok: true, userId: input.userId };
    }),

  // Purge all non-admin test members.
  // Deletes every user whose role is NOT 'admin', along with their carts,
  // cart items, and saved kitchen designs. Admin accounts are always preserved.
  // Processes in batches of 500 to stay within SQL IN() clause limits.
  purgeTestMembers: adminProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const BATCH = 500;
    let totalDeleted = 0;

    // Helper to chunk an array into slices of size n.
    function chunk<T>(arr: T[], n: number): T[][] {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
      return out;
    }

    // Loop until no non-admin users remain.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const targets = await db
        .select({ id: users.id })
        .from(users)
        .where(sql`${users.role} != 'admin'`)
        .limit(BATCH);

      if (targets.length === 0) break;

      const ids = targets.map((u) => u.id);

      // Delete cart items → carts for this batch.
      const userCarts = await db
        .select({ id: carts.id })
        .from(carts)
        .where(inArray(carts.userId, ids));
      if (userCarts.length > 0) {
        const cartIds = userCarts.map((c) => c.id);
        for (const cartChunk of chunk(cartIds, BATCH)) {
          await db.delete(cartItems).where(inArray(cartItems.cartId, cartChunk));
        }
        for (const idChunk of chunk(ids, BATCH)) {
          await db.delete(carts).where(inArray(carts.userId, idChunk));
        }
      }

      // Delete kitchen designs for this batch.
      for (const idChunk of chunk(ids, BATCH)) {
        await db.delete(kitchenDesigns).where(inArray(kitchenDesigns.userId, idChunk));
      }

      // Delete the users themselves.
      for (const idChunk of chunk(ids, BATCH)) {
        await db.delete(users).where(inArray(users.id, idChunk));
      }

      totalDeleted += ids.length;
    }

    return { deleted: totalDeleted };
  }),

  // Self-serve: a front-door member classifies themselves as a contractor so they
  // get their own CRM-only admin screen (deals they own). Only a plain "user"
  // may self-upgrade; specialized/staff accounts are left untouched so this can
  // never strip an admin/distributor/partner of their existing access.
  becomeContractor: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const [me] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);
    if (!me) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found" });

    // Already a contractor → idempotent success.
    if (me.role === "contractor") return { ok: true, role: "contractor" as const };

    // Only a plain member can self-classify (don't clobber staff/partner roles).
    if (me.role !== "user") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Your account already has a role that includes CRM access.",
      });
    }

    await db.update(users).set({ role: "contractor" }).where(eq(users.id, ctx.user.id));
    return { ok: true, role: "contractor" as const };
  }),
});
