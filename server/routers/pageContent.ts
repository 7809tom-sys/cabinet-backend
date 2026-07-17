import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { pageContent } from "../../drizzle/schema";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

export const pageContentRouter = router({
  /** Public: get all content for a page */
  getPage: publicProcedure
    .input(z.object({ pageKey: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return {};
      const rows = await db
        .select()
        .from(pageContent)
        .where(eq(pageContent.pageKey, input.pageKey));
      // Return as a flat key→value map
      const map: Record<string, string> = {};
      for (const row of rows) {
        map[row.field] = row.value;
      }
      return map;
    }),

  /** Admin: upsert a single field value */
  upsertField: protectedProcedure
    .input(
      z.object({
        pageKey: z.string().min(1).max(64),
        field: z.string().min(1).max(128),
        value: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Check if row exists
      const existing = await db
        .select({ id: pageContent.id })
        .from(pageContent)
        .where(
          and(
            eq(pageContent.pageKey, input.pageKey),
            eq(pageContent.field, input.field),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(pageContent)
          .set({ value: input.value, updatedBy: ctx.user.id })
          .where(eq(pageContent.id, existing[0].id));
      } else {
        await db.insert(pageContent).values({
          pageKey: input.pageKey,
          field: input.field,
          value: input.value,
          updatedBy: ctx.user.id,
        });
      }
      return { success: true };
    }),

  /** Admin: reset a field to its default (delete the override) */
  resetField: protectedProcedure
    .input(
      z.object({
        pageKey: z.string(),
        field: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await db
        .delete(pageContent)
        .where(
          and(
            eq(pageContent.pageKey, input.pageKey),
            eq(pageContent.field, input.field),
          ),
        );
      return { success: true };
    }),
});
