import { eq } from "drizzle-orm";
import { affiliateLiterature } from "../../drizzle/schema";
import type { ExistingLibraryFile } from "@shared/libraryFileHash";
import { isUnknownNamedColumn } from "./libraryCommercialSchema";

type HashDb = {
  select: (fields: any) => any;
};

export type LibraryHashLookup =
  | { state: "ready"; existing: ExistingLibraryFile | null }
  | { state: "column-missing" };

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Look up an exact byte-for-byte duplicate across the whole document library,
 * not only commercials. A missing contentSha256 column is reported and not
 * treated as "no duplicate", so the caller can decide whether to proceed.
 */
export async function lookupLibraryFileByHash(db: HashDb, contentSha256: string): Promise<LibraryHashLookup> {
  try {
    const rows = await db
      .select({
        id: affiliateLiterature.id,
        title: affiliateLiterature.title,
        filename: affiliateLiterature.filename,
        url: affiliateLiterature.url,
        mimeType: affiliateLiterature.mimeType,
        fileKey: affiliateLiterature.fileKey,
      })
      .from(affiliateLiterature)
      .where(eq(affiliateLiterature.contentSha256, contentSha256))
      .limit(1) as Array<Record<string, unknown>>;
    const row = rows[0];
    if (!row) return { state: "ready", existing: null };
    const id = typeof row.id === "number" ? row.id : Number(row.id);
    if (!Number.isFinite(id)) return { state: "ready", existing: null };
    return {
      state: "ready",
      existing: {
        id,
        title: asText(row.title),
        filename: asText(row.filename),
        url: asText(row.url),
        mimeType: asText(row.mimeType),
        fileKey: asText(row.fileKey),
      },
    };
  } catch (error) {
    if (isUnknownNamedColumn(error, "contentSha256")) return { state: "column-missing" };
    throw error;
  }
}
