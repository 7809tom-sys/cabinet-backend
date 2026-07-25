import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import { getDb } from "../db";
import { mediaImages } from "../../drizzle/schema";
import { eq, desc, like, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const mediaLibraryRouter = router({
  /**
   * List media library images with optional folder filter, search, and pagination.
   */
  list: adminProcedure
    .input(
      z.object({
        page:   z.number().int().min(0).default(0),
        limit:  z.number().int().min(1).max(200).default(200),
        search: z.string().optional(),
        folder: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const conditions: ReturnType<typeof like>[] = [];
      if (input.search) {
        conditions.push(
          like(mediaImages.label, `%${input.search}%`),
          like(mediaImages.url,   `%${input.search}%`)
        );
      }

      const folderWhere = input.folder
        ? eq(mediaImages.folder, input.folder)
        : undefined;

      const searchWhere = conditions.length > 0
        ? or(...conditions)
        : undefined;

      // Combine folder + search filters
      const where = folderWhere && searchWhere
        ? sql`(${folderWhere}) AND (${searchWhere})`
        : folderWhere ?? searchWhere;

      const [items, countRows] = await Promise.all([
        db
          .select()
          .from(mediaImages)
          .where(where)
          .orderBy(desc(mediaImages.createdAt))
          .limit(input.limit)
          .offset(input.page * input.limit),
        db
          .select({ count: sql<number>`count(*)` })
          .from(mediaImages)
          .where(where),
      ]);

      return { items, total: Number(countRows[0]?.count ?? 0) };
    }),

  /**
   * List all distinct folder names.
   */
  folders: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db
      .selectDistinct({ folder: mediaImages.folder })
      .from(mediaImages)
      .orderBy(mediaImages.folder);
    return rows.map((r) => r.folder);
  }),

  /**
   * Upload a new image to the media library.
   */
  upload: adminProcedure
    .input(
      z.object({
        label:       z.string().min(1),
        folder:      z.string().min(1).default("General"),
        dataBase64:  z.string().min(1),
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
      const safe = input.label.replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
      const fileKey = `media-library/${Date.now()}_${safe}`;

      const { url } = await storagePut(fileKey, buf, input.contentType);

      const [inserted] = await db.insert(mediaImages).values({
        fileKey,
        url,
        label:      input.label,
        folder:     input.folder,
        mimeType:   input.contentType,
        sizeBytes:  buf.length,
        uploadedBy: ctx.user.id,
      });

      return { id: (inserted as any).insertId, url, fileKey };
    }),

  /**
   * Add an existing CDN URL to the library (no upload, just register).
   */
  register: adminProcedure
    .input(
      z.object({
        label:  z.string().min(1),
        folder: z.string().min(1).default("General"),
        url:    z.string().url(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      await db.insert(mediaImages).values({
        label:      input.label,
        folder:     input.folder,
        url:        input.url,
        uploadedBy: ctx.user.id,
      });

      return { success: true };
    }),

  /**
   * Delete a media library item by id.
   */
  delete: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await db.delete(mediaImages).where(eq(mediaImages.id, input.id));
      return { success: true };
    }),
});
