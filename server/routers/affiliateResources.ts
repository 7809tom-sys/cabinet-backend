import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { storageGetSignedUrl, storagePut } from "../storage";
import { affiliateLiterature, affiliateResourceProgress, affiliateResources } from "../../drizzle/schema";
import { resolveAffiliateAccess } from "../lib/affiliateAccess";
import {
  AFFILIATE_RESOURCE_FILE_PREFIX,
  AFFILIATE_RESOURCE_TYPES,
  type AffiliateResourceMeta,
} from "@shared/affiliateResources";

const MAX_FILE_BYTES = 24 * 1024 * 1024;
const FILE_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "text/plain",
]);

const metaSchema = z.object({
  chapters: z.array(z.object({
    label: z.string().trim().min(1).max(120),
    startSeconds: z.number().int().min(0).max(86400),
  })).max(40).optional(),
  durationSeconds: z.number().int().min(0).max(86400).nullable().optional(),
  hashtags: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  placeholder: z.boolean().optional(),
});

function decodeBase64(value: string) {
  const raw = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  const buffer = Buffer.from(raw, "base64");
  if (!buffer.length || buffer.length > MAX_FILE_BYTES) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "File must be between 1 byte and 24 MB." });
  }
  return buffer;
}

function safeFilename(filename: string) {
  const trimmed = filename.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
  return trimmed || "affiliate-resource";
}

function safeResourceUrl(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Resource links must be valid https URLs." });
  }
  if (parsed.protocol !== "https:") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Resource links must start with https." });
  }
  if (parsed.username || parsed.password) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Do not put a password in a resource link." });
  }
  return parsed.toString();
}

type ResourceRow = typeof affiliateResources.$inferSelect;

function toResource(row: ResourceRow, includeKeys: boolean) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    url: row.url,
    category: row.category,
    meta: (row.metaJson ?? null) as AffiliateResourceMeta | null,
    sortOrder: row.sortOrder,
    isPublished: row.isPublished,
    featured: row.featured,
    filename: row.filename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    hasFile: Boolean(row.fileKey),
    hasThumbnail: Boolean(row.thumbnailKey),
    fileKey: includeKeys ? row.fileKey : null,
    thumbnailKey: includeKeys ? row.thumbnailKey : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function requireAffiliateReader(user: { id: number; email: string | null; role: string }) {
  if (user.role === "admin") return;
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const access = await resolveAffiliateAccess(db, user);
  if (!access) throw new TRPCError({ code: "FORBIDDEN", message: "Affiliate access required." });
}

async function storeResourceFile(filename: string, mimeType: string, dataBase64: string, folder: string) {
  if (!FILE_MIME_TYPES.has(mimeType)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Upload a PDF, image, text file, or short MP4/WebM video." });
  }
  const buffer = decodeBase64(dataBase64);
  const stored = await storagePut(`${AFFILIATE_RESOURCE_FILE_PREFIX}${folder}/${Date.now()}_${safeFilename(filename)}`, buffer, mimeType);
  if (!stored.key.startsWith(AFFILIATE_RESOURCE_FILE_PREFIX)) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "File was not stored privately." });
  }
  return { ...stored, sizeBytes: buffer.length, filename: safeFilename(filename) };
}

