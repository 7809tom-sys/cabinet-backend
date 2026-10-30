import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { contractorCustomers, crmDealDesigns, crmDeals, kitchenDesigns } from "../../drizzle/schema";
import { getDb } from "../db";
import { requireContractorRecordUserId } from "../lib/contractorRecordScope";
import { protectedProcedure, router } from "../_core/trpc";

const contractorViewInput = z.object({
  contractorUserId: z.number().int().positive().optional(),
}).optional();

const customerInput = z.object({
  name: z.string().trim().min(2).max(256),
  email: z.string().trim().email().max(320).nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
});

export const contractorPortalRouter = router({
  customers: router({
    list: protectedProcedure.input(contractorViewInput).query(async ({ ctx, input }) => {
      const ownerId = requireContractorRecordUserId(ctx.user, input?.contractorUserId);
      const db = await getDb();
      if (!db) return [];
      return db.select().from(contractorCustomers)
        .where(eq(contractorCustomers.contractorUserId, ownerId))
        .orderBy(desc(contractorCustomers.updatedAt));
    }),
    create: protectedProcedure.input(customerInput.extend({
      contractorUserId: z.number().int().positive().optional(),
    })).mutation(async ({ ctx, input }) => {
      const ownerId = requireContractorRecordUserId(ctx.user, input.contractorUserId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const result = await db.insert(contractorCustomers).values({
        contractorUserId: ownerId,
        name: input.name,
        email: input.email || null,
        phone: input.phone || null,
        notes: input.notes || null,
      });
      const id = Number((result as unknown as [{ insertId: number }])[0].insertId);
      await db.insert(crmDeals).values({
        affiliateId: null,
        ownerUserId: ownerId,
        contractorCustomerId: id,
        title: input.name,
        contactName: input.name,
        contactEmail: input.email || null,
        contactPhone: input.phone || null,
        notes: input.notes || null,
        stage: "new",
        source: "manual",
      });
      const [row] = await db.select().from(contractorCustomers).where(eq(contractorCustomers.id, id)).limit(1);
      return row ?? { id, contractorUserId: ownerId, name: input.name, email: input.email ?? null, phone: input.phone ?? null, notes: input.notes ?? null };
    }),
  }),
  designs: router({
    list: protectedProcedure.input(contractorViewInput).query(async ({ ctx, input }) => {
      const ownerId = requireContractorRecordUserId(ctx.user, input?.contractorUserId);
      const db = await getDb();
      if (!db) return [];
      return db.select({
        id: kitchenDesigns.id,
        name: kitchenDesigns.name,
        projectName: kitchenDesigns.projectName,
        roomLabel: kitchenDesigns.roomLabel,
        roomType: kitchenDesigns.roomType,
        thumbnailUrl: kitchenDesigns.thumbnailUrl,
        updatedAt: kitchenDesigns.updatedAt,
        contractorCustomerId: kitchenDesigns.contractorCustomerId,
      }).from(kitchenDesigns)
        .where(and(eq(kitchenDesigns.userId, ownerId), isNull(kitchenDesigns.affiliateId)))
        .orderBy(desc(kitchenDesigns.updatedAt));
    }),
    assign: protectedProcedure.input(z.object({
      designId: z.number().int().positive(),
      customerId: z.number().int().positive().nullable(),
      contractorUserId: z.number().int().positive().optional(),
    })).mutation(async ({ ctx, input }) => {
      const ownerId = requireContractorRecordUserId(ctx.user, input.contractorUserId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const [design] = await db.select({ id: kitchenDesigns.id }).from(kitchenDesigns)
        .where(and(
          eq(kitchenDesigns.id, input.designId),
          eq(kitchenDesigns.userId, ownerId),
          isNull(kitchenDesigns.affiliateId),
        ))
        .limit(1);
      if (!design) throw new TRPCError({ code: "NOT_FOUND", message: "Saved design not found." });
      if (input.customerId != null) {
        const [customer] = await db.select({ id: contractorCustomers.id }).from(contractorCustomers)
          .where(and(eq(contractorCustomers.id, input.customerId), eq(contractorCustomers.contractorUserId, ownerId)))
          .limit(1);
        if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found." });
      }
      await db.update(kitchenDesigns)
        .set({ contractorCustomerId: input.customerId })
        .where(eq(kitchenDesigns.id, input.designId));
      const ownedDeals = await db.select({ id: crmDeals.id, contractorCustomerId: crmDeals.contractorCustomerId })
        .from(crmDeals)
        .where(and(eq(crmDeals.ownerUserId, ownerId), isNull(crmDeals.affiliateId)));
      const ownedDealIds = ownedDeals.map((deal) => deal.id);
      if (ownedDealIds.length) {
        await db.delete(crmDealDesigns).where(and(eq(crmDealDesigns.designId, input.designId), inArray(crmDealDesigns.dealId, ownedDealIds)));
      }
      if (input.customerId != null) {
        let dealId = ownedDeals.find((row) => row.contractorCustomerId === input.customerId)?.id ?? null;
        if (dealId == null) {
          const [customer] = await db.select({ name: contractorCustomers.name }).from(contractorCustomers).where(eq(contractorCustomers.id, input.customerId)).limit(1);
          const created = await db.insert(crmDeals).values({
            affiliateId: null,
            ownerUserId: ownerId,
            contractorCustomerId: input.customerId,
            title: customer?.name ?? "Customer design",
            contactName: customer?.name ?? null,
            stage: "new",
            source: "manual",
          });
          dealId = Number((created as unknown as [{ insertId: number }])[0].insertId);
        }
        const [named] = await db.select({ name: kitchenDesigns.name }).from(kitchenDesigns).where(eq(kitchenDesigns.id, input.designId)).limit(1);
        await db.insert(crmDealDesigns).values({
          dealId,
          designId: input.designId,
          designName: named?.name ?? "Saved design",
          linkedByUserId: ctx.user.id,
        });
      }
      return { ok: true as const, designId: input.designId, customerId: input.customerId };
    }),
  }),
});
