import { TRPCError } from "@trpc/server";
import { LIBRARY_DOCUMENT_FILE_PREFIX } from "@shared/libraryVisibility";
import { duplicateLibraryFileMessage, sha256Hex, type ExistingLibraryFile } from "@shared/libraryFileHash";
import {
  COMMERCIAL_CAPTION_MAX_LENGTH,
  COMMERCIAL_TITLE_MAX_LENGTH,
  checkCommercialVideo,
  commercialMatchesQuery,
  normalizeCommercialTags,
  suggestCommercialTags,
  type CommercialChannel,
} from "@shared/commercialVideo";
import { LibraryCommercialSchemaError } from "../lib/libraryCommercialSchema";
import type { ChannelAdapter, ChannelPublishResult } from "./channelAdapter";
import type { CommercialRecord, CommercialStore } from "./store";

export type CommercialDeps = {
  store: CommercialStore;
  putFile: (key: string, data: Buffer, contentType: string) => Promise<{ key: string; url: string }>;
  signFile: (key: string) => Promise<string>;
  adapterFor: (channel: CommercialChannel) => ChannelAdapter;
  now: () => Date;
};

export type UploadCommercialResult =
  | { stored: true; duplicate: false; commercial: CommercialRecord }
  | { stored: false; duplicate: true; message: string; existing: ExistingLibraryFile };

function schemaOrThrow(error: unknown): never {
  if (error instanceof LibraryCommercialSchemaError) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: error.message });
  }
  throw error;
}

async function ready(store: CommercialStore): Promise<void> {
  try {
    await store.assertReady();
  } catch (error) {
    schemaOrThrow(error);
  }
}

function decodeBase64(value: string): Buffer {
  const raw = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  return Buffer.from(raw, "base64");
}

function safeFilename(filename: string): string {
  const trimmed = filename.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
  return trimmed || "commercial";
}

function cleanTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed || trimmed.length > COMMERCIAL_TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `A title is required and must be ${COMMERCIAL_TITLE_MAX_LENGTH} characters or fewer.`,
    });
  }
  return trimmed;
}

function cleanCaption(caption: string | null | undefined): string | null {
  if (caption == null) return null;
  const trimmed = caption.trim();
  if (trimmed.length > COMMERCIAL_CAPTION_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `A caption must be ${COMMERCIAL_CAPTION_MAX_LENGTH} characters or fewer.`,
    });
  }
  return trimmed || null;
}

function tagsOrThrow(raw: readonly string[]) {
  const normalized = normalizeCommercialTags(raw);
  if (!normalized.ok) throw new TRPCError({ code: "BAD_REQUEST", message: normalized.message });
  return normalized.tags;
}

async function requireCommercial(store: CommercialStore, id: number): Promise<CommercialRecord> {
  let row: CommercialRecord | null;
  try {
    row = await store.getCommercial(id);
  } catch (error) {
    schemaOrThrow(error);
  }
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "That commercial is not in the library." });
  return row;
}

export async function uploadCommercial(
  deps: CommercialDeps,
  input: {
    title: string;
    caption?: string | null;
    filename: string;
    mimeType: string;
    dataBase64: string;
    tags?: string[];
  },
  userId: number,
): Promise<UploadCommercialResult> {
  await ready(deps.store);
  const title = cleanTitle(input.title);
  const caption = cleanCaption(input.caption);
  const tags = tagsOrThrow(input.tags ?? []);
  const bytes = decodeBase64(input.dataBase64);
  const checked = checkCommercialVideo(input.filename, input.mimeType, bytes);
  if (!checked.ok) throw new TRPCError({ code: "BAD_REQUEST", message: checked.message });
  const contentSha256 = sha256Hex(bytes);
  let existing: ExistingLibraryFile | null;
  try {
    existing = await deps.store.findByContentHash(contentSha256);
  } catch (error) {
    schemaOrThrow(error);
  }
  if (existing) {
    return { stored: false, duplicate: true, message: duplicateLibraryFileMessage(existing), existing };
  }
  const filename = safeFilename(input.filename);
  const stored = await deps.putFile(
    `${LIBRARY_DOCUMENT_FILE_PREFIX}commercials/${Date.now()}_${filename}`,
    bytes,
    checked.video.mimeType,
  );
  if (!stored.key.startsWith(LIBRARY_DOCUMENT_FILE_PREFIX)) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The commercial was not stored in the private library." });
  }
  let id: number;
  try {
    id = await deps.store.insertCommercial({
      title,
      caption,
      filename,
      fileKey: stored.key,
      fileUrl: stored.url,
      mimeType: checked.video.mimeType,
      sizeBytes: bytes.length,
      durationSeconds: checked.video.durationSeconds,
      contentSha256,
      uploadedBy: userId,
      tags,
    });
  } catch (error) {
    schemaOrThrow(error);
  }
  const commercial = await requireCommercial(deps.store, id);
  return { stored: true, duplicate: false, commercial };
}