export const affiliateResourcesRouter = router({
  adminList: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select().from(affiliateResources).orderBy(asc(affiliateResources.sortOrder), asc(affiliateResources.id));
    return rows.map((row) => toResource(row, true));
  }),

  adminSave: adminProcedure
    .input(z.object({
      id: z.number().int().positive().optional(),
      type: z.enum(AFFILIATE_RESOURCE_TYPES),
      title: z.string().trim().min(1).max(255),
      body: z.string().max(20000).nullable().optional(),
      url: z.string().trim().max(1024).nullable().optional(),
      category: z.string().trim().min(1).max(64).default("general"),
      featured: z.boolean().optional(),
      isPublished: z.boolean().optional(),
      sortOrder: z.number().int().min(0).max(100000).optional(),
      meta: metaSchema.nullable().optional(),
      filename: z.string().trim().max(255).optional(),
      mimeType: z.string().trim().max(128).optional(),
      dataBase64: z.string().optional(),
      thumbnailFilename: z.string().trim().max(255).optional(),
      thumbnailMimeType: z.string().trim().max(128).optional(),
      thumbnailBase64: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const file = input.dataBase64
        ? await storeResourceFile(input.filename || "resource", input.mimeType || "application/octet-stream", input.dataBase64, "files")
        : null;
      const thumbnail = input.thumbnailBase64
        ? await storeResourceFile(input.thumbnailFilename || "thumbnail", input.thumbnailMimeType || "image/png", input.thumbnailBase64, "thumbnails")
        : null;
      const values = {
        type: input.type,
        title: input.title,
        body: input.body?.trim() || null,
        url: safeResourceUrl(input.url),
        category: input.category,
        metaJson: input.meta ?? null,
        featured: input.featured ?? false,
        isPublished: input.isPublished ?? false,
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(file ? { fileKey: file.key, filename: file.filename, mimeType: input.mimeType, sizeBytes: file.sizeBytes } : {}),
        ...(thumbnail ? { thumbnailKey: thumbnail.key } : {}),
        uploadedBy: ctx.user.id,
      };
      if (input.id) {
        await db.update(affiliateResources).set(values).where(eq(affiliateResources.id, input.id));
        return { id: input.id };
      }
      const [row] = await db.insert(affiliateResources).values(values);
      return { id: Number((row as { insertId?: number }).insertId ?? 0) };
    }),

  adminSetPublished: adminProcedure
    .input(z.object({ id: z.number().int().positive(), isPublished: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.update(affiliateResources).set({ isPublished: input.isPublished }).where(eq(affiliateResources.id, input.id));
      return { id: input.id, isPublished: input.isPublished };
    }),

  adminReorder: adminProcedure
    .input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      for (let index = 0; index < input.ids.length; index += 1) {
        await db.update(affiliateResources).set({ sortOrder: index }).where(eq(affiliateResources.id, input.ids[index]));
      }
      return { count: input.ids.length };
    }),

  adminDelete: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.delete(affiliateResourceProgress).where(eq(affiliateResourceProgress.resourceId, input.id));
      await db.delete(affiliateResources).where(eq(affiliateResources.id, input.id));
      return { id: input.id };
    }),

  published: protectedProcedure.query(async ({ ctx }) => {
    await requireAffiliateReader(ctx.user);
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select().from(affiliateResources).orderBy(asc(affiliateResources.sortOrder), asc(affiliateResources.id));
    return rows.filter((row) => row.isPublished).map((row) => toResource(row, false));
  }),

  publishedLiterature: protectedProcedure.query(async ({ ctx }) => {
    await requireAffiliateReader(ctx.user);
    const db = await getDb();
    if (!db) return [];
    return db
      .select({
        id: affiliateLiterature.id,
        title: affiliateLiterature.title,
        description: affiliateLiterature.description,
        category: affiliateLiterature.category,
        url: affiliateLiterature.url,
        mimeType: affiliateLiterature.mimeType,
        filename: affiliateLiterature.filename,
      })
      .from(affiliateLiterature)
      .where(eq(affiliateLiterature.isPublished, true))
      .orderBy(asc(affiliateLiterature.sortOrder), asc(affiliateLiterature.id));
  }),

  myProgress: protectedProcedure.query(async ({ ctx }) => {
    await requireAffiliateReader(ctx.user);
    const db = await getDb();
    if (!db) return [];
    return db
      .select({
        resourceId: affiliateResourceProgress.resourceId,
        completed: affiliateResourceProgress.completed,
        progressPercent: affiliateResourceProgress.progressPercent,
      })
      .from(affiliateResourceProgress)
      .where(eq(affiliateResourceProgress.userId, ctx.user.id));
  }),

  saveProgress: protectedProcedure
    .input(z.object({
      resourceId: z.number().int().positive(),
      completed: z.boolean(),
      progressPercent: z.number().int().min(0).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireAffiliateReader(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [resource] = await db.select().from(affiliateResources).where(eq(affiliateResources.id, input.resourceId)).limit(1);
      if (!resource || (!resource.isPublished && ctx.user.role !== "admin")) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That resource is not available." });
      }
      await db.insert(affiliateResourceProgress).values({
        userId: ctx.user.id,
        resourceId: input.resourceId,
        completed: input.completed,
        progressPercent: input.progressPercent,
      }).onDuplicateKeyUpdate({
        set: { completed: input.completed, progressPercent: input.progressPercent },
      });
      return { resourceId: input.resourceId, completed: input.completed, progressPercent: input.progressPercent };
    }),

  signedFile: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      kind: z.enum(["file", "thumbnail"]),
    }))
    .query(async ({ ctx, input }) => {
      await requireAffiliateReader(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [resource] = await db.select().from(affiliateResources).where(eq(affiliateResources.id, input.id)).limit(1);
      if (!resource || (!resource.isPublished && ctx.user.role !== "admin")) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That file is not available." });
      }
      const key = input.kind === "thumbnail" ? resource.thumbnailKey : resource.fileKey;
      if (!key || !key.startsWith(AFFILIATE_RESOURCE_FILE_PREFIX)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That file is not available." });
      }
      const url = await storageGetSignedUrl(key);
      return {
        url,
        filename: resource.filename,
        mimeType: input.kind === "file" ? resource.mimeType : "image/*",
      };
    }),
});
