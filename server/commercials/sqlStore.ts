import { and, desc, eq, inArray } from "drizzle-orm";
import { affiliateLiterature, affiliateLiteratureTags, libraryCommercialPublishes } from "../../drizzle/schema";
import { COMMERCIAL_VIDEO_MIME_TYPES, isCommercialVideoMime, type CommercialChannel, type CommercialPublishStatus, type CommercialTag } from "@shared/commercialVideo";
import { getDb } from "../db";
import { archiveLibraryCommercial } from "../lib/archiveLibraryCommercial";
import { lookupLibraryFileByHash } from "../lib/libraryContentHash";
import { LibraryCommercialSchemaError, isCommercialSchemaMiss } from "../lib/libraryCommercialSchema";
import type { CommercialRecord, CommercialStore, NewCommercial, PublishRecord, PublishWrite } from "./store";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const VIDEO_MIMES: string[] = [...COMMERCIAL_VIDEO_MIME_TYPES];

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function asDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function asText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asChannel(value: unknown): CommercialChannel | null {
  if (value === "youtube" || value === "facebook" || value === "instagram" || value === "tiktok" || value === "x" || value === "linkedin") {
    return value;
  }
  return null;
}

function asStatus(value: unknown): CommercialPublishStatus {
  if (value === "draft" || value === "queued" || value === "published" || value === "failed") return value;
  return "draft";
}

async function requireDb(): Promise<Db> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
}

async function guard<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof LibraryCommercialSchemaError || isCommercialSchemaMiss(error)) {
      throw new LibraryCommercialSchemaError();
    }
    throw error;
  }
}

function literatureColumns() {
  return {
    id: affiliateLiterature.id,
    title: affiliateLiterature.title,
    description: affiliateLiterature.description,
    filename: affiliateLiterature.filename,
    fileKey: affiliateLiterature.fileKey,
    url: affiliateLiterature.url,
    mimeType: affiliateLiterature.mimeType,
    sizeBytes: affiliateLiterature.sizeBytes,
    durationSeconds: affiliateLiterature.durationSeconds,
    contentSha256: affiliateLiterature.contentSha256,
    uploadedBy: affiliateLiterature.uploadedBy,
    createdAt: affiliateLiterature.createdAt,
    archivedAt: affiliateLiterature.archivedAt,
    archivedBy: affiliateLiterature.archivedBy,
  };
}

function toPublish(row: Record<string, unknown>): PublishRecord | null {
  const id = asNumber(row.id);
  const literatureId = asNumber(row.literatureId);
  const channel = asChannel(row.channel);
  if (id == null || literatureId == null || !channel) return null;
  return {
    id,
    literatureId,
    channel,
    status: asStatus(row.status),
    externalPostId: typeof row.externalPostId === "string" ? row.externalPostId : null,
    externalPostUrl: typeof row.externalPostUrl === "string" ? row.externalPostUrl : null,
    error: typeof row.error === "string" ? row.error : null,
    publishedBy: asNumber(row.publishedBy),
    publishedAt: asDate(row.publishedAt),
  };
}

async function tagsFor(db: Db, ids: number[]): Promise<Map<number, CommercialTag[]>> {
  const grouped = new Map<number, CommercialTag[]>();
  if (!ids.length) return grouped;
  const rows = await db
    .select({
      literatureId: affiliateLiteratureTags.literatureId,
      tag: affiliateLiteratureTags.tag,
      tagKey: affiliateLiteratureTags.tagKey,
    })
    .from(affiliateLiteratureTags)
    .where(inArray(affiliateLiteratureTags.literatureId, ids));
  for (const row of rows) {
    const literatureId = asNumber(row.literatureId);
    if (literatureId == null) continue;
    const list = grouped.get(literatureId) ?? [];
    list.push({ tag: asText(row.tag), tagKey: asText(row.tagKey) });
    grouped.set(literatureId, list);
  }
  return grouped;
}

