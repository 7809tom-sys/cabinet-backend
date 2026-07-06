import { z } from "zod";
import { asc, eq, sql } from "drizzle-orm";
import { router, adminProcedure, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { vendorLines, orders, orderItems } from "../../drizzle/schema";
import { pelicanProducts } from "../../drizzle/pelicanSchema";

// Approved Vendors scorecard.
//
// Each row in vendor_lines represents one approved supply line (e.g. "Pelican
// Surfaces & Fixtures"). totalSalesCents is a stored, admin-recomputable figure.
// "Recompute" sums matching, non-cancelled order lines and writes the total back.
//
// Sales attribution:
//  - sourceKey "pelican": order lines whose platformSku matches a known
//    pelican_products.pelicanCode. (Zero until Pelican items are ordered — no
//    fabricated sales.)
//  - sourceKey "dist:<id>": orders whose distributorId = <id>.
//  - Any other/empty sourceKey: not auto-computed; admin can set manually.

export const vendorsRouter = router({
  list: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [] as (typeof vendorLines.$inferSelect)[];
    return db.select().from(vendorLines).orderBy(asc(vendorLines.name));
  }),

  upsert: adminProcedure
    .input(
      z.object({
        id: z.number().optional(),
        name: z.string().min(1).max(191),
        sourceKey: z.string().max(64).nullable().optional(),
        category: z.string().max(128).optional(),
        contactName: z.string().max(191).optional(),
        contactEmail: z.string().max(255).optional(),
        contactPhone: z.string().max(64).optional(),
        isApproved: z.boolean().optional(),
        totalSalesCents: z.number().int().min(0).optional(),
        notes: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false } as const;
      const { id, ...rest } = input;
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      if (id) {
        await db.update(vendorLines).set(patch).where(eq(vendorLines.id, id));
        return { success: true, id } as const;
      }
      const res = await db.insert(vendorLines).values({ name: input.name, ...patch });
      const insertId = (res as unknown as [{ insertId: number }])[0]?.insertId ?? 0;
      return { success: true, id: Number(insertId) } as const;
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
      const crypto = await import("crypto");
      const token = crypto.randomBytes(24).toString("hex"); // 48-char hex token
      await db
        .update(vendorLines)
        .set({ inviteToken: token, inviteCreatedAt: new Date() })
        .where(eq(vendorLines.id, input.id));
      return { success: true, token } as const;
    }),

  // Look up a vendor line by invite token (public — used by the registration page)
  getByInvite: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [line] = await db
        .select()
        .from(vendorLines)
        .where(eq(vendorLines.inviteToken, input.token))
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
      } else if (key.startsWith("dist:")) {
        const distId = Number(key.slice(5));
        if (Number.isFinite(distId)) {
          const [row] = await db
            .select({ total: sql<number>`coalesce(sum(${orders.total}), 0)` })
            .from(orders)
            .where(sql`${orders.distributorId} = ${distId} and ${orders.status} <> 'cancelled'`);
          totalDollars = Number(row?.total ?? 0);
        }
      } else {
        // No automatic attribution rule — leave the stored figure untouched.
        return { success: true, totalSalesCents: line.totalSalesCents, autoComputed: false } as const;
      }

      const totalSalesCents = Math.round(totalDollars * 100);
      await db
        .update(vendorLines)
        .set({ totalSalesCents, salesUpdatedAt: new Date() })
        .where(eq(vendorLines.id, input.id));
      return { success: true, totalSalesCents, autoComputed: true } as const;
    }),
});
