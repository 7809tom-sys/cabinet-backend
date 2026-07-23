import { z } from "zod";
import { eq, asc } from "drizzle-orm";
import { publicProcedure, adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { cabinetCategories, cabinetSubCategories } from "../../drizzle/schema";

export const cabinetCategoriesRouter = router({
  // Public: list all categories with their sub-categories (used by dropdowns everywhere)
  list: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const cats = await db
      .select()
      .from(cabinetCategories)
      .orderBy(asc(cabinetCategories.sortOrder), asc(cabinetCategories.name));

    const subs = await db
      .select()
      .from(cabinetSubCategories)
      .orderBy(asc(cabinetSubCategories.sortOrder), asc(cabinetSubCategories.name));

    return cats.map((cat) => ({
      ...cat,
      subCategories: subs.filter((s) => s.categoryId === cat.id),
    }));
  }),

  // Admin: create a new category
  create: adminProcedure
    .input(z.object({ name: z.string().min(1).max(64) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      // Get max sortOrder
      const existing = await db
        .select({ sortOrder: cabinetCategories.sortOrder })
        .from(cabinetCategories)
        .orderBy(asc(cabinetCategories.sortOrder));
      const maxSort = existing.length > 0 ? Math.max(...existing.map((e) => e.sortOrder)) : 0;

      await db.insert(cabinetCategories).values({
        name: input.name.trim(),
        sortOrder: maxSort + 1,
      });
      return { success: true };
    }),

  // Admin: rename a category
  update: adminProcedure
    .input(z.object({ id: z.number(), name: z.string().min(1).max(64) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db
        .update(cabinetCategories)
        .set({ name: input.name.trim() })
        .where(eq(cabinetCategories.id, input.id));
      return { success: true };
    }),

  // Admin: reorder categories
  reorder: adminProcedure
    .input(z.object({ ids: z.array(z.number()) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      for (let i = 0; i < input.ids.length; i++) {
        await db
          .update(cabinetCategories)
          .set({ sortOrder: i + 1 })
          .where(eq(cabinetCategories.id, input.ids[i]));
      }
      return { success: true };
    }),

  // Admin: delete a category (and its sub-categories)
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(cabinetSubCategories).where(eq(cabinetSubCategories.categoryId, input.id));
      await db.delete(cabinetCategories).where(eq(cabinetCategories.id, input.id));
      return { success: true };
    }),

  // Admin: create a sub-category
  createSub: adminProcedure
    .input(z.object({ categoryId: z.number(), name: z.string().min(1).max(128) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const existing = await db
        .select({ sortOrder: cabinetSubCategories.sortOrder })
        .from(cabinetSubCategories)
        .where(eq(cabinetSubCategories.categoryId, input.categoryId));
      const maxSort = existing.length > 0 ? Math.max(...existing.map((e) => e.sortOrder)) : 0;

      await db.insert(cabinetSubCategories).values({
        categoryId: input.categoryId,
        name: input.name.trim(),
        sortOrder: maxSort + 1,
      });
      return { success: true };
    }),

  // Admin: rename a sub-category
  updateSub: adminProcedure
    .input(z.object({ id: z.number(), name: z.string().min(1).max(128) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db
        .update(cabinetSubCategories)
        .set({ name: input.name.trim() })
        .where(eq(cabinetSubCategories.id, input.id));
      return { success: true };
    }),

  // Admin: delete a sub-category
  deleteSub: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(cabinetSubCategories).where(eq(cabinetSubCategories.id, input.id));
      return { success: true };
    }),

  // Admin: reorder sub-categories within a category
  reorderSubs: adminProcedure
    .input(z.object({ categoryId: z.number(), ids: z.array(z.number()) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      for (let i = 0; i < input.ids.length; i++) {
        await db
          .update(cabinetSubCategories)
          .set({ sortOrder: i + 1 })
          .where(eq(cabinetSubCategories.id, input.ids[i]));
      }
      return { success: true };
    }),

  // Admin: move a sub-category to a different parent category
  moveSub: adminProcedure
    .input(z.object({ subId: z.number(), targetCategoryId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      // Get max sortOrder in target category
      const existing = await db
        .select({ sortOrder: cabinetSubCategories.sortOrder })
        .from(cabinetSubCategories)
        .where(eq(cabinetSubCategories.categoryId, input.targetCategoryId));
      const maxSort = existing.length > 0 ? Math.max(...existing.map((e) => e.sortOrder)) : 0;
      await db
        .update(cabinetSubCategories)
        .set({ categoryId: input.targetCategoryId, sortOrder: maxSort + 1 })
        .where(eq(cabinetSubCategories.id, input.subId));
      return { success: true };
    }),

  // Admin: promote a sub-category to its own main category (creates category + moves sub into it)
  promoteSubToCategory: adminProcedure
    .input(z.object({ subId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      // Get the sub-category name
      const [sub] = await db
        .select()
        .from(cabinetSubCategories)
        .where(eq(cabinetSubCategories.id, input.subId));
      if (!sub) throw new Error("Sub-category not found");
      // Create a new main category with that name
      const allCats = await db
        .select({ sortOrder: cabinetCategories.sortOrder })
        .from(cabinetCategories)
        .orderBy(asc(cabinetCategories.sortOrder));
      const maxSort = allCats.length > 0 ? Math.max(...allCats.map((e) => e.sortOrder)) : 0;
      const [newCat] = await db.insert(cabinetCategories).values({
        name: sub.name,
        sortOrder: maxSort + 1,
      }).$returningId();
      // Move the sub-category into the new category
      await db
        .update(cabinetSubCategories)
        .set({ categoryId: newCat.id, sortOrder: 1 })
        .where(eq(cabinetSubCategories.id, input.subId));
      return { success: true, newCategoryId: newCat.id };
    }),
});
