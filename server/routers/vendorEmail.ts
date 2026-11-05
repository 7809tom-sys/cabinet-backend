// Vendor mail admin surface.
//
// list      — the internal inbox, newest first, with vendor names
// get       — one message plus its forward history
// forward   — the ONLY way a message leaves the platform, admin only
// addresses — read and edit the four addresses per vendor
// routes    — read and edit which internal inbox owns each purpose
//
// Nothing here sends on arrival. `forward` requires an admin, an explicit
// destination, and records every attempt.

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../db";
import { adminProcedure, crmStaffProcedure, router } from "../_core/trpc";
import { VENDOR_EMAIL_PURPOSES } from "@shared/vendorEmailPurpose";
import { isMissingSchemaError } from "../lib/orderSchemaGuard";
import {
  VENDOR_MAIL_SCHEMA_MESSAGE,
  countUnassignedVendorEmails,
  forwardVendorInboundEmail,
  getVendorInboundEmail,
  listVendorInboundEmails,
  loadRoutes,
  loadVendorEmailDirectory,
  saveVendorEmailAddresses,
  saveVendorEmailRoute,
} from "../lib/vendorEmailMailbox";

const purpose = z.enum(VENDOR_EMAIL_PURPOSES);

const addressInput = z.object({
  claims: z.string().max(320).optional(),
  support: z.string().max(320).optional(),
  sales: z.string().max(320).optional(),
  sales_communication: z.string().max(320).optional(),
});

/** Any missing-table error becomes one clear "run the SQL" message. */
function schemaGuard<T>(run: () => Promise<T>): Promise<T> {
  return run().catch((error: unknown) => {
    if (isMissingSchemaError(error)) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: VENDOR_MAIL_SCHEMA_MESSAGE });
    }
    throw error;
  });
}

export const vendorEmailRouter = router({
  /** Every vendor with its four addresses, plus the per-purpose routing. */
  directory: crmStaffProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { vendors: [], routes: {}, unassignedCount: 0 };
    return schemaGuard(async () => ({
      vendors: await loadVendorEmailDirectory(db),
      routes: await loadRoutes(db),
      unassignedCount: await countUnassignedVendorEmails(db),
    }));
  }),

  /** Saves any subset of the four addresses for one vendor. */
  saveAddresses: adminProcedure
    .input(z.object({ distributorId: z.number().int().positive(), addresses: addressInput }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      return schemaGuard(async () => {
        const saved = await saveVendorEmailAddresses(db, input.distributorId, input.addresses);
        if (!saved.ok) throw new TRPCError({ code: "BAD_REQUEST", message: saved.message });
        return saved;
      });
    }),

  /** Which internal inbox owns each purpose. Blank clears the route. */
  saveRoute: adminProcedure
    .input(z.object({
      purpose,
      recipientEmail: z.string().max(320).nullable().optional(),
      recipientName: z.string().max(128).nullable().optional(),
      assigneeUserId: z.number().int().positive().nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      return schemaGuard(async () => {
        const saved = await saveVendorEmailRoute(db, input.purpose, input);
        if (!saved.ok) throw new TRPCError({ code: "BAD_REQUEST", message: saved.message });
        return { ok: true as const, purpose: input.purpose };
      });
    }),

  /** The internal inbox. Unmatched mail appears with no vendor or purpose. */
  list: crmStaffProcedure
    .input(z.object({
      distributorId: z.number().int().positive().nullable().optional(),
      purpose: purpose.nullable().optional(),
      status: z.enum(["received", "forwarded", "dismissed"]).nullable().optional(),
      limit: z.number().int().min(1).max(500).optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { messages: [] };
      return schemaGuard(async () => ({ messages: await listVendorInboundEmails(db, input ?? undefined) }));
    }),

  get: crmStaffProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      return schemaGuard(async () => {
        const found = await getVendorInboundEmail(db, input.id);
        if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found." });
        return found;
      });
    }),

  /**
   * Send one message to an address an admin typed. There is no default
   * recipient and no customer path: the destination is always explicit.
   */
  forward: adminProcedure
    .input(z.object({
      id: z.number().int().positive(),
      to: z.union([z.string().min(3).max(1024), z.array(z.string().min(3).max(320)).min(1).max(20)]),
      note: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      return schemaGuard(async () => {
        const found = await getVendorInboundEmail(db, input.id);
        if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Message not found." });
        const to = Array.isArray(input.to) ? input.to : [input.to];
        const result = await forwardVendorInboundEmail({
          db,
          message: found.message,
          to,
          note: input.note ?? null,
          actor: { id: ctx.user.id, name: ctx.user.name ?? null },
        });
        if (!result.ok) throw new TRPCError({ code: "BAD_REQUEST", message: result.message });
        return { ok: true as const, id: found.message.id, to: result.to };
      });
    }),
});
