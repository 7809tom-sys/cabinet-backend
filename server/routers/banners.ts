import { z } from "zod";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { banners } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";

export const bannersRouter = router({
  // ── Admin: list all banners ──────────────────────────────────────────────────
  adminList: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(banners).orderBy(desc(banners.createdAt));
  }),

  // ── Admin: create a banner ───────────────────────────────────────────────────
  adminCreate: adminProcedure
    .input(
      z.object({
        title: z.string().min(1).max(256),
        subtitle: z.string().max(512).optional().nullable(),
        ctaText: z.string().max(128).optional().nullable(),
        ctaUrl: z.string().max(512).optional().nullable(),
        backgroundColor: z.string().max(32).default("#1e3a5f"),
        textColor: z.string().max(32).default("#ffffff"),
        emoji: z.string().max(16).optional().nullable(),
        label: z.string().max(128).optional().nullable(),
        startDate: z.date().optional().nullable(),
        endDate: z.date().optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [result] = await db.insert(banners).values({
        title: input.title,
        subtitle: input.subtitle ?? null,
        ctaText: input.ctaText ?? null,
        ctaUrl: input.ctaUrl ?? null,
        backgroundColor: input.backgroundColor,
        textColor: input.textColor,
        emoji: input.emoji ?? null,
        label: input.label ?? null,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        isActive: false,
      });
      return { id: (result as any).insertId };
    }),

  // ── Admin: update a banner ───────────────────────────────────────────────────
  adminUpdate: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        title: z.string().min(1).max(256).optional(),
        subtitle: z.string().max(512).optional().nullable(),
        ctaText: z.string().max(128).optional().nullable(),
        ctaUrl: z.string().max(512).optional().nullable(),
        backgroundColor: z.string().max(32).optional(),
        textColor: z.string().max(32).optional(),
        emoji: z.string().max(16).optional().nullable(),
        label: z.string().max(128).optional().nullable(),
        startDate: z.date().optional().nullable(),
        endDate: z.date().optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, ...fields } = input;
      const patch: Record<string, unknown> = {};
      if (fields.title !== undefined) patch.title = fields.title;
      if (fields.subtitle !== undefined) patch.subtitle = fields.subtitle;
      if (fields.ctaText !== undefined) patch.ctaText = fields.ctaText;
      if (fields.ctaUrl !== undefined) patch.ctaUrl = fields.ctaUrl;
      if (fields.backgroundColor !== undefined) patch.backgroundColor = fields.backgroundColor;
      if (fields.textColor !== undefined) patch.textColor = fields.textColor;
      if (fields.emoji !== undefined) patch.emoji = fields.emoji;
      if (fields.label !== undefined) patch.label = fields.label;
      if (fields.startDate !== undefined) patch.startDate = fields.startDate;
      if (fields.endDate !== undefined) patch.endDate = fields.endDate;

      if (Object.keys(patch).length > 0) {
        await db.update(banners).set(patch).where(eq(banners.id, id));
      }
      return { ok: true };
    }),

  // ── Admin: delete a banner ───────────────────────────────────────────────────
  adminDelete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(banners).where(eq(banners.id, input.id));
      return { ok: true };
    }),

  // ── Admin: set active banner (deactivates all others first) ─────────────────
  adminSetActive: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive().nullable(), // null = deactivate all
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      // Deactivate all banners first
      await db.update(banners).set({ isActive: false });
      // Then activate the selected one (if not null)
      if (input.id !== null) {
        await db.update(banners).set({ isActive: true }).where(eq(banners.id, input.id));
      }
      return { ok: true };
    }),

  // ── Public: get the currently active banner (for storefront) ────────────────
  getActive: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const rows = await db
      .select()
      .from(banners)
      .where(eq(banners.isActive, true))
      .limit(1);
    return rows[0] ?? null;
  }),
});
