/**
 * Affiliate onboarding documents (`cabinet_dealz.affiliate_documents`).
 *
 * An affiliate proves who they are and that they may resell before their store
 * can take orders: driver's license, Social Security card, and business card
 * are required, the reseller certificate is optional. The bytes live in the
 * private Supabase bucket under `affiliate-documents/`; the database stores a
 * storage key, never a public URL.
 *
 * This file is the single source of truth for the document types, the labels
 * the dashboard and the admin screen show, the upload rules, and the
 * onboarding gate. The server and any frontend that shares it cannot disagree
 * about which documents the gate needs.
 */

export const AFFILIATE_DOCUMENT_TYPES = [
  "driver_license",
  "ssn_card",
  "business_card",
  "reseller_certificate",
] as const;

export type AffiliateDocumentType = (typeof AFFILIATE_DOCUMENT_TYPES)[number];

/** The three documents an affiliate cannot finish onboarding without. */
export const REQUIRED_AFFILIATE_DOCUMENT_TYPES = [
  "driver_license",
  "ssn_card",
  "business_card",
] as const satisfies readonly AffiliateDocumentType[];

export const OPTIONAL_AFFILIATE_DOCUMENT_TYPES = [
  "reseller_certificate",
] as const satisfies readonly AffiliateDocumentType[];

export const AFFILIATE_DOCUMENT_LABELS: Record<AffiliateDocumentType, string> = {
  driver_license: "Driver's license",
  ssn_card: "Social Security card",
  business_card: "Business card",
  reseller_certificate: "Reseller certificate",
};

export const AFFILIATE_DOCUMENT_HINTS: Record<AffiliateDocumentType, string> = {
  driver_license: "A photo of your state-issued driver's license. Both sides on one image is fine.",
  ssn_card: "A photo of your Social Security card. This is stored privately and shown only to review staff.",
  business_card: "A photo of a business card, or any document that shows the business name you sell under.",
  reseller_certificate: "Optional. A state resale or sales-tax certificate, if you have one.",
};

/**
 * Review states. `superseded` is deliberately NOT a status: a replaced upload
 * keeps its original pending/approved/rejected status for the audit trail and
 * is retired with supersededAt + supersededByDocumentId instead.
 */
export const AFFILIATE_DOCUMENT_STATUSES = ["pending", "approved", "rejected"] as const;

export type AffiliateDocumentStatus = (typeof AFFILIATE_DOCUMENT_STATUSES)[number];

export type AffiliateDocumentGateStatus = "missing" | AffiliateDocumentStatus;

/** The storage prefix that puts a key in the private bucket and off the public proxy. */
export const AFFILIATE_DOCUMENT_FILE_PREFIX = "affiliate-documents/";

/** 10 MB, the same ceiling the existing government-ID upload uses. */
export const MAX_AFFILIATE_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** JPEG, PNG, HEIC/HEIF (iPhone photo), and PDF. Nothing else is accepted. */
export const AFFILIATE_DOCUMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "application/pdf",
] as const;

export function isAffiliateDocumentMimeType(value: unknown): value is (typeof AFFILIATE_DOCUMENT_MIME_TYPES)[number] {
  return typeof value === "string" && (AFFILIATE_DOCUMENT_MIME_TYPES as readonly string[]).includes(value);
}

export function isAffiliateDocumentType(value: unknown): value is AffiliateDocumentType {
  return typeof value === "string" && (AFFILIATE_DOCUMENT_TYPES as readonly string[]).includes(value);
}

export function isRequiredAffiliateDocumentType(value: unknown): value is AffiliateDocumentType {
  return isAffiliateDocumentType(value) && (REQUIRED_AFFILIATE_DOCUMENT_TYPES as readonly string[]).includes(value);
}

export function affiliateDocumentLabel(value: unknown): string {
  return isAffiliateDocumentType(value) ? AFFILIATE_DOCUMENT_LABELS[value] : "Document";
}

/** File extension used in the storage key. The client filename is never used, so no PII reaches the key. */
export function affiliateDocumentExtension(mimeType: string): string | null {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/heic":
    case "image/heif":
      return "heic";
    case "application/pdf":
      return "pdf";
    default:
      return null;
  }
}

export type AffiliateDocumentStateRow = {
  docType: string;
  status: string;
  supersededAt?: Date | string | null;
};

/** A replaced upload stays as history but no longer counts as the affiliate's document. */
export function isCurrentAffiliateDocument(row: AffiliateDocumentStateRow): boolean {
  return row.supersededAt == null;
}

export function currentAffiliateDocuments<T extends AffiliateDocumentStateRow>(rows: readonly T[]): T[] {
  return rows.filter(isCurrentAffiliateDocument);
}

/**
 * The status of one document type as the gate sees it. A superseded upload is
 * "missing" even if it was approved, because the replacement has to be reviewed.
 */
export function affiliateDocumentGateStatus(
  rows: readonly AffiliateDocumentStateRow[],
  docType: AffiliateDocumentType,
): AffiliateDocumentGateStatus {
  const current = currentAffiliateDocuments(rows).filter((row) => row.docType === docType);
  if (current.length === 0) return "missing";
  if (current.some((row) => row.status === "approved")) return "approved";
  if (current.some((row) => row.status === "pending")) return "pending";
  return "rejected";
}

export type RequiredAffiliateDocumentState = {
  docType: AffiliateDocumentType;
  label: string;
  status: AffiliateDocumentGateStatus;
};

/** Every required document with its current state, in the order the dashboard shows them. */
export function requiredAffiliateDocumentState(
  rows: readonly AffiliateDocumentStateRow[],
): RequiredAffiliateDocumentState[] {
  return REQUIRED_AFFILIATE_DOCUMENT_TYPES.map((docType) => ({
    docType,
    label: AFFILIATE_DOCUMENT_LABELS[docType],
    status: affiliateDocumentGateStatus(rows, docType),
  }));
}

/**
 * The onboarding gate: every required document must be uploaded AND approved.
 * An upload that is still pending or was rejected does not satisfy the gate,
 * and neither does a document that has since been replaced.
 */
export function hasRequiredAffiliateDocuments(rows: readonly AffiliateDocumentStateRow[]): boolean {
  return requiredAffiliateDocumentState(rows).every((state) => state.status === "approved");
}

/** Required types that are not approved yet, so the caller can say what is missing. */
export function incompleteRequiredAffiliateDocuments(
  rows: readonly AffiliateDocumentStateRow[],
): RequiredAffiliateDocumentState[] {
  return requiredAffiliateDocumentState(rows).filter((state) => state.status !== "approved");
}
