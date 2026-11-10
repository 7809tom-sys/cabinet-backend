import { createHash } from "node:crypto";

/** SHA-256 hex of the exact uploaded bytes. This is the duplicate key. */
export function sha256Hex(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export type ExistingLibraryFile = {
  id: number;
  title: string;
  filename: string;
  url: string;
  mimeType: string;
  fileKey: string;
};

/**
 * Warn-and-link copy for an admin. The upload is not stored. The id is the
 * existing library row; its url is a private storage path, not a public link.
 */
export function duplicateLibraryFileMessage(existing: Pick<ExistingLibraryFile, "id" | "title" | "filename">): string {
  const title = existing.title.trim() || "Untitled";
  const filename = existing.filename.trim() || "file";
  return `This file is already in the library as "${title}" (${filename}, library id ${existing.id}). Nothing new was stored. Open the existing file instead of uploading a copy.`;
}

/**
 * A statement the owner can paste after reviewing it. It fills a missing hash
 * and does not change a hash that is already stored. It never deletes a row.
 */
export function libraryHashUpdateStatement(id: number, contentSha256: string): string {
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Library file id must be a positive integer.");
  }
  if (!/^[0-9a-f]{64}$/.test(contentSha256)) {
    throw new Error("Content hash must be 64 lowercase hex characters.");
  }
  return `UPDATE cabinet_dealz.affiliate_literature SET contentSha256 = '${contentSha256}' WHERE id = ${id} AND (contentSha256 IS NULL OR contentSha256 = '');`;
}
