/**
 * Customer-facing shipment tracking (Tom, Nov 19 2026, PR 4 part 2b).
 *
 * order_tracking is what the customer sees on /invoice: one row per pallet or freight
 * load, entered here by staff. It is deliberately NOT order_shipments, which is vendor
 * fulfilment keyed by orderRequestId - conflating the two is how a supplier's inbound
 * PRO number ends up on a customer's invoice.
 */
import { sql } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";

export const TRACKING_STATUSES = ["pending", "in_transit", "delivered", "exception"] as const;

const trackingFields = z.object({
  carrier: z.string().trim().max(64).optional(),
  trackingNumber: z.string().trim().max(128).optional(),
  status: z.enum(TRACKING_STATUSES).optional(),
  trackingUrl: z.string().trim().max(1024).optional(),
  estimatedDeliveryAt: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(1000).optional(),
});

/** A carrier link has to be a real http(s) URL, or the invoice renders a dead link. */
export function cleanTrackingUrl(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) return null;
  return raw.slice(0, 1024);
}

/** Timestamps arrive as text from a date input; anything unparseable becomes null. */
export function cleanTimestamp(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function rows(result: unknown): Array<Record<string, unknown>> {
  const inner = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  return Array.isArray(inner) ? inner.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object") : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function iso(value: unknown): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export const adminTrackingRouter = router({
  list: adminProcedure
    .input(z.object({ orderId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = ctx.db as { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };
      const result = rows(await db.execute(sql`
        SELECT id, carrier, trackingNumber, status, trackingUrl, estimatedDeliveryAt, notes
        FROM order_tracking WHERE orderId = ${input.orderId} ORDER BY createdAt
      `));
      return {
        shipments: result.map((row) => ({
          id: Number(row.id),
          carrier: text(row.carrier),
          trackingNumber: text(row.trackingNumber),
          status: text(row.status) ?? "pending",
          trackingUrl: text(row.trackingUrl),
          estimatedDeliveryAt: iso(row.estimatedDeliveryAt),
          notes: text(row.notes),
        })),
      };
    }),

  create: adminProcedure
    .input(trackingFields.extend({ orderId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };
      if (!input.carrier && !input.trackingNumber) {
        return { ok: false as const, message: "Add a carrier or a tracking number." };
      }
      await db.execute(sql`
        INSERT INTO order_tracking
          (orderId, carrier, trackingNumber, status, trackingUrl, estimatedDeliveryAt, notes)
        VALUES (
          ${input.orderId},
          ${input.carrier ?? null},
          ${input.trackingNumber ?? null},
          ${input.status ?? "pending"},
          ${cleanTrackingUrl(input.trackingUrl)},
          ${cleanTimestamp(input.estimatedDeliveryAt)},
          ${input.notes ?? null}
        )
      `);
      return { ok: true as const };
    }),

  update: adminProcedure
    .input(trackingFields.extend({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };
      const existing = rows(await db.execute(sql`SELECT id FROM order_tracking WHERE id = ${input.id} LIMIT 1`))[0];
      if (!existing) return { ok: false as const, message: "That shipment no longer exists." };
      // Only the fields that were sent are changed, so clearing a carrier does not wipe
      // an ETA someone set in a different tab.
      if (input.carrier !== undefined) {
        await db.execute(sql`UPDATE order_tracking SET carrier = ${input.carrier || null} WHERE id = ${input.id}`);
      }
      if (input.trackingNumber !== undefined) {
        await db.execute(sql`UPDATE order_tracking SET trackingNumber = ${input.trackingNumber || null} WHERE id = ${input.id}`);
      }
      if (input.status !== undefined) {
        await db.execute(sql`UPDATE order_tracking SET status = ${input.status} WHERE id = ${input.id}`);
      }
      if (input.trackingUrl !== undefined) {
        await db.execute(sql`UPDATE order_tracking SET trackingUrl = ${cleanTrackingUrl(input.trackingUrl)} WHERE id = ${input.id}`);
      }
      if (input.estimatedDeliveryAt !== undefined) {
        await db.execute(sql`UPDATE order_tracking SET estimatedDeliveryAt = ${cleanTimestamp(input.estimatedDeliveryAt)} WHERE id = ${input.id}`);
      }
      if (input.notes !== undefined) {
        await db.execute(sql`UPDATE order_tracking SET notes = ${input.notes || null} WHERE id = ${input.id}`);
      }
      return { ok: true as const };
    }),

  remove: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = ctx.db as { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };
      await db.execute(sql`DELETE FROM order_tracking WHERE id = ${input.id}`);
      return { ok: true as const };
    }),
});