async function publishesFor(db: Db, ids: number[]): Promise<Map<number, PublishRecord[]>> {
  const grouped = new Map<number, PublishRecord[]>();
  if (!ids.length) return grouped;
  const rows = await db
    .select({
      id: libraryCommercialPublishes.id,
      literatureId: libraryCommercialPublishes.literatureId,
      channel: libraryCommercialPublishes.channel,
      status: libraryCommercialPublishes.status,
      externalPostId: libraryCommercialPublishes.externalPostId,
      externalPostUrl: libraryCommercialPublishes.externalPostUrl,
      error: libraryCommercialPublishes.error,
      publishedBy: libraryCommercialPublishes.publishedBy,
      publishedAt: libraryCommercialPublishes.publishedAt,
    })
    .from(libraryCommercialPublishes)
    .where(inArray(libraryCommercialPublishes.literatureId, ids));
  for (const row of rows) {
    const publish = toPublish(row as Record<string, unknown>);
    if (!publish) continue;
    const list = grouped.get(publish.literatureId) ?? [];
    list.push(publish);
    grouped.set(publish.literatureId, list);
  }
  return grouped;
}

function toCommercial(row: Record<string, unknown>, tags: CommercialTag[], publishes: PublishRecord[]): CommercialRecord | null {
  const id = asNumber(row.id);
  const uploadedAt = asDate(row.createdAt);
  if (id == null || !uploadedAt || !isCommercialVideoMime(asText(row.mimeType))) return null;
  return {
    id,
    title: asText(row.title),
    caption: typeof row.description === "string" ? row.description : null,
    filename: asText(row.filename),
    fileKey: asText(row.fileKey),
    fileUrl: asText(row.url),
    mimeType: asText(row.mimeType),
    sizeBytes: asNumber(row.sizeBytes) ?? 0,
    durationSeconds: asNumber(row.durationSeconds),
    contentSha256: asText(row.contentSha256),
    uploadedBy: asNumber(row.uploadedBy) ?? 0,
    uploadedAt,
    archivedAt: asDate(row.archivedAt),
    archivedBy: asNumber(row.archivedBy),
    tags,
    publishes,
  };
}

async function hydrate(db: Db, rows: Array<Record<string, unknown>>, includeArchived: boolean): Promise<CommercialRecord[]> {
  const ids = rows.map((row) => asNumber(row.id)).filter((id): id is number => id != null);
  const [tags, publishes] = await Promise.all([tagsFor(db, ids), publishesFor(db, ids)]);
  return rows
    .map((row) => toCommercial(row, tags.get(asNumber(row.id) ?? -1) ?? [], publishes.get(asNumber(row.id) ?? -1) ?? []))
    .filter((row): row is CommercialRecord => row != null && (includeArchived || row.archivedAt == null));
}