export async function listCommercials(
  deps: CommercialDeps,
  input: { query?: string; includeArchived?: boolean },
): Promise<CommercialRecord[]> {
  await ready(deps.store);
  let rows: CommercialRecord[];
  try {
    rows = await deps.store.listCommercials(input.includeArchived === true);
  } catch (error) {
    schemaOrThrow(error);
  }
  const query = input.query ?? "";
  return rows.filter((row) => commercialMatchesQuery(
    { title: row.title, caption: row.caption, tags: row.tags.map((tag) => tag.tag) },
    query,
  ));
}

export async function getCommercial(deps: CommercialDeps, id: number): Promise<CommercialRecord> {
  await ready(deps.store);
  return requireCommercial(deps.store, id);
}

export async function updateCommercial(
  deps: CommercialDeps,
  input: { id: number; title?: string; caption?: string | null; tags?: string[] },
): Promise<CommercialRecord> {
  await ready(deps.store);
  await requireCommercial(deps.store, input.id);
  const patch: { title?: string; caption?: string | null } = {};
  if (input.title !== undefined) patch.title = cleanTitle(input.title);
  if (input.caption !== undefined) patch.caption = cleanCaption(input.caption);
  try {
    if (Object.keys(patch).length) await deps.store.updateDetails(input.id, patch);
    if (input.tags) await deps.store.replaceTags(input.id, tagsOrThrow(input.tags));
  } catch (error) {
    schemaOrThrow(error);
  }
  return requireCommercial(deps.store, input.id);
}

export async function archiveCommercial(
  deps: CommercialDeps,
  id: number,
  user: { id: number; name: string | null },
): Promise<CommercialRecord> {
  await ready(deps.store);
  const current = await requireCommercial(deps.store, id);
  if (current.archivedAt) return current;
  try {
    await deps.store.archive(id, user, deps.now());
  } catch (error) {
    schemaOrThrow(error);
  }
  return requireCommercial(deps.store, id);
}

export async function suggestTags(deps: CommercialDeps, prefix: string): Promise<string[]> {
  await ready(deps.store);
  let tags: string[];
  try {
    tags = await deps.store.distinctTags();
  } catch (error) {
    schemaOrThrow(error);
  }
  return suggestCommercialTags(tags, prefix);
}

export async function savePublishDraft(
  deps: CommercialDeps,
  input: { id: number; channel: CommercialChannel },
  userId: number,
): Promise<CommercialRecord> {
  await ready(deps.store);
  const current = await requireCommercial(deps.store, input.id);
  if (current.archivedAt) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "An archived commercial cannot be prepared for publish." });
  }
  const existing = current.publishes.find((row) => row.channel === input.channel);
  if (existing?.status === "published") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This channel already has a published record. It was not changed." });
  }
  try {
    await deps.store.savePublish({
      literatureId: input.id,
      channel: input.channel,
      status: "draft",
      externalPostId: null,
      externalPostUrl: null,
      error: null,
      publishedBy: userId,
      publishedAt: null,
    });
  } catch (error) {
    schemaOrThrow(error);
  }
  return requireCommercial(deps.store, input.id);
}

export async function publishCommercial(
  deps: CommercialDeps,
  input: { id: number; channel: CommercialChannel },
  userId: number,
): Promise<CommercialRecord> {
  await ready(deps.store);
  const current = await requireCommercial(deps.store, input.id);
  if (current.archivedAt) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "An archived commercial cannot be published." });
  }
  try {
    await deps.store.savePublish({
      literatureId: input.id,
      channel: input.channel,
      status: "queued",
      externalPostId: null,
      externalPostUrl: null,
      error: null,
      publishedBy: userId,
      publishedAt: null,
    });
  } catch (error) {
    schemaOrThrow(error);
  }
  let result: ChannelPublishResult;
  try {
    result = await deps.adapterFor(input.channel).publish({
      channel: input.channel,
      commercialId: current.id,
      title: current.title,
      caption: current.caption,
      fileUrl: current.fileUrl,
      mimeType: current.mimeType,
      durationSeconds: current.durationSeconds,
    });
  } catch {
    result = {
      ok: false,
      externalPostId: null,
      externalPostUrl: null,
      error: "The channel adapter failed before anything was posted.",
    };
  }
  try {
    await deps.store.savePublish({
      literatureId: input.id,
      channel: input.channel,
      status: result.ok ? "published" : "failed",
      externalPostId: result.ok ? result.externalPostId : null,
      externalPostUrl: result.ok ? result.externalPostUrl : null,
      error: result.ok ? null : (result.error || "The channel did not accept this video. Nothing was posted."),
      publishedBy: userId,
      publishedAt: result.ok ? deps.now() : null,
    });
  } catch (error) {
    schemaOrThrow(error);
  }
  return requireCommercial(deps.store, input.id);
}

export async function signedCommercialFile(
  deps: CommercialDeps,
  id: number,
): Promise<{ url: string; filename: string; mimeType: string }> {
  await ready(deps.store);
  const row = await requireCommercial(deps.store, id);
  if (!row.fileKey.startsWith(LIBRARY_DOCUMENT_FILE_PREFIX)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "That commercial file is not in the private library." });
  }
  const url = await deps.signFile(row.fileKey);
  return { url, filename: row.filename, mimeType: row.mimeType };
}
