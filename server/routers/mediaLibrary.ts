import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import { getDb } from "../db";
import { mediaLibrary } from "../../drizzle/schema";
import { eq, desc, like, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const mediaLibraryRouter = router({
  /**
   * List media library images with optional search and pagination.
   */
  list: adminProcedure
    .input(
      z.object({
        page: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(200).default(60),
        search: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const where = input.search
        ? or(
            like(mediaLibrary.filename, `%${input.search}%`),
            like(mediaLibrary.url, `%${input.search}%`)
          )
        : undefined;

      const [items, countRows] = await Promise.all([
        db
          .select()
          .from(mediaLibrary)
          .where(where)
          .orderBy(desc(mediaLibrary.createdAt))
          .limit(input.limit)
          .offset(input.page * input.limit),
        db
          .select({ count: sql<number>`count(*)` })
          .from(mediaLibrary)
          .where(where),
      ]);

      return { items, total: Number(countRows[0]?.count ?? 0) };
    }),

  /**
   * Upload a new image to the media library (or return existing if same fileKey).
   */
  upload: adminProcedure
    .input(
      z.object({
        filename: z.string().min(1),
        dataBase64: z.string().min(1),
        contentType: z.string().default("image/jpeg"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const raw = input.dataBase64.includes(",")
        ? input.dataBase64.slice(input.dataBase64.indexOf(",") + 1)
        : input.dataBase64;
      const buf = Buffer.from(raw, "base64");
      const safe = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const fileKey = `media-library/${Date.now()}_${safe}`;

      const { url } = await storagePut(fileKey, buf, input.contentType);

      await db.insert(mediaLibrary).values({
        fileKey,
        url,
        filename: input.filename,
        mimeType: input.contentType,
        sizeBytes: buf.length,
        uploadedBy: ctx.user.id,
      });

      return { url, fileKey };
    }),

  /**
   * Delete a media library item by id.
   */
  delete: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(mediaLibrary).where(eq(mediaLibrary.id, input.id));
      return { success: true };
    }),
});
