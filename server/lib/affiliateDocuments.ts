import { and, desc, eq, isNull } from "drizzle-orm";
import { affiliateDocuments } from "../../drizzle/schema";
import {
  MAX_AFFILIATE_DOCUMENT_BYTES,
  hasRequiredAffiliateDocuments,
  requiredAffiliateDocumentState,
} from "@shared/affiliateDocuments";
import { getDb } from "../db";
import { TRPCError } from "@trpc/server";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * The affiliate's live onboarding documents. Superseded uploads are excluded:
 * they are history, not the document the affiliate currently relies on.
 */
export async function loadCurrentAffiliateDocuments(db: Database, affiliateId: number) {
  return db
    .select()
    .from(affiliateDocuments)
    .where(and(
      eq(affiliateDocuments.affiliateId, affiliateId),
      isNull(affiliateDocuments.supersededAt),
    ))
    .orderBy(desc(affiliateDocuments.createdAt));
}

/**
 * The onboarding gate. True only when the driver's license, Social Security
 * card, and business card are each uploaded AND approved. Pending, rejected,
 * and replaced uploads do not count. Other features call this rather than
 * re-deriving the rule, so the gate cannot drift between them.
 */
export async function hasRequiredDocuments(affiliateId: number, db?: Database): Promise<boolean> {
  const database = db ?? await getDb();
  if (!database) return false;
  const rows = await loadCurrentAffiliateDocuments(database, affiliateId);
  return hasRequiredAffiliateDocuments(rows);
}

/** What the dashboard shows: each required document and whether it still blocks onboarding. */
export async function affiliateDocumentGate(affiliateId: number, db?: Database) {
  const database = db ?? await getDb();
  if (!database) {
    return { hasRequiredDocuments: false, documents: requiredAffiliateDocumentState([]) };
  }
  const rows = await loadCurrentAffiliateDocuments(database, affiliateId);
  return {
    hasRequiredDocuments: hasRequiredAffiliateDocuments(rows),
    documents: requiredAffiliateDocumentState(rows),
  };
}

/**
 * Trust the bytes, not the label. The client tells us a MIME type, but a
 * renamed executable or a mislabelled TIFF must not be stored as a JPEG, so the
 * first bytes of the file have to agree with it. PDF and HEIC included because
 * those are the two non-image types an affiliate can legitimately upload.
 */
export function sniffAffiliateDocumentMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "image/png";
  if (bytes.length >= 4 && Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "%PDF") return "application/pdf";
  if (
    bytes.length >= 12
    && Buffer.from(bytes.subarray(4, 8)).toString("ascii") === "ftyp"
    && ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"].includes(
      Buffer.from(bytes.subarray(8, 12)).toString("ascii"),
    )
  ) return "image/heic";
  return null;
}

/** Claimed type and detected type must name the same family. */
export function affiliateDocumentMimeMatches(claimed: string, sniffed: string | null): boolean {
  if (!sniffed) return false;
  if (claimed === sniffed) return true;
  // iPhone photos arrive as image/heif or image/heic for the same ftyp brands.
  return (claimed === "image/heif" || claimed === "image/heic") && sniffed === "image/heic";
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Decode and bound an upload. The size limit is applied to the decoded bytes,
 * and it is checked before decoding anything near the limit, so a huge base64
 * string cannot be expanded into memory first.
 */
export function decodeAffiliateDocumentUpload(fileBase64: string): Buffer {
  const raw = fileBase64.includes(",") ? fileBase64.slice(fileBase64.indexOf(",") + 1) : fileBase64;
  const cleaned = raw.replace(/\s+/g, "");
  if (!cleaned || !BASE64.test(cleaned)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "The uploaded file could not be read. Try choosing it again." });
  }
  // base64 expands 3 bytes into 4 characters, so this rejects too-large input
  // before Buffer.from allocates the decoded copy.
  if (Math.floor((cleaned.length * 3) / 4) > MAX_AFFILIATE_DOCUMENT_BYTES + 4) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Documents must be 10 MB or smaller." });
  }
  const buffer = Buffer.from(cleaned, "base64");
  if (buffer.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "The uploaded file is empty." });
  }
  if (buffer.length > MAX_AFFILIATE_DOCUMENT_BYTES) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Documents must be 10 MB or smaller." });
  }
  return buffer;
}

/**
 * Keep the human filename for display only; it never becomes part of a storage
 * path. Any run of four or more digits is masked first, because affiliates name
 * scans things like "ssn 123-45-6789.jpg" and the database must not become a
 * second place a Social Security number is stored.
 */
export function displayNameFor(fileName: string | null | undefined): string | null {
  if (!fileName) return null;
  const masked = fileName
    // A Social Security number split by dashes survives a plain digit-run mask,
    // so match the SSN shape first, then any remaining long run of digits.
    .replace(/\d{3}-\d{2}-\d{4}/g, "###-##-####")
    .replace(/\d{4,}/g, "####");
  const cleaned = masked.replace(/[\\/]+/g, "_").replace(/[^A-Za-z0-9._# -]/g, "_").trim().slice(0, 200);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Response shape with no storage key and no URL: the file is reachable only
 * through a short-lived signed link procedure, never through this payload.
 */
export function affiliateDocumentView(row: {
  id: number;
  docType: string;
  status: string;
  mimeType: string;
  sizeBytes: number;
  originalName: string | null;
  note: string | null;
  createdAt: Date | string;
  reviewedAt: Date | string | null;
  supersededAt?: Date | string | null;
}) {
  return {
    id: row.id,
    docType: row.docType,
    status: row.status,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    originalName: row.originalName,
    note: row.note,
    uploadedAt: row.createdAt,
    reviewedAt: row.reviewedAt,
    superseded: row.supersededAt != null,
  };
}
