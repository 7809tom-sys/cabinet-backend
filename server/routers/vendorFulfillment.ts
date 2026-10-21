import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, supplierProfileProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  assertVendorScope,
  listVendorScopes,
  loadVendorQueue,
  recordLabelPrinted,
  recordShipment,
} from "../lib/vendorFulfillmentStore";

const scopeInput = z.string().trim().min(1).max(32);

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return db;
}

/**
 * Vendor order fulfillment queue. Every procedure first resolves the caller's
 * allowed vendor scopes from their account (admins may act on any vendor) and
 * rejects a scope that is not theirs, so one vendor can never read or ship
 * another vendor's items.
 */
export const vendorFulfillmentRouter = router({
  /** The vendors this account can fulfill for (admins pass the vendor they are viewing as). */
  scopes: supplierProfileProcedure
    .input(z.object({
      approvedVendorLineId: z.number().int().positive().optional(),
      distributorId: z.number().int().positive().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      return listVendorScopes(db, ctx.user, input ?? {});
    }),

  /** Paid orders containing this vendor's items: ready to ship, upcoming, and shipped. */
  queue: supplierProfileProcedure
    .input(z.object({ scope: scopeInput }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const scope = await assertVendorScope(db, ctx.user, input.scope);
      return loadVendorQueue(db, scope);
    }),

  /** Remember that a ship-to label was printed for this vendor's part of an order. */
  markLabelPrinted: supplierProfileProcedure
    .input(z.object({ scope: scopeInput, orderId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const scope = await assertVendorScope(db, ctx.user, input.scope);
      await recordLabelPrinted(db, scope, input.orderId);
      return { orderId: input.orderId };
    }),

  /** Record carrier + tracking and mark this vendor's part of the order shipped. */
  markShipped: supplierProfileProcedure
    .input(z.object({
      scope: scopeInput,
      orderId: z.number().int().positive(),
      carrier: z.string().trim().max(64),
      trackingNumber: z.string().trim().max(128).optional().nullable(),
      packageCount: z.number().int().min(1).max(99).default(1),
      notes: z.string().trim().max(1000).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const scope = await assertVendorScope(db, ctx.user, input.scope);
      const result = await recordShipment(db, {
        scope,
        orderId: input.orderId,
        userId: ctx.user.id,
        carrier: input.carrier,
        trackingNumber: input.trackingNumber,
        packageCount: input.packageCount,
        notes: input.notes,
      });
      return { orderId: input.orderId, firstShip: result.firstShip };
    }),
});