export const sqlCommercialStore: CommercialStore = {
  async assertReady() {
    const db = await requireDb();
    await guard(async () => {
      await db
        .select({
          contentSha256: affiliateLiterature.contentSha256,
          durationSeconds: affiliateLiterature.durationSeconds,
          archivedAt: affiliateLiterature.archivedAt,
        })
        .from(affiliateLiterature)
        .limit(1);
      await db.select({ id: affiliateLiteratureTags.id }).from(affiliateLiteratureTags).limit(1);
      await db.select({ id: libraryCommercialPublishes.id }).from(libraryCommercialPublishes).limit(1);
    });
  },

  async findByContentHash(contentSha256) {
    const db = await requireDb();
    const lookup = await lookupLibraryFileByHash(db, contentSha256);
    if (lookup.state === "column-missing") throw new LibraryCommercialSchemaError();
    return lookup.existing;
  },

  async insertCommercial(input: NewCommercial) {
    const db = await requireDb();
    return guard(async () => {
      const inserted = await db.insert(affiliateLiterature).values({
        title: input.title,
        description: input.caption,
        category: "Commercials",
        filename: input.filename,
        fileKey: input.fileKey,
        url: input.fileUrl,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        durationSeconds: input.durationSeconds,
        contentSha256: input.contentSha256,
        isPublished: false,
        uploadedBy: input.uploadedBy,
      });
      const id = Number((inserted[0] as { insertId?: number } | undefined)?.insertId ?? 0);
      if (!id) throw new Error("The library did not return an id for this commercial.");
      if (input.tags.length) {
        await db.insert(affiliateLiteratureTags).values(input.tags.map((tag) => ({
          literatureId: id,
          tag: tag.tag,
          tagKey: tag.tagKey,
        })));
      }
      return id;
    });
  },

  async replaceTags(literatureId, tags) {
    const db = await requireDb();
    await guard(async () => {
      // Tag rows are labels. Replacing them removes those rows and never the video file.
      await db.delete(affiliateLiteratureTags).where(eq(affiliateLiteratureTags.literatureId, literatureId));
      if (tags.length) {
        await db.insert(affiliateLiteratureTags).values(tags.map((tag) => ({
          literatureId,
          tag: tag.tag,
          tagKey: tag.tagKey,
        })));
      }
    });
  },

  async listCommercials(includeArchived) {
    const db = await requireDb();
    return guard(async () => {
      const rows = await db
        .select(literatureColumns())
        .from(affiliateLiterature)
        .where(inArray(affiliateLiterature.mimeType, VIDEO_MIMES))
        .orderBy(desc(affiliateLiterature.createdAt));
      return hydrate(db, rows as Array<Record<string, unknown>>, includeArchived);
    });
  },

  async getCommercial(id) {
    const db = await requireDb();
    return guard(async () => {
      const rows = await db
        .select(literatureColumns())
        .from(affiliateLiterature)
        .where(and(eq(affiliateLiterature.id, id), inArray(affiliateLiterature.mimeType, VIDEO_MIMES)))
        .limit(1);
      const [row] = await hydrate(db, rows as Array<Record<string, unknown>>, true);
      return row ?? null;
    });
  },

  async updateDetails(id, patch) {
    const db = await requireDb();
    const values: Record<string, unknown> = {};
    if (patch.title !== undefined) values.title = patch.title;
    if (patch.caption !== undefined) values.description = patch.caption;
    if (!Object.keys(values).length) return;
    await guard(() => db.update(affiliateLiterature).set(values).where(eq(affiliateLiterature.id, id)));
  },

  async archive(id, user, at) {
    const db = await requireDb();
    await archiveLibraryCommercial(db, id, user, at);
  },

  async distinctTags() {
    const db = await requireDb();
    return guard(async () => {
      const rows = await db
        .select({ tag: affiliateLiteratureTags.tag, tagKey: affiliateLiteratureTags.tagKey })
        .from(affiliateLiteratureTags);
      const byKey = new Map<string, string>();
      for (const row of rows) {
        const key = asText(row.tagKey);
        if (key && !byKey.has(key)) byKey.set(key, asText(row.tag));
      }
      return Array.from(byKey.values());
    });
  },

  async savePublish(input: PublishWrite) {
    const db = await requireDb();
    return guard(async () => {
      const [existing] = await db
        .select({ id: libraryCommercialPublishes.id })
        .from(libraryCommercialPublishes)
        .where(and(
          eq(libraryCommercialPublishes.literatureId, input.literatureId),
          eq(libraryCommercialPublishes.channel, input.channel),
        ))
        .limit(1);
      const values = {
        literatureId: input.literatureId,
        channel: input.channel,
        status: input.status,
        externalPostId: input.externalPostId,
        externalPostUrl: input.externalPostUrl,
        error: input.error,
        publishedBy: input.publishedBy,
        publishedAt: input.publishedAt,
      };
      if (existing) {
        await db.update(libraryCommercialPublishes).set(values).where(eq(libraryCommercialPublishes.id, existing.id));
        return { id: existing.id, ...values };
      }
      const inserted = await db.insert(libraryCommercialPublishes).values(values);
      const id = Number((inserted[0] as { insertId?: number } | undefined)?.insertId ?? 0);
      return { id, ...values };
    });
  },
};
