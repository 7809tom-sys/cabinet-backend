/**
 * Inspiration Gallery router
 * - publicProcedure: list active photos (with optional roomType filter)
 * - adminProcedure: create, update, delete photos
 */

import { z } from "zod";
import { eq, asc, and, isNull, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { inspirationPhotos } from "../../drizzle/schema";

const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
  return next({ ctx });
});

export const inspirationRouter = router({
  /** List active photos, optionally filtered by room type. */
  list: publicProcedure
    .input(
      z
        .object({
          roomType: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [eq(inspirationPhotos.isActive, true)];
      if (input?.roomType) {
        conditions.push(eq(inspirationPhotos.roomType, input.roomType));
      }
      return db
        .select()
        .from(inspirationPhotos)
        .where(and(...conditions))
        .orderBy(asc(inspirationPhotos.sortOrder), asc(inspirationPhotos.id));
    }),

  /** Admin: list all photos (including inactive). */
  adminList: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select()
      .from(inspirationPhotos)
      .orderBy(asc(inspirationPhotos.sortOrder), asc(inspirationPhotos.id));
  }),

  /** Admin: create a new photo. */
  create: adminProcedure
    .input(
      z.object({
        title: z.string().min(1).max(256),
        imageUrl: z.string().url(),
        roomType: z.string().max(32).nullable().optional(),
        styleId: z.number().nullable().optional(),
        doorStyleName: z.string().max(128).nullable().optional(),
        colorName: z.string().max(128).nullable().optional(),
        tags: z.string().max(512).nullable().optional(),
        sortOrder: z.number().default(0),
        isActive: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.insert(inspirationPhotos).values({
        title: input.title,
        imageUrl: input.imageUrl,
        roomType: input.roomType ?? null,
        styleId: input.styleId ?? null,
        doorStyleName: input.doorStyleName ?? null,
        colorName: input.colorName ?? null,
        tags: input.tags ?? null,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
      });
      return { success: true };
    }),

  /** Admin: update an existing photo. */
  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(1).max(256).optional(),
        imageUrl: z.string().url().optional(),
        roomType: z.string().max(32).nullable().optional(),
        styleId: z.number().nullable().optional(),
        doorStyleName: z.string().max(128).nullable().optional(),
        colorName: z.string().max(128).nullable().optional(),
        tags: z.string().max(512).nullable().optional(),
        sortOrder: z.number().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { id, ...patch } = input;
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (v !== undefined) clean[k] = v;
      }
      if (Object.keys(clean).length === 0) return { success: true };
      await db.update(inspirationPhotos).set(clean).where(eq(inspirationPhotos.id, id));
      return { success: true };
    }),

  /** Admin: delete a photo. */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db.delete(inspirationPhotos).where(eq(inspirationPhotos.id, input.id));
      return { success: true };
    }),
});
