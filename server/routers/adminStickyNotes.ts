import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { adminStickyNotes, users } from "../../drizzle/schema";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";

export const ADMIN_STICKY_NOTE_COLORS = ["yellow", "peach", "mint", "sky", "violet", "rose"] as const;
export const adminStickyNoteFields = z.object({
  title: z.string().trim().max(120).nullable().optional(),
  body: z.string().trim().min(1, "Write a note before saving.").max(3_000),
  color: z.enum(ADMIN_STICKY_NOTE_COLORS).default("yellow"),
  isPinned: z.boolean().default(false),
});

export const adminStickyNotesRouter = router({
  list: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({
        id: adminStickyNotes.id,
        title: adminStickyNotes.title,
        body: adminStickyNotes.body,
        color: adminStickyNotes.color,
        isPinned: adminStickyNotes.isPinned,
        authorId: adminStickyNotes.authorId,
        authorName: users.name,
        createdAt: adminStickyNotes.createdAt,
        updatedAt: adminStickyNotes.updatedAt,
      })
      .from(adminStickyNotes)
      .leftJoin(users, eq(adminStickyNotes.authorId, users.id))
      .orderBy(desc(adminStickyNotes.isPinned), desc(adminStickyNotes.updatedAt));
  }),

  create: adminProcedure.input(adminStickyNoteFields).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new Error("Notes are unavailable right now.");
    const [result] = await db.insert(adminStickyNotes).values({
      title: input.title?.trim() || null,
      body: input.body,
      color: input.color,
      isPinned: input.isPinned,
      authorId: ctx.user.id,
    });
    return { id: Number((result as { insertId?: number }).insertId) };
  }),

  update: adminProcedure.input(adminStickyNoteFields.partial().extend({ id: z.number().int().positive() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("Notes are unavailable right now.");
    const { id, ...changes } = input;
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (changes.title !== undefined) patch.title = changes.title?.trim() || null;
    if (changes.body !== undefined) patch.body = changes.body;
    if (changes.color !== undefined) patch.color = changes.color;
    if (changes.isPinned !== undefined) patch.isPinned = changes.isPinned;
    await db.update(adminStickyNotes).set(patch).where(eq(adminStickyNotes.id, id));
    return { ok: true };
  }),

  remove: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("Notes are unavailable right now.");
    await db.delete(adminStickyNotes).where(eq(adminStickyNotes.id, input.id));
    return { ok: true };
  }),
});
