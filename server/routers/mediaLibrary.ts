import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import { getDb } from "../db";
import { mediaImages } from "../../drizzle/schema";
import { eq, desc, like, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

type MediaReferenceColumn = { tableName: string; columnName: string };

function sqlIdentifier(identifier: string) {
  return `\`${identifier.replace(/`/g, "``")}\``;
}

/**
 * Find every persistent database field that contains a media URL or storage key.
 * This includes ordinary image columns as well as JSON/text fields, so deleting a
 * library row cannot silently leave a saved product, design, or content record
 * pointing at an absent media-library item.
 */
async function findMediaReferences(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  media: { url: string; fileKey: string | null },
): Promise<Array<MediaReferenceColumn & { referenceCount: number }>> {
  const [columnRows] = await db.$client.promise().query(`
    SELECT table_name AS tableName, column_name AS columnName
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name <> 'media_images'
      AND data_type IN ('char', 'varchar', 'tinytext', 'text', 'mediumtext', 'longtext', 'json')
  `);
  const columns = columnRows as unknown as MediaReferenceColumn[];
  const values = [media.url, media.fileKey].filter((value): value is string => Boolean(value));
  const usage: Array<MediaReferenceColumn & { referenceCount: number }> = [];

  for (const { tableName, columnName } of columns) {
    const table = sqlIdentifier(tableName);
    const column = sqlIdentifier(columnName);
    const predicates = values.map(() => `(${column} = ? OR ${column} LIKE ?)`);
    const parameters = values.flatMap((value) => [value, `%${value}%`]);
    const [referenceRows] = await db.$client.promise().query(
      `SELECT COUNT(*) AS referenceCount FROM ${table} WHERE ${predicates.join(" OR ")}`,
      parameters,
    );
    const rows = referenceRows as unknown as Array<{ referenceCount: number }>;
    const referenceCount = Number(rows[0]?.referenceCount ?? 0);
    if (referenceCount > 0) usage.push({ tableName, columnName, referenceCount });
  }

  return usage;
}

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
   * Replace the file for an existing media library item.
   * Uploads new bytes to a new S3 key, then updates the DB row's url/fileKey.
   * All cabinets referencing the OLD url will need to be updated separately;
   * the new url is returned so the caller can do that if needed.
   */
  replace: adminProcedure
    .input(
      z.object({
        id:          z.number().int(),
        dataBase64:  z.string().min(1),
        contentType: z.string().default("image/jpeg"),
        label:       z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Get the existing row so we can reuse the label for the new key
      const [existing] = await db.select().from(mediaImages).where(eq(mediaImages.id, input.id)).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Media item not found" });

      const raw = input.dataBase64.includes(",")
        ? input.dataBase64.slice(input.dataBase64.indexOf(",") + 1)
        : input.dataBase64;
      const buf = Buffer.from(raw, "base64");
      const safe = (input.label ?? existing.label).replace(/[^a-zA-Z0-9._-]/g, "_").toLowerCase();
      const fileKey = `media-library/${Date.now()}_${safe}`;

      const { url } = await storagePut(fileKey, buf, input.contentType);

      await db.update(mediaImages)
        .set({
          fileKey,
          url,
          mimeType:  input.contentType,
          sizeBytes: buf.length,
          ...(input.label ? { label: input.label } : {}),
        })
        .where(eq(mediaImages.id, input.id));

      return { id: input.id, url, fileKey };
    }),

  /**
   * Delete a media library item by id.
   */
  delete: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [media] = await db.select().from(mediaImages).where(eq(mediaImages.id, input.id)).limit(1);
      if (!media) throw new TRPCError({ code: "NOT_FOUND", message: "Media item not found" });

      const references = await findMediaReferences(db, media);
      if (references.length > 0) {
        const referenceCount = references.reduce((total, reference) => total + reference.referenceCount, 0);
        throw new TRPCError({
          code: "CONFLICT",
          message: `This image is still used by ${referenceCount} saved record${referenceCount === 1 ? "" : "s"} and cannot be deleted.`,
        });
      }

      await db.delete(mediaImages).where(eq(mediaImages.id, input.id));
      return { success: true };
    }),
});
