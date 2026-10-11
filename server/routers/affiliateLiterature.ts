import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { storagePut } from "../storage";
import { affiliateLiterature } from "../../drizzle/schema";
import { TRPCError } from "@trpc/server";

const MAX_FILE_BYTES = 24 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
]);

function decodeBase64(value: string) {
  const raw = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  const buffer = Buffer.from(raw, "base64");
  if (!buffer.length || buffer.length > MAX_FILE_BYTES) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Literature file must be between 1 byte and 24 MB." });
  }
  return buffer;
}

function safeFilename(filename: string) {
  const trimmed = filename.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
  return trimmed || "affiliate-literature";
}

export const affiliateLiteratureRouter = router({
  adminList: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(affiliateLiterature).orderBy(desc(affiliateLiterature.createdAt));
  }),

  adminUpload: adminProcedure
    .input(z.object({
      title: z.string().trim().min(1).max(255),
      description: z.string().trim().max(2000).nullable().optional(),
      category: z.string().trim().min(1).max(64).default("General"),
      filename: z.string().trim().min(1).max(255),
      mimeType: z.string().min(1).max(128),
      dataBase64: z.string().min(1),
      isPublished: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ALLOWED_MIME_TYPES.has(input.mimeType)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Supported files: PDF, DOCX, XLSX, PPTX, or TXT." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const buffer = decodeBase64(input.dataBase64);
      const filename = safeFilename(input.filename);
      const fileKey = `affiliate-literature/${Date.now()}_${filename}`;
      const stored = await storagePut(fileKey, buffer, input.mimeType);
      const [row] = await db.insert(affiliateLiterature).values({
        title: input.title,
        description: input.description?.trim() || null,
        category: input.category,
        filename,
        fileKey,
        url: stored.url,
        mimeType: input.mimeType,
        sizeBytes: buffer.length,
        isPublished: input.isPublished,
        uploadedBy: ctx.user.id,
      });
      return { id: (row as any).insertId, url: stored.url };
    }),

  adminUpdate: adminProcedure
    .input(z.object({
      id: z.number().int(),
      title: z.string().trim().min(1).max(255).optional(),
      description: z.string().trim().max(2000).nullable().optional(),
      category: z.string().trim().min(1).max(64).optional(),
      isPublished: z.boolean().optional(),
      sortOrder: z.number().int().min(0).max(100000).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const { id, ...patch } = input;
      await db.update(affiliateLiterature).set(patch).where(eq(affiliateLiterature.id, id));
      return { id };
    }),

  adminDelete: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.delete(affiliateLiterature).where(eq(affiliateLiterature.id, input.id));
      return { id: input.id };
    }),
});
