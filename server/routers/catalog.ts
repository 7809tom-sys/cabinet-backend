import { z } from "zod";
import { eq, and, like, inArray, isNotNull, sql } from "drizzle-orm";
import { publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  cabinets,
  distributors,
  doorStyles,
  distributorSkus,
} from "../../drizzle/schema";
import { resolvePresentation, applyMarkup } from "../lib/presentation";

// ─── Distributors ─────────────────────────────────────────────────────────────

export const distributorsRouter = router({
  list: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .select()
      .from(distributors)
      .where(eq(distributors.isActive, true));
    // Resolve the customer-facing label per line; never leak hidden supplier names.
    return rows.map((d) => {
      const p = resolvePresentation(d);
      return {
        id: d.id,
        code: d.code,
        name: p.displayName,
        initials: p.displayInitials,
        displayMode: p.displayMode,
        seriesName: d.seriesName,
        leadTimeDays: d.leadTimeDays,
        isActive: d.isActive,
      };
    });
  }),
});

// ─── Door Styles ──────────────────────────────────────────────────────────────

export const doorStylesRouter = router({
  list: publicProcedure
    .input(z.object({ distributorId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      if (input?.distributorId) {
        return db
          .select()
          .from(doorStyles)
          .where(
            and(
              eq(doorStyles.distributorId, input.distributorId),
              eq(doorStyles.isActive, true)
            )
          );
      }
      return db.select().from(doorStyles).where(eq(doorStyles.isActive, true));
    }),

  byId: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select()
        .from(doorStyles)
        .where(eq(doorStyles.id, input.id))
        .limit(1);
      return rows[0] ?? null;
    }),
});

// ─── Cabinets ─────────────────────────────────────────────────────────────────

export const cabinetsRouter = router({
  list: publicProcedure
    .input(
      z.object({
        category: z.string().optional(),
        subCategory: z.string().optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const conditions = [eq(cabinets.isActive, true)];
      if (input?.category) {
        conditions.push(eq(cabinets.category, input.category));
      }
      if (input?.subCategory) {
        conditions.push(eq(cabinets.subCategory, input.subCategory));
      }
      if (input?.search) {
        conditions.push(
          sql`(${cabinets.masterCode} LIKE ${`%${input.search}%`} OR ${cabinets.description} LIKE ${`%${input.search}%`})`
        );
      }

      const limit = input?.limit ?? 50;
      const offset = input?.offset ?? 0;

      const [items, countResult] = await Promise.all([
        db
          .select()
          .from(cabinets)
          .where(and(...conditions))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(cabinets)
          .where(and(...conditions)),
      ]);

      return {
        items,
        total: Number(countResult[0]?.count ?? 0),
      };
    }),

  categories: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .selectDistinct({ category: cabinets.category })
      .from(cabinets)
      .where(eq(cabinets.isActive, true));
    return rows.map((r) => r.category).filter(Boolean);
  }),

  subCategories: publicProcedure
    .input(z.object({ category: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .selectDistinct({ subCategory: cabinets.subCategory })
        .from(cabinets)
        .where(
          and(
            eq(cabinets.isActive, true),
            eq(cabinets.category, input.category),
            isNotNull(cabinets.subCategory)
          )
        );
      return rows.map((r) => r.subCategory).filter(Boolean);
    }),

  byId: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select()
        .from(cabinets)
        .where(eq(cabinets.id, input.id))
        .limit(1);
      return rows[0] ?? null;
    }),

  byCode: publicProcedure
    .input(z.object({ masterCode: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select()
        .from(cabinets)
        .where(eq(cabinets.masterCode, input.masterCode))
        .limit(1);
      return rows[0] ?? null;
    }),
});

// ─── Pricing ──────────────────────────────────────────────────────────────────

export const pricingRouter = router({
  // Get all SKUs for a specific cabinet (across all distributors & styles)
  forCabinet: publicProcedure
    .input(
      z.object({
        cabinetId: z.number(),
        distributorId: z.number().optional(),
        styleId: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions = [
        eq(distributorSkus.cabinetId, input.cabinetId),
        eq(distributorSkus.isAvailable, true),
        eq(distributorSkus.isPublished, true),
      ];
      if (input.distributorId) {
        conditions.push(eq(distributorSkus.distributorId, input.distributorId));
      }
      if (input.styleId) {
        conditions.push(eq(distributorSkus.styleId, input.styleId));
      }

      return db
        .select({
          id: distributorSkus.id,
          platformSku: distributorSkus.platformSku,
          distributorSku: distributorSkus.distributorSku,
          distributorId: distributorSkus.distributorId,
          styleId: distributorSkus.styleId,
          listPrice: distributorSkus.listPrice,
          yourCost: distributorSkus.yourCost,
          adjustedListPrice: distributorSkus.adjustedListPrice,
          wholesalePrice: distributorSkus.wholesalePrice,
          contractorPrice: distributorSkus.contractorPrice,
          homeownerPrice: distributorSkus.homeownerPrice,
          // Join distributor name
          distributorName: distributors.name,
          distributorCode: distributors.code,
          // Join style info
          styleCode: doorStyles.styleCode,
          ourName: doorStyles.ourName,
          distributorStyleName: doorStyles.distributorName,
          doorSampleImageUrl: doorStyles.doorSampleImageUrl,
          thumbnailImageUrl: doorStyles.thumbnailImageUrl,
        })
        .from(distributorSkus)
        .innerJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
        .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
        .where(and(...conditions));
    }),

  // Get pricing for a specific platform SKU
  bySku: publicProcedure
    .input(z.object({ platformSku: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const rows = await db
        .select()
        .from(distributorSkus)
        .where(eq(distributorSkus.platformSku, input.platformSku))
        .limit(1);
      return rows[0] ?? null;
    }),

  // Get available distributors for a cabinet (which distributors carry it)
  availableDistributors: publicProcedure
    .input(z.object({ cabinetId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .selectDistinct({
          distributorId: distributorSkus.distributorId,
          distributorName: distributors.name,
          distributorCode: distributors.code,
        })
        .from(distributorSkus)
        .innerJoin(distributors, eq(distributorSkus.distributorId, distributors.id))
        .where(
          and(
            eq(distributorSkus.cabinetId, input.cabinetId),
            eq(distributorSkus.isAvailable, true)
          )
        );
      return rows;
    }),

  // Get available styles for a cabinet+distributor combo
  availableStyles: publicProcedure
    .input(
      z.object({
        cabinetId: z.number(),
        distributorId: z.number(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .selectDistinct({
          styleId: distributorSkus.styleId,
          styleCode: doorStyles.styleCode,
          ourName: doorStyles.ourName,
          distributorStyleName: doorStyles.distributorName,
          thumbnailImageUrl: doorStyles.thumbnailImageUrl,
          doorSampleImageUrl: doorStyles.doorSampleImageUrl,
        })
        .from(distributorSkus)
        .innerJoin(doorStyles, eq(distributorSkus.styleId, doorStyles.id))
        .where(
          and(
            eq(distributorSkus.cabinetId, input.cabinetId),
            eq(distributorSkus.distributorId, input.distributorId),
            eq(distributorSkus.isAvailable, true)
          )
        );
    }),
});
