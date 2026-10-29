import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { contractorAccessRequests, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";

const STATUSES = ["pending", "approved", "rejected"] as const;

export const contractorAccessRouter = router({
  mine: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const [row] = await db.select().from(contractorAccessRequests)
      .where(eq(contractorAccessRequests.userId, ctx.user.id))
      .orderBy(desc(contractorAccessRequests.createdAt))
      .limit(1);
    return row ?? null;
  }),
  // Named submit, not apply: tRPC reserves apply for the procedure proxy.
  submit: protectedProcedure.input(z.object({
    businessName: z.string().trim().min(2).max(256),
    phone: z.string().trim().min(7).max(32),
    licenseNumber: z.string().trim().max(64).nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    if (ctx.user.role === "contractor") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This account is already an approved contractor." });
    }
    if (ctx.user.role !== "user") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Affiliate and staff accounts keep their current role." });
    }
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const [pending] = await db.select({ id: contractorAccessRequests.id }).from(contractorAccessRequests)
      .where(and(eq(contractorAccessRequests.userId, ctx.user.id), eq(contractorAccessRequests.status, "pending")))
      .limit(1);
    if (pending) return { id: pending.id, status: "pending" as const };
    const result = await db.insert(contractorAccessRequests).values({
      userId: ctx.user.id,
      businessName: input.businessName,
      phone: input.phone,
      licenseNumber: input.licenseNumber || null,
      status: "pending",
    });
    return { id: Number((result as unknown as [{ insertId: number }])[0].insertId), status: "pending" as const };
  }),
  list: adminProcedure.input(z.object({ status: z.enum(STATUSES).optional() }).optional()).query(async ({ input }) => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select({
      id: contractorAccessRequests.id,
      userId: contractorAccessRequests.userId,
      businessName: contractorAccessRequests.businessName,
      phone: contractorAccessRequests.phone,
      licenseNumber: contractorAccessRequests.licenseNumber,
      status: contractorAccessRequests.status,
      createdAt: contractorAccessRequests.createdAt,
      email: users.email,
      name: users.name,
      role: users.role,
    }).from(contractorAccessRequests)
      .leftJoin(users, eq(users.id, contractorAccessRequests.userId))
      .orderBy(desc(contractorAccessRequests.createdAt));
    return input?.status ? rows.filter((row) => row.status === input.status) : rows;
  }),
  review: adminProcedure.input(z.object({
    id: z.number().int().positive(),
    decision: z.enum(["approved", "rejected"]),
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
    const [request] = await db.select().from(contractorAccessRequests).where(eq(contractorAccessRequests.id, input.id)).limit(1);
    if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found." });
    const [account] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, request.userId)).limit(1);
    if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Account not found." });
    if (input.decision === "approved") {
      if (account.role !== "user" && account.role !== "contractor") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This account already has a staff or affiliate role." });
      }
      if (account.role === "user") {
        await db.update(users).set({ role: "contractor" }).where(eq(users.id, account.id));
      }
    }
    await db.update(contractorAccessRequests).set({
      status: input.decision,
      reviewedByUserId: ctx.user.id,
      reviewedAt: new Date(),
    }).where(eq(contractorAccessRequests.id, request.id));
    return { ok: true as const, status: input.decision };
  }),
});
